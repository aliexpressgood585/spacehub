"""Scheduled paper desk: one cycle, then exit.

Loads the JSON state, catches up closed candles since the last cycle (1m bars for
SL/TP/liquidation, real funding history, strategy on each closed signal bar), writes
the same file back. The GitHub Actions workflow commits that file. Paper only —
there is no order endpoint and no API key.

The active strategy is ema_trend_4h: decisions from completed 4h bars, evaluated on
1h closes, stops still on 1m highs/lows. The coin list is a monthly top-20 by
trailing 90-day median quote volume. Existing wallet, trades and events are kept.

    python -m bot.desk binance-paper/state.json
"""
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone

from .config import load_config, rpath
from .engine import TradingEngine, kline_row
from .execution.paper import PaperExchange
from .feed import connect, describe
from .margin import LeverageBrackets
from .replay import replay_minutes
from .rest import INTERVAL_MS
from .risk import RiskManager
from .clock import closed_bar_open, opens_after
from .storage import MemoryRecorder
from .strategies import make_strategy
from .symbols import load_symbol_infos
from .universe import (is_current, month_key, rank_live, slippage_bps, stored_rows)

log = logging.getLogger("desk")

# A missed cron of a few weeks is replayed; older than this and only the newest
# window is walked so a single Actions job cannot run away.
MAX_1M_BARS = 21 * 24 * 60
EQUITY_CAP = 8000


def _iso(ms):
    return datetime.fromtimestamp(ms / 1000, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _now():
    return int(time.time() * 1000)


def read_state(path):
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


def write_state(path, snap):
    os.makedirs(os.path.dirname(os.path.abspath(path)) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(_clean(snap), f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    os.replace(tmp, path)


def _clean(o):
    if isinstance(o, dict):
        return {str(k): _clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_clean(v) for v in o]
    if isinstance(o, float):
        if o != o or o in (float("inf"), float("-inf")):
            return None
        return o
    if isinstance(o, (int, str, bool)) or o is None:
        return o
    if hasattr(o, "item"):
        try:
            return _clean(o.item())
        except Exception:
            return str(o)
    return str(o)


# Closed 4h bars kept for EMA150 warmup. The buffer itself is data.history_bars.
H4_BARS = 420
D1_BARS = 120

EMA_BACKTEST = {
    "oos": {"window": "2026-01..2026-10", "return_pct": 43.4, "win_rate_pct": 36.7,
            "pf": 3.57, "max_dd_pct": -11.6, "trades": 30},
    "is": {"window": "2024-09..2025-12", "return_pct": 107.2, "win_rate_pct": 27.9,
           "pf": 3.07, "max_dd_pct": -17.8, "trades": 61},
}


def strategy_view(strat, cfg):
    view = {"name": strat.name, "timeframe": strat.timeframe,
            "params": cfg["strategy"]["params"].get(strat.name, {})}
    if strat.name == "ema_trend_4h":
        view["backtest"] = EMA_BACKTEST
    return view


def fetch_exchange_info(cfg, feed):
    """Binance exchangeInfo + brackets. Tried on the price feed, then on a direct probe."""
    if getattr(feed, "kind", "") == "binance":
        try:
            return feed.exchange_info(), feed.leverage_brackets()
        except Exception:
            log.exception("feed exchangeInfo failed")
    try:
        from .rest import PublicRest
        from .feed import probe_binance
        rest = PublicRest(cfg["data"]["rest_bases"], cfg["data"].get("brackets_url"), timeout=12)
        base, _probes = probe_binance(rest.s, list(rest.bases), rest.timeout)
        if base:
            rest.base = base
            return rest.exchange_info(), rest.leverage_brackets()
    except Exception:
        log.exception("direct Binance exchangeInfo failed")
    return None, None


def choose_universe(cfg, feed, state, now, exchange_info):
    """Monthly top 20. Returns (rows, ranked_at_iso, month, reused)."""
    if is_current(state, now):
        return stored_rows(state), state.get("universe_ranked_at"), state.get("universe_month"), True
    allowed = None
    if getattr(feed, "kind", "") == "okx":
        allowed = set()
        try:
            for info in (exchange_info or {}).get("symbols") or []:
                sym = info.get("symbol")
                if sym and feed.supports(sym):
                    allowed.add(sym)
        except Exception:
            log.exception("OKX instrument list failed; no symbol can be ranked on this feed")
            allowed = set()
    rows = []
    if exchange_info is not None and allowed != set():
        try:
            rows = rank_live(feed, exchange_info, now, allowed=allowed)
        except Exception:
            log.exception("universe rank failed")
            rows = []
    if rows:
        return rows, _iso(now), month_key(now), False
    prev = stored_rows(state)
    if prev:
        log.warning("keeping the stored universe (%d symbols)", len(prev))
        return prev, state.get("universe_ranked_at"), state.get("universe_month"), True
    rows = [{"symbol": s, "rank": i + 1, "median_volume": None,
             "slippage_bps": float(cfg["execution"]["slippage_bps"])}
            for i, s in enumerate(cfg["symbols"])]
    return rows, _iso(now), month_key(now), False


def apply_slip(ex, risk, rows):
    mp = {}
    for r in rows:
        sym = r.get("symbol")
        if not sym:
            continue
        try:
            mp[sym] = float(r.get("slippage_bps", slippage_bps(0))) / 1e4
        except (TypeError, ValueError):
            mp[sym] = slippage_bps(0) / 1e4
    ex.slip_by_symbol = mp
    risk.slip_by_symbol = mp


def load_meta(cfg, feed, exchange_info=None, brackets_raw=None, allow_missing=False):
    cache = rpath(cfg, "data/market_meta.json")
    cached = json.load(open(cache)) if os.path.exists(cache) else None
    symbols = list(cfg["symbols"])
    wanted = set(symbols)
    ei, br = exchange_info, brackets_raw
    if ei is None and getattr(feed, "kind", "") == "binance":
        try:
            ei = feed.exchange_info()
            if br is None:
                br = feed.leverage_brackets()
        except Exception:
            log.exception("live exchangeInfo/brackets failed; using the committed cache")
            ei = None
    if ei is not None:
        ei = {"symbols": [s for s in ei.get("symbols") or [] if s.get("symbol") in wanted]}
        have = {s["symbol"] for s in ei["symbols"]}
        if cached and allow_missing:
            for s in cached["exchange_info"]["symbols"]:
                if s["symbol"] in wanted and s["symbol"] not in have:
                    ei["symbols"].append(s)
                    have.add(s["symbol"])
        present = [s for s in symbols if s in have]
        if br:
            br = [b for b in br if b.get("symbol") in wanted]
            src = "live"
        elif cached:
            br = cached["brackets"]
            src = "live-info+cached-brackets"
        else:
            br = []
            src = "live-info"
        if allow_missing:
            if not present:
                raise RuntimeError("none of the requested symbols are in exchangeInfo")
            infos = load_symbol_infos(ei, present)
        else:
            infos = load_symbol_infos(ei, symbols)
        return infos, LeverageBrackets(br), src
    if not cached:
        raise RuntimeError("Binance market meta is unreachable and data/market_meta.json is missing")
    if allow_missing:
        have = {s["symbol"] for s in cached["exchange_info"]["symbols"]}
        present = [s for s in symbols if s in have]
        if not present:
            raise RuntimeError("cache has none of the requested symbols")
        infos = load_symbol_infos(cached["exchange_info"], present)
    else:
        infos = load_symbol_infos(cached["exchange_info"], symbols)
    return infos, LeverageBrackets(cached["brackets"]), "cache"


def _rows(raw, now):
    out = {}
    for k in raw or []:
        if int(k[6]) >= now:
            continue
        row = kline_row(k)
        out[row[0]] = row
    return out


def fetch_map(feed, symbols, interval, start, end, now):
    acc = {}
    for s in symbols:
        acc[s] = _rows(feed.klines(s, interval, start, end), now)
        if not acc[s]:
            raise RuntimeError(f"no closed {interval} candles for {s}")
    return acc


def fetch_lenient(feed, symbols, interval, start, end, now):
    """Like fetch_map, but a symbol with no candles is skipped instead of aborting."""
    acc, missing = {}, []
    for s in symbols:
        try:
            rows = _rows(feed.klines(s, interval, start, end), now)
        except Exception:
            log.warning("klines %s %s failed", interval, s, exc_info=True)
            rows = {}
        acc[s] = rows
        if not rows:
            missing.append(s)
    return acc, missing


def add_closed(eng, symbol, tf, rows, before_ms):
    """Store bars whose close is strictly before `before_ms` (no look-ahead)."""
    if tf not in eng.candles.get(symbol, {}):
        return
    for ot in sorted(rows):
        row = rows[ot]
        if int(row[6]) < int(before_ms):
            eng.add_history(symbol, tf, [row])


def fetch_marks(feed, symbols, start, end, now):
    acc = {}
    for s in symbols:
        try:
            raw = feed.mark_klines(s, "1m", start, end)
        except Exception:
            log.warning("mark klines unavailable for %s; liquidation checks use last price", s)
            acc[s] = {}
            continue
        m = {}
        for k in raw or []:
            ot = int(k[0])
            ct = int(k[6]) if len(k) > 6 else ot + 60_000 - 1
            if ct >= now:
                continue
            m[ot] = (float(k[1]), float(k[2]), float(k[3]), float(k[4]))
        acc[s] = m
    return acc


def fetch_funding(feed, symbols, start, end):
    acc = {}
    for s in symbols:
        try:
            rows = feed.funding_history(s, start, end)
        except Exception:
            log.warning("funding history unavailable for %s", s)
            rows = []
        ev = []
        for f in rows or []:
            ft = int(f["fundingTime"])
            if start < ft <= end:
                ev.append({"fundingTime": ft, "fundingRate": f["fundingRate"],
                           "markPrice": f.get("markPrice") or ""})
        ev.sort(key=lambda x: x["fundingTime"])
        acc[s] = ev
    return acc


def _book(ex, si, symbol, px, ts, mark=None):
    hs = max(si.tick_size / 2.0, abs(px) * 0.5e-4)
    ex.update_market(symbol, ts, bid=px - hs, ask=px + hs, last=px, mark=mark if mark else px)


def seed(eng, bars_15, bars_1h, last_15m, last_ts, fresh):
    for s, rows in bars_15.items():
        for ot in sorted(rows):
            if fresh or last_15m is None or ot <= last_15m:
                eng.add_history(s, "15m", [rows[ot]])
    for s, rows in bars_1h.items():
        for ot in sorted(rows):
            row = rows[ot]
            if fresh or int(row[6]) <= int(last_ts or 0):
                eng.add_history(s, "1h", [row])


def refresh_live(ex, feed, symbols, now):
    ok = []
    for s in symbols:
        try:
            bt = feed.book_ticker(s)
            pi = feed.premium_index(s)
            bid, ask = float(bt["bidPrice"]), float(bt["askPrice"])
            mark = float(pi["markPrice"])
            last = float(bt["lastPrice"]) if bt.get("lastPrice") else (bid + ask) / 2
            ex.mkt[s].funding_rate = float(pi.get("lastFundingRate") or 0)
            if pi.get("nextFundingTime"):
                ex.mkt[s].next_funding_time = int(pi["nextFundingTime"])
            ex.update_market(s, now, bid=bid, ask=ask, last=last, mark=mark)
            ok.append(s)
        except Exception:
            log.warning("live book failed for %s", s, exc_info=True)
    return ok


def _dedupe(rows, key, cap):
    seen, out = set(), []
    for r in rows:
        k = key(r)
        if k in seen:
            continue
        seen.add(k)
        out.append(r)
    return out[-cap:]


def _positions(ex):
    view = []
    for s, p in ex.pos.items():
        mark = ex.mark(s)
        sl = p.meta.get("sl")
        tp = p.meta.get("tp")
        for o in ex.open_orders(s):
            if o.type == "STOP_MARKET":
                sl = o.stop_price
            elif o.type == "TAKE_PROFIT_MARKET":
                tp = o.stop_price
        px = mark or p.entry_price
        br = ex.brackets.for_notional(s, p.qty * px)
        view.append({"symbol": s, "side": "LONG" if p.side > 0 else "SHORT", "qty": p.qty,
                     "entry": p.entry_price, "mark": mark, "leverage": p.leverage,
                     "upnl": p.upnl(mark), "liq": ex.liq_price(s), "sl": sl, "tp": tp,
                     "isolated_margin": p.isolated_margin, "notional": p.qty * px,
                     "funding": p.funding, "fees": p.fees, "opened_ts": p.opened_ts,
                     "mmr": br.mmr, "cum": br.cum})
    return view


def _bracket_view(ex, symbols):
    """Compact leverage brackets so the tab can recompute margin ratio on a live mark."""
    out = []
    for s in symbols:
        out.append({"symbol": s, "brackets": [
            {"floor": b.floor, "cap": b.cap, "mmr": b.mmr, "cum": b.cum}
            for b in ex.brackets.get(s)]})
    return out


def _curve_dd(curve, start):
    peak, max_dd = start, 0.0
    for pt in curve:
        peak = max(peak, pt["equity"])
        if peak:
            max_dd = min(max_dd, (pt["equity"] - peak) / peak)
    return max_dd


def _symbol_list(rows, state, fallback):
    symbols, seen = [], set()
    for r in rows:
        s = r.get("symbol")
        if s and s not in seen:
            symbols.append(s)
            seen.add(s)
    for s in ((state or {}).get("exchange") or {}).get("positions") or {}:
        if s not in seen:
            symbols.append(s)
            seen.add(s)
    return symbols or list(fallback)


def run_htf(eng, ex, infos, feed, symbols, state, fresh, switched, now, rec, funding_done):
    """1h signal clock. On a strategy switch only the latest closed 1h is judged."""
    h1, h4, d1 = INTERVAL_MS["1h"], INTERVAL_MS["4h"], INTERVAL_MS["1d"]
    prev_1m = None if fresh else state.get("last_1m_open")
    last_1h = None if fresh or switched else state.get("last_1h_open")
    last_15m = None if fresh else state.get("last_15m_open")
    if fresh or switched:
        all_minutes, minutes, capped = [], [], False
    else:
        all_minutes = opens_after(prev_1m, now, 60_000)
        capped = len(all_minutes) > MAX_1M_BARS
        minutes = all_minutes[-MAX_1M_BARS:] if capped else all_minutes
    replay_start = minutes[0] if minutes else now
    start_4h = now - (H4_BARS + 8) * h4
    start_1d = now - (D1_BARS + 8) * d1
    if fresh or switched:
        start_1h = now - 48 * h1
    else:
        start_1h = min(now - 48 * h1, replay_start - 6 * h1)
    bars_4h, miss_4h = fetch_lenient(feed, symbols, "4h", start_4h, now, now)
    bars_1d, miss_1d = fetch_lenient(feed, symbols, "1d", start_1d, now, now)
    bars_1h, miss_1h = fetch_lenient(feed, symbols, "1h", start_1h, now, now)
    catch = {"fresh": fresh, "switched": switched, "minutes": 0, "capped": capped,
             "evaluated_15m": 0, "evaluated_1h": 0, "degraded": [], "funding_applied": 0,
             "skipped_1m": 0 if fresh or switched else max(0, len(all_minutes) - len(minutes)),
             "missing_4h": miss_4h, "missing_1d": miss_1d, "missing_1h": miss_1h}
    if fresh or switched:
        latest = closed_bar_open(now, h1)
        cut = latest + h1
        for s in symbols:
            add_closed(eng, s, "4h", bars_4h.get(s, {}), cut)
            add_closed(eng, s, "1d", bars_1d.get(s, {}), cut)
            add_closed(eng, s, "1h", bars_1h.get(s, {}), cut)
            row = bars_1h.get(s, {}).get(latest)
            if not row:
                continue
            _book(ex, infos[s], s, row[4], int(row[6]) + 1)
            eng.run_strategy(s, int(row[6]) + 1)
            catch["evaluated_1h"] += 1
        last_1h = latest
        minutes = opens_after(latest + h1 - 60_000, now, 60_000)
        catch["fresh_bar"] = latest
    else:
        for s in symbols:
            add_closed(eng, s, "4h", bars_4h.get(s, {}), replay_start)
            add_closed(eng, s, "1d", bars_1d.get(s, {}), replay_start)
            add_closed(eng, s, "1h", bars_1h.get(s, {}), replay_start)
    if minutes:
        m0, m1 = minutes[0], minutes[-1] + 60_000
        bars_1m = {}
        for s in symbols:
            try:
                bars_1m[s] = _rows(feed.klines(s, "1m", m0, m1 + 1), now)
            except Exception:
                log.warning("1m klines failed for %s", s, exc_info=True)
                bars_1m[s] = {}
        marks = fetch_marks(feed, symbols, m0, m1 + 1, now)
        funds = fetch_funding(feed, symbols, m0, now)
        stats = replay_minutes(ex, eng, symbols, minutes, bars_1m, marks, {}, bars_1h,
                               funds, funding_done, last_15m, bars_4h=bars_4h, bars_1d=bars_1d,
                               strategy_tf="1h", last_signal_open=last_1h)
        if stats.get("last_signal_open") is not None:
            last_1h = stats["last_signal_open"]
        catch.update(minutes=stats["minutes"],
                     evaluated_1h=catch["evaluated_1h"] + stats["evaluated_1h"],
                     degraded=stats["degraded"], funding_applied=stats["funding_applied"])
        if capped:
            rec.on_event({"ts": now, "type": "CATCH_UP", "symbol": "",
                          "msg": f"gap longer than {MAX_1M_BARS} 1m bars; replayed the newest {len(minutes)} only"})
    last_15m = closed_bar_open(now, INTERVAL_MS["15m"])
    warmup = {}
    for s in symbols:
        buf = eng.candles.get(s, {}).get("4h")
        warmup[s] = len(buf.rows) if buf else 0
    catch["warmup_4h_min"] = min(warmup.values()) if warmup else 0
    catch["warmup_4h"] = warmup
    return last_1h, last_15m, catch


def run(path, now=None):
    cfg = load_config()
    now = _now() if now is None else int(now)
    feed, probes = connect(cfg)
    state = read_state(path)
    fresh = state is None
    strat = make_strategy(cfg)
    htf = strat.timeframe == "1h"
    universe_rows, ranked_at, universe_month, universe_reused = [], None, None, False
    ei, br = None, None
    if htf:
        ei, br = fetch_exchange_info(cfg, feed)
        universe_rows, ranked_at, universe_month, universe_reused = choose_universe(
            cfg, feed, state, now, ei)
        symbols = _symbol_list(universe_rows, state, cfg["symbols"])
    else:
        symbols = list(cfg["symbols"])
    cfg = dict(cfg)
    cfg["symbols"] = list(symbols)
    infos, brackets, filters_src = load_meta(cfg, feed, exchange_info=ei, brackets_raw=br,
                                              allow_missing=htf)
    symbols = [s for s in symbols if s in infos]
    if not symbols:
        raise RuntimeError("no tradable symbols; state left untouched")
    fees = cfg["fees"]
    rec = MemoryRecorder()
    ex = PaperExchange(infos, brackets, cfg["account"]["starting_balance"], fees["maker"], fees["taker"],
                       cfg["execution"]["slippage_bps"], cfg["account"]["default_leverage"],
                       traverse_fill=False, listener=rec)
    funding_done = {}
    if not fresh:
        ex.load_dict(state["exchange"])
        funding_done = {k: int(v) for k, v in (state.get("engine") or {}).get("funding_done", {}).items()}
    risk = RiskManager(cfg, fees["taker"], cfg["execution"]["slippage_bps"])
    if not fresh:
        risk.load_dict((state.get("engine") or {}).get("risk") or {})
    if htf:
        apply_slip(ex, risk, universe_rows)
    eng = TradingEngine(cfg, ex, strat, risk, infos, brackets, recorder=rec)

    prev_name = ((state or {}).get("strategy") or {}).get("name")
    switched = htf and not fresh and (prev_name != strat.name or state.get("last_1h_open") is None)
    last_1h = None if fresh else (state or {}).get("last_1h_open")
    if htf:
        last_1h, last_15m, catch = run_htf(eng, ex, infos, feed, symbols, state, fresh, switched,
                                           now, rec, funding_done)
    else:
        hist = int(cfg["data"]["history_bars"])
        prev_1m = None if fresh else state.get("last_1m_open")
        last_15m = None if fresh else state.get("last_15m_open")
        last_ts = None if fresh else state.get("last_ts")
        all_minutes = [] if fresh else opens_after(prev_1m, now, 60_000)
        capped = len(all_minutes) > MAX_1M_BARS
        minutes = all_minutes[-MAX_1M_BARS:] if capped else all_minutes
        replay_start = minutes[0] if minutes else now
        start_15 = min(now - (hist + 5) * INTERVAL_MS["15m"], replay_start - 80 * INTERVAL_MS["15m"])
        start_1h = min(now - (hist + 5) * INTERVAL_MS["1h"], replay_start - 220 * INTERVAL_MS["1h"])
        bars_15 = fetch_map(feed, symbols, "15m", start_15, now, now)
        bars_1h = fetch_map(feed, symbols, "1h", start_1h, now, now)
        seed(eng, bars_15, bars_1h, last_15m, last_ts, fresh)
        catch = {"fresh": fresh, "minutes": 0, "capped": capped, "evaluated_15m": 0,
                 "degraded": [], "funding_applied": 0,
                 "skipped_1m": max(0, len(all_minutes) - len(minutes))}
        if fresh:
            latest = min(max(bars_15[s]) for s in symbols)
            for s in symbols:
                row = bars_15[s].get(latest)
                if row:
                    _book(ex, infos[s], s, row[4], row[6] + 1)
            for s in symbols:
                row = bars_15[s].get(latest)
                if row:
                    eng.run_strategy(s, row[6] + 1)
            last_15m = latest
            minutes = opens_after(latest + INTERVAL_MS["15m"] - 60_000, now, 60_000)
            catch["fresh_bar"] = latest
        if minutes:
            m0, m1 = minutes[0], minutes[-1] + 60_000
            try:
                bars_1m = {}
                for s in symbols:
                    bars_1m[s] = _rows(feed.klines(s, "1m", m0, m1 + 1), now)
            except Exception:
                log.exception("1m klines failed; stops fall back to the 15m high/low when a whole bar is missing")
                bars_1m = {s: {} for s in symbols}
            marks = fetch_marks(feed, symbols, m0, m1 + 1, now)
            funds = fetch_funding(feed, symbols, m0, now)
            stats = replay_minutes(ex, eng, symbols, minutes, bars_1m, marks, bars_15, bars_1h,
                                   funds, funding_done, last_15m)
            last_15m = stats["last_15m_open"]
            catch.update(minutes=stats["minutes"],
                         evaluated_15m=catch["evaluated_15m"] + stats["evaluated_15m"],
                         degraded=stats["degraded"], funding_applied=stats["funding_applied"])
            if capped:
                rec.on_event({"ts": now, "type": "CATCH_UP", "symbol": "",
                              "msg": f"gap longer than {MAX_1M_BARS} 1m bars; replayed the newest {len(minutes)} only"})

    refresh_live(ex, feed, symbols, now)
    last_1m = closed_bar_open(now, 60_000)
    risk._daily(ex, now)
    started = (state or {}).get("started") or now
    if fresh:
        rec.on_event({"ts": now, "type": "START", "symbol": "",
                      "msg": f"חשבון דמו חדש {cfg['account']['starting_balance']:.0f} USDT, אסטרטגיה {strat.name}, נייר בלבד"})
    elif switched:
        rec.on_event({"ts": now, "type": "STRATEGY", "symbol": "",
                      "msg": (f"מעבר אסטרטגיה: {prev_name or '?'} → {strat.name}. "
                              "נר 1h, אות EMA20/150 על 4h, סטופ 3×ATR, בלי יעד, סינון EMA50 יומי, מינוף 3. "
                              f"יקום חודשי של {len(universe_rows)} מטבעות לפי נפח. החשבון לא אופס — נייר בלבד.")})

    eq = ex.equity()
    start_bal = float(cfg["account"]["starting_balance"])
    peak = max(float((state or {}).get("peak_equity") or start_bal), eq)
    curve = list((state or {}).get("equity_curve") or [])
    curve.append({"ts": now, "equity": round(eq, 2), "wallet": round(ex.wallet, 2)})
    if len(curve) > EQUITY_CAP:
        curve = curve[: len(curve) - 2000][::2] + curve[-2000:]
    max_dd = _curve_dd(curve, start_bal)
    trades = _dedupe(list((state or {}).get("trades") or []) + rec.trades,
                     lambda t: (t.get("symbol"), t.get("open_ts"), t.get("close_ts"), round(float(t.get("net_pnl", 0)), 6)),
                     5000)
    events = _dedupe(list((state or {}).get("events") or []) + rec.events,
                     lambda e: (e.get("ts"), e.get("type"), e.get("symbol"), e.get("msg")), 300)
    wins = sum(1 for t in trades if float(t.get("net_pnl") or 0) > 0)
    day_start = risk.day_start_equity or eq
    day_pnl = (eq - day_start) / day_start if day_start else 0.0
    old_sigs = {s.get("symbol"): s for s in (state or {}).get("signals") or []}
    for s, sig in eng.last_signal.items():
        old_sigs[s] = {"symbol": s, **sig}
    prev_prices = (state or {}).get("prices") or {}
    prices = {}
    for s in symbols:
        m = ex.mkt[s]
        if m.bid or m.ask or m.mark or m.last:
            prices[s] = {"bid": m.bid, "ask": m.ask, "last": m.last, "mark": m.mark or m.last,
                         "funding_rate": m.funding_rate,
                         "next_funding_time": m.next_funding_time or None}
        elif s in prev_prices:
            prices[s] = prev_prices[s]
    snap = dict(state or {})
    snap.update({
        "version": "binance-paper-v1", "schema": 1, "paper": True, "live_trading": False,
        "starting_balance": start_bal, "wallet": ex.wallet, "equity": eq, "unrealized": ex.unrealized(),
        "peak_equity": peak, "drawdown_pct": (eq - peak) / peak * 100 if peak else 0.0,
        "max_drawdown_pct": max_dd * 100, "return_pct": (eq / start_bal - 1) * 100 if start_bal else 0.0,
        "fees_total": ex.totals.get("fees", 0.0), "funding_total": ex.totals.get("funding", 0.0),
        "realized_total": ex.totals.get("realized", 0.0), "liquidations": ex.totals.get("liquidations", 0),
        "available": ex.available_balance(), "used_margin": ex.used_margin(),
        "win_rate_pct": (100.0 * wins / len(trades)) if trades else 0.0,
        "trades_closed": len(trades), "wins": wins,
        "strategy": strategy_view(strat, cfg),
        "price_source": describe(feed, filters_src, probes),
        "last_cycle": _iso(now), "last_ts": now, "started": started,
        "last_15m_open": last_15m, "last_1h_open": last_1h, "last_1m_open": last_1m,
        "last_bar_close": _iso(last_15m + INTERVAL_MS["15m"]) if last_15m else None,
        "risk": {"day": risk.day, "day_start_equity": risk.day_start_equity,
                 "day_pnl_pct": day_pnl * 100, "halted": day_pnl <= -risk.max_daily_loss,
                 "max_daily_loss_pct": risk.max_daily_loss * 100,
                 "max_positions": risk.max_pos},
        "positions": _positions(ex), "prices": prices, "brackets": _bracket_view(ex, symbols),
        "trades": trades, "events": events,
        "signals": list(old_sigs.values()), "equity_curve": curve, "catchup": catch,
        "symbols": symbols,
        "universe": universe_rows,
        "universe_ranked_at": ranked_at,
        "universe_month": universe_month,
        "universe_reused": universe_reused,
        "exchange": ex.to_dict(),
        "engine": {"risk": risk.to_dict(), "funding_done": funding_done},
    })
    write_state(path, snap)
    log.info("cycle source=%s filters=%s equity=%.2f positions=%d trades=%d",
             snap["price_source"]["id"], filters_src, eq, len(snap["positions"]), len(trades))
    return snap


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    path = sys.argv[1] if len(sys.argv) > 1 else "binance-paper/state.json"
    snap = run(path)
    ps = snap["price_source"]
    names = ",".join(r["symbol"] for r in snap.get("universe") or [])
    cu = snap.get("catchup") or {}
    print(f"source={ps['id']} endpoint={ps['endpoint']} filters={ps['filters']} "
          f"equity={snap['equity']:.2f} positions={len(snap['positions'])} trades={snap['trades_closed']} "
          f"evaluated_1h={cu.get('evaluated_1h')} warmup_4h_min={cu.get('warmup_4h_min')} "
          f"universe={names}")


if __name__ == "__main__":
    main()

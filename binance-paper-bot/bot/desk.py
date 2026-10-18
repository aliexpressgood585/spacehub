"""Scheduled paper desk.

The Actions job loops for hours. Each wall-clock minute replays closed 1m bars
(stops, liquidation, funding) and a full strategy cycle runs a couple of minutes
after each 1h close. Existing wallet, trades and events are kept. Paper only —
there is no order endpoint and no API key.

Two paper rules share one account. ema_trend_4h still decides on 1h closes from
completed 4h bars. orb_ny_15m decides after each closed 15m bar. Stops stay on
1m highs/lows. The coin list is a monthly top-20 by trailing 90-day median
quote volume. An existing account is never replaced.

config/manual_trades.json, when present, is a separate one-shot paper basket
(manual_aggr_1..5). It does not go through the strategy risk sizer.

    python -m bot.desk binance-paper/state.json          # one full cycle
    python -m bot.desk --tick binance-paper/state.json   # stops, or full if an hour is due
    python -m bot.desk --stops binance-paper/state.json  # 1m stops only
    python -m bot.desk --check-loop binance-paper/state.json
    python -m bot.desk --handoff binance-paper/state.json
"""
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone

from .config import load_config, rpath
from .engine import TradingEngine, kline_row
from .execution.base import Order
from .execution.paper import PaperExchange
from .feed import connect, describe
from .margin import LeverageBrackets
from .replay import STRATEGY_LAG_MS, replay_minutes
from .rest import INTERVAL_MS
from .risk import RiskManager
from .clock import closed_bar_open, opens_after
from .storage import MemoryRecorder
from .strategies import REGISTRY, make_strategy
from .symbols import SymbolInfo, load_symbol_infos
from .manual import (attach_symbol, config_path, contract_symbols, ensure_blob, execute_plans,
                     load_manual_config, maintain, merge_contracts, plan_opens, prune_contracts,
                     score_directions, ticker_to_rows, usdt_perp_symbols, volume_priority,
                     window_open)
from .universe import (is_current, month_key, rank_live, slippage_bps, stored_rows)

log = logging.getLogger("desk")

# A missed cron of a few weeks is replayed; older than this and only the newest
# window is walked so a single Actions job cannot run away.
MAX_1M_BARS = 21 * 24 * 60
EQUITY_CAP = 8000
# Another run's heartbeat older than this is not a live loop.
HEARTBEAT_STALE_MS = 180_000


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


# summary_intraday.csv row 1, the 15m NY ORB parameter row. Maker-TP is the
# order type this desk sends. The walk-forward of the family was not a stable edge.
ORB_BACKTEST = {
    "oos": {"window": "2026-01..2026-10", "return_pct": 11.1, "maker_tp_return_pct": 12.4,
            "win_rate_pct": 45.9, "pf": 1.19, "maker_tp_pf": 1.21, "max_dd_pct": -14.1,
            "trades": 111, "avg_bps": 30.5},
    "is": {"window": "2024-01..2025-12", "return_pct": 19.0, "maker_tp_return_pct": 22.3,
           "win_rate_pct": 43.8, "pf": 1.13, "max_dd_pct": -20.1, "trades": 313},
    "note": "Paper measurement. Walk-forward of this family was mixed to negative; not a proven edge.",
}

# port_family_best.csv xs row, plus the reference note on an as-of-2024 universe.
XS_BACKTEST = {
    "oos": {"window": "2026-01..2026-10", "return_pct": 37.8, "return_pct_conservative": 13.0,
            "max_dd_pct": -11.2, "max_dd_pct_low": -23.0, "max_dd_pct_high": -11.0,
            "positive_months_pct": 70.0, "sharpe": 1.64, "corr_ema_trend_4h": 0.05},
    "is": {"window": "2024-01..2025-12", "return_pct": 378.9, "sharpe": 2.66, "max_dd_pct": -17.1,
           "positive_months_pct": 79.2},
    "note": ("Paper measurement. Base-universe OOS is about +38% with max drawdown about -11% "
             "and about 70% of months positive. An as-of-2024 universe is about +13%. "
             "Reported span +13% to +38%, max drawdown -11% to -23%. "
             "Correlation with ema_trend_4h is about 0.05. Not a proven live edge."),
}


def strategy_view(strat, cfg):
    view = {"name": strat.name, "timeframe": strat.timeframe,
            "params": cfg["strategy"]["params"].get(strat.name, {})}
    if strat.name == "ema_trend_4h":
        view["backtest"] = EMA_BACKTEST
    elif strat.name == "orb_ny_15m":
        view["backtest"] = ORB_BACKTEST
    elif strat.name == "xs_mom_1d":
        view["backtest"] = XS_BACKTEST
    return view


def strategy_specs(cfg):
    """Primary strategy, then any other names listed under cfg['strategies']."""
    primary = make_strategy(cfg)
    specs = [primary]
    seen = {primary.name}
    for row in cfg.get("strategies") or []:
        name = (row or {}).get("name")
        if not name or name in seen:
            continue
        if name not in REGISTRY:
            raise ValueError(f"unknown strategy {name}")
        params = (cfg.get("strategy") or {}).get("params", {}).get(name, {})
        specs.append(REGISTRY[name](params))
        seen.add(name)
    return specs


def risk_overrides(cfg):
    out = {}
    for row in cfg.get("strategies") or []:
        name = (row or {}).get("name")
        if not name:
            continue
        ov = {}
        if "risk_per_trade" in row:
            ov["risk_per_trade"] = float(row["risk_per_trade"])
        if "max_concurrent_positions" in row:
            ov["max_concurrent_positions"] = int(row["max_concurrent_positions"])
        if "max_daily_loss" in row:
            ov["max_daily_loss"] = float(row["max_daily_loss"])
        if ov:
            out[name] = ov
    return out


def _wants_15m(specs):
    return any(s.timeframe == "15m" for s in specs)


def _bind_engine(eng, cfg, state):
    eng.overrides = risk_overrides(cfg)
    eng.closed_trades = list((state or {}).get("trades") or [])
    raw = ((state or {}).get("engine") or {}).get("universe_period") or {}
    eng.universe_period = {str(k): int(v) for k, v in raw.items() if v is not None}
    return eng


def _stored_manual(state):
    raw = ((state or {}).get("engine") or {}).get("manual")
    return raw if isinstance(raw, dict) else None


def _with_manual_symbols(symbols, state):
    out = list(symbols)
    for s in contract_symbols(state):
        if s not in out:
            out.append(s)
    return out


def _load_manual_spec(cfg):
    path = config_path(cfg)
    if not os.path.exists(path):
        return None
    try:
        return load_manual_config(path)
    except Exception:
        log.exception("manual trades config rejected; basket left as stored")
        return None


def begin_manual(cfg, ex, rec, state, now):
    """Start the one-shot clock. Returns (spec, blob, on_minute).

    The hook closes the basket and arms breakeven on every replayed minute.
    It does not open. Opens happen once, after the replay, in finish_manual.
    """
    spec = _load_manual_spec(cfg)
    if spec is None:
        return None, _stored_manual(state), None
    blob = ensure_blob(spec, _stored_manual(state), now)
    wt = (cfg.get("execution") or {}).get("sl_tp_working_type") or "CONTRACT_PRICE"

    def on_minute(ts, _ex=ex, _rec=rec, _spec=spec, _blob=blob, _wt=wt):
        maintain(_ex, _rec, _spec, _blob, ts, working_type=_wt)

    return spec, blob, on_minute


def _fetch_manual_ticker(feed, cfg):
    if getattr(feed, "kind", "") == "binance" and getattr(feed, "rest", None) is not None:
        try:
            rows = feed.rest.get("/fapi/v1/ticker/24hr")
            if isinstance(rows, list):
                return rows
        except Exception:
            log.exception("manual 24h ticker via the price feed failed")
    try:
        from .rest import PublicRest
        from .feed import probe_binance
        rest = PublicRest(cfg["data"]["rest_bases"], cfg["data"].get("brackets_url"), timeout=12)
        base, _probes = probe_binance(rest.s, list(rest.bases), rest.timeout)
        if not base:
            return None
        rest.base = base
        rows = rest.get("/fapi/v1/ticker/24hr")
        return rows if isinstance(rows, list) else None
    except Exception:
        log.exception("manual 24h ticker via Binance failed")
        return None


def _manual_exchange_info(feed, exchange_info):
    if usdt_perp_symbols(exchange_info):
        return exchange_info
    if getattr(feed, "kind", "") == "binance":
        try:
            live = feed.exchange_info()
        except Exception:
            log.exception("manual exchangeInfo failed")
            return exchange_info
        if usdt_perp_symbols(live):
            return live
    return exchange_info


def _closes_4h(feed, symbol, now):
    start = int(now) - 260 * INTERVAL_MS["4h"]
    try:
        raw = feed.klines(symbol, "4h", start, int(now))
    except Exception:
        log.warning("manual 4h klines failed for %s", symbol, exc_info=True)
        return None
    closes = []
    for k in raw or []:
        try:
            if int(k[6]) >= int(now):
                continue
            closes.append(float(k[4]))
        except (TypeError, ValueError, IndexError):
            continue
    return closes


def _quote_manual_symbol(ex, feed, info_by, symbol, now):
    if symbol not in ex.si:
        raw = info_by.get(symbol)
        if not raw:
            return False
        try:
            attach_symbol(ex, SymbolInfo.from_exchange_info(raw))
        except Exception:
            log.warning("manual contract filters missing for %s", symbol, exc_info=True)
            return False
    try:
        bt = feed.book_ticker(symbol)
        pi = feed.premium_index(symbol)
        bid, ask = float(bt["bidPrice"]), float(bt["askPrice"])
        mark = float(pi["markPrice"])
        last = float(bt["lastPrice"]) if bt.get("lastPrice") else (bid + ask) / 2.0
    except Exception:
        log.warning("manual book failed for %s", symbol, exc_info=True)
        return False
    if bid <= 0 or ask <= 0:
        return False
    ex.update_market(symbol, int(now), bid=bid, ask=ask, last=last, mark=mark)
    return True


def _score_manual(cfg, spec, ex, feed, exchange_info, now, need):
    """(rows, directions) for one selection. (None, None) means try again next tick."""
    ei = _manual_exchange_info(feed, exchange_info)
    perps = usdt_perp_symbols(ei)
    if not perps:
        return None, None, ei
    rows = ticker_to_rows(_fetch_manual_ticker(feed, cfg), perps)
    if rows is None:
        return None, None, ei
    priority = volume_priority(
        rows, min_quote_volume=spec["min_quote_volume"], exclude=spec["exclude"],
        open_symbols=set(ex.pos), prefer=spec["prefer"])
    if not priority:
        return rows, {}, ei
    directions = score_directions(priority, lambda sym: _closes_4h(feed, sym, now), need)
    if directions is None:
        return None, None, ei
    return rows, directions, ei


def finish_manual(cfg, spec, blob, ex, rec, feed, exchange_info, now, symbols):
    """One selection tick for every still-pending id, then the basket check on the live mark."""
    if spec is None or blob is None:
        return blob
    wt = (cfg.get("execution") or {}).get("sl_tp_working_type") or "CONTRACT_PRICE"
    maintain(ex, rec, spec, blob, now, working_type=wt)
    if not blob.get("resolved"):
        if not window_open(blob, now):
            blob, _plans = plan_opens(spec, blob, now, None, None, set(ex.pos))
        else:
            need = sum(1 for t in spec["trades"] if blob["ids"].get(t["id"], {}).get("status") == "pending")
            rows, directions, ei = _score_manual(cfg, spec, ex, feed, exchange_info, now, need)
            blob, plans = plan_opens(spec, blob, now, rows, directions, set(ex.pos))
            if plans:
                info_by = {s.get("symbol"): s for s in (ei or {}).get("symbols") or [] if s.get("symbol")}
                for plan in plans:
                    _quote_manual_symbol(ex, feed, info_by, plan["symbol"], now)
                execute_plans(ex, rec, plans, now, blob, working_type=wt)
    prune_contracts(ex, blob)
    for s in list(ex.pos):
        if s not in symbols:
            symbols.append(s)
    return blob


def rebalance_still_due(strat, now, last_1h_open):
    """True when today's 00:00 UTC rebalance is still waiting for the hourly cycle.

    The full cycle runs about two minutes after midnight and calls
    on_universe_bar. A minute tick in that window must not open the same book first.
    """
    if last_1h_open is None or not strat.is_rebalance_day(now):
        return False
    day_start = (int(now) // 86_400_000) * 86_400_000
    midnight_hour = day_start - INTERVAL_MS["1h"]
    return int(last_1h_open) < midnight_hour


def closed_daily_candles(eng, now):
    """Daily buffers, dropping a bar that has not closed yet."""
    out = {}
    now = int(now)
    for sym, bufs in (getattr(eng, "candles", None) or {}).items():
        buf = (bufs or {}).get("1d")
        if not buf or not getattr(buf, "rows", None):
            continue
        arrays = buf.arrays()
        if len(arrays["close_time"]) == 0:
            continue
        if int(arrays["close_time"][-1]) + 1 > now:
            if len(arrays["close_time"]) < 2:
                continue
            arrays = {k: v[:-1] for k, v in arrays.items()}
            if int(arrays["close_time"][-1]) + 1 > now:
                continue
        out[sym] = arrays
    return out


def bootstrap_due(specs, ex, now, period, last_1h_open):
    """'latch' to record a book already open, 'enter' to open a flat one, else ''."""
    period = period or {}
    for st in specs:
        if not hasattr(st, "needs_bootstrap"):
            continue
        positions = {s: p for s, p in ex.positions().items() if getattr(p, "strategy", "") == st.name}
        pid = int(st.period_id(now))
        if positions:
            if period.get(st.name) != pid:
                return "latch"
            continue
        if st.needs_bootstrap(now, positions, period.get(st.name)) and not rebalance_still_due(st, now, last_1h_open):
            return "enter"
    return ""


def bootstrap_flat(eng, now, last_1h_open=None):
    """Open a flat cross-sectional book from the last closed daily bars.

    One entry per rebalance period. An open book, or a period already recorded,
    is left alone. Returns how many entry signals were handed to the engine.
    """
    if eng is None:
        return 0
    period = eng.universe_period
    n = 0
    now = int(now)
    for st in eng.strats:
        needs = getattr(st, "needs_bootstrap", None)
        fn = getattr(st, "bootstrap_signals", None)
        if needs is None or fn is None:
            continue
        name = st.name
        positions = {s: p for s, p in eng.ex.positions().items() if getattr(p, "strategy", "") == name}
        pid = int(st.period_id(now))
        if positions:
            period[name] = pid
            continue
        if not needs(now, positions, period.get(name)):
            continue
        if rebalance_still_due(st, now, last_1h_open):
            continue
        candles = closed_daily_candles(eng, now)
        try:
            sigs = fn(candles) or []
        except Exception:
            log.exception("bootstrap failed for %s", name)
            continue
        if getattr(st, "_bootstrap_status", "") == "empty_book":
            period[name] = pid
            continue
        for sig in sigs:
            n += 1
            eng.last_signal[sig.symbol] = {"ts": now, "action": sig.action, "reason": sig.reason,
                                            "info": sig.info, "strategy": name}
            eng.handle(sig, now, st)
        if any(getattr(p, "strategy", "") == name for p in eng.ex.positions().values()):
            period[name] = pid
    return n


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
            elif o.type == "LIMIT" and o.reduce_only:
                tp = o.price
        px = mark or p.entry_price
        br = ex.brackets.for_notional(s, p.qty * px)
        view.append({"symbol": s, "side": "LONG" if p.side > 0 else "SHORT", "qty": p.qty,
                     "strategy": p.strategy,
                     "entry": p.entry_price, "mark": mark, "leverage": p.leverage,
                     "upnl": p.upnl(mark), "liq": ex.liq_price(s), "sl": sl, "tp": tp,
                     "breakeven": (p.meta or {}).get("breakeven"),
                     "manual_id": (p.meta or {}).get("manual_id"),
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


def due_full(now_ms, state, lag_ms=STRATEGY_LAG_MS):
    """True when a full strategy cycle should run.

    The latest closed 1h bar is acted on only after `lag_ms`. An older hour that
    was never signaled is due immediately, including while the newest hour is
    still inside the lag. A missing account or a missing 1h/1m cursor is due.
    """
    if not state or state.get("last_1h_open") is None or state.get("last_1m_open") is None:
        return True
    h1 = INTERVAL_MS["1h"]
    now_ms = int(now_ms)
    latest = closed_bar_open(now_ms, h1)
    close = latest + h1
    last = int(state["last_1h_open"])
    if now_ms < close + int(lag_ms):
        return last < latest - h1
    return last < latest


def pending_signal_hours(last_open, now_ms, minute_opens, lag_ms=STRATEGY_LAG_MS):
    """1h opens that are lag-ready, newer than `last_open`, and whose closing
    minute is not in `minute_opens` (replay will not signal those itself)."""
    if last_open is None:
        return []
    h1 = INTERVAL_MS["1h"]
    now_ms = int(now_ms)
    latest = closed_bar_open(now_ms, h1)
    minute_opens = set(minute_opens or [])
    out = []
    hopen = int(last_open) + h1
    while hopen <= latest:
        boundary = hopen + h1
        if now_ms >= boundary + int(lag_ms) and (boundary - 60_000) not in minute_opens:
            out.append(hopen)
        hopen += h1
    return out


def extend_replay_minutes(last_open, now_ms, minutes):
    """Prepend closing minutes of lag-ready hours that `minutes` no longer contains.

    Returns (minutes, pending_hours). The caller still caps the length.
    """
    minutes = list(minutes or [])
    pending = pending_signal_hours(last_open, now_ms, minutes)
    if not pending:
        return minutes, []
    h1 = INTERVAL_MS["1h"]
    first = pending[0] + h1 - 60_000
    tail = minutes[0] if minutes else closed_bar_open(int(now_ms), 60_000) + 60_000
    extra = list(range(first, tail, 60_000))
    return extra + minutes, pending


def current_run_id(explicit=None):
    return str(explicit or os.environ.get("GITHUB_RUN_ID") or os.environ.get("DESK_RUN_ID") or "local")


def other_loop_alive(state, run_id, now_ms=None):
    """True only when a different run is status=running and its heartbeat is fresh.

    `handoff` and a stale heartbeat are not alive, so the successor of a finished
    loop does not treat the job that just exited as still holding the desk.
    """
    loop = (state or {}).get("loop") or {}
    if loop.get("status") != "running":
        return False
    if str(loop.get("run_id")) == str(run_id):
        return False
    hb = loop.get("heartbeat_ms")
    if hb is None:
        return False
    now_ms = _now() if now_ms is None else int(now_ms)
    if now_ms - int(hb) >= HEARTBEAT_STALE_MS:
        return False
    # When the workflow lists the runs that are actually in progress, a heartbeat
    # left behind by a job that has already exited does not block the successor.
    raw = os.environ.get("DESK_LIVE_RUNS")
    if raw is not None and raw.strip():
        live = {x.strip() for x in raw.split(",") if x.strip()}
        if str(loop.get("run_id")) not in live:
            return False
    return True


def loop_view(run_id, status, mode, now_ms):
    now_ms = int(now_ms)
    return {"run_id": str(run_id), "status": status, "mode": mode,
            "heartbeat": _iso(now_ms), "heartbeat_ms": now_ms}


def account_sig(state):
    """Wallet, fills and position size. Mark-to-market alone does not change it."""
    if not state:
        return None
    poss = tuple(sorted(
        (p.get("symbol"), p.get("side"), round(float(p.get("qty") or 0), 8))
        for p in (state.get("positions") or [])
    ))
    return (
        round(float(state.get("wallet") or 0), 4),
        int(state.get("liquidations") or 0),
        int(state.get("trades_closed") or 0),
        len(state.get("events") or []),
        poss,
    )


def should_commit(mode, before, after):
    """Full cycles and any account event publish immediately. Price ticks can wait."""
    if mode == "full":
        return True
    return account_sig(before) != account_sig(after)


def _boundary_minutes(minutes, step_ms):
    return [int(t) for t in minutes if (int(t) + 60_000) % int(step_ms) == 0]


def expire_time_stops(ex, now_ms):
    """Close a position whose time-exit minute has already closed and was not replayed."""
    closed = closed_bar_open(int(now_ms), 60_000)
    for s, p in list(ex.pos.items()):
        ets = (p.meta or {}).get("exit_ts")
        if ets is None or int(p.opened_ts) >= int(ets):
            continue
        if int(ets) <= closed:
            side = "SELL" if p.side > 0 else "BUY"
            ex.place_order(Order(s, side, "MARKET", p.qty, reduce_only=True, tag="TIME"), int(now_ms))


def run_htf(eng, ex, infos, feed, symbols, state, fresh, switched, now, rec, funding_done,
            wants_15=False, on_minute=None):
    """1h signal clock. On a strategy switch only the latest closed 1h is judged.

    When a 15m strategy is active, the same replay also evaluates each closed
    15m bar after the higher-timeframe bars it is allowed to see are stored.
    """
    h1, h4, d1 = INTERVAL_MS["1h"], INTERVAL_MS["4h"], INTERVAL_MS["1d"]
    prev_1m = None if fresh else state.get("last_1m_open")
    last_1h = None if fresh or switched else state.get("last_1h_open")
    last_15m = None if fresh else state.get("last_15m_open")
    if fresh or switched:
        all_minutes, minutes, capped = [], [], False
        pending = []
    else:
        opened = opens_after(prev_1m, now, 60_000)
        # A stops tick may already have walked an hour's closing minute. Pull that
        # minute back into this replay so the decision runs after that minute's
        # high/low and before any later bar, instead of on a book that has moved on.
        all_minutes, pending = extend_replay_minutes(last_1h, now, opened)
        capped = len(all_minutes) > MAX_1M_BARS
        minutes = all_minutes[-MAX_1M_BARS:] if capped else all_minutes
        if capped:
            pending = [h for h in pending if (h + h1 - 60_000) >= minutes[0]]
    replay_start = minutes[0] if minutes else now
    start_4h = now - (H4_BARS + 8) * h4
    start_1d = now - ((300 if wants_15 else D1_BARS) + 8) * d1
    if fresh or switched:
        start_1h = now - (600 if wants_15 else 48) * h1
    else:
        start_1h = min(now - (600 if wants_15 else 48) * h1, replay_start - 6 * h1)
    bars_4h, miss_4h = fetch_lenient(feed, symbols, "4h", start_4h, now, now)
    bars_1d, miss_1d = fetch_lenient(feed, symbols, "1d", start_1d, now, now)
    bars_1h, miss_1h = fetch_lenient(feed, symbols, "1h", start_1h, now, now)
    bars_15, miss_15 = {}, []
    if wants_15:
        bars_15, miss_15 = fetch_lenient(feed, symbols, "15m", now - 3 * d1, now, now)
    catch = {"fresh": fresh, "switched": switched, "minutes": 0, "capped": capped,
             "evaluated_15m": 0, "evaluated_1h": 0, "degraded": [], "funding_applied": 0,
             "skipped_1m": 0 if fresh or switched else max(0, len(all_minutes) - len(minutes)),
             "missing_4h": miss_4h, "missing_1d": miss_1d, "missing_1h": miss_1h,
             "missing_15m": miss_15, "pending_1h": pending}
    if fresh or switched:
        latest = closed_bar_open(now, h1)
        cut = latest + h1
        for s in symbols:
            add_closed(eng, s, "4h", bars_4h.get(s, {}), cut)
            add_closed(eng, s, "1d", bars_1d.get(s, {}), cut)
            add_closed(eng, s, "1h", bars_1h.get(s, {}), cut)
            if wants_15:
                add_closed(eng, s, "15m", bars_15.get(s, {}), cut)
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
        # Seed only bars closed before the first replayed minute. Later 4h/1d/1h
        # bars are added as their own boundary is reached, so an earlier hour
        # cannot see a 4h close that had not happened yet.
        for s in symbols:
            add_closed(eng, s, "4h", bars_4h.get(s, {}), replay_start)
            add_closed(eng, s, "1d", bars_1d.get(s, {}), replay_start)
            add_closed(eng, s, "1h", bars_1h.get(s, {}), replay_start)
            if wants_15:
                add_closed(eng, s, "15m", bars_15.get(s, {}), replay_start)
                add_closed(eng, s, "1m", {}, replay_start)
    if minutes:
        m0, m1 = minutes[0], minutes[-1] + 60_000
        bars_1m = {}
        pre = m0 - (8 * h1 if wants_15 else 0)
        for s in symbols:
            try:
                bars_1m[s] = _rows(feed.klines(s, "1m", pre, m1 + 1), now)
            except Exception:
                log.warning("1m klines failed for %s", s, exc_info=True)
                bars_1m[s] = {}
            if wants_15:
                add_closed(eng, s, "1m", bars_1m.get(s, {}), m0)
        marks = fetch_marks(feed, symbols, m0, m1 + 1, now)
        funds = fetch_funding(feed, symbols, m0, now)
        stats = replay_minutes(ex, eng, symbols, minutes, bars_1m, marks, bars_15, bars_1h,
                               funds, funding_done, last_15m, bars_4h=bars_4h, bars_1d=bars_1d,
                               strategy_tf="1h", last_signal_open=last_1h,
                               strategy_ready_at=None if fresh or switched else now,
                               on_minute=on_minute)
        if stats.get("last_signal_open") is not None:
            last_1h = stats["last_signal_open"]
        if wants_15 and stats.get("last_15m_open") is not None:
            last_15m = stats["last_15m_open"]
        catch.update(minutes=stats["minutes"],
                     evaluated_1h=catch["evaluated_1h"] + stats["evaluated_1h"],
                     evaluated_15m=catch["evaluated_15m"] + stats["evaluated_15m"],
                     degraded=stats["degraded"], funding_applied=stats["funding_applied"])
        if capped:
            rec.on_event({"ts": now, "type": "CATCH_UP", "symbol": "",
                          "msg": f"gap longer than {MAX_1M_BARS} 1m bars; replayed the newest {len(minutes)} only"})
    if not wants_15:
        last_15m = closed_bar_open(now, INTERVAL_MS["15m"])
    elif last_15m is None:
        last_15m = closed_bar_open(now, INTERVAL_MS["15m"]) if fresh or switched else state.get("last_15m_open")
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
    specs = strategy_specs(cfg)
    strat = specs[0]
    htf = strat.timeframe == "1h" or any(s.timeframe == "1h" for s in specs)
    wants_15 = _wants_15m(specs)
    universe_rows, ranked_at, universe_month, universe_reused = [], None, None, False
    ei, br = None, None
    if htf:
        ei, br = fetch_exchange_info(cfg, feed)
        universe_rows, ranked_at, universe_month, universe_reused = choose_universe(
            cfg, feed, state, now, ei)
        symbols = _symbol_list(universe_rows, state, cfg["symbols"])
    else:
        symbols = list(cfg["symbols"])
    symbols = _with_manual_symbols(symbols, state)
    cfg = dict(cfg)
    cfg["symbols"] = list(symbols)
    infos, brackets, filters_src = load_meta(cfg, feed, exchange_info=ei, brackets_raw=br,
                                              allow_missing=htf)
    infos = merge_contracts(infos, _stored_manual(state))
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
    eng = TradingEngine(cfg, ex, strat, risk, infos, brackets, recorder=rec, strategies=specs)
    _bind_engine(eng, cfg, state)

    prev_name = ((state or {}).get("strategy") or {}).get("name")
    switched = htf and not fresh and (prev_name != strat.name or state.get("last_1h_open") is None)
    last_1h = None if fresh else (state or {}).get("last_1h_open")
    manual_spec, manual_blob, on_minute = begin_manual(cfg, ex, rec, state, now)
    if htf:
        last_1h, last_15m, catch = run_htf(eng, ex, infos, feed, symbols, state, fresh, switched,
                                           now, rec, funding_done, wants_15=wants_15, on_minute=on_minute)
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
                                   funds, funding_done, last_15m, on_minute=on_minute)
            last_15m = stats["last_15m_open"]
            catch.update(minutes=stats["minutes"],
                         evaluated_15m=catch["evaluated_15m"] + stats["evaluated_15m"],
                         degraded=stats["degraded"], funding_applied=stats["funding_applied"])
            if capped:
                rec.on_event({"ts": now, "type": "CATCH_UP", "symbol": "",
                              "msg": f"gap longer than {MAX_1M_BARS} 1m bars; replayed the newest {len(minutes)} only"})

    refresh_live(ex, feed, symbols, now)
    if wants_15:
        expire_time_stops(ex, now)
    bootstrap_flat(eng, now, last_1h)
    manual_blob = finish_manual(cfg, manual_spec, manual_blob, ex, rec, feed, ei, now, symbols)
    return _publish(path, state, cfg, ex, risk, rec, feed, filters_src, probes, symbols, now,
                    strat, last_15m, last_1h, catch, funding_done,
                    universe_rows, ranked_at, universe_month, universe_reused,
                    fresh, switched, prev_name, eng, manual=manual_blob)


def _publish(path, state, cfg, ex, risk, rec, feed, filters_src, probes, symbols, now,
             strat, last_15m, last_1h, catch, funding_done,
             universe_rows, ranked_at, universe_month, universe_reused,
             fresh, switched, prev_name, eng, keep_strategy=False, brackets_view=None,
             manual=None):
    """Write one snapshot. Starts from the previous dict so unknown keys survive."""
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
    if eng is not None:
        for s, sig in eng.last_signal.items():
            old_sigs[s] = {"symbol": s, **sig}
    prev_prices = (state or {}).get("prices") or {}
    prices = {}
    for s in symbols:
        m = ex.mkt.get(s)
        if m and (m.bid or m.ask or m.mark or m.last):
            prices[s] = {"bid": m.bid, "ask": m.ask, "last": m.last, "mark": m.mark or m.last,
                         "funding_rate": m.funding_rate,
                         "next_funding_time": m.next_funding_time or None}
        elif s in prev_prices:
            prices[s] = prev_prices[s]
    strategy = (state or {}).get("strategy") if keep_strategy and (state or {}).get("strategy") else strategy_view(strat, cfg)
    strategies = [strategy_view(s, cfg) for s in strategy_specs(cfg)]
    if brackets_view is None:
        brackets_view = _bracket_view(ex, [s for s in symbols if s in ex.mkt])
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
        "strategy": strategy,
        "strategies": strategies,
        "price_source": describe(feed, filters_src, probes),
        "last_cycle": _iso(now), "last_ts": now, "started": started,
        "last_15m_open": last_15m, "last_1h_open": last_1h, "last_1m_open": last_1m,
        "last_bar_close": _iso(last_15m + INTERVAL_MS["15m"]) if last_15m else None,
        "risk": {"day": risk.day, "day_start_equity": risk.day_start_equity,
                 "day_pnl_pct": day_pnl * 100, "halted": day_pnl <= -risk.max_daily_loss,
                 "max_daily_loss_pct": risk.max_daily_loss * 100,
                 "max_positions": risk.max_pos},
        "positions": _positions(ex), "prices": prices, "brackets": brackets_view,
        "trades": trades, "events": events,
        "signals": list(old_sigs.values()), "equity_curve": curve, "catchup": catch,
        "symbols": symbols,
        "universe": universe_rows,
        "universe_ranked_at": ranked_at,
        "universe_month": universe_month,
        "universe_reused": universe_reused,
        "exchange": ex.to_dict(),
        "engine": {"risk": risk.to_dict(), "funding_done": funding_done,
                   "universe_period": _universe_period(state, eng),
                   "manual": manual if manual is not None else _stored_manual(state)},
    })
    write_state(path, snap)
    log.info("cycle source=%s filters=%s equity=%.2f positions=%d trades=%d",
             snap["price_source"]["id"], filters_src, eq, len(snap["positions"]), len(trades))
    return snap


def _universe_period(state, eng):
    if eng is not None and getattr(eng, "universe_period", None) is not None:
        return {str(k): int(v) for k, v in eng.universe_period.items()}
    raw = ((state or {}).get("engine") or {}).get("universe_period") or {}
    return {str(k): int(v) for k, v in raw.items() if v is not None}


def _working_symbols(state, cfg):
    symbols, seen = [], set()
    for s in (state or {}).get("symbols") or []:
        if s and s not in seen:
            symbols.append(s)
            seen.add(s)
    ex = (state or {}).get("exchange") or {}
    for s in (ex.get("positions") or {}):
        if s not in seen:
            symbols.append(s)
            seen.add(s)
    for od in ex.get("orders") or []:
        s = od.get("symbol")
        if s and s not in seen:
            symbols.append(s)
            seen.add(s)
    return symbols or list(cfg["symbols"])


def _protected_symbols(state):
    """Symbols whose filters must exist or a stop tick would drop a live book entry."""
    ex = (state or {}).get("exchange") or {}
    out = set((ex.get("positions") or {}))
    for od in ex.get("orders") or []:
        if od.get("symbol"):
            out.add(od["symbol"])
    return out


def run_stops(path, now=None):
    """Replay new 1m bars. Does not rank and does not reset the account.

    ema_trend_4h stays on the hourly cycle. When one of the new minutes closes a
    15m bar, orb_ny_15m is evaluated on that bar. If an open position or resting
    order has no contract filters, the tick raises before writing so a 5-coin
    cache cannot drop the rest of the book.
    """
    cfg = load_config()
    now = _now() if now is None else int(now)
    state = read_state(path)
    if state is None or "exchange" not in state:
        return run(path, now)
    feed, probes = connect(cfg)
    symbols = _with_manual_symbols(_working_symbols(state, cfg), state)
    cfg = dict(cfg)
    cfg["symbols"] = list(symbols)
    ei, br = fetch_exchange_info(cfg, feed)
    infos, brackets, filters_src = load_meta(cfg, feed, exchange_info=ei, brackets_raw=br, allow_missing=True)
    infos = merge_contracts(infos, _stored_manual(state))
    protected = _protected_symbols(state)
    missing = sorted(s for s in protected if s not in infos)
    if missing:
        raise RuntimeError(f"stop cycle missing filters for {missing}; state left untouched")
    tradable = [s for s in symbols if s in infos]
    if protected and not tradable:
        raise RuntimeError("stop cycle has no contract filters; state left untouched")
    fees = cfg["fees"]
    rec = MemoryRecorder()
    ex = PaperExchange(infos, brackets, cfg["account"]["starting_balance"], fees["maker"], fees["taker"],
                       cfg["execution"]["slippage_bps"], cfg["account"]["default_leverage"],
                       traverse_fill=False, listener=rec)
    ex.load_dict(state["exchange"])
    # A protected symbol that was a position must still be a position. An order-only
    # symbol must still have its order. load_dict drops anything missing from infos.
    still_pos = set(ex.pos)
    still_ord = {o.symbol for o in ex.orders.values()}
    lost = sorted(s for s in protected if s not in still_pos and s not in still_ord)
    if lost:
        raise RuntimeError(f"stop cycle would drop {lost}; state left untouched")
    manual_spec, manual_blob, on_minute = begin_manual(cfg, ex, rec, state, now)
    funding_done = {k: int(v) for k, v in (state.get("engine") or {}).get("funding_done", {}).items()}
    risk = RiskManager(cfg, fees["taker"], cfg["execution"]["slippage_bps"])
    risk.load_dict((state.get("engine") or {}).get("risk") or {})
    apply_slip(ex, risk, state.get("universe") or [])
    prev_1m = state.get("last_1m_open")
    all_minutes = [] if prev_1m is None else opens_after(prev_1m, now, 60_000)
    capped = len(all_minutes) > MAX_1M_BARS
    minutes = all_minutes[-MAX_1M_BARS:] if capped else all_minutes
    catch = {"mode": "stops", "fresh": False, "minutes": 0, "capped": capped,
             "evaluated_15m": 0, "evaluated_1h": 0, "degraded": [], "funding_applied": 0,
             "skipped_1m": max(0, len(all_minutes) - len(minutes))}
    last_15m = state.get("last_15m_open")
    specs = strategy_specs(cfg)
    hit15 = _boundary_minutes(minutes, INTERVAL_MS["15m"]) if _wants_15m(specs) else []
    eng = None
    if minutes and tradable:
        m0, m1 = minutes[0], minutes[-1] + 60_000
        pre = m0 - (8 * INTERVAL_MS["1h"] if hit15 else 0)
        bars_1m = {}
        for s in tradable:
            try:
                bars_1m[s] = _rows(feed.klines(s, "1m", pre, m1 + 1), now)
            except Exception:
                log.warning("1m klines failed for %s", s, exc_info=True)
                bars_1m[s] = {}
        gap = []
        for s in protected:
            have = bars_1m.get(s) or {}
            if any(t not in have for t in minutes):
                gap.append(s)
        if gap:
            raise RuntimeError(f"1m bars missing for open book {gap}; state left untouched")
        bars_15, bars_1h, bars_4h, bars_1d = {}, {}, {}, {}
        if hit15:
            eng = TradingEngine(cfg, ex, specs[0], risk, infos, brackets, recorder=rec, strategies=specs)
            _bind_engine(eng, cfg, state)
            h1, h4, d1 = INTERVAL_MS["1h"], INTERVAL_MS["4h"], INTERVAL_MS["1d"]
            bars_1h, _m1h = fetch_lenient(feed, tradable, "1h", now - 600 * h1, now, now)
            bars_4h, _m4 = fetch_lenient(feed, tradable, "4h", now - (H4_BARS + 8) * h4, now, now)
            bars_1d, _md = fetch_lenient(feed, tradable, "1d", now - 300 * d1, now, now)
            bars_15, _m15 = fetch_lenient(feed, tradable, "15m", now - 3 * d1, now, now)
            for s in tradable:
                add_closed(eng, s, "1h", bars_1h.get(s, {}), m0)
                add_closed(eng, s, "4h", bars_4h.get(s, {}), m0)
                add_closed(eng, s, "1d", bars_1d.get(s, {}), m0)
                add_closed(eng, s, "15m", bars_15.get(s, {}), m0)
                add_closed(eng, s, "1m", bars_1m.get(s, {}), m0)
        marks = fetch_marks(feed, tradable, m0, m1 + 1, now)
        funds = fetch_funding(feed, tradable, m0, now)
        stats = replay_minutes(ex, eng, tradable, minutes, bars_1m, marks, bars_15, bars_1h,
                               funds, funding_done, last_15m, bars_4h=bars_4h, bars_1d=bars_1d,
                               strategy_tf="stops", on_minute=on_minute)
        if stats.get("last_15m_open") is not None:
            last_15m = stats["last_15m_open"]
        catch.update(minutes=stats["minutes"], evaluated_15m=stats["evaluated_15m"],
                     degraded=stats["degraded"], funding_applied=stats["funding_applied"])
        if capped:
            rec.on_event({"ts": now, "type": "CATCH_UP", "symbol": "",
                          "msg": f"gap longer than {MAX_1M_BARS} 1m bars; replayed the newest {len(minutes)} only"})
    if tradable:
        refresh_live(ex, feed, tradable, now)
    if _wants_15m(specs):
        expire_time_stops(ex, now)
    stored_period = ((state.get("engine") or {}).get("universe_period") or {})
    kind = bootstrap_due(specs, ex, now, stored_period, state.get("last_1h_open")) if tradable else ""
    if kind:
        if eng is None:
            eng = TradingEngine(cfg, ex, specs[0], risk, infos, brackets, recorder=rec, strategies=specs)
            _bind_engine(eng, cfg, state)
        if kind == "enter" and not closed_daily_candles(eng, now):
            d1 = INTERVAL_MS["1d"]
            bars_1d, _md = fetch_lenient(feed, tradable, "1d", now - 300 * d1, now, now)
            for s in tradable:
                add_closed(eng, s, "1d", bars_1d.get(s, {}), now)
        bootstrap_flat(eng, now, state.get("last_1h_open"))
    strat = specs[0]
    manual_blob = finish_manual(cfg, manual_spec, manual_blob, ex, rec, feed, ei, now, symbols)
    return _publish(path, state, cfg, ex, risk, rec, feed, filters_src, probes, symbols, now,
                    strat, last_15m, state.get("last_1h_open"), catch, funding_done,
                    state.get("universe") or [], state.get("universe_ranked_at"),
                    state.get("universe_month"), state.get("universe_reused"),
                    False, False, None, None, keep_strategy=True,
                    brackets_view=state.get("brackets"), manual=manual_blob)


def tick(path, now=None, run_id=None):
    """One wall-clock step: full strategy cycle when an hour is due, otherwise stops."""
    now = _now() if now is None else int(now)
    run_id = current_run_id(run_id)
    state = read_state(path)
    mode = "full" if due_full(now, state) else "stops"
    snap = run(path, now) if mode == "full" else run_stops(path, now)
    snap["loop"] = loop_view(run_id, "running", mode, now)
    write_state(path, snap)
    return snap


def handoff(path, run_id=None, now=None):
    """Mark the loop idle. Does not create an account and does not touch the wallet."""
    state = read_state(path)
    if not state:
        print("handoff: no state")
        return None
    now = _now() if now is None else int(now)
    state["loop"] = loop_view(current_run_id(run_id), "handoff", "handoff", now)
    write_state(path, state)
    print("handoff")
    return state


def _print_cycle(snap, commit=None):
    ps = snap["price_source"]
    names = ",".join(r["symbol"] for r in snap.get("universe") or [])
    cu = snap.get("catchup") or {}
    loop = snap.get("loop") or {}
    extra = f" commit={'yes' if commit else 'no'}" if commit is not None else ""
    print(f"source={ps['id']} endpoint={ps['endpoint']} filters={ps['filters']} "
          f"equity={snap['equity']:.2f} positions={len(snap['positions'])} trades={snap['trades_closed']} "
          f"evaluated_1h={cu.get('evaluated_1h')} warmup_4h_min={cu.get('warmup_4h_min')} "
          f"mode={loop.get('mode') or cu.get('mode') or 'full'} "
          f"universe={names}{extra}")


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    flags, path = set(), "binance-paper/state.json"
    for a in sys.argv[1:]:
        if a.startswith("--"):
            flags.add(a)
        else:
            path = a
    run_id = current_run_id()
    if "--check-loop" in flags:
        st = read_state(path)
        if other_loop_alive(st, run_id):
            print("other loop alive")
            sys.exit(10)
        print("loop free")
        return
    if "--handoff" in flags:
        handoff(path, run_id)
        return
    if "--tick" in flags:
        before = read_state(path)
        snap = tick(path, run_id=run_id)
        mode = (snap.get("loop") or {}).get("mode") or "full"
        _print_cycle(snap, commit=should_commit(mode, before, snap))
        return
    if "--stops" in flags:
        snap = run_stops(path)
        _print_cycle(snap)
        return
    snap = run(path)
    _print_cycle(snap)


if __name__ == "__main__":
    main()

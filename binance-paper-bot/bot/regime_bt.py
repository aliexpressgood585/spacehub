"""Walk-forward comparison of ema_trend_4h against the regime selector.

The decision rule lives in `choose_selector` and is not refit here. Each book
starts from a fresh 100 USDT account at the window boundary, with the same
fees, slippage, spread, funding approximation and sizer the paper desk uses.
Regime labels are folded on the trailing 420 closed 4h bars only, which is
the window the live runner fetches.

Usage (from binance-paper-bot):
    python3 -m bot.regime_bt --klines /tmp/regime-klines --out reports/regime_oos.json
"""
import argparse
import copy
import glob
import json
import logging
import os
import time
import zipfile
from datetime import datetime, timezone

import numpy as np

from .config import ROOT, load_config, rpath
from .desk import _bind_engine, strategy_specs
from .engine import TradingEngine
from .execution.base import Order
from .execution.paper import PaperExchange
from .margin import LeverageBrackets
from .regime import (RegimeParams, adopt_wider_book, choose_menu, classify_series,
                    oos_beats, params_from_cfg, ruin_probability, trade_returns)
from .replay import HALF_SPREAD, apply_ohlc_path
from .risk import RiskManager
from .selector import StrategySelector
from .storage import MemoryRecorder
from .symbols import load_symbol_infos

SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"]
# Live volume rank on 2026-10-25. Not chosen from the backtest.
TEN = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "ZECUSDT", "XRPUSDT",
       "HYPEUSDT", "DOGEUSDT", "BNBUSDT", "SUIUSDT", "NEARUSDT"]
EXTRA_META = "/tmp/extra_symbols_meta.json"
SLEEVES = ("ema_trend_4h", "ema_fast_4h", "bb_rsi_4h")
MODES = {
    # mode: (report key, trend strategy, range strategy, selector on)
    "ema": ("ema_trend_4h", "ema_trend_4h", None, False),
    "flat": ("regime_flat", "ema_trend_4h", None, True),
    "mr": ("regime_mr", "ema_trend_4h", "bb_rsi_4h", True),
    "fast": ("regime_fast", "ema_fast_4h", None, True),
    "fast_mr": ("regime_fast_mr", "ema_fast_4h", "bb_rsi_4h", True),
}
PROFILES = {
    "conservative": {
        "risk_per_trade": 0.015,
        "max_concurrent_positions": 3,
        "max_margin_per_position": 0.40,
        "max_daily_loss": 0.05,
        "max_drawdown": 0.30,
        "max_open_risk": 0.06,
        "min_notional_roundup_risk": 0.025,
        "leverage": 5,
    },
    "aggressive": {
        "risk_per_trade": 0.05,
        "max_concurrent_positions": 4,
        "max_margin_per_position": 0.60,
        "max_daily_loss": 0.15,
        "max_drawdown": 0.50,
        "max_open_risk": 0.15,
        "min_notional_roundup_risk": 0.07,
        "leverage": 10,
    },
}
H4 = 14_400_000
H1 = 3_600_000
DAY = 86_400_000
H8 = 28_800_000
WINDOW = 420
# Published-rate stand-in. 0.01% per 8h, longs pay. Not a downloaded history.
FUNDING_RATE = 0.0001
IS_START = "2024-01-01"
OOS_START = "2026-01-01"


def _ms(day):
    return int(datetime.strptime(day, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp() * 1000)


def load_4h(root, symbol):
    rows = {}
    for path in sorted(glob.glob(os.path.join(root, f"{symbol}-4h-*.zip"))):
        with zipfile.ZipFile(path) as zf:
            text = zf.read(zf.namelist()[0]).decode("utf-8", "replace")
        for line in text.splitlines():
            if not line or line[0] not in "0123456789":
                continue
            p = line.split(",")
            ot = int(p[0])
            rows[ot] = (ot, float(p[1]), float(p[2]), float(p[3]), float(p[4]),
                        float(p[5]), int(p[6]))
    if not rows:
        raise FileNotFoundError(f"no 4h klines for {symbol} under {root}")
    return [rows[k] for k in sorted(rows)]


def daily_bars(rows):
    """UTC days built from six complete 4h bars. Keyed by the day-close timestamp."""
    by_ot = {r[0]: r for r in rows}
    out = {}
    if not rows:
        return out
    t = rows[0][0] - (rows[0][0] % DAY)
    last = rows[-1][0]
    while t <= last:
        parts = [by_ot.get(t + i * H4) for i in range(6)]
        if all(parts):
            ct = parts[-1][6]
            out[ct + 1] = (t, parts[0][1], max(p[2] for p in parts), min(p[3] for p in parts),
                           parts[-1][4], sum(p[5] for p in parts), ct)
        t += DAY
    return out


def label_series(rows, params, window=WINDOW):
    """Regime at each close, from that bar's own trailing window. No future bars."""
    high = np.array([r[2] for r in rows], float)
    low = np.array([r[3] for r in rows], float)
    close = np.array([r[4] for r in rows], float)
    ts = np.array([r[6] + 1 for r in rows])
    out = {}
    start = params.min_history - 1
    for i in range(max(start, 0), len(rows)):
        a = max(0, i + 1 - window)
        folded = classify_series(high[a:i + 1], low[a:i + 1], close[a:i + 1], ts[a:i + 1], params)
        if not folded["regime"]:
            continue
        out[int(ts[i])] = {
            "regime": folded["regime"],
            "since_ts": folded["since_ts"],
            "adx": folded.get("adx"),
            "atr_pct": folded.get("atr_pct"),
        }
    return out


def _book_cfg(base, mode, symbols, profile_name):
    """One book. Primary strategy name stays ema_trend_4h so a live tick is not a replay."""
    key, trend, rng, enabled = MODES[mode]
    profile = PROFILES[profile_name]
    cfg = copy.deepcopy(base)
    cfg["data"]["history_bars"] = WINDOW
    cfg["symbols"] = list(symbols)
    cfg["strategy"]["name"] = "ema_trend_4h"
    cfg["account"]["default_leverage"] = profile["leverage"]
    cfg["account"]["risk_profile"] = profile_name
    for fld, val in profile.items():
        if fld in cfg["risk"]:
            cfg["risk"][fld] = val
    for name in SLEEVES:
        params = cfg["strategy"]["params"].get(name)
        if params is not None:
            params["leverage"] = profile["leverage"]
    for row in cfg["strategies"]:
        if row["name"] == "ema_trend_4h":
            row["enabled"] = True
        elif row["name"] == "ema_fast_4h":
            row["enabled"] = trend == "ema_fast_4h"
        elif row["name"] == "bb_rsi_4h":
            row["enabled"] = rng == "bb_rsi_4h"
        else:
            row["enabled"] = False
        if row["name"] in SLEEVES:
            row["risk_per_trade"] = profile["risk_per_trade"]
            row["max_concurrent_positions"] = profile["max_concurrent_positions"]
            row["symbols"] = list(symbols)
    # The published menu replay is the plain book. A live scanner flag must
    # not leak into those rows, or the OOS numbers would move.
    if isinstance(cfg.get("scanner"), dict):
        cfg["scanner"]["enabled"] = False
    sel = cfg["regime_selector"]
    sel["enabled"] = enabled
    sel["trend_strategy"] = trend
    sel["range_strategy"] = rng
    return cfg, key, trend, rng


def _load_meta(cfg):
    meta = json.load(open(rpath(cfg, "data/market_meta.json")))
    symbols = list(cfg["symbols"])
    have = {s["symbol"] for s in meta["exchange_info"]["symbols"]}
    missing = [s for s in symbols if s not in have]
    if missing:
        if not os.path.exists(EXTRA_META):
            raise FileNotFoundError(f"no contract filters for {missing} ({EXTRA_META})")
        extra = json.load(open(EXTRA_META))
        meta["exchange_info"]["symbols"].extend(
            s for s in extra["exchange_info"]["symbols"] if s["symbol"] in missing)
        have_br = {b["symbol"] for b in meta["brackets"]}
        meta["brackets"].extend(b for b in extra["brackets"] if b["symbol"] not in have_br)
    infos = load_symbol_infos(meta["exchange_info"], symbols)
    return infos, LeverageBrackets(meta["brackets"])


def _apply_labels(sel, labels, close_t):
    anchor = labels.get(sel.anchor) or {}
    row = anchor.get(close_t)
    if not row:
        return
    sel.market = row["regime"]
    sel.since_ts = row["since_ts"]
    sel.anchor_adx = row.get("adx")
    sel.anchor_atr_pct = row.get("atr_pct")
    sel.classified = True
    sel.bar_ts = int(close_t)
    for sym, series in labels.items():
        got = series.get(close_t)
        if got and got.get("regime"):
            sel.symbols[sym] = got["regime"]


def _stats(trades, equity, start, totals):
    """Same definitions as bot.stats.compute_stats, without the pandas import."""
    final = float(equity[-1][1]) if equity else float(start)
    nets = [float(t["net_pnl"]) for t in trades]
    wins = [x for x in nets if x > 0]
    losses = [x for x in nets if x <= 0]
    eqs = [float(e) for _, e in equity] or [float(start)]
    peak = eqs[0]
    max_dd = 0.0
    max_dd_usdt = 0.0
    for e in eqs:
        peak = max(peak, e)
        max_dd = min(max_dd, (e - peak) / peak if peak else 0.0)
        max_dd_usdt = min(max_dd_usdt, e - peak)
    by = {}
    for t in trades:
        b = by.setdefault(t["symbol"], {"trades": 0, "net_pnl": 0.0, "wins": 0})
        b["trades"] += 1
        b["net_pnl"] += float(t["net_pnl"])
        b["wins"] += float(t["net_pnl"]) > 0
    reasons = {}
    for t in trades:
        reasons[t["reason"]] = reasons.get(t["reason"], 0) + 1
    # Daily sharpe from the last equity mark of each UTC day.
    day_last = {}
    for ts, e in equity:
        day_last[int(ts) // DAY] = float(e)
    days = [day_last[k] for k in sorted(day_last)]
    rets = [(days[i] / days[i - 1] - 1) for i in range(1, len(days)) if days[i - 1]]
    if len(rets) > 2 and float(np.std(rets)) > 0:
        sharpe = float(np.mean(rets) / np.std(rets, ddof=1) * np.sqrt(365))
    else:
        sharpe = 0.0
    if losses and sum(losses) != 0:
        pf = round(sum(wins) / abs(sum(losses)), 3)
    elif wins:
        pf = None
    else:
        pf = 0.0
    span = 0.0
    if len(equity) > 1:
        span = round((equity[-1][0] - equity[0][0]) / DAY, 1)
    return {
        "start_balance": start,
        "final_equity": round(final, 2),
        "net_pnl": round(final - start, 2),
        "return_pct": round((final / start - 1) * 100, 3) if start else 0.0,
        "trades": len(trades),
        "win_rate_pct": round(100 * len(wins) / len(trades), 2) if trades else 0.0,
        "profit_factor": pf,
        "avg_win": round(float(np.mean(wins)), 2) if wins else 0.0,
        "avg_loss": round(float(np.mean(losses)), 2) if losses else 0.0,
        "gross_pnl": round(sum(float(t["gross_pnl"]) for t in trades), 2),
        "fees_paid": round(sum(float(t["fees"]) for t in trades), 2),
        "funding_net": round(sum(float(t["funding"]) for t in trades), 2),
        "max_drawdown_pct": round(max_dd * 100, 3),
        "max_drawdown_usdt": round(max_dd_usdt, 2),
        "sharpe_daily_ann": round(sharpe, 3),
        "days": span,
        "by_symbol": {k: {"trades": v["trades"], "net_pnl": round(v["net_pnl"], 2),
                          "win_rate_pct": round(100 * v["wins"] / v["trades"], 1)}
                      for k, v in by.items()},
        "exit_reasons": reasons,
        "long_trades": sum(t["side"] == "LONG" for t in trades),
        "short_trades": sum(t["side"] == "SHORT" for t in trades),
        "liquidations": int((totals or {}).get("liquidations") or 0),
    }


def run_book(cfg, mode, series, dailies, labels, trade_start, trade_end, check_labels=False):
    """Replay 4h closes in [trade_start, trade_end). Warm up on the prior 120 days."""
    symbols = list(cfg["symbols"])
    infos, brackets = _load_meta(cfg)
    specs = strategy_specs(cfg)
    fees = cfg["fees"]
    rec = MemoryRecorder()
    ex = PaperExchange(infos, brackets, cfg["account"]["starting_balance"], fees["maker"], fees["taker"],
                       cfg["execution"]["slippage_bps"], cfg["account"]["default_leverage"],
                       traverse_fill=True, listener=rec)
    risk = RiskManager(cfg, fees["taker"], cfg["execution"]["slippage_bps"])
    eng = TradingEngine(cfg, ex, specs[0], risk, infos, brackets, recorder=rec, strategies=specs)
    _bind_engine(eng, cfg, None)
    sel = None
    if mode != "ema":
        sel = StrategySelector(cfg, None)
        eng.selector = sel
    by_close = []
    for sym in symbols:
        by_close.append({int(r[6]) + 1: r for r in series[sym]})
    # One pass per close. The same timestamp is on every symbol; replaying it
    # once per name walked that bar again after the entry and could stop the
    # position on prices from before the fill.
    times = sorted({t for book in by_close for t in book})
    # 120 daily bars is what the live runner keeps for the EMA50 filter.
    # The 4h buffer still truncates to WINDOW, matching the live 4h fetch.
    warm_from = trade_start - 120 * DAY
    times = [t for t in times if warm_from <= t < trade_end]
    equity = []
    checked = not check_labels
    t0 = time.time()
    for close_t in times:
        trading = trade_start <= close_t < trade_end
        for sym, book in zip(symbols, by_close):
            row = book.get(close_t)
            if row is None:
                continue
            apply_ohlc_path(ex, infos[sym], sym, row[1], row[2], row[3], row[4], None, row[0])
            if close_t % H8 == 0:
                ex.apply_funding(sym, FUNDING_RATE, float(row[4]), close_t)
            eng.on_bar_closed(sym, "4h", row, run_strategy=False)
            day = dailies[sym].get(close_t)
            if day is not None:
                eng.on_bar_closed(sym, "1d", day, run_strategy=False)
            h1 = (close_t - H1, row[1], row[2], row[3], row[4], row[5], close_t - 1)
            eng.on_bar_closed(sym, "1h", h1, run_strategy=False)
        if not trading:
            continue
        if sel is not None:
            _apply_labels(sel, labels, close_t)
        if not checked and close_t in labels["BTCUSDT"]:
            buf = eng.candles["BTCUSDT"]["4h"].arrays()
            direct = classify_series(buf["high"], buf["low"], buf["close"], buf["close_time"] + 1,
                                     params_from_cfg(cfg))
            want = labels["BTCUSDT"][close_t]["regime"]
            if direct["regime"] != want:
                raise RuntimeError(f"label mismatch at {close_t}: buffer {direct['regime']} precompute {want}")
            checked = True
        eng.begin_entries()
        try:
            for strat in specs:
                for sym, book in zip(symbols, by_close):
                    if close_t not in book:
                        continue
                    eng.run_strategy(sym, close_t, strat)
        finally:
            eng.end_entries()
        equity.append((close_t, ex.equity()))
    end_ts = trade_end - 1
    for sym, pos in list(ex.positions().items()):
        ex.place_order(Order(sym, "SELL" if pos.side > 0 else "BUY", "MARKET", pos.qty,
                             reduce_only=True, tag="END_OF_TEST"), end_ts)
    for tr in rec.trades:
        if tr["reason"] == "MARKET":
            tr["reason"] = "END_OF_TEST"
    equity.append((end_ts, ex.equity()))
    start_bal = cfg["account"]["starting_balance"]
    stats = _stats(rec.trades, equity, start_bal, ex.totals)
    stats["runtime_sec"] = round(time.time() - t0, 1)
    stats["demotions"] = sum(1 for e in rec.events if e.get("type") == "STRATEGY_DEMOTED")
    stats["ruin"] = ruin_probability(
        trade_returns(rec.trades, start_bal), start=start_bal,
        halt_dd=float(cfg["risk"]["max_drawdown"]), paths=4000, seed=0)
    if not checked:
        raise RuntimeError("never compared a precomputed label with the engine buffer")
    return stats


def _count_regimes(labels, start, end):
    rows = [v["regime"] for t, v in labels["BTCUSDT"].items() if start <= t < end]
    return {name: rows.count(name) for name in ("TREND", "RANGE", "CHAOS")}


def _load_symbol_set(klines, symbols):
    series, dailies = {}, {}
    for s in symbols:
        try:
            series[s] = load_4h(klines, s)
        except FileNotFoundError:
            return None, None, s
        dailies[s] = daily_bars(series[s])
        print(f"  {s}: {len(series[s])} 4h bars, {len(dailies[s])} daily", flush=True)
    return series, dailies, None


def _run_profile(base, profile_name, symbols, series, dailies, labels, start, end, margin, check_once):
    out = {}
    ema_stats = None
    for mode in MODES:
        cfg, key, trend, rng = _book_cfg(base, mode, symbols, profile_name)
        print(f"book {profile_name} {key} n={len(symbols)}", flush=True)
        check = check_once and mode == "flat"
        stats = run_book(cfg, mode, series, dailies, labels, start, end, check_labels=check)
        stats["name"] = key
        stats["trend_strategy"] = trend
        stats["range_strategy"] = rng
        stats["profile"] = profile_name
        stats["symbols"] = list(symbols)
        stats["period_start"] = datetime.fromtimestamp(start / 1000, timezone.utc).date().isoformat()
        stats["period_end"] = datetime.fromtimestamp((end - 1) / 1000, timezone.utc).date().isoformat()
        if mode == "ema":
            ema_stats = stats
        else:
            stats["old_rule_beats_ema"] = bool(oos_beats(ema_stats, stats, margin))
        out[key] = stats
        ruin = stats.get("ruin") or {}
        print(f"  return {stats['return_pct']}%  maxDD {stats.get('max_drawdown_pct')}%  "
              f"trades {stats['trades']}  p_ruin {ruin.get('p_ruin')}  p_halt {ruin.get('p_halt')}  "
              f"{stats['runtime_sec']}s", flush=True)
        if mode == "flat":
            check_once = False
    return out


def build_report(klines, out_path):
    logging.getLogger("engine").setLevel(logging.WARNING)
    base = load_config()
    params = params_from_cfg(base)
    margin = float(base["regime_selector"]["dd_margin_pp"])
    print("loading 5-coin 4h klines", flush=True)
    series, dailies, missing = _load_symbol_set(klines, SYMBOLS)
    if missing:
        raise FileNotFoundError(missing)
    print("folding trailing-420 regimes", flush=True)
    t0 = time.time()
    labels = {}
    for s in SYMBOLS:
        labels[s] = label_series(series[s], params)
        print(f"  {s}: {len(labels[s])} labels in {time.time() - t0:.0f}s", flush=True)
    oos_start = _ms(OOS_START)
    data_end = max(int(series[s][-1][6]) + 1 for s in SYMBOLS) + H4
    profiles = {}
    for name in ("aggressive", "conservative"):
        profiles[name] = _run_profile(
            base, name, SYMBOLS, series, dailies, labels, oos_start, data_end, margin,
            check_once=(name == "aggressive"))
    menu = [profiles["aggressive"][MODES[m][0]] for m in MODES if m != "ema"]
    decision = choose_menu(profiles["aggressive"]["ema_trend_4h"], menu)
    decision["profile"] = "aggressive"
    decision["symbols"] = list(SYMBOLS)
    decision["symbol_note"] = "5-coin book"
    # Wider book only for the configuration that would actually trade.
    wider = {"ran": False, "reason": "not run"}
    live_mode = "ema"
    if decision["enabled"]:
        for mode, (key, trend, rng, _on) in MODES.items():
            if (trend == decision["trend_strategy"] and (rng or None) == (decision["range_strategy"] or None)
                    and mode != "ema"):
                live_mode = mode
                break
    print("loading top-10 klines", flush=True)
    series10, dailies10, missing10 = _load_symbol_set(klines, TEN)
    if missing10:
        wider = {"ran": False, "reason": f"missing klines for {missing10}"}
    elif not os.path.exists(EXTRA_META):
        wider = {"ran": False, "reason": f"missing contract filters {EXTRA_META}"}
    else:
        labels10 = dict(labels)
        for s in TEN:
            if s not in labels10:
                labels10[s] = label_series(series10[s], params)
                print(f"  {s}: {len(labels10[s])} labels", flush=True)
        end10 = max(int(series10[s][-1][6]) + 1 for s in TEN) + H4
        cfg, key, trend, rng = _book_cfg(base, live_mode, TEN, "aggressive")
        print(f"book aggressive {key} n=10", flush=True)
        stats = run_book(cfg, live_mode, series10, dailies10, labels10, oos_start, end10, check_labels=False)
        stats["name"] = key + "_top10"
        stats["trend_strategy"] = trend
        stats["range_strategy"] = rng
        stats["symbols"] = list(TEN)
        narrow = (profiles["aggressive"][MODES[live_mode][0]] if live_mode != "ema"
                  else profiles["aggressive"]["ema_trend_4h"])
        take = adopt_wider_book(narrow, stats)
        wider = {"ran": True, "adopted": take, "compared_to": narrow["name"], "book": stats,
                 "reason": ("top-10 OOS return matched or beat the 5-coin book"
                            if take else "top-10 OOS return was lower, or the book was too thin")}
        if take:
            decision["symbols"] = list(TEN)
            decision["symbol_note"] = "top 10 by the live volume rank; OOS return matched or beat the 5"
        print(f"  top10 return {stats['return_pct']}% vs {narrow['return_pct']}%  adopt {take}", flush=True)
    report = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "oos_start": OOS_START,
        "symbols_5": SYMBOLS,
        "symbols_10": TEN,
        "window_bars": WINDOW,
        "dd_margin_pp": margin,
        "costs": {
            "taker_per_side": base["fees"]["taker"],
            "slippage_bps": base["execution"]["slippage_bps"],
            "spread_bps": base["backtest"]["spread_bps"],
            "funding_rate_per_8h": FUNDING_RATE,
            "note": "funding is a flat 0.01%/8h, longs pay; not the historical funding file",
        },
        "profiles": {k: {fld: v for fld, v in p.items() if fld != "name"} for k, p in PROFILES.items()},
        "btc_regime_bars_oos": _count_regimes(labels, oos_start, data_end),
        "decision": decision,
        "oos": profiles,
        "wider_universe": {k: v for k, v in wider.items() if k != "book"} | (
            {"book": wider["book"]} if wider.get("book") else {}),
        "rule": (
            "Enable the selector when the best precommitted regime-switched book "
            "(flat RANGE, Bollinger/RSI RANGE, short-EMA trend, or both) has OOS "
            "return >= ema_trend_4h-only on the aggressive profile, with at least 5 trades. "
            "Drawdown is not a gate. An equal return keeps the simpler book. "
            "The old return-and-2pp-drawdown rule is recorded as old_rule_beats_ema and is not the switch. "
            "The top-10 universe replaces the 5 only when its OOS return on the chosen book is at least as high. "
            "IS is not used. Ruin probabilities resample closed-trade returns with replacement."
        ),
    }
    # Drop the duplicated book from wider if it makes the JSON huge? Keep it. It's one book.
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    json.dump(report, open(out_path, "w"), indent=2)
    print("wrote", out_path, flush=True)
    print("decision", json.dumps(decision), flush=True)
    return report


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--klines", default="/tmp/regime-klines")
    p.add_argument("--out", default=os.path.join(ROOT, "reports", "regime_oos.json"))
    args = p.parse_args()
    # Half of the 1bp spread the live catch-up and the backtest both assume.
    assert HALF_SPREAD == 0.5e-4
    build_report(args.klines, args.out)


if __name__ == "__main__":
    main()

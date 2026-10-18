"""Backtester: replays historical 15m/1h klines + mark-price klines + real funding
history through the SAME PaperExchange / TradingEngine / RiskManager as live."""
import argparse
import csv
import json
import logging
import os
import time
from datetime import datetime, timezone

from .config import load_config, rpath
from .bootstrap import make_rest, load_market_meta
from .execution.paper import PaperExchange
from .execution.base import Order
from .engine import TradingEngine, kline_row
from .risk import RiskManager
from .storage import MemoryRecorder, TRADE_FIELDS
from .strategies import make_strategy
from .stats import compute_stats
from .rest import INTERVAL_MS

log = logging.getLogger("backtest")


def fetch_cached(cfg, rest, kind, sym, tf, start, end):
    d = rpath(cfg, "data/cache"); os.makedirs(d, exist_ok=True)
    fn = os.path.join(d, f"{kind}_{sym}_{tf}_{start}_{end}.json")
    if os.path.exists(fn):
        return json.load(open(fn))
    if kind == "klines":
        rows = rest.klines(sym, tf, start, end)
    elif kind == "mark":
        rows = rest.mark_klines(sym, tf, start, end)
    else:
        rows = rest.funding_history(sym, start, end)
    json.dump(rows, open(fn, "w"))
    return rows


def bar_path(o, h, l, c):
    """Intrabar price path heuristic: bullish bar O-L-H-C, bearish O-H-L-C."""
    return [o, l, h, c] if c >= o else [o, h, l, c]


def run_backtest(cfg, days=None, end_ms=None, out_dir=None, quiet=False):
    bt = cfg["backtest"]
    days = days or bt["days"]
    rest = make_rest(cfg)
    infos, brackets = load_market_meta(cfg, rest)
    strat = make_strategy(cfg)
    tf, step = strat.timeframe, INTERVAL_MS[strat.timeframe]
    if end_ms is None:
        end_ms = (rest.server_time() // step) * step          # last fully closed bar boundary
    start_ms = end_ms - days * 86_400_000
    warm_ms = start_ms - bt["warmup_days"] * 86_400_000
    data = {}
    for s in cfg["symbols"]:
        k = {tfx: [kline_row(r) for r in fetch_cached(cfg, rest, "klines", s, tfx, warm_ms, end_ms - 1)
                   if r[6] < end_ms] for tfx in strat.timeframes()}
        mk = {int(r[0]): (float(r[1]), float(r[2]), float(r[3]), float(r[4]))
              for r in fetch_cached(cfg, rest, "mark", s, tf, start_ms, end_ms - 1)}
        fr = fetch_cached(cfg, rest, "funding", s, "8h", start_ms, end_ms)
        data[s] = {"k": k, "mark": mk, "funding": sorted(fr, key=lambda x: x["fundingTime"])}
        if not quiet:
            print(f"  {s}: {len(k[tf])} {tf} bars, {len(mk)} mark bars, {len(fr)} funding events")

    fees = cfg["fees"]
    rec = MemoryRecorder()
    ex = PaperExchange(infos, brackets, cfg["account"]["starting_balance"], fees["maker"], fees["taker"],
                       cfg["execution"]["slippage_bps"], cfg["account"]["default_leverage"],
                       traverse_fill=True, listener=rec)
    risk = RiskManager(cfg, fees["taker"], cfg["execution"]["slippage_bps"])
    eng = TradingEngine(cfg, ex, strat, risk, infos, brackets, recorder=rec)
    logging.getLogger("engine").setLevel(logging.WARNING)

    idx = {s: {tfx: {r[0]: r for r in data[s]["k"][tfx]} for tfx in strat.timeframes()} for s in cfg["symbols"]}
    fptr = {s: 0 for s in cfg["symbols"]}
    times = sorted({r[0] for s in cfg["symbols"] for r in data[s]["k"][tf]})
    other_tfs = [x for x in strat.timeframes() if x != tf]
    equity = []
    spread = bt["spread_bps"] / 1e4
    t0 = time.time()
    for t in times:
        close_t = t + step
        trading = t >= start_ms
        for s in cfg["symbols"]:
            row = idx[s][tf].get(t)
            if row is None:
                continue
            si = infos[s]
            if trading:
                mo = data[s]["mark"].get(t)
                lp = bar_path(row[1], row[2], row[3], row[4])
                mp = bar_path(*mo) if mo else lp
                if mo and row[4] < row[1]:   # keep mark ordering consistent with last-price ordering
                    mp = [mo[0], mo[1], mo[2], mo[3]]
                elif mo:
                    mp = [mo[0], mo[2], mo[1], mo[3]]
                for i, (p, mk) in enumerate(zip(lp, mp)):
                    hs = max(si.tick_size / 2, p * spread / 2)
                    ex.update_market(s, t + i * step // 4 + (step - 1 if i == 3 else 0),
                                     bid=si.round_price(p - hs, "down"), ask=si.round_price(p + hs, "up"),
                                     last=p, mark=mk)
                # funding settlements inside (t, close_t]
                fl = data[s]["funding"]
                while fptr[s] < len(fl) and int(fl[fptr[s]]["fundingTime"]) <= close_t:
                    f = fl[fptr[s]]; fptr[s] += 1
                    ft = int(f["fundingTime"])
                    if ft <= t:
                        continue
                    mpx = float(f["markPrice"]) if f.get("markPrice") not in (None, "") else ex.mark(s)
                    ex.apply_funding(s, float(f["fundingRate"]), mpx, ft)
            for otf in other_tfs:
                ostep = INTERVAL_MS[otf]
                if close_t % ostep == 0:
                    orow = idx[s][otf].get(close_t - ostep)
                    if orow:
                        eng.on_bar_closed(s, otf, orow)
            eng.on_bar_closed(s, tf, row, run_strategy=trading)
        if trading:
            equity.append((close_t, ex.equity()))
    # close remaining positions at the end (marked to market with taker fee)
    for s, p in list(ex.positions().items()):
        ex.place_order(Order(s, "SELL" if p.side > 0 else "BUY", "MARKET", p.qty, reduce_only=True,
                             tag="END_OF_TEST"), end_ms)
    for tr in rec.trades:
        if tr["reason"] == "MARKET":
            tr["reason"] = "END_OF_TEST"
    equity.append((end_ms, ex.equity()))
    stats = compute_stats(rec.trades, equity, cfg["account"]["starting_balance"], ex.totals)
    stats.update({"strategy": strat.name, "symbols": cfg["symbols"],
                  "period_start": datetime.fromtimestamp(start_ms / 1000, timezone.utc).isoformat(),
                  "period_end": datetime.fromtimestamp(end_ms / 1000, timezone.utc).isoformat(),
                  "fees": cfg["fees"], "slippage_bps": cfg["execution"]["slippage_bps"],
                  "spread_bps": bt["spread_bps"], "risk_per_trade": cfg["risk"]["risk_per_trade"],
                  "runtime_sec": round(time.time() - t0, 1), "rest_base": rest.base,
                  "params": cfg["strategy"]["params"].get(strat.name, {})})
    out = out_dir or rpath(cfg, os.path.join(bt["out_dir"], f"backtest_{strat.name}_"
                                             f"{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"))
    write_outputs(out, stats, rec, equity, cfg)
    latest = rpath(cfg, os.path.join(bt["out_dir"], "latest"))
    if os.path.islink(latest) or os.path.exists(latest):
        os.remove(latest)
    os.symlink(os.path.abspath(out), latest)
    return stats, out


def _iso(ms):
    return datetime.fromtimestamp(ms / 1000, timezone.utc).strftime("%Y-%m-%d %H:%M")


def write_outputs(out, stats, rec, equity, cfg):
    os.makedirs(out, exist_ok=True)
    json.dump(stats, open(os.path.join(out, "summary.json"), "w"), indent=2, default=str)
    with open(os.path.join(out, "trades.csv"), "w", newline="") as fh:
        w = csv.DictWriter(fh, ["open_time", "close_time"] + TRADE_FIELDS)
        w.writeheader()
        for t in rec.trades:
            w.writerow({"open_time": _iso(t["open_ts"]), "close_time": _iso(t["close_ts"]),
                        **{k: (round(t[k], 6) if isinstance(t[k], float) else t[k]) for k in TRADE_FIELDS}})
    with open(os.path.join(out, "equity.csv"), "w", newline="") as fh:
        w = csv.writer(fh); w.writerow(["ts", "time", "equity"])
        for ts, e in equity:
            w.writerow([ts, _iso(ts), round(e, 4)])
    with open(os.path.join(out, "funding.csv"), "w", newline="") as fh:
        w = csv.DictWriter(fh, ["ts", "symbol", "rate", "mark", "qty", "amount"]); w.writeheader()
        for f in rec.funding:
            w.writerow(f)
    with open(os.path.join(out, "events.csv"), "w", newline="") as fh:
        w = csv.writer(fh); w.writerow(["time", "type", "symbol", "msg"])
        for e in rec.events:
            w.writerow([_iso(e["ts"]), e["type"], e.get("symbol", ""), e.get("msg", "")])
    plot_equity(equity, stats, os.path.join(out, "equity.png"))


def plot_equity(equity, stats, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import pandas as pd
    s = pd.Series([e for _, e in equity], index=pd.to_datetime([t for t, _ in equity], unit="ms"))
    dd = (s - s.cummax()) / s.cummax() * 100
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(12, 7), sharex=True, gridspec_kw={"height_ratios": [3, 1]})
    a1.plot(s.index, s.values, color="#2b8cff", lw=1.3)
    a1.axhline(stats["start_balance"], color="gray", ls="--", lw=0.8)
    a1.set_title(f"{stats.get('strategy')} | net {stats['net_pnl']:+.2f} USDT ({stats['return_pct']:+.2f}%) | "
                 f"trades {stats['trades']} | win {stats['win_rate_pct']}% | PF {stats['profit_factor']} | "
                 f"maxDD {stats.get('max_drawdown_pct', 0)}% | fees {stats['fees_paid']} | funding {stats['funding_net']}",
                 fontsize=9)
    a1.set_ylabel("Equity (USDT)"); a1.grid(alpha=0.3)
    a2.fill_between(dd.index, dd.values, 0, color="#e5484d", alpha=0.5)
    a2.set_ylabel("Drawdown %"); a2.grid(alpha=0.3)
    fig.tight_layout(); fig.savefig(path, dpi=110); plt.close(fig)


def main():
    ap = argparse.ArgumentParser(description="Backtest using the paper engine")
    ap.add_argument("--config", default=None)
    ap.add_argument("--days", type=int, default=None)
    ap.add_argument("--strategy", default=None)
    a = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    cfg = load_config(a.config)
    if a.strategy:
        cfg["strategy"]["name"] = a.strategy
    stats, out = run_backtest(cfg, days=a.days)
    print(json.dumps(stats, indent=2, default=str))
    print("Output:", out)


if __name__ == "__main__":
    main()

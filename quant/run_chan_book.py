"""Book-inspired CHAN candidates (strategies/chan_book.py) through the SAME Phase-1 pipeline as the live router:
walk-forward (parameters chosen on training data only) -> the last 20% held out and read once, same costs.

    python -m quant.run_chan_book --tf 5m        -> reports/chan-book-5m.json (+ the table printed)

Compared with the live router's own result on the same data (reports/backtest-<tf>.json).
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from .backtest.engine import simulate
from .backtest.walkforward import Component, evaluate, to_json
from .config import ROOT, load_config
from .data.loader import load_bars, load_funding
from .strategies import chan_book as B


def pf_edge(trades, a, b) -> float:
    net = [t.pnl_q / t.entry_px for t in trades if a <= t.entry_t < b]
    w, l = sum(x for x in net if x > 0), -sum(x for x in net if x < 0)
    return w / l if l > 0 else float("inf")


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--tf", default="5m")
    a = ap.parse_args(argv)
    cfg = load_config()
    ddir = (ROOT / cfg["data"]["dir"]).resolve()
    syms = cfg["universe"]
    bars = {s: load_bars(ddir, s, a.tf) for s in syms}
    fund = {s: load_funding(ddir, s) for s in syms}
    don_p, zmr_p = B.don_grid(a.tf), B.zmr_grid(a.tf)
    don_t = [[] for _ in don_p]; zmr_t = [[] for _ in zmr_p]
    for s in syms:
        for k, p in enumerate(don_p):
            don_t[k] += simulate(bars[s], B.don_signals(bars[s], p), cfg, "DON", fund[s])
        for k, p in enumerate(zmr_p):
            zmr_t[k] += simulate(bars[s], B.zmr_signals(bars[s], p), cfg, "ZMR", fund[s])
        print(f"  {s} done", flush=True)
    sets = {"DON_breakout": [Component("DON", don_p, don_t)],
            "ZMR_zscore": [Component("ZMR", zmr_p, zmr_t)],
            "BOOK_both": [Component("DON", don_p, don_t), Component("ZMR", zmr_p, zmr_t)]}
    out = {"tf": a.tf, "symbols": syms, "strategies": {}}
    for name, comps in sets.items():
        ev = evaluate(name, comps, bars, cfg, a.tf)
        j = json.loads(to_json(ev))
        hs, he = ev.holdout["period"]
        chosen = [c.trades[c.params.index(ev.chosen_final[c.name])] for c in comps]
        j["edge"]["holdout"]["profit_factor"] = pf_edge([t for ts in chosen for t in ts], hs, he + 1)
        out["strategies"][name] = j
        f, e = ev.holdout_fixed_risk, ev.edge["holdout"]
        print(f"{name}: {ev.verdict} | holdout edge n={e.get('n', 0)} net {e.get('net_bps', 0):.1f} bps (gross {e.get('gross_bps_before_costs', 0):.1f}, "
              f"costs {e.get('costs_bps', 0):.1f}), PF {j['edge']['holdout']['profit_factor']:.2f} | fixed-risk portfolio: "
              f"{f['n_trades']} trades, {f['return_pct']:.1f}%, PF {f['profit_factor']:.2f}, maxDD {f['max_dd']:.1%}, Sharpe {f['sharpe']:.2f} | "
              f"flags {[x.split(':')[0] for x in ev.flags]} | chosen {ev.chosen_final}", flush=True)
    p = ROOT / "reports" / f"chan-book-{a.tf}.json"
    p.write_text(json.dumps(out, indent=1, default=str))
    print("wrote", p)


if __name__ == "__main__":
    main()

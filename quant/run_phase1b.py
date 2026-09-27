"""Phase 1b: four more candidates through the SAME Phase-1 pipeline (walk-forward + untouched 20% holdout, the same
gates, the same cost model, the same risk manager). No gate is relaxed.

    python -m quant.run_phase1b                   (writes reports/PHASE1B_REPORT.md + phase1b.json)

  A. CHAN strategies on 1h and 4h bars (72 months, 10 coins; 4h aggregated UTC-aligned from the 1h archive)
  B. Maker-only entries (post-only limit at the signal close, one bar, fill only if traded THROUGH; a miss is no
     trade) on 5m, 1h, 4h — fill rate reported; stops/time exits stay market orders
  C. Pairs / cointegration (36 months: the index is built on 5m bars so its intra-bar extremes are real): rolling Johansen gate, spread z-score, both legs costed (1h and 4h; the three named
     pairs, and all 45 pairs of the 10 coins as a separate, more-looks evaluation)
  D. Extreme funding: take the side that receives funding after an extreme settlement (1h, the 40 pinned coins)
"""
from __future__ import annotations

import copy
import datetime as dt
import json
import time
from itertools import combinations
from pathlib import Path

import numpy as np

from . import run_backtest as RB
from .backtest import engine as ENG
from .backtest.walkforward import Component, evaluate, to_json
from .config import ROOT, deep_merge, load_config
from .data.loader import load_bars, load_funding
from .strategies import funding as FU
from .strategies import pairs as PA

FILLS = {"attempted": 0, "filled": 0}
_orig = ENG.simulate


def _sim(bars, sig, cfg, strategy, funding=None):
    out = _orig(bars, sig, cfg, strategy, funding)
    f = sig.info.get("fills")
    if f:
        FILLS["attempted"] += f["attempted"]; FILLS["filled"] += f["filled"]
        f["attempted"] = f["filled"] = 0
    return out


RB.simulate = _sim


def brief(ev) -> dict:
    h, e = ev.holdout, ev.edge
    return {"verdict": ev.verdict, "gate": ev.gate, "flags": ev.flags, "chosen": ev.chosen_final,
            "holdout": {k: h[k] for k in ("sharpe", "max_dd", "n_trades", "return_pct", "profit_factor", "win_rate", "fees", "funding", "slippage", "gross_pnl_before_costs")},
            "holdout_fixed_risk": {k: ev.holdout_fixed_risk[k] for k in ("sharpe", "max_dd", "n_trades", "return_pct")},
            "in_sample": {k: ev.in_sample.get(k) for k in ("sharpe", "n_trades", "return_pct", "deflated_sharpe_prob")},
            "wf_oos": ev.wf_oos, "edge": e}


def chan(cfg, tf, symbols, tag, out, log):
    FILLS["attempted"] = FILLS["filled"] = 0
    t0 = time.time()
    bars, comps, _ = RB.build(cfg, tf, symbols, log=lambda *a: None)
    for name, cs in comps.items():
        ev = evaluate(name, cs, bars, cfg, tf)
        key = f"{tag}/{name}"
        out[key] = brief(ev)
        log(f"  {key}: holdout Sharpe {ev.holdout['sharpe']:+.2f} DD {ev.holdout['max_dd']:.1%} trades {ev.holdout['n_trades']} "
            f"net {ev.edge['holdout'].get('net_bps', 0):+.1f} bps (gross {ev.edge['holdout'].get('gross_bps_before_costs', 0):+.1f}) -> {ev.verdict}")
    if FILLS["attempted"]:
        out[f"{tag}/maker_fill_rate"] = FILLS["filled"] / FILLS["attempted"]
        log(f"  {tag}: maker fill rate {FILLS['filled'] / FILLS['attempted']:.1%} of {FILLS['attempted']:,} post-only entries")
    log(f"  ({time.time() - t0:.0f}s)")


def pairs(cfg, tf, pair_list, tag, out, log):
    ddir = (ROOT / cfg["data"]["dir"]).resolve()
    grid = PA.grid(cfg)
    trades = [[] for _ in grid]
    bars, diag = {}, {}
    raw = {s: load_bars(ddir, s, "5m") for s in sorted({x for p in pair_list for x in p})}
    fund = {s: load_funding(ddir, s) for s in raw}
    for A, B in pair_list:
        name = f"{A}/{B}"
        ix, co = PA.pair_bars(raw[A], raw[B], tf, cfg, name)
        bm = float(np.nanmax(np.abs(co["beta"][co["ok"]]))) if co["ok"].any() else 1.0
        bm = min(max(bm, 0.1), PA.BETA_MAX)
        sb = lambda s: ENG.slip_base(s, cfg)
        pc = deep_merge(cfg, {"costs": {"taker_fee": cfg["costs"]["taker_fee"] * (1 + bm), "maker_fee": cfg["costs"]["maker_fee"] * (1 + bm),
                                        "slippage": {"base_bps": {"default": (sb(A) + bm * sb(B)) * 1e4}}}})
        pf = PA.pair_funding(fund[A], fund[B], bm)
        bars[name] = ix
        diag[name] = {"coint_share": float(co["ok"].mean()), "beta_max": bm, "beta_median": float(np.nanmedian(co["beta"]))}
        for k, p in enumerate(grid):
            trades[k] += ENG.simulate(ix, PA.signals(ix, co, p, pc), pc, "PAIRS", pf)
    ev = evaluate(tag, [Component("PAIRS", grid, trades)], bars, cfg, tf)
    out[tag] = brief(ev)
    out[tag]["pairs"] = diag
    log(f"  {tag}: {len(pair_list)} pairs, cointegrated {np.mean([d['coint_share'] for d in diag.values()]):.0%} of the time; "
        f"holdout Sharpe {ev.holdout['sharpe']:+.2f} DD {ev.holdout['max_dd']:.1%} trades {ev.holdout['n_trades']} "
        f"net {ev.edge['holdout'].get('net_bps', 0):+.1f} bps -> {ev.verdict}")


def funding(cfg, tf, symbols, tag, out, log):
    ddir = (ROOT / cfg["data"]["dir"]).resolve()
    grid = FU.grid(cfg)
    trades = [[] for _ in grid]
    bars = {}
    for s in symbols:
        b, f = load_bars(ddir, s, tf), load_funding(ddir, s)
        bars[s] = b
        for k, p in enumerate(grid):
            trades[k] += ENG.simulate(b, FU.signals(b, f, p), cfg, "FUND", f)
    ev = evaluate(tag, [Component("FUND", grid, trades)], bars, cfg, tf)
    out[tag] = brief(ev)
    log(f"  {tag}: holdout Sharpe {ev.holdout['sharpe']:+.2f} DD {ev.holdout['max_dd']:.1%} trades {ev.holdout['n_trades']} "
        f"net {ev.edge['holdout'].get('net_bps', 0):+.1f} bps (gross {ev.edge['holdout'].get('gross_bps_before_costs', 0):+.1f}) -> {ev.verdict}")


def main(argv=None):
    cfg = load_config()
    sym10 = cfg["universe"]
    out: dict = {}
    log = print
    T = time.time()
    log("A. CHAN on 1h / 4h (taker)")
    for tf in ("1h", "4h"):
        chan(cfg, tf, sym10, f"A_chan_{tf}", out, log)
    log("B. maker-only entries")
    mk = deep_merge(cfg, {"execution": {"entry": "maker"}})
    for tf in ("5m", "1h", "4h"):
        chan(mk, tf, sym10, f"B_maker_{tf}", out, log)
    log("C. pairs / cointegration")
    named = [tuple(p) for p in cfg["pairs"]["pairs_named"]]
    for tf in ("1h", "4h"):
        pairs(cfg, tf, named, f"C_pairs_named_{tf}", out, log)
    pairs(cfg, "1h", list(combinations(sym10, 2)), "C_pairs_all45_1h", out, log)
    log("D. extreme funding")
    ddir = (ROOT / cfg["data"]["dir"]).resolve()
    s40 = sorted(p.name.split("-funding")[0].replace("1000PEPE", "PEPE") for p in ddir.glob("*-funding.csv"))
    funding(cfg, "1h", s40, "D_funding_1h_40coins", out, log)
    res = {"generated_utc": dt.datetime.utcnow().isoformat(timespec="seconds"), "runtime_s": round(time.time() - T), "studies": out,
           "gates": cfg["gates"]["phase1"]}
    rp = ROOT / "reports"
    (rp / "phase1b.json").write_text(json.dumps(res, indent=1, default=lambda x: float(x) if isinstance(x, (np.floating, np.integer)) else str(x)))
    write_report(res, rp / "PHASE1B_REPORT.md")
    log(f"done in {res['runtime_s']}s")


def write_report(res, path):
    g = res["gates"]
    L = [f"# Phase 1b — four more candidates, same gates, same costs\n",
         f"Generated {res['generated_utc']} UTC. Gate (unchanged): holdout Sharpe > {g['min_sharpe']}, max DD < {g['max_drawdown']:.0%}, "
         f">= {g['min_trades']} holdout trades, and no DECAY / HOLDOUT_FLIP flag. Walk-forward + untouched 20% holdout read once; "
         "taker 0.05% / maker 0.02%, slippage base + 5% of the previous bar's range per market fill, real 8h funding.\n",
         "| study | verdict | holdout Sharpe | max DD | trades | return | gross bps | costs bps | net bps | WF-OOS Sharpe | in-sample DSR | flags |",
         "|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for k, v in res["studies"].items():
        if not isinstance(v, dict):
            continue
        h, e = v["holdout"], v["edge"].get("holdout", {})
        fl = "; ".join(f.split(":")[0] for f in v["flags"]) or "—"
        L.append(f"| {k} | **{v['verdict']}** | {h['sharpe']:+.2f} | {h['max_dd']:.1%} | {h['n_trades']} | {h['return_pct']:+.1f}% | "
                 f"{e.get('gross_bps_before_costs', 0):+.1f} | {e.get('costs_bps', 0):.1f} | {e.get('net_bps', 0):+.1f} | "
                 f"{v['wf_oos'].get('sharpe', 0):+.2f} | {v['in_sample'].get('deflated_sharpe_prob') or 0:.2f} | {fl} |")
    L.append("")
    for k, v in res["studies"].items():
        if not isinstance(v, dict):
            L.append(f"- {k}: **{v:.1%}**")
    L.append("\n(gross/costs/net bps = per-trade size-free edge of the raw signal on the holdout, all symbols, before portfolio limits.)\n")
    for k, v in res["studies"].items():
        if isinstance(v, dict) and "pairs" in v:
            L.append(f"\n### {k}: cointegration share of time and hedge ratio\n")
            L.append("| pair | cointegrated (Johansen 95%) | beta median | beta max (cost basis) |")
            L.append("|---|---|---|---|")
            for p, d in v["pairs"].items():
                L.append(f"| {p} | {d['coint_share']:.0%} | {d['beta_median']:.2f} | {d['beta_max']:.2f} |")
    open(path, "w", encoding="utf-8").write("\n".join(L) + "\n")


if __name__ == "__main__":
    main()

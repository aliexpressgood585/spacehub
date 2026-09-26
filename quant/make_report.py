"""Render reports/backtest-*.json into reports/BACKTEST_REPORT.md (per strategy, per timeframe, go/no-go)."""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

from .config import ROOT, load_config

NAMES = {"mean_reversion": "A. Mean reversion (ADF + Hurst gate, half-life look-back, z-score, optional scale-in)",
         "momentum": "B. Momentum (time-series momentum / breakout, significance-gated)",
         "regime_router": "C. Regime router (Hurst + volatility -> MR in mean-reverting regimes, momentum in trends, flat otherwise)"}


def d(ms):
    return dt.datetime.utcfromtimestamp(ms / 1000).strftime("%Y-%m-%d")


def pct(x):
    return f"{100 * x:.1f}%"


def row(label, h):
    pf = h["profit_factor"]
    pf = "inf" if pf == float("inf") else f"{pf:.2f}"
    return (f"| {label} | {h['net_pnl']:+,.0f} ({h['return_pct']:+.1f}%) | {h['sharpe']:.2f} | {h['sortino']:.2f} | {pct(h['max_dd'])} | "
            f"{pf} | {pct(h['win_rate'])} | {h['avg_trade']:+.2f} | {h['n_trades']} | {pct(h['exposure'])} | "
            f"{h['fees']:,.0f} / {h['slippage']:,.0f} / {h['funding']:+,.0f} |")


def render(cfg) -> str:
    g = cfg["gates"]["phase1"]
    out = ["# Phase 1 backtest report — Chan-style strategies on Binance USDT-M", "",
           f"Generated {dt.datetime.utcnow():%Y-%m-%d %H:%M} UTC from `quant/reports/backtest-*.json`.", "",
           f"**Gate (holdout, after all costs):** Sharpe > {g['min_sharpe']}, max drawdown < {pct(g['max_drawdown'])}, "
           f">= {g['min_trades']} trades, and no DECAY / HOLDOUT_FLIP overfit flag.", "",
           "Costs in every number: taker 0.05% / maker 0.02% per side, slippage 1 bp (BTC, ETH) or 3 bp + 5% of the previous "
           "bar's range per market fill, real 8h funding from the Binance archive. Signals on closed candles, fills at the "
           "next open, stop-first inside a bar. Sizing: half-Kelly on the strategy's own past trades, capped at 1% risk; "
           "3x max leverage; daily -3% stop; -10% drawdown kill; 5-loss stop.", ""]
    verdicts = []
    for tf in ("5m", "1m"):
        p = ROOT / "reports" / f"backtest-{tf}.json"
        if not p.exists():
            continue
        r = json.loads(p.read_text())
        out += [f"## Timeframe {tf} — {', '.join(r['symbols'])}", ""]
        for name, v in r["strategies"].items():
            ho = v["holdout"]
            verdicts.append((tf, name, v["verdict"]))
            out += [f"### {NAMES[name]} — {tf}: **{v['verdict']}**", "",
                    f"Holdout {d(ho['period'][0])} → {d(ho['period'][1])} (never used for any choice). "
                    f"Final parameters (chosen on the walk-forward region only): `{json.dumps(v['chosen_final'])}`", "",
                    "| run | net P&L | Sharpe | Sortino | max DD | PF | win rate | avg trade $ | trades | exposure | fees / slip / funding $ |",
                    "|---|---|---|---|---|---|---|---|---|---|---|",
                    row("in-sample (WF region, final params)", v["in_sample"]),
                    row("**HOLDOUT (gated)**", ho),
                    row("holdout at fixed 0.25% risk (Kelly off)", v["holdout_fixed_risk"]), ""]
            w = v["wf_oos"]
            if w:
                out.append(f"Walk-forward out-of-sample (stitched test windows, {w['folds']} folds): Sharpe {w['sharpe']:.2f}, "
                           f"{w['trades']} trades, compounded {w['compounded_return_pct']:+.1f}%, max DD {pct(w['max_dd'])}, "
                           f"{w['positive_folds']}/{w['folds']} folds positive.")
                out.append("")
            out += ["Raw signal edge (every signal of the final parameters, all coins, no portfolio limits):", "",
                    "| period | signals | gross before costs (bps) | costs (bps) | net (bps) | t-stat net | exits |", "|---|---|---|---|---|---|---|"]
            for k in ("in_sample", "holdout"):
                e = v["edge"][k]
                if e.get("n"):
                    out.append(f"| {k} | {e['n']} | {e['gross_bps_before_costs']:+.2f} | {e['costs_bps']:.2f} | {e['net_bps']:+.2f} | "
                               f"{e['t_stat_net']:.1f} | {', '.join(f'{a} {b}' for a, b in e['exits'].items() if b)} |")
            out.append("")
            gate = v["gate"]
            out.append("Gate: " + "; ".join(f"{k} {gate[k]['value']:.2f}{' ✓' if gate[k]['pass'] else ' ✗'}" if isinstance(gate[k]['value'], float)
                                            else f"{k} {gate[k]['value']}{' ✓' if gate[k]['pass'] else ' ✗'}" for k in gate))
            out.append("")
            if v["flags"]:
                out.append("Overfit / validity flags:")
                out += [f"- {f}" for f in v["flags"]]
                out.append("")
            sk = ho.get("skipped") or {}
            if sk:
                out.append("Holdout entries refused by the risk layer: " + ", ".join(f"{k}: {n}" for k, n in sk.items()))
                out.append("")
        dg = r["diagnostics"]
        mr = dg["mr_gate_active"]
        out += [f"Diagnostics {tf}: the mean-reversion stationarity gate (ADF p<0.05 AND Hurst<0.45 on the trailing window) was open "
                f"{pct(sum(mr.values()) / len(mr))} of the time on average; regime shares (mean over coins): " +
                ", ".join(f"{k} {pct(sum(x[k] for x in dg['regime_share'].values()) / len(dg['regime_share']))}"
                          for k in ("mean_revert", "trend", "high_vol", "neutral")), ""]
    out += ["## Verdict", "", "| timeframe | strategy | verdict |", "|---|---|---|"]
    out += [f"| {tf} | {n} | **{v}** |" for tf, n, v in verdicts]
    out.append("")
    return "\n".join(out)


def main():
    cfg = load_config()
    p = ROOT / "reports" / "BACKTEST_REPORT.md"
    p.write_text(render(cfg))
    print(f"wrote {p}")


if __name__ == "__main__":
    main()

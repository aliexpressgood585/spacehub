"""Writes reports/META_REPORT.md from the run_meta JSON (numbers only; no claim the JSON does not contain)."""
from __future__ import annotations


def _row(name, st):
    return (f"| {name} | {st['n']} | {st['avg_size']:.2f} | {st['gross_bps']:+.1f} | {st['cost_bps']:.1f} | {st['net_bps']:+.1f} | "
            f"{st['win_rate']:.1%} | {st['return_pct']:+.2f}% | {st['sharpe_ann']:+.2f} |")


def write_report(o: dict, path) -> None:
    g = o["gate"]
    L = []
    L.append(f"# CHAN vs CHAN + meta-labeling (AFML) — {o['tf']}, {len(o['symbols'])} coins\n")
    L.append(f"Generated {o['generated_utc']} UTC. Primary model = the CHAN regime router, parameters frozen by Phase 1: "
             f"`{o['router_params']}`.\n")
    L.append(f"## Verdict: **{g['verdict']}**\n")
    L.append(f"- selected on development (best mean CPCV path Sharpe): `{g['selected']}`")
    L.append(f"- beats plain CHAN on the holdout (Sharpe and return): **{g['beats_plain']}**")
    L.append(f"- Deflated Sharpe on the holdout: **{g['dsr_holdout']:.3f}** (gate > {g['min_dsr']}, N = {g['n_trials']} variants); "
             f"DSR of its development OOS series {g['dsr_dev_oos']:.3f}")
    L.append(f"- PBO (CSCV, {o['pbo']['n_combinations']} combinations): **{o['pbo']['pbo']:.2f}** (0.5 = selection no better than chance)\n")
    L.append("## Holdout (last 20%, read once), after fees, slippage and funding\n")
    L.append("| | trades | avg size | gross bps | costs bps | net bps | win | return (0.25% risk) | Sharpe |")
    L.append("|---|---|---|---|---|---|---|---|---|")
    L.append(_row("plain CHAN", g["holdout_plain"]))
    L.append(_row(f"meta `{g['selected']}`", g["holdout_meta"]))
    L.append("")
    L.append("## Development (first 80%): purged K-fold OOS and CPCV paths\n")
    L.append(f"Events: {o['events']['total']:,} candidate CHAN signals (dev {o['events']['dev']:,}, holdout {o['events']['holdout']:,}), "
             f"average uniqueness {o['events']['avg_uniqueness']:.3f}. OOS AUC per model config: "
             + ", ".join(f"{k} {v:.3f}" for k, v in o["oos_auc"].items()) + "\n")
    L.append("| variant | dev OOS trades | net bps | Sharpe (k-fold OOS) | CPCV mean / min path Sharpe | holdout net bps | holdout Sharpe |")
    L.append("|---|---|---|---|---|---|---|")
    p = o["plain"]
    L.append(f"| plain CHAN | {p['dev']['n']} | {p['dev']['net_bps']:+.1f} | {p['dev']['sharpe_ann']:+.2f} | — | {p['holdout']['net_bps']:+.1f} | {p['holdout']['sharpe_ann']:+.2f} |")
    for v, d in sorted(o["variants"].items(), key=lambda kv: -kv[1]["cpcv_mean_sharpe"]):
        L.append(f"| {v} | {d['dev_kfold_oos']['n']} | {d['dev_kfold_oos']['net_bps']:+.1f} | {d['dev_kfold_oos']['sharpe_ann']:+.2f} | "
                 f"{d['cpcv_mean_sharpe']:+.2f} / {d['cpcv_min_sharpe']:+.2f} | {d['holdout']['net_bps']:+.1f} | {d['holdout']['sharpe_ann']:+.2f} |")
    L.append("\nHoldout columns of NON-selected variants are shown for transparency only; nothing was chosen on them.\n")
    L.append("## Triple-barrier labels\n")
    L.append("| k (barrier = k × vol × √hold) | upper first | lower first | vertical | mean net return | meta=1 dev / holdout |")
    L.append("|---|---|---|---|---|---|")
    for k, d in o["labels"].items():
        L.append(f"| {k} | {d['tb_upper']:.1%} | {d['tb_lower']:.1%} | {d['tb_vertical']:.1%} | {d['mean_net_ret_bps']:+.1f} bps | "
                 f"{d['meta_positive_dev']:.1%} / {d['meta_positive_holdout']:.1%} |")
    L.append("\n## Why trades are taken: feature importance of the selected model\n")
    L.append("MDA = drop in out-of-sample log-loss when the feature is shuffled (purged folds); > 0 means it helps OOS. "
             "MDI = in-sample impurity share (biased toward noisy continuous features).\n")
    L.append("| feature | MDA mean | MDA std | MDI |")
    L.append("|---|---|---|---|")
    imp = o["importance"]
    for f, d in sorted(imp["mda_purged_kfold"].items(), key=lambda kv: -kv[1]["mean"]):
        L.append(f"| {f} | {d['mean']:+.5f} | {d['std']:.5f} | {imp['mdi_rf_in_sample'].get(f, 0):.3f} |")
    if "bars_study" in o:
        L.append("\n## Time vs volume vs dollar bars (from 1m, same bar count, plain CHAN router, no selection)\n")
        L.append("| bars | median Jarque-Bera | median abs lag-1 autocorr | median excess kurtosis | router trades | gross bps | costs bps | net bps | t(net) |")
        L.append("|---|---|---|---|---|---|---|---|---|")
        for k, d in o["bars_study"].items():
            L.append(f"| {k} | {d['median_jarque_bera']:,.0f} | {d['median_abs_lag1_autocorr']:.3f} | {d['median_excess_kurtosis']:.1f} | "
                     f"{d['router_trades']} | {d['router_gross_bps']:+.1f} | {d['router_cost_bps']:.1f} | {d['router_net_bps']:+.1f} | {d['router_t_net']:+.2f} |")
    L.append(f"\nFFD d per coin (smallest d with ADF p < 0.05 on the development period): "
             + ", ".join(f"{k} {v:.1f}" for k, v in o["ffd_d"].items()) + "\n")
    open(path, "w", encoding="utf-8").write("\n".join(L) + "\n")

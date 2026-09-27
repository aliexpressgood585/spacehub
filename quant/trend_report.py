"""Writes reports/TREND_REPORT.md from run_trend's JSON (numbers only)."""
from __future__ import annotations


def _r(n, s):
    return (f"| {n} | {s['sharpe']:+.2f} | {s['return_pct']:+.1f}% | {s['max_dd']:.1%} | {s['n_trades']} | {s['win_rate']:.0%} | "
            f"{s['avg_r']:+.2f} | {s['profit_factor']:.2f} | {'yes' if s['killed'] else '—'} |")


def write(o: dict, path) -> None:
    L = [f"# Trend sleeve (Clenow-style daily trend following) — {o['verdict']}\n",
         f"Generated {o['generated_utc']} UTC. Universe: {o['symbols_total']} USDT perpetuals ever listed on Binance "
         f"(delisted included); {o['ever_in_universe']} ever entered the monthly top-40; real funding archives for "
         f"{o['funding_archives']} of them. Usable {o['usable_from']} → {o['to']}; holdout (read once) from {o['holdout_from']}. "
         f"Variants tried: **{o['n_variants']}** (all in config; N for the deflated Sharpe).\n",
         "## Gate (unchanged)\n", "| check | pass |", "|---|---|"]
    L += [f"| {k} | {'✅' if v else '❌'} |" for k, v in o["gate"].items()]
    h = o["holdout"]
    L += ["", f"Selected on development: **{o['selected']}**. Deflated Sharpe: dev {o['dsr_dev']:.2f}, holdout {o['dsr_holdout']:.2f}. "
          f"PBO {o['pbo']['pbo']:.2f}. Flags: {', '.join(o['flags']) or '—'}.\n",
          "## Holdout (selected), after fees, slippage and funding\n",
          "| | Sharpe | return | max DD | trades | win | avg R | PF | kill |", "|---|---|---|---|---|---|---|---|---|",
          _r(o["selected"], h),
          f"\nCosts on the holdout: fees ${h['fees']:.0f}, slippage ${h['slippage']:.0f}, funding ${h['funding']:.0f}; gross before costs ${h['gross_before_costs']:.0f} (on $10,000).",
          "Cost stress (same holdout): " + ", ".join(f"slippage {k}: Sharpe {v['sharpe']:+.2f}, return {v['return_pct']:+.1f}%" for k, v in o["cost_stress"].items()) + "\n",
          "## Development (first 80%), every variant\n",
          "| variant | Sharpe | return | max DD | trades | win | avg R | PF | kill |", "|---|---|---|---|---|---|---|---|---|"]
    L += [_r(n, s) for n, s in o["dev"].items()]
    w = o["wf_oos"]
    L += [f"\n## Walk-forward inside development (train 2y → test 6m)\n",
          f"Stitched OOS: Sharpe {w['sharpe']:+.2f}, return {w['return_pct']:+.1f}%, max DD {w['max_dd']:.1%}, **{w['trades']} OOS trades**.\n",
          "| train window | chosen | train Sharpe | test Sharpe | test return | test trades |", "|---|---|---|---|---|---|"]
    L += [f"| {f['train'][0]} → {f['train'][1]} | {f['chosen']} | {f['train_sharpe']:+.2f} | {f['test_sharpe']:+.2f} | {f['test_return_pct']:+.1f}% | {f['test_trades']} |" for f in w["folds"]]
    L += ["\n## Holdout, every variant (transparency only — nothing was chosen on these)\n",
          "| variant | Sharpe | return | max DD | trades | win | avg R | PF | kill |", "|---|---|---|---|---|---|---|---|---|"]
    L += [_r(n, s) for n, s in o["holdout_all_variants"].items()]
    c = o["combined"]
    L += [f"\n## CHAN + trend on separate capital ({1 - c['capital_share_trend']:.0%} / {c['capital_share_trend']:.0%} of $10,000), {c['span'][0]} → {c['span'][1]}\n",
          f"Correlation of daily returns CHAN vs trend: **{c['correlation_daily']:+.2f}**. Portfolio kill (10% across both): {c['portfolio_kill'] or 'not triggered'}.\n",
          "| | P&L | Sharpe | max DD | trades |", "|---|---|---|---|---|",
          f"| CHAN sleeve alone | ${c['chan_alone']['pnl']:+,.0f} | {c['chan_alone']['sharpe']:+.2f} | {c['chan_alone']['max_dd']:.1%} | {c['chan_alone']['trades']} |",
          f"| trend sleeve alone | ${c['trend_alone']['pnl']:+,.0f} | {c['trend_alone']['sharpe']:+.2f} | {c['trend_alone']['max_dd']:.1%} | {c['trend_alone']['trades']} |",
          f"| combined, full span | ${c['combined_full']['chan_pnl'] + c['combined_full']['trend_pnl']:+,.0f} (CHAN ${c['combined_full']['chan_pnl']:+,.0f} / trend ${c['combined_full']['trend_pnl']:+,.0f}) | {c['combined_full']['sharpe']:+.2f} | {c['combined_full']['max_dd']:.1%} | |",
          f"| combined, CHAN's holdout only | ${c['combined_chan_holdout']['chan_pnl'] + c['combined_chan_holdout']['trend_pnl']:+,.0f} (CHAN ${c['combined_chan_holdout']['chan_pnl']:+,.0f} / trend ${c['combined_chan_holdout']['trend_pnl']:+,.0f}) | {c['combined_chan_holdout']['sharpe']:+.2f} | {c['combined_chan_holdout']['max_dd']:.1%} | |",
          f"\n{c['note']}\n"]
    if "kill_dates" in c:
        L.append(f"Both sleeves were halted by their OWN kill switches early in this span (CHAN {c['kill_dates']['chan']}, trend {c['kill_dates']['trend']}), which is why the CHAN-holdout row is flat. The next table shows the two engines with the kills off.\n")
    if "combined_no_kill_info" in o:
        k = o["combined_no_kill_info"]
        L += ["## Information only: CHAN + trend with every kill switch OFF (NOT a gate input)\n",
              f"Correlation of daily returns: **{k['correlation_daily']:+.2f}**. CHAN Sharpe {k['chan_sharpe']:+.2f} ({k['chan_trades']} trades), trend Sharpe {k['trend_sharpe']:+.2f} ({k['trend_trades']} trades).\n",
              "| span | CHAN P&L | trend P&L | combined return | combined Sharpe | combined max DD |", "|---|---|---|---|---|---|"]
        for lab, key in (("full 36 months", "full"), ("CHAN's holdout", "chan_holdout")):
            x = k[key]
            L.append(f"| {lab} | ${x['chan_pnl']:+,.0f} | ${x['trend_pnl']:+,.0f} | {x['return_pct']:+.1f}% | {x['sharpe']:+.2f} | {x['max_dd']:.1%} |")
        L.append("")
    if "info_no_kill" in o:
        L += ["## Information only: the same variants with the 15% sleeve kill switch OFF (NOT used for the gate)\n",
              "Every development run above hit the kill and then sat flat, so this checks whether the kill is what makes it look bad. It is not:\n",
              "| variant | dev Sharpe | dev return | dev max DD | dev trades | holdout Sharpe | holdout return | holdout DD | holdout trades |",
              "|---|---|---|---|---|---|---|---|---|"]
        for n, d in o["info_no_kill"].items():
            a, b = d["dev"], d["holdout"]
            L.append(f"| {n} | {a['sharpe']:+.2f} | {a['return_pct']:+.1f}% | {a['max_dd']:.1%} | {a['n_trades']} | {b['sharpe']:+.2f} | {b['return_pct']:+.1f}% | {b['max_dd']:.1%} | {b['n_trades']} |")
    open(path, "w", encoding="utf-8").write("\n".join(L) + "\n")

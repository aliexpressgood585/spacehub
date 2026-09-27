# Trend sleeve (Clenow-style daily trend following) — NO-GO

Generated 2026-09-27T04:48:47 UTC. Universe: 806 USDT perpetuals ever listed on Binance (delisted included); 286 ever entered the monthly top-40; real funding archives for 286 of them. Usable 2020-07-18 → 2026-08-31; holdout (read once) from 2025-06-10. Variants tried: **6** (all in config; N for the deflated Sharpe).

## Gate (unchanged)

| check | pass |
|---|---|
| holdout_sharpe>1.5 | ✅ |
| max_dd<15% | ❌ |
| trades>=200 | ❌ |
| dsr_dev>=0.95 | ❌ |
| pbo<0.5 | ✅ |
| no_decay_or_flip | ❌ |

Selected on development: **momentum20_long**. Deflated Sharpe: dev 0.65, holdout 0.21. PBO 0.05. Flags: DECAY: WF-OOS Sharpe -0.27 vs mean in-sample 0.65, HOLDOUT_FLIP, UNSTABLE: the chosen variant changed in most folds.

## Holdout (selected), after fees, slippage and funding

| | Sharpe | return | max DD | trades | win | avg R | PF | kill |
|---|---|---|---|---|---|---|---|---|
| momentum20_long | -0.18 | -5.0% | 19.4% | 86 | 30% | -0.08 | 0.73 | yes |

Costs on the holdout: fees $25, slippage $21, funding $25; gross before costs $-432 (on $10,000).
Cost stress (same holdout): slippage x2.0: Sharpe -0.19, return -5.2%, slippage x5.0: Sharpe +0.04, return -0.7%

## Development (first 80%), every variant

| variant | Sharpe | return | max DD | trades | win | avg R | PF | kill |
|---|---|---|---|---|---|---|---|---|
| breakout_long | +0.19 | +7.8% | 15.1% | 125 | 29% | +0.13 | 1.17 | yes |
| breakout_ls | +0.15 | +5.7% | 15.4% | 142 | 27% | +0.09 | 1.12 | yes |
| momentum10_long | +0.49 | +30.2% | 15.2% | 239 | 38% | +0.19 | 1.55 | yes |
| momentum10_ls | -0.42 | -11.6% | 16.5% | 90 | 21% | -0.22 | 0.56 | yes |
| momentum20_long | +0.71 | +64.6% | 15.2% | 184 | 40% | +0.52 | 2.41 | yes |
| momentum20_ls | -0.16 | -7.0% | 15.2% | 77 | 29% | -0.15 | 0.66 | yes |

## Walk-forward inside development (train 2y → test 6m)

Stitched OOS: Sharpe -0.27, return -14.4%, max DD 23.2%, **469 OOS trades**.

| train window | chosen | train Sharpe | test Sharpe | test return | test trades |
|---|---|---|---|---|---|
| 2020-07-18 → 2022-07-18 | momentum20_long | +1.12 | -1.42 | -0.2% | 0 |
| 2021-01-16 → 2023-01-16 | momentum20_ls | +0.99 | -0.34 | -6.0% | 161 |
| 2021-07-17 → 2023-07-17 | momentum10_ls | +0.40 | +0.90 | +7.7% | 101 |
| 2022-01-15 → 2024-01-15 | momentum20_ls | +0.69 | -0.59 | -6.4% | 115 |
| 2022-07-16 → 2024-07-15 | momentum10_ls | +0.07 | -1.72 | -9.5% | 92 |

## Holdout, every variant (transparency only — nothing was chosen on these)

| variant | Sharpe | return | max DD | trades | win | avg R | PF | kill |
|---|---|---|---|---|---|---|---|---|
| breakout_long | -0.53 | -3.7% | 6.9% | 23 | 35% | -0.30 | 0.37 | — |
| breakout_ls | -0.13 | -3.8% | 13.9% | 112 | 47% | -0.06 | 0.74 | — |
| momentum10_long | +0.05 | -0.1% | 13.0% | 63 | 35% | +0.01 | 0.98 | — |
| momentum10_ls | +0.62 | +11.0% | 8.8% | 232 | 42% | +0.07 | 1.21 | — |
| momentum20_long | -0.18 | -5.0% | 19.4% | 86 | 30% | -0.08 | 0.73 | yes |
| momentum20_ls | -0.52 | -7.6% | 16.6% | 152 | 32% | -0.08 | 0.76 | yes |

## CHAN + trend on separate capital (50% / 50% of $10,000), 2023-09-03 → 2026-08-31

Correlation of daily returns CHAN vs trend: **-0.00**. Portfolio kill (10% across both): not triggered.

| | P&L | Sharpe | max DD | trades |
|---|---|---|---|---|
| CHAN sleeve alone | $+15 | +0.05 | 10.0% | 73 |
| trend sleeve alone | $+879 | +0.54 | 16.2% | 80 |
| combined, full span | $+894 (CHAN $+15 / trend $+879) | +0.45 | 9.5% | |
| combined, CHAN's holdout only | $+0 (CHAN $+0 / trend $+0) | +0.00 | 0.0% | |

CHAN's parameters were chosen on its own first 80% (Phase 1), so the part of this span before 2026-01-24 is in-sample for CHAN; the trend variant was chosen on its own development period.

Both sleeves were halted by their OWN kill switches early in this span (CHAN 2023-10-12, trend 2024-01-22), which is why the CHAN-holdout row is flat. The next table shows the two engines with the kills off.

## Information only: CHAN + trend with every kill switch OFF (NOT a gate input)

Correlation of daily returns: **+0.01**. CHAN Sharpe -0.69 (142 trades), trend Sharpe -0.13 (428 trades).

| span | CHAN P&L | trend P&L | combined return | combined Sharpe | combined max DD |
|---|---|---|---|---|---|
| full 36 months | $-760 | $-739 | -15.0% | -0.37 | 27.9% |
| CHAN's holdout | $-578 | $+32 | -6.0% | -2.47 | 6.7% |

## Information only: the same variants with the 15% sleeve kill switch OFF (NOT used for the gate)

Every development run above hit the kill and then sat flat, so this checks whether the kill is what makes it look bad. It is not:

| variant | dev Sharpe | dev return | dev max DD | dev trades | holdout Sharpe | holdout return | holdout DD | holdout trades |
|---|---|---|---|---|---|---|---|---|
| breakout_long | +0.18 | +8.1% | 20.0% | 236 | -0.53 | -3.7% | 6.9% | 23 |
| breakout_ls | +0.10 | +0.2% | 27.0% | 457 | -0.13 | -3.8% | 13.9% | 112 |
| momentum10_long | +0.17 | +7.3% | 31.7% | 490 | +0.05 | -0.1% | 13.0% | 63 |
| momentum10_ls | +0.18 | +8.6% | 28.5% | 1031 | +0.62 | +11.0% | 8.8% | 232 |
| momentum20_long | +0.29 | +22.6% | 39.2% | 748 | -0.27 | -6.8% | 22.0% | 94 |
| momentum20_ls | +0.26 | +17.3% | 41.2% | 1522 | +0.58 | +15.6% | 16.6% | 337 |

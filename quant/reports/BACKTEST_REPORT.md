# Phase 1 backtest report — Chan-style strategies on Binance USDT-M

Generated 2026-09-26 23:22 UTC from `quant/reports/backtest-*.json`.

**Gate (holdout, after all costs):** Sharpe > 1.5, max drawdown < 15.0%, >= 200 trades, and no DECAY / HOLDOUT_FLIP overfit flag.

Costs in every number: taker 0.05% / maker 0.02% per side, slippage 1 bp (BTC, ETH) or 3 bp + 5% of the previous bar's range per market fill, real 8h funding from the Binance archive. Signals on closed candles, fills at the next open, stop-first inside a bar. Sizing: half-Kelly on the strategy's own past trades, capped at 1% risk; 3x max leverage; daily -3% stop; -10% drawdown kill; 5-loss stop.

## Timeframe 5m — BTC, ETH, SOL, BNB, XRP, DOGE, ADA, AVAX, LINK, DOT

### A. Mean reversion (ADF + Hurst gate, half-life look-back, z-score, optional scale-in) — 5m: **NO-GO**

Holdout 2026-01-24 → 2026-08-31 (never used for any choice). Final parameters (chosen on the walk-forward region only): `{"MR": {"entry_z": 2.0, "exit_z": 0.0, "stop_z": 3.5, "scale_in": true}}`

| run | net P&L | Sharpe | Sortino | max DD | PF | win rate | avg trade $ | trades | exposure | fees / slip / funding $ |
|---|---|---|---|---|---|---|---|---|---|---|
| in-sample (WF region, final params) | -8 (-0.1%) | -0.07 | -0.09 | 0.5% | 0.94 | 56.7% | -0.26 | 30 | 0.1% | 41 / 33 / -1 |
| **HOLDOUT (gated)** | +0 (+0.0%) | 0.00 | 0.00 | 0.0% | 0.00 | 0.0% | +0.00 | 0 | 0.0% | 0 / 0 / +0 |
| holdout at fixed 0.25% risk (Kelly off) | -851 (-8.5%) | -4.07 | -4.01 | 8.7% | 0.31 | 29.6% | -6.30 | 135 | 3.4% | 232 / 198 / -0 |

Walk-forward out-of-sample (stitched test windows, 11 folds): Sharpe 0.00, 0 trades, compounded +0.0%, max DD 0.0%, 0/11 folds positive.

Raw signal edge (every signal of the final parameters, all coins, no portfolio limits):

| period | signals | gross before costs (bps) | costs (bps) | net (bps) | t-stat net | exits |
|---|---|---|---|---|---|---|
| in_sample | 1981 | -2.11 | 9.17 | -11.28 | -10.2 | STOP 1163, SIGNAL 818 |
| holdout | 414 | -3.09 | 9.22 | -12.31 | -5.9 | STOP 238, SIGNAL 176 |

Gate: sharpe 0.00 ✗; max_dd 0.00 ✓; trades 0 ✗

Overfit / validity flags:
- NO_EDGE_IN_SAMPLE: even the best in-sample parameter sets average Sharpe -0.80
- UNSTABLE: chosen parameters changed in 8 of 10 fold transitions
- DEFLATED: probability the in-sample winner beats 12 null trials = 0.17 (< 0.95)

Holdout entries refused by the risk layer: half-Kelly <= 0 (no positive edge in the strategy's own record): 414

### B. Momentum (time-series momentum / breakout, significance-gated) — 5m: **NO-GO**

Holdout 2026-01-24 → 2026-08-31 (never used for any choice). Final parameters (chosen on the walk-forward region only): `{"MOM": {"kind": "tsmom", "lookback": 12, "hold": 48}}`

| run | net P&L | Sharpe | Sortino | max DD | PF | win rate | avg trade $ | trades | exposure | fees / slip / funding $ |
|---|---|---|---|---|---|---|---|---|---|---|
| in-sample (WF region, final params) | -9 (-0.1%) | -0.05 | -0.07 | 0.9% | 0.98 | 36.7% | -0.31 | 30 | 0.3% | 37 / 64 / -1 |
| **HOLDOUT (gated)** | +0 (+0.0%) | 0.00 | 0.00 | 0.0% | 0.00 | 0.0% | +0.00 | 0 | 0.0% | 0 / 0 / +0 |
| holdout at fixed 0.25% risk (Kelly off) | +127 (+1.3%) | 0.22 | 0.50 | 8.9% | 1.04 | 36.3% | +0.70 | 182 | 5.6% | 599 / 563 / +0 |

Walk-forward out-of-sample (stitched test windows, 11 folds): Sharpe -1.05, 73 trades, compounded -10.4%, max DD 11.8%, 0/11 folds positive.

Raw signal edge (every signal of the final parameters, all coins, no portfolio limits):

| period | signals | gross before costs (bps) | costs (bps) | net (bps) | t-stat net | exits |
|---|---|---|---|---|---|---|
| in_sample | 2283 | +3.84 | 20.24 | -16.40 | -4.6 | STOP 1483, TIMEOUT 800 |
| holdout | 318 | +0.02 | 20.51 | -20.50 | -2.8 | STOP 199, TIMEOUT 119 |

Gate: sharpe 0.00 ✗; max_dd 0.00 ✓; trades 0 ✗

Overfit / validity flags:
- DECAY: WF-OOS Sharpe -1.05 vs mean in-sample 0.54
- UNSTABLE: chosen parameters changed in 9 of 10 fold transitions
- DEFLATED: probability the in-sample winner beats 12 null trials = 0.21 (< 0.95)

Holdout entries refused by the risk layer: half-Kelly <= 0 (no positive edge in the strategy's own record): 318

### C. Regime router (Hurst + volatility -> MR in mean-reverting regimes, momentum in trends, flat otherwise) — 5m: **NO-GO**

Holdout 2026-01-24 → 2026-08-31 (never used for any choice). Final parameters (chosen on the walk-forward region only): `{"RG_MR": {"entry_z": 2.5, "exit_z": 0.0, "stop_z": 3.5, "scale_in": false}, "RG_MOM": {"kind": "breakout", "lookback": 144, "hold": 12}}`

| run | net P&L | Sharpe | Sortino | max DD | PF | win rate | avg trade $ | trades | exposure | fees / slip / funding $ |
|---|---|---|---|---|---|---|---|---|---|---|
| in-sample (WF region, final params) | +30 (+0.3%) | 0.05 | 0.07 | 10.0% | 1.01 | 45.2% | +0.41 | 73 | 0.9% | 744 / 678 / +3 |
| **HOLDOUT (gated)** | -1,031 (-10.3%) | -2.88 | -2.86 | 10.3% | 0.20 | 26.3% | -54.26 | 19 | 0.3% | 186 / 230 / +0 |
| holdout at fixed 0.25% risk (Kelly off) | -920 (-9.2%) | -2.85 | -2.95 | 10.0% | 0.51 | 25.0% | -10.00 | 92 | 2.7% | 283 / 298 / -5 |

Walk-forward out-of-sample (stitched test windows, 11 folds): Sharpe -0.90, 31 trades, compounded -5.7%, max DD 6.1%, 0/11 folds positive.

Raw signal edge (every signal of the final parameters, all coins, no portfolio limits):

| period | signals | gross before costs (bps) | costs (bps) | net (bps) | t-stat net | exits |
|---|---|---|---|---|---|---|
| in_sample | 2386 | -1.00 | 20.94 | -21.94 | -7.6 | STOP 1675, SIGNAL 689, TIMEOUT 22 |
| holdout | 601 | -9.43 | 19.81 | -29.24 | -6.3 | STOP 424, SIGNAL 165, TIMEOUT 12 |

Gate: sharpe -2.88 ✗; max_dd 0.10 ✓; trades 19 ✗

Overfit / validity flags:
- NO_EDGE_IN_SAMPLE: even the best in-sample parameter sets average Sharpe -0.56
- UNSTABLE: chosen parameters changed in 9 of 10 fold transitions
- DEFLATED: probability the in-sample winner beats 24 null trials = 0.06 (< 0.95)
- HOLDOUT_FLIP: positive in-sample, negative on the untouched holdout

Holdout entries refused by the risk layer: half-Kelly <= 0 (no positive edge in the strategy's own record): 559, halted: 23

Diagnostics 5m: the mean-reversion stationarity gate (ADF p<0.05 AND Hurst<0.45 on the trailing window) was open 5.2% of the time on average; regime shares (mean over coins): mean_revert 22.6%, trend 3.2%, high_vol 12.7%, neutral 61.5%

## Timeframe 1m — BTC, ETH, SOL, BNB, XRP, DOGE, ADA, AVAX, LINK, DOT

### A. Mean reversion (ADF + Hurst gate, half-life look-back, z-score, optional scale-in) — 1m: **NO-GO**

Holdout 2026-06-19 → 2026-08-31 (never used for any choice). Final parameters (chosen on the walk-forward region only): `{"MR": {"entry_z": 2.0, "exit_z": 0.5, "stop_z": 3.5, "scale_in": true}}`

| run | net P&L | Sharpe | Sortino | max DD | PF | win rate | avg trade $ | trades | exposure | fees / slip / funding $ |
|---|---|---|---|---|---|---|---|---|---|---|
| in-sample (WF region, final params) | -66 (-0.7%) | -0.95 | -0.96 | 0.9% | 0.54 | 53.3% | -2.21 | 30 | 0.2% | 57 / 33 / -0 |
| **HOLDOUT (gated)** | +0 (+0.0%) | 0.00 | 0.00 | 0.0% | 0.00 | 0.0% | +0.00 | 0 | 0.0% | 0 / 0 / +0 |
| holdout at fixed 0.25% risk (Kelly off) | -439 (-4.4%) | -7.76 | -7.42 | 4.4% | 0.56 | 46.9% | -2.28 | 192 | 3.4% | 316 / 240 / -0 |

Walk-forward out-of-sample (stitched test windows, 6 folds): Sharpe -1.42, 1 trades, compounded -0.3%, max DD 0.3%, 0/6 folds positive.

Raw signal edge (every signal of the final parameters, all coins, no portfolio limits):

| period | signals | gross before costs (bps) | costs (bps) | net (bps) | t-stat net | exits |
|---|---|---|---|---|---|---|
| in_sample | 993 | -0.29 | 7.89 | -8.18 | -8.1 | STOP 452, SIGNAL 541 |
| holdout | 294 | +3.99 | 7.26 | -3.27 | -2.2 | STOP 113, SIGNAL 181 |

Gate: sharpe 0.00 ✗; max_dd 0.00 ✓; trades 0 ✗

Overfit / validity flags:
- NO_EDGE_IN_SAMPLE: even the best in-sample parameter sets average Sharpe -1.06
- UNSTABLE: chosen parameters changed in 5 of 5 fold transitions
- DEFLATED: probability the in-sample winner beats 12 null trials = 0.01 (< 0.95)

Holdout entries refused by the risk layer: half-Kelly <= 0 (no positive edge in the strategy's own record): 294

### B. Momentum (time-series momentum / breakout, significance-gated) — 1m: **NO-GO**

Holdout 2026-06-19 → 2026-08-31 (never used for any choice). Final parameters (chosen on the walk-forward region only): `{"MOM": {"kind": "tsmom", "lookback": 48, "hold": 48}}`

| run | net P&L | Sharpe | Sortino | max DD | PF | win rate | avg trade $ | trades | exposure | fees / slip / funding $ |
|---|---|---|---|---|---|---|---|---|---|---|
| in-sample (WF region, final params) | -622 (-6.2%) | -0.60 | -0.83 | 10.4% | 0.77 | 38.8% | -9.28 | 67 | 0.4% | 700 / 466 / +1 |
| **HOLDOUT (gated)** | +0 (+0.0%) | 0.00 | 0.00 | 0.0% | 0.00 | 0.0% | +0.00 | 0 | 0.0% | 0 / 0 / +0 |
| holdout at fixed 0.25% risk (Kelly off) | -41 (-0.4%) | -0.24 | -0.43 | 3.2% | 0.94 | 35.0% | -1.02 | 40 | 1.1% | 151 / 123 / +0 |

Walk-forward out-of-sample (stitched test windows, 6 folds): Sharpe -1.90, 3 trades, compounded -0.9%, max DD 0.9%, 0/6 folds positive.

Raw signal edge (every signal of the final parameters, all coins, no portfolio limits):

| period | signals | gross before costs (bps) | costs (bps) | net (bps) | t-stat net | exits |
|---|---|---|---|---|---|---|
| in_sample | 468 | -4.24 | 17.87 | -22.11 | -4.9 | STOP 290, TIMEOUT 178 |
| holdout | 52 | +13.90 | 19.08 | -5.17 | -0.3 | STOP 30, TIMEOUT 22 |

Gate: sharpe 0.00 ✗; max_dd 0.00 ✓; trades 0 ✗

Overfit / validity flags:
- NO_EDGE_IN_SAMPLE: even the best in-sample parameter sets average Sharpe -0.07
- UNSTABLE: chosen parameters changed in 3 of 5 fold transitions
- DEFLATED: probability the in-sample winner beats 12 null trials = 0.11 (< 0.95)

Holdout entries refused by the risk layer: half-Kelly <= 0 (no positive edge in the strategy's own record): 52

### C. Regime router (Hurst + volatility -> MR in mean-reverting regimes, momentum in trends, flat otherwise) — 1m: **NO-GO**

Holdout 2026-06-19 → 2026-08-31 (never used for any choice). Final parameters (chosen on the walk-forward region only): `{"RG_MR": {"entry_z": 2.0, "exit_z": 0.0, "stop_z": 3.5, "scale_in": false}, "RG_MOM": {"kind": "breakout", "lookback": 48, "hold": 12}}`

| run | net P&L | Sharpe | Sortino | max DD | PF | win rate | avg trade $ | trades | exposure | fees / slip / funding $ |
|---|---|---|---|---|---|---|---|---|---|---|
| in-sample (WF region, final params) | -582 (-5.8%) | -2.04 | -2.04 | 6.4% | 0.62 | 56.4% | -7.46 | 78 | 0.5% | 438 / 353 / -2 |
| **HOLDOUT (gated)** | +0 (+0.0%) | 0.00 | 0.00 | 0.0% | 0.00 | 0.0% | +0.00 | 0 | 0.0% | 0 / 0 / +0 |
| holdout at fixed 0.25% risk (Kelly off) | -993 (-9.9%) | -6.62 | -6.33 | 10.1% | 0.45 | 42.0% | -8.87 | 112 | 3.1% | 455 / 344 / -0 |

Walk-forward out-of-sample (stitched test windows, 6 folds): Sharpe -1.42, 3 trades, compounded -0.7%, max DD 0.7%, 0/6 folds positive.

Raw signal edge (every signal of the final parameters, all coins, no portfolio limits):

| period | signals | gross before costs (bps) | costs (bps) | net (bps) | t-stat net | exits |
|---|---|---|---|---|---|---|
| in_sample | 2763 | -0.17 | 17.51 | -17.68 | -12.7 | STOP 1438, SIGNAL 1248, TIMEOUT 77 |
| holdout | 610 | +2.26 | 17.65 | -15.38 | -5.8 | STOP 293, SIGNAL 295, TIMEOUT 22 |

Gate: sharpe 0.00 ✗; max_dd 0.00 ✓; trades 0 ✗

Overfit / validity flags:
- NO_EDGE_IN_SAMPLE: even the best in-sample parameter sets average Sharpe -0.34
- UNSTABLE: chosen parameters changed in 4 of 5 fold transitions
- DEFLATED: probability the in-sample winner beats 24 null trials = 0.00 (< 0.95)

Holdout entries refused by the risk layer: half-Kelly <= 0 (no positive edge in the strategy's own record): 610

Diagnostics 1m: the mean-reversion stationarity gate (ADF p<0.05 AND Hurst<0.45 on the trailing window) was open 5.1% of the time on average; regime shares (mean over coins): mean_revert 19.9%, trend 3.6%, high_vol 10.3%, neutral 66.1%

## Verdict

| timeframe | strategy | verdict |
|---|---|---|
| 5m | mean_reversion | **NO-GO** |
| 5m | momentum | **NO-GO** |
| 5m | regime_router | **NO-GO** |
| 1m | mean_reversion | **NO-GO** |
| 1m | momentum | **NO-GO** |
| 1m | regime_router | **NO-GO** |

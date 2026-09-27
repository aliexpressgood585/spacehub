# CHAN vs CHAN + meta-labeling (AFML) — 5m, 10 coins

Generated 2026-09-27T04:14:53 UTC. Primary model = the CHAN regime router, parameters frozen by Phase 1: `{'RG_MR': {'entry_z': 2.5, 'exit_z': 0.0, 'stop_z': 3.5, 'scale_in': False}, 'RG_MOM': {'kind': 'breakout', 'lookback': 144, 'hold': 12}}`.

## Verdict: **KEEP PLAIN CHAN**

- selected on development (best mean CPCV path Sharpe): `rf_k1.0_t0.60_size`
- beats plain CHAN on the holdout (Sharpe and return): **True**
- Deflated Sharpe on the holdout: **0.000** (gate > 0.95, N = 24 variants); DSR of its development OOS series 0.000
- PBO (CSCV, 12870 combinations): **0.00** (0.5 = selection no better than chance)

**Reading it.**
- The meta-model has **no predictive power**: out-of-sample AUC is 0.46–0.48 for every config, which is *below* chance.
- The variant "selected" on development is the one that almost never trades: 2 trades in 26 months of development and 0 on the holdout.
  - It "beats" plain CHAN only by standing aside.
  - Its DSR is 0.00.
- PBO = 0.00 is not evidence of skill. Every variant that trades loses, so "trade the least" wins in every CSCV split.
- Same answer as Phase 1: the router's gross edge before costs is about zero (−9 bps on the holdout) against ~20 bps of costs.
  - No subset of its signals that these 21 features can identify pays those costs.

## Holdout (last 20%, read once), after fees, slippage and funding

| | trades | avg size | gross bps | costs bps | net bps | win | return (0.25% risk) | Sharpe |
|---|---|---|---|---|---|---|---|---|
| plain CHAN | 601 | 1.00 | -9.4 | 19.8 | -29.2 | 28.3% | -56.68% | -4.72 |
| meta `rf_k1.0_t0.60_size` | 0 | 0.00 | +0.0 | 0.0 | +0.0 | 0.0% | +0.00% | +0.00 |

## Development (first 80%): purged K-fold OOS and CPCV paths

Events: 33,904 candidate CHAN signals (dev 26,330, holdout 7,574), average uniqueness 0.057. OOS AUC per model config: rf_k1.0 0.461, rf_k2.0 0.482, lgbm_k1.0 0.479, lgbm_k2.0 0.484

| variant | dev OOS trades | net bps | Sharpe (k-fold OOS) | CPCV mean / min path Sharpe | holdout net bps | holdout Sharpe |
|---|---|---|---|---|---|---|
| plain CHAN | 2386 | -21.9 | -3.82 | — | -29.2 | -4.72 |
| rf_k1.0_t0.60_size | 2 | -89.9 | -0.91 | -0.37 / -1.42 | +0.0 | +0.00 |
| rf_k1.0_t0.60 | 2 | -89.9 | -0.91 | -0.44 / -1.42 | +0.0 | +0.00 |
| rf_k2.0_t0.60 | 4 | -43.6 | -0.16 | -0.62 / -1.45 | +0.0 | +0.00 |
| rf_k2.0_t0.60_size | 4 | -43.6 | -0.16 | -0.63 / -1.49 | +0.0 | +0.00 |
| rf_k1.0_t0.50_size | 110 | -44.9 | -1.79 | -1.19 / -1.62 | -54.1 | -2.43 |
| rf_k1.0_t0.55_size | 111 | -46.0 | -1.77 | -1.29 / -1.78 | -56.3 | -2.67 |
| rf_k2.0_t0.50_size | 130 | -61.1 | -2.03 | -1.47 / -1.87 | +46.3 | +0.83 |
| rf_k2.0_t0.55_size | 133 | -62.5 | -2.10 | -1.57 / -1.90 | +35.3 | +0.53 |
| rf_k2.0_t0.55 | 289 | -40.0 | -2.05 | -1.86 / -2.04 | -6.1 | -1.14 |
| rf_k1.0_t0.55 | 275 | -37.5 | -2.21 | -1.93 / -2.25 | -24.3 | -1.88 |
| lgbm_k1.0_t0.60_size | 911 | -25.1 | -2.87 | -2.67 / -3.34 | -35.3 | -4.69 |
| lgbm_k1.0_t0.50_size | 1080 | -23.7 | -2.83 | -2.79 / -3.37 | -38.3 | -5.51 |
| lgbm_k1.0_t0.55_size | 1155 | -22.6 | -2.83 | -2.86 / -3.45 | -33.7 | -5.01 |
| lgbm_k2.0_t0.60_size | 905 | -30.7 | -3.08 | -2.91 / -3.18 | -21.0 | -2.77 |
| lgbm_k1.0_t0.60 | 911 | -25.1 | -2.94 | -2.94 / -3.66 | -35.3 | -4.08 |
| lgbm_k2.0_t0.50_size | 1098 | -29.2 | -3.20 | -2.95 / -3.26 | -24.3 | -3.39 |
| lgbm_k2.0_t0.55_size | 1164 | -29.1 | -3.23 | -3.03 / -3.30 | -22.0 | -3.34 |
| lgbm_k2.0_t0.60 | 905 | -30.7 | -3.18 | -3.03 / -3.20 | -21.0 | -2.06 |
| lgbm_k2.0_t0.55 | 1301 | -30.2 | -3.86 | -3.38 / -3.61 | -25.5 | -3.09 |
| lgbm_k1.0_t0.55 | 1287 | -21.0 | -2.96 | -3.44 / -3.91 | -33.0 | -4.45 |
| rf_k1.0_t0.50 | 1564 | -26.7 | -3.71 | -3.44 / -3.58 | -26.3 | -3.56 |
| rf_k2.0_t0.50 | 1568 | -25.6 | -3.31 | -3.50 / -3.61 | -27.8 | -3.57 |
| lgbm_k1.0_t0.50 | 1668 | -24.1 | -3.67 | -3.62 / -3.91 | -26.1 | -3.91 |
| lgbm_k2.0_t0.50 | 1662 | -25.3 | -3.76 | -3.64 / -3.72 | -26.5 | -3.63 |

Holdout columns of NON-selected variants are shown for transparency only; nothing was chosen on them.

## Triple-barrier labels

| k (barrier = k × vol × √hold) | upper first | lower first | vertical | mean net return | meta=1 dev / holdout |
|---|---|---|---|---|---|
| 1.0 | 27.0% | 36.9% | 36.1% | -47.7 bps | 46.4% / 42.6% |
| 2.0 | 7.8% | 15.3% | 76.9% | -57.4 bps | 47.0% / 44.1% |

## Why trades are taken: feature importance of the selected model

MDA = drop in out-of-sample log-loss when the feature is shuffled (purged folds); > 0 means it helps OOS. MDI = in-sample impurity share (biased toward noisy continuous features).

| feature | MDA mean | MDA std | MDI |
|---|---|---|---|
| vol | +0.00016 | 0.00102 | 0.065 |
| mom_t | +0.00011 | 0.00042 | 0.069 |
| hour_sin | +0.00011 | 0.00052 | 0.046 |
| funding | +0.00009 | 0.00061 | 0.054 |
| leg | +0.00000 | 0.00000 | 0.000 |
| atr_pct | -0.00006 | 0.00060 | 0.051 |
| vol_ratio | -0.00006 | 0.00029 | 0.046 |
| z | -0.00008 | 0.00021 | 0.048 |
| range_pct | -0.00017 | 0.00031 | 0.046 |
| dow | -0.00020 | 0.00111 | 0.026 |
| side | -0.00033 | 0.00033 | 0.002 |
| taker_imb | -0.00040 | 0.00063 | 0.051 |
| ffd_z | -0.00046 | 0.00066 | 0.045 |
| hour_cos | -0.00051 | 0.00043 | 0.044 |
| ret_12 | -0.00052 | 0.00199 | 0.058 |
| ret_288 | -0.00069 | 0.00100 | 0.056 |
| vol_pct | -0.00076 | 0.00093 | 0.053 |
| hurst | -0.00076 | 0.00126 | 0.070 |
| ret_48 | -0.00078 | 0.00099 | 0.051 |
| halflife | -0.00109 | 0.00099 | 0.052 |
| adf_p | -0.00147 | 0.00250 | 0.067 |

## Time vs volume vs dollar bars (from 1m, same bar count, plain CHAN router, no selection)

| bars | median Jarque-Bera | median abs lag-1 autocorr | median excess kurtosis | router trades | gross bps | costs bps | net bps | t(net) |
|---|---|---|---|---|---|---|---|---|
| time_5m | 255,728,516,087 | 0.047 | 7358.0 | 769 | -4.0 | 19.9 | -23.9 | -5.72 |
| volume | 5,924,247,071 | 0.059 | 1229.1 | 289 | -13.5 | 19.4 | -32.9 | -5.25 |
| dollar | 5,752,559,253 | 0.060 | 1220.8 | 396 | -9.5 | 19.9 | -29.4 | -4.98 |

FFD d per coin (smallest d with ADF p < 0.05 on the development period): BTC 0.3, ETH 0.2, SOL 0.2, BNB 0.2, XRP 0.2, DOGE 0.3, ADA 0.3, AVAX 0.3, LINK 0.3, DOT 0.3


# 10-minute bars — Phase-1 pipeline, unchanged (2026-09-27)

`python -m quant.run_backtest --tf 10m`
- **Data:** 10 coins, 36 months. Each coin has 157,824 bars, built UTC-aligned from the 5m archive.
- **Pipeline, same as Phase 1:**
  - the same grids, counted in bars;
  - windows scaled to the same calendar span as 5m (7 days of statistics, one re-estimate per day);
  - walk-forward 180/60 days;
  - holdout = the last 20%, read once;
  - the same costs;
  - the same gate: Sharpe > 1.5, DD < 15%, ≥ 200 trades, DSR ≥ 0.95, no DECAY/FLIP.
- **Sensitivity run:** slippage range term ÷√2. This puts 10m slippage on the same footing as 5m per fill. The main run keeps the conservative model that was also used for 1h and 4h.

## Signal edge on the holdout (per trade, bps)
| strategy | n | gross | costs | net | t |
|---|---|---|---|---|---|
| mean reversion 10m | 97 | −6.8 | 7.3 | −14.1 | −3.6 |
| momentum 10m | 54 | −43.1 | 28.0 | −71.2 | −2.0 |
| **regime router 10m (what CHAN runs)** | 1,710 | **−2.9** | 9.7 | **−12.6** | −7.4 |
| router 10m, low slippage | 1,772 | −6.4 | 18.9 | −25.3 | −8.7 |
| router 5m (Phase 1, for reference) | 601 | −9.4 | 19.8 | −29.2 | |

## Verdict: NO-GO for all three strategies
- **Mean reversion:** NO_EDGE_IN_SAMPLE; parameters unstable (changed in 7 of 10 fold transitions); DSR 0.12.
- **Momentum:** DECAY (in-sample Sharpe 1.23 → walk-forward OOS −0.94); HOLDOUT_FLIP; holdout Sharpe −2.76 on 12 trades.
- **Router:** NO_EDGE_IN_SAMPLE; the parameter choice changed in 10 of 10 fold transitions; DSR 0.13.
  - Half-Kelly sized it to 0, because its own record was negative. So the portfolio holdout had 0 trades.
  - The low-slippage run's router holdout Sharpe of 1.15 rests on 6 trades. That is meaningless next to the 200-trade gate.

## Reading
- On 10m bars the gross edge is still negative, before any cost.
- The loss per trade is about half of the 5m loss, because each trade's cost is smaller relative to the move. That makes it *less bad*, not good.
- Multiple testing: 10m is another look at the same holdout, after the 5m / 1m / 1h / 4h looks.
- Live CHAN stays on 5m, unchanged.

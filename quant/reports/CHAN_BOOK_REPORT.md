# Book-inspired CHAN candidates vs the live router (2026-09-27)

`python -m quant.run_chan_book --tf 5m|1h`
- **Pipeline:** unchanged. Walk-forward picks the parameters on training data only; the last 20% is held out and read once.
- **Costs:** taker fee, spread/slippage proxy and archived funding. Entries fill at the next bar's open.
- **Data:** 10 coins, 36 months.

**Rules** (`strategies/chan_book.py`):
- **DON:** close beyond the N-bar high/low; exit on a k × ATR stop, an opposite N/2-bar break, or a 4N cap.
- **ZMR:** z-score of the log price over W bars; ±2 entry, exit at 0, stop at 3 or 4 σ, W-bar cap; no ADF/Hurst gate.

## Holdout results

| | per trade net (gross / costs), bps | PF (per trade) | fixed-risk portfolio: trades · return · PF · maxDD · Sharpe | flags |
|---|---|---|---|---|
| **live router 5m** | −29.2 (−9.4 / 19.8), n 601 | — | 92 · −9.2% · 0.51 · 10.0% · — | NO_EDGE |
| DON 5m | −23.5 (−1.9 / 21.5), n 2,238 | 0.69 | 150 · +9.6% · 1.29 · 10.3% · 0.61 | DECAY, UNSTABLE, DEFLATED |
| ZMR 5m | −21.8 (−2.0 / 19.9), n 5,407 | 0.70 | 103 · −4.9% · 0.77 · 8.7% · −0.60 | NO_EDGE_IN_SAMPLE |
| DON+ZMR 5m | −22.3, n 7,645 | 0.70 | 85 · −8.1% · 0.54 · 10.0% · −1.99 | NO_EDGE_IN_SAMPLE |
| **live router 1h** | −15.3 (−5.0 / 10.3), n 522 | — | 325 · −10.2% · — · 10.7% · — | NO_EDGE |
| **DON 1h (N=168, 3 ATR)** | **+28.9 (+67.6 / 38.6), n 531** | **1.13** | **201 · +11.6% · 1.29 · 10.3% · 0.64** | NO_EDGE_IN_SAMPLE, UNSTABLE, DEFLATED |
| ZMR 1h | −29.5 (−0.7 / 28.8), n 3,520 | 0.76 | 118 · −10.9% · 0.54 · 10.9% · −1.14 | NO_EDGE_IN_SAMPLE |
| DON+ZMR 1h | −21.9, n 4,051 | 0.84 | 186 · −8.3% · 0.79 · 9.9% · −0.97 | NO_EDGE_IN_SAMPLE |

## Reading
- **Z-score mean reversion:** no edge before costs at either timeframe (gross ≈ 0).
- **5m breakout:** negative per trade. Its positive fixed-risk portfolio comes from the risk layer's selection of 150 of 2,238 signals. Walk-forward DECAY shows it does not hold.
- **DON 1h — FAILED VALIDATION:** walk-forward (15 folds of 360 training / 90 test days, before the holdout) had 3 of 15 folds positive, −14.7% compounded, maxDD 32.6%, Sharpe −0.15. Its positive holdout (+28.9 bps/trade) is one period. **There is no live shadow trading.** `PREREGISTRATION_H5.md` is kept as a record only; `forward/status.py` counts its trades and never marks it ready. No further tuning is done on the exposed period.
- **Where the loss comes from** (holdout edge stats): the ZMR gross is ≈ 0, so costs are its whole loss. The live router 5m is gross −9.4 bps with costs of 19.8 bps, so about two-thirds of its loss is costs and the signal is also negative before costs. Entries and exits cannot be separated with the existing data: gross mixes both, and no alternative-exit test was run on the same entries.
- **Live CHAN is unchanged.**

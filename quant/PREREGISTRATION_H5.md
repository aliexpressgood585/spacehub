> **STATUS 2026-09-27: FAILED VALIDATION — not a candidate, never to be enabled in the bot.** Walk-forward before the holdout: 3 of 15 folds positive, −14.7% compounded, maxDD 32.6%, Sharpe −0.15. Its positive holdout is one period. The rule below is kept only as the record of what was tested. There is NO live shadow trading; only a trade count in `forward/status.py`, which can never make it "ready".

# Pre-registration H5 — Donchian breakout on 1h bars (shadow forward test)

**Written 2026-09-27. Forward window starts 2026-09-28 00:00:00 UTC (T0).**
This file is separate from `PREREGISTRATION.md` (H1–H4). It follows the same rules: nothing here may be changed after data from T0 has been looked at. A change needs a new file with a new T0.

## Why it is here and not live
In `reports/chan-book-1h.json` (`python -m quant.run_chan_book --tf 1h`), this rule was the only candidate positive on the held-out 20%:
- 531 trades, net +28.9 bps per trade, PF 1.13;
- fixed-risk portfolio +11.6%, PF 1.29, maxDD 10.3%, Sharpe 0.64.

It **lost in-sample**, which raised NO_EDGE_IN_SAMPLE, UNSTABLE and DEFLATED. It also failed the Sharpe > 1.5 gate. That is the same flip pattern as the funding rule. It could be one regime, so it is tested on data nobody has seen before it may trade.

## Rule (frozen, `strategies/chan_book.py` `don_signals`, N=168, stop_atr=3.0)
- **Universe and bars:** the pinned 10 coins of `config.yaml`, Binance USDT-M 1h klines.
- **Entry:**
  - LONG when a 1h close is above the high of the previous 168 bars;
  - SHORT when a 1h close is below the low of the previous 168 bars;
  - entry at the next bar's open;
  - one open trade per coin.
- **Exit, whichever comes first:**
  - stop at 3 × ATR(14) from the signal close;
  - opposite break of the 84-bar channel (the close crosses the prior 84-bar low for a long, or the high for a short), exit at the next open;
  - 672 bars (4 × N) after entry.
- **Costs, sizing and the risk layer:** as H1–H4 (fixed 0.25% risk, `quant/` cost model).

## Gate (unchanged)
- ≥ 200 closed trades after T0;
- Sharpe > 1.5;
- DD < 15%;
- mean gross > mean cost;
- deflated Sharpe ≥ 0.95 with **N = 24**: 12 book variants × 2 timeframes were looked at before this rule was chosen.

## Before 200 trades
- Only the count is read, via `python -m quant.forward.status`.
- The expected rate is ~75 trades/month, so 200 trades take ≈ 3 months.

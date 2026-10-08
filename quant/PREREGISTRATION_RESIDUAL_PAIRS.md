# Preregistration: beta-residual market-neutral pairs

Research only; no bot, account, risk, database or deployment mutation. Frozen before implementation and before results.

## Hypothesis

Large idiosyncratic moves in an altcoin relative to its rolling BTC beta partially mean-revert. A dollar-gross-normalized long/short pair may retain this effect while removing most market direction.

## Data and split

- Binance Vision USD-M 1m klines aggregated to complete 5m bars.
- Existing ten-symbol research universe plus BTCUSDT hedge.
- Window: 2023-10-08 00:00 UTC to 2026-10-07 00:00 UTC exclusive.
- Train ends / validation begins: 2025-10-07 00:00 UTC.
- Validation has already been exposed and is not a pristine holdout.

## Frozen signal and execution

- Compute 5m close-to-close log returns.
- At each completed 5m bar, estimate each alt's BTC beta from the prior 7 complete days (2,016 five-minute returns), requiring at least 95% paired observations and beta in [0.1, 3.0].
- Formation windows: 4h (48 bars) and 12h (144 bars).
- Residual formation return = alt log return over the formation window minus frozen beta times BTC log return over the same window.
- Z-score the current residual formation return against prior non-overlapping formation returns inside the same 7-day beta window; require at least 20 observations and nonzero standard deviation.
- Thresholds: |z| >= 1.5 or |z| >= 2.0.
- Mean-reversion pair: z>0 shorts the alt and buys beta-weighted BTC; z<0 buys the alt and shorts beta-weighted BTC.
- Normalize absolute alt and BTC weights to total gross exposure 1.0. Freeze beta/weights at entry.
- Enter both legs at the next complete 5m bar open. Exit both at the close after 4h or 12h.
- No overlapping pair for the same alt within a variant. Different alts may overlap; BTC hedge exposure is allowed to net only in the later portfolio diagnostic.
- Missing entry/exit prices reject the observation. No invented fills.

## Fixed grid and costs

- 2 formation windows × 2 z thresholds × 2 holding periods = 8 variants.
- Charge 0.16% round-trip on total normalized gross exposure, including the same fee/slippage/funding reserve used in earlier screens.
- No leverage, compounding, stop, target, maker-fill assumption or parameter tuning after results.

## Gate

A screening candidate must have, separately in train and validation:

- PF > 1.15;
- positive mean net return;
- at least 300 completed pairs.

Any survivor still requires symbol robustness, an overlapping-position portfolio simulation with net BTC exposure/funding/drawdown, and a new forward Shadow period before PAPER activation.

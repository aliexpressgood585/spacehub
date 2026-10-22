# Preregistration: BTC shock / alt delayed-response pairs

Research only; no bot, account, risk, database or deployment mutation. Frozen before implementation and before results.

## Hypothesis

After an unusually large completed BTC 5m move, an altcoin that has reacted materially less than its rolling BTC beta may catch up over the next hour. Trading the alt in the BTC shock direction while taking the opposite beta-weighted BTC leg targets delayed idiosyncratic response rather than market direction.

## Data and split

- Binance Vision USD-M 1m klines aggregated to complete 5m bars.
- Existing ten-symbol research universe plus BTCUSDT.
- Window: 2023-10-08 00:00 UTC to 2026-10-07 00:00 UTC exclusive.
- Train ends / validation begins: 2025-10-07 00:00 UTC.
- Validation is already exposed and is not a pristine holdout.

## Frozen signal and execution

- Estimate each alt's BTC beta from the prior 14 complete days (4,032 five-minute close returns), requiring >=95% paired observations and beta in [0.1,3.0].
- BTC shock thresholds: absolute completed 5m close return >=0.4% or >=0.7%.
- Compute the alt's simultaneous signed response ratio: sign(BTC return) * alt 5m log return / abs(beta * BTC 5m log return).
- Delayed-response thresholds: ratio <=0.25 or <=0.50, while ratio must be >=-0.50 to reject strong coin-specific moves against BTC.
- Optional frozen BTC volume gate: shock-bar quote volume >=1.5x the prior 24h mean, requiring >=95% coverage. Compare none vs volume gate.
- Pair direction: BTC up -> long alt / short beta-weighted BTC; BTC down -> short alt / long beta-weighted BTC.
- Normalize absolute alt and BTC weights to total gross exposure 1.0; freeze beta and weights at entry.
- Enter both legs at the next complete 5m bar open.
- Fixed exits after 15m, 30m or 60m at the completed 5m close.
- Suppress overlapping pairs for the same alt within a variant. Different alts may overlap.
- Missing entry/exit prices reject the observation. No invented fills.

## Fixed grid and costs

- 2 BTC shock thresholds × 2 response-ratio thresholds × 2 volume filters × 3 holds = 24 variants.
- Charge 0.16% round trip on normalized gross exposure, including the existing fee/slippage/funding reserve.
- No stop, target, leverage, compounding, maker assumption or tuning after results.

## Gate

A screen passes only with PF >1.15, positive mean net return and >=300 completed pairs separately in train and validation. Any survivor additionally requires symbol robustness, overlapping-position portfolio simulation with net BTC exposure and realized funding, plus new forward Shadow before PAPER activation.

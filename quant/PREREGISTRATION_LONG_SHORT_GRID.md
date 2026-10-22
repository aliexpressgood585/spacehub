# Preregistration: bounded LONG/SHORT grid

Research only; no bot or account mutation. Frozen before the first run.

- Window: 2023-10-08 through 2026-10-07 exclusive; split 2025-10-07.
- Universe: the existing fixed ten-symbol research universe. This preserves comparability but retains selection and survivorship bias.
- Data: Binance Vision USD-M 1m OHLCV and taker-buy base volume, aggregated into complete 5m bars.
- Signals: 20-bar Donchian close breakout, EMA20/EMA50 pullback-reclaim, and RSI14/Bollinger(20,2) reversal; symmetric LONG and SHORT definitions.
- Entries: next 1m open after a completed 5m signal.
- Exits: (1.5 ATR target, 1 ATR stop, 60m timeout) and (2 ATR target, 1.25 ATR stop, 120m timeout); stop distance has a 0.3% floor.
- Filters: none, ADX direction, 1.5x volume, taker-flow direction, ATR% band, BTC EMA alignment, ADX+volume, BTC+flow, and all filters.
- Total fixed variants: 3 × 2 × 2 × 9 = 108. No post-result tuning belongs to this experiment.
- Cost: 0.16% round trip: 0.10% fees, 0.04% slippage, 0.02% funding reserve.
- Conservative mechanics: stop first on same-minute ambiguity, adverse stop gap at open, favorable target gap at limit, no overlap within symbol/variant.
- Screening gate: PF > 1.15, positive average net return, and at least 300 trades in both train and validation.
- The validation year has already been examined in earlier research, so any survivor still requires new forward Shadow evidence, cross-symbol robustness, and portfolio simulation.

# CHAN independent paper sleeves (2026-09-28)

Owner requested existing strategies (1) plus an independent breakout/retest strategy (2), 50/50 initial capital.
Paper only. No profitability claim. Existing trade history is preserved.

- 1: existing RG_MR and RG_MOM signals. 2: RG_TREND_PULLBACK.
- SQL initializes two wallets from the current cash only with an empty book. Each has its own cash, equity, peak/drawdown, fees and close/win counters. No automatic rebalancing.
- Both use the existing Kelly/default sizing against their OWN wallet equity and existing leverage cap. SQL enforces wallet cash, leverage and risk under the bot-state lock.
- Same symbol may be held independently by each sleeve; at most one open position per symbol per sleeve.
- New sleeve: closed 5m bars, EMA20/EMA50 direction and EMA50 slope; 24-bar breakout 1–3 bars ago, retest within 0.25 ATR and confirming candle; stop at least 2 ATR, target 2R, maximum 48 bars (4h). Requires complete contiguous bars and finite daily volatility percentile <=90%.
- A/B results are descriptive forward results, not a randomized trial or proof of an edge. Old closes are excluded from wallet counters.
- Rollback tests in the migration verify overspend rejection, separate same-symbol positions, cash conservation and close attribution. Test rows are rolled back.
- Signal tests: node --experimental-strip-types tests/trend-pullback.test.ts.
- Portfolio GUI: cyan = 1; amber = 2. Separate wallet cards plus tags on open/closed trades.

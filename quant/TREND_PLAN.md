# Trend sleeve (Clenow-style) — plan and integration

This is an independent second strategy. It follows the principles of *Following the Trend* (breakout + trend filter + ATR trailing stop + volatility parity) and *Stocks on the Move* (ranking by exponential-regression slope × R²). It is our own implementation, not copied text.

## How it integrates without touching CHAN

| piece | CHAN | trend |
|---|---|---|
| signals | `strategies/mean_reversion.py`, `momentum.py`, `regime.py` (unchanged) | `strategies/trend.py` (new) |
| simulator | `backtest/engine.py` + `portfolio.py` (5m, half-Kelly RiskManager) | `backtest/trend_sim.py` (daily, vol-parity) |
| data | `backtest/data/{SYM}-5m.csv`, 10 coins | `backtest/data/daily/` — every USDT perp ever listed, delisted included (`backtest/fetch-daily-all.sh`) |
| capital | `1 - trend.capital_share` of the paper account | `trend.capital_share` (default 0.5) |
| risk limits | `risk.*` (daily −3%, DD −10% kill, 5 losses, ≤ 1% per trade, 3x) | `trend.risk.*` (daily −3% blocks the next rebalance, DD −15% sleeve kill, ≤ 1% at the stop, ≤ 20% per position, 3x) |
| portfolio | — | `portfolio.max_drawdown_kill` 10% across both sleeves (flatten both, halt) |
| switch | live TS bot `__ENABLED_SLEEVES='CHAN'` | `trend.enabled: false` until the gate passes |

- The two sleeves never net or close each other's positions: separate simulators, separate equity, separate trade lists.
- The combined view adds the two equity curves. Only the portfolio kill acts on both.
- No CHAN file was modified. The only shared file edited is `config.yaml`, which gained the new `trend` and `portfolio` sections.

## Rules
- **Universe.** On the first day of each month, take the top 40 by mean quote volume over the previous 30 days, among coins with ≥ 120 days of history. Stocks, metals and stablecoins are denied.
- **Timeframe.** Daily bars. Decisions are made on the close and filled at the next open. Rebalances are weekly (Sunday close → Monday open).
- **Entries** (6 variants tried, all listed in config):
  - `breakout`: 50-day MA above the 100-day MA, and the close is a 50-day high (shorts mirrored); long-only or long+short.
  - `momentum` N ∈ {10, 20}: hold the top N by annualised exponential-regression slope × R² over 90 days, with score > 0 and close above the 100-day MA. Shorts are mirrored when enabled. The hold buffer is rank ≤ 2N.
- **Regime.** No new longs while BTC closes below its 200-day MA.
- **Exit.** Trailing stop at 3 × ATR(20) from the best close. It is exchange-side: a gap fills at the open. Also exits on dropping out of the rank buffer or the universe, and on delisting (last close).
- **Sizing.** Volatility parity: units = 0.2% × sleeve equity / ATR. Capped at 20% notional, 1% of equity at the stop, and 3x gross.
- **Costs.** The same model as `quant/`:
  - taker 0.05%;
  - slippage = base 1–3 bps + 5% of one 5m-equivalent range (previous daily range / √288);
  - real 8h funding, sign-correct.
- **Cost stress.** The holdout is re-run at 2× and 5× slippage.

## Validation
- **Split.** The first 80% of usable days is development; the last 20% is the holdout, read once.
- **Walk-forward** inside development: train 2 years → test 6 months, rolling.
- **Gate (unchanged).**
  - holdout Sharpe > 1.5;
  - max DD < 15%;
  - ≥ 200 holdout trades;
  - deflated Sharpe ≥ 0.95 (N = 6);
  - PBO < 0.5;
  - no DECAY / HOLDOUT_FLIP flag.
- **Combined report.** CHAN (Phase-1 router with its own risk manager) and trend on separate 50/50 capital over CHAN's 36 months:
  - per-strategy P&L;
  - correlation of daily returns;
  - the portfolio kill.

## Deployment
- **If it passes:** add a trend runner to the paper bot alongside CHAN, with its own ledger function and capital share.
- **If it fails:** the code stays and `trend.enabled` stays `false`.
- **Live:** never without the owner's manual approval.

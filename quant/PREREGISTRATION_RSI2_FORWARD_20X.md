# Frozen RSI2 forward observations — 2026-10-08

## Owner correction: existing bot account

At 09:25 Israel the owner clarified that this must run on the existing bot. Signal rules, indicator states and T0
remain frozen. The existing bot cron now invokes this simulation engine, and journal triggers mirror simulated
entries/exits into the existing paper account with fixed $250 margin x20. There is one shared existing cash balance;
the original per-symbol statistical curves remain normalized research comparisons, not extra spendable accounts.
Entry costs $3 and margin $250 are reserved; settlement returns margin plus net P&L plus the already charged $3.
Insufficient cash or failed qualification skips new existing-account entries and preserves research observations.
All entries are labelled experimental simulated trades, not validated signals. Training evidence is still missing.
There is no reset or historical trade rewrite. UI reports use existing account cash/positions. Legacy engine writes
are blocked while this mode is selected. The dedicated observation cron/optimizer are disabled to prevent competition.
The remainder records the original collector pre-registration; this correction changes account routing only.

Owner authorized active PAPER / DRY-RUN forward observations for TRADOORUSDT and MYXUSDT at 20x.
This research collector never calls the trading-bot handler or an exchange trading endpoint, nor reads/writes
the existing account/execution ledger. The old account remains paused, $5,000, no open rows. No keys requested.
Exchange requests are unsigned GETs restricted to time, exchangeInfo, klines and fundingRate.

## Pre-registration

`shared/rsi2-forward.ts::SPEC` is stored per study. PostgreSQL prevents changing rules or T0.
T0: **2026-10-08 06:20 UTC / 09:20 Israel**, next five-minute boundary after registration.
Historical warmup bars never count as new test observations.

- Exact active USDT-margined TRADOORUSDT/MYXUSDT perpetuals only. No substitutes or spot fallback.
- Closed 5m RSI2 <=5 and close > EMA200 long; RSI2 >=95 and close < EMA200 short.
- Last fully closed 15m bar: long close > EMA200 and EMA50 > EMA200; inverse for short.
- TRADOOR: 5m ADX14 <25. MYX: signal volume >= last 20 closed volumes' mean, including signal bar.
- EMA first-close seed; RSI2/ATR14/ADX14 Wilder smoothing with initial SMA. Fixed 1,000-candle warmup
  per interval. Indicator state persists and is never reseeded from a moving window.
- One simulated position per symbol; entry at next 5m open; signal ATR frozen; TP 1 ATR, SL 2 ATR.
- Stop first for both touched; gap through stop uses worse open. Hold 32 bars, then next available open.
- Missing/gapped data leaves checkpoint unchanged; recovery resumes sequentially without invented candles.
- Base cost: taker 0.05% plus slip 0.01% per side, 0.12% round trip. Stress: 0.16%; identical trades.
- Settled funding uses signed rate times funding-event mark price / entry price. Stop/target exit time is
  the simulated candle end: funding settlements inside that candle are included; OHLC cannot reveal exact
  intrabar exit time. Missing funding explicitly says FUNDING_NOT_INCLUDED and blocks advancement/new observations.

## Accounting and qualification

Independent $5,000 research account per symbol, fixed $250 hypothetical margin x20 = $5,000 entry notional.
No compounding or exchange liquidation/margin model. Drawdown uses closed-observation equity, not intrabar
or combined portfolio drawdown. Research accounts do not draw from the paused bot account.

Exact training evidence for these filtered candidates was unavailable: training is null, reported as
MISSING_EXACT_TRAINING_EVIDENCE. Unrelated RSI screens are not substituted. New observations are research
simulations, never qualified bot signals. The collector cannot activate the execution ledger even if gates pass.
Every journal entry/exit is SIMULATED_TRADE_ONLY.

Require >=100 closed training AND >=100 new forward trades, net wins >=61%, positive mean net return and
PF>1 in each window under BOTH costs. Incomplete evidence: INSUFFICIENT_DATA. Failure at minimum sample:
NOT_QUALIFIED; research observations only continue, without retuning. 61% describes measured net-positive
frequency, never the chance of the next trade winning.

## Operation

Every-minute pg_cron/pg_net schedule. Dedicated random credential generated inside PostgreSQL Vault;
function checks SHA256 hash. Public GET reads reports; unauthorized POST returns 403. RLS and column grants
protect checkpoints and scheduler hash. Revision CAS writes checkpoint + labelled journal atomically.
Both exact contracts were verified in hosted collector at 06:17 UTC; scheduled cycles healthy, initially zero trades.

Tests: exact contract/status, costs/stress, funding sign/mark, closed bars/15m alignment, persistent Wilder state,
same-bar stops, gaps, 32-bar timeout, no trading endpoint/ledger access. Existing H6 forward tests also pass.
Rollback: disable only `rsi2-forward` cron and research rows; preserve journal. No profitability claimed.

# SpaceHub Trading Bot — Session Handoff (read this first)

Paper-trading crypto bot. Owner (Hebrew speaker) wants: a highly profitable bot
with PROOF, as many good trades as possible. Full autonomy granted — act without
asking, but NEVER violate the standing rules below.

## Standing user rules (verbatim intent, do not break)
1. **Deploy + merge after every change**: push to BOTH `main` AND
   `claude/universal-gate-remote-iay0gg`. A stop-hook rejects uncommitted work.
2. **NO stocks / tokenized equities** — crypto only. Both strategies are pinned
   to the validated 40-coin universe (`CRYPTO_40` in the bot).
3. **NO real exchange connection** for now (paper mode only; user will say when).
4. **Never share API keys/secrets in chat.** Secrets live in GitHub Actions
   secrets (`SUPABASE_ACCESS_TOKEN`) and Supabase env. Never print them.
5. **Never reduce trade count** when "improving" profitability. Filters that cut
   trades are rejected; improvements must add trades or add edge per trade.
6. **Validation discipline**: nothing deploys without a 36-month walk-forward
   (6 windows, real fees: taker 0.05%/side, maker 0.02%/side) positive in ALL
   windows. Failures get rejected and documented in code comments.

## Architecture
- **Live bot**: `supabase/functions/trading-bot/index.ts` (Deno edge function,
  cron every minute, Supabase project `mdvheizhciuvqychtwxr`). Version header at top.
- Two validated strategies:
  - **DONCH4H**: Donchian-25 breakout on 4h closes, ADX(60)>22 gate, entries only
    first 15 min after each 4h close; SL=1.4×ATR; LADDER exits ⅓@0.6R(→BE)/⅓@1.0R/⅓@1.6R
    via `exit_stage`; ADX-tiered risk sizing (base 1.25%, up to 2.5%); pyramiding
    (2nd unit on ≥0.6R same-direction winner, max 2).
  - **ROTA**: every 48h rank 40 coins by 14d momentum, LONG top-5 / SHORT bottom-5,
    inverse-vol weights, 70% of book, per-coin combined cap 20%, drift-resize ±35%.
- Per-strategy health kill-switch: last-30 closed trades sum<0 → pause.
- Data: Binance fapi is geo-blocked (451) from Supabase AND GitHub runners →
  live bot falls back to OKX candles/tickers; backtests use data.binance.vision archives.
- **Backtests**: `backtest/backtest.ts`, run via GitHub Actions `backtest.yml`
  (workflow_dispatch inputs: mode/months). Modes v43bt…v47bt = research batches.
  Results are COMMITTED to `status/bt-latest.txt` (dispatch) / `status/regression.txt`
  (monthly) because job-log download is blocked from the sandbox.
- **Diagnostics without gh CLI**: edit `.status-ping` + push → workflow writes
  `status/latest.txt` (bot state, positions, live P&L via OKX marks, expectation-band
  check vs backtest, independent breakout scan, live `?donch_test=1`).
  `force-rebalance.yml` clears `rebalanced_at` to force a rotation.
- **Dashboard**: `trading-app/` → GitHub Pages via `deploy-trading-app.yml`;
  version tag in `CryptoTradingDashboard.tsx` must match bot version.
- Deploys: push to main touching `supabase/functions/**` triggers
  `deploy-edge-function.yml` (also runs SQL migrations listed inside it).
  Wait ~90s after deploy before poking the function.

## Tested & REJECTED (do NOT redeploy without fresh validation)
5m mean-reversion (breakeven after fees), 4h BB range-fade, Sharpe-momentum
ranking, skip-6 momentum, portfolio vol-targeting (better DD but less absolute
profit — user prioritizes profit), funding carry, funding tilt, 70-coin
universe, daily Turtle sleeve, daily rotation, trailing removal, limit-retest
entries (K=1/2/3+chase — loses momentum, windows negative), liquidation-cascade
fade via OI-crash (all 12 configs negative; NB Binance has NO liquidation
archive — metrics/ OI is the only forced-deleveraging data source).

## Current state (2026-07-10)
- Live: **v47** — ladder TP legs fill at exact levels with maker fee 0.02%
  (validated +0.050R vs +0.046R all-taker, all 6 windows; applies to open
  positions via manage loop). Account reset started at $10,000 paper.
- Expectation bands: DONCH4H WR~66%, ~+0.05R/trade; ROTA ~48%/yr book.
- v47bt validation CLOSED: retest entries rejected, OI-cascade fade rejected
  (full numbers in `status/bt-latest.txt`).
- User's chosen risk profile: SPORTY (base risk 1.25%). Split exits chosen: LADDER.
- Recommendation on record: freeze strategy changes 1-2 weeks, accumulate ~50
  live trades, compare to expectation bands before raising risk further.

## How to work
- Small edits → verify types (`tsc --noEmit --ignoreConfig --skipLibCheck` on a
  copy outside the repo; deno not installed locally), commit, push both branches.
- Push races with status-bot commits on main are common: fetch, merge, on
  `UU status/latest.txt` take `git checkout origin/main -- status/latest.txt`.
- Answer the user in Hebrew; keep code/comments in English.

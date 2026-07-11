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
    (2nd unit on ≥0.6R winner, 3rd on ≥1.0R, max 3 — v49).
  - **ROTA**: every 48h rank 40 coins by 14d momentum, LONG top-7 / SHORT bottom-7 (v49),
    inverse-vol weights, 70% of book, per-coin combined cap 20%, drift-resize ±35%.
- Per-strategy health kill-switch: last-30 closed trades sum<0 → pause.
- Data: Binance fapi is geo-blocked (451) from Supabase AND GitHub runners →
  live bot falls back to OKX candles/tickers; backtests use data.binance.vision archives.
- **Backtests**: `backtest/backtest.ts`, run via GitHub Actions `backtest.yml`
  (workflow_dispatch inputs: mode/months). Modes v43bt…v48bt = research batches.
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
universe, daily Turtle sleeve, daily rotation, trailing removal, 1h Donchian
sleeve (all configs negative after fees — same ceiling as 5m), limit-retest
entries (K=1/2/3+chase — loses momentum, windows negative), liquidation-cascade
fade via OI-crash (all 12 configs negative; NB Binance has NO liquidation
archive — metrics/ OI is the only forced-deleveraging data source), top-trader
positioning tilt (FOLLOWING whales slightly HURT: +0.049 vs +0.050R base;
fading them +0.051R but < +0.004R deploy bar = noise), Fear&Greed sizing tilt
(both directions noise-level), pair spread BTC/ETH+ETH/SOL+BTC/SOL (12 configs,
best = 5/6 windows but only ~47 trades/36m and w6 negative — rejected),
squeeze/compression sizing tilt (the classic "narrow channel = better breakout"
lore is BACKWARDS here: compression-boost LOST -0.0035R; wide-channel-boost
gained +0.0037R but misses the +0.004R bar and only 3/6 windows better — ADX
tiering already captures the real effect), weekend tilt (noise both ways).
RESEARCH CHAPTER CLOSED 2026-07-11: ~400 list items triaged over 4 user lists,
13 validation batches run. Free, validatable data is exhausted. Next edge
levers: 50-trade live checkpoint → risk raise per Monte Carlo table; later
real-exchange connection + capital.

## Current state (2026-07-10)
- Live: **v50.1** — USDT depeg monitor + cross-source bad-tick shield;
  daily loss limit (-5%/24h peak → pause new entries only), ROTA K=7 (annT 38.2%, maxDD 17%, all windows), pyramid depth 3
  (3rd unit at ≥1.0R), maker TP-leg fills (v47), stablecoin exclusion (v48, by
  the user's second Claude session), Bybit third data source, watchdog + daily
  report workflows (GitHub issues). Account reset started at $10,000 paper.
  NOTE: a second Claude account session works on this repo too — always fetch
  and read git log before assuming file state.
- Expectation bands: DONCH4H WR~66%, ~+0.05R/trade; ROTA ~48%/yr book.
- v47bt+v48bt validations CLOSED: retest entries, OI-cascade fade, 1h sleeve all
  rejected (numbers in `status/bt-latest.txt`).
- User's chosen risk profile: SPORTY (base risk 1.25%). Split exits chosen: LADDER.
- Recommendation on record: freeze strategy changes 1-2 weeks, accumulate ~50
  live trades, compare to expectation bands before raising risk further.
- Monte Carlo DD table (v50bt, for the risk-raise decision; real DD runs deeper
  due to concurrent positions): 1.25% risk → median maxDD 16%, p90 25%, p99 36%;
  1.75% → 22/34/47%; 2.50% → 31/46/60%. User must accept the tier's p90 before
  each raise.

## How to work
- Small edits → verify types (`tsc --noEmit --ignoreConfig --skipLibCheck` on a
  copy outside the repo; deno not installed locally), commit, push both branches.
- Push races with status-bot commits on main are common: fetch, merge, on
  `UU status/latest.txt` take `git checkout origin/main -- status/latest.txt`.
- Answer the user in Hebrew; keep code/comments in English.

## Communication style (match this — the user expects continuity)
- Hebrew, warm but direct. Lead with the bottom line, then the reasoning.
- Radical honesty about results: report losses/failures plainly with numbers;
  never inflate. When an idea fails validation, say so and document it.
- Push back with evidence when the user asks for something statistically unsound
  (e.g. "always wins", "hundreds of % now", unfalsifiable indicators like Elliott
  waves) — explain the math simply, offer the validated alternative, and offer
  to TEST codeable ideas rather than argue opinions. Fibonacci retracements =
  same idea as limit-retest entries, which already failed — say so if asked.
- The user is not a programmer: explain in plain terms, use concrete numbers
  ($10k → $16k year 1 at ~55-75%/yr), avoid jargon walls.
- Work autonomously end-to-end (build → validate → deploy → merge → verify →
  report once). Don't ask permission mid-flow; do ask before genuinely new scope.
- Long waits (backtest runs ~20 min): poll in a background process, keep
  answering the user meanwhile, report when done.
- Current standing advice given to user: freeze changes, accumulate ~50 live
  DONCH4H trades (~2-3 weeks), compare to expectation bands, then raise base
  risk stepwise (1.25%→1.75%→2.5%) if in-band. Leverage warning given: 25-30%
  DD × high leverage = liquidation; user accepted SPORTY profile knowingly.

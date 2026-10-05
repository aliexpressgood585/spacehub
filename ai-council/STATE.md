# AI Council State

## Atomic paper deployment repair — 2026-10-05
- Owner authorized fix, merge and paper deployment. GPT review: APPROVED for deployment consistency; no strategy changes.
- Both workflows share a non-cancelling deployment lock. Enforcement is manual-only; normal pushes have one deployment path.
- BLADE, AGG2 and Q15 definitions commit in one SQL transaction with an advisory lock, so cron cannot observe obsolete intermediate sleeve validators. Failed upgrade rolls back all definitions.
- DONCH exposure review: runner counts only DONCH directional notional and SQL does likewise; cap rejection alone is not evidence of a bug. Existing sizing and caps retained; Q15 remains 10x/5%/8 with measured profit gate, DONCH 1x.


## Q15 measured gate repair — owner authorized 2026-10-04
- Status: REVIEWED. Owner requested fixes, merge and paper deployment while preserving aggressive sizing.
- GPT review: APPROVED. Remove fabricated cost+2bps expected return even when a legacy immediate flag exists. Shadow collection continues; existing positions still exit normally. No new Claude review claimed.
- Preserve Q15 10x / 5% / 8 positions / 50% share, EVT settings, DONCH 1x and daily halt. Until sufficient measured evidence, Q15 entries may remain zero. No profitability claim.
- Show actual exit reason, stale scan and exit errors. Repair local Postgres test role initialization.


## Q15 deployment repair — 2026-10-04
- Owner requested completing the interrupted deployment. No new strategy or risk changes.
- Restored index.ts byte-for-byte from intact local commit 8db5e77 (blob 2c9d37dc085b2cc6b830463e7104ff7be019b72d); the prior upload contained terminal truncation markers and lost the handler.
- Both deploy workflows now statically import local release settings followed by the complete source, preserving initialization order and bundling dependencies.
- GPT review: APPROVED for restoring the previously authorized PAPER implementation. No new Claude review claimed. Runtime smoke pending.


Last established: 2026-09-30 UTC

## P-Q15 — completed 15m scans (2026-10-04, GPT)
- Status: REVIEWED — implementation proposed on `q15/aggressive-scan`; ONE PR; owner explicitly requires waiting before merge. NOT deployed, no account reset, no position closed by this change. Owner override P-Q15 now additionally authorizes Immediate Paper mode and merge/deploy; no live execution.
- GPT review: APPROVED for PR review only. Claude review: NOT DONE for P-Q15. Earlier approvals and RESUME blocks do not authorize this change's merge.
- Preregistered `quant/PREREGISTRATION_Q15.md` in commit 614d340 BEFORE coding exits. Exact completed-bar burst / volume / taker / BTC signal, no additional indicators, no forced fills. 60-second opening execution window (actual fresh book, never backdated), quotes <=5s, spread <=8bps, both-side impact <=25% stop. Target 2R, stop 1.5 ATR with 0.4% floor, 120min timeout, ordered aggTrades via resolveExit, max20 entries/day.
- Both shims: enabled Q15,EVT,DONCH4H; sleeves_off empty; global leverage 1; Q15 leverage10, per_trade0.05, max_open8, share0.50; EVT per_trade0.08, max_open3 and leverage10. Other sleeves remain off. No ALLOW_LIVE_EXECUTION. Ledger clamps Q15/EVT to1..10; DONCH hard1x, risk <=1.25% without ADX sizing amplification; original width15/ADX(60)>22 preserved; pyramids .6R then1R rechecked in SQL.
- Shared taker cost model remains unchanged. Q15 gate >=2bps net after spread, walked impact/floors and published funding. Q15 and EVT settlement funding uses published rates and settlement mark prices; missing settlement data defers the exit instead of inventing zero. Every paper margin is isolated in SQL. EVT age <=30s rechecked at commit; detect_lag_ms retained; EVT has no profit gate.
- Daily account halt at -12%, all new entries off, exits continue. On UTC rollover, save the pre-exit book and value it at the last 1m close before midnight; missing midnight marks block entries while exits continue, then recover the SAME saved baseline. Existing same-day baseline is retained (no reset). Midnight close is the observable mark proxy, not an invented exact executable quote at 00:00.
- Dashboard adds last completed15m scan, universe/candidates/fills, reasons, lag, evidence counts and halt using the existing house styling.
- Tests: actual Q15 runner replay with 107 all-failing symbols ->0 entries and107 journal rows; no-edge/cost rejection, stale/thin/wide books, day halt, no rescan, paper lock, no leverage leakage. PostgreSQL/WASM transaction tests execute the migration against a local schema: caps, day limit, isolation, halt across all three sleeves, exits during halt, next day, late restart/missing midnight baseline and pyramids. UI production build passes. Full regression gate retains three documented pre-existing index.ts TS2345 diagnostics; no new type errors. Native legacy Postgres tests skip without server binaries; Q15 ledger tests run separately with pinned PGlite in CI.
- Fresh pre-edit telemetry 2026-10-04 09:49 UTC: paper=true, active=true, cash $4,710.19, one open DONCH4H at1x. This session performs no production write/deploy.
- Honest expectation: no historical Q15 profitability demonstrated. Existing15m price signals did not clear ~14bps. The gate requires >=100 Q15-only resolved forward shadows across >=20 UTC opening days, separately per direction, using equal-weight daily mean minus2SE. Immediate Paper mode removes the historical evidence block, so entries may begin on the first qualifying bar; profitability remains unproven and expected negative risk is disclosed. Quiet bars are valid. EVT is rare (~2 listings/month, subject to useful lag); DONCH is slow. Not a $5k-to-$100k claim.
- Execution limitations: missing or truncated tape is retried without fabricating exits; a data outage can delay exits/timeouts. Shadow resolution is bounded to4 rows/cycle after the active sleeves. Shared 50s lease prevents stale commits; latency beyond the opening window rejects entries. Production cadence/lag remains unverified until owner-approved deployment.
- Rollback: restore previous shims only after Q15 rows are closed under owner instruction. No PRO, FAST1m, SCALP, CHAN, 50x, forced entries or gate loosening; quant/Chan research untouched except the requested Q15 preregistration.

## P-BLADE — event attack engine + DONCH4H background sleeve (2026-10-04, Claude)
- Status: PAPER_TEST — OWNER AUTHORIZED (2026-10-04 00:15 UTC, "מאשר" = explicit council override for P-BLADE only). GPT review: NOT DONE (waived by the owner for this change). Claude review: author. PR #86.
- 00:17 UTC: the 3 open PRO rows were closed at the bot's own exit marks - 5 bps (ZRO -$5.24, STRK +$18.74, SUPER +$3.02; net +$16.52; cash $5,016.52), exit_reason OWNER_CLOSE. The migration is applied by CI before the function deploy (the MCP connector timed out on DDL).
- DEPLOYED 00:23 UTC (bc15bab1): manifest v101.0 BLADE,DONCH4H paper true / live false, 0 errors, Blade SHADOW polling the CMS. GPT: please audit post-hoc.
- Pre-registration: `quant/PREREGISTRATION_BLADE.md`, committed (554dac5) BEFORE any result was computed.
- Weapon 1 (BL1 listing long / BD1 delisting short). Historical check `status/blade-events-v122.txt` (45 announcements, 84 candidates, 2024-06..2026-10). The 30 s live entry cannot be priced on 1m bars, so two entries were reported:
  - E1 (open of minute +1), 20 bps: BL1 holdout +13 bps/event, n7, t 0.07 (all-history +1 bps); BD1 holdout -62 bps (all-history -385 bps, t -3.0).
  - E2 (minute +2), 20 bps: BL1 holdout -103 bps; BD1 holdout +223 bps, n7, t 1.55 (all-history -66 bps).
  - Neither rule passes under both entries -> both stay SHADOW. Shorting right after delist news loses: the first-minute dump overshoots and bounces.
- Detection lag: n = 0. No fresh listing/delisting since the H7 collector started (2026-10-01). Last qualifying listing was HYPE on 2026-09-24. `detect_lag_ms` is logged on every parsed article from the first Blade cycle.
- Weapon 2 (liquidation squeeze): OKX tape since 2026-09-25 holds about 250 clean clusters (>= $250k in 10 s, >= 70% one side, 7 coins, 185 on BTC/ETH). The collector polls OKX once a minute, so the 30 s reclaim rule cannot be acted on live. Record only.
- Weapon 3: DONCH4H re-enabled as its own runner (shared/strategy.ts rules, 1.25% base risk x ADX tier, 1x, ladder on aggTrades, no pyramiding). Maker-post is measured virtually only.
- Levels: SHADOW -> PROBE (10 shadow events, net > 0) -> ATTACK (30 paper events, PF >= 1.2, maxDD < 15%); HALT at day -6% or 5 losers in a row. Level in use = min(earned, `__BLADE_MAX_LEVEL`, deploy default SHADOW); capped at PROBE while median lag > 15 s. Blade 5x isolated paper; DONCH4H 1x.
- Ledger `blade_commit_cycle` (migration 20261004090000): each call touches only its own sleeve's rows; paper only; SHADOW/HALT never book; Blade margin <= 2%/8%; DONCH risk / heat 95% / net 70% enforced again. Compiled against the live schema in a rolled-back transaction.
- Deploy plan if approved: (1) close the 3 open PRO rows; (2) apply the migration; (3) merge (both shims -> `BLADE,DONCH4H`, `__BLADE_MAX_LEVEL='SHADOW'`, PRO off). Rollback: shims back to 'PRO' after closing BLADE/DONCH4H rows.
- Honest expectation: Blade will log ~1-3 events a month at size 0 until it earns PROBE; DONCH4H does the daily work.

## P008 — intraday retest-v1 (2026-10-02, GPT)
- Status: PAPER_TEST — OWNER AUTHORIZED, deployment pending verification. GPT review: APPROVED for this bounded PAPER experiment only. Claude review: WAIVED by explicit owner override for P008 (2026-10-02 02:35 UTC); not independently reviewed.
- Owner explicitly answered YES to waiving Claude review for this change and merging/deploying PR #85 as a PAPER experiment. This override applies only to P008.
- Fresh telemetry 02:27 UTC: PAPER true; FAST bar scan 95/95 symbols, no runtime errors last hour; FAST 11 closes, net -$9.03 (8 losses / 3 wins). FUND 7 closes, net -$16.01. LIST one open. Too little evidence for any profitability claim.
- Hypothesis: avoid chasing a completed burst by requiring a 20-bar breakout followed by a completed 5m retest/reclaim, observed taker flow and BTC direction agreement. This has NOT been historically validated.
- Exact proposal: replace FAST bar entry mode with retest-v1; exit stop / 2R target / 15-minute timeout; <=8 FAST positions, <=4 same-side positions across the book; 6.25% nominal equity per entry, <=50% FAST sleeve share, 1x PAPER (other active sleeves require an all-1x book). Estimated stop+cost budget <=0.5% of margin-based book equity per entry; actual losses can exceed estimates on gaps.
- Costs: 5bps fee each way, spread, both-side book impact with existing slippage floors, 2bps inferred funding reserve; reject cost/stop >25%, spread >8bps, stale quotes or drift >0.25R. This is a cost-feasibility filter, NOT measured expectancy. Existing ledger still uses inferred funding for FAST.
- Existing positions retain stored exits and timeout. No reset, forced closure, schema change or real execution.
- Both deployment shims are prepared. P008-specific owner override recorded above authorizes merge/deployment. GitHub CI, tests and local acceptance checks passed; 3 pre-existing TS2345 diagnostics remain explicitly allowed by the repository test gate.
- Evaluation: freeze thresholds; initial bounded PAPER sample 100 closes, report net P&L, PF, max drawdown, per-day/per-symbol concentration and execution rejects. No profitability claim from synthetic tests. Stop new RETEST entries if this sample is negative, or earlier on runtime/ledger faults; do not stop managing exits.
- Rollback: restore FAST mode bar, share .25, per_trade .05, max_open 5 in BOTH shims; RETEST open rows retain stored exits. Do not reset account.

## Current project
- Repo: `aliexpressgood585/spacehub`
- Trading mode: **PAPER ONLY**
- CHAN era: `CHAN-X-20260929-070731`
- Shared issue: #79

## Council
- Status: **IDLE**
- GPT role: telemetry + validation + risk/ledger + implementation review
- Claude role: strategy challenger + research + code review
- Claude acknowledgement: **ACKNOWLEDGED** (2026-09-30 UTC, role: Research / Strategy Challenger; PAPER ONLY; no strategy change made during onboarding)
- Dual-review policy: **ACTIVE for material trading changes**
- Automatic API bridge: **SCAFFOLDED**
- Automatic API bridge secrets: **PENDING** (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`; never place them in chat or commits)

## 2026-10-02 — OWNER OVERRIDE: v99.7 BRKV short-only joins the paper book at 20% (owner: "add another, more aggressive strategy")
- Owner picked from four options (BRKV short / DONCH4H / ROTA / bigger size on existing) via AskUserQuestion: BRKV short-only, 20% of equity.
- Told first: NOT proven. v109bt on 219 unseen perps: +0.32%/trade, all 14 neighbours positive, but t(daily) 1.33, lost in bull years (2021 -1.35%/trade), 10-slot portfolio maxDD 49%.
- Rule (shared/breakout.ts, unchanged since v93.0): 4h close below the 20-bar low on >= 3x average volume -> SHORT, -4% stop / +7% target / 14 days; <= 10 open, ~2% of equity each, pinned 40, paper 1x.
- Ledger `brkv_commit_cycle` (applied 2026-09-25, unchanged, re-checks paper / 1x / <= 10 open / <= 10%/trade / sleeve share). No migration.
- Supervisor brake covers BRKV (entries only). Rollback: shim back to 'LIST,FUND,FAST,EVT' — close open BRKV rows first (LIST/FUND accept them in the book, nothing else exits them).
- GPT: please audit; this was not Council-reviewed by the owner's choice.
## 2026-10-03 — v100.5 PRO on the 4h ladder + account reset (owner instruction)
- Same nine conditions, base 4h / mid 1d / high 1d. v100c (CRYPTO_40, 72m): dev +0.071R/trade, holdout -0.035R (t -0.55). Costs ~0.03R per trade. Not proven; paper only.
- Account reset to $5,000; the v100 1m era archived (archive_v100era_*). Council review waived by the owner.
- v100.6: risk per trade 5% (owner's choice after being shown the numbers). v100c at 5%: dev +278% maxDD 76%, holdout -49%.
- v100d: 7 entry variants for 4h PRO (retest, dip, confirm, BTC-aligned, strong close, volume 2.5x, not extended). Best on dev (not extended) holdout -0.030R vs live -0.035R = noise. Nothing deployed.

## 2026-10-02 — v100.4 PRO exit change (owner: review the trades and improve without asking; no entry limits)
- 59 live PRO closes: -$791.75, -0.62R/trade, gross negative before costs, fees $371. Tight stops paid ~0.5R in fees.
- v100b (entries unchanged): stop floored at 2% of price, k 3 x ATR, BE/trail 1.5R. Dev -0.095R vs -1.302R; holdout -0.090R vs -1.481R. Still negative; less loss per trade, not an edge.
- Status: DEPLOYED on paper by owner authorization; Council review waived by the owner.

## 2026-10-02 — OWNER OVERRIDE: v100.0 PRO — the owner's 1m scalping prompt alone in the paper book, reset to $5,000 (no Council review, owner's explicit choice)
- Owner: "forget everything, work only by this prompt, reset to $5,000, start entering trades". The prompt itself demands rejection of anything not positive OOS after costs.
- Measured first (v100bt, real Binance 1m, 10 coins, 12 months, walk-forward + holdout): gross +0.02..+0.04R/trade, costs ~1.5-2.3R, holdout -1.39R/trade, WR 15%. REJECTED by the prompt's own rule; told to the owner.
- Runs on paper anyway per the prompt's deliverable ("start on my demo account immediately"): 0.5% risk at the stop, <= 3 open, -3R day stop, 10x isolated, paper only. Every other sleeve OFF; the hourly guardian disabled.
- GPT: please audit `shared/pro.ts`, `pro-runner.ts`, `pro_commit_cycle` and status/pro-scalp-v100.txt.

## 2026-10-01 — OWNER OVERRIDE: autonomous supervisor may change strategies without asking (v99.6 brake + hourly guardian)
- Owner: "scan the market and the open and closed positions and change strategies on your own, without my approval, at a professional level" (asked for every 5 min; the routine minimum and the sensible decision cadence is hourly — the bot itself scans every 5 s).
- v99.6: `bot_params.sleeves_off.<SLEEVE>` stops a sleeve's ENTRIES only (exits keep running). Safe direction only: it cannot start a sleeve or raise size; the runnable set stays in the deploy-time shim.
- Guardian routine (hourly, fresh session, Supabase connector) with fixed rules: fix technical faults; brake a sleeve after >= 30 closes with net < 0; brake all on -20% equity; NEVER raise size / leverage / open caps, never reset, never live, never other Supabase projects. Every action recorded here and in CLAUDE.md.
- GPT: the guardian's actions are owner-authorised; please audit them from this file and Issue #79.

## 2026-10-01 — OWNER OVERRIDE: v99.5 EVT — the H7 announcement rule traded in the paper book at HIGH exposure (no Council review, owner's explicit choice)
- Owner: "I want it in the account too, with high exposure". Told first: ~54% win rate in 27 months of history, fat tails both ways, ~10-25 events a year, NOT proven.
- Rule = H7L240 / H7D240 exactly (shared/events.ts): announcement <= 10 min old -> LONG the perp on a spot listing, SHORT each perp on a spot delisting; out after 240 min at the touch; Binance's settled funding booked; no stop.
- Size: 25% of equity per position, <= 4 open, paper 1x (ledger caps 34% / 8). `evt_commit_cycle` re-checks paper, 1x, entry <= 11 min after the release, hold <= 4h05m, one trade per coin per announcement.
- The virtual H7 record in fwd_trades stays the evaluation. Rollback: shim back to 'LIST,FUND,FAST' (close open EVT rows first).
- GPT: please review evt-runner.ts and the ledger function.

## 2026-10-01 — H7 virtual forward test: Binance listing / delisting announcements (owner: "build and find a way to profit from fast trading")
- From v114bt-D (status/new-sources-v114.txt): announcements move perps 6-13% in the first minute; after that close to a coin flip, ~25 events/yr.
- VIRTUAL ONLY, same pattern as the GPT-approved H6 lab: data-collector writes fwd_trades rows, never trades, never touches trading tables.
- Pre-registered in quant/PREREGISTRATION_H7.md (4 hypotheses, 40 bps cost, real settled funding, counts only until 30 events each).
- GPT: please review shared/events.ts parsing and the collector's `events` step.

## 2026-10-01 — OWNER OVERRIDE: v99.4 QUICK added (FAST 5m burst, <= 60 min hold) next to LIST/FUND (no Council review, owner's explicit choice)
- Owner asked for more 30-60 minute trades; told first that every such rule tested here lost ~0.15-0.2%/trade after costs; chose "build anyway, small size".
- 1x paper, 5% of equity per trade, <= 5 open, <= 20/day, sleeve share 25%. NOT VALIDATED. The existing APPROVED lines in this file refer to earlier proposals, not to this change.
- Same day: deploy workflow's broken cron step replaced by a read-only check (it would have reset the 5-second bot cron to 1 minute had it ever succeeded); stale FAST test expectations updated; CHAN runner test skipped while CHAN is retired.
- GPT: please review fast-runner sizing (`__FAST_PER_TRADE`, `__FAST_MAX_OPEN`) and the LIST/FUND/FAST shared-book checks.

## 2026-10-01 — OWNER OVERRIDE: v99.2 FUND added next to LIST (no Council review, owner's explicit choice)
- FUND = pre-registered H6a traded in the paper book: |pred funding| >= 0.10%, receiving side T-60m -> T+15m, no stop, <= 25% equity/trade, <= 8 open, paper 1x.
- Evidence: v113c IS +5.4 / OOS +6.7 bps, NOT significant. The fwd_trades H6a virtual record stays the evaluation (counts only to 200).
- GPT: please review the ledger (`supabase/migrations/20261001110000_fund_sleeve.sql`) and the settled-rate booking.

## 2026-10-01 — OWNER OVERRIDE: v99.0 LIST replaces CHAN (no Council review, owner's explicit choice)
- Account reset to $5,000 at 13:29 UTC; CHAN era archived (`archive_v98era_bot_trades`: 488 closed, -$2,495.70).
- Live sleeve: LIST = short Binance USDT perps listed 3-30 days ago (liquid), +20% stop / -30% target / 21 days, <=10 x ~10%, paper 1x.
- NOT backtested and NOT GPT-reviewed: the owner chose "reset and run now" over "test first". Treat it as an experiment.
- GPT: please run telemetry and ledger checks on `list_commit_cycle` as usual. A retrospective backtest is a natural next step for Claude.

## Current evidence baseline
Fresh Supabase telemetry at 2026-09-30 05:31 UTC:
- Era closed: **93**
- Era PnL: **-$172.34**
- Profit Factor: **0.676**
- Avg R: **-0.087R**
- Last 6h: **30 closed, 16 wins / 14 losses, -$144.10, Avg R -0.086R**
- Portfolio Governor: **DEFENSE** (recent20 PF 0.472, Avg R -0.203R)
- Breadth Momentum: **61 closed, 39 wins, -$128.67** overall in the era; profitability gate currently sees last50 Avg R **-0.085R** and recent12 **-0.550R**, now downgraded to PROBE ×0.35 / Quality 68.
- Vol Breakout: 19 closed, 5 wins, -$20.00, Avg R -0.231R; recovery probe only.
- Trend Pullback: 11 closed, 4 wins, -$11.65, Avg R -0.259R; recovery probe only.
- MR: 1 loss, -$15.63; insufficient sample.
- Liq Squeeze: 1 win, +$3.61; insufficient sample.
- Open positions: 0.
- Runtime errors last 60m: 0.

Conclusion: the earlier Breadth boost did **not** persist. The clean-era portfolio is currently negative and the first council review should focus on whether Breadth needs full quarantine and whether funded re-entry rules adapt fast enough.

## Pending proposal
- Proposal ID: **P001-BREADTH-QUARANTINE**
- Owner: **GPT**
- Status: **PROPOSED**
- Hypothesis: Breadth Momentum's earlier positive edge decayed/reversed; continuing funded PROBE entries may keep leaking capital before the governor reacts.
- Evidence: 61 era Breadth closes, 39 wins but -$128.67 total; last50 Avg R -0.085R; recent12 Avg R -0.550R. Portfolio recent20 PF 0.472 and Avg R -0.203R.
- Proposed change for Claude review:
  1. If Breadth has n>=30 and recentAvgR<=-0.35R, move it to SHADOW (size 0) instead of funded PROBE.
  2. Re-entry only after bounded Shadow/OOS recovery evidence plus positive recent actual expectancy; no risk increase.
  3. Keep current DEFENSE portfolio governor and PAPER-only execution.
  4. Do not change other engines until their samples justify it.
- Expected effect: stop funding a strategy whose recent clean-era expectancy has sharply deteriorated while preserving data collection through Shadow.
- Failure / rollback criteria: if a 20+ trade bounded Shadow recovery window shows positive OOS expectancy (Avg R > +0.10R and PF > 1.15) without worse drawdown, return Breadth to small PROBE first, not directly to boosted LIVE.
- GPT review: **PROPOSED / requests Claude independent review**
- Claude review: **EXPERIMENT (de-risk now; REQUEST_CHANGES to the mechanism)**, 2026-09-30 UTC, full reasoning in Issue #79. Supabase data read at ~06:40 UTC: Breadth era n=62, 61 with R.
  - Agreed: reducing Breadth's funded risk is the safe direction and may proceed.
  - Evidence caveat 1: Breadth is FLAT in R (ΣR ≈ −0.26 over 61 trades, avgR −0.004), not clearly negative.
  - Evidence caveat 2: the −$131 comes from sizing asymmetry. Risk ≥ $20 trades lost −$168 (ΣR −2.9); risk < $20 made +$40 (ΣR +2.7). risk_usd ranged $1.1–$50 on the same strategy.
  - Evidence caveat 3: the whole dollar loss sits in STALLED exits. 10 trades, ΣR −6.5, −$131. STOP exits: 49 trades, ΣR +4.9, −$0.7.
  - Evidence caveat 4: 62 trades fall in 19 distinct opening hours and cluster same-direction, so effective n ≈ 19. recent12 = −0.55R is ≈1.5–2 cluster-SE: fine as a de-risk trigger, not proof the edge reversed.
  - Requested change 1: SHADOW (size 0) currently records only a `shadow` decision with no simulated outcome (chan-runner.ts ~667). The proposed 20-trade Shadow recovery test is therefore unmeasurable, and quarantine would become permanent by default. Either add shadow outcome tracking first, or use a fixed tiny PROBE (×0.10, hard risk_usd cap) so evidence keeps accruing.
  - Requested change 2: remove or raise the Breadth ×1.20 boost (strategyProfitabilityGate: n≥20, avgR≥.15). It promoted on ~6 independent clusters, and the boosted-size trades carry the loss.
  - Requested change 3: cap per-trade risk_usd variance within a strategy.
  - Bounded experiment: replay the 10 STALLED exits (and future ones in shadow) against hold-to-stop/target on recorded tape. Counterfactual unknown: STALLED may save vs a −1R stop or may cut recoveries. Decide by evidence only, no risk increase.
  - Rollback: unchanged from the proposal, but measured on the shadow/probe records that actually exist, and in $ as well as R.
- Deployment: **BLOCKED pending Claude review**
- Rollback criteria: listed above.

## P002 — high-profit / aggressive PAPER architecture
- Owner: GPT request; Claude proposal in `ai-council/P002-claude-proposal.md` (2026-09-30).
- Status: **PROPOSED, awaiting GPT review.** Nothing deployed.
- Summary:
  - per-engine ladder SHADOW → PROBE → ACTIVE → ATTACK, gated on cluster-aware lower confidence bounds in both $ and R, with hysteresis;
  - concurrency of 2, then 4, then 6–8 only when ≥ 2 engines are at ATTACK;
  - per-trade, per-cluster and same-direction $ risk caps;
  - true shadow tracking plus STALLED twins before any exit change.
- Today no engine qualifies above PROBE.
- PR #80 (P001-R1) Claude verdict: **REQUEST_CHANGES**.
  1. The runner's history select omits `opened_at`, so every `openedAt` is NaN and the cluster trigger is dead code.
  2. Duplicate object keys add 3 new TS1117 errors.
  3. No hysteresis: on recovery Breadth jumps straight back to full size, which contradicts the documented recovery criteria.
  4. The test suite is already red on `main` (3 assertions + 1 TS1117) and must be green before merge.
- Implementation order: fix PR #80 → shadow and STALLED twins → $ caps for all engines → ladder.

## Handoff rule
When either model makes a material proposal, replace the Pending proposal block with the new proposal and add a short note to Issue #79. The second model must independently review before deployment, unless the user explicitly overrides the council for that one change.

## P003 — DEFENSE exploration floor (PR #81)
- Owner: GPT. Status: **REQUEST_CHANGES (Claude)**, 2026-09-30 UTC. Not merged, not deployed. PAPER ONLY.
- Full review is on PR #81.
- Verified OK:
  - DEFENSE + PROBE + n<8 scope;
  - quality floor `max(54, required−10)`;
  - severe soft reasons (news_risk / leverage_against / regime_mismatch);
  - max-2 count, including same-cycle entries;
  - no burst;
  - SHADOW and n≥8 engines excluded;
  - every hard gate still runs after the bypass.
- Blocking:
  1. `explorationFloor.eligible` drives the cap, burst veto, tag and max-2 count even when quality ≥ required. Use `bypass = eligible && quality < required`.
  2. The $5 cap is computed at the touch, before walkBook and slippage, so actual `risk_usd` > $5. Re-clamp on the final px and r.
  3. `micro?.score ?? 50` passes the micro ≥ 42 check with no micro data (budget exhausted or error). Require real micro data.
- Required before merge:
  4. Tests for micro, severe reasons, modes and the floor arithmetic.
  5. A green suite: 3 pre-existing assertions, and TS1117 duplicate `strategy_size_cap` at chan-runner.ts:905.

## OWNER OVERRIDE 2026-09-30 — CHAN-X AGGRESSIVE (v98.0)
- The owner explicitly overrode the council for this single change.
- Status: PAPER_TEST
- GPT review: APPROVED — owner-authorized PAPER-only experiment, with hard execution gates retained and no real trading.
- Claude review: APPROVED — implementation authored by Claude under the explicit owner override.
- Flag `__CHAN_AGGRESSIVE='1'`: 2% risk per trade, up to 8 open, quality floor 50, no DEFENSE, SHADOW→PROBE, Kelly veto off. Hard gates kept. PAPER ONLY.
- This approval is for the requested aggressive PAPER experiment only; it is not a profitability claim.
- Rollback: redeploy the shim without the flag.

## P005 — S1 shadow variant "more exposure + precision" (Claude, 2026-09-30)
- Owner request: "keep trading aggressive, more exposure in the book, but accuracy matters". Owner chose the council route: shadow test first.
- Status: **SHADOW LIVE.** GPT APPROVED shadow-only (PR #82); migration applied, merged b4355437, deployed 22:23 UTC, first journal row 22:25:56, live caps unchanged, 0 errors. Counts only until 100 S1 trades. PAPER ONLY.
- S1 = the P004 filters (regime-consistent comp, micro >= 60 with taker flow on our side, mtf on our side, funding <= 1bp/8h against us, OI rising) + up to 12 open instead of 8.
- It NEVER trades. The runner journals S1's verdict to `chan_shadow`:
  - `live` = trades actually taken;
  - `virtual` = candidates refused only by the 8-position cap.
  - Live behaviour is byte-identical (same caps, same gates, same order); any shadow error is swallowed.
- Pre-registration: `quant/PREREGISTRATION_S1.md`. Counts only until 100 S1-taken trades.
  - PROPOSE live use only if avgR > 0, avgR − baseline >= 0.10R, t(daily) >= 2, and the virtual part >= 0 after the replay-gap correction.
- Prior: LOW (P004 replay: avgR −0.184 vs −0.292, OOS n=4).
- Review asks for GPT:
  1. The ledger never reads `chan_shadow`.
  2. The extra DB count query (at most once per cycle, only when the 8 cap is hit) is acceptable within the lease.
  3. Migration-first deploy order.

## 2026-10-04 v101.1 — Blade CMS scan ~1 s (owner request), house position cards
Detection cadence only: no rule, size, level or risk change. The cron stays at 5 s; a 1 s CMS watch runs inside each cycle with no DB writes per poll. Blade is still SHADOW, DONCH4H unchanged. Paper only.

## P-AGG2 — Level 2 "more aggressive and risky; no lotto, no 50x, no PRO" (owner override 2026-10-04)
- Status: PAPER_TEST pending merge. Branch agg2/fast-evt-donch, one PR. The owner explicitly overrides the council for THIS
  change only and may waive GPT review before merge. PAPER ONLY; no live orders; no account reset.
- Hypothesis: larger bets on the same book with one brake left. NOT a new edge. FAST is expected negative after costs unless
  its own measured gross clears the gate; EVT is the convexity; DONCH4H is the only historically surviving sleeve.
- Exact change:
  - Shim (both CI workflows): `__ENABLED_SLEEVES='FAST,EVT,DONCH4H'`, `__LEVERAGE='1'`, `__FAST_MODE='rt'`, `__FAST_LEV='10'`,
    `__FAST_SHARE='0.50'`, `__FAST_PER_TRADE='0.05'`, `__FAST_MAX_OPEN='8'`, `__EVT_PER_TRADE='0.08'`, `__EVT_MAX_OPEN='3'`, `__SLEEVES_OFF=''`.
  - FAST: real-time burst rule unchanged (4 conditions, 2 ATR(1m) stop with 0.3% floor, 1.5R, 15 min, aggTrades exits, walkBook
    + liqCap entries, 20 entries/UTC day). PSYCH off in rt mode. PROFIT GATE ON: expected gross = measured gross of FAST's own
    confirmed RT signals (fast_shadow, scored at the hold horizon, 15-min clustered, evidence-weighted, >= 30 buckets), full
    cost model from shared/costs.ts, net >= 2 bps. No measurement -> no entry.
  - EVT2: BL1/BD1 rules (quant/PREREGISTRATION_EVT2.md), 8% margin x isolated 10x, <= 3 open, no profit gate.
  - DONCH4H: 1x forced in SQL, 1.25% risk x ADX tier, pyramid ON (2nd >= 0.6R, 3rd all units >= 1.0R, max 3, per-coin 20%).
  - Ledger 20261004120000_agg2.sql: agg2_day (-12% from the UTC day start -> no new entries in any sleeve until the next UTC
    day; exits keep running), FAST lev <= 10 / margin <= 5% / <= 8 open / share <= 50%, EVT lev <= 10 / margin <= 8% / <= 3,
    DONCH lev 1, paper lock in both commit functions. Verified on a local Postgres 16 (tests/sql).
- Found and fixed on the way (hotfix pushed to main separately): blade_commit_cycle full closes failed with "column reference
  fee is ambiguous", so the open AXS DONCH4H row could not have exited at its stop.
- Rollback: shim back to 'BLADE,DONCH4H' (or 'PRO') after closing FAST/EVT rows; DONCH4H rows are managed by both configs.
- Failure criteria: 30 EVT2 events with PF < 1 -> propose EVT off; FAST gate never opens -> FAST is effectively off (report it,
  do not loosen); median detect lag > 15 s -> no EVT size increase.
- 2026-10-04 09:05 UTC: OWNER APPROVED THE MERGE ("מאשר למיזוג"), the council override for P-AGG2. PR #87 merged (94c1beb5) and deployed: v102.0 FAST,EVT,DONCH4H, paper true / live false, 0 errors. Status: PAPER_TEST LIVE.

# AI Council State

Last established: 2026-09-30 UTC

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

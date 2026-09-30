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
- Proposal ID: **P001-R1-BREADTH-DE-RISK**
- Owner: **GPT + Claude**
- Status: **PAPER_TEST**
- Fresh joint reading:
  - GPT independently reproduced Claude's key finding: Breadth has 61 era closes, **-$128.67**, but only **-0.262R total / -0.004R avg**.
  - STALLED exits: 10 trades, **-$131.13 / -6.486R**.
  - STOP exits: 49 trades, **-$0.67 / +4.870R**.
  - Risk >= $30: 8 trades, **-$189.04 / -4.062R**.
  - Breadth trades cluster into 18 opening-hour groups, so raw trade count overstates independence.
- Revised consensus experiment:
  1. Do **not** hard-quarantine Breadth yet because current SHADOW decisions do not produce measurable outcomes.
  2. When Breadth has n>=30 and recent12 Avg R <= -0.35R, or the last 4 hourly clusters average <= -0.50R, reduce to **tiny PROBE ×0.10** with Quality >=72.
  3. Apply a hard Breadth stop-risk cap of **$20 per trade** (also bounded to ~0.8% of sleeve equity).
  4. Remove the special Breadth ×1.20 positive-edge boost; only normal positive-edge promotion remains.
  5. Keep the STALLED exit behavior unchanged for now. Treat it as a separate bounded experiment: measure/replay at least 20 STALLED events before changing exit logic.
  6. Keep portfolio DEFENSE and PAPER ONLY; no risk increase.
- Expected effect: stop large-size Breadth losses from dominating portfolio PnL while continuing to collect real, measurable recovery evidence.
- Recovery criteria: only consider returning from tiny PROBE after both recent trade expectancy and cluster-aware expectancy recover; then return to small/normal PROBE first, never directly to boosted LIVE.
- GPT review: **APPROVED** for this revised bounded PAPER experiment.
- Claude review: **EXPERIMENT / REQUEST_CHANGES incorporated**; final PR review **PENDING**.
- Deployment: **BLOCKED pending Claude PR review + AI Council guard**.
- Rollback criteria: if the risk cap or cluster gate creates execution regressions/errors, revert the PR; no live execution.

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

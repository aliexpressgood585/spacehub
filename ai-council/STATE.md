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
- Claude review: **PENDING**
- Deployment: **BLOCKED pending Claude review**
- Rollback criteria: listed above.

## Handoff rule
When either model makes a material proposal, replace the Pending proposal block with the new proposal and add a short note to Issue #79. The second model must independently review before deployment, unless the user explicitly overrides the council for that one change.

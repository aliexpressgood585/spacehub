# AI Council State

Last established: 2026-09-30 UTC

## Current project
- Repo: `aliexpressgood585/spacehub`
- Trading mode: **PAPER ONLY**
- CHAN era: `CHAN-X-20260929-070731`
- Shared issue: #79

## Council
- Status: **IDLE / onboarding Claude**
- GPT role: telemetry + validation + risk/ledger + implementation review
- Claude role: strategy challenger + research + code review
- Claude acknowledgement: **PENDING**
- Dual-review policy: **ACTIVE for material trading changes**
- Automatic API bridge: **SCAFFOLDED**
- Automatic API bridge secrets: **PENDING** (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`; never place them in chat or commits)

## Current evidence baseline
Use fresh Supabase telemetry before changing strategy. The most recent established direction was:
- Breadth Momentum had the strongest clean-era evidence and was promoted to LIVE/boosted allocation.
- Volatility Breakout had negative clean-era expectancy and was heavily quarantined/recovery-probe only.
- The whole system was still PAPER and not yet proven profitable over a large sample.

These are starting hypotheses, not permanent truths. Re-check current data before every material decision.

## Pending proposal
- Proposal ID: none
- Owner: none
- Status: IDLE
- GPT review: pending
- Claude review: pending
- Rollback criteria: n/a

## Handoff rule
When either model makes a material proposal, replace the Pending proposal block with the new proposal and add a short note to Issue #79. The second model must independently review before deployment, unless the user explicitly overrides the council for that one change.

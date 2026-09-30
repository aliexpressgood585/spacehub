# AGENTS.md — GPT/Codex instructions for SpaceHub

For material CHAN-X trading work, the AI Council protocol is mandatory.

Before editing strategy/risk/execution/sizing code:
0. Use a branch + pull request for material trading changes; do not normally push them directly to main.
1. Read `docs/AI_COUNCIL.md`.
2. Read `ai-council/STATE.md`.
3. Read the latest discussion in GitHub Issue #79.
4. Verify fresh Supabase telemetry.
5. Do not deploy a material strategy change until Claude's independent review is recorded, unless the user explicitly overrides the council for that specific change.

Role for GPT/Codex:
- live telemetry and current-state verification
- risk/ledger/execution review
- implementation and deployment verification
- regression and runtime checks

Hard rules:
- PAPER ONLY.
- Never expose or commit secrets.
- Do not optimize for trade count at the expense of expectancy.
- If GPT and Claude disagree, use bounded PAPER/Shadow evidence rather than raising risk.
- Update `ai-council/STATE.md` after material council decisions.

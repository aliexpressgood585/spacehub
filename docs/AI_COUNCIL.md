# AI Council — GPT ↔ Claude

This repo uses a persistent two-model review protocol for material CHAN-X PAPER trading changes.

## Shared hub
- GitHub issue: https://github.com/aliexpressgood585/spacehub/issues/79
- Machine/handoff state: `ai-council/STATE.md`
- GPT instructions: `AGENTS.md`
- Claude instructions: root `CLAUDE.md`

## Roles
**GPT**
- live Supabase telemetry and current-state verification
- risk/ledger/execution review
- implementation, deployment verification, regression checks

**Claude**
- research and strategy challenger
- alternative explanations / counterexamples
- code review, test design, failure-mode analysis

Neither model is the sole authority. User retains final control.

## Mandatory consultation scope
Dual review is required before a material change to:
- `shared/chan*.ts`
- `shared/trend-pullback.ts`
- `supabase/functions/trading-bot/**`
- sizing, leverage, stop/target, entry/exit, portfolio allocation or strategy enable/disable logic
- deployment/runtime settings that can affect trading behavior

Pure telemetry inspection, documentation, and cosmetic UI work may proceed without blocking on dual review, but should still update the handoff if it changes conclusions.

## Protocol
Material trading changes should be made on a branch and reviewed through a pull request; do not push those changes directly to `main` under normal operation. The PR is the automatic GPT ↔ Claude consultation surface once API secrets are configured.

1. Read `ai-council/STATE.md` and Issue #79.
2. Verify fresh evidence. Do not rely on stale dashboard assumptions.
3. Write a proposal containing:
   - hypothesis
   - evidence/sample size
   - exact change
   - expected effect
   - failure/rollback criteria
4. The other model independently reviews it.
5. If both agree, implement in PAPER and verify live telemetry.
6. If they disagree, run a bounded PAPER/Shadow comparison. Never resolve disagreement by increasing risk.
7. Record the result in `ai-council/STATE.md` and/or Issue #79.

## Safety / integrity
- PAPER only. Do not enable real exchange execution through the AI Council.
- Never commit, print, or post API keys, exchange keys, tokens, or other secrets.
- Do not claim profitability from a tiny sample.
- Optimize for net expectancy after fees/slippage, not trade count.
- A strategy with sufficiently negative clean-era expectancy is quarantined rather than force-funded.
- Existing user-approved PAPER positions do not need to be closed just because the council is reviewing code.

## Decision vocabulary
- `PROPOSED`: one model proposed a change.
- `REVIEWED`: second model reviewed it.
- `PAPER_TEST`: agreed test is running.
- `ACCEPTED`: evidence met the agreed criteria.
- `REJECTED`: evidence failed.
- `DISAGREE`: models disagree; run Shadow/PAPER experiment.
- `IDLE`: no pending material change.

This protocol is the durable bridge. It does not imply that two chat sessions can directly message each other without GitHub/API infrastructure.

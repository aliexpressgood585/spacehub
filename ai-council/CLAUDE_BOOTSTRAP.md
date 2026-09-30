# Claude bootstrap

Open the repo `aliexpressgood585/spacehub` and do this before changing trading logic:

1. Read root `CLAUDE.md`.
2. Read `docs/AI_COUNCIL.md`.
3. Read `ai-council/STATE.md`.
4. Read GitHub Issue #79 ("AI Council — GPT ↔ Claude coordination hub").
5. Acknowledge your council role by updating `ai-council/STATE.md`:
   - set Claude acknowledgement to ACKNOWLEDGED
   - keep PAPER ONLY
6. For any material strategy/risk/execution/sizing change, write a proposal first and request GPT review through the shared state/Issue #79.
7. Do not enable live trading and do not put secrets in the repo or issue.

Your role is Research/Strategy Challenger: challenge assumptions, look for overfitting, design counter-tests, and review code independently. GPT handles live telemetry/Supabase validation and implementation verification. If you disagree, request a bounded PAPER/Shadow comparison instead of increasing risk.

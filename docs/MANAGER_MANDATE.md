# PAPER strategy management — 2026-10-07

The owner authorized autonomous research, strategy selection, retirement and replacement, and an account reset with history preserved. This is PAPER only. This delegation does not guarantee profit or waive the repository's independent review requirement for a specific material change.

## P-MANAGER-RESET-20261007 — PROPOSED

Fresh database telemetry at 16:38 UTC: marked equity $3,551.17, daily baseline $5,059.58, drawdown 29.81%; cash $2,963.86, four open PAPER positions. The daily loss halt was disabled. Live configuration includes several patterns with leverage above the main 15x setting. Current-era DDDDD closed trades: 23, wins 7, net PnL -$774.54. Historical fixed-exit research also failed after costs; it is not identical to every current execution detail.

Decision: do not force every strategy to trade or optimize win rate. Retire entries that lack defensible net expectancy; continue research separately. No candidate is currently approved for a new trading era.

Preservation completed: protected `paper_reset_archive`, key `MANAGER-PRECHANGE-20261007`, contains 50 trades, 1,397 equity observations and one account state. Snapshot count was zero. Original tables and previous archives remain intact.

Concrete proposed action in `supabase/functions/trading-bot/ops/manager_reset.sql`: atomically copy and compare all rows of account state, trades, snapshots and equity; invalidate outstanding leases; reset bankroll to its previous initial $5,000; leave account inactive pending reviewed evidence. Open PAPER rows retain OPEN in the archive: this is an administrative reset, not a fictional market close. Other research, journals, learning data and older archives stay untouched. The run key makes retries idempotent. This SQL is an operator script, not automatically applied at deployment.

Review: GPT implementation review complete; Claude independent review required before execution. Issue #79 recent API reviews report insufficient Anthropic credits. Do not reinterpret that failure as approval. The owner has not explicitly waived review for this specific change.

Failure criteria: missing/unequal backup, non-PAPER data, stale runner writing after reset, repeated reset, entries while inactive. Abort or roll back the transaction on any invariant failure. Never reset again as a strategy rollback. If a later strategy fails, stop its entries and continue its exits.

## Research and promotion rules

- Freeze the signal, exits, universe, costs and trial count before each run; log failures as well as successes.
- Complete sweep and extreme-funding experiments on `research/sweep-funding-20261007`; no parameter search after validation results. Funding archive coverage currently ends October 1; exact settlement rates use minute mark-price proxies for cashflow.
- Screening requires PF > 1.15 and at least 300 trades separately in train and temporal validation, with positive net expectancy after realistic costs. This threshold alone does not establish profitability.
- The validation year has already been researched. Any screening survivor needs a new forward Shadow period, cross-symbol robustness and a portfolio simulation with overlapping positions, exposure, drawdown and actual funding before PAPER activation.
- Future PAPER deployment needs independent council review and explicit documented risk limits. No leverage increase to compensate for missing edge; no unreviewed automatic promotion.
- Scheduled checks can inspect telemetry, complete research and prepare PRs. They must not repeat the reset, change live execution mode, bypass failed reviews or claim work ran continuously between checks.

No profitable strategy or financial return is promised. All hypotheses may fail; remaining in research-only mode is a valid outcome.

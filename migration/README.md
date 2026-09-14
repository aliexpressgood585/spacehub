# Project migration — mdvheizhciuvqychtwxr → new project (user-owned org)

## Why
The live Supabase project `mdvheizhciuvqychtwxr` belongs to a Supabase account
the user can no longer sign into ("You do not have access to this project").
Without management access, `supabase link` fails with
`{"message":"Your account does not have the necessary privileges..."}` and NO
code can be deployed — the v56.6 kill-switch deadlock fix has been stuck in the
repo since 2026-08-17 while the bot sat frozen (zero trades since 2026-08-03).

Rebuilding on a project inside the user's own `spacehub` org removes the
dependency on the lost account permanently.

## Snapshot taken 2026-09-14 (via public anon key — read-only, no admin needed)
| table | rows |
|---|---|
| bot_state | 1 (balance $10,202.64) |
| bot_trades | 124 (all closed) |
| bot_equity | 6,357 (2026-07-10 → 2026-09-14) |
| bot_errors | 25 |
| bot_skips | 160 |
| others | 0 |

Files: `migration/export/<table>.json` — raw PostgREST rows, import as-is.

## Steps
1. [user] Resume/create a project in the `spacehub` org, send its project ref.
2. Point `PROJECT_REF` (workflows) + dashboard URL/anon key at the new project.
3. Deploy → the deploy workflow's migration SQL creates the whole schema.
4. `migration/import.py` replays these JSON files into the new project.
5. Recreate the every-minute cron that invokes the trading-bot function.
6. Verify: heartbeat, universe coverage, kill-switch released (v56.6 stale rule).

The OLD project keeps running untouched until the new one is verified, so there
is no window where the bot is unsupervised.

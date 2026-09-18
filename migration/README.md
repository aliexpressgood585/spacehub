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
1. [USER] Resume (or create) a project in the `spacehub` org, then send two
   PUBLIC values: the **project ref** and the **anon/public key**.
   Never the service-role key — Supabase injects that into the function itself.
2. `bash migration/switch-project.sh <NEW_REF> <NEW_ANON_KEY>` repoints all 12
   workflows + config.toml + setup-optimizer.sh + the dashboard fallbacks.
   It refuses a URL-shaped ref, the old ref, or a service-role key.
3. Commit + push → **Deploy Edge Function** builds the schema (its migration SQL),
   ships the 4 functions and recreates the every-minute cron.
4. Run **Migrate — restore snapshot into new project** (`migrate-restore.yml`)
   with the new ref + `RESTORE` → replays these JSON files.
5. Verify: heartbeat, `?donch_test=1` coverage, shields released, dashboard.

The OLD project keeps running untouched until the new one is verified, so there
is no window where the bot is unsupervised.

## What this migration finally unblocks
Everything that is currently impossible: deploying **v56.6** (the kill-switch
deadlock fix — without it the 45-day freeze can recur), the v56.5 universe fix,
forcing a rotation, and any risk-parameter change (base risk is hardcoded at
`totPort4 * 0.0125`, not DB-settable, so the 1.25% -> 1.75% -> 2.5% ladder needs
a deploy). Today we have read-only visibility and zero operational control.

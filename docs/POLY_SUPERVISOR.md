# Poly supervisor — fixed rules (written 2026-10-15, before any run)

> **Status 2026-10-18:** the supervisor session (scheduled task `trig_01Vjp6cAr2SiufLUJeD21tgz`, outside this repo) has
> been OFF since 2026-10-17 16:16 UTC by the owner's order and is NOT re-enabled: its gates could halve the stake or stop
> entries, and the desks must not be paused automatically. The main desk now only PUBLISHES the gate read-out in
> `pm/state.json` -> `gates` (shared/pm.ts `gateStudy`: n, mean r, t, step_down_hit, stop_hit). Nothing acts on it.

One autonomous supervisor looks after the three Polymarket PAPER desks every 6 hours:

| desk | state file (branch `pm-desk-data`) | workflow | judged since |
|---|---|---|---|
| Poly (favourites 85-92c, last 4h, no crypto) | `pm/state.json` | `pm-desk.yml` | 2026-10-15 18:30 UTC (crypto exclusion) |
| Poly Coins (5m crypto, z filter) | `pmc/state.json` | `pmc-desk.yml` | 2026-10-15 19:00 UTC (first look zMin 2.0, second 2.5) |
| Poly News (geopolitics status quo; news in shadow) | `pmn/state.json` | `pmn-desk.yml` | 2026-10-15 16:10 UTC |

It reads the state files from `https://raw.githubusercontent.com/aliexpressgood585/spacehub/pm-desk-data/<desk>/state.json`.
Only closed trades opened at or after a desk's "judged since" time count (older rules are a different strategy).

## 1. Health (every run)
- `last_scan` older than 20 minutes → dispatch the desk's workflow on `main` (`gh api -X POST
  repos/aliexpressgood585/spacehub/actions/workflows/<file>/dispatches -f ref=main`), check again 3 minutes later.
- A desk that fails twice in a row → report to the owner with the error from the run log.

## 2. Performance gates (per desk, on the judged trades; r = pnl / cost per trade, t = mean(r) / sd(r) * sqrt(n))
Poly News status quo resolves slowly: its gates use n >= 30 / 60 instead of 100 / 200.
- **Step down**: n >= 100, mean(r) < 0 and t <= -1.5 → halve the desk's stake (one step; at most once per 7 days;
  never below 1% of equity per trade).
- **Stop**: n >= 200, mean(r) < 0 and t <= -2.5 → the desk takes no new entries (exits and settlements continue),
  and the owner is told plainly.
- **Restore**: a desk that was stepped down gets one step back only after >= 150 further judged closes with mean(r) > 0
  and t >= 1. Never above its original stake.
- Clustered loss guard: if one hour holds >= 3 losses on one desk, record which markets they were and whether they share
  an underlying (same match / same asset / same theme). Report it; do not change rules on it alone.

## 3. What the supervisor never does
- Never adds a strategy, loosens an entry filter, widens a band, raises a stake above the original, or adds leverage.
- Never changes a rule because of a few trades. Rule changes other than the gates above need a backtest with an
  in-sample / out-of-sample split recorded in `status/` and CLAUDE.md, and are reported to the owner.
- Never touches live execution, real money, keys, Supabase, or the history (state files are never reset or edited).
- PAPER ONLY.

## 4. Every run
- Writes `supervisor.json` on branch `poly-supervisor` (`{ts, desks: {pm|pmc|pmn: {equity, judged_n, mean_r, t, stake,
  action}}, notes}`) — a separate branch so it never races the desks' 15-second pushes.
- Code changes (stake halving / stop) go through a commit on `claude/hebrew-greeting-dynjyk`, tests, merge to main,
  then a workflow re-dispatch, and a line in CLAUDE.md (PM DESK section).
- Reports to the owner in Hebrew only when something happened (an action, a fault, a clustered loss). Once a day
  (the first run after 06:00 UTC) a 5-line status: equity and judged P&L per desk, plus the Kelly line of
  `scripts/pm-kelly-report.py` (edge, EV/$, ¼ Kelly per desk) as defined in docs/POLY_PLAYBOOK.md.

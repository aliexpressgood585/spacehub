# FAST entry review — 2026-09-26

Reviewed the active dashboard's FAST ledger and the deployed release
`6d37519fa122fb7867048a73ed2833d06f9ac91c` (Supabase function version 79).
The reviewed real-time cohort began at 17:45 UTC. At the review snapshot it
contained 11 closed trades (3 positive, 8 negative, combined -$1,180.39) and
one open GRAM short. This tiny sample crosses several fill/exit versions;
it is not a clean estimate of any single strategy's expected performance.

## Findings

- ORDI #654 paid 41.44 bps entry impact against a 47.44 bps initial stop and
  closed almost immediately. The already-deployed v95.7 liquidity cap
  addresses that mechanism; this change preserves it.
- XPL #659 and PONS #661 never recorded a favorable best price beyond entry.
  Their 3-minute signals alone do not establish that momentum persisted at
  the point of execution. Historical intra-minute signal snapshots are
  unavailable, so we cannot claim this patch would have prevented them.
- GRAM #660 was still open when inspected. Do not score an open trade as a
  win/loss or reset its stop when deploying an entry change.
- The runner previously ranked an entire universe scan and then entered from
  those old klines without re-reading the candidate or BTC. Current book
  prices could therefore be paired with a signal that no longer existed.
- `fast-1m-experiment.txt` reports negative out-of-sample results for all tested
  variants, including pullback entries. Those closed-bar proxies are not
  exact replays of the intra-minute strategy and were not rerun here (their
  source price archives are absent from this checkout).

## Implemented: fresh-v1

Keep discovery and its ranking. Before each eligible real-time entry, refresh
the candidate and BTC, require finite contiguous minute bars, then fetch the
book. Re-evaluate the original signal at the book midpoint, preserving its
direction and BTC alignment. Require a <=5-second snapshot and defer if the
midpoint moved more than 0.25 initial risk units from the fresh kline close.
Recheck freshness before passing entries to the ledger. A deferred candidate
gets no additional cooldown and can qualify on the next normal scan.

Record refreshed checks, snapshot/quote ages, price drift and recent flow in
entry metadata and decisions. The two-bar flow-agreement feature is diagnostic
only; it does not silently become another trading gate.

The 5-second/0.25R tolerances are explicit engineering choices, not optimized
or demonstrated profitable thresholds. Extra requests can increase latency
or cause rate-limit deferrals; their frequency must be monitored in decisions.
Leverage, margin allocation, liquidity cap, 3-position/20-entry caps, cooldown,
signal thresholds, trailing exits and paper-only enforcement are unchanged.

## Validation and limits

Deterministic tests cover both directions, expired momentum/BTC alignment,
stale/future quotes, missing/invalid minute data, price drift, refreshing the
actual runner, preserved leverage/allocation and persisted diagnostics.
These establish execution behavior, not profitability. Evaluate fresh-v1
separately from older fill models using net P&L, net R, entry count, rejection
reasons and adverse/favorable excursion; do not tune repeatedly to this small
cohort. No historical trades or open position parameters are rewritten.

# DDDDD execution quality v2 — preregistered PAPER experiment

Owner requested implementation, merge and deployment after the 2026-10-06 audit.
No profitability claim. Hypothesis: reliable tape coverage, feasible execution and
cost-aware protection improve net outcomes; higher win rate alone is not acceptance.

## Frozen design
- Entry signal remains five closed red 5m candles, LONG, TP/SL 1%/1%, no timeout.
- Preserve the active 59-symbol allowlist, 15x / 15% margin ceiling / 8 open / 90%
  allocation / 200 entries per day; daily loss setting remains owner-configured.
- New DDDDD entries: maximum estimated round-trip cost 50 bps (half the 100 bps
  target), halve desired notional against the SAME book until feasible; margin >=$5.
  Keep freshness/spread/funding/depth gates. Price entries at walked ask or the
  3 bps adverse floor. This is feasibility, not measured expected return.
- New entries store versioned protection: entry fee + estimated exit slip/fee +
  two-hour positive funding reserve +2 bps. Trigger=max(+0.4%, stop+0.1%). If trigger
  is above target, do not arm. This is an estimate, not a guaranteed net break-even:
  actual future funding, depth changes and price gaps still cause losses.
  Legacy positions retain their stored/legacy rule; no retrospective repricing.
- Stop gaps use the adverse observed print before modeled slip, not the ideal stop.
- Tape sources have isolated validated paginated buffers. Never claim full coverage
  on a full last page or missing candles. OHLC fallback uses only contiguous CLOSED
  candles, labels its adverse-first path inferred, and retains conservative modeling
  limitations for the partial entry minute (intrabar sequence is unknowable).
- Q15 ledger records marked equity at most once/minute under its existing lock,
  only with valid fresh marks for every remaining position. No reset/backfill.

## Confirmation experiment (observation only)
Seed each newly accepted v2 DDDDD trade once in a separate table. Compare actual
baseline net bps against a virtual entry after the first completed green 5m candle
within 15 minutes of baseline entry. Quote within 60 seconds of that candle close;
otherwise expire without a fabricated fill. Virtual notional <=$100, 1x accounting,
same 1%/1% and v2 protection. Funding forecast is an explicitly labeled zero proxy;
settled exit funding uses the existing settlement model. No capital constraints are
simulated. Resolve two observations/cycle at most, skip near lease expiry, expire
unresolved observations after 24h. Report all no-confirmation, late, data-gap and
expired cohorts, not just favorable completed trades. Never feed this into Q15 edge,
autonomy, the trading ledger or automatic promotion.

Evaluation: freeze this definition; collect >=100 paired resolved cohorts across
>=20 UTC entry days before comparing daily clustered net bps, profit factor and
drawdown with explicit coverage/expiry rates. Also report baseline results for ALL
cohorts. No automatic deployment of the confirmation filter. This sample criterion
does not guarantee statistical significance or profitability.

Rollback: disable new v2 entries while keeping existing-position exits operating;
restore a reviewed prior entry path if needed. Never reset capital or delete trades.
Halt rollout on regression, stale heartbeat, missing marks, checkpoint gaps or live
execution. A weak performance sample triggers review, not increased leverage.

# Flow shadow v1 preregistration

2026-10-05. Owner authorized implementation, merge and deployment of the proposed SHADOW collector only. No orders, ledger writes, account reset, automatic promotion or profit claim.

Six fixed USDT-M instruments: BTC, ETH, SOL, BNB, XRP, DOGE. Receive partial depth20 snapshots (250ms) and aggTrades via Binance combined WebSocket. Evaluate once per second, trailing five seconds after warmup. Candidate requires signed taker notional imbalance >=0.20, top20 notional imbalance >=0.20 and signed midpoint move >=1bp, mirrored for shorts. Reject missing, future or >2s old book/tape, crossed or unsorted books and >8bps spread. Parameters are hypotheses, not trained probabilities.

Hypothetical $1,000 notional; entry/exit walkBook with shared taker fee and adverse minSlip floor. Fixed 30-second horizon, no simulated stops, no maker. At most one observation per symbol per 60 seconds. Skip candidates within 60 seconds of published nextFundingTime (or if schedule missing). No funding settlement crossed is scored. Unavailable/late exit data is marked expired, never fabricated. This is an observable book-fill proxy, not an exchange fill guarantee.

Infrastructure: one 55-second collection session each minute, with five-second warmup and unavoidable restart/data gaps. Persist per-session ticks, reasons, last book ages, errors and shadow outcomes. Background request returns immediately so pg_net cannot stall trading cron. A DB lease prevents duplicate concurrent sessions. Excluded/expired observations must be reported alongside closed ones. No automatic live or paper promotion. Collect >=100 resolved observations on >=20 distinct UTC entry days per direction before proposing evaluation, with daily aggregation, costs, coverage and expiry-bias review. Negative or insufficient evidence stays shadow.

## v1.1 transport change (2026-10-05, same rule)
First live sessions: the CI smoke call ran from a US runner (premiumIndex HTTP 451), and the first cron session (EU)
ran 54 ticks with 0 WebSocket frames. Binance WebSocket streams are silent from Supabase egress (the Binance
liquidation stream has recorded nothing in 3 days; only OKX). Binance REST works there. The collector now polls
depth20 every second and recent trades per symbol every 3 seconds (~1,320 weight/min, guarded by the
X-MBX-USED-WEIGHT-1M header at 1,500 / 1,900 so the trading bot keeps headroom). Signal, costs, horizon and the 2 s
staleness rule are unchanged; with a 3 s trade poll some ticks are rejected `stale_tape`, and missed trade ids are
journalled `tape_gap`. Nothing is inferred.

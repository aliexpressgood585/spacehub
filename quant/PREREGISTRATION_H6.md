# PRE-REGISTRATION — H6 funding-settlement capture (forward-test lab)

Written 2026-09-30, before any forward data exists. The owner wants intraday trading and asked for "an agent
that tests trades forward". The forward-test lab (`shared/forward.ts`, run by `data-collector` every minute)
opens **VIRTUAL** positions only. Nothing trades on it, and no ledger function reads `fwd_trades`.

## Evidence so far (v113bt / v113c)
Signal: the funding rate predictable 60 min before settlement, reconstructed from premium-index 1h klines.
- Rule: |predicted| >= 0.10%, receiving side, entry at T−60m, exit at T+15m, cost 16 bps.
  - In-sample: +5.4 bps, t 0.25.
  - Out-of-sample: +6.7 bps, t 0.74.
- Neighbouring variants are all small and positive (+7 to +23 bps).
- Reading: weak, consistent, **not significant**.

## Rules (frozen)
- Universe: the bot's liquid Binance USDT-perp list (`market_cache.universe`, ~99 pairs). If that list is missing, the pinned 40.
- Signal: Binance's own predicted rate (`premiumIndex.lastFundingRate`), read in the minute window
  [T−60m, T−55m) before the next settlement T. It must satisfy |rate| >= 0.10% per interval.
- Side: the side that RECEIVES funding (rate > 0 → short).
- Entry price: Binance mark price at entry.
- Exit price: mark price at exit.
  - **H6a:** exit at T+15m.
  - **H6b:** exit at the first run at or after T.
- P&L = side × price return − side × realised rate (from `fapi/v1/fundingRate`) − 16 bps.
  If the realised rate is not published within 30 min, the row is closed with `net = null` and `funding_missing`.
- Before **200 closed trades per hypothesis**, ONLY counts may be reported.
- Pass rule for proposing live use to the Council, all required:
  - n >= 200;
  - mean net > 0 and t on daily sums >= 2;
  - positive in both halves of the forward sample.
- Reject if at n >= 200 the mean net is <= 0.
- Any rule change = a new id with a new T0. The table is never edited.

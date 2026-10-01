# PRE-REGISTRATION H7 — Binance listing / delisting announcements (virtual forward test)

T0 = 2026-10-01 (first collector run after deploy). Rules are FROZEN; a change is a new id with a new T0.
Code: `shared/events.ts` (pure, tests in `tests/events.test.ts`); runner: `supabase/functions/data-collector` step `events`.
VIRTUAL ONLY: rows go to `fwd_trades`; nothing is traded and no trading table is read or written.

## Why
v114bt-D (`status/new-sources-v114.txt`): Binance announcements move the USDT-M perp 6-13% in the first minute
(median: listing +6.5%, delisting -12.6%), too fast for a polling bot. After an entry at minute +2 the result over
27 months was positive on average but close to a coin flip (listings: 24 events, win rate 54%, fat tails both ways),
and one delisting row passed only in the second half. Too few events to decide on history; the honest test is forward.

## Rules
- Source: Binance CMS catalogs 48 (new listings) and 161 (delistings), polled every minute (10 newest each).
- LIST: title `Binance Will List <Name> (<SYM>)`, coin already has a USDT-M perp (SYM or 1000SYM) -> LONG.
- DELIST: title `Binance Will Delist A, B and C on <date>` -> SHORT each coin's perp.
- Entry: the first collector run that sees the announcement, at the perp's mark price, only if the announcement is at
  most 10 minutes old. The detection lag is recorded in `note`.
- Exit: first run at/after entry + 60 min (H7L60, H7D60) or + 240 min (H7L240, H7D240), at the mark price.
- Net = side x price move - side x sum of settled funding rates over the hold - 0.40% round-trip cost.

## Evaluation
- Before 30 closed events per hypothesis, ONLY COUNTS may be read (expected: ~1 year for listings).
- At 30: mean net per event > 0 with t >= 2 on per-announcement means, and positive in both halves by time.
- Look count: 4 hypotheses.

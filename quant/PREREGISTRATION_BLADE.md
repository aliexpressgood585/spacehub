# PRE-REGISTRATION BLADE — event attack engine (paper)

Written 2026-10-03, BEFORE any Blade result was computed. Rules below are FROZEN. A changed rule gets a new id and a new
T0; the old record is kept. Code: `shared/blade.ts` (pure), `supabase/functions/trading-bot/blade-runner.ts`,
ledger `blade_commit_cycle`, tests `tests/blade.test.ts`. PAPER ONLY. `ALLOW_LIVE_EXECUTION` is never set.

Why this shape: v76-v121 measured no 1m-4h rule on public price data that pays its costs. The only fast move in the
repo larger than costs is the first minutes after a Binance listing / delisting announcement (v114bt-D: median first
minute +6.5% listing, -12.6% delisting; after minute +2 close to a coin flip with fat tails; ~25 events a year).
So Blade is silent almost all the time and acts only on those events. Expected frequency: about 1-3 trades a month.

## Weapon 1 — listing / delisting sniper (ids BL1 = listing long, BD1 = delisting short)

Detection
- Source: Binance CMS catalogs 48 and 161, 10 newest articles each, polled by the bot cycle (~5 s cadence).
- `detect_lag_ms` = first time the bot saw the article minus the article's `releaseDate`. Logged for EVERY parsed
  article, traded or not.
- Titles: `Binance Will List <Name> (<SYM>)` (suffixes such as "with Seed Tag Applied" allowed) -> BL1, if the coin
  already has a USDT-M perp (SYM or 1000SYM). `Binance Will Delist A, B and C on <date>` -> BD1 for each coin whose perp is
  in the liquid universe (market_cache 'universe'). `Binance Futures Will Delist ...` (perp delisting) is IGNORED.

Entry gates (all must hold; a failed gate is journalled with its reason and nothing is entered)
- age = now - releaseDate <= 30 s (`too_old` otherwise; no chasing).
- quote age <= 5 s, spread <= 8 bps.
- Book walk (`walkBook`, depth 100) of the intended notional: not beyond the visible book, impact <= 25% of the expected
  first-minute move (BL1 650 bps -> 162 bps; BD1 1,260 bps -> 315 bps).
- Costs: taker 5 bps per side + the walked impact on entry; exit taker 5 bps + 5 bps slip (stops / timeouts), targets
  resting at the level (maker not assumed: still charged taker).

Exits (resolved on Binance aggTrades in time order, `resolveExit` convention: stop fills at the first print through it)
- BL1: hard stop -4%. At +3% half the position closes at +3%. The rest trails 1.5 x ATR(14, 1m) behind the best price.
  Hard time limit 15 min from entry.
- BD1: stop +4% (short), target -7%, time limit 240 min.
- Isolated leverage 5x max (paper); liquidation at entry x (1 -/+ (1/lev - 0.5%)) checked before the stop.

Size by level (margin as a fraction of equity; notional = margin x 5)
| level  | condition                                                       | BL1 margin | BD1 margin | max open |
|--------|-----------------------------------------------------------------|-----------:|-----------:|---------:|
| SHADOW | default, and after a failed sample                              | 0          | 0          | 0        |
| PROBE  | >= 10 shadow events and shadow net > 0                          | 2%         | 2%         | 1        |
| ATTACK | >= 30 paper events, PF >= 1.2, net > 0, maxDD < 15%             | 8%         | 5%         | 3        |
| HALT   | Blade day P&L <= -6% of equity, or 5 consecutive losing events   | entries off, exits run |  |  |
- The level the data earns is computed every cycle; the level actually used is min(earned, `__BLADE_MAX_LEVEL`), a
  deploy-time shim (default SHADOW). Data can never raise Blade above what the deploy allows.
- If median `detect_lag_ms` over the last 10 parsed listings is > 15 s, the level is capped at PROBE.

Historical check (run once, AFTER this file is committed): `backtest/research/v122_blade_events.py`
- Announcements 2024-06-01 .. 2026-10-02 from the CMS API, the same title rules as above; perp existence and prices from
  data.binance.vision daily 1m klines of the USDT-M perp.
- The 30 s entry cannot be priced on 1m bars. Two entries are reported: open of minute m0+1 (best measurable, <= 60 s
  after the announcement) and open of minute m0+2 (v114's conservative entry). Inside a bar the stop is hit first.
- Costs: 20 bps round trip base, 40 bps stress. Split by announcement time: first 70% IS, last 30% holdout, read once.
- Reported per announcement (coins of one delisting averaged): n, mean net, win rate, t, worst, per-quarter windows.
- PROBE is allowed only if the holdout net is > 0 at 20 bps AND no window with >= 5 events is worse than -50% of
  summed notional returns. With n in the tens, a positive holdout can be luck; it is reported as such.

## Weapon 2 — liquidation-print squeeze (id BQ1) — SHADOW until >= 50 clean events

Tape: `mkt_liquidations` (OKX; the Binance stream receives no frames from Supabase egress since 2026-09-26).
- Clean event: a 10-second bucket on one pinned-40 coin with >= $250,000 liquidated, >= 70% on one side.
- Candidate rule (NOT traded): price reclaims the pre-cluster mid within 30 s, taker flow flips, BTC agrees -> enter WITH
  the reclaim; stop beyond the cascade extreme; target 1.2R; timeout 8 min.
- The live collector polls OKX once a minute, so a 30 s reclaim cannot be acted on live. BQ1 stays record-only; the
  tape is counted and reported. No sizing, no deploy.

## Weapon 3 — DONCH4H background sleeve (id DX1)

- The existing validated rule (shared/strategy.ts): completed 4h bars, Donchian-15 close breakout, ADX(60 bars) > 22,
  stop max(1.4 x ATR, 0.5%) skip if > 8%, entries only in the first 15 min after a 4h close, pinned 40 coins.
- Size: base risk 1.25% of equity x ADX tier (sizeBreakout chain, riskMult 1.25/1.75), 1x, no pyramiding in this
  runner. Ladder: 1/3 at 0.6R (stop to breakeven), 1/3 at 1.0R, last third trails 2.5 ATR; 16-day cap.
- Entry fills as taker at the walked book. Maker experiment, measurement only: for each entry a virtual post-only
  limit at the touch is recorded; it counts as filled if a trade prints strictly through it within 90 s. Fill rate is
  reported; nothing is sized on it. If < 30% over 40 signals, the experiment ends.

## Isolation
- BLADE rows and DONCH4H rows share one paper book; each runner closes only its own strategy's rows. The branch refuses
  any other open strategy in the book.
- Total notional <= 95% of equity, net directional <= 70% for DONCH4H; Blade event positions may concentrate.

## What would make Blade fail
- Holdout net <= 0 at 20 bps on Weapon 1 -> stays SHADOW.
- Median detection lag > 15 s -> no size above PROBE.
- 30 paper events with PF < 1.2 or net <= 0 -> back to SHADOW.

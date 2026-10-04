Warning: truncated output (original token count: 60349)
Total output lines: 4398

// ════════════════════════════════════════════════════════════
// CryptoBot v57.1 — ROTA was filling at a price up to FOUR HOURS old
//
// v57.1: ROTA ranked momentum from the last COMPLETED 4h candle and then used
//  that same close as the ENTRY and EXIT price. Right for the signal, wrong for
//  a fill: a rebalance can land on any minute of the 4h window, so the fill
//  price averaged ~2 hours stale. Measured on the live 2026-09-18 05:46 rotation
//  (the 04:00 close, 1h46m old): four of the ten opened slots were 1.1-2.3% away
//  from the real market, and the cross-source shield rejected six more that had
//  drifted 1.6-7.2% — 37% of the sleeve skipped, a rule-5 trade cut caused
//  entirely by our own stale feed. The exit path had the same defect, so realised
//  ROTA P&L was measured against fills that never existed.
//  FIX: `fetchLivePrice()` (Binance → OKX → Bybit, ≤1 min old) supplies entry,
//  exit and sizing; the 4h close still supplies the momentum ranking, which is
//  what it is for. One cached fetch per symbol per rebalance.
//  NB the backtest fills at the bar close, which is self-consistent there but
//  unachievable live — this makes the live engine do what the backtest MEANT.
//  It cannot cut trades: it removes false bad-tick rejections.
//
// CryptoBot v56.9 — HEAT LIMIT RACE (the 95% cap that never fired)
//
// v56.9: the portfolio heat limit (v56.0, MAX_HEAT_PCT=0.95) was computed from
//  `allOpen` — ONE snapshot taken at the top of the cycle — while the per-coin
//  scan runs in `Promise.all` batches of 12. Every concurrent entry therefore
//  sized itself against the same stale exposure and none could see the others.
//  Live proof, 2026-09-18 08:00 UTC: six DONCH4H breakouts fired in one cycle,
//  each read heat=47%, each took its full slice — $9,087 of fresh notional on
//  top of ROTA's $4,667 = 138% of a $9,950 account, cash balance -$3,761, and
//  the 95% cap logged nothing. The same snapshot blindness applied between the
//  sleeves: ROTA opens its basket earlier in the very same invocation.
//  FIX: a cycle-scoped running total (heatCommitted / netCommitted) that both
//  sleeves add to. A breakout reserves its room synchronously — before the first
//  `await`, which is the only place a sibling in the batch can interleave — and
//  releases it on every path that then bails out.
//  NB this does NOT cut trades (standing rule 5): v56.0's design already TRIMS
//  an entry to the room left and only skips under $500, and v65bt established
//  that simultaneous same-side breakouts are the WINNERS and must never be
//  capped by count. What was broken was the arithmetic, not the policy.
//  It surfaced only now because v56.7 restored the universe from 21 to 40 coins;
//  at half a universe, six simultaneous qualifying breakouts were rare.
//
// CryptoBot v56.8 — RELEASE PROVENANCE + honest regime label
//
// v56.8: closes the external audit's first finding — that nobody could map the
//  public page to a git commit to a deployed function, so no live number could be
//  honestly attributed to the validated DONCH4H/ROTA system.
//  (1) The deploy entrypoint pins the source to a commit SHA and passes it in on
//      globalThis; the bot republishes it to `deployment_manifest` (once per cold
//      start) and in every `?donch_test=1` response, together with a fingerprint
//      of CRYPTO_40 so a silently edited universe shows up as a different release
//      even at the same SHA. Verifiable with the public anon key alone.
//  (2) bot_state.market_regime was written as `btcRegime + '_v23_5M'` — a label
//      left over from the retired v23 5-minute engine. The 4h bot has not used
//      that engine for many versions, but the dashboard faithfully displayed
//      "RANGING_v23_5M", which is what led an outside reviewer to conclude a
//      second 5-minute engine was live. The suffix is gone; the field now says
//      what actually runs.
//
// CryptoBot v56.7 — UNIVERSE COVERAGE FIX (the volume floor was eating CRYPTO_40)
//
// v56.7: fetchFuturesCoins() ranked every source by 24h volume, dropped anything
//  under a hardcoded floor ($50M Binance / $20M OKX) and kept only the top 60 —
//  rules written in v34-v40 when the universe was still dynamic. Both strategies
//  have been PINNED to CRYPTO_40 since v48, so that ranking no longer selects, it
//  only subtracts: on the first cycle of the migrated project (2026-09-18) just 12
//  Binance SPOT pairs cleared $50M (10 of ours) and OKX left 21/40, so the bot
//  scanned half the validated universe and ROTA filled 10 of its 16 slots. Now a
//  CRYPTO_40 symbol is taken at whatever volume its source reports; the floor and
//  the slice only govern the extra non-pinned names. Per-trade liquidity is still
//  enforced at entry by the v54 guard (notional <= 0.5% of 24h volume). This adds
//  trades and restores the backtested universe — it never removes a signal.
//
// CryptoBot v56.6 — KILL-SWITCH DEADLOCK FIX (why the bot stayed quiet)
//
// v56.6: (1) The per-strategy health kill-switch could never auto-resume.
//  It pauses ENTRIES; once both switches fired and the book emptied, no new
//  trades closed, so the "last 30 closed" window froze and the stated
//  "auto-resumes when the window heals" was structurally impossible. Live
//  result: zero trades 2026-08-03 → 08-17 while the bot looked perfectly
//  healthy (heartbeat fine, universe 42, feeds green). Fix: a window whose
//  newest close is older than HEALTH_STALE_H (48h) is stale and is released
//  with a log line — a genuinely recent losing streak still pauses as before.
//  (2) `.eq(...).catch(...)` threw "catch is not a function" (the PostgREST
//  builder is a thenable, not a Promise), aborting the per-coin scan handler
//  during exits — 10 sites swapped to `.then(ok, err)`.
//
// CryptoBot v56.5 — UNIVERSE COLLAPSE FIX (why the bot went quiet)
//
// v56.5: fetchFuturesCoins() accepted the first source returning >=10 symbols.
//  With Binance fapi geo-blocked (451), a degraded SPOT response of exactly 11
//  symbols cleared that bar and short-circuited the healthy OKX fallback (~39).
//  The live tradeable universe silently collapsed 40 -> 11: DONCH4H stopped
//  seeing most breakouts (BNB adx47 / ADA adx61 / LTC adx29 all missed on
//  2026-08-07) and ROTA could not rank top-8/bottom-8 from 11 coins.
//  Fix: sources are now scored by COVERAGE of the validated 40-coin universe
//  (MIN_UNIVERSE_COVERAGE=25) instead of raw symbol count; the richest source
//  seen wins if none clears the bar, and FIXED_COINS remains the last resort.
//  donch_test now reports coverage so this can never hide again.
//
// CryptoBot v56.3 — bad-tick shield tolerance 0.5% → 1.5% (rule-5 fix)
//
// v56.3: the cross-source sanity check skipped 5 healthy ROTA slots in a single
//  rebalance (ICP/LINK/AAVE/AVAX/INJ, 2026-07-16 11:54) — a 0.5-1% OKX↔Bybit
//  basis on alt perps is routine, while real bad ticks are off by 10-100×.
//  Tolerance widened to 1.5% (still catches every real bad tick); the actual
//  divergence % is now logged in bot_skips detail for data-driven tuning.
//
// CryptoBot v56.2 — LADDER LEG P&L ACCOUNTING FIX (critical analytics bug)
//
// v56.2: ladder leg profits (⅓@0.6R, ⅓@1.0R) were credited to balance but
//  NEVER stored on the trade row — the row closed with only the final third's
//  pnl. Result: a trade that banked +0.53R in legs then BE-stopped showed as
//  a small LOSS. Live WR read 8% vs the real ~66%; the per-strategy health
//  kill-switch (sums last-30 pnl) was on track to falsely pause a profitable
//  DONCH4H; the 50-trade checkpoint would have read garbage. Fix: new
//  legs_banked column accumulates leg pnl; every close path stores
//  pnl = final leg + legs_banked. SQL migration backfills closed & open
//  laddered rows (0.2×risk_usd for stage 1, 0.5333×risk_usd for stage 2).
//  Balance was always correct — this is analytics/kill-switch data repair.
//
// CryptoBot v56.1 — donch_test CRYPTO_40 filter (rule-2 fix)
//
// v56.1: donch_test=1 diagnostic was scanning tokenized stocks (SKHYNIX, SNDK,
//  MU, SOXL, LIT etc.) because OKX fallback exposes non-crypto perps and the
//  diagnostic path lacked the CRYPTO_40 filter that the main bot already uses.
//  Fixed: coinsD now filtered to CRYPTO_40 before the breakout scan. No strategy
//  change — diagnostic-only fix.
//
// CryptoBot v56.0 — Portfolio Heat Limit (capital-safety guardrail)
//
// v56.0: MAX_HEAT_PCT=0.95 — DONCH4H entry is trimmed/skipped when total
//  open notional (ROTA 70% book + all DONCH4H positions combined) would
//  exceed 95% of portfolio value. Closes the over-allocation gap where both
//  strategies firing simultaneously pushed total notional to ~115% of account,
//  forcing a negative free balance. Capital-safety guard in the same category
//  as the daily-loss limit (v50) and liquidity guard (v54): trims to fit;
//  skips (heat_limit in bot_skips) only when < $500 remains. No backtest
//  change needed — this guard is a live-trading safeguard only.
//
// CryptoBot v55.0 — LIVE EXECUTION ADAPTER (Bybit v5) — triple-locked, OFF by default
//
// v55.0: the execution seam of EXECUTION_MODEL.md, implemented. Five seam
//  points (DONCH4H open, ROTA open/close, ladder legs, final closes) route to
//  real Bybit reduce-only/market orders ONLY when ALL THREE locks open:
//  (1) BYBIT_API_KEY+SECRET secrets exist, (2) bot_state.paper_mode=false,
//  (3) env LIVE_TRADING='1'. Otherwise identical paper behaviour, bit-for-bit.
//  Real avg fill price replaces the simulated fill when available; lot-size
//  rounding via instruments-info; rejected orders → logErr + retry next cycle
//  (positions never orphaned); exchange-vs-DB reconciliation every 5 min
//  (alert-only); legacy 5m engine hard-disabled in live mode (only validated
//  strategies touch real money). Ladder legs execute as reduce-only MARKET in
//  v55 (taker, ~3bps worse than modeled maker — measured at small capital
//  before any size-up; resting-limit upgrade is the documented next step).
//
// CryptoBot v54.0 — ops hardening (zero strategy changes)
//
// v54.0: (1) bot_errors table + logErr() — swallowed exceptions become
//  visible; watchdog alerts on spikes (the RLS bug of 2026-07-12 hid because
//  errors were silent). (2) Paper realism: 3 bps adverse slippage on market
//  fills (entries, stops, ROTA turns; maker TP legs stay clean) + hourly perp
//  funding sim (longs pay / shorts receive 0.01%/8h) — the 50-trade
//  checkpoint now measures real economics. (3) bot_skips journal — every
//  skipped signal (ADX gate, caps, bad ticks, pyramid gate) is recorded: a
//  free live dataset for future research. (4) Liquidity guard — DONCH4H
//  notional capped at 0.5% of 24h volume (no-op at paper scale, protects
//  real capital later). (5) Watchdog: error-spike alerts + auto 50-trade
//  checkpoint issue.
//
// CryptoBot v53.0 — trailing final third (validated v58bt)
//
// v53.0: the DONCH4H ladder's final third now TRAILS (chandelier, 2.5×ATR4)
//  instead of capping at a fixed 1.6R. v58bt walk-forward (36m, 11,218 signals):
//  +0.0620R vs +0.0456R, total 696R vs 512R (+36%), all 6 windows positive.
//  First two legs (0.6R/1.0R) still bank maker; the trailing exit is taker.
//  Same batch: ADX risk tiers CONFIRMED still monotonic on DW=15 (no change);
//  long/short asymmetry NOT deployed — SHORT +0.089R vs LONG +0.006R is large
//  but LONG is negative in 3/6 windows = regime-dependent (this 3y window was
//  short-favourable), a directional tilt would blow up in a bull market. Watch.
//
// CryptoBot v52.1 — visibility & measurement ops (no strategy change)
//
// v52.1: (1) risk_usd stored at DONCH4H entry → live avg R vs the +0.046R
//  band computed exactly (ping + daily report). (2) shields JSONB published
//  to bot_state each cycle → dashboard shield card + watchdog opens/closes
//  a GitHub issue when any shield trips. (3) ?reset=1 now truncates
//  bot_equity so the era anchor moves with a reset. (4) deploy workflow
//  retries the CLI setup once (transient GH download failures). (5) weekly
//  trade-journal CSV export workflow (backup + Excel journal).
//
// CryptoBot v52.0 — ROTA K=8 (validated v56bt)
//
// v52.0: rotation 8 long / 8 short — annT 39.2% vs 38.2% (K=7), maxDD 15%
//  vs 20%, all 6 windows positive. Same batch REJECTED per the pre-set bar:
//  • DW 10/12/20 — the DW curve peaks at 15 (12→509R, 20→457R vs 512R
//    baseline; 10 has w5 negative). Smooth hill = DW=15 is not a fluke.
//  • ADX gate 18/20 — both flip w5 (and 18 also w1) negative. Keep 22.
//  • entry cooldown 1 bar — tempting (+33% totR, n=14,113) but w5 -4.7‰
//    violates the all-windows rule. NOT deployed; noted for re-test only if
//    a future batch shows w5-era robustness some other way.
//  • ROTA K=9 — w3 negative, annT collapses to 32.8%.
//
// CryptoBot v51.0 — DONCH4H Donchian window 25 → 15 (breadth upgrade)
//
// v51.0: v55bt walk-forward (36m, 6 windows, real fees) showed DW=15 keeps
//  the full edge with far more signals: n=11,218 vs 8,421 (+33% trades),
//  avg +0.0456R/trade, ALL 6 windows positive, total 512R vs 420R (+22%).
//  DW=15 was never tested in the old refine grids ([25,30,40,55,70]).
//  Same ADX(60)>22 gate, SL=1.4×ATR, ladder exits, pyramiding unchanged.
//  Also tested & REJECTED in v54bt/v55bt: 4th pyramid unit at 1.6R
//  (-0.0088R incremental), volume-confirmation filter (rule-5: cuts 26-63%
//  of trades), ROTA skew weights (-0.3pp, worse DD), session filters
//  (rule-5), DW=40 slow sleeve (window-1 negative), ROTA 7d horizon
//  (annT 13.5% vs 38.2%), 12h Donchian sleeve (2 windows negative).
//
// CryptoBot v50.2 — bug-review fixes (full code audit)
//
// v50.2: (1) equity snapshots are now MARK-TO-MARKET (were entry-priced —
//  unrealized losses were invisible to the -5% daily brake until stops
//  realized them). (2) Era-anchored stats: the 50-trade checkpoint counter,
//  expectation-band check and per-strategy dashboard stats now count only
//  trades closed after the account epoch (min bot_equity.ts) — pre-reset
//  trades were polluting the sample. (3) Dashboard equity maxDD now spans
//  ~20 days of snapshots (sparkline stays 4d). NOTE for future resets:
//  ?reset=1 should also truncate bot_equity to move the epoch.
//
// CryptoBot v50.1 — data-integrity shields
//
// v50.1: (1) USDT depeg monitor — USDC/USDT >1% off peg pauses new entries
//  (the one catastrophe stops can't handle; fails open on fetch errors).
//  (2) Cross-source price sanity — entries (DONCH4H + ROTA) require Bybit to
//  agree with the scan price within 0.5%, so a bad tick can never open a
//  position. Pure risk shields, zero strategy impact.
//
// CryptoBot v50 — DAILY LOSS LIMIT (black-day circuit breaker)
//
// v50: if equity drops >5% below its 24h peak (bot_equity snapshots), NEW
//  entries and rebalances pause until the 24h window heals. Open positions
//  keep their stops/BE/ladders — the brake stops adding risk, it never
//  panic-sells the book. User-approved safety addition.
//  Same batch, REJECTED (v49bt): top-trader positioning tilt (following
//  whales HURT: +0.049 vs +0.050R; fading them +0.051R = below the +0.004R
//  deploy bar) and Fear&Greed sizing tilt (noise both directions).
//
// CryptoBot v49 — pyramid depth 3 + ROTA K=7 (validated) + ops pack
//
// v49 (walk-forward 36m, 6 windows, real fees — status/bt-latest.txt):
//  • ROTA K 5→7: annT 38.2% vs 34.4%, maxDD 17% vs 26%, all windows ✅
//  • PYRAMID depth 3: 3rd unit stacks when all open units ≥1.0R — 9,091
//    trades, +0.047R, all windows ✅ (more trades, same edge)
//  • REJECTED: 1h Donchian sleeve — ALL configs negative after fees
//    (w1/w2/w5/w6 <0). Same fee-ceiling failure mode as 5m meanrev.
//  • Ops: Bybit third candle source (fapi→OKX→Bybit); watchdog workflow
//    (issue alert if heartbeat stale >15min); daily report workflow (08:00 IL);
//    dashboard: equity maxDD + 50-trade checkpoint progress.
//
// CryptoBot v48 — stablecoin exclusion + FIXED_COINS = CRYPTO_40
//
// v48: fetchFuturesCoins() now excludes stablecoins (USD1, USDC, FDUSD, etc.)
//  from all three fallback tiers; added Array.isArray guard to prevent silent
//  JSON format mismatches; FIXED_COINS updated to match the 40-coin validation
//  universe; donch_test response now includes fetch_source for diagnosis.
//
// CryptoBot v47 — MAKER exits (validated)
//
// v47: ladder TP legs (0.6R/1.0R/1.6R) now fill at the exact level with maker
//  fee 0.02% — they are resting limit orders in a real account. 36-month
//  walk-forward, 8,421 trades: +0.050R vs +0.046R all-taker, all 6 windows ✅.
//  Applies to already-open positions via the manage loop. Stops/timeouts and
//  all entries remain taker 0.05%. Tested & REJECTED same batch: limit-retest
//  entries (K=1/2/3 + chase — better fee/price but loses the momentum;
//  windows negative), pure-limit entries (drops 35% of trades AND negative).
//  Binance liquidationSnapshot archive DOES NOT EXIST → cascade fade was
//  re-validated with OI-crash detection from the metrics archive (20 coins,
//  6.35M samples, 36 months): ALL 12 configs NEGATIVE (avg -0.008..-0.068R,
//  WR ~60% but losers outsize winners — catching falling knives). REJECTED.
//
// CryptoBot v46 — measurement pack + PYRAMID (validated)
//
// v46: expectation-band check, bot_equity history + dashboard curve, combined
//  per-coin exposure cap 20%, OKX retry/backoff, and PYRAMIDING: a 2nd breakout
//  unit stacks on a ≥0.6R same-direction winner (9,000 trades, +0.062R, all 6
//  windows ✅). Tested & REJECTED by walk-forward: 70-coin universe (w1<0),
//  daily Turtle sleeve (w3<0), daily rotation (3 windows <0) — not deployed.
//
// CryptoBot v45.1 — SPORTY risk profile (user-selected)
//
// v45.1: rotation book 50%→70% of portfolio (validated at full book: +48%/yr,
//  DD 25%); DONCH4H base risk 0.75%→1.25% (ADX-tiered up to 2.5%), position
//  cap 15%→20%. Same entries, same exits — only capital allocation scaled.
//  Expected: ~55-75%/yr with ~25-30% worst drawdowns. User accepted the DD.
//
// CryptoBot v45 — LADDER exits (⅓@0.6R → BE → ⅓@1.0R → ⅓@1.6R)
//
// v45: exit ladder validated on 36 months / 8,421 trades: +0.064R/trade maker
//  (+16% vs SPLIT), same 66.1% WR, all 6 walk-forward windows positive.
//  Also tested & REJECTED: Sharpe-momentum ranking (30.6%/yr vs 44.7% raw);
//  funding tilt measured at −0.003R/trade — negligible, no action.
//
// CryptoBot v44 — real fees, ADX-tiered risk, strategy dashboard, monthly regression
//
// v44: (#1-fees) FEE=0.05%/side live — sim now matches validation assumptions.
//  (#3-ADX sizing) breakout risk scales 0.75x→2.0x with entry ADX (validated
//  monotonic expectancy ladder). Vol-targeting tested: better ratio (DD 25→18%)
//  but lower absolute return (48.4→39.8%/yr) → NOT deployed (profit priority).
//
// CryptoBot v43 — DONCH4H + ROTATION, risk-sized & health-guarded
//
// v43 (all walk-forward validated on 36 months):
//  #1 DONCH4H risk-based sizing: 0.75% portfolio risk per trade (cap 15%/pos).
//  #2 Rotation inverse-vol weights: 48.4%/yr maker (was 45.9%), maxDD 25% (was 35%).
//  #4 Per-strategy health kill-switch: last-30-trades sum<0 → strategy pauses itself.
//  Tested and REJECTED by validation: skip-last-bar momentum (worse: 37.7%/yr),
//  funding carry (failed window 2 of walk-forward). Not deployed — by discipline.
//
// v42: SECOND STRATEGY — cross-sectional momentum rotation, market-neutral.
//  Every 48h: rank universe by 14-day momentum, LONG top-5 / SHORT bottom-5,
//  5%/slot (50% allocation). 36-month proof: +45.9%/yr maker, +41%/yr taker,
//  maxDD 35%, all 6 walk-forward windows positive. Uncorrelated with DONCH4H:
//  rotation earns from dispersion (works in flat markets), breakouts from trends.
//
// v41.4: frequency upgrade — Donchian window 40→25, ADX gate 25→22.
//  36-month grid: ALL 15 window×gate configs positive in all 6 walk-forward
//  windows; dw25|adx22 is TAKER-robust with +57% more trades (7.7/day on 39
//  coins → ~11/day on the 56-coin universe), WR 66.1%, maker +0.055R/trade.
//
// v41.1: SPLIT exit — half off at 0.6R → SL to breakeven → rest to 1.0R TP.
//  36-month validation (5,414 trades, 39 coins, Jul23-Jul26, fees included):
//  WR 67.1% (was 54.7%), maker +0.071R/trade, maxDD 54R (was 78R),
//  positive in all 6 half-year walk-forward windows. Approved by user.
//
// v41: STRATEGY REPLACEMENT — backed by 6-month research on real Binance data:
//  Entry: Donchian-40 breakout on 4h bars + ADX(4h)>25 trend filter.
//  Exit:  fixed TP 1.0R / SL 1.4×ATR(4h), 16-day timeout. NO trailing,
//         NO partial TP, NO 5m-based early exits (all gated by mtf:false).
//  Proof: 849 trades / 39 coins / 181 days: +0.119R per trade at maker fees,
//         +0.099R at taker; positive in ALL 3 walk-forward windows; 11
//         neighboring configs also robust (stable hill, not curve-fit spike).
//  Entries evaluated only in the 15 min after each 4h close; managed vs live
//  price every scan. Legacy 5m confluence engine left in place but unreachable.
//
// v40: BACKTEST-DRIVEN — 44d/40-coin replay on real Binance data showed the
//  strategy is net-negative in EVERY config, BUT the score-75 gate was the
//  least-bad (21% WR, PF 0.71) → the score carries real edge only at the top.
//  So: keep the strict gate, take MORE of the good setups, weight capital by
//  conviction — do not pump low-quality volume.
//   1. Score-weighted sizing: 0.8x/1.0x/1.3x/1.6x by finalScore (was flat split)
//   2. MAX_OPEN 20→30, entries/scan 5→8: stop throttling good (75+) setups
//   3. Universe 40→60 coins (keep $50M floor): more chances to find 75+ setups
//   4. Streak pause 2h→30min: keep trading through drawdowns (still a breaker)
//  Keeps v39: gate 75, no partial TP, BE 1.5R / trail 2.0R, net-exposure cap 60%.
//
// v39: EXPECTANCY + RISK OVERHAUL (all changes except fee-sim, added later)
//  1. Partial TP REMOVED: capped winners → negative expectancy at 32% WR.
//     Winners now run to full 2.5R TP, protected by breakeven(1.5R)+trail(2.0R).
//  2. Net directional exposure cap 60%: no more all-shorts concentration
//     (that lost $1,150 unrealized when the market rose).
//  3. Liquidity floor $5M→$50M, universe 100→40 coins: no illiquid junk.
//  4. Side logic fix: EMA cross only counts with real separation (≥0.05%),
//     no free point on a flat EMA → side was near-random before.
//  5. Optimizer: min 50 trades before Claude tunes (was 5) — no curve-fit
//     on noise; equal position sizing (from v38) retained.
//  6. Clean-slate reset: zeroes peak/stats + clears optimizer params.
//
// v38: WIN RATE FIXES — analysis showed 31.3% WR, PF 0.80 (losing money)
//  1. Score threshold 60→75 + base floor 50→65: filter out weak entries
//  2. Trail breakeven 0.5R→1.0R: stop killing winners before partial TP
//  3. TP 1.8R→2.5R: give winners room to reach full TP (was only 5% of exits)
//  4. MAX_OPEN_TRADES 50→20: focus on quality not quantity (was shotgunning 40+ coins)
//  5. MAX_NEW_ENTRIES_PER_SCAN 15→5: don't spray 15 entries per minute
//  6. STREAK_PAUSE 10min→2h: meaningful circuit breaker (10min was useless)
//  7. Side filter gap 25%→15%: with LONG WR 20% vs SHORT 38.5%, gap=18.5% → filter LONGs
//
// v37: Equal-weight spread across ALL open slots — floor = remainingExposure / slotsLeft
//  so idle cash is distributed evenly over MAX_OPEN_TRADES positions, not large chunks.
// v36: Fix idle-cash bug — remainingExposure now based on totalPortfolio (cash+exposure)
//  Old formula: balance × 1.0 - currentExposure → went negative → floor=0 → idle cash
//  New formula: (balance+currentExposure) × 1.0 - currentExposure = balance → always deploys
//  Also: chunkSlots 10→5, floor always active (no 10% threshold), MAX_NEW_ENTRIES 10→15
// v35: Futures-only prices — klines and ticker now from fapi.binance.com (not spot)
// v34: DYNAMIC UNIVERSE + MOMENTUM PRE-BREAKOUT (Signal #18)
//  Coin universe: replaced 30 fixed coins with ALL active Binance Futures
//  USDT perps with ≥$5M 24h volume (up to 100 coins), fetched live each scan.
//  Signal #18 (+20 pts): detects early momentum before the main move.
//  Need 3 of 4: volume spike ≥4×, 24h change 3-30% in right direction,
//  OI surge ≥15%, price breaking above/below 20-bar swing extreme.
//  Partial credit (+10 pts) for 2 of 4. Additive — never a gate.
//
// v33: LIQUIDITY ZONE — Signal #17 (+15 pts)
//  Fetches OI history from Binance Futures to validate liquidation clusters.
//  LONG: swing low below price + OI elevated + price bounced from zone with wick.
//  SHORT: swing high above price + OI elevated + price rejected from zone with wick.
//  SL is tightened to just outside the zone when signal fires.
//  Additive bonus — never a gate.
//
// v32: SCALPING MODE — fast in, fast out
//  - MAX_HOLD_MIN 180→60 (max 1h hold per trade)
//  - SYM_COOLDOWN_MS 15→5 min (re-enter same coin faster)
//  - MAX_NEW_ENTRIES_PER_SCAN 2→5 (fill positions faster)
//  - tpR 2.2→1.5 (take profit sooner)
//  - slMult tighter (1.2/1.0/0.8)
//  - Trail SL starts at 0.5R (was 1.0R)
//  - PARTIAL_TP_BY_VOL 1.2/1.5/1.8 → 0.8/1.0/1.2
//
// v31: ENTRY QUALITY IMPROVEMENTS
//  A. ADX hard gate: non-rangeFade entries require ADX >= 20 (trend must exist)
//  B. Loss cooldown: 4-hour cooldown per coin+direction after a losing trade
//  C. MAX_OPEN_TRADES raised to 30 (no artificial cap on good setups)
//
// v30: BOS + EMA200 MACRO ALIGNMENT (Signals #15 & #16)
//  Signal #15 BOS (+8 pts): Break of Structure — bar closed above 20-bar
//  swing high (LONG) or below swing low (SHORT). Confirms momentum, not spike.
//  Signal #16 EMA200 (+8 pts): EMA50 vs EMA200 on 1H (Golden/Death Cross).
//  Partial credit (+4) when macro is neutral. Both are additive bonuses only.
//
// v29: STOP-HUNT / SPRING / UPTHRUST DETECTION
//  Signal #13 (+10 pts): detects liquidity sweeps where price briefly
//  breaks a swing extreme (wiping leveraged stops), then reverses with
//  a long wick and elevated volume — classic Wyckoff Spring (LONG) or
//  Upthrust (SHORT). Additive bonus, never a gate, so trade count
//  stays the same or increases on sweep setups.
//
// v28: FOCUS UNIVERSE — 10 most liquid majors only
//
// v27 upgrades (let winners run):
//  1. TRAIL FROM 1R: breakeven trail starts at 1.0R (was 0.5R — cut winners)
//  2. PARTIAL TP LATER: 1.2-1.8R by vol regime (was 0.8-1.5R)
//  3. EARLY EXIT ONLY ON LOSERS: EMA reversal exit no longer closes winners
//  4. BIGGER POSITIONS: notional cap 8%→12%, total exposure 20%→30%
//  5. OPTIMIZER FLOOR: min_confluence_score clamped to >= 60
//  6. (v27.2) BTC BIAS GATE + max 2 new entries per scan
//  7. (v27.3) TREND-CONTINUATION SETUP: short the bounce in downtrends,
//     long the dip in uptrends — bot is no longer idle in bear markets
//  8. (v27.4) RANGE-FADE MODE: band-extreme fades in low-ADX chop get
//     normal size, score credit, and a realistic mid-band TP
//  9. (v27.6) REVIEW FIXES: coin-1H override for BTC gate, 0.6R half-risk
//     lock, base-score floor 50, tp_r wired to live TP, backtest/live
//     gate parity, dead code removed (findSimpleEntry, shouldSkip, ultra)
// ════════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2'
// ── v59.0: THE STRATEGY IS NO LONGER DEFINED IN THIS FILE ──────────────────
// Signal, gate, stop distance, sizing, the ladder state machine, the ROTA
// ranking and every constant they read now live in shared/strategy.ts, which
// the backtest imports from as well. Before this, each side carried its own
// transcription of the rules; they agreed on the indicators and diverged on
// everything around them, and v79bt is what that cost — a full 36-month run
// that reproduced the documented trade count and not the documented window
// profile, with no way to tell a bad reimplementation from a decayed edge.
//
// The relative path matters: this function is deployed as a one-line entrypoint
// that imports this file from raw.githubusercontent at a pinned commit SHA, so
// '../../../shared/strategy.ts' resolves against that SAME SHA. The deployed
// bundle and the backtest therefore run identical text, and the release manifest
// pins both at once.
import * as S from '../../../shared/strategy.ts'
import { runScalp } from './scalp-runner.ts'
import { runRota, rotaConfig } from './rota-runner.ts'
import { runBrkv, brkvConfig } from './brkv-runner.ts'
import { runLab, labConfig } from './lab-runner.ts'
import { runFast, fastConfig } from './fast-runner.ts'
import { runChan } from './chan-runner.ts'
import { runList } from './list-runner.ts'
import { runFund } from './fund-runner.ts'
import { runEvt, runEvt2 } from './evt-runner.ts'
import { runPro } from './pro-runner.ts'
import { runQ15, settleQ15Shadows } from './q15-runner.ts'
import { runBlade, runDonch, cmsWatch, BLADE_SCAN } from './blade-runner.ts'
import { meetingDue, capDecision } from '../../../shared/team-meeting.ts'

const BINANCE_DATA = 'https://data-api.binance.vision/api/v3'
const BINANCE      = 'https://api.binance.com/api/v3'
const FAPI         = 'https://fapi.binance.com/fapi/v1'
const FAPI_DATA    = 'https://fapi.binance.com/futures/data'

// v48: aligned with CRYPTO_40 validation universe
const FIXED_COINS: string[] = [...S.CRYPTO_40]
const FALLBACK_COINS = FIXED_COINS
// v56.5: single source of truth for the validated 40-coin universe. Both strategies
// are pinned to it, so a data source is only useful in proportion to how much of it
// it actually covers — see fetchFuturesCoins().
const CRYPTO_40_SET = new Set(FIXED_COINS)
// A source must cover at least this many of the 40 before we accept it and stop
// trying better ones. The old bar was "any 10 symbols", which let a degraded feed
// short-circuit a healthy fallback.
const MIN_UNIVERSE_COVERAGE = 25
const MIN_COIN_WIN_RATE = 0.42
const MIN_COIN_TRADES   = 8

const CORR_GROUPS: string[][] = [
  ['BTC'],
  ['ETH','ARB','OP'],         // ETH ecosystem
  ['SOL','AVAX','APT','SUI'], // high-beta L1s
  ['DOGE','SHIB'],            // meme
  ['ADA','DOT','ATOM','ALGO','VET','ICP'], // alt L1s
  ['LINK','AAVE','UNI','CRV'],// DeFi
  ['LTC','BCH'],              // BTC forks
  ['XRP','HBAR','XLM'],       // payment layer
  ['BNB'],
  ['NEAR','FIL'],             // storage/infra
  ['INJ','SEI','TRX'],        // misc
  ['WLD'],
]
const MAX_PER_GROUP  = 3
const MIN_SCORE      = 2
const VPOC_MAX_DIST  = 0.035

// v21: Dynamic partial TP by vol regime
const PARTIAL_TP_BY_VOL = { LOW: 1.0, MEDIUM: 1.2, HIGH: 1.4 }  // v32: balanced partial TP

// v21: Session-based sizing + strictness
const SESSION_PARAMS = {
  ASIAN: { sizeMult: 1.0, minScoreBonus: 0 },
  EU:    { sizeMult: 1.2, minScoreBonus: 0 },
  US:    { sizeMult: 1.2, minScoreBonus: 0 },
  DEAD:  { sizeMult: 0.9, minScoreBonus: 0 },  // v34: raised 0.5→0.9 — don't starve DEAD hours
}
function getSession(h: number): 'ASIAN'|'EU'|'US'|'DEAD' {
  if (h >= 0  && h < 8)  return 'ASIAN'
  if (h >= 8  && h < 13) return 'EU'
  if (h >= 13 && h < 21) return 'US'
  return 'DEAD'
}

async function fetchAllLiquidCoins(minVolUSD = 25_000_000): Promise<string[]> {
  try {
    const res = await fetch(`${BINANCE_DATA}/ticker/24hr`, {headers:{'User-Agent':'Mozilla/5.0'}})
    if (!res.ok) return FALLBACK_COINS
    const tickers: any[] = await res.json()
    const EXCLUDE = /^(.*)(UP|DOWN|BULL|BEAR|HEDGE|3L|3S|5L|5S)USDT$/
    return tickers
      .filter(t =>
        t.symbol.endsWith('USDT') &&
        /^[A-Z0-9]+USDT$/.test(t.symbol) &&
        !EXCLUDE.test(t.symbol) &&
        parseFloat(t.quoteVolume) >= minVolUSD
      )
      .sort((a,b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
      .slice(0, 60)
      .map(t => t.symbol.replace('USDT',''))
  } catch { return FALLBACK_COINS }
}

// v34: Dynamic universe from Binance Futures — all active USDT perps
interface CoinInfo { sym: string; change24h: number }
const MIN_FUTURES_VOL_USDT = 50_000_000  // v39: $5M→$50M — only liquid coins, clean execution
const MAX_FUTURES_COINS    = 60          // v40: 40→60 — scan more liquid coins = more good setups
// v48: stablecoins / wrapped tokens — never trade these even if they appear in ticker data
const STABLE_EXCLUDE = /^(USDC|FDUSD|TUSD|BUSD|DAI|USDS|USD1|USDP|GUSD|FRAX|USDD|PYUSD|AEUR|EURS|SUSD|XAUT|PAXG|WBTC|WETH)USDT$/

// ── v56.8: RELEASE PROVENANCE ──────────────────────────────────────────────
// External audit (Manus, 2026-09-18) opened on exactly this: nobody could map
// "the page you are looking at" -> git commit -> deployed function -> database,
// so no live number could be honestly attributed to the validated DONCH4H/ROTA
// system. The deploy entrypoint pins the source to a commit SHA and hands it
// over on globalThis; the bot republishes it into `deployment_manifest` and into
// every diagnostic response, so the chain is verifiable from the public anon key
// alone. Anything that cannot state its SHA is, by definition, unattributable.
const BOT_VERSION = 'v102.0'
// v87.0: the pre-SCALP engine (DONCH4H / standalone ROTA) opens trades without the profit gate; it stays in the file
// for its exit/record code history but may never open a trade. Changing this needs the gate wired in first.
const LEGACY_ENGINE_ALLOWED = false
// v68.0 breakers — owner spec, deliberately NOT env/shim-configurable.
const DAY_LOSS_HALT = 0.10, DD_HALT = 0.25, LOSS_STREAK = 4, BRK_STREAK_PAUSE_MS = 3_600_000, ERR_HALT = 10
const RELEASE_SHA = String((globalThis as any).__RELEASE_SHA ?? 'unpinned')
// Universe fingerprint: a cheap order-independent digest, so a silently edited
// CRYPTO_40 shows up as a different release even at an identical SHA.
const UNIVERSE_HASH = S.universeHash(FIXED_COINS)
// v58.0: the outer catch sits outside logErr's scope, so it needs its own path
// to bot_errors — an unhandled cycle failure is exactly the event we must never
// lose, and the original error must survive any failure to record it.
async function logErrTop(scope: string, e: unknown) {
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    await sb.from('bot_errors').insert({ scope, message: String(e).slice(0,500) })
  } catch { /* swallow: reporting must not replace the real error */ }
}

let _manifestWritten = false
const publishManifest = async (
  supabase: any, paperMode: boolean, liveMode: boolean,
  onErr: (scope: string, e: unknown) => unknown,
) => {
  if (_manifestWritten) return                      // once per cold start, not per cycle
  _manifestWritten = true
  const row = {
    sha: RELEASE_SHA, bot_version: BOT_VERSION, universe_hash: UNIVERSE_HASH,
    universe_size: FIXED_COINS.length, base_risk_pct: BASE_RISK_PCT,
    enabled_sleeves: (Deno.env.get('ENABLED_SLEEVES')
      ?? String((globalThis as any).__ENABLED_SLEEVES ?? 'DONCH4H,ROTA')),
    paper_mode: paperMode, live_trading: liveMode,
    booted_at: new Date().toISOString(),
  }
  // Never let provenance bookkeeping break a trading cycle.
  await supabase.from('deployment_manifest').upsert(row, { onConflict: 'sha' })
    .then(() => {}, (e: unknown) => onErr('manifest', e))
}

let _lastFetchSource = 'unknown'  // tracked for donch_test diagnostic
let _lastUniverseCoverage = -1     // v56.5: how many of CRYPTO_40 the chosen source covered
// v54.1: per-source feed health counters (reset each cycle, saved to bot_state)
let _feedStats = { binance:{ok:0,fail:0}, okx:{ok:0,fail:0}, bybit:{ok:0,fail:0} }
const resetFeedStats = () => { _feedStats = { binance:{ok:0,fail:0}, okx:{ok:0,fail:0}, bybit:{ok:0,fail:0} } }

async function fetchFuturesCoins(): Promise<CoinInfo[]> {
  const EXCL = /^(.*)(UP|DOWN|BULL|BEAR|HEDGE|3L|3S|5L|5S)USDT$/
  // v56.5: accept a source only if it covers enough of the validated universe.
  // Track the best partial result so a total washout still returns the richest feed
  // we saw rather than the first one that cleared a token threshold.
  let best: { list: CoinInfo[]; src: string; cover: number } = { list: [], src: 'none', cover: -1 }
  const consider = (list: CoinInfo[], src: string): CoinInfo[] | null => {
    const cover = list.reduce((n, c) => n + (CRYPTO_40_SET.has(c.sym) ? 1 : 0), 0)
    if (cover > best.cover) best = { list, src, cover }
    if (cover >= MIN_UNIVERSE_COVERAGE) { _lastFetchSource = src; _lastUniverseCoverage = cover; return list }
    return null
  }
  // v56.7: the universe is PINNED to CRYPTO_40, so membership — not a 24h-volume
  // rank — decides whether a symbol belongs in the scan list. The volume floor and
  // the top-60 slice below are leftovers from the v34-v40 dynamic-universe era, and
  // as market-wide volume fell they quietly ate the universe: on 2026-09-18 only 12
  // Binance SPOT USDT pairs cleared the $50M floor (10 of them ours) and OKX's $20M
  // bar left 21/40, so the bot scanned half the validated set and ROTA could fill
  // only 10 of its 16 slots. Per-trade liquidity is already enforced at entry by the
  // v54 guard (notional <= 0.5% of 24h volume), so this filter must not double as
  // one. Pinned coins are therefore taken at whatever volume the source reports;
  // the floor and the slice now only govern the extra non-CRYPTO_40 names.
  type Row = { sym: string; vol: number; change24h: number }
  const rank = (rows: Row[], floor: number): CoinInfo[] => {
    const seen = new Set<string>()
    const pinned: CoinInfo[] = []
    const extra: Row[] = []
    for (const r of rows) {
      if (!r.sym || seen.has(r.sym)) continue
      seen.add(r.sym)
      if (CRYPTO_40_SET.has(r.sym)) pinned.push({ sym: r.sym, change24h: r.change24h })
      else if (Number.isFinite(r.vol) && r.vol >= floor) extra.push(r)
    }
    extra.sort((a, b) => b.vol - a.vol)
    return pinned.concat(
      extra.slice(0, Math.max(0, MAX_FUTURES_COINS - pinned.length))
           .map(x => ({ sym: x.sym, change24h: x.change24h }))
    )
  }
  // primary: Binance futures 24h tickers
  try {
    const res = await fetch(`${FAPI}/ticker/24hr`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (res.ok) {
      const raw = await res.json()
      if (Array.isArray(raw)) {
        const list = rank(raw
          .filter(t =>
            t.symbol.endsWith('USDT') &&
            /^[A-Z0-9]+USDT$/.test(t.symbol) &&
            !EXCL.test(t.symbol) &&
            !STABLE_EXCLUDE.test(t.symbol)
          )
          .map(t => ({ sym: t.symbol.replace('USDT', ''), vol: parseFloat(t.quoteVolume),
                       change24h: parseFloat(t.priceChangePercent) / 100 })),
          MIN_FUTURES_VOL_USDT)
        const ok = consider(list, 'fapi'); if (ok) return ok
      }
    }
  } catch { /* fall through */ }
  // v42.1 fallback #1: Binance SPOT tickers via data-api.binance.vision
  try {
    const res = await fetch(`${BINANCE_DATA}/ticker/24hr`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (res.ok) {
      const raw = await res.json()
      if (Array.isArray(raw)) {
        const list = rank(raw
          .filter(t =>
            t.symbol.endsWith('USDT') &&
            /^[A-Z0-9]+USDT$/.test(t.symbol) &&
            !EXCL.test(t.symbol) &&
            !STABLE_EXCLUDE.test(t.symbol)
          )
          .map(t => ({ sym: t.symbol.replace('USDT', ''), vol: parseFloat(t.quoteVolume),
                       change24h: parseFloat(t.priceChangePercent) / 100 })),
          MIN_FUTURES_VOL_USDT)
        const ok = consider(list, 'spot'); if (ok) return ok
      }
    }
  } catch { /* fall through */ }
  // v41.3 fallback #2: OKX swap tickers
  try {
    const res = await fetch('https://www.okx.com/api/v5/market/tickers?instType=SWAP',
      { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (res.ok) {
      const j = await res.json()
      const rows: any[] = j?.data ?? []
      const list = rank(rows
        .filter(t => String(t.instId).endsWith('-USDT-SWAP'))
        .map(t => {
          const last = parseFloat(t.last), open = parseFloat(t.open24h)
          return { sym: String(t.instId).split('-')[0], vol: parseFloat(t.volCcy24h) * last,
                   change24h: open > 0 ? (last - open) / open : 0 }
        })
        .filter(x => /^[A-Z0-9]+$/.test(x.sym) && !STABLE_EXCLUDE.test(x.sym + 'USDT')),
        20_000_000)
      const ok = consider(list, 'okx'); if (ok) return ok
    }
  } catch { /* fall through */ }
  // v56.5: no source cleared the coverage bar — use the richest one we actually saw
  // (still far better than the static list), and only fall back to FIXED_COINS if
  // every source failed outright. Coverage is surfaced for the diagnostics.
  if (best.cover >= 10) {
    _lastFetchSource = best.src + '_partial'
    _lastUniverseCoverage = best.cover
    return best.list
  }
  _lastFetchSource = 'fixed'
  _lastUniverseCoverage = FIXED_COINS.length
  return FIXED_COINS.map(s => ({ sym: s, change24h: 0 }))
}

async function fetchFearGreed(): Promise<number> {
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1',
      {headers:{'User-Agent':'Mozilla/5.0'}})
    if (!res.ok) return 50
    const data = await res.json()
    return parseInt(data.data?.[0]?.value ?? '50', 10)
  } catch { return 50 }
}

const RISK = {
  low:    { riskPct:0.010, streakLimit:5 },
  medium: { riskPct:0.018, streakLimit:6 },
  high:   { riskPct:0.025, streakLimit:7 },
} as const
type RiskKey = keyof typeof RISK

const FEE             = S.FEE_TAKER  // v44: real taker fee 0.05%/side — matches validation assumptions
// v54: paper-realism constants — close the paper-vs-real gap BEFORE the
// 50-trade checkpoint so it measures reality, not fantasy.
const SLIP            = S.SLIP  // 3 bps adverse slippage on market fills (entries, stops); maker TP legs fill clean
const FUND_8H         = 0.0001  // 0.01%/8h perp funding, long-run crypto average: longs pay, shorts receive
// v47: ladder TP legs are resting limit orders in a real account → maker fee,
// filled at the exact level (no favorable-slippage fantasy). Validated on 36
// months / 8,421 trades: +0.050R vs +0.046R all-taker, all 6 windows positive.
const FEE_MAKER       = S.FEE_MAKER
const LEVERAGE        = 10
const SWING_N         = 5
const SWING_LOOKBACK  = 60
const SWEEP_LOOKBACK  = 5
const MAX_HOLD_MIN    = S.MAX_HOLD_MS / 60_000  // v41: 96 4h-bars (16d) — swing timeout, matches backtest
const STREAK_PAUSE_MS = 30*60_000   // v40: 2h→30min — trade more, but still a circuit breaker
const MAX_NOTIONAL_PCT= 0.20        // kept for reference; not used as hard cap in notional calc
const MAX_OPEN_TRADES = S.MAX_OPEN_TRADES   // v40: 20→30 — the 75-gate is the quality limiter, not this cap
const MAX_TOTAL_EXPOSURE_PCT = 1.0  // 100% — no idle cash
// v57.2: base risk per DONCH4H breakout, raised 1.25% -> 1.75% on explicit owner
// instruction (see the sizing block for the full note). Module-scope so the live
// value is published in the release manifest and in ?donch_test=1 — the size the
// bot actually trades at should never be something you have to read code to learn.
const BASE_RISK_PCT       = S.BASE_RISK_PCT
const MAX_HEAT_PCT        = S.MAX_HEAT_PCT  // v56: total open notional / portfolio cap (both strategies combined)
const FUNDING_EXTREME = 0.0003
const MIN_SL_PCT      = S.SL_MIN_PCT
const SYM_COOLDOWN_MS = 8*60*60_000  // v41: 8h (2 4h-bars) between entries per coin — matches backtest SPACING
const MAX_NEW_ENTRIES_PER_SCAN = S.MAX_NEW_ENTRIES_PER_SCAN  // v40: 5→8 — take more of the good (75+) setups as they appear
const MAX_DD_STOP     = 0.80
const INITIAL_BALANCE = 10000
const DAILY_LOSS_LIMIT_PCT = 0.03
const FUNDING_AGAINST_THRESHOLD = 0.0005

const VOL_PARAMS = {
  LOW:    { slMult:1.5, tpR:2.5, trailBeR:1.0, trailAtr:0.6 },  // v38: tpR 1.8→2.5, breakeven 0.5→1.0R
  MEDIUM: { slMult:1.3, tpR:2.5, trailBeR:1.0, trailAtr:0.7 },
  HIGH:   { slMult:1.0, tpR:2.5, trailBeR:1.0, trailAtr:0.8 },
}

// v59.0: Bar is the SHARED Bar, and it carries `t` (the bar's open time in ms).
// Until now this file's Bar had no timestamp at all: all three feeds hand us the
// open time in field 0 and all three mappers threw it away. That left the bot
// unable to answer the most basic question about its own data — "is this the bar
// that just closed?" — and forced every timing decision onto wall-clock
// arithmetic (`Date.now() % 14_400_000`) instead of onto the bars themselves. A
// stale or misaligned fallback series would have produced a confident breakout
// off the wrong bar with nothing in the log to show for it. Same family as
// v57.1, where ROTA filled at a price up to four hours old.
type Bar = S.Bar

// v50.1: cross-source price sanity — a position must never open on a bad tick.
// Compares the scan price against Bybit's independent mark; large disagreement
// blocks THIS entry attempt only. Fails open when Bybit is unreachable so a
// Bybit outage can't halt trading by itself.
// v56.3: tolerance 0.5% → 1.5%. Real bad ticks (the shield's target) are off by
// 10-100×, while a 0.5-1% OKX↔Bybit basis on alt perps is routine — the tight
// tolerance skipped 5 healthy ROTA slots in one rebalance (rule-5 violation).
// Divergence is now logged so the threshold can be tuned on data.
const PRICE_SANE_TOL = 0.015
let _lastPriceDiverge = 0   // set by priceSane, read by callers for skip logging
async function priceSane(sym:string, px:number): Promise<boolean> {
  _lastPriceDiverge = 0
  try {
    const res = await fetch(
      `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${sym}USDT`,
      { headers:{'User-Agent':'Mozilla/5.0'} })
    if (!res.ok) return true
    const j = await res.json()
    const p2 = Number(j?.result?.list?.[0]?.lastPrice)
    if (!Number.isFinite(p2) || p2 <= 0) return true
    _lastPriceDiverge = Math.abs(px/p2 - 1)
    return _lastPriceDiverge <= PRICE_SANE_TOL
  } catch { return true }
}

// ════════════════════════════════════════════════════════════════════════════
// v55: LIVE EXECUTION ADAPTER (Bybit v5, USDT linear perps) — GATED OFF.
// Fires ONLY when ALL THREE locks open:
//   (1) BYBIT_API_KEY + BYBIT_API_SECRET secrets exist
//   (2) bot_state.paper_mode === false
//   (3) env LIVE_TRADING === '1'
// Otherwise every seam point below behaves exactly as before (paper).
// The strategy layer is untouched — this is the execution seam of
// EXECUTION_MODEL.md, nothing more.
const BYBIT_BASE = 'https://api.bybit.com'
const _instCache = new Map<string,{qtyStep:number,minQty:number}>()

async function bybitHmac(secret:string, payload:string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    {name:'HMAC', hash:'SHA-256'}, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return [...new Uint8Array(sig)].map(b=>b.toString(16).padStart(2,'0')).join('')
}

async function bybitReq(method:'GET'|'POST', path:string, params:Record<string,unknown>): Promise<any> {
  const apiKey = Deno.env.get('BYBIT_API_KEY')!, secret = Deno.env.get('BYBIT_API_SECRET')!
  const ts = Date.now().toString(), recv = '15000'
  let url = `${BYBIT_BASE}${path}`, body = ''
  if (method === 'GET') {
    const qs = Object.entries(params).map(([k,v])=>`${k}=${v}`).join('&')
    url += qs ? `?${qs}` : ''
    const sign = await bybitHmac(secret, ts+apiKey+recv+qs)
    const res = await fetch(url, {headers:{'X-BAPI-API-KEY':apiKey,'X-BAPI-TIMESTAMP':ts,'X-BAPI-RECV-WINDOW':recv,'X-BAPI-SIGN':sign}})
    return await res.json()
  }
  body = JSON.stringify(params)
  const sign = await bybitHmac(secret, ts+apiKey+recv+body)
  const res = await fetch(url, {method:'POST', body,
    headers:{'Content-Type':'application/json','X-BAPI-API-KEY':apiKey,'X-BAPI-TIMESTAMP':ts,'X-BAPI-RECV-WINDOW':recv,'X-BAPI-SIGN':sign}})
  return await res.json()
}

// round qty down to the instrument's step; 0 = below exchange minimum
async function bybitQty(sym:string, qty:number): Promise<number> {
  let inst = _instCache.get(sym)
  if (!inst) {
    try {
      const res = await fetch(`${BYBIT_BASE}/v5/market/instruments-info?category=linear&symbol=${sym}USDT`,
        {headers:{'User-Agent':'Mozilla/5.0'}})
      const j = await res.json()
      const f = j?.result?.list?.[0]?.lotSizeFilter
      if (!f) return 0
      inst = {qtyStep:Number(f.qtyStep), minQty:Number(f.minOrderQty)}
      _instCache.set(sym, inst)
    } catch { return 0 }
  }
  const stepped = Math.floor(qty/inst.qtyStep)*inst.qtyStep
  const fixed = Number(stepped.toFixed(8))
  return fixed >= inst.minQty ? fixed : 0
}

// market order (one-way mode); returns real avg fill price when available
async function bybitMarket(sym:string, buy:boolean, qty:number, reduceOnly:boolean):
    Promise<{ok:boolean, avgPrice?:number, err?:string}> {
  try {
    const j = await bybitReq('POST','/v5/order/create',{
      category:'linear', symbol:`${sym}USDT`, side: buy?'Buy':'Sell',
      orderType:'Market', qty:String(qty), positionIdx:0, reduceOnly,
      timeInForce:'IOC',
    })
    if (j?.retCode !== 0) return {ok:false, err:`retCode=${j?.retCode} ${j?.retMsg}`}
    const oid = j?.result?.orderId
    // one short poll for the real fill price (best effort)
    if (oid) {
      await new Promise(r=>setTimeout(r,500))
      try {
        const q = await bybitReq('GET','/v5/order/realtime',{category:'linear', symbol:`${sym}USDT`, orderId:oid})
        const avg = Number(q?.result?.list?.[0]?.avgPrice)
        if (Number.isFinite(avg) && avg>0) return {ok:true, avgPrice:avg}
      } catch { /* fill price best-effort */ }
    }
    return {ok:true}
  } catch (e) { return {ok:false, err:String(e).slice(0,200)} }
}

// exchange truth vs DB truth — alert-only in v55 (no auto-heal)
async function bybitPositions(): Promise<Map<string,{side:string,size:number}>|null> {
  try {
    const j = await bybitReq('GET','/v5/position/list',{category:'linear', settleCoin:'USDT', limit:200})
    if (j?.retCode !== 0) return null
    const m = new Map<string,{side:string,size:number}>()
    for (const p of (j?.result?.list||[])) {
      const sz = Number(p.size)
      if (sz>0) m.set(String(p.symbol).replace('USDT',''), {side:p.side==='Buy'?'LONG':'SHORT', size:sz})
    }
    return m
  } catch { return null }
}

async function fetchBars(sym:string, interval:string, limit:number): Promise<Bar[]> {
  // primary: Binance futures
  try {
    const res = await fetch(
      `${FAPI}/klines?symbol=${sym}USDT&interval=${interval}&limit=${limit}`,
      { headers:{'User-Agent':'Mozilla/5.0'} }
    )
    if (res.ok) {
      const data:number[][] = await res.json()
      if (Array.isArray(data) && data.length) {
        _feedStats.binance.ok++
        return data.map(k=>({t:+k[0],open:+k[1],high:+k[2],low:+k[3],close:+k[4],vol:+k[5]}))
      }
    }
    _feedStats.binance.fail++
  } catch { _feedStats.binance.fail++ }
  // v41.2 fallback: OKX perp candles — Supabase egress IPs are sometimes
  // geo-blocked/rate-limited by Binance; OKX serves the same market data.
  // v46: 3 attempts with backoff (OKX rate limits under burst load)
  const okxBar = interval==='1h'?'1H':interval==='4h'?'4H':interval==='1d'?'1D':interval
  for (let attempt=0; attempt<3; attempt++) {
    try {
      const res = await fetch(
        `https://www.okx.com/api/v5/market/candles?instId=${sym}-USDT-SWAP&bar=${okxBar}&limit=${Math.min(limit,300)}`,
        { headers:{'User-Agent':'Mozilla/5.0'} }
      )
      if (res.ok) {
        const j = await res.json()
        const rows: string[][] = j?.data ?? []
        if (rows.length) {
          _feedStats.okx.ok++
          // OKX returns newest-first incl. the in-progress candle → reverse to
          // match Binance semantics (oldest-first, last = current partial bar).
          return rows.reverse().map(k=>({t:+k[0],open:+k[1],high:+k[2],low:+k[3],close:+k[4],vol:+k[5]}))
        }
      }
      _feedStats.okx.fail++
    } catch { _feedStats.okx.fail++ }
    await new Promise(r=>setTimeout(r, 350*(attempt+1)))
  }
  // v47.1 fallback #3: Bybit linear perp candles — third independent source so a
  // simultaneous Binance geo-block + OKX outage can't blind the bot.
  const bybitIv = interval==='1h'?'60':interval==='4h'?'240':interval==='1d'?'D':interval==='15m'?'15':interval==='5m'?'5':interval==='1m'?'1':'60'
  try {
    const res = await fetch(
      `https://api.bybit.com/v5/market/kline?category=linear&symbol=${sym}USDT&interval=${bybitIv}&limit=${Math.min(limit,1000)}`,
      { headers:{'User-Agent':'Mozilla/5.0'} }
    )
    if (res.ok) {
      const j = await res.json()
      const rows: string[][] = j?.result?.list ?? []
      if (rows.length) {
        _feedStats.bybit.ok++
        // Bybit also returns newest-first → reverse to Binance semantics.
        return rows.reverse().map(k=>({t:+k[0],open:+k[1],high:+k[2],low:+k[3],close:+k[4],vol:+k[5]}))
      }
    }
    _feedStats.bybit.fail++
  } catch { _feedStats.bybit.fail++ }
  return []
}

// v57.1: the current market price, through the same source ladder as every other
// feed (Binance → OKX → Bybit), at most a minute old. ROTA used to fill at the
// close of the last COMPLETED 4h candle, which is up to 4 hours stale — see the
// v57.1 note in the header. `fetchBars` returns the in-progress bar last, so its
// close is the live price.
async function fetchLivePrice(sym: string): Promise<number|null> {
  try {
    const b = await fetchBars(sym, '1m', 2)
    const p = b.length ? b[b.length-1].close : NaN
    return Number.isFinite(p) && p > 0 ? p : null
  } catch { return null }
}

// ── v33: OI history ──────────────────────────────────────────────────────────
interface OIRecord { timestamp: number; oi: number }

async function fetchOIHistory(sym: string, limit = 48): Promise<OIRecord[]> {
  try {
    const res = await fetch(
      `${FAPI_DATA}/openInterestHist?symbol=${sym}USDT&period=5m&limit=${limit}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    )
    if (!res.ok) return []
    const data: any[] = await res.json()
    return data.map(d => ({ timestamp: +d.timestamp, oi: parseFloat(d.sumOpenInterest) }))
  } catch { return [] }
}

// Signal #17: Liquidity Zone Detection
// Uses swing levels as proxies for liquidation clusters (where stops pile up),
// validated by OI elevation. Confirms entry only after price touches the zone
// and rejects with a wick — classic liquidity sweep setup.
//
// Parameters (easy to tune):
const LIQ_ZONE_WINDOW    = 40    // bars to scan for swing levels
const LIQ_PROXIMITY_PCT  = 0.015 // zone must be within 1.5% of current price
const LIQ_TOUCH_LOOKBACK = 6     // bars to check for recent touch
const LIQ_OI_SURGE_MULT  = 1.08  // OI elevated = 8%+ above average
const LIQ_WICK_RATIO     = 0.30  // rejection wick ≥ 30% of bar range

function detectLiquidationZone(
  bars: Bar[],
  price: number,
  oiHistory: OIRecord[],
  side: 'LONG' | 'SHORT'
): { hit: boolean; zoneLevel: number; confidence: number } {
  const NULL_R = { hit: false, zoneLevel: 0, confidence: 0 }
  if (bars.length < 30 || oiHistory.length < 10) return NULL_R

  // OI elevation check — are there more positions at risk than usual?
  const oiVals = oiHistory.map(o => o.oi)
  const oiBase = oiVals.slice(0, -6).reduce((a, b) => a + b, 0) / Math.max(1, oiVals.length - 6)
  const oiNow  = oiVals.slice(-6).reduce((a, b) => a + b, 0) / 6
  const oiElevated = oiBase > 0 && oiNow > oiBase * LIQ_OI_SURGE_MULT

  const recent = bars.slice(-LIQ_ZONE_WINDOW)

  if (side === 'LONG') {
    // Swing lows below price = where long stops cluster
    const candidates = recent.map(b => b.low).filter(l => l < price * 0.998).sort((a, b) => b - a)
    if (candidates.length === 0) return NULL_R
    const zoneLevel = candidates[0]
    const zoneDist  = (price - zoneLevel) / price
    if (zoneDist > LIQ_PROXIMITY_PCT) return NULL_R

    // Price must have touched the zone and bounced with a lower wick
    const touched = bars.slice(-LIQ_TOUCH_LOOKBACK).some(b => {
      const range = b.high - b.low
      const lWick = Math.min(b.open, b.close) - b.low
      return b.low <= zoneLevel * 1.002 && b.close > zoneLevel &&
             range > 0 && lWick / range >= LIQ_WICK_RATIO
    })
    if (!touched) return NULL_R

    const confidence = (oiElevated ? 1.5 : 1.0) * (1 - zoneDist / LIQ_PROXIMITY_PCT)
    return { hit: true, zoneLevel, confidence }

  } else {
    // Swing highs above price = where short stops cluster
    const candidates = recent.map(b => b.high).filter(h => h > price * 1.002).sort((a, b) => a - b)
    if (candidates.length === 0) return NULL_R
    const zoneLevel = candidates[0]
    const zoneDist  = (zoneLevel - price) / price
    if (zoneDist > LIQ_PROXIMITY_PCT) return NULL_R

    // Price must have spiked into the zone and rejected with an upper wick
    const touched = bars.slice(-LIQ_TOUCH_LOOKBACK).some(b => {
      const range = b.high - b.low
      const uWick = b.high - Math.max(b.open, b.close)
      return b.high >= zoneLevel * 0.998 && b.close < zoneLevel &&
             range > 0 && uWick / range >= LIQ_WICK_RATIO
    })
    if (!touched) return NULL_R

    const confidence = (oiElevated ? 1.5 : 1.0) * (1 - zoneDist / LIQ_PROXIMITY_PCT)
    return { hit: true, zoneLevel, confidence }
  }
}

// v59.0: the indicators are the shared module's, byte-for-byte. They were
// verified identical to the copies they replace (ATR20 1.1632112956, ADX60
// 31.6683034253 on the tests/strategy.test.ts fixture) before the swap.
const calcATR = S.calcATR

function calcEma(closes:number[], p:number): number {
  const k=2/(p+1); let e=closes[0]
  for (let i=1; i<closes.length; i++) e=closes[i]*k+e*(1-k)
  return e
}

function calcEmaArr(closes:number[], p:number): number[] {
  const k=2/(p+1); const out=[closes[0]]
  for (let i=1; i<closes.length; i++) out.push(closes[i]*k+out[i-1]*(1-k))
  return out
}

function calcRsi(closes:number[], p=14): number {
  if (closes.length < p+1) return 50
  let g=0, l=0
  for (let i=closes.length-p; i<closes.length; i++) {
    const d=closes[i]-closes[i-1]; if(d>0) g+=d; else l-=d
  }
  g/=p; l/=p; return l===0?100:100-100/(1+g/l)
}

function calcBB(closes: number[], period=20, mult=2.0): {
  upper:number; mid:number; lower:number; width:number
} {
  const slice = closes.slice(-period)
  if (slice.length < period) return {upper:0,mid:0,lower:0,width:0}
  const mid = slice.reduce((a,b)=>a+b,0)/slice.length
  const variance = slice.reduce((a,b)=>a+(b-mid)**2,0)/slice.length
  const std = Math.sqrt(variance)
  const upper = mid+mult*std, lower = mid-mult*std
  return {upper, mid, lower, width: mid>0?(upper-lower)/mid:0}
}

// ══════════════════════════════════════════════════════════════════════════…30349 tokens truncated…er(x.entry_price)*Number(x.size)/(Math.max(1, Number(x.lev)||1)), 0)
          let allMargin = marginOf(allOpenRows)
          let port = balance + allMargin
          // v66.0: MARGIN SIZING (owner: "$70 at 10x = $700"). When on, the slot
          // target is the MARGIN posted and notional = margin x LEV, so leverage
          // really enlarges the position and a ~9.5% adverse move liquidates the
          // slot's margin and nothing else. Off = v65.0 (notional-sized) exactly.
          const MARGIN_SIZING = (Deno.env.get('ROTA_MARGIN_SIZING') ?? (globalThis as any).__ROTA_MARGIN_SIZING) === '1'
          // v68.1: owner "use all the money" — a deploy-time multiplier on the slot
          // target (and the per-coin cap with it), bounded [1, 2]. 1.75 on K=2
          // puts ~95% of a 1x account to work (4 x ~24.5%).
          const _ss = Number(Deno.env.get('ROTA_SLOT_SCALE') ?? (globalThis as any).__ROTA_SLOT_SCALE ?? 1)
          const SLOT_SCALE = Number.isFinite(_ss) ? Math.min(2, Math.max(1, _ss)) : 1
          let SCALE = (MARGIN_SIZING ? LEV : 1) * SLOT_SCALE
          if (ROTA_VOL_TARGET > 0) {
            const tv = [...target.keys()].map(k => momList.find(m => m.sym === k)?.vol ?? 0).filter(v => v > 0)
            const basketVol = tv.length ? tv.reduce((a,b)=>a+b,0)/tv.length * Math.sqrt(6*365) : 0
            if (basketVol > 0) {
              const vs = Math.max(0.2, Math.min(1, ROTA_VOL_TARGET / basketVol))
              SCALE *= vs
              log.push(`ROTA vol target ${ROTA_VOL_TARGET} / basket ${basketVol.toFixed(2)} -> size x${vs.toFixed(2)}`)
            }
          }
          const slotTarget = (sym2:string, dir2:1|-1) => {
            const sideSum = dir2===1 ? longInvSum : shortInvSum
            const w = sideSum>0 ? (invVol.get(sym2)??0)/sideSum : 1/ROTA_K
            return S.rotaSlotTarget(port, w)
          }
          // v57.1: one live price per symbol for this whole rebalance — the close
          // loop and the open loop both need it, and the rebalance is a single
          // moment in time, so fetching twice would be noise as well as latency.
          const _rotaPxCache = new Map<string, number|null>()
          const rotaPx = async (sym2:string): Promise<number|null> => {
            if (!_rotaPxCache.has(sym2)) _rotaPxCache.set(sym2, await fetchLivePrice(sym2))
            return _rotaPxCache.get(sym2) ?? null
          }
          const _rotaClosed = new Set<any>()
          // close positions that left the basket, flipped direction, or drifted >±35% from target size
          for (const t of (rotaOpenAll||[])) {
            const tgt = target.get(t.sym)
            const wantDir = tgt ? (tgt.dir===1?'LONG':'SHORT') : null
            if (wantDir === t.side) {
              const curNotional = Number(t.entry_price)*Number(t.size)
              const tgtNotional = slotTarget(t.sym, tgt!.dir) * SCALE
              // v64.1: a slot opened at a different leverage is NOT kept — otherwise
              // a leverage change never reaches a basket whose sizes stay in band.
              const levOk = Math.max(1, Number(t.lev)||1) === LEV
              if (levOk && S.rotaSizeOk(curNotional, tgtNotional)) { target.delete(t.sym); continue }  // size OK → keep
              // size drifted → close and reopen at target below
            }
            // v57.1: fill at the CURRENT price, not the last completed 4h close.
            const pxRaw = (await rotaPx(t.sym)) ?? tgt?.price
              ?? ((await fetchBars(t.sym,'4h',3)).slice(0,-1).pop()?.close ?? Number(t.entry_price))
            const dirM2 = t.side==='LONG'?1:-1
            let px = pxRaw * (1 - dirM2 * SLIP)   // v54: market close → adverse slippage
            if (liveMode) {   // v55 seam #3: reduce-only market close
              const q = await bybitQty(t.sym, Number(t.size))
              const r = q>0 ? await bybitMarket(t.sym, t.side==='SHORT', q, true) : {ok:false, err:'qty<min'} as const
              if (!r.ok) { log.push(`LIVE_CLOSE_FAIL ${t.sym}: ${'err' in r?r.err:''} — keeping open, retry next cycle`); await logErr('live_close_rota', `${t.sym} ${'err' in r?r.err:''}`); continue }
              if (r.avgPrice) px = r.avgPrice
            }
            const pnl2 = (px-Number(t.entry_price))*Number(t.size)*dirM2 - px*Number(t.size)*FEE
            balance += Number(t.entry_price)*Number(t.size)/(Number(t.lev)||1) + pnl2
            await supabase.from('bot_trades').update({
              status: pnl2>=0?'TP':'SL', exit_price:px, pnl:pnl2,
              pnl_pct:(px-Number(t.entry_price))/Number(t.entry_price)*dirM2,
              closed_at:new Date().toISOString()
            }).eq('id',t.id)
            log.push(`ROTA_CLOSE ${t.sym} ${t.side} pnl=${pnl2.toFixed(2)}`)
            _rotaClosed.add(t.id)
          }
          // v67.1: rows closed just above must stop counting — the pre-close
          // snapshot otherwise double-counts their margin in `port` and their
          // notional in the per-coin cap, which at 10x zeroed every new slot.
          allOpenRows = allOpenRows.filter((x:any) => !_rotaClosed.has(x.id))
          allMargin = marginOf(allOpenRows)
          port = balance + allMargin
          // open the new/resized slots (inverse-vol weights, 70% book)
          for (const [sym,tgt] of target) {
            let slotNotional = slotTarget(sym, tgt.dir) * SCALE
            // v46: combined per-coin exposure cap 20% of portfolio (rotation +
            // breakout on the same coin was doubling concentration)
            const symExp = (allOpenRows||[]).filter((x:any)=>x.sym===sym)
              .reduce((a:number,x:any)=>a+Number(x.entry_price)*Number(x.size),0)
            slotNotional = Math.min(slotNotional, Math.max(0, port*S.PER_COIN_CAP*SCALE - symExp))
            if (slotNotional < port*0.01*SCALE) { log.push(`ROTA_SKIP ${sym}: per-coin cap`); logSkip(sym,'ROTA','per_coin_cap',{slot:+slotNotional.toFixed(0)}); continue }
            if (balance < (MARGIN_SIZING ? slotNotional/LEV + slotNotional*FEE : slotNotional)) { log.push(`ROTA_SKIP ${sym}: insufficient cash`); logSkip(sym,'ROTA','insufficient_cash',{slot:+slotNotional.toFixed(0), cash:+balance.toFixed(0)}); continue }
            // v57.1: enter at the CURRENT price. `tgt.price` is the close of the last
            // completed 4h candle — right for ranking momentum, wrong as a fill: at a
            // 05:46 rebalance it is the 04:00 close, nearly two hours old. Measured
            // live on 2026-09-18 that staleness put entries 1.1-2.3% off the market
            // and made the bad-tick shield reject six healthy slots (1.6-7.2% apart),
            // i.e. 37% of the sleeve — a rule-5 trade cut caused by our own stale feed.
            const livePx = await rotaPx(sym)
            if (livePx === null) { log.push(`ROTA_SKIP ${sym}: no live price`); logSkip(sym,'ROTA','no_live_price',{}); continue }
            if (!(await priceSane(sym, livePx))) { log.push(`ROTA_SKIP ${sym}: cross-source price mismatch (bad tick?)`); logSkip(sym,'ROTA','bad_tick',{price:livePx, stalePrice:tgt.price, divergePct:+( _lastPriceDiverge*100).toFixed(2)}); continue }
            let fillPx = livePx * (1 + tgt.dir * SLIP)   // v54: market entry → adverse slippage
            let size2 = slotNotional / fillPx
            if (liveMode) {   // v55 seam #2: real market order
              const q = await bybitQty(sym, size2)
              if (q <= 0) { log.push(`LIVE_SKIP ${sym}: below exchange min qty`); logSkip(sym,'ROTA','live_min_qty',{size:size2}); continue }
              const r = await bybitMarket(sym, tgt.dir===1, q, false)
              if (!r.ok) { log.push(`LIVE_REJECT ${sym}: ${r.err}`); await logErr('live_open_rota', `${sym} ${r.err}`); continue }
              size2 = q
              if (r.avgPrice) fillPx = r.avgPrice
            }
            // v56.9: ROTA opens its basket earlier in the same cycle than the DONCH4H
            // scan, but both size themselves off the `allOpen` snapshot taken before
            // either ran — so a breakout could not see a basket opened minutes earlier
            // in the same invocation. Book it into the same running total.
            heatCommitted += slotNotional
            if (tgt.dir === 1) netCommitted.l += slotNotional; else netCommitted.s += slotNotional
            const feeIn = slotNotional * FEE
            balance -= (slotNotional / LEV + feeIn)   // v64.0: margin, not notional
            await supabase.from('bot_trades').insert({
              sym, side: tgt.dir===1?'LONG':'SHORT', entry_price: fillPx, size: size2, fee: feeIn,
              trail_sl: tgt.dir===1 ? fillPx*0.01 : fillPx*100,  // sentinels — ROTA skipped in manage loop
              hi: tgt.dir===1 ? fillPx*100 : fillPx,
              lo: tgt.dir===-1 ? fillPx*0.01 : fillPx,
              status:'OPEN', score: 0, mtf:false, partial_done:true,
              paper_mode: paperMode, entry_macd_hist: 0, strategy: 'ROTA', lev: LEV
            })
            log.push(`ROTA_OPEN ${sym} ${tgt.dir===1?'LONG':'SHORT'} @${fillPx.toFixed(6)} (4h close was ${tgt.price}) $${slotNotional.toFixed(0)}`)
          }
          await supabase.from('bot_state').update({ rebalanced_at: new Date().toISOString() }).eq('id',1)
          log.push(`ROTA rebalance: universe=${momList.length}`)
        }
      }
    } catch (e) { log.push(`ROTA error: ${String(e).slice(0,80)}`); await logErr('rota_rebalance', e) }

    const BATCH=12
    for (let b=0; b<allManagedCoins.length; b+=BATCH) {
      await Promise.all(allManagedCoins.slice(b,b+BATCH).map(async (sym)=>{
      try {
        const [bars5m,priceRes,bars1h,bars15m]=await Promise.all([
          fetchBars(sym,'5m',200),
          fetch(`${FAPI}/ticker/price?symbol=${sym}USDT`).then(r=>r.json()).catch(()=>null),
          fetchBars(sym,'1h',30),
          fetchBars(sym,'15m',30),
        ])
        const _price5m = priceRes?.price ? +priceRes.price : (bars5m[bars5m.length-1]?.close ?? 0)
        const _priceChange5m = bars5m.length >= 2 ? (_price5m - bars5m[bars5m.length-2].close) / bars5m[bars5m.length-2].close : 0
        const oiSig = await fetchOISignal(sym, _priceChange5m)
        const oiHistory = await fetchOIHistory(sym, 48)  // v33: for Signal #17
        if (!bars5m||bars5m.length<30) return

        // v25: API fallback — try CoinGecko if Binance price unavailable
        let price = priceRes?.price ? +priceRes.price : 0
        if (!price && bars5m.length > 0) price = bars5m[bars5m.length-1].close
        if (!price) {
          const fallbackPrice = await fetchPriceFallback(sym)
          if (fallbackPrice) {
            price = fallbackPrice
            log.push(`FALLBACK ${sym}: using CoinGecko price $${price}`)
          } else return
        }
        livePx.set(sym, price)   // v50.2: mark for MTM equity snapshot
        const completed=bars5m.slice(0,-1)
        const atr      =calcATR(completed)
        const atrPct   =atr/price
        const volRegime=getVolRegime(atrPct)
        const vp       =dynVol[volRegime]
        const openTrades=openBySymbol[sym]||[]

        // v22: Calculate ADX and 1H bias for confluence score
        const adx = calcADX(completed)
        let ema1hBias: 'BULL'|'BEAR'|'NEUTRAL' = 'NEUTRAL'
        if (bars1h && bars1h.length >= 22) {
          const closes1h = bars1h.slice(0,-1).map(b=>b.close)
          const e9_1h  = calcEma(closes1h, 9)
          const e21_1h = calcEma(closes1h, 21)
          if (e9_1h>e21_1h*1.001) ema1hBias = 'BULL'
          else if (e9_1h<e21_1h*0.999) ema1hBias = 'BEAR'
        }

        // ── STAGE 2: Multi-timeframe confirmation (15m) ──
        let ema15mBias: 'BULL'|'BEAR'|'NEUTRAL' = 'NEUTRAL'
        if (bars15m && bars15m.length >= 22) {
          const closes15m = bars15m.slice(0,-1).map(b=>b.close)
          const e9_15m = calcEma(closes15m, 9)
          const e21_15m = calcEma(closes15m, 21)
          if (e9_15m>e21_15m*1.001) ema15mBias = 'BULL'
          else if (e9_15m<e21_15m*0.999) ema15mBias = 'BEAR'
        }

        const vpoc = calcVPOC(completed.slice(-80))

        // v30: EMA50/200 on 1H — Golden Cross / Death Cross macro bias
        let ema200Bias: 'BULL'|'BEAR'|'NEUTRAL' = 'NEUTRAL'
        if (bars1h && bars1h.length >= 52) {
          const closes1hAll = bars1h.slice(0, -1).map(b => b.close)
          const e50_1h  = calcEma(closes1hAll, 50)
          const e200_1h = calcEma(closes1hAll, 200)
          if (e50_1h > e200_1h * 1.001) ema200Bias = 'BULL'
          else if (e50_1h < e200_1h * 0.999) ema200Bias = 'BEAR'
        }

        // ── STAGE 2: Calculate volatility percentile and dynamic SL/TP ──
        const {pct: volPctile, atrPct: curAtrPct} = calcVolatilityPercentile(completed)
        const dynamicSLMult = adx > 25 ? 1.0 : adx < 15 ? 1.5 : 1.2
        // v27.6: tp_r from bot_params actually drives the TP (was a dead read)
        const dynamicTPBase = calcDynamicTP(Number(_bp.tp_r ?? 2.5), volPctile)

        // v22: Get last 5m price change for OI divergence context
        const last5min = completed.length >= 2 ? (price - completed[completed.length-2].close) / completed[completed.length-2].close : 0

        // ── Phase 3: Pre-compute EMA exit arrays (once per coin, reused in loop) ──
        const closesAll5m  = completed.map((b:Bar) => b.close)
        const ema9ExitArr  = calcEmaArr(closesAll5m, 9)
        const ema21ExitArr = calcEmaArr(closesAll5m, 21)
        const curE9Exit    = ema9ExitArr.at(-1)!,  prevE9Exit  = ema9ExitArr.at(-2)!
        const curE21Exit   = ema21ExitArr.at(-1)!, prevE21Exit = ema21ExitArr.at(-2)!
        const vols20Exit   = completed.slice(-20).map((b:Bar) => b.vol)
        const volAvg20Exit = vols20Exit.reduce((a:number,v:number) => a+v, 0) / vols20Exit.length
        const curBarVol    = completed[completed.length-1].vol
        const isLowVolExit = volAvg20Exit > 0 && curBarVol < volAvg20Exit * 0.8

        // ── LIQUIDATION PASS (v64.0) — runs BEFORE management, on EVERY sleeve
        // Isolated margin: a position dies when its unrealised loss has eaten
        // (1-MAINT) of the margin posted against it, and the margin is gone.
        //
        // THIS EXISTS BECAUSE THE MANAGEMENT LOOP BELOW SKIPS ROTA. ROTA closes
        // only at the 48h rebalance, so without this a levered rotation slot
        // could blow through its margin unwatched for two days. Shipping
        // leverage without it would be the exact thing v88bt printed: an account
        // that keeps trading after it is dead.
        // Inert at LEV=1: margin == notional, so the trigger needs a -99.5%
        // move and can never fire on a cash account.
        const liquidatedIds = new Set<number>()
        if (LEV > 1) {
          for (const t of openTrades.slice()) {
            const e = Number(t.entry_price), sz = Number(t.size)
            const lv = Math.max(1, Number(t.lev) || 1)
            if (!(e > 0) || !(sz > 0) || lv <= 1) continue
            const mk = await fetchLivePrice(t.sym)
            if (mk === null || !(mk > 0)) continue          // no mark, no forced exit
            const dM = t.side === 'LONG' ? 1 : -1
            const margin = e * sz / lv
            const loss = (e - mk) * sz * dM
            if (loss < margin * (1 - MAINT)) continue
            // Settle at the liquidation LEVEL, not the current mark: the
            // exchange closes the moment maintenance margin is breached.
            const liqPx = e - dM * (margin * (1 - MAINT)) / sz
            const pnlLiq = (liqPx - e) * sz * dM - liqPx * sz * S.FEE_TAKER
            balance += margin + pnlLiq
            openCount--
            await supabase.from('bot_trades').update({
              status: 'SL', exit_price: liqPx, closed_at: new Date().toISOString(),
              pnl: pnlLiq + Number(t.legs_banked || 0),
              pnl_pct: e > 0 ? ((liqPx - e) / e) * 100 * dM : 0,
            }).eq('id', t.id).then(ok => ok, err => logErr('liquidate', String(err)))
            log.push(`LIQUIDATED ${t.sym} ${t.side} @${liqPx.toFixed(6)} lev=${lv}x margin=$${margin.toFixed(2)} pnl=$${pnlLiq.toFixed(2)}`)
            logSkip(t.sym, t.strategy || 'ROTA', 'liquidated',
              { lev: lv, margin: +margin.toFixed(2), mark: mk, liqPx })
            liquidatedIds.add(t.id)
          }
        }

        // ── Manage open positions ─────────────────────────
        for (const t of openTrades) {
          if (liquidatedIds.has(t.id)) continue // v64.0: already closed by the liquidation pass
          if (t.strategy === 'ROTA') continue  // v42: rotation positions are closed only by the rebalance phase
          const entry =Number(t.entry_price)
          // v64.0: the leverage this position was OPENED at. Read from the row,
          // never from the current deploy flag — a level change must not alter
          // how an already-open position settles.
          const tLev = Math.max(1, Number(t.lev) || 1)
          const size  =Number(t.size)
          const sl    =Number(t.trail_sl)
          const slDist=Math.abs(entry-sl)
          const dirM  =t.side==='LONG'?1:-1
          const ageMs =t.opened_at?now-new Date(t.opened_at).getTime():0

          // ── TASK 1: Retroactive snapshot if not already created ──
          if (t.id && !t.snapshot_recorded) {
            const cls5m = completed.map((b:Bar) => b.close)
            const rsiSnap = calcRsi(cls5m.slice(-15))
            const vols20Snap = completed.slice(-20).map((b:Bar) => b.vol)
            const volAvgSnap = vols20Snap.reduce((a:number,v:number)=>a+v,0)/vols20Snap.length
            const curVolSnap = completed[completed.length-1].vol
            const volRatioSnap = volAvgSnap > 0 ? curVolSnap/volAvgSnap : 1.0
            const {pct: volPct} = calcVolatilityPercentile(completed)
            try {
              await supabase.from('bot_trade_snapshots').insert({
                trade_id: t.id, coin: sym, side: t.side,
                confluence_score: Math.round(t.score || 50),
                adx: +(adx.toFixed(2)),
                rsi: +(rsiSnap.toFixed(2)),
                volume_ratio: +(volRatioSnap.toFixed(3)),
                hour_utc: utcH,
                market_regime: btcRegime,
                session: session,
                oi_signal: oiSig,
                fear_greed: fearGreed,
                vpoc: +(vpoc.toFixed(6)),
                volatility_pct: volPct,
                result: 'snapshot_current'
              }).then(()=>{},()=>{})
              await supabase.from('bot_trades').update({snapshot_recorded: true}).eq('id',t.id).then(()=>{},()=>{})
            } catch { /* non-fatal */ }
          }

          // ── TASK 1: Equity Guard — if 30% drawdown, close ALL positions immediately ──
          if (equityGuardPaused) {
            const fav = (price-entry)/entry*dirM
            const pnlLeg = (price-entry)*size*dirM - price*size*FEE
            const pnl = pnlLeg + (Number((t as any).legs_banked)||0)   // v56.2
            balance += entry*size/tLev+pnlLeg; openCount--
            await supabase.from('bot_trades').update({
              status: pnl >= 0 ? 'TP' : 'SL', exit_price:price, pnl, pnl_pct:fav,
              closed_at:new Date().toISOString()
            }).eq('id',t.id)
            await supabase.from('bot_trade_snapshots').update({ result:'equity_guard_forced_close', pnl }).eq('trade_id',t.id).then(()=>{},()=>{})
            await updateMarketMemory(supabase, t.id, 'TP', pnl, log)
            log.push(`EQUITY_GUARD_CLOSE ${sym} ${t.side} @${price.toFixed(4)} pnl=${pnl.toFixed(2)}`)
            continue
          }

          // ── TASK 1: Equity Guard — if 15% drawdown, tighten SL by 50% ──
          let adjustedSl = sl
          if (equityGuardMult === 0.5) {
            const slDistTightened = slDist * 0.5
            adjustedSl = t.side === 'LONG' ? sl + slDistTightened : sl - slDistTightened
          }

          // ── Phase 3: Smart Early Exit — EMA9 cross against direction + low vol ──
          // v27: only cut LOSING trades early — winners get to run to trail/TP
          const emaCrossedAgainst =
            (t.side==='LONG'  && prevE9Exit >= prevE21Exit && curE9Exit < curE21Exit) ||
            (t.side==='SHORT' && prevE9Exit <= prevE21Exit && curE9Exit > curE21Exit)
          if (t.mtf && emaCrossedAgainst && isLowVolExit && (price-entry)*dirM < 0) {
            const fav = (price-entry)/entry*dirM
            const pnl = (price-entry)*size*dirM - price*size*FEE
            const finalSt = 'TRAIL'  // gate above guarantees a losing exit
            balance += entry*size/tLev+pnl; openCount--
            await supabase.from('bot_trades').update({
              status:finalSt, exit_price:price, pnl, pnl_pct:fav,
              closed_at:new Date().toISOString()
            }).eq('id',t.id)
            await supabase.from('bot_trade_snapshots').update({ result:'early_exit_ema_reversal', pnl }).eq('trade_id',t.id).then(()=>{},()=>{})
            await updateMarketMemory(supabase, t.id, finalSt, pnl, log)
            log.push(`RETROACTIVE_EARLY_EXIT ${sym} ${t.side} @${price.toFixed(4)} vs entry ${entry.toFixed(4)} pnl=${pnl.toFixed(2)}`)
            continue
          }

          // ─────────────────────────────────────────────────────────────────────────
          // UPGRADE 6: ADVANCED EXIT SIGNALS
          // ─────────────────────────────────────────────────────────────────────────
          const macdData = calcMACD(completed.map(b => b.close))
          const rsiHistory20 = completed.slice(-20).map((b, i) =>
            i === 0 ? 50 : calcRsi(completed.slice(0, i+1).map(x => x.close))
          )
          const volHistory20 = completed.slice(-20).map(b => b.vol)
          const volAvg20 = volHistory20.reduce((a,b)=>a+b,0)/volHistory20.length

          const advancedExit = advancedExitCheck(t, completed[completed.length-1], price, macdData.histogram, rsiHistory20, volHistory20, volAvg20)
          if (t.mtf && advancedExit.closePercent > 0 && t.status === 'OPEN') {
            const closeSize = size * advancedExit.closePercent
            const fav = (price-entry)/entry*dirM
            const closePnl = (price-entry)*closeSize*dirM - price*closeSize*FEE
            balance += entry*closeSize/tLev+closePnl

            if (advancedExit.closePercent >= 1.0) {
              openCount--
              await supabase.from('bot_trades').update({
                status:'TP', exit_price:price, pnl:closePnl, pnl_pct:fav,
                closed_at:new Date().toISOString()
              }).eq('id',t.id)
              await supabase.from('bot_trade_snapshots').update({ result:`advanced_exit_${advancedExit.reason}`, pnl:closePnl }).eq('trade_id',t.id).then(()=>{},()=>{})
              await updateMarketMemory(supabase, t.id, 'TP', closePnl, log)
              log.push(`ADVANCED_EXIT ${sym} ${t.side} (${advancedExit.reason}) @${price.toFixed(4)} pnl=${closePnl.toFixed(2)}`)
              continue
            } else {
              // Partial close
              await supabase.from('bot_trades').update({
                size: size - closeSize,
                trail_sl: sl + (entry-sl)*0.3*dirM  // Tighten SL toward entry
              }).eq('id',t.id)
              log.push(`ADVANCED_PARTIAL ${sym} ${t.side} (${advancedExit.reason}) ${(advancedExit.closePercent*100).toFixed(0)}% @${price.toFixed(4)} pnl=${closePnl.toFixed(2)}`)
              continue
            }
          }

          // ── v29: VWAP Counter-Exit ──
          // If price crosses to the WRONG side of VWAP while we're losing (< -0.3R),
          // institutional bias has shifted against us — exit early.
          const vwapNow = calcVWAP(completed)
          const vwapProfitR = slDist > 0 ? (price - entry) * dirM / slDist : 0
          if (t.mtf && vwapNow > 0 && vwapProfitR < -0.3) {
            const vwapAgainst =
              (t.side === 'LONG'  && price < vwapNow * 0.999) ||
              (t.side === 'SHORT' && price > vwapNow * 1.001)
            if (vwapAgainst) {
              const fav = (price - entry) / entry * dirM
              const pnl = (price - entry) * size * dirM - price * size * FEE
              balance += entry * size/tLev + pnl; openCount--
              await supabase.from('bot_trades').update({
                status: 'SL', exit_price: price, pnl, pnl_pct: fav,
                closed_at: new Date().toISOString()
              }).eq('id', t.id)
              await supabase.from('bot_trade_snapshots').update({ result: 'vwap_counter_exit', pnl }).eq('trade_id', t.id).then(()=>{},()=>{})
              await updateMarketMemory(supabase, t.id, 'SL', pnl, log)
              log.push(`VWAP_COUNTER ${sym} ${t.side} @${price.toFixed(4)} vwap=${vwapNow.toFixed(4)} pnl=${pnl.toFixed(2)}`)
              continue
            }
          }

          // ── v29: Stop-Hunt Counter-Signal Exit ──
          // If the OPPOSITE stop-hunt fires while we're losing (< -0.2R),
          // the market just swept stops in the direction that hurts us —
          // strong reversal evidence. Exit early rather than wait for SL.
          const shOppSide = t.side === 'LONG' ? 'SHORT' : 'LONG'
          const shProfitR = slDist > 0 ? (price - entry) * dirM / slDist : 0
          if (t.mtf && shProfitR < -0.2 && detectStopHunt(completed, shOppSide)) {
            const fav = (price - entry) / entry * dirM
            const pnl = (price - entry) * size * dirM - price * size * FEE
            balance += entry * size/tLev + pnl; openCount--
            await supabase.from('bot_trades').update({
              status: 'SL', exit_price: price, pnl, pnl_pct: fav,
              closed_at: new Date().toISOString()
            }).eq('id', t.id)
            await supabase.from('bot_trade_snapshots').update({ result: 'stop_hunt_counter_exit', pnl }).eq('trade_id', t.id).then(()=>{},()=>{})
            await updateMarketMemory(supabase, t.id, 'SL', pnl, log)
            log.push(`STOP_HUNT_COUNTER ${sym} ${t.side} @${price.toFixed(4)} pnl=${pnl.toFixed(2)}`)
            continue
          }

          // ── v33: Liquidity Zone counter-exit (Option B) ──
          // If an opposite-direction zone fires with full confidence while we're
          // losing (< -0.2R), the market is about to sweep stops against us.
          // Exit early — same logic as stop-hunt counter but OI-validated.
          const liqOppSide = t.side === 'LONG' ? 'SHORT' : 'LONG'
          const liqOppR = slDist > 0 ? (price - entry) * dirM / slDist : 0
          if (t.mtf && liqOppR < -0.2 && oiHistory.length >= 10) {
            const liqOppResult = detectLiquidationZone(completed, price, oiHistory, liqOppSide)
            if (liqOppResult.hit && liqOppResult.confidence >= 1.0) {
              const fav = (price - entry) / entry * dirM
              const pnl = (price - entry) * size * dirM - price * size * FEE
              balance += entry * size/tLev + pnl; openCount--
              await supabase.from('bot_trades').update({
                status: 'SL', exit_price: price, pnl, pnl_pct: fav,
                closed_at: new Date().toISOString()
              }).eq('id', t.id)
              await supabase.from('bot_trade_snapshots').update({ result: 'liq_zone_counter_exit', pnl }).eq('trade_id', t.id).then(()=>{},()=>{})
              await updateMarketMemory(supabase, t.id, 'SL', pnl, log)
              log.push(`LIQ_ZONE_COUNTER ${sym} ${t.side} @${price.toFixed(4)} zone=${liqOppResult.zoneLevel.toFixed(4)} pnl=${pnl.toFixed(2)}`)
              continue
            }
          }

          const storedTP_LONG =Number(t.hi)>entry*1.001
          const storedTP_SHORT=Number(t.lo) <entry*0.999
          const tp=storedTP_LONG  ?Number(t.hi)
                  :storedTP_SHORT ?Number(t.lo)
                  :t.side==='LONG'?entry+slDist*vp.tpR:entry-slDist*vp.tpR

          // v41.1: legacy (mtf) trades store TP at vp.tpR×slDist; DONCH4H trades
          // store TP at 1.6R (v45 ladder) — divide by the right factor to recover slDist.
          const tpRFactor = t.mtf ? vp.tpR : 1.6
          const origSlDist=(t.side==='LONG' &&storedTP_LONG )?(Number(t.hi)-entry)/tpRFactor
                          :(t.side==='SHORT'&&storedTP_SHORT)?(entry-Number(t.lo))/tpRFactor
                          :slDist

          // v21: Dynamic partial TP R by current vol regime
          const dynamicPartialR=dynPartialTP[volRegime]

          // v39: PARTIAL TP DISABLED — with 32% WR the strategy needs
          // avg_win/avg_loss > 2.1x; taking half off at ~1.2R capped winners
          // and guaranteed negative expectancy. Let winners run to full TP,
          // protected only by the breakeven+trail below.
          void dynamicPartialR

          // ── v45 LADDER exit (DONCH4H trades only, mtf:false) ──
          // Validated on 36 months / 8,421 trades: +0.064R maker vs +0.055 SPLIT,
          // same WR, all 6 windows positive. Thirds at 0.6R → BE stop → 1.0R →
          // final third runs to the stored 1.6R TP.
          if (!t.mtf && origSlDist > 0) {
            const stage = Number((t as any).exit_stage ?? 0)
            if (stage === 0 && !t.partial_done) {
              const p06 = entry + origSlDist*S.LADDER_LEG1_R*dirM
              if (t.side==='LONG' ? price>=p06 : price<=p06) {
                const third = size/3
                if (liveMode) {   // v55 seam #4a: reduce-only market for the leg
                  const q = await bybitQty(sym, third)
                  if (q > 0) {
                    const r = await bybitMarket(sym, t.side==='SHORT', q, true)
                    if (!r.ok) { log.push(`LIVE_LEG_FAIL ${sym} 0.6R: ${r.err}`); await logErr('live_leg06', `${sym} ${r.err}`); continue }
                  }
                }
                const pnl1 = (p06-entry)*third*dirM - p06*third*FEE_MAKER   // v47: limit fill at level, maker fee
                balance += entry*third/tLev + pnl1
                await supabase.from('bot_trades').update({
                  size: size-third, trail_sl: entry, partial_done: true, exit_stage: 1,
                  legs_banked: (Number((t as any).legs_banked)||0) + pnl1   // v56.2: leg pnl must reach the row
                }).eq('id', t.id)
                log.push(`LADDER_06 ${sym} ${t.side} ⅓@${p06.toFixed(4)} pnl=${pnl1.toFixed(2)} sl→BE`)
                continue
              }
            } else if (stage === 1) {
              const p10 = entry + origSlDist*S.LADDER_LEG2_R*dirM
              if (t.side==='LONG' ? price>=p10 : price<=p10) {
                const half = size/2   // half of remaining ⅔ = ⅓ of original
                if (liveMode) {   // v55 seam #4b
                  const q = await bybitQty(sym, half)
                  if (q > 0) {
                    const r = await bybitMarket(sym, t.side==='SHORT', q, true)
                    if (!r.ok) { log.push(`LIVE_LEG_FAIL ${sym} 1.0R: ${r.err}`); await logErr('live_leg10', `${sym} ${r.err}`); continue }
                  }
                }
                const pnl2 = (p10-entry)*half*dirM - p10*half*FEE_MAKER   // v47: limit fill at level, maker fee
                balance += entry*half/tLev + pnl2
                await supabase.from('bot_trades').update({
                  size: size-half, exit_stage: 2, trail_sl: entry,
                  legs_banked: (Number((t as any).legs_banked)||0) + pnl2   // v56.2: leg pnl must reach the row
                }).eq('id', t.id)
                log.push(`LADDER_10 ${sym} ${t.side} ⅓@${p10.toFixed(4)} pnl=${pnl2.toFixed(2)} → final ⅓ trails`)
                continue
              }
            } else if (stage === 2) {
              // ── v53 TRAILING FINAL THIRD (replaces fixed 1.6R cap) ──
              // v58bt walk-forward (36m, 11,218 signals): chandelier trail on the
              // last third — +0.0620R vs +0.0456R fixed, totR 696 vs 512 (+36%),
              // all 6 windows positive. Fat-tail capture: rare 4R+ runs pay for
              // the give-back. Trail dist = 2.5×ATR(4h) = origSlDist×2.5/1.4.
              // Stop = taker (market); first two legs already banked maker at
              // 0.6R/1.0R. trail_sl ratchets from BE and never loosens.
              const trailDist = origSlDist * (S.TRAIL_ATR_MULT / S.SL_ATR_MULT)
              const chand = t.side==='LONG' ? price - trailDist : price + trailDist
              const cur = Number(t.trail_sl)
              const nt = t.side==='LONG' ? Math.max(cur, chand) : Math.min(cur, chand)
              const hit = t.side==='LONG' ? price <= nt : price >= nt
              const timedOut = ageMs > MAX_HOLD_MIN*60_000
              if (hit || timedOut) {
                if (liveMode) {   // v55 seam #4c: reduce-only market, full remaining third
                  const q = await bybitQty(sym, size)
                  const r = q>0 ? await bybitMarket(sym, t.side==='SHORT', q, true) : {ok:false, err:'qty<min'} as const
                  if (!r.ok) { log.push(`LIVE_CLOSE_FAIL ${sym} trail: ${'err' in r?r.err:''}`); await logErr('live_close_trail', `${sym}`); continue }
                }
                const fav=(price-entry)/entry*dirM
                const pnlLeg=(price-entry)*size*dirM - price*size*FEE   // trailing stop = taker
                // v56.2: row pnl = final leg + banked ladder legs (balance got legs at leg time)
                const pnl = pnlLeg + (Number((t as any).legs_banked)||0)
                const final = pnl>0 ? 'TP' : 'TRAIL'
                balance += entry*size/tLev + pnlLeg; openCount--
                await supabase.from('bot_trades').update({
                  status: final, exit_price: price, pnl, pnl_pct: fav,
                  closed_at: new Date().toISOString()
                }).eq('id', t.id)
                await supabase.from('bot_trade_snapshots').update({ result: final, pnl }).eq('trade_id', t.id).then(()=>{},()=>{})
                await updateMarketMemory(supabase, t.id, final, pnl, log)
                log.push(`LADDER_TRAIL ${sym} ${t.side} final⅓ @${price.toFixed(4)} pnl=${pnl.toFixed(2)} ${timedOut?'(timeout)':''}`)
                continue
              }
              if (nt !== cur) await supabase.from('bot_trades').update({ trail_sl: nt }).eq('id', t.id)
              continue  // ride the final third — never fall through to the fixed-TP logic
            }
          }

          // ── Use adjusted SL if equity guard is active ──
          const slToUse = equityGuardMult === 0.5 ? adjustedSl : sl

          let newStatus:string|null=null
          if (t.side==='LONG') {
            if(price>=tp)  newStatus='TP'
            else if(price<=slToUse) newStatus=price>=entry?'TRAIL':'SL'
          } else {
            if(price<=tp)  newStatus='TP'
            else if(price>=slToUse) newStatus=price<=entry?'TRAIL':'SL'
          }
          // v25: Dynamic max hold — extend if in profit, shorten if losing
          const profitRForHold = origSlDist > 0 ? (price-entry)*dirM/origSlDist : 0
          const adjMaxHold = calcDynamicMaxHold(dynMaxHold, profitRForHold)
          if (!newStatus&&ageMs>adjMaxHold*60_000) newStatus='TRAIL'

          if (newStatus) {
            // v47: DONCH4H TP is a resting limit at the stored 1.6R level →
            // fill at the level itself with maker fee. Stops/timeouts stay taker.
            // v54: stops/timeouts are market fills → 3 bps adverse slippage.
            const isMakerTP = newStatus==='TP' && !t.mtf
            let exitPx = isMakerTP ? tp : price * (1 - dirM * SLIP)
            if (liveMode) {   // v55 seam #5: reduce-only market close
              const q = await bybitQty(sym, size)
              const r = q>0 ? await bybitMarket(sym, t.side==='SHORT', q, true) : {ok:false, err:'qty<min'} as const
              if (!r.ok) { log.push(`LIVE_CLOSE_FAIL ${sym}: ${'err' in r?r.err:''} — retry next cycle`); await logErr('live_close', `${sym}`); continue }
              if (r.avgPrice) exitPx = r.avgPrice
            }
            const fav=(exitPx-entry)/entry*dirM
            const pnlLeg=(exitPx-entry)*size*dirM-exitPx*size*(isMakerTP?FEE_MAKER:FEE)
            // v56.2: include banked ladder legs (zero for non-laddered rows)
            const pnl = pnlLeg + (Number((t as any).legs_banked)||0)
            const final=pnl>0&&newStatus==='SL'?'TP':newStatus
            balance+=entry*size+pnlLeg; openCount--
            await supabase.from('bot_trades').update({
              status:final,exit_price:exitPx,pnl,
              pnl_pct:fav,closed_at:new Date().toISOString()
            }).eq('id',t.id)
            // Phase 1: update snapshot with close result
            await supabase.from('bot_trade_snapshots').update({ result:final, pnl }).eq('trade_id',t.id).then(()=>{},()=>{})
            // Phase 9: update market memory
            await updateMarketMemory(supabase, t.id, final, pnl, log)
            const modeTag=t.mtf?'SWEEP':'RANGE'
            log.push(`CLOSE ${sym} ${t.side} ${final} [${modeTag}] pnl=${pnl.toFixed(2)} ${Math.round(ageMs/60000)}m`)
          } else if (t.mtf) {
            // ── TASK 1: Enhanced trailing — start from 0.5R instead of 3R ──
            const profitR=origSlDist>0?(price-entry)*dirM/origSlDist:0
            let newSL=slToUse

            // v39: breakeven lock pushed 1.0R→1.5R and ATR trail 1.5R→2.0R.
            // With partial TP removed, winners must reach toward the 2.5R full
            // TP — locking breakeven too early was exiting them flat (TRAIL 55%).
            if (profitR>=1.5) {
              const beLevel=entry*(1+FEE*2.5*dirM)
              newSL=dirM===1?Math.max(newSL,beLevel):Math.min(newSL,beLevel)
            }
            if (profitR>=2.0) {
              const trailLevel=price-atr*vp.trailAtr*dirM
              newSL=dirM===1?Math.max(newSL,trailLevel):Math.min(newSL,trailLevel)
            }
            // v21: Lock in most profit at 3R
            if (profitR>=3.0) {
              const trail3R=price-atr*0.5*dirM
              newSL=dirM===1?Math.max(newSL,trail3R):Math.min(newSL,trail3R)
            }
            // v21: Nearly at TP at 5R — very tight trail
            if (profitR>=5.0) {
              const trail5R=price-atr*0.25*dirM
              newSL=dirM===1?Math.max(newSL,trail5R):Math.min(newSL,trail5R)
            }

            // v33: Option A — snap SL to just outside our own liquidity zone.
            // If a same-direction zone is active, it's a validated support (LONG)
            // or resistance (SHORT) — use it as a natural, tight stop level.
            if (oiHistory.length >= 10) {
              const liqOwnResult = detectLiquidationZone(completed, price, oiHistory, t.side as 'LONG'|'SHORT')
              if (liqOwnResult.hit && liqOwnResult.zoneLevel > 0) {
                const zoneSL = t.side === 'LONG'
                  ? liqOwnResult.zoneLevel * (1 - 0.003)  // 0.3% below support
                  : liqOwnResult.zoneLevel * (1 + 0.003)  // 0.3% above resistance
                const prevSL = newSL
                newSL = dirM === 1 ? Math.max(newSL, zoneSL) : Math.min(newSL, zoneSL)
                if (newSL !== prevSL)
                  log.push(`LIQ_ZONE_SL ${sym} ${t.side} snap sl=${newSL.toFixed(4)} zone=${liqOwnResult.zoneLevel.toFixed(4)}`)
              }
            }

            if (newSL!==slToUse)
              await supabase.from('bot_trades').update({trail_sl:newSL}).eq('id',t.id)
          }
        }

        // ── New entry ──────────────────────────────────────
        if (circuitBreakerActive) return
        if (entriesBlocked) return  // 30% equity DD pause or daily loss limit
        if (streakPaused) return
        if (openCount >= MAX_OPEN_TRADES) return
        // v46 PYRAMID (validated: 9,000 trades, +0.062R, all 6 windows positive):
        // allow a 2nd DONCH4H unit on the same coin when the 1st is ≥0.6R in
        // profit and the new breakout is the same direction. Anything else blocks.
        // v49: depth 3 (validated: 9,091 trades, +0.047R, all 6 windows) —
        // 3rd unit requires ALL open units ≥1.0R.
        // v62.0 sleeve gate — new breakout entries only. Exits are untouched.
        if (!DONCH_ENABLED) return
        const donchOnSym = openTrades.filter((t:any)=>t.strategy==='DONCH4H')
        if (openTrades.some((t:any)=>t.strategy!=='DONCH4H')) return  // ROTA/legacy holds the coin
        if (donchOnSym.length >= 3) return                            // max 3 units
        if (symCooldown.has(sym)) return
        // v31-B: loss cooldown check (applied after entryScore.side is known)
        // NOTE: side is determined after calcConfluenceScore — loss cooldown
        // is checked further below once we know the side.
        if (dynamicBlacklist.has(sym)) return
        // Phase 4: Skip suspended coins
        if (suspendedCoins.has(sym)) { log.push(`SKIP ${sym}: suspended`); return }
        // Phase 11: Macro event filter
        const macroChk = isMacroEventWindow(new Date())
        if (macroChk.skip) { log.push(`SKIP ${sym}: macro ${macroChk.reason}`); return }
        if (atrPct > 0.02 || atrPct < 0.00003) return
        if (balance < 10) return
        // v27.2: cap new entries per scan — don't build the whole basket in one minute
        if (newEntriesThisScan >= MAX_NEW_ENTRIES_PER_SCAN) return

        // ════════════════════════════════════════════════════════════════
        // v41 ENTRY ENGINE — DONCH4H (replaces the 5m confluence engine).
        // Walk-forward-proven on 6 months × 39 coins × 849 trades:
        // Donchian-40 breakout on 4h + ADX>25 | TP 1.0R | SL 1.4×ATR(4h)
        // +0.119R/trade (maker), +0.099R (taker), positive in all 3 windows.
        // Entries only evaluated in the 15 min after a 4h close (backtest
        // semantics: decision at bar close). Exits: pure fixed SL/TP + 16d
        // timeout — mtf:false disables all legacy trailing/partial/5m exits.
        // ════════════════════════════════════════════════════════════════
        {
          if (donchPaused) return  // v43 (#4): health kill-switch
          if (dayLossPaused) return  // v50: daily loss circuit breaker
          const msInto4h = Date.now() % 14_400_000
          if (msInto4h > 15 * 60_000) return  // outside the post-close window
          const bars4h = await fetchBars(sym, '4h', 70)
          if (bars4h.length < 45) return
          const c4 = bars4h.slice(0, -1)          // completed 4h bars only
          const last4 = c4[c4.length - 1]
          // v59.0: the signal is S.donchSignal — the same call the backtest makes.
          // (v51: Donchian window 25→15, v55bt: DW=15 n=11,218 avg +0.0456R, all 6
          // windows positive → +33% trades, +22% total R vs DW=25's 420R/36m.
          // DW=40 slow sleeve rejected: window-1 negative. 15 was never in the
          // old refine grids [25,30,40,55,70] — first time tested.)
          const sig4 = S.donchSignal(c4)
          if (!sig4) return
          const side4: 'LONG'|'SHORT' = sig4.side
          // v59.0 BAR-ALIGNMENT DIAGNOSTIC. Now that bars carry their open time we
          // can finally ask whether this series is the one that just closed, rather
          // than trusting `Date.now() % 14_400_000` and hoping the feed agrees. A
          // fallback source that lags a bar would otherwise produce a confident
          // breakout off the wrong candle with nothing in the log to show for it.
          // DELIBERATELY DIAGNOSTIC ONLY — it journals and never skips. Standing
          // rule 5 forbids adding a filter that can cut trades, and the honest
          // first move on a suspected data fault is to measure how often it fires,
          // not to start dropping entries on a hypothesis. If bot_skips shows these
          // accumulating, that is evidence, and then it is a decision to make.
          if (Number.isFinite(last4.t) && last4.t > 0 && msInto4h < 120_000) {
            const lagMs = Date.now() - (last4.t + 14_400_000)
            if (lagMs > 15 * 60_000) {
              logSkip(sym, 'DONCH4H', 'bar_lag_diagnostic',
                { lagMin: Math.round(lagMs / 60_000), barOpen: last4.t, source: _lastFetchSource, side: side4 })
            }
          }
          const adx4 = S.gateAdx(c4)
          if (adx4 <= S.ADX_GATE) {
            log.push(`SKIP ${sym}: DONCH4H breakout but adx=${adx4.toFixed(0)}<=${S.ADX_GATE}`)
            if (msInto4h < 120_000) logSkip(sym,'DONCH4H','adx_gate',{adx:+adx4.toFixed(1), side:side4, close:last4.close})
            return
          }
          // v46 PYRAMID gate: a 2nd unit only stacks on a same-direction winner ≥0.6R
          // v49: a 3rd unit requires ALL open units ≥1.0R (validated, all 6 windows)
          if (donchOnSym.length > 0) {
            // The row does not persist the stop distance, so recover it from the
            // stored 1.6R take-profit level — |tp − entry| / 1.6 — and hand the
            // shared gate plain numbers. Same arithmetic as before, one owner.
            const units: S.OpenUnit[] = donchOnSym.map((t:any) => ({
              side: t.side as S.Side,
              entry: Number(t.entry_price),
              origSlDist: Math.abs((t.side==='LONG' ? Number(t.hi) : Number(t.lo)) - Number(t.entry_price)) / S.LADDER_TP_R,
            }))
            const ok = S.pyramidGateOk(units, side4, price)
            if (!ok) {
              if (msInto4h < 120_000) logSkip(sym,'DONCH4H','pyramid_gate',{units:donchOnSym.length, side:side4})
              return
            }
            log.push(`PYRAMID ${sym}: stacking unit #${donchOnSym.length+1} on winning ${side4}`)
          }
          const atr4 = S.entryAtr(c4)
          if (!atr4) return
          const slDist4 = S.stopDistance(atr4, price)
          const slPct4 = slDist4 / price
          if (slPct4 > S.SL_MAX_PCT) return
          const dirM4 = side4 === 'LONG' ? 1 : -1
          const slPrice4 = price - slDist4 * dirM4
          const tpPrice4 = price + slDist4 * S.LADDER_TP_R * dirM4   // v45: final ladder stage = 1.6R

          // sizing: equal weight across remaining slots + 60% net-direction cap
          const curExp4 = (allOpen||[]).reduce((s2:number,x:any)=>s2+Number(x.entry_price)*Number(x.size),0)
          const totPort4 = balance + curExp4
          const remain4 = Math.max(0, totPort4 - curExp4)
          const slots4 = Math.max(1, MAX_OPEN_TRADES - openCount)
          // v43 (#1): RISK-BASED sizing — each breakout risks 0.75% of the
          // portfolio (notional derived from SL distance), capped at 15% of
          // portfolio per position. Same entries, right-sized capital.
          // v44 (#3): ADX-tiered risk — validated monotonic ladder on 36 months:
          // expR +0.007 (adx 22-28) → +0.019 → +0.042 → +0.086 (adx>45).
          const adxMult = S.adxTierMult(adx4)
          // v45.1 SPORTY: base risk 0.75%→1.25% per breakout.
          // v57.2 (2026-09-18, EXPLICIT USER INSTRUCTION): 1.25% → 1.75%.
          //  This is tier 2 of the Monte Carlo ladder (v50bt): median maxDD 22%,
          //  p90 34%, p99 47%, against 16/25/36% at 1.25%. In Kelly terms it moves
          //  from ~¼-Kelly to ~⅓-Kelly — still under the f*≈6.5% optimum, so growth
          //  scales close to linearly while variance scales with the square.
          //  It was raised WITHOUT the 50-trade checkpoint the owner themselves set
          //  on 2026-07-12 (counter was 0/50). The risk was put to them in numbers —
          //  a p90 34% drawdown — and they instructed the raise anyway. Recorded here
          //  because the next session must not read this as a validated result: the
          //  live expectation band has NOT been confirmed at any size yet.
          const riskNotional = (totPort4 * BASE_RISK_PCT * adxMult) / slPct4
          let notional4 = Math.min(Math.max(riskNotional, 500), totPort4 * 0.20, remain4, balance * 0.95)
          // v54: liquidity guard — never exceed 0.5% of the coin's 24h quote
          // volume (last 6 completed 4h bars). No-op at paper scale on majors;
          // protects thin alts when real capital arrives.
          const quoteVol24h = c4.slice(-6).reduce((s2:number,b2:Bar)=>s2+b2.vol,0) * price
          if (quoteVol24h > 0 && notional4 > quoteVol24h * 0.005) {
            notional4 = quoteVol24h * 0.005
            log.push(`LIQ_CAP ${sym}: notional capped to $${notional4.toFixed(0)} (0.5% of 24h vol)`)
          }
          // v56: Portfolio Heat Limit — prevent total open notional (DONCH4H + ROTA
          // combined) from exceeding 95% of portfolio value. Fires when ROTA's 70% book
          // + several DONCH4H positions are open simultaneously. Trims entry to fit;
          // skips only if remaining room < $500.
          // v56.9: subtract what THIS cycle has already committed, not just what the
          // snapshot showed — see the heatCommitted comment where it is declared.
          const heatUsed = curExp4 + heatCommitted
          const heatRoom = Math.max(0, totPort4 * MAX_HEAT_PCT - heatUsed)
          if (notional4 > heatRoom) {
            notional4 = heatRoom
            if (heatRoom >= 500) log.push(`HEAT_CAP ${sym}: notional trimmed to $${heatRoom.toFixed(0)} (heat=${(heatUsed/Math.max(totPort4,1)*100).toFixed(0)}%)`)
          }
          if (notional4 < 500) {
            const isHeat = heatRoom < 500
            if (msInto4h < 120_000) logSkip(sym,'DONCH4H', isHeat ? 'heat_limit' : 'too_small_or_liq_cap',
              {notional:+notional4.toFixed(0), vol24h:+quoteVol24h.toFixed(0), heatPct:+(heatUsed/Math.max(totPort4,1)*100).toFixed(0)})
            return
          }
          const sideExp4 = (allOpen||[]).reduce((acc:{l:number,s:number}, x:any) => {
            const n2 = Number(x.entry_price)*Number(x.size)
            if (x.side==='LONG') acc.l += n2; else acc.s += n2
            return acc
          }, {l:0, s:0})
          sideExp4.l += netCommitted.l; sideExp4.s += netCommitted.s   // v56.9: same-cycle entries
          const netAfter4 = side4==='LONG' ? (sideExp4.l+notional4)-sideExp4.s : sideExp4.l-(sideExp4.s+notional4)
          if (totPort4 > 0 && Math.abs(netAfter4) > totPort4 * 0.60) {
            log.push(`SKIP ${sym}: DONCH4H net ${side4} exposure cap`)
            if (msInto4h < 120_000) logSkip(sym,'DONCH4H','net_exposure_cap',{side:side4, netAfterPct:+(netAfter4/totPort4*100).toFixed(0)})
            return
          }
          // v56.9: RESERVE the room now. Everything from here to the insert is either
          // synchronous or an await, and an await is exactly where a sibling coin in the
          // same Promise.all batch gets to run — so the reservation has to happen before
          // the first one, and be released on every path that then bails out.
          heatCommitted += notional4
          if (side4==='LONG') netCommitted.l += notional4; else netCommitted.s += notional4
          const releaseHeat = () => {
            heatCommitted -= notional4
            if (side4==='LONG') netCommitted.l -= notional4; else netCommitted.s -= notional4
          }

          // v50.1: never open on a bad tick — require Bybit to agree within 0.5%
          if (!(await priceSane(sym, price))) {
            log.push(`SKIP ${sym}: cross-source price mismatch (bad tick?)`)
            if (msInto4h < 120_000) logSkip(sym,'DONCH4H','bad_tick',{price, divergePct:+(_lastPriceDiverge*100).toFixed(2)})
            releaseHeat(); return
          }
          // v54: adverse entry slippage on the market fill (3 bps); SL/TP levels
          // stay at the scan-price levels — only the recorded fill moves.
          let fillPx4 = price * (1 + dirM4 * SLIP)
          let size4 = notional4 / fillPx4
          if (liveMode) {   // v55 seam #1: real market order, real fill price
            const q = await bybitQty(sym, size4)
            if (q <= 0) { log.push(`LIVE_SKIP ${sym}: below exchange min qty`); logSkip(sym,'DONCH4H','live_min_qty',{size:size4}); releaseHeat(); return }
            const r = await bybitMarket(sym, side4==='LONG', q, false)
            if (!r.ok) { log.push(`LIVE_REJECT ${sym}: ${r.err}`); await logErr('live_open_donch', `${sym} ${r.err}`); releaseHeat(); return }
            size4 = q
            if (r.avgPrice) fillPx4 = r.avgPrice
          }
          const feeIn4 = notional4 * FEE
          balance -= (notional4 + feeIn4); openCount++; newEntriesThisScan++
          await supabase.from('bot_trades').insert({
            sym, side: side4, entry_price: fillPx4, size: size4, fee: feeIn4,
            trail_sl: slPrice4,
            hi: side4 === 'LONG' ? tpPrice4 : fillPx4,
            lo: side4 === 'SHORT' ? tpPrice4 : fillPx4,
            status: 'OPEN', score: Math.round(adx4), mtf: false, partial_done: false,
            paper_mode: paperMode, entry_macd_hist: 0, strategy: 'DONCH4H',
            risk_usd: slDist4 * size4   // v52.1: risk taken at entry → live R = pnl/risk_usd
          })
          symCooldown.add(sym)
          log.push(`OPEN ${sym} ${side4} DONCH4H @${fillPx4.toFixed(4)} adx4h=${adx4.toFixed(0)} sl=${slPrice4.toFixed(4)} tp=${tpPrice4.toFixed(4)} $${notional4.toFixed(0)}`)
          return  // v41: never fall through to the legacy 5m confluence engine
        }

        // ═══ v58.0: LEGACY 5m ENGINE — HARD STOP ═══════════════════════════
        // Everything below this line is the retired v23/v39 5-minute confluence
        // engine (RSI/MACD/BB/Stoch scoring, its own SL/TP, its own sizing). It
        // was only ever fenced off by the `return` in the DONCH4H block above,
        // which fires ONLY when a breakout opens. On every cycle where DONCH4H
        // found nothing — the overwhelming majority — execution fell straight
        // through to here and the legacy engine could open a position. Those rows
        // carry no `strategy` field, so the column default tagged them 'LEGACY',
        // and they would land in the same book, the same equity curve and the
        // same health kill-switch as the two validated sleeves while having no
        // walk-forward behind them at all. Nothing on this project has fired yet
        // (16 trades, all DONCH4H/ROTA) only because the confluence gate is 75.
        // DONCH4H and ROTA are the only engines. This returns unconditionally.
        return
        // (The ~275 lines of the retired 5m confluence engine that used to sit
        //  here — its scoring, sizing, SL/TP and its own bot_trades insert, the
        //  one row shape in the file that never set a `strategy` — are deleted.
        //  They were unreachable behind the return above, but an untagged insert
        //  sitting in the file is a loaded gun: one edited return and it writes
        //  'LEGACY' rows into the same book the validated sleeves are measured in.)
      } catch(e) {
        log.push(`ERR ${sym}: ${String(e).slice(0,40)}`)
        await logErr('scan:'+sym, e)
      }
      }))
    }

    // v22: Log daily summary if it's the start of a new day
    if (needDailySummary && dayTradesRaw) {
      await logDailySummary(supabase, dayTradesRaw, btcRegime, btcAdxForDaily, log)
    }

    // v46: equity history — snapshot every 15 minutes for the dashboard curve
    if (utcM % 15 === 0) {
      const {data:eqOpen} = await supabase.from('bot_trades').select('sym,side,entry_price,size,lev').eq('status','OPEN')
      // v54: perp funding simulation — once per hour, longs pay / shorts
      // receive FUND_8H/8 of notional. Portfolio-level (balance), so the
      // equity curve and the checkpoint measure real perp economics.
      if (utcM === 0) {
        let fund = 0
        for (const x of (eqOpen||[])) {
          const notional = Number(x.entry_price)*Number(x.size)
          fund += (x.side==='LONG' ? -1 : 1) * notional * (FUND_8H/8)
        }
        if (Math.abs(fund) > 0.0001) {
          balance += fund
          log.push(`FUNDING ${fund>=0?'+':''}${fund.toFixed(4)}$ (${(eqOpen||[]).length} pos)`)
        }
      }
      const eqExp = (eqOpen||[]).reduce((a:number,x:any)=>a+Number(x.entry_price)*Number(x.size),0)
      // v50.2: mark-to-market — position value at the live mark, not at entry.
      // v67.2: value = MARGIN posted + unrealised P&L. The old form (size×px)
      // is only right at 1x; at 2x it booked the borrowed half as equity
      // ($776 on a $500 account), and it floors a liquidated slot at -margin.
      const eqMtm = (eqOpen||[]).reduce((a:number,x:any)=>{
        const e=Number(x.entry_price), sz=Number(x.size), lv=Math.max(1, Number(x.lev)||1)
        const px=livePx.get(x.sym) ?? e
        const upnl = (x.side==='LONG' ? 1 : -1) * (px-e) * sz
        return a + Math.max(0, e*sz/lv + upnl)
      },0)
      try { await supabase.from('bot_equity').insert({ equity: balance+eqMtm, balance, exposure: eqExp }) } catch (e) { await logErr('equity_snapshot', e) }
    }

    await supabase.from('bot_state').update({
      balance, updated_at: new Date().toISOString(),
      market_regime: btcRegime, streak,
      peak_balance:  newPeakBalance,
      coin_weights:  coinWeights,
      lock_until:    new Date().toISOString(),  // v28.2: release run lease
      // v52.1: shield state published for the dashboard + watchdog alerts
      shields: { donch_paused: donchPaused, rota_paused: rotaPaused,
                 day_loss_paused: dayLossPaused, depeg_paused: depegPaused },
      // v54.1: per-source feed health for the dashboard panel
      feed_health: { ..._feedStats, source: _lastFetchSource, ts: new Date().toISOString() },
    }).eq('id',1)

    return new Response(JSON.stringify({
      ok:true,v:28,openCount,maxOpen:MAX_OPEN_TRADES,streakPaused,streak,btcBias,btcRegime,
      kelly:kellyMult,fearGreed,adaptMinScore,adaptVpocDist,adaptSideFilter,
      session,sessionSizeMult:sp.sizeMult,equityGuardMult,
      equity:equity.toFixed(2),lockedNotional:lockedNotional.toFixed(2),
      drawdownFromPeak:(drawdownFromPeak*100).toFixed(1)+'%',
      drawdownScale:(drawdownScale*100).toFixed(0)+'%',
      dailyPnl:dailyPnl.toFixed(2),dailyLossLimitActive,
      suspended:[...suspendedCoins],
      blacklist:[...dynamicBlacklist],
      topCoins:topCoins.slice(0,5).map(([s,v])=>({
        sym:s,score:v.score.toFixed(0),wr:(v.wr*100).toFixed(0)+'%',pf:v.pf.toFixed(2)
      })),
      log
    }),{headers:{'Content-Type':'application/json'}})

  } catch(e) {
    // v58.0: this returned HTTP 200 with the error in the body. Every monitor in
    // front of it — the cron runner, the watchdog, an uptime check — reads the
    // status line, so a cycle that threw before placing or managing a single
    // trade was indistinguishable from a healthy one. That is precisely the shape
    // of the 45-day freeze: green everywhere, nothing happening. Fail loudly.
    try { await logErrTop('cycle', e) } catch { /* never mask the original */ }
    return new Response(JSON.stringify({ok:false, error:String(e)}),{
      status:500,headers:{'Content-Type':'application/json'}
    })
  }
})

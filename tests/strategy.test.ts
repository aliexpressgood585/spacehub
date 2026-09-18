// ════════════════════════════════════════════════════════════════════════════
// tests/strategy.test.ts — the rules, pinned.
//
// Runs on plain Node (no deno, no network, no Supabase):
//     node --experimental-strip-types tests/strategy.test.ts
//   or:
//     bash scripts/run-tests.sh
//
// TWO KINDS OF ASSERTION HERE, and the difference matters:
//
//  1. GOLDEN NUMBERS. The indicator values below were produced by the LIVE
//     BOT's own calcATR/calcADX, extracted from
//     supabase/functions/trading-bot/index.ts and run against the fixture in
//     this file. They match shared/strategy.ts to ten decimal places. If one of
//     these fails, the strategy moved — not the test. Do not re-baseline them to
//     make a run go green; every validated result in CLAUDE.md was measured with
//     these exact numbers, so changing them silently invalidates the archive.
//
//  2. BEHAVIOURAL ASSERTIONS. Ladder arithmetic, sizing order, gate boundaries.
//     These encode decisions that cost a validation batch each — the ⅓/⅓/trail
//     shape (v59bt), the ADX tier table (v44/v58bt/v72bt), the heat cap trimming
//     rather than skipping (v56.0/v65bt). They are here so that a future
//     "cleanup" has to argue with a failing test instead of quietly winning.
// ════════════════════════════════════════════════════════════════════════════

import * as S from '../shared/strategy.ts'

// Declared rather than pulled from @types/node: this suite must typecheck and
// run with nothing installed, on any machine, with no network. The same reason
// shared/strategy.ts imports nothing.
declare const process: { exit(code: number): never }

let passed = 0
const failures: string[] = []

function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; return }
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}
function near(name: string, got: number, want: number, tol = 1e-9) {
  check(name, Math.abs(got - want) <= tol, `got ${got}, want ${want} (tol ${tol})`)
}

// ─── fixture: a deterministic trending series, no RNG ───────────────────────
function fixture(n = 80): S.Bar[] {
  const bars: S.Bar[] = []
  let px = 100
  for (let i = 0; i < n; i++) {
    px = px * (1 + 0.004 * Math.sin(i / 3) + 0.0015 * i / 80)
    bars.push({
      t: i * 14_400_000,
      open: px,
      high: px * (1 + 0.006 + 0.002 * Math.cos(i / 5)),
      low: px * (1 - 0.006 - 0.002 * Math.cos(i / 7)),
      close: px,
      vol: 1000 + i,
    })
  }
  return bars
}

// ════════════════════════════════════════════════════════════════════════════
// 1. INDICATORS — golden values from the live bot
// ════════════════════════════════════════════════════════════════════════════
{
  const b = fixture()
  near('calcATR(20) matches the live bot', S.calcATR(b.slice(-20)), 1.1632112956, 1e-9)
  near('calcADX(60) matches the live bot', S.calcADX(b.slice(-60)), 31.6683034253, 1e-9)
  near('calcADX(15) matches the live bot', S.calcADX(b.slice(-15)), 8.7448526925, 1e-9)

  // degenerate inputs must not produce NaN — a NaN ADX reads as "gate passed"
  // in a `> 22` comparison only by accident, and as "gate failed" in `<= 22`.
  check('calcADX on too-short input returns the 20 sentinel', S.calcADX(b.slice(-5)) === 20)
  check('calcATR on too-short input is finite', Number.isFinite(S.calcATR(b.slice(-3))))
  check('calcADX output is clamped to [0,100]', (() => {
    const v = S.calcADX(b.slice(-60)); return v >= 0 && v <= 100
  })())
}

// ════════════════════════════════════════════════════════════════════════════
// 2. THE UNIVERSE — rule 2, and the release-provenance hash
// ════════════════════════════════════════════════════════════════════════════
{
  check('CRYPTO_40 has exactly 40 names', S.CRYPTO_40.length === 40)
  check('CRYPTO_40 has no duplicates', new Set(S.CRYPTO_40).size === 40)
  check('universeHash matches the value the live bot publishes', S.universeHash() === '2d336399',
    `got ${S.universeHash()}`)
  // Rule 2: crypto only. These are the tokenized-equity / stablecoin tickers
  // that a dynamic universe kept dragging in before the v48 pin.
  const banned = ['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'SOXL', 'KORU', 'US', 'BASED', 'EVAA', 'VANRY', 'PAXG', 'XAUT']
  check('CRYPTO_40 contains no stablecoins or tokenized equities',
    banned.every(x => !(S.CRYPTO_40 as readonly string[]).includes(x)))
}

// ════════════════════════════════════════════════════════════════════════════
// 3. DONCHIAN SIGNAL — the channel must exclude the bar that breaks it
// ════════════════════════════════════════════════════════════════════════════
{
  const flat = (n: number, hi: number, lo: number): S.Bar[] =>
    Array.from({ length: n }, (_, i) => ({ t: i * 14_400_000, open: 100, high: hi, low: lo, close: 100, vol: 1 }))

  const base = flat(S.DONCH_WINDOW, 105, 95)

  check('no signal inside the channel',
    S.donchSignal([...base, { t: 0, open: 100, high: 104, low: 96, close: 100, vol: 1 }]) === null)

  const up = S.donchSignal([...base, { t: 0, open: 100, high: 110, low: 96, close: 106, vol: 1 }])
  check('close above the channel high is a LONG', up?.side === 'LONG')
  near('channel high excludes the signal bar', up?.hiN ?? 0, 105)

  const dn = S.donchSignal([...base, { t: 0, open: 100, high: 104, low: 90, close: 94, vol: 1 }])
  check('close below the channel low is a SHORT', dn?.side === 'SHORT')
  near('channel low excludes the signal bar', dn?.loN ?? 0, 95)

  // Strictly greater-than: a close exactly ON the boundary is not a breakout.
  check('a close exactly at the channel high is not a signal',
    S.donchSignal([...base, { t: 0, open: 100, high: 110, low: 96, close: 105, vol: 1 }]) === null)

  check('too little history yields no signal', S.donchSignal(flat(5, 105, 95)) === null)
}

// ════════════════════════════════════════════════════════════════════════════
// 4. THE ADX TIER TABLE — v44, re-confirmed monotonic by v58bt, and shown by
//    v72bt to be the ONLY feature carrying combinable sizing edge.
// ════════════════════════════════════════════════════════════════════════════
{
  near('adx 22.1 → 0.75', S.adxTierMult(22.1), 0.75)
  near('adx 28.0 → 0.75 (boundary is exclusive)', S.adxTierMult(28), 0.75)
  near('adx 28.1 → 1.0', S.adxTierMult(28.1), 1.0)
  near('adx 35.0 → 1.0', S.adxTierMult(35), 1.0)
  near('adx 35.1 → 1.5', S.adxTierMult(35.1), 1.5)
  near('adx 45.0 → 1.5', S.adxTierMult(45), 1.5)
  near('adx 45.1 → 2.0', S.adxTierMult(45.1), 2.0)
  // monotonic, and capped — an unbounded tier is how a sizing model turns into
  // a Martingale by accident.
  check('the tier ladder is monotonic and capped at 2.0',
    [23, 30, 40, 50, 99].map(S.adxTierMult).every((v, i, a) => v <= 2.0 && (i === 0 || v >= a[i - 1])))
}

// ════════════════════════════════════════════════════════════════════════════
// 5. STOP DISTANCE — 1.4×ATR with a 0.5% floor (v64bt: 20/1.4 is the optimum)
// ════════════════════════════════════════════════════════════════════════════
{
  near('1.4×ATR when ATR dominates', S.stopDistance(10, 1000), 14)
  near('the 0.5% floor binds on a quiet coin', S.stopDistance(1, 1000), 5)
  near('the floor is exactly 0.5% of price', S.stopDistance(0, 200), 1)
}

// ════════════════════════════════════════════════════════════════════════════
// 6. PYRAMIDING — v46/v49. A unit only stacks on a winning same-side stack.
// ════════════════════════════════════════════════════════════════════════════
{
  const u = (entry: number, side: S.Side = 'LONG'): S.OpenUnit => ({ side, entry, origSlDist: 10 })

  check('the first unit always passes', S.pyramidGateOk([], 'LONG', 100))
  check('a 2nd unit needs +0.6R', !S.pyramidGateOk([u(100)], 'LONG', 105.9))
  check('a 2nd unit opens at exactly +0.6R', S.pyramidGateOk([u(100)], 'LONG', 106))
  check('a 2nd unit needs +1.0R once two are open', !S.pyramidGateOk([u(100), u(100)], 'LONG', 109.9))
  check('a 3rd unit opens when ALL units are +1.0R', S.pyramidGateOk([u(100), u(100)], 'LONG', 110))
  check('a 3rd unit is blocked when one unit lags', !S.pyramidGateOk([u(100), u(108)], 'LONG', 110))
  check('the stack is capped at 3', !S.pyramidGateOk([u(100), u(100), u(100)], 'LONG', 200))
  check('a unit never stacks against an open opposite side', !S.pyramidGateOk([u(100, 'SHORT')], 'LONG', 106))
  // SHORT side, mirrored
  check('a SHORT 2nd unit opens at +0.6R in its own direction',
    S.pyramidGateOk([u(100, 'SHORT')], 'SHORT', 94))
  check('a SHORT 2nd unit is blocked when the first is losing',
    !S.pyramidGateOk([u(100, 'SHORT')], 'SHORT', 106))
}

// ════════════════════════════════════════════════════════════════════════════
// 7. SIZING — the min-chain, in order, with the caps that the old backtest scan
//    did not model at all. This is the most likely reason v79bt's window profile
//    diverged from the documented run: an unconstrained R-sum never runs out of
//    room, and the live engine runs out of room exactly in the trending windows
//    that carry the profit.
// ════════════════════════════════════════════════════════════════════════════
{
  function base(over: Partial<S.SizeInput> = {}): S.SizeInput {
    return {
      portfolio: 10_000, balance: 10_000, openExposure: 0, heatCommitted: 0,
      longExposure: 0, shortExposure: 0, symExposure: 0,
      adx: 30, slPct: 0.02, side: 'LONG', quoteVol24h: 0, ...over,
    }
  }

  // risk-based notional: 10,000 × 1.75% × 1.0 (adx 30) / 2% stop = $8,750,
  // then capped by the 20% per-position rule = $2,000.
  {
    const r = S.sizeBreakout(base())
    check('per-position cap binds', r.ok && Math.abs(r.notional - 2000) < 1e-6,
      r.ok ? `got ${r.notional}` : `rejected: ${r.reason}`)
  }

  // the risk formula itself, below the cap: a 10% stop on a 0.75 tier
  // → 10,000 × 0.0175 × 0.75 / 0.10 = $1,312.50
  {
    const r = S.sizeBreakout(base({ adx: 25, slPct: 0.10 }))
    check('risk sizing = portfolio × base risk × tier / stop%',
      r.ok && Math.abs(r.notional - 1312.5) < 1e-6, r.ok ? `got ${r.notional}` : r.reason)
  }

  // heat: 95% of the book is already committed, so only $500 of room is left —
  // the entry is TRIMMED to it, not skipped. Rule 5 and v65bt: never turn a
  // capital guard into a trade-count filter.
  {
    const r = S.sizeBreakout(base({ openExposure: 9000, heatCommitted: 0, balance: 1000 }))
    check('heat trims rather than skips while room remains',
      r.ok && r.trimmedBy === 'heat' && Math.abs(r.notional - 500) < 1e-6,
      r.ok ? `got ${r.notional} (${r.trimmedBy})` : `rejected: ${r.reason}`)
  }

  // below the minimum ticket the entry is skipped, and reported AS a heat skip
  // so the journal names the real cause.
  {
    const r = S.sizeBreakout(base({ openExposure: 9300, balance: 700 }))
    check('heat below the minimum ticket skips with the right reason',
      !r.ok && r.reason === 'heat_limit', r.ok ? 'accepted' : `reason ${r.reason}`)
  }

  // v56.9: the same-cycle commitment must count. This is the exact defect that
  // let six simultaneous breakouts open at full size into a 138%-allocated book.
  {
    const withRace = S.sizeBreakout(base({ openExposure: 5000, heatCommitted: 4000, balance: 5000 }))
    const blind = S.sizeBreakout(base({ openExposure: 5000, heatCommitted: 0, balance: 5000 }))
    check('heatCommitted narrows the room a sibling entry sees',
      withRace.ok && blind.ok && withRace.notional < blind.notional,
      `${withRace.ok ? withRace.notional : withRace.reason} vs ${blind.ok ? blind.notional : blind.reason}`)
  }

  // net-direction cap: already 60% net long, so another long is refused.
  {
    const r = S.sizeBreakout(base({ longExposure: 6000, shortExposure: 0 }))
    check('net exposure cap rejects a further same-side entry',
      !r.ok && r.reason === 'net_exposure_cap', r.ok ? 'accepted' : `reason ${r.reason}`)
    const s = S.sizeBreakout(base({ longExposure: 6000, shortExposure: 0, side: 'SHORT' }))
    check('the opposite side is still allowed — the cap is on NET, not on count', s.ok)
  }

  // per-coin cap: the combined ROTA + DONCH4H exposure on one name is capped at
  // 20% of the book (v46 — a rotation slot and a breakout on the same coin were
  // doubling concentration).
  {
    // ROTA already holds 15% → $500 of room left, exactly the minimum ticket.
    const trim = S.sizeBreakout(base({ symExposure: 1500 }))
    check('per-coin cap trims a breakout that overlaps a rotation slot',
      trim.ok && Math.abs(trim.notional - 500) < 1e-6,
      trim.ok ? `got ${trim.notional}` : `rejected: ${trim.reason}`)
    // ROTA holds 19% → $100 of room, under the minimum ticket → skip, named.
    const skip = S.sizeBreakout(base({ symExposure: 1900 }))
    check('per-coin cap skips when the room is under the minimum ticket',
      !skip.ok && skip.reason === 'per_coin_cap', skip.ok ? `accepted ${skip.notional}` : `reason ${skip.reason}`)
  }

  // liquidity guard: 0.5% of a $200k 24h book = $1,000.
  {
    const r = S.sizeBreakout(base({ quoteVol24h: 200_000 }))
    check('liquidity guard caps notional at 0.5% of 24h volume',
      r.ok && Math.abs(r.notional - 1000) < 1e-6 && r.trimmedBy === 'liquidity',
      r.ok ? `got ${r.notional} (${r.trimmedBy})` : r.reason)
  }

  // cash: the bot may not spend more than 95% of free balance, which is what
  // made both sleeves stand down while cash was negative after v56.9.
  {
    const r = S.sizeBreakout(base({ balance: 400 }))
    check('an entry is skipped when free cash cannot fund the minimum ticket',
      !r.ok && r.reason === 'too_small', r.ok ? `accepted ${r.notional}` : `reason ${r.reason}`)
  }

  // Standing rule: risk per trade never exceeds the configured base × top tier.
  // No Martingale, no loss-scaling — the only thing that moves size is ADX.
  {
    const r = S.sizeBreakout(base({ adx: 99, slPct: 0.02, portfolio: 1_000_000, balance: 1_000_000 }))
    check('risked fraction never exceeds base risk × the top tier',
      r.ok && (r.notional * 0.02) / 1_000_000 <= S.BASE_RISK_PCT * 2.0 + 1e-12,
      r.ok ? `risked ${(r.notional * 0.02) / 1_000_000}` : r.reason)
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 8. THE LADDER — ⅓ @0.6R maker, stop→BE, ⅓ @1.0R maker, final ⅓ trails a
//    2.5×ATR chandelier, taker. v59bt: every variant that trails more has higher
//    total R and flips a window negative. This is the shape that survives.
// ════════════════════════════════════════════════════════════════════════════
{
  const mk = (side: S.Side = 'LONG'): S.LadderPos => ({
    side, entry: 100, origSlDist: 10, stage: 0,
    stopPx: side === 'LONG' ? 90 : 110, sizeLeft: 3, sizeOrig: 3,
  })

  // levels
  {
    const l = S.ladderLevels(mk())
    near('first leg sits at 0.6R', l.p06, 106)
    near('second leg sits at 1.0R', l.p10, 110)
    near('the trail is 2.5/1.4 of the stop distance', l.trailDist, 10 * (2.5 / 1.4))
  }

  // leg 1
  {
    const a = S.ladderStep(mk(), 106, 106)
    check('leg 1 fires at 0.6R', a.kind === 'leg' && a.stage === 1)
    if (a.kind === 'leg') {
      near('leg 1 sheds exactly one third of the ORIGINAL size', a.qty, 1)
      near('leg 1 fills at the level, not at the mark', a.px, 106)
      near('leg 1 pays maker', a.fee, 106 * 1 * S.FEE_MAKER)
      near('leg 1 moves the stop to breakeven', a.stopPx, 100)
    }
  }

  // leg 2: half of what is left, which is another third of the original
  {
    const p = { ...mk(), stage: 1 as const, stopPx: 100, sizeLeft: 2 }
    const a = S.ladderStep(p, 110, 110)
    check('leg 2 fires at 1.0R', a.kind === 'leg' && a.stage === 2)
    if (a.kind === 'leg') near('leg 2 sheds half the remainder = ⅓ of the original', a.qty, 1)
  }

  // the pessimistic ordering: within one observation the stop wins.
  {
    const a = S.ladderStep(mk(), 90, 120)
    check('a bar that touches both the stop and the target resolves as the stop',
      a.kind === 'close' && a.reason === 'sl')
  }

  // a stop fill is a market fill: taker fee AND adverse slippage.
  {
    const a = S.ladderStep(mk(), 90, 90)
    if (a.kind === 'close') {
      near('a stop fills below the level for a long', a.px, 90 * (1 - S.SLIP))
      near('a stop pays taker', a.fee, a.px * 3 * S.FEE_TAKER)
    } else check('a stop closes the position', false)
  }

  // the chandelier ratchets and never loosens
  {
    const p = { ...mk(), stage: 2 as const, stopPx: 100, sizeLeft: 1 }
    const up = S.ladderStep(p, 130, 130)
    check('the trail does not fire while price runs', up.kind === 'none')
    const raised = up.kind === 'none' ? up.stopPx : 0
    near('the trail sits 2.5/1.4 R below the high', raised, 130 - 10 * (2.5 / 1.4))
    const back = S.ladderStep({ ...p, stopPx: raised }, 125, 125)
    check('a pullback does not loosen the trail',
      back.kind === 'none' && back.stopPx === raised, `got ${back.kind === 'none' ? back.stopPx : back.kind}`)
    const hit = S.ladderStep({ ...p, stopPx: raised }, raised - 0.01, raised - 0.01)
    check('the trail closes when price crosses it', hit.kind === 'close' && hit.reason === 'trail')
  }

  // SHORT mirror
  {
    const a = S.ladderStep(mk('SHORT'), 94, 94)
    check('a SHORT first leg fires at 0.6R in its own direction', a.kind === 'leg')
    if (a.kind === 'leg') near('the SHORT leg fills at its level', a.px, 94)
    const st = S.ladderStep(mk('SHORT'), 110, 110)
    check('a SHORT stop is above entry', st.kind === 'close' && st.reason === 'sl')
  }

  // the 16-day timeout
  {
    const a = S.ladderStep(mk(), 101, 101, S.MAX_HOLD_MS + 1)
    check('a stalled trade times out after 16 days', a.kind === 'close' && a.reason === 'timeout')
    const b = S.ladderStep(mk(), 101, 101, S.MAX_HOLD_MS - 1)
    check('it does not time out a minute early', b.kind === 'none')
  }

  // FULL PATH, end to end, in R of the WHOLE position (1R = origSlDist ×
  // sizeOrig = 30). The two banked legs are worth a fixed 0.533R between them
  // (⅓ × 0.6R + ⅓ × 1.0R) no matter how far the trade runs — that is the price
  // the ladder pays for its win rate. Everything above 0.533R is the trailing
  // third, and it is the whole reason v53 exists.
  {
    let pos = mk()
    let bankedR = 0
    const path = [106, 110, 130, 130 - 10 * (2.5 / 1.4) - 0.01]
    let realised = 0
    for (const px of path) {
      const a = S.ladderStep(pos, px, px)
      if (a.kind === 'leg') {
        realised += (a.px - pos.entry) * a.qty - a.fee
        pos = { ...pos, stage: a.stage, stopPx: a.stopPx, sizeLeft: pos.sizeLeft - a.qty }
      } else if (a.kind === 'close') {
        realised += (a.px - pos.entry) * a.qty - a.fee
        pos = { ...pos, sizeLeft: 0 }
      } else {
        pos = { ...pos, stopPx: a.stopPx }
      }
    }
    bankedR = realised / 30
    // The two legs alone are 0.2R + 0.3333R = 0.5333R. A run to +3R that trails
    // out at 1.21R on the final third must land well clear of that, and well
    // clear of the 0.6R a fixed first-leg-only exit would have produced.
    check('the trailing third adds materially over the two banked legs',
      bankedR > 0.85, `got ${bankedR.toFixed(3)}R`)
    check('but the ladder gives up most of a +3R excursion — that is its cost',
      bankedR < 1.2, `got ${bankedR.toFixed(3)}R`)
    check('the position is fully closed at the end of the path', pos.sizeLeft === 0)
  }

  // A trade that stops out before any leg loses exactly 1R plus costs — never
  // more. If this ever fails, the stop is not the stop.
  {
    const a = S.ladderStep(mk(), 90, 90)
    if (a.kind === 'close') {
      const r = ((a.px - 100) * a.qty - a.fee) / 30
      check('a clean stop-out loses ~1R and never more than 1.1R', r < -0.99 && r > -1.1, `got ${r.toFixed(4)}R`)
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 9. ROTA — top-8 / bottom-8 by 14-day momentum, inverse-vol weighted.
// ════════════════════════════════════════════════════════════════════════════
{
  const rows: S.RotaRow[] = Array.from({ length: 40 }, (_, i) => ({
    sym: `C${i}`, mom: (20 - i) / 100, price: 100, vol: 0.01 + (i % 5) * 0.002,
  }))
  const t = S.rotaTargets(rows)

  check('a full universe produces 2K slots', t.length === S.ROTA_K * 2)
  check('exactly K longs', t.filter(x => x.dir === 1).length === S.ROTA_K)
  check('exactly K shorts', t.filter(x => x.dir === -1).length === S.ROTA_K)
  check('the longs are the highest momentum names',
    t.filter(x => x.dir === 1).every(x => Number(x.sym.slice(1)) < S.ROTA_K))
  check('the shorts are the lowest momentum names',
    t.filter(x => x.dir === -1).every(x => Number(x.sym.slice(1)) >= 40 - S.ROTA_K))

  const sum = (d: 1 | -1) => t.filter(x => x.dir === d).reduce((a, x) => a + x.weight, 0)
  near('long weights sum to 1', sum(1), 1, 1e-12)
  near('short weights sum to 1', sum(-1), 1, 1e-12)

  // inverse vol: the calmer name of a pair carries the larger weight
  {
    const two = t.filter(x => x.dir === 1).slice(0, 2)
    const vols = two.map(x => rows.find(r => r.sym === x.sym)!.vol)
    if (vols[0] !== vols[1]) {
      const calmerIsHeavier = (vols[0] < vols[1]) === (two[0].weight > two[1].weight)
      check('inverse-vol weighting favours the calmer name', calmerIsHeavier)
    } else passed++
  }

  // the collapsed-universe guard: this is the v56.5 / v56.7 failure mode, where
  // a degraded feed left 11 or 21 names and ROTA could not rank a clean
  // top-8/bottom-8 but tried anyway.
  check('a collapsed universe ranks nothing at all', S.rotaTargets(rows.slice(0, 20)).length === 0)
  check('exactly 4K names is enough to rank', S.rotaTargets(rows.slice(0, S.ROTA_K * 4)).length === S.ROTA_K * 2)

  // slot sizing and the drift band
  {
    const n = S.rotaSlotTarget(10_000, 1 / 8)
    check('a slot sits inside its floor and ceiling', n >= 10_000 * S.ROTA_SLOT_MIN && n <= 10_000 * S.ROTA_SLOT_MAX)
    near('an even-weight slot is book/K of the portfolio', n, 10_000 * S.ROTA_BOOK / 8)
    near('a tiny weight is lifted to the floor', S.rotaSlotTarget(10_000, 0.0001), 10_000 * S.ROTA_SLOT_MIN)
    near('a huge weight is capped at the ceiling', S.rotaSlotTarget(10_000, 0.9), 10_000 * S.ROTA_SLOT_MAX)
    check('a slot inside ±35% is left alone', S.rotaSizeOk(1000, 1000))
    check('a slot that shrank too far is rebuilt', !S.rotaSizeOk(600, 1000))
    check('a slot that grew too far is rebuilt', !S.rotaSizeOk(1500, 1000))
  }

  // momentum + vol from bars
  {
    const bars = fixture(120)
    const st = S.rotaStats('X', bars)
    check('rotaStats reads a long enough series', st !== null)
    check('momentum is the 84-bar return', st !== null &&
      Math.abs(st.mom - (bars[119].close / bars[119 - S.ROTA_LB].close - 1)) < 1e-12)
    check('vol has a floor so a frozen series cannot divide by zero', (st?.vol ?? 0) >= 0.001)
    check('too short a series ranks nothing', S.rotaStats('X', bars.slice(-20)) === null)
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 10. COST MODEL — the assumptions every walk-forward was run under.
// ════════════════════════════════════════════════════════════════════════════
{
  near('taker fee is 0.05%/side', S.FEE_TAKER, 0.0005)
  near('maker fee is 0.02%/side', S.FEE_MAKER, 0.0002)
  near('slippage is 3 bps', S.SLIP, 0.0003)
  check('maker is cheaper than taker — the ladder legs depend on it', S.FEE_MAKER < S.FEE_TAKER)
  near('base risk is the deployed 1.75%', S.BASE_RISK_PCT, 0.0175)
  near('the heat cap is 95%', S.MAX_HEAT_PCT, 0.95)
  near('the Donchian window is 15', S.DONCH_WINDOW, 15)
  near('the ADX gate is 22', S.ADX_GATE, 22)
}

// ─── report ─────────────────────────────────────────────────────────────────
console.log(`\n  shared/strategy.ts — ${passed} assertions passed, ${failures.length} failed`)
if (failures.length) {
  console.log('')
  for (const f of failures) console.log(`   FAIL  ${f}`)
  console.log('')
  process.exit(1)
}
console.log('  OK\n')

import * as S from '../shared/strategy.ts'
import { allSixPositive } from '../backtest/portfolio.ts'

let passed = 0
function check(name: string, value: boolean) {
  if (!value) throw new Error(name)
  passed++
}
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9

// Exact cash-fill assertions, not portfolio-profit monotonicity: a different
// fill can free capital for a different subsequent trade.
for (const side of ['LONG', 'SHORT'] as const) {
  const dir = side === 'LONG' ? 1 : -1
  for (const bps of [0, 3, 6]) {
    const fraction = bps / 10_000
    const initial: S.LadderPos = {
      side, entry: 100, origSlDist: 10, stage: 0,
      stopPx: 100 - dir * 10, sizeLeft: 3, sizeOrig: 3,
    }
    const cases: [S.LadderPos, number, number, string, number][] = [
      [initial, 100 - dir * 12, 0, 'sl', initial.stopPx],
      [{ ...initial, stage: 1, stopPx: 100, sizeLeft: 2 }, 100 - dir, 0, 'sl', 100],
      [{ ...initial, stage: 2, stopPx: 100, sizeLeft: 1 }, 100 - dir, 0, 'trail', 100],
      [initial, 100 + dir, S.MAX_HOLD_MS + 1, 'timeout', 100 + dir],
      [{ ...initial, stage: 2, stopPx: 100, sizeLeft: 1 }, 100 + dir,
        S.MAX_HOLD_MS + 1, 'timeout', 100 + dir],
    ]
    for (const [pos, px, age, reason, raw] of cases) {
      const action = S.ladderStep(pos, px, px, age, true, fraction)
      check(`${side} ${bps}bps ${reason} exits`, action.kind === 'close')
      if (action.kind !== 'close') throw new Error('unreachable')
      check(`${side} ${bps}bps ${reason} reason`, action.reason === reason)
      check(`${side} ${bps}bps ${reason} price`, near(action.px, raw * (1 - dir * fraction)))
      check(`${side} ${bps}bps ${reason} fee`, near(action.fee, action.px * pos.sizeLeft * S.FEE_TAKER))
    }
    for (const stage of [0, 1] as const) {
      const pos = { ...initial, stage, sizeLeft: stage ? 2 : 3 }
      const px = 100 + dir * (stage ? 10 : 6)
      const action = S.ladderStep(pos, px, px, 0, true, fraction)
      check(`${side} ${bps}bps maker leg ${stage}`, action.kind === 'leg' && near(action.px, px))
    }
    check(`${side} default remains 3bps`, JSON.stringify(S.ladderStep(initial, initial.stopPx)) ===
      JSON.stringify(S.ladderStep(initial, initial.stopPx, initial.stopPx, 0, true, S.SLIP)))
  }
}
for (const bad of [-0.1, NaN, Infinity, 1]) {
  let threw = false
  try {
    S.ladderStep({ side: 'LONG', entry: 100, origSlDist: 10, stage: 0,
      stopPx: 90, sizeLeft: 3, sizeOrig: 3 }, 90, 90, 0, true, bad)
  } catch (e) { threw = e instanceof RangeError }
  check(`reject invalid slippage ${bad}`, threw)
}
check('six profitable windows pass', allSixPositive([1, 2, 3, 4, 5, 6]))
for (const returns of [[], [1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 6, 7],
  [1, 2, 3, 4, 5, 0], [1, 2, 3, 4, 5, -1], [1, 2, 3, 4, 5, NaN],
  [1, 2, 3, 4, 5, Infinity]]) {
  check('incomplete or unprofitable walk-forward fails', !allSixPositive(returns))
}
console.log(`  execution costs + validation — ${passed} assertions passed`)

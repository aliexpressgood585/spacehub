// Q1m MAX LOTTERY + autonomy policy knobs (owner 2026-10-05 paper only).
import { labInd, type LBar } from './lab.ts'
import { COST, roundTrip, type Book } from './costs.ts'
import { HARD_FLOOR, type PolicySpec } from './q15-autonomy.ts'

export const Q15 = {
  barMs: HARD_FLOOR.barMs,
  entryWindowMs: 55000,
  zMin: 0.15,
  volMult: 0.5,
  imbMin: -1,
  stopAtr: 1.5,
  stopFloor: 0.004,
  targetR: 2,
  holdMs: 3600000,
  lev: HARD_FLOOR.lev,
  perTrade: HARD_FLOOR.perTrade,
  maxOpen: HARD_FLOOR.maxOpen,
  share: HARD_FLOOR.share,
  maxPerDay: HARD_FLOOR.maxPerDay,
  minNetBps: -999,
  quoteMaxMs: 8000,
  spreadMaxBps: 20,
  impactOfStop: 0.5,
  minSamples: 10,
  minDays: 2,
} as const

export interface Q15Sig {
  dir: 1 | -1
  atr: number
  z: number
  volRatio: number
  imb: number
  strength: number
  policy?: string
}

export type SignalKnobs = Partial<Pick<PolicySpec, 'zMin' | 'volMult' | 'imbMin' | 'dirMode'>>

export function q15Signal(
  b: LBar[],
  btcUp: boolean | null,
  isBtc: boolean,
  knobs: SignalKnobs = {},
): { sig: Q15Sig | null; reason: string } {
  const zMin = knobs.zMin ?? Q15.zMin
  const volMult = knobs.volMult ?? Q15.volMult
  const imbMin = knobs.imbMin ?? Q15.imbMin
  const dirMode = knobs.dirMode ?? 'any'

  const no = (reason: string) => ({ sig: null, reason })
  if (b.length < 60) return no('insufficient_bars')
  if (
    b.some(
      (x, i) =>
        ![x.t, x.open, x.high, x.low, x.close, x.vol].every(Number.isFinite) ||
        Math.min(x.open, x.close, x.low) <= 0 ||
        x.high < Math.max(x.open, x.close) ||
        x.low > Math.min(x.open, x.close) ||
        x.vol < 0 ||
        x.t % Q15.barMs !== 0 ||
        (i > 0 && x.t - b[i - 1].t !== Q15.barMs),
    )
  )
    return no('invalid_bars')
  if (b.slice(-3).some((x) => !Number.isFinite(x.tb) || x.tb! < 0 || x.tb! > x.vol))
    return no('missing_taker')

  const I = labInd(b)
  const i = b.length - 1
  const A = I.atr[i]
  const avg = I.av20[i]
  const last = b[i]
  if (!(A > 0 && avg > 0)) return no('invalid_indicators')

  const z = (last.close - b[i - 3].close) / (A * Math.sqrt(3))
  let dir: 1 | -1 = z > 0 ? 1 : -1
  if (Math.abs(z) <= zMin) return no('burst')

  const volRatio = last.vol / avg
  if (volRatio < volMult) return no('volume')

  const v = b.slice(-3).reduce((s, x) => s + x.vol, 0)
  const imb = v > 0 ? b.slice(-3).reduce((s, x) => s + 2 * x.tb! - x.vol, 0) / v : 0
  if (!Number.isFinite(imb) || dir * imb <= imbMin) return no('taker_imbalance')

  if (dirMode === 'long_bias' && dir < 0 && Math.abs(z) < zMin * 3) return no('dir_bias')
  if (dirMode === 'short_bias' && dir > 0 && Math.abs(z) < zMin * 3) return no('dir_bias')
  if (dirMode === 'with_imb' && imb !== 0) dir = imb > 0 ? 1 : -1

  return {
    sig: {
      dir,
      atr: A,
      z,
      volRatio,
      imb,
      strength: Math.abs(z) * Math.max(volRatio, 0.1),
    },
    reason: 'signal',
  }
}

export function q15Levels(dir: 1 | -1, entry: number, atr: number) {
  const r = Math.max(Q15.stopAtr * atr, Q15.stopFloor * entry)
  return { r, stop: entry - dir * r, target: entry + dir * Q15.targetR * r }
}

/** Always HARD_FLOOR — autonomy cannot weaken aggression. */
export function q15Config() {
  return {
    lev: HARD_FLOOR.lev,
    perTrade: HARD_FLOOR.perTrade,
    maxOpen: HARD_FLOOR.maxOpen,
    share: HARD_FLOOR.share,
  }
}

export function q15Edge(
  rows: { t0: number; closed_at: string; gross_bps: number; side: number }[],
  dir: 1 | -1,
  now: number,
) {
  const valid = rows.filter(
    (x) => x.side === dir && Number.isFinite(x.gross_bps) && x.t0 < now && Date.parse(x.closed_at) < now,
  )
  const by = new Map<string, number[]>()
  for (const x of valid) {
    const d = new Date(x.t0).toISOString().slice(0, 10)
    by.set(d, [...(by.get(d) ?? []), x.gross_bps])
  }
  const means = [...by.values()].map((a) => a.reduce((s, v) => s + v, 0) / a.length)
  const n = valid.length
  const days = means.length
  if (n < Q15.minSamples || days < Q15.minDays) return { bps: 0, n, days }
  const mean = means.reduce((s, v) => s + v, 0) / days
  const se = Math.sqrt(means.reduce((s, v) => s + (v - mean) ** 2, 0) / (days - 1) / days)
  return { bps: mean - 2 * se, n, days }
}

export function q15Gate(x: {
  book: Book
  now: number
  notional: number
  dir: 1 | -1
  rFrac: number
  entryImpact: number
  exitImpact: number
  beyond: boolean
  funding: number | null
  fundingHours: number
  grossBps: number
}) {
  const b = x.book
  const no = (reason: string) => ({ pass: false, reason, costBps: NaN, netBps: NaN })
  if (
    ![b.bid, b.ask, b.ts, x.now, x.notional, x.rFrac, x.entryImpact, x.exitImpact].every(Number.isFinite) ||
    b.bid <= 0 ||
    b.ask < b.bid ||
    x.notional <= 0 ||
    x.rFrac <= 0 ||
    x.entryImpact < 0 ||
    x.exitImpact < 0
  )
    return no('invalid_book')
  if (b.ts > x.now + 1000 || x.now - b.ts > Q15.quoteMaxMs) return no('stale_quote')
  if (((b.ask - b.bid) / ((b.ask + b.bid) / 2)) * 1e4 > Q15.spreadMaxBps) return no('wide_spread')
  if (x.beyond || Math.max(x.entryImpact, x.exitImpact) > Q15.impactOfStop * x.rFrac) return no('thin_book')
  if (x.funding === null || !Number.isFinite(x.funding) || !(x.fundingHours > 0)) return no('missing_funding')
  const gross = Number.isFinite(x.grossBps) ? x.grossBps : 0
  const cost = roundTrip(b, x.notional, x.dir, 120, (x.funding * COST.fundingHours) / x.fundingHours)
  const spread = (b.ask - b.bid) / ((b.ask + b.bid) / 2)
  const walked =
    (2 * COST.takerFee + spread + Math.max(COST.minSlip, x.entryImpact) + Math.max(COST.minSlip, x.exitImpact)) *
      1e4 +
    Math.max(0, cost.funding_bps)
  const costBps = Math.max(cost.total_bps, walked)
  const netBps = gross - costBps
  return {
    pass: netBps >= Q15.minNetBps,
    reason: netBps >= Q15.minNetBps ? 'passed' : 'costs_exceed_edge',
    costBps,
    netBps,
  }
}

// CHAN-X shadow variant S1: "more exposure + precision" (owner 2026-09-30, AI Council rule 7).
// SHADOW ONLY: nothing here opens, sizes or closes a trade. The runner journals a verdict for
// every candidate that reached the live exposure cap or was taken live, so S1 can be judged on
// data nobody has seen. Rules pre-registered in quant/PREREGISTRATION_S1.md; do not tune them
// on the forward data (a change needs a new variant id and a new T0).
//
// S1 = the P004 candidate filters (regime-consistent comp, micro >= 60 with taker flow on our side,
// 15/60m trend on our side, funding not against us, OI rising) + up to 12 open instead of 8.
// A gate whose input is missing ABSTAINS (passes) and is listed in `missing`.

export const S1 = {
  id: 'S1',
  maxOpen: 12,
  microMin: 60,
  fundingMax: 0.0001,   // per 8h against the trade side
  mrComps: ['RG_MR', 'RG_LIQ_SQUEEZE'],
} as const

export interface S1Input {
  comp: string
  side: 1 | -1
  regime: string                 // NEUTRAL | MEAN_REVERT | TREND | HIGH_VOL
  micro?: number | null          // micro_execution.score
  taker3m?: number | null        // buy/sell taker ratio over 3m (1 = neutral)
  mtf?: number | null            // -1 | 0 | 1
  funding?: number | null        // per 8h, positive = longs pay
  oiDelta?: number | null        // fractional OI change
}

export interface S1Verdict { take: boolean; fails: string[]; missing: string[] }

const num = (x: unknown) => (x === null || x === undefined || !Number.isFinite(Number(x))) ? null : Number(x)

export function s1Verdict(x: S1Input): S1Verdict {
  const fails: string[] = [], missing: string[] = []
  const mr = (S1.mrComps as readonly string[]).includes(x.comp)
  if (x.regime === 'HIGH_VOL' || x.regime === 'MEAN_REVERT') { if (!mr) fails.push('regime') }
  else if (mr) fails.push('regime')

  const micro = num(x.micro), tk = num(x.taker3m)
  if (micro === null || tk === null) missing.push('micro')
  else if (!(micro >= S1.microMin && (tk - 1) * x.side > 0)) fails.push('micro')

  const mtf = num(x.mtf)
  if (mtf === null) missing.push('mtf')
  else if (mtf !== x.side) fails.push('mtf')

  const f = num(x.funding)
  if (f === null) missing.push('funding')
  else if (x.side > 0 ? f > S1.fundingMax : f < -S1.fundingMax) fails.push('funding')

  const oi = num(x.oiDelta)
  if (oi === null) missing.push('oi')
  else if (!(oi > 0)) fails.push('oi')

  return { take: fails.length === 0, fails, missing }
}

// A virtual S1 position exists only when the live book is full but S1's larger book is not.
export function s1HasRoom(liveOpen: number, virtualOpen: number): boolean {
  return liveOpen + virtualOpen < S1.maxOpen
}

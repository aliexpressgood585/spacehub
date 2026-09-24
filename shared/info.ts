// v82.0 — "new information" agents. Every voter before this read the same 1-minute
// candles of one coin. These read data none of them sees:
//   xmom7/14/28/ens  cross-sectional momentum over DAYS (rank all 40 coins; the only
//                    edge the 36-month research ever measured was 4h+ momentum, ROTA)
//   oi4h             open-interest change over 4h, read together with the price move
//                    (new money behind a move = continuation, following the move)
//   basis            perpetual premium (mark vs index) ranked across coins, faded:
//                    the most over-priced contracts are the most crowded longs
// Pure functions, no network. Missing data = abstain (0), never a guess.
// HONEST FRAMING: none of these is validated on this bot's holds; they enter the same
// shadow learning as every other voter and earn a say only through it.
export interface InfoData {
  daily: Record<string, number[]>                    // daily closes, oldest first
  oi: Record<string, { oi: number[]; px: number[] }> // hourly open interest + price, oldest first
  premium: Record<string, number>                    // mark / index - 1
  ratios?: Record<string, { tls: number; tlr: number }> // v85.5: top-trader long/short - 1, taker buy/sell - 1 (hourly)
}
export const INFO_AGENTS: { id: string; label: string }[] = [
  { id: 'xmom7', label: 'מומנטום 7 ימים (דירוג 40 מטבעות)' },
  { id: 'xmom14', label: 'מומנטום 14 ימים (דירוג 40 מטבעות)' },
  { id: 'xmom28', label: 'מומנטום 28 ימים (דירוג 40 מטבעות)' },
  { id: 'xmom_ens', label: 'מומנטום משולב 7/14/28 ימים' },
  { id: 'oi4h', label: 'Open Interest 4 שעות + כיוון מחיר' },
  { id: 'basis', label: 'פרמיית חוזה מול מדד (היפוך)' },
]
export const INFO_IDS = INFO_AGENTS.map((a) => a.id)
export const INFO = { k: 8, oiMin: 0.02, pxMin: 0.005 } as const

// top k -> +1, bottom k -> -1, the rest 0; needs at least 4k names so the ends are real ends
export function xsRank(v: Record<string, number>, k: number = INFO.k): Record<string, number> {
  const e = Object.entries(v).filter(([, x]) => Number.isFinite(x)).sort((a, b) => b[1] - a[1])
  const out: Record<string, number> = {}
  if (e.length < 4 * k) return out
  e.forEach(([s], i) => { out[s] = i < k ? 1 : i >= e.length - k ? -1 : 0 })
  return out
}
// centred rank in [-1, 1] (1 = strongest); used by the factory as a continuous feature
export function xsScore(v: Record<string, number>): Record<string, number> {
  const e = Object.entries(v).filter(([, x]) => Number.isFinite(x)).sort((a, b) => a[1] - b[1])
  const out: Record<string, number> = {}
  if (e.length < 8) return out
  e.forEach(([s], i) => { out[s] = (2 * i) / (e.length - 1) - 1 })
  return out
}
export const retOver = (c: number[] | undefined, d: number) => (c && c.length > d && c[c.length - 1 - d] > 0 ? c[c.length - 1] / c[c.length - 1 - d] - 1 : NaN)
export function oiMove(x: { oi: number[]; px: number[] } | undefined, h = 4): { doi: number; dpx: number } {
  if (!x || x.oi.length <= h || x.px.length <= h) return { doi: NaN, dpx: NaN }
  const n = x.oi.length, m = x.px.length
  return { doi: x.oi[n - 1] / x.oi[n - 1 - h] - 1, dpx: x.px[m - 1] / x.px[m - 1 - h] - 1 }
}
export function infoVotes(syms: string[], d: InfoData): Record<string, Record<string, number>> {
  const mom = (days: number) => Object.fromEntries(syms.map((s) => [s, retOver(d.daily[s], days)]))
  const m7 = mom(7), m14 = mom(14), m28 = mom(28)
  const ens = Object.fromEntries(syms.map((s) => [s, (m7[s] + m14[s] + m28[s]) / 3]))
  const r7 = xsRank(m7), r14 = xsRank(m14), r28 = xsRank(m28), re = xsRank(ens)
  const prem = Object.fromEntries(syms.map((s) => [s, d.premium[s] ?? NaN]))
  const rb = xsRank(prem)
  const out: Record<string, Record<string, number>> = {}
  for (const s of syms) {
    const { doi, dpx } = oiMove(d.oi[s])
    const oi = Number.isFinite(doi) && Number.isFinite(dpx) && doi >= INFO.oiMin && Math.abs(dpx) >= INFO.pxMin ? Math.sign(dpx) : 0
    out[s] = { xmom7: r7[s] ?? 0, xmom14: r14[s] ?? 0, xmom28: r28[s] ?? 0, xmom_ens: re[s] ?? 0, oi4h: oi, basis: -(rb[s] ?? 0) }
  }
  return out
}

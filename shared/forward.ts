// Forward-test lab (owner 2026-09-30: "an agent that tests trades forward"). NEVER TRADES.
// The data-collector opens VIRTUAL positions from pre-registered rules on live Binance data, closes them on
// schedule and books P&L at the live mark price with a fixed cost. Rules are frozen per hypothesis id in
// quant/PREREGISTRATION_H6.md; a changed rule is a new id with a new T0. Pure functions only (tested).

export interface Hyp {
  id: string
  minAbsRate: number      // |predicted funding| at entry, per interval
  enterBeforeMs: number   // enter this long before the settlement
  windowMs: number        // entry window width (the collector runs every minute)
  exitAfterMs: number     // exit this long after the settlement (0 = first run at/after T)
  costRt: number          // round-trip cost, fraction (taker 5 + slip 3 bps per side)
}

// H6 = funding-settlement capture, from v113c (predicted-rate version: weak, consistent, not significant).
export const HYPS: Hyp[] = [
  { id: 'H6a', minAbsRate: 0.001, enterBeforeMs: 60 * 60e3, windowMs: 5 * 60e3, exitAfterMs: 15 * 60e3, costRt: 0.0016 },
  { id: 'H6b', minAbsRate: 0.001, enterBeforeMs: 60 * 60e3, windowMs: 5 * 60e3, exitAfterMs: 0, costRt: 0.0016 },
]

export interface Prem { symbol: string; markPrice: number; lastFundingRate: number; nextFundingTime: number }
export interface OpenRow { hyp: string; symbol: string; settle_at: string; side: number; entry_px: number; exit_due: string }

// Entries this run: inside [T - enterBefore, T - enterBefore + window), |predicted| >= min, receiving side.
export function entries(prem: Prem[], universe: Set<string>, now: number, taken: Set<string>): OpenRow[] {
  const out: OpenRow[] = []
  for (const h of HYPS) for (const p of prem) {
    if (!universe.has(p.symbol)) continue
    const T = Number(p.nextFundingTime), rate = Number(p.lastFundingRate), px = Number(p.markPrice)
    if (!(T > 0 && px > 0 && Number.isFinite(rate))) continue
    const open = T - h.enterBeforeMs
    if (!(now >= open && now < open + h.windowMs)) continue
    if (Math.abs(rate) < h.minAbsRate) continue
    const key = `${h.id}:${p.symbol}:${T}`
    if (taken.has(key)) continue
    taken.add(key)
    out.push({ hyp: h.id, symbol: p.symbol, settle_at: new Date(T).toISOString(), side: rate > 0 ? -1 : 1, entry_px: px,
      exit_due: new Date(T + h.exitAfterMs).toISOString() })
  }
  return out
}

// Net result of a closed virtual trade, as a fraction of notional. `realised` = the settled rate (positive =
// longs pay). The receiving side earns |realised| if the sign held; if it flipped, it pays.
export function netOf(side: number, entry: number, exit: number, realised: number, costRt: number): number {
  return side * (exit / entry - 1) - side * realised - costRt
}

import { COST, bookFrom } from './costs.ts'
import { walkBook } from './fast.ts'
import { q15Gate } from './q15.ts'

// Preregistered feasibility limit, not an expected-return/profitability claim.
export const D5_EXEC = { version: 2, maxCostBps: 50, protectBufferBps: 2 } as const
type Depth = { bids: [number, number][]; asks: [number, number][]; E: number; source?: string }
export function d5Execution(b: Depth, desired: number, lev: number, now: number, funding: number | null, fundingHours: number) {
  let lastReason = 'cost_budget'
  for (let n = desired, attempt = 0; attempt < 12 && n / lev >= 5; attempt++, n /= 2) {
    const buy = walkBook(b.asks, n), sell = walkBook(b.bids, n)
    const gate = q15Gate({book:bookFrom(b.bids,b.asks,b.E,b.source??'unknown'),now,notional:n,dir:1,rFrac:.01,
      entryImpact:buy.impact,exitImpact:sell.impact,beyond:buy.beyond||sell.beyond,funding,fundingHours,grossBps:0})
    lastReason = gate.reason
    if (!gate.pass && gate.reason !== 'thin_book') return { ok:false as const, reason:gate.reason }
    if (!gate.pass || !Number.isFinite(gate.costBps) || gate.costBps > D5_EXEC.maxCostBps) { lastReason='cost_budget'; continue }
    const price = Math.max(buy.vwap, b.asks[0][0] * (1 + COST.minSlip))
    const slip = Math.max(COST.minSlip, sell.impact)
    // Entry fee and price already include entry execution. Estimate EXIT costs only.
    const fundingReserve = Math.max(0, funding!) * (2 / fundingHours)
    const stop = price * (1 + COST.takerFee + fundingReserve + D5_EXEC.protectBufferBps/1e4) / ((1-COST.takerFee)*(1-slip))
    const trigger = Math.max(price*1.004, stop+price*.001)
    return {ok:true as const,notional:n,price,gate,protection:{version:2,stop,trigger,enabled:trigger<price*1.01,
      exit_slip:slip,funding_reserve:fundingReserve,buffer_bps:D5_EXEC.protectBufferBps,model:'entry_cost_estimate'}}
  }
  return {ok:false as const,reason:lastReason}
}

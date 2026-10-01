// v99.2 — FUND sleeve: funding-settlement capture traded in the paper book (owner 2026-10-01: "something more
// aggressive for intraday", aggressive allocation). The rule is H6a EXACTLY as pre-registered for the forward lab
// (quant/PREREGISTRATION_H6.md, shared/forward.ts): |predicted funding| >= 0.10% per interval, take the RECEIVING side
// 60 min before the settlement, exit 15 min after it, no stop. The virtual H6a record in fwd_trades is untouched and
// stays the evaluation; these paper trades are the owner's live experiment on top of it. NOT VALIDATED.
import { HYPS, entries, type Prem, type OpenRow } from './forward.ts'

export const H6A = HYPS.find(h => h.id === 'H6a')!
export const FUND = {
  perTrade: 0.25,             // up to 25% of equity per trade (aggressive, owner's choice)
  maxOpen: 8,                 // concurrent FUND positions; cash is the real cap (paper 1x)
  scanMinute: 5,              // the entry window is the first minutes of the hour (T - 60m, T on the hour)
  waitFundingMs: 30 * 60_000, // after exit_due, wait up to 30 min for the settled rate to publish
} as const

// H6a entries only, strongest predicted rate first
export function fundEntries(prem: Prem[], universe: Set<string>, now: number, taken: Set<string>): OpenRow[] {
  const byS = new Map(prem.map(p => [p.symbol, Math.abs(Number(p.lastFundingRate))]))
  return entries(prem, universe, now, taken).filter(r => r.hyp === H6A.id)
    .sort((a, b) => (byS.get(b.symbol) ?? 0) - (byS.get(a.symbol) ?? 0))
}

// funding PAID by the position at one settlement (negative = received). Positive rate: longs pay shorts.
export const fundingPaid = (side: 1 | -1, rate: number, notional: number) => side * rate * notional

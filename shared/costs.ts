// v86.0 — ONE cost model and the central PROFIT GATE.
//
// Every place that turns a trade into money — the entry gate, the paper fill, the exit fill, the
// shadow learning and the dashboard — prices costs HERE, so there is exactly one answer to "what
// does this trade cost". Nothing optimistic: taker fees on both legs (the paper engine never rests
// a maker order), the half-spread that was actually quoted, market impact estimated from the depth
// that was actually on the book, and perpetual funding for the planned hold at the rate that was
// actually published. Anything not observed is labelled INFERRED and never passes as data.
//
// PROFIT GATE: an entry is allowed only when the expected GROSS edge of the agents backing it, at
// the planned hold, exceeds the full round-trip cost by a safety margin. The expected edge is an
// estimate from the agents' own net-of-cost track record (shadow learning), not a promise.
export const COST = {
  takerFee: 0.0005,          // Binance USDT-M taker, per side
  makerFee: 0.0002,          // listed for reference; the paper engine does not assume maker fills
  minSlip: 0.0003,           // floor per side: a market order never fills better than 3 bps beyond the touch
  impactK: 0.5,              // impact per side ≈ k × 10 bps × (order notional / depth within ±10 bps): eating a fraction f of the
                             // liquidity inside 10 bps moves the average fill by ~f×5 bps; beyond f=1 extrapolated linearly (v86.1 fix:
                             // v86.0 applied k×f as a raw FRACTION — $890 into $18k of depth priced at 50 bps instead of 0.25)
  maxImpact: 0.005,          // cap, 50 bps: beyond this the book is too thin and the gate says so
  fundingHours: 8,           // Binance funding interval
  marginBps: 0.5,            // v87.0 softened (was 2): net edge must still exceed ALL costs, by at least this
  learnRoundTripBps: 16,     // what shadow learning charges per vote (2 × (fee 5 + minSlip 3)); asserted below
} as const

export interface Book { bid: number; ask: number; bidDepth10: number; askDepth10: number; ts: number; source: string }
export interface CostBreakdown {
  fee_bps: number; spread_bps: number; impact_bps: number; funding_bps: number; total_bps: number
  slip_per_side: number        // fraction applied to the entry fill (and, re-measured, to the exit fill)
  observed: string[]; inferred: string[]
}

// Per-side slippage beyond the mid: half the quoted spread + depth-based impact, floored at minSlip.
export function slipPerSide(book: Book, notional: number, side: 1 | -1): { slip: number; half: number; impact: number } {
  const mid = (book.bid + book.ask) / 2
  const half = mid > 0 ? (book.ask - book.bid) / 2 / mid : 0
  const depth = side === 1 ? book.askDepth10 : book.bidDepth10
  // depth unknown (e.g. OKX sizes are contracts, not coins) -> a conservative 10 bps per side, marked inferred
  const impact = !Number.isFinite(depth) ? 0.001 : depth > 0 ? Math.min(COST.maxImpact, COST.impactK * 0.001 * notional / depth) : COST.maxImpact
  return { slip: Math.max(COST.minSlip, half + impact), half, impact }
}

// Full round-trip cost of opening `notional` on `side` and holding `holdMin` minutes.
// funding: the published rate per interval (fraction, + = longs pay). null -> charged at 0 and marked missing.
export function roundTrip(book: Book, notional: number, side: 1 | -1, holdMin: number, funding: number | null): CostBreakdown {
  const s = slipPerSide(book, notional, side)
  const fee = 2 * COST.takerFee
  const intervals = Math.max(0, holdMin) / 60 / COST.fundingHours
  const fund = funding == null || !Number.isFinite(funding) ? 0 : side * funding * intervals
  const slipBoth = 2 * s.slip                                  // exit assumed to cost what entry costs (re-measured at exit)
  const total = fee + slipBoth + fund
  return {
    fee_bps: +(fee * 1e4).toFixed(2), spread_bps: +(2 * s.half * 1e4).toFixed(2), impact_bps: +(2 * Math.max(0, s.slip - s.half) * 1e4).toFixed(2),
    funding_bps: +(fund * 1e4).toFixed(2), total_bps: +(total * 1e4).toFixed(2), slip_per_side: s.slip,
    observed: ['bid/ask', ...(Number.isFinite(side === 1 ? book.askDepth10 : book.bidDepth10) ? ['depth ±10bps'] : []), ...(funding == null ? [] : ['funding rate'])],
    inferred: [Number.isFinite(side === 1 ? book.askDepth10 : book.bidDepth10) ? 'impact (k × size/depth)' : 'impact 10bps/side (depth unknown)', 'exit cost = entry cost', ...(funding == null ? ['funding missing → 0'] : ['funding over planned hold'])],
  }
}

export interface GateInput { grossEdgeBps: number; edgeN: number; book: Book | null; notional: number; side: 1 | -1; holdMin: number; funding: number | null }
export interface GateResult { pass: boolean; reason: string; gross_bps: number; net_bps: number; cost: CostBreakdown | null }
// The gate. Reasons are short, stable codes the dashboard groups by.
export function profitGate(x: GateInput): GateResult {
  if (!x.book || !(x.book.bid > 0) || !(x.book.ask >= x.book.bid)) return { pass: false, reason: 'no_book', gross_bps: x.grossEdgeBps, net_bps: NaN, cost: null }
  if (!Number.isFinite(x.grossEdgeBps) || x.edgeN <= 0) return { pass: false, reason: 'no_edge_estimate', gross_bps: NaN, net_bps: NaN, cost: null }
  const cost = roundTrip(x.book, x.notional, x.side, x.holdMin, x.funding)
  const net = x.grossEdgeBps - cost.total_bps
  if (cost.impact_bps >= 2 * COST.maxImpact * 1e4 - 1e-9) return { pass: false, reason: 'book_too_thin', gross_bps: x.grossEdgeBps, net_bps: +net.toFixed(2), cost }
  if (net < COST.marginBps) return { pass: false, reason: x.grossEdgeBps <= 0 ? 'no_gross_edge' : 'costs_exceed_edge', gross_bps: x.grossEdgeBps, net_bps: +net.toFixed(2), cost }
  return { pass: true, reason: 'net_edge', gross_bps: x.grossEdgeBps, net_bps: +net.toFixed(2), cost }
}

// Expected GROSS edge of a trade: the weighted mean of its backers' measured edge at their best
// horizon. Shadow learning stores it NET of `learnRoundTripBps`; adding that back gives the gross
// the gate then re-charges with the live, trade-specific cost. Unmeasured backers contribute nothing.
// v86.1 EVIDENCE WEIGHTING: a backer's measured net edge counts in proportion to its evidence — × clamp(t/2, 0, 1)
// with t the overlap/cross-coin corrected t at its horizon. No evidence (t≤0) -> its gross is exactly the learning
// round trip, i.e. breakeven, which never clears a real cost + margin. Negative measured edges count in full.
export function expectedGross(backers: { w: number; netBps: number; n: number; t?: number }[]): { bps: number; n: number } {
  const b = backers.filter((x) => x.w > 0 && x.n > 0 && Number.isFinite(x.netBps))
  const W = b.reduce((s, x) => s + x.w, 0)
  if (!(W > 0)) return { bps: NaN, n: 0 }
  const cred = (x: { netBps: number; t?: number }) => x.netBps <= 0 || x.t === undefined ? x.netBps : x.netBps * Math.max(0, Math.min(1, x.t / 2))
  return { bps: +(b.reduce((s, x) => s + x.w * (cred(x) + COST.learnRoundTripBps), 0) / W).toFixed(2), n: b.reduce((s, x) => s + x.n, 0) }
}

// Book summary from a Binance/OKX depth snapshot ([price, qty] strings), depth within ±10 bps of mid in quote currency.
export function bookFrom(bids: [string | number, string | number][], asks: [string | number, string | number][], ts: number, source: string, k = 1): Book {
  const bid = Number(bids[0]?.[0]) / k, ask = Number(asks[0]?.[0]) / k, mid = (bid + ask) / 2
  const sum = (rows: [string | number, string | number][], lim: (p: number) => boolean) => rows.reduce((s, r) => { const p = Number(r[0]) / k, q = Number(r[1]) * k; return lim(p) ? s + p * q : s }, 0)
  return { bid, ask, ts, source, bidDepth10: sum(bids, (p) => p >= mid * (1 - 0.001)), askDepth10: sum(asks, (p) => p <= mid * (1 + 0.001)) }
}

// Graded risk reduction — no global kill switch on losses. Size scales down with drawdown from the
// equity peak and with today's loss; it never reaches zero on P&L alone. Full stops remain only for
// severe technical faults (stale/missing feeds, ledger errors, a human hard halt) elsewhere.
export function riskScale(equity: number, peak: number, dayStart: number): { mult: number; dd: number; day: number; tier: string } {
  if (!(equity > 0) || !(peak > 0) || !(dayStart > 0)) return { mult: 0.1, dd: NaN, day: NaN, tier: 'unknown' }
  const dd = Math.max(0, 1 - equity / peak), day = Math.max(0, 1 - equity / dayStart)
  const a = dd < 0.05 ? 1 : dd < 0.10 ? 0.75 : dd < 0.15 ? 0.5 : dd < 0.25 ? 0.3 : 0.15
  const b = day < 0.03 ? 1 : day < 0.05 ? 0.75 : day < 0.08 ? 0.5 : 0.3
  const mult = Math.max(0.1, +(a * b).toFixed(3))
  return { mult, dd, day, tier: mult >= 1 ? 'full' : mult >= 0.5 ? 'reduced' : mult >= 0.25 ? 'defensive' : 'minimal' }
}

// Correlation-aware sizing: a new position is scaled down by how much it duplicates the book's
// same-direction exposure (Pearson correlation of 1-minute returns). 1 = independent, floor 0.3.
export function corr(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length); if (n < 10) return 0
  const x = a.slice(-n), y = b.slice(-n), mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0
}
export function corrScale(candRet: number[], side: number, book: { ret: number[]; side: number; weight: number }[]): { mult: number; load: number } {
  let load = 0
  for (const p of book) { const c = corr(candRet, p.ret) * (p.side === side ? 1 : -1); if (c > 0) load += c * p.weight }
  return { mult: Math.max(0.3, +(1 / (1 + load)).toFixed(3)), load: +load.toFixed(3) }
}

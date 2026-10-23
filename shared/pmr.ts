// "פולי תגמולים" — Polymarket LIQUIDITY-REWARDS paper desk: rules and pure maths (no I/O). PAPER ONLY.
// Polymarket pays makers a daily pool per market (clob.polymarket.com/rewards/markets/current, ~$156k/day over ~14k markets on
// 2026-10-23) for resting orders near the midpoint. Score of one order (docs.polymarket.com/market-makers/liquidity-rewards):
//   S(v, s) = ((v - s) / v)^2, v = max spread (cents), s = distance from the midpoint (cents); orders below min size do not count.
//   Q_one = bids on YES (+ asks on NO), Q_two = asks on YES (+ bids on NO); here the YES book holds both (the NO book mirrors it).
//   Q_min = max(min(Q1,Q2), max(Q1,Q2)/3) when the midpoint is in [0.10, 0.90], else min(Q1,Q2) (two-sided only).
//   Sampled once a minute; our share of a sample = our Q_min / everyone's Q_min; the day's pool is paid in proportion.
// The hypothesis this desk measures: rewards earned > the cost of being filled by informed traders (adverse selection) on the
// inventory the quotes pick up. The maker shadow on the crypto desk (no rewards) lost 5.8-9.8% per $ to adverse selection, so
// this is NOT proven; the desk is the measurement.

export const PMR = {
  startCash: 1000,
  maxMarkets: 5,             // capital is split equally between the selected markets
  minDaysToEnd: 3,           // no quoting into a resolution (the price jumps to 0/1 at the end)
  exitHours: 36,             // stop quoting and unwind this close to the scheduled end
  midLo: 0.15, midHi: 0.85,  // two-sided scoring + less jump risk near 0/1
  invCap: 2,                 // stop adding to a side once net inventory > invCap x quote size
  minYieldPerDay: 0.003,     // expected reward >= 0.3% of the market's capital per day to be selected
  rescanMin: 20,             // market selection refresh
  cycleCapS: 120,            // reward accrual per cycle is capped (a stalled loop earns nothing)
  c: 3,
}

export type Lvl = { price: number; size: number }
export type Book = { bids: Lvl[]; asks: Lvl[]; tick: number }
export type Quote = { px: number; size: number; queue: number; at: number } | null

export const S = (v: number, sCents: number) => { const d = Math.max(0, sCents); return d < v ? ((v - d) / v) ** 2 : 0 }
export const midOf = (b: Book) => (b.bids[0] && b.asks[0] ? (b.bids[0].price + b.asks[0].price) / 2 : NaN)
// Size-cutoff-adjusted midpoint (the reward engine's reference): the price where each side's cumulative size first reaches the
// market's min size, so a 5-share order cannot move the midpoint. Falls back to the plain midpoint when a side is too thin.
export function midAdj(b: Book, minSize: number) {
  const lvl = (l: Lvl[]) => { let c = 0; for (const x of l) { c += x.size; if (c >= minSize) return x.price } return NaN }
  const m = (lvl(b.bids) + lvl(b.asks)) / 2
  return Number.isFinite(m) ? m : midOf(b)
}

export function qMin(q1: number, q2: number, mid: number) {
  return mid >= 0.1 && mid <= 0.9 ? Math.max(Math.min(q1, q2), Math.max(q1, q2) / PMR.c) : Math.min(q1, q2)
}
// everyone else's score in this book (our paper quotes are not in the real book)
export function bookQ(b: Book, v: number, minSize: number) {
  const m = midAdj(b, minSize)
  const q1 = b.bids.reduce((s, l) => s + (l.size >= minSize ? S(v, (m - l.price) * 100) * l.size : 0), 0)
  const q2 = b.asks.reduce((s, l) => s + (l.size >= minSize ? S(v, (l.price - m) * 100) * l.size : 0), 0)
  return qMin(q1, q2, m)
}
export function ourQ(b: Book, v: number, minSize: number, bid: Quote, ask: Quote) {
  const m = midAdj(b, minSize)
  const q1 = bid && bid.size >= minSize ? S(v, (m - bid.px) * 100) * bid.size : 0
  const q2 = ask && ask.size >= minSize ? S(v, (ask.px - m) * 100) * ask.size : 0
  return qMin(q1, q2, m)
}
export function share(b: Book, v: number, minSize: number, bid: Quote, ask: Quote) {
  const o = ourQ(b, v, minSize, bid, ask)
  return o > 0 ? o / (o + bookQ(b, v, minSize)) : 0
}

const round = (x: number, t: number) => Math.round(x / t) * t
// Quote prices: join the best bid / best ask (back of the queue, the least adverse spot) unless the best level sits outside the
// reward band, then quote at half the band from the midpoint. Never cross the book.
export function quotePx(b: Book, v: number, minSize = 0) {
  const m = midAdj(b, minSize), t = b.tick
  const edge = Math.max(t, Math.floor((v / 2) / (t * 100)) * t)
  let bid = b.bids[0].price, ask = b.asks[0].price
  if ((m - bid) * 100 >= v) bid = round(Math.ceil((m - edge) / t - 1e-9) * t, t)
  if ((ask - m) * 100 >= v) ask = round(Math.floor((m + edge) / t + 1e-9) * t, t)
  if (bid > m) bid = round(Math.floor(m / t + 1e-9) * t, t)        // a thin top of book can sit past the adjusted midpoint
  if (ask < m) ask = round(Math.ceil(m / t - 1e-9) * t, t)
  if (bid >= b.asks[0].price) bid = round(b.asks[0].price - t, t)
  if (ask <= b.bids[0].price) ask = round(b.bids[0].price + t, t)
  return { bid: +bid.toFixed(4), ask: +ask.toFixed(4) }
}
export const sizeAt = (lv: Lvl[], px: number) => lv.find((l) => Math.abs(l.price - px) < 1e-9)?.size ?? 0

// A taker trade in YES terms: 'sell' hits YES bids, 'buy' lifts YES asks. A NO buy at q is a YES sell at 1-q (it matches YES
// bids through minting), a NO sell at q is a YES buy at 1-q.
export type Tr = { side: 'buy' | 'sell'; px: number; size: number; ts: number }
export function yesTrade(t: { side: string; outcomeIndex: number; price: number; size: number; timestamp: number }): Tr {
  const yes = t.outcomeIndex === 0, buy = t.side === 'BUY'
  return { side: (buy === yes) ? 'buy' : 'sell', px: yes ? t.price : +(1 - t.price).toFixed(4), size: t.size, ts: t.timestamp }
}
// Fill a resting quote from the tape (time order, only trades at/after the quote went up). A trade through our price fills us
// (min of its size and what is left); a trade AT our price first eats the queue that was ahead of us.
export function fillQuote(q: NonNullable<Quote>, side: 'bid' | 'ask', trades: Tr[]) {
  let filled = 0, queue = q.queue
  for (const t of trades) {
    if (t.ts < q.at) continue
    if (side === 'bid' ? t.side !== 'sell' : t.side !== 'buy') continue
    const left = q.size - filled; if (left <= 0) break
    const through = side === 'bid' ? t.px < q.px - 1e-9 : t.px > q.px + 1e-9
    const at = Math.abs(t.px - q.px) < 1e-9
    if (through) filled += Math.min(left, t.size)
    else if (at) { const eat = Math.min(queue, t.size); queue -= eat; filled += Math.min(left, t.size - eat) }
  }
  return { filled: +filled.toFixed(4), queue }
}

// Inventory as YES and NO shares + cash; a YES+NO pair is merged back into $1 (as the exchange allows).
export type Inv = { yes: number; no: number; cash: number }
export function merge(x: Inv) { const m = Math.min(x.yes, x.no); x.yes -= m; x.no -= m; x.cash += m; return m }
export function onBidFill(x: Inv, px: number, sz: number) { x.cash -= px * sz; x.yes += sz; return merge(x) }
export function onAskFill(x: Inv, px: number, sz: number) { x.cash -= (1 - px) * sz; x.no += sz; return merge(x) }

// ---- realism (2026-10-23, owner: "it must match real trading") ----
// Collateral an open order locks on Polymarket: a YES bid locks px x size USDC; an ask sells held YES shares (locks shares, no
// cash) or, without them, is a NO bid that locks (1-px) x size USDC. Open orders across ALL markets cannot lock more than cash.
export function lockOf(side: 'bid' | 'ask', px: number, size: number, yesHeld: number) {
  if (side === 'bid') return px * size
  return Math.max(0, size - yesHeld) * (1 - px)
}
// Queue ahead of us can only shrink: cancels ahead move us up. It can never exceed what is visible at our price now.
export const clampQueue = (queue: number, levelNow: number) => Math.max(0, Math.min(queue, levelNow))
// Taker fee on fee-enabled markets (same formula as shared/pm.ts takerFee); makers pay none.
export type Fee = { rate: number; exponent: number } | null
export const takerFee = (shares: number, p: number, f: Fee) =>
  !f || !(f.rate > 0) || !(shares > 0) ? 0 : shares * f.rate * Math.pow(Math.max(0, p * (1 - p)), f.exponent > 0 ? f.exponent : 1)
// Market sell of `shares` into a bid ladder (price descending), level by level; shares the book cannot absorb get $0.
export function walkSell(bids: Lvl[], shares: number, f: Fee) {
  let left = shares, got = 0, fee = 0
  for (const l of bids) { if (left <= 0) break; const q = Math.min(left, l.size); got += q * l.price; fee += takerFee(q, l.price, f); left -= q }
  return { proceeds: got - fee, fee, unfilled: left }
}
// NO bids are YES asks mirrored at 1 - price (the books mirror each other).
export const noBids = (b: Book): Lvl[] => b.asks.map((l) => ({ price: +(1 - l.price).toFixed(4), size: l.size }))
// Reward samples: the exchange samples once a minute; we score one sample per minute boundary crossed since the last cycle
// (a stalled loop is capped). Earned rewards are PENDING until the daily payout at 00:00 UTC, where a market's day below $1
// is not paid (docs: payouts below $1 are not paid).
export const samplesBetween = (prevMs: number, nowMs: number, cap = 3) =>
  !prevMs ? 0 : Math.max(0, Math.min(cap, Math.floor(nowMs / 60000) - Math.floor(prevMs / 60000)))
export const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)
export function payout(pending: Record<string, number>, minPay = 1) {
  let paid = 0, dropped = 0
  for (const v of Object.values(pending)) (v >= minPay ? (paid += v) : (dropped += v))
  return { paid, dropped }
}

export const daysTo = (end: string, now: number) => (Date.parse(end) - now) / 86400_000
export function eligible(m: { mid: number; end: string; spreadC: number; v: number }, now: number) {
  if (!(m.mid >= PMR.midLo && m.mid <= PMR.midHi)) return 'mid'
  if (!(daysTo(m.end, now) >= PMR.minDaysToEnd)) return 'end'
  if (m.spreadC > 3 * m.v) return 'wide'
  return null
}
// Shares per side so that bid notional + NO-side notional fits the market budget (bid YES costs px, an ask = NO bid costs 1-px).
export const sizeFor = (budget: number, bid: number, ask: number) => Math.floor(budget / (bid + (1 - ask)))

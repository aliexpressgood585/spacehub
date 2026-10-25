// What-if for "פולי תגמולים": how the expected daily liquidity reward scales with capital, on the LIVE reward markets and books,
// with the desk's own selection rules (shared/pmr.ts: eligible, quotePx, sizeFor, share; capital split equally over the markets).
// Read-only, no orders. For each capital C and market count M: budget = C / M per market, quote size from it, our share of the
// qualifying book, expected = pool x share; pick the best M by reward per $ locked. Also the exposure: the inventory cap
// (PMR.invCap x quote size) = what one market can hold against us when fills keep coming on one side.
// CAVEAT printed with the result: competitors are frozen at today's book; real makers react to a large new quote.
// Usage: node --experimental-strip-types backtest/research/pmr_scale.ts > status/pmr-scale.txt
import { PMR, midAdj, share, quotePx, eligible, sizeFor, type Book } from '../../shared/pmr.ts'

const GAMMA = 'https://gamma-api.polymarket.com', CLOB = 'https://clob.polymarket.com', H = { 'User-Agent': 'spacehub-paper/1.0' }
const j = async (u: string, body?: unknown) => {
  const r = await fetch(u, body ? { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { headers: H })
  if (!r.ok) throw new Error(`${r.status} ${u.slice(0, 80)}`); return r.json()
}
const arr = (x: unknown): any[] => { try { return Array.isArray(x) ? x : JSON.parse(String(x)) } catch { return [] } }
const NOW = Date.now()

const all: any[] = []; let cur = ''
for (let k = 0; k < 40; k++) {
  const d = await j(`${CLOB}/rewards/markets/current${cur ? `?next_cursor=${cur}` : ''}`)
  all.push(...d.data); cur = d.next_cursor
  if (!cur || cur === 'LTE=' || !d.data.length) break
}
const top = all.sort((a, b) => (+b.total_daily_rate || 0) - (+a.total_daily_rate || 0)).slice(0, 400)
const meta: any[] = []
for (let i = 0; i < top.length; i += 40) meta.push(...await j(`${GAMMA}/markets?limit=100&${top.slice(i, i + 40).map((m) => `condition_ids=${m.condition_id}`).join('&')}`))
const rw = new Map(top.map((m) => [m.condition_id, m]))
const live = meta.filter((g) => !g.closed && g.active && g.acceptingOrders !== false && arr(g.clobTokenIds).length === 2 && !g.gameStartTime)
const bk: Record<string, Book> = {}
const toks = live.map((g) => arr(g.clobTokenIds)[0])
for (let i = 0; i < toks.length; i += 100) for (const b of await j(`${CLOB}/books`, toks.slice(i, i + 100).map((t) => ({ token_id: t })))) {
  const m = (l: any[]) => (l ?? []).map((x) => ({ price: +x.price, size: +x.size })).filter((x) => x.price > 0 && x.size > 0)
  bk[b.asset_id] = { bids: m(b.bids).sort((a, c) => c.price - a.price), asks: m(b.asks).sort((a, c) => a.price - c.price), tick: +b.tick_size || 0.01 }
}
const mk = live.map((g) => {
  const r = rw.get(g.conditionId), b = bk[arr(g.clobTokenIds)[0]]
  if (!r || !b?.bids[0] || !b.asks[0]) return null
  const v = +r.rewards_max_spread, min = +r.rewards_min_size, rate = +r.total_daily_rate, mid = midAdj(b, min)
  if (eligible({ mid, end: g.endDate, spreadC: (b.asks[0].price - b.bids[0].price) * 100, v }, NOW)) return null
  return { q: g.question as string, b, v, min, rate, mid, qp: quotePx(b, v, min) }
}).filter(Boolean) as any[]

function scenario(capital: number, M: number) {
  const budget = capital / M, rows: any[] = []
  for (const m of mk) {
    const size = sizeFor(budget, m.qp.bid, m.qp.ask); if (size < m.min) continue
    const sh = share(m.b, m.v, m.min, { px: m.qp.bid, size, queue: 0, at: 0 }, { px: m.qp.ask, size, queue: 0, at: 0 })
    const lock = size * (m.qp.bid + 1 - m.qp.ask), exp = m.rate * sh
    if (exp / lock < PMR.minYieldPerDay) continue
    // inventory cap: invCap x size shares on one side; worst case = their cost if the price then goes to 0 against us
    const inv = PMR.invCap * size, invCost = inv * Math.max(m.qp.bid, 1 - m.qp.ask)
    rows.push({ q: m.q, rate: m.rate, share: sh, exp, lock, invCost })
  }
  rows.sort((a, b) => b.exp / b.lock - a.exp / a.lock)
  const pick = rows.slice(0, M), day = pick.reduce((s, r) => s + r.exp, 0)
  return { capital, M, n: pick.length, day, pct: 100 * day / capital, maxInv: Math.max(0, ...pick.map((r) => r.invCost)), sumInv: pick.reduce((s, r) => s + r.invCost, 0), pick }
}

console.log(`pmr scale what-if — ${new Date(NOW).toISOString()} — ${all.length} reward markets, ${mk.length} eligible with books, pool $${Math.round(all.reduce((s, m) => s + (+m.total_daily_rate || 0), 0)).toLocaleString()}/day`)
console.log('expected reward per day = pool x our share of the qualifying book (competitors frozen at today\'s book, our quotes invisible to them)\n')
console.log('  capital  markets  used   $/day   %/day   worst market inventory   all markets inventory')
const res: any[] = []
for (const C of [1000, 2000, 5000, 10000, 25000]) for (const M of [5, 10, 20]) {
  const r = scenario(C, M); res.push(r)
  console.log(`  ${('$' + C.toLocaleString()).padStart(7)}  ${String(M).padStart(5)}  ${String(r.n).padStart(5)}  ${r.day.toFixed(0).padStart(6)}  ${r.pct.toFixed(1).padStart(6)}%   $${r.maxInv.toFixed(0).padStart(6)} (${(100 * r.maxInv / C).toFixed(0)}%)          $${r.sumInv.toFixed(0)} (${(100 * r.sumInv / C).toFixed(0)}%)`)
}
for (const C of [1000, 5000, 25000]) {
  const r = res.find((x) => x.capital === C && x.M === 10)!
  console.log(`\n-- $${C.toLocaleString()}, 10 markets: top picks --`)
  for (const p of r.pick.slice(0, 10)) console.log(`  pool $${String(Math.round(p.rate)).padStart(5)}/d  share ${(100 * p.share).toFixed(0).padStart(3)}%  exp $${p.exp.toFixed(0).padStart(4)}/d  lock $${p.lock.toFixed(0).padStart(5)}  ${p.q.slice(0, 70)}`)
}
console.log('\nREADING: thin pools saturate (share ~100% already); extra capital buys share only in contested pools and room for more markets.')
console.log('Inventory = what a market can hold against us if fills keep coming one way (invCap x quote size); worst case ~ its cost on a news jump.')
console.log('NOT a result: real makers react to a big new quote, and the paper desk has 60 fills — adverse selection is not yet measured.')

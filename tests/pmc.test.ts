// "פולי מטבעות" desk (shared/pmc.ts + scripts/pmc-desk.ts): window maths, Hebrew titles, and a paper replay of the runner
// on a mocked Polymarket (entry in band, out-of-band skip, one entry per market, settlement at the official result).
import fs from 'node:fs'
import { PMC, TF_SEC, windowOf, slugOf, inWindow, inBandR, questionHe, type Rule } from '../shared/pmc.ts'
let n = 0, bad = 0
const ok = (c: boolean, m: string) => { n++; if (!c) { bad++; console.error('FAIL', m) } }
const near = (a: number, b: number, e = 1e-9) => Math.abs(a - b) < e

const w = windowOf('15m', 1791927000 + 600)
ok(w.start === 1791927000 && w.end === 1791927900 && w.left === 300, 'windowOf: 15m window start, end and seconds left')
ok(windowOf('5m', 1791927300).left === 300 && windowOf('4h', 14400 * 5 + 1).start === 14400 * 5, 'windowOf aligns to the epoch grid')
ok(slugOf('btc', '5m', 1791927300) === 'btc-updown-5m-1791927300', 'slug format matches Polymarket')
const r: Rule = { tf: '5m', coins: ['btc'], enterFrom: 90, enterTo: 30, lo: 0.85, hi: 0.95 }
ok(inWindow(r, 90) && inWindow(r, 30) && !inWindow(r, 91) && !inWindow(r, 29), 'entry window bounds are inclusive')
ok(inBandR(r, 0.85) && !inBandR(r, 0.95) && !inBandR(r, 0.5), 'price band [lo, hi)')
ok(questionHe('btc', '15m', 1791927000) === 'ביטקוין · עולה או יורד · 15 דקות · 21:30–21:45 UTC', 'Hebrew title is deterministic')
ok(PMC.rules.every((x) => x.lo < x.hi && x.hi < 1 && x.enterTo >= 0 && x.enterFrom <= TF_SEC[x.tf]), 'every deployed rule is well-formed')

// replay: one always-open rule, two coins; BTC Up asks 0.90 (in band), ETH both sides out of band.
const saved = PMC.rules.splice(0)
PMC.rules.push({ tf: '15m', coins: ['btc', 'eth'], enterFrom: 900, enterTo: 0, lo: 0.85, hi: 0.95 })
const dir = fs.mkdtempSync('/tmp/pmctest-'), file = `${dir}/state.json`
const J = (x: unknown) => new Response(JSON.stringify(x), { status: 200 })
let resolved = false
const mk = (slug: string, id: string, a: string, b: string) => ({ id, slug, question: slug, closed: false, acceptingOrders: true, clobTokenIds: JSON.stringify([a, b]), outcomes: '["Up","Down"]', outcomePrices: '["0.9","0.1"]', endDate: new Date(Date.now() + 600e3).toISOString(), feesEnabled: true, feeSchedule: { rate: 0.07, exponent: 1 } })
;(globalThis as any).fetch = async (u: string) => {
  if (u.includes('closed=true')) return J(resolved ? [{ id: 'B1', closed: true, clobTokenIds: '["BU","BD"]', outcomePrices: '["1","0"]' }] : [])
  if (u.includes('/markets?')) { const s = [...u.matchAll(/slug=([^&]+)/g)].map((x) => x[1]); return J(s.map((x) => x.startsWith('btc') ? mk(x, 'B1', 'BU', 'BD') : mk(x, 'E1', 'EU', 'ED'))) }
  if (u.includes('token_id=BU')) return J({ bids: [{ price: '0.89', size: '500' }], asks: [{ price: '0.90', size: '1000' }] })
  if (u.includes('token_id=BD')) return J({ bids: [], asks: [{ price: '0.11', size: '1000' }] })
  if (u.includes('token_id=EU')) return J({ bids: [], asks: [{ price: '0.60', size: '1000' }] })
  if (u.includes('token_id=ED')) return J({ bids: [], asks: [{ price: '0.41', size: '1000' }] })
  return new Response('no', { status: 500 })
}
process.argv[2] = file
const log = console.log; console.log = () => {}
const run = async (k: number) => { await import(`../scripts/pmc-desk.ts?run=${k}`) }
await run(1)
let out = JSON.parse(fs.readFileSync(file, 'utf8'))
const t = out.trades[0]
ok(out.trades.length === 1 && t.outcome === 'Up' && t.slug.startsWith('btc-'), 'buys only the in-band side, skips the out-of-band market')
const fee = 0.07 * t.qty * 0.9 * 0.1
ok(near(t.entry_px, 0.9) && near(t.entry_fee, fee, 1e-6) && near(t.cost, t.qty * 0.9 + fee, 1e-6), 'fill at the real ask + 0.07·p(1-p) fee')
ok(near(t.cost, 1000 * PMC.stakeFrac, 1e-6) && near(out.cash, 1000 - t.cost, 1e-6), `stake = ${PMC.stakeFrac * 100}% of equity`)
ok(t.question_he.startsWith('ביטקוין · עולה או יורד · 15 דקות') && t.outcome_he === 'עולה' && t.meta.window_s === 900, 'Hebrew title, outcome and window stored')
await run(2)
out = JSON.parse(fs.readFileSync(file, 'utf8'))
ok(out.trades.length === 1, 'never enters the same market twice')
resolved = true
await run(3)
out = JSON.parse(fs.readFileSync(file, 'utf8'))
const c = out.trades[0]
ok(c.status === 'CLOSED' && c.reason === 'RESOLVED_WIN' && near(c.pnl, c.qty - c.cost, 1e-6), 'settles at the official $1 result')
ok(near(out.cash, 1000 - c.cost + c.qty, 1e-6), 'cash = start - cost + payout')
console.log = log
PMC.rules.splice(0, PMC.rules.length, ...saved)
// the runner never signs or posts anything
const src = fs.readFileSync(new URL('../scripts/pmc-desk.ts', import.meta.url), 'utf8')
ok(!/method:\s*'POST'|privateKey|signature|apiKey/i.test(src), 'paper only: no order, no key, no signature in the runner')
console.log(`pmc desk: ${n - bad}/${n} passed`)
if (bad) process.exit(1)

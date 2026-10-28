// "פולי מטבעות" desk (shared/pmc.ts + scripts/pmc-desk.ts): window maths, Hebrew titles, and a paper replay of the runner
// on a mocked Polymarket (entry in band, out-of-band skip, one entry per market, settlement at the official result).
import fs from 'node:fs'
import { PMC, pmcStake, pmcPxCap, pmcZ, sigmaOf, pmcFloor, TF_SEC, windowOf, slugOf, inWindow, inBandR, questionHe, zMinOf, type Rule } from '../shared/pmc.ts'
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

// v2 protection: floor 90% of start + half of every profit peak; stake <= 3% equity and <= (equity - floor) / 3
ok(pmcFloor(1000, 1000) === 900 && Math.abs(pmcFloor(1000, 1200) - 1000) < 1e-9, 'floor = 90% of start, raised by 50% of the profit peak')
ok(near(pmcStake(1000, 1000, 1000).stake, 30) && near(pmcStake(1200, 1200, 1000).stake, 36), 'stake = 3% of equity while far from the floor')
{ const a = pmcStake(950, 1000, 1000); ok(near(a.stake, 50 / 3) && near(a.floor, 900), 'near the floor the stake shrinks to (equity - floor) / 3') }
{ let eq = 1200, peak = 1200; for (let i = 0; i < 3; i++) eq -= pmcStake(eq, peak, 1000).stake
  ok(eq > pmcFloor(1000, peak) && eq > 1000, `three straight full losses from $1,200 leave $${eq.toFixed(0)}: above the floor and still in profit`) }
ok(pmcStake(900, 1000, 1000).stake === 0 && pmcStake(880, 1000, 1000).stake === 0, 'on or below the floor: no stake')
ok(near(pmcPxCap(0.98, 0.93), 0.94) && near(pmcPxCap(0.98, 0.985), 0.99) && near(pmcPxCap(0.98, null), 0.99), 'price cap = min(band + 1c, last trade + 1c)')
ok(near(pmcZ(100, 101, 0.001, 100), Math.log(1.01) / 0.01) && Number.isNaN(pmcZ(0, 1, 1, 1)), 'z = ln(now/open) / (sigma x sqrt(seconds left))')
ok(Number.isNaN(sigmaOf([1, 2, 3])) && near(sigmaOf(Array.from({ length: 1001 }, (_, i) => (i % 2 ? 101 : 100))), Math.log(101 / 100)), 'sigma of 1 s log returns, needs >= 600 returns')
ok(PMC.maxPerWindow === 1, 'one position per window (the coins move together)')
{ const [a, b] = PMC.rules
  ok(PMC.rules.length === 2 && b.enterFrom < a.enterTo && b.enterTo > 0, 'second look: a later, non-overlapping entry window in the same 5m windows')
  ok(zMinOf(a) === PMC.zMin && zMinOf(b) === 2.5 && zMinOf(b) > zMinOf(a), 'second look needs a larger distance (z >= 2.5) than the first')
  ok(b.lo === a.lo && b.hi === a.hi && b.tf === a.tf && b.coins.join() === a.coins.join(), 'second look: same band, timeframe and coins') }

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
  if (u.includes('data-api.binance.vision')) {   // spot 1 s klines: opened at 100, now ~101 with tiny noise -> z far above zMin (Up)
    if (u.includes('startTime=')) return J([[0, '100', '100', '100', '100']])
    const end = +(u.match(/endTime=(\d+)/)?.[1] ?? 0)
    return J(Array.from({ length: 1000 }, (_, i) => [end - (999 - i) * 1000, '101', '101', '101', String(101 + (i % 2 ? 0.001 : -0.001))]))
  }
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
ok(t.meta.z >= PMC.zMin && t.meta.spot_open === 100, 'entry records the distance z and the spot open it was measured from')
ok(near(t.entry_px, 0.9) && near(t.entry_fee, fee, 1e-6) && near(t.cost, t.qty * 0.9 + fee, 1e-6), 'fill at the real ask + 0.07·p(1-p) fee')
ok(near(t.cost, 1000 * PMC.maxPosFrac, 1e-6) && near(out.cash, 1000 - t.cost, 1e-6), `a lone entry takes ${PMC.maxPosFrac * 100}% of equity (the cap)`)
ok(t.question_he.startsWith('ביטקוין · עולה או יורד · 15 דקות') && t.outcome_he === 'עולה' && t.meta.window_s === 900, 'Hebrew title, outcome and window stored')
ok(out.shadow?.length === 1 && out.shadow[0].limit === 0.89 && !out.shadow[0].filled && out.shadow[0].taker_ask === 0.9, 'shadow maker bid placed at the real best bid, not filled while the ask sits above it')
ok(!!out.study && out.study.maker.placed === 1, 'study summary written to the state')
{ const s0 = JSON.parse(fs.readFileSync(file, 'utf8')); s0.trades[0].end_time = new Date(Date.now() + 20e3).toISOString(); fs.writeFileSync(file, JSON.stringify(s0)) }
await run(2)
out = JSON.parse(fs.readFileSync(file, 'utf8'))
ok(out.trades.length === 1, 'never enters the same market twice')
{ const x = out.trades[0].meta.x30, q = out.trades[0].qty
  ok(!!x && x.bid === 0.89 && x.unfilled === 0 && near(x.proceeds, q * 0.89 - 0.07 * q * 0.89 * 0.11, 1e-6) && x.z > 0 && !out.trades[0].meta.x15,
    'shadow late exit at <= 30 s: whole position priced into the real bid book less the taker fee, with spot z; 15 s not yet') }
resolved = true
await run(3)
out = JSON.parse(fs.readFileSync(file, 'utf8'))
const c = out.trades[0]
ok(c.status === 'CLOSED' && c.reason === 'RESOLVED_WIN' && near(c.pnl, c.qty - c.cost, 1e-6), 'settles at the official $1 result')
ok(near(out.cash, 1000 - c.cost + c.qty, 1e-6), 'cash = start - cost + payout')
{ const le = out.study.late_exit.x30, a = le.rules.find((r: any) => r.rule === 'always')
  ok(le.n === 1 && a.sold === 1 && a.wins_cut === 1 && near(a.gain_usd, c.meta.x30.proceeds - c.qty, 1e-6) && a.gain_usd < 0,
    'late-exit study: selling a winner at 30 s would have cost (proceeds - $1 payout), never touches cash') }
console.log = log
PMC.rules.splice(0, PMC.rules.length, ...saved)
// the runner never signs or posts anything
const src = fs.readFileSync(new URL('../scripts/pmc-desk.ts', import.meta.url), 'utf8')
ok(!/method:\s*'POST'|privateKey|signature|apiKey/i.test(src), 'paper only: no order, no key, no signature in the runner')
console.log(`pmc desk: ${n - bad}/${n} passed`)
if (bad) process.exit(1)

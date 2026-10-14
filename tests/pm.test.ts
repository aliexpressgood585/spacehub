// Polymarket paper desk rules (shared/pm.ts): fills, fees and the on-demand early exit.
import fs from 'node:fs'
import { PM, takerFee, walkAsks, walkBids, inBand, heOutcome, namesKept, pmMatch } from '../shared/pm.ts'
let n = 0, bad = 0
const ok = (c: boolean, m: string) => { n++; if (!c) { bad++; console.log('FAIL', m) } }
const near = (a: number, b: number, e = 1e-9) => Math.abs(a - b) < e
// walkAsks
const a = walkAsks([{ price: 0.9, size: 10 }, { price: 0.88, size: 10 }], 13.3, 0.92)
ok(near(a.qty, 10 + 4.5 / 0.9) && near(a.spent, 13.3), 'walkAsks takes the cheapest level first and stops at the budget')
ok(walkAsks([{ price: 0.95, size: 100 }], 50, 0.92).qty === 0, 'walkAsks never buys above maxPx')
// fee near p=1 is ~0
ok(takerFee(100, 0.999, { rate: 0.03, exponent: 1 }) < 0.01, 'taker fee at 99.9c is under one cent per 100 shares')
ok(takerFee(100, 0.5, null) === 0, 'no fee schedule = no fee')
// walkBids: all-or-nothing above minPx
const b = walkBids([{ price: 0.999, size: 60 }, { price: 0.99, size: 100 }, { price: 0.98, size: 1000 }], 110, PM.exitPx)
ok(!!b && near(b.got, 60 * 0.999 + 50 * 0.99) && near(b.vwap, b.got / 110), 'walkBids sells best bid first')
ok(walkBids([{ price: 0.999, size: 60 }, { price: 0.98, size: 1000 }], 110, PM.exitPx) === null, 'walkBids refuses a partial exit above minPx')
ok(walkBids([], 10, PM.exitPx) === null && walkBids([{ price: 1, size: 5 }], 0, PM.exitPx) === null, 'walkBids: empty book or zero qty -> null')
ok(PM.exitPx > PM.hi && !inBand(PM.exitPx), 'exitPx sits above the entry band, so a position bought this cycle is never sold')
// Hebrew outcomes: generic answers translated, team / player names untouched
ok(heOutcome('Yes') === 'כן' && heOutcome('no') === 'לא' && heOutcome('Up') === 'עולה' && heOutcome('Down') === 'יורד', 'generic outcomes are translated from the fixed list')
ok(heOutcome('Liquid') === 'Liquid' && heOutcome('BBL') === 'BBL' && heOutcome('100 Thieves') === '100 Thieves' && heOutcome('Yellow Submarine') === 'Yellow Submarine', 'team names are never translated')
ok(namesKept('Counter-Strike: Liquid vs BBL - Map 1 Winner', 'Counter-Strike: Liquid vs BBL - מנצח מפה 1', ['Liquid', 'BBL']), 'a translation that keeps the names is kept')
ok(!namesKept('Counter-Strike: Liquid vs BBL - Map 1 Winner', 'Counter-Strike: נוזל נגד BBL - מנצח מפה 1', ['Liquid', 'BBL']), 'a translation that renamed a team is rejected')
ok(namesKept('Will Elon Musk post 360-379 tweets?', 'האם אילון מאסק יפרסם 360-379 ציוצים?', ['Yes', 'No']), 'generic outcomes impose nothing on the question')
// runner wiring: early exit only from the entry path when cash is short
const src = fs.readFileSync(new URL('../scripts/pm-desk.ts', import.meta.url), 'utf8')
ok(/if \(st\.cash - 1 < want\) await freeCash\(/.test(src), 'freeCash is called only when cash cannot cover a new entry')
ok((src.match(/freeCash\(/g) ?? []).length === 2, 'freeCash has exactly one call site (plus its definition)')
ok(/reason: 'EARLY_EXIT'/.test(src) && /exit_fee: fee/.test(src), 'early exit books its fee and reason')

// paper replay of the runner on a mocked Polymarket: one held position at 99.5c bid, cash $5, one new in-band market.
const dir = fs.mkdtempSync('/tmp/pmtest-'), file = `${dir}/state.json`
const held = { id: 1, market_id: 'H', slug: 'h', event_slug: 'eh', question: 'Held?', outcome: 'Yes', token_id: 'TH', end_time: new Date(Date.now() + 3600e3).toISOString(), qty: 1000, entry_px: 0.9, entry_fee: 3, cost: 903, best_ask: 0.9, opened_at: '', status: 'OPEN', mark_px: 0.995, mark_at: '', meta: { fee_schedule: { rate: 0.03, exponent: 1 } }, question_he: 'x', outcome_he: 'y' }
fs.writeFileSync(file, JSON.stringify({ start_cash: 1000, cash: 5, strategy: PM, last_scan: null, last_note: null, trades: [held], equity: [], decisions: [], next_id: 2 }))
const J = (x: unknown) => new Response(JSON.stringify(x), { status: 200 })
;(globalThis as any).fetch = async (u: string) => {
  if (u.includes('/markets/H')) return J({ closed: false, clobTokenIds: '["TH","TN"]', outcomePrices: '["0.995","0.005"]' })
  if (u.includes('/markets?')) return J(u.includes('offset=0') ? [{ id: 'N', slug: 'n', question: 'New?', acceptingOrders: true, enableOrderBook: true, clobTokenIds: '["A","B"]', outcomes: '["Yes","No"]', outcomePrices: '["0.88","0.12"]', endDate: new Date(Date.now() + 7200e3).toISOString(), events: [{ slug: 'en' }] }] : [])
  if (u.includes('token_id=TH')) return J({ bids: [{ price: '0.995', size: '2000' }], asks: [] })
  if (u.includes('token_id=A')) return J({ bids: [{ price: '0.87', size: '500' }], asks: [{ price: '0.88', size: '1000' }] })
  if (u.includes('token_id=B')) return J({ bids: [], asks: [{ price: '0.13', size: '1000' }] })
  return new Response('no', { status: 500 })
}
process.argv[2] = file
const log = console.log; console.log = () => {}
await import('../scripts/pm-desk.ts')
console.log = log
const out = JSON.parse(fs.readFileSync(file, 'utf8')), h = out.trades.find((t: any) => t.id === 1), nw = out.trades.find((t: any) => t.token_id === 'A')
ok(h.status === 'CLOSED' && h.reason === 'EARLY_EXIT' && near(h.exit_px, 0.995), 'cash-short entry sells the 99.5c position at its real bid')
ok(near(h.pnl, 1000 * 0.995 - h.exit_fee - 903) && h.exit_fee > 0 && h.exit_fee < 0.2, 'early-exit P&L = proceeds - fee - cost, fee tiny near 1')
ok(!!nw && nw.status === 'OPEN' && near(nw.entry_px, 0.88), 'the freed cash funds the new in-band entry')
ok(out.last_note.recycled === 1 && out.decisions.some((d: any) => d.decision === 'SELL'), 'the sale is journalled as SELL and counted')
// per-match cap (2026-10-14): a game's split events are one match; positions <= 5% each, one match <= 10% of equity
ok(pmMatch('ucl-mnc-psg-2026-10-14') === 'ucl-mnc-psg-2026-10-14' && pmMatch('ucl-mnc-psg-2026-10-14-more-markets') === 'ucl-mnc-psg-2026-10-14'
  && pmMatch('ucl-mnc-psg-2026-10-14-exact-score') === 'ucl-mnc-psg-2026-10-14', 'the split events of one game map to one match key')
ok(pmMatch('dota2-nemiga-salami-2026-10-14') !== pmMatch('ucl-mnc-psg-2026-10-14') && pmMatch('no-date-slug') === 'no-date-slug', 'different games stay apart; a slug without a date is its own key')
ok(PM.maxPosFrac === 0.05 && PM.maxMatchFrac === 0.10 && PM.maxMatchFrac >= PM.maxPosFrac, 'position cap 5%, match cap 10%')
{ const src = fs.readFileSync(new URL('../scripts/pm-desk.ts', import.meta.url), 'utf8')
  ok(/events\.get\(mkey\)/.test(src) && /Math\.min\(want, st\.cash - 1, matchRoom\)/.test(src), 'entries count positions and cost per match, stake bounded by the match room')
  ok(/eq \* PM\.maxMatchFrac/.test(src), 'top-ups also respect the match cap') }
console.log(`pm desk: ${n - bad}/${n} passed`)
if (bad) process.exit(1)

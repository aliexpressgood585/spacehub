// Polymarket paper desk rules (shared/pm.ts): fills, fees and the on-demand early exit.
import fs from 'node:fs'
import { PM, takerFee, walkAsks, walkBids, inBand, heOutcome, namesKept, pmMatch, isCryptoPrice } from '../shared/pm.ts'
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
// 2026-10-18: a 50-50 official result (S) settles at 0.5; a closed market whose prices are not final yet (Q) stays open;
// 5,003 equity points (one per hour) -> the 5,000 window + the dropped points kept hourly in equity_h.
const split = { ...held, id: 2, market_id: 'S', slug: 's', event_slug: 'es', token_id: 'TS', qty: 2, cost: 1.8, entry_fee: 0, mark_px: 0.5, meta: {} }
const pend = { ...held, id: 3, market_id: 'Q', slug: 'q', event_slug: 'eq', token_id: 'TQ', qty: 2, cost: 1.8, entry_fee: 0, mark_px: 0.9, meta: {} }
const eq0 = Array.from({ length: 5003 }, (_, i) => ({ ts: new Date(Date.UTC(2026, 0, 1) + i * 3600e3).toISOString(), equity: 1000 + i, cash: 5, open_value: 0, open_count: 1 }))
fs.writeFileSync(file, JSON.stringify({ start_cash: 1000, cash: 5, strategy: PM, last_scan: null, last_note: null, trades: [held, split, pend], equity: eq0, decisions: [], next_id: 4 }))
const J = (x: unknown) => new Response(JSON.stringify(x), { status: 200 })
;(globalThis as any).fetch = async (u: string) => {
  if (u.includes('/markets/S')) return J({ closed: true, umaResolutionStatus: 'resolved', clobTokenIds: '["TS","TS2"]', outcomePrices: '["0.5","0.5"]' })
  if (u.includes('/markets/Q')) return J({ closed: true, umaResolutionStatus: 'proposed', clobTokenIds: '["TQ","TQ2"]', outcomePrices: '["0.9995","0.0005"]' })
  if (u.includes('/markets/H')) return J({ closed: false, clobTokenIds: '["TH","TN"]', outcomePrices: '["0.995","0.005"]' })
  if (u.includes('/markets?')) return J(u.includes('offset=0') ? [{ id: 'N', slug: 'n', question: 'New?', acceptingOrders: true, enableOrderBook: true, clobTokenIds: '["A","B"]', outcomes: '["Yes","No"]', outcomePrices: '["0.88","0.12"]', endDate: new Date(Date.now() + 7200e3).toISOString(), events: [{ slug: 'en' }] }] : [])
  if (u.includes('token_id=TH')) return J({ bids: [{ price: '0.995', size: '2000' }], asks: [] })
  if (u.includes('token_id=A')) return J({ bids: [{ price: '0.87', size: '500' }], asks: [{ price: '0.88', size: '1000' }] })
  if (u.includes('token_id=B')) return J({ bids: [], asks: [{ price: '0.13', size: '1000' }] })
  return new Response('no', { status: 500 })
}
process.argv[2] = file
const log = console.log; console.log = () => {}
const desk: any = await import('../scripts/pm-desk.ts')
console.log = log
const out = JSON.parse(fs.readFileSync(file, 'utf8')), h = out.trades.find((t: any) => t.id === 1), nw = out.trades.find((t: any) => t.token_id === 'A')
ok(h.status === 'CLOSED' && h.reason === 'EARLY_EXIT' && near(h.exit_px, 0.995), 'cash-short entry sells the 99.5c position at its real bid')
ok(near(h.pnl, 1000 * 0.995 - h.exit_fee - 903) && h.exit_fee > 0 && h.exit_fee < 0.2, 'early-exit P&L = proceeds - fee - cost, fee tiny near 1')
ok(!!nw && nw.status === 'OPEN' && near(nw.entry_px, 0.88), 'the freed cash funds the new in-band entry')
{ const sp = out.trades.find((t: any) => t.id === 2), pq = out.trades.find((t: any) => t.id === 3)
  ok(sp.status === 'CLOSED' && sp.reason === 'RESOLVED_SPLIT' && sp.exit_px === 0.5 && near(sp.pnl, 2 * 0.5 - 1.8), 'an official 50-50 result settles at 0.5 (was: open forever)')
  ok(pq.status === 'OPEN', 'a closed market whose prices are not 1/0 yet (and not a resolved 50-50) is not settled')
  ok(out.equity.length === 5000 && Array.isArray(out.equity_h) && out.equity_h.length === 4 && out.equity_h[0].equity === 1000, 'equity points beyond 5,000 survive hourly in equity_h')
  ok(!fs.existsSync(`${file}.tmp`) && /renameSync\(`\$\{FILE\}\.tmp`, FILE\)/.test(src), 'state is written atomically (temp file + rename)') }
{ const o = (m: any, k = 0) => desk.officialPx(m, k)
  ok(o({ closed: true, outcomePrices: '["1","0"]' }) === 1 && o({ closed: true, outcomePrices: '["1","0"]' }, 1) === 0, 'officialPx: 1 / 0 from Gamma outcomePrices')
  ok(o({ closed: false, outcomePrices: '["1","0"]' }) === null && o({ closed: true, outcomePrices: '["0.999","0.001"]' }) === null, 'officialPx: not closed or not final -> null')
  ok(o({ closed: true, outcomePrices: '["0.5","0.5"]', umaResolutionStatus: 'resolved' }) === 0.5 && o({ closed: true, outcomePrices: '["0.5","0.5"]', umaResolutionStatus: 'disputed' }) === null, 'officialPx: 50-50 only once UMA says resolved')
  ok(o({ closed: true, outcomePrices: '["1","0"]' }, -1) === null, 'officialPx: unknown token -> null') }
// the workflow copies the runner into /tmp/desk: every shared module the runner imports (directly or through another shared
// module) must be on the cp line, else every cycle dies with ERR_MODULE_NOT_FOUND (happened 2026-10-15 with shared/clv.ts)
{ const yml = fs.readFileSync('.github/workflows/pm-desk.yml', 'utf8'), cp = yml.split('\n').filter((l) => /\bcp\b/.test(l)).join(' ')
  const need = new Set<string>(), q = ['scripts/pm-desk.ts', 'scripts/pm-news.ts']
  while (q.length) { const f = q.pop()!; const txt = fs.readFileSync(f, 'utf8')
    const deps = [...txt.matchAll(/from '\.\.\/(shared\/[\w.-]+\.ts)'/g)].map((x) => x[1])
    if (f.startsWith('shared/')) deps.push(...[...txt.matchAll(/from '\.\/([\w.-]+\.ts)'/g)].map((x) => `shared/${x[1]}`))
    for (const d of deps) if (!need.has(d)) { need.add(d); q.push(d) } }
  ok(need.size >= 2 && [...need].every((x) => cp.includes(x)), `pm-desk.yml copies every imported shared module (${[...need].join(', ')})`)
  ok(cp.includes('scripts/pm-desk.ts') && cp.includes('scripts/pm-news.ts'), 'pm-desk.yml copies both scripts it runs') }
ok(out.last_note.recycled === 1 && out.decisions.some((d: any) => d.decision === 'SELL'), 'the sale is journalled as SELL and counted')
// per-match cap (2026-10-14): a game's split events are one match; positions <= 5% each, one match <= 10% of equity
ok(pmMatch('ucl-mnc-psg-2026-10-14') === 'ucl-mnc-psg-2026-10-14' && pmMatch('ucl-mnc-psg-2026-10-14-more-markets') === 'ucl-mnc-psg-2026-10-14'
  && pmMatch('ucl-mnc-psg-2026-10-14-exact-score') === 'ucl-mnc-psg-2026-10-14', 'the split events of one game map to one match key')
ok(pmMatch('dota2-nemiga-salami-2026-10-14') !== pmMatch('ucl-mnc-psg-2026-10-14') && pmMatch('no-date-slug') === 'no-date-slug', 'different games stay apart; a slug without a date is its own key')
ok(PM.maxPosFrac === 0.05 && PM.maxMatchFrac === 0.10 && PM.maxMatchFrac >= PM.maxPosFrac, 'position cap 5%, match cap 10%')
{ const src = fs.readFileSync(new URL('../scripts/pm-desk.ts', import.meta.url), 'utf8')
  ok(/events\.get\(mkey\)/.test(src) && /Math\.min\(want, st\.cash - 1, matchRoom\)/.test(src), 'entries count positions and cost per match, stake bounded by the match room')
  ok(/eq \* PM\.maxMatchFrac/.test(src), 'top-ups also respect the match cap') }
// crypto price markets are Poly Coins' domain, never traded by the main desk (2026-10-15)
ok(['bitcoin-above-on-october-15-2026', 'ethereum-up-or-down-on-october-15-2026', 'btc-updown-15m-1792067400', 'what-price-will-bitcoin-hit-on-october-14-2026'].every((x) => isCryptoPrice(x)), 'crypto price markets detected')
ok(!isCryptoPrice('ucl-mnc-psg-2026-10-14') && !isCryptoPrice('x', 'Will Solana Esports win?') && !isCryptoPrice('dota2-sol-vs-xyz'), 'sports / esports not caught')
ok(fs.readFileSync('scripts/pm-desk.ts', 'utf8').includes('if (isCryptoPrice(ev, m.question)) continue'), 'desk skips crypto price markets')
console.log(`pm desk: ${n - bad}/${n} passed`)
if (bad) process.exit(1)

// Polymarket paper desk rules (shared/pm.ts): fills, fees and the on-demand early exit.
import fs from 'node:fs'
import { PM, takerFee, walkAsks, walkBids, inBand, heOutcome, namesKept, pmMatch, isCryptoPrice, gateStudy, FADE, fadeEligible, fadeSnap, fadeDue, fadeSignal, isFade, strategyOf, stratStats, fadeKill } from '../shared/pm.ts'
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
const disp = { ...held, id: 4, market_id: 'D', slug: 'd', event_slug: 'ed', token_id: 'TD', qty: 2, cost: 1.8, entry_fee: 0, mark_px: 0.9, end_time: new Date(Date.now() - 60 * 3600e3).toISOString(), meta: {} }
const eq0 = Array.from({ length: 5003 }, (_, i) => ({ ts: new Date(Date.UTC(2026, 0, 1) + i * 3600e3).toISOString(), equity: 1000 + i, cash: 5, open_value: 0, open_count: 1 }))
fs.writeFileSync(file, JSON.stringify({ start_cash: 1000, cash: 5, strategy: PM, last_scan: null, last_note: null, trades: [held, split, pend, disp], equity: eq0, decisions: [], next_id: 5 }))
const J = (x: unknown) => new Response(JSON.stringify(x), { status: 200 })
;(globalThis as any).fetch = async (u: string) => {
  if (u.includes('/markets/S')) return J({ closed: true, umaResolutionStatus: 'resolved', clobTokenIds: '["TS","TS2"]', outcomePrices: '["0.5","0.5"]' })
  if (u.includes('/markets/Q')) return J({ closed: true, umaResolutionStatus: 'proposed', clobTokenIds: '["TQ","TQ2"]', outcomePrices: '["0.9995","0.0005"]' })
  if (u.includes('/markets/D')) return J({ closed: false, umaResolutionStatus: 'disputed', umaResolutionStatuses: '["proposed","disputed","proposed","disputed"]', clobTokenIds: '["TD","TD2"]', outcomePrices: '["0.9995","0.0005"]' })
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
{ const dp = out.trades.find((t: any) => t.id === 4)
  ok(dp.status === 'OPEN' && dp.pnl == null && dp.meta.pending?.uma === 'disputed' && dp.meta.pending.disputes === 2 && dp.meta.pending.past_end_h >= 59.9, 'a long UMA dispute past its end stays OPEN (no settle on 99.95c), flagged pending/disputed')
  ok(out.trades.filter((t: any) => t.id === 4).length === 1, 'no duplicate row for the disputed position')
  const f: any = { end_time: new Date(Date.now() + 3600e3).toISOString(), meta: { pending: { uma: 'x' } } }
  desk.pendingFlag(f, { umaResolutionStatus: 'proposed' }, Date.now()); ok(f.meta.pending === undefined, 'pendingFlag: before the end -> no flag (stale flag cleared)')
  const g: any = { end_time: new Date(Date.now() - 7200e3).toISOString() }
  desk.pendingFlag(g, {}, Date.now()); ok(g.meta.pending.uma === null && g.meta.pending.disputes === 0 && Math.abs(g.meta.pending.past_end_h - 2) < 0.11, 'pendingFlag: unknown UMA status stays null, not invented')
  ok(/markout\(t, /.test(src) && /m30: markoutStudy\(st\.trades\)/.test(src), 'runner records the pre-resolution markout and publishes st.clv.m30') }
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
// supervisor gates: read-out only
{ const C = (pnl: number, at = '2026-10-16') => ({ status: 'CLOSED', opened_at: at, cost: 50, pnl })
  const lose = [...Array(150).fill(0).map(() => C(4)), ...Array(60).fill(0).map(() => C(-50))]
  const g = gateStudy(lose, '2026-10-15T18:30'); ok(g.n === 210 && g.mean_r! < 0 && g.t! <= -2.5 && g.step_down_hit && g.stop_hit, 'gateStudy flags step-down / stop on a clearly losing record')
  const e = gateStudy([C(4, '2026-10-14')], '2026-10-15T18:30'); ok(e.n === 0 && e.mean_r === null && e.t === null && !e.stop_hit, 'gateStudy: no judged closes -> nulls, no flags')
  const src2 = fs.readFileSync('scripts/pm-desk.ts', 'utf8')
  ok(/\.gates = gateStudy\(/.test(src2) && (src2.match(/\bgates\b/g) ?? []).length === 1, 'runner only publishes st.gates and never reads it') }
ok(nw.strategy === 'fav' && strategyOf(h) === 'fav' && out.by_strategy?.fav?.n >= 1 && out.by_strategy?.fade?.n === 0 && out.by_strategy.fade.wr === null && out.by_strategy.fade.pct_per_usd === null,
  "favourites entries are tagged 'fav' (untagged history counts as 'fav'); per-strategy stats published, missing = null")
ok(!out.trades.some(isFade), 'the 2h favourites market is never a fade candidate (fade needs >= 24h to the end)')
// FADE jump-fade (second PAPER sub-strategy): pure parts
{ const T = Date.parse('2026-10-18T12:00:00Z'), M = 60_000
  ok(fadeSignal([[T - 60 * M, 0.30]], T, 0.50)?.k === 1 && near(fadeSignal([[T - 60 * M, 0.30]], T, 0.50)!.px, 0.5), 'fade: outcome 0 jumped up 20c -> buy outcome 1 (the side that fell) at its price')
  ok(fadeSignal([[T - 60 * M, 0.70]], T, 0.50)?.k === 0, 'fade: outcome 0 fell 20c -> buy outcome 0')
  ok(fadeSignal([[T - 60 * M, 0.35]], T, 0.50)?.k === 1 && fadeSignal([[T - 60 * M, 0.36]], T, 0.50) === null, 'fade: threshold is 15c (as backtested), 14c is no signal')
  ok(fadeSignal([[T - 30 * M, 0.30]], T, 0.50) === null && fadeSignal([[T - 100 * M, 0.30]], T, 0.50) === null, 'fade: the earlier price must be 45-90 min old (hourly points <= 90 min apart)')
  ok(fadeSignal([[T - 60 * M, 0.70]], T, 0.90) === null && fadeSignal([[T - 60 * M, 0.30]], T, 0.10) === null && fadeSignal([[T - 60 * M, 1.0]], T, 0.85)?.k === 0, 'fade: price after the move must be 15-85c')
  ok(fadeSignal(undefined, T, 0.5) === null, 'fade: no history -> no signal')
  ok(fadeSignal([[T - 80 * M, 0.49], [T - 60 * M, 0.30], [T - 50 * M, 0.45]], T, 0.50)?.then === 0.30, 'fade: uses the snapshot closest to 60 min old')
  // no lookahead: a point stamped in the future is never used and never stored
  ok(fadeSignal([[T + 60 * M, 0.30]], T, 0.50) === null && fadeSnap([[T + 60 * M, 0.3]], T, 0.5).every(([t]) => t <= T), 'fade: no lookahead (future-stamped points ignored and dropped)')
  let r = fadeSnap(undefined, T, 0.4); r = fadeSnap(r, T + 5 * M, 0.41); ok(r.length === 1, 'fade snapshots: at most one point per 20 min')
  ok(!fadeDue(r, T + 5 * M) && fadeDue(r, T + 20 * M) && fadeDue(undefined, T), 'fade: signal checked only when a new point is due')
  r = fadeSnap(r, T + 25 * M, 0.42); ok(r.length === 2, 'fade snapshots: a new point after 20 min')
  r = fadeSnap(r, T + 3 * 3600_000, 0.5); ok(r.length === 1 && r[0][1] === 0.5, 'fade snapshots: points older than 2h are dropped')
  let big: [number, number][] | undefined; for (let i = 0; i < 500; i++) big = fadeSnap(big, T + i * 20 * M, 0.5); ok(big!.length <= 7, 'fade snapshot ring stays bounded (<= 7 points)')
  ok(!fadeEligible({ gameStartTime: '2026-10-18' }, 'x') && !fadeEligible({}, 'cs2-a-b-2026-10-18') && !fadeEligible({ sportsMarketType: 'moneyline' }, 'y')
    && !fadeEligible({}, 'highest-temperature-in-nyc') && !fadeEligible({ question: 'Will the price of Bitcoin be above $90,000?' }, 'bitcoin-above-on-october-20-2026')
    && fadeEligible({ question: 'Will X happen by Friday?' }, 'will-x-happen-by-friday'), 'fade universe: non-sports, non-weather, non-crypto only')
  ok(FADE.move === 0.15 && FADE.lo === 0.15 && FADE.hi === 0.85 && FADE.minEndH === 24 && FADE.minVolume === 20000, 'fade parameters = the backtested ones')
  ok(FADE.stakeFrac === PM.stakeFrac && PM.stakeFrac <= 0.03 && PM.maxPosFrac <= 0.05 && PM.maxMatchFrac <= 0.10 && FADE.maxTotalFrac <= 0.2 && FADE.maxPremium <= 0.02, 'fade: 3% stake, <= 5% position, <= 10% event, fade total <= 20%, fill guard <= 2c')
  ok(isFade({ strategy: 'fade' }) && !isFade({}) && strategyOf({ strategy: 'fade' }) === 'fade' && strategyOf({ strategy: 'fav' }) === 'fav', 'strategy tags')
  // kill criterion
  const C = (pnl: number) => ({ strategy: 'fade', status: 'CLOSED', cost: 30, pnl })
  const mix = (w: number, l: number) => [...Array(w).fill(0).map(() => C(30)), ...Array(l).fill(0).map(() => C(-30))]
  ok(!fadeKill(mix(20, 39)).killed && fadeKill(mix(20, 40)).killed, 'fade kill: only after >= 60 closes; losing record at 60 -> killed')
  ok(fadeKill(mix(30, 30)).killed && !fadeKill(mix(31, 29)).killed, 'fade kill: mean r <= 0 kills, mean r > 0 does not')
  ok(!fadeKill([...mix(41, 39), { strategy: 'fav', status: 'CLOSED', cost: 30, pnl: -30 }, ...Array(500).fill(0).map(() => ({ status: 'CLOSED', cost: 30, pnl: -30 }))]).killed && fadeKill([...mix(40, 40), ...Array(500).fill(0).map(() => ({ status: 'CLOSED', cost: 30, pnl: 30 }))]).killed, "fade kill counts fade closes only ('fav' results never rescue or kill it)")
  const sS = stratStats(mix(3, 1)); ok(sS.n === 4 && sS.wins === 3 && near(sS.wr!, 0.75) && near(sS.pnl!, 60) && near(sS.pct_per_usd!, 0.5) && sS.t != null, 'stratStats: n, WR, P&L, %/$, t')
  const src3 = fs.readFileSync('scripts/pm-desk.ts', 'utf8')
  ok(/if \(kill\.killed\)/.test(src3) && !/kill\.killed[^\n]*(stakeFrac|PM\.|freeCash)/.test(src3) && (src3.match(/kill\.killed/g) ?? []).length === 2, 'kill only gates new fade entries (read in the fade block, nowhere else)') }
// fade paper replay on a mocked Polymarket. Markets (all non-sports, ending in 5 days, volume $50k):
// J jumped 30c -> 50c (buy J1 at the 0.51 ask); K jumped but its ask is 0.60 (> observed 0.50 + 2c, skip);
// S is sports (ignored); L jumped and is in J's event (one fade entry per event -> skipped);
// P jumped and its event already holds a $90 'fav' position (10% event cap -> only $10 room).
const runDesk = async (tag: string, f: string, st: any, fetchFn: any) => {
  fs.writeFileSync(f, JSON.stringify(st)); (globalThis as any).fetch = fetchFn
  process.argv[2] = f; console.log = () => {}
  try { await import(`../scripts/pm-desk.ts?${tag}`) } finally { console.log = log }
  return JSON.parse(fs.readFileSync(f, 'utf8'))
}
{ const T0 = Date.now(), f2 = `${dir}/fade.json`, H = (p: number) => [[T0 - 60 * 60_000, p]]
  const end = new Date(T0 + 5 * 86400e3).toISOString()
  const mk = (id: string, extra: any = {}) => ({ id, slug: `will-${id}-happen`, question: `Will ${id} happen?`, acceptingOrders: true, enableOrderBook: true, clobTokenIds: `["${id}0","${id}1"]`, outcomes: '["Yes","No"]', outcomePrices: '["0.50","0.50"]', endDate: end, events: [{ slug: `will-${id}-happen` }], volumeNum: 50000, ...extra })
  const favP = { id: 1, strategy: 'fav', market_id: 'PF', slug: 'pf', event_slug: 'will-P-happen', question: 'P fav?', outcome: 'Yes', token_id: 'PF0', end_time: end, qty: 100, entry_px: 0.9, entry_fee: 0, cost: 90, best_ask: 0.9, opened_at: '2026-10-18T00:00:00Z', status: 'OPEN', mark_px: 0.9, mark_at: '', meta: {} }
  const base = () => ({ start_cash: 1000, cash: 910, strategy: PM, last_scan: null, last_note: null, trades: [{ ...favP }], equity: [], decisions: [], next_id: 2,
    fade_snaps: { J: H(0.30), K: H(0.30), S: H(0.30), L: H(0.30), P: H(0.30) } })
  const fetchA = async (u: string) => {
    if (u.includes('/markets?')) return J(u.includes('end_date_max') || !u.includes('offset=0') ? [] : [mk('J'), mk('K'), mk('S', { gameStartTime: '2026-10-20 18:00:00+00', sportsMarketType: 'moneyline' }), mk('L', { events: [{ slug: 'will-J-happen' }] }), mk('P')])
    if (/token_id=[JLP]1/.test(u)) return J({ bids: [{ price: '0.49', size: '500' }], asks: [{ price: '0.51', size: '1000' }] })
    if (u.includes('token_id=K1')) return J({ bids: [{ price: '0.40', size: '500' }], asks: [{ price: '0.60', size: '1000' }] })
    if (u.includes('token_id=PF0')) return J({ bids: [{ price: '0.9', size: '500' }], asks: [{ price: '0.91', size: '500' }] })
    if (/\/markets\/(J|PF|P)\b/.test(u)) return J({ closed: false, clobTokenIds: u.includes('PF') ? '["PF0","PF1"]' : '["J0","J1"]', outcomePrices: '["0.5","0.5"]' })
    return new Response('no', { status: 500 })
  }
  const o1 = await runDesk('fade1', f2, base(), fetchA), ft = o1.trades.filter(isFade)
  const tj = ft.find((t: any) => t.market_id === 'J'), tp = ft.find((t: any) => t.market_id === 'P')
  ok(!!tj && tj.token_id === 'J1' && near(tj.entry_px, 0.51) && tj.cost <= 30 + 1e-9 && tj.cost > 29 && tj.strategy === 'fade', "fade buys the side that fell at the real ask, 3% of equity, tagged 'fade'")
  ok(o1.decisions.some((d: any) => d.strategy === 'fade' && d.decision === 'skip' && String(d.reason).includes('0.6')), 'fade skips a book whose ask is > 2c above the observed price (entry at the ask)')
  ok(!o1.trades.some((t: any) => t.market_id === 'S') && !(o1.fade_snaps.S?.length > 1), 'fade ignores sports markets')
  ok(!ft.some((t: any) => t.market_id === 'L') && o1.decisions.some((d: any) => d.market_id === 'L' && /לאירוע הזה/.test(d.reason)), 'one fade entry per event: L (same event as J) is skipped')
  ok(!!tp && tp.cost <= 10 + 1e-6 && tp.cost > 9, "10% event cap counts the 'fav' position already on the event ($90 -> fade gets <= $10)")
  ok(near(o1.cash, 910 - ft.reduce((a: number, t: any) => a + t.cost, 0)) && ft.every((t: any) => !t.meta.adds), 'shared cash: cash = before - fade costs; no fade top-ups')
  ok(o1.by_strategy?.fade?.open === 2 && o1.by_strategy.fade.n === 0 && o1.by_strategy.fade.kill?.killed === false && o1.last_note.fade?.entered === 2, 'per-strategy read-out and cycle note published')
  ok(o1.trades.find((t: any) => t.id === 1).strategy === 'fav' && o1.trades.find((t: any) => t.id === 1).status === 'OPEN', "the 'fav' position is untouched")
  const o2 = await runDesk('fade2', f2, { ...o1, fade_snaps: { ...o1.fade_snaps, J: H(0.30), L: H(0.30) } }, fetchA)
  ok(o2.trades.filter(isFade).length === 2, 'fade never re-enters a market / event it already traded')
  // kill: 60 closed fade losses -> no new fade entry, the 'fav' rule still runs (same mocked favourites market as above)
  const dead = Array.from({ length: 60 }, (_, i) => ({ ...favP, id: 100 + i, strategy: 'fade', market_id: `X${i}`, event_slug: `x${i}`, token_id: `X${i}`, status: 'CLOSED', pnl: -30, cost: 30 }))
  const fetchK = async (u: string) => (u.includes('/markets?') && u.includes('end_date_max') && u.includes('offset=0') ? J([{ id: 'N', slug: 'n', question: 'New?', acceptingOrders: true, enableOrderBook: true, clobTokenIds: '["A","B"]', outcomes: '["Yes","No"]', outcomePrices: '["0.88","0.12"]', endDate: new Date(Date.now() + 7200e3).toISOString(), events: [{ slug: 'en' }] }])
    : u.includes('token_id=A') ? J({ bids: [{ price: '0.87', size: '500' }], asks: [{ price: '0.88', size: '1000' }] }) : u.includes('token_id=B') ? J({ bids: [], asks: [{ price: '0.13', size: '1000' }] }) : fetchA(u))
  const o3 = await runDesk('fade3', f2, { ...base(), trades: [{ ...favP }, ...dead], next_id: 200 }, fetchK)
  ok(!o3.trades.some((t: any) => isFade(t) && t.status === 'OPEN') && o3.last_note.fade?.killed === true && o3.by_strategy.fade.kill.killed && o3.decisions.some((d: any) => d.strategy === 'fade' && /עצירה/.test(d.reason)), 'kill switch: no new fade entries after 60 losing closes')
  const fv = o3.trades.find((t: any) => t.token_id === 'A'); ok(!!fv && fv.strategy === 'fav' && near(o3.decisions.find((d: any) => d.market_id === 'N' && d.decision === 'BUY').price, 0.88) && o3.decisions.some((d: any) => d.market_id === 'N' && d.decision === 'ADD') && fv.cost <= PM.maxPosFrac * (910 + 90) + 1e-6, "kill switch never stops the 'fav' rule (it still enters at 0.88 and tops up, <= 5%)") }
console.log(`pm desk: ${n - bad}/${n} passed`)
if (bad) process.exit(1)

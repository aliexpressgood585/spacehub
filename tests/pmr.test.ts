// "פולי תגמולים": reward scoring, quote placement, tape fills and inventory accounting of the liquidity-rewards paper desk.
import fs from 'node:fs'
import { PMR, S, qMin, midAdj, bookQ, share, quotePx, yesTrade, fillQuote, onBidFill, onAskFill, eligible, sizeFor, pickMarkets, lockOf, clampQueue, walkSell, noBids,
  samplesBetween, payout, takerFee, SHADOW, CONS, shareCons, markout, legsOf, diffQuote, dayBrake, gapBrake, type Book } from '../shared/pmr.ts'
let n = 0, bad = 0
const ok = (c: boolean, m: string) => { n++; if (!c) { bad++; console.error('FAIL', m) } }
const near = (a: number, b: number, e = 1e-9) => Math.abs(a - b) < e

ok(near(S(3, 0), 1) && near(S(3, 1.5), 0.25) && S(3, 3) === 0 && S(3, 4) === 0, 'S(v,s) = ((v-s)/v)^2 inside the band, 0 outside')
ok(near(S(3, -1), 1), 'an order past the midpoint scores as at the midpoint (never above 1)')
ok(near(qMin(90, 0, 0.5), 30) && near(qMin(90, 60, 0.5), 60) && qMin(90, 0, 0.95) === 0, 'Q_min: one-sided /3 inside 0.10-0.90, two-sided only outside')

const b: Book = { bids: [{ price: 0.49, size: 300 }, { price: 0.48, size: 500 }], asks: [{ price: 0.51, size: 300 }, { price: 0.52, size: 500 }], tick: 0.01 }
ok(near(midAdj(b, 200), 0.5), 'adjusted midpoint')
const thin: Book = { bids: [{ price: 0.56, size: 5 }, { price: 0.40, size: 300 }], asks: [{ price: 0.94, size: 20 }, { price: 0.60, size: 300 }].sort((a, c) => a.price - c.price), tick: 0.01 }
ok(near(midAdj(thin, 200), 0.5), 'a 5-share order does not move the adjusted midpoint')
// others: each side 300 x ((3-1)/3)^2 = 133.3 (the 500-share levels at 2c score 500/9 = 55.6)
ok(near(bookQ(b, 3, 200), 300 * 4 / 9 + 500 / 9, 1e-6), 'everyone else\'s Q from the real book')
const q = { px: 0.49, size: 300, queue: 0, at: 0 }
ok(share(b, 3, 200, q, { ...q, px: 0.51 }) > 0.4, 'equal size at the touch -> a large share')
ok(share(b, 3, 200, { ...q, size: 100 }, { ...q, px: 0.51, size: 100 }) === 0, 'below min size scores nothing')

const px = quotePx(b, 3, 200)
ok(px.bid === 0.49 && px.ask === 0.51, 'join the best bid / best ask')
const wide: Book = { bids: [{ price: 0.30, size: 500 }], asks: [{ price: 0.70, size: 500 }], tick: 0.01 }
const w = quotePx(wide, 4, 100)
ok(w.bid === 0.48 && w.ask === 0.52, `outside the band -> half the band from the midpoint (${w.bid}/${w.ask})`)
ok(w.bid < w.ask, 'never crosses')

// tape fills: NO buy at 0.52 = YES sell at 0.48 (hits YES bids)
const t1 = yesTrade({ side: 'BUY', outcomeIndex: 1, price: 0.52, size: 50, timestamp: 10 })
ok(t1.side === 'sell' && near(t1.px, 0.48), 'NO buy = YES sell at 1-p')
ok(yesTrade({ side: 'SELL', outcomeIndex: 1, price: 0.4, size: 1, timestamp: 1 }).side === 'buy', 'NO sell = YES buy')
const bq = { px: 0.49, size: 100, queue: 80, at: 5 }
ok(fillQuote(bq, 'bid', [{ side: 'sell', px: 0.49, size: 50, ts: 6 }]).filled === 0, 'trade at our price eats the queue ahead first')
const f2 = fillQuote(bq, 'bid', [{ side: 'sell', px: 0.49, size: 120, ts: 6 }])
ok(f2.filled === 40 && f2.queue === 0, 'then fills us')
ok(fillQuote(bq, 'bid', [{ side: 'sell', px: 0.47, size: 500, ts: 6 }]).filled === 100, 'a trade through our price fills us (capped at our size)')
ok(fillQuote(bq, 'bid', [{ side: 'sell', px: 0.47, size: 500, ts: 4 }]).filled === 0, 'trades before the quote went up do not count')
ok(fillQuote(bq, 'bid', [{ side: 'buy', px: 0.40, size: 500, ts: 6 }]).filled === 0, 'buyers do not hit a bid')
ok(fillQuote({ px: 0.51, size: 100, queue: 0, at: 0 }, 'ask', [{ side: 'buy', px: 0.52, size: 30, ts: 1 }]).filled === 30, 'buyer through the ask fills it')

// inventory: bid fill 100 @0.49 then ask fill 100 @0.51 -> a merged pair, +2c x 100 = +$2
const inv = { yes: 0, no: 0, cash: 0 }
onBidFill(inv, 0.49, 100); ok(inv.yes === 100 && near(inv.cash, -49), 'bid fill buys YES')
const m = onAskFill(inv, 0.51, 100)
ok(m === 100 && inv.yes === 0 && inv.no === 0 && near(inv.cash, 2), 'ask fill = NO bought at 1-p, merged into $1: the spread is earned')

const now = Date.parse('2026-10-23T00:00:00Z')
ok(eligible({ mid: 0.5, end: '2026-11-01', spreadC: 2, v: 3 }, now) === null, 'eligible')
ok(eligible({ mid: 0.9, end: '2026-11-01', spreadC: 2, v: 3 }, now) === 'mid', 'mid near 1 excluded')
ok(eligible({ mid: 0.5, end: '2026-10-24', spreadC: 2, v: 3 }, now) === 'end', 'too close to the end excluded')
ok(sizeFor(200, 0.49, 0.51) === 204, 'size per side fits the budget (YES bid + NO bid ~ $0.98 a pair)')
ok(PMR.startCash === 1000 && PMR.maxMarkets === 5, '$1,000 paper account, 5 markets')


// realism: collateral, queue, exits through the book, minute samples, daily payout with the $1 floor
ok(near(lockOf('bid', 0.4, 100, 0), 40) && near(lockOf('ask', 0.6, 100, 0), 40) && lockOf('ask', 0.6, 100, 100) === 0 && near(lockOf('ask', 0.6, 100, 30), 28), 'order collateral: YES bid px, ask = held YES or NO bid 1-px')
ok(clampQueue(80, 50) === 50 && clampQueue(30, 50) === 30, 'queue ahead shrinks with cancels, never grows')
const ws = walkSell([{ price: 0.5, size: 60 }, { price: 0.45, size: 100 }], 100, null)
ok(near(ws.proceeds, 30 + 18) && ws.unfilled === 0, 'exit walks the bid ladder')
ok(walkSell([{ price: 0.5, size: 10 }], 30, null).unfilled === 20, 'shares the book cannot absorb are unfilled ($0)')
ok(near(walkSell([{ price: 0.5, size: 100 }], 100, { rate: 0.02, exponent: 1 }).fee, takerFee(100, 0.5, { rate: 0.02, exponent: 1 })) && takerFee(100, 0.5, { rate: 0.02, exponent: 1 }) > 0, 'taker fee on fee markets')
ok(near(noBids(b)[0].price, 0.49), 'NO bids mirror YES asks')
const m0 = Date.parse('2026-10-23T10:00:30Z')
ok(samplesBetween(m0, m0 + 15000) === 0 && samplesBetween(m0, m0 + 45000) === 1 && samplesBetween(m0, m0 + 3600000) === 3 && samplesBetween(0, m0) === 0, 'one reward sample per minute boundary, stalls capped')
const po = payout({ a: 5.2, b: 0.7, c: 1 })
ok(near(po.paid, 6.2) && near(po.dropped, 0.7), 'daily payout: a market-day below $1 is not paid')
const dsrc = fs.readFileSync(new URL('../scripts/pmr-desk.ts', import.meta.url), 'utf8')
ok(/st\.pending\[cid\]/.test(dsrc) && !/st\.cash \+= earn/.test(dsrc), 'rewards wait for the 00:00 UTC payout (not credited to cash at once)')
ok(/free >= lockOf\('bid'/.test(dsrc) && /free >= lockOf\('ask'/.test(dsrc), 'quotes across markets cannot lock more than the free cash')

// selection with hysteresis: drop first, refill freed slots in the same scan, keep a market through a noisy dip
const cs = (ys: number[]) => ys.map((y, i) => ({ cid: 'm' + i, yld: y }))
const p1 = pickMarkets(cs([0.3, 0.29, 0.28, 0.27, 0.26, 0.25, 0.2, 0.1]), ['m7', 'm6', 'x'])
ok(p1.keep.join() === 'm6' && p1.drop.sort().join() === 'm7,x' && p1.select.length === 4 && p1.select[0] === 'm0', 'weak and vanished markets dropped, freed slots refilled at once')
ok(pickMarkets(cs([0.3, 0.29, 0.28, 0.27, 0.26, 0.14]), ['m5']).keep.join() === 'm5', 'a market at >= half the 5th-best yield is kept (no switch on one snapshot)')
ok(pickMarkets(cs([0.3, 0.29, 0.28, 0.27, 0.26]), ['m0', 'm1', 'm2', 'm3', 'm4']).select.length === 0, 'no selection beyond the market cap')
ok(pickMarkets(cs([0.002]), []).select.length === 0, 'below the minimum yield nothing is selected')
const wf = fs.readFileSync(new URL('../.github/workflows/pmr-desk.yml', import.meta.url), 'utf8')
ok(/cp shared\/pmr\.ts/.test(wf) && /concurrency:\s*\n\s*group: pmr-desk/.test(wf), 'workflow copies its module and has its own concurrency group')
const src = fs.readFileSync(new URL('../scripts/pmr-desk.ts', import.meta.url), 'utf8')
ok(!/\/order\b|POST[^\n]*order|privateKey|apiKey/i.test(src), 'paper only: no order endpoint, no keys')

// conservative line
const qq = { px: 0.49, size: 300, queue: 0, at: 0 }, aq = { ...qq, px: 0.51 }
ok(shareCons(b, 3, 200, qq, aq) < share(b, 3, 200, qq, aq) && shareCons(b, 3, 200, qq, aq) > 0, 'conservative share is below the paper share')
const empty: Book = { bids: [{ price: 0.49, size: 5 }], asks: [{ price: 0.51, size: 5 }], tick: 0.01 }
ok(near(share(empty, 3, 200, qq, aq), 1) && near(shareCons(empty, 3, 200, qq, aq), 1 / (1 + CONS.competitors)), 'an empty pool: paper 100%, conservative 50% with one competitor')
ok(near(markout('bid', 0.49, 100, 0.45), -4) && near(markout('ask', 0.51, 100, 0.55), -4) && near(markout('bid', 0.49, 100, 0.52), 3), 'markout sign: price moving against the fill loses')
// shadow account: intents in Polymarket's own terms, brakes
const bidL = legsOf('bid', 0.49, 30, 0)
ok(bidL.length === 1 && bidL[0].token === 'YES' && bidL[0].side === 'BUY' && bidL[0].px === 0.49 && bidL[0].size === 30, 'a YES bid = BUY YES at px')
const askL = legsOf('ask', 0.51, 30, 10)
ok(askL.length === 2 && askL[0].side === 'SELL' && askL[0].token === 'YES' && askL[0].size === 10 && askL[1].token === 'NO' && askL[1].side === 'BUY' && near(askL[1].px, 0.49) && askL[1].size === 20,
  'a YES ask = SELL the held YES, the rest as BUY NO at 1 - px')
const rest = { px: 0.49, size: 30, queue: 5, at: 1 }
ok(diffQuote(rest, rest, 'bid', 0).length === 0, 'unchanged quote -> no intent (keeps the queue place)')
const mv = diffQuote(rest, { ...rest, px: 0.48 }, 'bid', 0)
ok(mv.length === 2 && mv[0].action === 'CANCEL' && mv[0].px === 0.49 && mv[1].action === 'PLACE' && mv[1].px === 0.48, 'moved quote -> cancel old, place new')
ok(diffQuote(rest, null, 'bid', 0).map((x) => x.action).join() === 'CANCEL' && diffQuote(null, rest, 'bid', 0).map((x) => x.action).join() === 'PLACE', 'pull / new quote')
ok(dayBrake(94.9, 100) && !dayBrake(95.1, 100) && !dayBrake(50, 0), 'day brake at -5% from the UTC-day start')
ok(gapBrake(1000, 1000 + 91_000) && !gapBrake(1000, 1000 + 60_000) && !gapBrake(0, 5e12), 'disconnect brake after > 90 s')
ok(SHADOW.startCash === 100 && SHADOW.maxMarkets * 20 * 1.02 < SHADOW.startCash, 'the $100 account can meet the common 20-share minimum in every market')
ok(/PMR_SHADOW=1[^\n]*shadow\.json/.test(wf), 'workflow runs the shadow account into its own state file')
console.log(`pmr: ${n - bad}/${n} passed`)
if (bad) process.exit(1)

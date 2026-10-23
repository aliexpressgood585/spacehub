// "פולי תגמולים": reward scoring, quote placement, tape fills and inventory accounting of the liquidity-rewards paper desk.
import fs from 'node:fs'
import { PMR, S, qMin, midAdj, bookQ, share, quotePx, yesTrade, fillQuote, onBidFill, onAskFill, eligible, sizeFor, type Book } from '../shared/pmr.ts'
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

const wf = fs.readFileSync(new URL('../.github/workflows/pmr-desk.yml', import.meta.url), 'utf8')
ok(/cp shared\/pmr\.ts/.test(wf) && /concurrency:\s*\n\s*group: pmr-desk/.test(wf), 'workflow copies its module and has its own concurrency group')
const src = fs.readFileSync(new URL('../scripts/pmr-desk.ts', import.meta.url), 'utf8')
ok(!/\/order\b|POST[^\n]*order|privateKey|apiKey/i.test(src), 'paper only: no order endpoint, no keys')

console.log(`pmr: ${n - bad}/${n} passed`)
if (bad) process.exit(1)

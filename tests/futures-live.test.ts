import assert from 'node:assert/strict'
import {
  applyBinanceFrame, applyOkxFrame, applyPremiumIndex, binanceBookUrls, binanceMarkUrl, binanceStreams, bracketFor,
  decodeStateBody, fundingLeft, positionLive, saneMark, type Quote,
} from '../trading-app/src/futuresMath.ts'

const book = (): Record<string, Quote> => ({})

const mark = { stream: 'btcusdt@markPrice@1s', data: { e: 'markPriceUpdate', E: 1792323658000, s: 'BTCUSDT', p: '82030.10', r: '0.00010000', T: 1792339200000 } }
const bid = { stream: 'btcusdt@bookTicker', data: { e: 'bookTicker', E: 1792323658485, s: 'BTCUSDT', b: '82030.00', a: '82030.10' } }
const last = { stream: 'btcusdt@miniTicker', data: { e: '24hrMiniTicker', E: 1792323659000, s: 'BTCUSDT', c: '82030.20', o: '81000' } }

const b = book()
assert.equal(applyBinanceFrame(b, mark, 1), 'BTCUSDT')
assert.equal(b.BTCUSDT.mark, 82030.1)
assert.equal(b.BTCUSDT.funding, 0.0001)
assert.equal(b.BTCUSDT.nextFunding, 1792339200000)
assert.equal(applyBinanceFrame(b, bid, 2), 'BTCUSDT')
assert.equal(b.BTCUSDT.bid, 82030)
assert.equal(b.BTCUSDT.ask, 82030.1)
assert.equal(b.BTCUSDT.mark, 82030.1, 'book ticker does not wipe the mark')
assert.equal(applyBinanceFrame(b, last, 3), 'BTCUSDT')
assert.equal(b.BTCUSDT.last, 82030.2)
assert.equal(applyBinanceFrame(b, { event: 'subscribe' }, 4), null)

const ok = book()
assert.equal(applyOkxFrame(ok, { arg: { channel: 'tickers', instId: 'ETH-USDT-SWAP' }, data: [{ instId: 'ETH-USDT-SWAP', last: '3000.1', bidPx: '3000', askPx: '3000.2', ts: '10' }] }, 1), 'ETHUSDT')
assert.equal(ok.ETHUSDT.bid, 3000)
assert.equal(applyOkxFrame(ok, { arg: { channel: 'mark-price', instId: 'ETH-USDT-SWAP' }, data: [{ instId: 'ETH-USDT-SWAP', markPx: '3000.5', ts: '11' }] }, 2), 'ETHUSDT')
assert.equal(ok.ETHUSDT.mark, 3000.5)
assert.equal(ok.ETHUSDT.last, 3000.1)
assert.equal(applyOkxFrame(ok, { arg: { channel: 'funding-rate', instId: 'ETH-USDT-SWAP' }, data: [{ instId: 'ETH-USDT-SWAP', fundingRate: '-0.0002', fundingTime: '1792339200000' }] }, 3), 'ETHUSDT')
assert.equal(ok.ETHUSDT.funding, -0.0002)
assert.equal(ok.ETHUSDT.nextFunding, 1792339200000)
assert.equal(applyOkxFrame(ok, { event: 'subscribe', arg: { channel: 'tickers' } }, 4), null)

const rest = book()
assert.equal(applyPremiumIndex(rest, [{ symbol: 'SOLUSDT', markPrice: '180.5', lastFundingRate: '0.0001', nextFundingTime: 1792339200000, time: 5 }, { symbol: 'DOGEUSDT', markPrice: '0.1', lastFundingRate: '0', nextFundingTime: 1, time: 5 }], 9, new Set(['SOLUSDT'])), 1)
assert.equal(rest.SOLUSDT.mark, 180.5)
assert.equal(rest.DOGEUSDT, undefined)

const streams = binanceStreams(['BTCUSDT', 'ETHUSDT'])
assert.ok(streams.startsWith('btcusdt@markPrice@1s/btcusdt@bookTicker/btcusdt@miniTicker/'))
assert.ok(streams.includes('ethusdt@markPrice@1s'))
assert.ok(binanceMarkUrl(['BTCUSDT']).includes('/market/stream?streams=btcusdt@markPrice@1s/btcusdt@miniTicker'))
assert.deepEqual(binanceBookUrls(['BTCUSDT']).map((u) => u.split('?')[0]), [
  'wss://fstream.binance.com/public/stream',
  'wss://fstream.binance.com/stream',
])

assert.equal(saneMark(100, 5000), 100)
assert.equal(saneMark(100, 150), 150)
assert.equal(saneMark(0, 150), 150)

const long = positionLive({ symbol: 'BTCUSDT', side: 'LONG', qty: 0.01, entry: 100000, isolated_margin: 100, leverage: 3, liq: 90000 }, 101000)
assert.equal(long.upnl, 10)
assert.equal(long.roe, 0.1)
assert.ok(Math.abs(long.marginRatio - (1010 * 0.004) / 110) < 1e-12)
assert.ok(Math.abs((long.dist ?? 0) - (101000 - 90000) / 101000) < 1e-12)

const short = positionLive({ symbol: 'ETHUSDT', side: 'SHORT', qty: 1, entry: 100, isolated_margin: 20, leverage: 3, liq: 130 }, 99)
assert.equal(short.upnl, 1)
assert.equal(short.roe, 0.05)
assert.ok(Math.abs((short.dist ?? 0) - (130 - 99) / 99) < 1e-12)

const bnb = positionLive({ symbol: 'BNBUSDT', side: 'LONG', qty: 15, entry: 1000, isolated_margin: 1000, leverage: 3, liq: 800 }, 1000)
assert.equal(bracketFor('BNBUSDT', 15000).mmr, 0.006)
assert.equal(bracketFor('BNBUSDT', 15000).cum, 10)
assert.ok(Math.abs(bnb.marginRatio - (15000 * 0.006 - 10) / 1000) < 1e-12)
assert.equal(bracketFor('BTCUSDT', 10).mmr, 0.004)

const liveTable = positionLive({ symbol: 'BTCUSDT', side: 'LONG', qty: 1, entry: 100, isolated_margin: 50, mmr: 0.5, cum: 0 }, 100, { BTCUSDT: [{ floor: 0, cap: 1e9, mmr: 0.01, cum: 1 }] })
assert.ok(Math.abs(liveTable.marginRatio - (100 * 0.01 - 1) / 50) < 1e-12, 'snapshot brackets beat the frozen mmr field')

assert.equal(fundingLeft(1_000 + 3661_000, 1_000), '1:01:01')
assert.equal(fundingLeft(null, 1), '—')
assert.equal(fundingLeft(500, 1_000), '0:00:00')

const raw = decodeStateBody('{"wallet":10000,"paper":true}')
assert.equal(raw.wallet, 10000)
const wrapped = decodeStateBody(JSON.stringify({ encoding: 'base64', content: Buffer.from('{"wallet":42,"paper":true}').toString('base64') }))
assert.equal(wrapped.wallet, 42)
assert.equal(wrapped.paper, true)

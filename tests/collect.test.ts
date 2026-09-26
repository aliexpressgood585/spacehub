import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseForceOrder, parseOkxLiqs, parseInstrument, summarizeOptions, lastDvol, coinsIn, parseRssItems, bucket5m, binanceCoin } from '../shared/collect.ts'
// v96.0 forward data collection: parsers are total and label sides correctly
const fo = (s: string, S: string, ap = '100', z = '2') => ({ e: 'forceOrder', o: { s, S, p: '99', ap, q: '3', z, T: 1790459354806 } })
const l1 = parseForceOrder(fo('BTCUSDT', 'SELL'))!
assert.equal(l1.side, 'long', 'SELL order = a LONG was liquidated'); assert.equal(l1.usd, 200); assert.equal(l1.symbol, 'BTC')
assert.equal(parseForceOrder(fo('ETHUSDT', 'BUY'))!.side, 'short', 'BUY order = a SHORT was liquidated')
const pe = parseForceOrder(fo('1000PEPEUSDT', 'SELL', '0.004', '1000'))!
assert.equal(pe.symbol, 'PEPE'); assert.ok(Math.abs(pe.px - 0.000004) < 1e-12 && pe.qty === 1e6 && Math.abs(pe.usd - 4) < 1e-9, '1000PEPE per ONE coin, usd unchanged')
assert.equal(parseForceOrder(fo('BTCUSDT', 'SELL', '0', '0'))!.px, 99, 'no avg price -> order price, no filled qty -> original qty')
assert.equal(parseForceOrder({ o: { s: 'BTCUSD_PERP', S: 'SELL', ap: 1, z: 1, T: 1 } }), null, 'coin-margined ignored')
assert.equal(parseForceOrder(null), null); assert.equal(parseForceOrder({ o: { s: 'BTCUSDT', S: 'X', ap: 1, z: 1, T: 1 } }), null)
assert.deepEqual(binanceCoin('BTCUSDC'), null)
const okx = { code: '0', data: [{ instId: 'BTC-USDT-SWAP', details: [
  { bkPx: '84000', sz: '10', posSide: 'short', side: 'buy', ts: '1790459354806' },
  { bkPx: '84100', sz: '2', posSide: '', side: 'sell', ts: '1790459354807' },
  { bkPx: 'x', sz: '2', posSide: 'long', ts: '1' }] }, { instId: 'BTC-USDT-250926', details: [{ bkPx: '1', sz: '1', ts: '1' }] }] }
const ol = parseOkxLiqs(okx, 'BTC', 0.01)
assert.equal(ol.length, 2, 'bad row and delivery contract dropped')
assert.equal(ol[0].side, 'short'); assert.equal(ol[0].qty, 0.1, 'contracts x ctVal'); assert.equal(ol[0].usd, 8400)
assert.equal(ol[1].side, 'long', 'net mode: sell = long liquidated')
assert.deepEqual(parseOkxLiqs({ code: '50011' }, 'BTC', 0.01), []); assert.deepEqual(parseOkxLiqs(okx, 'BTC', NaN), [], 'unknown ctVal -> nothing (never guessed)')
const ins = parseInstrument('BTC-28SEP26-88000-P')!
assert.equal(ins.type, 'P'); assert.equal(ins.strike, 88000); assert.equal(ins.expMs, Date.UTC(2026, 8, 28, 8))
assert.equal(parseInstrument('XRP_USDC-27MAR26-2d5-C')?.strike, undefined, 'unknown format dropped, not thrown')
assert.equal(parseInstrument('BTC-PERPETUAL'), null)
const NOW = Date.UTC(2026, 8, 26, 22)
const row = (name: string, iv: number, oi = 1, vol = 0) => ({ instrument_name: name, mark_iv: iv, open_interest: oi, volume: vol, underlying_price: 100000 })
const book = [row('BTC-28SEP26-100000-C', 99, 5), row('BTC-9OCT26-100000-C', 40, 10, 3), row('BTC-9OCT26-100000-P', 42, 20, 1),
  row('BTC-9OCT26-90000-P', 50, 7), row('BTC-9OCT26-110000-C', 38, 3), row('BTC-9OCT26-95000-P', 45)]
const sm = summarizeOptions('BTC', book, NOW)!
assert.equal(sm.expiry, '9OCT26', 'nearest expiry at least 7 days out'); assert.equal(sm.atm_iv, 41)
assert.equal(sm.iv_put10, 50); assert.equal(sm.iv_call10, 38); assert.equal(sm.skew10, 12, 'put skew in vol points')
assert.equal(sm.call_oi, 18); assert.equal(sm.put_oi, 28); assert.ok(Math.abs(sm.pc_oi - 28 / 18) < 1e-12)
assert.equal(summarizeOptions('BTC', [], NOW), null)
assert.equal(lastDvol({ result: { data: [[1, 1, 1, 1, 34.8], [2, 1, 1, 1, 34.9]] } }), 34.9); assert.ok(Number.isNaN(lastDvol({})))
assert.deepEqual(coinsIn('Bitcoin slides as ETH ETF outflows grow'), ['BTC', 'ETH'])
assert.deepEqual(coinsIn('Optimism upgrade; users opt in to OP rewards'), ['OP'], 'ambiguous ticker needs the name')
assert.deepEqual(coinsIn('A near miss for the market'), [], 'plain English "near" is not NEAR')
assert.deepEqual(coinsIn('$SOL and Solana DEX volumes'), ['SOL'])
const xml = '<rss><item><title><![CDATA[XRP jumps 10%]]></title><link>https://x/1</link><pubDate>Sat, 26 Sep 2026 20:00:00 GMT</pubDate></item><item><title>no date</title><link>https://x/2</link></item></rss>'
const ni = parseRssItems(xml, 'test')
assert.equal(ni.length, 1); assert.deepEqual(ni[0].coins, ['XRP']); assert.equal(ni[0].published_at, Date.UTC(2026, 8, 26, 20))
assert.equal(bucket5m(Date.UTC(2026, 8, 26, 20, 7, 31)), Date.UTC(2026, 8, 26, 20, 5))
// the collector must never write trading state
const src = readFileSync('supabase/functions/data-collector/index.ts', 'utf8')
assert.ok(!/bot_state|bot_trades|bot_equity/.test(src), 'collector never touches trading tables')
const mig = readFileSync('supabase/migrations/20260926230000_market_collectors.sql', 'utf8')
for (const t of ['mkt_liquidations', 'mkt_derivs', 'mkt_options', 'mkt_news']) assert.ok(mig.includes(t), t)
assert.ok(/enable row level security/.test(mig), 'RLS on')
console.log('collect: all assertions passed')

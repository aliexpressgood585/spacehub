import assert from 'node:assert/strict'
import { UNIV, buildUniverse, scanSlice, FALLBACK } from '../shared/universe.ts'
import { CRYPTO_40 } from '../shared/strategy.ts'

const now = 1_800_000_000_000, old = now - 30 * 86_400_000
const sym = (base: string, extra: any = {}) => ({ symbol: `${base}USDT`, baseAsset: base, quoteAsset: 'USDT', contractType: 'PERPETUAL', status: 'TRADING', underlyingType: 'COIN', underlyingSubType: ['Layer-1'], onboardDate: old, ...extra })
const ex = { symbols: [
  sym('BTC'), sym('TAO'), { ...sym('1000PEPE') }, { ...sym('1000SHIB') },
  sym('TSLA', { underlyingType: 'EQUITY' }), sym('XAU', { underlyingSubType: ['Metal'] }), sym('NVDA'), sym('USDC'),
  sym('BTCDOM', { underlyingType: 'INDEX' }), sym('DEAD', { status: 'SETTLING' }), sym('NEWX', { onboardDate: now - 86_400_000 }),
  sym('THIN'), sym('WIDE'), sym('NODATA'), { ...sym('ETH'), symbol: 'ETHUSDT_260327', contractType: 'CURRENT_QUARTER' },
  { ...sym('ETH'), quoteAsset: 'USDC', symbol: 'ETHUSDC' }, sym('AI', { underlyingSubType: ['AI'] }),
] }
const liquid = (s: string, qv = 5e8) => ({ symbol: s, quoteVolume: String(qv) })
const book = (s: string, bid = 100, ask = 100.02) => ({ symbol: s, bidPrice: String(bid), askPrice: String(ask) })
const tk = ['BTCUSDT', 'TAOUSDT', '1000PEPEUSDT', '1000SHIBUSDT', 'TSLAUSDT', 'XAUUSDT', 'NVDAUSDT', 'USDCUSDT', 'BTCDOMUSDT', 'DEADUSDT', 'NEWXUSDT', 'WIDEUSDT', 'AIUSDT'].map((s) => liquid(s)).concat([liquid('THINUSDT', 1e6)])
const bk = tk.map((t) => book(t.symbol, 100, t.symbol === 'WIDEUSDT' ? 100.5 : 100.02))
const r = buildUniverse(ex, tk, bk, now)
const got = r.pairs.map((p) => p.sym)
assert.deepEqual(got, ['1000SHIB', 'AI', 'BTC', 'PEPE', 'TAO'], `universe: ${got}`)
assert.equal(r.pairs.find((p) => p.sym === 'PEPE')!.k, 1000, '1000PEPE keeps the per-ONE-coin legacy unit')
assert.equal(r.pairs.find((p) => p.sym === '1000SHIB')!.k, 1, 'other 1000-unit contracts trade in contract units')
assert.equal(r.listed, 15, 'only USDT perpetuals are counted as listed (quarterly and USDC contracts are not)')
assert.equal(r.excluded.not_crypto, 4, 'equity, metal, a known stock ticker and an index product are refused (standing rule 2)')
assert.equal(r.excluded.stablecoin, 1); assert.equal(r.excluded.not_trading, 1); assert.equal(r.excluded.too_new, 1)
assert.equal(r.excluded.illiquid, 1); assert.equal(r.excluded.wide_spread, 1); assert.equal(r.excluded.no_data, 1)
// the index product is excluded by underlyingType
assert.ok(!got.includes('BTCDOM'))
// no preference by name recognition: a pinned coin gets no special treatment in the filter
{ const onlyPinned = buildUniverse({ symbols: [sym('BTC')] }, [liquid('BTCUSDT', 1e6)], [book('BTCUSDT')], now); assert.equal(onlyPinned.pairs.length, 0, 'BTC below the liquidity bar is dropped like anything else') }
assert.equal(UNIV.minQuoteVol, 20_000_000); assert.equal(UNIV.maxSpreadBps, 10)

// rotation: held + BTC always, then a slice; over enough minutes every pair is visited, evenly
{ const U = Array.from({ length: 250 }, (_, i) => `C${String(i).padStart(3, '0')}`).concat(['BTC']).sort()
  const a = scanSlice(U, ['C007', 'C100'], 0, 60)
  assert.equal(a.length, 60); assert.deepEqual(a.slice(0, 3), ['C007', 'C100', 'BTC'])
  const seen = new Map<string, number>()
  for (let m = 0; m < 50; m++) for (const s of scanSlice(U, [], m, 60)) seen.set(s, (seen.get(s) ?? 0) + 1)
  assert.equal(seen.size, U.length, 'every pair is evaluated within the cycle')
  const counts = [...seen.entries()].filter(([s]) => s !== 'BTC').map(([, v]) => v)
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 2, 'rotation is even — no favourites')
  assert.deepEqual(scanSlice(['A', 'B'], [], 3, 60), ['A', 'B'], 'small universe: everything, every minute')
  assert.equal(scanSlice(U, Array.from({ length: 70 }, (_, i) => `H${i}`), 5, 60).length, 71, 'held coins are never dropped for budget') }
assert.equal(FALLBACK.length, 40); assert.deepEqual(FALLBACK.map((p) => p.sym), [...CRYPTO_40]); assert.equal(FALLBACK.find((p) => p.sym === 'PEPE')!.s, '1000PEPEUSDT')
console.log('Universe v88.0: listing, crypto-only, liquidity, data validity, units, even rotation, fallback passed')

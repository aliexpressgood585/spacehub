// Universe for the coin desks: every Binance USDT perp with a crypto OKX swap (shared/binperps.ts). Offline.
import fs from 'node:fs'
import { okxCandidates, isCryptoBase, perpBases, matchOkx, liquid, liqCheck, universeDue, BP } from '../shared/binperps.ts'
let n = 0, bad = 0
const ok = (c: boolean, m: string) => { n++; if (!c) { bad++; console.log('FAIL', m) } }
ok(okxCandidates('1000PEPE').join() === '1000PEPE,PEPE' && okxCandidates('BTC').join() === 'BTC' && okxCandidates('1MBABYDOGE').at(-1) === 'BABYDOGE', '1000x prefixes map to the OKX per-coin name')
ok(!isCryptoBase('USDC') && !isCryptoBase('XAU') && !isCryptoBase('TSLA') && isCryptoBase('SOL'), 'stablecoins / metals / stocks dropped')
const pb = perpBases(['BTCUSDT', 'BTCUSDT_250627', 'ETHUSDC', 'XAUUSDT', 'USDCUSDT', '1000PEPEUSDT', 'SOLUSDT', 'SOLUSDT'])
ok(pb.join() === '1000PEPE,BTC,SOL', 'perpBases: USDT perpetuals only, crypto, deduplicated')
const m = matchOkx(['ETH', '1000PEPE', 'BTC', 'NOOKX', 'PEPE'], new Set(['BTC', 'ETH', 'PEPE']))
ok(m.coins[0].sym === 'BTC' && m.coins.some((c) => c.bin === '1000PEPE' && c.sym === 'PEPE'), 'BTC first; 1000PEPE trades as OKX PEPE')
ok(m.coins.filter((c) => c.sym === 'PEPE').length === 1, 'one OKX swap is never traded under two Binance names')
ok(m.no_okx.join() === 'NOOKX', 'a Binance perp without an OKX swap is reported, not guessed')
ok(liquid({ vol: 50e6, bid: 100, ask: 100.05 }) && !liquid({ vol: 5e6, bid: 100, ask: 100.05 }) && !liquid({ vol: 50e6, bid: 100, ask: 100.5 }) && !liquid(undefined), 'liquidity: volume and spread floors')
ok(liqCheck({ vol: 20e6, bid: 1, ask: 1.0001 }).ok && !liqCheck(undefined).ok, 'liqCheck row mirrors liquid()')
const now = Date.parse('2026-10-17T00:00:00Z')
ok(universeDue(null, now) && !universeDue({ at: new Date(now - 3600_000).toISOString(), binance: 1, coins: [], no_okx: [] }, now) && universeDue({ at: new Date(now - BP.refreshMs).toISOString(), binance: 1, coins: [], no_okx: [] }, now), 'universe refreshes once a day')
// desks: dynamic universe wired, entries gated by the OKX book, workflows ship the modules
for (const f of ['scripts/daytrade-desk.ts', 'scripts/coach-desk.ts']) {
  const src = fs.readFileSync(f, 'utf8')
  ok(src.includes('refreshUniverse(') && src.includes('liqCheck(') && src.includes('limiter('), `${f}: universe + liquidity gate + rate limit`)
  ok(!/\/trade\/order|\/api\/v5\/trade/.test(src), `${f}: never calls an order endpoint`)
}
for (const w of ['.github/workflows/daytrade-desk.yml', '.github/workflows/coach-desk.yml']) {
  const y = fs.readFileSync(w, 'utf8')
  ok(['binperps.ts', 'universe.ts', 'strategy.ts'].every((x) => y.includes(`shared/${x}`)), `${w} copies the universe modules`)
}
console.log(`desk universe: ${n - bad}/${n} passed`)
if (bad) process.exit(1)

// "ממים חיים" free feed: base58, the pump.fun bonding-curve PDA, curve account parsing, and the feed -> pump.fun shape that
// scripts/meme-core.ts trades on (offline; the PDA pairs were checked against pump.fun's own `bonding_curve` field).
import fs from 'node:fs'
import { b58decode, b58encode, bondingCurveOf, parseCurve, onCurve } from '../shared/solana.ts'
import { feedSource } from '../scripts/meme-core.ts'
let n = 0, bad = 0
const ok = (c: boolean, m: string) => { n++; if (!c) { bad++; console.error('FAIL', m) } }

const mint = '84Zz6zuWFxL8z6CF5pTPX4K1CqmNWZJsR9bPBGdpump'
ok(b58encode(b58decode(mint)) === mint && b58decode(mint).length === 32, 'base58 round trip, 32 bytes')
ok(b58encode(b58decode('11' + mint.slice(2))).startsWith('11'), 'leading zero bytes survive')
ok(bondingCurveOf(mint) === 'CEkTGsKT33V98pzdN4j33cJFwCp9JdHC9FjATgNGqZyd', 'PDA = the bondingCurveKey PumpPortal reported for this mint')
ok(!onCurve(b58decode(bondingCurveOf(mint))) && onCurve(b58decode(mint)) === onCurve(b58decode(mint)), 'a PDA is off the ed25519 curve')

const buf = Buffer.alloc(49); buf.writeBigUInt64LE(1031577837841393n, 8); buf.writeBigUInt64LE(31_000_000_000n, 16)
buf.writeBigUInt64LE(751677837841393n, 24); buf.writeBigUInt64LE(1_000_000_000n, 32); buf[48] = 0
const c = parseCurve(buf.toString('base64'))!
ok(c.vT === 1031577837841393 && c.vS === 31e9 && c.rT === 751677837841393 && c.rS === 1e9 && !c.complete, 'curve account layout')
buf[48] = 1; ok(parseCurve(buf.toString('base64'))!.complete, 'complete flag')
ok(parseCurve(Buffer.alloc(10).toString('base64')) === null, 'short account rejected')

const dir = fs.mkdtempSync('/tmp/memefeed-'), file = dir + '/feed.json', T = Date.now()
fs.writeFileSync(file, JSON.stringify({ at: T, sol_usd: 100, coins: [
  { mint, symbol: 'X', name: 'X', created: T - 120_000, lastTrade: T - 10_000, pool: 'pump', vS: 40e9, vT: 800e12, rT: 520e12, rS: 10e9, complete: false, social: true },
  { mint: 'old', symbol: 'O', created: T - 600_000, lastTrade: T - 400_000, pool: 'pump', vS: 30e9, vT: 1073e12, rT: 793e12, rS: 0, complete: false, social: false },
] }))
const src = feedSource(file), L = await src.list()
ok(L.err.length === 0 && L.coins.length === 1, 'list keeps only coins traded inside the snapshot window')
const x = L.coins[0]
ok(Math.abs(x.market_cap - 50) < 1e-9 && Math.abs(x.usd_market_cap - 5000) < 1e-6, 'market cap in SOL = vS*1e6/vT, USD via the feed SOL price')
ok(x.program === 'pump' && x.real_sol_reserves === 10e9 && x.twitter && x.created_timestamp === T - 120_000, 'pump.fun shape: program, reserves, social, timestamps')
fs.writeFileSync(file, JSON.stringify({ at: T - 60_000, sol_usd: 100, coins: [] }))
const S = await feedSource(file).list()
ok(S.coins.length === 0 && /stale/.test(S.err[0]), 'a stale feed is reported, never read as an empty market')
ok(/missing/.test((await feedSource(dir + '/none.json').list()).err[0]), 'a missing feed file is reported')

console.log(`meme-feed: ${n - bad}/${n} passed`)
if (bad) process.exit(1)

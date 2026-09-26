import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { FAST, fastSignal, fastLevels, fastExit, fastLiq } from '../shared/fast.ts'
import { runFast } from '../supabase/functions/trading-bot/fast-runner.ts'
import type { LBar } from '../shared/lab.ts'
// v95.0 FAST — the owner's all-in intraday rule + a paper replay of the live path
const M5 = 300e3, NOW = Math.floor(Date.UTC(2026, 8, 26, 17, 30) / M5) * M5 + 60e3
const series = (burst: 1 | -1 | 0, buyers = 0.8): LBar[] => { const out: LBar[] = []; let px = 100
  for (let i = 79; i >= 0; i--) { const o = px; const last3 = i < 3 && burst !== 0; px = o * (last3 ? 1 + burst * 0.01 : 1 + (((i * 13) % 5) - 2) * 0.0003)
    const v = i === 0 && burst !== 0 ? 5000 : 1000
    out.push({ t: NOW - 60e3 - (i + 1) * M5, open: o, high: Math.max(o, px) * 1.0005, low: Math.min(o, px) * 0.9995, close: px, vol: v, tb: last3 ? v * (burst > 0 ? buyers : 1 - buyers) : v / 2 }) }
  return out }
const up = fastSignal(series(1), true, false)
assert.ok(up && up.dir === 1 && up.volRatio >= 2 && up.imb > 0.1, 'burst + volume + buyers + BTC up = LONG')
assert.equal(fastSignal(series(1), false, false), null, 'BTC against = no trade')
assert.equal(fastSignal(series(1, 0.5), true, false), null, 'no aggressive buyers = no trade')
assert.equal(fastSignal(series(0), true, false), null, 'no burst = no trade')
const dn = fastSignal(series(-1), false, false); assert.ok(dn && dn.dir === -1, 'mirror SHORT')
assert.ok(fastSignal(series(1), null, true), 'BTC itself skips the BTC condition')
assert.equal(fastSignal(series(1).map((b) => ({ ...b, tb: NaN })), true, false), null, 'no taker data = no trade (never inferred)')
const lv = fastLevels(1, 100, 0.1); assert.equal(lv.r, 0.3, 'stop floored at 0.3%'); assert.ok(Math.abs(lv.target - 100.45) < 1e-9)
assert.equal(fastExit(1, 99.7, 100.45, 99.6, 0), 'STOP'); assert.equal(fastExit(-1, 100.3, 99.55, 99.5, 0), 'TARGET'); assert.equal(fastExit(1, 99.7, 100.45, 100.1, 12 * M5), 'TIMEOUT')
assert.ok(Math.abs(FAST.maxOpen * FAST.perTrade - 1) < 1e-12, 'three slots of margin = the whole account'); assert.equal(FAST.maxPerDay, 20)
assert.ok(Math.abs(fastLiq(1, 100, 50) - 98.5) < 1e-9 && Math.abs(fastLiq(-1, 100, 50) - 101.5) < 1e-9, '50x isolated: liquidated 1.5% against (2% - 0.5% maintenance)')
assert.equal(fastExit(1, 97, 103, 98.4, 0, fastLiq(1, 100, 50)), 'LIQUIDATION', 'a mark beyond the liquidation price liquidates before the stop')
assert.equal(fastExit(1, 99.7, 100.45, 99.6, 0, fastLiq(1, 100, 50)), 'STOP')
// paper replay of the live runner
let rpc: any = null
const openRow = { id: 3, sym: 'ETH', side: 'LONG', strategy: 'FAST', lev: 1, paper_mode: true, entry_price: 100, size: 10, opened_at: new Date(NOW - 20 * 60e3).toISOString(), scalp_meta: { fast: { stop: 99.7, target: 100.45 } } }
const pairs = [{ sym: 'BTC', s: 'BTCUSDT', k: 1 }, { sym: 'SOL', s: 'SOLUSDT', k: 1 }, { sym: 'ETH', s: 'ETHUSDT', k: 1 }, ...Array.from({ length: 20 }, (_, i) => ({ sym: `CX${i}`, s: `CX${i}USDT`, k: 1 }))]
const db = { from: (table: string) => { const b: any = new Proxy({}, { get: (_t, k: string) => {
  if (k === 'throwOnError') return async () => ({ data: table === 'market_cache' ? [{ data: { pairs } }] : table === 'bot_trades' ? [openRow] : [] })
  if (k === 'then') return table === 'bot_trades' ? (res: any) => res({ count: 2 }) : undefined
  if (k === 'insert') return async () => ({})
  return () => b } }); return b },
  rpc: (name: string, args: any) => ({ throwOnError: async () => { rpc = { name, args }; return { data: {} } } }) }
const realNow = Date.now, original = globalThis.fetch
Date.now = () => NOW
try {
  globalThis.fetch = (async (url: string) => {
    const sym = /symbol=([A-Z0-9]+)USDT/.exec(url)?.[1] ?? ''
    if (url.includes('/klines')) { const b = sym === 'SOL' ? series(1) : series(0); const bb = sym === 'BTC' ? b.map((x, i) => ({ ...x, close: x.close * (1 + i * 0.001) })) : b
      return new Response(JSON.stringify(bb.map((x) => [x.t, x.open, x.high, x.low, x.close, x.vol, x.t + M5 - 1, 0, 0, x.tb, 0]))) }
    const mid = sym === 'ETH' ? 99.5 : 100
    return new Response(JSON.stringify({ bids: [[mid * 0.9999, 1]], asks: [[mid * 1.0001, 1]], E: NOW }))
  }) as typeof fetch
  await runFast(db, { balance: 4000, bot_params: {} }, new Date(NOW + 50e3).toISOString(), true)
  assert.equal(rpc.name, 'fast_commit_cycle')
  assert.equal(rpc.args.p_closes.length, 1); assert.equal(rpc.args.p_closes[0].reason, 'STOP', 'ETH below its stop is closed')
  const e = rpc.args.p_entries
  assert.ok(e.length === 1 && e[0].sym === 'SOL' && e[0].side === 'LONG', 'the SOL burst is the one entry')
  assert.ok(e[0].fast.stop < e[0].price && e[0].fast.target > e[0].price)
  assert.equal(e[0].lev, FAST.levDefault, 'default leverage 50x')
  assert.ok(Math.abs(e[0].fast.margin - 5000 / 3) < 1e-6 && Math.abs(e[0].notional - 5000 / 3 * FAST.levDefault) < 1e-6, 'one third of equity as margin x 50 = notional')
  assert.ok(e[0].fast.liq > e[0].price === false && e[0].fast.liq < e[0].price, 'long liquidation price below the entry')
  assert.ok(rpc.args.p_bar, 'the bar is marked processed')
  rpc = null
  const r2: any = await runFast(db, { balance: 4000, bot_params: { fast_bar: Math.floor(NOW / M5) * M5 } }, new Date(NOW + 50e3).toISOString(), true)
  assert.equal(rpc.args.p_entries.length, 0, 'a processed bar is never traded twice'); void r2
  await assert.rejects(() => runFast(db, { balance: 4000 }, 'x', false), /paper-only/)
} finally { globalThis.fetch = original; Date.now = realNow }
const sql = readFileSync('supabase/migrations/20260926200000_fast_leverage.sql', 'utf8')
assert.ok(sql.includes('cnt>=3 or dayn>=20') && sql.includes('eq*0.34') && sql.includes('not s.paper_mode') && sql.includes('least(100,greatest(1,'), 'ledger: 3 open, 20/day, 34% margin/trade, lev <= 100, paper only')
assert.ok(sql.includes('ret:=greatest(0,mg+gross-exitfee-funding)') && sql.includes('cash:=cash-mg-n*0.0005'), 'isolated margin: posts margin + fee, never loses more than the margin')
assert.ok(sql.includes("execute replace(f,'select cash+coalesce(sum(entry_price*size+((case','select cash+coalesce(sum(entry_price*size/greatest(lev,1)+((case')"), 'the equity snapshot counts margin, not notional')
assert.ok(sql.includes("'TSLA'") && sql.includes("'^[A-Z0-9]{2,16}$'"), 'crypto only')
console.log('fast (v95.0): rule, levels, exits, paper replay of the live path, ledger caps passed')

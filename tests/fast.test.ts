import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { FAST, FAST_RT, FAST_TRAIL, fastTrail, fastSignal, fastSignalRT, fastLevels, fastExit, fastLiq, resolveExit, walkBook, liqCap, FAST_LIQ } from '../shared/fast.ts'
import { slipFor } from '../shared/lab.ts'
;(globalThis as any).__FAST_MODE = 'bar'   // the runner replay below exercises the 5m-close mode; real-time is unit-tested here
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
const lv = fastLevels(1, 100, 0.1); assert.equal(lv.r, 0.3, 'stop floored at 0.3%'); assert.ok(!FAST_TRAIL.on && Math.abs(lv.target - (100 + 0.3 * FAST.targetR)) < 1e-9, 'v95.8: fixed stop + fixed 1.5R target, no trailing')
assert.equal(fastTrail(1, 100, 1, 100.9, 99), 99, 'no trail before +1R'); assert.equal(fastTrail(1, 100, 1, 102.5, 99), 101.5, 'after +1R the stop sits 1R behind the best')
assert.equal(fastTrail(1, 100, 1, 101.2, 101.5), 101.5, 'never loosens'); assert.equal(fastTrail(-1, 100, 1, 97, 101), 98, 'short mirror')
assert.equal(fastExit(1, 99.7, 100.45, 99.6, 0), 'STOP'); assert.equal(fastExit(-1, 100.3, 99.55, 99.5, 0), 'TARGET'); assert.equal(fastExit(1, 99.7, 100.45, 100.1, 12 * M5), 'TIMEOUT')
// real-time mode: the forming minute counts
const rt = (burst: 1 | -1 | 0, buyers = 0.8): LBar[] => { const out: LBar[] = []; let px = 100
  for (let i = 44; i >= 0; i--) { const o = px; const hot = i < 3 && burst !== 0; px = o * (hot ? 1 + burst * 0.004 : 1 + (((i * 7) % 5) - 2) * 0.0002)
    const v = hot ? 3000 : 1000; out.push({ t: i, open: o, high: Math.max(o, px) * 1.0002, low: Math.min(o, px) * 0.9998, close: px, vol: v, tb: hot ? v * (burst > 0 ? buyers : 1 - buyers) : v / 2 }) }
  return out }
const r1 = fastSignalRT(rt(1), true, false); assert.ok(r1 && r1.dir === 1 && r1.volRatio >= 2, 'real-time: a burst in the last 3 minutes incl. the forming one = LONG')
assert.equal(fastSignalRT(rt(1), false, false), null, 'real-time: BTC against = nothing'); assert.equal(fastSignalRT(rt(0), true, false), null, 'real-time: no burst = nothing')
assert.ok(fastSignalRT(rt(-1), false, false)?.dir === -1, 'real-time SHORT mirror'); assert.equal(FAST_RT.holdMin, 30); assert.equal(fastExit(1, 90, 110, 100, 30 * 60e3, 0, 30 * 60e3), 'TIMEOUT', 'hold comes from the trade')
assert.ok(Math.abs(FAST.maxOpen * FAST.perTrade - 1) < 1e-12, 'three slots of margin = the whole account'); assert.equal(FAST.maxPerDay, 20)
assert.ok(Math.abs(fastLiq(1, 100, 50) - 98.5) < 1e-9 && Math.abs(fastLiq(-1, 100, 50) - 101.5) < 1e-9, '50x isolated: liquidated 1.5% against (2% - 0.5% maintenance)')
assert.equal(fastExit(1, 97, 103, 98.4, 0, fastLiq(1, 100, 50)), 'LIQUIDATION', 'a mark beyond the liquidation price liquidates before the stop')
assert.equal(fastExit(1, 99.7, 100.45, 99.6, 0, fastLiq(1, 100, 50)), 'STOP')
// paper replay of the live runner
let rpc: any = null
const openRow = { id: 3, sym: 'ETH', side: 'LONG', strategy: 'FAST', lev: 1, paper_mode: true, entry_price: 100, size: 10, opened_at: new Date(NOW - 20 * 60e3).toISOString(), scalp_meta: { fast: { stop: 99.7, target: 100.45, chk: NOW - 60e3 } } }
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
    if (url.includes('/aggTrades')) return new Response(JSON.stringify(sym === 'ETH' ? [{ a: 1, p: '99.9', T: NOW - 10e3 }, { a: 2, p: '99.65', T: NOW - 6e3 }, { a: 3, p: '99.5', T: NOW - 1e3 }] : []))
    const mid = sym === 'ETH' ? 99.5 : 100
    const thin = sym === 'CX0'
    return new Response(JSON.stringify({ bids: [[mid * 0.9999, thin ? 1 : 1e6]], asks: [[mid * 1.0001, thin ? 1 : 1e6]], E: NOW }))
  }) as typeof fetch
  await runFast(db, { balance: 4000, bot_params: {} }, new Date(NOW + 50e3).toISOString(), true)
  assert.equal(rpc.name, 'fast_commit_cycle')
  assert.equal(rpc.args.p_closes.length, 1); assert.equal(rpc.args.p_closes[0].reason, 'STOP', 'ETH below its stop is closed')
  const c0 = rpc.args.p_closes[0]
  assert.ok(Math.abs(c0.price - 99.65 * (1 - slipFor('ETH'))) < 1e-9, 'the stop fills at the FIRST trade through it (99.65) less impact, not at the later mark (99.5)')
  assert.ok(c0.fill.trigger_ts === NOW - 6e3 && c0.fill.lag_ms === 6e3 && c0.fill.model === 'aggTrades', 'fill provenance: trigger time and detection lag')
  const e = rpc.args.p_entries
  assert.ok(e[0].fast.checks.every((c: any) => c.ok) && e[0].fast.checks.length === 4 && Number.isFinite(e[0].fast.z) && e[0].fast.entry_fill.model === 'book_walk', 'raw values + the engine verdicts are stored')
  assert.ok(e.length === 1 && e[0].sym === 'SOL' && e[0].side === 'LONG', 'the SOL burst is the one entry')
  assert.ok(e[0].fast.stop < e[0].price && e[0].fast.target > e[0].price && e[0].fast.trail === false && Math.abs((e[0].fast.target - e[0].price) / (e[0].price - e[0].fast.stop) - FAST.targetR) < 1e-9 && e[0].fast.best === e[0].price)
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
const tsql = readFileSync('supabase/migrations/20260926210000_fast_trail.sql', 'utf8')
assert.ok(tsql.includes("(t.side='LONG' and st<old) or (t.side='SHORT' and st>old)") && tsql.includes('stale fast lease'), 'trail ledger: favourable-only, lease-checked')
// v95.6 fill realism: exits resolved on the trade tape
{ const base = { dir: 1 as const, entry: 2.058829, r: 0.008009, stop: 2.05082, target: null, liq: 0, best: 2.058829, trail: true }
  const r = resolveExit(base, [{ p: 2.0560, T: 1 }, { p: 2.0508, T: 2 }, { p: 2.0476, T: 3 }])
  assert.ok(r.why === 'STOP' && r.px === 2.0508 && r.T === 2, 'RAYSOL replay: the stop fills at the first print through it, not at a later cycle')
  const g = resolveExit({ ...base, target: 2.07, trail: false }, [{ p: 2.07, T: 1 }, { p: 2.0701, T: 2 }, { p: 2.08, T: 3 }])
  assert.ok(g.why === 'TARGET' && g.px === 2.07 && g.T === 2, 'take-profit fills AT the target, only once a print trades strictly beyond it (no GRASS overfill)')
  const t = resolveExit(base, [{ p: 2.0670, T: 1 }, { p: 2.0665, T: 2 }, { p: 2.0589, T: 3 }])
  assert.ok(t.why === 'STOP' && Math.abs(t.stop - (2.067 - 0.008009)) < 1e-12 && t.px === 2.0589, 'trailing ratchets per trade and is hit by a later trade')
  const n = resolveExit(base, [{ p: 2.06, T: 5 }])
  assert.ok(n.why === null && n.lastT === 5 && n.best === 2.06, 'no exit: best and last checked time carried forward')
  const sh = resolveExit({ ...base, dir: -1, stop: 2.0668, best: 2.058829, liq: Infinity }, [{ p: 2.0669, T: 1 }])
  assert.ok(sh.why === 'STOP' && sh.px === 2.0669, 'short mirror')
  const w = walkBook([[100, 5], [100.1, 5], [100.2, 5]], 1000.5)
  assert.ok(Math.abs(w.vwap - 1000.5 / (5 + 500.5 / 100.1)) < 1e-9 && !w.beyond && w.impact > 0, 'book walk VWAP across levels')
  assert.ok(walkBook([[100, 1]], 300).beyond && walkBook([[100, 1], [101, 1]], 1000).vwap > 101, 'an order bigger than the visible book is priced beyond it (INFERRED) and flagged') }
assert.ok(readFileSync('supabase/functions/trading-bot/fast-runner.ts', 'utf8').includes(': now - 20_000) + 1'), 'a pre-v95.6 row (no chk) is never replayed from its open with a trailed stop')
// v95.7 liquidity cap
{ const deep: [number, number][] = [[100, 1e5], [100.01, 1e5]], thinA: [number, number][] = Array.from({ length: 50 }, (_, i) => [100 + i * 0.02, 10] as [number, number])
  assert.ok(liqCap(deep, deep, 0.001) > 1e7, 'a deep book does not cap a normal ticket')
  const c = liqCap(thinA, deep, 0.0012); const w = walkBook(thinA, c)
  assert.ok(c > 0 && c < 50_000 && w.impact <= 0.0012 + 1e-12 && !w.beyond, 'a thin book caps the ticket at the allowed impact, inside the visible book')
  assert.equal(liqCap(deep, thinA, 0.0012), c, 'the exit side binds too')
  assert.equal(FAST_LIQ.impactOfR, 0.25)
  const ordi = liqCap(thinA, thinA, 0.25 * 0.0047); assert.ok(walkBook(thinA, ordi).impact <= 0.25 * 0.0047, 'ORDI-like: impact capped to a quarter of a 47 bps stop') }
const src = readFileSync('supabase/functions/trading-bot/fast-runner.ts', 'utf8')
assert.ok(src.includes("or(`opened_at.gte.${since},closed_at.gte.${since}`)"), 'cooldown counts from the last open OR close')
const fsql = readFileSync('supabase/migrations/20260926220000_fast_fill.sql', 'utf8')
assert.ok(fsql.includes("'{fast,chk}'") && fsql.includes("''fill'',coalesce(x->''fill''") && fsql.includes("(t.side='LONG' and st<old)"), 'fill ledger: chk persisted, fill provenance stored, trail still favourable-only')
console.log('fast (v95.0): rule, levels, exits, paper replay of the live path, ledger caps passed')
// v96.1 WYCKOFF spring / upthrust
{
  const { wyckoffSignal, WYCKOFF } = await import('../shared/fast.ts')
  const mk = (last: Partial<LBar>, vol = 500): LBar[] => { const out: LBar[] = []
    for (let i = 0; i < 80; i++) { const c = 100 + (i % 2 ? 0.5 : -0.5); out.push({ t: i * M5, open: 100, high: Math.max(100, c) + 0.3, low: Math.min(100, c) - 0.3, close: c, vol: 1000, tb: 500 }) }
    out.push({ t: 80 * M5, open: 99.5, high: 100, low: 99, close: 99.5, vol, tb: vol / 2, ...last }); return out }
  const sp = wyckoffSignal(mk({ low: 98.8, close: 99.6 }))!
  assert.ok(sp && sp.dir === 1 && sp.lo === 99.2 && sp.stopPx < 98.8 && sp.volRatio < 1, 'spring below the range low, closed back inside, low volume = LONG')
  const ut = wyckoffSignal(mk({ open: 100.5, high: 101.2, low: 100.3, close: 100.4 }))!
  assert.ok(ut && ut.dir === -1 && ut.stopPx > 101.2, 'upthrust = SHORT, stop beyond the high')
  assert.equal(wyckoffSignal(mk({ low: 98.8, close: 99.6 }, 1500)), null, 'spring on above-average volume = no trade (supply present)')
  assert.equal(wyckoffSignal(mk({ low: 98.8, close: 99.0 })), null, 'closed below the range = breakdown, not a spring')
  assert.equal(wyckoffSignal(mk({ low: 99.3, close: 99.6 })), null, 'no pierce = no spring')
  const trend = mk({ low: 98.8, close: 99.6 }).map((x, i) => i < 80 ? { ...x, high: x.high + i * 0.5, low: x.low + i * 0.5, close: x.close + i * 0.5, open: x.open + i * 0.5 } : x)
  assert.equal(wyckoffSignal(trend), null, 'a trend is not a trading range')
  assert.equal(WYCKOFF.holdMin, 480)
  const src = readFileSync('supabase/functions/trading-bot/fast-runner.ts', 'utf8')
  assert.ok(src.includes("wy ? wyckoffSignal(b)") && src.includes("modeOf"), 'runner wires the wyckoff mode')
}
console.log('wyckoff: ok')

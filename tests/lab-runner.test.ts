import assert from 'node:assert/strict'
import { runLab, LAB_LIVE } from '../supabase/functions/trading-bot/lab-runner.ts'
import { specId, RULES, EXITS } from '../shared/lab.ts'
// v94.0 paper replay of the LIVE code path: mocked exchange + mocked DB, the real runner, the real shared rules.
const H = 3600e3, NOW = Math.floor(Date.UTC(2026, 8, 26, 16, 5) / H) * H + 5 * 60e3   // 5 minutes after a 1h close
const realNow = Date.now; Date.now = () => NOW
const rule = RULES.find((r) => r.fam === 'mom' && r.a === 6 && r.b === 2)!, exit = EXITS.find((e) => e.sl === 2 && e.tp === 3 && e.mg === 1 && e.hold === 6)!
const spec = { id: specId('1h', 1, rule, exit, 'all'), version: 'lab1', tf: '1h', side: 1, rule, exit, gate: 'all' }
const exploreSpec = { ...spec, id: specId('1h', 1, rule, EXITS[0], 'all'), exit: EXITS[0] }
let pool: any = { specs: [{ spec, tier: 'elite', oos: { n: 200, mean: 0.9, t: 2.4, pf: 1.5 } }, { spec: exploreSpec, tier: 'explore', oos: { n: 80, mean: 0.4, t: 0.8, pf: 1.2 } }], ran_at: 'x', note: 'test pool' }
const openRow = { id: 7, sym: 'ETH', side: 'LONG', strategy: 'LAB', lev: 1, paper_mode: true, entry_price: 100, size: 2, opened_at: new Date(NOW - 2 * H).toISOString(),
  scalp_meta: { lab: { spec: spec.id, tier: 'elite', tf: '1h', stop: 99, target: 106, r: 2, best: 100, mg: 1, hold: 6 } } }
let rows: any[] = [openRow], closedRows: any[] = [], rpc: any = null; const inserts: any[] = []
const db = {
  from: (table: string) => { let neq = false; const b: any = new Proxy({}, { get: (_t, k: string) => {
    if (k === 'throwOnError') return async () => ({ data: table === 'market_cache' ? [{ data: pool, ts: new Date(NOW).toISOString() }] : table === 'bot_trades' ? (neq ? closedRows : rows) : [] })
    if (k === 'then') return undefined
    if (k === 'insert') return async (r: any) => { inserts.push(r); return { data: null } }
    return (..._a: any[]) => { if (k === 'neq') neq = true; return b } } }); return b },
  rpc: (name: string, args: any) => ({ throwOnError: async () => { rpc = { name, args }; return { data: { opened: args.p_entries.length, closed: args.p_closes.length } } } }),
}
const kl = (sym: string) => {
  const out: any[] = []; let px = 100
  for (let i = 199; i >= 0; i--) {
    const t = NOW - 5 * 60e3 - (i + 1) * H, rise = sym === 'SOL' && i < 6 ? 1.03 : 1 + (((i * 37) % 7) - 3) * 0.0004
    const o = px; px = o * rise
    out.push([t, o, Math.max(o, px) * 1.001, Math.min(o, px) * 0.999, px, 1000, t + H - 1, 0, 0, 500, 0])
  }
  return out
}
const original = globalThis.fetch
try {
  globalThis.fetch = (async (url: string) => {
    const sym = /symbol=([A-Z0-9]+)USDT/.exec(url)?.[1] ?? ''
    const s = sym.replace('1000', '')
    let data: any = {}
    if (url.includes('/klines')) data = kl(s)
    else if (url.includes('/depth')) { const last = kl(s).at(-1)[4], m = s === 'ETH' ? 98.5 : last; data = { bids: [[m * 0.9999, 500]], asks: [[m * 1.0001, 500]], E: NOW } }
    return new Response(JSON.stringify(data), { status: 200 })
  }) as typeof fetch
  const r: any = await runLab(db, { balance: 4000, bot_params: {} }, new Date(NOW + 50e3).toISOString(), true)
  assert.equal(rpc.name, 'lab_commit_cycle')
  assert.equal(rpc.args.p_closes.length, 1, 'the open ETH long below its stop is closed'); assert.equal(rpc.args.p_closes[0].reason, 'STOP'); assert.equal(rpc.args.p_closes[0].id, 7)
  const e = rpc.args.p_entries
  assert.ok(e.length >= 1 && e.some((x: any) => x.sym === 'SOL' && x.side === 'LONG'), 'the 6-bar momentum burst on SOL is entered LONG')
  const sol = e.find((x: any) => x.sym === 'SOL')
  assert.equal(sol.lab.spec, spec.id); assert.equal(sol.lab.tier, 'elite'); assert.ok(sol.lab.stop < sol.price && sol.lab.target > sol.price, 'levels on the right side')
  assert.ok(Math.abs((sol.lab.target - sol.price) - 3 * (sol.price - sol.lab.stop)) < 1e-6 * sol.price, 'target = 3R')
  assert.ok(sol.notional > 20 && sol.notional <= 0.15 * 4200 + 1e-6, 'sized by risk, <= 15% of equity')
  assert.ok(!e.some((x: any) => x.lab.tier === 'explore'), 'no explore trade when an elite trade was taken')
  assert.ok(e.length <= LAB_LIVE.maxOpen)
  assert.equal(rpc.args.p_bars['1h'], Math.floor(NOW / H) * H, 'the bar is marked processed')
  assert.ok(inserts.some((x: any) => Array.isArray(x) && x.some((d: any) => d.inferred?.sleeve === 'LAB')), 'decisions are journalled with their reasons')
  // same bar again -> no second evaluation
  rpc = null; rows = []; const r2: any = await runLab(db, { balance: 4000, bot_params: { lab_bars: { '1h': Math.floor(NOW / H) * H } } }, new Date(NOW + 50e3).toISOString(), true)
  assert.equal(rpc, null, 'a processed bar is never traded twice'); assert.equal(r2.changed, false)
  // rollback: a spec with a bad live record is demoted and no longer trades
  closedRows = Array.from({ length: 14 }, (_, i) => ({ pnl: -5, pnl_pct: -0.005 - i * 1e-5, scalp_meta: { lab: { spec: spec.id } }, closed_at: new Date(NOW - H).toISOString() }))
  rpc = null; await runLab(db, { balance: 4000, bot_params: {} }, new Date(NOW + 50e3).toISOString(), true)
  assert.ok(rpc.args.p_state.demoted[spec.id], 'the elite spec is rolled back on its own live losses')
  assert.ok(!rpc.args.p_entries.some((x: any) => x.lab.spec === spec.id), 'a demoted spec never enters')
  assert.ok(rpc.args.p_entries.every((x: any) => x.lab.tier === 'explore' && x.notional <= 0.02 * 4000 + 1e-6), 'with no elite left, only small explore trades')
  closedRows = []
  await assert.rejects(() => runLab(db, { balance: 4000 }, 'x', false), /paper-only/)
  void r
  console.log('lab runner: paper replay of the live path (exit, entry, sizing, explore rule, bar de-dup, rollback) passed')
} finally { globalThis.fetch = original; Date.now = realNow }

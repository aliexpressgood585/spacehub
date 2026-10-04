// P-AGG2 (owner override 2026-10-04, PAPER): Level 2 = FAST real-time 10x / 5% / <= 8 with the profit gate ON, EVT2
// (tests/blade.test.ts covers its replay), DONCH4H 1x with pyramiding, and the account -12% day halt (tests/sql).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { FAST, FAST_GATE, fastEdge, fastPsychOn } from '../shared/fast.ts'
import { runFast, fastConfig, aggHalted } from '../supabase/functions/trading-bot/fast-runner.ts'
import { AGG2_SLEEVES, isAgg2 } from '../shared/sleeves.ts'
import type { LBar } from '../shared/lab.ts'

// ── the gate's estimate: measured, clustered, evidence-weighted ──
assert.equal(fastEdge([]).n, 0, 'no measurement -> no estimate')
const T0 = Date.UTC(2026, 9, 4, 0, 0)
const rows = (k: number, f: (i: number) => number) => Array.from({ length: k }, (_, i) => ({ t0: T0 + i * 20 * 60_000, gross_bps: f(i) }))
assert.equal(fastEdge(rows(29, () => 50)).n, 0, `< ${FAST_GATE.minBuckets} buckets -> none`)
const clustered = Array.from({ length: 200 }, (_, i) => ({ t0: T0 + (i % 10) * 1000, gross_bps: 40 }))
assert.equal(fastEdge(clustered).buckets, 1, 'a burst of signals in one 15-min bucket counts once'); assert.equal(fastEdge(clustered).n, 0)
const strong = fastEdge(rows(40, i => 60 + (i % 5)))
assert.ok(strong.n === 40 && strong.t > 2 && Math.abs(strong.bps - strong.mean) < 1e-9, 'strong evidence counts in full')
const weak = fastEdge(rows(40, i => (i % 2 ? 30 : -26)))
assert.ok(weak.bps < weak.mean && weak.bps >= 0, 'weak positive evidence is shrunk toward 0')
const neg = fastEdge(rows(40, i => -5 + (i % 3)))
assert.equal(neg.bps, neg.mean, 'a negative measured edge counts in full')
assert.equal(fastPsychOn('rt'), false, 'PSYCH off in real-time mode'); assert.equal(fastPsychOn('bar'), true)
assert.equal(FAST.levMax, 10, 'FAST leverage capped at 10')

// ── shim config ──
const g = globalThis as any
Object.assign(g, { __FAST_MODE: 'rt', __FAST_LEV: '10', __FAST_SHARE: '0.50', __FAST_PER_TRADE: '0.05', __FAST_MAX_OPEN: '8' })
let c = fastConfig(); assert.deepEqual([c.mode, c.lev, c.share, c.perTrade, c.maxOpen], ['rt', 10, 0.5, 0.05, 8])
g.__FAST_LEV = '50'; assert.equal(fastConfig().lev, 10, '__FAST_LEV=50 is clamped to 10'); g.__FAST_LEV = '10'
assert.deepEqual([...AGG2_SLEEVES], ['FAST', 'EVT', 'DONCH4H'])
assert.ok(isAgg2('FAST,EVT,DONCH4H') && !isAgg2('LIST,FUND,FAST,EVT') && !isAgg2('PRO') && !isAgg2('FAST'))
const day = new Date(T0).toISOString().slice(0, 10)
assert.ok(aggHalted({ agg_day: { day, halted: true } }, T0 + 1000) && !aggHalted({ agg_day: { day: '2000-01-01', halted: true } }, T0) && !aggHalted({}, T0), 'halt is per UTC day')

// ── FAST live-path replay (mocked exchange + db) ──
const NOW = Date.UTC(2026, 9, 4, 9, 20, 30)
function bars(burst = true): LBar[] {
  let p = 100
  return Array.from({ length: 45 }, (_, i) => { const o = p, hot = burst && i >= 42; p *= 1 + (hot ? 0.004 : 0.0001); const vol = hot ? 3000 : 1000
    return { t: NOW - 30_000 - (44 - i) * 60_000, open: o, close: p, high: Math.max(o, p) * 1.0002, low: Math.min(o, p) * 0.9998, vol, tb: vol * 0.8 } })
}
const up = bars(), flat = bars(false)
const pairs = ['BTC', 'SOL', ...Array.from({ length: 20 }, (_, i) => `CX${i}`)].map(sym => ({ sym, s: `${sym}USDT`, k: 1 }))
let commit: any, journal: any[] = [], shadowRows: any[] = [], closedToday: any[] = [], shadowUpserts: any[] = [], klineCalls = 0
const db = {
  from(table: string) {
    const q: any = new Proxy({}, { get(_t, key) {
      if (key === 'throwOnError') return async () => ({ data: table === 'market_cache' ? [{ data: { pairs } }] : [] })
      if (key === 'then') return (resolve: any) => resolve({ data: table === 'fast_shadow' ? shadowRows : table === 'bot_trades' ? closedToday : [], count: 0 })
      if (key === 'insert') return async (r: any[]) => { journal.push(...r); return {} }
      if (key === 'upsert') return async (r: any[]) => { if (table === 'fast_shadow') shadowUpserts.push(...r); return {} }
      return () => q
    } }); return q
  },
  rpc(name: string, args: any) { return { throwOnError: async () => { if (name === 'fast_commit_cycle') commit = args; return { data: {} } } } },
}
const realFetch = globalThis.fetch, realNow = Date.now
const run = async (params: any = {}) => { commit = null; journal = []; shadowUpserts = []; klineCalls = 0; await runFast(db, { balance: 5000, bot_params: params }, new Date(NOW + 50_000).toISOString(), true) }
try {
  Date.now = () => NOW
  globalThis.fetch = (async (url: string) => {
    const sym = /symbol=([A-Z0-9]+)USDT/.exec(url)?.[1]
    if (url.includes('/klines')) { klineCalls++; const b = sym === 'SOL' ? up : flat; return new Response(JSON.stringify(b.map(x => [x.t, x.open, x.high, x.low, x.close, x.vol, x.t + 59999, 0, 0, x.tb, 0]))) }
    if (url.includes('premiumIndex')) return new Response(JSON.stringify([{ symbol: 'SOLUSDT', lastFundingRate: '0.0001' }]))
    const mid = up.at(-1)!.close
    return new Response(JSON.stringify({ bids: [[mid * 0.99999, 1e6]], asks: [[mid * 1.00001, 1e6]], E: NOW }))
  }) as typeof fetch
  // 1. no measured edge -> the gate refuses (no_edge_estimate); the signal is journalled as a shadow for later scoring
  shadowRows = []; await run()
  assert.equal(commit.p_entries.length, 0, 'no measurement -> no FAST entry')
  const d1 = journal.find((x: any) => x.sym === 'SOL'); assert.equal(d1.decision, 'rejected'); assert.equal(d1.reason, 'no_edge_estimate')
  assert.equal(shadowUpserts.length, 1); assert.equal(shadowUpserts[0].sym, 'SOL'); assert.equal(shadowUpserts[0].side, 1); assert.equal(shadowUpserts[0].taken, false)
  // 2. a measured gross that does not pay the round trip -> refused
  shadowRows = rows(40, i => 8 + (i % 3)).map(r => ({ ...r, sym: 'ZZZ' })); await run()
  assert.equal(commit.p_entries.length, 0); assert.equal(journal.find((x: any) => x.sym === 'SOL').reason, 'costs_exceed_edge', 'gross ~9 bps < ~16 bps of costs')
  // 3. a measured edge that pays -> entry at 10x, 5% of equity, gate journalled; PSYCH does not block (3 losses today)
  shadowRows = rows(40, i => 60 + (i % 5)).map(r => ({ ...r, sym: 'ZZZ' }))
  closedToday = Array.from({ length: 3 }, (_, i) => ({ sym: 'QQQ', pnl: -10, closed_at: new Date(NOW - (i + 1) * 60_000).toISOString() }))
  await run()
  assert.equal(commit.p_entries.length, 1, 'gate passes on a measured edge; PSYCH off in rt')
  const e = commit.p_entries[0]
  assert.equal(e.lev, 10); assert.ok(Math.abs(e.notional - 5000 * 0.05 * 10) < 1e-6, '5% margin x 10'); assert.ok(e.fast.gate.pass && e.fast.gate.net_bps >= 2)
  assert.deepEqual(e.fast.psych, { off: true }); assert.ok(e.fast.stop_pct >= FAST.stopMinPct - 1e-12, 'stop never below 0.3%')
  assert.equal(commit.p_note.lev, 10); assert.equal(commit.p_note.psych, false); assert.equal(shadowUpserts[0].taken, true)
  closedToday = []; shadowRows = []
  // 4. the account day halt: no scan at all (exits would still run)
  await run({ agg_day: { day: new Date(NOW).toISOString().slice(0, 10), halted: true } })
  assert.equal(klineCalls, 0, 'halted: no entry scan'); assert.ok(!commit || !commit.p_entries?.length)
} finally { globalThis.fetch = realFetch; Date.now = realNow }

// ── structure: shims, DONCH 1x, EVT without gate, routing ──
const src = (f: string) => readFileSync(f, 'utf8')
for (const wf of ['.github/workflows/deploy-edge-function.yml', '.github/workflows/enforce-no-loss-trading.yml']) {
  const w = src(wf)
  for (const kv of ["g.__ENABLED_SLEEVES = 'Q15,EVT,DONCH4H'", "g.__SLEEVES_OFF = ''", "g.__LEVERAGE = '1'", "g.__Q15_LEV = '10'", "g.__Q15_SHARE = '0.50'",
    "g.__Q15_PER_TRADE = '0.05'", "g.__Q15_MAX_OPEN = '8'", "g.__EVT_PER_TRADE = '0.08'", "g.__EVT_MAX_OPEN = '3'", "Deno.env.set('ENABLED_SLEEVES', 'Q15,EVT,DONCH4H')", "Deno.env.set('LEVERAGE', '1')"])
    assert.ok(w.includes(kv), `${wf}: ${kv}`)
  assert.ok(!/__ENABLED_SLEEVES = '[^']*PRO/.test(w), `${wf}: PRO not enabled`)
  assert.ok(!w.includes('ALLOW_LIVE_EXECUTION'), `${wf}: never sets ALLOW_LIVE_EXECUTION`)
  assert.ok(w.indexOf('20261004120000_agg2.sql') > w.indexOf('20261004090000_blade_sleeve.sql'), `${wf}: AGG2 ledger applied after the Blade ledger`)
}
const idx = src('supabase/functions/trading-bot/index.ts'), br = src('supabase/functions/trading-bot/blade-runner.ts'), mig = src('supabase/migrations/20261004120000_agg2.sql')
assert.ok(idx.includes("ENABLED_SLEEVES.includes('FAST') && ENABLED_SLEEVES.includes('EVT') && !ENABLED_SLEEVES.includes('LIST')") && idx.includes('runEvt2(supabase'), 'AGG2 branch routes EVT2 + FAST + DONCH4H')
assert.ok(idx.indexOf('P-AGG2 (owner override') < idx.indexOf("if (ENABLED_SLEEVES.includes('PRO')) {"), 'AGG2 branch precedes PRO')
assert.ok(!br.includes('profitGate'), 'EVT has no profit gate'); assert.ok(src('supabase/functions/trading-bot/fast-runner.ts').includes('profitGate({'), 'FAST calls the profit gate')
assert.ok(mig.includes("else\n   lv:=1;") && mig.includes("lev>case when strategy='BLADE' then 5 else 1 end"), 'DONCH4H is forced to 1x and a leveraged DONCH4H row is refused')
assert.ok(mig.includes('lv:=least(10,greatest(1,coalesce((x->>\'lev\')::int,1)))') && mig.includes("lv:=least(10,greatest(1,coalesce((x->>'lev')::numeric,1)))"), 'FAST and EVT leverage clamped to 10 in SQL')
assert.ok(mig.includes('eq<=st*0.88') && (mig.match(/public\.agg2_day\(cfg,cash,p_marks\)/g) ?? []).length === 2, 'the -12% halt is evaluated in both commit functions')
assert.ok((mig.match(/not s\.paper_mode/g) ?? []).length >= 2, 'paper lock in both commit functions')
console.log('agg2: all assertions passed')

// P-Q15 (owner override 2026-10-04, PAPER): Q15 scans every COMPLETED 15m bar and enters only where every gate passes.
// Covers: the frozen rule, the bracket used by the shadow measurement, the gate estimate, shim clamps, the live path on a
// mocked exchange + db (no forced fill, gate refuses no edge, 10x / 5% / <= 8, exits on the tape, timeout, halt, day cap),
// leverage isolation from DONCH4H, and the structure (shims, ledger, routing). SQL caps: tests/sql/q15.test.sql.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Q15, Q15_HOLD_MIN, q15Signal, q15BtcUp, q15Levels, q15Bracket, q15Edge, q15Config, q15Liq } from '../shared/q15.ts'
import { runQ15, q15BookOk } from '../supabase/functions/trading-bot/q15-runner.ts'
import { Q15_SLEEVES, isAgg2, SLEEVES } from '../shared/sleeves.ts'
import type { LBar } from '../shared/lab.ts'

// ── the frozen rule on synthetic closed 15m bars ──
const BAR = Q15.barMs
const NOW = Date.UTC(2026, 9, 4, 9, 15, 40), LAST = Date.UTC(2026, 9, 4, 9, 0)   // 40 s after the 09:15 close
function bars(kind: 'flat' | 'up' | 'down' | 'upNoFlow' | 'upNoTb' = 'flat'): LBar[] {
  let p = 100
  return Array.from({ length: 80 }, (_, i) => {
    const hot = kind !== 'flat' && i >= 77, o = p, d = kind === 'down' ? -1 : 1
    p *= 1 + (hot ? d * 0.008 : 0.0001)
    const vol = hot ? 3000 : 1000, tb = kind === 'upNoTb' ? NaN : kind === 'upNoFlow' ? vol * 0.5 : hot ? (d > 0 ? vol * 0.8 : vol * 0.2) : vol * 0.5
    return { t: LAST - (79 - i) * BAR, open: o, close: p, high: Math.max(o, p) * 1.0002, low: Math.min(o, p) * 0.9998, vol, tb }
  })
}
const flat = bars(), up = bars('up'), down = bars('down')
assert.equal(q15BtcUp(flat), true, 'slowly rising BTC closes above its EMA20')
const sUp = q15Signal(up, true, false)!
assert.ok(sUp && sUp.dir === 1 && sUp.z > Q15.zMin && sUp.volRatio >= 2 && sUp.imb > 0.1, 'burst + volume + flow + BTC -> LONG')
assert.equal(q15Signal(up, false, false), null, 'BTC below its EMA20 -> no LONG')
assert.equal(q15Signal(up, null, false), null, 'BTC unknown -> no signal')
assert.ok(q15Signal(up, null, true), 'BTC itself skips the BTC condition')
assert.equal(q15Signal(down, false, false)!.dir, -1, 'mirror: SHORT')
assert.equal(q15Signal(flat, true, false), null, 'no burst -> quiet')
assert.equal(q15Signal(bars('upNoFlow'), true, false), null, 'taker imbalance <= 0.10 -> no signal')
assert.equal(q15Signal(bars('upNoTb'), true, false), null, 'missing taker data -> coin skipped, never inferred')
assert.equal(q15Signal(up.slice(-50), true, false), null, 'too little history')
const lv = q15Levels(1, 100, 0.1)
assert.ok(Math.abs(lv.r - 0.4) < 1e-12 && Math.abs(lv.stop - 99.6) < 1e-9 && Math.abs(lv.target - 100.8) < 1e-9, 'stop floor 0.4%, target 2R')
const lv2 = q15Levels(-1, 100, 1)
assert.ok(Math.abs(lv2.stop - 101.5) < 1e-9 && Math.abs(lv2.target - 97) < 1e-9, '1.5 ATR stop, 2R target, SHORT mirror')
assert.ok(Math.abs(q15Liq(1, 100, 10) - 90.5) < 1e-9 && q15Liq(1, 100, 1) === 0, 'isolated 10x liquidation ~9.5% away')
assert.equal(Q15_HOLD_MIN, 120, 'timeout 8 x 15m')

// ── the bracket (shadow measurement on 1m bars) ──
const m1 = (ps: [number, number, number, number][], t0 = 0): LBar[] => ps.map(([o, h, l, c], i) => ({ t: t0 + i * 60_000, open: o, high: h, low: l, close: c, vol: 1 }))
assert.deepEqual(q15Bracket(1, 100, 99, 102, m1([[100, 100.5, 99.5, 100], [100, 102.5, 98.5, 101]])), { px: 99, why: 'STOP' }, 'stop before target in the same bar')
assert.deepEqual(q15Bracket(1, 100, 99, 102, m1([[100, 102.1, 99.5, 102]])), { px: 102, why: 'TARGET' })
assert.deepEqual(q15Bracket(1, 100, 99, 102, m1([[98, 98.5, 97, 98]])), { px: 98, why: 'STOP' }, 'gap through the stop fills at the open')
assert.deepEqual(q15Bracket(-1, 100, 101, 98, m1([[100, 100.5, 97.5, 98]])), { px: 98, why: 'TARGET' }, 'SHORT target')
const quiet = m1(Array.from({ length: 120 }, () => [100, 100.2, 99.8, 100.1] as [number, number, number, number]))
assert.deepEqual(q15Bracket(1, 100, 99, 102, quiet), { px: 100.1, why: 'TIMEOUT' }, 'timeout at the last close of the 2h window')
assert.equal(q15Bracket(1, 100, 99, 102, quiet.slice(0, 60)), null, 'incomplete window -> not scored yet')

// ── the gate estimate: clustered by signal bar, evidence-weighted ──
const R = (k: number, f: (i: number) => number) => Array.from({ length: k }, (_, i) => ({ bar: LAST - (k - i) * BAR, gross_bps: f(i) }))
assert.ok(Number.isNaN(q15Edge(R(29, () => 50)).bps), `< ${Q15.minBars} signal bars -> no estimate`)
assert.equal(q15Edge(Array.from({ length: 100 }, () => ({ bar: LAST, gross_bps: 40 }))).bars, 1, 'many coins on one bar count once')
const strong = q15Edge(R(40, i => 60 + (i % 5))); assert.ok(strong.t > 2 && strong.bps === strong.mean, 'strong evidence counts in full')
const weak = q15Edge(R(40, i => (i % 2 ? 30 : -26))); assert.ok(weak.bps < weak.mean && weak.bps >= 0, 'weak evidence shrunk to 0')
const neg = q15Edge(R(40, i => -5 + (i % 3))); assert.equal(neg.bps, neg.mean, 'negative edge counts in full')

// ── shim config + sleeve lists ──
const g = globalThis as any
Object.assign(g, { __Q15_LEV: '10', __Q15_PER_TRADE: '0.05', __Q15_MAX_OPEN: '8', __Q15_SHARE: '0.50' })
assert.deepEqual(q15Config(), { lev: 10, perTrade: 0.05, maxOpen: 8, share: 0.5 })
Object.assign(g, { __Q15_LEV: '50', __Q15_PER_TRADE: '0.3', __Q15_MAX_OPEN: '20', __Q15_SHARE: '0.9' })
assert.deepEqual(q15Config(), { lev: 10, perTrade: 0.05, maxOpen: 8, share: 0.5 }, 'every shim value is clamped to the P-Q15 caps')
Object.assign(g, { __Q15_LEV: '10', __Q15_PER_TRADE: '0.05', __Q15_MAX_OPEN: '8', __Q15_SHARE: '0.50' })
assert.deepEqual([...Q15_SLEEVES], ['Q15', 'EVT', 'DONCH4H']); assert.ok((SLEEVES as readonly string[]).includes('Q15'))
assert.ok(isAgg2('Q15,EVT,DONCH4H') && !isAgg2('Q15') && !isAgg2('Q15,EVT,PRO'), 'Q15 routes through the level-2 branch')

// ── leverage isolation: 10x never reaches DONCH4H ──
const row = (strategy: string, lev: number, extra: any = {}) => ({ strategy, lev, paper_mode: true, ...extra })
assert.ok(q15BookOk([row('Q15', 10), row('EVT', 10), row('DONCH4H', 1)]), 'Q15/EVT 10x + DONCH4H 1x is a valid book')
assert.ok(!q15BookOk([row('DONCH4H', 10)]), 'a leveraged DONCH4H row is refused')
assert.ok(!q15BookOk([row('Q15', 20)]), 'Q15 above 10x is refused')
assert.ok(!q15BookOk([row('Q15', 10, { paper_mode: false })]), 'a non-paper row is refused')
assert.ok(!q15BookOk([row('PRO', 1)]), 'a foreign sleeve is refused')

// ── live path replay (mocked exchange + db) ──
const pairs = ['BTC', 'SOL', 'AAA', 'BBB', ...Array.from({ length: 20 }, (_, i) => `CX${i}`)].map(sym => ({ sym, s: `${sym}USDT`, k: 1 }))
let burst = new Set<string>(), openRows: any[] = [], shadowClosed: any[] = [], todayCount = 0, trades: any[] = []
let commit: any, journal: any[] = [], shadowUpserts: any[] = [], klineCalls = 0, spreadBps = 0.2
const db = {
  from(table: string) {
    let cols = '', head = false
    const q: any = new Proxy({}, { get(_t, key) {
      if (key === 'throwOnError') return async () => ({ data: table === 'market_cache' ? [{ data: { pairs } }] : table === 'bot_trades' ? openRows : [] })
      if (key === 'select') return (c: string, o?: any) => { cols = c; head = !!o?.head; return q }
      if (key === 'then') return (resolve: any) => resolve(table === 'q15_shadow' ? { data: cols.includes('stop') ? [] : shadowClosed } : { data: [], count: head ? todayCount : 0 })
      if (key === 'insert') return async (r: any[]) => { journal.push(...r); return {} }
      if (key === 'upsert') return async (r: any[]) => { if (table === 'q15_shadow') shadowUpserts.push(...r); return {} }
      return () => q
    } }); return q
  },
  rpc(name: string, args: any) { return { throwOnError: async () => { if (name === 'q15_commit_cycle') commit = args; return { data: {} } } } },
}
const realFetch = globalThis.fetch, realNow = Date.now
let clock = NOW
const run = async (params: any = {}, paper = true) => { commit = null; journal = []; shadowUpserts = []; klineCalls = 0; await runQ15(db, { balance: 5000, bot_params: params }, new Date(clock + 50_000).toISOString(), paper) }
try {
  Date.now = () => clock
  globalThis.fetch = (async (url: string) => {
    const sym = /symbol=([A-Z0-9]+)USDT/.exec(url)?.[1] ?? ''
    if (url.includes('/klines')) { klineCalls++; const b = burst.has(sym) ? up : flat; return new Response(JSON.stringify(b.map(x => [x.t, x.open, x.high, x.low, x.close, x.vol, x.t + BAR - 1, 0, 0, x.tb, 0]))) }
    if (url.includes('premiumIndex')) return new Response(JSON.stringify([{ symbol: 'SOLUSDT', lastFundingRate: '0.0001' }]))
    if (url.includes('/aggTrades')) return new Response(JSON.stringify(trades))
    const mid = up.at(-1)!.close, h = spreadBps / 2e4
    return new Response(JSON.stringify({ bids: [[mid * (1 - h), 1e6]], asks: [[mid * (1 + h), 1e6]], E: clock }))
  }) as typeof fetch

  await assert.rejects(() => run({}, false), /paper-only/, 'paper lock: refuses live execution')

  // 1. a quiet bar: nothing fires -> 0 entries, 0 decisions, the bar is still marked done
  burst = new Set(); await run()
  assert.equal(commit.p_entries.length, 0); assert.equal(journal.length, 0); assert.equal(commit.p_note.signals, 0); assert.ok(commit.p_bar, 'bar marked as scanned')
  assert.equal(commit.p_note.scanned, pairs.length)

  // 2. NO FORCED FILL: three coins fire, no measured edge -> 0 entries and 3 journal rows (+3 shadows for the measurement)
  burst = new Set(['SOL', 'AAA', 'BBB']); shadowClosed = []; await run()
  assert.equal(commit.p_entries.length, 0, 'no measurement -> no entry')
  assert.equal(journal.length, 3); assert.ok(journal.every(d => d.decision === 'rejected' && d.reason === 'no_edge_estimate'))
  assert.equal(commit.p_note.candidates, 3); assert.equal(commit.p_note.fills, 0); assert.deepEqual(commit.p_note.reasons, { no_edge_estimate: 3 })
  assert.equal(shadowUpserts.length, 3); assert.ok(shadowUpserts.every(s => s.taken === false && s.bar === LAST && s.hold_min === 120))

  // 3. measured gross below the round trip -> refused by the gate
  shadowClosed = R(40, i => 8 + (i % 3)); await run()
  assert.equal(commit.p_entries.length, 0); assert.ok(journal.every(d => d.reason === 'costs_exceed_edge'), 'gross ~9 bps < ~14 bps of costs')

  // 4. a measured edge that pays: 10x, 5% margin, gate journalled, stop >= 0.4%, 2R target
  shadowClosed = R(40, i => 60 + (i % 5)); await run()
  assert.equal(commit.p_entries.length, 3, 'all three pass the gate')
  for (const e of commit.p_entries) {
    assert.equal(e.lev, 10); assert.ok(Math.abs(e.notional - 5000 * 0.05 * 10) < 1e-6, '5% margin x 10')
    assert.ok(e.q15.gate.pass && e.q15.gate.net_bps >= 2); assert.ok(e.q15.stop_pct >= 0.004 - 1e-12)
    assert.ok(Math.abs((e.q15.target - e.price) - 2 * (e.price - e.q15.stop)) < 1e-9, 'target = 2R')
  }
  assert.ok(shadowUpserts.every(s => s.taken === true))
  assert.equal(commit.p_note.lev, 10); assert.equal(commit.p_note.max_open, 8)

  // 5. at most 8 open: ten coins fire
  burst = new Set(['SOL', 'AAA', 'BBB', ...Array.from({ length: 7 }, (_, i) => `CX${i}`)]); await run()
  assert.equal(commit.p_entries.length, 8); assert.equal(journal.filter(d => d.reason === 'q15_full').length, 2)

  // 6. spread over 8 bps -> refused
  burst = new Set(['SOL']); spreadBps = 12; await run()
  assert.equal(commit.p_entries.length, 0); assert.equal(journal[0].reason, 'spread_over_8bps'); spreadBps = 0.2

  // 7. 20 Q15 entries today -> refused
  todayCount = 20; await run(); assert.equal(journal[0].reason, 'daily_cap_20'); todayCount = 0

  // 8. the account -12% day halt: no entry scan (exits keep running)
  await run({ agg_day: { day: new Date(NOW).toISOString().slice(0, 10), halted: true } })
  assert.equal(klineCalls, 0, 'halted: no entry scan'); assert.ok(!commit || !commit.p_entries?.length)

  // 9. once per bar, only inside the first 3 minutes
  await run({ q15_bar: Math.floor(NOW / BAR) * BAR }); assert.equal(klineCalls, 0, 'bar already scanned')
  clock = NOW + 4 * 60_000; await run(); assert.equal(klineCalls, 0, 'outside the entry window'); clock = NOW

  // 10. exits on the tape: a stop print closes the row at the print minus impact; a 2h-old row times out
  const e0 = up.at(-1)!.close, stop = e0 * 0.995, target = e0 * 1.01
  const mk = (id: number, sym: string, openedMin: number) => ({ id, sym, side: 'LONG', strategy: 'Q15', lev: 10, paper_mode: true, entry_price: e0, size: 25, opened_at: new Date(clock - openedMin * 60_000).toISOString(),
    scalp_meta: { q15: { stop, target, r: e0 - stop, best: e0, chk: clock - 30_000 } } })
  openRows = [mk(1, 'SOL', 10), row('DONCH4H', 1, { id: 9, sym: 'AXS', side: 'LONG', entry_price: 1, size: 1, opened_at: new Date(clock).toISOString() })]
  burst = new Set(); trades = [{ p: e0 * 0.999, T: clock - 20_000, a: 1 }, { p: stop * 0.999, T: clock - 10_000, a: 2 }]
  await run({ q15_bar: Math.floor(NOW / BAR) * BAR })
  assert.equal(commit.p_closes.length, 1); assert.equal(commit.p_closes[0].reason, 'STOP'); assert.ok(commit.p_closes[0].price < stop * 0.999, 'stop-market fills at the trigger print minus book impact')
  assert.equal(commit.p_closes[0].fill.trigger_ts, clock - 10_000)
  openRows = [mk(2, 'SOL', 121)]; trades = [{ p: e0 * 1.001, T: clock - 5_000, a: 3 }]
  await run({ q15_bar: Math.floor(NOW / BAR) * BAR })
  assert.equal(commit.p_closes[0].reason, 'TIMEOUT', '8 bars (2h) -> time exit at the book')
  openRows = [mk(3, 'SOL', 10)]; trades = [{ p: e0 * 1.002, T: clock - 5_000, a: 4 }]
  await run({ q15_bar: Math.floor(NOW / BAR) * BAR })
  assert.equal(commit.p_closes.length, 0); assert.equal(commit.p_updates[0].chk, clock - 5_000, 'tape checkpoint persisted')
  openRows = [row('DONCH4H', 10, { id: 9, sym: 'AXS' })]
  await assert.rejects(() => run(), /paper-only book/, 'a leveraged DONCH4H row stops the runner')
  openRows = []
} finally { globalThis.fetch = realFetch; Date.now = realNow }

// ── structure: shims, ledger, routing ──
const src = (f: string) => readFileSync(f, 'utf8')
for (const wf of ['.github/workflows/deploy-edge-function.yml', '.github/workflows/enforce-no-loss-trading.yml']) {
  const w = src(wf)
  assert.ok(w.includes("g.__ENABLED_SLEEVES = 'Q15,EVT,DONCH4H'; g.__SLEEVES_OFF = ''; g.__LEVERAGE = '1'; g.__Q15_LEV = '10'; g.__Q15_PER_TRADE = '0.05'; g.__Q15_MAX_OPEN = '8'; g.__Q15_SHARE = '0.50'; g.__EVT_PER_TRADE = '0.08'; g.__EVT_MAX_OPEN = '3';"), `${wf}: P-Q15 shim`)
  assert.ok(w.includes('// P-Q15 owner 2026-10-04. Rollback = previous shim; close Q15 rows first.'), `${wf}: rollback comment`)
  assert.ok(w.includes("Deno.env.set('ENABLED_SLEEVES', 'Q15,EVT,DONCH4H')") && w.includes("Deno.env.set('LEVERAGE', '1')"), `${wf}: env mirrors the shim; global leverage 1`)
  assert.ok(!/__ENABLED_SLEEVES = '[^']*(PRO|LIST|FUND|BRKV|FAST|CHAN|SCALP|ROTA)/.test(w), `${wf}: PRO/LIST/FUND/BRKV/FAST/CHAN/SCALP/ROTA off`)
  assert.ok(!w.includes('ALLOW_LIVE_EXECUTION'), `${wf}: never sets ALLOW_LIVE_EXECUTION`)
  assert.ok(w.indexOf('20261004150000_q15.sql') > w.indexOf('20261004120000_agg2.sql'), `${wf}: Q15 ledger applied after the AGG2 ledger (which it patches)`)
}
const mig = src('supabase/migrations/20261004150000_q15.sql'), idx = src('supabase/functions/trading-bot/index.ts'), qr = src('supabase/functions/trading-bot/q15-runner.ts')
assert.ok(mig.includes('not s.active or not s.paper_mode') && mig.includes('paper_mode is not true'), 'paper lock in q15_commit_cycle')
assert.ok(mig.includes("lv:=least(10,greatest(1,coalesce((x->>'lev')::int,1)))"), 'Q15 leverage clamped 1..10 in SQL')
assert.ok(mig.includes('maxo:=least(8,') && mig.includes('dayn>=20') && mig.includes('per:=least(0.05,') && mig.includes('share:=least(0.5,'), 'caps 8 open / 20 per day / 5% / 50% in SQL')
assert.ok(mig.includes('public.agg2_day(cfg,cash,p_marks)') && mig.includes("(a->>'halted')::boolean then exit"), 'the -12% day halt blocks Q15 entries in SQL')
assert.ok(mig.includes("'q15 entry without profit gate'") && mig.includes('0.00399'), 'SQL refuses an ungated entry and a stop under 0.4%')
assert.ok(mig.includes("strategy not in ('Q15','EVT','FAST') and lev>1"), 'SQL refuses a leveraged non-Q15/EVT row (DONCH4H stays 1x)')
assert.ok(mig.includes("'BLADE','DONCH4H','EVT','FAST','Q15'") && mig.includes('refusing to patch'), 'EVT/DONCH ledger accepts Q15 rows, patch fails closed')
assert.ok(idx.includes("runQ15(supabase, await fresh(), runLeaseUntil, paperOnly)") && idx.includes("ENABLED_SLEEVES.includes('Q15')"), 'index routes Q15 in the level-2 branch')
const ruleCode = src('shared/q15.ts').replace(/\/\/.*$/gm, '')
assert.ok(qr.includes('profitGate({') && !qr.includes('PSYCH') && !/\.rsi|macd|vwap|hi20|lo20|hi55/i.test(ruleCode), 'Q15 gates on profit; no PSYCH, no RSI/MACD/VWAP/Donchian in the rule')
assert.ok(src('quant/PREREGISTRATION_Q15.md').includes('Rule (frozen)'), 'preregistered')
console.log('q15: ALL ASSERTIONS PASSED')

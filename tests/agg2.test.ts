// P-AGG2 (owner override 2026-10-04, PAPER): Level 2 = FAST real-time 10x / 5% / <= 8 with the profit gate ON, EVT2
// (tests/blade.test.ts covers its replay), DONCH4H 1x with pyramiding, and the account -12% day halt (tests/sql).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
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
  return Array.from({ length: 45 }, (_, i) => { const o = p, hot = burst && i >= 42; p *= 1 …6341 tokens truncated…Atr === 3 && PRO_V104.timeStopBars === 15, 'v100.4 = v100b choice')
assert.ok(PRO_LIVE.tf === '4h' && PRO_LIVE.breakoutN === 20 && PRO_LIVE.stopAtr === 3 && PRO_LIVE.targetR === 3 && PRO_LIVE.beR === 1.5 && PRO_LIVE.maxHoldBars === 60, 'live = v100c choice on 4h')
// ── 4h ladder: aggregation from 1h, weekly VWAP anchor, no funding skip ──
{ const h: Bar[] = Array.from({ length: 48 }, (_, i) => ({ t: Date.UTC(2026, 8, 21) + i * 3600_000, open: i, high: i + 1, low: i - 1, close: i + 0.5, vol: 1 }))
  const b4 = aggregate(h, 240, 60); assert.equal(b4.length, 12); assert.deepEqual([b4[0].open, b4[0].high, b4[0].low, b4[0].close, b4[0].vol], [0, 4, -1, 3.5, 4])
  assert.equal(aggregate(h, 1440, 60).length, 2, 'two complete days')
  assert.ok(TF['4h'].fundingSkip === false && TF['4h'].vwap === 'week' && TF['4h'].mid === 1440) }
// ── sizing: 0.5% of equity at the stop, capped at 5x equity and by cash ──
assert.ok(near(proSize(5000, 5000, 100, 0.5), 5000), '0.5% stop -> $25 risk -> $5,000 notional')
assert.ok(near(proSize(5000, 5000, 100, 0.05), 25000), 'a tiny stop is capped at 5x equity')
assert.ok(proSize(5000, 10, 100, 0.5) < 101, 'cash posts the margin at 10x')

// ── pre-screen: breakout + volume from the previous 15 / 20 bars only (60 bars give the same answer as 1,500) ──
{ const b: Bar[] = Array.from({ length: 60 }, (_, i) => ({ t: i * 60_000, open: 100, high: 100.1, low: 99.9, close: 100, vol: 10 }))
  assert.equal(prescreen(b, 15).pass, false)
  b[59] = { ...b[59], close: 100.2, high: 100.25, vol: 16 }; assert.deepEqual(prescreen(b, 15), { pass: true, volRatio: 1.6, dir: 1 })
  b[59] = { ...b[59], vol: 15 }; assert.equal(prescreen(b, 15).pass, false, 'volume must be ABOVE 1.5x')
  b[59] = { ...b[59], close: 99.8, low: 99.7, vol: 20 }; assert.equal(prescreen(b, 15).dir, -1) }
// ── a live signal on the 4h ladder: synthetic uptrend with volume breakouts, searched with the runner's own windows ──
const T0 = Date.UTC(2023, 0, 2, 0, 0), B = 240 * 60_000
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const all: Bar[] = []; let px = 100
for (let i = 0; i < 6_000; i++) {
  const o = px; px *= 1 + 0.0012 + (rnd() - 0.5) * 0.03 * (1 + Math.sin(i / 120))
  all.push({ t: T0 + i * B, open: o, high: Math.max(o, px) * (1 + rnd() * 0.005), low: Math.min(o, px) * (1 - rnd() * 0.005), close: px, vol: 10 + rnd() * 10 + (rnd() < 0.05 ? 40 : 0) })
}
const tf4 = TF['4h']
const win = (i: number) => { const c1 = all.slice(Math.max(0, i - 1499), i + 1), upto = all.slice(0, i + 1)
  return { m1: c1, m5: aggregate(upto, 1440, 240).slice(-400), m15: aggregate(upto, 1440, 240).slice(-400) } }
let sig = -1
for (let i = 5_999; i > 3_000 && sig < 0; i--) { const w = win(i); const F = features(w.m1, w.m5, w.m15, tf4); if (proCheck(w.m1, F, w.m1.length - 1, PRO_LIVE.breakoutN, tf4).dir) sig = i }
assert.ok(sig > 0, 'the synthetic series produces at least one signal')
const W = win(sig), F = features(W.m1, W.m5, W.m15, tf4), ck = proCheck(W.m1, F, W.m1.length - 1, PRO_LIVE.breakoutN, tf4)
assert.equal(ck.checks.length, 9); assert.ok(ck.checks.every((c) => c.ok))

const realFetch = globalThis.fetch, realNow = Date.now
let now = all[sig].t + B + 5_000
Date.now = () => now
let open: any[] = [], past: any[] = [], commit: any = null, inserted: any[] = []
const db = {
  from(table: string) {
    let pc = false
    const q: any = new Proxy({}, { get(_t, key) {
      if (key === 'throwOnError') return async () => ({ data: open })
      if (key === 'neq') return () => { pc = true; return q }
      if (key === 'order') return async () => ({ data: pc ? past : open })
      if (key === 'insert') return async (rows: any) => { if (table === 'trade_decisions') inserted.push(...rows); return { data: null } }
      return () => q
    } }); return q
  },
  rpc(name: string, args: any) { return { throwOnError: async () => { if (name === 'pro_commit_cycle') commit = args; return { data: { opened: args.p_entries?.length ?? 0 } } } } },
}
const kline = (b: Bar, ms: number) => [b.t, b.open, b.high, b.low, b.close, b.vol, b.t + ms - 1]
let bid = W.m1[W.m1.length - 1].close * 0.9999, ask = W.m1[W.m1.length - 1].close * 1.0001
globalThis.fetch = (async (url: string) => {
  const ok = (j: any) => ({ ok: true, status: 200, json: async () => j })
  const sym = /symbol=([A-Z0-9]+)/.exec(url)?.[1]
  if (url.includes('/klines')) {
    if (sym !== 'BTCUSDT') return { ok: false, status: 400, json: async () => ({}) }   // only BTC has data in this replay
    const iv = /interval=(\w+)/.exec(url)![1], ms = iv === '4h' ? B : 86_400_000
    if (iv !== '4h' && iv !== '1d') return { ok: false, status: 400, json: async () => ({}) }
    const src = iv === '4h' ? W.m1 : W.m5
    return ok([...src.map((b) => kline(b, ms)), kline(all[sig + 1], B)])
  }
  if (url.includes('/depth')) return ok({ bids: [[String(bid)]], asks: [[String(ask)]], E: now })
  if (url.includes('fundingRate')) return ok([{ fundingRate: '0.0001' }])
  return { ok: false, status: 404, json: async () => ({}) }
}) as any
const state = (params: any = {}) => ({ balance: 5000, bot_params: params, hard_halt_at: null })
try {
  await assert.rejects(runPro(db, state(), 'L', false), /paper-only/)
  open = [{ strategy: 'FAST', paper_mode: true, lev: 1 }]; await assert.rejects(runPro(db, state(), 'L', true), /PRO rows/); open = []
  const res: any = await runPro(db, state(), 'L', true)
  assert.equal(commit.p_bar, all[sig].t, 'the closed bar is recorded once')
  assert.equal(commit.p_entries.length, 1); const e = commit.p_entries[0]
  assert.equal(e.sym, 'BTC'); assert.equal(e.side, ck.checks[6].v < W.m1[W.m1.length - 1].close ? 'LONG' : 'SHORT')
  const dir = e.side === 'LONG' ? 1 : -1, ent = dir > 0 ? ask * 1.0003 : bid * (1 - 0.0003)
  assert.ok(near(e.price, ent, 1e-6), 'entry at the touch plus slippage')
  assert.ok(near(Math.abs(e.price - e.pro.stop), Math.max(PRO_LIVE.stopAtr * F.atr1[F.n - 1], (PRO_LIVE.minStopPct ?? 0) * e.price), 1e-6), 'stop = 3 x ATR(14) on 4h')
  assert.ok(e.pro.params.tf === '4h' && e.pro.params.beR === 1.5 && e.pro.bar === new Date(all[sig].t).toISOString(), 'v100.5 params travel with the row')
  assert.ok(near(Math.abs(e.pro.target - e.price), PRO_LIVE.targetR * Math.abs(e.price - e.pro.stop), 1e-6), 'target = 3R')
  assert.ok(e.notional <= 5000 * PRO.maxNotionalEq + 1e-6 && Math.abs(e.notional * e.pro.stop_pct - 250) < 1e-6 || e.notional >= 5000 * PRO.maxNotionalEq - 1e-6, 'v100.6: risk $250 (5%) at the stop unless capped at 5x')
  assert.equal(e.pro.risk_pct, 0.05)
  assert.equal(commit.p_note.failed_n, FALLBACK.length - 1, 'no universe cache and no exchangeInfo -> the pinned 40; the 39 without data are reported as failed')
  assert.equal(commit.p_note.universe.src, 'fallback_40'); assert.equal(commit.p_note.full, 1, 'only the pre-screened pair is read in full')
  assert.equal(inserted[0].decision, 'accepted'); assert.ok(res.changed)
  // the same bar is not scanned twice
  commit = null; await runPro(db, state({ pro_bar: all[sig].t }), 'L', true); assert.equal(commit, null, 'no second scan of one bar')
  // v100.3: the -3R day stop and the 3-loss cooldown are OFF live (owner) — the entry still goes through
  past = [1, 2, 3].map((k) => ({ pnl: -25, risk_usd: 25, closed_at: new Date(now - k * 600_000).toISOString() }))
  await runPro(db, state(), 'L', true); assert.equal(commit.p_entries.length, 1, 'no day stop live'); assert.equal(commit.p_note.gate, null); past = []
  // exits on the live touch
  const row = (meta: any) => ({ id: 9, sym: 'BTC', side: 'LONG', strategy: 'PRO', paper_mode: true, lev: 10, entry_price: 100, size: 10, opened_at: new Date(now - 5 * 60_000).toISOString(), scalp_meta: { pro: { stop: 99, target: 103, r: 1, best: 100, reached_1r: false, ...meta } } })
  const st2 = state({ pro_bar: all[sig].t })
  open = [row({})]; bid = 98.9; ask = 99; await runPro(db, st2, 'L', true)
  assert.equal(commit.p_closes[0].reason, 'STOP'); assert.ok(near(commit.p_closes[0].price, 98.9 * (1 - 0.0003)))
  open = [row({})]; bid = 101.5; ask = 101.6; await runPro(db, st2, 'L', true)
  assert.equal(commit.p_closes.length, 0); assert.ok(near(commit.p_updates[0].stop, 100.5) && commit.p_updates[0].reached_1r, '+1.5R: stop trails 1R behind')
  open = [row({ stop: 100.5, best: 101.5, reached_1r: true })]; bid = 100.4; ask = 100.5; await runPro(db, st2, 'L', true)
  assert.equal(commit.p_closes[0].reason, 'TRAIL')
  open = [row({})]; bid = 103.1; ask = 103.2; await runPro(db, st2, 'L', true); assert.equal(commit.p_closes[0].reason, 'TARGET')
  open = [{ ...row({}), opened_at: new Date(now - 16 * 60_000).toISOString() }]; bid = 100.2; ask = 100.3; await runPro(db, st2, 'L', true)
  assert.equal(commit.p_closes[0].reason, 'TIME', 'no +1R after 15 bars')
  { const H8 = 8 * 3600_000, crossed = Math.floor((now - 16 * 60_000) / H8) !== Math.floor(now / H8)
    assert.ok(near(commit.p_closes[0].funding, crossed ? 1000 * 0.0001 : 0), 'funding charged only when an 8h settlement fell inside the hold') }
  // a 4h row: 16 minutes is nothing; 15 bars = 60 hours
  const r4 = (h: number) => ({ ...row({ params: PRO_LIVE }), opened_at: new Date(now - h * 3600_000).toISOString() })
  open = [r4(0.3)]; bid = 100.2; ask = 100.3; await runPro(db, st2, 'L', true); assert.equal(commit.p_closes.length, 0, '4h row: no time stop after minutes')
  open = [r4(61)]; await runPro(db, st2, 'L', true); assert.equal(commit.p_closes[0].reason, 'TIME', '4h row: out after 15 x 4h without +1.5R')
  // funding is queried only when an 8h settlement fell inside the hold
  // the brake stops entries only
  open = []; commit = null; await runPro(db, state({ sleeves_off: { PRO: { by: 'test' } } }), 'L', true); assert.equal(commit, null, 'braked: no scan')
} finally { globalThis.fetch = realFetch; Date.now = realNow }

// ── ledger and shim ──
const sql = readFileSync(new URL('../supabase/migrations/20261003090000_pro_risk5.sql', import.meta.url), 'utf8')
assert.match(sql, /cnt>=3/, 'ledger: <= 3 open'); assert.match(sql, /eq\*5/, 'ledger: notional <= 5x equity'); assert.match(sql, /eq\*0\.051/, 'ledger: risk <= 5.1%'); assert.ok(sql.split('eq*0.051').length === 3 && !sql.includes('eq*0.006'))
assert.equal(PRO_LIVE.riskPct, 0.05, 'live risk 5% per trade (owner)'); assert.ok(near(proSize(5000, 5000, 100, 5, 0.05), 5000), '5% risk / 5% stop = 1x equity')
assert.match(sql, /not s\.paper_mode/, 'ledger: paper only'); assert.match(sql, /strategy='PRO'/)
for (const w of ['deploy-edge-function.yml', 'enforce-no-loss-trading.yml']) {
  const y = readFileSync(new URL(`../.github/workflows/${w}`, import.meta.url), 'utf8')
  assert.match(y, /g\.__ENABLED_SLEEVES = 'Q15';/, `${w}: P-Q15 shim runs DDDDD only; PRO off`)
  assert.match(y, /Deno\.env\.set\('ENABLED_SLEEVES', 'Q15'\)/)
}
console.log('PRO: all assertions passed')

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PRO, PRO_LIVE, PRO_V104, TF, aggregate, features, proCheck, openPos, stepBar, ratchet, proSize, ema, rsi, adx, inFundingWindow, type Bar } from '../shared/pro.ts'
import { runPro, prescreen } from '../supabase/functions/trading-bot/pro-runner.ts'
import { FALLBACK } from '../shared/universe.ts'

// v100.0 PRO: the rule module and a replay of the live runner with a mocked exchange and database.
const near = (a: number, b: number, e = 1e-9) => Math.abs(a - b) < e
// ── indicators ──
assert.ok(near(ema([1, 2, 3, 4, 5], 3)[4], 4.0625), 'EMA3 seeded on the first close, k = 2/(n+1)')
assert.ok(Number.isNaN(ema([1, 2, 3], 3)[1]), 'EMA undefined before n bars')
assert.equal(rsi([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 9)[10], 100, 'RSI 100 when there are no down moves')
const up: Bar[] = Array.from({ length: 80 }, (_, i) => ({ t: i * 300_000, open: 100 + i, high: 101 + i, low: 99.5 + i, close: 100.8 + i, vol: 1 }))
assert.ok(adx(up, 14)[79] > 50, 'a clean trend has a high ADX')
// aggregation: complete UTC buckets only
const m1: Bar[] = Array.from({ length: 17 }, (_, i) => ({ t: i * 60_000, open: i, high: i + 1, low: i - 1, close: i + 0.5, vol: 1 }))
const a5 = aggregate(m1, 5)
assert.equal(a5.length, 3, 'the forming 4th bucket is dropped')
assert.deepEqual(a5[0], { t: 0, open: 0, high: 5, low: -1, close: 4.5, vol: 5 })
assert.ok(inFundingWindow(Date.UTC(2026, 9, 2, 8, 2)) && inFundingWindow(Date.UTC(2026, 9, 2, 15, 57)) && !inFundingWindow(Date.UTC(2026, 9, 2, 12, 0)), 'funding windows ±5 min')
// ── exits: stop before target, gap fills at the open, breakeven at +1R then trail 1R, time stop ──
const P = { breakoutN: 10, stopAtr: 1, targetR: 1.5, timeStopBars: 3 }
let s = openPos(1, 100, 1, P)
assert.deepEqual([s.stop, s.target], [99, 101.5])
assert.deepEqual(stepBar(s, { t: 0, open: 100, high: 102, low: 98.5, close: 100, vol: 1 }, P), { px: 99, why: 'STOP' }, 'both touched: stop first')
s = openPos(1, 100, 1, P)
assert.deepEqual(stepBar(s, { t: 0, open: 98, high: 98, low: 97, close: 97, vol: 1 }, P), { px: 98, why: 'STOP' }, 'gap through the stop fills at the open')
s = openPos(1, 100, 1, { ...P, targetR: 3 })
assert.equal(stepBar(s, { t: 0, open: 100, high: 101.2, low: 99.8, close: 101, vol: 1 }, P), null)
assert.ok(s.reached1R && near(s.stop, 100.2), 'at +1.2R the stop trails 1R behind the best (above breakeven)')
assert.deepEqual(stepBar(s, { t: 0, open: 101, high: 101.1, low: 100.1, close: 100.5, vol: 1 }, P), { px: 100.2, why: 'TRAIL' })
s = openPos(-1, 100, 1, P)
for (let k = 0; k < 2; k++) assert.equal(stepBar(s, { t: 0, open: 100, high: 100.3, low: 99.7, close: 100, vol: 1 }, P), null)
assert.deepEqual(stepBar(s, { t: 0, open: 100, high: 100.3, low: 99.7, close: 100.1, vol: 1 }, P), { px: 100.1, why: 'TIME' }, 'no +1R within T bars -> out')
const r = openPos(-1, 100, 1, P); ratchet(r, 98.5); assert.ok(near(r.stop, 99.5) && r.reached1R, 'short ratchet mirrors')
ratchet(r, 99.9); assert.ok(near(r.stop, 99.5), 'the stop never loosens')
// ── v100.4: stop floor at a share of price, breakeven / trail at beR ──
const P4 = { ...P, stopAtr: 3, minStopPct: 0.02, beR: 1.5 }
const q4 = openPos(1, 100, 0.1, P4); assert.ok(near(q4.r, 2) && near(q4.stop, 98) && near(q4.target, 103), 'floor 2% beats 3 x ATR 0.3')
ratchet(q4, 102.5, P4); assert.ok(!q4.reached1R && near(q4.stop, 98), 'no ratchet before +1.5R')
ratchet(q4, 103.2, P4); assert.ok(q4.reached1R && near(q4.stop, 100.2), 'at +1.6R the stop trails 1.5R behind the best')
assert.ok(near(openPos(1, 100, 1, P4).r, 3), '3 x ATR when wider than the floor')
assert.ok(PRO_V104.minStopPct === 0.02 && PRO_V104.beR === 1.5 && PRO_V104.stopAtr === 3 && PRO_V104.timeStopBars === 15, 'v100.4 = v100b choice')
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
  assert.ok(e.notional <= 5000 * PRO.maxNotionalEq + 1e-6 && Math.abs(e.notional * e.pro.stop_pct - 25) < 1e-6 || e.notional >= 5000 * PRO.maxNotionalEq - 1e-6, 'risk $25 at the stop unless capped at 5x')
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
const sql = readFileSync(new URL('../supabase/migrations/20261002090000_pro_sleeve.sql', import.meta.url), 'utf8')
assert.match(sql, /cnt>=3/, 'ledger: <= 3 open'); assert.match(sql, /eq\*5/, 'ledger: notional <= 5x equity'); assert.match(sql, /eq\*0\.006/, 'ledger: risk <= 0.6%')
assert.match(sql, /not s\.paper_mode/, 'ledger: paper only'); assert.match(sql, /strategy='PRO'/)
for (const w of ['deploy-edge-function.yml', 'enforce-no-loss-trading.yml']) {
  const y = readFileSync(new URL(`../.github/workflows/${w}`, import.meta.url), 'utf8')
  assert.match(y, /g\.__ENABLED_SLEEVES = 'PRO';/, `${w}: shim runs PRO only`)
  assert.match(y, /Deno\.env\.set\('ENABLED_SLEEVES', 'PRO'\)/)
}
console.log('PRO: all assertions passed')

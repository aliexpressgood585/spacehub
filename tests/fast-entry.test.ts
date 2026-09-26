import assert from 'node:assert/strict'
import { FAST, fastSignalRT } from '../shared/fast.ts'
import { FAST_ENTRY, freshMinuteBars, confirmFastEntry } from '../shared/fast-entry.ts'
import { runFast } from '../supabase/functions/trading-bot/fast-runner.ts'
import type { LBar } from '../shared/lab.ts'

const NOW = Date.UTC(2026, 8, 26, 19, 20, 30)
function bars(dir: 1 | -1 = 1, burst = true): LBar[] {
  let p = 100
  return Array.from({ length: 45 }, (_, i) => {
    const o = p, hot = burst && i >= 42
    p *= 1 + dir * (hot ? 0.004 : 0.0001)
    const vol = hot ? 3000 : 1000
    return { t: NOW - 30_000 - (44 - i) * 60_000, open: o, close: p,
      high: Math.max(o, p) * 1.0002, low: Math.min(o, p) * 0.9998,
      vol, tb: vol * (dir > 0 ? 0.8 : 0.2) }
  })
}
const up = bars(), down = bars(-1), flat = bars(1, false)
const verify = (b = up, btc = up, d: 1 | -1 = 1, mid = b.at(-1)!.close, quote = NOW, started = NOW - 100) =>
  confirmFastEntry(b, btc, false, d, mid * 0.99999, mid * 1.00001, quote, started, NOW)
assert.ok(freshMinuteBars(up, NOW))
const long = verify(); assert.ok(long.ok && long.sig.dir === 1 && long.detail.recent_flow_agrees)
assert.ok(verify(down, down, -1).ok, 'short mirror stays eligible')
assert.equal(verify(up, down).ok, false, 'BTC reversal invalidates an old discovery')
assert.equal(verify(flat).ok, false, 'vanished momentum invalidates entry')
assert.equal(verify(up, up, 1, up.at(-1)!.close, NOW - 6000).ok, false, 'stale quote')
assert.equal(verify(up, up, 1, up.at(-1)!.close, NOW, NOW - 6000).ok, false, 'slow fetch')
assert.equal(verify(up, up, 1, up.at(-1)!.close, NOW + 2000).ok, false, 'future quote')
const r = Math.max(fastSignalRT(up, true, false)!.atr, up.at(-1)!.close * FAST.stopMinPct)
assert.equal(verify(up, up, 1, up.at(-1)!.close + r * 0.3).ok, false, 'no chasing beyond the fresh snapshot')
assert.equal(verify(up, up, 1, up.at(-1)!.close - r * 0.3).ok, false, 'no stale reversal fill')
assert.ok(verify(up, up, 1, up.at(-1)!.close + r * 0.1).ok, 'small book movement remains aggressive')
for (const malformed of [up.map((b, i) => i === 40 ? { ...b, t: b.t - 60000 } : b),
  up.map(b => ({ ...b, tb: NaN })), up.map(b => ({ ...b, tb: b.vol + 1 })),
  up.map(b => ({ ...b, t: b.t - 120000 }))]) assert.equal(verify(malformed).ok, false)
assert.equal(confirmFastEntry(up, up, false, 1, 102, 101, NOW, NOW, NOW).ok, false, 'crossed book')
assert.ok(confirmFastEntry(up, [], true, 1, up.at(-1)!.close, up.at(-1)!.close, NOW, NOW, NOW).ok, 'BTC needs no external reference')

// Replay the actual runner: discovery says yes, but refresh can say no. No real
// exchange or database is contacted; recorded arguments are what SQL would book.
const realFetch = globalThis.fetch, realNow = Date.now, g = globalThis as any, oldMode = g.__FAST_MODE
const pairs = ['BTC', 'SOL', ...Array.from({ length: 20 }, (_, i) => `CX${i}`)].map(sym => ({ sym, s: `${sym}USDT`, k: 1 }))
let commit: any, journal: any[] = [], scenario = 'valid', solFetches = 0
const db = {
  from(table: string) {
    const q: any = new Proxy({}, { get(_t, key) {
      if (key === 'throwOnError') return async () => ({ data: table === 'market_cache' ? [{ data: { pairs } }] : [] })
      if (key === 'then') return (resolve: any) => resolve({ data: [], count: 0 })
      if (key === 'insert') return async (rows: any[]) => { journal.push(...rows); return {} }
      return () => q
    } }); return q
  },
  rpc(name: string, args: any) { return { throwOnError: async () => { if (name === 'fast_commit_cycle') commit = args; return { data: {} } } } },
}
try {
  Date.now = () => NOW; g.__FAST_MODE = 'rt'
  globalThis.fetch = (async (url: string) => {
    const sym = /symbol=([A-Z0-9]+)USDT/.exec(url)?.[1]
    if (url.includes('/klines')) {
      if (sym === 'SOL') solFetches++
      const b = sym === 'SOL' && !(scenario === 'expired' && solFetches > 1) ? up : flat
      return new Response(JSON.stringify(b.map(x => [x.t, x.open, x.high, x.low, x.close, x.vol, x.t + 59999, 0, 0, x.tb, 0])))
    }
    assert.ok(url.includes('/depth'))
    const mid = up.at(-1)!.close * (scenario === 'moved' ? 1.01 : 1)
    return new Response(JSON.stringify({ bids: [[mid * 0.99999, 1e6]], asks: [[mid * 1.00001, 1e6]], E: NOW }))
  }) as typeof fetch
  for (scenario of ['valid', 'expired', 'moved']) {
    commit = null; journal = []; solFetches = 0
    await runFast(db, { balance: 5000, bot_params: {} }, new Date(NOW + 50000).toISOString(), true)
    assert.equal(solFetches, 2, 'candidate klines are fetched again after discovery')
    if (scenario === 'valid') {
      assert.equal(commit.p_entries.length, 1)
      const e = commit.p_entries[0]
      assert.equal(e.lev, FAST.levDefault)
      assert.equal(e.fast.entry_check.version, FAST_ENTRY.version)
      assert.ok(e.fast.checks.every((c: any) => c.ok))
      assert.ok(Math.abs(e.notional - 5000 / 3 * 50) < 1e-6, 'full original allocation on a deep book')
      assert.equal(journal[0].observed.entry_check.version, FAST_ENTRY.version)
    } else {
      assert.equal(commit.p_entries.length, 0)
      assert.equal(journal[0].reason, scenario === 'expired' ? 'signal_expired' : 'entry_price_moved')
    }
  }
} finally { globalThis.fetch = realFetch; Date.now = realNow; g.__FAST_MODE = oldMode }
console.log('FAST entry: fresh long/short, expired signal/BTC, stale and malformed data, drift, runner refresh, allocation and leverage passed')

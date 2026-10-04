import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runEvt, evtConfig, symOf } from '../supabase/functions/trading-bot/evt-runner.ts'

// v99.5 EVT: replay of the live path with a mocked exchange and database. Nothing real is contacted; the recorded
// RPC arguments are what the ledger would book.
const T = Date.UTC(2026, 9, 1, 12, 0), g = globalThis as any, realFetch = globalThis.fetch, realNow = Date.now
let arts: any = { 48: [], 161: [] }, open: any[] = [], past: any[] = [], commit: any = null, marksKey: string | null = null, funding: any[] = []
const book: Record<string, number> = { HYPEUSDT: 40, ICXUSDT: 0.1, STORJUSDT: 0.3, '1000SATSUSDT': 0.00004, BTCUSDT: 60000 }
const db = {
  from(_table: string) {
    let past_q = false
    const q: any = new Proxy({}, { get(_t, key) {
      if (key === 'throwOnError') return async () => ({ data: past_q ? past : open })
      if (key === 'gte') return () => { past_q = true; return q }
      return () => q
    } }); return q
  },
  rpc(name: string, args: any) { return { throwOnError: async () => { if (name === 'evt_commit_cycle') commit = args; if (name === 'sleeve_marks') marksKey = args.p_key; return { data: { opened: args.p_entries?.length ?? 0 } } } } },
}
let now = T + 45_000
Date.now = () => now
globalThis.fetch = (async (url: string) => {
  const ok = (j: any) => ({ ok: true, status: 200, json: async () => j })
  const cat = /catalogId=(\d+)/.exec(url)?.[1]
  if (cat) return ok({ data: { catalogs: [{ articles: arts[cat] }] } })
  if (url.includes('premiumIndex')) return ok(Object.entries(book).map(([symbol, markPrice]) => ({ symbol, markPrice })))
  if (url.includes('fundingRate')) return ok(funding)
  const s = /depth\?symbol=([A-Z0-9]+)/.exec(url)?.[1]
  if (s && book[s]) return ok({ bids: [[String(book[s] * 0.999)]], asks: [[String(book[s] * 1.001)]], E: now })
  return { ok: false, status: 404, json: async () => ({}) }
}) as any
const state = (bal = 5000, params: any = {}) => ({ balance: bal, bot_params: params, hard_halt_at: null })
try {
  assert.equal(symOf('HYPEUSDT'), 'HYPE'); assert.equal(symOf('1000PEPEUSDT'), 'PEPE'); assert.equal(symOf('1000SATSUSDT'), '1000SATS')
  assert.deepEqual(evtConfig(), { perTrade: 0.25, maxOpen: 4, holdMs: 240 * 60e3, pollMs: 20_000 }, 'defaults: 25% x 4, 4h hold, poll 20 s')
  g.__EVT_PER_TRADE = '0.9'; assert.equal(evtConfig().perTrade, 0.34, 'per-trade capped at 34%'); delete g.__EVT_PER_TRADE

  // refuses live, a leveraged row and a foreign sleeve
  await assert.rejects(runEvt(db, state(), 'L', false), /paper-only/)
  open = [{ strategy: 'CHAN', paper_mode: true, lev: 1 }]; await assert.rejects(runEvt(db, state(), 'L', true), /LIST\/FUND\/FAST\/EVT/)
  open = [{ strategy: 'FAST', paper_mode: true, lev: 5 }]; await assert.rejects(runEvt(db, state(), 'L', true), /paper-only 1x/)
  open = []

  // a fresh listing (45 s) -> LONG the perp at the ask + slippage, 25% of equity, out in 240 min
  arts = { 48: [{ releaseDate: T, title: 'Binance Will List Hyperliquid (HYPE) with Seed Tag Applied' }], 161: [] }
  const r1: any = await runEvt(db, state(), 'L', true)
  assert.equal(commit.p_entries.length, 1); const e = commit.p_entries[0]
  assert.equal(e.sym, 'HYPE'); assert.equal(e.side, 'LONG'); assert.equal(e.notional, 1250)
  assert.ok(Math.abs(e.price - 40 * 1.001 * 1.0003) < 1e-9, 'entry at the ask plus slippage')
  assert.equal(Date.parse(e.exit_due), now + 240 * 60e3); assert.equal(e.announced_at, new Date(T).toISOString()); assert.equal(e.symbol, 'HYPEUSDT')
  assert.equal(commit.p_poll, now); assert.equal(commit.p_per_trade, 0.25); assert.equal(commit.p_max_open, 4); assert.ok(r1.changed)

  // the same announcement is never traded twice (already traded in the last 24h)
  past = [{ sym: 'HYPE', scalp_meta: { announced_at: new Date(T).toISOString() } }]; commit = null
  await runEvt(db, state(), 'L', true); assert.equal(commit.p_entries.length, 0, 'never twice'); past = []

  // a delisting of three coins -> SHORT each that has a perp (SCRT has none); 1000x contract priced as listed
  arts = { 48: [], 161: [{ releaseDate: T, title: 'Binance Will Delist ICX, SCRT, STORJ and SATS on 2026-10-15' }] }
  await runEvt(db, state(), 'L', true)
  assert.deepEqual(commit.p_entries.map((x: any) => `${x.side} ${x.sym}`), ['SHORT ICX', 'SHORT STORJ', 'SHORT 1000SATS'])
  assert.ok(Math.abs(commit.p_entries[0].price - 0.1 * 0.999 * 0.9997) < 1e-12, 'short at the bid minus slippage')
  // cash binds: the third short gets what is left
  await runEvt(db, state(2600), 'L', true)
  assert.deepEqual(commit.p_entries.map((x: any) => Math.round(x.notional)), [650, 650, 650].map((v, i) => i < 2 ? v : Math.round(Math.min(650, (2600 - 2 * 650 * 1.0005) / 1.0005))))

  // the open cap: 3 EVT rows already open -> only one more
  open = [1, 2, 3].map(i => ({ id: i, sym: `X${i}`, strategy: 'EVT', side: 'LONG', paper_mode: true, lev: 1, entry_price: 1, size: 100, opened_at: new Date(T).toISOString(), scalp_meta: { exit_due: new Date(T + 4 * 3600e3).toISOString() } }))
  await runEvt(db, state(), 'L', true); assert.equal(commit.p_entries.length, 1, 'cap of 4 open')

  // stale: first seen 11 minutes after the release -> nothing
  open = []; now = T + 11 * 60e3
  await runEvt(db, state(), 'L', true); assert.equal(commit.p_entries.length, 0, 'too late')

  // between polls: no RPC commit, the bot's marks are published for the house
  open = [{ id: 7, sym: 'HYPE', strategy: 'EVT', side: 'LONG', paper_mode: true, lev: 1, entry_price: 40, size: 25, opened_at: new Date(now).toISOString(), scalp_meta: { symbol: 'HYPEUSDT', exit_due: new Date(now + 3600e3).toISOString() } }]
  commit = null; const r2: any = await runEvt(db, state(5000, { evt_poll: now - 5_000 }), 'L', true)
  assert.equal(commit, null); assert.equal(marksKey, 'evt_marks'); assert.equal(r2.changed, false)

  // exit after 240 min at the bid, with the funding Binance settled over the hold (long pays a positive rate)
  now = Date.parse(open[0].scalp_meta.exit_due) + 1000; funding = [{ fundingRate: '0.0005' }, { fundingRate: '0.0003' }]
  await runEvt(db, state(5000, { evt_poll: now - 5_000 }), 'L', true)
  const c = commit.p_closes[0]
  assert.equal(c.id, 7); assert.equal(c.reason, 'HOLD_END'); assert.ok(Math.abs(c.price - 40 * 0.999 * 0.9997) < 1e-9)
  assert.ok(Math.abs(c.funding - 0.0008 * 1000) < 1e-9, 'long paid 0.08% of $1,000'); assert.equal(c.funding_missing, false)
  // funding history unavailable: wait up to 30 min, then close flagged
  funding = null as any; commit = null
  await runEvt(db, state(5000, { evt_poll: now - 5_000 }), 'L', true); assert.equal(commit, null, 'waits for funding')
  now += 31 * 60e3; await runEvt(db, state(5000, { evt_poll: now - 5_000 }), 'L', true)
  assert.equal(commit.p_closes[0].funding_missing, true)

  // v99.6 brake: sleeves_off.EVT -> a fresh announcement opens nothing, but a due position still exits
  const off = { sleeves_off: { EVT: { by: 'guardian', why: 'test' } } }
  now = T + 30_000; open = []; funding = []; commit = null
  arts = { 48: [{ releaseDate: T, title: 'Binance Will List Hyperliquid (HYPE)' }], 161: [] }
  const r3: any = await runEvt(db, state(5000, off), 'L', true)
  assert.equal(commit, null, 'brake: no poll, no entry'); assert.equal(r3.changed, false)
  open = [{ id: 9, sym: 'HYPE', strategy: 'EVT', side: 'LONG', paper_mode: true, lev: 1, entry_price: 40, size: 25, opened_at: new Date(now - 4 * 3600e3).toISOString(), scalp_meta: { symbol: 'HYPEUSDT', exit_due: new Date(now - 1000).toISOString() } }]
  await runEvt(db, state(5000, off), 'L', true)
  assert.equal(commit.p_closes.length, 1, 'brake keeps exits'); assert.equal(commit.p_entries.length, 0)
} finally { globalThis.fetch = realFetch; Date.now = realNow }

// the ledger re-checks the limits
const sql = readFileSync('supabase/migrations/20261001210000_evt_sleeve.sql', 'utf8')
assert.ok(sql.includes("pt:=least(greatest(coalesce(p_per_trade,0.25),0),0.34); mo:=least(greatest(coalesce(p_max_open,4),0),8);"), 'per-trade <= 34%, open <= 8')
assert.ok(sql.includes("if not s.active or not s.paper_mode then raise exception"), 'paper only')
assert.ok(sql.includes("values(x->>'sym',x->>'side',px,n/px,n*0.0005,null,px,px,'OPEN',true,'EVT',1,"), 'paper 1x rows')
assert.ok(sql.includes("now()+interval '245 minutes'") && sql.includes("now()-interval '11 minutes'"), 'hold <= 4h05m, entry <= 11 min after the release')
assert.ok(sql.includes("strategy='EVT' and sym=x->>'sym' and scalp_meta->>'announced_at'=x->>'announced_at'"), 'one trade per coin per announcement')
assert.ok(sql.includes("'list_marks','fund_marks','evt_marks'"), 'marks key allowed')
const idx = readFileSync('supabase/functions/trading-bot/index.ts', 'utf8')
assert.ok(idx.includes("evt = await runEvt(supabase, state, runLeaseUntil, paperMode && !liveMode)"), 'index passes paper to EVT')
for (const wf of ['deploy-edge-function.yml', 'enforce-no-loss-trading.yml']) {
  const w = readFileSync(`.github/workflows/${wf}`, 'utf8')
  assert.ok(w.includes("g.__ENABLED_SLEEVES = 'Q15,EVT,DONCH4H';") && w.includes("g.__EVT_PER_TRADE = '0.08'; g.__EVT_MAX_OPEN = '3';"), `${wf} shim (P-Q15: EVT2 8% x 3)`)
  assert.ok(w.includes("g.__LEVERAGE = '1'") || w.includes("__LEVERAGE='1'") || w.includes("g.__LEVERAGE='1'"), `${wf} 1x`)
}
console.log('EVT v99.5: all assertions passed')

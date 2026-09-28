import assert from 'node:assert/strict'
import { CHAN, chanView, type Bar } from '../shared/chan.ts'
import { runChan as rawRunChan } from '../supabase/functions/trading-bot/chan-runner.ts'
// Give each test the same independent wallet state as the SQL initializer.
async function runChan(db: any, state: any, lease: string, paper: boolean) {
  const wallets = { '1': {cash:state.balance/2}, '2': {cash:state.balance/2} }
  return rawRunChan(db,{...state,bot_params:{chan_split:{wallets},...state.bot_params}},lease,paper)
}
// v97.0 — the live CHAN path replayed against a mocked Binance + database
const M5 = 300_000, NOW = Math.floor(Date.UTC(2026, 8, 27, 10, 0) / M5) * M5 + 40_000, BAR = Math.floor(NOW / M5) * M5
let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
const gauss = () => { const u = Math.max(1e-12, rnd()), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) }
function ouBars(n: number, drop: boolean, sd = 7): Bar[] {
  seed = sd; let x = 0; const out: Bar[] = []
  // slow OU (half-life ~35 bars), calmer in the last 2,500 bars than before, so the current volatility is NOT extreme
  for (let i = 0; i < n; i++) { x = x - 0.02 * x + (i < n - 2500 ? 0.012 : 0.008) * gauss(); const c = 100 * Math.exp(x); out.push({ t: BAR - (n - i) * M5, o: c, h: c * 1.0005, l: c * 0.9995, c }) }
  if (drop) for (let k = 3; k >= 1; k--) { const b = out[n - k]; const c = out[n - k - 1].c * 0.986; out[n - k] = { ...b, c, l: c * 0.999, o: out[n - k - 1].c } }
  return out
}
const series: Record<string, Bar[]> = {}
CHAN.universe.forEach((s, k) => { series[s] = ouBars(9000, s === 'SOL', s === 'SOL' ? 7 : 100 + k) })
const v = chanView(series.SOL)!
assert.equal(v.regime, 1, 'fixture: SOL is in the mean-reverting regime'); assert.equal(v.mr.side, 1, 'fixture: SOL stretched far below its mean -> MR long')
let tape: Record<string, { p: number; T: number }[]> = {}
let rpc: any = null
const book = (px: number) => ({ bids: Array.from({ length: 50 }, (_, k) => [String(px * (1 - 0.0001 * (k + 1))), '1000']), asks: Array.from({ length: 50 }, (_, k) => [String(px * (1 + 0.0001 * (k + 1))), '1000']), E: Date.now() })
const original = globalThis.fetch, realNow = Date.now
function mockFetch() {
  globalThis.fetch = (async (url: string) => {
    const u = new URL(url), sym = (u.searchParams.get('symbol') ?? '').replace('USDT', '')
    let body: any
    if (u.pathname.endsWith('/klines')) {
      const e = u.searchParams.get('endTime'), end = e ? Number(e) : Infinity, lim = Number(u.searchParams.get('limit') ?? 500)
      const rows = series[sym].filter(b => b.t <= end).slice(-lim)
      body = rows.map(b => [b.t, String(b.o), String(b.h), String(b.l), String(b.c), '1', b.t + M5 - 1])
    } else if (u.pathname.endsWith('/aggTrades')) body = (tape[sym] ?? []).map((x, k) => ({ a: k, p: String(x.p), T: x.T }))
    else if (u.pathname.endsWith('/depth')) body = book(series[sym][series[sym].length - 1].c)
    else throw new Error('unexpected ' + url)
    return { ok: true, json: async () => body } as any
  }) as any
}
function mockDb(open: any[], closed: any[] = [], cache: any[] = []) {
  return { from: (table: string) => { const q: any = { _t: table, _open: false }
      const api: any = new Proxy(q, { get: (_o, k: string) => {
        if (k === 'throwOnError') return async () => ({ data: table === 'bot_trades' ? (q._neq ? closed : open) : table === 'market_cache' ? cache : [] })
        if (k === 'neq') return () => { q._neq = true; return api }
        if (k === 'insert') return async () => ({})
        return () => api } })
      return api },
    rpc: (name: string, args: any) => ({ throwOnError: async () => { rpc = { name, args }; return { data: { opened: args.p_entries.length } } } }) }
}
try {
  Date.now = () => NOW; mockFetch()
  // 1. flat book, fresh bar -> SOL mean-reversion long, aggressive paper allocation at fixed 50x
  await runChan(mockDb([]), { balance: 5000, bot_params: {} }, new Date(NOW + 50e3).toISOString(), true)
  assert.equal(rpc.name, 'chan_commit_cycle')
  const e = rpc.args.p_entries
  assert.equal(e.length, 1); assert.equal(e[0].sym, 'SOL'); assert.equal(e[0].side, 'LONG'); assert.equal(e[0].lev, 50)
  assert.equal(e[0].chan.comp, 'RG_MR'); assert.ok(e[0].chan.stop < e[0].price, 'mandatory stop below a long')
  assert.ok(Math.abs(e[0].chan.risk_frac - 0.01) < 5e-4, `risk at the stop = aggressive paper 1% minimum (${e[0].chan.risk_frac})`)
  assert.ok(e[0].notional <= 50 * 2500, '<= 50x own wallet equity'); assert.ok(rpc.args.p_bar, 'bar marked processed')
  assert.equal(rpc.args.p_halt, null)
  // 2. the same bar again -> nothing new
  await runChan(mockDb([]), { balance: 5000, bot_params: { chan_bar: BAR } }, new Date(NOW + 50e3).toISOString(), true)
  assert.equal(rpc.args.p_entries.length, 0)
  // 3. an open long whose stop traded on the tape -> STOP at the trigger print less book impact
  const pos = { id: 9, sym: 'BTC', side: 'LONG', entry_price: 100, size: 10, lev: 3, strategy: 'CHAN', paper_mode: true, opened_at: new Date(NOW - 600e3).toISOString(),
    scalp_meta: { chan: { comp: 'RG_MR', stop: 99, r: 1, best: 100, chk: NOW - 60e3, max_hold_bars: 100 } } }
  tape = { BTC: [{ p: 99.5, T: NOW - 30e3 }, { p: 98.9, T: NOW - 20e3 }, { p: 99.8, T: NOW - 10e3 }] }
  await runChan(mockDb([pos]), { balance: 4700, bot_params: { chan_bar: BAR } }, new Date(NOW + 50e3).toISOString(), true)
  assert.equal(rpc.args.p_closes.length, 1); assert.equal(rpc.args.p_closes[0].reason, 'STOP')
  assert.ok(rpc.args.p_closes[0].price < 98.9 && rpc.args.p_closes[0].price > 98.8, 'fills at the first print through the stop, less impact')
  // 4. v97.8 (owner: "never stop trading"): equity far under the recorded peak -> NO kill, no halt, the position stays open
  tape = {}
  await runChan(mockDb([{ ...pos, scalp_meta: { chan: { ...pos.scalp_meta.chan, stop: 50 } } }]), { balance: 3000, bot_params: { chan_risk: { peak: 5000, day: Math.floor(NOW / 86400000), dayOpen: 5000, pausedUntilDay: -1, streakFrom: 0, halted: false, haltReason: '' } } },
    new Date(NOW + 50e3).toISOString(), true)
  assert.ok(!rpc.args.p_halt, 'no drawdown kill')
  assert.equal(rpc.args.p_closes.length, 0)
  // 5. the whole universe (here 25 coins) in batches: <= 12 daily-statistics downloads per cycle, the bar closes only when all are done
  const syms = Array.from({ length: 25 }, (_, k) => `C${k}X`)
  syms.forEach((x, k) => { series[x] = ouBars(9000, false, 500 + k) })
  const uniCache = [{ data: { pairs: syms.map(x => ({ sym: x, s: `${x}USDT`, k: 1 })) }, ts: new Date(NOW).toISOString() }]
  let params: any = {}, cycles = 0
  do {
    await runChan(mockDb([], [], uniCache), { balance: 5000, bot_params: params }, new Date(NOW + 50e3).toISOString(), true)
    const n = rpc.args.p_note
    params = { chan_scan: n.scan, chan_risk: n.risk_state, ...(rpc.args.p_bar ? { chan_bar: BAR } : {}) }
    cycles++
    assert.ok(n.daily_refresh <= CHAN.scan.heavyPerCycle, 'daily-statistics downloads per cycle are capped')
  } while (!rpc.args.p_bar && cycles < 10)
  assert.equal(cycles, 3, '25 coins needing daily stats at <= 12 per cycle -> 3 cycles'); assert.equal(rpc.args.p_note.scanned, 25); assert.equal(rpc.args.p_note.complete, true)
  // 6. independent trend sleeve may hold SOL even while the old sleeve holds SOL.
  const trendBars = Array.from({length:160},(_,i)=>({t:i*M5,o:100+i*.05-.02,h:100+i*.05+.08,l:100+i*.05-.08,c:100+i*.05}))
  trendBars.push({t:160*M5,o:108,h:108.3,l:107.95,c:108.2},{t:161*M5,o:108.15,h:108.2,l:107.97,c:108.02},{t:162*M5,o:108.03,h:108.18,l:108,c:108.14})
  series.SOL=trendBars.map((b,i)=>({...b,t:BAR-(trendBars.length-i)*M5}))
  const trendCache=[
    {key:'universe',ts:new Date(NOW).toISOString(),data:{pairs:[{sym:'SOL',s:'SOLUSDT',k:1}]}},
    {key:'chan_daily',data:{SOL:{day:Math.floor(NOW/86400000),regime:0,hurst:.5,hl:60,t:0,vol:.001,volPct:.5}}},
    {key:'chan_vols',data:{}}
  ]
  tape={}
  const existing={...pos,sym:'SOL',scalp_meta:{chan:{...pos.scalp_meta.chan,stop:50}}}
  await runChan(mockDb([existing],[],trendCache),{balance:5000,bot_params:{}},new Date(NOW+50e3).toISOString(),true)
  assert.equal(rpc.args.p_entries.length,1,'second sleeve can enter an independently held symbol')
  const te=rpc.args.p_entries[0]
  assert.equal(te.chan.comp,'RG_TREND_PULLBACK');assert.equal(te.chan.sleeve,'2')
  assert.equal(te.chan.equity,2500,'uses its own wallet equity')
  assert.ok(Math.abs(te.chan.target-(te.price+2*te.chan.r))<1e-8,'target uses actual fill risk')
  await runChan(mockDb([existing],[],trendCache),{balance:5000,bot_params:{chan_split:{wallets:{'1':{cash:5000},'2':{cash:0}}}}},new Date(NOW+50e3).toISOString(),true)
  assert.equal(rpc.args.p_entries.length,0,'empty second wallet cannot borrow first wallet cash')
  await assert.rejects(()=>rawRunChan(mockDb([]),{balance:5000,bot_params:{}},'x',true),/split wallets missing/)
  // 7. a mixed book or a live account are refused
  await assert.rejects(() => runChan(mockDb([{ ...pos, strategy: 'FAST' }]), { balance: 1, bot_params: {} }, 'x', true), /CHAN rows only/)
  await assert.rejects(() => runChan(mockDb([]), { balance: 1, bot_params: {} }, 'x', false), /paper-only/)
} finally { globalThis.fetch = original; Date.now = realNow }
console.log('chan runner: entry, dedup, stop on the tape, kill switch, refusals ok')

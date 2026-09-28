// v97.x CHAN sleeve runner — the quant/ regime router traded live on PAPER (see shared/chan.ts for the rules and the
// NO-GO status).
// Every cycle (~5 s):
//   - stops resolved on the Binance aggTrades tape since the last check (exchange-side stop semantics, FAST's fill model)
//   - time exits, marks, and the risk state machine: (v97.7: no daily / streak pause, no open cap); -10% from peak ->
//     close everything + hard halt
// Once per CLOSED 5m bar, over the whole dynamic universe (~100 liquid USDT perps), in batches across the cycles of
// the first 3 minutes (v97.2):
//   - per bar only the last 320 candles per coin; the slow statistics (Hurst, half-life, vol percentile, regime,
//     momentum t) once per UTC day per coin from 4,300 candles, as the Python code re-estimates them daily, persisted
//     in market_cache 'chan_daily'; the daily vol history in 'chan_vols'
//   - regime + both strategies at the last closed bar; mean-reversion signal exits
//   - paper entries keep the same signal gates/stops, but run an aggressive 1-2% stop-risk allocation at fixed 50x isolated
// Binance request weight is metered from the X-MBX-USED-WEIGHT-1M header and new downloads stop near the budget.
// Books through chan_commit_cycle, which re-checks every limit in SQL.
import { CHAN, DAY_MS, RECENT_BARS, barView, canOpen, chanSize, dailyStats, dayVols, fundingCharge, kellyRisk, riskStep, type Bar, type Daily, type RiskState } from '../../../shared/chan.ts'
import { fastLiq, liqCap, resolveExit, walkBook } from '../../../shared/fast.ts'
import { slipFor } from '../../../shared/lab.ts'
import { UNIV, buildUniverse } from '../../../shared/universe.ts'
import { aggTrades, book, type Pair } from './fast-runner.ts'
import { json, pool } from './rota-runner.ts'

import { trendPullback } from '../../../shared/trend-pullback.ts'

const sleeveOf = (comp: string) => comp === 'RG_TREND_PULLBACK' ? '2' : '1'
const PAPER_LEVERAGE = 50
const PAPER_RISK_MIN = 0.01
const PAPER_RISK_MAX = 0.02
const PAPER_RISK_MULT = 4
// Portfolio crowding guard: it never halts scanning/trading. Once one direction owns
// most of the live book, additional same-side entries need a materially stronger signal;
// opposite-side candidates remain unrestricted and are prioritised.
const CROWD_MIN_POSITIONS = 6
const CROWD_NOTIONAL_SHARE = 0.72
const LIQ_STOP_MAX_SHARE = 0.60          // stop must sit inside 60% of the entry->liquidation distance
const MIN_NET_REWARD_RISK = 1.35         // after taker fees + modeled entry/exit slippage
const SYMBOL_COOLDOWN_BARS = 3           // after two consecutive losses on the same symbol
const BREADTH_MIN_SHARE = 0.45            // broad 5m participation needed for an ordinary directional entry
const REGIME = ['NEUTRAL', 'MEAN_REVERT', 'TREND', 'HIGH_VOL']
let usedWeight = 0, weightAt = 0

async function kl(p: Pair, limit: number, endTime?: number): Promise<any[]> {
  const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${p.s}&interval=5m&limit=${limit}${endTime ? `&endTime=${endTime}` : ''}`
  const r = await fetch(url, { signal: AbortSignal.timeout(6000) })
  const w = Number(r.headers?.get?.('x-mbx-used-weight-1m'))
  if (Number.isFinite(w)) { usedWeight = w; weightAt = Date.now() }
  if (!r.ok) throw new Error(`klines HTTP ${r.status}`)
  return r.json()
}
const weightLeft = () => (Date.now() - weightAt > 60_000 ? CHAN.scan.weightBudget : CHAN.scan.weightBudget - usedWeight)
const toBar = (p: Pair) => (x: any): Bar => ({ t: +x[0], o: +x[1] / p.k, h: +x[2] / p.k, l: +x[3] / p.k, c: +x[4] / p.k })

// v97.6: the exchange's own funding settlements for a held position (null = could not be read -> flagged, not guessed)
async function fundingRows(p: Pair, from: number, to: number): Promise<any[] | null> {
  try { const r = await json(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${p.s}&startTime=${from}&endTime=${to}&limit=1000`); return Array.isArray(r) ? r : null } catch { return null }
}
async function fundingFor(t: any, P: Pair, closedAt: number) {
  const f = fundingCharge(t.side, Number(t.size), P.k, Number(t.entry_price), Date.parse(t.opened_at), closedAt, await fundingRows(P, Date.parse(t.opened_at), closedAt))
  return { amount: f.amount, source: 'binance_fundingRate', complete: f.complete, missing_mark: f.missingMark, events: f.events.length,
    ...(f.complete ? {} : { missing: 'funding history unavailable or mark price missing — flagged, see ledger' }) }
}

export async function closedBars(p: Pair, now: number, n: number = CHAN.bars): Promise<Bar[]> {
  const out = new Map<number, Bar>()
  let end = now
  for (let page = 0; page < Math.ceil(n / 1500) + 1 && out.size < n; page++) {
    const r = await kl(p, 1500, end)
    if (!Array.isArray(r) || !r.length) break
    for (const x of r) if (Number(x[6]) < now) out.set(+x[0], toBar(p)(x))   // CLOSED candles only
    end = Number(r[0][0]) - 1
    if (r.length < 1500) break
  }
  return [...out.values()].sort((a, b) => a.t - b.t).slice(-n)
}
async function recentBars(p: Pair, now: number): Promise<Bar[]> {
  const r = await kl(p, RECENT_BARS + 2)
  return r.filter((x: any) => Number(x[6]) < now).map(toBar(p)).slice(-RECENT_BARS)   // CLOSED candles only
}

async function loadUniverse(db: any, now: number): Promise<{ pairs: Pair[]; note: string }> {
  let note = ''
  const { data: c } = await db.from('market_cache').select('data,ts').eq('key', 'universe').throwOnError()
  let u = c?.[0]?.data, ts = c?.[0]?.ts ?? ''
  if (!u || now - Date.parse(ts) >= UNIV.refreshMs) {
    try {
      const [ex, tk, books] = await Promise.all([json('https://fapi.binance.com/fapi/v1/exchangeInfo'), json('https://fapi.binance.com/fapi/v1/ticker/24hr'), json('https://fapi.binance.com/fapi/v1/ticker/bookTicker')])
      const r = buildUniverse(ex, tk, books, now)
      if (r.pairs.length < 20) throw new Error(`only ${r.pairs.length} pairs`)
      u = r; ts = new Date(now).toISOString()
      await db.from('market_cache').upsert({ key: 'universe', data: u, ts }).throwOnError()
    } catch (e: any) { note = 'universe refresh failed: ' + String(e?.message ?? e).slice(0, 60) }
  }
  const pairs: Pair[] = u?.pairs?.length ? u.pairs.map((x: any) => ({ sym: String(x.sym), s: String(x.s), k: Number(x.k) || 1 }))
    : CHAN.universe.map(s => ({ sym: s, s: `${s}USDT`, k: 1 }))
  return { pairs, note: u?.pairs?.length ? note : note + ' · 10-coin fallback' }
}

function initRisk(st: any, equity: number): RiskState {
  return { peak: Number(st?.peak) || equity, day: Number.isFinite(st?.day) ? st.day : -1, dayOpen: Number(st?.dayOpen) || equity,
    pausedUntilDay: Number.isFinite(st?.pausedUntilDay) ? st.pausedUntilDay : -1, streakFrom: Number(st?.streakFrom) || 0,
    halted: !!st?.halted, haltReason: String(st?.haltReason ?? '') }
}

export async function runChan(db: any, state: any, lease: string, paper: boolean) {
  if (!paper) throw new Error('CHAN is paper-only; refusing live execution')
  const now = Date.now(), params = state.bot_params || {}
  const wallets = params.chan_split?.wallets
  if (!wallets?.['1'] || !wallets?.['2']) throw new Error('CHAN split wallets missing')
  const { data: open } = await db.from('bot_trades').select('*').eq('status', 'OPEN').throwOnError()
  if (open.some((t: any) => t.paper_mode !== true || t.strategy !== 'CHAN')) throw new Error('CHAN requires a paper book with CHAN rows only')
  const { data: hist } = await db.from('bot_trades').select('sym,side,pnl,risk_usd,closed_at,status,scalp_meta').eq('strategy', 'CHAN').neq('status', 'OPEN')
    .order('closed_at', { ascending: false }).limit(1000).throwOnError()
  const closedAll = (hist ?? []).filter((x:any)=>x.status !== 'RESET').map((x: any) => ({
    sym: String(x.sym ?? ''), side: String(x.side ?? ''), pnl: Number(x.pnl), closedAt: Date.parse(x.closed_at),
    r: Number(x.risk_usd) > 0 ? Number(x.pnl) / Number(x.risk_usd) : 0,
    comp: x.scalp_meta?.chan?.comp, regime: x.scalp_meta?.chan?.regime
  }))
  const uni = await loadUniverse(db, now)
  const bySym = new Map(uni.pairs.map(p => [p.sym, p]))
  const pairOf = (sym: string): Pair => bySym.get(sym) ?? (sym === 'PEPE' ? { sym, s: '1000PEPEUSDT', k: 1000 } : { sym, s: `${sym}USDT`, k: 1 })

  // Continuous light market sweep: every bot cycle rotates across the entire Futures universe.
  // Entry signals still use CLOSED 5m bars; this sweep never invents entries and never stops between bars.
  let liveScan: any = { status: 'continuous', ts: new Date(now).toISOString(), total: uni.pairs.length, checked: [] }
  try {
    const rows = await json('https://fapi.binance.com/fapi/v1/ticker/bookTicker')
    const tick = new Map<string, any>((Array.isArray(rows) ? rows : []).map((x: any) => [String(x.symbol), x]))
    const total = Math.max(1, uni.pairs.length), prev = params.chan_cycle?.live_scan ?? {}
    const cursor = Math.max(0, Number(prev.cursor) || 0) % total
    const batchSize = Math.min(24, total)
    const checked = Array.from({ length: batchSize }, (_, i) => uni.pairs[(cursor + i) % total]).map(P => {
      const x: any = tick.get(P.s), bid = Number(x?.bidPrice) / P.k, ask = Number(x?.askPrice) / P.k
      const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : NaN
      return { sym: P.sym, bid, ask, spread_bps: Number.isFinite(mid) && mid > 0 ? +((ask - bid) / mid * 1e4).toFixed(2) : null }
    })
    const rawNext = cursor + batchSize
    liveScan = {
      status: 'continuous', ts: new Date(now).toISOString(), total, checked,
      cursor: rawNext % total, batch_size: batchSize,
      loop: (Number(prev.loop) || 0) + (rawNext >= total ? 1 : 0)
    }
  } catch (e: any) {
    liveScan = { ...liveScan, error: String(e?.message ?? e).slice(0, 100) }
  }

  const closes: any[] = [], marks: Record<string, number> = {}, openLive: Record<string, any> = {}, updates: any[] = [], closing = new Set<number>()
  const bookClose = async (t: any, reason: string, extra: any = {}) => {
    const fu = await fundingFor(t, pairOf(t.sym), Date.now())   // before the book, so the quote stays fresh for the ledger
    const dir = t.side === 'LONG' ? 1 : -1, bk = await book(pairOf(t.sym))
    const top = dir > 0 ? bk.bids[0][0] : bk.asks[0][0], w = walkBook(dir > 0 ? bk.bids : bk.asks, Number(t.entry_price) * Number(t.size))
    const imp = Math.max(Number.isFinite(w.impact) ? w.impact : 0, slipFor(t.sym))
    marks[t.sym] = top
    closes.push({ id: t.id, price: top * (1 - dir * imp), reason, quote_ts: bk.E, funding: fu, fill: { model: 'book_walk', impact_bps: +(imp * 1e4).toFixed(2), depth_usd: Math.round(w.depthUsd), beyond_book: w.beyond, ...extra } })
    closing.add(t.id)
  }
  // 1. exchange-side stop, replayed on the real trade tape since the last check; time exits
  await pool<any>(open, 5, async (t) => {
    try {
      const m = t.scalp_meta?.chan, dir = (t.side === 'LONG' ? 1 : -1) as 1 | -1
      if (!m) return
      const entry = Number(t.entry_price), P = pairOf(t.sym)
      const from = Math.max(Date.parse(t.opened_at), Number(m.chk) || 0, now - 3_500_000) + 1
      const tr = await aggTrades(P, from, now)
      const res = resolveExit({ dir, entry, r: Number(m.r), stop: Number(m.stop), target: m.comp === 'RG_TREND_PULLBACK' ? Number(m.target) : null, liq: fastLiq(dir, entry, Number(t.lev) || 1), best: Number(m.best ?? entry), trail: false }, tr.trades)
      if (res.why) {
        const fu = await fundingFor(t, P, res.T)
        const bk = await book(P), w = walkBook(dir > 0 ? bk.bids : bk.asks, entry * Number(t.size))
        const imp = Math.max(Number.isFinite(w.impact) ? w.impact : 0, slipFor(t.sym))
        const price = (res.why === 'STOP' || res.why === 'TARGET') ? res.px * (1 - dir * imp) : res.px
        closes.push({ id: t.id, price, reason: res.why, quote_ts: Date.now(), funding: fu, fill: { model: tr.complete ? 'aggTrades' : 'aggTrades_truncated', trigger_ts: res.T, trigger_px: res.px, lag_ms: now - res.T, impact_bps: +(imp * 1e4).toFixed(2) } })
        closing.add(t.id); marks[t.sym] = price
        return
      }
      if (now - Date.parse(t.opened_at) >= Number(m.max_hold_bars) * CHAN.barMs) { await bookClose(t, 'TIMEOUT'); return }
      const bk = await book(P)
      const mark = dir > 0 ? bk.bids[0][0] : bk.asks[0][0]
      marks[t.sym] = mark
      const size = Number(t.size), lev = Math.max(1, Number(t.lev) || 1), notional = entry * size
      const w = walkBook(dir > 0 ? bk.bids : bk.asks, notional)
      const impact = Math.max(Number.isFinite(w.impact) ? w.impact : 0, slipFor(t.sym))
      const estExit = mark * (1 - dir * impact)
      const grossMark = dir * (mark - entry) * size
      const grossExec = dir * (estExit - entry) * size
      const entryFee = Number(t.scalp_meta?.entry_fee ?? t.fee ?? notional * CHAN.costs.taker)
      const exitFee = estExit * size * CHAN.costs.taker
      const exitSlipUsd = Math.abs(mark - estExit) * size
      const entryImpactBps = Number(m.entry_fill?.impact_bps ?? 0)
      const entrySlipUsd = Number.isFinite(entryImpactBps) ? notional * Math.max(0, entryImpactBps) / 1e4 : 0
      const mg = notional / lev
      const netToClose = grossExec - entryFee - exitFee
      openLive[String(t.id)] = {
        id: t.id, sym: t.sym, side: t.side, comp: m.comp, opened_at: t.opened_at,
        leverage: lev, size, notional, margin: mg, entry, mark, est_exit: estExit,
        stop: Number(m.stop), target: m.target == null ? null : Number(m.target),
        liq: fastLiq(dir, entry, lev), regime: m.regime, z: m.z, t_sig: m.t_sig,
        gross_mark_pnl: grossMark, gross_exec_pnl: grossExec, net_pnl_to_close: netToClose,
        roe_net: mg > 0 ? netToClose / mg : null,
        entry_fee: entryFee, exit_fee_est: exitFee,
        entry_slippage_usd: entrySlipUsd, exit_slippage_usd: exitSlipUsd,
        entry_impact_bps: entryImpactBps, exit_impact_bps: +(impact * 1e4).toFixed(2),
        fee_rate_taker: CHAN.costs.taker, quote_ts: bk.E, depth_usd: Math.round(w.depthUsd),
        kelly_f: m.kelly_f, risk_usd: m.risk_usd, kelly_why: m.kelly_why
      }
      if (res.lastT && res.lastT > (Number(m.chk) || 0)) updates.push({ id: t.id, chk: res.lastT })
    } catch { /* no data this cycle: the next one re-reads every trade since the last check */ }
  })
  // 2. equity (cash + margin + unrealised at the marks) and the risk state machine
  const stillOpen = open.filter((t: any) => !closing.has(t.id))
  const unreal = (t: any) => (t.side === 'LONG' ? 1 : -1) * ((marks[t.sym] ?? Number(t.entry_price)) - Number(t.entry_price)) * Number(t.size)
  const margin = (t: any) => Number(t.entry_price) * Number(t.size) / Math.max(1, Number(t.lev) || 1)
  const closedMargin = closes.reduce((s, c) => { const t = open.find((x: any) => x.id === c.id); return s + (t ? margin(t) + (t.side === 'LONG' ? 1 : -1) * (c.price - Number(t.entry_price)) * Number(t.size) : 0) }, 0)
  const equity = Number(state.balance) + closedMargin + stillOpen.reduce((s: number, t: any) => s + margin(t) + unreal(t), 0)
  const { st, ev } = riskStep(initRisk(params.chan_risk, equity), now, equity, closedAll)
  let halt: string | null = null
  if (ev === 'KILL') {
    for (const t of stillOpen) { try { await bookClose(t, 'KILL') } catch { /* the ledger halts entries regardless */ } }
    halt = st.haltReason
  }
  // 3. the bar scan, in batches over the cycles of the first CHAN.scan.windowMs after each 5m close
  const bar = Math.floor(now / CHAN.barMs) * CHAN.barMs
  const lastBar = Number(params.chan_bar) || 0
  const scan0 = params.chan_scan?.bar === bar ? params.chan_scan : { bar, done: [] as string[], skipped: 0, fetched: 0 }
  const inWindow = bar > lastBar && now - bar <= CHAN.scan.windowMs && !st.halted && !state.hard_halt_at
  const entries: any[] = [], decisions: any[] = [], views: Record<string, any> = {}, failed: string[] = []
  const done = new Set<string>(scan0.done), heldSyms = stillOpen.map((t: any) => String(t.sym))
  let heavy = 0, deep = 0, finished = false, volsChanged = false, dailyChanged = false, staleDaily = 0
  let vols: Record<string, { d: number; v: number }[]> = {}, daily: Record<string, Daily & { day: number }> = {}
  let breadth: any = { n:0, up_share:0.5, down_share:0.5, btc_ret5:null, eth_ret5:null }
  const directionBook: Record<'LONG'|'SHORT', { count:number; notional:number }> = {
    LONG: { count: 0, notional: 0 }, SHORT: { count: 0, notional: 0 }
  }
  for (const t of stillOpen.filter((t:any)=>!closing.has(t.id))) {
    const s = t.side === 'LONG' ? 'LONG' : 'SHORT'
    directionBook[s].count++
    directionBook[s].notional += Number(t.entry_price) * Number(t.size)
  }
  if (inWindow) {
    const { data: vc } = await db.from('market_cache').select('key,data').in('key', ['chan_vols', 'chan_daily']).throwOnError()
    vols = (vc ?? []).find((x: any) => x.key === 'chan_vols')?.data ?? {}
    daily = (vc ?? []).find((x: any) => x.key === 'chan_daily')?.data ?? {}
    const today = Math.floor(bar / DAY_MS)          // the slow stats are anchored at today's 00:00 UTC close
    const universe = [...new Set([...heldSyms, ...uni.pairs.map(p => p.sym)])]
    const todo = universe.filter(s => !done.has(s)).slice(0, CHAN.scan.perCycle)
    await pool(todo, 10, async (sym) => {
      const P = pairOf(sym)
      try {
        let d = daily[sym]
        if ((!d || d.day < today) && heavy < CHAN.scan.heavyPerCycle && weightLeft() > 80) {
          heavy++
          const hb = await closedBars(P, today * DAY_MS)            // the window ending at today's midnight close
          let h = vols[sym] ?? []
          const known = new Set(h.map(x => x.d))
          for (const x of dayVols(hb)) if (!known.has(x.d)) h.push(x)
          if (h.filter(x => x.d > 0).length < CHAN.regime.minHist + 1 && deep < CHAN.scan.deepPerCycle && !h.some(x => x.d < 0) && weightLeft() > 120) {
            deep++                                   // one-time deeper history so the high-volatility filter works from day one
            const d9 = await closedBars(P, today * DAY_MS, CHAN.scan.deepBars)
            const k2 = new Set(h.map(x => x.d))
            for (const x of dayVols(d9)) if (!k2.has(x.d)) h.push(x)
            if (h.filter(x => x.d > 0).length < CHAN.regime.minHist + 1) h.push({ d: -1, v: NaN })   // young listing: tried
          }
          h = h.sort((a, b) => a.d - b.d).slice(-(CHAN.regime.maxHist + 3))
          vols[sym] = h; volsChanged = true
          const ds = hb.length && hb[hb.length - 1].t + CHAN.barMs === today * DAY_MS
            ? dailyStats(hb, h.filter(x => x.d > 0 && x.d < today && Number.isFinite(x.v)).map(x => x.v)) : null
          if (ds) { d = { ...ds, day: today }; daily[sym] = d; dailyChanged = true }
        }
        if (!d) { if (heavy >= CHAN.scan.heavyPerCycle || weightLeft() <= 80) return; done.add(sym); return }   // no stats yet: retry / too young
        if (d.day < today) staleDaily++              // yesterday's stats until today's are computed (<= a few minutes)
        const bars = await recentBars(P, now)
        if (!bars.length || bars[bars.length - 1].t + CHAN.barMs !== bar) { failed.push(sym); done.add(sym); return }   // stale feed: never trade on it
        const v = barView(bars, d)
        if (v) {
          const last = bars[bars.length - 1]?.c, prev = bars[bars.length - 2]?.c
          views[sym] = { ...v,
            ret5: Number.isFinite(last) && Number.isFinite(prev) && prev > 0 ? last / prev - 1 : NaN,
            pullback: Number.isFinite(d.volPct) && d.volPct <= CHAN.regime.volPctHigh ? trendPullback(bars) : null
          }
        }
        done.add(sym)
      } catch { failed.push(sym) }
    })
    finished = universe.every(s => done.has(s))
    // mean-reversion signal exits for the positions scanned in this batch
    for (const t of stillOpen) {
      if (closing.has(t.id)) continue
      const v = views[t.sym], m = t.scalp_meta?.chan
      if (v && m?.comp === 'RG_MR' && ((t.side === 'LONG' && v.mr.exitLong) || (t.side === 'SHORT' && v.mr.exitShort))) {
        try { await bookClose(t, 'SIGNAL', { z: v.mr.z }) } catch { /* retried next bar */ }
      }
    }
    // entries: this batch's candidates, strongest first
    let openN = stillOpen.filter((t: any) => !closing.has(t.id)).length
    let openNotional = stillOpen.filter((t: any) => !closing.has(t.id)).reduce((s: number, t: any) => s + Number(t.entry_price) * Number(t.size), 0)
    let cash = Number(state.balance)
    const held = new Set(stillOpen.filter((t: any) => !closing.has(t.id)).map((t: any) => sleeveOf(t.scalp_meta?.chan?.comp) + ':' + t.sym))
    const budgets = Object.fromEntries(['1','2'].map(bucket => {
      const positions = stillOpen.filter((t: any) => sleeveOf(t.scalp_meta?.chan?.comp) === bucket)
      const walletCash = Number(wallets[bucket].cash)
      return [bucket, { cash: walletCash, equity: walletCash + positions.reduce((s: number,t: any)=>s+margin(t)+unreal(t),0),
        notional: positions.reduce((s: number,t: any)=>s+Number(t.entry_price)*Number(t.size),0) }]
    }))
    const rsOf = (comp: string) => closedAll.filter((x: any) => x.comp === comp).map((x: any) => x.r).reverse()

    const perfGroup = (rows:any[]) => {
      const good = rows.filter(x=>Number.isFinite(x.r)), n = good.length
      if (!n) return { n:0, avgR:0, win:0.5, signal:0 }
      const avgR = good.reduce((s,x)=>s+x.r,0)/n
      const win = good.filter(x=>x.pnl>0).length/n
      const shrink = n/(n+8)
      return { n, avgR, win, signal: shrink * (0.65*Math.tanh(avgR) + 0.35*(2*win-1)) }
    }
    const learnedQuality = (cand:any, sym:string, side:'LONG'|'SHORT') => {
      const regime = REGIME[cand.v.regime]
      const groups = [
        [0.30, closedAll.filter((x:any)=>x.comp===cand.comp)],
        [0.20, closedAll.filter((x:any)=>x.comp===cand.comp && x.side===side)],
        [0.20, closedAll.filter((x:any)=>x.comp===cand.comp && x.regime===regime)],
        [0.15, closedAll.filter((x:any)=>x.sym===sym)],
        [0.15, closedAll.filter((x:any)=>x.comp===cand.comp && x.side===side && x.regime===regime && x.sym===sym)]
      ] as const
      let signal=0, samples=0
      for (const [w,rows] of groups) { const g=perfGroup(rows as any[]); signal += w*g.signal; samples += g.n }
      return { weight: Math.max(0.72,Math.min(1.18,1+signal*0.35)), samples, regime }
    }
    const strongSignal = (cand:any, strict=false) => {
      const v=cand.v, z=Math.abs(Number(v.mr.z)), t=Math.abs(Number(v.mom.t)), h=Number(v.hurst)
      if (cand.comp==='RG_MR') return z >= (strict ? 3.2 : 3.0)
      if (cand.comp==='RG_MOM') return t >= (strict ? 2.6 : 2.25)
      return h >= (strict ? 0.53 : 0.50) && (t >= (strict ? 1.25 : 0.9) || z >= (strict ? 2.5 : 2.0))
    }
    const cooldownState = (sym:string) => {
      const rows = closedAll.filter((x:any)=>x.sym===sym)
      if (rows.length < 2 || !(rows[0].pnl < 0 && rows[1].pnl < 0)) return { active:false, bars:Infinity, losses:0 }
      const bars = Math.floor((now - rows[0].closedAt)/CHAN.barMs)
      return { active: bars < SYMBOL_COOLDOWN_BARS, bars, losses:2 }
    }

    const breadthRows = Object.values(views).filter((v:any)=>Number.isFinite(v.ret5)) as any[]
    const up = breadthRows.filter((v:any)=>v.ret5>0).length, down = breadthRows.filter((v:any)=>v.ret5<0).length
    breadth = {
      n: breadthRows.length,
      up_share: breadthRows.length ? up/breadthRows.length : 0.5,
      down_share: breadthRows.length ? down/breadthRows.length : 0.5,
      btc_ret5: Number.isFinite(Number((views as any).BTC?.ret5)) ? Number((views as any).BTC?.ret5) : null,
      eth_ret5: Number.isFinite(Number((views as any).ETH?.ret5)) ? Number((views as any).ETH?.ret5) : null
    }
    const marketConfirm = (cand:any) => {
      if (breadth.n < 20) return { ok:true, share:0.5, majors:0, n:breadth.n }
      const wantLong = cand.side > 0
      const share = wantLong ? breadth.up_share : breadth.down_share
      const majors = [breadth.btc_ret5,breadth.eth_ret5].filter(Number.isFinite)
      const majorAgree = majors.filter((r:number)=>wantLong ? r>0 : r<0).length
      return { ok: share >= BREADTH_MIN_SHARE || (majors.length===2 && majorAgree===2), share, majors:majorAgree, n:breadth.n }
    }

    const crowdState = (side:'LONG'|'SHORT') => {
      const gross = directionBook.LONG.notional + directionBook.SHORT.notional
      const row = directionBook[side]
      const share = gross > 0 ? row.notional / gross : 0
      return { active: row.count >= CROWD_MIN_POSITIONS && share >= CROWD_NOTIONAL_SHARE, count: row.count, share, gross }
    }
    const strongEnoughWhenCrowded = (cand:any) => {
      const v = cand.v, regime = REGIME[v.regime]
      if (cand.comp === 'RG_MR') return Math.abs(Number(v.mr.z)) >= 3
      if (cand.comp === 'RG_MOM') return Math.abs(Number(v.mom.t)) >= 2
      // Trend-pullback: require actual persistence when the portfolio is already crowded.
      // A TREND regime with Hurst >= .50, or a strong persistent NEUTRAL regime, is accepted.
      const h = Number(v.hurst)
      return (regime === 'TREND' && h >= .50) || (regime === 'NEUTRAL' && h >= .55)
    }

    const initialGross = directionBook.LONG.notional + directionBook.SHORT.notional
    const initialDominant: 'LONG'|'SHORT'|null = initialGross <= 0 ? null :
      directionBook.LONG.notional >= directionBook.SHORT.notional ? 'LONG' : 'SHORT'
    const initialDomShare = initialDominant ? directionBook[initialDominant].notional / initialGross : 0
    const prioritiseOpposite = !!initialDominant &&
      directionBook[initialDominant].count >= CROWD_MIN_POSITIONS && initialDomShare >= CROWD_NOTIONAL_SHARE

    const cands = Object.entries(views).flatMap(([sym, v]: [string, any]) => {
      const c = v.mr.side ? { comp: 'RG_MR', side: v.mr.side, stop: v.mr.side > 0 ? v.mr.stopLong : v.mr.stopShort, maxHold: v.mr.maxHold, strength: Math.abs(v.mr.z) }
        : v.mom.side ? { comp: 'RG_MOM', side: v.mom.side, stop: v.mom.side > 0 ? v.mom.stopLong : v.mom.stopShort, maxHold: CHAN.params.RG_MOM.hold, strength: v.mom.t } : null
      const extra = v.pullback ? { comp: 'RG_TREND_PULLBACK', side: v.pullback.side, stop: v.pullback.stop,
        maxHold: 48, strength: 1, level: v.pullback.level, breakoutAt: v.pullback.breakoutAt } : null
      return [c,extra].filter(Boolean).map(c => ({sym,v,...c}))
    }).filter(Boolean).sort((a: any, b: any) => {
      if (prioritiseOpposite && initialDominant) {
        const ao = (a.side > 0 ? 'LONG' : 'SHORT') !== initialDominant ? 1 : 0
        const bo = (b.side > 0 ? 'LONG' : 'SHORT') !== initialDominant ? 1 : 0
        if (ao !== bo) return bo - ao
      }
      const aw = learnedQuality(a, a.sym, a.side > 0 ? 'LONG' : 'SHORT').weight
      const bw = learnedQuality(b, b.sym, b.side > 0 ? 'LONG' : 'SHORT').weight
      return (b.strength*bw) - (a.strength*aw)
    }) as any[]
    for (const cand of cands) {
      const { sym, v } = cand
      const side = cand.side > 0 ? 'LONG' : 'SHORT'
      const rec = (decision: string, reason: string, extra: any = {}) => decisions.push({ sym, comp: cand.comp, side, decision, reason, regime: REGIME[v.regime], hurst: v.hurst, vol_pct: v.volPct, z: v.mr.z, hl: v.mr.hl, t_sig: v.mom.t, ...extra })
      const bucket = sleeveOf(cand.comp), budget = budgets[bucket]
      if (held.has(bucket + ':' + sym)) { rec('rejected', 'coin_held'); continue }

      // 1) Trend-pullback must not behave like a trend strategy inside a mean-reverting regime
      // unless both the momentum statistic and the mean-reversion location strongly agree with the direction.
      if (cand.comp === 'RG_TREND_PULLBACK' && REGIME[v.regime] === 'MEAN_REVERT') {
        const z = Number(v.mr.z), t = Math.abs(Number(v.mom.t))
        const locationSupports = Number.isFinite(z) && (-cand.side * z) >= 1.5
        if (!(t >= 1.5 && locationSupports)) {
          rec('rejected','regime_mismatch_trend_in_mean_revert',{ gate_t:t, gate_z:z })
          continue
        }
      }

      // 4) Two consecutive symbol losses trigger only a temporary stronger-signal requirement.
      const cd = cooldownState(sym)
      if (cd.active && !strongSignal(cand,true)) {
        rec('rejected','symbol_cooldown_weak_signal',{ cooldown_bars_left: SYMBOL_COOLDOWN_BARS-cd.bars, recent_symbol_losses:cd.losses })
        continue
      }

      // 6) Live learning is deliberately shrinkage-heavy so a tiny sample cannot overfit the bot.
      const learned = learnedQuality(cand,sym,side)
      if (learned.samples >= 6 && learned.weight < 0.88 && !strongSignal(cand,true)) {
        rec('rejected','adaptive_quality_weak',{ learning_weight:learned.weight, learning_samples:learned.samples })
        continue
      }

      // 5) If the candidate fights broad 5m participation + BTC/ETH, demand an exceptional signal.
      const mc = marketConfirm(cand)
      if (!mc.ok && !strongSignal(cand,true)) {
        rec('rejected','market_breadth_against',{ breadth_share:mc.share, breadth_n:mc.n, majors_agree:mc.majors })
        continue
      }

      const crowd = crowdState(side)
      if (crowd.active && !strongEnoughWhenCrowded(cand)) {
        rec('rejected', 'direction_crowding_weak_signal', {
          crowd_side: side, crowd_count: crowd.count, crowd_share: crowd.share,
          crowd_rule: cand.comp === 'RG_TREND_PULLBACK'
            ? 'TREND H>=0.50 or NEUTRAL H>=0.55'
            : cand.comp === 'RG_MR' ? '|Z|>=3' : '|t|>=2'
        })
        continue
      }

      const co = canOpen(st, openN)
      if (!co.ok) { rec('rejected', co.why); continue }
      const estimated = kellyRisk(rsOf(cand.comp))
      // Owner requested continuous PAPER trading after losses (2026-09-28).
      // runChan refuses live execution; retain signal, data, stop and cash checks.
      const k = Number.isFinite(estimated.f) && estimated.f <= 0
        ? { f: Math.min(CHAN.risk.defaultRisk, CHAN.risk.cap), why: `paper continuation fallback; ${estimated.why}` }
        : estimated
      if (!(Number.isFinite(k.f) && k.f > 0)) { rec('rejected', k.why); continue }
      let bk: Awaited<ReturnType<typeof book>>
      try { bk = await book(pairOf(sym)) } catch { rec('rejected', 'no_book'); continue }
      const touch = cand.side > 0 ? bk.asks[0][0] : bk.bids[0][0]
      if (!(cand.side * (touch - cand.stop) > 0)) { rec('rejected', 'stop_on_wrong_side_of_market'); continue }
      const aggressiveRisk = Math.min(PAPER_RISK_MAX, Math.max(PAPER_RISK_MIN, k.f * PAPER_RISK_MULT))
      const sz = chanSize(aggressiveRisk, budget.equity, touch, cand.stop, budget.notional, PAPER_LEVERAGE)
      if (!(sz.notional > 0)) { rec('rejected', sz.why); continue }
      const dist = Math.abs(touch - cand.stop) / touch
      const cap = liqCap(cand.side > 0 ? bk.asks : bk.bids, cand.side > 0 ? bk.bids : bk.asks, 0.25 * dist)
      const notional = Math.min(sz.notional, cap, Math.max(0, equity * PAPER_LEVERAGE - openNotional), Math.max(0, Math.min(cash, budget.cash)) * PAPER_LEVERAGE / (1 + PAPER_LEVERAGE * CHAN.costs.taker))
      if (notional / PAPER_LEVERAGE < 5) { rec('rejected', 'too_small_or_book_too_thin', { want: sz.notional, liq_cap: cap }); continue }
      const w = walkBook(cand.side > 0 ? bk.asks : bk.bids, notional)
      const floorPx = touch * (1 + cand.side * slipFor(sym)), px = cand.side > 0 ? Math.max(w.vwap, floorPx) : Math.min(w.vwap, floorPx)
      if (!(cand.side * (px - cand.stop) > 0)) { rec('rejected', 'fill_beyond_stop'); continue }
      const r = Math.abs(px - cand.stop)

      // 2) At 50x a stop too near liquidation is not a meaningful stop. Keep a hard buffer.
      const liqPx = fastLiq(cand.side > 0 ? 1 : -1, px, PAPER_LEVERAGE)
      const liqDist = Math.abs(liqPx-px), stopDist = Math.abs(cand.stop-px)
      const liqStopShare = liqDist > 0 ? stopDist/liqDist : Infinity
      if (!(Number.isFinite(liqStopShare) && liqStopShare <= LIQ_STOP_MAX_SHARE)) {
        rec('rejected','stop_too_close_to_liquidation',{ liq_px:liqPx, stop_liq_share:liqStopShare, max_share:LIQ_STOP_MAX_SHARE })
        continue
      }

      // 3) Profit gate uses the actual fill, fees and current opposite-side book impact.
      // MR uses its Z=0 mean, trend-pullback its real 2R target; momentum uses 2R only as an entry viability reference.
      const referenceTarget = cand.comp === 'RG_MR' && Number.isFinite(Number(v.mr.mean))
        ? Math.exp(Number(v.mr.mean))
        : px + cand.side * 2 * r
      const exitWalk = walkBook(cand.side > 0 ? bk.bids : bk.asks, notional)
      const exitImpact = Math.max(Number.isFinite(exitWalk.impact) ? exitWalk.impact : 0, slipFor(sym))
      const qty = notional/px
      const targetFill = referenceTarget * (1 - cand.side*exitImpact)
      const stopFill = cand.stop * (1 - cand.side*exitImpact)
      const entryFee = notional*CHAN.costs.taker
      const targetFee = targetFill*qty*CHAN.costs.taker
      const stopFee = stopFill*qty*CHAN.costs.taker
      const rewardNet = cand.side*(targetFill-px)*qty - entryFee - targetFee
      const stopNet = cand.side*(stopFill-px)*qty - entryFee - stopFee
      const lossNet = Math.abs(Math.min(0,stopNet))
      const netRR = lossNet > 0 ? rewardNet/lossNet : -Infinity
      if (!(cand.side*(referenceTarget-px) > 0 && rewardNet > 0 && netRR >= MIN_NET_REWARD_RISK)) {
        rec('rejected','net_reward_risk_too_low',{ net_rr:netRR, min_net_rr:MIN_NET_REWARD_RISK, reward_net:rewardNet, loss_net:lossNet, reference_target:referenceTarget })
        continue
      }

      entries.push({ sym, side, price: px, notional, lev: PAPER_LEVERAGE, quote_ts: bk.E, source: 'binance-futures',
        chan: { comp: cand.comp, sleeve: bucket, level: cand.level ?? null, breakout_at: cand.breakoutAt ?? null,
          target: cand.comp === 'RG_TREND_PULLBACK' ? px + cand.side * 2 * r : null, stop: cand.stop, r, best: px, chk: bk.E, max_hold_bars: cand.maxHold, bar: new Date(bar).toISOString(),
          regime: REGIME[v.regime], hurst: v.hurst, vol_pct: v.volPct, halflife: v.mr.hl, z: v.mr.z, mr_mean: v.mr.mean, mr_std: v.mr.std,
          t_sig: v.mom.t, atr: v.mom.atr, hh: v.mom.hh, ll: v.mom.ll, kelly_f: aggressiveRisk, kelly_why: `aggressive paper 50x; base=${k.f}; ${k.why}`, kelly_n: rsOf(cand.comp).length,
          risk_usd: notional * r / px, risk_frac: notional * r / px / budget.equity, equity: budget.equity, backtested_coin: (CHAN.universe as readonly string[]).includes(sym),
          direction_crowding: { active: crowd.active, same_side_count: crowd.count, same_side_share: crowd.share },
          quality_gates: {
            learning_weight: learned.weight, learning_samples: learned.samples,
            cooldown_active: cd.active, breadth_share: mc.share, breadth_n: mc.n,
            liq_stop_share: liqStopShare, net_rr: netRR, reward_net: rewardNet, stop_loss_net: lossNet,
            reference_target: referenceTarget, exit_impact_bps: +(exitImpact*1e4).toFixed(2)
          },
          entry_fill: { model: 'book_walk', touch, vwap: w.vwap, impact_bps: +(Math.abs(px / touch - 1) * 1e4).toFixed(2), want: Math.round(sz.notional), liq_cap: Math.round(cap) } } })
      rec('accepted', 'taken', { notional, kelly_f: aggressiveRisk, leverage: PAPER_LEVERAGE,
        crowd_side: side, crowd_count: crowd.count, crowd_share: crowd.share,
        learning_weight: learned.weight, learning_samples: learned.samples, breadth_share: mc.share,
        liq_stop_share: liqStopShare, net_rr: netRR })
      held.add(bucket + ':' + sym); openN++; openNotional += notional;
      directionBook[side].count++; directionBook[side].notional += notional;
      const debit = notional / PAPER_LEVERAGE + notional * CHAN.costs.taker
      cash -= debit; budget.cash -= debit; budget.notional += notional; budget.equity -= notional * CHAN.costs.taker
    }
    if (volsChanged || dailyChanged) {
      try { await db.from('market_cache').upsert([{ key: 'chan_vols', data: vols, ts: new Date(now).toISOString() }, { key: 'chan_daily', data: daily, ts: new Date(now).toISOString() }]).throwOnError() } catch { /* rebuilt next cycle */ }
    }
  }
  const closeBar = bar > lastBar && (finished || now - bar > CHAN.scan.windowMs)   // done, or out of time for this bar
  const regimes = Object.fromEntries(Object.entries(views).map(([s, v]: any) => [s, REGIME[v.regime]]))
  const note = { strategy: 'regime_router', validated: false, phase1: 'NO-GO', universe: uni.pairs.length, universe_note: uni.note || undefined, bar: new Date(bar).toISOString(),
    in_window: inWindow, batch: Object.keys(views).length, scanned: done.size, complete: finished, failed: failed.length, daily_refresh: heavy, deep_fetches: deep, stale_daily: staleDaily,
    weight_1m: usedWeight, regime_counts: Object.values(regimes).reduce((a: any, r: any) => ({ ...a, [r]: (a[r] ?? 0) + 1 }), {}),
    equity, event: ev, opened: entries.length, closed: closes.length, risk_state: st,
    marks, marks_ts: new Date(now).toISOString(),
    open_live: openLive,
    live_scan: liveScan,
    direction_exposure: {
      long_count: directionBook.LONG.count, short_count: directionBook.SHORT.count,
      long_notional: directionBook.LONG.notional, short_notional: directionBook.SHORT.notional,
      crowd_min_positions: CROWD_MIN_POSITIONS, crowd_share: CROWD_NOTIONAL_SHARE
    },
    market_breadth: breadth,
    quality_gates: {
      liq_stop_max_share: LIQ_STOP_MAX_SHARE, min_net_rr: MIN_NET_REWARD_RISK,
      symbol_cooldown_bars: SYMBOL_COOLDOWN_BARS, breadth_min_share: BREADTH_MIN_SHARE
    },
    cost_model: { taker: CHAN.costs.taker, maker: CHAN.costs.maker, slippage: 'live order-book walk + symbol floor' },
    scan: { bar, done: [...done], skipped: scan0.skipped ?? 0, fetched: (scan0.fetched ?? 0) + heavy } }
  const { data: result } = await db.rpc('chan_commit_cycle', { p_lease: lease, p_closes: closes, p_entries: entries, p_marks: marks, p_updates: updates,
    p_note: note, p_bar: closeBar ? new Date(bar).toISOString() : null, p_halt: halt }).throwOnError()
  if (decisions.length) {
    try { await db.from('trade_decisions').insert(decisions.slice(0, 100).map((d, k) => ({ sym: d.sym, side: d.side, decision: d.decision, reason: d.reason, rank: k + 1, notional: d.notional ?? null,
      observed: { regime: d.regime, hurst: d.hurst, vol_pct: d.vol_pct, z: d.z, halflife: d.hl, t_sig: d.t_sig },
      inferred: {
        sleeve: 'CHAN',
        comp: d.comp,
        kelly_f: d.kelly_f ?? null,
        leverage: d.leverage ?? null,
        direction_crowding: d.crowd_side ? {
          side: d.crowd_side, count: d.crowd_count ?? null, share: d.crowd_share ?? null, rule: d.crowd_rule ?? null
        } : null,
        quality_gates: {
          learning_weight: d.learning_weight ?? null, learning_samples: d.learning_samples ?? null,
          breadth_share: d.breadth_share ?? null, breadth_n: d.breadth_n ?? null, majors_agree: d.majors_agree ?? null,
          cooldown_bars_left: d.cooldown_bars_left ?? null, recent_symbol_losses: d.recent_symbol_losses ?? null,
          liq_px: d.liq_px ?? null, stop_liq_share: d.stop_liq_share ?? d.liq_stop_share ?? null,
          net_rr: d.net_rr ?? null, min_net_rr: d.min_net_rr ?? null,
          reward_net: d.reward_net ?? null, loss_net: d.loss_net ?? null,
          gate_t: d.gate_t ?? null, gate_z: d.gate_z ?? null
        },
        committed: d.decision === 'accepted',
        approved_at: d.decision === 'accepted' ? new Date(now).toISOString() : null,
        approval_chain: d.decision === 'accepted' ? [
          { id: 'strategy', by: d.comp === 'RG_MR' ? 'Mean Reversion' : d.comp === 'RG_MOM' ? 'Momentum' : 'Trend Pullback', ok: true },
          { id: 'regime', by: 'Regime Router', ok: true, value: d.regime },
          { id: 'risk', by: 'Risk Engine', ok: true, risk_f: d.kelly_f ?? null, leverage: d.leverage ?? PAPER_LEVERAGE },
          { id: 'execution', by: 'Binance Book Check', ok: true },
          { id: 'ledger', by: 'CHAN SQL Ledger', ok: true }
        ] : [],
        note: 'Chan regime router, Phase-1 NO-GO, demo on the owner\'s instruction'
      } }))) } catch { /* journal only */ }
  }
  return { changed: true, ...result, ...note, risk_state: undefined, scan: undefined }
}

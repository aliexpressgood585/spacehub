// v97.x CHAN sleeve runner — the quant/ regime router traded live on PAPER (see shared/chan.ts for the rules and the
// NO-GO status).
// Every cycle (~5 s):
//   - stops resolved on the Binance aggTrades tape since the last check (exchange-side stop semantics, FAST's fill model)
//   - time exits, marks, and the risk state machine: 50 losses -> pause to 00:00 UTC; -10% from peak ->
//     close everything + hard halt
// Refresh closed-bar data every 15 seconds; stops still run every cron cycle.
// Hurst / ADF / half-life / momentum / current volatility roll on each new CLOSED 5m bar.
// A compact persisted price history avoids downloading 4,300 bars on every refresh / cold start.
// Only the comparison distribution of daily volatility keeps UTC daily anchors.
// Entry decisions remain once per coin per bar, within the existing 3-minute window.
// Binance request weight is metered from the X-MBX-USED-WEIGHT-1M header and new downloads stop near the budget.
// Books through chan_commit_cycle, which re-checks every limit in SQL.
import { CHAN, DAY_MS, RECENT_BARS, barView, canOpen, chanSize, dailyStats, dayVols, fundingCharge, kellyRisk, riskStep, type Bar, type Daily, type RiskState } from '../../../shared/chan.ts'
import { historyBars, mergeHistory, type ChanHistory } from '../../../shared/chan-history.ts'
import { fastLiq, liqCap, resolveExit, walkBook } from '../../../shared/fast.ts'
import { slipFor } from '../../../shared/lab.ts'
import { UNIV, buildUniverse } from '../../../shared/universe.ts'
import { aggTrades, book, type Pair } from './fast-runner.ts'
import { json, pool } from './rota-runner.ts'

const REGIME = ['NEUTRAL', 'MEAN_REVERT', 'TREND', 'HIGH_VOL']
let usedWeight = 0, weightMinute = -1
const historyMemory = new Map<string, ChanHistory>()
const klineWeight = (n: number) => n < 100 ? 1 : n < 500 ? 2 : n <= 1000 ? 5 : 10

async function kl(p: Pair, limit: number, endTime?: number): Promise<any[]> {
  const minute = Math.floor(Date.now() / 60_000)
  if (minute !== weightMinute) { usedWeight = 0; weightMinute = minute }
  const cost = klineWeight(limit)
  if (usedWeight + cost > CHAN.scan.weightBudget - 100) throw new Error('chan kline weight budget')
  usedWeight += cost // reserve before awaiting, including parallel calls
  const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${p.s}&interval=5m&limit=${limit}${endTime ? `&endTime=${endTime}` : ''}`
  const r = await fetch(url, { signal: AbortSignal.timeout(6000) })
  const w = Number(r.headers?.get?.('x-mbx-used-weight-1m'))
  if (Number.isFinite(w) && minute === weightMinute) usedWeight = Math.max(usedWeight, w)
  if (!r.ok) throw new Error(`klines HTTP ${r.status}`)
  return r.json()
}
const weightLeft = () => (Math.floor(Date.now() / 60_000) !== weightMinute ? CHAN.scan.weightBudget : CHAN.scan.weightBudget - usedWeight)
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
    halted: !!st?.halted, haltReason: String(st?.haltReason ?? ''), pauseReason: st?.pauseReason }
}

export async function runChan(db: any, state: any, lease: string, paper: boolean) {
  if (!paper) throw new Error('CHAN is paper-only; refusing live execution')
  const now = Date.now(), params = state.bot_params || {}
  const { data: open } = await db.from('bot_trades').select('*').eq('status', 'OPEN').throwOnError()
  if (open.some((t: any) => t.paper_mode !== true || t.strategy !== 'CHAN')) throw new Error('CHAN requires a paper book with CHAN rows only')
  const { data: hist } = await db.from('bot_trades').select('pnl,risk_usd,closed_at,scalp_meta').eq('strategy', 'CHAN').neq('status', 'OPEN')
    .order('closed_at', { ascending: false }).limit(1000).throwOnError()
  const closedAll = (hist ?? []).map((x: any) => ({ pnl: Number(x.pnl), closedAt: Date.parse(x.closed_at), r: Number(x.risk_usd) > 0 ? Number(x.pnl) / Number(x.risk_usd) : 0, comp: x.scalp_meta?.chan?.comp }))
  const uni = await loadUniverse(db, now)
  const bySym = new Map(uni.pairs.map(p => [p.sym, p]))
  const pairOf = (sym: string): Pair => bySym.get(sym) ?? (sym === 'PEPE' ? { sym, s: '1000PEPEUSDT', k: 1000 } : { sym, s: `${sym}USDT`, k: 1 })
  const closes: any[] = [], marks: Record<string, number> = {}, updates: any[] = [], closing = new Set<number>()
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
      const res = resolveExit({ dir, entry, r: Number(m.r), stop: Number(m.stop), target: null, liq: fastLiq(dir, entry, Number(t.lev) || 1), best: Number(m.best ?? entry), trail: false }, tr.trades)
      if (res.why) {
        const fu = await fundingFor(t, P, res.T)
        const bk = await book(P), w = walkBook(dir > 0 ? bk.bids : bk.asks, entry * Number(t.size))
        const imp = Math.max(Number.isFinite(w.impact) ? w.impact : 0, slipFor(t.sym))
        const price = res.why === 'STOP' ? res.px * (1 - dir * imp) : res.px
        closes.push({ id: t.id, price, reason: res.why, quote_ts: Date.now(), funding: fu, fill: { model: tr.complete ? 'aggTrades' : 'aggTrades_truncated', trigger_ts: res.T, trigger_px: res.px, lag_ms: now - res.T, impact_bps: +(imp * 1e4).toFixed(2) } })
        closing.add(t.id); marks[t.sym] = price
        return
      }
      if (now - Date.parse(t.opened_at) >= Number(m.max_hold_bars) * CHAN.barMs) { await bookClose(t, 'TIMEOUT'); return }
      const bk = await book(P); marks[t.sym] = dir > 0 ? bk.bids[0][0] : bk.asks[0][0]
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
  const refreshDue = now - Number(params.chan_scan?.refreshed_at ?? 0) >= CHAN.scan.refreshMs && !st.halted && !state.hard_halt_at
  const evaluated = new Set<string>(scan0.done)
  const historyWrites: any[] = []
  const inWindow = bar > lastBar && now - bar <= CHAN.scan.windowMs && !st.halted && !state.hard_halt_at
  const entries: any[] = [], decisions: any[] = [], views: Record<string, any> = {}, failed: string[] = []
  const done = new Set<string>(scan0.done), heldSyms = stillOpen.map((t: any) => String(t.sym))
  let refreshCursor = Number(params.chan_scan?.refresh_cursor) || 0
  let heavy = 0, deep = 0, finished = false, volsChanged = false, dailyChanged = false, staleDaily = 0
  let vols: Record<string, { d: number; v: number }[]> = {}, daily: Record<string, Daily & { day: number; bar?: number; checked_at?: number }> = {}
  if (refreshDue) {
    const { data: vc } = await db.from('market_cache').select('key,data').in('key', ['chan_vols', 'chan_daily']).throwOnError()
    vols = (vc ?? []).find((x: any) => x.key === 'chan_vols')?.data ?? {}
    daily = (vc ?? []).find((x: any) => x.key === 'chan_daily')?.data ?? {}
    const today = Math.floor(bar / DAY_MS)
    const universe = [...new Set([...heldSyms, ...uni.pairs.map(p => p.sym)])]
    const cursor = Number(params.chan_scan?.refresh_cursor) || 0
    const todo = universe.slice(cursor, cursor + CHAN.scan.perCycle)
    refreshCursor = cursor + todo.length >= universe.length ? 0 : cursor + todo.length
    // Fetch persisted compact histories only when a new closed bar needs statistics and this worker is cold.
    const missing = todo.filter(sym => daily[sym]?.bar !== bar && !historyMemory.has(sym))
    if (missing.length) {
      const { data: saved } = await db.from('market_cache').select('key,data').in('key', missing.map(sym => 'chan_history:' + sym)).throwOnError()
      for (const row of saved ?? []) if (row.key?.startsWith('chan_history:') && historyBars(row.data).length === CHAN.bars) historyMemory.set(row.key.slice(13), row.data)
    }
    await pool(todo, 10, async (sym) => {
      const P = pairOf(sym)
      try {
        let d = daily[sym]
        const bars = await recentBars(P, now)
        if (!bars.length || bars[bars.length - 1].t + CHAN.barMs !== bar) { failed.push(sym); return }
        if (!d || d.bar !== bar || !Number.isFinite(d.adf)) {
          let h = mergeHistory(historyMemory.get(sym), bars, bar)
          if (!h) {
            if (heavy >= CHAN.scan.heavyPerCycle || weightLeft() < 180) { staleDaily++; return }
            heavy++
            h = mergeHistory(undefined, await closedBars(P, bar), bar)
          }
          if (!h) { staleDaily++; return } // gaps / insufficient history: fail closed, never reuse yesterday's label
          const hb = historyBars(h)
          let vh = vols[sym] ?? []
          const known = new Set(vh.map(x => x.d))
          for (const x of dayVols(hb)) if (!known.has(x.d)) vh.push(x)
          // Keep the comparison distribution on daily anchors, even though the current estimate now rolls each bar.
          if (vh.filter(x => x.d > 0).length < CHAN.regime.minHist + 1 && deep < CHAN.scan.deepPerCycle &&
              !vh.some(x => x.d === -today) && weightLeft() > 220) {
            deep++
            const d9 = await closedBars(P, bar, CHAN.scan.deepBars)
            const k2 = new Set(vh.map(x => x.d))
            for (const x of dayVols(d9)) if (!k2.has(x.d)) vh.push(x)
            if (vh.filter(x => x.d > 0).length < CHAN.regime.minHist + 1) vh.push({ d: -today, v: NaN })
          }
          vh = vh.sort((a, b) => a.d - b.d).slice(-(CHAN.regime.maxHist + 3))
          vols[sym] = vh; volsChanged = true
          const ds = dailyStats(hb, vh.filter(x => x.d > 0 && x.d < today && Number.isFinite(x.v)).map(x => x.v))
          if (!ds) { staleDaily++; return }
          d = { ...ds, day: today, bar, checked_at: now }
          historyMemory.set(sym, h)
          historyWrites.push({ key: 'chan_history:' + sym, data: h, ts: new Date(now).toISOString() })
        }
        d = { ...d, checked_at: now }
        daily[sym] = d; dailyChanged = true
        const v = barView(bars, d)
        if (v) views[sym] = v
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
    // Explain safety-gate rejections once per closed bar, including a missing volatility baseline.
    if (inWindow) for (const [sym, v] of Object.entries(views) as [string, any][]) {
      if (evaluated.has(sym) || !Number.isFinite(v.mr.z) || Math.abs(v.mr.z) < CHAN.params.RG_MR.entryZ) continue
      const reason = !Number.isFinite(v.volPct) ? 'missing_volatility'
        : v.regime === 1 && (!Number.isFinite(v.adf) || v.adf >= CHAN.mr.adfP) ? 'adf_rejected' : null
      if (reason) decisions.push({ sym, comp: 'RG_MR', side: v.mr.z < 0 ? 'LONG' : 'SHORT', decision: 'rejected', reason,
        regime: REGIME[v.regime], hurst: v.hurst, vol_pct: v.volPct, z: v.mr.z, hl: v.mr.hl, adf: v.adf, data_checked_at: now, t_sig: v.mom.t })
    }
    // entries: this batch's candidates, strongest first
    let openN = stillOpen.filter((t: any) => !closing.has(t.id)).length
    let openNotional = stillOpen.filter((t: any) => !closing.has(t.id)).reduce((s: number, t: any) => s + Number(t.entry_price) * Number(t.size), 0)
    let cash = Number(state.balance)
    const held = new Set(heldSyms)
    const rsOf = (comp: string) => closedAll.filter((x: any) => x.comp === comp).map((x: any) => x.r).reverse()
    const cands = Object.entries(views).map(([sym, v]: [string, any]) => {
      const c = v.mr.side ? { comp: 'RG_MR', side: v.mr.side, stop: v.mr.side > 0 ? v.mr.stopLong : v.mr.stopShort, maxHold: v.mr.maxHold, strength: Math.abs(v.mr.z) }
        : v.mom.side ? { comp: 'RG_MOM', side: v.mom.side, stop: v.mom.side > 0 ? v.mom.stopLong : v.mom.stopShort, maxHold: CHAN.params.RG_MOM.hold, strength: v.mom.t } : null
      return c && { sym, v, ...c }
    }).filter(Boolean).sort((a: any, b: any) => b.strength - a.strength) as any[]
    for (const cand of cands) {
      const { sym, v } = cand
      if (!inWindow || evaluated.has(sym)) continue // at most one entry decision per coin per closed bar
      const side = cand.side > 0 ? 'LONG' : 'SHORT'
      const rec = (decision: string, reason: string, extra: any = {}) => decisions.push({ sym, comp: cand.comp, side, decision, reason, regime: REGIME[v.regime], hurst: v.hurst, vol_pct: v.volPct, z: v.mr.z, hl: v.mr.hl, adf: v.adf, data_checked_at: now, t_sig: v.mom.t, ...extra })
      if (held.has(sym)) { rec('rejected', 'coin_held'); continue }
      const co = canOpen(st, openN)
      if (!co.ok) { rec('rejected', co.why); continue }
      const k = kellyRisk(rsOf(cand.comp))
      if (!(k.f > 0)) { rec('rejected', k.why); continue }
      let bk: Awaited<ReturnType<typeof book>>
      try { bk = await book(pairOf(sym)) } catch { rec('rejected', 'no_book'); continue }
      const touch = cand.side > 0 ? bk.asks[0][0] : bk.bids[0][0]
      if (!(cand.side * (touch - cand.stop) > 0)) { rec('rejected', 'stop_on_wrong_side_of_market'); continue }
      const sz = chanSize(k.f, equity, touch, cand.stop, openNotional)
      if (!(sz.notional > 0)) { rec('rejected', sz.why); continue }
      const dist = Math.abs(touch - cand.stop) / touch
      const cap = liqCap(cand.side > 0 ? bk.asks : bk.bids, cand.side > 0 ? bk.bids : bk.asks, 0.25 * dist)
      const notional = Math.min(sz.notional, cap, cash * CHAN.risk.maxLeverage / (1 + CHAN.risk.maxLeverage * CHAN.costs.taker))
      if (notional / CHAN.risk.maxLeverage < 5) { rec('rejected', 'too_small_or_book_too_thin', { want: sz.notional, liq_cap: cap }); continue }
      const w = walkBook(cand.side > 0 ? bk.asks : bk.bids, notional)
      const floorPx = touch * (1 + cand.side * slipFor(sym)), px = cand.side > 0 ? Math.max(w.vwap, floorPx) : Math.min(w.vwap, floorPx)
      if (!(cand.side * (px - cand.stop) > 0)) { rec('rejected', 'fill_beyond_stop'); continue }
      const r = Math.abs(px - cand.stop)
      entries.push({ sym, side, price: px, notional, lev: CHAN.risk.maxLeverage, quote_ts: bk.E, source: 'binance-futures',
        chan: { comp: cand.comp, stop: cand.stop, r, best: px, chk: bk.E, max_hold_bars: cand.maxHold, bar: new Date(bar).toISOString(),
          regime: REGIME[v.regime], hurst: v.hurst, adf: v.adf, data_checked_at: now, stats_bar: bar, vol_pct: v.volPct, halflife: v.mr.hl, z: v.mr.z, mr_mean: v.mr.mean, mr_std: v.mr.std,
          t_sig: v.mom.t, atr: v.mom.atr, hh: v.mom.hh, ll: v.mom.ll, kelly_f: k.f, kelly_why: k.why, kelly_n: rsOf(cand.comp).length,
          risk_usd: notional * r / px, risk_frac: notional * r / px / equity, equity, backtested_coin: (CHAN.universe as readonly string[]).includes(sym),
          entry_fill: { model: 'book_walk', touch, vwap: w.vwap, impact_bps: +(Math.abs(px / touch - 1) * 1e4).toFixed(2), want: Math.round(sz.notional), liq_cap: Math.round(cap) } } })
      rec('accepted', 'taken', { notional, kelly_f: k.f })
      held.add(sym); openN++; openNotional += notional; cash -= notional / CHAN.risk.maxLeverage + notional * CHAN.costs.taker
    }
    if (volsChanged || dailyChanged) {
      await db.from('market_cache').upsert([{ key: 'chan_vols', data: vols, ts: new Date(now).toISOString() }, { key: 'chan_daily', data: daily, ts: new Date(now).toISOString() }, ...historyWrites]).throwOnError()
    }
  }
  const closeBar = bar > lastBar && (finished || now - bar > CHAN.scan.windowMs)   // done, or out of time for this bar
  for (const sym of historyMemory.keys()) if (!bySym.has(sym) && !heldSyms.includes(sym)) historyMemory.delete(sym)
  const regimes = Object.fromEntries(Object.entries(views).map(([s, v]: any) => [s, REGIME[v.regime]]))
  const note = { strategy: 'regime_router', validated: false, phase1: 'NO-GO', universe: uni.pairs.length, universe_note: uni.note || undefined, bar: new Date(bar).toISOString(),
    refresh_ms: CHAN.scan.refreshMs, refreshed: refreshDue, last_refresh: refreshDue ? now : params.chan_scan?.refreshed_at ?? null,
    daily_loss_enabled: CHAN.risk.dailyLoss > 0, in_window: inWindow, batch: Object.keys(views).length, scanned: done.size, complete: finished, failed: failed.length, daily_refresh: heavy, deep_fetches: deep, stale_daily: staleDaily,
    weight_1m: usedWeight, regime_counts: Object.values(regimes).reduce((a: any, r: any) => ({ ...a, [r]: (a[r] ?? 0) + 1 }), {}),
    equity, event: ev, opened: entries.length, closed: closes.length, risk_state: st,
    marks, marks_ts: new Date(now).toISOString(),   // v97.4: the server's Binance mark per open position (dashboard fallback)
    scan: { bar, refresh_cursor: refreshCursor, refreshed_at: refreshDue ? now : params.chan_scan?.refreshed_at ?? 0, done: [...done], skipped: scan0.skipped ?? 0, fetched: (scan0.fetched ?? 0) + heavy } }
  const { data: result } = await db.rpc('chan_commit_cycle', { p_lease: lease, p_closes: closes, p_entries: entries, p_marks: marks, p_updates: updates,
    p_note: note, p_bar: closeBar ? new Date(bar).toISOString() : null, p_halt: halt }).throwOnError()
  if (decisions.length) {
    try { await db.from('trade_decisions').insert(decisions.slice(0, 100).map((d, k) => ({ sym: d.sym, side: d.side, decision: d.decision, reason: d.reason, rank: k + 1, notional: d.notional ?? null,
      observed: { regime: d.regime, hurst: d.hurst, adf: d.adf, data_checked_at: d.data_checked_at, vol_pct: d.vol_pct, z: d.z, halflife: d.hl, t_sig: d.t_sig }, inferred: { sleeve: 'CHAN', comp: d.comp, kelly_f: d.kelly_f ?? null, note: 'Chan regime router, Phase-1 NO-GO, demo on the owner\'s instruction' } }))) } catch { /* journal only */ }
  }
  return { changed: true, ...result, ...note, risk_state: undefined, scan: undefined }
}

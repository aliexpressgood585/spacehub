// v97.0 CHAN sleeve runner — the quant/ regime router traded live on PAPER (see shared/chan.ts for the rules and the
// NO-GO status). Every cycle (~5 s): stops resolved on Binance aggTrades since the last check (exchange-side stop
// semantics, same fill model as FAST), time exits, marks, the risk state machine (daily -3% / 5 losses -> pause to
// 00:00 UTC, -10% from peak -> close everything + hard halt). Once per CLOSED 5m bar (first 2 minutes): 9,000 closed 5m
// candles per coin, regime + both strategies at the last closed bar, mean-reversion signal exits, and entries sized by
// half-Kelly on the component's own live record (cap 1%) at the mandatory stop, 3x isolated. Books through
// chan_commit_cycle, which re-checks every limit in SQL.
import { CHAN, MEAN_REVERT, TREND, canOpen, chanSize, chanView, kellyRisk, riskStep, type Bar, type RiskState } from '../../../shared/chan.ts'
import { fastLiq, liqCap, resolveExit, walkBook } from '../../../shared/fast.ts'
import { slipFor } from '../../../shared/lab.ts'
import { aggTrades, book, type Pair } from './fast-runner.ts'
import { json, pool } from './rota-runner.ts'

const pairOf = (sym: string): Pair => ({ sym, s: `${sym}USDT`, k: 1 })
const REGIME = ['NEUTRAL', 'MEAN_REVERT', 'TREND', 'HIGH_VOL']

export async function closedBars(p: Pair, now: number, n = CHAN.bars): Promise<Bar[]> {
  const out = new Map<number, Bar>()
  let end = now
  for (let page = 0; page < Math.ceil(n / 1500) + 1 && out.size < n; page++) {
    const r = await json(`https://fapi.binance.com/fapi/v1/klines?symbol=${p.s}&interval=5m&limit=1500&endTime=${end}`)
    if (!Array.isArray(r) || !r.length) break
    for (const x of r) if (Number(x[6]) < now) out.set(+x[0], { t: +x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4] })   // CLOSED candles only
    end = Number(r[0][0]) - 1
    if (r.length < 1500) break
  }
  return [...out.values()].sort((a, b) => a.t - b.t).slice(-n)
}

function initRisk(st: any, equity: number): RiskState {
  return { peak: Number(st?.peak) || equity, day: Number.isFinite(st?.day) ? st.day : -1, dayOpen: Number(st?.dayOpen) || equity,
    pausedUntilDay: Number.isFinite(st?.pausedUntilDay) ? st.pausedUntilDay : -1, streakFrom: Number(st?.streakFrom) || 0,
    halted: !!st?.halted, haltReason: String(st?.haltReason ?? '') }
}

export async function runChan(db: any, state: any, lease: string, paper: boolean) {
  if (!paper) throw new Error('CHAN is paper-only; refusing live execution')
  const now = Date.now(), params = state.bot_params || {}
  const { data: open } = await db.from('bot_trades').select('*').eq('status', 'OPEN').throwOnError()
  if (open.some((t: any) => t.paper_mode !== true || t.strategy !== 'CHAN')) throw new Error('CHAN requires a paper book with CHAN rows only')
  const { data: hist } = await db.from('bot_trades').select('pnl,risk_usd,closed_at,scalp_meta').eq('strategy', 'CHAN').neq('status', 'OPEN')
    .order('closed_at', { ascending: false }).limit(1000).throwOnError()
  const closedAll = (hist ?? []).map((x: any) => ({ pnl: Number(x.pnl), closedAt: Date.parse(x.closed_at), r: Number(x.risk_usd) > 0 ? Number(x.pnl) / Number(x.risk_usd) : 0, comp: x.scalp_meta?.chan?.comp }))
  const closes: any[] = [], marks: Record<string, number> = {}, updates: any[] = [], closing = new Set<number>()
  const bookClose = async (t: any, reason: string, extra: any = {}) => {
    const dir = t.side === 'LONG' ? 1 : -1, bk = await book(pairOf(t.sym))
    const top = dir > 0 ? bk.bids[0][0] : bk.asks[0][0], w = walkBook(dir > 0 ? bk.bids : bk.asks, Number(t.entry_price) * Number(t.size))
    const imp = Math.max(Number.isFinite(w.impact) ? w.impact : 0, slipFor(t.sym))
    marks[t.sym] = top
    closes.push({ id: t.id, price: top * (1 - dir * imp), reason, quote_ts: bk.E, fill: { model: 'book_walk', impact_bps: +(imp * 1e4).toFixed(2), depth_usd: Math.round(w.depthUsd), beyond_book: w.beyond, ...extra } })
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
        const bk = await book(P), w = walkBook(dir > 0 ? bk.bids : bk.asks, entry * Number(t.size))
        const imp = Math.max(Number.isFinite(w.impact) ? w.impact : 0, slipFor(t.sym))
        const price = res.why === 'STOP' ? res.px * (1 - dir * imp) : res.px
        closes.push({ id: t.id, price, reason: res.why, quote_ts: Date.now(), fill: { model: tr.complete ? 'aggTrades' : 'aggTrades_truncated', trigger_ts: res.T, trigger_px: res.px, lag_ms: now - res.T, impact_bps: +(imp * 1e4).toFixed(2) } })
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
  const rs0 = initRisk(params.chan_risk, equity)
  let { st, ev } = riskStep(rs0, now, equity, closedAll)
  let halt: string | null = null
  if (ev === 'KILL') {
    for (const t of stillOpen) { try { await bookClose(t, 'KILL') } catch { /* the ledger halts entries regardless */ } }
    halt = st.haltReason
  }
  // 3. once per closed 5m bar: signals, MR signal exits, entries
  const bar = Math.floor(now / CHAN.barMs) * CHAN.barMs
  const due = bar > (Number(params.chan_bar) || 0) && now - bar <= CHAN.entryWindowMs && !st.halted && !state.hard_halt_at
  const entries: any[] = [], decisions: any[] = [], views: Record<string, any> = {}, failed: string[] = []
  if (due) {
    await pool([...CHAN.universe], 5, async (sym) => {
      try { const b = await closedBars(pairOf(sym), now); if (b.length && b[b.length - 1].t + CHAN.barMs === bar) views[sym] = chanView(b); else failed.push(sym) } catch { failed.push(sym) }
    })
    for (const t of stillOpen) {
      if (closing.has(t.id)) continue
      const v = views[t.sym], m = t.scalp_meta?.chan
      if (v && m?.comp === 'RG_MR' && ((t.side === 'LONG' && v.mr.exitLong) || (t.side === 'SHORT' && v.mr.exitShort))) {
        try { await bookClose(t, 'SIGNAL', { z: v.mr.z }) } catch { /* retried next bar */ }
      }
    }
    let openN = stillOpen.filter((t: any) => !closing.has(t.id)).length
    let openNotional = stillOpen.filter((t: any) => !closing.has(t.id)).reduce((s: number, t: any) => s + Number(t.entry_price) * Number(t.size), 0)
    let cash = Number(state.balance)
    const held = new Set(stillOpen.map((t: any) => t.sym))
    const rsOf = (comp: string) => closedAll.filter((x: any) => x.comp === comp).map((x: any) => x.r).reverse()
    for (const sym of CHAN.universe) {
      const v = views[sym]
      if (!v) continue
      const cand = v.mr.side ? { comp: 'RG_MR', side: v.mr.side, stop: v.mr.side > 0 ? v.mr.stopLong : v.mr.stopShort, maxHold: v.mr.maxHold }
        : v.mom.side ? { comp: 'RG_MOM', side: v.mom.side, stop: v.mom.side > 0 ? v.mom.stopLong : v.mom.stopShort, maxHold: CHAN.params.RG_MOM.hold } : null
      const base = { sym, regime: REGIME[v.regime], hurst: v.hurst, vol_pct: v.volPct, z: v.mr.z, hl: v.mr.hl, t_sig: v.mom.t }
      if (!cand) continue
      const side = cand.side > 0 ? 'LONG' : 'SHORT', rec = (decision: string, reason: string, extra: any = {}) => decisions.push({ ...base, comp: cand.comp, side, decision, reason, ...extra })
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
          regime: REGIME[v.regime], hurst: v.hurst, vol_pct: v.volPct, halflife: v.mr.hl, z: v.mr.z, mr_mean: v.mr.mean, mr_std: v.mr.std,
          t_sig: v.mom.t, atr: v.mom.atr, hh: v.mom.hh, ll: v.mom.ll, kelly_f: k.f, kelly_why: k.why, kelly_n: rsOf(cand.comp).length,
          risk_usd: notional * r / px, risk_frac: notional * r / px / equity, equity,
          entry_fill: { model: 'book_walk', touch, vwap: w.vwap, impact_bps: +(Math.abs(px / touch - 1) * 1e4).toFixed(2), want: Math.round(sz.notional), liq_cap: Math.round(cap) } } })
      rec('accepted', 'taken', { notional, kelly_f: k.f })
      held.add(sym); openN++; openNotional += notional; cash -= notional / CHAN.risk.maxLeverage + notional * CHAN.costs.taker
    }
  }
  const note = { strategy: 'regime_router', validated: false, phase1: 'NO-GO', due, bar: new Date(bar).toISOString(), scanned: Object.keys(views).length, failed: failed.length,
    regimes: Object.fromEntries(Object.entries(views).map(([s, v]: any) => [s, REGIME[v.regime]])), equity, event: ev, opened: entries.length, closed: closes.length, risk_state: st }
  const { data: result } = await db.rpc('chan_commit_cycle', { p_lease: lease, p_closes: closes, p_entries: entries, p_marks: marks, p_updates: updates,
    p_note: note, p_bar: due ? new Date(bar).toISOString() : null, p_halt: halt }).throwOnError()
  if (decisions.length) {
    try { await db.from('trade_decisions').insert(decisions.slice(0, 100).map((d, k) => ({ sym: d.sym, side: d.side, decision: d.decision, reason: d.reason, rank: k + 1, notional: d.notional ?? null,
      observed: { regime: d.regime, hurst: d.hurst, vol_pct: d.vol_pct, z: d.z, halflife: d.hl, t_sig: d.t_sig }, inferred: { sleeve: 'CHAN', comp: d.comp, kelly_f: d.kelly_f ?? null, note: 'Chan regime router, Phase-1 NO-GO, demo on the owner\'s instruction' } }))) } catch { /* journal only */ }
  }
  void TREND; void MEAN_REVERT
  return { changed: true, ...result, ...note, risk_state: undefined }
}

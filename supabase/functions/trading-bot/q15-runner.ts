// P-Q15 (owner override 2026-10-04, PAPER ONLY) — Q15 sleeve runner (rule: shared/q15.ts, frozen in
// quant/PREREGISTRATION_Q15.md). Every cycle: exits for open Q15 rows resolved on the Binance trade tape since the last
// check (stop-market at the trigger print minus book impact, target at the level, liquidation, 2h timeout at the book).
// Once per COMPLETED 15m bar (first 3 minutes after the close): scan the liquid universe on closed 15m bars; every signal
// is journalled to q15_shadow (scored later by the same bracket on 1m bars = the gate's measurement) and to
// trade_decisions; it is entered only if the profit gate, the book and the caps all pass. A bar where nothing passes
// gives 0 entries — never a forced fill. Books through q15_commit_cycle (every cap and the -12% day halt again in SQL).
import { Q15, Q15_HOLD_MIN, q15Signal, q15BtcUp, q15Levels, q15Liq, q15Bracket, q15Edge, q15Config, type Q15Sig } from '../../../shared/q15.ts'
import { resolveExit, walkBook, type AggTrade } from '../../../shared/fast.ts'
import { profitGate, bookFrom } from '../../../shared/costs.ts'
import { slipFor, type LBar } from '../../../shared/lab.ts'
import { json, pool } from './rota-runner.ts'
import { aggTrades, book, aggHalted, type Pair } from './fast-runner.ts'
import { sleeveOff } from '../../../shared/sleeves.ts'
import * as S from '../../../shared/strategy.ts'

// Q15 and EVT rows are isolated-leveraged (<= 10x, SQL); every other row (DONCH4H) must be 1x
export const Q15_BOOK = ['Q15', 'EVT', 'DONCH4H', 'FAST'] as const
export function q15BookOk(open: any[]): boolean {
  return open.every((t: any) => t.paper_mode === true && (Q15_BOOK as readonly string[]).includes(t.strategy)
    && Number(t.lev) <= Q15.levMax && (t.strategy === 'Q15' || t.strategy === 'EVT' || t.strategy === 'FAST' || Number(t.lev) === 1))
}
async function universe(db: any): Promise<Pair[]> {
  try {
    const { data } = await db.from('market_cache').select('data').eq('key', 'universe').throwOnError()
    const p = data?.[0]?.data?.pairs
    if (Array.isArray(p) && p.length >= 20) return p.map((x: any) => ({ sym: String(x.sym), s: String(x.s), k: Number(x.k) || 1 }))
  } catch { /* fallback */ }
  return S.CRYPTO_40.map((c) => (c === 'PEPE' ? { sym: 'PEPE', s: '1000PEPEUSDT', k: 1000 } : { sym: c, s: `${c}USDT`, k: 1 }))
}
const mapK = (p: Pair) => (x: any): LBar => ({ t: +x[0], open: +x[1] / p.k, high: +x[2] / p.k, low: +x[3] / p.k, close: +x[4] / p.k, vol: +x[5] * p.k, tb: +x[9] * p.k })
// closed 15m bars only (close time < now)
async function bars15m(p: Pair, now: number): Promise<LBar[]> {
  const r = await json(`https://fapi.binance.com/fapi/v1/klines?symbol=${p.s}&interval=15m&limit=90`)
  return r.filter((x: any) => Number(x[6]) < now).map(mapK(p))
}
async function bars1m(p: Pair, from: number, limit: number): Promise<LBar[]> {
  const r = await json(`https://fapi.binance.com/fapi/v1/klines?symbol=${p.s}&interval=1m&startTime=${from}&limit=${limit}`)
  return r.map(mapK(p))
}

export async function runQ15(db: any, state: any, lease: string, paper: boolean) {
  if (!paper) throw new Error('Q15 is paper-only; refusing live execution')
  const cfg = q15Config(), now = Date.now(), params = state.bot_params || {}
  const { data: open } = await db.from('bot_trades').select('*').eq('status', 'OPEN').throwOnError()
  if (!q15BookOk(open)) throw new Error('Q15 requires a paper-only book (only Q15/EVT rows may be leveraged, <= 10x; DONCH4H 1x)')
  const mine = open.filter((t: any) => t.strategy === 'Q15')
  const pairs = await universe(db), byS = new Map(pairs.map((p) => [p.sym, p]))
  const pairOf = (sym: string): Pair => byS.get(sym) ?? (sym === 'PEPE' ? { sym, s: '1000PEPEUSDT', k: 1000 } : { sym, s: `${sym}USDT`, k: 1 })

  // ── exits on the tape ──
  const closes: any[] = [], marks: Record<string, number> = {}, updates: any[] = []
  await pool<any>(mine, 6, async (t) => {
    try {
      const P = pairOf(t.sym), dir = (t.side === 'LONG' ? 1 : -1) as 1 | -1, m = t.scalp_meta?.q15
      if (!m) return
      const entry = Number(t.entry_price), size = Number(t.size), lev = Math.max(1, Number(t.lev) || 1)
      const from = Math.max(Date.parse(t.opened_at), Number(m.chk) || 0, now - 3_500_000) + 1
      const tr = await aggTrades(P, from, now)
      const res = resolveExit({ dir, entry, r: Number(m.r), stop: Number(m.stop), target: Number(m.target), liq: q15Liq(dir, entry, lev), best: Number(m.best ?? entry), trail: false }, tr.trades as AggTrade[])
      if (res.why) {
        let price = res.px, fill: any = { model: tr.complete ? 'aggTrades' : 'aggTrades_truncated', trigger_ts: res.T, trigger_px: res.px, detected_ts: now, lag_ms: now - res.T }
        if (res.why === 'STOP') {
          const bk = await book(P), w = walkBook(dir > 0 ? bk.bids : bk.asks, entry * size)
          const imp = Math.max(Number.isFinite(w.impact) ? w.impact : 0, slipFor(t.sym))
          price = res.px * (1 - dir * imp); fill = { ...fill, impact_bps: +(imp * 1e4).toFixed(2), depth_usd: Math.round(w.depthUsd), beyond_book: w.beyond }
        }
        closes.push({ id: t.id, price, reason: res.why, quote_ts: Date.now(), fill }); marks[t.sym] = price; return
      }
      const bk = await book(P), top = dir > 0 ? bk.bids[0][0] : bk.asks[0][0]; marks[t.sym] = top
      if (now - Date.parse(t.opened_at) >= Q15_HOLD_MIN * 60_000) {
        const w = walkBook(dir > 0 ? bk.bids : bk.asks, entry * size), imp = Math.max(Number.isFinite(w.impact) ? w.impact : 0, slipFor(t.sym))
        closes.push({ id: t.id, price: top * (1 - dir * imp), reason: 'TIMEOUT', quote_ts: bk.E, fill: { model: 'book_walk', impact_bps: +(imp * 1e4).toFixed(2), depth_usd: Math.round(w.depthUsd), beyond_book: w.beyond, detected_ts: now } })
        return
      }
      const chk = res.lastT ?? (Number(m.chk) || 0)
      if (chk > (Number(m.chk) || 0) || res.best !== Number(m.best ?? entry)) updates.push({ id: t.id, chk, best: res.best })
    } catch { /* no data: held; the next cycle re-reads every trade since the last check */ }
  })

  // ── entries: once per completed 15m bar ──
  const bar = Math.floor(now / Q15.barMs) * Q15.barMs, lastBar = bar - Q15.barMs, done = Number(params.q15_bar) || 0
  const halted = aggHalted(params, now)
  const due = bar > done && now - bar <= Q15.entryWindowMs && !state.hard_halt_at && !halted && !sleeveOff(params, 'Q15')
  const scored = await scoreQ15Shadows(db, pairOf, now)
  if (!due && !closes.length && !updates.length) return { changed: false, open: mine.length, shadow_scored: scored, halted }

  const entries: any[] = [], decisions: any[] = [], failed: string[] = [], shadows: any[] = []
  let scanned = 0, signals = 0, edge: ReturnType<typeof q15Edge> = { bps: NaN, n: 0, bars: 0, mean: NaN, t: NaN }
  if (due) {
    const data = new Map<string, LBar[]>()
    await pool(pairs, 12, async (p) => { try {
      const b = await bars15m(p, now)
      if (b.length >= 61 && b[b.length - 1].t === lastBar) data.set(p.sym, b); else failed.push(p.sym) } catch { failed.push(p.sym) } })
    scanned = data.size
    const btcUp = q15BtcUp(data.get('BTC'))
    const sigs: { sym: string; sig: Q15Sig }[] = []
    for (const [sym, b] of data) { const sg = q15Signal(b, btcUp, sym === 'BTC'); if (sg) sigs.push({ sym, sig: sg }) }
    sigs.sort((a, b) => b.sig.strength - a.sig.strength)
    signals = sigs.length
    // every signal is journalled for the measurement (entry reference = the signal bar's close ~ the next open)
    for (const { sym, sig } of sigs) { const b = data.get(sym)!, c = b[b.length - 1].close, lv = q15Levels(sig.dir, c, sig.atr)
      shadows.push({ sym, side: sig.dir, bar: lastBar, t0: bar, px0: c, stop: lv.stop, target: lv.target, hold_min: Q15_HOLD_MIN, z: sig.z, vol_ratio: sig.volRatio, imb: sig.imb, taken: false }) }
    const funding = new Map<string, number>()
    if (sigs.length) {
      try { const { data: rows } = await db.from('q15_shadow').select('bar,gross_bps').eq('status', 'closed').order('bar', { ascending: false }).limit(Q15.window)
        edge = q15Edge((rows ?? []).map((r: any) => ({ bar: Number(r.bar), gross_bps: Number(r.gross_bps) })).reverse()) } catch { /* no estimate -> the gate refuses */ }
      try { const prem = await json('https://fapi.binance.com/fapi/v1/premiumIndex'); for (const x of prem) funding.set(String(x.symbol), Number(x.lastFundingRate)) } catch { /* missing -> 0, labelled by the cost model */ }
    }
    const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0)
    const { count: today } = await db.from('bot_trades').select('id', { count: 'exact', head: true }).eq('strategy', 'Q15').gte('opened_at', dayStart.toISOString())
    let openN = mine.length - closes.length, dayN = Number(today) || 0, cash = Number(state.balance)
    const equity = cash + open.reduce((s: number, t: any) => s + Number(t.entry_price) * Number(t.size) / Math.max(1, Number(t.lev) || 1), 0)
    let q15Margin = mine.filter((t: any) => !closes.some((c) => c.id === t.id)).reduce((s: number, t: any) => s + Number(t.entry_price) * Number(t.size) / Math.max(1, Number(t.lev) || 1), 0)
    const held = new Set(open.filter((t: any) => !closes.some((c) => c.id === t.id)).map((t: any) => String(t.sym)))
    for (const { sym, sig } of sigs) {
      const side = sig.dir > 0 ? 'LONG' : 'SHORT', rec = (decision: string, reason: string, extra: any = {}) => decisions.push({ sym, side, decision, reason, z: sig.z, volRatio: sig.volRatio, imb: sig.imb, ...extra })
      if (held.has(sym)) { rec('rejected', 'coin_held'); continue }
      if (openN >= cfg.maxOpen) { rec('rejected', 'q15_full'); continue }
      if (dayN >= Q15.maxPerDay) { rec('rejected', 'daily_cap_20'); continue }
      // gate first on a no-measurement estimate: no edge estimate -> no book read needed
      if (!Number.isFinite(edge.bps)) { rec('rejected', 'no_edge_estimate', { gate: { pass: false, reason: 'no_edge_estimate', edge } }); continue }
      let bk: Awaited<ReturnType<typeof book>>
      try { bk = await book(pairOf(sym)) } catch { rec('rejected', 'stale_or_no_book'); continue }
      const bid = bk.bids[0][0], ask = bk.asks[0][0], spreadBps = (ask - bid) / ((ask + bid) / 2) * 1e4
      if (!(spreadBps <= Q15.maxSpreadBps)) { rec('rejected', 'spread_over_8bps', { spread_bps: +spreadBps.toFixed(2) }); continue }
      const touch = sig.dir > 0 ? ask : bid
      const want = Math.min(equity * cfg.perTrade, Math.max(0, equity * cfg.share - q15Margin), cash / (1 + cfg.lev * 0.0005)) * cfg.lev
      if (want / cfg.lev < 5) { rec('rejected', 'no_cash_or_share'); continue }
      const w = walkBook(sig.dir > 0 ? bk.asks : bk.bids, want), wx = walkBook(sig.dir > 0 ? bk.bids : bk.asks, want)
      const floorPx = touch * (1 + sig.dir * slipFor(sym)), px = sig.dir > 0 ? Math.max(w.vwap, floorPx) : Math.min(w.vwap, floorPx)
      const lv = q15Levels(sig.dir, px, sig.atr), rFrac = lv.r / px
      if (w.beyond || wx.beyond) { rec('rejected', 'book_too_thin', { want }); continue }
      if (Math.abs(px / touch - 1) > Q15.impactOfR * rFrac || wx.impact > Q15.impactOfR * rFrac) { rec('rejected', 'impact_over_25pct_stop', { impact_bps: +(Math.abs(px / touch - 1) * 1e4).toFixed(2), exit_impact_bps: +(wx.impact * 1e4).toFixed(2), stop_bps: +(rFrac * 1e4).toFixed(1) }); continue }
      const P = pairOf(sym), g0 = profitGate({ grossEdgeBps: edge.bps, edgeN: edge.n, book: bookFrom(bk.bids, bk.asks, bk.E, 'binance-futures'), notional: want, side: sig.dir, holdMin: Q15_HOLD_MIN, funding: funding.has(P.s) ? funding.get(P.s)! : null })
      const gate = { pass: g0.pass && g0.net_bps >= Q15.minNetBps, reason: g0.pass && g0.net_bps < Q15.minNetBps ? 'net_below_2bps' : g0.reason, gross_bps: g0.gross_bps, net_bps: g0.net_bps, cost_bps: g0.cost?.total_bps ?? null, edge }
      if (!gate.pass) { rec('rejected', gate.reason, { gate }); continue }
      const margin = want / cfg.lev
      const checks = [
        { k: 'burst', v: sig.z, thr: Q15.zMin, op: '>', ok: Math.abs(sig.z) > Q15.zMin },
        { k: 'volume', v: sig.volRatio, thr: Q15.volMult, op: '>=', ok: sig.volRatio >= Q15.volMult },
        { k: 'flow', v: sig.imb, thr: Q15.imbMin, op: '>', ok: sig.dir * sig.imb > Q15.imbMin },
        { k: 'btc', v: btcUp === null ? null : btcUp ? 1 : 0, thr: null, op: 'side', ok: sym === 'BTC' || (btcUp !== null && btcUp === (sig.dir > 0)) },
        { k: 'gate', v: gate.net_bps, thr: Q15.minNetBps, op: '>=', ok: true },
      ]
      entries.push({ sym, side, price: px, notional: want, lev: cfg.lev, quote_ts: bk.E, source: 'binance-futures',
        q15: { stop: lv.stop, target: lv.target, r: lv.r, best: px, chk: bk.E, stop_pct: rFrac, lev: cfg.lev, margin, liq: q15Liq(sig.dir, px, cfg.lev), hold_min: Q15_HOLD_MIN, gate,
          z: sig.z, vol_ratio: sig.volRatio, imb: sig.imb, atr: sig.atr, checks, btc_up: btcUp, spread_bps: +spreadBps.toFixed(2), bar: new Date(lastBar).toISOString(),
          entry_fill: { model: 'book_walk', touch, vwap: w.vwap, impact_bps: +(Math.abs(px / touch - 1) * 1e4).toFixed(2), exit_impact_bps: +(wx.impact * 1e4).toFixed(2), depth_usd: Math.round(w.depthUsd) } } })
      rec('accepted', 'taken', { notional: want, gate })
      for (const sh of shadows) if (sh.sym === sym) sh.taken = true
      held.add(sym); openN++; dayN++; q15Margin += margin; cash -= margin + want * 0.0005
    }
  }
  if (shadows.length) { try { await db.from('q15_shadow').upsert(shadows, { onConflict: 'sym,bar', ignoreDuplicates: true }) } catch { /* journal only */ } }
  const reasons: Record<string, number> = {}
  for (const d of decisions) reasons[d.reason] = (reasons[d.reason] || 0) + 1
  const note = { fill_model: 'aggTrades+book_walk', lev: cfg.lev, per_trade: cfg.perTrade, max_open: cfg.maxOpen, share: cfg.share,
    gate: { min_net_bps: Q15.minNetBps, edge }, bar: new Date(lastBar).toISOString(), due, scanned, universe: pairs.length, failed: failed.length,
    signals, candidates: decisions.length, fills: entries.length, reasons, shadow_scored: scored, scan_ms: Date.now() - now }
  const { data: result } = await db.rpc('q15_commit_cycle', { p_lease: lease, p_closes: closes, p_entries: entries, p_updates: updates, p_marks: marks, p_note: note, p_bar: due ? new Date(bar).toISOString() : null }).throwOnError()
  if (decisions.length) {
    try { await db.from('trade_decisions').insert(decisions.slice(0, 100).map((d, k) => ({ sym: d.sym, side: d.side, decision: d.decision, reason: d.reason, rank: k + 1, notional: d.notional ?? null, score: +(Math.abs(d.z) * d.volRatio).toFixed(3),
      observed: { z3: d.z, vol_ratio: d.volRatio, taker_imbalance_3: d.imb, spread_bps: d.spread_bps ?? null }, inferred: { sleeve: 'Q15', gate: d.gate ?? null, note: 'P-Q15 owner rule, preregistered, not validated' } }))) } catch { /* journal only */ }
  }
  return { changed: true, ...result, ...note }
}

// Score open q15_shadow rows whose 2h window has passed: the exact bracket replayed on 1m bars from the entry minute
export async function scoreQ15Shadows(db: any, pairOf: (sym: string) => Pair, now: number): Promise<number> {
  let n = 0
  try {
    const { data } = await db.from('q15_shadow').select('id,sym,side,t0,px0,stop,target,hold_min').eq('status', 'open').lte('t0', now - (Q15_HOLD_MIN + 2) * 60_000).order('t0').limit(20)
    await pool<any>(data ?? [], 6, async (r: any) => {
      try {
        const P = pairOf(String(r.sym)), hm = Number(r.hold_min), b = await bars1m(P, Number(r.t0), hm + 1)
        const res = q15Bracket(Number(r.side) as 1 | -1, Number(r.px0), Number(r.stop), Number(r.target), b, hm)
        if (!res) throw new Error('window incomplete')
        await db.from('q15_shadow').update({ status: 'closed', px1: res.px, why: res.why, gross_bps: Number(r.side) * (res.px / Number(r.px0) - 1) * 1e4, closed_at: new Date(now).toISOString() }).eq('id', r.id)
        n++
      } catch { if (now - Number(r.t0) > 6 * 3600_000) await db.from('q15_shadow').update({ status: 'failed', closed_at: new Date(now).toISOString() }).eq('id', r.id) }
    })
  } catch { /* journal only */ }
  return n
}

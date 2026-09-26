// v95.0 — FAST sleeve runner (see shared/fast.ts for the rule). Every cycle: exits for open FAST rows resolved on the
// real trade tape since the last check (v95.6); once per 5m bar (first 2 minutes after the close): scan every pair in the dynamic universe (market_cache
// 'universe', pinned 40 as fallback), rank the signals, enter the strongest within the 5-open / 20-per-day limits.
// Books through `fast_commit_cycle` (paper 1x; caps enforced again in SQL). Decisions go to trade_decisions.
import * as S from '../../../shared/strategy.ts'
import { FAST, FAST_RT, FAST_TRAIL, WYCKOFF, wyckoffSignal, fastSignal, fastSignalRT, fastLevels, fastLiq, resolveExit, walkBook, liqCap, FAST_LIQ, type AggTrade } from '../../../shared/fast.ts'
import { labInd, slipFor, type LBar } from '../../../shared/lab.ts'
import { FAST_ENTRY, confirmFastEntry } from '../../../shared/fast-entry.ts'
import { json, pool } from './rota-runner.ts'
type Pair = { sym: string; s: string; k: number }
const g = () => globalThis as any
export function fastConfig() { const x = Number(g().__FAST_SHARE), l = Number(g().__FAST_LEV)
  return { share: Number.isFinite(x) && x > 0 ? Math.min(1, Math.max(0.05, x)) : 1, lev: Number.isFinite(l) && l >= 1 ? Math.min(FAST.levMax, Math.floor(l)) : FAST.levDefault, mode: modeOf(String(g().__FAST_MODE ?? 'rt')) } }
// 'rt' = real-time burst (v95.4), 'bar' = 5m-close burst (v95.0), 'wyckoff' = 5m-close spring / upthrust (v96.1)
const modeOf = (m: string): 'rt' | 'bar' | 'wyckoff' => (m === 'bar' || m === 'wyckoff' ? m : 'rt')
async function universe(db: any): Promise<Pair[]> {
  try {
    const { data } = await db.from('market_cache').select('data').eq('key', 'universe').throwOnError()
    const p = data?.[0]?.data?.pairs
    if (Array.isArray(p) && p.length >= 20) return p.map((x: any) => ({ sym: String(x.sym), s: String(x.s), k: Number(x.k) || 1 }))
  } catch { /* fallback */ }
  return S.CRYPTO_40.map((c) => (c === 'PEPE' ? { sym: 'PEPE', s: '1000PEPEUSDT', k: 1000 } : { sym: c, s: `${c}USDT`, k: 1 }))
}
async function bars5m(p: Pair, now: number): Promise<LBar[]> {
  const r = await json(`https://fapi.binance.com/fapi/v1/klines?symbol=${p.s}&interval=5m&limit=80`)
  return r.filter((x: any) => Number(x[6]) < now).map((x: any) => ({ t: +x[0], open: +x[1] / p.k, high: +x[2] / p.k, low: +x[3] / p.k, close: +x[4] / p.k, vol: +x[5] * p.k, tb: +x[9] * p.k }))
}
// 1m klines INCLUDING the forming minute (real-time mode)
async function bars1mLive(p: Pair): Promise<LBar[]> {
  const r = await json(`https://fapi.binance.com/fapi/v1/klines?symbol=${p.s}&interval=1m&limit=45`)
  return r.map((x: any) => ({ t: +x[0], open: +x[1] / p.k, high: +x[2] / p.k, low: +x[3] / p.k, close: +x[4] / p.k, vol: +x[5] * p.k, tb: +x[9] * p.k }))
}
// aggregated trades since `from` (ms), oldest first, paginated; complete=false if the window had more than 5,000 prints
async function aggTrades(p: Pair, from: number, to: number): Promise<{ trades: AggTrade[]; complete: boolean }> {
  const out: AggTrade[] = []
  let url = `https://fapi.binance.com/fapi/v1/aggTrades?symbol=${p.s}&startTime=${from}&endTime=${to}&limit=1000`
  for (let page = 0; page < 5; page++) {
    const r = await json(url)
    for (const x of r) out.push({ p: +x.p / p.k, T: +x.T })
    if (r.length < 1000) return { trades: out, complete: true }
    url = `https://fapi.binance.com/fapi/v1/aggTrades?symbol=${p.s}&fromId=${+r[r.length - 1].a + 1}&limit=1000`
  }
  return { trades: out.filter((x) => x.T <= to), complete: false }
}
async function book(p: Pair): Promise<{ bids: [number, number][]; asks: [number, number][]; E: number }> {
  const d = await json(`https://fapi.binance.com/fapi/v1/depth?symbol=${p.s}&limit=100`)
  const lv = (a: any[]) => a.map((x: any) => [+x[0] / p.k, +x[1] * p.k] as [number, number])
  const b = { bids: lv(d.bids), asks: lv(d.asks), E: +d.E }
  if (!b.bids.length || !b.asks.length || Math.abs(Date.now() - b.E) > 15_000) throw new Error(`bad book ${p.sym}`)
  return b
}
export async function runFast(db: any, state: any, lease: string, paper: boolean) {
  if (!paper) throw new Error('FAST is paper-only; refusing live execution')
  const cfg = fastConfig(), now = Date.now(), params = state.bot_params || {}
  const { data: open } = await db.from('bot_trades').select('*').eq('status', 'OPEN').throwOnError()
  if (open.some((t: any) => t.paper_mode !== true || (t.strategy !== 'FAST' && Number(t.lev) !== 1))) throw new Error('FAST requires a paper-only book (only FAST rows may be leveraged)')
  const mine = open.filter((t: any) => t.strategy === 'FAST')
  const pairs = await universe(db), byS = new Map(pairs.map((p) => [p.sym, p]))
  const pairOf = (sym: string): Pair => byS.get(sym) ?? { sym, s: `${sym}USDT`, k: 1 }
  // exits (v95.6): resolved against the real Binance trades since the last check, as the exchange would run a resting
  // stop / take-profit / trailing stop — not against whatever the book shows when this (possibly late) cycle runs
  const closes: any[] = [], marks: Record<string, number> = {}, trails: any[] = []
  await pool<any>(mine, 6, async (t) => {
    try {
      const P = pairOf(t.sym), dir = (t.side === 'LONG' ? 1 : -1) as 1 | -1, m = t.scalp_meta?.fast
      if (!m) return
      const entry = Number(t.entry_price), size = Number(t.size), lev = Math.max(1, Number(t.lev) || 1), liq = fastLiq(dir, entry, lev)
      // Binance serves at most a 1h aggTrades window; FAST holds <= 30 min, so this only bites after a long outage
      // a row with no chk predates v95.6: its stored stop may already be trailed, so replaying its tape from the open would
      // test early prints against a later stop (look-ahead — this booked CC #653 at a print 1 s after entry). Such rows
      // are resolved only from now on.
      const from = (Number(m.chk) > 0 ? Math.max(Date.parse(t.opened_at), Number(m.chk), now - 3_500_000) : now - 20_000) + 1
      const tr = await aggTrades(P, from, now)
      const st = { dir, entry, r: Number(m.r), stop: Number(m.stop), target: m.trail ? null : Number(m.target), liq, best: Number(m.best ?? entry), trail: !!m.trail || FAST_TRAIL.on }
      const res = resolveExit(st, tr.trades)
      const held = now - Date.parse(t.opened_at), holdMs = (Number(m.hold_min) || FAST.holdBars * 5) * 60_000
      if (res.why) {
        let price = res.px, fill: any = { model: tr.complete ? 'aggTrades' : 'aggTrades_truncated', trigger_ts: res.T, trigger_px: res.px, detected_ts: now, lag_ms: now - res.T }
        if (res.why === 'STOP') {   // stop-market: the trigger trade's price, then the order walks the book (current shape, INFERRED)
          const bk = await book(P); const w = walkBook(dir > 0 ? bk.bids : bk.asks, entry * size)
          const imp = Math.max(Number.isFinite(w.impact) ? w.impact : 0, slipFor(t.sym))
          price = res.px * (1 - dir * imp); fill = { ...fill, impact_bps: +(imp * 1e4).toFixed(2), depth_usd: Math.round(w.depthUsd), beyond_book: w.beyond }
        }
        closes.push({ id: t.id, price, reason: res.why, quote_ts: Date.now(), fill }); marks[t.sym] = price; return
      }
      const bk = await book(P), w = walkBook(dir > 0 ? bk.bids : bk.asks, entry * size)
      const top = dir > 0 ? bk.bids[0][0] : bk.asks[0][0]; marks[t.sym] = top
      if (held >= holdMs) {   // time exit: a market order now, priced by walking the book
        const imp = Math.max(Number.isFinite(w.impact) ? w.impact : 0, slipFor(t.sym))
        closes.push({ id: t.id, price: top * (1 - dir * imp), reason: 'TIMEOUT', quote_ts: bk.E, fill: { model: 'book_walk', impact_bps: +(imp * 1e4).toFixed(2), depth_usd: Math.round(w.depthUsd), beyond_book: w.beyond, detected_ts: now } })
        return
      }
      const oldChk = Number(m.chk) || 0, chk = res.lastT ?? oldChk
      if (res.stop !== Number(m.stop) || res.best !== Number(m.best ?? entry) || chk > oldChk) trails.push({ id: t.id, stop: res.stop, best: res.best, chk })
    } catch { /* no data: held until the next cycle, and the next cycle re-reads every trade since the last check */ }
  })
  // entries: once per completed 5m bar
  // bar mode: once per completed 5m bar; real-time mode: a fresh scan every FAST_RT.scanEveryMs (fast_bar = last scan time)
  const done = Number(params.fast_bar) || 0
  const bar = cfg.mode !== 'rt' ? Math.floor(now / FAST.barMs) * FAST.barMs : now
  const due = (cfg.mode !== 'rt' ? bar > done && now - bar <= FAST.entryWindowMs : now - done >= FAST_RT.scanEveryMs) && !state.hard_halt_at
  if (trails.length) { try { await db.rpc('fast_trail', { p_lease: lease, p_updates: trails }).throwOnError() } catch { /* next cycle retries */ } }
  if (!due && !closes.length) return { changed: trails.length > 0, open: mine.length, trailed: trails.length }
  const entries: any[] = [], decisions: any[] = [], failed: string[] = []
  let scanned = 0
  if (due) {
    const data = new Map<string, LBar[]>()
    const rt = cfg.mode === 'rt', wy = cfg.mode === 'wyckoff'
    await pool(pairs, 12, async (p) => { try {
      const b = rt ? await bars1mLive(p) : await bars5m(p, now)
      if (rt ? b.length >= 40 && now - b[b.length - 1].t < 120_000 : b.length && b[b.length - 1].t + FAST.barMs === bar) data.set(p.sym, b); else failed.push(p.sym) } catch { failed.push(p.sym) } })
    scanned = data.size
    const btc = data.get('BTC'); let btcUp: boolean | null = null
    if (btc) { const bb = rt ? btc.slice(0, -1) : btc, bi = labInd(bb), k = bb.length - 1; if (bi.ema20[k] > 0) btcUp = bb[k].close > bi.ema20[k] }
    // real-time: one entry per coin per FAST_RT.cooldownMs
    const recent = new Set<string>()
    if (rt) { const since = new Date(now - FAST_RT.cooldownMs).toISOString()   // v95.7: from the last open OR close of the coin
      const { data: rr } = await db.from('bot_trades').select('sym').eq('strategy', 'FAST').or(`opened_at.gte.${since},closed_at.gte.${since}`); for (const x of rr ?? []) recent.add(String(x.sym)) }
    const sigs: { sym: string; sig: NonNullable<ReturnType<typeof fastSignal>> }[] = []
    for (const [sym, b] of data) { if (recent.has(sym)) continue; const sg = rt ? fastSignalRT(b, btcUp, sym === 'BTC') : wy ? wyckoffSignal(b) : fastSignal(b, btcUp, sym === 'BTC'); if (sg) sigs.push({ sym, sig: sg }) }
    sigs.sort((a, b) => b.sig.strength - a.sig.strength)
    const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0)
    const { count: today } = await db.from('bot_trades').select('id', { count: 'exact', head: true }).eq('strategy', 'FAST').gte('opened_at', dayStart.toISOString())
    let openN = mine.length - closes.length, dayN = Number(today) || 0
    let cash = Number(state.balance)
    const equity = cash + open.reduce((s: number, t: any) => s + Number(t.entry_price) * Number(t.size) / Math.max(1, Number(t.lev) || 1), 0)   // margin, not notional
    const held = new Set(open.filter((t: any) => !closes.some((c) => c.id === t.id)).map((t: any) => String(t.sym)))
    for (const candidate of sigs) {
      const sym = candidate.sym
      let sig = candidate.sig
      const side = sig.dir > 0 ? 'LONG' : 'SHORT', rec = (decision: string, reason: string, extra: any = {}) => decisions.push({ sym, side, decision, reason, z: sig.z, volRatio: sig.volRatio, imb: sig.imb, ...extra })
      if (held.has(sym)) { rec('rejected', 'coin_held'); continue }
      if (openN >= FAST.maxOpen) { rec('rejected', 'fast_full'); continue }
      if (dayN >= FAST.maxPerDay) { rec('rejected', 'daily_cap_20'); continue }
      let bk: Awaited<ReturnType<typeof book>>, entryCheck: any = null, entryBtcUp = btcUp
      try {
        if (rt) {
          // The universe scan is discovery only. Re-read this coin and BTC just
          // before its book: a signal may have vanished while other pairs loaded.
          const started = Date.now(), P = pairOf(sym)
          const [fresh, freshBtc] = await Promise.all([bars1mLive(P), sym === 'BTC' ? Promise.resolve(null) : bars1mLive(pairOf('BTC'))])
          bk = await book(P)
          const check = confirmFastEntry(fresh, freshBtc ?? fresh, sym === 'BTC', sig.dir,
            bk.bids[0][0], bk.asks[0][0], bk.E, started, Date.now())
          if (!check.ok) { rec('rejected', check.reason); continue }
          sig = check.sig; entryBtcUp = check.btcUp; entryCheck = check.detail
        } else bk = await book(pairOf(sym))
      } catch { rec('rejected', 'no_fresh_entry_data'); continue }
      const want = Math.min(equity * FAST.perTrade * cfg.share, cash / (1 + cfg.lev * 0.0005)) * cfg.lev
      if (want / cfg.lev < 5) { rec('rejected', 'no_cash'); continue }
      const touch = sig.dir > 0 ? bk.asks[0][0] : bk.bids[0][0]
      // v95.7: never a ticket the book cannot carry — impact on entry AND exit side <= FAST_LIQ.impactOfR of the stop distance
      const rFrac = Math.max(sig.atr, touch * FAST.stopMinPct) / touch
      const cap = liqCap(sig.dir > 0 ? bk.asks : bk.bids, sig.dir > 0 ? bk.bids : bk.asks, FAST_LIQ.impactOfR * rFrac)
      const notional = Math.min(want, cap), margin = notional / cfg.lev
      if (margin < 5) { rec('rejected', 'book_too_thin', { want, cap }); continue }
      // v95.6: a market order of this size walks the real book; never better than the old fixed-slippage fill
      const w = walkBook(sig.dir > 0 ? bk.asks : bk.bids, notional)
      const floorPx = touch * (1 + sig.dir * slipFor(sym)), px = sig.dir > 0 ? Math.max(w.vwap, floorPx) : Math.min(w.vwap, floorPx)
      const lv = wy ? fastLevels(sig.dir, px, Math.max(sig.dir * (px - (sig as any).stopPx), 0)) : fastLevels(sig.dir, px, sig.atr),   // wyckoff: stop at the spring extreme + buffer (floor 0.3%)
        spreadBps = (bk.asks[0][0] - bk.bids[0][0]) / ((bk.asks[0][0] + bk.bids[0][0]) / 2) * 1e4
      // v95.6: the RAW values the engine decided on, plus the engine's own verdict per condition (no re-derivation on screen)
      const thr = rt ? FAST_RT : FAST
      const ws = sig as any
      const checks = wy ? [
        { k: 'range', v: ws.height, thr: WYCKOFF.maxHeightAtr, op: '<=', ok: ws.height <= WYCKOFF.maxHeightAtr },
        { k: 'spring', v: sig.z, thr: 0, op: '>', ok: sig.z > 0 },
        { k: 'reclaim', v: sig.dir > 0 ? ws.lo : ws.hi, thr: null, op: 'close_inside', ok: true },
        { k: 'volume', v: sig.volRatio, thr: WYCKOFF.maxVolRatio, op: '<', ok: sig.volRatio < WYCKOFF.maxVolRatio },
      ] : [
        { k: 'burst', v: sig.z, thr: thr.zMin, op: '>', ok: Math.abs(sig.z) > thr.zMin },
        { k: 'volume', v: sig.volRatio, thr: thr.volMult, op: '>=', ok: sig.volRatio >= thr.volMult },
        { k: 'flow', v: sig.imb, thr: thr.imbMin, op: '>', ok: sig.dir * sig.imb > thr.imbMin },
        { k: 'btc', v: entryBtcUp === null ? null : entryBtcUp ? 1 : 0, thr: null, op: 'side', ok: sym === 'BTC' || (entryBtcUp !== null && entryBtcUp === (sig.dir > 0)) },
      ]
      entries.push({ sym, side, price: px, notional, lev: cfg.lev, quote_ts: bk.E, source: 'binance-futures',
        fast: { stop: lv.stop, target: lv.target, r: lv.r, best: px, chk: bk.E, trail: FAST_TRAIL.on, stop_pct: lv.r / px, lev: cfg.lev, margin, liq: fastLiq(sig.dir, px, cfg.lev), mode: cfg.mode, hold_min: rt ? FAST_RT.holdMin : wy ? WYCKOFF.holdMin : FAST.holdBars * 5, wyckoff: wy ? { lo: ws.lo, hi: ws.hi, height: ws.height, ext: ws.ext, stop_px: ws.stopPx } : undefined,
          z: sig.z, vol_ratio: sig.volRatio, imb: sig.imb, checks, btc_up: entryBtcUp, entry_check: entryCheck, spread_bps: +spreadBps.toFixed(2), bar: new Date(bar).toISOString(),
          entry_fill: { model: 'book_walk', want: Math.round(want), liq_cap: Math.round(cap), capped: cap < want, max_impact_bps: +(FAST_LIQ.impactOfR * rFrac * 1e4).toFixed(2), touch, vwap: w.vwap, impact_bps: +(Math.abs(px / touch - 1) * 1e4).toFixed(2), depth_usd: Math.round(w.depthUsd), beyond_book: w.beyond } } })
      rec('accepted', 'taken', { notional, entry_check: entryCheck })
      held.add(sym); openN++; dayN++; cash -= margin + notional * 0.0005
    }
  }
  // A later candidate's slow network request must not turn earlier fresh quotes
  // into stale fills (or make the SQL transaction reject otherwise valid exits).
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i], check = e.fast.entry_check
    if (check && (Date.now() - check.snapshot_started_at > FAST_ENTRY.maxAgeMs || Date.now() - e.quote_ts > FAST_ENTRY.maxAgeMs)) {
      entries.splice(i, 1)
      const d = decisions.find(x => x.sym === e.sym && x.decision === 'accepted')
      if (d) { d.decision = 'rejected'; d.reason = 'entry_expired_before_commit'; d.notional = null }
    }
  }
  const note = { entry_model: FAST_ENTRY.version, fill_model: 'aggTrades+book_walk', mode: cfg.mode, bar: new Date(bar).toISOString(), due, scanned, universe: pairs.length, failed: failed.length, signals: decisions.length, opened: entries.length, closed: closes.length }
  const { data: result } = await db.rpc('fast_commit_cycle', { p_lease: lease, p_closes: closes, p_entries: entries, p_marks: marks, p_share: cfg.share, p_note: note, p_bar: due ? new Date(bar).toISOString() : null }).throwOnError()
  if (decisions.length) {
    try { await db.from('trade_decisions').insert(decisions.slice(0, 100).map((d, k) => ({ sym: d.sym, side: d.side, decision: d.decision, reason: d.reason, rank: k + 1, notional: d.notional ?? null, score: +(Math.abs(d.z) * d.volRatio).toFixed(3),
      observed: { z3: d.z, vol_ratio: d.volRatio, taker_imbalance_3: d.imb, entry_check: d.entry_check ?? null }, inferred: { sleeve: 'FAST', mode: cfg.mode, note: cfg.mode === 'wyckoff' ? 'owner Wyckoff spring/upthrust rule, tested negative OOS, not validated' : 'owner all-in intraday rule, not validated' } }))) } catch { /* journal only */ }
  }
  return { changed: true, ...result, ...note }
}

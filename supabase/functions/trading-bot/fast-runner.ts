// v95.0 — FAST sleeve runner (see shared/fast.ts for the rule). Every cycle: exits for open FAST rows resolved on the
// real trade tape since the last check (v95.6); once per 5m bar (first 2 minutes after the close): scan every pair in the dynamic universe (market_cache
// 'universe', pinned 40 as fallback), rank the signals, enter the strongest within the 5-open / 20-per-day limits.
// Books through `fast_commit_cycle` (paper 1x; caps enforced again in SQL). Decisions go to trade_decisions.
import * as S from '../../../shared/strategy.ts'
import { FAST, FAST_RT, FAST_TRAIL, FAST_GATE, fastEdge, fastPsychOn, WYCKOFF, wyckoffSignal, PSYCH, psychState, psychBlock, fastSignal, fastSignalRT, fastLevels, fastLiq, resolveExit, walkBook, liqCap, FAST_LIQ, type AggTrade } from '../../../shared/fast.ts'
import { profitGate, bookFrom } from '../../../shared/costs.ts'
import { labInd, slipFor, type LBar } from '../../../shared/lab.ts'
import { FAST_ENTRY, confirmFastEntry } from '../../../shared/fast-entry.ts'
import { json, pool } from './rota-runner.ts'
import { RETEST, retestSignal, retestLevels, retestExecution, type RetestSig } from '../../../shared/intraday-retest.ts'
import { sleeveOff } from '../../../shared/sleeves.ts'
export type Pair = { sym: string; s: string; k: number }
const g = () => globalThis as any
export function fastConfig() { const x = Number(g().__FAST_SHARE), l = Number(g().__FAST_LEV), mo = Number(g().__FAST_MAX_OPEN), pt = Number(g().__FAST_PER_TRADE)
  return { share: Number.isFinite(x) && x > 0 ? Math.min(1, Math.max(0.05, x)) : 1, lev: Number.isFinite(l) && l >= 1 ? Math.min(FAST.levMax, Math.floor(l)) : FAST.levDefault, mode: modeOf(String(g().__FAST_MODE ?? 'rt')),
    // v99.4: optional per-trade fraction of equity and open cap (QUICK sleeve next to LIST/FUND: 5% x <= 5)
    maxOpen: Number.isFinite(mo) && mo >= 1 ? Math.min(FAST.maxOpen, Math.floor(mo)) : FAST.maxOpen,
    perTrade: Number.isFinite(pt) && pt > 0 ? Math.min(0.34, pt) : null as number | null } }
// 'rt' = real-time burst (v95.4), 'bar' = 5m-close burst (v95.0), 'wyckoff' = 5m-close spring / upthrust (v96.1)
const modeOf = (m: string): 'rt' | 'bar' | 'wyckoff' | 'retest' => (m === 'bar' || m === 'wyckoff' || m === 'retest' ? m : 'rt')
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
export async function aggTrades(p: Pair, from: number, to: number): Promise<{ trades: AggTrade[]; complete: boolean }> {
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
export async function book(p: Pair): Promise<{ bids: [number, number][]; asks: [number, number][]; E: number }> {
  const d = await json(`https://fapi.binance.com/fapi/v1/depth?symbol=${p.s}&limit=100`)
  const lv = (a: any[]) => a.map((x: any) => [+x[0] / p.k, +x[1] * p.k] as [number, number])
  const b = { bids: lv(d.bids), asks: lv(d.asks), E: +d.E }
  if (!b.bids.length || !b.asks.length || Math.abs(Date.now() - b.E) > 15_000) throw new Error(`bad book ${p.sym}`)
  return b
}
export async function runFast(db: any, state: any, lease: string, paper: boolean) {
  if (!paper) throw new Error('FAST is paper-only; refusing live execution')
  const cfg = fastConfig(), now = Date.now(), params = state.bot_params || {}
  const retest = cfg.mode === 'retest'
  if (retest) { cfg.lev = Math.min(cfg.lev, RETEST.maxLeverage); cfg.maxOpen = Math.min(cfg.maxOpen, RETEST.maxOpen) }
  const { data: open } = await db.from('bot_trades').select('*').eq('status', 'OPEN').throwOnError()
  // P-AGG2: FAST and EVT rows are isolated-leveraged (<= 10x, SQL); every other row must be 1x (DONCH4H never inherits it)
  if (open.some((t: any) => t.paper_mode !== true || (t.strategy !== 'FAST' && t.strategy !== 'EVT' && Number(t.lev) !== 1) || Number(t.lev) > FAST.levMax)) throw new Error('FAST requires a paper-only book (only FAST/EVT rows may be leveraged, <= 10x)')
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
  const halted = aggHalted(params, now)   // P-AGG2: account -12% day halt (the ledger enforces it again)
  const due = (cfg.mode === 'retest' ? now - done >= FAST_RT.scanEveryMs : cfg.mode !== 'rt' ? bar > done && now - bar <= FAST.entryWindowMs : now - done >= FAST_RT.scanEveryMs) && !state.hard_halt_at && !halted && !sleeveOff(params, 'FAST')  // v99.6: supervisor's brake = entries only
  if (trails.length) { try { await db.rpc('fast_trail', { p_lease: lease, p_updates: trails }).throwOnError() } catch { /* next cycle retries */ } }
  const shadowScored = cfg.mode === 'rt' ? await scoreShadows(db, pairOf, now) : 0
  if (!due && !closes.length) return { changed: trails.length > 0, open: mine.length, trailed: trails.length, shadow_scored: shadowScored, halted }
  const entries: any[] = [], decisions: any[] = [], failed: string[] = [], shadows: any[] = []
  let scanned = 0, edge: ReturnType<typeof fastEdge> = { bps: NaN, n: 0, buckets: 0, mean: NaN, t: NaN }
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
    for (const [sym, b] of data) { if (recent.has(sym)) continue; const sg = rt ? fastSignalRT(b, btcUp, sym === 'BTC') : wy ? wyckoffSignal(b) : retest ? retestSignal(b, btcUp, sym === 'BTC') : fastSignal(b, btcUp, sym === 'BTC'); if (sg) sigs.push({ sym, sig: sg }) }
    sigs.sort((a, b) => b.sig.strength - a.sig.strength)
    // P-AGG2: every discovered real-time signal is journalled once per coin while its previous one is still open, and
    // scored at its hold horizon later (scoreShadows) — the measurement the profit gate reads
    const funding = new Map<string, number>()
    if (rt && sigs.length) {
      try { const { data: os } = await db.from('fast_shadow').select('sym').eq('status', 'open'); const openSh = new Set((os ?? []).map((x: any) => String(x.sym)))
        for (const { sym, sig } of sigs) { const b = data.get(sym)!; if (!openSh.has(sym)) shadows.push({ sym, side: sig.dir, t0: now, px0: b[b.length - 1].close, hold_min: FAST_RT.holdMin, z: sig.z, vol_ratio: sig.volRatio, imb: sig.imb, taken: false }) } } catch { /* journal only */ }
      try { const { data: rows } = await db.from('fast_shadow').select('t0,gross_bps').eq('status', 'closed').order('t0', { ascending: false }).limit(FAST_GATE.window)
        edge = fastEdge((rows ?? []).map((r: any) => ({ t0: Number(r.t0), gross_bps: Number(r.gross_bps) })).reverse()) } catch { /* no estimate -> the gate refuses */ }
      try { const prem = await json('https://fapi.binance.com/fapi/v1/premiumIndex'); for (const x of prem) funding.set(String(x.symbol), Number(x.lastFundingRate)) } catch { /* funding missing -> charged 0, labelled */ }
    }
    const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0)
    const { count: today } = await db.from('bot_trades').select('id', { count: 'exact', head: true }).eq('strategy', 'FAST').gte('opened_at', dayStart.toISOString())
    // v96.2 trader psychology (discipline) on FAST closes of the last 26h, plus the closes booked in THIS cycle
    const { data: pc } = await db.from('bot_trades').select('sym,pnl,closed_at').eq('strategy', 'FAST').neq('status', 'OPEN').gte('closed_at', new Date(now - 26 * 3600_000).toISOString())
    const psy = psychState((pc ?? []).map((x: any) => ({ sym: String(x.sym), pnl: Number(x.pnl), closedAt: Date.parse(x.closed_at) })), now)
    let openN = mine.length - closes.length, dayN = Number(today) || 0
    let cash = Number(state.balance)
    const equity = cash + open.reduce((s: number, t: any) => s + Number(t.entry_price) * Number(t.size) / Math.max(1, Number(t.lev) || 1), 0)   // margin, not notional
    const held = new Set(open.filter((t: any) => !closes.some((c) => c.id === t.id)).map((t: any) => String(t.sym)))
    const sideCounts: Record<string, number> = { LONG: 0, SHORT: 0 }
    for (const t of open) if (!closes.some(c => c.id === t.id)) sideCounts[t.side] = (sideCounts[t.side] || 0) + 1
    for (const candidate of sigs) {
      const sym = candidate.sym
      let sig = candidate.sig
      const side = sig.dir > 0 ? 'LONG' : 'SHORT', rec = (decision: string, reason: string, extra: any = {}) => decisions.push({ sym, side, decision, reason, z: sig.z, volRatio: sig.volRatio, imb: sig.imb, ...extra })
      if (retest && sideCounts[side] >= RETEST.maxSameSide) { rec('rejected', 'retest_direction_cap'); continue }
      if (held.has(sym)) { rec('rejected', 'coin_held'); continue }
      if (openN >= cfg.maxOpen) { rec('rejected', 'fast_full'); continue }
      if (dayN >= FAST.maxPerDay) { rec('rejected', 'daily_cap_20'); continue }
      const psyOn = fastPsychOn(cfg.mode)   // P-AGG2: discipline rules OFF in real-time mode
      const pb = psyOn ? psychBlock(psy, sym, now) : null; if (pb) { rec('rejected', pb, { streak: psy.streak, day_losses: psy.dayLosses }); continue }
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
      const want = Math.min(equity * (cfg.perTrade ?? FAST.perTrade * cfg.share) * (psyOn ? psy.sizeMult : 1), cash / (1 + cfg.lev * 0.0005)) * cfg.lev
      if (want / cfg.lev < 5) { rec('rejected', 'no_cash'); continue }
      const touch = sig.dir > 0 ? bk.asks[0][0] : bk.bids[0][0]
      // v95.7: never a ticket the book cannot carry — impact on entry AND exit side <= FAST_LIQ.impactOfR of the stop distance
      const rFrac = Math.max(sig.atr, touch * FAST.stopMinPct) / touch
      const cap = liqCap(sig.dir > 0 ? bk.asks : bk.bids, sig.dir > 0 ? bk.bids : bk.asks, FAST_LIQ.impactOfR * rFrac)
      let notional = Math.min(want, cap)
      if (retest) {
        const rs = sig as RetestSig
        const conservativeR = Math.max(sig.dir * (touch - rs.stopPx), touch * 0.003) / touch + 0.002
        notional = Math.min(notional, equity * RETEST.riskFraction / conservativeR)
      }
      let margin = notional / cfg.lev
      if (margin < 5) { rec('rejected', 'book_too_thin', { want, cap }); continue }
      // v95.6: a market order of this size walks the real book; never better than the old fixed-slippage fill
      const w = walkBook(sig.dir > 0 ? bk.asks : bk.bids, notional)
      const floorPx = touch * (1 + sig.dir * slipFor(sym)), px = sig.dir > 0 ? Math.max(w.vwap, floorPx) : Math.min(w.vwap, floorPx)
      // P-AGG2 PROFIT GATE (rt mode): measured gross of FAST's own signals vs the full cost model; net must be >= 2 bps
      let gate: any = null
      if (rt) {
        const P = pairOf(sym), g0 = profitGate({ grossEdgeBps: edge.bps, edgeN: edge.n, book: bookFrom(bk.bids, bk.asks, bk.E, 'binance-futures'), notional, side: sig.dir, holdMin: FAST_RT.holdMin, funding: funding.has(P.s) ? funding.get(P.s)! : null })
        gate = { pass: g0.pass && g0.net_bps >= FAST_GATE.minNetBps, reason: g0.pass && g0.net_bps < FAST_GATE.minNetBps ? 'net_below_2bps' : g0.reason, gross_bps: g0.gross_bps, net_bps: g0.net_bps, cost_bps: g0.cost?.total_bps ?? null, edge }
        if (!gate.pass) { rec('rejected', gate.reason, { gate }); continue }
      }
      const lv = retest ? retestLevels(sig as RetestSig, px) : wy ? fastLevels(sig.dir, px, Math.max(sig.dir * (px - (sig as any).stopPx), 0)) : fastLevels(sig.dir, px, sig.atr),   // wyckoff: stop at the spring extreme + buffer (floor 0.3%)
        spreadBps = (bk.asks[0][0] - bk.bids[0][0]) / ((bk.asks[0][0] + bk.bids[0][0]) / 2) * 1e4
      if (retest) {
        const exitBook = walkBook(sig.dir > 0 ? bk.bids : bk.asks, notional)
        const check = retestExecution(sig as RetestSig, px, bk.bids[0][0], bk.asks[0][0], bk.E, Date.now(),
          slipFor(sym), Math.abs(px / touch - 1), exitBook.impact)
        if (!check.ok || w.beyond || exitBook.beyond) { rec('rejected', check.ok ? 'retest_book_depth' : check.reason); continue }
        notional = Math.min(notional, equity * RETEST.riskFraction / (lv.r / px + check.costFraction!))
        margin = notional / cfg.lev
        if (margin < 5) { rec('rejected', 'retest_risk_budget'); continue }
        entryCheck = { version: RETEST.version, snapshot_started_at: bk.E, cost_fraction: check.costFraction, signal_time: (sig as RetestSig).signalTime }
      }
      // v95.6: the RAW values the engine decided on, plus the engine's own verdict per condition (no re-derivation on screen)
      const thr = rt ? FAST_RT : FAST
      const ws = sig as any
      const checks = retest ? [
        { k: 'retest', v: (sig as RetestSig).level, thr: null, op: 'closed_reclaim', ok: true },
        { k: 'cost_fraction', v: entryCheck.cost_fraction, thr: RETEST.maxCostR * lv.r / px, op: '<=', ok: true },
      ] : wy ? [
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
        fast: { stop: lv.stop, target: lv.target, r: lv.r, best: px, chk: bk.E, trail: FAST_TRAIL.on, stop_pct: lv.r / px, lev: cfg.lev, margin, liq: fastLiq(sig.dir, px, cfg.lev), mode: cfg.mode, hold_min: retest ? RETEST.holdMin : rt ? FAST_RT.holdMin : wy ? WYCKOFF.holdMin : FAST.holdBars * 5, wyckoff: wy ? { lo: ws.lo, hi: ws.hi, height: ws.height, ext: ws.ext, stop_px: ws.stopPx, trapped: ws.trapped } : undefined, psych: psyOn ? { streak: psy.streak, day_losses: psy.dayLosses, size_mult: psy.sizeMult } : { off: true }, gate,
          z: sig.z, vol_ratio: sig.volRatio, imb: sig.imb, checks, btc_up: entryBtcUp, entry_check: entryCheck, spread_bps: +spreadBps.toFixed(2), bar: new Date(bar).toISOString(),
          entry_fill: { model: 'book_walk', want: Math.round(want), liq_cap: Math.round(cap), capped: cap < want, max_impact_bps: +(FAST_LIQ.impactOfR * rFrac * 1e4).toFixed(2), touch, vwap: w.vwap, impact_bps: +(Math.abs(px / touch - 1) * 1e4).toFixed(2), depth_usd: Math.round(w.depthUsd), beyond_book: w.beyond } } })
      rec('accepted', 'taken', { notional, entry_check: entryCheck, gate })
      for (const sh of shadows) if (sh.sym === sym) sh.taken = true
      held.add(sym); sideCounts[side]++; openN++; dayN++; cash -= margin + notional * 0.0005
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
  if (shadows.length) { try { await db.from('fast_shadow').upsert(shadows, { onConflict: 'sym,t0', ignoreDuplicates: true }) } catch { /* journal only */ } }
  const note = { entry_model: FAST_ENTRY.version, fill_model: 'aggTrades+book_walk', lev: cfg.lev, per_trade: cfg.perTrade, max_open: cfg.maxOpen, psych: fastPsychOn(cfg.mode), gate: cfg.mode === 'rt' ? { min_net_bps: FAST_GATE.minNetBps, edge } : null, shadows: shadows.length, shadow_scored: shadowScored, mode: cfg.mode, bar: new Date(bar).toISOString(), due, scanned, universe: pairs.length, failed: failed.length, signals: decisions.length, opened: entries.length, closed: closes.length }
  const { data: result } = await db.rpc('fast_commit_cycle', { p_lease: lease, p_closes: closes, p_entries: entries, p_marks: marks, p_share: cfg.share, p_note: note, p_bar: due ? new Date(bar).toISOString() : null }).throwOnError()
  if (decisions.length) {
    try { await db.from('trade_decisions').insert(decisions.slice(0, 100).map((d, k) => ({ sym: d.sym, side: d.side, decision: d.decision, reason: d.reason, rank: k + 1, notional: d.notional ?? null, score: +(Math.abs(d.z) * d.volRatio).toFixed(3),
      observed: { z3: d.z, vol_ratio: d.volRatio, taker_imbalance_3: d.imb, entry_check: d.entry_check ?? null }, inferred: { sleeve: 'FAST', mode: cfg.mode, gate: d.gate ?? null, note: retest ? 'retest-v1 paper hypothesis; unvalidated; no historical profitability claim' : cfg.mode === 'wyckoff' ? 'owner Wyckoff spring/upthrust rule, tested negative OOS, not validated' : 'owner all-in intraday rule, not validated' } }))) } catch { /* journal only */ }
  }
  return { changed: true, ...result, ...note }
}

// P-AGG2: the account-level day halt as the ledger last recorded it (bot_params.agg_day); the SQL check is the authority
export function aggHalted(params: any, now: number): boolean {
  const a = params?.agg_day, d = new Date(now).toISOString().slice(0, 10)
  return !!(a && a.day === d && a.halted === true)
}
// P-AGG2: score open fast_shadow rows whose hold horizon has passed: gross = side x (1m close at t0 + hold / px0 - 1)
export async function scoreShadows(db: any, pairOf: (sym: string) => Pair, now: number): Promise<number> {
  let n = 0
  try {
    const { data } = await db.from('fast_shadow').select('id,sym,side,t0,px0,hold_min').eq('status', 'open').lte('t0', now - 16 * 60_000).order('t0').limit(20)
    await pool<any>(data ?? [], 6, async (r: any) => {
      const end = Number(r.t0) + Number(r.hold_min) * 60_000
      if (now < end + 60_000) return
      try {
        const P = pairOf(String(r.sym)), k = await json(`https://fapi.binance.com/fapi/v1/klines?symbol=${P.s}&interval=1m&startTime=${end - 59_999}&limit=2`)
        const bar = (k as any[]).find(x => Number(x[0]) <= end && end < Number(x[0]) + 60_000) ?? k[0]
        const px1 = Number(bar?.[4]) / P.k
        if (!(px1 > 0)) throw new Error('no close')
        await db.from('fast_shadow').update({ status: 'closed', px1, gross_bps: Number(r.side) * (px1 / Number(r.px0) - 1) * 1e4, closed_at: new Date(now).toISOString() }).eq('id', r.id)
        n++
      } catch { if (now - end > 2 * 3600_000) await db.from('fast_shadow').update({ status: 'failed', closed_at: new Date(now).toISOString() }).eq('id', r.id) }
    })
  } catch { /* journal only */ }
  return n
}

// v100.0 — PRO sleeve runner: the owner's 1m scalping specification (shared/pro.ts), alone in the paper book.
// Every cycle (~5 s): exits for open PRO rows on the live touch (bid for a long, ask for a short) — stop, target, the
// breakeven/trailing ratchet, the time stop and the 120-minute cap. Once per CLOSED 1m bar: every liquid USDT-M perp is
// pre-screened on its last 60 closed 1m bars (breakout + volume, exact); the pairs that pass get the full read — 1,500
// closed 1m, 400 closed 5m, 1,000 closed 15m bars — and the same features() / proCheck() the backtest ran; entries sized
// at 0.5% of equity at the stop. Books through `pro_commit_cycle`. The backtest covered 10 coins; the rest are untested.
// NOT VALIDATED: v100bt rejected the rule out-of-sample after costs (status/pro-scalp-v100.txt).
import { PRO, PRO_LIVE, features, proCheck, openPos, ratchet, proSize, proSlip, type Bar } from '../../../shared/pro.ts'
import { json, pool, quote } from './rota-runner.ts'
import { sleeveOff } from '../../../shared/sleeves.ts'
import { buildUniverse, FALLBACK, type Pair } from '../../../shared/universe.ts'

// v100.2 (owner: "trade every coin on Binance Futures, by the conditions"): the universe is every USDT-M perpetual that
// is crypto, TRADING, listed >= 3 days, >= $20M/24h and spread <= 10 bps (shared/universe.ts, refreshed hourly into
// market_cache 'universe'). Prices per ONE coin: 1000PEPEUSDT / 1000 = PEPE; other 1000x contracts trade as listed.
const kl = (p: Pair) => (x: any): Bar => ({ t: +x[0], open: +x[1] / p.k, high: +x[2] / p.k, low: +x[3] / p.k, close: +x[4] / p.k, vol: +x[5] * p.k })
async function closed(p: Pair, iv: string, limit: number, now: number): Promise<Bar[]> {
  const r = await json(`https://fapi.binance.com/fapi/v1/klines?symbol=${p.s}&interval=${iv}&limit=${limit}`)
  return r.filter((x: any) => Number(x[6]) < now).map(kl(p))
}
async function universe(db: any, now: number): Promise<{ pairs: Pair[]; src: string }> {
  let cached: Pair[] = [], age = Infinity
  try {
    const { data } = await db.from('market_cache').select('data,ts').eq('key', 'universe').throwOnError()
    const row = data?.[0]; if (Array.isArray(row?.data?.pairs)) { cached = row.data.pairs; age = now - Date.parse(row.ts) }
  } catch { /* refresh below */ }
  if (cached.length >= 20 && age < 3600_000) return { pairs: cached, src: 'cache' }
  try {
    const [info, tick, book] = await Promise.all([json('https://fapi.binance.com/fapi/v1/exchangeInfo'), json('https://fapi.binance.com/fapi/v1/ticker/24hr'), json('https://fapi.binance.com/fapi/v1/ticker/bookTicker')])
    const u = buildUniverse(info, tick, book, now)
    if (u.pairs.length >= 20) { try { await db.from('market_cache').upsert({ key: 'universe', data: u, ts: new Date(now).toISOString() }).throwOnError() } catch { /* use it anyway */ } return { pairs: u.pairs, src: 'binance' } }
  } catch { /* fall back */ }
  return cached.length >= 20 ? { pairs: cached, src: 'cache_stale' } : { pairs: FALLBACK, src: 'fallback_40' }
}
// two stages, one rule: a cheap 60-bar read of every pair finds the bars that BROKE OUT on > 1.5x volume (both are
// computed from the previous 15 / 20 bars only, so 60 bars give exactly the values the full window gives); only those
// pairs are read in full and judged by the complete proCheck(). Keeps ~100 pairs inside Binance's weight budget.
export function prescreen(m1: Bar[], N: number): { pass: boolean; volRatio: number; dir: number } {
  const i = m1.length - 1
  if (i < Math.max(N, PRO.volLen) + 1) return { pass: false, volRatio: 0, dir: 0 }
  let hi = -Infinity, lo = Infinity, vs = 0
  for (let j = i - N; j < i; j++) { hi = Math.max(hi, m1[j].high); lo = Math.min(lo, m1[j].low) }
  for (let j = i - PRO.volLen; j < i; j++) vs += m1[j].vol
  const x = m1[i], volRatio = vs > 0 ? x.vol / (vs / PRO.volLen) : 0, dir = x.close > hi ? 1 : x.close < lo ? -1 : 0
  return { pass: dir !== 0 && volRatio > PRO.volMult, volRatio, dir }
}
export const PRO_MAX_FULL = 15   // full reads per minute (17 weight each); the strongest pre-screened pairs first
// funding actually settled while the position was open (only queried when an 8h settlement fell inside the hold)
async function fundingPaid(symbol: string, dir: 1 | -1, notional: number, from: number, to: number): Promise<{ v: number; missing: boolean }> {
  const H8 = 8 * 3600_000
  if (Math.floor(from / H8) === Math.floor(to / H8)) return { v: 0, missing: false }
  try {
    const f = await json(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&startTime=${from}&endTime=${to}&limit=10`)
    return { v: dir * notional * (f as any[]).reduce((s, x) => s + Number(x.fundingRate || 0), 0), missing: false }
  } catch { return { v: dir * notional * 0.0001, missing: true } }
}

export async function runPro(db: any, state: any, lease: string, paper: boolean) {
  if (!paper) throw new Error('PRO is paper-only; refusing live execution')
  const now = Date.now(), params = state.bot_params || {}, P = PRO_LIVE
  const { data: open } = await db.from('bot_trades').select('*').eq('status', 'OPEN').throwOnError()
  if (open.some((t: any) => t.paper_mode !== true || t.strategy !== 'PRO')) throw new Error('PRO requires a paper-only book of PRO rows')
  // ── exits on the live touch ──
  const closes: any[] = [], updates: any[] = [], marks: Record<string, number> = {}
  await pool<any>(open, 3, async (t) => {
    try {
      const m = t.scalp_meta?.pro; if (!m) return
      const dir = (t.side === 'LONG' ? 1 : -1) as 1 | -1, q = await quote(String(t.sym)), px = dir > 0 ? q.bid : q.ask, slip = proSlip(t.sym)
      marks[t.sym] = px
      const s = { dir, entry: Number(t.entry_price), r: Number(m.r), stop: Number(m.stop), target: Number(m.target), best: Number(m.best ?? t.entry_price), bars: 0, reached1R: !!m.reached_1r }
      const held = (now - Date.parse(t.opened_at)) / 60_000
      let why: string | null = null
      if (dir * (px - s.stop) <= 0) why = s.reached1R ? 'TRAIL' : 'STOP'
      else if (dir * (px - s.target) >= 0) why = 'TARGET'
      else {
        ratchet(s, px)
        if (!s.reached1R && held >= P.timeStopBars) why = 'TIME'
        else if (held >= PRO.maxHoldBars) why = 'MAXHOLD'
      }
      if (why) {
        const notional = Number(t.entry_price) * Number(t.size), f = await fundingPaid(String(m.symbol ?? `${t.sym}USDT`), dir, notional, Date.parse(t.opened_at), now)
        closes.push({ id: t.id, price: px * (1 - dir * slip), quote_ts: q.ts, reason: why, funding: f.v, funding_missing: f.missing })
      } else if (s.stop !== Number(m.stop) || s.best !== Number(m.best ?? t.entry_price) || s.reached1R !== !!m.reached_1r)
        updates.push({ id: t.id, stop: s.stop, best: s.best, reached_1r: s.reached1R })
    } catch { /* no quote: next cycle */ }
  })
  // ── entries once per closed 1m bar (v100.1: any time inside the following minute; the data check below
  // still requires the newest closed 1m bar to be exactly that bar) ──
  const bar = Math.floor(now / 60_000) * 60_000 - 60_000          // open time of the bar that just closed
  const due = Number(params.pro_bar || 0) < bar && !state.hard_halt_at && !sleeveOff(params, 'PRO')
  if (!due && !closes.length && !updates.length) {
    if (Object.keys(marks).length && now - Date.parse(params.pro_marks?.ts ?? 0) > 15_000) {
      try { await db.rpc('pro_commit_cycle', { p_lease: lease, p_closes: [], p_updates: [], p_entries: [], p_marks: marks, p_note: { ...(params.pro_cycle ?? {}), marks_only: true }, p_bar: null }).throwOnError() } catch { /* display only */ }
    }
    return { changed: false, open: open.length }
  }
  const entries: any[] = [], coins: any[] = [], decisions: any[] = [], failed: string[] = []
  let gate: string | null = null, prescanned = 0, uni: any = null
  if (due) {
    // the day's realised R and the loss streak, from PRO closes (plus the ones booked in this cycle are next cycle's input)
    const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0)
    const { data: pc } = await db.from('bot_trades').select('pnl,risk_usd,closed_at').eq('strategy', 'PRO').neq('status', 'OPEN').gte('closed_at', new Date(now - 26 * 3600_000).toISOString()).order('closed_at', { ascending: true })
    const rs = (pc ?? []).map((x: any) => ({ R: Number(x.risk_usd) > 0 ? Number(x.pnl) / Number(x.risk_usd) : Math.sign(Number(x.pnl)), t: Date.parse(x.closed_at) }))
    const dayR = rs.filter((x) => x.t >= dayStart.getTime()).reduce((s, x) => s + x.R, 0)
    const last = rs.slice(-PRO.lossStreak)
    if (dayR <= -PRO.dayLossR) gate = `day_stop_${dayR.toFixed(2)}R`
    else if (last.length === PRO.lossStreak && last.every((x) => x.R < 0) && now < last[last.length - 1].t + PRO.cooldownMin * 60_000) gate = 'loss_streak_cooldown'
    const sigs: any[] = [], { pairs, src } = await universe(db, now)
    uni = { size: pairs.length, src }
    const pre: { p: Pair; volRatio: number; dir: number; close: number }[] = []
    await pool(pairs, 12, async (p) => {
      try {
        const m1 = await closed(p, '1m', 60, now)
        if (!m1.length || m1[m1.length - 1].t !== bar) { failed.push(p.sym); return }
        const ps = prescreen(m1, P.breakoutN); prescanned++
        if (ps.pass) pre.push({ p, volRatio: ps.volRatio, dir: ps.dir, close: m1[m1.length - 1].close })
      } catch { failed.push(p.sym) }
    })
    pre.sort((a, b) => b.volRatio - a.volRatio)
    await pool(pre.slice(0, PRO_MAX_FULL), 5, async ({ p }) => {
      try {
        const [m1, m5, m15] = await Promise.all([closed(p, '1m', 1500, now), closed(p, '5m', 400, now), closed(p, '15m', 1000, now)])
        if (!m1.length || m1[m1.length - 1].t !== bar) { failed.push(p.sym); return }
        const F = features(m1, m5, m15), i = m1.length - 1, sg = proCheck(m1, F, i, P.breakoutN)
        coins.push({ sym: p.sym, close: m1[i].close, dir: sg.dir, ok: sg.checks.filter((x) => x.ok).length, of: sg.checks.length, checks: Object.fromEntries(sg.checks.map((x) => [x.k, x.ok])) })
        if (sg.dir) sigs.push({ sym: p.sym, symbol: p.s, k: p.k, dir: sg.dir, atr1: F.atr1[i], volRatio: m1[i].vol / F.vAvg[i], checks: sg.checks, adx5: F.adx5[i], rv5: F.rv5[i] })
      } catch { failed.push(p.sym) }
    })
    sigs.sort((a, b) => b.volRatio - a.volRatio)
    let cash = Number(state.balance)
    const equity = cash + open.reduce((s: number, t: any) => s + Number(t.entry_price) * Number(t.size) / Math.max(1, Number(t.lev) || 1), 0)
    let openN = open.length - closes.length
    const held = new Set(open.filter((t: any) => !closes.some((c) => c.id === t.id)).map((t: any) => String(t.sym)))
    for (const sg of sigs) {
      const side = sg.dir > 0 ? 'LONG' : 'SHORT', rec = (decision: string, reason: string, extra: any = {}) => decisions.push({ sym: sg.sym, side, decision, reason, volRatio: sg.volRatio, ...extra })
      if (gate) { rec('rejected', gate); continue }
      if (held.has(sg.sym)) { rec('rejected', 'coin_held'); continue }
      if (openN >= PRO.maxOpen) { rec('rejected', 'max_open_3'); continue }
      let q; try { q = await quote(sg.sym) } catch { rec('rejected', 'no_quote'); continue }
      const entry = sg.dir > 0 ? q.ask * (1 + proSlip(sg.sym)) : q.bid * (1 - proSlip(sg.sym)), s = openPos(sg.dir, entry, sg.atr1, P)
      const notional = proSize(equity, cash, entry, s.r)
      if (notional < 10) { rec('rejected', 'no_cash'); continue }
      entries.push({ sym: sg.sym, side, price: entry, notional, lev: PRO.lev, quote_ts: q.ts, source: q.source,
        pro: { stop: s.stop, target: s.target, r: s.r, best: entry, reached_1r: false, atr1: sg.atr1, stop_pct: s.r / entry, risk_pct: PRO.riskPct,
          symbol: sg.symbol, k: sg.k, params: P, bar: new Date(bar).toISOString(), vol_ratio: sg.volRatio, adx5: sg.adx5, rv5: sg.rv5, checks: sg.checks } })
      rec('accepted', 'taken', { notional })
      held.add(sg.sym); openN++; cash -= notional / PRO.lev + notional * PRO.fee
    }
  }
  const note = { due, bar: new Date(bar).toISOString(), universe: uni, prescanned, full: coins.length, scanned: prescanned, failed: failed.slice(0, 30), failed_n: failed.length, gate, signals: decisions.length, opened: entries.length, closed: closes.length,
    coins: coins.sort((a, b) => b.ok - a.ok), params: P, validated: false }
  const { data: result } = await db.rpc('pro_commit_cycle', { p_lease: lease, p_closes: closes, p_updates: updates, p_entries: entries, p_marks: marks,
    p_note: due ? note : { ...(params.pro_cycle ?? {}), closed: closes.length }, p_bar: due ? bar : null }).throwOnError()
  if (decisions.length) {
    try { await db.from('trade_decisions').insert(decisions.map((d, k) => ({ sym: d.sym, side: d.side, decision: d.decision, reason: d.reason, rank: k + 1, notional: d.notional ?? null, score: +d.volRatio.toFixed(3),
      observed: { vol_ratio: d.volRatio }, inferred: { sleeve: 'PRO', note: 'owner 1m scalping spec, rejected out-of-sample by v100bt, paper only' } }))) } catch { /* journal only */ }
  }
  return { changed: true, ...result, ...(due ? { universe: uni, prescanned, full: coins.length, failed: failed.length, gate, signals: decisions.length } : {}) }
}

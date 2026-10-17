// "מאמן המסחר הכמותי" — Binance USDⓈ-M style futures PAPER desk ($5,000 demo), rules in shared/coach.ts.
// Runs on GitHub Actions (.github/workflows/coach-desk.yml) because the Supabase project is blocked (exceed_egress_quota).
// Prices: OKX USDT perpetual swaps (public, no key). Binance fapi answers HTTP 451 from GitHub runners, so the live feed is
// OKX and every row says so. NEVER places a real order. One cycle per call: manage exits on the live last price every
// cycle, scan for entries once per closed 4h bar over every USDT perpetual Binance Futures trades today that has a crypto
// OKX swap (shared/binperps.ts, owner 2026-10-17; entries also need a liquid OKX book) (first cycle after the close), charge funding at each 8h settlement.
// Usage: node --experimental-strip-types scripts/coach-desk.ts coach/state.json
import fs from 'node:fs'
import { COACH, coachSignal, coachSize, coachRisk, type Bar, type Side } from '../shared/coach.ts'
import { refreshUniverse, universeDue, liqCheck, limiter, pool } from '../shared/binperps.ts'

const FILE = process.argv[2] ?? 'coach/state.json'
const OKX = 'https://www.okx.com/api/v5'
// The backtested 30 (backtest/research/coach_bt.ts) minus RUNE (no OKX swap); OKX names (PEPE = Binance 1000PEPE, priced per ONE coin here).
export const FIXED_COINS = 'BTC ETH SOL BNB XRP DOGE ADA AVAX LINK DOT LTC BCH TRX NEAR APT ARB OP SUI INJ FIL ATOM ETC UNI AAVE WIF PEPE TIA SEI LDO'.split(' ')
const H4 = 4 * 3600_000, D1 = 86400_000
const j = async (u: string) => { const r = await fetch(u, { headers: { 'User-Agent': 'spacehub-paper/1.0' } }); if (!r.ok) throw new Error(`${r.status} ${u.slice(0, 80)}`); const x: any = await r.json(); if (x.code !== '0') throw new Error(`okx ${x.code} ${x.msg}`); return x.data }
const iso = (ms = Date.now()) => new Date(ms).toISOString()
const sgn = (s: Side) => (s === 'LONG' ? 1 : -1)
async function candles(sym: string, bar: string, limit: number): Promise<Bar[]> {
  const d: string[][] = await j(`${OKX}/market/candles?instId=${sym}-USDT-SWAP&bar=${bar}&limit=${limit}`)
  return d.filter((r) => r[8] === '1').map((r) => ({ t: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[7] })).sort((a, b) => a.t - b.t)
}

const st: any = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {
  version: 'coach-v1', start_cash: COACH.start, cash: COACH.start, peak: COACH.start, next_id: 1, trades: [], equity: [], decisions: [],
  risk: { dayStart: COACH.start, weekStart: COACH.start, day: -1, week: -1, streak: 0, lastLossAt: null }, scan: null, last_bar: 0,
  feed: 'OKX USDT swaps (Binance fapi blocked from the runner, HTTP 451)', strategy: COACH,
}
const now = Date.now(), decisions: any[] = []
let marks: Record<string, { last: number; bid: number; ask: number; vol: number }> = {}
if (universeDue(st.universe, now)) { const r = await refreshUniverse(st.universe, now); st.universe = r.u; st.universe_error = r.error ?? null }
const COINS: string[] = st.universe?.coins?.map((c: any) => c.sym) ?? FIXED_COINS
const want = new Set([...COINS, ...st.trades.filter((t: any) => t.status === 'OPEN').map((t: any) => t.sym)])
try {
  const tk: any[] = await j(`${OKX}/market/tickers?instType=SWAP`)
  for (const t of tk) {
    const m = /^([A-Z0-9]+)-USDT-SWAP$/.exec(t.instId); if (!m || !want.has(m[1])) continue
    marks[m[1]] = { last: +t.last, bid: +t.bidPx, ask: +t.askPx, vol: +t.volCcy24h * +t.last }
  }
} catch (e) { st.last_error = { at: iso(), msg: String(e) } }

const openT = () => st.trades.filter((t: any) => t.status === 'OPEN')
const equity = () => st.cash + openT().reduce((a: number, t: any) => { const px = marks[t.sym]?.last ?? t.mark_px ?? t.entry_px; return a + t.margin + sgn(t.side) * (px - t.entry_px) * t.qty - (t.funding ?? 0) }, 0)

// 1. funding at each 8h settlement (00/08/16 UTC) while a position is open, at the published current rate
const settle = Math.floor(now / (8 * 3600_000)) * 8 * 3600_000
if (st.last_settle == null) st.last_settle = settle
if (settle > st.last_settle) {
  for (const t of openT()) {
    if (Date.parse(t.opened_at) >= settle) continue
    try { const f = (await j(`${OKX}/public/funding-rate?instId=${t.sym}-USDT-SWAP`))[0]; const r = +f.fundingRate; const px = marks[t.sym]?.last ?? t.entry_px
      t.funding = (t.funding ?? 0) + sgn(t.side) * r * t.qty * px; (t.funding_log ??= []).push({ at: iso(settle), rate: r }) } catch { /* next cycle */ }
  }
  st.last_settle = settle
}

// 2. exits on the live price: stop (never moved against us), 2R target, 30 x 4h time stop
for (const t of openT()) {
  const m = marks[t.sym]; if (!m) continue
  t.mark_px = m.last; t.mark_at = iso()
  const px = t.side === 'LONG' ? m.bid : m.ask
  const why = (t.side === 'LONG' ? px <= t.stop : px >= t.stop) ? 'STOP' : (t.side === 'LONG' ? px >= t.target : px <= t.target) ? 'TARGET'
    : now - Date.parse(t.opened_at) >= COACH.maxBars * H4 ? 'TIME' : null
  if (!why) continue
  const fill = px * (1 - sgn(t.side) * COACH.slip), fee = t.qty * fill * COACH.taker
  const gross = sgn(t.side) * (fill - t.entry_px) * t.qty, pnl = gross - t.entry_fee - fee - (t.funding ?? 0)
  st.cash += t.margin + gross - fee - (t.funding ?? 0)
  Object.assign(t, { status: 'CLOSED', exit_px: fill, exit_fee: fee, pnl, R: pnl / t.risk_usd, reason: why, closed_at: iso() })
  if (pnl < 0) { st.risk.streak++; st.risk.lastLossAt = now } else st.risk.streak = 0
  decisions.push({ at: iso(), sym: t.sym, decision: 'EXIT', why, pnl: +pnl.toFixed(2), R: +t.R.toFixed(2) })
}

// 3. account gates (day / week starts in UTC; week starts Monday)
const eq = equity(), day = Math.floor(now / D1), week = Math.floor((now / D1 + 3) / 7)
if (st.risk.day !== day) { st.risk.day = day; st.risk.dayStart = eq }
if (st.risk.week !== week) { st.risk.week = week; st.risk.weekStart = eq }
st.peak = Math.max(st.peak, eq)

// 4. entries: first cycle after each 4h close (within 20 min), on CLOSED bars only
const bar = Math.floor(now / H4) * H4
if (bar > st.last_bar && (now - bar < 20 * 60_000 || process.env.COACH_FORCE_SCAN) && Object.keys(marks).length) {
  st.last_bar = bar
  const rk = coachRisk({ equity: eq, peak: st.peak, dayStart: st.risk.dayStart, weekStart: st.risk.weekStart, streak: st.risk.streak, lastLossAt: st.risk.lastLossAt }, now)
  const lim = limiter(15)
  const btcD = await lim(() => candles('BTC', '1Dutc', 260)).catch(() => [] as Bar[])
  const rows: any[] = (await pool(COINS.filter((s) => marks[s]), 6, async (sym) => {
    try {
      const b4 = await lim(() => candles(sym, '4H', 80)), d1 = sym === 'BTC' ? btcD : await lim(() => candles(sym, '1Dutc', 260))
      if (b4.length < 40 || b4[b4.length - 1].t !== bar - H4) return { sym, err: 'אין נר 4h סגור עדכני' }
      const sigOf = (fr: number | null) => coachSignal({ bars: b4.slice(-61), daily: d1, btcDaily: sym === 'BTC' ? undefined : btcD, funding: fr, vol24Usd: null /* F4 = OKX book liquidity below */, nowMs: now })
      let fr: number | null = null, sig = sigOf(null)
      if (sig.side) { try { fr = +(await lim(() => j(`${OKX}/public/funding-rate?instId=${sym}-USDT-SWAP`)))[0].fundingRate } catch { /* unknown */ } sig = sigOf(fr) }
      const lc = liqCheck(marks[sym]), side = lc.ok ? sig.side : null
      return { sym, side, checks: [...sig.checks, lc], adx: +sig.adx.toFixed(1), atr_pct: +(100 * sig.atrPct).toFixed(2), entry: sig.entry, stop: sig.stop }
    } catch (e) { return { sym, err: String(e).slice(0, 80) } }
  }))
  for (const r of rows.filter((x) => x.side)) {
    const side: Side = r.side, m = marks[r.sym]
    const skip = (why: string) => decisions.push({ at: iso(), sym: r.sym, side, decision: 'SKIP', why })
    if (rk.mult === 0) { skip(rk.why!); continue }
    if (openT().length >= COACH.maxOpen) { skip('כבר 3 פוזיציות פתוחות'); continue }
    if (openT().filter((t: any) => t.side === side).length >= COACH.maxPerSide) { skip('כבר 2 פוזיציות באותו כיוון (מתואמות ל-BTC)'); continue }
    if (openT().some((t: any) => t.sym === r.sym)) { skip('כבר פתוחה פוזיציה במטבע'); continue }
    const fill = (side === 'LONG' ? m.ask : m.bid) * (1 + sgn(side) * COACH.slip)
    const dist = Math.abs(r.entry - r.stop), stop = fill - sgn(side) * dist, target = fill + sgn(side) * COACH.targetR * dist
    const e2 = equity(), z = coachSize(e2, st.cash, fill, stop, COACH.riskFrac * rk.mult)
    if (!z.ok) { skip('הגודל לא עומד בכללים (מינוף/חיסול)'); continue }
    const fee = z.notional * COACH.taker
    if (z.margin + fee > st.cash) { skip('אין מספיק מזומן'); continue }
    st.cash -= z.margin + fee
    st.trades.push({ id: st.next_id++, sym: r.sym, side, entry_px: fill, stop, target, qty: z.qty, notional: z.notional, margin: z.margin, lev: z.lev,
      liq_px: z.liq, risk_usd: z.riskUsd, entry_fee: fee, funding: 0, opened_at: iso(), status: 'OPEN', mark_px: m.last, mark_at: iso(),
      signal: { bar: iso(bar - H4), adx: r.adx, atr_pct: r.atr_pct, checks: r.checks }, risk_mult: rk.mult, risk_note: rk.why })
    decisions.push({ at: iso(), sym: r.sym, side, decision: 'ENTER', why: `כל הבדיקות עברו · סיכון ${(100 * COACH.riskFrac * rk.mult).toFixed(1)}% · ${z.lev}x`, notional: +z.notional.toFixed(0) })
  }
  st.scan = { at: iso(), bar: iso(bar - H4), rows, gate: rk }
}

// 5. publish
const eqNow = equity()
st.equity.push({ ts: iso(), equity: +eqNow.toFixed(2), cash: +st.cash.toFixed(2), open: openT().length })
if (st.equity.length > 3000) st.equity = st.equity.filter((_: any, i: number, a: any[]) => i % 2 === 0 || i > a.length - 500)
st.decisions = [...decisions, ...st.decisions].slice(0, 300)
const c = st.trades.filter((t: any) => t.status === 'CLOSED')
const w = c.filter((t: any) => t.pnl > 0)
st.stats = { closed: c.length, wins: w.length, pnl: +c.reduce((a: number, t: any) => a + t.pnl, 0).toFixed(2),
  expectancy_R: c.length ? +(c.reduce((a: number, t: any) => a + t.R, 0) / c.length).toFixed(3) : null,
  pf: c.length ? +(w.reduce((a: number, t: any) => a + t.pnl, 0) / Math.max(1e-9, -c.filter((t: any) => t.pnl <= 0).reduce((a: number, t: any) => a + t.pnl, 0))).toFixed(2) : null }
st.marks = Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, v.last]))
st.vol24 = Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, Math.round(v.vol)]))
st.last_cycle = iso()
fs.mkdirSync(FILE.split('/').slice(0, -1).join('/') || '.', { recursive: true })
fs.writeFileSync(FILE, JSON.stringify(st))

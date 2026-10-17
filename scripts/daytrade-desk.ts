// "מאמן הדיי טריידינג" — intraday crypto futures PAPER desk ($5,000 demo), rules in shared/daytrade.ts (S1-S6 on 15m).
// GitHub Actions loop (.github/workflows/daytrade-desk.yml), prices from OKX USDT swaps (Binance fapi is 451 from runners).
// Every cycle: stops / targets / break-even on the live bid-ask; once per closed 15m bar: setups + checklist + entries at the
// live touch. Universe (owner 2026-10-17): every USDT perpetual Binance Futures trades today that has a crypto OKX swap
// (shared/binperps.ts); entries also need a liquid OKX book. NEVER places a real order. Usage: node --experimental-strip-types scripts/daytrade-desk.ts daytrade/state.json
import fs from 'node:fs'
import { DT, dtPrep, dtSetups, dtCheck, dtSize, dtGate, type Bar, type Side } from '../shared/daytrade.ts'
import { refreshUniverse, universeDue, liqCheck, limiter, pool } from '../shared/binperps.ts'

const FILE = process.argv[2] ?? 'daytrade/state.json', OKX = 'https://www.okx.com/api/v5'
const M15 = 15 * 60_000, D1 = 86400_000
const j = async (u: string) => { const r = await fetch(u, { headers: { 'User-Agent': 'spacehub-paper/1.0' } }); if (!r.ok) throw new Error(`${r.status}`); const x: any = await r.json(); if (x.code !== '0') throw new Error(`okx ${x.code} ${x.msg}`); return x.data }
const iso = (ms = Date.now()) => new Date(ms).toISOString()
const sg = (s: Side) => (s === 'LONG' ? 1 : -1)
const candles = async (sym: string): Promise<Bar[]> => (await j(`${OKX}/market/candles?instId=${sym}-USDT-SWAP&bar=15m&limit=300`) as string[][])
  .filter((r) => r[8] === '1').map((r) => ({ t: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[7] })).sort((a, b) => a.t - b.t)

const st: any = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {
  version: 'daytrade-v1', start_cash: DT.start, cash: DT.start, peak: DT.start, next_id: 1, trades: [], equity: [], decisions: [],
  risk: { day: -1, dayStart: DT.start, dayEntries: 0, dayLosses: 0, streak: 0, lastLossAt: null }, scan: null, last_bar: 0, seen: [],
  feed: 'OKX USDT swaps (Binance fapi blocked from the runner, HTTP 451)', strategy: DT,
}
const now = Date.now(), decisions: any[] = [], marks: Record<string, { last: number; bid: number; ask: number; vol: number }> = {}
if (universeDue(st.universe, now)) { const r = await refreshUniverse(st.universe, now); st.universe = r.u; st.universe_error = r.error ?? null }
const COINS: string[] = st.universe?.coins?.map((c: any) => c.sym) ?? [...DT.coins]
const want = new Set([...COINS, ...st.trades.filter((t: any) => t.status === 'OPEN').map((t: any) => t.sym)])
try { for (const t of await j(`${OKX}/market/tickers?instType=SWAP`)) { const m = /^([A-Z0-9]+)-USDT-SWAP$/.exec(t.instId); if (m && want.has(m[1])) marks[m[1]] = { last: +t.last, bid: +t.bidPx, ask: +t.askPx, vol: +t.volCcy24h * +t.last } } }
catch (e) { st.last_error = { at: iso(), msg: String(e) } }
const openT = () => st.trades.filter((t: any) => t.status === 'OPEN')
const equity = () => st.cash + openT().reduce((a: number, t: any) => a + t.margin + sg(t.side) * ((marks[t.sym]?.last ?? t.mark_px) - t.entry_px) * t.qty - (t.funding ?? 0), 0)
const day = Math.floor(now / D1)
if (st.risk.day !== day) Object.assign(st.risk, { day, dayStart: equity(), dayEntries: 0, dayLosses: 0 })

// funding at each 8h settlement while open
const settle = Math.floor(now / (8 * 3600_000)) * 8 * 3600_000
if (st.last_settle == null) st.last_settle = settle
if (settle > st.last_settle) {
  for (const t of openT()) if (Date.parse(t.opened_at) < settle) try { const r = +(await j(`${OKX}/public/funding-rate?instId=${t.sym}-USDT-SWAP`))[0].fundingRate; t.funding = (t.funding ?? 0) + sg(t.side) * r * t.qty * (marks[t.sym]?.last ?? t.entry_px) } catch { /* next cycle */ }
  st.last_settle = settle
}
// exits on the live touch
for (const t of openT()) {
  const m = marks[t.sym]; if (!m) continue
  t.mark_px = m.last; t.mark_at = iso()
  const px = t.side === 'LONG' ? m.bid : m.ask, s = sg(t.side), bars = Math.floor((now - Date.parse(t.opened_at)) / M15)
  if (!t.hit1R && s * (px - t.entry_px) >= t.r0) { t.hit1R = true; t.stop = t.entry_px; decisions.push({ at: iso(), sym: t.sym, side: t.side, decision: 'MANAGE', why: 'הגיע ל-1R — סטופ לנקודת הכניסה' }) }
  const why = s * (px - t.stop) <= 0 ? (t.hit1R ? 'BE' : 'STOP') : s * (px - t.target) >= 0 ? 'TARGET'
    : !t.hit1R && bars >= DT.noMoveBars ? 'NO_MOVE' : bars >= DT.maxBars ? 'TIME' : null
  if (!why) continue
  const fill = px * (1 - s * DT.slip), fee = t.qty * fill * DT.taker, gross = s * (fill - t.entry_px) * t.qty, pnl = gross - t.entry_fee - fee - (t.funding ?? 0)
  st.cash += t.margin + gross - fee - (t.funding ?? 0)
  Object.assign(t, { status: 'CLOSED', exit_px: fill, exit_fee: fee, pnl, R: pnl / t.risk_usd, reason: why, closed_at: iso() })
  if (pnl < 0) { st.risk.streak++; st.risk.dayLosses++; st.risk.lastLossAt = now } else st.risk.streak = 0
  decisions.push({ at: iso(), sym: t.sym, side: t.side, decision: 'EXIT', why, pnl: +pnl.toFixed(2), R: +t.R.toFixed(2) })
}
st.peak = Math.max(st.peak, equity())

// setups once per closed 15m bar (first cycle within 5 min)
const bar = Math.floor(now / M15) * M15
if (bar > st.last_bar && (now - bar < 5 * 60_000 || process.env.DT_FORCE_SCAN) && Object.keys(marks).length) {
  st.last_bar = bar
  const preps: Record<string, any> = {}, rows: any[] = []
  const lim = limiter(15)
  await pool(COINS, 8, async (s) => { try { const b = await lim(() => candles(s)); if (b.length > 120 && b[b.length - 1].t === bar - M15) preps[s] = dtPrep(b); else rows.push({ sym: s, err: 'אין נר 15m סגור עדכני' }) } catch (e) { rows.push({ sym: s, err: String(e).slice(0, 60) }) } })
  const bp = preps.BTC, btcDir = bp ? (bp.b[bp.b.length - 1].c > bp.e50[bp.b.length - 1] ? 1 : -1) : null
  for (const s of Object.keys(preps).sort()) {
    if (!marks[s]) continue
    const p = preps[s], i = p.b.length - 1, m = marks[s]
    let fr: number | null = null
    const cs = dtSetups(p, i)
    if (cs.length) try { fr = +(await j(`${OKX}/public/funding-rate?instId=${s}-USDT-SWAP`))[0].fundingRate } catch { /* unknown */ }
    const lc = liqCheck(m)
    const evals = cs.map((c) => { const entry = (c.side === 'LONG' ? m.ask : m.bid) * (1 + sg(c.side) * DT.slip)
      const chk = dtCheck(p, i, c, entry, { btcDir: s === 'BTC' ? null : btcDir, funding: fr, allHours: true, vol24Usd: null /* F4 = OKX book liquidity below */ })
      chk.checks.push(lc); chk.ok = chk.ok && lc.ok; return { c, entry, chk } })
    rows.push({ sym: s, setups: evals.map((e) => ({ setup: e.c.setup, note: e.c.note, side: e.c.side, ok: e.chk.ok, checks: e.chk.checks, rNet: +e.chk.rNet.toFixed(2), costR: e.chk.costR && +e.chk.costR.toFixed(2) })),
      h1: p.h1Dir[i], adx: +p.adx[i].toFixed(1), vwap: p.vwap[i], close: p.b[i].c })
    for (const e of evals) {
      const key = `${s}|${e.c.setup}|${e.c.side}|${day}`
      const skip = (why: string) => decisions.push({ at: iso(), sym: s, side: e.c.side, setup: e.c.setup, decision: 'SKIP', why })
      if (!e.chk.ok) continue
      if (st.seen.includes(key)) { skip('הסטאפ כבר נוצל היום'); continue }
      const g = dtGate({ equity: equity(), dayStart: st.risk.dayStart, dayEntries: st.risk.dayEntries, dayLosses: st.risk.dayLosses, streak: st.risk.streak, lastLossAt: st.risk.lastLossAt }, now)
      if (g) { skip(g); continue }
      if (openT().length >= DT.maxOpen) { skip('כבר 2 פוזיציות פתוחות'); continue }
      if (openT().some((t: any) => t.sym === s)) { skip('כבר פתוחה פוזיציה במטבע'); continue }
      const z = dtSize(equity(), st.cash, e.entry, e.chk.stop, DT.riskFrac)
      if (!z.ok || z.margin + z.notional * DT.taker > st.cash) { skip('הגודל לא עומד בכללים'); continue }
      const fee = z.notional * DT.taker
      st.cash -= z.margin + fee; st.risk.dayEntries++; st.seen.push(key)
      st.trades.push({ id: st.next_id++, sym: s, side: e.c.side, setup: e.c.setup, setup_note: e.c.note, entry_px: e.entry, stop: e.chk.stop, stop0: e.chk.stop, target: e.chk.target,
        r0: Math.abs(e.entry - e.chk.stop), hit1R: false, qty: z.qty, notional: z.notional, margin: z.margin, lev: z.lev, liq_px: z.liq, risk_usd: z.riskUsd, entry_fee: fee, funding: 0,
        opened_at: iso(), status: 'OPEN', mark_px: m.last, mark_at: iso(), signal: { bar: iso(bar - M15), checks: e.chk.checks, rNet: e.chk.rNet, costR: e.chk.costR } })
      decisions.push({ at: iso(), sym: s, side: e.c.side, setup: e.c.setup, decision: 'ENTER', why: `${e.c.setup} ${e.c.note} · יעד ${e.chk.rNet.toFixed(2)}R נטו · ${z.lev}x`, notional: +z.notional.toFixed(0) })
    }
  }
  st.seen = st.seen.filter((k: string) => +k.split('|')[3] >= day - 1)
  st.scan = { at: iso(), bar: iso(bar - M15), rows, gate: dtGate({ equity: equity(), dayStart: st.risk.dayStart, dayEntries: st.risk.dayEntries, dayLosses: st.risk.dayLosses, streak: st.risk.streak, lastLossAt: st.risk.lastLossAt }, now) }
}
// publish
const eqNow = equity()
st.equity.push({ ts: iso(), equity: +eqNow.toFixed(2), cash: +st.cash.toFixed(2), open: openT().length })
if (st.equity.length > 3000) st.equity = st.equity.filter((_: any, i: number, a: any[]) => i % 2 === 0 || i > a.length - 500)
st.decisions = [...decisions, ...st.decisions].slice(0, 300)
const c = st.trades.filter((t: any) => t.status === 'CLOSED'), w = c.filter((t: any) => t.pnl > 0)
st.stats = { closed: c.length, wins: w.length, pnl: +c.reduce((a: number, t: any) => a + t.pnl, 0).toFixed(2), expectancy_R: c.length ? +(c.reduce((a: number, t: any) => a + t.R, 0) / c.length).toFixed(3) : null }
st.marks = Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, v.last]))
st.vol24 = Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, Math.round(v.vol)])); st.last_cycle = iso()
fs.mkdirSync(FILE.split('/').slice(0, -1).join('/') || '.', { recursive: true })
fs.writeFileSync(FILE, JSON.stringify(st))

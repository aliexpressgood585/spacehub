// Backtest of the "quant trading coach" rules (shared/coach.ts) on Binance USDⓈ-M futures archives:
// 30 large perps, 4h + 1d klines + real funding, 2023-06..2026-09 (trading starts once the daily EMA200 exists, ~2024-01).
// Signal on the 4h close, entry at the next 4h open (+3 bps slippage, 5 bps taker), stop first inside a bar, target 2R,
// 30-bar time stop, funding charged at every settlement held. Portfolio rules exactly as the live desk: 1% risk, <=3 open,
// <=2 per side, leverage <= 5x with liquidation >= 2x the stop, day -3% / week -6% stops, DD 15% half size, 2-loss pause.
// Usage: node --experimental-strip-types backtest/research/coach_bt.ts <csv dir> > status/coach-bt.txt
import fs from 'node:fs'
import { COACH, coachSignal, coachSize, coachRisk, coachExit, type Bar, type Side } from '../../shared/coach.ts'

const dir = process.argv[2]
const COINS = 'BTC ETH SOL BNB XRP DOGE ADA AVAX LINK DOT LTC BCH TRX NEAR APT ARB OP SUI INJ FIL ATOM ETC UNI AAVE WIF 1000PEPE TIA SEI LDO RUNE'.split(' ')
const files = fs.readdirSync(dir)
function bars(sym: string, iv: string): Bar[] {
  const out: Bar[] = []
  for (const f of files.filter((x) => x.startsWith(`${sym}USDT-${iv}-`)).sort())
    for (const line of fs.readFileSync(`${dir}/${f}`, 'utf8').split('\n')) {
      const p = line.split(','); if (p.length < 6 || !/^\d/.test(p[0])) continue
      out.push({ t: +p[0], o: +p[1], h: +p[2], l: +p[3], c: +p[4], v: +p[7] || 0 })
    }
  return out.sort((a, b) => a.t - b.t).filter((b, i, a) => !i || b.t !== a[i - 1].t)
}
function funding(sym: string): [number, number][] {
  const out: [number, number][] = []
  for (const f of files.filter((x) => x.startsWith(`${sym}USDT-fundingRate-`)).sort())
    for (const line of fs.readFileSync(`${dir}/${f}`, 'utf8').split('\n')) {
      const p = line.split(','); if (p.length < 3 || !/^\d/.test(p[0])) continue
      out.push([+p[0], +p[2]])
    }
  return out.sort((a, b) => a[0] - b[0])
}
const H4 = 4 * 3600_000, D1 = 86400_000
const data = COINS.map((s) => ({ s, b4: bars(s, '4h'), d1: bars(s, '1d'), fr: funding(s) })).filter((x) => x.b4.length > 500)
const btcD = data.find((x) => x.s === 'BTC')!.d1
const idx = new Map(data.map((x) => [x.s, new Map(x.b4.map((b, i) => [b.t, i]))]))
const times = [...new Set(data.flatMap((x) => x.b4.map((b) => b.t)))].sort((a, b) => a - b)

type Pos = { s: string; side: Side; entry: number; stop: number; target: number; qty: number; notional: number; margin: number; lev: number; risk: number; bars: number; at: number; fee: number; fund: number }
let cash: number = COACH.start, peak: number = COACH.start, dayStart: number = COACH.start, weekStart: number = COACH.start
let curDay = -1, curWeek = -1, streak = 0, lastLossAt: number | null = null
const open: Pos[] = [], closed: (Pos & { exit: number; pnl: number; R: number; why: string; closedAt: number })[] = []
const eqDaily = new Map<number, number>()
const sgn = (s: Side) => (s === 'LONG' ? 1 : -1)
const pending: { s: string; side: Side; stop0: number; entryRef: number }[] = []
function equityAt(t: number) {
  let e = cash
  for (const p of open) { const x = data.find((d) => d.s === p.s)!, i = idx.get(p.s)!.get(t); const px = i != null ? x.b4[i].c : p.entry; e += p.margin + sgn(p.side) * (px - p.entry) * p.qty - p.fund }
  return e
}
let rejects: Record<string, number> = {}
for (const t of times) {
  const day = Math.floor(t / D1), week = Math.floor((t / D1 + 3) / 7)
  const eqNow = equityAt(t)
  if (day !== curDay) { curDay = day; dayStart = eqNow }
  if (week !== curWeek) { curWeek = week; weekStart = eqNow }
  // 1. fill entries decided at the previous close, at this bar's open
  for (const q of pending.splice(0)) {
    const x = data.find((d) => d.s === q.s)!, i = idx.get(q.s)!.get(t); if (i == null) continue
    const o = x.b4[i].o, fill = o * (1 + sgn(q.side) * COACH.slip)
    const stopDist = Math.abs(q.entryRef - q.stop0), stop = q.side === 'LONG' ? fill - stopDist : fill + stopDist
    const eq = equityAt(t), rk = coachRisk({ equity: eq, peak, dayStart, weekStart, streak, lastLossAt }, t)
    if (rk.mult === 0) { rejects[rk.why!] = (rejects[rk.why!] ?? 0) + 1; continue }
    if (open.length >= COACH.maxOpen || open.filter((p) => p.side === q.side).length >= COACH.maxPerSide || open.some((p) => p.s === q.s)) { rejects.caps = (rejects.caps ?? 0) + 1; continue }
    const z = coachSize(eq, cash, fill, stop, COACH.riskFrac * rk.mult)
    if (!z.ok || z.margin + z.notional * COACH.taker > cash) { rejects.size = (rejects.size ?? 0) + 1; continue }
    const fee = z.notional * COACH.taker
    cash -= z.margin + fee
    open.push({ s: q.s, side: q.side, entry: fill, stop, target: fill + sgn(q.side) * COACH.targetR * stopDist, qty: z.qty, notional: z.notional, margin: z.margin, lev: z.lev, risk: z.riskUsd, bars: 0, at: t, fee, fund: 0 })
  }
  // 2. manage open positions on this bar (+ funding settled inside it)
  for (const p of [...open]) {
    const x = data.find((d) => d.s === p.s)!, i = idx.get(p.s)!.get(t); if (i == null) continue
    const b = x.b4[i]
    for (const [ft, r] of x.fr) if (ft > t && ft <= t + H4 && ft > p.at) p.fund += sgn(p.side) * r * p.qty * b.o
    p.bars++
    const ex = coachExit(p, b); if (!ex) continue
    const fill = ex.px * (1 - sgn(p.side) * COACH.slip), fee = p.qty * fill * COACH.taker
    const pnl = sgn(p.side) * (fill - p.entry) * p.qty - p.fee - fee - p.fund
    cash += p.margin + sgn(p.side) * (fill - p.entry) * p.qty - fee - p.fund
    open.splice(open.indexOf(p), 1)
    closed.push({ ...p, exit: fill, pnl, R: pnl / p.risk, why: ex.why, closedAt: t + H4 })
    if (pnl < 0) { streak++; lastLossAt = t + H4 } else streak = 0
  }
  const eqClose = equityAt(t); peak = Math.max(peak, eqClose); eqDaily.set(day, eqClose)
  // 3. signals on this bar's close
  const now = t + H4
  for (const x of data) {
    const i = idx.get(x.s)!.get(t); if (i == null || i < 60) continue
    const daily = x.d1.filter((d) => d.t + D1 <= now).slice(-260); if (daily.length < COACH.ema + 1) continue
    const fr = x.fr.filter((f) => f[0] <= now).slice(-1)[0]?.[1] ?? null
    const sig = coachSignal({ bars: x.b4.slice(i - 60, i + 1), daily, btcDaily: x.s === 'BTC' ? undefined : btcD.filter((d) => d.t + D1 <= now).slice(-260), funding: fr, nowMs: now })
    if (sig.side) pending.push({ s: x.s, side: sig.side, stop0: sig.stop, entryRef: sig.entry })
  }
}
// report
const t0 = closed.length ? Math.min(...closed.map((c) => c.at)) : 0, t1 = Math.max(...times)
const split = t0 + 0.7 * (t1 - t0)
function stats(c: typeof closed, label: string) {
  const n = c.length; if (!n) return `${label.padEnd(16)} n 0`
  const w = c.filter((x) => x.pnl > 0), l = c.filter((x) => x.pnl <= 0)
  const gp = w.reduce((a, x) => a + x.pnl, 0), gl = -l.reduce((a, x) => a + x.pnl, 0)
  const mR = c.reduce((a, x) => a + x.R, 0) / n, sd = Math.sqrt(c.reduce((a, x) => a + (x.R - mR) ** 2, 0) / Math.max(1, n - 1))
  let ls = 0, mls = 0; for (const x of c) { ls = x.pnl <= 0 ? ls + 1 : 0; mls = Math.max(mls, ls) }
  return `${label.padEnd(16)} n ${String(n).padStart(4)}  WR ${(100 * w.length / n).toFixed(1)}%  expectancy ${mR >= 0 ? '+' : ''}${mR.toFixed(3)}R  t ${(mR / sd * Math.sqrt(n)).toFixed(2)}  PF ${(gp / Math.max(gl, 1e-9)).toFixed(2)}  P&L $${(gp - gl).toFixed(0)}  max loss streak ${mls}`
}
const eqs = [...eqDaily.entries()].sort((a, b) => a[0] - b[0]).map((x) => x[1])
let pk = eqs[0] ?? COACH.start, mdd = 0; const rets: number[] = []
for (let i = 0; i < eqs.length; i++) { pk = Math.max(pk, eqs[i]); mdd = Math.max(mdd, 1 - eqs[i] / pk); if (i) rets.push(eqs[i] / eqs[i - 1] - 1) }
const mr = rets.reduce((a, x) => a + x, 0) / rets.length, sr = Math.sqrt(rets.reduce((a, x) => a + (x - mr) ** 2, 0) / rets.length)
console.log(`COACH backtest — ${data.length} Binance USDT-M perps, 4h, ${new Date(t0).toISOString().slice(0, 10)} .. ${new Date(t1).toISOString().slice(0, 10)}`)
console.log(`rules: shared/coach.ts (1% risk, <=5x, liq >= 2x stop, 1.5 ATR stop, 2R target, 30-bar time stop, F1/F2/F3/F5/F7, day/week/DD/streak gates)`)
console.log(`costs: taker ${(COACH.taker * 1e4).toFixed(0)} bps + slip ${(COACH.slip * 1e4).toFixed(0)} bps per side, real funding. Start $${COACH.start}.`)
console.log('')
console.log(stats(closed, 'ALL'))
console.log(stats(closed.filter((c) => c.at < split), 'IN-SAMPLE 70%'))
console.log(stats(closed.filter((c) => c.at >= split), 'OUT-OF-SAMPLE 30%'))
console.log(stats(closed.filter((c) => c.side === 'LONG'), 'LONG'))
console.log(stats(closed.filter((c) => c.side === 'SHORT'), 'SHORT'))
for (const y of [2024, 2025, 2026]) console.log(stats(closed.filter((c) => new Date(c.at).getUTCFullYear() === y), String(y)))
console.log('')
console.log(`equity $${COACH.start} -> $${(eqs[eqs.length - 1] ?? COACH.start).toFixed(0)}  max DD ${(100 * mdd).toFixed(1)}%  Sharpe(daily, ann.) ${(mr / sr * Math.sqrt(365)).toFixed(2)}`)
console.log(`exits: ${['TARGET', 'STOP', 'TIME'].map((w) => `${w} ${closed.filter((c) => c.why === w).length}`).join(' | ')}`)
console.log(`avg leverage ${(closed.reduce((a, c) => a + c.lev, 0) / Math.max(1, closed.length)).toFixed(2)}x, avg notional/equity at entry ~${(closed.reduce((a, c) => a + c.notional, 0) / Math.max(1, closed.length) / COACH.start).toFixed(2)}`)
console.log(`skipped entries: ${JSON.stringify(rejects)}`)

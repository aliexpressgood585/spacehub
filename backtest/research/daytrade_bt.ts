// Backtest of the day-trading coach rules (shared/daytrade.ts): S1-S6 on Binance USDT-M 15m bars, 7 liquid perps,
// 2024-09..2026-09, real funding. Signal on the 15m close, entry at the next 15m open (+3 bps, taker 5 bps), stop first in
// a bar, BE at +1R, no-move exit after 8 bars, 32-bar cap, 0.5% risk, <= 2 open, <= 4 entries / 3 losses / -2% per UTC day,
// 2-loss 2h pause, stop widened to >= 0.8% with the size shrinking, target >= 1.5R after costs.
// Usage: node --experimental-strip-types backtest/research/daytrade_bt.ts <csv dir> > status/daytrade-bt.txt
import fs from 'node:fs'
import { DT, dtPrep, dtSetups, dtCheck, dtSize, dtGate, dtManage, type Bar, type Side } from '../../shared/daytrade.ts'

const dir = process.argv[2], files = fs.readdirSync(dir)
const load = (s: string): Bar[] => {
  const out: Bar[] = []
  for (const f of files.filter((x) => x.startsWith(`${s}USDT-15m-`)).sort()) for (const l of fs.readFileSync(`${dir}/${f}`, 'utf8').split('\n')) {
    const p = l.split(','); if (p.length > 6 && /^\d/.test(p[0])) out.push({ t: +p[0], o: +p[1], h: +p[2], l: +p[3], c: +p[4], v: +p[7] })
  }
  return out.sort((a, b) => a.t - b.t).filter((x, i, a) => !i || x.t !== a[i - 1].t)
}
const fund = (s: string): [number, number][] => files.filter((x) => x.startsWith(`${s}USDT-fundingRate-`)).sort()
  .flatMap((f) => fs.readFileSync(`${dir}/${f}`, 'utf8').split('\n').map((l) => l.split(',')).filter((p) => p.length > 2 && /^\d/.test(p[0])).map((p) => [+p[0], +p[2]] as [number, number]))
const M15 = 15 * 60_000, D1 = 86400_000
const C = DT.coins.map((s) => { const b = load(s); return { s, p: dtPrep(b), ix: new Map(b.map((x, i) => [x.t, i])), fr: fund(s) } })
const btc = C.find((c) => c.s === 'BTC')!
const times = [...new Set(C.flatMap((c) => c.p.b.map((x) => x.t)))].sort((a, b) => a - b)
type Pos = { s: string; setup: string; side: Side; entry: number; stop: number; target: number; r0: number; qty: number; margin: number; risk: number; fee: number; fund: number; bars: number; hit1R: boolean; at: number }
let cash: number = DT.start, dayStart: number = DT.start, day = -1, dayEntries = 0, dayLosses = 0, streak = 0, lastLossAt: number | null = null
const open: Pos[] = [], done: (Pos & { pnl: number; R: number; why: string })[] = [], pend: { s: string; i: number; c: any }[] = []
const seen = new Set<string>(), cand: Record<string, number> = {}, rej: Record<string, number> = {}, eqD = new Map<number, number>()
const sg = (s: Side) => (s === 'LONG' ? 1 : -1)
const eqAt = (t: number) => cash + open.reduce((a, p) => { const c = C.find((x) => x.s === p.s)!, i = c.ix.get(t); const px = i != null ? c.p.b[i].c : p.entry; return a + p.margin + sg(p.side) * (px - p.entry) * p.qty - p.fund }, 0)
for (const t of times) {
  const d = Math.floor(t / D1)
  if (d !== day) { day = d; dayStart = eqAt(t); dayEntries = 0; dayLosses = 0 }
  // fills at this bar's open
  for (const q of pend.splice(0)) {
    const c = C.find((x) => x.s === q.s)!, i = c.ix.get(t); if (i == null) continue
    const entry = c.p.b[i].o * (1 + sg(q.c.side) * DT.slip)
    const btcI = btc.ix.get(c.p.b[q.i].t), btcDir = q.s === 'BTC' || btcI == null ? null : (btc.p.b[btcI].c > btc.p.e50[btcI] ? 1 : -1)
    const fr = c.fr.filter((f) => f[0] <= t).slice(-1)[0]?.[1] ?? null
    const chk = dtCheck(c.p, q.i, q.c, entry, { btcDir, funding: fr, vol24Usd: null })
    if (!chk.ok) { const k = chk.checks.find((x) => !x.ok)!.k.split(' ')[0]; rej[k] = (rej[k] ?? 0) + 1; continue }
    const g = dtGate({ equity: eqAt(t), dayStart, dayEntries, dayLosses, streak, lastLossAt }, t)
    if (g) { rej[g] = (rej[g] ?? 0) + 1; continue }
    if (open.length >= DT.maxOpen || open.some((p) => p.s === q.s)) { rej.caps = (rej.caps ?? 0) + 1; continue }
    const z = dtSize(eqAt(t), cash, entry, chk.stop, DT.riskFrac)
    if (!z.ok || z.margin + z.notional * DT.taker > cash) { rej.size = (rej.size ?? 0) + 1; continue }
    const fee = z.notional * DT.taker; cash -= z.margin + fee; dayEntries++
    open.push({ s: q.s, setup: q.c.setup, side: q.c.side, entry, stop: chk.stop, target: chk.target, r0: Math.abs(entry - chk.stop), qty: z.qty, margin: z.margin, risk: z.riskUsd, fee, fund: 0, bars: 0, hit1R: false, at: t })
  }
  // manage
  for (const p of [...open]) {
    const c = C.find((x) => x.s === p.s)!, i = c.ix.get(t); if (i == null) continue
    const x = c.p.b[i]
    for (const [ft, r] of c.fr) if (ft > t && ft <= t + M15) p.fund += sg(p.side) * r * p.qty * x.o
    const ex = dtManage(p, x); if (!ex) continue
    const fill = ex.px * (1 - sg(p.side) * DT.slip), fee = p.qty * fill * DT.taker
    const gross = sg(p.side) * (fill - p.entry) * p.qty, pnl = gross - p.fee - fee - p.fund
    cash += p.margin + gross - fee - p.fund; open.splice(open.indexOf(p), 1)
    done.push({ ...p, pnl, R: pnl / p.risk, why: ex.why })
    if (pnl < 0) { streak++; dayLosses++; lastLossAt = t + M15 } else streak = 0
  }
  eqD.set(d, eqAt(t))
  // setups on this bar's close (one per coin x setup x day)
  for (const c of C) {
    const i = c.ix.get(t); if (i == null) continue
    for (const k of dtSetups(c.p, i)) {
      const key = `${c.s}|${k.setup}|${k.side}|${d}`; if (seen.has(key)) continue; seen.add(key)
      cand[k.setup] = (cand[k.setup] ?? 0) + 1; pend.push({ s: c.s, i, c: k })
    }
  }
}
const t0 = times[0], t1 = times[times.length - 1], split = t0 + 0.7 * (t1 - t0)
function st(c: typeof done, label: string) {
  const n = c.length; if (!n) return `${label.padEnd(18)} n    0`
  const w = c.filter((x) => x.pnl > 0), gp = w.reduce((a, x) => a + x.pnl, 0), gl = -c.filter((x) => x.pnl <= 0).reduce((a, x) => a + x.pnl, 0)
  const m = c.reduce((a, x) => a + x.R, 0) / n, sd = Math.sqrt(c.reduce((a, x) => a + (x.R - m) ** 2, 0) / Math.max(1, n - 1))
  let ls = 0, mls = 0; for (const x of c) { ls = x.pnl <= 0 ? ls + 1 : 0; mls = Math.max(mls, ls) }
  return `${label.padEnd(18)} n ${String(n).padStart(4)}  WR ${(100 * w.length / n).toFixed(1).padStart(4)}%  ${m >= 0 ? '+' : ''}${m.toFixed(3)}R  t ${(m / sd * Math.sqrt(n)).toFixed(2).padStart(5)}  PF ${(gp / Math.max(gl, 1e-9)).toFixed(2)}  P&L $${(gp - gl).toFixed(0).padStart(5)}  streak ${mls}`
}
const eqs = [...eqD.entries()].sort((a, b) => a[0] - b[0]).map((x) => x[1]); let pk = DT.start, mdd = 0; const rr: number[] = []
eqs.forEach((e, i) => { pk = Math.max(pk, e); mdd = Math.max(mdd, 1 - e / pk); if (i) rr.push(e / eqs[i - 1] - 1) })
const mr = rr.reduce((a, x) => a + x, 0) / rr.length, sr = Math.sqrt(rr.reduce((a, x) => a + (x - mr) ** 2, 0) / rr.length)
console.log(`DAY-TRADING COACH backtest — ${C.length} Binance USDT-M perps (${DT.coins.join(' ')}), 15m, ${new Date(t0).toISOString().slice(0, 10)} .. ${new Date(t1).toISOString().slice(0, 10)}`)
console.log(`rules: shared/daytrade.ts — S1-S6, 1h EMA50 direction, BTC 15m filter, hours, ATR, funding, stop >= 0.8%, target >= 1.5R net,`)
console.log(`       BE at +1R, no-move exit 8 bars, cap 32 bars, 0.5% risk, <= 2 open, day: 4 entries / 3 losses / -2%. Costs: 5 + 3 bps per side + funding.`)
console.log(`setup candidates (before the checklist): ${JSON.stringify(cand)}`)
console.log(`rejected at the checklist / gates (first failing item): ${JSON.stringify(rej)}`)
console.log('')
console.log(st(done, 'ALL'))
console.log(st(done.filter((x) => x.at < split), 'IN-SAMPLE 70%'))
console.log(st(done.filter((x) => x.at >= split), 'OUT-OF-SAMPLE 30%'))
for (const s of ['S1', 'S2', 'S3', 'S4', 'S5', 'S6']) console.log(st(done.filter((x) => x.setup === s), s))
console.log(st(done.filter((x) => x.side === 'LONG'), 'LONG'))
console.log(st(done.filter((x) => x.side === 'SHORT'), 'SHORT'))
console.log('')
console.log(`equity $${DT.start} -> $${eqs[eqs.length - 1].toFixed(0)}  max DD ${(100 * mdd).toFixed(1)}%  Sharpe(daily, ann.) ${(mr / sr * Math.sqrt(365)).toFixed(2)}`)
console.log(`exits: ${['TARGET', 'STOP', 'BE', 'NO_MOVE', 'TIME'].map((w) => `${w} ${done.filter((x) => x.why === w).length}`).join(' | ')}`)

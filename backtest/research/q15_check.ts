// P-Q15 offline sanity read (quant/PREREGISTRATION_Q15.md): the FROZEN Q15 rule on the repo's 36-month Binance USDT-M
// 15m archive (40 coins). Measurement only — nothing in the rule may change because of it.
// Entry at the next 15m open; bracket on 15m bars (stop before target in the same bar; gap through the stop fills at the
// open); timeout 8 bars at the close. Cost 16 bps round trip (taker 5 + slip 3 per side) + funding 0.01%/8h for 2h.
// Clustered stats: one market burst fires many coins, so t is on per-bar means and on daily sums. IS 70% / OOS 30%.
// Run: node --experimental-strip-types backtest/research/q15_check.ts > status/q15-check.txt
import { readFileSync, readdirSync } from 'node:fs'
import { q15Signal, q15BtcUp, q15Levels, Q15 } from '../../shared/q15.ts'
import type { LBar } from '../../shared/lab.ts'

const dir = 'backtest/data', COST = 16, FUND = 0.0001 * 2 / 8 * 1e4
const load = (f: string): LBar[] => readFileSync(`${dir}/${f}`, 'utf8').trim().split('\n').map(l => l.split(',')).filter(x => +x[0] > 0)
  .map(x => ({ t: +x[0], open: +x[1], high: +x[2], low: +x[3], close: +x[4], vol: +x[5], tb: +x[9] }))
const files = readdirSync(dir).filter(f => f.endsWith('-15m.csv'))
const data = new Map(files.map(f => [f.replace('-15m.csv', '').replace('1000PEPE', 'PEPE'), load(f)]))
const btc = data.get('BTC')!, btcIdx = new Map(btc.map((b, i) => [b.t, i]))
const W = 80
type Tr = { t: number; sym: string; dir: number; gross: number; net: number; why: string }
const trades: Tr[] = [], sigBars = new Map<number, number>()
for (const [sym, b] of data) {
  let busyUntil = 0
  for (let i = W; i < b.length - Q15.holdBars - 1; i++) {
    if (b[i].t < busyUntil) continue
    const bi = btcIdx.get(b[i].t)
    const btcUp = sym === 'BTC' ? null : bi === undefined || bi < 30 ? null : q15BtcUp(btc.slice(bi - 29, bi + 1))
    const sig = q15Signal(b.slice(i - W + 1, i + 1), btcUp, sym === 'BTC')
    if (!sig) continue
    sigBars.set(b[i].t, (sigBars.get(b[i].t) ?? 0) + 1)
    const e = b[i + 1].open, lv = q15Levels(sig.dir, e, sig.atr)
    let px = NaN, why = 'TIMEOUT', j = i + 1
    for (; j <= i + Q15.holdBars && j < b.length; j++) {
      const x = b[j], adv = sig.dir > 0 ? x.low : x.high, fav = sig.dir > 0 ? x.high : x.low
      if (sig.dir * (adv - lv.stop) <= 0) { px = sig.dir * (x.open - lv.stop) <= 0 ? x.open : lv.stop; why = 'STOP'; break }
      if (sig.dir * (fav - lv.target) >= 0) { px = lv.target; why = 'TARGET'; break }
    }
    if (!Number.isFinite(px)) { j = Math.min(i + Q15.holdBars, b.length - 1); px = b[j].close }
    const gross = sig.dir * (px / e - 1) * 1e4
    trades.push({ t: b[i].t, sym, dir: sig.dir, gross, net: gross - COST - FUND, why })
    busyUntil = b[j].t + Q15.barMs   // one position per coin
  }
}
trades.sort((a, b) => a.t - b.t)
const t0 = Math.min(...[...data.values()].map(b => b[0].t)), t1 = Math.max(...[...data.values()].map(b => b[b.length - 1].t)), cut = t0 + (t1 - t0) * 0.7
const stat = (xs: number[]) => { const n = xs.length, m = n ? xs.reduce((a, b) => a + b, 0) / n : NaN, sd = n > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)) : NaN; return { n, m, t: sd > 0 ? m / sd * Math.sqrt(n) : NaN } }
const grp = (tr: Tr[], key: (x: Tr) => number, f: (x: Tr) => number) => { const g = new Map<number, number[]>(); for (const x of tr) { const k = key(x); if (!g.has(k)) g.set(k, []); g.get(k)!.push(f(x)) } return [...g.values()] }
const f = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '-')
const row = (name: string, tr: Tr[]) => {
  const g = stat(tr.map(x => x.gross)), n = stat(tr.map(x => x.net))
  const bar = stat(grp(tr, x => x.t, x => x.net).map(v => v.reduce((a, b) => a + b, 0) / v.length))
  const day = stat(grp(tr, x => Math.floor(x.t / 864e5), x => x.net).map(v => v.reduce((a, b) => a + b, 0)))
  const wr = tr.filter(x => x.net > 0).length / Math.max(1, tr.length)
  return `${name.padEnd(14)} n ${String(n.n).padStart(6)}  gross ${f(g.m).padStart(7)} bps  net ${f(n.m).padStart(7)} bps  WR ${f(wr * 100, 1)}%  t(bar) ${f(bar.t).padStart(6)}  t(day) ${f(day.t).padStart(6)}`
}
const days = (t1 - t0) / 864e5, bars = (t1 - t0) / Q15.barMs
console.log('Q15 offline sanity read — FROZEN rule (quant/PREREGISTRATION_Q15.md), measurement only')
console.log(`data: ${data.size} coins, Binance USDT-M 15m, ${new Date(t0).toISOString().slice(0, 10)} .. ${new Date(t1).toISOString().slice(0, 10)} (${days.toFixed(0)} days); IS < ${new Date(cut).toISOString().slice(0, 10)} <= OOS`)
console.log(`costs: ${COST} bps round trip + funding ${FUND.toFixed(2)} bps; bracket on 15m bars, stop first; entry next 15m open`)
console.log('')
console.log(row('ALL', trades)); console.log(row('IS 70%', trades.filter(x => x.t < cut))); console.log(row('OOS 30%', trades.filter(x => x.t >= cut)))
console.log(row('LONG', trades.filter(x => x.dir > 0))); console.log(row('SHORT', trades.filter(x => x.dir < 0)))
for (const w of ['STOP', 'TARGET', 'TIMEOUT']) console.log(row(w, trades.filter(x => x.why === w)))
console.log('')
const fired = sigBars.size
console.log(`15m bars in span ${bars.toFixed(0)}; bars with >= 1 signal ${fired} (${f(fired / bars * 100, 1)}%) -> quiet bars ${f((1 - fired / bars) * 100, 1)}%`)
console.log(`signals per active bar: mean ${f(trades.length / Math.max(1, fired))}, max ${Math.max(0, ...sigBars.values())}; trades/day ${f(trades.length / days)}`)
console.log('NB 40 coins vs a live universe of ~100; the live profit gate reads its own forward measurement, not this file.')

// v113b — robustness of the one positive v113bt row (|f|>=0.10%, enter T-60m, exit T+15m, receive funding).
// Diagnostics only (extra looks, reported as such): (1) no look-ahead: signal = the PREVIOUS settlement's
// rate (known at entry), sign and size; (2) neighbouring entry/exit windows (plateau vs spike).
import { readFileSync, readdirSync, appendFileSync } from 'node:fs'
const COST = 0.0016, Q = 900e3
const load = f => readFileSync(f, 'utf8').trim().split('\n').map(r => r.split(',').map(Number))
const tstat = v => { if (v.length < 3) return 0; const m = v.reduce((a, b) => a + b, 0) / v.length
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)); return sd > 0 ? m / (sd / Math.sqrt(v.length)) : 0 }
const COINS = readdirSync('backtest/data').filter(f => f.endsWith('-15m.csv')).map(f => f.replace('-15m.csv', ''))
const kl = {}, fr = {}
for (const c of COINS) { kl[c] = new Map(load(`backtest/data/${c}-15m.csv`).map(r => [r[0], r])); fr[c] = load(`backtest/data/${c}-funding.csv`).map(r => [r[0], r[2]]) }
const t0 = load('backtest/data/BTC-15m.csv')[0][0], cut = t0 + 0.7 * (Date.UTC(2026, 7, 31) - t0)
const lines = ['', 'v113b robustness of |f|>=0.10% (diagnostic looks, not a new search):']
function test(name, e, x, prevSignal) {
  const xs = []
  for (const c of COINS) { const F = fr[c]
    for (let i = 1; i < F.length; i++) { const [T, rate] = F[i], sig = prevSignal ? F[i - 1][1] : rate
      if (T < t0 || Math.abs(sig) < 0.001) continue
      const Ts = Math.round(T / Q) * Q, a = kl[c].get(Ts - e * 60e3), b = kl[c].get(Ts + x * 60e3 - Q); if (!a || !b) continue
      const side = sig > 0 ? -1 : 1, g = side * (b[4] / a[1] - 1) + side * -rate   // funding actually received/paid at T
      xs.push({ t: T, r: g - COST }) } }
  const S = xs2 => { const d = new Map(); for (const z of xs2) { const k = Math.floor(z.t / 864e5); d.set(k, (d.get(k) ?? 0) + z.r) }
    return `n ${String(xs2.length).padStart(4)} net ${(1e4 * xs2.reduce((a, z) => a + z.r, 0) / Math.max(1, xs2.length)).toFixed(1).padStart(6)} bps t ${tstat([...d.values()]).toFixed(2).padStart(5)}` }
  lines.push(`${name.padEnd(40)} IS ${S(xs.filter(z => z.t < cut))} | OOS ${S(xs.filter(z => z.t >= cut))}`)
}
test('realised rate, -60/+15 (v113 row)', 60, 15, false)
test('PREVIOUS rate (no look-ahead), -60/+15', 60, 15, true)
for (const [e, x] of [[30, 15], [45, 15], [90, 15], [120, 15], [60, 0], [60, 30]]) test(`realised rate, -${e}/+${x}`, e, x, false)
for (const [e, x] of [[30, 15], [90, 15], [60, 0]]) test(`PREVIOUS rate, -${e}/+${x}`, e, x, true)
console.log(lines.join('\n')); appendFileSync('status/funding-cme-v113.txt', lines.join('\n') + '\n')

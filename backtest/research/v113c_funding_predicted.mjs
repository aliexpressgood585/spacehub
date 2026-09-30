// v113c — the HONEST version of v113bt's funding row: the signal is the funding rate PREDICTABLE at entry
// (T-60m), reconstructed from Binance premiumIndex 1h klines (archive): mean premium of the interval's hours
// before T-1h, + clamp(0.01% - P, -0.05%, +0.05%) (Binance's formula, interest 0.01%/interval). APPROXIMATE
// (hourly bar mid instead of the per-minute premium). Same rule: |pred| >= 0.10%, receiving side, enter T-60m,
// exit T+15m, receive the REALISED rate at T, cost 16 bps. Premium files: /tmp/claude-0/prem (fetched by hand
// from data.binance.vision premiumIndexKlines monthly 1h).
import { readFileSync, readdirSync, appendFileSync } from 'node:fs'
const COST = 0.0016, Q = 900e3, H = 3600e3, P = process.argv[2] || '/tmp/claude-0/prem'
const load = f => readFileSync(f, 'utf8').trim().split('\n').map(r => r.split(',').map(Number))
const tstat = v => { if (v.length < 3) return 0; const m = v.reduce((a, b) => a + b, 0) / v.length
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)); return sd > 0 ? m / (sd / Math.sqrt(v.length)) : 0 }
const COINS = readdirSync('backtest/data').filter(f => f.endsWith('-15m.csv')).map(f => f.replace('-15m.csv', ''))
const t0 = load('backtest/data/BTC-15m.csv')[0][0], cut = t0 + 0.7 * (Date.UTC(2026, 7, 31) - t0)
const lines = ['', 'v113c — signal = funding PREDICTED at T-60m from premium-index klines (no look-ahead):']
let pairs = []
for (const [e, x, thr] of [[60, 15, 0.001], [60, 0, 0.001], [90, 15, 0.001], [120, 15, 0.001], [60, 15, 0.0005]]) {
  const xs = []
  for (const c of COINS) {
    const kl = new Map(load(`backtest/data/${c}-15m.csv`).map(r => [r[0], r]))
    const pm = new Map(load(`${P}/${c}-premium.csv`).map(r => [r[0], (r[1] + r[4]) / 2]))
    for (const [T, L, real] of load(`backtest/data/${c}-funding.csv`)) {
      if (T < t0) continue
      const Ts = Math.round(T / H) * H, hrs = []
      for (let h = L; h >= 1 + Math.ceil(e / 60) - 1 && h >= 1; h--) { const t = Ts - h * H; if (t >= Ts - e * 60e3) break; const v = pm.get(t); if (v !== undefined) hrs.push(v) }
      if (hrs.length < Math.max(2, L - 3)) continue
      const p = hrs.reduce((a, b) => a + b, 0) / hrs.length, pred = p + Math.max(-0.0005, Math.min(0.0005, 0.0001 - p))
      if (e === 60 && x === 15 && thr === 0.001) pairs.push([pred, real])
      if (Math.abs(pred) < thr) continue
      const a = kl.get(Math.round(T / Q) * Q - e * 60e3), b = kl.get(Math.round(T / Q) * Q + x * 60e3 - Q); if (!a || !b) continue
      const side = pred > 0 ? -1 : 1, g = side * (b[4] / a[1] - 1) - side * real
      xs.push({ t: T, r: g - COST })
    }
  }
  const S = z => { const d = new Map(); for (const q of z) { const k = Math.floor(q.t / 864e5); d.set(k, (d.get(k) ?? 0) + q.r) }
    return `n ${String(z.length).padStart(4)} net ${(1e4 * z.reduce((a, q) => a + q.r, 0) / Math.max(1, z.length)).toFixed(1).padStart(6)} bps t ${tstat([...d.values()]).toFixed(2).padStart(5)}` }
  lines.push(`|pred|>=${(thr * 100).toFixed(2)}% enter -${e}m exit +${x}m`.padEnd(40) + ` IS ${S(xs.filter(q => q.t < cut))} | OOS ${S(xs.filter(q => q.t >= cut))}`)
}
const n = pairs.length, mx = pairs.reduce((a, q) => a + q[0], 0) / n, my = pairs.reduce((a, q) => a + q[1], 0) / n
const cov = pairs.reduce((a, q) => a + (q[0] - mx) * (q[1] - my), 0), vx = pairs.reduce((a, q) => a + (q[0] - mx) ** 2, 0), vy = pairs.reduce((a, q) => a + (q[1] - my) ** 2, 0)
const hit = pairs.filter(q => Math.abs(q[1]) >= 0.001), agree = hit.filter(q => Math.abs(q[0]) >= 0.001 && Math.sign(q[0]) === Math.sign(q[1])).length
lines.push(`reconstruction check: corr(pred, realised) = ${(cov / Math.sqrt(vx * vy)).toFixed(3)} on ${n} settlements; realised |f|>=0.10%: ${hit.length}, predicted too: ${agree}`)
console.log(lines.join('\n')); appendFileSync('status/funding-cme-v113.txt', lines.join('\n') + '\n')

// v113bt — two intraday ideas the repo had not tested (owner 2026-09-30: "give another idea", intraday only).
// Pre-registered before any result was read. Cost 16 bps per round trip (taker 5 + slip 3, per side).
//
// A. FUNDING-SETTLEMENT CAPTURE. At each 8h settlement T with |rate| >= thr, take the side that RECEIVES
//    funding (rate > 0 -> short), enter at the open of the 15m bar starting at T-e, exit at the close of the
//    15m bar starting at T+x-15m; P&L = side * price return + |rate| - costs.
//    NB the entry uses the realised rate of T as the signal. Live, the predicted rate 15-60 min before T is
//    published and is normally within a fraction of a bp of it; small look-ahead, labelled.
//    thr {0.03, 0.05, 0.10}% x windows {enter -15 exit +15, -60/+15, -15/+60} = 9 looks. 40 coins, 36m (15m bars).
// B. CME WEEKEND GAP FILL (BTC, ETH, 1h, 72m). Friday ref = close of the 1h bar ending 21:00 UTC Fri;
//    Sunday open = close of the bar ending 23:00 UTC Sun. Gap g = sun/fri - 1. If |g| >= thr, fade toward
//    Friday: enter at Sun 23:00, exit at the Friday price (target), a stop at 2x the gap beyond entry, or
//    Mon 21:00 (time). thr {1, 2}% = 2 looks x 2 coins pooled.
// Split for both: IS first 70% of time, OOS last 30%; t on daily sums. PASS = IS net > 0, OOS net > 0, OOS t >= 2.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
const COST = 0.0016
const load = (f) => { const L = readFileSync(f, 'utf8').trim().split('\n'); return L.map(r => r.split(',').map(Number)) }
const tstat = v => { if (v.length < 3) return 0; const m = v.reduce((a, b) => a + b, 0) / v.length
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)); return sd > 0 ? m / (sd / Math.sqrt(v.length)) : 0 }
const stats = xs => { const day = new Map(); for (const x of xs) { const k = Math.floor(x.t / 864e5); day.set(k, (day.get(k) ?? 0) + x.r) }
  const r = xs.map(x => x.r); return { n: r.length, avg: r.length ? 1e4 * r.reduce((a, b) => a + b, 0) / r.length : 0,
    wr: r.length ? 100 * r.filter(v => v > 0).length / r.length : 0, t: tstat([...day.values()]) } }
const fmt = s => `n ${String(s.n).padStart(5)} net ${s.avg.toFixed(1).padStart(7)} bps WR ${s.wr.toFixed(1)}% t ${s.t.toFixed(2).padStart(6)}`
const out = []; let passes = 0
const report = (name, xs, cut) => { const I = stats(xs.filter(x => x.t < cut)), O = stats(xs.filter(x => x.t >= cut))
  const G = stats(xs.map(x => ({ t: x.t, r: x.g })))
  const pass = I.avg > 0 && O.avg > 0 && O.t >= 2; if (pass) passes++
  out.push(`${name.padEnd(34)} IS ${fmt(I)} | OOS ${fmt(O)} | gross(before costs, all) ${G.avg.toFixed(1)} bps${pass ? '  PASS' : ''}`) }

// ---- A
const COINS = readdirSync('backtest/data').filter(f => f.endsWith('-15m.csv')).map(f => f.replace('-15m.csv', ''))
const kl = {}, fr = {}
for (const c of COINS) { const k = load(`backtest/data/${c}-15m.csv`); const m = new Map(); for (const r of k) m.set(r[0], r); kl[c] = m
  fr[c] = load(`backtest/data/${c}-funding.csv`).map(r => [r[0], r[2]]) }
const t0 = load('backtest/data/BTC-15m.csv')[0][0], t1 = Date.UTC(2026, 7, 31), cutA = t0 + 0.7 * (t1 - t0)
const Q = 900e3
out.push(`A. funding-settlement capture, ${COINS.length} coins, 15m, ${new Date(t0).toISOString().slice(0, 10)} .. 2026-08-31, IS < ${new Date(cutA).toISOString().slice(0, 10)}`)
for (const thr of [0.0003, 0.0005, 0.001]) for (const [e, x] of [[15, 15], [60, 15], [15, 60]]) {
  const xs = []
  for (const c of COINS) for (const [T, rate] of fr[c]) {
    if (T < t0 || Math.abs(rate) < thr) continue
    const Ts = Math.round(T / Q) * Q, a = kl[c].get(Ts - e * 60e3), b = kl[c].get(Ts + x * 60e3 - Q)
    if (!a || !b) continue
    const side = rate > 0 ? -1 : 1, g = side * (b[4] / a[1] - 1) + Math.abs(rate)
    xs.push({ t: T, g, r: g - COST })
  }
  report(`|f|>=${(thr * 100).toFixed(2)}% enter -${e}m exit +${x}m`, xs, cutA)
}

// ---- B
out.push('', 'B. CME weekend gap fill, BTC + ETH, 1h, 72m')
const xsB = { 0.01: [], 0.02: [] }; let cutB = 0
for (const c of ['BTC', 'ETH']) {
  const k = load(`backtest/data/${c}-1h.csv`), byT = new Map(k.map(r => [r[0], r]))
  cutB = k[0][0] + 0.7 * (k[k.length - 1][0] - k[0][0])
  for (const r of k) {
    const d = new Date(r[0]); if (!(d.getUTCDay() === 5 && d.getUTCHours() === 20)) continue   // bar 20:00-21:00 Fri
    const fri = r[4], sunBar = byT.get(r[0] + 50 * 3600e3)                                      // bar 22:00-23:00 Sun
    if (!sunBar) continue
    const e = sunBar[4], g = e / fri - 1
    for (const thr of [0.01, 0.02]) {
      if (Math.abs(g) < thr) continue
      const side = g > 0 ? -1 : 1, stop = e * (1 - side * 2 * Math.abs(g))
      let exit = null
      for (let h = 1; h <= 22; h++) { const b = byT.get(sunBar[0] + h * 3600e3); if (!b) break
        if (side > 0 ? b[3] <= stop : b[2] >= stop) { exit = stop; break }
        if (side > 0 ? b[2] >= fri : b[3] <= fri) { exit = fri; break }
        exit = b[4] }
      if (exit === null) continue
      const gr = side * (exit / e - 1); xsB[thr].push({ t: sunBar[0], g: gr, r: gr - COST })
    }
  }
}
for (const thr of [0.01, 0.02]) report(`gap >= ${thr * 100}% fade to Friday close`, xsB[thr], cutB)

const txt = ['v113bt — funding-settlement capture + CME weekend gap fill (cost 16 bps round trip)',
  `looks 11 -> luck ~0.25 false passes at t>=2; PASS: ${passes}`, ''].concat(out).join('\n')
console.log(txt); writeFileSync('status/funding-cme-v113.txt', txt + '\n')

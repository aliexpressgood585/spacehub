// v112bt — RANGE FADE on coins that range (owner 2026-09-30: "short at the highs, long at the lows of a zone,
// many times, on coins that fit it"). Pre-registered before any result was read:
//   data: Binance USDT-M, the pinned 40 coins; 15m (36m) and 1h (same span) bars
//   range: previous N bars' high/low (current bar excluded), height H; trade only when
//          efficiency ratio over those N bars < 0.3 (sideways) AND H / mid >= 1% (room above costs)
//   entry: resting LIMIT orders, short at hi - 0.1H, long at lo + 0.1H; filled only if the bar trades
//          through the level (maker 2 bps); one position per coin; range frozen at entry
//   exit: stop hi + 0.25H (short) / lo - 0.25H (long), taker 5 + slip 3 bps; target = mid (lo + 0.5H) or
//         the opposite zone, maker 2 bps; time stop N/2 bars at taker; stop checked before target from the
//         bar after the fill; funding 0.01%/8h charged
//   "coins that fit": each month trade only the 10 coins whose rule result (sum R) over the previous
//         3 months was highest and > 0 (walk-forward, no look-ahead) — vs trading all 40
//   grid: tf {15m, 1h} x N {48, 96} x target {mid, opp} x select {all, top10} = 16 looks
//   split: IS first 70% of time, OOS last 30%; t on daily sum of R
//   PASS = IS avgR > 0 AND OOS avgR > 0 AND OOS t(daily) >= 2
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
const COINS = readdirSync('backtest/data').filter(f => f.endsWith('-15m.csv')).map(f => f.replace('-15m.csv', ''))
const MAKER = 0.0002, TAKER = 0.0008, FUND_H = 0.0001 / 8

function load(sym, tf) {
  const L = readFileSync(`backtest/data/${sym}-${tf}.csv`, 'utf8').trim().split('\n')
  const n = L.length, d = { n, t: new Float64Array(n), o: new Float64Array(n), h: new Float64Array(n), l: new Float64Array(n), c: new Float64Array(n) }
  for (let i = 0; i < n; i++) { const r = L[i].split(','); d.t[i] = +r[0]; d.o[i] = +r[1]; d.h[i] = +r[2]; d.l[i] = +r[3]; d.c[i] = +r[4] }
  return d
}

// all trades for one coin, one config: {t (entry time), month, R}
function trades(d, N, target, barH, tStart) {
  const out = []
  let pos = null
  for (let i = N + 1; i < d.n; i++) {
    if (pos) {
      const s = pos.side, held = i - pos.i
      let exit = null, fee = TAKER
      if (s < 0 ? d.h[i] >= pos.stop : d.l[i] <= pos.stop) exit = pos.stop
      else if (s < 0 ? d.l[i] < pos.tp : d.h[i] > pos.tp) { exit = pos.tp; fee = MAKER }
      else if (held >= N / 2) exit = d.c[i]
      if (exit !== null) {
        const risk = Math.abs(pos.e - pos.stop)
        const gross = s * (exit - pos.e)
        const cost = pos.e * MAKER + exit * fee + pos.e * FUND_H * barH * held
        out.push({ t: pos.t, R: (gross - cost) / risk })
        pos = null
      }
      continue
    }
    if (d.t[i] < tStart) continue
    let hi = -Infinity, lo = Infinity, path = 0
    for (let j = i - N; j < i; j++) { if (d.h[j] > hi) hi = d.h[j]; if (d.l[j] < lo) lo = d.l[j]; path += Math.abs(d.c[j] - d.c[j - 1]) }
    const H = hi - lo, mid = (hi + lo) / 2, er = path > 0 ? Math.abs(d.c[i - 1] - d.c[i - N - 1]) / path : 1
    if (!(er < 0.3 && H / mid >= 0.01)) continue
    const sL = hi - 0.1 * H, bL = lo + 0.1 * H
    const tpS = target === 'mid' ? mid : lo + 0.1 * H, tpB = target === 'mid' ? mid : hi - 0.1 * H
    if (d.o[i] < sL && d.h[i] > sL) pos = { side: -1, e: sL, stop: hi + 0.25 * H, tp: tpS, i, t: d.t[i] }
    else if (d.o[i] > bL && d.l[i] < bL) pos = { side: 1, e: bL, stop: lo - 0.25 * H, tp: tpB, i, t: d.t[i] }
  }
  return out
}

const month = t => { const d = new Date(t); return d.getUTCFullYear() * 12 + d.getUTCMonth() }
const tstat = v => { if (v.length < 3) return 0; const m = v.reduce((a, b) => a + b, 0) / v.length
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)); return sd > 0 ? m / (sd / Math.sqrt(v.length)) : 0 }

const lines = [], selCache = new Map()
let passes = 0, span = null
for (const tf of ['15m', '1h']) {
  const data = Object.fromEntries(COINS.map(c => [c, load(c, tf)]))
  const tStart = data.BTC.t[0], tEnd = data.BTC.t[data.BTC.n - 1]
  // 1h archive is 72m; test the same 36m span as 15m, plus 3 warm-up months for selection
  const t0 = tf === '1h' ? load('BTC', '15m').t[0] : tStart
  const cut = t0 + 0.7 * (tEnd - t0)
  span = span ?? `${new Date(t0).toISOString().slice(0, 10)} .. ${new Date(tEnd).toISOString().slice(0, 10)}, IS < ${new Date(cut).toISOString().slice(0, 10)}`
  for (const N of [48, 96]) for (const target of ['mid', 'opp']) {
    const per = {}
    for (const c of COINS) per[c] = trades(data[c], N, target, tf === '15m' ? 0.25 : 1, t0 - 90 * 864e5)
    for (const sel of ['all', 'top10']) {
      const picked = []
      for (const c of COINS) for (const x of per[c]) {
        if (x.t < t0) continue
        if (sel === 'top10') {
          const m = month(x.t)
          const score = cc => per[cc].filter(y => { const my = month(y.t); return my >= m - 3 && my < m }).reduce((a, y) => a + y.R, 0)
          x._m = m
          if (!selCache.has(tf + N + target + m)) selCache.set(tf + N + target + m,
            new Set(COINS.map(cc => [cc, score(cc)]).filter(z => z[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 10).map(z => z[0])))
          if (!selCache.get(tf + N + target + m).has(c)) continue
        }
        picked.push(x)
      }
      const agg = (xs) => { const day = new Map(); for (const x of xs) { const k = Math.floor(x.t / 864e5); day.set(k, (day.get(k) ?? 0) + x.R) }
        const R = xs.map(x => x.R); return { n: R.length, avg: R.length ? R.reduce((a, b) => a + b, 0) / R.length : 0,
          wr: R.length ? 100 * R.filter(r => r > 0).length / R.length : 0, tot: R.reduce((a, b) => a + b, 0), t: tstat([...day.values()]) } }
      const IS = agg(picked.filter(x => x.t < cut)), OOS = agg(picked.filter(x => x.t >= cut))
      const pass = IS.avg > 0 && OOS.avg > 0 && OOS.t >= 2; if (pass) passes++
      const f = s => `n ${String(s.n).padStart(5)} avgR ${s.avg.toFixed(3).padStart(7)} WR ${s.wr.toFixed(1)}% totR ${s.tot.toFixed(0).padStart(6)} t ${s.t.toFixed(2).padStart(6)}`
      lines.push(`${tf.padEnd(3)} N ${N} tp ${target} ${sel.padEnd(5)} | IS ${f(IS)} | OOS ${f(OOS)}${pass ? '  PASS' : ''}`)
    }
  }
}

const txt = [`v112bt — range fade (short range top, long range bottom), 40 coins, ${span}`,
  'maker entry/target 2bps, stop/time taker 5+3bps, funding 0.01%/8h; R = net P&L / stop distance',
  `looks 16 -> luck ~0.4 false passes; PASS: ${passes}`, ''].concat(lines).join('\n')
console.log(txt)
writeFileSync('status/range-fade-v112.txt', txt + '\n')

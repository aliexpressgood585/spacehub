// v111bt — neutral futures GRID (owner 2026-09-30: "trade in grids so we can also earn in a neutral market").
// Pre-registered before any result was read:
//   data: Binance USDT-M 1m, 10 coins, 12 months (backtest/data/*-1m.csv)
//   grid: geometric levels center*(1+s)^i, i=-N..N; crossing a level down = buy 1 unit, up = sell 1 unit
//         (net position = -(levels moved from center)); unit notional = C/N so max inventory = 1x capital
//   fills: MAKER 2 bps, only when price trades STRICTLY THROUGH the level; bar path open->low->high->close
//          if close>=open else open->high->low->close
//   stop: price one step beyond the outer level -> close inventory at market (taker 5 + slip 3 bps), re-center
//   funding: 0.01%/8h on |inventory| notional, always charged (conservative approximation)
//   gate: none | ER (efficiency ratio of the last 240 1m bars < 0.3 = ranging; gate off -> flatten at market)
//   grid: s in {0.2, 0.4, 0.8, 1.5}% x N in {5, 10} x gate {none, ER} = 16 looks
//   split: IS first 70% of time, OOS last 30%; t on daily P&L summed over coins
//   PASS = IS net > 0 AND OOS net > 0 AND OOS t(daily) >= 2
import { readFileSync, writeFileSync } from 'node:fs'
const COINS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'DOT']
const MAKER = 0.0002, TAKER = 0.0005 + 0.0003, FUND_PER_MIN = 0.0001 / 480
const C = 1000

function load(sym) {
  const L = readFileSync(`backtest/data/${sym}-1m.csv`, 'utf8').trim().split('\n')
  const n = L.length, t = new Float64Array(n), o = new Float64Array(n), h = new Float64Array(n), l = new Float64Array(n), c = new Float64Array(n)
  for (let i = 0; i < n; i++) { const r = L[i].split(','); t[i] = +r[0]; o[i] = +r[1]; h[i] = +r[2]; l[i] = +r[3]; c[i] = +r[4] }
  return { t, o, h, l, c, n }
}

function erGate(d, W = 240) {
  const g = new Uint8Array(d.n); let path = 0
  const ab = i => Math.abs(d.c[i] - d.c[i - 1])
  for (let i = 1; i < d.n; i++) {
    path += ab(i); if (i > W) path -= ab(i - W)
    if (i >= W) { const net = Math.abs(d.c[i] - d.c[i - W]); g[i] = path > 0 && net / path < 0.3 ? 1 : 0 }
  }
  return g
}

function run(d, s, N, gate) {
  const unit = C / N, daily = new Map()
  let active = false, center = 0, a = 0, pos = 0, cash = 0, fills = 0, stops = 0, lastEq = 0
  const lvl = k => center * Math.pow(1 + s, k)
  const add = (t, x) => { const day = Math.floor(t / 864e5); daily.set(day, (daily.get(day) ?? 0) + x) }
  const flatten = (px) => { if (pos) { cash += pos * px - Math.abs(pos) * px * TAKER; pos = 0 } active = false }
  for (let i = 1; i < d.n; i++) {
    const on = gate ? gate[i - 1] === 1 : true      // gate decided on the PREVIOUS bar (no look-ahead)
    if (!on && active) flatten(d.o[i])
    if (on && !active) { active = true; center = d.o[i]; a = 0 }
    if (active) {
      const path = d.c[i] >= d.o[i] ? [d.l[i], d.h[i], d.c[i]] : [d.h[i], d.l[i], d.c[i]]
      for (const p of path) {
        // down crossings: price strictly below level a-1 -> buy
        while (active && p < lvl(a - 1)) {
          if (a - 1 < -N) { stops++; flatten(Math.min(p, lvl(a - 1))); break }
          a--; const L = lvl(a); const q = unit / L; pos += q; cash -= q * L + unit * MAKER; fills++
        }
        while (active && p > lvl(a + 1)) {
          if (a + 1 > N) { stops++; flatten(Math.max(p, lvl(a + 1))); break }
          a++; const L = lvl(a); const q = unit / L; pos -= q; cash += q * L - unit * MAKER; fills++
        }
        if (!active) break
      }
      cash -= Math.abs(pos) * d.c[i] * FUND_PER_MIN
    }
    const eq = cash + pos * d.c[i]
    add(d.t[i], eq - lastEq); lastEq = eq
  }
  return { daily, fills, stops }
}

function tstat(v) {
  if (v.length < 3) return 0
  const m = v.reduce((a, b) => a + b, 0) / v.length
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1))
  return sd > 0 ? m / (sd / Math.sqrt(v.length)) : 0
}

const data = Object.fromEntries(COINS.map(c => [c, load(c)]))
const gates = Object.fromEntries(COINS.map(c => [c, erGate(data[c])]))
const t0 = data.BTC.t[0] / 864e5, t1 = data.BTC.t[data.BTC.n - 1] / 864e5, cut = Math.floor(t0 + 0.7 * (t1 - t0))
const out = [], rows = []
for (const s of [0.002, 0.004, 0.008, 0.015]) for (const N of [5, 10]) for (const g of ['none', 'ER']) {
  const tot = new Map(); let fills = 0, stops = 0
  for (const c of COINS) {
    const r = run(data[c], s, N, g === 'ER' ? gates[c] : null)
    fills += r.fills; stops += r.stops
    for (const [k, v] of r.daily) tot.set(k, (tot.get(k) ?? 0) + v)
  }
  const IS = [...tot].filter(([k]) => k < cut).map(x => x[1]), OOS = [...tot].filter(([k]) => k >= cut).map(x => x[1])
  const sum = v => v.reduce((a, b) => a + b, 0), cap = C * COINS.length
  let eq = 0, pk = 0, dd = 0; for (const [, v] of [...tot].sort((a, b) => a[0] - b[0])) { eq += v; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq) }
  const r = { s: s * 100, N, gate: g, fills, stops, IS: 100 * sum(IS) / cap, OOS: 100 * sum(OOS) / cap, tIS: tstat(IS), tOOS: tstat(OOS), maxDD: 100 * dd / cap }
  r.pass = r.IS > 0 && r.OOS > 0 && r.tOOS >= 2
  rows.push(r)
  out.push(`s ${r.s.toFixed(1)}%  N ${String(N).padStart(2)}  gate ${g.padEnd(4)}  fills ${String(fills).padStart(7)}  stops ${String(stops).padStart(5)}  ` +
    `IS ${r.IS.toFixed(1).padStart(7)}% (t ${r.tIS.toFixed(2).padStart(6)})  OOS ${r.OOS.toFixed(1).padStart(7)}% (t ${r.tOOS.toFixed(2).padStart(6)})  maxDD ${r.maxDD.toFixed(1)}%${r.pass ? '  PASS' : ''}`)
}
const head = [`v111bt — neutral futures GRID, 10 coins, 1m, ${new Date(t0 * 864e5).toISOString().slice(0, 10)} .. ${new Date(t1 * 864e5).toISOString().slice(0, 10)}`,
  `IS < ${new Date(cut * 864e5).toISOString().slice(0, 10)} <= OOS; returns are % of total capital ($${C}/coin, max inventory 1x); maker 2bps, stop taker 5+3bps, funding 0.01%/8h`,
  `looks 16 -> luck ~0.4 false passes at t>=2; PASS: ${rows.filter(r => r.pass).length}`, '']
const txt = head.concat(out).join('\n')
console.log(txt)
writeFileSync('status/grid-v111.txt', txt + '\n')

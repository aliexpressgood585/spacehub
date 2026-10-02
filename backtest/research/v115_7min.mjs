// v115bt (2026-10-02) — owner: "a strategy that finds trades of at most 7 minutes".
// PRE-REGISTERED before any result was read. Binance USDT-M 1m klines, 10 coins, 2025-09 .. 2026-08 (12 months).
// Signal on the CLOSED 1m bar i; entry at bar i+1 OPEN; exit at the CLOSE of bar i+H (H = 3/5/7 min) or by a bracket.
// Costs per side: taker 5 bps + slippage 3 bps (16 bps round trip); stress column at 5 bps slippage (20 bps).
// Bracket variant: stop = target = 2.5 x sigma1m x sqrt(H), stop checked first when both touch inside a bar.
// One open trade per rule x coin (no overlap). IS = first 70% of time, OOS = last 30%, read once.
// t-stat on DAILY sums (trades on the same day are not independent).
// PASS = IS net > 0 AND OOS net > 0 AND OOS t(daily) >= 2.  42 rows -> luck alone passes ~1.
import fs from 'node:fs'
const DIR = '/home/user/spacehub/backtest/data/m1'
const COINS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'DOT']
const FEE = 0.0005, SLIP = 0.0003, SLIP_S = 0.0005
const load = c => {
  const L = fs.readFileSync(`${DIR}/${c}-1m.csv`, 'utf8').split('\n'), n = L.length
  const t = new Float64Array(n), o = new Float64Array(n), h = new Float64Array(n), l = new Float64Array(n), cl = new Float64Array(n), v = new Float64Array(n), tb = new Float64Array(n), q = new Float64Array(n)
  let k = 0
  for (const s of L) { if (!s) continue; const f = s.split(','); t[k] = +f[0]; o[k] = +f[1]; h[k] = +f[2]; l[k] = +f[3]; cl[k] = +f[4]; v[k] = +f[5]; q[k] = +f[7]; tb[k] = +f[9]; k++ }
  return { n: k, t, o, h, l, c: cl, v, tb, q }
}
const data = Object.fromEntries(COINS.map(c => [c, load(c)]))
const T0 = data.BTC.t[0], T1 = data.BTC.t[data.BTC.n - 1], CUT = T0 + 0.7 * (T1 - T0)
// per-coin rolling stats: sigma of 1m log returns (60 bars), avg volume (60), vwap60
function stats(d) {
  const { n, c, v, q } = d, sig = new Float64Array(n), av = new Float64Array(n), vw = new Float64Array(n), r = new Float64Array(n)
  for (let i = 1; i < n; i++) r[i] = Math.log(c[i] / c[i - 1])
  let s1 = 0, s2 = 0, sv = 0, sq = 0
  for (let i = 1; i < n; i++) {
    s1 += r[i]; s2 += r[i] * r[i]; sv += v[i]; sq += q[i]
    if (i > 60) { s1 -= r[i - 60]; s2 -= r[i - 60] * r[i - 60]; sv -= v[i - 60]; sq -= q[i - 60] }
    if (i >= 60) { const m = s1 / 60; sig[i] = Math.sqrt(Math.max(1e-12, s2 / 60 - m * m)); av[i] = sv / 60; vw[i] = sv > 0 ? sq / sv : c[i] }
  }
  return { sig, av, vw, r }
}
const S = Object.fromEntries(COINS.map(c => [c, stats(data[c])]))
const btcIdx = new Map(); { const d = data.BTC; for (let i = 0; i < d.n; i++) btcIdx.set(d.t[i], i) }
const rows = {}
function trade(key, d, i, side, H, bracket, sig) {
  const j = i + 1, end = i + H; if (end >= d.n) return -1
  const e = d.o[j]; let exitPx = d.c[end], k = end
  if (bracket) {
    const w = 2.5 * sig * Math.sqrt(H), stop = e * (1 - side * w), tgt = e * (1 + side * w)
    for (let m = j; m <= end; m++) {
      const adv = side > 0 ? d.l[m] : d.h[m], fav = side > 0 ? d.h[m] : d.l[m]
      if (side * (adv - stop) <= 0) { exitPx = side * (d.o[m] - stop) <= 0 ? d.o[m] : stop; k = m; break }
      if (side * (fav - tgt) >= 0) { exitPx = tgt; k = m; break }
    }
  }
  const gross = side * (exitPx / e - 1)
  ;(rows[key] ??= []).push({ t: d.t[j], gross, net: gross - 2 * (FEE + SLIP), netS: gross - 2 * (FEE + SLIP_S) })
  return k
}
const HOLDS = (process.env.HOLDS ?? '3,5,7').split(',').map(Number)  // v115b: HOLDS=15,30,45
for (const c of COINS) {
  const d = data[c], { sig, av, vw, r } = S[c], B = data.BTC, SB = S.BTC
  const busy = {}
  const go = (rule, i, side) => {
    for (const H of HOLDS) for (const br of [false, true]) {
      const key = `${rule} | ${H}m | ${br ? 'bracket' : 'time'}`
      if (i < (busy[key] ?? 0)) continue
      const k = trade(key, d, i, side, H, br, sig[i]); if (k > 0) busy[key] = k + 1
    }
  }
  for (let i = 61; i < d.n - Math.max(...HOLDS) - 2; i++) {
    const sg = sig[i]; if (!(sg > 0) || !(av[i] > 0)) continue
    // R1/R2: 3-minute burst on volume with taker agreement
    const r3 = Math.log(d.c[i] / d.c[i - 3]), z3 = r3 / (sg * Math.sqrt(3))
    let v3 = 0, f3 = 0; for (let k = i - 2; k <= i; k++) { v3 += d.v[k]; f3 += 2 * d.tb[k] - d.v[k] }
    if (Math.abs(z3) > 2.5 && v3 >= 6 * av[i] && Math.sign(f3) === Math.sign(z3) && Math.abs(f3 / v3) > 0.1) {
      go('R1 burst follow', i, Math.sign(z3)); go('R2 burst fade', i, -Math.sign(z3))
    }
    // R3: long-wick rejection bar (liquidation-style flush that closed back) -> trade the rejection
    const rg = d.h[i] - d.l[i], body = Math.abs(d.c[i] - d.o[i])
    if (rg / d.c[i] > 4 * sg && body < 0.4 * rg) {
      const lw = Math.min(d.o[i], d.c[i]) - d.l[i], uw = d.h[i] - Math.max(d.o[i], d.c[i])
      if (lw >= 0.6 * rg) go('R3 wick reject', i, 1); else if (uw >= 0.6 * rg) go('R3 wick reject', i, -1)
    }
    // R4: BTC led, alt has not followed yet -> follow BTC on the alt
    if (c !== 'BTC') {
      const bi = btcIdx.get(d.t[i])
      if (bi !== undefined && SB.sig[bi] > 0) {
        const zb = SB.r[bi] / SB.sig[bi], za = r[i] / sg
        if (Math.abs(zb) > 3 && Math.sign(za) !== -Math.sign(zb) && Math.abs(za) < 0.3 * Math.abs(zb)) go('R4 BTC lead', i, Math.sign(zb))
      }
    }
    // R5: stretched from the 60-minute VWAP -> fade
    const dz = Math.log(d.c[i] / vw[i]) / (sg * Math.sqrt(60))
    if (Math.abs(dz) > 3) go('R5 VWAP fade', i, -Math.sign(dz))
    // R6/R7: one-minute taker imbalance extreme on volume
    const imb = d.v[i] > 0 ? (2 * d.tb[i] - d.v[i]) / d.v[i] : 0
    if (Math.abs(imb) > 0.6 && d.v[i] >= 3 * av[i]) { go('R6 flow follow', i, Math.sign(imb)); go('R7 flow fade', i, -Math.sign(imb)) }
  }
}
const day = t => Math.floor(t / 86400000)
function summ(a, f) {
  if (!a.length) return { n: 0, m: 0, t: 0 }
  const dd = new Map(); for (const x of a) dd.set(day(x.t), (dd.get(day(x.t)) ?? 0) + x[f])
  const v = [...dd.values()], mu = v.reduce((s, x) => s + x, 0) / v.length, sd = Math.sqrt(v.reduce((s, x) => s + (x - mu) ** 2, 0) / Math.max(1, v.length - 1))
  return { n: a.length, m: a.reduce((s, x) => s + x[f], 0) / a.length * 1e4, t: sd > 0 ? mu / sd * Math.sqrt(v.length) : 0 }
}
const out = []
out.push(`v115bt — holds ${HOLDS.join('/')} min, Binance USDT-M 1m, ${COINS.length} coins, ${new Date(T0).toISOString().slice(0, 10)} .. ${new Date(T1).toISOString().slice(0, 10)}`)
out.push(`costs: taker 5 bps + slip 3 bps per side (16 bps round trip); stress slip 5 bps (20). IS 70% / OOS 30%. bps per trade, t on daily sums.`)
out.push(`PASS = IS net>0 & OOS net>0 & OOS t>=2. ${Object.keys(rows).length} rows -> luck alone ~${(Object.keys(rows).length * 0.023).toFixed(1)}.`)
out.push('')
out.push('rule | hold | exit'.padEnd(36) + 'IS n     gross   net    t   | OOS n    gross   net    t   stress  verdict')
let pass = 0
for (const k of Object.keys(rows).sort()) {
  const a = rows[k], is = a.filter(x => x.t < CUT), oo = a.filter(x => x.t >= CUT)
  const ig = summ(is, 'gross'), inn = summ(is, 'net'), og = summ(oo, 'gross'), on = summ(oo, 'net'), os = summ(oo, 'netS')
  const ok = inn.m > 0 && on.m > 0 && on.t >= 2; if (ok) pass++
  out.push(k.padEnd(36) + `${String(ig.n).padStart(6)} ${ig.m.toFixed(1).padStart(7)} ${inn.m.toFixed(1).padStart(6)} ${inn.t.toFixed(1).padStart(5)} | ${String(og.n).padStart(6)} ${og.m.toFixed(1).padStart(7)} ${on.m.toFixed(1).padStart(6)} ${on.t.toFixed(1).padStart(5)} ${os.m.toFixed(1).padStart(7)}  ${ok ? 'PASS' : '-'}`)
}
out.push('', `PASS: ${pass} of ${Object.keys(rows).length}`)
const txt = out.join('\n'); console.log(txt)
fs.writeFileSync(process.env.OUT ?? '/home/user/spacehub/status/seven-min-v115.txt', txt + '\n')

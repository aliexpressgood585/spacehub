// v117bt (2026-10-02) — owner: "combine leading coins with opposite correlation, e.g. 2 long + 1 short or the reverse".
// PRE-REGISTERED before reading results. 10 majors (BTC ETH SOL BNB XRP DOGE ADA AVAX LINK DOT), Binance USDT-M 1m ->
// hourly closes, 2025-09 .. 2026-08.
// Part A: how correlated are they really (hourly and daily return correlations)?
// Part B: market-neutral baskets. Every R hours rank the 10 coins by their trailing L-hour return;
//   MOM = long the top nL, short the bottom nS; REV = the opposite. Dollar-neutral: longs share 50% of capital, shorts 50%.
//   Hold R hours, re-rank. Cost = 8 bps per side (taker 5 + slip 3) on every unit of weight that changes.
//   Funding 0.01%/8h paid by longs, received by shorts (nets ~0 on a neutral book; included anyway).
//   Variants: (nL,nS) in {2/1, 1/2, 1/1, 2/2}, L in {4, 24, 168} h, R in {4, 24} h, MOM/REV -> 48 rows.
// IS = first 70%, OOS = last 30%, read once; t on daily sums. PASS = IS net>0 & OOS net>0 & OOS t>=2. Luck ~1.1.
import fs from 'node:fs'
const DIR = '/home/user/spacehub/backtest/data/m1'
const C = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'DOT']
const H = 3600000
const hourly = c => {
  const m = new Map()
  for (const s of fs.readFileSync(`${DIR}/${c}-1m.csv`, 'utf8').split('\n')) {
    if (!s) continue; const f = s.split(','), t = +f[0]
    if (t % H === 0) m.set(t, +f[1])            // open of the first minute of each hour = price at the hour
  }
  return m
}
const px = C.map(hourly)
const times = [...px[0].keys()].filter(t => px.every(m => m.has(t))).sort((a, b) => a - b)
const P = times.map(t => px.map(m => m.get(t)))
const T = times.length, CUT = times[0] + 0.7 * (times[T - 1] - times[0])
const out = []
out.push(`v117bt — 2-long/1-short style baskets on ${C.length} majors, ${new Date(times[0]).toISOString().slice(0, 10)} .. ${new Date(times[T - 1]).toISOString().slice(0, 10)}, ${T} hours`)
// Part A — correlations
const corr = (step) => {
  const R = []; for (let i = step; i < T; i += step) R.push(P[i].map((p, k) => Math.log(p / P[i - step][k])))
  const n = R.length, mu = C.map((_, k) => R.reduce((s, r) => s + r[k], 0) / n)
  const sd = C.map((_, k) => Math.sqrt(R.reduce((s, r) => s + (r[k] - mu[k]) ** 2, 0) / n))
  const M = C.map((_, a) => C.map((_, b) => R.reduce((s, r) => s + (r[a] - mu[a]) * (r[b] - mu[b]), 0) / n / (sd[a] * sd[b])))
  return M
}
for (const [lab, step] of [['hourly', 1], ['daily', 24]]) {
  const M = corr(step); let mn = 1, mx = -1, sum = 0, cnt = 0, mnp = ''
  for (let a = 0; a < C.length; a++) for (let b = a + 1; b < C.length; b++) { const v = M[a][b]; sum += v; cnt++; if (v < mn) { mn = v; mnp = `${C[a]}/${C[b]}` } mx = Math.max(mx, v) }
  out.push(`A. ${lab} return correlation over 45 pairs: mean ${(sum / cnt).toFixed(2)}, lowest ${mn.toFixed(2)} (${mnp}), highest ${mx.toFixed(2)}`)
}
// rolling 30-day: how often is ANY pair negatively correlated (daily returns)?
{
  let windows = 0, neg = 0
  for (let e = 24 * 30; e < T; e += 24 * 7) {
    windows++; const R = []
    for (let i = e - 24 * 30 + 24; i <= e; i += 24) R.push(P[i].map((p, k) => Math.log(p / P[i - 24][k])))
    const n = R.length, mu = C.map((_, k) => R.reduce((s, r) => s + r[k], 0) / n), sd = C.map((_, k) => Math.sqrt(R.reduce((s, r) => s + (r[k] - mu[k]) ** 2, 0) / n))
    let any = false
    for (let a = 0; a < C.length; a++) for (let b = a + 1; b < C.length; b++) if (R.reduce((s, r) => s + (r[a] - mu[a]) * (r[b] - mu[b]), 0) / n / (sd[a] * sd[b]) < 0) any = true
    if (any) neg++
  }
  out.push(`A. rolling 30-day windows (weekly) where ANY of the 45 pairs had negative daily correlation: ${neg} of ${windows}`)
}
out.push('')
// Part B — baskets
const COST = 0.0008, FUND_H = 0.0001 / 8
const rowsOut = []
let pass = 0, n = 0
for (const [nL, nS] of [[2, 1], [1, 2], [1, 1], [2, 2]]) for (const L of [4, 24, 168]) for (const R of [4, 24]) for (const mode of ['MOM', 'REV']) {
  n++
  const per = [] // {t, gross, net}
  let w = new Array(C.length).fill(0)
  for (let i = Math.max(L, 1); i + R < T; i += R) {
    const ret = C.map((_, k) => P[i][k] / P[i - L][k] - 1)
    const order = C.map((_, k) => k).sort((a, b) => ret[b] - ret[a])     // best first
    const top = order.slice(0, mode === 'MOM' ? nL : nS), bot = order.slice(C.length - (mode === 'MOM' ? nS : nL))
    const nw = new Array(C.length).fill(0)
    if (mode === 'MOM') { for (const k of top) nw[k] += 0.5 / nL; for (const k of bot) nw[k] -= 0.5 / nS }
    else { for (const k of bot) nw[k] += 0.5 / nL; for (const k of top) nw[k] -= 0.5 / nS }
    const turn = nw.reduce((s, x, k) => s + Math.abs(x - w[k]), 0)
    const gross = nw.reduce((s, x, k) => s + x * (P[i + R][k] / P[i][k] - 1), 0)
    const fund = -nw.reduce((s, x) => s + x, 0) * FUND_H * R          // long pays, short receives
    per.push({ t: times[i], gross, net: gross - turn * COST + fund })
    w = nw.map((x, k) => x * P[i + R][k] / P[i][k])                    // drift until the next rebalance
    const g = w.reduce((s, x) => s + Math.abs(x), 0); w = w.map(x => x / g)   // re-normalise to gross 1
  }
  const sm = (a, f) => {
    const dd = new Map(); for (const x of a) { const d = Math.floor(x.t / 86400000); dd.set(d, (dd.get(d) ?? 0) + x[f]) }
    const v = [...dd.values()], mu = v.reduce((s, x) => s + x, 0) / v.length, sd = Math.sqrt(v.reduce((s, x) => s + (x - mu) ** 2, 0) / Math.max(1, v.length - 1))
    return { n: a.length, bps: a.reduce((s, x) => s + x[f], 0) / a.length * 1e4, day: mu * 100, t: sd > 0 ? mu / sd * Math.sqrt(v.length) : 0, tot: a.reduce((s, x) => s + x[f], 0) * 100 }
  }
  const is = per.filter(x => x.t < CUT), oo = per.filter(x => x.t >= CUT)
  const ig = sm(is, 'gross'), inet = sm(is, 'net'), og = sm(oo, 'gross'), onet = sm(oo, 'net')
  const ok = inet.tot > 0 && onet.tot > 0 && onet.t >= 2; if (ok) pass++
  rowsOut.push(`${mode} ${nL}L/${nS}S L${String(L).padStart(3)}h R${String(R).padStart(2)}h`.padEnd(26) +
    `IS gross ${ig.bps.toFixed(1).padStart(6)} net ${inet.bps.toFixed(1).padStart(6)} bps/period, ${inet.tot.toFixed(1).padStart(6)}% total t ${inet.t.toFixed(1).padStart(5)} | ` +
    `OOS gross ${og.bps.toFixed(1).padStart(6)} net ${onet.bps.toFixed(1).padStart(6)}, ${onet.tot.toFixed(1).padStart(6)}% total (${onet.day.toFixed(3)}%/day) t ${onet.t.toFixed(1).padStart(5)}  ${ok ? 'PASS' : '-'}`)
}
out.push('B. dollar-neutral baskets, cost 8 bps per side on turnover:')
out.push(...rowsOut, '', `PASS: ${pass} of ${n} (luck alone ~${(n * 0.023).toFixed(1)})`)
const txt = out.join('\n'); console.log(txt)
fs.writeFileSync('/home/user/spacehub/status/baskets-v117.txt', txt + '\n')

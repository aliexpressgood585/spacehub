// v120 engine — worker. Usage: SHARD=k NSHARD=m node engine.mjs  -> writes <scratch>/v120-shard-k.json
// PRE-REGISTERED (2026-10-02, before any result was read):
//  data      majors (10) at 1m/3m/5m/15m/30m from 12 months of Binance USDT-M 1m (2025-09..2026-08) and at 1h/4h/1D from
//            72 months of 1h (2020-09..2026-08; SUI from 2023-05); every other liquid perp in the m1 set at 15m and 1h (12m).
//  entry     rising edge of the family condition on a CLOSED bar, filled at the next bar's open (one bar of latency).
//  exits     trend: S x ATR stop, chandelier trail T x ATR updated at each close (applies from the next bar), max 96 bars;
//            mr:    S x ATR stop, target = BB mid of the previous bar (maker fill), max T bars. Stop checked first in a bar;
//            a gap through the stop fills at the open. One position per series x family x parameter point.
//  costs     taker 5 bps/side, maker 2 bps (mr target only), slippage 2 bps/side majors / 5 bps others, funding 0.01%/8h held.
//  filters   base / htf (only with the higher-timeframe trend: last COMPLETED htf bar close vs its EMA50) / cvd (20-bar
//            taker-flow sign agrees). OI, funding, liquidations, long/short and order book have no minute history -> not tested.
//  split     first 40% = initial train; walk-forward folds test 40-50 / 50-60 / 60-70 / 70-80% with anchored train before
//            each; last 20% = holdout, used once. Parameters chosen by PLATEAU score = median t (daily sums) of the point
//            and its grid neighbours on train, min 20 train trades.
import fs from 'node:fs'
import { compute } from './indicators.mjs'
import { FAMILIES, grid, neighbours } from './strategies.mjs'
const ROOT = '/home/user/spacehub/backtest/data', OUTDIR = process.env.OUT ?? '/tmp/claude-0/-home-user-spacehub/dcfebcff-34af-51f5-a98b-4d0c121612cf/scratchpad'
export const MAJORS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'SUI']
const HTF = { 1: 15, 3: 15, 5: 60, 15: 60, 30: 240, 60: 240, 240: 1440 }
const FUND_H = 0.0001 / 8, TAKER = 0.0005, MAKER = 0.0002, WARM = 300, CUTS = [0.4, 0.5, 0.6, 0.7, 0.8]

function loadBars(file, tf) {
  const txt = fs.readFileSync(file, 'utf8'), ms = tf * 60000
  const T = [], O = [], H = [], L = [], C = [], V = [], TB = []
  let cur = -1
  for (const s of txt.split('\n')) {
    if (!s) continue
    const f = s.split(','), t = +f[0], b = t - (t % ms)
    if (b !== cur) { cur = b; T.push(b); O.push(+f[1]); H.push(+f[2]); L.push(+f[3]); C.push(+f[4]); V.push(+f[5]); TB.push(+f[9]) }
    else { const k = T.length - 1; if (+f[2] > H[k]) H[k] = +f[2]; if (+f[3] < L[k]) L[k] = +f[3]; C[k] = +f[4]; V[k] += +f[5]; TB[k] += +f[9] }
  }
  const F = a => Float64Array.from(a)
  return { n: T.length, t: F(T), o: F(O), h: F(H), l: F(L), c: F(C), v: F(V), tb: F(TB) }
}
// higher-timeframe trend per bar: sign(close - EMA50) of the last COMPLETED htf bucket (no look-ahead)
function htfDir(B, tf) {
  const htf = HTF[tf]; if (!htf) return null
  const ms = htf * 60000, k = 2 / 51, dir = new Int8Array(B.n), bucketDir = new Map()
  let cur = -1, lastC = 0, e = NaN
  for (let i = 0; i < B.n; i++) {
    const b = B.t[i] - (B.t[i] % ms)
    if (b !== cur) { if (cur >= 0) { e = isNaN(e) ? lastC : lastC * k + e * (1 - k); bucketDir.set(cur, lastC > e ? 1 : lastC < e ? -1 : 0) } cur = b }
    lastC = B.c[i]
    dir[i] = bucketDir.get(b - ms) ?? 0
  }
  return dir
}
// entry signals per family x primary parameter: +1 / -1 at the bar where the condition turns true
function entries(I, B, F, p) {
  const n = B.n, sig = new Int8Array(n); let pl = false, ps = false
  for (let i = WARM; i < n - 1; i++) {
    const L = F.cond(I, B, i, p, 1), S = F.cond(I, B, i, p, -1)
    if (L && !pl) sig[i] = 1; else if (S && !ps) sig[i] = -1
    pl = L; ps = S
  }
  return sig
}
function simulate(I, B, F, sig, pt, filt, slip) {
  const n = B.n, tr = []; let busy = 0
  for (let i = WARM; i < n - 2; i++) {
    const s = sig[i]; if (!s || i < busy) continue
    if (filt && filt[i] !== s) continue
    const a = I.atr[i]; if (!(a > 0)) continue
    const j = i + 1, e = B.o[j]; let stop = e - s * pt.S * a, best = e, px = null, k, maker = false
    const maxH = F.kind === 'mr' ? pt.T : 96
    for (k = j; k < n && k < j + maxH; k++) {
      if (s > 0 ? B.l[k] <= stop : B.h[k] >= stop) { px = (s > 0 ? B.o[k] < stop : B.o[k] > stop) ? B.o[k] : stop; break }
      if (F.kind === 'mr') {
        const tg = I.bbMid[k - 1]
        if (s > 0 ? B.h[k] >= tg : B.l[k] <= tg) { px = (s > 0 ? B.o[k] > tg : B.o[k] < tg) ? B.o[k] : tg; maker = px === tg; break }
      } else {
        if (s > 0) { if (B.h[k] > best) best = B.h[k]; const tl = best - pt.T * I.atr[k]; if (tl > stop) stop = tl }
        else { if (B.l[k] < best) best = B.l[k]; const tl = best + pt.T * I.atr[k]; if (tl < stop) stop = tl }
      }
    }
    if (px === null) { k = Math.min(n - 1, k - 1); px = B.c[k] }
    const gross = s * (px / e - 1), hours = (B.t[k] - B.t[j]) / 3.6e6
    const cost = TAKER + slip + (maker ? MAKER : TAKER + slip) + FUND_H * Math.max(hours, 0)
    tr.push({ t: B.t[j], g: gross, net: gross - cost, r: I.regime[i], s })
    busy = k + 1
  }
  return tr
}
// daily sums -> t ; compact day table [day, n, gross, net]
export function daily(tr) {
  const m = new Map(); for (const x of tr) { const d = Math.floor(x.t / 864e5), a = m.get(d) ?? [d, 0, 0, 0]; a[1]++; a[2] += x.g; a[3] += x.net; m.set(d, a) }
  return [...m.values()].sort((a, b) => a[0] - b[0])
}
export function tstat(days) {
  if (days.length < 2) return 0
  const v = days.map(x => x[3]), mu = v.reduce((s, x) => s + x, 0) / v.length, sd = Math.sqrt(v.reduce((s, x) => s + (x - mu) ** 2, 0) / (v.length - 1))
  return sd > 0 ? mu / sd * Math.sqrt(v.length) : 0
}
export function stats(tr) {
  const n = tr.length; if (!n) return { n: 0, g: 0, net: 0, t: 0 }
  const days = daily(tr), net = tr.map(x => x.net), w = net.filter(x => x > 0), l = net.filter(x => x <= 0)
  const sw = w.reduce((s, x) => s + x, 0), sl = -l.reduce((s, x) => s + x, 0), tot = sw - sl
  let eq = 0, pk = 0, dd = 0; for (const d of days) { eq += d[3]; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq) }
  const dv = days.map(x => x[3]), mu = dv.reduce((s, x) => s + x, 0) / dv.length
  const sd = Math.sqrt(dv.reduce((s, x) => s + (x - mu) ** 2, 0) / Math.max(1, dv.length - 1)), dsd = Math.sqrt(dv.reduce((s, x) => s + Math.min(x, 0) ** 2, 0) / Math.max(1, dv.length))
  const spanD = Math.max(1, days[days.length - 1][0] - days[0][0] + 1), best = Math.max(...net)
  return {
    n, g: tr.reduce((s, x) => s + x.g, 0) / n * 1e4, net: tot / n * 1e4, t: tstat(days),
    pf: sl > 0 ? sw / sl : 99, wr: w.length / n, aw: w.length ? sw / w.length * 1e4 : 0, al: l.length ? sl / l.length * 1e4 : 0,
    sh: sd > 0 ? mu / sd * Math.sqrt(365) : 0, so: dsd > 0 ? mu / dsd * Math.sqrt(365) : 0, dd: dd * 100,
    cal: dd > 0 ? (tot / spanD * 365) / dd : 0, rb: n > 1 ? (tot - best) / (n - 1) * 1e4 : 0, tot: tot * 100,
  }
}
function mcLoss(days, R = 2000) {   // bootstrap of daily sums: share of resamples whose total is <= 0
  if (days.length < 5) return 1
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
  let bad = 0; for (let r = 0; r < R; r++) { let s = 0; for (let k = 0; k < days.length; k++) s += days[Math.floor(rnd() * days.length)][3]; if (s <= 0) bad++ }
  return bad / R
}
const wOf = (t, cuts) => { let w = 0; while (w < cuts.length && t >= cuts[w]) w++; return w }   // 0..5
function choose(g, byPt, ok) {   // plateau selection on trades passing ok(trade)
  const tt = {}
  for (const pt of g) { const tr = byPt[pt.key].filter(ok); tt[pt.key] = tr.length >= 20 ? tstat(daily(tr)) : -Infinity }
  let bestK = null, bestV = -Infinity
  for (const pt of g) {
    if (tt[pt.key] === -Infinity) continue
    const vals = [tt[pt.key], ...neighbours(g, pt).map(q => tt[q.key])].map(x => x === -Infinity ? -3 : x).sort((a, b) => a - b)
    const med = vals[Math.floor(vals.length / 2)]
    if (med > bestV) { bestV = med; bestK = pt.key }
  }
  return { key: bestK, plateau: bestV }
}
function evaluate(g, byPt, cuts, regime) {
  const inR = x => regime === undefined || x.r === regime
  const wfo = [], folds = []
  for (let f = 1; f <= 4; f++) {
    const sel = choose(g, byPt, x => inR(x) && wOf(x.t, cuts) < f)
    if (!sel.key) { folds.push(null); continue }
    const tr = byPt[sel.key].filter(x => inR(x) && wOf(x.t, cuts) === f); wfo.push(...tr)
    folds.push({ key: sel.key, n: tr.length, net: tr.reduce((s, x) => s + x.net, 0) })
  }
  const fin = choose(g, byPt, x => inR(x) && wOf(x.t, cuts) < 5)
  const hold = fin.key ? byPt[fin.key].filter(x => inR(x) && wOf(x.t, cuts) === 5) : []
  // sensitivity: holdout net of every grid point (the chosen one is flagged by key)
  const sens = regime === undefined ? Object.fromEntries(g.map(pt => { const h = byPt[pt.key].filter(x => wOf(x.t, cuts) === 5); return [pt.key, h.length ? h.reduce((s, x) => s + x.net, 0) / h.length * 1e4 : null] })) : undefined
  const oosAll = [...wfo, ...hold]
  return {
    final: fin.key, plateau: fin.plateau, folds, foldsPos: folds.filter(x => x && x.n > 0 && x.net > 0).length,
    wfo: stats(wfo), hold: stats(hold), oos: stats(oosAll), mc: mcLoss(daily(oosAll)),
    wfoDays: daily(wfo), holdDays: daily(hold), sens,
  }
}
export function seriesList() {
  const L = []
  for (const c of MAJORS) { for (const tf of [1, 3, 5, 15, 30]) L.push({ coin: c, tf, file: `${ROOT}/m1/${c}-1m.csv`, major: true }); for (const tf of [60, 240, 1440]) L.push({ coin: c, tf, file: `${ROOT}/h1/${c}-1h.csv`, major: true }) }
  const others = fs.readdirSync(`${ROOT}/m1`).filter(f => f.endsWith('-1m.csv') && fs.statSync(`${ROOT}/m1/${f}`).size > 0).map(f => f.replace('-1m.csv', '')).filter(c => !MAJORS.includes(c)).sort()
  for (const c of others) for (const tf of [15, 60]) L.push({ coin: c, tf, file: `${ROOT}/m1/${c}-1m.csv`, major: false })
  return L
}
if (process.argv[1] && process.argv[1].endsWith('engine.mjs')) {
  const K = +(process.env.SHARD ?? 0), M = +(process.env.NSHARD ?? 1), ONLY = process.env.ONLY?.split(','), all = seriesList().filter(s => !ONLY || ONLY.includes(`${s.coin}:${s.tf}`)), mine = all.filter((_, i) => i % M === K), res = []
  for (const S of mine) {
    const t0 = Date.now(), B = loadBars(S.file, S.tf); if (B.n < WARM + 500) continue
    const I = compute(B, S.tf), slip = S.major ? 0.0002 : 0.0005
    const span0 = B.t[WARM], span1 = B.t[B.n - 1], cuts = CUTS.map(x => span0 + x * (span1 - span0))
    const filters = { base: null, htf: htfDir(B, S.tf), cvd: Int8Array.from(I.cvd, x => x > 0 ? 1 : x < 0 ? -1 : 0) }
    const row = { coin: S.coin, tf: S.tf, major: S.major, bars: B.n, from: B.t[0], to: B.t[B.n - 1], fams: {} }
    for (const fam of Object.keys(FAMILIES)) {
      const F = FAMILIES[fam], g = grid(fam), sigs = {}
      for (let a = 0; a < F.p.length; a++) sigs[a] = entries(I, B, F, F.p[a])
      row.fams[fam] = {}
      for (const [fk, filt] of Object.entries(filters)) {
        if (fk === 'htf' && !filt) continue
        const byPt = {}; for (const pt of g) byPt[pt.key] = simulate(I, B, F, sigs[pt.a], pt, filt, slip)
        const ev = evaluate(g, byPt, cuts)
        if (fk === 'base') ev.regimes = [0, 1, 2, 3, 4].map(r => { const e = evaluate(g, byPt, cuts, r); return { final: e.final, plateau: e.plateau, wfo: e.wfo, hold: e.hold, holdDays: e.holdDays } })
        row.fams[fam][fk] = ev
      }
    }
    res.push(row); console.error(`${S.coin} ${S.tf}m bars ${B.n} ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  }
  fs.writeFileSync(`${OUTDIR}/v120-shard-${K}.json`, JSON.stringify(res))
}

// v100bt — the owner's 1m scalping specification (2026-10-02), measured as a research pipeline before any claim.
// Rules: shared/pro.ts (the SAME module the live paper runner imports). Data: REAL Binance USDT-M 1m klines
// (data.binance.vision archive), 10 coins, 2025-09-01 .. 2026-08-31; 5m / 15m are aggregated from those 1m bars
// (identical to Binance's own 5m/15m candles) and only CLOSED higher-timeframe bars are used. Funding: real settled rates.
// Run:  node --max-old-space-size=8192 --experimental-strip-types backtest/research/v100_pro_scalp.ts > status/pro-scalp-v100.txt
//
// Validation, fixed BEFORE reading any result:
//   holdout  = last 20% of the span, touched ONCE with the parameters chosen on the first 80%
//   walk-forward on the first 80%: in-sample 3 months -> test the next month, rolled monthly; parameters chosen on
//     in-sample net expectancy (R, after every cost, n >= 100) from the 36-point grid in PRO.grid only
//   overfit flag: OOS expectancy more than 30% below in-sample (or of the opposite sign)
//   REJECT unless the walk-forward OOS AND the holdout are both positive after costs.
import fs from 'node:fs'
import { PRO, aggregate, features, proCheck, openPos, stepBar, proSize, proSlip, type Bar, type Params } from '../../shared/pro.ts'

const DATA = new URL('../data/', import.meta.url).pathname
const START_EQ = 5000
const load = (s: string): Bar[] => {
  const out: Bar[] = []
  for (const l of fs.readFileSync(`${DATA}${s}-1m.csv`, 'utf8').split('\n')) {
    if (!l || l[0] < '0' || l[0] > '9') continue
    const f = l.split(','); out.push({ t: +f[0], open: +f[1], high: +f[2], low: +f[3], close: +f[4], vol: +f[5] })
  }
  return out
}
const loadFunding = (s: string): { t: number; r: number }[] => {
  const p = `${DATA}${s}-funding.csv`
  if (!fs.existsSync(p)) return []
  return fs.readFileSync(p, 'utf8').split('\n').filter((l) => l && l[0] >= '0' && l[0] <= '9').map((l) => { const f = l.split(','); return { t: +f[0], r: +f[2] } }).sort((a, b) => a.t - b.t)
}
const fundingSum = (fs_: { t: number; r: number }[], a: number, b: number) => { let lo = 0, hi = fs_.length; while (lo < hi) { const m = (lo + hi) >> 1; if (fs_[m].t <= a) lo = m + 1; else hi = m } let s = 0; for (let k = lo; k < fs_.length && fs_[k].t <= b; k++) s += fs_[k].r; return s }

interface Trade { coin: string; t0: number; t1: number; dir: 1 | -1; gross: number; net: number; rFrac: number; bars: number; why: string; adx: number; rv: number; up15btc: number; pk: string }
const pkey = (p: Params) => `N${p.breakoutN}_k${p.stopAtr}_T${p.targetR}_ts${p.timeStopBars}`
const GRID: Params[] = []
for (const breakoutN of PRO.grid.breakoutN) for (const stopAtr of PRO.grid.stopAtr) for (const targetR of PRO.grid.targetR) for (const timeStopBars of PRO.grid.timeStopBars) GRID.push({ breakoutN, stopAtr, targetR, timeStopBars })

// ── 1. candidate trades for every signal, every grid point (portfolio limits applied later, in time order) ──
const trades = new Map<string, Trade[]>(GRID.map((p) => [pkey(p), []]))
let span0 = Infinity, span1 = 0, minutes = 0, regimeMinutes = 0
const btcUp = new Map<number, number>()   // BTC 15m bias per minute, for per-regime reporting
for (const coin of PRO.coins) {
  const m1 = load(coin), m5 = aggregate(m1, 5), m15 = aggregate(m1, 15), F = features(m1, m5, m15), fund = loadFunding(coin), slip = proSlip(coin)
  span0 = Math.min(span0, m1[0].t); span1 = Math.max(span1, m1[m1.length - 1].t)
  if (coin === 'BTC') for (let i = 0; i < m1.length; i++) btcUp.set(Math.floor(m1[i].t / 60_000), F.up15[i])
  for (let i = 0; i < m1.length; i++) { minutes++; if (F.adx5[i] > PRO.adxMin && F.rv5[i] >= PRO.rvPctMin) regimeMinutes++ }
  for (const N of PRO.grid.breakoutN) {
    for (let i = 300; i < m1.length - 2; i++) {
      const sg = proCheck(m1, F, i, N); if (!sg.dir) continue
      const dir = sg.dir, e0 = m1[i + 1].open, entry = e0 * (1 + dir * slip)
      for (const p of GRID) {
        if (p.breakoutN !== N) continue
        const s = openPos(dir, entry, F.atr1[i], p)
        let ex: { px: number; why: string } | null = null, j = i + 1
        for (; j < m1.length && !ex; j++) ex = stepBar(s, m1[j], p)
        if (!ex) continue
        const t1 = m1[j - 1].t + 60_000, exitPx = ex.px * (1 - dir * slip)
        const gross = dir * (ex.px / e0 - 1), fr = dir * fundingSum(fund, m1[i + 1].t, t1)
        const net = dir * (exitPx / entry - 1) - 2 * PRO.fee - fr
        trades.get(pkey(p))!.push({ coin, t0: m1[i + 1].t, t1, dir, gross, net, rFrac: s.r / entry, bars: s.bars, why: ex.why, adx: F.adx5[i], rv: F.rv5[i], up15btc: 0, pk: pkey(p) })
      }
    }
  }
  console.error(`${coin}: ${m1.length} bars`)
}
for (const arr of trades.values()) { arr.sort((a, b) => a.t0 - b.t0); for (const t of arr) t.up15btc = btcUp.get(Math.floor(t.t0 / 60_000) - 1) ?? 0 }

// ── 2. portfolio: equity, risk-based size, <= 3 open, one per coin, -3R day stop, 3-loss cooldown ──
interface Book { n: number; wins: number; pnl: number; grossUsd: number; costUsd: number; sumR: number; sumGrossR: number; maxDD: number; eq: number; days: Map<number, number>; bars: number; flatMin: number; spanMin: number; list: (Trade & { usd: number; R: number })[] }
function portfolio(ts: Trade[], a: number, b: number): Book {
  let eq = START_EQ, peak = START_EQ, maxDD = 0
  const open: { coin: string; t1: number; usd: number; R: number }[] = [], closed: { t1: number; R: number }[] = []
  const bk: Book = { n: 0, wins: 0, pnl: 0, grossUsd: 0, costUsd: 0, sumR: 0, sumGrossR: 0, maxDD: 0, eq: 0, days: new Map(), bars: 0, flatMin: 0, spanMin: (b - a) / 60_000, list: [] }
  let busy: [number, number][] = []
  const settle = (until: number) => { open.sort((x, y) => x.t1 - y.t1); while (open.length && open[0].t1 <= until) { const o = open.shift()!; eq += o.usd; closed.push({ t1: o.t1, R: o.R }); peak = Math.max(peak, eq); maxDD = Math.max(maxDD, 1 - eq / peak); const d = Math.floor(o.t1 / 86_400_000); bk.days.set(d, (bk.days.get(d) ?? 0) + o.usd) } }
  for (const t of ts) {
    if (t.t0 < a || t.t0 >= b) continue
    settle(t.t0)
    if (open.length >= PRO.maxOpen || open.some((o) => o.coin === t.coin)) continue
    const day = Math.floor(t.t0 / 86_400_000)
    let dayR = 0; for (const c of closed) if (Math.floor(c.t1 / 86_400_000) === day) dayR += c.R
    if (dayR <= -PRO.dayLossR) continue
    const last = closed.slice(-PRO.lossStreak)
    if (last.length === PRO.lossStreak && last.every((c) => c.R < 0) && t.t0 < last[last.length - 1].t1 + PRO.cooldownMin * 60_000) continue
    const cash = eq - open.reduce((s, o) => s + 0, 0)   // margin is small at 10x; equity bounds the ticket through maxNotionalEq
    const notional = proSize(eq, cash, 1, t.rFrac), risk = eq * PRO.riskPct
    const usd = t.net * notional, R = usd / risk
    open.push({ coin: t.coin, t1: t.t1, usd, R }); busy.push([t.t0, t.t1])
    bk.n++; if (usd > 0) bk.wins++; bk.pnl += usd; bk.grossUsd += t.gross * notional; bk.costUsd += (t.gross - t.net) * notional; bk.sumR += R; bk.sumGrossR += t.gross * notional / risk; bk.bars += t.bars
    bk.list.push({ ...t, usd, R })
  }
  settle(Infinity); bk.maxDD = maxDD; bk.eq = eq
  // % of minutes with no position open
  busy.sort((x, y) => x[0] - y[0]); let cov = 0, ce = a
  for (const [s, e] of busy) { const s2 = Math.max(s, ce), e2 = Math.min(e, b); if (e2 > s2) { cov += e2 - s2; ce = e2 } }
  bk.flatMin = bk.spanMin - cov / 60_000
  return bk
}
function stats(bk: Book) {
  const L = bk.list, wins = L.filter((t) => t.usd > 0).reduce((s, t) => s + t.usd, 0), loss = -L.filter((t) => t.usd <= 0).reduce((s, t) => s + t.usd, 0)
  const days = [...bk.days.values()], dayN = Math.max(1, Math.round(bk.spanMin / 1440))
  const dr = Array.from({ length: dayN }, (_, k) => (days[k] ?? 0) / START_EQ)
  const m = dr.reduce((s, x) => s + x, 0) / dayN, sd = Math.sqrt(dr.reduce((s, x) => s + (x - m) ** 2, 0) / dayN), dd = Math.sqrt(dr.reduce((s, x) => s + Math.min(0, x) ** 2, 0) / dayN)
  return { n: bk.n, wr: bk.n ? bk.wins / bk.n : 0, pf: loss > 0 ? wins / loss : NaN, expR: bk.n ? bk.sumR / bk.n : 0, expGrossR: bk.n ? bk.sumGrossR / bk.n : 0, expUsd: bk.n ? bk.pnl / bk.n : 0,
    net: bk.pnl, gross: bk.grossUsd, cost: bk.costUsd, maxDD: bk.maxDD, sharpe: sd > 0 ? m / sd * Math.sqrt(365) : NaN, sortino: dd > 0 ? m / dd * Math.sqrt(365) : NaN,
    dur: bk.n ? bk.bars / bk.n : 0, flat: bk.spanMin ? bk.flatMin / bk.spanMin : 1, perDay: bk.n / dayN }
}
const f2 = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—')
const row = (label: string, s: ReturnType<typeof stats>) =>
  `${label.padEnd(30)} ${String(s.n).padStart(6)} ${f2(s.perDay, 1).padStart(5)} ${(f2(s.wr * 100, 1) + '%').padStart(6)} ${f2(s.pf).padStart(5)} ${f2(s.expGrossR, 3).padStart(7)} ${f2(s.expR, 3).padStart(7)} ${f2(s.expUsd).padStart(7)} ${f2(s.gross, 0).padStart(8)} ${f2(-s.cost, 0).padStart(8)} ${f2(s.net, 0).padStart(8)} ${(f2(s.maxDD * 100, 1) + '%').padStart(6)} ${f2(s.sharpe).padStart(6)} ${f2(s.sortino).padStart(6)} ${f2(s.dur, 1).padStart(5)} ${(f2(s.flat * 100, 1) + '%').padStart(6)}`
const HEAD = `${'set'.padEnd(30)} ${'trades'.padStart(6)} ${'/day'.padStart(5)} ${'WR'.padStart(6)} ${'PF'.padStart(5)} ${'grossR'.padStart(7)} ${'netR'.padStart(7)} ${'$/tr'.padStart(7)} ${'gross$'.padStart(8)} ${'costs$'.padStart(8)} ${'net$'.padStart(8)} ${'maxDD'.padStart(6)} ${'Sharpe'.padStart(6)} ${'Sortin'.padStart(6)} ${'bars'.padStart(5)} ${'flat'.padStart(6)}`
// trade-level selection metric (in-sample only): mean net R per candidate trade, n >= 100
function pick(a: number, b: number): Params | null {
  let best: Params | null = null, bv = -Infinity
  for (const p of GRID) { const ts = trades.get(pkey(p))!.filter((t) => t.t0 >= a && t.t0 < b); if (ts.length < 100) continue
    const v = ts.reduce((s, t) => s + t.net / t.rFrac, 0) / ts.length; if (v > bv) { bv = v; best = p } }
  return best
}
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
const out: string[] = []
const P = (s = '') => out.push(s)
const holdStart = span0 + 0.8 * (span1 - span0)
P(`v100bt — owner's 1m scalping spec, Binance USDT-M 1m, ${PRO.coins.length} coins, ${iso(span0)} .. ${iso(span1)}; holdout from ${iso(holdStart)}`)
P(`costs: taker ${PRO.fee * 1e4} bps/side on every fill, slippage ${f2(PRO.slipMajor * 1e4, 0)}/${f2(PRO.slipAlt * 1e4, 0)} bps/side (BTC,ETH / others), real funding; entry at the NEXT 1m open; stop before target inside a bar`)
P(`risk ${PRO.riskPct * 100}% of equity at the stop, notional <= ${PRO.maxNotionalEq}x equity, <= ${PRO.maxOpen} open, one per coin, -${PRO.dayLossR}R day stop, ${PRO.lossStreak} losses -> ${PRO.cooldownMin} min cooldown; start $${START_EQ}`)
P(`regime favourable (ADX5m>${PRO.adxMin} & rv pct>=${PRO.rvPctMin}) ${f2(regimeMinutes / minutes * 100, 1)}% of minutes; open interest / order flow DISABLED`)
P()
// ── 3. the whole grid on the development span (landscape; trade level, before portfolio limits) ──
P('A. GRID on the development span (first 80%), every candidate trade, before portfolio limits')
P(`${'params'.padEnd(26)} ${'n'.padStart(7)} ${'grossR'.padStart(8)} ${'costR'.padStart(8)} ${'netR'.padStart(8)} ${'WR'.padStart(6)}`)
for (const p of GRID) { const ts = trades.get(pkey(p))!.filter((t) => t.t0 < holdStart); if (!ts.length) continue
  const g = ts.reduce((s, t) => s + t.gross / t.rFrac, 0) / ts.length, nR = ts.reduce((s, t) => s + t.net / t.rFrac, 0) / ts.length
  P(`${pkey(p).padEnd(26)} ${String(ts.length).padStart(7)} ${f2(g, 3).padStart(8)} ${f2(g - nR, 3).padStart(8)} ${f2(nR, 3).padStart(8)} ${(f2(ts.filter((t) => t.net > 0).length / ts.length * 100, 1) + '%').padStart(6)}`) }
P()
// ── 4. walk-forward ──
P('B. WALK-FORWARD (in-sample 3 months -> test the next month), portfolio-level, each window from $5,000')
P(HEAD)
const mStart = (t: number) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) }
const addM = (t: number, k: number) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1) }
const oosLists: Trade[] = [], isStats: number[] = [], oosStats: number[] = []
for (let s = mStart(span0); addM(s, 3) < holdStart; s = addM(s, 1)) {
  const isA = s, isB = addM(s, 3), oA = isB, oB = Math.min(addM(s, 4), holdStart)
  const p = pick(isA, isB); if (!p) { P(`${iso(oA)} no parameter set with n>=100 in-sample`); continue }
  const ib = portfolio(trades.get(pkey(p))!, isA, isB), ob = portfolio(trades.get(pkey(p))!, oA, oB)
  const si = stats(ib), so = stats(ob)
  P(row(`IS ${iso(isA)} ${pkey(p)}`, si)); P(row(`  OOS ${iso(oA)}`, so))
  isStats.push(si.expR); oosStats.push(so.expR); oosLists.push(...ob.list)
}
const avg = (x: number[]) => x.reduce((s, v) => s + v, 0) / Math.max(1, x.length)
P()
const wfIS = avg(isStats), wfOOS = avg(oosStats)
P(`walk-forward mean expectancy: in-sample ${f2(wfIS, 3)}R, out-of-sample ${f2(wfOOS, 3)}R  ->  ${wfOOS < 0 || wfIS <= 0 || wfOOS < 0.7 * wfIS ? 'OVERFIT / NO EDGE flag' : 'within 30%'}`)
P()
// ── 5. holdout, once ──
const pH = pick(span0, holdStart)
P(`C. HOLDOUT (read once), parameters chosen on the whole development span: ${pH ? pkey(pH) : 'none'}`)
P(HEAD)
let hb: Book | null = null
if (pH) { const db = portfolio(trades.get(pkey(pH))!, span0, holdStart); P(row('development span (in-sample)', stats(db)))
  hb = portfolio(trades.get(pkey(pH))!, holdStart, span1 + 60_000); P(row('HOLDOUT (out-of-sample)', stats(hb))) }
P()
// ── 6. per-regime, out-of-sample trades only ──
P('D. PER REGIME, out-of-sample trades (walk-forward tests + holdout), net R per trade')
const oosAll = [...oosLists.map((t: any) => ({ ...t, src: 'wf' })), ...(hb?.list ?? []).map((t: any) => ({ ...t, src: 'hold' }))]
const grp = (name: string, f: (t: any) => string) => {
  const m = new Map<string, any[]>(); for (const t of oosAll) { const k = f(t); if (!m.has(k)) m.set(k, []); m.get(k)!.push(t) }
  for (const [k, v] of [...m.entries()].sort()) { const R = v.map((t) => t.net / t.rFrac); const mu = avg(R); P(`  ${name.padEnd(10)} ${k.padEnd(18)} n ${String(v.length).padStart(5)}  WR ${f2(v.filter((t) => t.net > 0).length / v.length * 100, 1).padStart(5)}%  gross ${f2(avg(v.map((t) => t.gross / t.rFrac)), 3).padStart(7)}R  net ${f2(mu, 3).padStart(7)}R`) }
}
grp('ADX5m', (t) => (t.adx < 25 ? '20-25' : t.adx < 35 ? '25-35' : '>=35'))
grp('vol pct', (t) => (t.rv < 0.6 ? '30-60%' : t.rv < 0.9 ? '60-90%' : '>=90%'))
grp('BTC 15m', (t) => (t.up15btc > 0 ? 'BTC above EMA200' : t.up15btc < 0 ? 'BTC below EMA200' : 'n/a'))
grp('side', (t) => (t.dir > 0 ? 'LONG' : 'SHORT'))
grp('exit', (t) => t.why)
grp('coin', (t) => t.coin)
P()
const hs = hb ? stats(hb) : null
const verdict = wfOOS > 0 && hs && hs.expR > 0 && wfOOS >= 0.7 * wfIS ? 'PASS (positive out-of-sample after all costs)' : 'REJECTED: expectancy is not positive out-of-sample after costs'
P(`VERDICT: ${verdict}`)
console.log(out.join('\n'))

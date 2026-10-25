// v125bt — does switching allocation by market state beat a fixed split? (owner: "a bot that changes strategy by market state")
// The capital-constrained portfolio simulator (backtest/portfolio.ts) with both live sleeves, DONCH4H and ROTA, on the 40 coins,
// 36 months of 1h bars, 6 windows, health kill-switch ON (the v83bt lesson). The market state is read from BTC 4h bars that had
// CLOSED before each step (no look-ahead): UP / DOWN = ADX(60 bars) >= 22 with close above / below its 50-bar mean, RANGE = ADX
// < 22; HIGHVOL = 30-bar realised vol in the top third of the previous 360 bars. Policies were written down before the run.
// SELECTION on windows 1-4 (IS), the chosen policy is read ONCE on windows 5-6 (OOS). The instrument's own noise floor (v87bt:
// ~10pp from a 0.1% nudge) is re-measured here and printed first.
// Usage: node --experimental-strip-types backtest/research/v125_regime.ts > status/regime-v125.txt  (needs backtest/data/<SYM>-1h.csv)
import * as fs from 'node:fs'
import * as S from '../../shared/strategy.ts'
import * as PF from '../portfolio.ts'

type Bar = S.Bar
const H4 = 14_400_000, NW = 6
const load = (sym: string): Bar[] => {
  let txt = ''
  try { txt = fs.readFileSync(`backtest/data/${sym}-1h.csv`, 'utf8') } catch { return [] }
  const out: Bar[] = []
  for (const l of txt.split('\n')) {
    if (!l || l[0] < '0' || l[0] > '9') continue
    const f = l.split(','); let t = +f[0]; if (t > 1e14) t = Math.floor(t / 1000)
    const b = { t, open: +f[1], high: +f[2], low: +f[3], close: +f[4], vol: +f[5] }
    if (b.close > 0) out.push(b)
  }
  return out.sort((a, b) => a.t - b.t)
}
const to4h = (a: Bar[]): Bar[] => {
  const out: Bar[] = []; let cur: Bar | null = null, k0 = -1
  for (const b of a) {
    const k = Math.floor(b.t / H4)
    if (k !== k0) { if (cur) out.push(cur); k0 = k; cur = { ...b, t: k * H4 } }
    else if (cur) { cur.high = Math.max(cur.high, b.high); cur.low = Math.min(cur.low, b.low); cur.close = b.close; cur.vol += b.vol }
  }
  if (cur) out.push(cur); return out
}

const data: Record<string, PF.CoinData> = {}
let tmin = Infinity, tmax = -Infinity
for (const c of S.CRYPTO_40) {
  const h = load(c); if (h.length < 500) continue
  data[c] = { b1: h, b4: to4h(h) }
  tmin = Math.min(tmin, h[0].t); tmax = Math.max(tmax, h[h.length - 1].t)
}
console.log(`v125bt — market-state allocation vs fixed. ${Object.keys(data).length} coins, ${new Date(tmin).toISOString().slice(0, 10)} .. ${new Date(tmax).toISOString().slice(0, 10)}`)

// ---- BTC market state per 4h boundary, from bars closed before it ----
type State = { trend: 'UP' | 'DOWN' | 'RANGE'; hv: boolean }
const btc = data.BTC.b4, stateAt = new Map<number, State>(), count: Record<string, number> = {}
for (let i = 400; i < btc.length; i++) {
  const done = btc.slice(i - 360, i)                         // bars that closed before btc[i].t
  const adx = S.calcADX(done.slice(-S.ADX_BARS))
  const sma = done.slice(-50).reduce((a, b) => a + b.close, 0) / 50
  const last = done[done.length - 1].close
  const vol = (k: number) => { const r: number[] = []; for (let j = k - 29; j <= k; j++) r.push(Math.log(done[j].close / done[j - 1].close)); const m = r.reduce((a, b) => a + b, 0) / r.length; return Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / r.length) }
  const vNow = vol(done.length - 1), hist: number[] = []
  for (let k = 30; k < done.length; k += 6) hist.push(vol(k))
  hist.sort((a, b) => a - b)
  const st: State = { trend: adx < S.ADX_GATE ? 'RANGE' : last > sma ? 'UP' : 'DOWN', hv: vNow >= hist[Math.floor(hist.length * 2 / 3)] }
  stateAt.set(btc[i].t, st); const key = st.trend + (st.hv ? '+HV' : ''); count[key] = (count[key] ?? 0) + 1
}
const total = Object.values(count).reduce((a, b) => a + b, 0)
console.log('BTC state share: ' + Object.entries(count).sort().map(([k, v]) => `${k} ${(100 * v / total).toFixed(0)}%`).join('  '))
const st = (t: number): State | null => stateAt.get(Math.floor(t / H4) * H4) ?? null

type Pol = (s: State) => { donch: number; rota: number }
const POL: [string, Pol | null][] = [
  ['FIXED (deployed split)', null],
  ['P1 breakouts up in trend, down in range', (s) => ({ donch: s.trend === 'RANGE' ? 0.5 : 1.5, rota: 1 })],
  ['P1-inverse (CONTROL)', (s) => ({ donch: s.trend === 'RANGE' ? 1.5 : 0.5, rota: 1 })],
  ['P2 breakouts OFF in range', (s) => ({ donch: s.trend === 'RANGE' ? 0 : 1, rota: 1 })],
  ['P3 ROTA up in trend, down in range', (s) => ({ donch: 1, rota: s.trend === 'RANGE' ? 0.6 : 1.3 })],
  ['P4 = P1 + P3', (s) => ({ donch: s.trend === 'RANGE' ? 0.5 : 1.5, rota: s.trend === 'RANGE' ? 0.6 : 1.3 })],
  ['P5 defend in BTC downtrend', (s) => ({ donch: 1, rota: s.trend === 'DOWN' ? 0.5 : 1 })],
  ['P6 halve both in high vol', (s) => ({ donch: s.hv ? 0.5 : 1, rota: s.hv ? 0.5 : 1 })],
  ['P7 high vol = breakouts up', (s) => ({ donch: s.hv ? 1.5 : 0.75, rota: 1 })],
]

const wSpan = (tmax - tmin) / NW, WARM = 100 * H4
const run = (pol: Pol | null, over: Partial<PF.SimConfig> = {}) => {
  const net: number[] = []; let trades = 0, dd = 0
  for (let w = 0; w < NW; w++) {
    const a = tmin + w * wSpan, b = tmin + (w + 1) * wSpan, from = Math.max(tmin + WARM, a)
    const regime = pol ? (t: number) => { const s = st(t); return s ? pol(s) : { donch: 1, rota: 1 } } : null
    const r = PF.runPortfolio(data, PF.defaultConfig({ killSwitch: true, regime, ...over }), from, b)
    const m = PF.metrics(r, 10_000, (b - from) / 86_400_000)
    net.push(m.netPct); trades += m.trades; dd = Math.max(dd, m.maxDD)
  }
  const is = net.slice(0, 4).reduce((a, b) => a + b, 0), oos = net.slice(4).reduce((a, b) => a + b, 0)
  return { net, trades, dd, is, oos, tot: is + oos }
}
const fmt = (tag: string, r: ReturnType<typeof run>) =>
  `  ${tag.padEnd(42)} ${String(r.trades).padStart(5)}  IS ${r.is.toFixed(1).padStart(6)}%  OOS ${r.oos.toFixed(1).padStart(6)}%  maxDD ${r.dd.toFixed(1).padStart(5)}%  ${r.net.map((x) => (x >= 0 ? '+' : '') + x.toFixed(1)).join(' ')}`

console.log('\n-- A. NOISE FLOOR: the FIXED split nudged by 0.1% (economically identical) --')
const noise: number[] = []
for (const m of [1, 0.999, 1.001, 0.998, 1.002]) { const r = run(null, { donchRiskMult: m }); noise.push(r.is); console.log(fmt(`FIXED donch x${m}`, r)) }
const spread = Math.max(...noise) - Math.min(...noise)
console.log(`  IS spread from noise alone: ${spread.toFixed(1)}pp -> a policy must beat FIXED by more than that in IS to count`)

console.log('\n-- B. POLICIES (3 bps slippage), selection on IS windows 1-4 --')
const res = POL.map(([tag, p]) => { const r = run(p); console.log(fmt(tag, r)); return { tag, r } })
const fixed = res[0].r, best = res.slice(1).filter((x) => !x.tag.includes('CONTROL')).sort((a, b) => b.r.is - a.r.is)[0]
console.log(`\n  IS winner: ${best.tag}  IS ${best.r.is.toFixed(1)}% vs FIXED ${fixed.is.toFixed(1)}% (margin ${(best.r.is - fixed.is).toFixed(1)}pp, noise ${spread.toFixed(1)}pp)`)
console.log(`  read ONCE out of sample: winner OOS ${best.r.oos.toFixed(1)}% vs FIXED ${fixed.oos.toFixed(1)}%`)
const ctl = res.find((x) => x.tag.includes('CONTROL'))!.r, p1 = res[1].r
console.log(`  control: P1 total ${p1.tot.toFixed(1)}% vs its inverse ${ctl.tot.toFixed(1)}% vs FIXED ${fixed.tot.toFixed(1)}% (if both beat FIXED, it is sizing, not state)`)

console.log('\n-- C. the IS winner and FIXED at 6 bps --')
console.log(fmt('FIXED @6bps', run(null, { slipBps: 6 })))
console.log(fmt(best.tag + ' @6bps', run(POL.find((x) => x[0] === best.tag)![1], { slipBps: 6 })))

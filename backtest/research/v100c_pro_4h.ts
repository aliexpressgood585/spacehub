// v100c — the PRO rule (shared/pro.ts, the same nine conditions) moved to the 4h ladder, as the owner asked on
// 2026-10-03 ("move to the 4 hour range and reset the account"). base 4h, mid 1d (EMA20/50, ADX14, realised-vol
// regime), high 1d EMA200, weekly-anchored VWAP, no funding-minute skip. Binance USDT-M 1h archive aggregated to 4h/1d,
// CRYPTO_40, 2020-09 .. 2026-08, real funding, taker 5 bps + slip 3/5 bps per side, entry at the NEXT 4h open, stop
// before target inside a bar. Live limits (<= 3 open, one per coin, no day stop). Pre-registered before reading:
// choose on the first 80% by mean net R per trade (n >= 200), read the last 20% ONCE; also print the chosen row per year.
// Run: node --max-old-space-size=8192 --experimental-strip-types backtest/research/v100c_pro_4h.ts > status/pro-4h-v100c.txt
import fs from 'node:fs'
import { PRO, TF, aggregate, features, proCheck, openPos, stepBar, proSize, proSlip, type Bar, type Params } from '../../shared/pro.ts'
import { CRYPTO_40 } from '../../shared/strategy.ts'
const DATA = new URL('../data/', import.meta.url).pathname, tf = TF['4h']
const file = (c: string) => (c === 'PEPE' ? '1000PEPE' : c)
const load = (s: string): Bar[] => fs.readFileSync(`${DATA}${file(s)}-1h.csv`, 'utf8').split('\n').filter((l) => l && l[0] >= '0' && l[0] <= '9').map((l) => { const f = l.split(','); return { t: +f[0], open: +f[1], high: +f[2], low: +f[3], close: +f[4], vol: +f[5] } })
const loadF = (s: string) => { const p = `${DATA}${file(s)}-funding.csv`; return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split('\n').filter((l) => l && l[0] >= '0' && l[0] <= '9').map((l) => { const f = l.split(','); return { t: +f[0], r: +f[2] } }).sort((a, b) => a.t - b.t) : [] }
const fsum = (F: { t: number; r: number }[], a: number, b: number) => { let s = 0; for (const x of F) { if (x.t > b) break; if (x.t > a) s += x.r } return s }
const GRID: Params[] = []
for (const breakoutN of [10, 20, 30]) for (const stopAtr of [1, 1.5, 2, 3]) for (const targetR of [2, 3, 5]) for (const timeStopBars of [6, 15, 30]) for (const beR of [1, 1.5])
  GRID.push({ breakoutN, stopAtr, targetR, timeStopBars, beR, tf: '4h', maxHoldBars: 60 })
const key = (p: Params) => `N${p.breakoutN}_k${p.stopAtr}_T${p.targetR}_ts${p.timeStopBars}_be${p.beR}`
interface Tr { coin: string; t0: number; t1: number; gross: number; net: number; rFrac: number; why: string }
const trades = new Map<string, Tr[]>(GRID.map((p) => [key(p), []]))
let span0 = Infinity, span1 = 0, sigN = 0
for (const coin of CRYPTO_40) {
  const h1 = load(coin), b4 = aggregate(h1, 240, 60), d1 = aggregate(h1, 1440, 60), F = features(b4, d1, d1, tf), fund = loadF(coin), slip = proSlip(coin)
  span0 = Math.min(span0, b4[0].t); span1 = Math.max(span1, b4[b4.length - 1].t)
  for (const N of [10, 20, 30]) for (let i = 60; i < b4.length - 2; i++) {
    const sg = proCheck(b4, F, i, N, tf); if (!sg.dir) continue
    sigN++
    const dir = sg.dir, e0 = b4[i + 1].open, entry = e0 * (1 + dir * slip)
    for (const p of GRID) {
      if (p.breakoutN !== N) continue
      const s = openPos(dir, entry, F.atr1[i], p); let ex = null, j = i + 1
      for (; j < b4.length && !ex; j++) ex = stepBar(s, b4[j], p)
      if (!ex) continue
      const t1 = b4[j - 1].t + 240 * 60_000, xp = ex.px * (1 - dir * slip)
      trades.get(key(p))!.push({ coin, t0: b4[i + 1].t, t1, gross: dir * (ex.px / e0 - 1), net: dir * (xp / entry - 1) - 2 * PRO.fee - dir * fsum(fund, b4[i + 1].t, t1), rFrac: s.r / entry, why: ex.why })
    }
  }
  console.error(coin, b4.length)
}
for (const a of trades.values()) a.sort((x, y) => x.t0 - y.t0)
function book(ts: Tr[], a: number, b: number) {
  let eq = 5000, peak = 5000, dd = 0, n = 0, w = 0, sR = 0, sG = 0; const open: { coin: string; t1: number; usd: number }[] = [], days = new Map<number, number>()
  const settle = (u: number) => { open.sort((x, y) => x.t1 - y.t1); while (open.length && open[0].t1 <= u) { const o = open.shift()!; eq += o.usd; peak = Math.max(peak, eq); dd = Math.max(dd, 1 - eq / peak); const d = Math.floor(o.t1 / 864e5); days.set(d, (days.get(d) ?? 0) + o.usd) } }
  for (const t of ts) { if (t.t0 < a || t.t0 >= b) continue; settle(t.t0)
    if (open.length >= PRO.maxOpen || open.some((o) => o.coin === t.coin)) continue
    const risk = eq * PRO.riskPct, notional = proSize(eq, eq, 1, t.rFrac), usd = t.net * notional
    open.push({ coin: t.coin, t1: t.t1, usd }); n++; if (usd > 0) w++; sR += usd / risk; sG += t.gross * notional / risk }
  settle(Infinity)
  const dv = [...days.values()], m = dv.reduce((s, x) => s + x, 0) / Math.max(1, dv.length), sd = Math.sqrt(dv.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, dv.length))
  return { n, wr: n ? w / n : 0, R: n ? sR / n : 0, G: n ? sG / n : 0, ret: eq / 5000 - 1, dd, t: sd > 0 ? m / sd * Math.sqrt(dv.length) : 0 }
}
const hold = span0 + 0.8 * (span1 - span0), f = (x: number, d = 3) => x.toFixed(d), out: string[] = []
const pr = (l: string, d: ReturnType<typeof book>) => out.push(`${l.padEnd(34)} ${String(d.n).padStart(6)} ${(f(d.wr * 100, 1) + '%').padStart(6)} ${f(d.G).padStart(7)} ${f(d.R).padStart(7)} ${(f(d.ret * 100, 1) + '%').padStart(8)} ${(f(d.dd * 100, 1) + '%').padStart(6)} ${f(d.t, 2).padStart(6)}`)
const H = `${'variant'.padEnd(34)} ${'n'.padStart(6)} ${'WR'.padStart(6)} ${'grossR'.padStart(7)} ${'netR'.padStart(7)} ${'return'.padStart(8)} ${'maxDD'.padStart(6)} ${'t'.padStart(6)}`
out.push(`v100c — PRO rule on the 4h ladder (base 4h / mid 1d / high 1d EMA200 / weekly VWAP), CRYPTO_40, ${new Date(span0).toISOString().slice(0, 10)} .. ${new Date(span1).toISOString().slice(0, 10)}, holdout from ${new Date(hold).toISOString().slice(0, 10)}`)
out.push(`signals (all N): ${sigN}; costs taker ${PRO.fee * 1e4} bps + slip 3/5 bps per side + real funding; 0.5% risk, <= 3 open, one per coin, no day stop; t on daily P&L`)
out.push('')
const rows = GRID.map((p) => ({ p, d: book(trades.get(key(p))!, span0, hold) })).filter((x) => x.d.n >= 200).sort((x, y) => y.d.R - x.d.R)
out.push('DEVELOPMENT (first 80%), top 20 by net R per trade'); out.push(H)
for (const x of rows.slice(0, 20)) pr(key(x.p), x.d)
out.push(`... ${rows.filter((x) => x.d.R > 0).length} of ${rows.length} rows net-positive on development`)
const pick = rows[0].p
out.push(''); out.push(`CHOSEN on development: ${key(pick)}`); out.push(H)
pr('development', rows[0].d); pr('HOLDOUT (read once)', book(trades.get(key(pick))!, hold, span1 + 1))
out.push(''); out.push('chosen, per calendar year (whole span)'); out.push(H)
for (let y = 2020; y <= 2026; y++) pr(String(y), book(trades.get(key(pick))!, Date.UTC(y, 0, 1), Date.UTC(y + 1, 0, 1)))
const ex = trades.get(key(pick))!.filter((t) => t.t0 >= hold), by = new Map<string, number[]>()
for (const t of ex) { if (!by.has(t.why)) by.set(t.why, []); by.get(t.why)!.push(t.net / t.rFrac) }
out.push(''); out.push('holdout exits (candidate trades): ' + [...by].map(([k, a]) => `${k} n${a.length} ${f(a.reduce((s, x) => s + x, 0) / a.length, 2)}R`).join(' | '))
console.log(out.join('\n'))

// v100b — PRO exit/stop variants after reviewing the first 59 live PRO trades (2026-10-02). ENTRIES UNCHANGED (live
// signal, N=15): only the stop distance, target, BE trigger and time stop vary, so no trade is filtered out.
// Live finding: median stop 0.42% of price; trades with stop < 0.3% paid 0.53R in fees alone, STOP exits averaged
// -1.64R. Hypothesis fixed before the run: a stop floored at a % of price cuts cost per R.
// Selection on the first 80% (portfolio net $, live limits: no day stop, no cooldown), holdout read once.
// Run: node --max-old-space-size=8192 --experimental-strip-types backtest/research/v100b_pro_exits.ts > status/pro-exits-v100b.txt
import fs from 'node:fs'
import { PRO, PRO_V100, aggregate, features, proCheck, proSize, proSlip, type Bar } from '../../shared/pro.ts'
const DATA = new URL('../data/', import.meta.url).pathname
const load = (s: string): Bar[] => fs.readFileSync(`${DATA}${s}-1m.csv`, 'utf8').split('\n').filter((l) => l && l[0] >= '0' && l[0] <= '9').map((l) => { const f = l.split(','); return { t: +f[0], open: +f[1], high: +f[2], low: +f[3], close: +f[4], vol: +f[5] } })
const loadF = (s: string) => { const p = `${DATA}${s}-funding.csv`; return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split('\n').filter((l) => l && l[0] >= '0' && l[0] <= '9').map((l) => { const f = l.split(','); return { t: +f[0], r: +f[2] } }).sort((a, b) => a.t - b.t) : [] }
const fsum = (F: { t: number; r: number }[], a: number, b: number) => { let s = 0; for (const x of F) if (x.t > a && x.t <= b) s += x.r; return s }
interface V { k: number; minPct: number; T: number; be: number; ts: number; trail: number }
const V0: V = { k: PRO_V100.stopAtr, minPct: 0, T: PRO_V100.targetR, be: 1, ts: PRO_V100.timeStopBars, trail: 1 }
const VS: V[] = []
if (process.env.FINAL) { VS.push({ k: 3, minPct: 0.02, T: 3, be: 1.5, ts: 15, trail: 1.5 }); VS.push(V0) }
else if (process.env.EXT) { for (const minPct of [0.008, 0.01, 0.012, 0.015, 0.02]) for (const ts of [15, 30, 60]) VS.push({ k: 3, minPct, T: 3, be: 1.5, ts, trail: 1.5 }); VS.push(V0) }
else for (const k of [1.2, 2, 3]) for (const minPct of [0, 0.004, 0.006, 0.008]) for (const T of [2, 3]) for (const ts of [15, 30, 60]) for (const be of [1, 1.5]) VS.push({ k, minPct, T, be, ts, trail: be })
const vk = (v: V) => `k${v.k}_min${(v.minPct * 100).toFixed(1)}%_T${v.T}_be${v.be}_ts${v.ts}`
interface Tr { coin: string; t0: number; t1: number; net: number; rFrac: number; why: string }
const trades = new Map<string, Tr[]>(VS.map((v) => [vk(v), []]))
let span0 = Infinity, span1 = 0
function sim(m1: Bar[], i: number, dir: 1 | -1, entry: number, r: number, v: V) {
  let stop = entry - dir * r, best = entry, hit = false; const target = entry + dir * v.T * r
  for (let j = i + 1, n = 0; j < m1.length; j++) {
    const b = m1[j]; n++
    if (dir * (b.open - stop) <= 0) return { px: b.open, why: 'STOP', j }
    if ((dir > 0 ? b.low : b.high) * dir <= stop * dir) return { px: stop, why: hit ? 'TRAIL' : 'STOP', j }
    if (dir * (b.open - target) >= 0) return { px: b.open, why: 'TARGET', j }
    if ((dir > 0 ? b.high : b.low) * dir >= target * dir) return { px: target, why: 'TARGET', j }
    const px = dir > 0 ? b.high : b.low; if (dir * (px - best) > 0) best = px
    if (dir * (best - entry) >= v.be * r) { hit = true; const ns = best - dir * v.trail * r; if (dir * (ns - stop) > 0) stop = ns }
    if (!hit && n >= v.ts) return { px: b.close, why: 'TIME', j }
    if (n >= PRO.maxHoldBars) return { px: b.close, why: 'MAXHOLD', j }
  }
  return null
}
for (const coin of PRO.coins) {
  const m1 = load(coin), F = features(m1, aggregate(m1, 5), aggregate(m1, 15)), fund = loadF(coin), slip = proSlip(coin)
  span0 = Math.min(span0, m1[0].t); span1 = Math.max(span1, m1[m1.length - 1].t)
  for (let i = 300; i < m1.length - 2; i++) {
    const sg = proCheck(m1, F, i, PRO_V100.breakoutN); if (!sg.dir) continue
    const dir = sg.dir, e0 = m1[i + 1].open, entry = e0 * (1 + dir * slip)
    for (const v of VS) {
      const r = Math.max(v.k * F.atr1[i], v.minPct * entry)
      const ex = sim(m1, i, dir, entry, r, v); if (!ex) continue
      const t1 = m1[ex.j].t + 60_000, xp = ex.px * (1 - dir * slip)
      const net = dir * (xp / entry - 1) - 2 * PRO.fee - dir * fsum(fund, m1[i + 1].t, t1)
      trades.get(vk(v))!.push({ coin, t0: m1[i + 1].t, t1, net, rFrac: r / entry, why: ex.why })
    }
  }
  console.error(coin)
}
for (const a of trades.values()) a.sort((x, y) => x.t0 - y.t0)
// portfolio with the LIVE limits: <= 3 open, one per coin, no day stop, no cooldown
function book(ts: Tr[], a: number, b: number) {
  let eq = 5000, peak = 5000, dd = 0, n = 0, wins = 0, sumR = 0; const open: { coin: string; t1: number; usd: number }[] = []
  const settle = (u: number) => { open.sort((x, y) => x.t1 - y.t1); while (open.length && open[0].t1 <= u) { eq += open.shift()!.usd; peak = Math.max(peak, eq); dd = Math.max(dd, 1 - eq / peak) } }
  for (const t of ts) { if (t.t0 < a || t.t0 >= b) continue; settle(t.t0)
    if (open.length >= PRO.maxOpen || open.some((o) => o.coin === t.coin)) continue
    const usd = t.net * proSize(eq, eq, 1, t.rFrac); open.push({ coin: t.coin, t1: t.t1, usd }); n++; if (usd > 0) wins++; sumR += usd / (eq * PRO.riskPct) }
  settle(Infinity); return { n, wr: n ? wins / n : 0, R: n ? sumR / n : 0, ret: eq / 5000 - 1, dd }
}
const hold = span0 + 0.8 * (span1 - span0)
const f = (x: number, d = 3) => x.toFixed(d)
const out: string[] = []
out.push(`v100b — PRO exit variants, entries unchanged (live signal N=${PRO_V100.breakoutN}), ${PRO.coins.length} coins 1m, holdout from ${new Date(hold).toISOString().slice(0, 10)}`)
out.push(`stop r = max(k x ATR14(1m), minPct x price); target T x r; at +be R the stop moves to BE and trails be R behind; out at ts bars if +be R not reached; live limits (no day stop / cooldown)`)
out.push('')
const rows = VS.map((v) => ({ v, d: book(trades.get(vk(v))!, span0, hold) })).sort((x, y) => y.d.R - x.d.R)   // every row compounds to ruin at these losses; rank by net R per trade
const live = rows.find((x) => vk(x.v) === vk(V0))!
out.push('DEVELOPMENT SPAN (first 80%), top 25 by net R per trade + the live config')
out.push(`${'variant'.padEnd(34)} ${'n'.padStart(6)} ${'WR'.padStart(6)} ${'netR'.padStart(7)} ${'return'.padStart(8)} ${'maxDD'.padStart(6)}`)
const pr = (l: string, d: ReturnType<typeof book>) => out.push(`${l.padEnd(34)} ${String(d.n).padStart(6)} ${(f(d.wr * 100, 1) + '%').padStart(6)} ${f(d.R).padStart(7)} ${(f(d.ret * 100, 1) + '%').padStart(8)} ${(f(d.dd * 100, 1) + '%').padStart(6)}`)
for (const x of rows.slice(0, 25)) pr(vk(x.v), x.d)
pr('LIVE ' + vk(V0), live.d)
out.push('')
out.push('by stop floor (best of the rest of the grid per floor, dev span):')
for (const m of [...new Set(VS.map((v) => v.minPct))].sort()) { const b = rows.find((x) => x.v.minPct === m)!; pr(`  floor ${(m * 100).toFixed(1)}% best ${vk(b.v)}`, b.d) }
const pick = rows[0].v
out.push('')
out.push(`HOLDOUT (read once): chosen ${vk(pick)} vs live ${vk(V0)}`)
pr('chosen dev', rows[0].d); pr('chosen HOLDOUT', book(trades.get(vk(pick))!, hold, span1 + 60_000))
pr('live dev', live.d); pr('live HOLDOUT', book(trades.get(vk(V0))!, hold, span1 + 60_000))
const ex = trades.get(vk(pick))!.filter((t) => t.t0 >= hold), by = new Map<string, number[]>()
for (const t of ex) { if (!by.has(t.why)) by.set(t.why, []); by.get(t.why)!.push(t.net / t.rFrac) }
out.push('holdout exits (chosen, candidate trades): ' + [...by].map(([k, a]) => `${k} n${a.length} ${f(a.reduce((s, x) => s + x, 0) / a.length, 2)}R`).join(' | '))
console.log(out.join('\n'))

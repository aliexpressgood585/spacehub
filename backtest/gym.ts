// v85.0 — "חדר הכושר": the offline gym for factory genomes. v85.1: three timeframes.
//
// The live factory (shared/factory.ts) judges ~100 random genomes on hours of live shadow
// votes, so most of what looks good there is luck and a verdict takes a day. This module
// runs the SAME genome vocabulary (same features(), same vote()) over 36 months of Binance
// USDT-M bars, walk-forward: four in-sample windows over the first 80% of the span, and the
// last 20% held out and read ONCE. A genome passes only if its best in-sample horizon is
// net-positive (of the round trip, plus funding for multi-hour holds) in EVERY in-sample
// window, IS t >= 1, AND its held-out t at that same horizon clears 2.0. Passers are written
// to status/gym-latest.json; the bot's factory reads that file and seeds them into live
// TRIAL, where they still have to earn oos and live the ordinary way. Nothing here trades.
//
// THREE SETS (v85.1): 5m bars / 10 coins (the fast vocabulary the live factory votes on,
// coarsened), 4h bars / 40 coins and 1d bars / 40 coins (where the only measured edge in
// this repo — ROTA's cross-sectional momentum — lives). 4h and 1d bars are aggregated from
// the 1h archive. A genome carries its timeframe (`tf`) so the live runner evaluates it on
// the same bars it was tested on.
//
// HONEST LIMITS, stated where they apply: (1) the 5m set is a coarser reading of the live
// 1m rule; (2) order-book imbalance, funding, basis and open interest have no usable
// archive here, so genomes that need them are not enumerated; (3) t is deflated for overlap
// (an h-bar return scored every bar overlaps h-1 neighbours) and for cross-coin correlation
// (rho 0.65 measured live, k = coins voting per event), the same two corrections the live
// learning applies — so these t values are comparable to the house league, and small.
import { FEATURES, features, genomeId, rng, type Genome, type Gene, type Tf } from '../shared/factory.ts'
import { xsScore } from '../shared/info.ts'
import { LEARN } from '../shared/swarm.ts'
import { CRYPTO_40 } from '../shared/strategy.ts'
import type { Bar } from '../shared/scalp.ts'

export interface GymSet { tf: Tf | '5m'; coins: readonly string[]; source: '5m' | '1h'; barMin: number; horizonsBars: readonly number[]; horizonsMin: readonly number[]; fundingBpPerHour: number }
export const GYM = {
  sets: [
    { tf: '5m', coins: ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'DOT'], source: '5m', barMin: 5, horizonsBars: [1, 3, 12, 48], horizonsMin: [5, 15, 60, 240], fundingBpPerHour: 0 },
    { tf: '4h', coins: CRYPTO_40, source: '1h', barMin: 240, horizonsBars: [1, 2, 6, 12, 42], horizonsMin: [240, 480, 1440, 2880, 10080], fundingBpPerHour: 0.125 },
    { tf: '1d', coins: CRYPTO_40, source: '1h', barMin: 1440, horizonsBars: [1, 2, 3, 7], horizonsMin: [1440, 2880, 4320, 10080], fundingBpPerHour: 0.125 },
  ] as readonly GymSet[],
  offlineNA: ['ob', 'fr', 'bs', 'oi'],          // no historical archive -> not enumerated
  window: 80,                                     // bars of history a feature may read
  isWindows: 4, oosShare: 0.2,
  minIsN: 300, minOosN: 100, isT: 1.0, oosT: 2.0,
  pairs: 1380, seed: 850,                         // singles are exhaustive; pairs are a fixed sample
  minSpanShare: 0.9,                              // abort if the data covers < 90% of the months asked
} as const

interface GStat { n: number; s: number; s2: number }
export interface GymRow {
  id: string; genome: Genome; tf: GymSet['tf']; testable: boolean
  h: number | null; n: number; k: number
  is: number[]; is_t: number | null; oos_bps: number | null; oos_t: number | null; oos_n: number
  pass: boolean; why: 'untestable' | 'thin' | 'window' | 'is_t' | 'oos' | 'pass'
}
export interface GymSetReport { tf: GymSet['tf']; coins: string[]; bars: number; from: string; to: string; counts: { tested: number; passed: number } }
export interface GymReport {
  ran_at: string; sha: string | null
  data: { months: number; windows: number; oos_share: number; sets: GymSetReport[] }
  counts: { tested: number; testable: number; passed: number }
  genomes: GymRow[]
}

function loadCSV(sym: string, interval: string): Bar[] {
  let txt = ''
  try { txt = Deno.readTextFileSync(`backtest/data/${sym}-${interval}.csv`) } catch { return [] }
  const out: Bar[] = []
  for (const line of txt.split('\n')) {
    if (!line || line[0] < '0' || line[0] > '9') continue
    const f = line.split(','); let t = Number(f[0]); if (t > 1e14) t = Math.floor(t / 1000)
    const b: Bar = { t, o: +f[1], h: +f[2], l: +f[3], c: +f[4], v: +f[5] }
    if (Number.isFinite(b.c) && b.c > 0) out.push(b)
  }
  out.sort((a, b) => a.t - b.t)
  const d: Bar[] = []; let last = -1
  for (const b of out) if (b.t !== last) { d.push(b); last = b.t }
  return d
}
// UTC-aligned aggregation of finer bars into `barMin` buckets; only COMPLETE buckets are kept
export function aggregate(bars: Bar[], fromMin: number, barMin: number): Bar[] {
  const per = Math.round(barMin / fromMin), ms = barMin * 60_000, out: Bar[] = []
  let cur: Bar | null = null, cnt = 0, bucket = -1
  for (const b of bars) {
    const k = Math.floor(b.t / ms)
    if (k !== bucket) { if (cur && cnt === per) out.push(cur); bucket = k; cur = { t: k * ms, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }; cnt = 1; continue }
    cur!.h = Math.max(cur!.h, b.h); cur!.l = Math.min(cur!.l, b.l); cur!.c = b.c; cur!.v += b.v; cnt++
  }
  if (cur && cnt === per) out.push(cur)
  return out
}
// round trip (fee 5 + slip 3, both sides) plus perpetual funding for the hours held
export const costFor = (set: GymSet, hIdx: number) => LEARN.costBps + set.fundingBpPerHour * (set.horizonsMin[hIdx] / 60)

// every single-condition genome over the testable features, then a fixed sample of pairs
export function enumerateGenomes(tf?: Tf): Genome[] {
  const na = new Set<string>(GYM.offlineNA)
  const genes: Gene[] = []
  for (const [k, ths] of Object.entries(FEATURES)) if (!na.has(k)) for (const th of ths) for (const dir of [1, -1] as const) genes.push([k, th, dir])
  const mk = (a: Gene, b?: Gene): Genome => (tf ? (b ? { a, b, tf } : { a, tf }) : (b ? { a, b } : { a }))
  const out: Genome[] = genes.map((a) => mk(a))
  const r = rng(GYM.seed), seen = new Set(out.map(genomeId))
  let guard = 0
  while (out.length < genes.length + GYM.pairs && guard++ < 100_000) {
    const a = genes[Math.floor(r() * genes.length)], b = genes[Math.floor(r() * genes.length)]
    if (a[0] === b[0]) continue
    const g = mk(a, b), id = genomeId(g), alt = genomeId(mk(b, a))
    if (seen.has(id) || seen.has(alt)) continue
    seen.add(id); out.push(g)
  }
  return out
}

const tOf = (st: GStat) => { if (st.n < 2) return 0; const m = st.s / st.n, v = Math.max(0, st.s2 / st.n - m * m), se = Math.sqrt(v / st.n); return se > 0 ? m / se : 0 }
// overlap (hb bars scored every bar) + cross-coin (k coins per event) deflation — same shape as swarm.hT
export const corrT = (st: GStat, hb: number, k: number) => tOf(st) / Math.sqrt(hb) / Math.sqrt(1 + (Math.max(1, k) - 1) * LEARN.rho)

export function runGymSet(set: GymSet, series: Bar[][], months: number): { rows: GymRow[]; report: GymSetReport } {
  const H = set.horizonsBars.length, W = GYM.isWindows + 1
  const btcIdx = Math.max(0, set.coins.indexOf('BTC'))
  const grid = series[btcIdx].map((b) => b.t)
  const N = grid.length
  if (!N) throw new Error(`gym ${set.tf}: no BTC data`)
  const spanDays = (grid[N - 1] - grid[0]) / 864e5
  if (spanDays < GYM.minSpanShare * months * 30.4) throw new Error(`gym ${set.tf}: data spans ${spanDays.toFixed(0)} days, asked ${months} months — refusing to report on a short fetch (v78bt lesson)`)
  const byT = series.map((s) => new Map(s.map((b) => [b.t, b])))
  const aligned = series.map((_, ci) => grid.map((t) => byT[ci].get(t)))
  const close = aligned.map((a) => Float64Array.from(a.map((b) => (b ? b.c : NaN))))

  const genomes = enumerateGenomes(set.tf === '5m' ? undefined : set.tf)
  const genes: Gene[] = []; const geneKey = (g: Gene) => `${g[0]}|${g[1]}|${g[2]}`; const geneIx = new Map<string, number>()
  const gi = (g: Gene) => { const k = geneKey(g); if (!geneIx.has(k)) { geneIx.set(k, genes.length); genes.push(g) } return geneIx.get(k)! }
  const ga = new Int32Array(genomes.length), gb = new Int32Array(genomes.length)
  genomes.forEach((g, i) => { ga[i] = gi(g.a); gb[i] = g.b ? gi(g.b) : -1 })
  const G = genomes.length, GN = genes.length
  const stat = new Float64Array(G * W * H * 3)       // [g][w][h][n,s,s2]
  const ev = new Float64Array(G * W)
  const gv = new Int8Array(GN), voted = new Uint8Array(G), votedList: number[] = []
  const wOf = (i: number) => Math.min(W - 1, Math.floor(i / (N * GYM.oosShare)))
  const cost = set.horizonsBars.map((_, h) => costFor(set, h))

  // per-coin rolling windows + daily closes for the cross-sectional momentum features
  const win: Bar[][] = set.coins.map(() => [])
  const dc: Map<number, number>[] = set.coins.map(() => new Map())
  let lastDay = -1; const xm: Record<string, number>[] = set.coins.map(() => ({}))

  for (let i = 0; i < N; i++) {
    const t = grid[i], day = Math.floor(t / 864e5), w = wOf(i)
    if (day !== lastDay) {
      lastDay = day; const d = day - 1
      for (const L of [7, 14, 28] as const) {
        const rets: Record<string, number> = {}
        set.coins.forEach((c, ci) => { const a = dc[ci].get(d), b = dc[ci].get(d - L); if (a && b) rets[c] = a / b - 1 })
        const sc = xsScore(rets)
        set.coins.forEach((c, ci) => { xm[ci][`xm${L}`] = sc[c] ?? NaN })
      }
    }
    for (let ci = 0; ci < set.coins.length; ci++) {
      const b = aligned[ci][i]; if (!b) continue
      const wv = win[ci]; wv.push(b); if (wv.length > GYM.window) wv.shift()
      dc[ci].set(day, b.c)
      if (wv.length < GYM.window) continue
      const f = features(wv, { xm7: xm[ci].xm7, xm14: xm[ci].xm14, xm28: xm[ci].xm28, btc: ci === btcIdx ? undefined : win[btcIdx] })
      for (let j = 0; j < GN; j++) { const g = genes[j], v = f[g[0]]; gv[j] = Number.isFinite(v) && Math.abs(v) >= g[1] ? g[2] * Math.sign(v) : 0 }
      const c0 = close[ci][i]
      for (let g = 0; g < G; g++) {
        const a = gv[ga[g]]; if (!a) continue
        if (gb[g] >= 0 && gv[gb[g]] !== a) continue
        if (!voted[g]) { voted[g] = 1; votedList.push(g); ev[g * W + w]++ }
        for (let h = 0; h < H; h++) {
          const c1 = close[ci][i + set.horizonsBars[h]]; if (!Number.isFinite(c1)) continue
          const e = a * (c1 / c0 - 1) * 1e4 - cost[h], p = ((g * W + w) * H + h) * 3
          stat[p]++; stat[p + 1] += e; stat[p + 2] += e * e
        }
      }
    }
    for (const g of votedList) voted[g] = 0
    votedList.length = 0
  }

  const rows: GymRow[] = genomes.map((genome, g) => {
    const id = genomeId(genome)
    const st = (w: number, h: number): GStat => { const p = ((g * W + w) * H + h) * 3; return { n: stat[p], s: stat[p + 1], s2: stat[p + 2] } }
    const pooled = (h: number): GStat => { let n = 0, s = 0, s2 = 0; for (let w = 0; w < GYM.isWindows; w++) { const x = st(w, h); n += x.n; s += x.s; s2 += x.s2 } return { n, s, s2 } }
    const evIs = (() => { let e = 0; for (let w = 0; w < GYM.isWindows; w++) e += ev[g * W + w]; return e })()
    const base: GymRow = { id, genome, tf: set.tf, testable: true, h: null, n: 0, k: 0, is: [], is_t: null, oos_bps: null, oos_t: null, oos_n: 0, pass: false, why: 'thin' }
    // choose the horizon on IN-SAMPLE evidence only
    let best = -1, bestT = -Infinity
    for (let h = 0; h < H; h++) { const p = pooled(h); if (p.n < GYM.minIsN) continue; const k = evIs > 0 ? p.n / evIs : set.coins.length; const tt = corrT(p, set.horizonsBars[h], k); if (tt > bestT) { bestT = tt; best = h } }
    if (best < 0) return { ...base, n: Math.round(pooled(0).n) }
    const p = pooled(best), k = evIs > 0 ? p.n / evIs : set.coins.length
    const is = Array.from({ length: GYM.isWindows }, (_, w) => { const x = st(w, best); return x.n ? +(x.s / x.n).toFixed(2) : 0 })
    const o = st(GYM.isWindows, best), kO = ev[g * W + GYM.isWindows] > 0 ? o.n / ev[g * W + GYM.isWindows] : k
    const oosT = o.n >= 2 ? +corrT(o, set.horizonsBars[best], kO).toFixed(2) : null
    const r: GymRow = { ...base, h: set.horizonsMin[best], n: Math.round(p.n), k: +k.toFixed(1), is, is_t: +bestT.toFixed(2), oos_bps: o.n ? +(o.s / o.n).toFixed(2) : null, oos_t: oosT, oos_n: Math.round(o.n), why: 'pass' }
    if (is.some((x) => !(x > 0))) return { ...r, why: 'window' }
    if (bestT < GYM.isT) return { ...r, why: 'is_t' }
    if (o.n < GYM.minOosN || oosT === null || oosT < GYM.oosT) return { ...r, why: 'oos' }
    return { ...r, pass: true }
  })
  return { rows, report: { tf: set.tf, coins: [...set.coins], bars: N, from: new Date(grid[0]).toISOString().slice(0, 10), to: new Date(grid[N - 1]).toISOString().slice(0, 10), counts: { tested: rows.length, passed: rows.filter((r) => r.pass).length } } }
}

export function runGym(months: number, sha: string | null = null, sets: readonly GymSet[] = GYM.sets): GymReport {
  const rows: GymRow[] = [], reps: GymSetReport[] = []
  for (const set of sets) {
    const series = set.coins.map((c) => set.source === '5m' ? loadCSV(c, '5m') : aggregate(loadCSV(c, '1h'), 60, set.barMin))
    const missing = set.coins.filter((_, i) => series[i].length < GYM.window * 4)
    if (missing.length > set.coins.length / 4) throw new Error(`gym ${set.tf}: ${missing.length}/${set.coins.length} coins without data (${missing.slice(0, 5).join(' ')})`)
    const r = runGymSet(set, series, months); rows.push(...r.rows); reps.push(r.report)
  }
  return {
    ran_at: new Date().toISOString(), sha,
    data: { months, windows: GYM.isWindows, oos_share: GYM.oosShare, sets: reps },
    counts: { tested: rows.length, testable: rows.filter((r) => r.testable).length, passed: rows.filter((r) => r.pass).length },
    genomes: rows,
  }
}

export function gymSummary(rep: GymReport): string {
  const L: string[] = []
  L.push(`GYM ${rep.ran_at} — ${rep.data.months}m, ${rep.data.windows} IS windows + ${Math.round(rep.data.oos_share * 100)}% OOS read once`)
  for (const s of rep.data.sets) {
    const rows = rep.genomes.filter((r) => r.tf === s.tf), by = (w: GymRow['why']) => rows.filter((r) => r.why === w).length
    L.push(`[${s.tf}] ${s.coins.length} coins, ${s.bars} bars ${s.from} → ${s.to}: tested ${rows.length} | thin ${by('thin')} | a negative IS window ${by('window')} | IS t<${GYM.isT} ${by('is_t')} | failed OOS ${by('oos')} | PASSED ${s.counts.passed}`)
  }
  const pass = rep.genomes.filter((r) => r.pass).sort((a, b) => (b.oos_t ?? 0) - (a.oos_t ?? 0))
  L.push(pass.length ? `PASSED (by held-out t):` : `PASSED: none — on this data no genome is net-positive in every window AND on the held-out 20%, at any timeframe. That is a result, not a failure of the gym.`)
  for (const r of pass.slice(0, 40)) L.push(`  ${r.id.padEnd(36)} ${r.tf.padEnd(3)} h=${String(r.h).padStart(5)}m  IS ${r.is.map((x) => x.toFixed(1).padStart(7)).join(' ')}  IS t ${r.is_t}  OOS ${r.oos_bps}bps t=${r.oos_t} (n=${r.oos_n}, k=${r.k})`)
  const near = rep.genomes.filter((r) => r.why === 'oos').sort((a, b) => (b.oos_t ?? -9) - (a.oos_t ?? -9)).slice(0, 8)
  if (near.length) { L.push(`near misses (all IS windows positive, OOS short of ${GYM.oosT}):`); for (const r of near) L.push(`  ${r.id.padEnd(36)} ${r.tf} h=${r.h}m  IS t ${r.is_t}  OOS ${r.oos_bps}bps t=${r.oos_t}`) }
  const allw = rep.genomes.filter((r) => r.why === 'is_t').sort((a, b) => (b.is_t ?? -9) - (a.is_t ?? -9)).slice(0, 5)
  if (allw.length) { L.push(`all IS windows positive but IS t < ${GYM.isT}:`); for (const r of allw) L.push(`  ${r.id.padEnd(36)} ${r.tf} h=${r.h}m  IS ${r.is.join(' / ')}  IS t ${r.is_t}  OOS t=${r.oos_t}`) }
  L.push(`NB a pass here only seeds the genome into LIVE TRIAL (on its own timeframe) — it still has to earn oos and live on live data.`)
  return L.join('\n')
}

export function gymMain(months: number) {
  const sha = Deno.env.get('GITHUB_SHA') ?? null
  const rep = runGym(months, sha)
  const txt = gymSummary(rep)
  console.log(txt)
  try { Deno.mkdirSync('status', { recursive: true }) } catch { /* exists */ }
  Deno.writeTextFileSync('status/gym-latest.json', JSON.stringify(rep))
  Deno.writeTextFileSync('status/gym-latest.txt', txt + '\n')
}

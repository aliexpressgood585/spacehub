// v85.0 — "חדר הכושר": the offline gym for factory genomes.
//
// The live factory (shared/factory.ts) judges ~100 random genomes on hours of live shadow
// votes, so most of what looks good there is luck and a verdict takes a day. This module
// runs the SAME genome vocabulary (same features(), same vote()) over 36 months of Binance
// USDT-M 5-minute bars for ten coins, walk-forward: four in-sample windows over the first
// 80% of the span, and the last 20% held out and read ONCE. A genome passes only if its
// best in-sample horizon is net-positive (of the 16bps round trip) in EVERY in-sample
// window AND its held-out t at that same horizon clears 2.0. Passers are written to
// status/gym-latest.json; the bot's factory reads that file and seeds them into live TRIAL,
// where they still have to earn oos and live the ordinary way. Nothing here trades.
//
// HONEST LIMITS, stated where they apply: (1) 5-minute bars, not the 1-minute bars the live
// factory votes on — the horizons are the same minutes (5/15/60/240) but a 5m feature is a
// coarser reading of the same rule; (2) ten coins, not forty; (3) order-book imbalance,
// funding, basis and open interest have no usable archive here, so genomes that need them
// are reported as UNTESTABLE, never as failed; (4) t is deflated for overlap (a 240-minute
// return scored every 5 minutes overlaps 47 neighbours) and for cross-coin correlation
// (rho 0.65 measured live, k = coins voting per event), the same two corrections the live
// learning applies — so these t values are comparable to the house league, and small.
import { FEATURES, features, genomeId, rng, type Genome, type Gene } from '../shared/factory.ts'
import { xsScore } from '../shared/info.ts'
import { LEARN } from '../shared/swarm.ts'
import type { Bar } from '../shared/scalp.ts'

export const GYM = {
  coins: ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'DOT'],
  offlineNA: ['ob', 'fr', 'bs', 'oi'],          // no historical archive -> untestable, not failed
  barsPerHorizon: [1, 3, 12, 48],                 // 5m bars = 5 / 15 / 60 / 240 minutes
  horizonsMin: [5, 15, 60, 240],
  window: 80,                                     // bars of history a feature may read
  isWindows: 4, oosShare: 0.2,
  minIsN: 300, minOosN: 100, isT: 1.0, oosT: 2.0,
  pairs: 1380, seed: 850,                         // singles are exhaustive; pairs are a fixed sample
  minSpanShare: 0.9,                              // abort if the data covers < 90% of the months asked
} as const

interface GStat { n: number; s: number; s2: number }
export interface GymRow {
  id: string; genome: Genome; testable: boolean
  h: number | null; n: number; k: number
  is: number[]; is_t: number | null; oos_bps: number | null; oos_t: number | null; oos_n: number
  pass: boolean; why: 'untestable' | 'thin' | 'window' | 'is_t' | 'oos' | 'pass'
}
export interface GymReport {
  ran_at: string; sha: string | null
  data: { coins: string[]; months: number; bars: number; from: string; to: string; windows: number; oos_share: number; timeframe: string }
  counts: { tested: number; testable: number; passed: number }
  genomes: GymRow[]
}

function loadCSV(sym: string): Bar[] {
  let txt = ''
  try { txt = Deno.readTextFileSync(`backtest/data/${sym}-5m.csv`) } catch { return [] }
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

// every single-condition genome over the testable features, then a fixed sample of pairs
export function enumerateGenomes(): Genome[] {
  const na = new Set<string>(GYM.offlineNA)
  const genes: Gene[] = []
  for (const [k, ths] of Object.entries(FEATURES)) if (!na.has(k)) for (const th of ths) for (const dir of [1, -1] as const) genes.push([k, th, dir])
  const out: Genome[] = genes.map((a) => ({ a }))
  const r = rng(GYM.seed), seen = new Set(out.map(genomeId))
  let guard = 0
  while (out.length < genes.length + GYM.pairs && guard++ < 100_000) {
    const a = genes[Math.floor(r() * genes.length)], b = genes[Math.floor(r() * genes.length)]
    if (a[0] === b[0]) continue
    const g: Genome = { a, b }, id = genomeId(g), alt = genomeId({ a: b, b: a })
    if (seen.has(id) || seen.has(alt)) continue
    seen.add(id); out.push(g)
  }
  return out
}

const tOf = (st: GStat) => { if (st.n < 2) return 0; const m = st.s / st.n, v = Math.max(0, st.s2 / st.n - m * m), se = Math.sqrt(v / st.n); return se > 0 ? m / se : 0 }
// overlap (hb bars scored every bar) + cross-coin (k coins per event) deflation — same shape as swarm.hT
export const corrT = (st: GStat, hb: number, k: number) => tOf(st) / Math.sqrt(hb) / Math.sqrt(1 + (Math.max(1, k) - 1) * LEARN.rho)

export function runGym(months: number, sha: string | null = null): GymReport {
  const H = GYM.barsPerHorizon.length, W = GYM.isWindows + 1
  const series = GYM.coins.map((c) => loadCSV(c))
  const btcIdx = 0
  const grid = series[btcIdx].map((b) => b.t)
  const N = grid.length
  if (!N) throw new Error('gym: no BTC 5m data in backtest/data')
  const spanDays = (grid[N - 1] - grid[0]) / 864e5
  if (spanDays < GYM.minSpanShare * months * 30.4) throw new Error(`gym: data spans ${spanDays.toFixed(0)} days, asked ${months} months — refusing to report on a short fetch (v78bt lesson)`)
  const byT = series.map((s) => new Map(s.map((b) => [b.t, b])))
  const aligned = series.map((_, ci) => grid.map((t) => byT[ci].get(t)))
  const close = aligned.map((a) => Float64Array.from(a.map((b) => (b ? b.c : NaN))))

  const genomes = enumerateGenomes()
  const genes: Gene[] = []; const geneKey = (g: Gene) => `${g[0]}|${g[1]}|${g[2]}`; const geneIx = new Map<string, number>()
  const gi = (g: Gene) => { const k = geneKey(g); if (!geneIx.has(k)) { geneIx.set(k, genes.length); genes.push(g) } return geneIx.get(k)! }
  const ga = new Int32Array(genomes.length), gb = new Int32Array(genomes.length)
  genomes.forEach((g, i) => { ga[i] = gi(g.a); gb[i] = g.b ? gi(g.b) : -1 })
  const G = genomes.length, GN = genes.length
  const stat = new Float64Array(G * W * H * 3)       // [g][w][h][n,s,s2]
  const ev = new Float64Array(G * W)
  const gv = new Int8Array(GN), voted = new Uint8Array(G), votedList: number[] = []
  const wOf = (i: number) => Math.min(W - 1, Math.floor(i / (N * GYM.oosShare)))

  // per-coin rolling windows + daily closes for the cross-sectional momentum features
  const win: Bar[][] = GYM.coins.map(() => [])
  const dc: Map<number, number>[] = GYM.coins.map(() => new Map())
  let lastDay = -1; const xm: Record<string, number>[] = GYM.coins.map(() => ({}))
  const cost = LEARN.costBps

  for (let i = 0; i < N; i++) {
    const t = grid[i], day = Math.floor(t / 864e5), w = wOf(i)
    if (day !== lastDay) {
      lastDay = day; const d = day - 1
      for (const L of [7, 14, 28] as const) {
        const rets: Record<string, number> = {}
        GYM.coins.forEach((c, ci) => { const a = dc[ci].get(d), b = dc[ci].get(d - L); if (a && b) rets[c] = a / b - 1 })
        const sc = xsScore(rets)
        GYM.coins.forEach((c, ci) => { xm[ci][`xm${L}`] = sc[c] ?? NaN })
      }
    }
    for (let ci = 0; ci < GYM.coins.length; ci++) {
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
          const c1 = close[ci][i + GYM.barsPerHorizon[h]]; if (!Number.isFinite(c1)) continue
          const e = a * (c1 / c0 - 1) * 1e4 - cost, p = ((g * W + w) * H + h) * 3
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
    const base = { id, genome, testable: true, h: null as number | null, n: 0, k: 0, is: [] as number[], is_t: null as number | null, oos_bps: null as number | null, oos_t: null as number | null, oos_n: 0, pass: false }
    // choose the horizon on IN-SAMPLE evidence only
    let best = -1, bestT = -Infinity
    for (let h = 0; h < H; h++) { const p = pooled(h); if (p.n < GYM.minIsN) continue; const k = evIs > 0 ? p.n / evIs : GYM.coins.length; const tt = corrT(p, GYM.barsPerHorizon[h], k); if (tt > bestT) { bestT = tt; best = h } }
    if (best < 0) return { ...base, n: pooled(0).n, why: 'thin' }
    const p = pooled(best), k = evIs > 0 ? p.n / evIs : GYM.coins.length
    const is = Array.from({ length: GYM.isWindows }, (_, w) => { const x = st(w, best); return x.n ? +(x.s / x.n).toFixed(2) : 0 })
    const o = st(GYM.isWindows, best), kO = ev[g * W + GYM.isWindows] > 0 ? o.n / ev[g * W + GYM.isWindows] : k
    const oosT = o.n >= 2 ? +corrT(o, GYM.barsPerHorizon[best], kO).toFixed(2) : null
    const r: GymRow = { ...base, h: GYM.horizonsMin[best], n: Math.round(p.n), k: +k.toFixed(1), is, is_t: +bestT.toFixed(2), oos_bps: o.n ? +(o.s / o.n).toFixed(2) : null, oos_t: oosT, oos_n: Math.round(o.n), why: 'pass' }
    if (is.some((x) => !(x > 0))) return { ...r, why: 'window' }
    if (bestT < GYM.isT) return { ...r, why: 'is_t' }
    if (o.n < GYM.minOosN || oosT === null || oosT < GYM.oosT) return { ...r, why: 'oos' }
    return { ...r, pass: true }
  })
  // genomes that need data we do not have offline are reported as untestable, never as failed
  const na = new Set<string>(GYM.offlineNA)
  for (const r of rows) if (na.has(r.genome.a[0]) || (r.genome.b && na.has(r.genome.b[0]))) { r.testable = false; r.why = 'untestable'; r.pass = false }
  const testable = rows.filter((r) => r.testable)
  return {
    ran_at: new Date().toISOString(), sha,
    data: { coins: [...GYM.coins], months, bars: N, from: new Date(grid[0]).toISOString().slice(0, 10), to: new Date(grid[N - 1]).toISOString().slice(0, 10), windows: GYM.isWindows, oos_share: GYM.oosShare, timeframe: '5m' },
    counts: { tested: rows.length, testable: testable.length, passed: rows.filter((r) => r.pass).length },
    genomes: rows,
  }
}

export function gymSummary(rep: GymReport): string {
  const L: string[] = []
  const by = (w: GymRow['why']) => rep.genomes.filter((r) => r.why === w).length
  L.push(`GYM ${rep.ran_at} — ${rep.data.coins.length} coins, ${rep.data.months}m of ${rep.data.timeframe} bars (${rep.data.bars} bars, ${rep.data.from} → ${rep.data.to}), ${rep.data.windows} IS windows + ${Math.round(rep.data.oos_share * 100)}% OOS read once`)
  L.push(`tested ${rep.counts.tested} genomes: ${rep.counts.testable} testable, ${by('untestable')} untestable offline (ob/fr/bs/oi)`)
  L.push(`  thin ${by('thin')} | a negative IS window ${by('window')} | IS t<${GYM.isT} ${by('is_t')} | failed OOS ${by('oos')} | PASSED ${rep.counts.passed}`)
  const pass = rep.genomes.filter((r) => r.pass).sort((a, b) => (b.oos_t ?? 0) - (a.oos_t ?? 0))
  L.push(pass.length ? `PASSED (by held-out t):` : `PASSED: none — on this data no genome is net-positive in every window AND on the held-out 20%. That is a result, not a failure of the gym.`)
  for (const r of pass.slice(0, 40)) L.push(`  ${r.id.padEnd(34)} h=${String(r.h).padStart(3)}m  IS ${r.is.map((x) => x.toFixed(1).padStart(6)).join(' ')}  IS t ${r.is_t}  OOS ${r.oos_bps}bps t=${r.oos_t} (n=${r.oos_n}, k=${r.k})`)
  const near = rep.genomes.filter((r) => r.why === 'oos').sort((a, b) => (b.oos_t ?? -9) - (a.oos_t ?? -9)).slice(0, 8)
  if (near.length) { L.push(`near misses (all IS windows positive, OOS short of ${GYM.oosT}):`); for (const r of near) L.push(`  ${r.id.padEnd(34)} h=${r.h}m  OOS ${r.oos_bps}bps t=${r.oos_t}`) }
  L.push(`NB 5m bars / 10 coins; a pass here only seeds the genome into LIVE TRIAL — it still has to earn oos and live on live data.`)
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

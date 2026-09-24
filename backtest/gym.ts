// v85.0 — "חדר הכושר": the offline gym for factory genomes. v85.1: three timeframes.
// v85.3: every Binance USDT-M perpetual trading today. v85.4: 15m bars, time gates, EVOLUTION.
//
// The live factory (shared/factory.ts) judges ~100 random genomes on hours of live shadow
// votes, so most of what looks good there is luck and a verdict takes a day. This module
// runs the SAME genome vocabulary (same features(), same vote(), same mutate()) over years
// of Binance USDT-M bars, walk-forward. The span is split THREE ways:
//   IS   — the first 60%, four equal windows: where a genome is judged and where EVOLUTION
//          picks its parents (all four windows net-positive, IS t >= 1);
//   VAL  — 60-80%: the mid-term exam every IS survivor sits; evolution may only breed from
//          genomes that also pass it (val t >= 1.5), so the search cannot fit the final;
//   FINAL— the last 20%, the held-out test, never used for selection: PASS = final t >= 2.
// Evolution (owner: "agents that improve and come back better until approved"): generation 0
// is every single-condition genome, a fixed sample of pairs and a sample of time-gated
// variants; each later generation breeds `childrenPerGen` mutants (threshold step, second
// condition, gate gained/changed/dropped) from the best parents so far, never re-testing an
// id. Every genome ever examined is reported with its generation and parent, so a passer's
// lineage is visible. HONEST: more generations = more looks at IS/VAL, which is why FINAL is
// separate and read once, and why the bar there stays 2.0.
//
// Costs: the 16bps round trip everywhere, plus perpetual funding 0.125bp/h for the hours a
// slow genome holds. t is deflated for overlap (sqrt of bars) and cross-coin correlation
// (rho 0.65 measured live, k = coins voting per event) — comparable to the house league.
// ob/fr/bs/oi have no archive here and are not enumerated. A pass only seeds the genome into
// LIVE TRIAL on its own timeframe; it still has to earn oos and live on live data.
import { FEATURES, features, genomeId, rng, mutate, fitGate, WHENS, WHEN_KEYS, whenOk, type Genome, type Gene, type Tf, type When } from '../shared/factory.ts'
import { xsScore } from '../shared/info.ts'
import { LEARN } from '../shared/swarm.ts'
import { CRYPTO_40 } from '../shared/strategy.ts'
import type { Bar } from '../shared/scalp.ts'

export interface GymSet { tf: Tf | '5m'; coins: readonly string[]; source: '5m' | '15m' | '1h'; barMin: number; horizonsBars: readonly number[]; horizonsMin: readonly number[]; fundingBpPerHour: number; maxMonths: number }
// v85.3: the slow sets run on EVERY USDT perpetual Binance Futures trades today with >= 2y of history when
// backtest/binance-perps.sh has produced the list (a coin joins the grid when its data starts; BTC is the
// grid); otherwise the pinned 40. Read at call time so the module stays importable without Deno.
export function slowCoins(): readonly string[] {
  try {
    const names = Deno.readTextFileSync('backtest/data/perps.txt').split('\n').map((s) => s.trim()).filter(Boolean)
    if (names.length >= 40 && names.includes('BTC')) return names
  } catch { /* no list: pinned universe */ }
  return CRYPTO_40
}
const PINNED = CRYPTO_40.map((c) => (c === 'PEPE' ? '1000PEPE' : c))   // Binance spelling for the fast sets
export const GYM = {
  sets: [
    { tf: '5m', coins: ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'DOT'], source: '5m', barMin: 5, horizonsBars: [1, 3, 12, 48], horizonsMin: [5, 15, 60, 240], fundingBpPerHour: 0, maxMonths: 36 },
    { tf: '15m', coins: PINNED, source: '15m', barMin: 15, horizonsBars: [1, 4, 16, 96], horizonsMin: [15, 60, 240, 1440], fundingBpPerHour: 0.125, maxMonths: 36 },
    { tf: '4h', coins: CRYPTO_40, source: '1h', barMin: 240, horizonsBars: [1, 2, 6, 12, 42], horizonsMin: [240, 480, 1440, 2880, 10080], fundingBpPerHour: 0.125, maxMonths: 120 },
    { tf: '1d', coins: CRYPTO_40, source: '1h', barMin: 1440, horizonsBars: [1, 2, 3, 7], horizonsMin: [1440, 2880, 4320, 10080], fundingBpPerHour: 0.125, maxMonths: 120 },
  ] as readonly GymSet[],
  offlineNA: ['ob'],                              // v85.5: funding, basis and OI now come from the archive; only the order book has none
  window: 80,                                     // bars of history a feature may read
  isWindows: 4, isShare: 0.6, valShare: 0.2,      // FINAL = the remaining 20%
  minIsN: 300, minValN: 80, minFinalN: 80, isT: 1.0, valT: 1.5, oosT: 2.0,
  pairs: 1380, whenSample: 240, seed: 850,        // generation 0
  gens: 4, childrenPerGen: 200, parentsPerGen: 60, // evolution
  minSpanShare: 0.9,                              // abort if the data covers < 90% of the months asked
} as const
const NW = GYM.isWindows + 2                      // 4 IS + VAL + FINAL
const VAL = GYM.isWindows, FIN = GYM.isWindows + 1

interface GStat { n: number; s: number; s2: number }
export type Why = 'thin' | 'window' | 'is_t' | 'val' | 'oos' | 'pass'
export interface GymRow {
  id: string; genome: Genome; tf: GymSet['tf']; testable: boolean; gen: number; parent: string | null
  h: number | null; n: number; k: number
  is: number[]; is_t: number | null; val_bps: number | null; val_t: number | null; val_n: number; oos_bps: number | null; oos_t: number | null; oos_n: number
  pass: boolean; why: Why
}
export interface GymSetReport { tf: GymSet['tf']; coins: string[]; bars: number; from: string; to: string; counts: { tested: number; passed: number }; gens: { gen: number; tested: number; is_pass: number; val_pass: number; passed: number }[] }
export interface GymReport {
  ran_at: string; sha: string | null
  data: { months: number; windows: number; is_share: number; val_share: number; oos_share: number; sets: GymSetReport[] }
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
    if (f.length > 9) { const q = +f[9], n = +f[8]; if (Number.isFinite(q)) b.q = q; if (Number.isFinite(n)) b.n = n }   // taker-buy base volume, trades
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
    if (k !== bucket) { if (cur && cnt === per) out.push(cur); bucket = k; cur = { t: k * ms, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, ...(b.q !== undefined ? { q: b.q } : {}), ...(b.n !== undefined ? { n: b.n } : {}) }; cnt = 1; continue }
    cur!.h = Math.max(cur!.h, b.h); cur!.l = Math.min(cur!.l, b.l); cur!.c = b.c; cur!.v += b.v; if (cur!.q !== undefined && b.q !== undefined) cur!.q += b.q; if (cur!.n !== undefined && b.n !== undefined) cur!.n += b.n; cnt++
  }
  if (cur && cnt === per) out.push(cur)
  return out
}
// ── v85.5 auxiliary archives (backtest/fetch-aux.sh): funding, premium index, metrics (OI, long/short ratios) ──
// Each is a time-sorted series; `at(t)` = last value known at t, `back(t, ms)` = value ms earlier.
export class TSeries {
  t: number[]; v: number[]
  constructor(t: number[], v: number[]) { this.t = t; this.v = v }
  private ix(tm: number): number { let lo = 0, hi = this.t.length - 1, ans = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (this.t[m] <= tm) { ans = m; lo = m + 1 } else hi = m - 1 } return ans }
  at(tm: number, maxAgeMs = Infinity): number { const i = this.ix(tm); return i >= 0 && tm - this.t[i] <= maxAgeMs ? this.v[i] : NaN }
  get size() { return this.t.length }
}
const readRows = (path: string): string[][] => { let txt = ''; try { txt = Deno.readTextFileSync(path) } catch { return [] } return txt.split('\n').filter((l) => l && l[0] >= '0' && l[0] <= '9').map((l) => l.split(',')) }
const sorted = (pairs: [number, number][]): TSeries => { pairs.sort((a, b) => a[0] - b[0]); const t: number[] = [], v: number[] = []; let last = -1; for (const [a, b] of pairs) { if (a === last || !Number.isFinite(b)) continue; t.push(a); v.push(b); last = a } return new TSeries(t, v) }
export interface Aux { fr?: TSeries; bs?: TSeries; oi?: TSeries; tls?: TSeries; tlr?: TSeries }
export function loadAux(sym: string): Aux {
  const out: Aux = {}
  const f = readRows(`backtest/data/${sym}-funding.csv`); if (f.length) out.fr = sorted(f.map((r) => [Number(r[0]), Number(r[2])] as [number, number]))          // calc_time, interval, rate (fraction per interval)
  const p = readRows(`backtest/data/${sym}-premium.csv`); if (p.length) out.bs = sorted(p.map((r) => [Number(r[0]), Number(r[4])] as [number, number]))          // 1h premium-index kline close (fraction)
  const m = readRows(`backtest/data/${sym}-metrics.csv`)
  if (m.length) {
    const tm = (r: string[]) => Date.parse(r[0].replace(' ', 'T') + 'Z')
    out.oi = sorted(m.map((r) => [tm(r), Number(r[2])] as [number, number]))
    out.tls = sorted(m.map((r) => [tm(r), Number(r[5]) - 1] as [number, number]))   // sum top-trader long/short ratio, centred at 0
    out.tlr = sorted(m.map((r) => [tm(r), Number(r[7]) - 1] as [number, number]))   // sum taker buy/sell volume ratio, centred at 0
  }
  return out
}
// round trip (fee 5 + slip 3, both sides) plus perpetual funding for the hours held
export const costFor = (set: GymSet, hIdx: number) => LEARN.costBps + set.fundingBpPerHour * (set.horizonsMin[hIdx] / 60)

const testableGenes = (): Gene[] => {
  const na = new Set<string>(GYM.offlineNA), genes: Gene[] = []
  for (const [k, ths] of Object.entries(FEATURES)) if (!na.has(k)) for (const th of ths) for (const dir of [1, -1] as const) genes.push([k, th, dir])
  return genes
}
const mk = (tf: Tf | undefined, a: Gene, b?: Gene, when?: When): Genome => ({ a, ...(b ? { b } : {}), ...(tf ? { tf } : {}), ...(when ? { when } : {}) })
// generation 0: every single-condition genome, a fixed sample of pairs, a sample of time-gated variants
export function enumerateGenomes(tf?: Tf): Genome[] {
  const genes = testableGenes()
  const out: Genome[] = genes.map((a) => mk(tf, a))
  const r = rng(GYM.seed), seen = new Set(out.map(genomeId))
  let guard = 0
  while (out.length < genes.length + GYM.pairs && guard++ < 100_000) {
    const a = genes[Math.floor(r() * genes.length)], b = genes[Math.floor(r() * genes.length)]
    if (a[0] === b[0]) continue
    const g = mk(tf, a, b), id = genomeId(g), alt = genomeId(mk(tf, b, a))
    if (seen.has(id) || seen.has(alt)) continue
    seen.add(id); out.push(g)
  }
  const base = out.length
  guard = 0
  while (out.length < base + GYM.whenSample && guard++ < 100_000) {
    const src = out[Math.floor(r() * base)], w = fitGate(tf, WHENS[WHEN_KEYS[Math.floor(r() * WHEN_KEYS.length)]].w)
    if (!w) continue   // v85.6: an hour gate on daily bars would breed an identical twin under another id
    const g = mk(tf, src.a, src.b, w), id = genomeId(g)
    if (seen.has(id)) continue
    seen.add(id); out.push(g)
  }
  return out
}

const tOf = (st: GStat) => { if (st.n < 2) return 0; const m = st.s / st.n, v = Math.max(0, st.s2 / st.n - m * m), se = Math.sqrt(v / st.n); return se > 0 ? m / se : 0 }
// overlap (hb bars scored every bar) + cross-coin (k coins per event) deflation — same shape as swarm.hT
export const corrT = (st: GStat, hb: number, k: number) => tOf(st) / Math.sqrt(hb) / Math.sqrt(1 + (Math.max(1, k) - 1) * LEARN.rho)

// ── the per-set cache: gene votes per (bar, coin) row, computed ONCE, then any genome is a cheap scan ──
interface Cache {
  set: GymSet; grid: number[]; N: number; genes: Gene[]; geneIx: Map<string, number>
  rows: number; rowCoin: Int16Array; rowBar: Int32Array; rowHour: Uint8Array; rowDow: Uint8Array; votes: Int8Array
  close: Float64Array[]; wOf: (i: number) => number; cost: number[]
}
function buildCache(set: GymSet, series: Bar[][], months: number): Cache {
  const btcIdx = Math.max(0, set.coins.indexOf('BTC'))
  const grid = series[btcIdx].map((b) => b.t), N = grid.length
  if (!N) throw new Error(`gym ${set.tf}: no BTC data`)
  const spanDays = (grid[N - 1] - grid[0]) / 864e5
  if (spanDays < GYM.minSpanShare * months * 30.4) throw new Error(`gym ${set.tf}: data spans ${spanDays.toFixed(0)} days, asked ${months} months — refusing to report on a short fetch (v78bt lesson)`)
  // align every coin to BTC's grid with a pointer walk (both sorted) — a Map per coin was the memory
  // that killed the 289-coin / 72-month run (v85.3 run #101 died silently at load)
  const aligned: (Bar | undefined)[][] = series.map((s) => { const out: (Bar | undefined)[] = new Array(N); let j = 0; for (let i = 0; i < N; i++) { const t = grid[i]; while (j < s.length && s[j].t < t) j++; out[i] = j < s.length && s[j].t === t ? s[j] : undefined } return out })
  const close = aligned.map((a) => { const c = new Float64Array(N); for (let i = 0; i < N; i++) c[i] = a[i] ? a[i]!.c : NaN; return c })
  const genes = testableGenes(), geneIx = new Map(genes.map((g, i) => [`${g[0]}|${g[1]}|${g[2]}`, i])), GN = genes.length
  let rows = 0; for (let ci = 0; ci < set.coins.length; ci++) for (let i = GYM.window - 1; i < N; i++) if (aligned[ci][i]) rows++
  const rowCoin = new Int16Array(rows), rowBar = new Int32Array(rows), rowHour = new Uint8Array(rows), rowDow = new Uint8Array(rows), votes = new Int8Array(rows * GN)
  const win: Bar[][] = set.coins.map(() => []), dc: Map<number, number>[] = set.coins.map(() => new Map())
  let lastDay = -1; const xm: Record<string, number>[] = set.coins.map(() => ({}))
  const aux = set.coins.map((c) => loadAux(c)), barMs = set.barMin * 60_000, back4h = Math.max(1, Math.round(240 / set.barMin)), back1d = Math.max(1, Math.round(1440 / set.barMin))
  const fresh = Math.max(barMs * 2, 3 * 3600_000)   // an aux value older than this is treated as missing
  let r = 0
  for (let i = 0; i < N; i++) {
    const t = grid[i], day = Math.floor(t / 864e5), d0 = new Date(t), hr = d0.getUTCHours(), dw = d0.getUTCDay()
    if (day !== lastDay) {
      lastDay = day; const d = day - 1
      for (const L of [7, 14, 28, 60, 90] as const) {
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
      const A = aux[ci], c0 = close[ci][i], c4 = i >= back4h ? close[ci][i - back4h] : NaN, c1d = i >= back1d ? close[ci][i - back1d] : NaN
      const oiNow = A.oi ? A.oi.at(t, fresh) : NaN, oi4 = A.oi ? A.oi.at(t - 4 * 3600_000, fresh) : NaN, oi1d = A.oi ? A.oi.at(t - 24 * 3600_000, fresh) : NaN
      const f = features(wv, {
        xm7: xm[ci].xm7, xm14: xm[ci].xm14, xm28: xm[ci].xm28, xm60: xm[ci].xm60, xm90: xm[ci].xm90, btc: ci === btcIdx ? undefined : win[btcIdx],
        funding: A.fr ? (Number.isFinite(A.fr.at(t, 9 * 3600_000)) ? A.fr.at(t, 9 * 3600_000) : null) : null, premium: A.bs ? A.bs.at(t, fresh) : undefined,
        doi: oiNow > 0 && oi4 > 0 ? oiNow / oi4 - 1 : NaN, dpx: c4 > 0 ? c0 / c4 - 1 : NaN, doi1d: oiNow > 0 && oi1d > 0 ? oiNow / oi1d - 1 : NaN,
        tls: A.tls ? A.tls.at(t, fresh) : undefined, tlr: A.tlr ? A.tlr.at(t, fresh) : undefined,
      })
      rowCoin[r] = ci; rowBar[r] = i; rowHour[r] = hr; rowDow[r] = dw
      const base = r * GN
      for (let j = 0; j < GN; j++) { const g = genes[j], v = f[g[0]]; votes[base + j] = Number.isFinite(v) && Math.abs(v) >= g[1] ? g[2] * Math.sign(v) : 0 }
      r++
    }
  }
  const isW = N * GYM.isShare / GYM.isWindows
  const wOf = (i: number) => i < N * GYM.isShare ? Math.min(GYM.isWindows - 1, Math.floor(i / isW)) : i < N * (GYM.isShare + GYM.valShare) ? VAL : FIN
  return { set, grid, N, genes, geneIx, rows: r, rowCoin, rowBar, rowHour, rowDow, votes, close, wOf, cost: set.horizonsBars.map((_, h) => costFor(set, h)) }
}
// hour/day gate as a 24x7 mask so the scan stays a table lookup
const gateMask = (w?: When): Uint8Array | null => {
  if (!w) return null
  const m = new Uint8Array(24 * 7); for (let h = 0; h < 24; h++) for (let d = 0; d < 7; d++) m[h * 7 + d] = whenOk(w, Date.UTC(2024, 0, 7 + d, h)) ? 1 : 0   // 2024-01-07 is a Sunday
  return m
}
function evalGenome(C: Cache, genome: Genome, gen: number, parent: string | null): GymRow {
  const { set } = C, H = set.horizonsBars.length, GN = C.genes.length
  const ai = C.geneIx.get(`${genome.a[0]}|${genome.a[1]}|${genome.a[2]}`), bi = genome.b ? C.geneIx.get(`${genome.b[0]}|${genome.b[1]}|${genome.b[2]}`) : -1
  const id = genomeId(genome)
  const base: GymRow = { id, genome, tf: set.tf, testable: true, gen, parent, h: null, n: 0, k: 0, is: [], is_t: null, val_bps: null, val_t: null, val_n: 0, oos_bps: null, oos_t: null, oos_n: 0, pass: false, why: 'thin' }
  if (ai === undefined || bi === undefined) return { ...base, testable: false }
  const stat = new Float64Array(NW * H * 3), ev = new Float64Array(NW), mask = gateMask(genome.when)
  let lastBar = -1, lastW = 0
  for (let r = 0; r < C.rows; r++) {
    const a = C.votes[r * GN + ai]; if (!a) continue
    if (bi >= 0 && C.votes[r * GN + bi] !== a) continue
    if (mask && !mask[C.rowHour[r] * 7 + C.rowDow[r]]) continue
    const i = C.rowBar[r], ci = C.rowCoin[r], w = C.wOf(i)
    if (i !== lastBar) { lastBar = i; lastW = w; ev[w]++ }
    const c0 = C.close[ci][i]
    for (let h = 0; h < H; h++) {
      const c1 = C.close[ci][i + set.horizonsBars[h]]; if (!Number.isFinite(c1)) continue
      const e = a * (c1 / c0 - 1) * 1e4 - C.cost[h], p = (lastW * H + h) * 3
      stat[p]++; stat[p + 1] += e; stat[p + 2] += e * e
    }
  }
  const st = (w: number, h: number): GStat => { const p = (w * H + h) * 3; return { n: stat[p], s: stat[p + 1], s2: stat[p + 2] } }
  const pooled = (h: number): GStat => { let n = 0, s = 0, s2 = 0; for (let w = 0; w < GYM.isWindows; w++) { const x = st(w, h); n += x.n; s += x.s; s2 += x.s2 } return { n, s, s2 } }
  let evIs = 0; for (let w = 0; w < GYM.isWindows; w++) evIs += ev[w]
  // the horizon is chosen on IN-SAMPLE evidence only
  let best = -1, bestT = -Infinity
  for (let h = 0; h < H; h++) { const p = pooled(h); if (p.n < GYM.minIsN) continue; const k = evIs > 0 ? p.n / evIs : set.coins.length; const tt = corrT(p, set.horizonsBars[h], k); if (tt > bestT) { bestT = tt; best = h } }
  if (best < 0) return { ...base, n: Math.round(pooled(0).n) }
  const p = pooled(best), k = evIs > 0 ? p.n / evIs : set.coins.length, hb = set.horizonsBars[best]
  const is = Array.from({ length: GYM.isWindows }, (_, w) => { const x = st(w, best); return x.n ? +(x.s / x.n).toFixed(2) : 0 })
  const v = st(VAL, best), kV = ev[VAL] > 0 ? v.n / ev[VAL] : k, vT = v.n >= 2 ? +corrT(v, hb, kV).toFixed(2) : null
  const o = st(FIN, best), kO = ev[FIN] > 0 ? o.n / ev[FIN] : k, oT = o.n >= 2 ? +corrT(o, hb, kO).toFixed(2) : null
  const r: GymRow = { ...base, h: set.horizonsMin[best], n: Math.round(p.n), k: +k.toFixed(1), is, is_t: +bestT.toFixed(2), val_bps: v.n ? +(v.s / v.n).toFixed(2) : null, val_t: vT, val_n: Math.round(v.n), oos_bps: o.n ? +(o.s / o.n).toFixed(2) : null, oos_t: oT, oos_n: Math.round(o.n), why: 'pass' }
  if (is.some((x) => !(x > 0))) return { ...r, why: 'window' }
  if (bestT < GYM.isT) return { ...r, why: 'is_t' }
  if (v.n < GYM.minValN || vT === null || vT < GYM.valT) return { ...r, why: 'val' }
  if (o.n < GYM.minFinalN || oT === null || oT < GYM.oosT) return { ...r, why: 'oos' }
  return { ...r, pass: true }
}
const rank = (r: GymRow) => (r.why === 'pass' || r.why === 'oos' ? 2 : r.why === 'val' ? 1 : 0) * 1000 + (r.is_t ?? -99)   // FINAL never ranks parents: 'oos' and 'pass' tie
export function runGymSet(set: GymSet, series: Bar[][], months: number, log: (s: string) => void = () => {}): { rows: GymRow[]; report: GymSetReport } {
  const C = buildCache(set, series, months)
  log(`[${set.tf}] cache: ${C.rows.toLocaleString()} rows x ${C.genes.length} genes, ${set.coins.length} coins`)
  const seen = new Set<string>(), rows: GymRow[] = [], gens: GymSetReport['gens'] = []
  const evalAll = (gs: { g: Genome; parent: string | null }[], gen: number) => {
    const out: GymRow[] = []
    for (const { g, parent } of gs) { const id = genomeId(g); if (seen.has(id)) continue; seen.add(id); out.push(evalGenome(C, g, gen, parent)) }
    rows.push(...out)
    gens.push({ gen, tested: out.length, is_pass: out.filter((r) => r.why === 'val' || r.why === 'oos' || r.why === 'pass').length, val_pass: out.filter((r) => r.why === 'oos' || r.why === 'pass').length, passed: out.filter((r) => r.pass).length })
    log(`[${set.tf}] gen ${gen}: ${out.length} tested, ${gens[gens.length - 1].is_pass} pass IS, ${gens[gens.length - 1].val_pass} pass VAL, ${gens[gens.length - 1].passed} PASS`)
    return out
  }
  evalAll(enumerateGenomes(set.tf === '5m' ? undefined : set.tf).map((g) => ({ g, parent: null })), 0)
  for (let gen = 1; gen <= GYM.gens; gen++) {
    const parents = [...rows].sort((a, b) => rank(b) - rank(a)).filter((r) => r.h !== null).slice(0, GYM.parentsPerGen)
    if (!parents.length) break
    const r = rng(GYM.seed + gen * 7919), kids: { g: Genome; parent: string | null }[] = [], ids = new Set<string>()
    let guard = 0
    while (kids.length < GYM.childrenPerGen && guard++ < 20_000) {
      const p = parents[Math.floor(r() * parents.length)], g = mutate(p.genome, r), id = genomeId(g)
      if (seen.has(id) || ids.has(id)) continue
      ids.add(id); kids.push({ g, parent: p.id })
    }
    if (!kids.length) break
    evalAll(kids, gen)
  }
  return { rows, report: { tf: set.tf, coins: [...set.coins], bars: C.N, from: new Date(C.grid[0]).toISOString().slice(0, 10), to: new Date(C.grid[C.N - 1]).toISOString().slice(0, 10), counts: { tested: rows.length, passed: rows.filter((r) => r.pass).length }, gens } }
}

export function runGym(months: number, sha: string | null = null, sets0: readonly GymSet[] = GYM.sets, log: (s: string) => void = () => {}): GymReport {
  const rows: GymRow[] = [], reps: GymSetReport[] = []
  const wide = slowCoins()
  const sets = sets0.map((s) => (s.source === '1h' ? { ...s, coins: wide } : s))
  for (const set0 of sets) {
    const m = Math.min(months, set0.maxMonths)
    const all = set0.coins.map((c) => set0.source === '1h' ? aggregate(loadCSV(c, '1h'), 60, set0.barMin) : loadCSV(c, set0.source))
    // a coin with too little data is dropped from THIS set (young perpetuals), never a reason to abort
    const keep = set0.coins.map((_, i) => all[i].length >= GYM.window * 4)
    const set: GymSet = { ...set0, coins: set0.coins.filter((_, i) => keep[i]) }, series = all.filter((_, i) => keep[i])
    if (set.coins.length < 8 || !set.coins.includes('BTC')) throw new Error(`gym ${set.tf}: only ${set.coins.length} coins with data (need BTC + 8)`)
    const r = runGymSet(set, series, m, log); rows.push(...r.rows); reps.push(r.report)
  }
  return {
    ran_at: new Date().toISOString(), sha,
    data: { months, windows: GYM.isWindows, is_share: GYM.isShare, val_share: GYM.valShare, oos_share: 1 - GYM.isShare - GYM.valShare, sets: reps },
    counts: { tested: rows.length, testable: rows.filter((r) => r.testable).length, passed: rows.filter((r) => r.pass).length },
    genomes: rows,
  }
}

export function lineage(rep: GymReport, id: string): string[] {
  const byId = new Map(rep.genomes.map((r) => [r.id, r])), out: string[] = []
  let cur = byId.get(id); let guard = 0
  while (cur && guard++ < 20) { out.push(`${cur.id} (gen ${cur.gen}${cur.is_t !== null ? `, IS t ${cur.is_t}` : ''})`); cur = cur.parent ? byId.get(cur.parent) : undefined }
  return out
}
export function gymSummary(rep: GymReport): string {
  const L: string[] = []
  L.push(`GYM ${rep.ran_at} — up to ${rep.data.months}m; IS ${Math.round(rep.data.is_share * 100)}% in ${rep.data.windows} windows | VAL ${Math.round(rep.data.val_share * 100)}% (t>=${GYM.valT}) | FINAL ${Math.round(rep.data.oos_share * 100)}% read once (t>=${GYM.oosT}); ${GYM.gens} generations of evolution`)
  for (const s of rep.data.sets) {
    const rows = rep.genomes.filter((r) => r.tf === s.tf), by = (w: Why) => rows.filter((r) => r.why === w).length
    L.push(`[${s.tf}] ${s.coins.length} coins, ${s.bars} bars ${s.from} → ${s.to}: tested ${rows.length} | thin ${by('thin')} | neg. IS window ${by('window')} | IS t<${GYM.isT} ${by('is_t')} | failed VAL ${by('val')} | failed FINAL ${by('oos')} | PASSED ${s.counts.passed}`)
    L.push(`      ${s.gens.map((g) => `gen${g.gen}: ${g.tested} tested / ${g.is_pass} IS / ${g.val_pass} VAL / ${g.passed} pass`).join(' · ')}`)
  }
  const pass = rep.genomes.filter((r) => r.pass).sort((a, b) => (b.oos_t ?? 0) - (a.oos_t ?? 0))
  L.push(pass.length ? `PASSED (by held-out t):` : `PASSED: none — no genome, at any timeframe, in any generation, is net-positive in every IS window, on the validation slice AND on the final held-out 20%. That is a result, not a failure of the gym.`)
  for (const r of pass.slice(0, 40)) L.push(`  ${r.id.padEnd(40)} ${r.tf.padEnd(3)} gen${r.gen} h=${String(r.h).padStart(5)}m  IS ${r.is.map((x) => x.toFixed(1).padStart(7)).join(' ')}  IS t ${r.is_t}  VAL t ${r.val_t}  FINAL ${r.oos_bps}bps t=${r.oos_t} (n=${r.oos_n}, k=${r.k})${r.parent ? `  <- ${lineage(rep, r.id).slice(1).join(' <- ')}` : ''}`)
  const near = rep.genomes.filter((r) => r.why === 'oos').sort((a, b) => (b.oos_t ?? -9) - (a.oos_t ?? -9)).slice(0, 10)
  if (near.length) { L.push(`reached the FINAL and fell short of ${GYM.oosT}:`); for (const r of near) L.push(`  ${r.id.padEnd(40)} ${r.tf} gen${r.gen} h=${r.h}m  IS t ${r.is_t}  VAL t ${r.val_t}  FINAL ${r.oos_bps}bps t=${r.oos_t}`) }
  const val = rep.genomes.filter((r) => r.why === 'val').sort((a, b) => (b.val_t ?? -9) - (a.val_t ?? -9)).slice(0, 5)
  if (val.length) { L.push(`passed IS, failed VAL (best):`); for (const r of val) L.push(`  ${r.id.padEnd(40)} ${r.tf} gen${r.gen} h=${r.h}m  IS t ${r.is_t}  VAL ${r.val_bps}bps t=${r.val_t}`) }
  L.push(`NB a pass here only seeds the genome into LIVE TRIAL (on its own timeframe) — it still has to earn oos and live on live data.`)
  return L.join('\n')
}

export function gymMain(months: number) {
  const sha = Deno.env.get('GITHUB_SHA') ?? null
  const rep = runGym(months, sha, GYM.sets, (s) => console.log(s))
  const txt = gymSummary(rep)
  console.log(txt)
  try { Deno.mkdirSync('status', { recursive: true }) } catch { /* exists */ }
  Deno.writeTextFileSync('status/gym-latest.json', JSON.stringify(rep))
  Deno.writeTextFileSync('status/gym-latest.txt', txt + '\n')
}

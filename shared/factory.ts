// v82.0 — the agent factory: autonomous generation + out-of-sample promotion.
// Owner asked for thousands of self-improving agents. Thousands voting at once would
// be a luck machine (10,000 agents x 4 horizons -> ~250 "proven" by chance alone), so
// the factory explores MANY agents over time but only lets through the ones that
// survive a test on data they were NOT selected on:
//   trial  - a random genome votes in shadow only (never trades). After TRIAL_MIN_N
//            effective votes on its best horizon: promoted if overlap-corrected t >=
//            trialT, retired if t < 0; retired anyway after trialMaxH hours.
//   oos    - from promotion on, its votes are ALSO scored under a fresh alias
//            `${id}#o`, on the ONE horizon it was promoted on. Only this post-selection
//            evidence counts. n >= oosMinN and t >= liveT -> live; t < 0 or oosMaxH -> retired.
//   live   - the alias votes with the rest of the team (weights from the same shadow
//            learning). Keeps being judged: t < liveDropT -> retired.
// Retired genomes are remembered and never re-tested, so the same idea cannot win by
// being re-rolled. The population refills itself every meeting.
// Pure functions: no network, deterministic given a seed.
import { hT, hKey, LEARN, type Stat } from './swarm.ts'
import type { Bar } from './agents.ts'

// v83.1: minEv = scored SNAPSHOTS (≈ minutes), not coin-votes — 300 coin-votes arrive in ~10 minutes and
// a coin-flip agent is then retired or promoted on noise; an hour (trial) / two (oos) is the floor.
// trialRetireT: a trial agent is dropped at t <= -0.5, not at the first negative reading.
export const FACTORY = { pop: 100, spawnPerMeeting: 20, trialMinN: 300, trialMinEv: 60, trialT: 1.0, trialRetireT: -0.5, trialMaxH: 12, oosMinN: 200, oosMinEv: 120, liveT: 2.5, oosMaxH: 24, liveDropT: 1.0 } as const
export type Stage = 'trial' | 'oos' | 'live' | 'retired'
export type Gene = [key: string, th: number, dir: 1 | -1]
export interface Genome { a: Gene; b?: Gene }
export interface FactoryRow { id: string; genome: Genome; stage: Stage; born: string; stage_at: string; h: number | null; note?: string | null }
export const OOS = (id: string) => `${id}#o`

// feature -> candidate thresholds. Units: % for returns/deviations, bps for funding/basis,
// centred [-1,1] for oscillators and cross-sectional ranks.
export const FEATURES: Record<string, number[]> = {
  r3: [0.1, 0.2, 0.4], r5: [0.1, 0.2, 0.4, 0.8], r10: [0.2, 0.4, 0.8], r15: [0.2, 0.5, 1], r30: [0.3, 0.6, 1.2], r60: [0.5, 1, 2],
  rsi7: [0.2, 0.4, 0.6], rsi14: [0.2, 0.4, 0.6], rsi28: [0.1, 0.2, 0.4],
  z20: [1, 1.5, 2, 2.5], z60: [1, 1.5, 2, 2.5],
  vw30: [0.1, 0.2, 0.4], vw60: [0.2, 0.4, 0.8],
  vr: [0.5, 1, 2], ob: [0.1, 0.2, 0.4],
  fr: [0.5, 1, 3], bs: [2, 5, 10],
  xm7: [0.3, 0.6, 0.8], xm14: [0.3, 0.6, 0.8], xm28: [0.3, 0.6, 0.8],
  oi: [1, 2, 5], btc5: [0.1, 0.2, 0.4], btc15: [0.2, 0.4, 0.8],
}
export const FEATURE_KEYS = Object.keys(FEATURES)

const C = (b: Bar[]) => b.map((x) => x.c)
const ret = (b: Bar[], n: number) => (b.length > n ? (b[b.length - 1].c / b[b.length - 1 - n].c - 1) * 100 : NaN)
const rsiC = (b: Bar[], n: number) => { if (b.length <= n) return NaN; const c = C(b); let g = 0, l = 0; for (let i = c.length - n; i < c.length; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d } return l === 0 ? 1 : (100 - 100 / (1 + g / l) - 50) / 50 }
const z = (b: Bar[], n: number) => { if (b.length < n) return NaN; const c = C(b).slice(-n), m = c.reduce((a, x) => a + x, 0) / n, sd = Math.sqrt(c.reduce((a, x) => a + (x - m) ** 2, 0) / n); return sd > 0 ? (c[n - 1] - m) / sd : 0 }
const vw = (b: Bar[], n: number) => { const w = b.slice(-n), vv = w.reduce((a, x) => a + x.v, 0); if (!(vv > 0)) return NaN; return (b[b.length - 1].c / (w.reduce((a, x) => a + ((x.h + x.l + x.c) / 3) * x.v, 0) / vv) - 1) * 100 }
const vr = (b: Bar[]) => { if (b.length < 40) return NaN; const s = b.slice(-60, -5).map((x) => x.v).sort((a, c) => a - c), m = s[Math.floor(s.length / 2)], r = b.slice(-5).reduce((a, x) => a + x.v, 0) / 5; return m > 0 ? Math.sign(ret(b, 5)) * (r / m - 1) : NaN }

export interface FeatCtx { imbalance?: number; funding?: number | null; premium?: number; xm7?: number; xm14?: number; xm28?: number; doi?: number; dpx?: number; btc?: Bar[] }
export function features(b: Bar[], x: FeatCtx): Record<string, number> {
  const btc = x.btc && x.btc !== b ? x.btc : undefined
  return {
    r3: ret(b, 3), r5: ret(b, 5), r10: ret(b, 10), r15: ret(b, 15), r30: ret(b, 30), r60: ret(b, 60),
    rsi7: rsiC(b, 7), rsi14: rsiC(b, 14), rsi28: rsiC(b, 28), z20: z(b, 20), z60: z(b, 60), vw30: vw(b, 30), vw60: vw(b, 60), vr: vr(b),
    ob: x.imbalance ?? NaN, fr: x.funding == null ? NaN : x.funding * 1e4, bs: x.premium == null ? NaN : x.premium * 1e4,
    xm7: x.xm7 ?? NaN, xm14: x.xm14 ?? NaN, xm28: x.xm28 ?? NaN,
    oi: Number.isFinite(x.doi) && Number.isFinite(x.dpx) ? x.doi! * 100 * Math.sign(x.dpx!) : NaN,
    btc5: btc ? ret(btc, 5) : NaN, btc15: btc ? ret(btc, 15) : NaN,
  }
}
const geneVote = (g: Gene, f: Record<string, number>) => { const v = f[g[0]]; return Number.isFinite(v) && Math.abs(v) >= g[1] ? g[2] * Math.sign(v) : 0 }
// one condition, or two that must agree
export function vote(g: Genome, f: Record<string, number>): number {
  const a = geneVote(g.a, f); if (!g.b) return a
  const b = geneVote(g.b, f); return a && a === b ? a : 0
}
const gid = (g: Gene) => `${g[0]}${String(g[1]).replace('.', 'p')}${g[2] > 0 ? 'f' : 'r'}`
export const genomeId = (g: Genome) => `g_${gid(g.a)}${g.b ? '_' + gid(g.b) : ''}`

// mulberry32 — deterministic, so a run can be reproduced from its seed
export function rng(seed: number) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
function gene(r: () => number, not?: string): Gene {
  let k = FEATURE_KEYS[Math.floor(r() * FEATURE_KEYS.length)]
  if (k === not) k = FEATURE_KEYS[(FEATURE_KEYS.indexOf(k) + 1) % FEATURE_KEYS.length]
  const th = FEATURES[k][Math.floor(r() * FEATURES[k].length)]
  return [k, th, r() < 0.5 ? 1 : -1]
}
// v83.0 EVOLUTION: a promoted parent (oos/live) spawns near variants — the threshold moves one
// step, a second condition is added, replaced or dropped. Direction never flips (that would be a
// different hypothesis, not a variant). Mutants face the same trial -> oos -> live gauntlet.
export function mutate(g: Genome, r: () => number): Genome {
  const stepTh = (x: Gene): Gene => { const th = FEATURES[x[0]], i = th.indexOf(x[1]), j = Math.max(0, Math.min(th.length - 1, i + (r() < 0.5 ? -1 : 1))); return [x[0], th[j], x[2]] }
  const roll = r()
  if (roll < 0.4) return { a: stepTh(g.a), b: g.b }
  if (roll < 0.6 && g.b) return { a: g.a, b: stepTh(g.b) }
  if (roll < 0.8) return { a: g.a, b: gene(r, g.a[0]) }
  return g.b ? { a: g.a } : { a: g.a, b: gene(r, g.a[0]) }
}
export function spawn(n: number, seed: number, taken: Set<string>, parents: Genome[] = []): { id: string; genome: Genome; parent?: string }[] {
  const r = rng(seed), out: { id: string; genome: Genome; parent?: string }[] = []
  const fromParents = parents.length ? Math.ceil(n / 2) : 0
  for (let tries = 0; out.length < n && tries < n * 50; tries++) {
    const evolve = out.length < fromParents
    const p = evolve ? parents[Math.floor(r() * parents.length)] : undefined
    let g: Genome
    if (p) { g = mutate(p, r); if (r() < 0.3) g = mutate(g, r) }
    else { const a = gene(r); g = r() < 0.5 ? { a } : { a, b: gene(r, a[0]) } }
    const id = genomeId(g)
    if (taken.has(id)) continue
    taken.add(id); out.push(p ? { id, genome: g, parent: genomeId(p) } : { id, genome: g })
  }
  return out
}

// best horizon of the TRIAL stats (bare id), overlap-corrected t, with the factory's own n bar
function trialBest(stats: Record<string, Stat>, id: string): { h: number; t: number; n: number } {
  let best = { h: LEARN.horizonsMin[0], t: -Infinity, n: 0 }
  for (const h of LEARN.horizonsMin) { const st = stats[hKey(id, h)]; if (!st || st.n < FACTORY.trialMinN || (st.ev ?? 0) < FACTORY.trialMinEv) continue; const t = hT(st, h); if (t > best.t) best = { h, t, n: st.n } }
  return best
}
// one lifecycle step for one row; returns the changed row or null
export function step(row: FactoryRow, stats: Record<string, Stat>, now: number): FactoryRow | null {
  const ageH = (now - Date.parse(row.stage_at)) / 3600_000, at = new Date(now).toISOString()
  if (row.stage === 'trial') {
    const b = trialBest(stats, row.id)
    if (Number.isFinite(b.t) && b.t >= FACTORY.trialT) return { ...row, stage: 'oos', stage_at: at, h: b.h, note: `trial t=${b.t.toFixed(2)} @${b.h}m n=${Math.round(b.n)}` }
    if (Number.isFinite(b.t) && b.t <= FACTORY.trialRetireT) return { ...row, stage: 'retired', stage_at: at, note: `trial t=${b.t.toFixed(2)}` }
    if (ageH >= FACTORY.trialMaxH) return { ...row, stage: 'retired', stage_at: at, note: 'trial timeout' }
    return null
  }
  if (row.stage === 'oos' || row.stage === 'live') {
    const h = row.h ?? LEARN.horizonsMin[0], st = stats[hKey(OOS(row.id), h)], n = st?.n ?? 0, t = hT(st, h), enough = n >= FACTORY.oosMinN && (st?.ev ?? 0) >= FACTORY.oosMinEv
    if (row.stage === 'oos') {
      if (enough && t >= FACTORY.liveT) return { ...row, stage: 'live', stage_at: at, note: `oos t=${t.toFixed(2)} @${h}m n=${Math.round(n)}` }
      if (enough && t < 0) return { ...row, stage: 'retired', stage_at: at, note: `oos t=${t.toFixed(2)}` }
      if (ageH >= FACTORY.oosMaxH) return { ...row, stage: 'retired', stage_at: at, note: `oos timeout t=${Number.isFinite(t) ? t.toFixed(2) : '—'} n=${Math.round(n)}` }
      return null
    }
    if (enough && t < FACTORY.liveDropT) return { ...row, stage: 'retired', stage_at: at, note: `live dropped t=${t.toFixed(2)}` }
  }
  return null
}
// stats keys a retired agent leaves behind (so agent_stats does not grow forever)
export const statKeys = (id: string) => LEARN.horizonsMin.flatMap((h) => [hKey(id, h), hKey(OOS(id), h)])

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
// v85.1: `tf` = the bars the genome reads. Absent = the live 1-minute bars (gym-tested on 5m);
// '4h' / '1d' genomes come from the gym's slow sets and are evaluated live on 4h / 1d bars.
// v85.7: a ladder of DISTINCT timeframes (owner asked for 150 kinds of candles — 150 resamplings of the same
// prices would be 150 looks at the same information, not 150 sources; the ladder below is every bar size that
// adds a genuinely different horizon, aggregated from the 5m / 15m / 1h archives)
export type Tf = '15m' | '30m' | '1h' | '2h' | '4h' | '8h' | '12h' | '1d' | '3d' | '1w'
export const TF_MIN: Record<string, number> = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '2h': 120, '4h': 240, '8h': 480, '12h': 720, '1d': 1440, '3d': 4320, '1w': 10080 }
// v85.4: an optional TIME GATE — the genome votes only inside a UTC hour window and/or on given weekdays.
// It is a condition of the genome (judged by the same gym / live gauntlet), not a filter on the bot.
export interface When { h?: [number, number]; d?: number[] }
export interface Genome { a: Gene; b?: Gene; tf?: Tf; when?: When }
export const TF_LABEL: Record<string, string> = { '1m': 'דקה', '5m': '5 דק׳', '15m': '15 דק׳', '30m': '30 דק׳', '1h': 'שעה', '2h': '2 שעות', '4h': '4 שעות', '8h': '8 שעות', '12h': '12 שעות', '1d': 'יומי', '3d': '3 ימים', '1w': 'שבועי' }
export const WHENS: Record<string, { w: When; label: string }> = {
  asia: { w: { h: [0, 8] }, label: 'שעות אסיה 00–08' }, eu: { w: { h: [8, 16] }, label: 'שעות אירופה 08–16' }, us: { w: { h: [16, 24] }, label: 'שעות ארה״ב 16–24' },
  usopen: { w: { h: [13, 21] }, label: 'פתיחת ארה״ב 13–21' }, night: { w: { h: [22, 6] }, label: 'לילה 22–06' },
  wkd: { w: { d: [1, 2, 3, 4, 5] }, label: 'ימי חול' }, wke: { w: { d: [0, 6] }, label: 'סוף שבוע' }, mon: { w: { d: [1] }, label: 'יום שני' }, fri: { w: { d: [5] }, label: 'יום שישי' },
  euwkd: { w: { h: [8, 16], d: [1, 2, 3, 4, 5] }, label: 'אירופה, ימי חול' }, uswkd: { w: { h: [16, 24], d: [1, 2, 3, 4, 5] }, label: 'ארה״ב, ימי חול' },
}
export const WHEN_KEYS = Object.keys(WHENS)
// v85.6: a gate must be able to change the vote on the genome's own bars — on daily bars every bar is 00:00 UTC,
// so an hour window is either always-on or always-off; only the weekday part survives. Returns undefined when
// nothing survives (no gate), so an identical ungated twin is never bred under a different id.
export function fitGate(tf: Tf | undefined, w: When | undefined): When | undefined {
  if (!w) return undefined
  if (tf && (TF_MIN[tf] ?? 0) >= 1440) return w.d ? { d: w.d } : undefined   // daily and slower: every bar opens at 00:00 UTC
  if (tf && (TF_MIN[tf] ?? 0) >= 720 && w.h) return w.d ? { d: w.d } : undefined // 12h bars: an hour window is half-on/half-off, not a signal
  return w
}
export function whenOk(w: When | undefined, t: number): boolean {
  if (!w) return true
  const d = new Date(t), hr = d.getUTCHours(), dw = d.getUTCDay()
  if (w.d && !w.d.includes(dw)) return false
  if (w.h) { const [a, b] = w.h; if (a <= b ? (hr < a || hr >= b) : (hr < a && hr >= b)) return false }
  return true
}
const whenId = (w?: When) => { if (!w) return ''; const k = WHEN_KEYS.find((k) => JSON.stringify(WHENS[k].w) === JSON.stringify(w)); return '_' + (k ?? `h${w.h?.join('-') ?? ''}d${w.d?.join('') ?? ''}`) }
export const whenText = (w?: When) => { if (!w) return ''; const k = WHEN_KEYS.find((k) => JSON.stringify(WHENS[k].w) === JSON.stringify(w)); return k ? WHENS[k].label : `${w.h ? `שעות ${w.h[0]}–${w.h[1]} UTC` : ''}${w.d ? ` ימים ${w.d.join(',')}` : ''}` }
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
  // v85.5 — the widened vocabulary (owner: "expand to the maximum"): taker flow and trade count from the
  // klines themselves, top-trader and taker long/short ratios and 24h OI change from the metrics archive,
  // 60/90-day cross-sectional momentum, drawdown from the 30-bar high. All testable offline except `ob`.
  ti5: [0.1, 0.2, 0.4], ti30: [0.05, 0.1, 0.2], nt: [0.5, 1, 2],
  tls: [0.1, 0.2, 0.4], tlr: [0.1, 0.2, 0.4], oi1d: [2, 5, 10],
  xm60: [0.3, 0.6, 0.8], xm90: [0.3, 0.6, 0.8], dd30: [1, 2, 4],
}
export const FEATURE_KEYS = Object.keys(FEATURES)
// v85.0: plain-Hebrew names for the house (gym cards spell a genome out as a rule)
export const FEATURE_LABEL: Record<string, string> = {
  r3: 'שינוי 3 נרות', r5: 'שינוי 5 נרות', r10: 'שינוי 10 נרות', r15: 'שינוי 15 נרות', r30: 'שינוי 30 נרות', r60: 'שינוי 60 נרות',
  rsi7: 'RSI 7', rsi14: 'RSI 14', rsi28: 'RSI 28', z20: 'Z-score 20', z60: 'Z-score 60', vw30: 'סטייה מ־VWAP 30', vw60: 'סטייה מ־VWAP 60',
  vr: 'קפיצת נפח', ob: 'חוסר איזון בספר', fr: 'פאנדינג', bs: 'פרמיית הפרפטואל', xm7: 'מומנטום יחסי 7 ימים', xm14: 'מומנטום יחסי 14 ימים', xm28: 'מומנטום יחסי 28 ימים',
  oi: 'שינוי ריבית פתוחה 4 שעות', btc5: 'ביטקוין 5 נרות', btc15: 'ביטקוין 15 נרות',
  ti5: 'זרימת קונים/מוכרים 5 נרות', ti30: 'זרימת קונים/מוכרים 30 נרות', nt: 'קפיצת מספר עסקאות',
  tls: 'יחס לונג/שורט של הסוחרים הגדולים', tlr: 'יחס נפח קונים/מוכרים', oi1d: 'שינוי ריבית פתוחה 24 שעות',
  xm60: 'מומנטום יחסי 60 ימים', xm90: 'מומנטום יחסי 90 ימים', dd30: 'ירידה מהשיא של 30 נרות',
}
export const geneText = (g: Gene) => `${FEATURE_LABEL[g[0]] ?? g[0]} ≥ ${g[1]} → ${g[2] > 0 ? 'עם הכיוון' : 'נגד הכיוון'}`
export const genomeText = (g: Genome) => `${g.b ? `${geneText(g.a)} וגם ${geneText(g.b)}` : geneText(g.a)}${g.when ? `, רק ב${whenText(g.when)}` : ''}${g.tf ? ` (נרות ${TF_LABEL[g.tf]})` : ''}`
// v85.0 gym: a genome that passed the offline walk-forward (status/gym-latest.json) is seeded
// into live TRIAL ahead of random spawns — never past it. Retired ids stay retired (`taken`).
export interface GymPass { id: string; genome: Genome; h: number | null; oos_t: number | null; is: number[] }
export function gymPicks(passed: GymPass[], taken: Set<string>, slots: number): { id: string; genome: Genome; note: string }[] {
  return passed.filter((p) => !taken.has(p.id)).sort((a, b) => (b.oos_t ?? 0) - (a.oos_t ?? 0)).slice(0, Math.max(0, slots))
    .map((p) => ({ id: p.id, genome: p.genome, note: `gym${p.genome.tf ? ` ${p.genome.tf}` : ''}: ${p.is.length}/${p.is.length} windows, oos t=${(p.oos_t ?? 0).toFixed(1)} @${p.h}m` }))
}

const C = (b: Bar[]) => b.map((x) => x.c)
const ret = (b: Bar[], n: number) => (b.length > n ? (b[b.length - 1].c / b[b.length - 1 - n].c - 1) * 100 : NaN)
const rsiC = (b: Bar[], n: number) => { if (b.length <= n) return NaN; const c = C(b); let g = 0, l = 0; for (let i = c.length - n; i < c.length; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d } return l === 0 ? 1 : (100 - 100 / (1 + g / l) - 50) / 50 }
const z = (b: Bar[], n: number) => { if (b.length < n) return NaN; const c = C(b).slice(-n), m = c.reduce((a, x) => a + x, 0) / n, sd = Math.sqrt(c.reduce((a, x) => a + (x - m) ** 2, 0) / n); return sd > 0 ? (c[n - 1] - m) / sd : 0 }
const vw = (b: Bar[], n: number) => { const w = b.slice(-n), vv = w.reduce((a, x) => a + x.v, 0); if (!(vv > 0)) return NaN; return (b[b.length - 1].c / (w.reduce((a, x) => a + ((x.h + x.l + x.c) / 3) * x.v, 0) / vv) - 1) * 100 }
const vr = (b: Bar[]) => { if (b.length < 40) return NaN; const s = b.slice(-60, -5).map((x) => x.v).sort((a, c) => a - c), m = s[Math.floor(s.length / 2)], r = b.slice(-5).reduce((a, x) => a + x.v, 0) / 5; return m > 0 ? Math.sign(ret(b, 5)) * (r / m - 1) : NaN }

export interface FeatCtx { imbalance?: number; funding?: number | null; premium?: number; xm7?: number; xm14?: number; xm28?: number; xm60?: number; xm90?: number; doi?: number; dpx?: number; doi1d?: number; tls?: number; tlr?: number; btc?: Bar[] }
// taker imbalance over the last n bars: (buy - sell) / total, [-1, 1]; NaN when the feed carries no taker volume
const ti = (b: Bar[], n: number) => { const w = b.slice(-n); let q = 0, v = 0; for (const x of w) { if (x.q === undefined) return NaN; q += x.q; v += x.v } return v > 0 ? (2 * q - v) / v : NaN }
// trade-count spike: last 5 bars vs the median of the 55 before, signed by the 5-bar move (like vr)
const nt = (b: Bar[]) => { if (b.length < 40 || b[b.length - 1].n === undefined) return NaN; const s = b.slice(-60, -5).map((x) => x.n ?? NaN).filter(Number.isFinite).sort((a, c) => a - c); if (s.length < 20) return NaN; const m = s[Math.floor(s.length / 2)], r = b.slice(-5).reduce((a, x) => a + (x.n ?? 0), 0) / 5; return m > 0 ? Math.sign(ret(b, 5)) * (r / m - 1) : NaN }
// drawdown from the 30-bar high, %, negative = below the high (a gene with dir -1 fades it, +1 follows it)
const dd = (b: Bar[], n: number) => { if (b.length < n) return NaN; let hi = 0; for (const x of b.slice(-n)) hi = Math.max(hi, x.h); return hi > 0 ? (b[b.length - 1].c / hi - 1) * 100 : NaN }
export function features(b: Bar[], x: FeatCtx): Record<string, number> {
  const btc = x.btc && x.btc !== b ? x.btc : undefined
  return {
    ti5: ti(b, 5), ti30: ti(b, 30), nt: nt(b), dd30: dd(b, 30),
    tls: x.tls ?? NaN, tlr: x.tlr ?? NaN, oi1d: Number.isFinite(x.doi1d) ? x.doi1d! * 100 : NaN, xm60: x.xm60 ?? NaN, xm90: x.xm90 ?? NaN,
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
// `t` (ms) lets a time-gated genome abstain outside its window; without it the gate is ignored.
export function vote(g: Genome, f: Record<string, number>, t?: number): number {
  if (g.when && t !== undefined && !whenOk(g.when, t)) return 0
  const a = geneVote(g.a, f); if (!g.b) return a
  const b = geneVote(g.b, f); return a && a === b ? a : 0
}
const gid = (g: Gene) => `${g[0]}${String(g[1]).replace('.', 'p')}${g[2] > 0 ? 'f' : 'r'}`
export const genomeId = (g: Genome) => `${g.tf ? `g${g.tf}` : 'g'}_${gid(g.a)}${g.b ? '_' + gid(g.b) : ''}${whenId(g.when)}`

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
  const keep = { ...(g.tf ? { tf: g.tf } : {}), ...(g.when ? { when: g.when } : {}) }   // timeframe and gate travel with the child
  const roll = r()
  if (roll < 0.35) return { ...keep, a: stepTh(g.a), ...(g.b ? { b: g.b } : {}) }
  if (roll < 0.5 && g.b) return { ...keep, a: g.a, b: stepTh(g.b) }
  if (roll < 0.65) return { ...keep, a: g.a, b: gene(r, g.a[0]) }
  if (roll < 0.8) return g.b ? { ...keep, a: g.a } : { ...keep, a: g.a, b: gene(r, g.a[0]) }
  // v85.4: the gate mutates too — gain one, change it, or drop it
  const { when: _drop, ...rest } = keep
  if (roll < 0.9 || !g.when) { const w = fitGate(g.tf, WHENS[WHEN_KEYS[Math.floor(r() * WHEN_KEYS.length)]].w); return { ...rest, ...(w ? { when: w } : {}), a: g.a, ...(g.b ? { b: g.b } : {}) } }
  return { ...rest, a: g.a, ...(g.b ? { b: g.b } : {}) }
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

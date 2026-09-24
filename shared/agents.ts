// v73.0 — ten more signal agents and performance-weighted voting.
// Each agent reads closed 1-minute bars (plus BTC's bars and the public funding
// rate) and returns a direction: +1 long, -1 short, 0 no view. Pure functions,
// no network, no randomness. NONE of these has been walk-forward validated on
// 1-minute data; v76bt-v105bt found no sub-hour edge after costs. They are demo
// agents whose value is measured live by the quant's attribution below.
export interface Bar { t: number; o: number; h: number; l: number; c: number; v: number; q?: number; n?: number }   // v85.5: q = taker-buy base volume, n = trades (Binance klines; absent on OKX)
export interface AgentCtx { btc?: Bar[]; funding?: number | null }
export interface AgentView { dir: number; says: string }

const sgn = (x: number, dead = 0) => (x > dead ? 1 : x < -dead ? -1 : 0)
const ema = (a: number[], n: number) => { let v = a[0]; for (const x of a.slice(1)) v += (2 / (n + 1)) * (x - v); return v }
const emaSeries = (a: number[], n: number) => { const out: number[] = []; let v = a[0]; for (const x of a) { v += (2 / (n + 1)) * (x - v); out.push(v) } return out }
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN }
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '—')

export function rsi(c: number[], n = 14): number {
  if (c.length <= n) return NaN
  let g = 0, l = 0
  for (let i = c.length - n; i < c.length; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l)
}

export const AGENTS: Record<string, { name: string; role: string; run: (b: Bar[], x: AgentCtx) => AgentView }> = {
  // momentum oscillator read as CONTINUATION (in crypto an extreme RSI continues: v53bt)
  rsi: { name: 'יעל', role: 'RSI', run: (b) => { const r = rsi(b.map((x) => x.c)); return { dir: r >= 55 ? 1 : r <= 45 ? -1 : 0, says: `RSI(14) ${f2(r)}` } } },
  vwap: { name: 'עידו', role: 'VWAP', run: (b) => {
    const w = b.slice(-60); const pv = w.reduce((a, x) => a + ((x.h + x.l + x.c) / 3) * x.v, 0), vv = w.reduce((a, x) => a + x.v, 0)
    const vw = vv > 0 ? pv / vv : NaN, last = b[b.length - 1].c, d = last / vw - 1
    return { dir: sgn(d, 0.0005), says: `מחיר ${d >= 0 ? 'מעל' : 'מתחת'} VWAP-60 ב-${f2(Math.abs(d) * 100)}%` }
  } },
  breakout: { name: 'ליאור', role: 'פריצות', run: (b) => {
    const prior = b.slice(-16, -1), last = b[b.length - 1]
    const hi = Math.max(...prior.map((x) => x.h)), lo = Math.min(...prior.map((x) => x.l))
    const dir = last.c > hi ? 1 : last.c < lo ? -1 : 0
    return { dir, says: dir ? `סגירה ${dir > 0 ? 'מעל שיא' : 'מתחת לשפל'} 15 דקות` : 'בתוך טווח 15 הדקות' }
  } },
  volume: { name: 'שני', role: 'נפח', run: (b) => {
    const last = b[b.length - 1], m = median(b.slice(-31, -1).map((x) => x.v)), k = m > 0 ? last.v / m : NaN
    const dir = k >= 2 ? sgn(last.c - last.o) : 0
    return { dir, says: `נפח הדקה האחרונה פי ${f2(k)} מהחציון${dir ? `, נר ${dir > 0 ? 'עולה' : 'יורד'}` : ''}` }
  } },
  macd: { name: 'אסף', role: 'MACD', run: (b) => {
    const c = b.map((x) => x.c), e12 = emaSeries(c, 12), e26 = emaSeries(c, 26), m = e12.map((v, i) => v - e26[i]), sig = ema(m, 9), h = m[m.length - 1] - sig
    return { dir: sgn(h / c[c.length - 1], 0.00002), says: `היסטוגרמת MACD ${h >= 0 ? 'חיובית' : 'שלילית'}` }
  } },
  bollinger: { name: 'מאיה', role: 'בולינגר', run: (b) => {
    const c = b.slice(-20).map((x) => x.c), mean = c.reduce((a, x) => a + x, 0) / c.length
    const sd = Math.sqrt(c.reduce((a, x) => a + (x - mean) ** 2, 0) / c.length), last = c[c.length - 1], z = sd > 0 ? (last - mean) / sd : 0
    return { dir: z >= 2 ? 1 : z <= -2 ? -1 : 0, says: `סטייה מהממוצע ${f2(z)}σ (פריצת רצועה = המשכיות)` }
  } },
  htf: { name: 'בן', role: 'טווח ארוך', run: (b) => {
    const c = b.slice(-60).map((x) => x.c), n = c.length, xm = (n - 1) / 2, ym = c.reduce((a, x) => a + x, 0) / n
    let num = 0, den = 0; c.forEach((y, i) => { num += (i - xm) * (y - ym); den += (i - xm) ** 2 })
    const slope = den ? num / den / ym * 60 : 0
    return { dir: sgn(slope, 0.001), says: `שיפוע שעה אחרונה ${f2(slope * 100)}%` }
  } },
  btclead: { name: 'אורי', role: 'מוביל BTC', run: (b, x) => {
    const k = x.btc; if (!k || k.length < 4 || k === b) return { dir: 0, says: 'BTC עצמו — ללא הובלה' }
    const r = k[k.length - 1].c / k[k.length - 4].c - 1
    return { dir: sgn(r, 0.001), says: `BTC זז ${f2(r * 100)}% ב-3 דקות` }
  } },
  candle: { name: 'טל', role: 'נרות', run: (b) => {
    const x = b[b.length - 1], rg = x.h - x.l, body = Math.abs(x.c - x.o)
    const pos = rg > 0 ? (x.c - x.l) / rg : 0.5, strong = rg > 0 && body / rg >= 0.6
    const dir = strong && pos >= 0.75 ? 1 : strong && pos <= 0.25 ? -1 : 0
    return { dir, says: dir ? `נר ${dir > 0 ? 'שורי' : 'דובי'} חזק (גוף ${f2((body / rg) * 100)}%)` : 'נר ללא הכרעה' }
  } },
  // contrarian on crowding; NB a funding TILT on the 4h engine was rejected as noise (v43bt)
  funding: { name: 'קרן', role: 'מימון', run: (_b, x) => {
    const f = x.funding
    if (f == null || !Number.isFinite(f)) return { dir: 0, says: 'אין נתון מימון' }
    return { dir: f >= 0.0003 ? -1 : f <= -0.0001 ? 1 : 0, says: `מימון ${f2(f * 100 * 100)} נק׳ בסיס ל-8 שעות${f >= 0.0003 ? ' — לונגים צפופים' : f <= -0.0001 ? ' — שורטים צפופים' : ''}` }
  } },
}
export const NEW_AGENTS = Object.keys(AGENTS)

// ── performance weights (owner's option 1) ─────────────────────────────────
// Bayesian-shrunk hit rate: 20 pseudo-trades at 50%, so a few lucky trades
// barely move it. Weight = 1 + 4*(p - 0.5), clamped to [0.5, 2]. Below 30 own
// votes an agent keeps weight 1. Recomputed every meeting from closed trades.
export const WEIGHT = { prior: 20, minN: 30, lo: 0.5, hi: 2 } as const
export function weightOf(a: { n: number; right: number } | undefined): number {
  if (!a || a.n < WEIGHT.minN) return 1
  const p = (a.right + WEIGHT.prior / 2) / (a.n + WEIGHT.prior)
  return Math.min(WEIGHT.hi, Math.max(WEIGHT.lo, 1 + 4 * (p - 0.5)))
}
export function weights(att: Record<string, { n: number; right: number }>): Record<string, number> {
  return Object.fromEntries(Object.entries(att).map(([k, v]) => [k, Math.round(weightOf(v) * 100) / 100]))
}

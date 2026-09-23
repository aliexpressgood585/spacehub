// v75.0 — the swarm: 50 more agents in 5 teams, and shadow learning so every
// agent (these 50 + the 15 directional voters before them) keeps improving on
// its own. Pure functions: no network, no randomness.
//
// HONEST FRAMING, kept next to the code: these are parameter variants of public
// technical indicators on 1-minute bars. None is walk-forward validated, and the
// research in CLAUDE.md (v76bt-v105bt) found no sub-hour edge after costs.
// "Improving" here means SELECTION: every minute each agent's vote is scored
// against the next 5 minutes of price, recent evidence counts more than old,
// consistently wrong agents are benched (weight 0) and can come back. It does not
// write new strategies, and with 65 agents some will look good by luck — the
// shrinkage + decay + t-statistic below exist to limit that, not to eliminate it.
import type { Bar } from './agents.ts'

type Run = (b: Bar[], x: { btc?: Bar[] }) => number
export interface SwarmAgent { id: string; team: Team; label: string; run: Run }
export type Team = 'trend' | 'mom' | 'rev' | 'brk' | 'flow'
export const TEAMS: Record<Team, { lead: string; name: string; label: string }> = {
  trend: { lead: 'trendDesk', name: 'רז', label: 'צוות מגמה' },
  mom: { lead: 'momDesk', name: 'נגה', label: 'צוות מומנטום' },
  rev: { lead: 'revDesk', name: 'אלה', label: 'צוות היפוך' },
  brk: { lead: 'brkDesk', name: 'יובל', label: 'צוות פריצות' },
  flow: { lead: 'flowDesk', name: 'דור', label: 'צוות נפח וזרימה' },
}

const sgn = (x: number, dead = 0) => (!Number.isFinite(x) ? 0 : x > dead ? 1 : x < -dead ? -1 : 0)
const C = (b: Bar[]) => b.map((x) => x.c)
const sma = (a: number[], n: number) => { const s = a.slice(-n); return s.reduce((p, x) => p + x, 0) / s.length }
const ema = (a: number[], n: number) => { let v = a[Math.max(0, a.length - n * 3)]; for (const x of a.slice(Math.max(0, a.length - n * 3) + 1)) v += (2 / (n + 1)) * (x - v); return v }
const roc = (b: Bar[], n: number) => { const c = C(b); return c[c.length - 1] / c[c.length - 1 - n] - 1 }
const rsi = (b: Bar[], n: number) => { const c = C(b); let g = 0, l = 0; for (let i = c.length - n; i < c.length; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d } return l === 0 ? 100 : 100 - 100 / (1 + g / l) }
const atr = (b: Bar[], n: number) => b.slice(-n).reduce((a, x) => a + x.h - x.l, 0) / n
const zsc = (b: Bar[], n: number) => { const c = C(b).slice(-n), m = c.reduce((a, x) => a + x, 0) / n, sd = Math.sqrt(c.reduce((a, x) => a + (x - m) ** 2, 0) / n); return sd > 0 ? (c[n - 1] - m) / sd : 0 }
const stoch = (b: Bar[], n: number) => { const w = b.slice(-n), hi = Math.max(...w.map((x) => x.h)), lo = Math.min(...w.map((x) => x.l)); return hi > lo ? ((w[n - 1].c - lo) / (hi - lo)) * 100 : 50 }
const donch = (b: Bar[], n: number) => { const p = b.slice(-n - 1, -1), last = b[b.length - 1]; return last.c > Math.max(...p.map((x) => x.h)) ? 1 : last.c < Math.min(...p.map((x) => x.l)) ? -1 : 0 }
const vwapDev = (b: Bar[], n: number) => { const w = b.slice(-n), vv = w.reduce((a, x) => a + x.v, 0); if (!(vv > 0)) return 0; const vw = w.reduce((a, x) => a + ((x.h + x.l + x.c) / 3) * x.v, 0) / vv; return b[b.length - 1].c / vw - 1 }
const slope = (b: Bar[], n: number) => { const c = C(b).slice(-n), xm = (n - 1) / 2, ym = c.reduce((a, x) => a + x, 0) / n; let nu = 0, de = 0; c.forEach((y, i) => { nu += (i - xm) * (y - ym); de += (i - xm) ** 2 }); return de ? (nu / de / ym) * n : 0 }
const volSpike = (b: Bar[], k: number) => { const s = b.slice(-31, -1).map((x) => x.v).sort((a, c) => a - c), m = s[Math.floor(s.length / 2)], x = b[b.length - 1]; return m > 0 && x.v / m >= k ? sgn(x.c - x.o) : 0 }
const obvSlope = (b: Bar[], n: number) => { let o = 0; const arr: number[] = []; for (let i = b.length - n; i < b.length; i++) { o += Math.sign(b[i].c - b[i - 1].c) * b[i].v; arr.push(o) } const vsum = b.slice(-n).reduce((a, x) => a + x.v, 0); return vsum > 0 ? (arr[arr.length - 1] - arr[0]) / vsum : 0 }
const mfi = (b: Bar[], n: number) => { let p = 0, q = 0; for (let i = b.length - n; i < b.length; i++) { const tp = (b[i].h + b[i].l + b[i].c) / 3, tp0 = (b[i - 1].h + b[i - 1].l + b[i - 1].c) / 3, f = tp * b[i].v; if (tp > tp0) p += f; else if (tp < tp0) q += f } return q === 0 ? 100 : 100 - 100 / (1 + p / q) }
const cci = (b: Bar[], n: number) => { const tp = b.slice(-n).map((x) => (x.h + x.l + x.c) / 3), m = tp.reduce((a, x) => a + x, 0) / n, md = tp.reduce((a, x) => a + Math.abs(x - m), 0) / n; return md > 0 ? (tp[n - 1] - m) / (0.015 * md) : 0 }
const upVolRatio = (b: Bar[], n: number) => { const w = b.slice(-n), up = w.filter((x) => x.c > x.o).reduce((a, x) => a + x.v, 0), all = w.reduce((a, x) => a + x.v, 0); return all > 0 ? up / all : 0.5 }
const clv = (b: Bar[], n: number) => { const w = b.slice(-n); return w.reduce((a, x) => a + (x.h > x.l ? ((x.c - x.l) - (x.h - x.c)) / (x.h - x.l) : 0), 0) / n }

const A = (id: string, team: Team, label: string, run: Run): SwarmAgent => ({ id, team, label, run })
export const SWARM: SwarmAgent[] = [
  // trend — follow the prevailing direction
  A('ema5_13', 'trend', 'EMA 5/13', (b) => sgn(ema(C(b), 5) - ema(C(b), 13))),
  A('ema9_30', 'trend', 'EMA 9/30', (b) => sgn(ema(C(b), 9) - ema(C(b), 30))),
  A('ema12_26', 'trend', 'EMA 12/26', (b) => sgn(ema(C(b), 12) - ema(C(b), 26))),
  A('ema20_50', 'trend', 'EMA 20/50', (b) => sgn(ema(C(b), 20) - ema(C(b), 50))),
  A('sma10', 'trend', 'שיפוע SMA 10', (b) => sgn(sma(C(b), 10) / sma(C(b).slice(0, -3), 10) - 1, 0.0002)),
  A('sma30', 'trend', 'שיפוע SMA 30', (b) => sgn(sma(C(b), 30) / sma(C(b).slice(0, -5), 30) - 1, 0.0003)),
  A('px_ema50', 'trend', 'מחיר מול EMA 50', (b) => sgn(b[b.length - 1].c / ema(C(b), 50) - 1, 0.001)),
  A('slope20', 'trend', 'רגרסיה 20 דק׳', (b) => sgn(slope(b, 20), 0.001)),
  A('slope45', 'trend', 'רגרסיה 45 דק׳', (b) => sgn(slope(b, 45), 0.0015)),
  A('donmid20', 'trend', 'אמצע דונצ׳יאן 20', (b) => { const w = b.slice(-20); return sgn(b[b.length - 1].c / ((Math.max(...w.map((x) => x.h)) + Math.min(...w.map((x) => x.l))) / 2) - 1, 0.0005) }),
  // momentum — recent rate of change continues
  A('roc1', 'mom', 'שינוי דקה', (b) => sgn(roc(b, 1), 0.0005)),
  A('roc3', 'mom', 'שינוי 3 דק׳', (b) => sgn(roc(b, 3), 0.001)),
  A('roc5', 'mom', 'שינוי 5 דק׳', (b) => sgn(roc(b, 5), 0.0015)),
  A('roc10', 'mom', 'שינוי 10 דק׳', (b) => sgn(roc(b, 10), 0.002)),
  A('roc15', 'mom', 'שינוי 15 דק׳', (b) => sgn(roc(b, 15), 0.0025)),
  A('roc30', 'mom', 'שינוי 30 דק׳', (b) => sgn(roc(b, 30), 0.003)),
  A('rsi7m', 'mom', 'RSI 7 המשכיות', (b) => { const r = rsi(b, 7); return r >= 60 ? 1 : r <= 40 ? -1 : 0 }),
  A('rsi21m', 'mom', 'RSI 21 המשכיות', (b) => { const r = rsi(b, 21); return r >= 55 ? 1 : r <= 45 ? -1 : 0 }),
  A('stoch14m', 'mom', 'סטוכסטי 14 המשכיות', (b) => { const s = stoch(b, 14); return s >= 70 ? 1 : s <= 30 ? -1 : 0 }),
  A('cci20m', 'mom', 'CCI 20 המשכיות', (b) => { const x = cci(b, 20); return x >= 100 ? 1 : x <= -100 ? -1 : 0 }),
  // reversal — fade stretched moves (the opposite hypothesis; the learning decides)
  A('rsi7r', 'rev', 'RSI 7 היפוך', (b) => { const r = rsi(b, 7); return r <= 20 ? 1 : r >= 80 ? -1 : 0 }),
  A('rsi14r', 'rev', 'RSI 14 היפוך', (b) => { const r = rsi(b, 14); return r <= 25 ? 1 : r >= 75 ? -1 : 0 }),
  A('bb20r', 'rev', 'בולינגר 20/2 היפוך', (b) => { const z = zsc(b, 20); return z <= -2 ? 1 : z >= 2 ? -1 : 0 }),
  A('bb10r', 'rev', 'בולינגר 10/1.5 היפוך', (b) => { const z = zsc(b, 10); return z <= -1.5 ? 1 : z >= 1.5 ? -1 : 0 }),
  A('z30r', 'rev', 'Z-score 30 היפוך', (b) => { const z = zsc(b, 30); return z <= -2.2 ? 1 : z >= 2.2 ? -1 : 0 }),
  A('vwap30r', 'rev', 'VWAP 30 היפוך', (b) => { const d = vwapDev(b, 30); return d <= -0.003 ? 1 : d >= 0.003 ? -1 : 0 }),
  A('three_bar', 'rev', '3 נרות רצופים היפוך', (b) => { const w = b.slice(-3); return w.every((x) => x.c < x.o) ? 1 : w.every((x) => x.c > x.o) ? -1 : 0 }),
  A('roc5r', 'rev', 'שינוי 5 דק׳ היפוך', (b) => -sgn(roc(b, 5), 0.005)),
  A('wick', 'rev', 'דחיית זנב', (b) => { const x = b[b.length - 1], rg = x.h - x.l; if (!(rg > 0)) return 0; const lw = Math.min(x.o, x.c) - x.l, uw = x.h - Math.max(x.o, x.c); return lw / rg >= 0.6 ? 1 : uw / rg >= 0.6 ? -1 : 0 }),
  A('stoch14r', 'rev', 'סטוכסטי 14 היפוך', (b) => { const s = stoch(b, 14); return s <= 10 ? 1 : s >= 90 ? -1 : 0 }),
  // breakout — range escapes and volatility expansion
  A('don5', 'brk', 'פריצת 5 דק׳', (b) => donch(b, 5)),
  A('don10', 'brk', 'פריצת 10 דק׳', (b) => donch(b, 10)),
  A('don20', 'brk', 'פריצת 20 דק׳', (b) => donch(b, 20)),
  A('don30', 'brk', 'פריצת 30 דק׳', (b) => donch(b, 30)),
  A('don45', 'brk', 'פריצת 45 דק׳', (b) => donch(b, 45)),
  A('keltner', 'brk', 'קלטנר 20/1.5', (b) => { const m = ema(C(b), 20), a = atr(b, 20), c = b[b.length - 1].c; return c > m + 1.5 * a ? 1 : c < m - 1.5 * a ? -1 : 0 }),
  A('expand', 'brk', 'נר התרחבות', (b) => { const x = b[b.length - 1]; return x.h - x.l > 2 * atr(b.slice(0, -1), 20) ? sgn(x.c - x.o) : 0 }),
  A('inside', 'brk', 'פריצת נר פנימי', (b) => { const [m, i, x] = b.slice(-3); return i.h <= m.h && i.l >= m.l ? (x.c > m.h ? 1 : x.c < m.l ? -1 : 0) : 0 }),
  A('atrup', 'brk', 'התרחבות ATR', (b) => (atr(b, 5) > 1.5 * atr(b, 30) ? sgn(roc(b, 5)) : 0)),
  A('squeeze', 'brk', 'פריצה מדחיסה', (b) => { const w = C(b).slice(-20), m = w.reduce((a, x) => a + x, 0) / 20, sd = Math.sqrt(w.reduce((a, x) => a + (x - m) ** 2, 0) / 20); return sd / m < 0.0015 ? donch(b, 10) : 0 }),
  // flow — volume, pressure and the market leader
  A('vol15', 'flow', 'נפח פי 1.5', (b) => volSpike(b, 1.5)),
  A('vol3', 'flow', 'נפח פי 3', (b) => volSpike(b, 3)),
  A('obv10', 'flow', 'OBV 10', (b) => sgn(obvSlope(b, 10), 0.2)),
  A('obv30', 'flow', 'OBV 30', (b) => sgn(obvSlope(b, 30), 0.15)),
  A('mfi14', 'flow', 'MFI 14', (b) => { const m = mfi(b, 14); return m >= 65 ? 1 : m <= 35 ? -1 : 0 }),
  A('upvol15', 'flow', 'נפח עולה 15', (b) => { const r = upVolRatio(b, 15); return r >= 0.65 ? 1 : r <= 0.35 ? -1 : 0 }),
  A('clv10', 'flow', 'מיקום סגירה 10', (b) => sgn(clv(b, 10), 0.25)),
  A('pressure10', 'flow', 'לחץ נפח 10', (b) => { const w = b.slice(-10), all = w.reduce((a, x) => a + x.v, 0); return all > 0 ? sgn(w.reduce((a, x) => a + Math.sign(x.c - x.o) * x.v, 0) / all, 0.3) : 0 }),
  A('btc1', 'flow', 'BTC דקה', (b, x) => (!x.btc || x.btc === b || x.btc.length < 3 ? 0 : sgn(roc(x.btc, 1), 0.0008))),
  A('btc5', 'flow', 'BTC 5 דק׳', (b, x) => (!x.btc || x.btc === b || x.btc.length < 7 ? 0 : sgn(roc(x.btc, 5), 0.002))),
]
export const SWARM_IDS = SWARM.map((a) => a.id)
export function runSwarm(b: Bar[], x: { btc?: Bar[] }): Record<string, number> {
  const out: Record<string, number> = {}
  for (const a of SWARM) { let d = 0; try { d = a.run(b, x) } catch { d = 0 } out[a.id] = d > 0 ? 1 : d < 0 ? -1 : 0 }
  return out
}

// ── shadow learning ────────────────────────────────────────────────────────
// Every meeting stores each agent's vote per coin with the mid price. Five
// minutes later the move is known: edge = dir * return (gross). Sums are
// exponentially decayed (half-life 12h) so the scores follow the current market.
export const LEARN = { horizonMs: 5 * 60_000, halfLifeMs: 12 * 3600_000, minN: 100, lo: 0, hi: 2.5, benchT: -2 } as const
export interface Stat { agent: string; n: number; s: number; s2: number; updated_at: string }
export function decayStat(st: Stat | undefined, agent: string, now: number): Stat {
  if (!st) return { agent, n: 0, s: 0, s2: 0, updated_at: new Date(now).toISOString() }
  const dt = Math.max(0, now - Date.parse(st.updated_at)), f = Number.isFinite(dt) ? Math.pow(0.5, dt / LEARN.halfLifeMs) : 1
  return { agent, n: st.n * f, s: st.s * f, s2: st.s2 * f, updated_at: new Date(now).toISOString() }
}
// snapshot: votes[sym][agent] = dir, px0[sym] = mid then; px1[sym] = mid now
export function scoreSnapshot(stats: Record<string, Stat>, votes: Record<string, Record<string, number>>, px0: Record<string, number>, px1: Record<string, number>, now: number): Record<string, Stat> {
  const out: Record<string, Stat> = {}
  const touch = (a: string) => (out[a] ??= decayStat(stats[a], a, now))
  for (const [sym, vs] of Object.entries(votes)) {
    const r = px1[sym] / px0[sym] - 1
    if (!Number.isFinite(r)) continue
    for (const [a, d] of Object.entries(vs)) {
      if (!d) continue
      const st = touch(a), e = d * r * 1e4   // basis points
      st.n += 1; st.s += e; st.s2 += e * e
    }
  }
  return out
}
export function tStat(st: Stat | undefined): number {
  if (!st || st.n < 2) return 0
  const m = st.s / st.n, v = Math.max(0, st.s2 / st.n - m * m), se = Math.sqrt(v / st.n)
  return se > 0 ? m / se : 0
}
// weight = 1 + t/2, clamped [0, 2.5]; below minN effective votes the agent keeps 1.
// t <= -2 means consistently wrong -> weight 0 = benched (still scored, can return).
export function learnedWeight(st: Stat | undefined): number {
  if (!st || st.n < LEARN.minN) return 1
  return Math.round(Math.min(LEARN.hi, Math.max(LEARN.lo, 1 + tStat(st) / 2)) * 100) / 100
}
export const meanBps = (st: Stat | undefined) => (st && st.n > 0 ? st.s / st.n : 0)

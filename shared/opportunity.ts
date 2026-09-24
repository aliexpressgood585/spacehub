// v87.0 — AGGRESSIVE DEMO: more opportunities, same honest costs.
//
// What changed against v86 (owner, 2026-09-24): "more opportunities and trades in demo, never trades for their own sake;
// keep every cost; soften the profit gate without removing it; a weighted score instead of hard blocks; Top-N by
// expected net value; 5m-4h, especially 5m/15m; 6-8 positions without dangerous correlation; a portfolio risk manager;
// graded limits, no loss kill switch; dynamic sizing; real data only; signal expiry; show what is missing to pass".
//
// 1. CANDIDATES: every coin x side that at least one EVIDENCED agent backs — no longer only the side the whole team's
//    majority picked. v86 averaged every backer, and the ~90% of agents with a negative measured edge buried the few
//    with a real one (replay 2026-09-24: 3,318 candidates, best net -25.6 bps, all rejected — and correctly: they
//    realised -17 bps net at 15 min). An agent is EVIDENCED when its measured net edge at its horizon is positive with
//    overlap- and cross-coin-corrected t >= tMin. Evidence is shrunk: credit = clamp((t - 0.5)/2, 0, 1), so t=1 counts
//    25%, t=2.5 (the "proven" bar) counts in full. Evidenced agents voting AGAINST subtract their credited edge.
// 2. PROFIT GATE, SOFTENED NOT REMOVED: the full cost model (shared/costs.ts) still prices every candidate; the
//    required net margin falls from 2 bps to COST.marginBps (0.5). Net must stay positive.
// 3. WEIGHTED SCORE: former hard filters (team majority, EMA trend, spread, 1-minute range, book imbalance) are now
//    small penalties/bonuses in bps on top of the net edge. A strong edge passes with a weak secondary filter; a
//    marginal edge does not. Hard blocks remain ONLY for data validity and safety: no book, stale signal (TTL), book
//    too thin, no evidence, net below margin, dangerous correlation, portfolio caps.
// 4. TOP-N: survivors are ranked by expected net dollars per hour of capital (net bps x notional / hold), which
//    naturally favours the 5m/15m horizons, and the best N (graded by the risk tier) are taken.
// 5. PORTFOLIO RISK MANAGER: <= OPP.maxPositions open, <= maxSameSide on one side, gross exposure <= maxGross of
//    equity, net directional exposure <= maxNet, a candidate whose correlation load with the same-direction book is
//    >= maxCorrLoad is rejected ('correlated_book'), lower loads only shrink the size.
// 6. SIZING: risk budget at the stop (the stop is ATR-based, so volatility is in it) x graded risk tier x edge
//    multiplier (net bps) x exposure multiplier x correlation multiplier, capped per coin. Leverage stays 1x.
// Nothing here fetches data: every input is a measurement the runner already made, and what is estimated is labelled.
import { COST } from './costs.ts'
import { SCALP } from './scalp.ts'

export const OPP = {
  tMin: 1,              // an agent counts as evidence only at corrected t >= 1 with a positive measured net edge
  tFull: 2.5,           // ... and in full at the "proven" bar
  maxPositions: SCALP.maxPositions,   // owner: 6-8 parallel positions in demo (8; the ledger enforces the same number)
  maxSameSide: SCALP.maxSameSide,     // never more than 5 of the 8 on one side
  maxGross: SCALP.allocation,         // total open notional <= 90% of equity (1x, no borrowing)
  maxNet: 0.6,          // |long - short| notional <= 60% of equity
  maxCorrLoad: 1.5,     // same-direction correlation load at or above this = the book already holds this bet
  quoteTtlMs: 20_000,   // a signal priced on a quote older than this has expired (the ledger enforces the same 20 s)
  barTtlMs: 150_000,    // the newest closed 1-minute bar must have closed within 2.5 min
  entriesByTier: { full: 3, reduced: 2, defensive: 1, minimal: 1, unknown: 0 } as Record<string, number>,
} as const

export interface EdgeBacker { agent: string; w: number; netBps: number; t: number; h: number }
export const credit = (t: number) => Math.max(0, Math.min(1, (t - 0.5) / (OPP.tFull - 0.5)))
export const evidenced = (b: EdgeBacker) => b.w > 0 && Number.isFinite(b.netBps) && b.netBps > 0 && b.t >= OPP.tMin

// Expected GROSS edge of one coin x side from evidenced agents only. Learning stores NET of the learning round trip,
// so gross = net + learnRoundTripBps; the live, trade-specific cost is charged afterwards by the profit gate.
export function evidenceEdge(pro: EdgeBacker[], con: EdgeBacker[]): { bps: number; n: number; nCon: number; holdMin: number; agents: string[] } {
  const P = pro.filter(evidenced), C = con.filter(evidenced)
  if (!P.length) return { bps: NaN, n: 0, nCon: C.length, holdMin: 0, agents: [] }
  const val = (b: EdgeBacker) => b.w * credit(b.t) * (b.netBps + COST.learnRoundTripBps)
  const W = [...P, ...C].reduce((s, b) => s + b.w * credit(b.t), 0)
  const bps = W > 0 ? (P.reduce((s, b) => s + val(b), 0) - C.reduce((s, b) => s + val(b), 0)) / W : NaN
  // planned hold: weighted median horizon of the evidenced backers
  const byH = [...P].sort((a, b) => a.h - b.h), tot = byH.reduce((s, b) => s + b.w * credit(b.t), 0)
  let acc = 0, holdMin = byH[0].h
  for (const b of byH) { acc += b.w * credit(b.t); if (acc >= tot / 2) { holdMin = b.h; break } }
  return { bps: +bps.toFixed(2), n: P.length, nCon: C.length, holdMin, agents: P.map((b) => b.agent) }
}

// Secondary filters as score adjustments (bps). Positive = helps, negative = hurts. None of them can block alone.
export interface Secondary { weighted: number; side: 1 | -1; trend: number; spreadBps: number; rangeOk: boolean; imbalance: number }
export function adjustments(x: Secondary): { bps: number; parts: Record<string, number> } {
  const agree = Math.sign(x.weighted) === x.side ? Math.abs(x.weighted) : -Math.abs(x.weighted)
  const parts: Record<string, number> = {
    team: +(agree * 3).toFixed(2),                                         // the whole team's weighted view, -3..+3
    trend: x.trend === -x.side ? -1.5 : x.trend === x.side ? 0.5 : 0,       // EMA8/21 against: a penalty, not a veto
    spread: x.spreadBps > 10 ? -+(x.spreadBps - 10).toFixed(2) : 0,          // beyond 10 bps quoted spread (cost already charged)
    range: x.rangeOk ? 0 : -2,                                               // 1-minute range too small for the round trip
    flow: Math.abs(x.imbalance) >= 0.1 ? (Math.sign(x.imbalance) === x.side ? 0.5 : -0.5) : 0, // book imbalance
  }
  return { bps: +Object.values(parts).reduce((s, v) => s + v, 0).toFixed(2), parts }
}

// Signal expiry. A signal is only as fresh as the oldest thing it was computed from.
export function signalAge(now: number, quoteTs: number, lastBarOpen: number): { quoteMs: number; barMs: number; fresh: boolean; why: string } {
  const quoteMs = now - quoteTs, barMs = now - (lastBarOpen + 60_000)
  const fresh = Number.isFinite(quoteMs) && Number.isFinite(barMs) && quoteMs <= OPP.quoteTtlMs && barMs <= OPP.barTtlMs
  return { quoteMs, barMs, fresh, why: fresh ? '' : quoteMs > OPP.quoteTtlMs ? `ציטוט בן ${Math.round(quoteMs / 1000)}ש׳ > ${OPP.quoteTtlMs / 1000}ש׳` : `נר אחרון נסגר לפני ${Math.round(barMs / 1000)}ש׳ > ${OPP.barTtlMs / 1000}ש׳` }
}

// Dynamic size. stopPct is ATR-based (volatility), riskMult the graded tier, netBps the expected edge.
export function sizeFor(x: { equity: number; stopPct: number; riskMult: number; netBps: number; exposure: number; corrMult: number; perCoin: number; riskPerTrade: number }): { notional: number; edgeMult: number; expoMult: number } {
  if (!(x.equity > 0) || !(x.stopPct > 0)) return { notional: 0, edgeMult: 0, expoMult: 0 }
  const edgeMult = Math.max(0.5, Math.min(1.5, 0.5 + x.netBps / 10))                    // net 5 bps -> 1.0, 10+ -> 1.5
  const expoMult = Math.max(0.25, 1 - 0.75 * Math.max(0, x.exposure) / (x.equity * OPP.maxGross))
  const risk = x.equity * x.riskPerTrade * x.riskMult / Math.max(0.003, x.stopPct)
  return { notional: Math.max(0, Math.min(x.equity * x.perCoin, risk * edgeMult * expoMult * x.corrMult)), edgeMult: +edgeMult.toFixed(3), expoMult: +expoMult.toFixed(3) }
}

// Portfolio risk manager: walks the ranked candidates, best first, and returns what may open and why the rest may not.
export interface BookPos { side: number; notional: number }
export interface RankedCand { key: string; side: 1 | -1; notional: number; corrLoad: number }
export function portfolioPlan(cands: RankedCand[], book: BookPos[], equity: number, limit: number): Map<string, { ok: boolean; reason: string; missing: string }> {
  const out = new Map<string, { ok: boolean; reason: string; missing: string }>()
  let open = book.length, gross = book.reduce((s, p) => s + p.notional, 0), net = book.reduce((s, p) => s + p.side * p.notional, 0), taken = 0
  const cnt: Record<number, number> = { 1: book.filter((p) => p.side === 1).length, [-1]: book.filter((p) => p.side === -1).length }
  for (const c of cands) {
    const no = (reason: string, missing: string) => out.set(c.key, { ok: false, reason, missing })
    if (taken >= limit) { no('ranked_below_cut', `דירוג מתחת ל-${limit} הטובות בישיבה`); continue }
    if (open >= OPP.maxPositions) { no('book_full', `התיק מלא ${open}/${OPP.maxPositions}`); continue }
    if (cnt[c.side] >= OPP.maxSameSide) { no('same_side_cap', `כבר ${cnt[c.side]} פוזיציות ב${c.side === 1 ? 'לונג' : 'שורט'} (תקרה ${OPP.maxSameSide})`); continue }
    if (c.corrLoad >= OPP.maxCorrLoad) { no('correlated_book', `עומס קורלציה ${c.corrLoad.toFixed(2)} ≥ ${OPP.maxCorrLoad}`); continue }
    const n = Math.min(c.notional, equity * OPP.maxGross - gross, c.side * net >= 0 ? equity * OPP.maxNet - Math.abs(net) : Infinity)
    if (!(n >= 20)) { no('exposure_cap', `חשיפה ${Math.round(gross / Math.max(1, equity) * 100)}% / נטו ${Math.round(Math.abs(net) / Math.max(1, equity) * 100)}% — אין מקום`); continue }
    out.set(c.key, { ok: true, reason: 'taken', missing: '' })
    c.notional = n; open++; taken++; cnt[c.side]++; gross += n; net += c.side * n
  }
  return out
}

// What would it take to pass: a short, honest line for the dashboard.
export function missingFor(reason: string, x: { netBps?: number; costBps?: number; nEvidence?: number; age?: string }): string {
  switch (reason) {
    case 'no_edge_estimate': return `אין סוכן עם יתרון נטו מוכח (t≥${OPP.tMin}) שתומך בצד הזה`
    case 'no_gross_edge': case 'costs_exceed_edge': return `חסרים ${Math.max(0, COST.marginBps - (x.netBps ?? 0)).toFixed(1)} נק׳ בסיס נטו (עלות ${x.costBps ?? '—'})`
    case 'weak_score': return `ציון אחרי קנסות משניים חסר ${Math.max(0, COST.marginBps - (x.netBps ?? 0)).toFixed(1)} נק׳ בסיס`
    case 'book_too_thin': return 'עומק הספר לא מספיק לגודל הזה'
    case 'no_book': return 'אין ספר פקודות אמיתי'
    case 'stale_signal': return `האות פג תוקף: ${x.age ?? ''}`
    default: return ''
  }
}

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
  // v91.0 EXPLORATION tier (owner, 2026-09-25: "loosen it a bit so trades happen"). Used only when NO agent passes
  // the full evidence test. An agent counts when its GROSS edge is positive and its t corrected for OVERLAP only
  // (not for the cross-coin correlation) is >= tMin; its measured gross edge is used UNSHRUNK. The full cost model
  // and the profit gate are unchanged (net >= COST.marginBps), but size is a quarter of normal and at most maxOpen
  // exploration positions are open at once, so a wrong estimate costs little while live fills are measured.
  // v91.1: plus >= minIndep INDEPENDENT periods behind the estimate (scored snapshots x meeting minutes / horizon).
  // The first hour of v91.0 traded agents whose whole record was 1-57 snapshots of ONE market move (c_multi_tf@60:
  // 57 snapshots = under one independent hour, raw t 15 from 40 coins moving together) — market beta, not edge.
  explore: { tMin: 1, sizeMult: 0.25, maxOpen: 2, minIndep: 20 },
} as const

// v89.0 CALIBRATION FIX: v87 shrank each backer's GROSS edge by a credit computed from its NET t (and required a
// positive NET edge first), i.e. it charged the round trip twice — once inside the evidence test and again in the
// profit gate. Now the evidence test and the shrinkage both work on the GROSS edge (the thing the gate prices), with
// the standard James-Stein factor 1 - 1/tg^2 (tg = overlap- and cross-coin-corrected t of the GROSS mean): gross t 1
// -> 0 (no evidence), 1.5 -> 0.56, 2 -> 0.75, 3 -> 0.89. The profit gate then charges the real, trade-specific cost
// ONCE. `tg` falls back to the net t shifted by the learning round trip only if a caller cannot supply it.
export interface EdgeBacker { agent: string; w: number; netBps: number; t: number; h: number; tg?: number; to?: number; ind?: number }
export const grossT = (b: EdgeBacker) => (Number.isFinite(b.tg) ? (b.tg as number) : b.t)
export const shrink = (tg: number) => (Number.isFinite(tg) && tg > OPP.tMin ? Math.min(1, 1 - 1 / (tg * tg)) : 0)
export const credit = (t: number) => shrink(t)   // kept for callers/tests: the credit of a GROSS t
export const evidenced = (b: EdgeBacker) => b.w > 0 && Number.isFinite(b.netBps) && b.netBps + COST.learnRoundTripBps > 0 && grossT(b) > OPP.tMin

// Expected GROSS edge of one coin x side from evidenced agents only. Learning stores NET of the learning round trip,
// so gross = net + learnRoundTripBps; the live, trade-specific cost is charged afterwards by the profit gate.
export function evidenceEdge(pro: EdgeBacker[], con: EdgeBacker[]): { bps: number; n: number; nCon: number; holdMin: number; agents: string[]; conf: number } {
  const P = pro.filter(evidenced), C = con.filter(evidenced)
  if (!P.length) return { bps: NaN, n: 0, nCon: C.length, holdMin: 0, agents: [], conf: 0 }
  const val = (b: EdgeBacker) => b.w * shrink(grossT(b)) * (b.netBps + COST.learnRoundTripBps)
  const W = [...P, ...C].reduce((s, b) => s + b.w, 0)   // average (agents are correlated — never a sum), opposition subtracts
  const bps = W > 0 ? (P.reduce((s, b) => s + val(b), 0) - C.reduce((s, b) => s + val(b), 0)) / W : NaN
  // planned hold: weighted median horizon of the evidenced backers
  const byH = [...P].sort((a, b) => a.h - b.h), tot = byH.reduce((s, b) => s + b.w * shrink(grossT(b)), 0)
  let acc = 0, holdMin = byH[0].h
  for (const b of byH) { acc += b.w * shrink(grossT(b)); if (acc >= tot / 2) { holdMin = b.h; break } }
  const conf = +(P.reduce((s, b) => s + shrink(grossT(b)), 0) / P.length).toFixed(3)
  return { bps: +bps.toFixed(2), n: P.length, nCon: C.length, holdMin, agents: P.map((b) => b.agent), conf }
}

// v91.0 exploration estimate (see OPP.explore). `to` = overlap-corrected t of the GROSS mean, no cross-coin factor.
export const explorable = (b: EdgeBacker) => b.w > 0 && Number.isFinite(b.netBps) && b.netBps + COST.learnRoundTripBps > 0 && Number.isFinite(b.to) && (b.to as number) >= OPP.explore.tMin && (b.ind ?? 0) >= OPP.explore.minIndep
export function exploreEdge(pro: EdgeBacker[], con: EdgeBacker[]): { bps: number; n: number; nCon: number; holdMin: number; agents: string[]; conf: number } {
  const P = pro.filter(explorable), C = con.filter(explorable)
  if (!P.length) return { bps: NaN, n: 0, nCon: C.length, holdMin: 0, agents: [], conf: 0 }
  const val = (b: EdgeBacker) => b.w * (b.netBps + COST.learnRoundTripBps)
  const W = [...P, ...C].reduce((s, b) => s + b.w, 0)
  const bps = (P.reduce((s, b) => s + val(b), 0) - C.reduce((s, b) => s + val(b), 0)) / W
  const byH = [...P].sort((a, b) => a.h - b.h), tot = byH.reduce((s, b) => s + b.w, 0)
  let acc = 0, holdMin = byH[0].h
  for (const b of byH) { acc += b.w; if (acc >= tot / 2) { holdMin = b.h; break } }
  const conf = +(P.reduce((s, b) => s + Math.min(1, Math.max(0, 1 - 1 / ((b.to as number) ** 2))), 0) / P.length).toFixed(3)
  return { bps: +bps.toFixed(2), n: P.length, nCon: C.length, holdMin, agents: P.map((b) => b.agent), conf }
}

// Secondary filters as score adjustments (bps). Positive = helps, negative = hurts. None of them can block alone.
export interface Secondary { weighted: number; side: 1 | -1; trend: number; spreadBps: number; rangeOk: boolean; imbalance: number; trend4h?: number }
export function adjustments(x: Secondary): { bps: number; parts: Record<string, number> } {
  const agree = Math.sign(x.weighted) === x.side ? Math.abs(x.weighted) : -Math.abs(x.weighted)
  const parts: Record<string, number> = {
    team: +(agree * 3).toFixed(2),                                         // the whole team's weighted view, -3..+3
    trend: x.trend === -x.side ? -1.5 : x.trend === x.side ? 0.5 : 0,       // EMA8/21 against: a penalty, not a veto
    spread: x.spreadBps > 10 ? -+(x.spreadBps - 10).toFixed(2) : 0,          // beyond 10 bps quoted spread (cost already charged)
    range: x.rangeOk ? 0 : -2,                                               // 1-minute range too small for the round trip
    flow: Math.abs(x.imbalance) >= 0.1 ? (Math.sign(x.imbalance) === x.side ? 0.5 : -0.5) : 0, // book imbalance
    trend4h: !x.trend4h ? 0 : x.trend4h === x.side ? 0.5 : -1,                // v89.0: 4h context (confirmation, never a veto)
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
    case 'no_edge_estimate': return `אין סוכן עם יתרון מוכח (t≥${OPP.tMin}) וגם לא ברף החקירה (t חפיפה ≥${OPP.explore.tMin}) שתומך בצד הזה`
    case 'no_gross_edge': case 'costs_exceed_edge': return `חסרים ${Math.max(0, COST.marginBps - (x.netBps ?? 0)).toFixed(1)} נק׳ בסיס נטו (עלות ${x.costBps ?? '—'})`
    case 'weak_score': return `ציון אחרי קנסות משניים חסר ${Math.max(0, COST.marginBps - (x.netBps ?? 0)).toFixed(1)} נק׳ בסיס`
    case 'book_too_thin': return 'עומק הספר לא מספיק לגודל הזה'
    case 'no_book': return 'אין ספר פקודות אמיתי'
    case 'stale_signal': return `האות פג תוקף: ${x.age ?? ''}`
    default: return ''
  }
}

// v89.0 Top-N ranking value: expected net $ per hour of capital x confidence (mean evidence shrinkage of the backers)
// x execution quality (a wide quoted spread is worse execution even after its cost is charged). Components are
// journalled so the dashboard can show why one candidate outranked another.
export function rankValue(x: { scoreBps: number; bonusBps: number; notional: number; holdMin: number; conf: number; spreadBps: number }): { value: number; perHour: number; exec: number } {
  if (!Number.isFinite(x.scoreBps) || !(x.notional > 0) || !(x.holdMin > 0)) return { value: -Infinity, perHour: -Infinity, exec: 0 }
  const perHour = (x.scoreBps + Math.max(0, x.bonusBps)) * x.notional / 1e4 / (x.holdMin / 60)
  const exec = 1 / (1 + Math.max(0, x.spreadBps) / 10)
  return { value: perHour * Math.max(0.1, x.conf) * exec, perHour: +perHour.toFixed(4), exec: +exec.toFixed(3) }
}
// Which gate a reason code belongs to (dashboard: "Top Rejection Reasons").
export const GATE_OF: Record<string, string> = {
  stale_signal: 'data', no_book: 'data', engine_not_eligible: 'engine', no_edge_estimate: 'evidence',
  no_gross_edge: 'profit_gate', costs_exceed_edge: 'profit_gate', book_too_thin: 'profit_gate', weak_score: 'score',
  correlated_book: 'portfolio', book_full: 'portfolio', same_side_cap: 'portfolio', exposure_cap: 'portfolio',
  ranked_below_cut: 'top_n', no_capital: 'portfolio', other_side_taken: 'portfolio', explore_cap: 'portfolio', taken: 'executed',
}

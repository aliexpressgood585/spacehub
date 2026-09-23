// v72.0 — the "hedge-fund desk": four more agents that consult the nine existing
// ones every meeting. Pure functions over the bot's own rows; no network, no
// randomness. They do NOT add a trading signal: the entry rule stays the
// scalp majority rule. Compliance can only BLOCK (safety), never add exposure.
import { SCALP, type Vote } from './scalp.ts'

export const DESK_ROLES = ['pm', 'quant', 'compliance', 'execution'] as const
export const DIRECTIONAL = ['regime', 'rota', 'donch', 'trader', 'risk'] as const
export interface Minute extends Vote { round?: 1 | 2 | 3; to?: string; data?: Record<string, unknown> }

// Quant: how often each directional voter was on the right side of closed SCALP trades.
export function attribution(closed: any[]): Record<string, { n: number; right: number }> {
  const out: Record<string, { n: number; right: number }> = {}
  for (const r of DIRECTIONAL) out[r] = { n: 0, right: 0 }
  for (const t of closed) {
    const pnl = Number(t?.pnl), side = t?.side === 'LONG' ? 'long' : t?.side === 'SHORT' ? 'short' : ''
    const votes = t?.scalp_meta?.votes
    if (!side || !Number.isFinite(pnl) || !Array.isArray(votes)) continue
    for (const v of votes) {
      if (!(DIRECTIONAL as readonly string[]).includes(v?.who) || (v.vote !== 'long' && v.vote !== 'short')) continue
      out[v.who].n++
      if ((v.vote === side) === (pnl > 0)) out[v.who].right++
    }
  }
  return out
}
export const hitPct = (a: { n: number; right: number } | undefined) => (a && a.n ? Math.round((a.right / a.n) * 100) : null)

// Execution: what actually happened to fills — hold times and why trades ended.
export function execStats(closed: any[]) {
  const s = closed.filter((t) => t?.opened_at && t?.closed_at && Number.isFinite(Number(t?.pnl)))
  const holds = s.map((t) => (Date.parse(t.closed_at) - Date.parse(t.opened_at)) / 60_000).filter(Number.isFinite)
  const reasons: Record<string, number> = {}
  for (const t of s) { const r = String(t?.scalp_meta?.exit_reason ?? '—'); reasons[r] = (reasons[r] ?? 0) + 1 }
  const wins = s.filter((t) => Number(t.pnl) > 0).length
  const fees = s.reduce((a, t) => a + Number(t.fee ?? 0) + Number(t?.scalp_meta?.exit_fee ?? 0), 0)
  const net = s.reduce((a, t) => a + Number(t.pnl), 0)
  return { n: s.length, wins, avgHoldMin: holds.length ? holds.reduce((a, b) => a + b, 0) / holds.length : null, reasons, fees, net }
}

// Compliance: the hard limits, checked on the plan before it is sent to the ledger.
export function compliance(open: any[], entries: { sym: string; notional: number }[], equity: number, exposure: number): string[] {
  const bad: string[] = []
  if (open.some((t) => t.paper_mode !== true || Number(t.lev) !== 1)) bad.push('פוזיציה שאינה דמו 1x')
  if (open.length + entries.length > SCALP.maxPositions) bad.push(`יותר מ-${SCALP.maxPositions} פוזיציות`)
  const syms = [...open.map((t) => String(t.sym)), ...entries.map((e) => e.sym)]
  if (new Set(syms).size !== syms.length) bad.push('מטבע כפול')
  if (entries.some((e) => !(e.notional > 0) || e.notional > equity * SCALP.perCoin + 1e-6)) bad.push(`חריגה מ-${SCALP.perCoin * 100}% למטבע`)
  if (exposure > equity * SCALP.allocation + 1e-6) bad.push(`חשיפה מעל ${SCALP.allocation * 100}%`)
  return bad
}

const HE: Record<string, string> = { regime: 'נועה', rota: 'דניאל', donch: 'עומר', trader: 'רוני', risk: 'מיכל' }
// Round 2 + 3: the dissenters argue, the quant brings their record, the PM rules.
export function debate(best: { sym: string; side: number; score: number; votes: Vote[] } | undefined, att: Record<string, { n: number; right: number }>, opened: boolean, blocked: string[], now: number, held = false): Minute[] {
  const at = new Date(now).toISOString(), out: Minute[] = []
  if (!best) return [{ who: 'pm', says: 'אין מטבע עם נתונים תקינים לדיון. אין כניסה.', vote: 'hold', checked_at: at, round: 3 }]
  const dirs = best.votes.filter((v) => (DIRECTIONAL as readonly string[]).includes(v.who) && (v.vote === 'long' || v.vote === 'short'))
  const longs = dirs.filter((v) => v.vote === 'long').length, shorts = dirs.length - longs
  const lead = longs > shorts ? 'long' : shorts > longs ? 'short' : ''
  const against = lead ? dirs.filter((v) => v.vote !== lead) : []
  for (const v of against) out.push({ who: v.who, to: 'pm', says: `מתנגד/ת ל-${best.sym} ${lead === 'long' ? 'לונג' : 'שורט'}: ${v.says}`, vote: v.vote, checked_at: at, round: 2 })
  const rec = [...new Set([...against.map((v) => v.who), ...dirs.filter((v) => v.vote === lead).map((v) => v.who)])]
    .map((w) => { const p = hitPct(att[w]); return p === null ? '' : `${HE[w]} ${p}% (${att[w].n})` }).filter(Boolean)
  out.push({ who: 'quant', to: 'pm', says: rec.length ? `רקורד כיוון בעסקאות שנסגרו: ${rec.join(' · ')}. מדגם קטן — מידע בלבד, לא משנה את הכלל.` : 'אין עדיין עסקאות סגורות למדוד מי צודק.', vote: 'hold', checked_at: at, round: 2, data: att })
  const verdict = blocked.length ? `ציות חסם: ${blocked.join(', ')}. לא נשלחות כניסות.`
    : opened ? `${best.sym} ${best.side > 0 ? 'לונג' : 'שורט'} אושר: ${longs} בעד לונג מול ${shorts} בעד שורט, ללא התנגדות מגמת EMA.`
    : held ? `${best.sym} כבר מוחזק; אין מועמד חדש עם רוב נטו של 2. ממתינים.`
    : `${best.sym}: ${longs} לונג מול ${shorts} שורט — ${best.side ? 'אין מקום או הון פנוי' : 'אין רוב נטו של 2 או שהכיוון נגד מגמת EMA'}. ממתינים.`
  out.push({ who: 'pm', says: `החלטה: ${verdict}`, vote: blocked.length ? 'veto' : opened ? (best.side > 0 ? 'long' : 'short') : 'hold', checked_at: at, round: 3 })
  return out
}

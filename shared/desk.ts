// v72.0 — the "hedge-fund desk": four more agents that consult the nine existing
// ones every meeting. Pure functions over the bot's own rows; no network, no
// randomness. They do NOT add a trading signal: the entry rule stays the
// scalp majority rule. Compliance can only BLOCK (safety), never add exposure.
import { SCALP, type Vote } from './scalp.ts'
import { AGENTS, NEW_AGENTS } from './agents.ts'

export const DESK_ROLES = ['pm', 'quant', 'compliance', 'execution'] as const
export const DIRECTIONAL: readonly string[] = ['regime', 'rota', 'donch', 'trader', 'risk', ...NEW_AGENTS]
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

const HE: Record<string, string> = { regime: 'נועה', rota: 'דניאל', donch: 'עומר', trader: 'רוני', risk: 'מיכל', ...Object.fromEntries(NEW_AGENTS.map((k) => [k, AGENTS[k].name])) }
// Round 2 + 3: the dissenters argue, the quant brings their record, the PM rules.
export function debate(best: { sym: string; side: number; score: number; votes: Vote[]; weighted?: number; pro?: number; con?: number; holdMin?: number } | undefined, att: Record<string, { n: number; right: number }>, opened: boolean, blocked: string[], now: number, held = false, w: Record<string, number> = {}): Minute[] {
  const at = new Date(now).toISOString(), out: Minute[] = []
  if (!best) return [{ who: 'pm', says: 'אין מטבע עם נתונים תקינים לדיון. אין כניסה.', vote: 'hold', checked_at: at, round: 3 }]
  const wt = (k: string) => w[k] ?? 1
  const dirs = best.votes.filter((v) => DIRECTIONAL.includes(v.who) && (v.vote === 'long' || v.vote === 'short'))
  const longs = dirs.filter((v) => v.vote === 'long').length, shorts = dirs.length - longs
  const lw = dirs.filter((v) => v.vote === 'long').reduce((a, v) => a + wt(v.who), 0), sw = dirs.filter((v) => v.vote === 'short').reduce((a, v) => a + wt(v.who), 0)
  const lead = lw > sw ? 'long' : sw > lw ? 'short' : ''
  // the four heaviest dissenters speak; the rest are counted
  const against = (lead ? dirs.filter((v) => v.vote !== lead) : []).sort((a, b) => wt(b.who) - wt(a.who))
  for (const v of against.slice(0, 4)) out.push({ who: v.who, to: 'pm', says: `מתנגד/ת ל-${best.sym} ${lead === 'long' ? 'לונג' : 'שורט'} (משקל ${wt(v.who).toFixed(2)}): ${v.says.replace(`${best.sym}: `, '')}`, vote: v.vote, checked_at: at, round: 2 })
  if (against.length > 4) out.push({ who: 'reporter', to: 'pm', says: `עוד ${against.length - 4} מתנגדים בעלי משקל נמוך יותר.`, vote: 'hold', checked_at: at, round: 2 })
  const ranked = Object.entries(att).filter(([, a]) => a.n >= 5).map(([k, a]) => ({ k, p: hitPct(a) ?? 0, n: a.n })).sort((a, b) => b.p - a.p)
  const top = ranked.slice(0, 3).map((r) => `${HE[r.k] ?? r.k} ${r.p}% (${r.n}, משקל ${wt(r.k).toFixed(2)})`)
  const bottom = ranked.slice(-2).filter((r) => !ranked.slice(0, 3).includes(r)).map((r) => `${HE[r.k] ?? r.k} ${r.p}% (${r.n}, משקל ${wt(r.k).toFixed(2)})`)
  out.push({ who: 'quant', to: 'pm', says: ranked.length ? `הכי מדויקים: ${top.join(' · ')}${bottom.length ? `. הכי חלשים: ${bottom.join(' · ')}` : ''}. (דיוק בעסקאות שנסגרו — מידע בלבד; המשקל עצמו בא מלמידת הצל).` : 'אין עדיין מספיק עסקאות סגורות לדירוג לפי עסקאות; המשקל בא מלמידת הצל.', vote: 'hold', checked_at: at, round: 2, data: att })
  const score = `ציון משוקלל ${((best.weighted ?? 0) * 100).toFixed(0)}% (סף ${SCALP.minWeighted * 100}%), ${longs} לונג מול ${shorts} שורט`
  const verdict = blocked.length ? `ציות חסם: ${blocked.join(', ')}. לא נשלחות כניסות.`
    : opened ? `${best.sym} ${best.side > 0 ? 'לונג' : 'שורט'} אושר: ${score}, ללא התנגדות מגמת EMA. החזקה מתוכננת ${best.holdMin ?? 15} דק׳ (1–240), עם סגירה מוקדמת אם הצוות מתהפך.`
    : held ? `${best.sym} כבר מוחזק; אין מועמד חדש שעובר את הסף. ממתינים.`
    : `${best.sym}: ${score} — ${best.side ? 'אין מקום או הון פנוי' : 'לא עובר את הסף, אין יתרון של 2 בספירה, או נגד מגמת EMA'}. ממתינים.`
  out.push({ who: 'pm', says: `החלטה: ${verdict}`, vote: blocked.length ? 'veto' : opened ? (best.side > 0 ? 'long' : 'short') : 'hold', checked_at: at, round: 3 })
  return out
}

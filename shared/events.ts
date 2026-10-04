// H7 — exchange-announcement events (owner 2026-10-01: "build and find a way to profit from fast trading").
// v114bt-D found that Binance listing / delisting announcements move the USDT-M perp 6-13% in the FIRST minute (too fast
// for a polling bot) and that what follows is close to a coin flip with very fat tails (24 listings in 27 months,
// win rate 54%). This file freezes a forward test of the part a bot CAN trade. Rules are pre-registered in
// quant/PREREGISTRATION_H7.md; a changed rule is a new id with a new T0. VIRTUAL ONLY (fwd_trades). Pure functions.

export type EventKind = 'LIST' | 'DELIST'
export interface Article { releaseDate: number; title: string }
export interface EvHyp { id: string; kind: EventKind; side: 1 | -1; holdMs: number; maxLagMs: number; costRt: number }

// LIST = "Binance Will List <Name> (<SYM>)" on a coin that already has a USDT-M perp -> LONG the perp.
// DELIST = "Binance Will Delist A, B and C on <date>" -> SHORT each perp. Hold 60 / 240 min. An announcement first seen
// more than 10 minutes after its release is skipped (the move is gone; counting it would flatter nothing but noise).
// Cost 40 bps round trip: books are thin and spreads wide in the minutes after a listing or delisting.
export const EV_HYPS: EvHyp[] = [
  { id: 'H7L60', kind: 'LIST', side: 1, holdMs: 60 * 60e3, maxLagMs: 10 * 60e3, costRt: 0.004 },
  { id: 'H7L240', kind: 'LIST', side: 1, holdMs: 240 * 60e3, maxLagMs: 10 * 60e3, costRt: 0.004 },
  { id: 'H7D60', kind: 'DELIST', side: -1, holdMs: 60 * 60e3, maxLagMs: 10 * 60e3, costRt: 0.004 },
  { id: 'H7D240', kind: 'DELIST', side: -1, holdMs: 240 * 60e3, maxLagMs: 10 * 60e3, costRt: 0.004 },
]
export const EV_CATALOGS = [48, 161] as const   // Binance CMS: 48 = new cryptocurrency listing, 161 = delisting

export function parseAnnouncement(title: string): { kind: EventKind; syms: string[] } | null {
  const t = String(title ?? '').trim()
  const l = t.match(/^Binance Will List .+? \(([A-Z0-9]{2,15})\)/)
  if (l) return { kind: 'LIST', syms: [l[1]] }
  const d = t.match(/^Binance Will Delist (.+?) on \d{4}-\d{2}-\d{2}/)
  if (d) {
    const syms = d[1].split(/,| and /).map(s => s.trim()).filter(s => /^[A-Z0-9]{2,15}$/.test(s))
    return syms.length ? { kind: 'DELIST', syms } : null
  }
  return null
}

// the USDT-M perp a coin trades as on Binance (plain, or the 1000x contract), if one exists right now
export function perpOf(sym: string, perps: Set<string>): string | null {
  for (const s of [`${sym}USDT`, `1000${sym}USDT`]) if (perps.has(s)) return s
  return null
}

export interface EvRow { hyp: string; symbol: string; settle_at: string; side: number; entry_px: number; exit_due: string; note: string }

// Virtual entries for this run. settle_at carries the announcement time (the fwd_trades key is hyp+symbol+settle_at).
export function eventEntries(arts: Article[], marks: Map<string, number>, now: number, taken: Set<string>): EvRow[] {
  const out: EvRow[] = [], perps = new Set(marks.keys())
  for (const a of arts) {
    const ev = parseAnnouncement(a.title), T = Number(a.releaseDate)
    if (!ev || !(T > 0) || T > now) continue
    for (const h of EV_HYPS) {
      if (h.kind !== ev.kind || now - T > h.maxLagMs) continue
      for (const s of ev.syms) {
        const sym = perpOf(s, perps); if (!sym) continue
        const px = Number(marks.get(sym)); if (!(px > 0)) continue
        const key = `${h.id}:${sym}:${T}`
        if (taken.has(key)) continue
        taken.add(key)
        out.push({ hyp: h.id, symbol: sym, settle_at: new Date(T).toISOString(), side: h.side, entry_px: px,
          exit_due: new Date(now + h.holdMs).toISOString(), note: `lag ${Math.round((now - T) / 1000)}s · ${String(a.title).slice(0, 120)}` })
      }
    }
  }
  return out
}

// Net result as a fraction of notional: the price move on our side, minus the funding the position PAID over the
// hold (sum of settled rates; positive rate = longs pay), minus the round-trip cost.
export function eventNet(side: number, entry: number, exit: number, fundingSum: number, costRt: number): number {
  return side * (exit / entry - 1) - side * fundingSum - costRt
}

// ── BLADE additions (quant/PREREGISTRATION_BLADE.md). The H7 parser above is FROZEN by its own pre-registration and is
// left byte-for-byte as it was; Blade uses the stricter, more tolerant parser below. ────────────────────────────────
// Tolerates non-breaking / repeated spaces, a trailing period, and the Oxford comma ("A, B, and C"). Still refuses
// "Binance Futures Will Delist ..." (perp delisting) and "Notice of Removal ..." (pair removal).
export function parseAnnouncementV2(title: string): { kind: EventKind; syms: string[] } | null {
  const t = String(title ?? '').replace(/[  -​]/g, ' ').replace(/\s+/g, ' ').trim()
  const l = t.match(/^Binance Will List [^()]+? \(([A-Z0-9]{2,15})\)/)
  if (l) return { kind: 'LIST', syms: [l[1]] }
  const d = t.match(/^Binance Will Delist (.+?) on \d{4}-\d{2}-\d{2}/)
  if (d) {
    const syms = d[1].split(/\s*,\s*(?:and\s+)?|\s+and\s+/).map(s => s.trim()).filter(s => /^[A-Z0-9]{2,15}$/.test(s))
    return syms.length ? { kind: 'DELIST', syms } : null
  }
  return null
}
// age of an announcement at the decision moment (ms); NaN when the release time is missing or in the future
export function announcementAge(releaseDate: number, now: number): number {
  const T = Number(releaseDate)
  return T > 0 && T <= now + 1000 ? Math.max(0, now - T) : NaN
}
// detect_lag_ms: first moment OUR process saw the article minus its release time. firstSeen is remembered across
// cycles (an article seen again later keeps its first lag), so the number measures the detector, not the decision.
export function detectLag(firstSeen: number, releaseDate: number): number {
  const T = Number(releaseDate), s = Number(firstSeen)
  return T > 0 && s > 0 ? Math.max(0, s - T) : NaN
}
export function median(xs: number[]): number {
  const a = xs.filter(Number.isFinite).sort((p, q) => p - q)
  if (!a.length) return NaN
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2
}

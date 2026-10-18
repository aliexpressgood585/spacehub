// CLV + Brier for the Polymarket paper desks (docs/POLY_PLAYBOOK.md, chapter 7). Observation only, never touches cash.
// Closing line = the last mid ((best bid + best ask) / 2; best bid alone if there is no ask) seen strictly before the
// market's scheduled end. CLV per trade = close / entry - 1 (did we buy below where the market closed?). It is the
// earliest sign of a real edge: it needs tens of trades, not the hundreds a win-rate test needs.
// Brier (market) = (entry price - outcome)^2: how well the price we paid called the result; compared with the closing
// line's Brier it shows whether the market got sharper after we bought.
export function clvMark(t: { end_time?: string; meta?: any }, bid: number | null | undefined, ask: number | null | undefined, nowMs: number) {
  if (!(bid != null && bid > 0)) return
  const end = Date.parse(t.end_time ?? '')
  if (Number.isFinite(end) && nowMs >= end) return
  const mid = ask != null && ask > 0 && ask >= bid ? (bid + ask) / 2 : bid
  t.meta = t.meta ?? {}
  t.meta.close_px = mid
  t.meta.close_at = new Date(nowMs).toISOString()
}

export function clvStudy(trades: any[], since = '') {
  const c = trades.filter((t) => t.status === 'CLOSED' && (t.opened_at ?? '') >= since && t.meta?.close_px > 0 && t.entry_px > 0
    && (t.exit_px === 1 || t.exit_px === 0))
  const o = trades.filter((t) => t.status === 'OPEN' && (t.opened_at ?? '') >= since && t.meta?.close_px > 0 && t.entry_px > 0)
  const n = c.length
  const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)
  const r = c.map((t) => t.meta.close_px / t.entry_px - 1)
  const m = mean(r), sd = n > 1 ? Math.sqrt(r.reduce((a, x) => a + (x - m!) ** 2, 0) / (n - 1)) : null
  return {
    n, since: since || null,
    clv_c: mean(c.map((t) => 100 * (t.meta.close_px - t.entry_px))),
    clv_pct: m == null ? null : 100 * m,
    clv_t: m != null && sd ? (m / sd) * Math.sqrt(n) : null,
    beat_close: n ? c.filter((t) => t.meta.close_px > t.entry_px).length / n : null,
    brier_entry: mean(c.map((t) => (t.entry_px - t.exit_px) ** 2)),
    brier_close: mean(c.map((t) => (t.meta.close_px - t.exit_px) ** 2)),
    open_n: o.length,
    open_clv_c: mean(o.map((t) => 100 * (t.meta.close_px - t.entry_px))),   // running, not final
  }
}

// ── Pre-resolution closing line: the 30-minute MARKOUT (2026-10-18, main Poly desk only) ──────────────────────────────
// Why: close_px above = last mid before the SCHEDULED end. On the main desk (esports/sports, bought in play) the match is
// usually over by then, so close_px is the result itself (live: Brier at close 0.011 vs 0.111 at entry) and its CLV says
// nothing about edge. Definition used instead (measurement only, never read by a trading decision):
//   m30_px = the mid ((bid + ask) / 2; bid alone if no ask / crossed) at the first desk mark taken >= 30 min after the
//   position was opened, while the market is still OPEN and unresolved (the runner settles resolved markets before it marks).
// Missing stays missing: a position resolved within 30 min, or first marked more than 30 min late (MARKOUT_LATE_MIN), keeps
// m30_px = null and is counted as `missing`, never as 0. Only positions whose tracking started in time (m30_tracked, set on
// the first mark before the 30-min point) count, so trades opened before this existed are excluded, not imputed.
// Caveat: entry_px is the average fill incl. top-ups, which can happen after the markout.
export const MARKOUT_MIN = 30, MARKOUT_LATE_MIN = 30
export function markout(t: { opened_at?: string; meta?: any }, bid: number | null | undefined, ask: number | null | undefined, nowMs: number) {
  const open = Date.parse(t.opened_at ?? '')
  if (!Number.isFinite(open)) return
  t.meta = t.meta ?? {}
  const due = open + MARKOUT_MIN * 60_000
  if (nowMs < due) { t.meta.m30_tracked = true; return }
  if (!t.meta.m30_tracked || t.meta.m30_px != null || t.meta.m30_late) return
  if (nowMs > due + MARKOUT_LATE_MIN * 60_000) { t.meta.m30_late = true; return }
  if (!(bid != null && bid > 0)) return
  t.meta.m30_px = ask != null && ask > 0 && ask >= bid ? (bid + ask) / 2 : bid
  t.meta.m30_at = new Date(nowMs).toISOString()
}
export function markoutStudy(trades: any[], since = '') {
  const all = trades.filter((t) => t.status === 'CLOSED' && (t.opened_at ?? '') >= since && t.meta?.m30_tracked && t.entry_px > 0
    && (t.exit_px === 1 || t.exit_px === 0))
  const c = all.filter((t) => t.meta.m30_px > 0), n = c.length
  const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)
  const d = c.map((t) => 100 * (t.meta.m30_px - t.entry_px)), m = mean(d)
  const sd = n > 1 && m != null ? Math.sqrt(d.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1)) : null
  return {
    def: `mid ${MARKOUT_MIN} min after entry, market still open`, n, missing: all.length - n, since: since || null,
    clv_c: m, clv_t: m != null && sd ? (m / sd) * Math.sqrt(n) : null,
    beat: n ? c.filter((t) => t.meta.m30_px > t.entry_px).length / n : null,
    brier_entry: mean(c.map((t) => (t.entry_px - t.exit_px) ** 2)),
    brier_m30: mean(c.map((t) => (t.meta.m30_px - t.exit_px) ** 2)),
  }
}

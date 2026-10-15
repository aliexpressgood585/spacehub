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

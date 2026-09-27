// Compact rolling CLOSED-price history. Persist closes only; intrabar candles never enter statistics.
import { CHAN, type Bar } from './chan.ts'

export interface ChanHistory { last: number; closes: number[] }

export function historyBars(h: ChanHistory | undefined): Bar[] {
  if (!h || !Number.isFinite(h.last) || !Array.isArray(h.closes) ||
      h.closes.some(x => !Number.isFinite(x) || x <= 0)) return []
  return h.closes.map((c, i) => ({ t: h.last - (h.closes.length - 1 - i) * CHAN.barMs, o: c, h: c, l: c, c }))
}

export function mergeHistory(h: ChanHistory | undefined, recent: Bar[], closedAt: number): ChanHistory | null {
  const rows = new Map<number, Bar>()
  for (const b of [...historyBars(h), ...recent]) {
    if (b.t + CHAN.barMs <= closedAt && b.t % CHAN.barMs === 0 && Number.isFinite(b.c) && b.c > 0) rows.set(b.t, b)
  }
  const bars = [...rows.values()].sort((a, b) => a.t - b.t).slice(-CHAN.bars)
  if (bars.length < CHAN.bars || bars.at(-1)!.t + CHAN.barMs !== closedAt) return null
  if (bars.some((b, i) => i > 0 && b.t - bars[i - 1].t !== CHAN.barMs)) return null
  return { last: bars.at(-1)!.t, closes: bars.map(b => b.c) }
}

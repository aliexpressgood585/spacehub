// Experimental paper-only breakout/retest sleeve. Evaluated on CLOSED 5m bars.
// Independent from the daily Hurst/t-stat router; no profitability claim.
import { atrLast, type Bar } from './chan.ts'
export interface TrendPullback { side: 1 | -1; stop: number; atr: number; level: number; breakoutAt: number }
const ema = (xs: number[], period: number) => {
  let v = xs[0]; return xs.map(x => (v += 2 / (period + 1) * (x - v)))
}
export function trendPullback(bars: Bar[]): TrendPullback | null {
  if (bars.length < 160) return null
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]
    if (![b.t,b.o,b.h,b.l,b.c].every(Number.isFinite) || b.l <= 0 ||
        b.h < Math.max(b.o,b.c) || b.l > Math.min(b.o,b.c) ||
        (i > 0 && b.t - bars[i-1].t !== 300000)) return null
  }
  const n = bars.length, last = bars[n-1], closes = bars.map(b => b.c)
  const fast = ema(closes,20), slow = ema(closes,50)
  const atr = atrLast(bars.map(b=>b.h),bars.map(b=>b.l),closes,14)
  if (!(atr > 0)) return null
  const side: 1 | -1 | 0 = fast[n-1] > slow[n-1] && slow[n-1] > slow[n-4] ? 1 :
    fast[n-1] < slow[n-1] && slow[n-1] < slow[n-4] ? -1 : 0
  if (!side) return null
  // Breakout occurred 1-3 closed bars ago, then retest and rejection of the level.
  for (let age = 1; age <= 3; age++) {
    const j = n-1-age, prev = bars.slice(j-24,j)
    const level = side > 0 ? Math.max(...prev.map(b=>b.h)) : Math.min(...prev.map(b=>b.l))
    if (side * (bars[j].c-level) <= 0 || side * (bars[j-1].c-level) > 0) continue
    const after = bars.slice(j+1), low = Math.min(...after.map(b=>b.l)), high = Math.max(...after.map(b=>b.h))
    const touch = side > 0 ? low <= level+0.25*atr : high >= level-0.25*atr
    const held = after.every(b=>side*(b.c-level) >= -0.25*atr)
    if (!touch || !held || side*(last.c-level) <= 0 ||
        side*(last.c-last.o) <= 0 || side*(last.c-bars[n-2].c) <= 0 ||
        Math.abs(last.c-level) > atr) continue
    const stop = side > 0 ? Math.min(low-0.25*atr,last.c-2*atr) : Math.max(high+0.25*atr,last.c+2*atr)
    if (stop <= 0) continue
    return { side, stop, atr, level, breakoutAt: bars[j].t }
  }
  return null
}

// v93.0 — BRKV: the owner's rule, "breakout with volume, target +7% / stop -4%".
// Measured in v107bt (69 coins, 36m, 4h bars): the in-sample pick 4h / N20 / volume >= 3x / long+short read
// +0.50% net per trade out-of-sample (n 1,067, WR 42.9% vs 35.8% for the same bracket on a random side).
// Robustness (years, neighbours, 10-slot portfolio, daily-clustered t) is v108bt. Pure functions only: the live
// runner and the tests import this file, so the rule is written down once.
export const BRKV = {
  N: 20,                        // prior completed 4h bars forming the range
  volMult: 3,                   // breakout bar volume >= 3 x the average of those N bars
  target: 0.07,                 // +7% from the entry fill
  stop: 0.04,                   // -4% from the entry fill
  timeoutMs: 14 * 86_400_000,   // 14 days, then out at market
  maxOpen: 10,                  // concurrent BRKV positions (v108bt part C)
  entryWindowMs: 30 * 60_000,   // enter only in the first 30 min after a 4h close (the backtest fills at the next bar open)
  barMs: 4 * 3_600_000,
}
export type Bar4 = { t: number; high: number; low: number; close: number; vol: number }

// +1 = close above the prior-N high on >= M x average volume, -1 = the mirror, 0 = nothing. `bars` are COMPLETED
// bars, oldest first; the signal is judged on the last one against the N before it.
export function brkvSignal(bars: Bar4[], N = BRKV.N, M = BRKV.volMult): 1 | -1 | 0 {
  if (bars.length < N + 1) return 0
  const b = bars[bars.length - 1], prior = bars.slice(-N - 1, -1)
  if (prior.some(p => !(p.high > 0) || !(p.low > 0) || !(p.vol >= 0))) return 0
  const hi = Math.max(...prior.map(p => p.high)), lo = Math.min(...prior.map(p => p.low))
  const avg = prior.reduce((s, p) => s + p.vol, 0) / N
  if (!(avg > 0) || !(b.vol >= M * avg)) return 0
  return b.close > hi ? 1 : b.close < lo ? -1 : 0
}

// the most recent 4h close at or before `now`
export const lastClose4h = (now: number) => Math.floor(now / BRKV.barMs) * BRKV.barMs

// exit decision for an open position given the executable mark (bid for a long, ask for a short)
export function brkvExit(side: 1 | -1, entry: number, mark: number, openedAt: number, now: number,
  target = BRKV.target, stop = BRKV.stop): 'STOP' | 'TARGET' | 'TIMEOUT' | null {
  if (!(entry > 0) || !(mark > 0)) return null
  const r = side * (mark / entry - 1)
  if (r <= -stop) return 'STOP'
  if (r >= target) return 'TARGET'
  if (now - openedAt >= BRKV.timeoutMs) return 'TIMEOUT'
  return null
}

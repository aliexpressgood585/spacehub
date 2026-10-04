// P-Q15 (owner override 2026-10-04, PAPER ONLY): "trade aggressively every fifteen minutes, and be profitable".
// Pure rules only; the live runner is supabase/functions/trading-bot/q15-runner.ts. Frozen in quant/PREREGISTRATION_Q15.md.
// Every COMPLETED 15m bar the liquid universe is scanned; the bot enters ONLY where all gates pass. A bar with no
// passing signal produces 0 entries (and a journal row per rejected candidate) — never a forced fill.
// Entry on the completed 15m bar i (LONG; SHORT is the mirror):
//  1. burst: 3-bar close move > 1.5 x ATR%(14) x sqrt(3)
//  2. volume: bar volume >= 2 x the 20-bar average
//  3. flow: taker imbalance over the last 3 bars > +0.10 (Binance taker-buy column; missing -> coin skipped)
//  4. BTC: BTC 15m close above its EMA20 (below for SHORT); BTC itself skips this
//  5. profit gate (runner): measured gross of Q15's own signals - full cost >= 2 bps
// Exit: stop 1.5 ATR (floor 0.4%), target 2R, timeout 8 bars (2h), stop before target. 10x isolated, 5%/trade, <= 8.
// HONEST: every 1m-1h price rule measured here had gross ~0 vs ~14-16 bps of costs; expect this sleeve mostly silent.
import { labInd, type LBar } from './lab.ts'

export const Q15 = { barMs: 900_000, zMin: 1.5, volMult: 2, imbMin: 0.10, stopAtr: 1.5, stopMinPct: 0.004, targetR: 2, holdBars: 8,
  entryWindowMs: 180_000, maxSpreadBps: 8, impactOfR: 0.25, maxPerDay: 20, levDefault: 10, levMax: 10, perTrade: 0.05, maxOpen: 8,
  share: 0.5, maint: 0.005, minNetBps: 2, minBars: 30, window: 600 } as const
export const Q15_HOLD_MIN = Q15.holdBars * 15

export interface Q15Sig { dir: 1 | -1; z: number; volRatio: number; imb: number; atr: number; atrPct: number; strength: number }
// null = no signal on this bar (the runner journals only signals that the gate or the book refused)
export function q15Signal(b: LBar[], btcUp: boolean | null, isBtc: boolean): Q15Sig | null {
  const i = b.length - 1
  if (i < 60) return null
  const I = labInd(b), ap = I.atrPct[i], av = I.av20[i]
  if (!(ap > 0) || !(av > 0)) return null
  const z = (b[i].close / b[i - 3].close - 1) / (ap * Math.sqrt(3)), volRatio = b[i].vol / av
  let fb = 0, fv = 0
  for (let k = i - 2; k <= i; k++) { const tb = b[k].tb; if (tb === undefined || !Number.isFinite(tb)) return null; fb += 2 * tb - b[k].vol; fv += b[k].vol }
  if (!(fv > 0)) return null
  const imb = fb / fv, dir: 1 | -1 = z > 0 ? 1 : -1
  if (Math.abs(z) <= Q15.zMin || volRatio < Q15.volMult || dir * imb <= Q15.imbMin) return null
  if (!isBtc && (btcUp === null || (dir > 0) !== btcUp)) return null
  return { dir, z, volRatio, imb, atr: I.atr[i], atrPct: ap, strength: Math.abs(z) * volRatio }
}
// BTC filter from closed 15m bars: close vs EMA20 (null = unknown -> every non-BTC signal is skipped)
export function q15BtcUp(btc: LBar[] | undefined): boolean | null {
  if (!btc || btc.length < 25) return null
  const I = labInd(btc), k = btc.length - 1
  return I.ema20[k] > 0 ? btc[k].close > I.ema20[k] : null
}
export function q15Levels(dir: 1 | -1, entry: number, atr: number) {
  const r = Math.max(Q15.stopAtr * atr, entry * Q15.stopMinPct)
  return { stop: entry - dir * r, target: entry + dir * Q15.targetR * r, r }
}
export const q15Liq = (dir: 1 | -1, entry: number, lev: number) => (lev > 1 ? entry * (1 - dir * (1 / lev - Q15.maint)) : dir > 0 ? 0 : Infinity)
// The bracket replayed on 1m bars (shadow measurement): stop before target inside a bar, timeout at the last bar's close.
// Returns the exit price and why. Bars must start at the entry minute; entry = the first bar's open.
export function q15Bracket(dir: 1 | -1, entry: number, stop: number, target: number, bars: LBar[], holdMin: number = Q15_HOLD_MIN): { px: number; why: 'STOP' | 'TARGET' | 'TIMEOUT' } | null {
  if (!bars.length) return null
  const t0 = bars[0].t, end = t0 + holdMin * 60_000
  let last: LBar | null = null
  for (const x of bars) {
    if (x.t >= end) break
    last = x
    const adv = dir > 0 ? x.low : x.high, fav = dir > 0 ? x.high : x.low
    if (dir * (adv - stop) <= 0) return { px: dir * (x.open - stop) <= 0 ? x.open : stop, why: 'STOP' }   // gap through the stop fills at the open
    if (dir * (fav - target) >= 0) return { px: target, why: 'TARGET' }
  }
  return last && last.t + 60_000 >= end ? { px: last.close, why: 'TIMEOUT' } : null   // incomplete window -> not scored yet
}
// Expected gross from closed shadow rows, clustered by signal bar (one market burst fires many coins at once).
// Evidence weighting as shared/costs.ts: positive mean x clamp(t/2,0,1), a negative mean counts in full; < 30 bars -> NaN.
export function q15Edge(rows: { bar: number; gross_bps: number }[]): { bps: number; n: number; bars: number; mean: number; t: number } {
  const ok = rows.filter(r => Number.isFinite(r.gross_bps) && Number.isFinite(r.bar)).slice(-Q15.window)
  const by = new Map<number, number[]>()
  for (const r of ok) { if (!by.has(r.bar)) by.set(r.bar, []); by.get(r.bar)!.push(r.gross_bps) }
  const xs = [...by.values()].map(v => v.reduce((a, b) => a + b, 0) / v.length), B = xs.length
  if (B < Q15.minBars) return { bps: NaN, n: ok.length, bars: B, mean: NaN, t: NaN }
  const m = xs.reduce((a, b) => a + b, 0) / B, sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (B - 1)), t = sd > 0 ? m / sd * Math.sqrt(B) : 0
  return { bps: +(m <= 0 ? m : m * Math.max(0, Math.min(1, t / 2))).toFixed(2), n: ok.length, bars: B, mean: +m.toFixed(2), t: +t.toFixed(2) }
}
// shim config (both CI workflows): __Q15_LEV / __Q15_PER_TRADE / __Q15_MAX_OPEN / __Q15_SHARE, clamped here and in SQL
export function q15Config(g: any = globalThis) {
  const num = (v: any) => Number(v), l = num(g.__Q15_LEV), pt = num(g.__Q15_PER_TRADE), mo = num(g.__Q15_MAX_OPEN), sh = num(g.__Q15_SHARE)
  return {
    lev: Number.isFinite(l) && l >= 1 ? Math.min(Q15.levMax, Math.floor(l)) : Q15.levDefault,
    perTrade: Number.isFinite(pt) && pt > 0 ? Math.min(Q15.perTrade, pt) : Q15.perTrade,
    maxOpen: Number.isFinite(mo) && mo >= 1 ? Math.min(Q15.maxOpen, Math.floor(mo)) : Q15.maxOpen,
    share: Number.isFinite(sh) && sh > 0 ? Math.min(Q15.share, Math.max(0.05, sh)) : Q15.share,
  }
}

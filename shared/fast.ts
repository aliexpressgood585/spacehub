// v95.0 — FAST: the owner's all-in intraday strategy (2026-09-26: "20 trades a day, scanning every coin, the whole
// account, reset and start now"). Pure rules only; the live runner is supabase/functions/trading-bot/fast-runner.ts.
// NOT VALIDATED: the v94.0 lab found no 5m/15m rule that survives costs (0 of 16,560 specs passed even the IS screen).
// The owner chose to run it live on paper anyway, knowingly. Everything here is measured and costed like any sleeve.
//
// Entry on a COMPLETED 5m bar, all four at once (LONG; SHORT is the mirror):
//  1. momentum burst: the 3-bar move is > 1.5 ATR x sqrt(3)
//  2. volume spike: the bar's volume >= 2x the 20-bar average
//  3. aggressive buyers: taker-buy imbalance over the last 3 bars > +0.10 (observed Binance column)
//  4. BTC agrees: BTC's 5m close above its EMA20 (below for SHORT); BTC itself skips this condition
// Exit: stop 1 ATR (at least 0.3%), target 1.5R, or out after 12 bars (60 min). Stop before target.
// Book: <= 5 positions, one per coin, each = 1/5 of equity (all five open = the whole account), <= 20 entries per
// UTC day, strongest signals first (strength = move z x volume ratio). Paper, 1x-margined.
import { labInd, type LBar } from './lab.ts'
export const FAST = { tf: '5m', barMs: 300_000, zMin: 1.5, volMult: 2, imbMin: 0.10, stopAtr: 1, stopMinPct: 0.003, targetR: 1.5, holdBars: 12,
  maxOpen: 5, perTrade: 0.2, maxPerDay: 20, entryWindowMs: 120_000 } as const
export interface FastSig { dir: 1 | -1; z: number; volRatio: number; imb: number; atr: number; strength: number }
export function fastSignal(b: LBar[], btcUp: boolean | null, isBtc: boolean): FastSig | null {
  const i = b.length - 1
  if (i < 60) return null
  const I = labInd(b), ap = I.atrPct[i], av = I.av20[i]
  if (!(ap > 0) || !(av > 0)) return null
  const z = (b[i].close / b[i - 3].close - 1) / (ap * Math.sqrt(3))
  const volRatio = b[i].vol / av
  let fb = 0, fv = 0
  for (let k = i - 2; k <= i; k++) { const tb = b[k].tb; if (tb === undefined || !Number.isFinite(tb)) return null; fb += 2 * tb - b[k].vol; fv += b[k].vol }
  if (!(fv > 0)) return null
  const imb = fb / fv
  const dir: 1 | -1 = z > 0 ? 1 : -1
  if (Math.abs(z) <= FAST.zMin || volRatio < FAST.volMult || dir * imb <= FAST.imbMin) return null
  if (!isBtc && (btcUp === null || (dir > 0) !== btcUp)) return null
  return { dir, z, volRatio, imb, atr: I.atr[i], strength: Math.abs(z) * volRatio }
}
// stop and target from the entry fill
export function fastLevels(dir: 1 | -1, entry: number, atr: number) {
  const r = Math.max(FAST.stopAtr * atr, entry * FAST.stopMinPct)
  return { stop: entry - dir * r, target: entry + dir * FAST.targetR * r, r }
}
// live exit on an executable mark (bid for a long, ask for a short)
export function fastExit(dir: 1 | -1, stop: number, target: number, mark: number, heldMs: number): 'STOP' | 'TARGET' | 'TIMEOUT' | null {
  if (!(mark > 0)) return null
  if (dir * (mark - stop) <= 0) return 'STOP'
  if (dir * (mark - target) >= 0) return 'TARGET'
  if (heldMs >= FAST.holdBars * FAST.barMs) return 'TIMEOUT'
  return null
}

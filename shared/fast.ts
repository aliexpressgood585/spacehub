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
// Book (v95.2): <= 3 positions x 1/3 of equity as margin at up to 100x (see FAST below), <= 20 entries per UTC day,
// strongest signals first (strength = move z x volume ratio). Paper only.
import { labInd, type LBar } from './lab.ts'
// v95.2 (owner: "the most aggressive there is — 400% / 1000% a day, wipe the account if it must, it's a demo"):
// ISOLATED LEVERAGE. <= 3 open, each posts 1/3 of equity as margin, notional = margin x lev (default 50x, shim
// __FAST_LEV, clamped 1..100). A position is LIQUIDATED when the adverse move reaches 1/lev - 0.5% maintenance: it loses
// its whole margin. Binance's real per-coin leverage caps (often 20-75x on alts) are NOT enforced here — INFERRED.
export const FAST = { tf: '5m', barMs: 300_000, zMin: 1.5, volMult: 2, imbMin: 0.10, stopAtr: 1, stopMinPct: 0.003, targetR: 1.5, holdBars: 12,
  maxOpen: 3, perTrade: 1 / 3, maxPerDay: 20, entryWindowMs: 120_000, levDefault: 50, levMax: 100, maint: 0.005 } as const
// v95.4 REAL-TIME mode (owner: "yes" to entries at any moment, not only at a 5m close). Evaluated every cycle (~5-10 s)
// on 1m klines INCLUDING the minute still forming (Binance's forming bar carries its own taker-buy volume):
//  1. the price now vs the close 3 minutes ago is > 2 ATR(1m) x sqrt(3) away
//  2. volume of the last 3 minutes (2 closed + the forming one, NOT extrapolated) >= 2x the 3-minute average of the 20 closed
//  3. taker imbalance over those 3 minutes beyond +/-0.10     4. BTC's last closed 1m bar on the same side of its EMA20
// Stop 2 ATR(1m) (floor 0.3%), target 1.5R, out after 30 min; one entry per coin per 15 min. NOT BACKTESTED (no 1m archive
// run was made — the owner asked for speed); same costs, same caps, same isolated leverage as the bar mode.
export const FAST_RT = { zMin: 2, volMult: 2, imbMin: 0.10, stopAtr: 2, holdMin: 30, cooldownMs: 15 * 60_000, scanEveryMs: 10_000 } as const
export function fastSignalRT(b: LBar[], btcUp: boolean | null, isBtc: boolean): FastSig | null {
  const n = b.length
  if (n < 40) return null
  const closed = b.slice(0, -1), I = labInd(closed), k = closed.length - 1
  const ap = I.atrPct[k], av = I.av20[k], cur = b[n - 1]
  if (!(ap > 0) || !(av > 0) || !(cur.close > 0)) return null
  const z = (cur.close / b[n - 4].close - 1) / (ap * Math.sqrt(3))
  let v3 = 0, fb = 0
  for (let j = n - 3; j < n; j++) { const tb = b[j].tb; if (tb === undefined || !Number.isFinite(tb)) return null; v3 += b[j].vol; fb += 2 * tb - b[j].vol }
  if (!(v3 > 0)) return null
  const volRatio = v3 / (3 * av), imb = fb / v3, dir: 1 | -1 = z > 0 ? 1 : -1
  if (Math.abs(z) <= FAST_RT.zMin || volRatio < FAST_RT.volMult || dir * imb <= FAST_RT.imbMin) return null
  if (!isBtc && (btcUp === null || (dir > 0) !== btcUp)) return null
  return { dir, z, volRatio, imb, atr: FAST_RT.stopAtr * ap * cur.close, strength: Math.abs(z) * volRatio }
}
export const fastLiq = (dir: 1 | -1, entry: number, lev: number) => (lev > 1 ? entry * (1 - dir * (1 / lev - FAST.maint)) : dir > 0 ? 0 : Infinity)
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
// v95.5 TRAILING EXIT (owner: "wouldn't a trailing stop have made more?"). Tested first, same FAST signal, 10 coins,
// 5m, 36 months, ~29k trades: fixed 1.5R target -0.202%/trade PF 0.39 | trail 1R behind the best price after +1R, no
// target -0.184% PF 0.42 (1st half -0.196, 2nd half -0.174 — better in BOTH halves) | 3R + trail -0.194 | BE + 3R -0.194.
// A consistent but small improvement; the rule still loses after costs. No fixed target: the far "target" (10R) only
// exists because the ledger requires levels on both sides; the exit is the trailing stop or the time limit.
export const FAST_TRAIL = { on: true, afterR: 1, distR: 1, farTargetR: 10 } as const
// stop and target from the entry fill
export function fastLevels(dir: 1 | -1, entry: number, atr: number) {
  const r = Math.max(FAST.stopAtr * atr, entry * FAST.stopMinPct)
  return { stop: entry - dir * r, target: entry + dir * (FAST_TRAIL.on ? FAST_TRAIL.farTargetR : FAST.targetR) * r, r }
}
// ratchet: once the best price is >= afterR beyond the entry, the stop trails distR behind the best; never loosens
export function fastTrail(dir: 1 | -1, entry: number, r: number, best: number, stop: number): number {
  if (!(r > 0) || dir * (best - entry) < FAST_TRAIL.afterR * r) return stop
  const ns = best - dir * FAST_TRAIL.distR * r
  return dir * (ns - stop) > 0 ? ns : stop
}
// live exit on an executable mark (bid for a long, ask for a short)
export function fastExit(dir: 1 | -1, stop: number, target: number, mark: number, heldMs: number, liq = dir > 0 ? 0 : Infinity, holdMs: number = FAST.holdBars * FAST.barMs): 'LIQUIDATION' | 'STOP' | 'TARGET' | 'TIMEOUT' | null {
  if (!(mark > 0)) return null
  if (dir * (mark - liq) <= 0) return 'LIQUIDATION'
  if (dir * (mark - stop) <= 0) return 'STOP'
  if (dir * (mark - target) >= 0) return 'TARGET'
  if (heldMs >= holdMs) return 'TIMEOUT'
  return null
}

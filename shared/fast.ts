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
  maxOpen: 15, perTrade: 1 / 15, maxPerDay: 20, entryWindowMs: 120_000, levDefault: 10, levMax: 100, maint: 0.005 } as const
// v95.4 REAL-TIME mode (owner: "yes" to entries at any moment, not only at a 5m close). Evaluated every cycle (~5-10 s)
// on 1m klines INCLUDING the minute still forming (Binance's forming bar carries its own taker-buy volume):
//  1. the price now vs the close 3 minutes ago is > 2 ATR(1m) x sqrt(3) away
//  2. volume of the last 3 minutes (2 closed + the forming one, NOT extrapolated) >= 2x the 3-minute average of the 20 closed
//  3. taker imbalance over those 3 minutes beyond +/-0.10     4. BTC's last closed 1m bar on the same side of its EMA20
// Stop 2 ATR(1m) (floor 0.3%), target 1.5R, out after 30 min; one entry per coin per 15 min. NOT BACKTESTED (no 1m archive
// run was made — the owner asked for speed); same costs, same caps, same isolated leverage as the bar mode.
export const FAST_RT = { zMin: 2, volMult: 2, imbMin: 0.10, stopAtr: 2, holdMin: 15, cooldownMs: 15 * 60_000, scanEveryMs: 10_000 } as const
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
// v95.8 (owner, 2026-09-26): trailing OFF — fixed stop and fixed 1.5R take-profit set at entry (FAST.targetR).
export const FAST_TRAIL = { on: false, afterR: 1, distR: 1, farTargetR: 10 } as const
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

// ── v95.6 FILL REALISM ──────────────────────────────────────────────────────────────────────────────
// Found 2026-09-26 on two live trades: (1) RAYSOL's stop (2.050820) first traded at 18:06:25.6 but the cycle that saw
// it ran at 18:06:30-34 (overlapping cycles skip; real checks ~10-15 s apart), so it "filled" at the bid then, 2.0476
// - slip = 2.046576, 0.21% beyond the stop; (2) GRASS's 1.5R target first traded at 18:02:54.0 and the close used the
// bid 5 s later, 0.5581 > target 0.5565 — a real limit take-profit fills AT the target. Both were artefacts of polling.
// Fix: exits are resolved against Binance aggTrades since the last check, in time order, as the exchange would run a
// resting order: the trailing stop ratchets on each trade (exchange-side trailing), a stop-market triggers on the first
// trade at/through the stop and fills at THAT trade's price (gap-inclusive) minus book impact; a take-profit limit fills
// at the target only when a trade prints strictly beyond it; liquidation at the liquidation price. No look-ahead: each
// trade only sees the stop set by the trades before it.
export interface AggTrade { p: number; T: number }
export interface ExitState { dir: 1 | -1; entry: number; r: number; stop: number; target: number | null; liq: number; best: number; trail: boolean }
export type ExitWhy = 'LIQUIDATION' | 'STOP' | 'TARGET'
export function resolveExit(s: ExitState, trades: AggTrade[]): { why: ExitWhy; px: number; T: number; best: number; stop: number } | { why: null; best: number; stop: number; lastT: number | null } {
  let best = s.best, stop = s.stop, lastT: number | null = null
  const d = s.dir
  for (const t of trades) {
    const p = t.p
    if (!(p > 0)) continue
    lastT = t.T
    if (d * (p - s.liq) <= 0) return { why: 'LIQUIDATION', px: s.liq, T: t.T, best, stop }
    if (d * (p - stop) <= 0) return { why: 'STOP', px: p, T: t.T, best, stop }
    if (s.target !== null && d * (p - s.target) > 0) return { why: 'TARGET', px: s.target, T: t.T, best, stop }
    if (d * (p - best) > 0) best = p
    if (s.trail) stop = fastTrail(d, s.entry, s.r, best, stop)   // applies from the NEXT trade on
  }
  return { why: null, best, stop, lastT }
}
// Walk the visible order book for a market order of `notional` USD. levels = [[price, qty], ...] best first (asks for a
// buy, bids for a sell). Returns the VWAP and the impact vs the best level. If the visible book is too thin, the rest is
// priced one more "book depth" beyond the worst level (INFERRED — the real cost of sweeping past the visible book is
// unknown and at least this bad).
export function walkBook(levels: [number, number][], notional: number): { vwap: number; impact: number; depthUsd: number; beyond: boolean } {
  const best = levels[0]?.[0]
  if (!(best > 0) || !(notional > 0)) return { vwap: NaN, impact: NaN, depthUsd: 0, beyond: true }
  let left = notional, qty = 0, spent = 0, depthUsd = 0, worst = best
  for (const [px, q] of levels) {
    const lvUsd = px * q; depthUsd += lvUsd; worst = px
    if (left <= 0) continue
    const take = Math.min(left, lvUsd); spent += take; qty += take / px; left -= take
  }
  const beyond = left > 1e-9
  if (beyond) { const px = worst + (worst - best); qty += left / px; spent += left }
  const vwap = spent / qty
  return { vwap, impact: Math.abs(vwap / best - 1), depthUsd, beyond }
}
// v95.7 LIQUIDITY CAP (owner: "כן", 2026-09-26, after ORDI #654 lost $611 in 1.6 s to its own 41 bps entry impact against
// a 47 bps stop). Leverage is unchanged; the NOTIONAL is capped so that walking the real book costs at most `impactOfR` of
// the stop distance on BOTH sides (entry side and the side the exit will sell/buy into) and never goes beyond the visible
// book. On a deep book (HYPE, XRP) nothing changes; on a thin one less margin is posted.
export const FAST_LIQ = { impactOfR: 0.25 } as const
export function liqCap(entrySide: [number, number][], exitSide: [number, number][], maxImpact: number): number {
  const one = (lv: [number, number][]) => {
    const depth = lv.reduce((s, [p, q]) => s + p * q, 0)
    if (!(depth > 0) || !(maxImpact > 0)) return 0
    const ok = (n: number) => { const w = walkBook(lv, n); return !w.beyond && w.impact <= maxImpact }
    if (ok(depth * 0.999)) return depth * 0.999
    let lo = 0, hi = depth
    for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (ok(mid)) lo = mid; else hi = mid }
    return lo
  }
  return Math.min(one(entrySide), one(exitSide))
}
// v96.1 WYCKOFF intraday (owner, 2026-09-26: "trade Wyckoff intraday, reset, keep the leverage, let's see").
// The codeable core of a Wyckoff trade on COMPLETED 5m bars: a SPRING (long) / UPTHRUST (short) out of a trading range.
//  1. range  = the 48 bars (4h) before the signal bar; it must be a range, not a trend: height <= 12 ATR
//  2. spring = the signal bar trades BELOW the range low and CLOSES back inside it (upthrust: above the high, back inside)
//  3. no supply / no demand: the spring bar's volume is BELOW the range's average volume (classic Wyckoff spring)
// Entry at market after the close; stop just beyond the spring extreme (0.1 ATR buffer, floor 0.3%); target 1.5R; out
// after 8h. Phase labels (PS/SC/AR/ST/SOS/LPS) are NOT coded: they are not objectively definable (see CLAUDE.md v84bt).
// TESTED BEFORE BUILDING (backtest/research/v96_1_wyckoff.ts): 5m / 10 coins / 36m and 15m / 40 coins / 36m, IS 70% ->
// OOS 30%, taker 5 bps/side + slippage. Every variant (range 4h/8h, any / low / climax volume, 1.5R / range target)
// LOSES about -0.15 .. -0.21% per trade in-sample AND out-of-sample (this exact rule: 5m OOS -0.156%, n 7,306, WR 33%).
// Same shape as FAST: gross ~0, the round trip is the loss. Built on the owner's instruction, labelled NOT VALIDATED.
export const WYCKOFF = { rangeBars: 48, maxHeightAtr: 12, maxVolRatio: 1, bufferAtr: 0.1, holdMin: 480 } as const
export interface WyckoffSig extends FastSig { lo: number; hi: number; height: number; ext: number; stopPx: number; trapped: number }
export function wyckoffSignal(b: LBar[]): WyckoffSig | null {
  const i = b.length - 1, N = WYCKOFF.rangeBars
  if (i < N + 20) return null
  const I = labInd(b), A = I.atr[i - 1]
  if (!(A > 0)) return null
  let hi = -Infinity, lo = Infinity, vs = 0
  for (let k = i - N; k < i; k++) { hi = Math.max(hi, b[k].high); lo = Math.min(lo, b[k].low); vs += b[k].vol }
  const height = (hi - lo) / A, av = vs / N, x = b[i], volRatio = av > 0 ? x.vol / av : NaN
  if (!(height <= WYCKOFF.maxHeightAtr) || !(volRatio < WYCKOFF.maxVolRatio)) return null
  let dir: 1 | -1
  if (x.low < lo && x.close > lo) dir = 1
  else if (x.high > hi && x.close < hi) dir = -1
  else return null
  const ext = dir > 0 ? x.low : x.high, stopPx = ext - dir * WYCKOFF.bufferAtr * A
  const dist = dir * (x.close - stopPx)
  if (!(dist > 0)) return null
  // trapped = share of the spring bar's volume that was aggressive in the FAILED direction (sellers on a spring) — INFO only
  const tb = x.tb, trapped = tb !== undefined && Number.isFinite(tb) && x.vol > 0 ? (dir > 0 ? 1 - tb / x.vol : tb / x.vol) : NaN
  // z = how far the spring pierced the range, in ATR; strength ranks the tightest ranges first
  return { dir, z: dir * (dir > 0 ? lo - ext : ext - hi) / A, volRatio, imb: 0, atr: dist, strength: 1 / height, lo, hi, height, ext, stopPx, trapped }
}

// v96.2 TRADING PSYCHOLOGY (owner: "add trading psychology, combined"). Two parts were tested on the Wyckoff rule
// (backtest/research/v96_2_psychology.ts -> status/wyckoff-psychology.txt, 5m, 10 coins, 36m, IS 70% / OOS 30%):
//  MARKET psychology (the crowd): trapped aggressive traders on the spring bar, crowd funding against us, very quiet
//    springs — NONE changes the per-trade result (OOS -0.12 .. -0.15% vs -0.144% alone). Not used as filters; the trapped
//    share is journalled per trade as information.
//  TRADER psychology (discipline) — used, because it cuts the DAMAGE: OOS total -936% -> -189% (sum of %/trade at 1x)
//    with all four rules together. It does NOT create an edge: every trade that is still taken loses on average
//    (-0.106%/trade OOS). It trades less (6,490 -> 1,779 OOS) and smaller after losses. This cuts trades — standing rule 5
//    yields to the owner's explicit request, and the trades cut are negative-expectancy.
//  1. no revenge trade: no entry on a coin within 60 min of a LOSING close on that coin
//  2. tilt break: 3 losing closes in a row -> no entries for 120 min after the last one
//  3. daily stop: 3 losing closes in the UTC day -> no more entries that day
//  4. after 2 losses in a row, half size until a win
export const PSYCH = { coinCoolMin: 60, streak: 3, pauseMin: 120, dayLosses: 3, halfAfter: 2, halfMult: 0.5 } as const
export interface Closed { sym: string; pnl: number; closedAt: number }
export function psychState(closed: Closed[], now: number) {
  const c = [...closed].filter(x => x.closedAt <= now).sort((a, b) => a.closedAt - b.closedAt)
  let streak = 0
  for (let i = c.length - 1; i >= 0 && c[i].pnl < 0; i--) streak++
  const day = new Date(now); day.setUTCHours(0, 0, 0, 0)
  const dayLosses = c.filter(x => x.closedAt >= day.getTime() && x.pnl < 0).length
  const last = c.length ? c[c.length - 1].closedAt : 0
  const pausedUntil = streak >= PSYCH.streak ? last + PSYCH.pauseMin * 60_000 : 0
  const lastLoss: Record<string, number> = {}
  for (const x of c) if (x.pnl < 0) lastLoss[x.sym] = x.closedAt
  return { streak, dayLosses, pausedUntil, lastLoss, sizeMult: streak >= PSYCH.halfAfter ? PSYCH.halfMult : 1 }
}
// null = allowed; otherwise the reason the "disciplined trader" skips this entry
export function psychBlock(st: ReturnType<typeof psychState>, sym: string, now: number): string | null {
  if (st.dayLosses >= PSYCH.dayLosses) return 'psych_day_stop'
  if (now < st.pausedUntil) return 'psych_tilt_pause'
  if (st.lastLoss[sym] && now - st.lastLoss[sym] < PSYCH.coinCoolMin * 60_000) return 'psych_no_revenge'
  return null
}

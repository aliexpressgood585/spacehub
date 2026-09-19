// ════════════════════════════════════════════════════════════════════════════
// shared/strategy.ts — THE strategy. One definition, two consumers.
//
// WHY THIS FILE EXISTS
// Until now the live bot (supabase/functions/trading-bot/index.ts) and the
// backtest (backtest/backtest.ts) each carried their OWN copy of the rules.
// They agreed on the indicators — calcATR is byte-identical in both, calcADX is
// functionally identical — but they disagreed on everything around them, and
// nobody could say by how much. v79bt is what that cost: a full 36-month run
// that reproduced the documented trade count (11,412 vs 11,218) but NOT the
// documented window profile, leaving two explanations we had no instrument to
// separate — either the scan is not the engine, or the edge has decayed. A
// backtest that is a paraphrase of the bot cannot answer a question about the
// bot.
//
// So: the rules live HERE, as pure functions over plain numbers. No Deno, no
// Supabase, no fetch, no npm — nothing that only one of the two callers has.
// The bot imports it by relative path; when the bot is deployed as a remote
// import pinned to a commit SHA, this file resolves against that same SHA, so
// the deployed function and the backtest run the same text.
//
// WHAT BELONGS HERE: anything that decides. Signal, gate, stop distance, size,
// the ladder state machine, the ROTA ranking and weights, and every constant
// they read.
// WHAT DOES NOT: I/O, persistence, exchange calls, logging, scheduling. Those
// are orchestration and they differ legitimately between live and backtest.
// ════════════════════════════════════════════════════════════════════════════

export interface Bar { open: number; high: number; low: number; close: number; vol: number; t: number }

// ─────────────────────────────────────────────────────────────────────────────
// INDICATORS — verbatim from the live bot. Do not "clean up": the numbers these
// produce are what every validation batch in CLAUDE.md was measured against.
// ─────────────────────────────────────────────────────────────────────────────

export function calcATR(bars: Bar[], p = 14): number {
  if (bars.length < p + 1) return bars[0]?.high - bars[0]?.low || 0
  const trs = bars.slice(1).map((b, i) => Math.max(
    b.high - b.low, Math.abs(b.high - bars[i].close), Math.abs(b.low - bars[i].close)
  ))
  let atr = trs.slice(0, p).reduce((a, v) => a + v, 0) / p
  for (let i = p; i < trs.length; i++) atr = (atr * (p - 1) + trs[i]) / p
  return atr
}

export function calcADX(bars: Bar[], period = 14): number {
  if (bars.length < period + 1) return 20

  const trs: number[] = [], plusDMs: number[] = [], minusDMs: number[] = []

  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].high, l = bars[i].low, pc = bars[i - 1].close
    const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc))
    const hd = h - bars[i - 1].high, ld = bars[i - 1].low - l

    trs.push(tr)
    plusDMs.push((hd > 0 && hd > ld) ? hd : 0)
    minusDMs.push((ld > 0 && ld > hd) ? ld : 0)
  }

  // Wilder's method, seeded from the first `period` raw sums. The seed is a SUM
  // and the smoothing step divides by `period`, so tr14/pd14/md14 become
  // averages after the first iteration — inconsistent on its face, but the DI
  // ratio scales all three identically so the output is unaffected, and this is
  // the arithmetic every validated number in CLAUDE.md was produced with.
  let tr14 = trs.slice(0, period).reduce((a, b) => a + b, 0)
  let pd14 = plusDMs.slice(0, period).reduce((a, b) => a + b, 0)
  let md14 = minusDMs.slice(0, period).reduce((a, b) => a + b, 0)

  const plus_di0 = tr14 > 0 ? (pd14 / tr14) * 100 : 0
  const minus_di0 = tr14 > 0 ? (md14 / tr14) * 100 : 0
  const di_sum0 = plus_di0 + minus_di0
  let adx = di_sum0 > 0 ? (Math.abs(plus_di0 - minus_di0) / di_sum0) * 100 : 0

  for (let i = period; i < trs.length; i++) {
    tr14 = (tr14 * (period - 1) + trs[i]) / period
    pd14 = (pd14 * (period - 1) + plusDMs[i]) / period
    md14 = (md14 * (period - 1) + minusDMs[i]) / period
    const pdi = tr14 > 0 ? (pd14 / tr14) * 100 : 0
    const mdi = tr14 > 0 ? (md14 / tr14) * 100 : 0
    const s = pdi + mdi
    const dx = s > 0 ? ((Math.abs(pdi - mdi)) / s) * 100 : 0
    adx = (adx * (period - 1) + dx) / period
  }

  return Math.min(100, Math.max(0, adx))
}

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTION COSTS — the assumptions every walk-forward in CLAUDE.md was run on.
// v71bt is the standing warning about treating these as a rounding detail: the
// reg-channel sleeve beat the incumbent at 0bps and was worth less than half of
// it at 6bps. The incumbent's own curve (v79bt) loses ~25% of total R per 3bps.
// ─────────────────────────────────────────────────────────────────────────────
export const FEE_TAKER = 0.0005   // 0.05%/side — market fills: entries, stops, timeouts
export const FEE_MAKER = 0.0002   // 0.02%/side — the two resting ladder legs
export const SLIP = 0.0003        // 3 bps adverse on market fills only

// ─────────────────────────────────────────────────────────────────────────────
// DONCH4H — the breakout sleeve.
// Every constant below is a validated result, with the batch that fixed it.
// ─────────────────────────────────────────────────────────────────────────────
export const DONCH_WINDOW = 15      // v55bt: 15 beat 25/40; v56bt re-tune confirmed (12→509R, 20→457R, 15→512R)
export const ADX_GATE = 22          // v56bt: 18 and 20 both flip window 5 negative
export const ADX_BARS = 60          // ADX is measured over the last 60 completed 4h bars
export const ATR_BARS = 20          // ATR(14) computed over the last 20 completed 4h bars
export const SL_ATR_MULT = 1.4      // v64bt: re-tuned across ATR period × multiplier — 20/1.4 is the optimum
export const SL_MIN_PCT = 0.005     // floor: a stop closer than 0.5% is noise
export const SL_MAX_PCT = 0.08      // skip the trade entirely if the stop is wider than 8%
export const LADDER_TP_R = 1.6      // the level stored on the row; the final third trails past it (v53)
// The two banked legs. v63bt tested lowering the first: L1=0.5 buys +3.7pp win
// rate for −6% total R and breaks a window; L1=0.4 buys +7.6pp for −16% and
// breaks a window. 0.6 is the frontier, and is left as a documented USER option
// (smoother equity for less profit), not a knob to tune quietly.
// NB these deliberately do NOT share a constant with the pyramid thresholds,
// which happen to use the same two numbers for an unrelated reason.
export const LADDER_LEG1_R = 0.6
export const LADDER_LEG2_R = 1.0
export const TRAIL_ATR_MULT = 2.5   // v58bt chandelier on the final third: +36% total R, all 6 windows
export const MAX_HOLD_MS = 23040 * 60_000   // 96 4h bars = 16 days
export const PYRAMID_MAX = 3        // v49
export const PYRAMID_R_2ND = 0.6    // v46: a 2nd unit needs a same-side winner ≥0.6R
export const PYRAMID_R_3RD = 1.0    // v49: a 3rd unit needs ALL open units ≥1.0R

// ─────────────────────────────────────────────────────────────────────────────
// PORTFOLIO CONSTRAINTS — these are the ones the old backtest scan did not have
// at all, and the most likely reason its window profile diverged from the
// documented run. In a strongly trending window the live engine runs OUT OF
// ROOM (heat cap, net-exposure cap, per-coin cap, cash) and takes fewer or
// smaller positions than an unconstrained R-sum assumes. That is not a detail
// at the edges; it bites hardest exactly in the windows that carry the profit.
// ─────────────────────────────────────────────────────────────────────────────
export const BASE_RISK_PCT = 0.0175      // v57.2, owner instruction (was 0.0125)
export const MAX_HEAT_PCT = 0.95         // total open notional (both sleeves) / portfolio
export const NET_EXPOSURE_CAP = 0.60     // |long − short| notional / portfolio
export const PER_POSITION_CAP = 0.20     // one breakout's notional / portfolio
export const PER_COIN_CAP = 0.20         // combined ROTA + DONCH4H exposure on one coin
export const MIN_NOTIONAL = 500          // below this the entry is skipped, not trimmed
export const LIQ_CAP_FRAC = 0.005        // v54: never exceed 0.5% of the coin's 24h quote volume
export const MAX_OPEN_TRADES = 30
export const MAX_NEW_ENTRIES_PER_SCAN = 8

// ─────────────────────────────────────────────────────────────────────────────
// ROTA — the momentum-rotation sleeve.
// ─────────────────────────────────────────────────────────────────────────────
export const ROTA_MS = 48 * 3600_000     // rebalance interval
export const ROTA_K = 8                  // v56bt: K=9 flips window 3 negative
export const ROTA_LB = 84                // 84 4h bars = 14 days of momentum
export const ROTA_BOOK = 0.35            // per-side book fraction (0.35 long + 0.35 short = 70%)
export const ROTA_SLOT_MIN = 0.028       // floor per slot, as a fraction of portfolio
export const ROTA_SLOT_MAX = 0.14        // ceiling per slot
export const ROTA_DRIFT_LO = 0.65        // keep an existing slot if it sits inside
export const ROTA_DRIFT_HI = 1.4         //   [0.65, 1.4] × its target notional

export type Side = 'LONG' | 'SHORT'

// ─────────────────────────────────────────────────────────────────────────────
// SIGNAL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Donchian breakout on COMPLETED 4h bars. `completed` must END with the signal
 * bar — i.e. the caller has already dropped the bar that is still forming. The
 * channel is the DONCH_WINDOW bars BEFORE the signal bar, so the bar that
 * breaks out is not part of the channel it breaks.
 */
export function donchSignal(completed: Bar[]): { side: Side; hiN: number; loN: number } | null {
  if (completed.length < DONCH_WINDOW + 1) return null
  const last = completed[completed.length - 1]
  const prior = completed.slice(-(DONCH_WINDOW + 1), -1)
  if (prior.length < DONCH_WINDOW) return null
  let hiN = -Infinity, loN = Infinity
  for (const b of prior) { if (b.high > hiN) hiN = b.high; if (b.low < loN) loN = b.low }
  const side: Side | null = last.close > hiN ? 'LONG' : last.close < loN ? 'SHORT' : null
  return side ? { side, hiN, loN } : null
}

/** ADX over the gate window, measured on the same completed bars as the signal. */
export function gateAdx(completed: Bar[]): number {
  return calcADX(completed.slice(-ADX_BARS))
}

/** ATR over the sizing window, same convention. */
export function entryAtr(completed: Bar[]): number {
  return calcATR(completed.slice(-ATR_BARS))
}

/**
 * v44/v58bt/v72bt: ADX is the ONLY feature with proven, monotonic sizing edge.
 * v72bt tried a learned 5-feature model and it added exactly nothing over this
 * table while making out-of-sample windows worse. Do not extend it.
 */
export function adxTierMult(adx: number): number {
  return adx > 45 ? 2.0 : adx > 35 ? 1.5 : adx > 28 ? 1.0 : 0.75
}

/** Stop distance in price units, with the 0.5% floor the live bot applies. */
export function stopDistance(atr: number, price: number): number {
  return Math.max(atr * SL_ATR_MULT, price * SL_MIN_PCT)
}

// ─────────────────────────────────────────────────────────────────────────────
// PYRAMIDING
// ─────────────────────────────────────────────────────────────────────────────

export interface OpenUnit { side: Side; entry: number; origSlDist: number }

/**
 * A second unit only stacks on a same-direction winner at ≥0.6R, a third only
 * when EVERY open unit is ≥1.0R. Returns false once the stack is full.
 *
 * NB the live bot recovers origSlDist from the stored 1.6R take-profit level
 * (`|tp − entry| / 1.6`) because the row does not persist the stop distance.
 * Callers that HAVE the distance should pass it directly; the arithmetic is the
 * same either way, and doing the division here would just add a rounding step
 * the backtest does not need.
 */
export function pyramidGateOk(units: OpenUnit[], side: Side, price: number): boolean {
  if (units.length === 0) return true
  if (units.length >= PYRAMID_MAX) return false
  const needR = units.length >= 2 ? PYRAMID_R_3RD : PYRAMID_R_2ND
  return units.every(u => {
    if (u.side !== side) return false
    const dirM = u.side === 'LONG' ? 1 : -1
    return u.origSlDist > 0 && (price - u.entry) * dirM / u.origSlDist >= needR
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// SIZING — the exact min-chain the live bot walks, in the order it walks it.
// Order matters: the liquidity cap is applied to an already-capped notional,
// and the heat cap is applied last because it is the one that decides between
// "trim" and "skip".
// ─────────────────────────────────────────────────────────────────────────────

export interface SizeInput {
  portfolio: number      // balance + open exposure
  balance: number        // free cash
  openExposure: number   // notional of everything already open (the snapshot)
  heatCommitted: number  // notional committed EARLIER IN THIS SAME CYCLE (v56.9)
  longExposure: number   // includes this cycle's commitments
  shortExposure: number
  symExposure: number    // combined exposure already on this symbol
  adx: number
  slPct: number
  side: Side
  quoteVol24h: number    // 0 disables the liquidity cap
}

export type SizeResult =
  | { ok: true; notional: number; trimmedBy: 'none' | 'liquidity' | 'heat' }
  | { ok: false; reason: 'too_small' | 'heat_limit' | 'net_exposure_cap' | 'per_coin_cap' }

export function sizeBreakout(inp: SizeInput): SizeResult {
  const { portfolio, balance, openExposure, heatCommitted } = inp
  if (portfolio <= 0) return { ok: false, reason: 'too_small' }

  const remain = Math.max(0, portfolio - openExposure)
  const riskNotional = (portfolio * BASE_RISK_PCT * adxTierMult(inp.adx)) / inp.slPct
  let notional = Math.min(
    Math.max(riskNotional, MIN_NOTIONAL),
    portfolio * PER_POSITION_CAP,
    remain,
    balance * 0.95,
  )
  let trimmedBy: 'none' | 'liquidity' | 'heat' = 'none'

  // v46: combined per-coin cap — a rotation slot and a breakout on the same coin
  // were doubling concentration on one name.
  const coinRoom = Math.max(0, portfolio * PER_COIN_CAP - inp.symExposure)
  if (notional > coinRoom) {
    if (coinRoom < MIN_NOTIONAL) return { ok: false, reason: 'per_coin_cap' }
    notional = coinRoom
  }

  // v54 liquidity guard — a no-op at paper scale on majors, the whole point on
  // thin alts once real capital arrives.
  if (inp.quoteVol24h > 0 && notional > inp.quoteVol24h * LIQ_CAP_FRAC) {
    notional = inp.quoteVol24h * LIQ_CAP_FRAC
    trimmedBy = 'liquidity'
  }

  // v56.0 heat cap, with the v56.9 same-cycle correction. Trims to the room
  // left; skips only when the room is below the minimum ticket. This is NOT a
  // trade-count filter (standing rule 5) and must never become one: v65bt
  // established that simultaneous same-side breakouts are the WINNERS.
  const heatUsed = openExposure + heatCommitted
  const heatRoom = Math.max(0, portfolio * MAX_HEAT_PCT - heatUsed)
  if (notional > heatRoom) { notional = heatRoom; trimmedBy = 'heat' }

  if (notional < MIN_NOTIONAL) {
    return { ok: false, reason: heatRoom < MIN_NOTIONAL ? 'heat_limit' : 'too_small' }
  }

  const l = inp.side === 'LONG' ? inp.longExposure + notional : inp.longExposure
  const s = inp.side === 'SHORT' ? inp.shortExposure + notional : inp.shortExposure
  if (Math.abs(l - s) > portfolio * NET_EXPOSURE_CAP) return { ok: false, reason: 'net_exposure_cap' }

  return { ok: true, notional, trimmedBy }
}

// ─────────────────────────────────────────────────────────────────────────────
// THE LADDER — ⅓ @0.6R (maker, stop→breakeven) / ⅓ @1.0R (maker) / final ⅓
// trails a 2.5×ATR chandelier (taker).
//
// v59bt is the standing reason not to touch the shape: every variant that
// trails MORE has higher total R (all-trail reaches 1253 against 696) and every
// one of them flips a window negative. This is the maximal trailing that
// survives the all-windows rule.
//
// Modelled as a state machine over price ticks so the live bot (one tick per
// minute, from a ticker) and the backtest (one tick per bar extreme) run the
// same transitions rather than two paraphrases of them.
// ─────────────────────────────────────────────────────────────────────────────

export interface LadderPos {
  side: Side
  entry: number
  origSlDist: number   // 1R in price units, fixed at entry
  stage: 0 | 1 | 2
  stopPx: number       // initial stop, then breakeven, then the ratcheting chandelier
  sizeLeft: number     // units still open
  sizeOrig: number
}

export type LadderAction =
  | { kind: 'none'; stopPx: number }
  | { kind: 'leg'; stage: 1 | 2; px: number; qty: number; fee: number; stopPx: number }
  | { kind: 'close'; reason: 'sl' | 'trail' | 'timeout'; px: number; qty: number; fee: number }

export function ladderLevels(pos: LadderPos) {
  const dirM = pos.side === 'LONG' ? 1 : -1
  return {
    dirM,
    p06: pos.entry + pos.origSlDist * LADDER_LEG1_R * dirM,
    p10: pos.entry + pos.origSlDist * LADDER_LEG2_R * dirM,
    trailDist: pos.origSlDist * (TRAIL_ATR_MULT / SL_ATR_MULT),
  }
}

/**
 * One price observation. `px` is the current mark; `favPx` is the most
 * favourable price reached since the last observation (for the chandelier
 * ratchet) and defaults to `px` — live passes one minute's ticker for both,
 * the backtest passes the bar's close and the bar's extreme.
 *
 * ORDER OF RESOLUTION, and it is a real choice: the stop is checked BEFORE the
 * targets. Within one observation we cannot know which came first, so we take
 * the pessimistic branch. The live bot at minute granularity almost never faces
 * the ambiguity; the backtest at bar granularity faces it constantly, and
 * resolving it optimistically is exactly how a backtest flatters itself.
 */
export function ladderStep(
  pos: LadderPos, px: number, favPx = px, ageMs = 0,
  /**
   * TRUE (the default, and what the LIVE BOT does): the trailing third's stop
   * can never fall below breakeven. Leg 2 sets trail_sl = entry and stage 2 only
   * ratchets it up — `nt = max(cur, chand)`.
   *
   * FALSE reproduces the convention every historical backtest in this repo used,
   * where the chandelier floats free from an extreme seeded at `entry`, so on
   * the first bar of stage 2 the stop sits at roughly entry − 1.79R. That is a
   * materially LOOSER strategy: it gives the final third room to dip and recover.
   *
   * This parameter exists ONLY so the two can be measured against each other.
   * The live bot's behaviour is the default and must stay the default.
   */
  trailFloorBreakeven = true,
): LadderAction {
  const { dirM, p06, p10, trailDist } = ladderLevels(pos)
  const hitStop = pos.side === 'LONG' ? px <= pos.stopPx : px >= pos.stopPx

  if (pos.stage < 2) {
    if (hitStop) {
      const exit = px * (1 - dirM * SLIP)
      return { kind: 'close', reason: 'sl', px: exit, qty: pos.sizeLeft, fee: exit * pos.sizeLeft * FEE_TAKER }
    }
    const tgt = pos.stage === 0 ? p06 : p10
    const reached = pos.side === 'LONG' ? favPx >= tgt : favPx <= tgt
    if (reached) {
      // stage 0 sheds a third of the ORIGINAL size; stage 1 sheds half of what
      // is left, which is the same third. Both fill as resting limits at the
      // level itself, so they pay maker and take no slippage.
      const qty = pos.stage === 0 ? pos.sizeOrig / 3 : pos.sizeLeft / 2
      return {
        kind: 'leg', stage: pos.stage === 0 ? 1 : 2, px: tgt, qty,
        fee: tgt * qty * FEE_MAKER, stopPx: pos.entry,
      }
    }
    if (ageMs > MAX_HOLD_MS) {
      const exit = px * (1 - dirM * SLIP)
      return { kind: 'close', reason: 'timeout', px: exit, qty: pos.sizeLeft, fee: exit * pos.sizeLeft * FEE_TAKER }
    }
    return { kind: 'none', stopPx: pos.stopPx }
  }

  // stage 2 — the trailing third
  const chand = pos.side === 'LONG' ? favPx - trailDist : favPx + trailDist
  const nt = trailFloorBreakeven
    ? (pos.side === 'LONG' ? Math.max(pos.stopPx, chand) : Math.min(pos.stopPx, chand))
    : chand
  const hit = pos.side === 'LONG' ? px <= nt : px >= nt
  if (hit || ageMs > MAX_HOLD_MS) {
    const exit = px * (1 - dirM * SLIP)
    return {
      kind: 'close', reason: hit ? 'trail' : 'timeout', px: exit,
      qty: pos.sizeLeft, fee: exit * pos.sizeLeft * FEE_TAKER,
    }
  }
  return { kind: 'none', stopPx: nt }
}

// ─────────────────────────────────────────────────────────────────────────────
// ROTA
// ─────────────────────────────────────────────────────────────────────────────

export interface RotaRow { sym: string; mom: number; price: number; vol: number }

/**
 * 14-day momentum and realised vol from COMPLETED 4h bars. `completed` must end
 * with the last closed bar. Returns null when the history is too short to rank
 * honestly — a coin with a truncated series would otherwise be measured over a
 * different lookback than everything it is ranked against.
 */
export function rotaStats(sym: string, completed: Bar[]): RotaRow | null {
  if (completed.length < ROTA_LB + 1) return null
  const p1 = completed[completed.length - 1].close
  const p0 = completed[completed.length - 1 - ROTA_LB]?.close
  if (!p0 || !p1) return null
  const rets: number[] = []
  for (let k = Math.max(1, completed.length - ROTA_LB); k < completed.length; k++) {
    const a = completed[k - 1].close, b = completed[k].close
    if (a > 0) rets.push(b / a - 1)
  }
  const mu = rets.reduce((a, b) => a + b, 0) / Math.max(1, rets.length)
  const vol = Math.sqrt(rets.reduce((a, b) => a + (b - mu) ** 2, 0) / Math.max(1, rets.length))
  return { sym, mom: p1 / p0 - 1, price: p1, vol: Math.max(vol, 0.001) }
}

export interface RotaTarget { sym: string; dir: 1 | -1; price: number; weight: number }

/**
 * LONG the top K by 14-day momentum, SHORT the bottom K, inverse-vol weighted
 * within each side. v60bt rejected every dynamic allocation scheme tried
 * against this; v55bt rejected a 7-day horizon (too noisy) and a 50/50 blend.
 * Returns [] when fewer than 4K names rank — the live bot's own guard against
 * ranking a collapsed universe, which is what the v56.5/v56.7 incidents were.
 */
export function rotaTargets(rows: RotaRow[]): RotaTarget[] {
  if (rows.length < ROTA_K * 4) return []
  const sorted = [...rows].sort((a, b) => b.mom - a.mom)
  const out: RotaTarget[] = []
  let longInv = 0, shortInv = 0
  const longs = sorted.slice(0, ROTA_K)
  const shorts = sorted.slice(-ROTA_K)
  for (const x of longs) longInv += 1 / x.vol
  for (const x of shorts) shortInv += 1 / x.vol
  for (const x of longs) out.push({ sym: x.sym, dir: 1, price: x.price, weight: longInv > 0 ? (1 / x.vol) / longInv : 1 / ROTA_K })
  for (const x of shorts) out.push({ sym: x.sym, dir: -1, price: x.price, weight: shortInv > 0 ? (1 / x.vol) / shortInv : 1 / ROTA_K })
  return out
}

/** Target notional for one rotation slot, before the per-coin cap. */
export function rotaSlotTarget(portfolio: number, weight: number): number {
  return Math.min(
    Math.max(portfolio * ROTA_BOOK * weight, portfolio * ROTA_SLOT_MIN),
    portfolio * ROTA_SLOT_MAX,
  )
}

/** An existing slot is left alone while it sits inside ±35% of its target. */
export function rotaSizeOk(currentNotional: number, targetNotional: number): boolean {
  return currentNotional > targetNotional * ROTA_DRIFT_LO && currentNotional < targetNotional * ROTA_DRIFT_HI
}

// ─────────────────────────────────────────────────────────────────────────────
// THE 40-COIN UNIVERSE — pinned since v48. Standing rule 2: crypto only, no
// tokenized equities, and no dynamic list may widen it. Both sleeves rank and
// scan exactly this set, because it is the set the 36-month walk-forward ran on.
// ─────────────────────────────────────────────────────────────────────────────
export const CRYPTO_40 = [
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'DOT',
  'LTC', 'BCH', 'NEAR', 'INJ', 'SUI', 'TRX', 'APT', 'ARB', 'OP', 'ATOM',
  'FIL', 'UNI', 'AAVE', 'ICP', 'ALGO', 'SEI', 'WLD', 'TIA', 'RUNE', 'LDO',
  'CRV', 'DYDX', 'GALA', 'SAND', 'AXS', 'IMX', 'ENA', 'PEPE', 'WIF', 'FET',
] as const

/**
 * FNV-1a over the sorted, comma-joined universe — a silently edited list reads
 * as a different release at the same commit SHA. Byte-for-byte what the live
 * bot publishes in `deployment_manifest.universe_hash`; changing the arithmetic
 * would rename every past release.
 */
export function universeHash(coins: readonly string[] = CRYPTO_40): string {
  let h = 2166136261
  for (const c of [...coins].sort().join(',')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) }
  return (h >>> 0).toString(16).padStart(8, '0')
}

// ════════════════════════════════════════════════════════════════════════════
// backtest/portfolio.ts — the capital-constrained portfolio simulator.
//
// WHY THIS EXISTS
// Every backtest in this repo until now aggregated an unconstrained sum of R.
// That model can spend the same dollar in ten places at once: it never runs out
// of cash, never hits the heat cap, never has ROTA and DONCH4H competing for the
// same book, and never prices the fact that an early exit FREES CAPITAL for the
// next trade. On an edge of +0.046 to +0.062R per trade, those are not rounding
// errors — they are large enough to reverse a verdict.
//
// It is also the leading suspect for the v79bt divergence: the scan reproduced
// the documented trade count (11,412 vs 11,218) and not the documented window
// profile. Constraints bite hardest in the trending windows that carry the
// profit, which is exactly where the profile differs.
//
// WHAT THIS IS
// An event-driven simulator over real bar timestamps. It holds cash, opens and
// closes real positions, charges real costs, and refuses entries it cannot fund.
// It imports shared/strategy.ts, so the rules it runs are the rules the live bot
// runs — not a paraphrase of them.
//
// THE THREE CHOICES THAT DECIDE WHETHER IT TELLS THE TRUTH
//
//  1. INTRA-BAR AMBIGUITY. When one bar touches both the stop and the target we
//     cannot know which came first. The default resolves the STOP first. This is
//     not pessimism for its own sake: resolving it the other way is the single
//     most common way a backtest flatters itself, and at bar resolution the case
//     arises constantly. `intrabar: 'optimistic'` exists only so the size of the
//     assumption can be measured, never to produce a headline number.
//
//  2. MANAGEMENT RESOLUTION. The live bot polls a ticker every minute; a 4h bar
//     is 240 of those. Positions are therefore managed on 1h bars (4 checks per
//     4h bar) rather than at the 4h close. Coarser than live, far finer than the
//     old scan, and honest about which direction the remaining error runs.
//
//  3. EXITS BEFORE ENTRIES, always. Capital released this step is available this
//     step. Doing it the other way silently understates how much the engine can
//     actually deploy.
//
// WHAT IT DELIBERATELY DOES NOT DO
// No order-book depth (we have no order-book data, so any "dynamic slippage by
// depth" would be invention). No maker fill-rate model beyond the explicit
// `makerFillRate` knob. No look-ahead: every decision at time T uses only bars
// that closed at or before T.
// ════════════════════════════════════════════════════════════════════════════

import * as S from '../shared/strategy.ts'

const H1 = 3_600_000
const H4 = 14_400_000
const H8 = 8 * H1

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

export type Sleeve = 'DONCH4H' | 'ROTA'

/**
 * Who gets the money when there is not enough for every signal in one step.
 *
 * This matters more than it looks. The LIVE bot currently has no policy at all:
 * entries run in `Promise.all` batches, so whichever coin's network round-trip
 * returned first takes the capital. That is not a neutral default, it is an
 * arbitrary one, and it is why this is a measured parameter rather than a fix
 * applied on a hunch — note that 'adx' is NOT obviously best, because high-ADX
 * entries size up to 2.0x and therefore consume the remaining room faster, which
 * can leave fewer total positions open. Trade count is a standing rule, so this
 * has to be measured before anything is changed live.
 */
export type AllocPolicy =
  | 'arrival'      // signal order, i.e. what live does today (the baseline)
  | 'adx'          // strongest trend first
  | 'edge_cost'    // best expected edge per dollar of cost
  | 'donch_first'  // breakouts get first refusal, ROTA takes the remainder
  | 'rota_first'   // the rotation basket is funded first

export interface SimConfig {
  startCash: number
  sleeves: Sleeve[]              // which engines are live this run
  alloc: AllocPolicy
  slipBps: number
  intrabar: 'conservative' | 'optimistic'
  /** Fraction of ladder legs assumed to fill as resting maker orders. The rest
   *  are treated as market fills at the same level (taker + slippage). 1.0 is
   *  the assumption every earlier backtest made without saying so. */
  makerFillRate: number
  fundingPer8h: number
  /** Cap on pyramid units; 1 disables pyramiding so its contribution can be
   *  isolated rather than argued about. */
  pyramidMax: number
  manageOn: '1h' | '4h'
  /**
   * PARITY MODE — a diagnostic, never a result.
   *
   * Removes every capital constraint AND the two rules that stop a symbol being
   * re-entered (the pyramid gate and the 8h cooldown), so the engine takes the
   * same signal set the old unconstrained scan took. Its only job is to answer
   * one question: if per-trade expectancy still does not reproduce the
   * documented +0.046R, the LADDER is wrong; if it does reproduce it, the ladder
   * is right and the constrained run's lower expectancy is a SELECTION effect,
   * not a bug.
   *
   * That distinction cannot be argued, only measured — which is the whole reason
   * this flag exists.
   */
  parity: boolean
  /**
   * HARD cap on DONCH4H exposure as a fraction of portfolio, or null for
   * today's behaviour (no explicit budget — the sleeves simply race for the
   * shared heat cap).
   *
   * WHY THIS EXISTS: v80bt measured DONCH4H alone at -46.9% and together with
   * ROTA at +70.1%. The breakout sleeve is only profitable on the LEFTOVERS.
   * But nothing GUARANTEES it gets only leftovers — if ROTA's health
   * kill-switch fires it unwinds its whole basket, and DONCH4H inherits the
   * entire book, i.e. exactly the losing configuration, with no one deciding
   * it. Today's good behaviour is an accident of ROTA's timing, not a design.
   */
  donchBudget: number | null
  /**
   * THE HEALTH KILL-SWITCH, which every run before v83bt silently omitted.
   *
   * The live bot pauses a sleeve's ENTRIES when the sum of its last 30 closed
   * trades is negative, and ROTA additionally UNWINDS ITS WHOLE BASKET when
   * paused. v56.6 added a release: a window whose newest close is older than
   * 48h is stale and the pause lifts.
   *
   * Leaving it out means the simulator has been modelling a bot that can never
   * stop trading — which is exactly the scenario in which the DONCH4H budget cap
   * matters, since a paused ROTA hands the entire book to the breakout sleeve.
   * Default false so every number measured before this stays comparable; v83bt
   * turns it on and reports the difference.
   */
  killSwitch: boolean
  /**
   * The trailing third's floor. 'breakeven' is what the LIVE BOT does and the
   * default. 'free' reproduces the convention every historical backtest used,
   * where the chandelier floats from an extreme seeded at entry and the final
   * third can fall to roughly entry - 1.79R before stopping.
   *
   * These are NOT the same strategy, and the difference was invisible for as
   * long as the rules were written down twice.
   */
  trailFloor: 'breakeven' | 'free'
  /**
   * WYCKOFF STRUCTURE TILT — research, null by default (v84bt).
   *
   * A SIZING tilt, never a filter: every signal is still taken, some at a
   * different size. That is deliberate. Standing rule 5 forbids improving
   * profitability by cutting trades, and both Wyckoff constructs are exactly
   * the kind of thing one is tempted to turn into a "skip the weak breakout"
   * rule — which is what v54bt (volume) and v68bt (bar size) already rejected.
   */
  wyckoff: WyckTilt | null
  /**
   * UNIFORM risk multiplier on every DONCH4H entry — the CONTROL for any
   * per-trade tilt, added in v85bt.
   *
   * v84bt's best Wyckoff row upsized the trades part A had just measured as
   * WORSE and downsized the ones it measured as BETTER, and still scored +20
   * points. A tilt that beats the incumbent while pointing the wrong way is not
   * reading its feature; it is moving total sleeve exposure. This knob moves
   * exposure with NO feature attached, so the two can finally be told apart.
   */
  donchRiskMult: number
  /**
   * ROTA's per-side book fraction, or null for the deployed 0.35 (= 70% of
   * capital across both sides). The sleeve-split question, made measurable.
   */
  rotaBook: number | null
  /** v95bt: names per side for ROTA (default S.ROTA_K). */
  rotaK?: number
  /** Leverage: overrides the 0.95 heat cap, or null for the deployed caps. */
  heatCap: number | null
  /**
   * MARGIN LEVERAGE. 1 = the deployed cash account, where a position costs its
   * full notional and nothing can ever be liquidated.
   *
   * Above 1 the engine posts notional/leverage as margin and a LIQUIDATION
   * ENGINE becomes active (see `maintMargin`). These two ship together on
   * purpose: v88bt printed five identical leverage rows because the cash
   * constraint silently bound first, and a leverage model WITHOUT liquidation
   * is worse than none — it lets a dead account keep trading and reports the
   * profits it "made" afterwards.
   */
  leverage: number
  /**
   * Maintenance margin rate, isolated per position. A position is liquidated
   * when its unrealised loss has consumed (1 - maintMargin) of the margin
   * posted against it — i.e. you lose the margin, which is what a real
   * isolated-margin liquidation does. 0.005 is typical for large crypto perps.
   */
  maintMargin: number
}

export interface WyckTilt {
  /** 'spring' = shakeout quality only; 'er' = effort/result only; 'both' = the
   *  conjunction, which is the actual Wyckoff reading of a strong markup. */
  mode: 'spring' | 'er' | 'both'
  /** size multiplier when the structure reads favourable */
  boost: number
  /** size multiplier when it reads unfavourable */
  damp: number
  /** effort÷result above this counts as absorption (supply meeting the move) */
  erHi: number
}

/** Bounded so a tilt can never become a filter by shrinking a ticket to zero,
 *  and never a risk raise by the back door. */
function wyckMult(f: S.WyckoffFeat | null, w: WyckTilt | null): number {
  if (!w || !f) return 1
  const absorbed = f.er > w.erHi
  let good: boolean, bad: boolean
  switch (w.mode) {
    case 'spring': good = f.spring; bad = !f.spring; break
    case 'er':     good = !absorbed; bad = absorbed; break
    case 'both':   good = f.spring && !absorbed; bad = !f.spring && absorbed; break
  }
  const m = good ? w.boost : bad ? w.damp : 1
  return Math.min(2, Math.max(0.25, m))
}

export function defaultConfig(over: Partial<SimConfig> = {}): SimConfig {
  return {
    startCash: 10_000,
    sleeves: ['DONCH4H', 'ROTA'],
    alloc: 'arrival',
    slipBps: 3,
    intrabar: 'conservative',
    makerFillRate: 1.0,
    fundingPer8h: 0.0001,
    pyramidMax: S.PYRAMID_MAX,
    manageOn: '1h',
    parity: false,
    trailFloor: 'breakeven',
    donchBudget: null,
    killSwitch: false,
    wyckoff: null,
    donchRiskMult: 1,
    rotaBook: null,
    heatCap: null,
    leverage: 1,
    maintMargin: 0.005,
    ...over,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

interface Position {
  id: number
  sym: string
  sleeve: Sleeve
  side: S.Side
  entry: number
  openedAt: number
  /** cash actually withdrawn at entry — returned on close, as the live bot does */
  costBasis: number
  /** margin posted per unit of size. At leverage 1 this is simply the entry
   *  price, so every cash-account result is bit-identical to before. */
  marginPerUnit: number
  sizeOrig: number
  sizeLeft: number
  origSlDist: number
  stage: 0 | 1 | 2
  stopPx: number
  riskUsd: number
  legsBanked: number
  adx: number
  unit: number            // 1 = first unit on this symbol, 2/3 = pyramid
  wyck: S.WyckoffFeat | null
  lastFundingAt: number
  feesPaid: number
  slipPaid: number
  fundingPaid: number
}

export interface ClosedTrade {
  sym: string
  sleeve: Sleeve
  side: S.Side
  entry: number
  exit: number
  openedAt: number
  closedAt: number
  pnl: number
  r: number
  riskUsd: number
  notional: number
  adx: number
  unit: number
  /** Wyckoff structure of the breakout bar, measured on EVERY trade whether or
   *  not a tilt is active. Null for ROTA, which has no breakout bar. */
  wyck: S.WyckoffFeat | null
  reason: string
  /** profit already banked by the ladder legs before this close. Exposed because
   *  the ratio of "banked a leg then stopped at breakeven" trades is the tell for
   *  a whole class of intra-bar accounting bug — see the regression guard in
   *  tests/portfolio.test.ts. */
  legsBanked: number
  fees: number
  slip: number
  funding: number
  heldH: number
}

/** A signal the engine produced but could not fund. The whole point of the
 *  exercise: an unconstrained model cannot have these, so it cannot know what
 *  they were worth. */
export interface Rejection {
  t: number
  sym: string
  sleeve: Sleeve
  side: S.Side
  reason: 'cash' | 'heat' | 'net_exposure' | 'per_coin' | 'too_small'
  adx: number
  wantedNotional: number
  /** what this trade WOULD have made, simulated forward with the same rules.
   *  Filled in by a shadow pass, so "profit lost to the cap" is measured and not
   *  guessed at. */
  shadowR?: number
}

export interface SimResult {
  closed: ClosedTrade[]
  rejections: Rejection[]
  equity: { t: number; equity: number; cash: number; exposure: number }[]
  finalEquity: number
  peakExposurePct: number
  /** mean of (exposure / equity) over the run — how hard the capital worked */
  utilisation: number
  turnoverNotional: number
  fees: number
  slip: number
  funding: number
  /** kill-switch telemetry — zero when cfg.killSwitch is false */
  liquidations: number
  /** timestamp at which equity hit ~zero and the account stopped, or null */
  ruinedAt: number | null
  donchPausedDays: number
  rotaPausedDays: number
  rotaUnwinds: number
}

// ─────────────────────────────────────────────────────────────────────────────
// The simulator
// ─────────────────────────────────────────────────────────────────────────────

export interface CoinData {
  /** completed 4h bars, ascending by open time */
  b4: S.Bar[]
  /** 1h bars for intra-4h management, ascending */
  b1: S.Bar[]
}

export function runPortfolio(
  data: Record<string, CoinData>,
  cfg: SimConfig,
  tFrom: number,
  tTo: number,
): SimResult {
  const SLIP = cfg.slipBps / 10_000
  const syms = Object.keys(data).filter(s => (S.CRYPTO_40 as readonly string[]).includes(s))

  let cash = cfg.startCash
  let nextId = 1
  const open: Position[] = []
  const closed: ClosedTrade[] = []
  const lastCloseBySym = new Map<string, number>()
  const closedBySleeve: Record<Sleeve, ClosedTrade[]> = { DONCH4H: [], ROTA: [] }
  let liquidations = 0
  let ruinedAt: number | null = null
  let donchPausedDays = 0, rotaPausedDays = 0, rotaUnwinds = 0
  const rejections: Rejection[] = []
  const equity: SimResult['equity'] = []
  let fees = 0, slip = 0, funding = 0, turnover = 0
  let peakExposurePct = 0
  let utilSum = 0, utilN = 0

  // index per symbol so lookups are O(1) instead of a scan per step
  const idx4 = new Map<string, Map<number, number>>()
  const idx1 = new Map<string, Map<number, number>>()
  for (const s of syms) {
    const m4 = new Map<number, number>()
    data[s].b4.forEach((b, i) => m4.set(b.t, i))
    idx4.set(s, m4)
    const m1 = new Map<number, number>()
    data[s].b1.forEach((b, i) => m1.set(b.t, i))
    idx1.set(s, m1)
  }

  const markOf = (sym: string, t: number): number | null => {
    const m = idx1.get(sym)!, arr = data[sym].b1
    const i = m.get(t - H1)   // the bar that most recently CLOSED at t
    if (i === undefined) return null
    return arr[i].close
  }

  const exposureOf = () => open.reduce((a, p) => a + p.entry * p.sizeLeft, 0)
  const symExposure = (sym: string) =>
    open.filter(p => p.sym === sym).reduce((a, p) => a + p.entry * p.sizeLeft, 0)
  const sideExposure = () => open.reduce((acc, p) => {
    const n = p.entry * p.sizeLeft
    if (p.side === 'LONG') acc.l += n; else acc.s += n
    return acc
  }, { l: 0, s: 0 })

  const unrealised = (t: number) => open.reduce((a, p) => {
    const mk = markOf(p.sym, t)
    if (mk === null) return a
    return a + (mk - p.entry) * p.sizeLeft * (p.side === 'LONG' ? 1 : -1)
  }, 0)

  /** Margin actually posted and still locked in open positions. At leverage 1
   *  this equals exposureOf() exactly, so nothing about the cash-account path
   *  changes. */
  const postedMargin = () => open.reduce((a, p) => a + p.marginPerUnit * p.sizeLeft, 0)
  const equityAt = (t: number) => cash + postedMargin() + unrealised(t)

  // Deterministic pseudo-randomness for the maker-fill draw. A backtest that
  // returns a different number each run cannot be compared to itself, so this
  // must never be Math.random().
  let rngState = 0x9e3779b9
  const rng = () => {
    rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0
    return rngState / 0x100000000
  }

  // ── closing ────────────────────────────────────────────────────────────────
  /** `px` is the raw level. `applySlip` false means the caller already priced it. */
  function closePosition(p: Position, px: number, t: number, reason: string,
                         feeRate: number, applySlip: boolean) {
    const dirM = p.side === 'LONG' ? 1 : -1
    let fillPx = px
    let slipCost = 0
    if (applySlip) {
      fillPx = px * (1 - dirM * SLIP)
      slipCost = Math.abs(px - fillPx) * p.sizeLeft
    }
    const fee = fillPx * p.sizeLeft * feeRate
    const legPnl = (fillPx - p.entry) * p.sizeLeft * dirM - fee
    const pnl = legPnl + p.legsBanked

    cash += p.marginPerUnit * p.sizeLeft + legPnl
    fees += fee; slip += slipCost; turnover += fillPx * p.sizeLeft
    p.feesPaid += fee; p.slipPaid += slipCost

    closed.push({
      sym: p.sym, sleeve: p.sleeve, side: p.side, entry: p.entry, exit: fillPx,
      openedAt: p.openedAt, closedAt: t, pnl,
      r: p.riskUsd > 0 ? pnl / p.riskUsd : 0,
      riskUsd: p.riskUsd, notional: p.entry * p.sizeOrig, adx: p.adx, unit: p.unit,
      wyck: p.wyck, reason, legsBanked: p.legsBanked, fees: p.feesPaid, slip: p.slipPaid,
      funding: p.fundingPaid,
      heldH: (t - p.openedAt) / H1,
    })
    if (p.sleeve === 'DONCH4H') lastCloseBySym.set(p.sym, t)
    closedBySleeve[p.sleeve].push(closed[closed.length - 1])
    open.splice(open.indexOf(p), 1)
  }

  // ── ladder management for one position over one management bar ─────────────
  function manage(p: Position, bar: S.Bar, t: number) {
    const dirM = p.side === 'LONG' ? 1 : -1
    const ageMs = t - p.openedAt

    // ── LIQUIDATION, checked before anything else ────────────────────────────
    // Isolated margin: the position dies when its unrealised loss has eaten
    // (1 - maintMargin) of the margin posted against it. Tested against the
    // bar's ADVERSE extreme, because an exchange liquidates intrabar on a wick
    // and does not wait politely for the close.
    //
    // This runs BEFORE the ladder so a stop cannot "save" a position the
    // exchange would already have closed — getting that order wrong is exactly
    // how a leveraged backtest flatters itself.
    if (cfg.leverage > 1) {
      const adverseX = p.side === 'LONG' ? bar.low : bar.high
      const marginHeld = p.marginPerUnit * p.sizeLeft
      const loss = (p.entry - adverseX) * p.sizeLeft * dirM
      if (loss >= marginHeld * (1 - cfg.maintMargin)) {
        // The liquidation price, not the bar extreme: the exchange closes you
        // the moment maintenance margin is breached.
        const liqPx = p.entry - dirM * (marginHeld * (1 - cfg.maintMargin)) / p.sizeLeft
        liquidations++
        closePosition(p, liqPx, t, 'liquidated', S.FEE_TAKER, true)
        return
      }
    }

    // funding accrues on the notional, longs pay and shorts receive
    while (t - p.lastFundingAt >= H8) {
      const f = p.entry * p.sizeLeft * cfg.fundingPer8h * dirM
      cash -= f; funding += f; p.fundingPaid += f
      p.lastFundingAt += H8
    }

    // ROTA exits only at rebalance, but its perpetual positions still accrue
    // funding. Returning before the accrual silently exempted this whole book.
    if (p.sleeve === 'ROTA') return

    // The adverse extreme is what can hit a stop; the favourable extreme is what
    // can hit a target or ratchet the trail.
    const adverse = p.side === 'LONG' ? bar.low : bar.high
    const favour = p.side === 'LONG' ? bar.high : bar.low

    // ONE DIRECTION PER BAR. This is the correction that made v80bt's first run
    // worthless, and it is worth spelling out because the wrong version looked
    // more conservative, not less.
    //
    // The first draft looped: bank a leg off the bar's favourable extreme, then
    // immediately re-test the freshly-moved breakeven stop against the SAME
    // bar's adverse extreme. That charges one bar's range twice, in opposite
    // directions, as if both happened and the bad one happened second. Almost
    // every winner therefore banked a third at 0.6R and was instantly stopped at
    // breakeven — win rate came out at 51% against the documented 66%, and every
    // single configuration lost money.
    //
    // So: the stop gets first refusal at its PRE-BAR level. If it survives, the
    // bar may advance through as many target rungs as its favourable extreme
    // reached — a fast hour really can clear 0.6R and 1.0R, and the live bot,
    // polling every minute, really would bank both — but the stop that those
    // legs just moved is not re-tested until the next bar.
    const preBarStop = p.stopPx
    {
      const pos: S.LadderPos = {
        side: p.side, entry: p.entry, origSlDist: p.origSlDist,
        stage: p.stage, stopPx: preBarStop, sizeLeft: p.sizeLeft, sizeOrig: p.sizeOrig,
      }
      // ladderStep tests the stop before the target, so feeding it the ADVERSE
      // extreme resolves the bar pessimistically in one call. 'optimistic' gives
      // the target first refusal, then re-tests the stop if nothing fired.
      const beFloor = cfg.trailFloor === 'breakeven'
      // BOTH arguments are the ADVERSE extreme, and that is the point.
      //
      // The first fix caught this double-count for stages 0 and 1 and MISSED it
      // for stage 2, because the ratchet happens INSIDE ladderStep: passing the
      // bar's favourable extreme as favPx raises the chandelier using this bar's
      // high and then tests this bar's low against the raised level. Same bar,
      // counted twice, in opposite directions — the identical defect, one stage
      // over, and it lived in exactly the stage that carries the fat-tail profit.
      //
      // Passing `adverse` for both makes this a pure question: did the stop, AT
      // THE LEVEL IT HELD WHEN THE BAR OPENED, get hit? The ratchet then happens
      // in the rung loop below, where it belongs, and applies from the next bar.
      let act = cfg.intrabar === 'conservative'
        ? S.ladderStep(pos, adverse, adverse, ageMs, beFloor, SLIP)
        : S.ladderStep(pos, favour, favour, ageMs, beFloor, SLIP)
      if (cfg.intrabar === 'optimistic' && act.kind === 'none') {
        act = S.ladderStep({ ...pos, stopPx: act.stopPx }, adverse, adverse, ageMs, beFloor, SLIP)
      }
      if (act.kind === 'close') {
        const raw = act.px / (1 - dirM * SLIP)
        const sc = Math.abs(raw - act.px) * p.sizeLeft
        slip += sc; p.slipPaid += sc
        closePosition(p, act.px, t, act.reason, S.FEE_TAKER, false)
        return
      }
    }

    // The stop held. Now advance the rungs the favourable extreme reached.
    for (let guard = 0; guard < 4; guard++) {
      if (p.sizeLeft <= 1e-12) return
      const pos: S.LadderPos = {
        side: p.side, entry: p.entry, origSlDist: p.origSlDist,
        stage: p.stage, stopPx: p.stopPx, sizeLeft: p.sizeLeft, sizeOrig: p.sizeOrig,
      }
      // Probe with the favourable extreme only: the stop was already given its
      // chance above, at the level it held when the bar opened.
      const act = S.ladderStep(pos, favour, favour, ageMs, cfg.trailFloor === 'breakeven', SLIP)

      if (act.kind === 'leg') {
        // A resting limit at the level. makerFillRate < 1 treats the remainder
        // as a market fill — the honest handling of a leg that never rested.
        const asMaker = cfg.makerFillRate >= 1 ? true : rng() < cfg.makerFillRate
        const qty = act.qty
        const fillPx = asMaker ? act.px : act.px * (1 - dirM * SLIP)
        const fee = fillPx * qty * (asMaker ? S.FEE_MAKER : S.FEE_TAKER)
        const legPnl = (fillPx - p.entry) * qty * dirM - fee
        cash += p.marginPerUnit * qty + legPnl
        fees += fee; turnover += fillPx * qty
        if (!asMaker) { const sc = Math.abs(act.px - fillPx) * qty; slip += sc; p.slipPaid += sc }
        p.feesPaid += fee
        p.legsBanked += legPnl
        p.sizeLeft -= qty
        p.stage = act.stage
        p.stopPx = act.stopPx
        continue          // the same bar may reach the next rung
      }
      if (act.kind === 'close') {
        // ladderStep already priced the slippage into act.px — charge the cost
        // to the running total, but do NOT let closePosition apply it again.
        const raw = act.px / (1 - dirM * SLIP)
        const sc = Math.abs(raw - act.px) * p.sizeLeft
        slip += sc; p.slipPaid += sc
        closePosition(p, act.px, t, act.reason, S.FEE_TAKER, false)
        return
      }
      p.stopPx = act.stopPx
      return
    }
  }

  // ── entry ──────────────────────────────────────────────────────────────────
  interface Candidate {
    sym: string; side: S.Side; adx: number; atr: number; price: number
    slDist: number; slPct: number; quoteVol24h: number; seq: number
    wyck: S.WyckoffFeat | null
  }

  function tryOpen(c: Candidate, t: number): boolean {
    const exp = exposureOf()
    const port = cash + exp + unrealised(t)
    const se = sideExposure()

    const units = open.filter(p => p.sym === c.sym && p.sleeve === 'DONCH4H')
      .map(p => ({ side: p.side, entry: p.entry, origSlDist: p.origSlDist }))
    // The pyramid gate is a STRATEGY rule, not a capital shortage, and it fires
    // on most bars of most open positions. Counting it as a "rejection" buried
    // the capital signal under tens of thousands of rows on the first run — the
    // rejection log exists to measure what the CAPS cost us, so it stays clean.
    // The contribution of units 2 and 3 is measured separately, by unit index.
    if (!cfg.parity && (units.length >= cfg.pyramidMax ||
        !S.pyramidGateOk(units as S.OpenUnit[], c.side, c.price))) return false

    // The explicit sleeve budget, applied BEFORE the shared caps so it binds
    // whatever ROTA is doing — including when ROTA holds nothing at all.
    if (cfg.donchBudget !== null) {
      const donchExp = open.filter(x => x.sleeve === 'DONCH4H')
        .reduce((a, x) => a + x.entry * x.sizeLeft, 0)
      const room = Math.max(0, port * cfg.donchBudget - donchExp)
      if (room < S.MIN_NOTIONAL) {
        rejections.push({ t, sym: c.sym, sleeve: 'DONCH4H', side: c.side,
          reason: 'heat', adx: c.adx, wantedNotional: room })
        return false
      }
    }

    const sized = S.sizeBreakout({
      portfolio: port, balance: cash, openExposure: exp, heatCommitted: 0,
      longExposure: se.l, shortExposure: se.s, symExposure: symExposure(c.sym),
      adx: c.adx, slPct: c.slPct, side: c.side, quoteVol24h: c.quoteVol24h,
      riskMult: wyckMult(c.wyck, cfg.wyckoff) * cfg.donchRiskMult,
      heatCap: cfg.heatCap ?? undefined,
    })

    if (!sized.ok) {
      const want = (port * S.BASE_RISK_PCT * S.adxTierMult(c.adx) *
        wyckMult(c.wyck, cfg.wyckoff) * cfg.donchRiskMult) / c.slPct
      const reason: Rejection['reason'] =
        sized.reason === 'heat_limit' ? 'heat'
        : sized.reason === 'net_exposure_cap' ? 'net_exposure'
        : sized.reason === 'per_coin_cap' ? 'per_coin'
        : cash < S.MIN_NOTIONAL ? 'cash' : 'too_small'
      rejections.push({ t, sym: c.sym, sleeve: 'DONCH4H', side: c.side, reason, adx: c.adx,
        wantedNotional: want })
      return false
    }

    let notional = sized.notional
    if (cfg.donchBudget !== null) {
      const donchExp = open.filter(x => x.sleeve === 'DONCH4H')
        .reduce((a, x) => a + x.entry * x.sizeLeft, 0)
      notional = Math.min(notional, Math.max(0, port * cfg.donchBudget - donchExp))
      if (notional < S.MIN_NOTIONAL) {
        rejections.push({ t, sym: c.sym, sleeve: 'DONCH4H', side: c.side,
          reason: 'heat', adx: c.adx, wantedNotional: notional })
        return false
      }
    }
    const dirM = c.side === 'LONG' ? 1 : -1
    const fillPx = c.price * (1 + dirM * SLIP)
    const size = notional / fillPx
    const feeIn = notional * S.FEE_TAKER
    if (cash < notional / cfg.leverage + feeIn) {
      rejections.push({ t, sym: c.sym, sleeve: 'DONCH4H', side: c.side, reason: 'cash',
        adx: c.adx, wantedNotional: notional })
      return false
    }

    const marginIn = notional / cfg.leverage
    cash -= marginIn + feeIn
    fees += feeIn; slip += Math.abs(fillPx - c.price) * size; turnover += notional
    open.push({
      id: nextId++, sym: c.sym, sleeve: 'DONCH4H', side: c.side, entry: fillPx,
      openedAt: t, costBasis: marginIn, marginPerUnit: marginIn / size,
      sizeOrig: size, sizeLeft: size,
      origSlDist: c.slDist, stage: 0, stopPx: c.price - c.slDist * dirM,
      riskUsd: c.slDist * size, legsBanked: 0, adx: c.adx, unit: units.length + 1,
      wyck: c.wyck, lastFundingAt: t, feesPaid: feeIn, slipPaid: Math.abs(fillPx - c.price) * size,
      fundingPaid: 0,
    })
    return true
  }

  // ── ROTA ───────────────────────────────────────────────────────────────────
  let lastRota = 0

  function rebalanceRota(t: number) {
    const rows: S.RotaRow[] = []
    for (const sym of syms) {
      const m = idx4.get(sym)!
      const i = m.get(t - H4)
      if (i === undefined) continue
      // WINDOWED, not sliced from zero. rotaStats reads ROTA_LB+1 bars; copying
      // the whole history 40x per rebalance turns a 90-second run into an hour.
      const completed = data[sym].b4.slice(Math.max(0, i - (S.ROTA_LB + 4)), i + 1)
      const st = S.rotaStats(sym, completed)
      if (st) rows.push(st)
    }
    const targets = S.rotaTargets(rows, cfg.rotaK ?? S.ROTA_K)
    if (targets.length === 0) return

    const want = new Map(targets.map(x => [x.sym, x]))
    const port = cash + exposureOf() + unrealised(t)

    // close what left the basket, flipped, or drifted out of its band
    for (const p of open.filter(x => x.sleeve === 'ROTA').slice()) {
      const tgt = want.get(p.sym)
      const wantSide = tgt ? (tgt.dir === 1 ? 'LONG' : 'SHORT') : null
      if (wantSide === p.side) {
        const cur = p.entry * p.sizeLeft
        if (S.rotaSizeOk(cur, S.rotaSlotTarget(port, tgt!.weight, cfg.rotaBook ?? undefined))) { want.delete(p.sym); continue }
      }
      const mk = markOf(p.sym, t)
      if (mk !== null) closePosition(p, mk, t, 'rota_exit', S.FEE_TAKER, true)
    }

    // open / resize the rest
    for (const [sym, tgt] of want) {
      const mk = markOf(sym, t)
      if (mk === null) continue
      const port2 = cash + exposureOf() + unrealised(t)
      let slot = S.rotaSlotTarget(port2, tgt.weight, cfg.rotaBook ?? undefined)
      slot = Math.min(slot, Math.max(0, port2 * S.PER_COIN_CAP - symExposure(sym)))
      const side: S.Side = tgt.dir === 1 ? 'LONG' : 'SHORT'
      if (slot < port2 * 0.01) {
        rejections.push({ t, sym, sleeve: 'ROTA', side, reason: 'per_coin', adx: 0, wantedNotional: slot })
        continue
      }
      // the heat cap is shared with DONCH4H — this is where the sleeves actually
      // compete, and the rejection row is the evidence of it
      const heatRoom = Math.max(0, port2 * S.MAX_HEAT_PCT - exposureOf())
      if (slot > heatRoom) slot = heatRoom
      if (slot < port2 * 0.01) {
        rejections.push({ t, sym, sleeve: 'ROTA', side, reason: 'heat', adx: 0, wantedNotional: slot })
        continue
      }
      const feeIn = slot * S.FEE_TAKER
      if (cash < slot + feeIn) {
        rejections.push({ t, sym, sleeve: 'ROTA', side, reason: 'cash', adx: 0, wantedNotional: slot })
        continue
      }
      const dirM = tgt.dir
      const fillPx = mk * (1 + dirM * SLIP)
      const size = slot / fillPx
      const marginIn = slot / cfg.leverage
      cash -= marginIn + feeIn
      fees += feeIn; slip += Math.abs(fillPx - mk) * size; turnover += slot
      open.push({
        id: nextId++, sym, sleeve: 'ROTA', side, entry: fillPx, openedAt: t,
        costBasis: marginIn, marginPerUnit: marginIn / size,
        sizeOrig: size, sizeLeft: size, origSlDist: 0, stage: 0,
        stopPx: 0, riskUsd: 0, legsBanked: 0, adx: 0, unit: 1, wyck: null, lastFundingAt: t,
        feesPaid: feeIn, slipPaid: Math.abs(fillPx - mk) * size, fundingPaid: 0,
      })
    }
    lastRota = t
  }

  /**
   * Exactly the live rule: the sum of the last 30 CLOSED trades of this sleeve.
   * Fewer than 30 cannot pause (this is what makes the reset endpoint an unblock).
   * A window whose newest close is older than HEALTH_STALE_H is stale and
   * releases — the v56.6 fix for the deadlock that froze the bot for 45 days.
   */
  const HEALTH_STALE_MS = 48 * H1
  function paused(sleeve: Sleeve, t: number): boolean {
    if (!cfg.killSwitch) return false
    const arr = closedBySleeve[sleeve]
    if (arr.length < 30) return false
    const last30 = arr.slice(-30)
    const newest = last30[last30.length - 1].closedAt
    if (t - newest > HEALTH_STALE_MS) return false      // stale window releases
    return last30.reduce((a, x) => a + x.pnl, 0) < 0
  }

  // ── the event loop ─────────────────────────────────────────────────────────
  const step = cfg.manageOn === '1h' ? H1 : H4
  let seq = 0

  for (let t = Math.ceil(tFrom / step) * step; t <= tTo; t += step) {
    // 1. MANAGE — exits before entries, always.
    // At 4h resolution the management bar must be the 4h bar, not whichever 1h
    // bar happens to sit at t-4h. Getting that wrong would silently drop three
    // hours of range out of every stop check and make the coarse mode look far
    // better than it is — which is exactly the comparison being measured here.
    for (const p of open.slice()) {
      const m = step === H1 ? idx1.get(p.sym)! : idx4.get(p.sym)!
      const arr = step === H1 ? data[p.sym].b1 : data[p.sym].b4
      const i = m.get(t - step)
      if (i === undefined) continue
      manage(p, arr[i], t)
    }

    // 2. DECIDE — only on a 4h boundary, only from bars that have closed.
    if (t % H4 === 0) {
      const rotaPaused = paused('ROTA', t)
      const donchPaused = paused('DONCH4H', t)
      if (rotaPaused) {
        rotaPausedDays += 4 / 24
        // Paused ROTA UNWINDS — this is the live behaviour and the whole reason
        // the budget cap exists: the breakout sleeve inherits the entire book.
        const open_ = open.filter(x => x.sleeve === 'ROTA')
        if (open_.length) rotaUnwinds++
        for (const p of open_) {
          const mk = markOf(p.sym, t)
          if (mk !== null) closePosition(p, mk, t, 'rota_health_pause', S.FEE_TAKER, true)
        }
      }
      if (donchPaused) donchPausedDays += 4 / 24

      if (cfg.sleeves.includes('ROTA') && !rotaPaused && t - lastRota >= S.ROTA_MS) rebalanceRota(t)

      if (cfg.sleeves.includes('DONCH4H') && !donchPaused) {
        const cands: Candidate[] = []
        for (const sym of syms) {
          const m = idx4.get(sym)!
          const i = m.get(t - H4)
          if (i === undefined || i < 70) continue
          // Same reason as ROTA above. The longest window any of these reads is
          // ADX_BARS=60, so 71 bars is identical to the full prefix.
          const completed = data[sym].b4.slice(i - 70, i + 1)
          const sig = S.donchSignal(completed)
          if (!sig) continue
          const adx = S.gateAdx(completed)
          if (adx <= S.ADX_GATE) continue
          const atr = S.entryAtr(completed)
          if (!atr) continue
          const price = completed[completed.length - 1].close
          const slDist = S.stopDistance(atr, price)
          const slPct = slDist / price
          if (slPct > S.SL_MAX_PCT) continue
          // 8h per-coin cooldown, as the live bot enforces. Kept in a map: a
          // linear scan of a growing closed-trade list per candidate per step is
          // quadratic and would dominate the whole run.
          const lc = lastCloseBySym.get(sym)
          if (!cfg.parity && lc !== undefined && t - lc < 8 * H1) continue
          const quoteVol24h = completed.slice(-6).reduce((a, b) => a + b.vol, 0) * price
          // Measured on every candidate whether or not a tilt is active, so
          // part A can describe the population the deployed config actually
          // trades rather than a population selected by the tilt under test.
          const wyck = S.wyckoffFeatures(completed, sig.side)
          cands.push({ sym, side: sig.side, adx, atr, price, slDist, slPct, quoteVol24h,
            wyck, seq: seq++ })
        }
        for (const c of orderCandidates(cands, cfg.alloc)) tryOpen(c, t)
      }
    }

    // 3. MARK
    if (t % H4 === 0) {
      const exp = exposureOf()
      const eq = cash + postedMargin() + unrealised(t)
      equity.push({ t, equity: eq, cash, exposure: exp })
      if (eq > 0) {
        const u = exp / eq
        peakExposurePct = Math.max(peakExposurePct, u)
        utilSum += u; utilN++
      }
      // ── ACCOUNT DEATH ──────────────────────────────────────────────────────
      // A levered account that reaches zero equity is GONE. It does not trade
      // its way back, and a backtest that lets it keep going is reporting
      // profits earned by a corpse. Everything is force-closed and the window
      // is over. Without this, the "leverage" rows are fiction.
      if (ruinedAt === null && eq <= cfg.startCash * 0.01) {
        ruinedAt = t
        for (const p of open.slice()) {
          const mk = markOf(p.sym, t)
          if (mk !== null) closePosition(p, mk, t, 'account_ruined', S.FEE_TAKER, true)
        }
        break
      }
    }
  }

  return {
    closed, rejections, equity,
    finalEquity: equity.length ? equity[equity.length - 1].equity : cfg.startCash,
    peakExposurePct,
    utilisation: utilN ? utilSum / utilN : 0,
    turnoverNotional: turnover,
    fees, slip, funding,
    donchPausedDays, rotaPausedDays, rotaUnwinds,
    liquidations, ruinedAt,
  }
}

/** The allocation policies, in one place so the comparison is apples to apples. */
function orderCandidates<T extends { adx: number; slPct: number; seq: number }>(
  c: T[], policy: AllocPolicy,
): T[] {
  const a = c.slice()
  switch (policy) {
    case 'adx':
      return a.sort((x, y) => y.adx - x.adx || x.seq - y.seq)
    case 'edge_cost':
      // expected edge per unit of round-trip cost. The tier multiplier is the
      // only validated proxy we have for edge (v44/v58bt/v72bt); cost scales
      // with 1/slPct because a tighter stop means more notional per unit of risk.
      return a.sort((x, y) =>
        (S.adxTierMult(y.adx) * y.slPct) - (S.adxTierMult(x.adx) * x.slPct) || x.seq - y.seq)
    case 'arrival':
    case 'donch_first':
    case 'rota_first':
    default:
      return a.sort((x, y) => x.seq - y.seq)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Metrics — Total R alone is not enough to judge a capital-constrained run.
// ─────────────────────────────────────────────────────────────────────────────

export interface Metrics {
  netUsd: number; netPct: number; cagr: number
  maxDD: number; calmar: number; sharpe: number; sortino: number
  profitFactor: number; expectancyUsd: number; expectancyR: number
  trades: number; wins: number; winRate: number
  rejected: number; rejectedByReason: Record<string, number>
  utilisation: number; turnoverX: number
  fees: number; slip: number; funding: number
  totR: number
}

/** A missing, invalid, flat or losing window cannot satisfy the owner's all-six
 * rule. This is one necessary condition, not a complete deployment approval. */
export function allSixPositive(netReturns: readonly number[]): boolean {
  return netReturns.length === 6 && netReturns.every(x => Number.isFinite(x) && x > 0)
}

export function metrics(r: SimResult, startCash: number, days: number): Metrics {
  const eq = r.equity.map(e => e.equity)
  const net = r.finalEquity - startCash
  let peak = -Infinity, maxDD = 0
  for (const v of eq) { if (v > peak) peak = v; if (peak > 0) maxDD = Math.max(maxDD, (peak - v) / peak) }

  const rets: number[] = []
  for (let i = 1; i < eq.length; i++) if (eq[i - 1] > 0) rets.push(eq[i] / eq[i - 1] - 1)
  const mu = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0
  const sd = rets.length ? Math.sqrt(rets.reduce((a, b) => a + (b - mu) ** 2, 0) / rets.length) : 0
  const dn = rets.filter(x => x < 0)
  const dsd = dn.length ? Math.sqrt(dn.reduce((a, b) => a + b * b, 0) / dn.length) : 0
  const perYear = 6 * 365   // 4h marks

  const wins = r.closed.filter(t => t.pnl > 0)
  const gross = wins.reduce((a, t) => a + t.pnl, 0)
  const loss = -r.closed.filter(t => t.pnl <= 0).reduce((a, t) => a + t.pnl, 0)
  const withR = r.closed.filter(t => t.riskUsd > 0)

  const byReason: Record<string, number> = {}
  for (const x of r.rejections) byReason[x.reason] = (byReason[x.reason] ?? 0) + 1

  const years = days / 365
  return {
    netUsd: net,
    netPct: startCash > 0 ? net / startCash * 100 : 0,
    cagr: years > 0 && r.finalEquity > 0 ? ((r.finalEquity / startCash) ** (1 / years) - 1) * 100 : 0,
    maxDD: maxDD * 100,
    calmar: maxDD > 0 ? (net / startCash / years) / maxDD : 0,
    sharpe: sd > 0 ? (mu / sd) * Math.sqrt(perYear) : 0,
    sortino: dsd > 0 ? (mu / dsd) * Math.sqrt(perYear) : 0,
    profitFactor: loss > 0 ? gross / loss : (gross > 0 ? Infinity : 0),
    expectancyUsd: r.closed.length ? net / r.closed.length : 0,
    expectancyR: withR.length ? withR.reduce((a, t) => a + t.r, 0) / withR.length : 0,
    trades: r.closed.length,
    wins: wins.length,
    winRate: r.closed.length ? wins.length / r.closed.length * 100 : 0,
    rejected: r.rejections.length,
    rejectedByReason: byReason,
    utilisation: r.utilisation * 100,
    turnoverX: startCash > 0 ? r.turnoverNotional / startCash : 0,
    fees: r.fees, slip: r.slip, funding: r.funding,
    totR: withR.reduce((a, t) => a + t.r, 0),
  }
}

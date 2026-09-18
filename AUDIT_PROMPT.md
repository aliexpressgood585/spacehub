# Adversarial audit request — SpaceHub crypto trading bot

You are a senior quantitative researcher auditing a live, fully-validated
crypto trading system. **Your deliverable is NOT advice — it is a set of
implementation prompts** that a coding agent (Claude Code, which owns this
repo) can execute directly. Write them so they can be pasted in verbatim.

Read the constraints carefully. Four previous external AI reviews all failed
by proposing things already tested and rejected here. Do not become the fifth.

---

## 1. The system as it runs today

Paper-trading crypto bot, Supabase edge function, scans every minute.
Universe: a fixed, validated 40-coin set (`CRYPTO_40`). Crypto perps only.

**Sleeve A — DONCH4H (breakout)**
- Donchian **15**-bar channel on **4h** closes; entries only in the first
  15 min after a 4h close
- Gate: **ADX(60) > 22**
- Stop: **1.4 × ATR(20)**; positions with SL distance > 8% of price are skipped
- Exits (ladder via `exit_stage`): ⅓ at **0.6R** (stop → breakeven),
  ⅓ at **1.0R**, final ⅓ **trails** a chandelier at **2.5 × ATR(4h)**
- Sizing: risk-based, **1.25% base**, ADX-tiered up to 2.5%
  (adx>28 ×1.0, >35 ×1.5, >45 ×2.0; ≤28 ×0.75)
- Pyramiding: 2nd unit on a ≥0.6R winner, 3rd on ≥1.0R, max 3
- Per-coin cooldown 8h; hold cap 96 bars (16d)

**Sleeve B — ROTA (cross-sectional momentum)**
- Every **48h**: rank the 40 coins by **14d momentum** (84 × 4h bars)
- LONG top-8 / SHORT bottom-8, **inverse-volatility** weights
- ~70% of book; per-coin combined cap 20%; resize when a slot drifts ±35%

**Portfolio guards**: total open notional ≤95% of equity; net directional
exposure ≤60%; per-strategy health kill-switch (last-30 closed trades sum < 0
→ pause that sleeve's entries); daily −5%-from-24h-peak brake; USDT depeg
monitor; cross-source bad-tick shield (1.5% tolerance).

**Cost model applied everywhere, in backtest and paper**: taker 0.05%/side,
maker 0.02%/side on resting ladder legs, **3 bps adverse slippage** on every
market fill, hourly perp funding (longs pay / shorts receive 0.01%/8h).

**Measured edge** (36 months, 6 walk-forward windows, all costs on):
WR ≈ 66%, **+0.062R per trade**, total **696R**, n = 11,218 signals.
ROTA: ≈39%/yr taker-net, maxDD 15%.
Monte Carlo drawdown by risk tier: 1.25% → median 16% / p90 25% / p99 36%;
1.75% → 22/34/47%; 2.50% → 31/46/60%.

## 2. The bar any proposal must clear

1. **36-month walk-forward, 6 windows, EVERY window positive.** A config that
   wins on total return but loses one window is rejected. This is absolute.
2. **Never reduce trade count.** Filters that cut signals are rejected on
   principle, even when they raise per-trade edge. Improvements must add
   trades or add edge per trade without removing any.
3. **Must survive 3–6 bps slippage.** A thin per-trade edge that only exists
   at zero cost is an illusion (see v70/71 below).
4. **Must be codeable and falsifiable** from free data (Binance archives:
   OHLCV, funding rates, open-interest metrics; OKX/Bybit live). If it needs
   paid or unobtainable data, label it as such and price it.
5. Crypto only. No equities, no tokenized stocks.

## 3. Already tested and REJECTED — do not propose these

Each with the measured reason. Proposing any of these wastes the review.

**Signal / timeframe**
- 5m, 15m, 30m, 45m across all Donchian widths — negative or window-1
  negative *even gross, fees zero*. 4h is the confirmed inflection point.
- 1h and 12h Donchian sleeves; daily Turtle; daily rotation — windows negative.
- Donchian width 10/12/20/25/40/55/70 — 15 is the peak of a smooth hill.
- **Adaptive Donchian window** (length scales with vol) — the ratio is so
  mean-reverting that avgW stays 15.0 for every exponent; collapses to fixed-15.
- **Heikin-Ashi** smoothing — lags: −42% signals, 413R vs 696R, w6 negative.
- **Linear-regression channel (LSMA±kσ)** — passed the walk-forward bar at
  0 bps (751R) then **died on slippage**: 448R at 3bps vs Donchian 526R,
  negative at 10bps. Thin edge, no cushion.
- Mean reversion in every form tested: 5m, 1h (ADX<22 + RSI extremes,
  −0.13R/trade), 4h Bollinger range-fade, RSI 15m (+0.002R = noise).
  In crypto an RSI extreme predicts **continuation**, not reversal.
- Liquidation-cascade fade (via OI crash) — all 12 configs negative.
- Pair spread / statistical arbitrage (BTC-ETH-SOL) — ~47 trades in 3 years,
  w6 negative.

**Filters (all also violate the no-trade-cut rule)**
- Volume confirmation — cuts 26–63% of trades. *(High-volume breakouts do
  carry ~30% more edge — informative, but unusable as a filter.)*
- Session / time-of-day filters — cut 64–70%.
- Volatility-spike guard — **backwards**: bigger breakout bars are BETTER
  (calm <1.5× → +0.040R; extreme ≥3.5× → +0.126R).
- Squeeze / compression sizing — also backwards; wide channels beat narrow.
- ADX gate 18 or 20 instead of 22 — flips window 5 negative.
- Entry cooldown 1 bar instead of 2 — +33% total R but w5 −4.7‰.
- Correlation-aware sizing and directional-concentration caps — tested twice.
  Skipped clustered trades average **+0.074R**, i.e. they are the WINNERS.
  Simultaneous same-side breakouts = strong trend = when this edge pays most.
  Correlation risk here is intrinsic to the momentum edge.

**Sizing / portfolio**
- **Learned multivariate sizing** (walk-forward OLS over adx, vol, body,
  distance, momentum) — combined effect ≈ **zero** vs flat, and worse than
  the ADX tier alone; extra features made w6 progressively more negative =
  textbook overfit. **ADX is the only feature carrying sizing edge**, and the
  hand-tuned ADX tiers already capture it. The ML/ensemble axis is closed.
- Portfolio vol-targeting, risk-parity, performance-weighted sleeve
  allocation — all trade absolute profit for drawdown; owner prioritizes profit.
- BTC-regime and BTC-dominance tilts — below the deploy bar or w5 negative.
  (The intuitive "alt-season" tilt actively HURTS.)
- Time-stops (6/12/18 bars) — stalled trades recover enough to matter.
- Stop-hunt / liquidity-aware stop placement — improves 5/6 windows, blows up
  w6, and widens stops past the 8% cap (cuts trades).
- ROTA K=9, 7d momentum horizon, dual-horizon blend — windows negative.
- Cross-sleeve confluence — a breakout that is ALSO a momentum leader is
  WEAKER (0.055R vs 0.065R): by then the move is mature.
- Exit-ladder variants that trail more of the position — higher total R
  (up to 1253R!) but every single one flips a window negative. The current
  shape is the maximal trailing that survives the all-windows rule.
- Lower first ladder leg — raises WR to 70–74% but costs profit and breaks a
  window. Left as a deliberate user option, not an improvement.

**Other instruments / carry**
- Gold (PAXG/XAUT) with both trend-following AND mean-reversion — every one
  of 32 mean-reversion configs negative; trend-following −0.089R/trade.
- Funding-rate carry / basis arbitrage — real but **thin**: ~3.7%/yr net on
  deployed capital, below the 5%/yr bar, and needs a spot leg.
- 70-coin universe; top-trader positioning tilt; Fear & Greed tilt; weekend
  tilt — noise or negative.

Two indicator lists (~900 items total, Ehlers, MA variants, Gann, options-
derived, on-chain) have already been triaged. Everything was a family
duplicate, unfalsifiable, paid-data, or equity-specific.

## 4. Current operational reality (this is probably where the value is)

- The live project sits in a Supabase account the owner **cannot sign into**.
  Deploys have failed since 2026-07-16. Two fixes are stuck undeployed,
  including one for a bug that froze the bot for **45 days**: the health
  kill-switch pauses entries, so once it fired and the book emptied, no new
  trades could close, the "last 30 closed" window froze, and its documented
  auto-resume became structurally impossible.
- A migration to an owner-controlled project is built and waiting.
- The live-trades checkpoint is at 1/50; the risk ladder
  (1.25% → 1.75% → 2.5%) is gated behind 50 in-band trades.
- A Bybit live-execution adapter exists, triple-locked off.

## 5. What to return

For each proposal, in priority order by (expected value ÷ effort):

1. **One-line claim** and the mechanism — *why* this edge should exist in
   crypto perp microstructure. No indicator name-dropping.
2. **Why it is not in section 3** — state explicitly which rejected item it
   most resembles and how it differs materially.
3. **The falsification test**: exact data, exact rule, exact parameters, and
   the number that would make you abandon it.
4. **A ready-to-paste implementation prompt** for the coding agent: which file,
   which function, what to add, how to validate, what the deploy bar is.
5. **Expected magnitude**, honestly. "+0.003R, probably noise" is a more
   useful answer than an unquantified claim.

Rank operational/infrastructure items alongside strategy items — given the
history above, an execution or reliability improvement may well carry more
expected value than another signal idea.

**If your honest conclusion is that the strategy layer is at a genuine
optimum and the remaining value is operational, say so plainly.** That is a
legitimate and useful answer, not a failure.

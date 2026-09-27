# Pre-registration — frozen hypotheses and rules (committed BEFORE any result was looked at)

**Written 2026-09-27. Forward window starts 2026-09-28 00:00:00 UTC ("T0").**

The git commit that adds this file is the proof of when the rules were fixed. Nothing below may be changed after data from T0 onward has been examined. A change requires a NEW pre-registration with a NEW T0, and the old results stay reported.

The owner's instruction: *do not test until there is enough data to meet the existing gates (≥ 200 out-of-sample trades).* So:
- Before a hypothesis reaches **200 closed trades inside its forward window**, only its **event count** may be computed (`python -m quant.forward.status`).
- That script never computes P&L, returns or prices.
- Every rule is fully specified here with no free parameter, so every trade after T0 is out-of-sample.
- There is no in-sample fitting.

## Common to every hypothesis
- **Costs** are the `quant/` cost model, unchanged:
  - taker 0.05% per side;
  - slippage per market fill = base (1 bp BTC/ETH, 3 bp others) + 5% of the previous bar's (high − low)/close on the bar being traded;
  - real 8h funding from the Binance archive, sign-correct.
- **Fills.** The decision is made on data known at the event time. Entry is at the OPEN of the first bar that starts after it. Exits are market orders.
- **Stops.** The stop is exchange-side. If a bar touches both the stop and the target, the stop is taken first. A bar that opens through the stop fills at that open.
- **Sizing for the evaluation** is a fixed 0.25% of equity at risk per trade (`risk.default_risk`), with Kelly off. All `risk.*` limits of `config.yaml` apply as they are at T0 through `backtest/portfolio.py`:
  - 3x leverage;
  - daily −3%;
  - 5 consecutive losses;
  - 10% kill;
  - 5 open positions.
- **Universe.** The pinned 10 coins of `config.yaml` `universe`, unless a hypothesis says otherwise. Prices come from Binance USDT-M archives (data.binance.vision).
- **Gate, per hypothesis, unchanged from Phase 1:**
  - ≥ 200 closed trades in the forward window;
  - daily Sharpe > 1.5 (annualised √365);
  - max drawdown < 15%;
  - deflated Sharpe ≥ 0.95 with **N = 4** (the four hypotheses below are four looks);
  - mean gross edge per trade > mean cost per trade.
- **Evaluation.** Each hypothesis is evaluated ONCE when it reaches 200 trades, on every trade from T0 up to that point.
- **Ranking.** The hypotheses are not ranked against each other, and nothing is selected among them. A hypothesis that fails stays failed.

## H1 — Extreme funding (forward test of the Phase-1b candidate, rules frozen as selected there)
Source: `quant/strategies/funding.py` at this commit, parameters `threshold 0.0010, hold_h 72, stop_atr 3.0`.
- **Universe:** the 40 coins with a funding archive in `backtest/data/` (the pinned CRYPTO_40).
- **Bars:** Binance 1h klines.
- **Event:** a funding settlement whose rate is ≥ +0.10% (take SHORT) or ≤ −0.10% (take LONG), per 8h.
  - Its time is the settlement time.
  - Only the first 1h close at or after the settlement acts (once per settlement).
- **Entry:** next 1h open.
- **Stop:** 3 × ATR(14, 1h), at the entry bar's signal close.
- **Exit:** after 72 bars (72h), or at the stop.
- **Known before looking:** in-sample (2020-09..2025-12) this rule LOST (−66.9 bps/trade, t −2.07). It then gained on the 2026 holdout (+352.6 bps, t 2.75, 118 trades). This forward test exists to settle that contradiction. Expected rate ≈ 15–20 trades/month, so 200 trades ≈ 10–14 months.

## H2 — Liquidation-cascade fade
- **Data:** `mkt_liq_15m`, OKX source (15-minute UTC buckets of liquidated USD per coin and per liquidated side), from T0.
- **Event:** a bucket where one side's liquidated USD for a coin is ≥ max($250,000, 5 × the median of that coin's non-zero buckets of the same side over the previous 7 days).
  - The median needs ≥ 7 days of history, so no event before T0 + 7 days.
  - Event time = bucket end.
- **Direction:** fade the forced flow. Liquidated LONGS (forced selling) → LONG; liquidated SHORTS → SHORT.
- **Universe:** the pinned 10.
- **Entry:** the next Binance 5m open after the bucket end.
- **Stop:** 2 × ATR(14, 1h), measured at the last closed 1h bar before entry.
- **Exit:** 4 hours after entry, or at the stop.
- **Rate limit:** at most one open H2 trade per coin; events during an open trade on that coin are ignored.
- **Prior:** v47bt's OI-crash cascade fade was negative in all 12 configs. This is the first test on actual liquidation prints.

## H3 — Options skew fade (BTC and ETH)
- **Data:** `mkt_options`, the snapshot at 00:00 UTC each day (minute 0).
  - `skew10` = iv_put10 − iv_call10, in vol points, as stored.
  - z = (today's skew10 − mean of the previous 30 daily values) / their standard deviation.
  - Needs ≥ 30 prior daily values, so no event before T0 + 30 days.
- **Event and direction:**
  - z ≥ +1.5 (puts unusually expensive = fear) → LONG the perpetual;
  - z ≤ −1.5 (calls unusually expensive = greed) → SHORT.
- **Entry:** the first Binance 1h open after 00:00 UTC.
- **Stop:** 3 × ATR(14, 1h).
- **Exit:** after 24 hours, or at the stop.
- **Scope:** BTC and ETH only.
- **Expected rate:** ≈ 2 × 365 × 13% ≈ 90 trades/year, so 200 trades ≈ 2+ years. That is accepted, not shortened.

## H4 — News momentum
- **Data:** `mkt_news`, items whose `coins` contains a pinned-10 coin.
  - Event time = the later of `published_at` and `seen_at` (when the bot could first know it).
  - Items with `published_at` before T0 are excluded.
- **Event:** the coin's return over the 60 minutes before the event time (Binance 5m closes) is ≥ +1.0% (→ LONG) or ≤ −1.0% (→ SHORT). Smaller moves are not events.
- **Entry:** the next 5m open.
- **Stop:** 2 × ATR(14, 1h).
- **Exit:** after 4 hours, or at the stop.
- **Rate limit:** at most one open H4 trade per coin.

## What is NOT allowed
- Changing any threshold, window, hold, stop, universe, cost or gate above after T0.
- Evaluating a hypothesis before it has 200 closed trades.
- Adding a fifth hypothesis without raising N for all four, and without a new pre-registration.
- Treating the paper CHAN book as evidence: it runs as an infrastructure test only.

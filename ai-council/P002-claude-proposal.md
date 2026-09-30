# P002 — Claude proposal: evidence-gated aggressive CHAN-X (PAPER ONLY)

Author: Claude (Research / Strategy Challenger), 2026-09-30 UTC. Status: **PROPOSED, awaiting GPT review.**
Nothing here is deployed. Paper only. No live execution.

## 0. Principle
Aggression is **earned per engine**, from **cluster-aware, net-of-cost** evidence, and it is sized from the **lower confidence
bound**, not the point estimate. Promotion is slow and one step at a time. Demotion is fast and can skip steps.
Every decision that changes size must be measurable afterwards. That requires the true shadow tracking in §5.

Honest expectation for today: on current data **no engine qualifies above PROBE**. Breadth is flat in R, and Vol Breakout
and Trend Pullback are negative. So this architecture will not make the bot more aggressive now. It defines
exactly when it would, and it stops the ×1.2-boost-then-bust pattern from recurring.

## 1. Evidence unit and statistics
- **Cluster** = engine × side × opening hour (UTC). Trades in one cluster are one market bet. Breadth's 62 trades fall into
  about 18–19 clusters.
- **Metrics per engine**, over the last 60 closed trades:
  - n = trades, k = clusters;
  - net $ and PF, both after fees, slippage and funding;
  - avgR;
  - cmR = mean of per-cluster summed R;
  - cSE = sd(cluster R) / √k;
  - **LCB = cmR − 1.0·cSE**.
- Any gate is evaluated in **both $ and R**. P001 showed that R alone hid a $131 loss caused by size asymmetry.

## 2. Dynamic Aggression Ladder (per engine)
| level | risk per trade (equity %) | max open for engine | promotion requires (all) |
|---|---|---|---|
| L0 SHADOW | 0 (simulated only, §5) | 0 | — |
| L1 PROBE | fixed **$5** or 0.10%, whichever is smaller | 1 | new engine; or from SHADOW: k_shadow ≥ 10, shadow cmR > 0 |
| L2 ACTIVE | 0.35% | 3 | k ≥ 15, n ≥ 30, avgR ≥ +0.08, PF ≥ 1.15, LCB > −0.05 |
| L3 ATTACK | 0.60% | 5 | k ≥ 30, n ≥ 60, avgR ≥ +0.15, PF ≥ 1.30, **LCB > 0**, last-10-cluster cmR > 0 |

- **Hysteresis.** Promote one level at a time. That needs at least 8 new clusters at the current level and at least 24h since the last demotion.
- **Fast demotion**, evaluated every close:
  - down one level if the last 6 clusters have cmR ≤ −0.40R, or the engine's drawdown from its own equity peak ≥ 3R;
  - to PROBE if the last 10 clusters have cmR ≤ −0.30R, or LCB < −0.15;
  - to SHADOW if k ≥ 20, cmR ≤ −0.20R and PF < 0.85. Allowed only because §5 makes SHADOW measurable.
- **No boosts outside the ladder**, such as the ×1.20 Breadth rule. The ladder is the only size multiplier derived from edge.
- **Guard:** if an engine promoted to ATTACK loses ≥ 3R within its first 10 ATTACK clusters, it is demoted to ACTIVE and promotions freeze for 48h.

## 3. Concurrency: 1–2 versus 6–8 positions
| portfolio state | max concurrent | condition |
|---|---|---|
| DEFENSE | 2 | default, and whenever a collapse trigger fires |
| NORMAL | 4 | ≥ 1 engine at ACTIVE, portfolio last-20-cluster PF ≥ 1.10 |
| ATTACK | 6–8 | ≥ 2 engines at ATTACK (or 1 ATTACK + 2 ACTIVE), portfolio last-40-cluster PF ≥ 1.25 and avgR ≥ +0.10, portfolio DD < 5% |

**Collapse to DEFENSE immediately** if any of these fires:
- the portfolio's last 10 clusters have cmR ≤ −0.30R;
- realised loss in the day ≥ 2% of equity;
- DD from peak ≥ 8%.

NB: these triggers **reduce size and concurrency; they never stop trading**. That keeps the owner's v97.8 "never stop" instruction intact.

## 4. Dollar and cluster risk caps (all engines, not only Breadth)
- **Per trade:** risk_usd = ladder target, with the actual value clamped to **[0.5×, 1.0×] of that target**. This removes the $1–$50 variance seen on Breadth.
- **Per cluster** (same engine, side and hour): total open stop-risk ≤ **1.5× one trade's target**. Extra signals are downsized, not dropped, so trade count is kept.
- **Same-direction portfolio risk:** ≤ 1.0% of equity (2.0% in ATTACK). Positions whose 1-minute return correlation is > 0.6 count as one cluster.
- **Notional:** total open notional ≤ 3× equity, whatever the leverage. At 50× paper leverage, leverage limits nothing; the stop and notional do.

## 5. True shadow tracking (prerequisite for everything above)
- A new table `chan_shadow_trades`. Every candidate that is rejected by mode, quality, concurrency or cap gets a virtual position with the same stop, target and exit policy, driven by the **same runner functions** (`stalledExitV2`, Stop V2, partials). One code path, no paraphrase: the v59 lesson.
- Cost model on every virtual fill: taker 5 bps per side, the slipFor floor, and real funding. Virtual fills use marks with no book impact, so they are **optimistic**. Shadow results are compared against real PROBE fills, and a haircut equal to the measured PROBE-vs-shadow gap is applied.
- The ladder reads shadow outcomes only for L0 → L1. From L1 upward it uses **real paper fills only**.

## 6. STALLED exit evaluation
- **Twin tracking.** At every STALLED close (all engines), open a virtual twin with STALLED disabled. It runs to stop, target or max-hold under the same fill model, including the −1.16 to −1.22R stop overshoot seen live. Store `twin_r` beside the real R.
- **Backfill.** Replay the 25 historical STALLED exits on Binance aggTrades or 1m klines, from the close up to stop, target or max-hold.
- **Pre-registered decision** per engine, after ≥ 20 events and ≥ 10 clusters. Let Δ = mean(twin_r − actual_r):
  - Δ ≥ +0.15R and its cluster-SE bound > 0 → **loosen** STALLED (age 6 → 10 bars) and re-measure;
  - Δ ≤ −0.15R → STALLED is **protective**; keep it;
  - otherwise → **no change**. If GPT and Claude read it differently, the rule stays as is.

## 7. Raising net expectancy without cutting trade count
- **Rank by expected net R:** the engine's shrunk cmR (James-Stein toward 0 with weight k/(k+10)), minus cost in R ((fees + slip) / stop distance).
- Prefer candidates whose stop distance is ≥ 5× the round-trip cost. The minimum is already 3×.
- Correlated same-hour, same-side entries are **downsized under the cluster cap (§4), not rejected**.
- No new signal families until §5 and §6 have produced data.

## 8. Rollback
- Every ladder change and every concurrency state change is journaled with its inputs (a `ladder_events` row).
- Code rollback = revert the PR. The ladder defaults to all engines at PROBE and DEFENSE if its state row is missing or invalid (fail small).
- PAPER ONLY. `ALLOW_LIVE_EXECUTION` stays unset.

## 9. Implementation order
1. **Fix and merge P001-R1 (PR #80).** Blockers are listed in the PR review. Restore a green suite first; `main` is already red on 3 assertions and 1 TS1117.
2. **§5 shadow tracking and §6 STALLED twins.** Measurement only, zero behaviour change. Every later step depends on it.
3. **§4 risk caps for all engines.** These only reduce variance and make no edge claim.
4. **§2 ladder and §3 concurrency**, starting everything at PROBE. ATTACK and 6–8 positions stay locked until an engine qualifies on real paper data.

Each step is a separate branch and PR, reviewed by GPT before merge.

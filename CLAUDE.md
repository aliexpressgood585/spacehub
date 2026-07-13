# SpaceHub Trading Bot — Session Handoff (read this first)

Paper-trading crypto bot. Owner (Hebrew speaker) wants: a highly profitable bot
with PROOF, as many good trades as possible. Full autonomy granted — act without
asking, but NEVER violate the standing rules below.

## Standing user rules (verbatim intent, do not break)
1. **Deploy + merge after every change**: push to BOTH `main` AND
   `claude/universal-gate-remote-iay0gg`. A stop-hook rejects uncommitted work.
2. **NO stocks / tokenized equities** — crypto only. Both strategies are pinned
   to the validated 40-coin universe (`CRYPTO_40` in the bot).
3. **NO real exchange connection** for now (paper mode only; user will say when).
4. **Never share API keys/secrets in chat.** Secrets live in GitHub Actions
   secrets (`SUPABASE_ACCESS_TOKEN`) and Supabase env. Never print them.
5. **Never reduce trade count** when "improving" profitability. Filters that cut
   trades are rejected; improvements must add trades or add edge per trade.
6. **Validation discipline**: nothing deploys without a 36-month walk-forward
   (6 windows, real fees: taker 0.05%/side, maker 0.02%/side) positive in ALL
   windows. Failures get rejected and documented in code comments.

## Architecture
- **Live bot**: `supabase/functions/trading-bot/index.ts` (Deno edge function,
  cron every minute, Supabase project `mdvheizhciuvqychtwxr`). Version header at top.
- Two validated strategies:
  - **DONCH4H**: Donchian-25 breakout on 4h closes, ADX(60)>22 gate, entries only
    first 15 min after each 4h close; SL=1.4×ATR; LADDER exits ⅓@0.6R(→BE)/⅓@1.0R/⅓@1.6R
    via `exit_stage`; ADX-tiered risk sizing (base 1.25%, up to 2.5%); pyramiding
    (2nd unit on ≥0.6R winner, 3rd on ≥1.0R, max 3 — v49).
  - **ROTA**: every 48h rank 40 coins by 14d momentum, LONG top-8 / SHORT bottom-8 (v52),
    inverse-vol weights, 70% of book, per-coin combined cap 20%, drift-resize ±35%.
- Per-strategy health kill-switch: last-30 closed trades sum<0 → pause.
- Data: Binance fapi is geo-blocked (451) from Supabase AND GitHub runners →
  live bot falls back to OKX candles/tickers; backtests use data.binance.vision archives.
- **Backtests**: `backtest/backtest.ts`, run via GitHub Actions `backtest.yml`
  (workflow_dispatch inputs: mode/months). Modes v43bt…v48bt = research batches.
  Results are COMMITTED to `status/bt-latest.txt` (dispatch) / `status/regression.txt`
  (monthly) because job-log download is blocked from the sandbox.
- **Diagnostics without gh CLI**: edit `.status-ping` + push → workflow writes
  `status/latest.txt` (bot state, positions, live P&L via OKX marks, expectation-band
  check vs backtest, independent breakout scan, live `?donch_test=1`).
  `force-rebalance.yml` clears `rebalanced_at` to force a rotation.
- **Dashboard**: `trading-app/` → GitHub Pages via `deploy-trading-app.yml`;
  version tag in `CryptoTradingDashboard.tsx` must match bot version.
- Deploys: push to main touching `supabase/functions/**` triggers
  `deploy-edge-function.yml` (also runs SQL migrations listed inside it).
  Wait ~90s after deploy before poking the function.

## Tested & REJECTED (do NOT redeploy without fresh validation)
5m mean-reversion (breakeven after fees), 4h BB range-fade, Sharpe-momentum
ranking, skip-6 momentum, portfolio vol-targeting (better DD but less absolute
profit — user prioritizes profit), funding carry, funding tilt, 70-coin
universe, daily Turtle sleeve, daily rotation, trailing removal, 1h Donchian
sleeve (all configs negative after fees — same ceiling as 5m), limit-retest
entries (K=1/2/3+chase — loses momentum, windows negative), liquidation-cascade
fade via OI-crash (all 12 configs negative; NB Binance has NO liquidation
archive — metrics/ OI is the only forced-deleveraging data source), top-trader
positioning tilt (FOLLOWING whales slightly HURT: +0.049 vs +0.050R base;
fading them +0.051R but < +0.004R deploy bar = noise), Fear&Greed sizing tilt
(both directions noise-level), pair spread BTC/ETH+ETH/SOL+BTC/SOL (12 configs,
best = 5/6 windows but only ~47 trades/36m and w6 negative — rejected),
squeeze/compression sizing tilt (the classic "narrow channel = better breakout"
lore is BACKWARDS here: compression-boost LOST -0.0035R; wide-channel-boost
gained +0.0037R but misses the +0.004R bar and only 3/6 windows better — ADX
tiering already captures the real effect), weekend tilt (noise both ways).
v53bt (2026-07-11): 1h mean-reversion ADX<22+RSI extremes (avg -0.13R — in
crypto extreme RSI = continuation, not reversal), 1h large-body cascade fade
(avg -0.08 to -0.13R). v54bt: 4th pyramid unit at 1.6R (-0.0088R incremental —
1.6R is exactly where moves exhaust; the ladder exit there is correct),
volume-confirmation filter (rule-5: cuts 26-63% of trades; NB high-vol
breakouts DO carry +30% more edge — info only), ROTA negative-skew weight
penalty (-0.3pp, worse DD — crash-prone coins ARE the momentum), session
filters (rule-5; overnight 00-08 UTC is the weakest session +0.019R).
v55bt: DW=40 slow sleeve (w1 negative), ROTA 7d momentum horizon (annT 13.5%
vs 38.2% — 7d is too noisy) and 50/50 blend (25.9%, w4 negative), 12h
Donchian sleeve (2 windows negative — the 4h sweet spot is real).
v56bt neighbor re-tune: DW curve peaks at 15 (10: w5<0; 12: 509R; 20: 457R vs
512R base — smooth hill, DW=15 confirmed), ADX gate 18/20 flip w5 negative
(keep 22), entry cooldown=1 bar tempting (+33% totR, n=14,113) but w5 -4.7‰
REJECTED per all-windows rule, ROTA K=9 rejected (w3<0) — K=8 deployed (v52).
RESEARCH NOTE: the "chapter closed" call on 2026-07-11 was premature — v55bt
found DW=15 (deployed as v51). Breadth (more sleeves of the proven edge) was
the unexplored axis; it too is now exhausted (15✅ / 40✗ / 12h✗ / dual-ROTA✗).
v57bt (2026-07-12): correlation-aware sizing REJECTED (mean-risk-normalized
portfolio sim: best λ=0.5 cut maxDD 14% but kept only 38% of return — shrinking
correlated entries kills the big clustered winners too; λ≥1 breaks windows).
Time-stop REJECTED (all N of 6/12/18 bars reduce total R 512→≤477 and flip w1
negative — "dead" stalled trades recover enough to matter; cutting them forfeits
the turnarounds). Kelly table (measure only, gated to 50-trade checkpoint):
mean +0.0456R, sd 0.834R → full-Kelly f*≈0.065, ¼-Kelly≈0.016. KEY INSIGHT:
current 1.25% base risk ≈ quarter-Kelly (conservative); the 1.75%/2.5% MC tiers
sit between ¼ and ½ Kelly — the professional zone. Confirms the risk-raise
ladder direction is sound, still gated behind 50 live trades.
Next edge levers: 50-trade live checkpoint → risk raise per Monte Carlo table;
later real-exchange connection + capital.
v58bt (2026-07-12): ADX risk tiers CONFIRMED monotonic on DW=15 (0.017→0.032→
0.054→0.086R, no re-tune). Final-third TRAILING DEPLOYED (v53.0; +36% totR,
all windows). Long/short asymmetry NOT deployed: SHORT +0.089R vs LONG +0.006R
but LONG negative in 3/6 windows = regime-dependent (short-favourable 3y window);
a directional tilt risks blowing up in a bull market — WATCH, re-measure after
a full bull leg before ever tilting.
v59bt (2026-07-12): tried to extend the v53 trailing win — ALL variants that
trail MORE of the position have HIGHER total R (⅓.6+trail@1.0=927, ¼¼½=826,
all-trail@0.6=1253!) but every one flips a window negative (all-trail: w2 -0.061,
w6 -0.023). v53 (⅓@.6/⅓@1.0/trail2.5, 696R) is the ONLY config positive in all
6 windows = the maximal trailing that survives the all-windows rule. ADX-scaled
trail distance (2.5/3.5, tiered) both <696 AND w6 negative. NOTHING deployed —
v53 confirmed as the robustness frontier. LESSON: higher totR here = one great
trending window (w3 hit +0.300 for all-trail) masking fragility; the all-windows
rule is exactly what blocks that trap.
v60bt (2026-07-12): portfolio-construction level. Dynamic sleeve allocation
REJECTED — perf-weighting (3/6/12m) chases noise: higher ann but maxDD blows to
75-87% and w6 stays negative; inverse-vol/risk-parity positive in all 6 windows
but cuts return to ~1/3 (loads stable-but-weaker ROTA) = the SAME DD-for-profit
tradeoff already rejected in vol-targeting; user prioritizes absolute profit.
Fixed 50/50 stays. NB model's absolute figures inflated (capital-unconstrained
monthly R aggregation); only the relative scheme comparison is trustworthy.
BTC-regime size tilt REJECTED — +0.0014R (below +0.004R bar), beats base in only
4/6 windows. CONCLUSION: portfolio-level levers exhausted. Remaining edge sources
= 50-trade risk-raise + real-exchange execution; no more strategy/portfolio
research without a NEW data source or a regime change flagged by the regression.
v61bt (2026-07-12): stop-hunt-aware (liquidity) stop placement REJECTED — all
variants (beyond Donchian low / 5-10 bar swing) DROP total R (350-473 vs 696)
AND cut trades (11,218→~7,200: wider stops breach the 8% cap = rule-5 violation)
AND flip w6 negative. NB it DID improve 5/6 windows (surviving hunts is real),
but w6 blowup + trade loss kill it. Fixed 1.4×ATR stop stays.
v62bt (2026-07-12): BTC-dominance regime tilt on alt breakouts REJECTED. The
INTUITIVE tilt (upsize alts when BTC-dominance falling = "alt-season") HURTS
(+0.0533 vs +0.0620R). The CONTRA (upsize alts when BTC-dominance RISING) helps
total (+0.0702R, beats base 5/6 windows) — meaning an alt breakout firing DESPITE
BTC strength = higher-conviction signal — but w5 negative = not robust. Rejected.
Info: don't chase alt-season; alt breakouts against BTC strength are the real ones.
v63bt (2026-07-12): WR-optimized ladder (first-leg R level, the untested WR
angle). Lowering the first leg DOES raise WR cleanly without cutting trades:
L1=0.6 (live) WR 66.0%/696R/all-6-windows✅; L1=0.5 WR 69.7%/656R(-6%)/breaks a
window; L1=0.4 WR 73.6%/586R(-16%)/breaks a window. fastBE variants pathological
(WR 3-18%, hugely negative — implementation artifact, rejected). VERDICT: current
L1=0.6 is the robustness frontier for WR too. Higher WR is buyable but costs
profit AND breaks the all-windows rule → NOT deployed. Left as a documented
USER OPTION for the live transition (trade ~6% profit for a smoother/higher-WR
curve = L1=0.5) if the user prefers equity smoothness over max profit.
v64bt (2026-07-12): SL-multiplier × ATR-period re-tune on DW=15 — LIVE config
(ATR20/SL1.4, 696R) CONFIRMED optimal: highest total R among all-6-window
configs (wider stops raise per-trade R but lower total R — fewer survive the 8%
cap). Like the ADX tiers, the core stop is NOT stale. Cross-sleeve confluence
REJECTED — breakouts that are ALSO a ROTA momentum pick are slightly WEAKER
(0.0551 vs 0.0648R): by the time a coin is a momentum leader the move is mature;
fresh breakouts carry more edge. Upsizing confluence hurt (+0.0615 vs +0.0620).
Also shipped: LIVE_READINESS.md (paper-vs-real gap, go-live checklist, staged
capital plan). RESEARCH STATUS: 22 validation batches done; core params all
confirmed optimal on re-test = strong signal we're at a real optimum. Highest-
value next step is the LIVE transition, not batch 23.
v65bt (2026-07-12): directional-concentration CAP (born from the live correlated
long-cluster loss) REJECTED — decisively. Capping simultaneous same-side breakouts
skips 60-80% of trades (massive rule-5 breach) and the SKIPPED trades average
+0.074-0.081R = WINNERS (better than the +0.062R overall). KEY LESSON: many
simultaneous same-direction breakouts = a STRONGLY TRENDING market = exactly when
breakouts pay most. The clustering is a TREND feature, not a risk bug; the rare
bad cluster (the live night) is the unavoidable cost of the engine that makes
most of the profit. This is the SECOND angle (after v57 size-shrink) to confirm:
you cannot remove the correlated downside without killing the larger clustered
upside. Correlation risk here is intrinsic to the momentum edge — accept it.
v66bt (2026-07-12): 6-YEAR STRESS TEST (2020-2026, 17,795 trades). SURVIVAL
CONFIRMED — the edge survives every major crash and THRIVES in collapses: LUNA
+82R/WR74%/avg+0.206R (shorts +94), FTX flat, 2022 bear +25R (shorts +147 vs
longs -122). The SHORT side is the crash lifeline. BUT the edge is REGIME-
DEPENDENT/lumpy: 2021 was a LOSING year (-92R, choppy violent bull whipsaws
breakouts), 2023 flat (-13R); 2024/2025 great (+344/+338R). Breakout edge
concentrates in trending years, struggles in chop — normal for the style, and
exactly why ROTA (uncorrelated) + kill-switch exist. NB the huge DD% in v66bt
output (183-219%) is a NAIVE-R-SUM ARTIFACT, not real account DD (real = Monte
Carlo 16-36%). LIVE IMPLICATION: expect lumpy returns, DO NOT panic-off in a
flat year — it's the strategy's nature. The 36m validation window (2023-26)
includes the flat 2023, so it's representative, not cherry-picked.
v67bt (2026-07-12, 2nd session): BASIS CARRY / funding arbitrage pre-validation
(long spot + short perp to harvest funding; needs a REAL spot leg = real-exchange
stage). REJECTED at our scale. Best = BTC/ETH always-on +3.6-3.7%/yr net on
deployed capital (all 6 windows positive but BELOW the 5%/yr deploy bar); SOL
+2.5% (2 windows neg), BNB -1.1% (neg). Gated variants all <5%/yr + w6 negative.
Top-K funding rotation NEGATIVE (-2 to -3%/yr — 3d rebalance fees on both legs
eat it). CONCLUSION: funding arb is real but THIN (~3.7%/yr) — a pro play that
needs huge capital to matter; at our scale it locks capital for less than the
55-75%/yr main strategies return. Confirms the early call (v43bt funding carry
also rejected). NOT deployable anyway without the spot leg. Re-examine only if
real-exchange + large capital changes the math.
v68bt (2026-07-12): two external-AI-report ideas tested — both DISPROVE the
report. (A) Volatility-spike guard BACKWARDS: bigger breakout bar = BETTER trade
(calm<1.5× +0.040R → extreme≥3.5× +0.126R). A "skip the spike" guard would cut
the BEST trades — same reversed lore as squeeze (v51). (B) ADX-skip analysis:
taken(adx>22) +0.062R vs skipped(adx≤22) +0.043R — the 22 gate keeps the strong
ones; skipped are still positive but weaker (why lowering to 18/20 breaks windows
per v56bt — weaker trades add variance). Both would cut trades (rule 5) anyway.
NET: an independent code review reached for ideas we'd already tested/that the
data reverses — strong confirmation the config is at a real optimum. The report's
real value was OPERATIONAL (Telegram alerts + dashboard range toggle — deployed).
v69bt (2026-07-12): Heikin-Ashi smoothed breakout REJECTED — the smoothing lags:
6,477 signals vs 11,218 standard (-42% = rule 5), totR 413 vs 696, w6 negative.
Marginally higher per-trade avg (+0.0638 vs +0.0620) doesn't cover the trade loss.
Standard candles stay. (5th indicator-list triage: everything deployed/rejected/
unfalsifiable/paid-data/family-dup; HA + reg-channel are the only new testables.)
v70bt (2026-07-12): reg-channel (LSMA±k·σ) breakout PASSED the walk-forward bar!
k=2.0: n=19,831 (+77% trades), +0.0379R, totR 751 vs 696, all 6 windows ✅;
k=1.5: totR 816 but razor-thin windows. FIRST new positive result in ~20 batches.
BUT NOT auto-deployed — it's a CORE-SIGNAL swap with a THIN per-trade edge (+0.038
vs Donchian +0.062R) = slippage-fragile. Gated behind v71bt (slippage stress) —
a core-engine change needs the execution-cost gate a same-signal tweak doesn't.
If it survives 3-6bps slippage, deploy as an ADDITIVE breakout sleeve (fires on
different signals than Donchian), NOT a replacement.
v71bt (2026-07-12): slippage gate KILLED the reg-channel. At 0bps reg wins
(751>696) but at 3bps (live assumption) it falls BELOW Donchian (448<526), at
6bps <half (145 vs 356), at 10bps NEGATIVE (-259) while Donchian still +130.
The thin +0.038R edge has no cushion vs execution cost; Donchian's +0.062R
absorbs it. NICE cross-check: Donchian@3bps = +0.0469R = EXACTLY the live band.
LESSON: v70bt passed the walk-forward bar and looked like a win, but was a
zero-slippage illusion — a core-signal swap on a thin high-frequency edge dies
on real costs. Donchian STAYS. This is why a core-engine change needs the
execution-cost gate on top of the walk-forward bar. reg-channel CLOSED.
6th indicator list (~500 more, Ehlers/MA-variants/Gann/options/on-chain)
triaged 2026-07-12: nothing new — all family-dups / unfalsifiable / paid-data /
stock-fundamentals. Linear-regression channel was the only live item = v70/71bt.
v72bt (2026-07-12): LEARNED MULTIVARIATE SIZING — the ML axis, first test of a
feature COMBINATION (prior sizing batches each tuned ONE feature). Walk-forward
OLS (train 5 windows, size the 6th OOS) mapping [adx,vol,body,dist,mom] →
bounded risk multiplier, no trade cut (rule-5 safe). Metric = risk-weighted
avg R. RESULT, decisive REJECT: FLAT base rwAvgR=0.0469. ADX-only learned tier
+0.0065→+0.0146 (CONFIRMS ADX is the sole real feature — same as every prior
batch). FULL 5-feature combo Δ≈+0.0000→+0.0007 vs base = ZERO, and WORSE than
ADX-only. Worse still: the 4 extra features make w6 progressively MORE negative
as the model leans harder (-0.024/-0.032/-0.038 at slope .25/.5/.75) = textbook
overfit — the combo fits the train windows and bleeds out-of-sample. LESSON:
it's not just "each indicator alone is noise" (v49/51/62/68) — the COMBINATION
is noise too, and adding weak features actively hurts OOS. ADX is the only
feature carrying combinable sizing edge, and the live ADX tiers already capture
it. This closes the ML/feature-ensemble axis: a learned multivariate model does
NOT beat the single hand-tuned ADX tier. NB even FLAT base is all6=❌ here (w1
-0.003, w6 -0.015) because this lens is per-window MEAN R w/ 3bps slip, stricter
than the deployed totR-sum + full sizing stack (w1/w6 = the flat-2023-ish weak
windows from v66bt) — not a contradiction of the live all-windows-positive config.

v73bt (2026-07-12): DONCHIAN ADAPTIVE window (external-report idea — window
length scales with vol, W=clamp(round(15·(atrFast/atrRef)^k),8,30)). REJECTED —
and instructively. avgW stays 15.0 for EVERY k (-0.5→+0.5): atrFast/atrRef is so
mean-reverting near 1 that the "adaptive" window barely leaves 15 → adaptive
collapses to fixed-15. totR wobble 500-534 vs 526 base = noise; best k=+0.25 is
+1.5% (below any bar) and w1/w6 unchanged (all6=❌ on this strict per-window
mean-R/3bps lens, same as v72bt). Fixed DW=15 confirmed AGAIN, now on the
adaptive-window axis. 4th time an external-report strategy idea, once actually
coded, reduces to the incumbent (after HA v69, reg-channel v70/71, ML combo v72).
The external report's genuinely-new item tested; the rest were already
tested-rejected (correlation guard = v57/v65 twice, volume/session filters =
v54bt rule-5, mean-reversion = many, funding arb = v67bt, 3rd sleeve exhausted).
Its real value is OPERATIONAL (live-transition prep: tests, security audit,
Sharpe/DD go-live gates, dashboard risk metrics Sortino/Calmar/Omega + equity-vs-
BTC) — not new strategy edge.
v74bt (2026-07-13, user-requested): GOLD SLEEVE pre-validation. Ran the
UNCHANGED proven DONCH4H engine (Donchian-15/ADX22/1.4×ATR stop/ladder) on
PAXG+XAUT (Binance gold-backed tokens) instead of CRYPTO_40 — testing whether
trend-following transfers to gold and whether it's a genuinely uncorrelated
diversifier. RESULT: REJECTED, decisively. n=343 (PAXG 315, XAUT 28 — XAUT has
much shorter Binance history), WR=58.3% (reasonable) but avgR=-0.089R
(NEGATIVE) — losers outsize winners on average, the opposite of crypto where
the trailing-exit ladder harvests fat-tailed trending moves. Only 2/6 windows
positive (w1 -0.371, w4 -0.246 — two bad windows, not a fluke). INTERESTING
FINDING: the diversification hypothesis was RIGHT — correlation of the gold-
sleeve's daily R to BTC's daily return = -0.047 (essentially zero, confirms
gold's macro drivers — real rates/dollar — are genuinely unrelated to crypto
momentum). But an uncorrelated LOSING strategy has no value; correlation only
matters once a sleeve clears the profitability bar, and this one doesn't.
LESSON: our Donchian+trailing-ladder engine is tuned to crypto's violent,
fat-tailed trend character (liquidation cascades, leverage-driven overshoots);
gold's calmer, macro-driven price action doesn't have the same payoff shape,
so win-rate alone (58%, close to crypto's ~66%) doesn't translate to edge —
the R-multiple distribution is what breaks. Gold CLOSED on this engine; would
need a fundamentally different (probably mean-reversion or much-slower-signal)
approach to have a chance, which is new-research-from-scratch, not a quick add.
v75bt (2026-07-13, user-requested follow-up): GOLD MEAN-REVERSION, the
"fundamentally different approach" v74bt flagged as the only remaining chance
for gold. Tested BB(20,2)/RSI fade gated to low-ADX ranging regime, PAXG only
(XAUT's ~96-day Binance history can't support a 6-window walk-forward — that's
a hard data-availability ceiling, not a param-search problem). 32-config grid
(ADX<15/20, RSI 30/70 & 35/65, SL 1.0×/1.4×ATR, 4 exit shapes). RESULT:
REJECTED — more decisively than v74bt. ALL 32 configs negative, zero exceptions
(best totR=-54R). Window 5 was catastrophic across nearly every config
(-0.4R to -1.2R) — one bad regime hurt every parameter combo, not a tuning
issue. CONCLUSION: gold on Binance (PAXG) doesn't work with EITHER
trend-following (v74bt) OR mean-reversion (v75bt) at our real-fee/3bps-slip
assumptions. Both of the two standard technical playbooks failed decisively on
the same instrument — this is a strong signal the instrument itself (thin
liquidity, or PAXG's price discovery lagging physical gold NAV updates rather
than trading like a normal continuous market) is the problem, not the signal
choice. GOLD AXIS CLOSED — would need a non-technical edge (e.g. real
order-flow/liquidity data on PAXG, or a different gold-tracking instrument
with deeper Binance history) to be worth revisiting, not another signal test.

## Current state (2026-07-13)
- Live: **v56.0** — Portfolio Heat Limit: MAX_HEAT_PCT=0.95 caps total open
  notional (ROTA + DONCH4H combined) at 95% of portfolio value. Closes the
  over-allocation gap where both strategies firing simultaneously pushed
  notional to ~115% of account (negative free balance). DONCH4H entry is
  trimmed to fit the remaining heat room; skipped (heat_limit in bot_skips)
  only if < $500 remains. Pure capital-safety guardrail, no strategy change.
- Previous: **v55.0** — LIVE EXECUTION ADAPTER (Bybit v5), triple-locked OFF:
  keys secrets + paper_mode=false + LIVE_TRADING='1' (repo variable, currently
  unset/0). Five seam points route to real orders when armed; reconciliation
  (exchange-vs-DB) every 5 min alert-only; legacy 5m engine hard-disabled in
  live mode; ladder legs = reduce-only market in v55 (limit upgrade after
  small-capital validation). USER STEPS in GO_LIVE.md (account, API key with
  NO withdrawal permission, GitHub secrets, staged $500-1000). Rule 3 update:
  user said connect (2026-07-12) — adapter built; ARMING still requires the
  user's explicit GO after keys are in place. NEVER accept keys in chat.
- Previous: **v54.0** — ops hardening, zero strategy changes: bot_errors table +
  logErr (no more silent catches; watchdog error-spike alerts), paper realism
  (3 bps adverse slippage on market fills + hourly perp funding sim
  0.01%/8h — expectation bands measure REAL economics now), bot_skips
  skipped-signal journal (ADX gate / caps / bad ticks / pyramid gate — free
  live research dataset), DONCH4H liquidity guard (notional ≤0.5% of 24h
  vol), watchdog auto-opens the 50-trade checkpoint issue (label
  checkpoint-50, fires once). Dashboard: precision-instrument redesign +
  oscilloscope equity hero; RLS anon-read policies fixed for
  bot_equity/market_regime/rebalance_history (2026-07-12 — reads were
  silently blocked).
- Previous, v53.0 — DONCH4H final ladder third TRAILS (chandelier 2.5×ATR4;
  v58bt: +0.062R vs +0.046R, totR 696 vs 512 +36%, all 6 windows). On top of
  v52.1: ops: risk_usd per trade (live avg R vs band), shields JSONB
  + dashboard card + watchdog shield alerts, reset truncates bot_equity,
  deploy CLI retry, weekly trade-journal CSV. Strategy layer: ROTA K=8 (v56bt: annT 39.2%, maxDD 15%, all windows; K=9
  rejected w3<0). DONCH4H Donchian window 25→15 (v55bt: n=11,218 +33%
  trades, avg +0.0456R, all 6 windows, +22% total R; DW=15 was never in the
  old refine grids). On top of v50.2 (mark-to-market equity snapshots,
  era-anchored stats — shipped by the second session) and v50.1 (USDT depeg
  monitor + cross-source bad-tick shield, daily -5% loss brake), ROTA K=7
  (annT 38.2%, all windows), pyramid depth 3, maker TP-leg fills, stablecoin
  exclusion, Bybit third source, watchdog + daily report workflows. Account
  reset started at $10,000 paper.
  NOTE: a second Claude account session works on this repo too — always fetch
  and read git log before assuming file state.
- Expectation bands: DONCH4H WR~66%, ~+0.046R/trade (v51 DW=15); ROTA ~48%/yr book.
- v47bt+v48bt validations CLOSED: retest entries, OI-cascade fade, 1h sleeve all
  rejected (numbers in `status/bt-latest.txt`).
- User's chosen risk profile: SPORTY (base risk 1.25%). Split exits chosen: LADDER.
- Recommendation on record: freeze strategy changes 1-2 weeks, accumulate ~50
  live trades, compare to expectation bands before raising risk further.
- USER DECISION (2026-07-12): stay at 1.25% base risk until the 50-trade
  checkpoint; revisit the Monte Carlo table then. Do NOT raise risk before
  the counter hits 50 and DONCH4H is in-band.
- Monte Carlo DD table (v50bt, for the risk-raise decision; real DD runs deeper
  due to concurrent positions): 1.25% risk → median maxDD 16%, p90 25%, p99 36%;
  1.75% → 22/34/47%; 2.50% → 31/46/60%. User must accept the tier's p90 before
  each raise.

## How to work
- Small edits → verify types (`tsc --noEmit --ignoreConfig --skipLibCheck` on a
  copy outside the repo; deno not installed locally), commit, push both branches.
- Push races with status-bot commits on main are common: fetch, merge, on
  `UU status/latest.txt` take `git checkout origin/main -- status/latest.txt`.
- Answer the user in Hebrew; keep code/comments in English.

## Communication style (match this — the user expects continuity)
- Hebrew, warm but direct. Lead with the bottom line, then the reasoning.
- Radical honesty about results: report losses/failures plainly with numbers;
  never inflate. When an idea fails validation, say so and document it.
- Push back with evidence when the user asks for something statistically unsound
  (e.g. "always wins", "hundreds of % now", unfalsifiable indicators like Elliott
  waves) — explain the math simply, offer the validated alternative, and offer
  to TEST codeable ideas rather than argue opinions. Fibonacci retracements =
  same idea as limit-retest entries, which already failed — say so if asked.
- The user is not a programmer: explain in plain terms, use concrete numbers
  ($10k → $16k year 1 at ~55-75%/yr), avoid jargon walls.
- Work autonomously end-to-end (build → validate → deploy → merge → verify →
  report once). Don't ask permission mid-flow; do ask before genuinely new scope.
- Long waits (backtest runs ~20 min): poll in a background process, keep
  answering the user meanwhile, report when done.
- Current standing advice given to user: freeze changes, accumulate ~50 live
  DONCH4H trades (~2-3 weeks), compare to expectation bands, then raise base
  risk stepwise (1.25%→1.75%→2.5%) if in-band. Leverage warning given: 25-30%
  DD × high leverage = liquidation; user accepted SPORTY profile knowingly.

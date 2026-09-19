# SpaceHub Trading Bot — Session Handoff (read this first)

## ⏱ RESUME HERE — for a session that wakes cold (2026-09-19 16:35 UTC)
A scheduled firing may land after a usage-limit gap, into a session with no
memory of what came before. Missed firings are LOST, not queued, so do not try to
catch up on a backlog — just take the next item below. This block is rewritten
whenever the state of play changes; trust it over anything you half-remember.

**Live, verified 2026-09-19 16:30 UTC:** **v59.0** on `adxgadwghgkwmntsnrar`,
sha `51b2dfbb…`, confirmed in BOTH `deployment_manifest` and `?donch_test=1`.
paper_mode true, live_trading false, risk 1.75%, universe_hash 2d336399,
coverage 40/40 source `spot`, `bot_errors` empty, all four shields false, 0
LEGACY rows, heartbeat every minute.
Equity **$10,073.53** on $10,000 (+0.74%), cash **+$505** (fully recovered from
the v56.9 −$3,761), exposure $9,607. Book: 10 ROTA + 6 DONCH4H open.
Closed so far: 5 DONCH4H (4 TP / 1 SL), realised **+$4.53**. Checkpoint **5/50**
— far too small to judge anything; do not read it as a result either way.
NB exposure/equity is 95.4%, a hair over MAX_HEAT_PCT. That is mark-to-market
drift on positions already open, not a cap breach: the cap governs NEW entries at
entry time and cash is positive. Nothing like the v56.9 shape (138%, cash −$3.7k).

**THE BLOCKING PROBLEM, and the next thing to work on:**
Two full 36-month runs (v78bt, v79bt) could not judge the sub-gate ADX tier,
because on BOTH lenses the INCUMBENT fails all-6 — the same two windows each
time (w1, w6). The documented incumbent is 696R all-6-positive. Our scan
reproduces its trade count (11,412 vs 11,218) but not its window profile.
Either the scan is not the engine (no pyramiding / heat cap / ROTA interaction /
per-coin caps) or the edge has decayed on data through 2026-09.
→ **ITEM 4 IS DONE — v59.0 (shared rules) + v60.0 (portfolio sim).**
  `shared/strategy.ts` holds the rules and BOTH the bot and the backtest import
  it. `backtest/portfolio.ts` is the capital-constrained simulator: real cash,
  real caps, pyramiding, both sleeves competing for one book, 1h management
  resolution, stop-before-target. 189 assertions guard the pair.
  **AWAITING: the first v80bt run** (`backtest/.run-request` → `v80bt 36`,
  result lands in `status/bt-latest.txt`). Until those numbers are read, the
  sub-gate tier is still unjudged and (a)-vs-(b) is still open.
Do NOT deploy the sub-gate tier. It is neither accepted nor rejected.

**How to run a backtest without the GitHub connector:** edit the first
non-comment line of `backtest/.run-request` to "MODE MONTHS" and push to main.
Result lands in `status/bt-latest.txt`. New modes must ALSO be added to the
fetch-step whitelist in backtest.yml or they silently get 45 days of data.

**What you cannot do unattended:** deploy — USUALLY. The rule held for every
earlier triggered session, but on 2026-09-19 the firing DID carry the Supabase
connector and v59.0 was deployed and verified from it. So: check whether
`mcp__Supabase__*` is actually available before assuming it is not. If it is
absent, write/test/commit/merge and say plainly that the deploy is pending —
never claim one you could not make.

**Before any deploy:** `bash scripts/acceptance-check.sh`, then verify the live
result against `deployment_manifest` and `?donch_test=1`.


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
7. **Always update this file** (user: "תעדכן תמיד", 2026-09-17). Every incident,
   verdict, deploy and state change gets recorded here in the same turn it
   happens — don't wait to be asked.
8. **STANDING AUTHORISATION (owner, 2026-09-18): do not ask for approval.**
   "לא רוצה יותר שתצטרך אישור ממני... מאשר לך חופשי". Build, validate, commit,
   merge, deploy and report — all without checking in first. This does NOT relax
   rules 2-6: the walk-forward bar, paper-only, the trade-count rule and the
   universe pin are engineering standards, not permission gates, and blanket
   approval is not permission to lower them. Nor does it change what must be
   ESCALATED rather than asked: a result that fails validation, a deploy that is
   blocked, and anything the owner would be surprised by still gets reported
   plainly — reporting is not asking.
   NB approval was never what blocked unattended DEPLOYS. Triggered sessions are
   created without MCP connectors, so they hold no Supabase management access;
   no amount of owner approval grants it. A routine created from the claude.ai
   Routines UI with the connector attached is the only fix. Until then an
   unattended session can write, test, commit and merge — but must never claim a
   deploy it could not make.

## Architecture
- **THE STRATEGY**: `shared/strategy.ts` (v59.0). Signal, ADX gate, stop distance,
  sizing chain, ladder state machine, ROTA ranking/weights, CRYPTO_40 and every
  tuned constant — pure functions, no Deno/Supabase/npm/network. The bot and the
  backtest BOTH import it. Change a rule here or nowhere. Tests:
  `bash scripts/run-tests.sh` (138 assertions + typecheck, no install, offline).
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
- **Dashboard**: `trading-app/` → GitHub Pages via `deploy-trading-app.yml`.
  Since v57.0 it is a pure VIEWER of the server bot — no client-side strategy, no
  writes (RLS read-only, close-trade owner-only). The header version chip reads
  the live build from `deployment_manifest`, so there is no hardcoded tag to keep
  in sync any more. Never reintroduce a signal the bot does not compute.
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
v77bt (2026-07-13, user-requested): 15m/30m/45m TIMEFRAME SCAN — all
rejected. Full 36m/6-window walk-forward. Gross edge climbs monotonically
with TF (5m -0.024 → 45m/DW80 +0.033 → 4h +0.051R) confirming 4h is the
real inflection point. BUT: no sub-4h config passes all 6 windows even gross
— window 1 (choppy/2023-equivalent period) is negative for every DW tested
across 15m/30m/45m. ADX>22 gate is what saves 4h in choppy windows; without
it the sub-4h edge is too thin. RSI mean-reversion 15m: +0.002R gross (noise).
CONCLUSION: 15m/30m/45m axis CLOSED alongside 5m.

v76bt (2026-07-13, user-requested): 5m GROSS EDGE RESEARCH — decisive
rejection of ALL 5m signal families. (A) Donchian 5m: DW=15/25/40/75 ALL
NEGATIVE even gross/fee=0 (avgR -0.024 to -0.043R) — no edge exists at the
signal level, not a fee problem. (B) RSI mean-reversion 5m: tiny gross signal
(RSI30/70 +0.011R) but 30× smaller than real fee drag (0.33R/trade) — not
viable even with maker-only fills. CONCLUSION: 4h is the confirmed sweet spot;
nothing below it has structural edge. Note: DONCH4H 4h reference on the SAME
12-month window shows -0.004R (choppy period) — confirms the period was
challenging for trend-following across all timeframes, yet 5m was WORSE even
on gross. 5m axis CLOSED.

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

## INCIDENT 2026-08-07 — bot went quiet (three stacked faults)
- **BLOCKED ON USER**: `SUPABASE_ACCESS_TOKEN` returns `{"message":"Unauthorized"}`
  (expired/revoked). It gates deploys, status-ping AND the watchdog — so v56.5
  is committed but **NOT deployed**, and the live bot still runs the old code.
  Recovery: user creates a new PAT in Supabase (Account → Access Tokens) and
  updates GitHub → Settings → Secrets → Actions → SUPABASE_ACCESS_TOKEN. Never
  accept the token in chat. Watchdog issue #19 (opened 08-04) was this, but its
  message said "bot not responding" — misleading; fixed below.
  **2026-09-14 UPDATE — "new PAT" is NOT sufficient on its own.** User rotated
  the secret; `supabase login` then SUCCEEDED ("You are now logged in") but
  `supabase link` failed with a DIFFERENT error: `{"message":"Your account does
  not have the necessary privileges to access this endpoint"}`. So read the
  error text, don't just retry: `Unauthorized` = dead/expired token, whereas
  `necessary privileges` = token is VALID but its ACCOUNT lacks rights on
  project mdvheizhciuvqychtwxr — i.e. the PAT was generated while signed into a
  different Supabase account (multi-account: Google vs email login), or scoped
  too narrowly if Supabase offered scopes, or the account's org role is below
  Owner/Administrator. Verification step to give the user:
  open https://supabase.com/dashboard/project/mdvheizhciuvqychtwxr — if the
  project opens, that session is the right account; generate the PAT from THAT
  account. Deploy history: last SUCCESS 2026-07-16 (v56.3); failures 08-07
  (v56.5), 08-17 (v56.6), 09-02 (user manual retry), 09-14 (post-rotation,
  privileges error).
- **v56.5 UNIVERSE COLLAPSE (the actual trading stall)**: fetchFuturesCoins()
  accepted the first source with >=10 symbols. fapi is geo-blocked (451), and the
  Binance SPOT fallback degraded to exactly 11 symbols — clearing the bar and
  short-circuiting the healthy OKX fallback (~39). Live universe fell 40→11:
  donch_test showed `universe:11 source:spot breakouts:[]` while an independent
  OKX scan found BNB SHORT adx=47, ADA LONG adx=61, LTC LONG adx=29, WLD SHORT
  adx=25 — strong signals the bot could not see. ROTA also cannot rank top-8/
  bottom-8 out of 11. FIX (committed, awaiting token): sources scored by COVERAGE
  of CRYPTO_40 (`MIN_UNIVERSE_COVERAGE=25`) instead of raw count; richest source
  wins if none clears the bar (`*_partial`); donch_test reports coverage.
- **Both health kill-switches fired** (by design, v43 #4): ROTA last-30 first went
  negative 07-20, DONCH4H 07-26 → new entries paused. Partly a CONSEQUENCE of the
  universe collapse (fewer/worse signals). They auto-resume when the window heals.
- **Diagnostics hardened**: the status-ping python blocks crashed with
  `string indices must be integers` on an error object, killing the whole step so
  no report was committed — we were blind exactly when it mattered. Now they
  surface the raw error and continue; commit step is `if: always()`; new BOT
  LIVENESS probe (edge fn HTTP + empty-ANON_KEY warning) independent of the mgmt
  API. Watchdog now reports BAD_TOKEN separately from a real stall.
- Bot process itself CONFIRMED ALIVE throughout (edge fn HTTP 200,
  `"another run in progress — skipped"` = cron firing every minute).
- Checkpoint counter at the last readable snapshot: **27/50**, WR 63.0%,
  avgR -0.079 (WR near the 66% band; avgR still below — ranging-market profile).

## RESOLVED 2026-09-17 — bot trading again after a 45-day freeze
Freeze ran 2026-08-03 → 09-17 (zero trades). Ended when the USER opened the
bot's own reset endpoint in a browser:
`https://mdvheizhciuvqychtwxr.supabase.co/functions/v1/trading-bot?reset=1`
(the function is deployed --no-verify-jwt, so a plain click works from any
device — no admin access, no token). Reset deletes bot_trades + bot_equity and
sets balance to 10000; the kill-switch then sees 0 closed trades (<30) and
cannot pause. Verified 12:03 UTC: shields all false, COINS=40/40, no HEALTH
lines in the log, first trade in 45 days = NEAR LONG @12:00 ($2,001 notional,
risk $99.57), equity $9,998.98. ROTA rotates next at the 48h mark.
**Keep this link** — it is the emergency unblock if the deadlock recurs.
Before the reset the full pre-freeze era was exported to `migration/export/`
(124 trades, 6,357 equity samples, 07-10 → 09-14) and committed, so the history
is preserved and can be restored into the migrated project.
STILL OPEN: the live code is v56.3 — the v56.6 deadlock fix is STILL NOT
deployed (no management access, see incident above), so the freeze CAN recur.
The permanent fix is the project migration; tooling is ready and waiting on the
user for a project ref + anon key (`migration/README.md`, `migration/import.py`,
`.github/workflows/migrate-restore.yml`).
CORRECTION (same day, recorded because it was stated wrong to the user first):
the anon key does NOT have write access. A PATCH/DELETE probe using a
filter that matched no rows returned HTTP 204 and was misread as "writes
allowed" — PostgREST returns 204 even when RLS blocks the statement and zero
rows are affected. Re-tested with `Prefer: return=representation`: 0 rows
returned => RLS blocks anon writes. There is NO public-key vulnerability, and
no agent-side DB workaround exists for the kill-switch (reset link only).

## BOT STOPPED 2026-08-03 → 08-17 (kill-switch deadlock) — FIXED in v56.6 (not yet deployed)
Bot looked perfectly healthy the whole time (heartbeat every minute, universe
42, feeds green, edge fn 200) but placed ZERO trades for 14 days. Cause: BOTH
health kill-switches fired (DONCH4H last30 = -$76.64, ROTA = -$48.28), and the
switch pauses ENTRIES — with the book empty (ROTA unwinds its basket when
paused) no new trades could close, so the "last 30 closed" window froze and
"auto-resumes when the window heals" became structurally impossible. Fix
(v56.6): a window whose newest close is older than HEALTH_STALE_H=48h is
STALE → released with a log line; a genuinely recent losing streak still
pauses. Also fixed: `.eq(...).catch(...)` threw "catch is not a function"
(PostgREST builder is a thenable, not a Promise) and aborted the per-coin scan
handler mid-exit — 10 sites swapped to `.then(ok,err)`.
NOTE: bot_state.paper_mode is currently FALSE while Bybit keys / LIVE_TRADING
are NOT set → liveMode=false, fills still simulated, but trades get tagged
paper_mode:false (mislabel only, no real orders). Set it back to true unless
arming live.

## MIGRATION DONE 2026-09-18 — the bot runs on a project the user owns
The two-month deploy blockade is over. Everything below was done end-to-end by
the agent; the user only approved ("אל תבקש ממני אני מאשר הכל").
- **What unblocked it**: the Supabase MCP connector has FULL management rights on
  the user's own `ShiftPay` org (`qsoomzmcxdthodfxbfuy`). It never had rights on
  the old project — that one is in the lost account. So the fix was never "find a
  token", it was "build in the org we can already reach".
- **New project**: `spacehub-bot` = ref **`adxgadwghgkwmntsnrar`**, eu-central-1,
  free plan. URL `https://adxgadwghgkwmntsnrar.supabase.co`.
- **Freeing the slot**: free tier = 2 active projects per user and the user was at
  the cap. Checked contents rather than names: `shift-pay` holds real production
  data (124 profiles, 515 shifts, 3,882 visits) — untouchable; `lumen` was an
  empty dating-app scaffold (0 profiles/matches/messages, its only "activity" an
  hourly `expire_stale_matches` cron cleaning rows that do not exist). Paused
  `lumen`. NB resuming it later needs a free slot again.
- **Schema**: the deploy workflow's migration SQL is all `ALTER TABLE ... ADD
  COLUMN` and assumes `bot_state`/`bot_trades` already exist — on a genuinely
  fresh project it dies on statement 1. Base DDL for those two was applied first
  (columns mirror `migration/export/*.json`), then the workflow SQL, then
  `pg_cron` + `pg_net`, then the 4 cron rows (bot 1m / optimizer 1m / regime 5m /
  rebalancer 1h).
- **RLS hardening**: the workflow creates anon SELECT policies but never enables
  RLS on those tables, and a policy on an RLS-off table is inert — the public anon
  key would have had full write. RLS is now ON for all 11 tables with anon SELECT
  only. Verified live: `PATCH bot_state` with `Prefer: return=representation`
  returns `[]` (0 rows) and the balance is unchanged. Security advisors: clean.
- **Data**: started clean at $10,000. The 124-trade pre-freeze era stays archived
  in `migration/export/` and was deliberately NOT replayed — restoring a mostly
  losing last-30 window would hand the health kill-switch a pause on day one,
  which is the exact deadlock being fixed.
- **STILL OPEN — `SUPABASE_ACCESS_TOKEN`**: still returns `necessary privileges`,
  now even against the NEW project, so the token's account is not the ShiftPay
  one. Consequence: GitHub-Actions ops are still dead (status-ping, watchdog,
  daily-report, force-rebalance, reset-account, close-*, trade-journal, migrate-
  restore, and `deploy-edge-function` itself). Deploys and DB work go through the
  MCP connector instead. To restore them the user must create a PAT while signed
  into the account that owns ShiftPay (verify first by opening
  https://supabase.com/dashboard/project/adxgadwghgkwmntsnrar — if it opens, that
  session is the right account) and paste it into GitHub → Settings → Secrets →
  Actions. Never accept the token in chat.
- **Old project `mdvheizhciuvqychtwxr` is a ZOMBIE**: its cron cannot be stopped
  without management access, so it keeps paper-trading its own DB forever. Paper
  mode, no real money, nothing points at it any more (dashboard bundle verified:
  only the new ref appears). Ignore it.
- **Deploy method, since the CLI path is blocked**: each function is deployed as a
  one-line entrypoint that imports its real source from the PUBLIC repo at a fixed
  commit SHA. The edge bundler inlines it at deploy time (verified), so the running
  function has no GitHub dependency at runtime — and the SHA in the header is a
  real release manifest: what is live is exactly what is in git. This is also the
  only way to ship `trading-bot` (200 KB) through a tool that takes file contents
  inline. NB `zz-import-probe` is a leftover slot from proving the bundler
  resolves remote TS; it is neutralised (410 stub, verify_jwt on) because MCP has
  no delete-function call — delete it from the dashboard when convenient.

## Current state (2026-09-19)
- **LIVE AND TRADING** on `adxgadwghgkwmntsnrar`, code **v59.0**
  (sha `51b2dfbb…`, confirmed live in `deployment_manifest` and `?donch_test=1`).
  v58.0 (sha `d1954d97…`) ran 2026-09-18 15:00 → 2026-09-19 16:29.
- **trading-bot is the SINGLE owner of bot_state.** portfolio-rebalancer,
  market-regime-detector and trading-optimizer are all read-only on it. Do not
  re-introduce a second writer — see v58.0 for what that cost.
- **Paper is hard-locked** by `ALLOW_LIVE_EXECUTION`, which is unset. The DB
  column alone can no longer flip the bot live or mislabel a row.
- **BASE RISK IS NOW 1.75%** (was 1.25%) — owner instruction at 0/50 trades,
  see v57.2. Expect maxDD median 22% / p90 34%. Next raise stays gated.
  First successful deploys since 2026-07-16; they carry v56.5 (universe), v56.6
  (deadlock), v56.7 (coverage), v56.8 (provenance), v56.9 (heat race), v57.0
  (dashboard engine removal) and v57.1 (ROTA stale fills).
- LADDER VERIFIED LIVE for the first time on this project, 2026-09-18 08:57: INJ
  crossed 0.6R at 08:55 and two minutes later `exit_stage=1`, `legs_banked=$8.71`,
  stop moved to breakeven. End-to-end proof that the v56.2 leg accounting and the
  v56.6 `.catch` fix both work.
- Book at 08:30 UTC: 16 open (10 ROTA from the 05:46 rebalance + 6 DONCH4H from
  the 08:00 4h close), notional $13,754, equity ~$9,950, cash **-$3,761** — the
  v56.9 over-allocation, left to unwind through the ladders. Total stop risk on
  the six breakouts is $327 (~3.3% of equity), so the exposure is a leverage
  problem, not a risk-of-ruin one. Both sleeves skip new entries until cash turns
  positive again (see the v56.9 note). `bot_errors` empty throughout.
- `donch_test`: `universe:42 universe_c40:40 coverage:40 source:spot`, 31
  breakouts / 26 wouldEnter (was 21/40 and `okx_partial` before v56.7).
- Checkpoint counter restarts at **0/50**. No risk raise before 50 in-band trades.
- WATCH NEXT: confirm on the next multi-breakout 4h close that HEAT_CAP actually
  logs and trims (the v56.9 fix has not yet met a six-signal cycle in the wild),
  and that cash returns positive as the first ladder legs bank.

## v58.0 (2026-09-18) — engines consolidated, ONE owner per piece of state
Five silent defects, all found by reading rather than by anything failing.
1. **LEGACY 5m ENGINE COULD STILL TRADE.** It was fenced off only by the `return`
   in the DONCH4H block, which fires ONLY when a breakout opens. On every cycle
   where DONCH4H found nothing — nearly all of them — execution fell through and
   the legacy confluence engine could open a position. Its insert was the one row
   shape in the file that set no `strategy`, so the column default tagged it
   'LEGACY' and it landed in the same book, equity curve and health kill-switch as
   the validated sleeves. Nothing fired here only because its gate is 75.
   264 lines DELETED. DONCH4H and ROTA are now the only engines, full stop.
2. **THREE WRITERS ON bot_state — one a live time bomb.** portfolio-rebalancer
   wrote {coin_weights, rebalanced_at} hourly. `rebalanced_at` IS ROTA's 48h
   rotation clock, so an hourly reset means the 48h test can NEVER pass — ROTA
   stops rotating permanently, no error, healthy heartbeat, the exact shape of the
   45-day freeze. It had not fired only because of the `trades.length < 15` early
   return; at 15 closed trades in 14 days the sleeve dies. And `coin_weights` is
   not weights to the bot — it holds {sym:{suspended_until}}; overwriting it with
   numbers destroyed live suspensions AND gave the bot a shape it cannot read, so
   suspensions silently lapsed. market-regime-detector wrote `market_regime` every
   5 min against the bot's own per-cycle write, different feed, different
   vocabulary — last-writer-wins flapping. BOTH are now read-only on bot_state.
   **trading-bot is the sole owner.** (reset-account untouched — off limits.)
3. **PAPER IS NOW THE FLOOR, NOT A FALLBACK.** `paperMode` read a DB column, so a
   wrong row flipped the bot out of paper and mislabelled rows — which already
   happened. `ALLOW_LIVE_EXECUTION` is now the outermost gate, a deploy-time env
   var not data, set NOWHERE in this repo. Anything but the exact string 'true'
   means paper regardless of DB, query string or keys. paperMode and liveMode move
   together, so there is no silent live→paper downgrade under a live label.
   VERIFIED live: manifest reports paper_mode true (the DB column was false).
4. **OPTIMIZER WAS STEERING THE DELETED ENGINE.** It adopted params live every
   minute from an LLM scored in-sample, and every param it tunes belonged to the
   5m engine. DONCH4H/ROTA read none of them. Now READ-ONLY: still analyses, still
   journals to bot_params_history, cannot move the live config. No auto-apply
   without a holdout. `limitChange` rewritten — the ratio form returned 0 forever
   for a zeroed param (r=Infinity → both branches return ov*(1±mc)=0), passed NaN
   straight through (both comparisons false) and inverted on negative anchors.
   Now absolute-distance clamping with a floor, non-finite rejected.
5. **A CRASHED CYCLE ANSWERED HTTP 200.** Every monitor reads the status line, so
   a cycle that threw before managing a trade was indistinguishable from a healthy
   one — the 45-day freeze shape again. Now 500, with its own path to bot_errors
   (logErr is scoped inside the handler).
ALSO: market-regime-detector read Binance SPOT (`api.binance.com`), unreachable
from this egress — it had returned "Binance fetch failed" on EVERY run since the
migration. Now fapi first (Futures is the reference), then data-api spot, then
OKX, and it reports `feed_source` so a fallback is never shown as a futures mark.
`scripts/acceptance-check.sh` asserts all of the above + a secrets scan. NB its
first draft reported two FALSE failures (grepped a field name surviving only in a
comment; piped grep into head so the exit status came from head) — a check that
cries wolf gets ignored, so fix the check, don't lower the bar.
VERIFIED LIVE after deploy: v58.0 / sha d1954d97 in both `deployment_manifest` and
`?donch_test=1`; paper_mode true; rebalanced_at unchanged since 05:46 (single
owner holding); market_regime written by the bot alone; 0 LEGACY trades; 0 errors.
NOT DONE, and not to be read as done: shared backtest/live engine module (item 4),
order-intent ledger + idempotency keys (item 9), unit/parity test suites (item 11).
Those are multi-day refactors across a 3,900-line bot and a 6,300-line backtest.

## v59.0 (2026-09-18) — ONE strategy, two consumers (item 4, first half)
The rules are no longer written down twice. `shared/strategy.ts` is now the only
definition of the signal, the ADX gate, the stop distance, the sizing chain, the
ladder state machine, the ROTA ranking and weights, and every tuned constant
behind them; `supabase/functions/trading-bot/index.ts` and `backtest/backtest.ts`
both import it. The bot imports it by RELATIVE path on purpose — the deploy shim
pulls the bot from raw.githubusercontent at a pinned SHA, so `../../../shared/
strategy.ts` resolves against that same SHA and the deployed bundle and the
backtest run identical text.
WHY THIS WAS THE BLOCKING ITEM: v79bt spent a full 36-month run and could not say
whether the live config still passes its own bar, because a backtest that
paraphrases the bot cannot answer a question about the bot. It still can't fully
— see "what is still missing" — but the paraphrase is gone.
VERIFIED BEFORE THE SWAP, not assumed: the live bot's `calcATR`/`calcADX` were
extracted to a scratch file and run against the suite's fixture beside the shared
module's. ATR20 1.1632112956, ADX60 31.6683034253, ADX15 8.7448526925 — identical
to ten decimals, both functions. The backtest's copies were already identical to
the bot's. So the indicator layer was never the divergence, which is itself worth
knowing: whatever separates our scan from the documented run is in the PORTFOLIO
layer, not the maths.
WHAT THE REWIRE FOUND, all of it by reading rather than by anything failing:
1. **The live bot threw away every bar timestamp.** Its `Bar` had no `t` field at
   all and all three kline mappers (Binance, OKX, Bybit) dropped field 0. The bot
   therefore could not answer "is this the bar that just closed?" and pushed every
   timing decision onto `Date.now() % 14_400_000`. A fallback feed lagging one bar
   would have produced a confident breakout off the wrong candle with nothing in
   the log. Same family as v57.1's four-hour-old ROTA fills. Bars now carry `t`,
   and the entry path journals `bar_lag_diagnostic` when the newest completed bar
   is more than 15 min stale. DELIBERATELY DIAGNOSTIC ONLY — it never skips, because
   standing rule 5 forbids adding a filter that cuts trades and the honest first
   move on a suspected data fault is to measure it, not to act on a hypothesis.
   If those rows accumulate in `bot_skips`, that is evidence and then it is a
   decision.
2. **`?donch_test=1` had its OWN Donchian scan** — its own `slice(-16,-1)`, its own
   `adx4>22`. That endpoint is how EVERY deploy is verified. A verification that
   re-implements the thing it verifies is not a verification. It now calls
   `S.donchSignal` / `S.gateAdx`, and also reports `bar_open` per row.
3. **THREE more copies of the 40-coin universe** were in the bot (the donch_test
   filter, the scan filter, and FIXED_COINS). Rule 2 aside, `universe_hash` in the
   release manifest is computed from one of them — so a silent edit to either of
   the others would have left the manifest swearing the universe was unchanged.
   One list now, `S.CRYPTO_40`, and the hash arithmetic moved with it byte-for-byte
   (still `2d336399`, asserted in the suite).
TESTS (item 11, partial): `tests/strategy.test.ts` — 105 assertions on the rules
themselves, including golden indicator values taken FROM the live bot, the ladder
walked end to end in R, every sizing cap, the pyramid thresholds, the ROTA weights
and the collapsed-universe guard. `tests/parity.test.ts` — 33 structural assertions
that neither consumer has grown a second copy of a rule, that the paper lock is
intact, that no trade insert is untagged and that no kline mapper drops `t`.
`scripts/run-tests.sh` runs both plus a typecheck of all three files; it needs no
npm install, no deno, no network and no secrets — deliberately, because
SUPABASE_ACCESS_TOKEN has been dead since 2026-08-07 and anything that matters has
to work without it. `scripts/acceptance-check.sh` now runs the suite as section 11,
so the pre-deploy gate includes it, and `.github/workflows/tests.yml` runs it on
push along with a YAML lint of every workflow.
NB the bot typechecks with exactly 3 pre-existing TS2345 'never' errors (empty
array literals, long predating this work). The runner asserts that count rather
than hiding it: if it moves, something new broke.
A NOTE ON WHAT THIS IS: a refactor, not a strategy change. Every substitution was
one-for-one and the arithmetic was verified before the swap. It is NOT covered by
a fresh walk-forward and does not need one — but it also proves nothing new about
the edge, and must not be read as if it did.
DEPLOYED AND VERIFIED 2026-09-19 16:30 UTC, sha `51b2dfbb…`: `deployment_manifest`
and `?donch_test=1` both report v59.0, paper_mode true, live_trading false,
base_risk 0.0175, universe_hash 2d336399 (unchanged, as intended), coverage 40/40.
`bot_errors` empty across the changeover and the cycle keeps its one-minute
heartbeat, so the remote import of `shared/strategy.ts` resolves and inlines
correctly at deploy time — the whole deploy method depended on that and it is now
proven rather than assumed. `donch_test` rows also carry `bar_open` now, and the
newest completed 4h bar reads 12:00 UTC at 16:30 — correct, so the timestamps are
real and the alignment diagnostic has something true to measure against.
WHAT IS STILL MISSING, and it is the important half: the backtest has no
capital-constrained portfolio simulator. It still aggregates an unconstrained R
sum, so it still cannot model pyramiding, the heat cap, the net-exposure or
per-coin caps, cash exhaustion, or the ROTA sleeve competing for the same book.
Those constraints bite hardest in exactly the trending windows that carry the
profit, which makes them the leading candidate for the v79bt divergence. Until
that simulator exists, (a) "the scan is not the engine" is still not ruled out,
and the sub-gate tier is still unjudged.

## v61.0 (2026-09-19) — the dashboard was showing +0.00 on every position
User reported the page looked frozen: all 16 positions at "+0.00$ / +0.000%",
entry price identical to current price on every card. The BOT was fine — verified
the same minute: heartbeat 20s old, 0 errors, shields false, equity $10,195 and
rising. The DASHBOARD was lying.
CAUSE: `const cur = live?.cur ?? t.entry`. With no live price the card fell back
to the entry price, so P&L computed to exactly zero and rendered as a confident
"+0.00$", indistinguishable from a real flat position.
WHY THERE WAS NO LIVE PRICE: the page feeds prices from
`wss://stream.binance.com`, and Binance is geo-blocked in the owner's region —
the SAME 451 the bot hits from Supabase egress, which is precisely why the bot
has fallen back Binance → OKX → Bybit since v41.2. The dashboard never had that
ladder. So on the owner's phone: full book, no prices on any of it.
THREE FIXES:
1. A missing number is shown as missing — "—" and "אין הזנת מחיר" in muted grey,
   progress bar at zero. Never a fabricated 0.00.
2. OKX REST fallback: one call to `/api/v5/market/tickers?instType=SWAP` returns
   every swap ticker at once, polled every 12s, starting 4s after mount so the
   socket gets first chance. It only FILLS GAPS — a symbol already priced by the
   socket is never overwritten, so a healthy Binance feed is untouched.
3. The config card hardcoded "סיכון בסיס 1.25%" while the bot has run 1.75%
   since v57.2. It now reads `deployment_manifest.base_risk_pct`, the same row
   the version chip already reads.
PATTERN, now the FOURTH time: `_v23_5M` in the regime label, the dead control
buttons that flipped locally and reverted, the legacy 5m engine that still
painted a BUY banner, and now a fabricated zero. Every one was the dashboard
stating something false about the system, and every one cost real diagnostic
time. A dashboard is a claim. RULE: never let a display substitute a plausible
value for a missing one — show that it is missing.
Verified: typecheck clean, production build clean (422.79 kB).

## v60.0 (2026-09-19) — the capital-constrained portfolio simulator (item 4, second half)
`backtest/portfolio.ts`. Every backtest before this aggregated an UNCONSTRAINED
sum of R — the same dollar in ten places at once, no cash floor, no heat cap, no
competition between the sleeves, and no credit for an early exit freeing capital
for the next trade. On an edge of +0.046 to +0.062R that is not a rounding error.
It is also the leading suspect for the v79bt divergence, because the caps bite
hardest in exactly the trending windows that carry the profit.
WHAT IT IS: event-driven over real bar timestamps, holding real cash, importing
`shared/strategy.ts` so the rules it runs are the rules the bot runs. Positions
are managed on 1h bars (4 checks per 4h bar — coarser than the live bot's
per-minute poll, far finer than the old bar-close scan). Exits are processed
before entries at every step, so capital released is available immediately.
THE THREE CHOICES THAT DECIDE WHETHER IT TELLS THE TRUTH, all explicit:
 1. INTRA-BAR AMBIGUITY resolves the STOP first by default. Resolving it the
    other way is the commonest way a backtest flatters itself, and at bar
    resolution the case arises constantly. `intrabar:'optimistic'` exists only
    to MEASURE the size of that assumption, never to produce a headline.
 2. MAKER FILL RATE is a knob. Every earlier backtest silently assumed 1.0 — that
    both ladder legs always rest and always fill at the exact level. 0.7/0.4/0.0
    treat the remainder as market fills, which is what an unfilled limit is.
 3. DETERMINISM. The maker draw uses a seeded LCG, never Math.random(); a
    backtest that returns a different number each run cannot be compared to
    itself.
WHAT IT DELIBERATELY DOES NOT DO: no order-book depth model. The external report
asked for "dynamic slippage by book depth" — we have no order-book data, so that
would be invention, not measurement.
THREE BUGS CAUGHT BY THE SMOKE TEST BEFORE ANY CI TIME WAS SPENT (the v78bt
lesson applied: assert the accounting before trusting a table):
 - The pyramid gate was being logged as a capital "rejection". It fires on most
   bars of most open positions and buried the real signal under 28,684 rows. It
   is a strategy rule, not a capital shortage; the rejection log now only records
   what the CAPS cost.
 - Two O(n2) hot spots: slicing each coin's full history on every decision (40x
   per 4h bar for three years) and a linear scan of the growing closed-trade list
   for the 8h cooldown. Both would have turned a 90-second run into an hour.
 - The ladder could only advance one rung per management bar. A fast hour can
   clear 0.6R and 1.0R and the live bot, polling every minute, would bank both.
THE FIRST REAL LESSON, and it is the reason this thing exists — from a test
assertion that FAILED: "optimistic intrabar must beat conservative" is TRUE per
trade and FALSE per portfolio. Resolving a bar optimistically changes WHEN
capital is released, which changes WHICH later trades get funded, which changes
everything downstream. **A per-trade improvement does not imply a portfolio
improvement once the same dollar cannot be in two places.** Every conclusion in
the "Tested & REJECTED" list above was reached on the unconstrained model and is
therefore measured on a lens that could not see this effect. They are not
retracted — but the ones about EXIT TIMING (v57bt time-stop, v59bt ladder shapes,
v63bt first-leg level) genuinely reopen, because an earlier exit now has a
benefit the old model could not price: it frees capital.
ALSO CORRECTED, honestly: I told the owner I would fix the live bot's capital
allocation order (today it is `Promise.all` arrival order — whichever coin's
network call returns first gets the money). I then realised that prioritising by
ADX can REDUCE trade count, because high-ADX entries size up to 2.0x and consume
the remaining room faster. That collides with standing rule 5, so it is now a
MEASURED parameter in part E of v80bt rather than a fix applied on a hunch.
STATUS: built, 51 invariant assertions passing on synthetic data, wired as mode
`v80bt`, queued via `backtest/.run-request`. NOTHING IS MEASURED YET — the real
36-month numbers land in `status/bt-latest.txt`.
READING THE OUTPUT WHEN IT ARRIVES: the dollar figures are NOT comparable to the
696R / +0.062R in this file. Those came from the unconstrained R-sum. A lower
number is not a regression, it is the first honest measurement.

## v79bt (2026-09-18) — VOID, and the void is the finding
Stage 2 of the sub-gate tier. It did not rule on the sub-gate tier, because the
guard built into it fired first: **part A checks that the INCUMBENT passes all-6
before any challenger is read, and it does not.**
  LIVE adx>22 @3bps, n=11,412, totR 865, windows:
    w1 -75.0   w2 +286.4   w3 +222.2   w4 +275.5   w5 +159.2   w6 -3.6
That is the SECOND lens on which the deployed config fails all-6 (v78bt's
risk-weighted mean-R lens was the first, w1 -0.037 / w6 -0.001 — same two
windows). So the sub-gate tier is still unjudged after two full runs, and the
rows in part B must not be read as a verdict. They are recorded, not believed.
WHY THIS MATTERS MORE THAN THE TIER: the documented incumbent is 696R **positive
in all six windows** (v58bt/v59bt). My scan reproduces its TRADE COUNT almost
exactly (11,412 vs 11,218) but not its window profile. Two candidate explanations
and I cannot yet separate them:
  (a) MY SCAN IS NOT THE ENGINE. It has the Donchian-15 signal, the ADX gate, the
      1.4xATR stop, the ladder and the ADX tier multipliers — but no pyramiding,
      no heat cap, no ROTA interaction, no per-coin caps, and its own window
      boundaries. A simplified reimplementation is not the thing it models.
  (b) THE EDGE HAS DECAYED. The documented run was measured on an earlier 36-month
      span; this one ends 2026-09. If the incumbent genuinely no longer clears
      all-6 on fresh data, that is a far larger finding than any sub-gate tier and
      it changes what we are doing, not just how we size it.
(a) is the likelier explanation and must be eliminated FIRST — assuming (b)
without ruling out (a) would be exactly the panic the v66bt lumpiness note warns
against. But (b) cannot be waved away either, and the only way to tell them apart
is a shared engine both the live bot and the backtest run (item 4 of the owner's
list). That item stops being cleanup and becomes the blocking dependency for every
strategy question from here: **we currently have no instrument that can reliably
say whether the live config still passes its own bar.**
USEFUL BY-PRODUCT — the incumbent's own slippage curve, which is new:
    0bps 1085R | 3bps 865R | 6bps 644R | 10bps 350R
It loses roughly a quarter of total R per 3bps. The live 3bps assumption is
therefore not a rounding detail; it is the difference between 1085 and 865.
STATUS: sub-gate tier NOT rejected and NOT accepted — unjudgeable with the
instruments we have. Nothing deployed. Next step is item 4, then re-run v79bt
against the real engine.

## v78bt (2026-09-18) — sub-gate ADX tier: PROMISING, NOT DEPLOYABLE ON THIS LENS
The only untested route to "more trades". Every faster-bar answer is closed with
gross-edge evidence (5m negative at fee=0, 15m/30m/45m break w1, 1h/12h break
windows), so extra trades can only come from signals the 4h engine already sees
and discards. v68bt measured those (ADX<=22) at +0.043R — positive, just weaker.
v56bt had tried lowering the GATE to 18/20 at FULL size and w5 flipped negative.
Untested third option: take them as their own tier at REDUCED size — a sizing
question, and ADX is the only feature with proven sizing edge (v44/v58bt/v72bt),
and rule-5 safe by construction.
RESULT (n=11,412 baseline, span 1096 days — baseline reproduces the documented
~11,218, so the dataset is trustworthy):
  band alone: (18,22] n=2,672 avgR +0.0363 | (15,22] n=4,822 +0.0177 |
              (12,22] n=6,941 +0.0245  — all POSITIVE, confirming v68bt
  best row: G>12 x0.75 → totR 951 vs 865 base (+87R, +10%) on +6,941 trades (+61%)
  and totR rises MONOTONICALLY with both a lower gate and a larger multiplier.
BUT: window 6 degrades as you lean harder (-0.001 base → -0.027 at G>12 x0.75),
and **the incumbent itself fails all-6 on this lens** (w1 -0.037, w6 -0.001) —
the same documented artifact as v72bt/v73bt: per-window risk-weighted MEAN R with
3bps slip is stricter than the deployed totR-sum + full sizing stack. So the
all-windows rule cannot discriminate here and NOTHING is deployed on this run.
NEXT STEP, not a deploy: re-run on the deployed lens where the incumbent is known
to pass all 6, so the rule can actually decide. This is the first genuinely
positive strategy result since v70bt — and v70bt looked like a win too until the
slippage gate killed it, so it gets the second stage before anything ships.
PROCESS NOTE: the FIRST v78bt run completed in 80s and printed a full, plausible
table — all 12 rows losing, clean monotonic trend, tidy conclusion. It was
worthless: the workflow's fetch step picks the data fetcher from a MODE whitelist,
v78bt was not on it, so it silently used 45 days instead of 36 months. The tell
was not the result, it was the BASELINE — n=301 against the documented 11,218,
two empty windows, and the incumbent failing a bar it is known to pass. ALWAYS
check that the baseline reproduces a known number before reading any row below
it. The mode now ABORTS under a 900-day span instead of reporting on whatever it
finds.

## v57.2 (2026-09-18) — BASE RISK RAISED 1.25% → 1.75% (owner instruction)
Tier 2 of the v50bt Monte Carlo ladder. Drawdown expectation moves from median
16% / p90 25% / p99 36% to **median 22% / p90 34% / p99 47%**. The ADX tiers
multiply it unchanged, so ADX>45 breakouts now size at **3.5%** (was 2.5%).
Kelly context (v57bt): f*≈6.5%, so 1.75% is roughly ⅓-Kelly — still under the
optimum, growth scales close to linearly, variance scales with the square.
HOW IT HAPPENED, recorded honestly: the owner asked whether the bot could be made
"more aggressive, earning a lot all the time". The answer given was that ONE real
lever exists (this one), that it doubles the pain as well as the gain, that "all
the time" does not exist (v66bt: 2021 −92R, 2023 flat), and that their own
2026-07-12 rule blocked it at 0/50 trades. They then instructed the raise anyway,
in plain words. That is their call on their own paper account and it was actioned
in full — but NOTHING about it is validated by live results: the expectation band
has not been confirmed at any size on this project.
IMPLEMENTATION: hoisted to a module-scope `BASE_RISK_PCT` and published in
`deployment_manifest.base_risk_pct` and in `?donch_test=1`, so the size the bot
trades at is readable from the public anon key instead of from source. Verified
live: manifest row for v57.2 shows `base_risk_pct: 0.0175`.
NOTE FOR THE NEXT SESSION: do not read the 1.75% as evidence of anything. If the
first 50 trades come in below band, the honest move is back to 1.25%, not onward
to 2.5%.

## v57.1 (2026-09-18) — ROTA was filling at a price up to FOUR HOURS old
Found while checking a user report ("positions were in profit and it didn't close
them"). The positions were fine — the PRICES were not. Note the pattern: the user
report was wrong on its face and still led to the best find of the session.
DEFECT: ROTA ranks momentum from the last COMPLETED 4h candle (`p1`) and then used
that same close as the ENTRY and EXIT price. Right for the signal, wrong for a
fill — a rebalance lands on an arbitrary minute of the 4h window, so fills
averaged ~2h stale.
MEASURED on the live 05:46 rotation (filled at the 04:00 close, 1h46m old):
- 4 of the 10 opened slots entered 1.1-2.3% off the real market
  (FET +2.27%, WIF +1.23%, NEAR +1.19%, UNI +1.11%)
- the cross-source shield rejected 6 MORE that had drifted further
  (CRV 1.67 / ADA 1.79 / INJ 1.80 / APT 2.48 / OP 2.75 / ARB 6.89%)
= 37% of the sleeve skipped, a rule-5 trade cut caused by OUR OWN stale feed.
Cross-checked against Binance 1m bars at 05:46: per-minute ranges were 0.09-0.76%,
so this was two hours of drift, not a spike — **the bad-tick shield was RIGHT**.
(My first hypothesis was the opposite — that the shield was over-firing on routine
OKX↔Bybit basis, as in v56.3. The data reversed it. Check which side is wrong
before widening a tolerance: the "false positive" was a true positive.)
The EXIT path had the same defect, so realised ROTA P&L was measured against
fills that never existed.
FIX: `fetchLivePrice()` (Binance → OKX → Bybit, ≤1 min old) supplies entry, exit
and sizing; the 4h close still supplies the momentum ranking. One cached fetch per
symbol per rebalance. Also added the missing `1m` mapping to the Bybit kline
interval table (it silently fell through to `60`).
NOT a strategy change and NOT a trade cut: the backtest fills at the bar close,
which is self-consistent there but unachievable live — this makes the live engine
do what the backtest MEANT, and it removes false bad-tick rejections.
WATCH: the next rotation (~2026-09-20 05:46 UTC) is the first on live prices —
expect ~0% divergence and 16 of 16 slots filled instead of 10.

## v57.0 (2026-09-18) — the legacy 5m engine is OUT of the dashboard
Last open item from the external audit, closed. `trading-app/` carried a complete
SECOND trading system: a client-side 5-minute paper engine with its own risk
table, entry/exit thresholds and a 5-flag EMA/RSI/MACD/BB/StochRSI confluence
scorer. It had been unreachable for many versions (every entry point opened with
`if (supaModeRef.current) return`, and supaMode is permanently on) but it still
PAINTED the page: "SL 1.0% · TP 2.4%", a 4/5 score, a green "▲ קנייה" banner —
none of it connected to DONCH4H/ROTA. That is what made the reviewer conclude a
second 5m engine was trading live.
REMOVED: openTrade / checkTrades / handleManualClose; the indicator math
(EMA/RSI/MACD/BB/StochRSI/ADX/ATR, 1m→5m/15m bar builders, computeSig,
getMultiTFSig); the RISK table and MIN_SCORE / MIN_ADX / TP_MULT / PARTIAL_AT /
MAX_NOTIONAL_PCT / LEVERAGE / FEE_PCT; the `Sig` type and its state.
REPLACED so the page reports the BOT, not its own opinion: coin strip, market map
and scanner table key off the bot's open positions (side, sleeve, live P&L); the
chart drops EMA/BB overlays and the BUY/SELL dot, keeping candles + a marker for
a position the bot actually holds; the config card states the real rules
(Donchian-15/4h, ADX>22, 1.4×ATR, ⅓/⅓/trail, ROTA 14d, 1.25% base); the header
chip reads the live build out of `deployment_manifest` (version + short commit),
so the page names the code that produced its numbers.
KEPT: the Binance price WebSocket — it feeds live P&L for the bot's own open
positions and was never part of the engine.
VERIFIED: typecheck + production build clean, 1955→1844 lines, and the LIVE Pages
bundle contains zero occurrences of `StochRSI` / `MTF` / `computeSig`.
LESSON: dead code that still renders is not dead. It had no execution path for
months and still cost a full external audit cycle, because a dashboard is a
claim about what the system does.
REMAINING audit items: #2 health state machine (the deadlock itself is already
fixed in v56.6 — the refactor is cosmetic), #3 order-intent journal (only matters
at the real-exchange stage). The audit is otherwise closed.

## v56.9 (2026-09-18) — the 95% heat cap that never fired (concurrency race)
Caught on live data ~1h after v56.7 shipped, and it is the most serious defect
found this session. At the 08:00 UTC 4h close SIX DONCH4H breakouts fired in one
cycle and every one opened at full size: $9,087 of fresh notional on top of
ROTA's $4,667 = **138% of a $9,950 account**, cash balance **-$3,761**, and the
v56.0 heat cap (MAX_HEAT_PCT=0.95) logged nothing at all.
CAUSE: the cap is computed from `allOpen` — ONE snapshot taken at the top of the
cycle — while the per-coin scan runs in `Promise.all` batches of 12. Every
concurrent entry read the same stale exposure (heat=47%) and none could see the
others. Same blindness between sleeves: ROTA opens its basket earlier in the very
same invocation, off the same snapshot.
FIX: a cycle-scoped running total (`heatCommitted` / `netCommitted`) both sleeves
add to. A breakout RESERVES its room synchronously — before the first `await`,
which is the only point where a sibling in the batch can interleave — and
releases it on every path that then bails out (bad_tick, live_min_qty,
live_reject).
NOT a trade cut (rule 5): v56.0 already TRIMS to the room left and only skips
under $500, and v65bt established that simultaneous same-side breakouts are the
WINNERS and must never be capped by count. The arithmetic was broken, not the
policy.
WHY NOW: v56.7 restored the universe 21 → 40 coins. At half a universe, six
simultaneous qualifying breakouts were rare enough that the race never surfaced.
A correctness fix that raises trade count will expose whatever downstream sizing
bug was hiding behind the lower rate — expect that pattern again.
LIVE BOOK NOTE: per-trade RISK was never wrong — the six stops together are $327,
~3.3% of equity. The defect is LEVERAGE, not risk. Positions were left to run
their ladders rather than closed by hand (closing a cluster by hand is exactly
the v65bt mistake). SIDE EFFECT while cash is negative: `notional4` is capped by
`balance*0.95` and by ROTA's `balance < slotNotional` check, so BOTH sleeves skip
new entries until positions close and return cash — a soft, self-resolving
freeze, not the v56.6 deadlock (no kill-switch involved, it clears on the first
ladder leg).

## v56.8 (2026-09-18) — release provenance, honest regime label, owner-only close
Closes finding #1 of the external audit: the chain public page → git commit →
deployed function → database was not verifiable, so no live number could be
honestly attributed to the validated DONCH4H/ROTA system.
- **Manifest**: the deploy entrypoint is a two-file shim — `release.ts` sets
  `globalThis.__RELEASE_SHA`, then `index.ts` imports it and the pinned remote
  source (import order guarantees the stamp is set first). The bot writes the SHA
  to `deployment_manifest` once per cold start and returns it in every
  `?donch_test=1` response, with `universe_hash` (FNV-1a over sorted CRYPTO_40)
  so a silently edited universe reads as a different release at the same SHA.
  All readable with the public anon key. VERIFIED live.
- **`_v23_5M` label removed**: `bot_state.market_regime` was written as
  `btcRegime + '_v23_5M'`, left over from the retired v23 5-minute engine. The 4h
  bot has not used that engine for many versions, but the dashboard faithfully
  displayed "RANGING_v23_5M" — which is precisely what made an outside reviewer
  conclude a second 5m engine was live. It now says what actually runs.
  NB the reviewer's inference was wrong but the complaint was right: a cosmetic
  lie in a status field cost a full external audit cycle.
- **close-trade is owner-only**: it is deployed `--no-verify-jwt`, and
  `verify_jwt` would not have helped — the anon key IS a valid JWT and ships in
  the public bundle. Anyone could POST a `trade_id` and close the bot's
  positions. It now requires the service-role key (injected by Supabase, never
  reaches a browser); verified 403 with the anon key. The dashboard's
  manual-close button is unwired rather than left to 403.
- **Dead dashboard controls made honest**: bot on/off, risk and paper-mode write
  to `bot_state` with the anon key, which RLS has ALWAYS blocked. PostgREST
  returns 204 with zero rows, the old code never checked, so the UI flipped
  locally and reverted on the next poll — controls that look live and do nothing.
  They now `.select('id')` and report when the write does not land.
(The legacy client-side 5m engine noted here as still-open was deleted the same
day — see v57.0 above.)

## v56.7 (2026-09-18) — the volume floor was eating the pinned universe
Found on the migrated project's first live cycle, and it had been silently
costing trades for a while. `fetchFuturesCoins()` still ranked every source by
24h volume, dropped anything under a hardcoded floor ($50M Binance / $20M OKX)
and kept the top 60 — rules from v34-v40, when the universe was still dynamic.
Both strategies have been PINNED to CRYPTO_40 since v48, so that ranking no
longer selects anything, it only subtracts. As market-wide volume fell the floor
quietly ate the universe: measured 2026-09-18, exactly **12** Binance SPOT USDT
pairs clear $50M and only **10** of them are ours; OKX's $20M bar left 21/40.
Live effect: the bot scanned half the validated set and ROTA filled 10 of its 16
slots (it cannot rank a clean top-8/bottom-8 out of 21 names).
FIX: a CRYPTO_40 symbol is taken at whatever volume its source reports; the floor
and the 60-slice now only govern the extra non-pinned names. Per-trade liquidity
stays where it belongs — the v54 entry guard caps notional at 0.5% of the coin's
24h volume — so the universe filter no longer doubles as one.
Same class as v56.5 (a data-plumbing constant strangling the feed), NOT a
strategy change: it restores the universe the 36-month walk-forward was actually
run on, and it can only add signals (standing rules 2 and 5). Verified live:
coverage 21 → 40, source `okx_partial` → `spot`.
LESSON, worth generalising: every hardcoded absolute threshold in the data layer
($50M volume, ">=10 symbols" in v56.5, the 0.5% bad-tick tolerance in v56.3) is a
time bomb — it encodes market conditions from the day it was written and degrades
silently, without an error, as the market moves. Prefer relative/coverage-based
bars, and make the diagnostic print the number it is judging.

## Earlier state (2026-07-19)
- CHECKPOINT STATUS (2026-07-19 review, user asked "reached 50?"): the official
  counter (DONCH4H closed, risk_usd>0, era-anchored — what the watchdog fires
  on) is at **11/50**, NOT 50. The ~54 total closed rows include ROTA (35) and
  8 day-0 out-of-universe rows (EVAA/VANRY/US/BASED/SOXL/KORU etc., opened
  2026-07-10 00:21 before the universe pin caught them, force-closed same
  morning — excluded from all expectation math; NB 6 early DONCH4H rows have
  risk_usd=null → their ladder legs couldn't be backfilled, so "realized
  -184" overstates the loss). Clean n=11: WR 54.5%, avgR **-0.289** vs band
  +0.046 → z≈-1.3, WITHIN noise (need |z|>2) but below band. Regime=RANGING
  all week (53 adx_gate skips = gate working; breakout losses in chop are the
  v66bt lumpy-profile, not a defect). VERDICT: no risk raise (standing rule:
  50 + in-band required), no strategy change, keep accumulating; re-review at
  n≈30 or on kill-switch/regime flip. ROTA era: WR 58.8%, realized ≈ -23 +
  open winners (LDO +16%) ≈ flat-positive — carrying the book in chop as
  designed. v56.3 bad-tick fix VERIFIED: 07-18 rebalance opened all 8 slots,
  zero false skips since deploy. Binance fapi feed came back (source=fapi,
  84 ok / 0 fail) — OKX fallback dormant. Heat-limit skipped LTC breakout
  twice on 07-18 (heat 96%) — by design (v56.0), watch-item only.

- Live: **v56.3** — bad-tick shield tolerance 0.5%→1.5% (rule-5 fix): the
  cross-source sanity check skipped 5 healthy ROTA slots in one rebalance
  (routine 0.5-1% OKX↔Bybit alt-perp basis tripped it; real bad ticks are
  10-100× off). Divergence % now logged in bot_skips detail for tuning.
  VERIFIED post-deploy (status 2026-07-16 15:53): DONCH4H corrected stats
  n=12 WR=41.7% avgR=+0.106 (was falsely 8.3%/-0.116 pre-v56.2 backfill);
  realized -56.72→-4.52; kill-switch now fed honest data.
- Previous: **v56.2** — LADDER LEG P&L ACCOUNTING FIX (critical analytics bug, found
  in live-trade review): ladder leg profits (⅓@0.6R, ⅓@1.0R) were credited to
  balance but never stored on the trade row — rows closed with only the final
  third's pnl, so a trade that banked +0.53R then BE-stopped showed as a small
  LOSS. Live WR read 8% vs real ~66%; the health kill-switch (sums last-30 pnl)
  was ~16 trades from falsely pausing DONCH4H; the 50-trade checkpoint would
  have read garbage. Fix: legs_banked column accumulates leg pnl at each leg;
  ALL close paths (trail close, generic SL/BE/timeout, equity-guard, close_small)
  store pnl = final leg + legs_banked; SQL migration backfills closed AND open
  laddered rows (0.2×risk_usd stage 1, 0.5333×risk_usd stage 2, idempotent via
  legs_banked=0 guard). Balance was always correct — analytics/kill-switch repair.
  Also v56.1 (same day): donch_test diagnostic now applies CRYPTO_40 filter
  (OKX fallback was exposing tokenized-stock perps in the scan output — rule-2).
  status-ping.yml now also reports bot_skips summary + per-trade R for DONCH4H.
- Previous: **v56.0** — Portfolio Heat Limit: MAX_HEAT_PCT=0.95 caps total open
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
  **SUPERSEDED 2026-09-18 by the owner**: raised to 1.75% on explicit instruction
  at 0/50 trades — see v57.2. The checkpoint rule still governs the NEXT step
  (1.75% → 2.5%): do not raise again without 50 closed DONCH4H trades in-band,
  unless the owner again instructs it in as many words.
- Monte Carlo DD table (v50bt, for the risk-raise decision; real DD runs deeper
  due to concurrent positions): 1.25% risk → median maxDD 16%, p90 25%, p99 36%;
  1.75% → 22/34/47%; 2.50% → 31/46/60%. User must accept the tier's p90 before
  each raise.

## How to work
- Small edits → verify types (`tsc --noEmit --ignoreConfig --skipLibCheck` on a
  copy outside the repo; deno not installed locally), commit, push both branches.
- **Deploying (2026-09-18 onward)**: GitHub Actions cannot deploy — use the
  Supabase MCP connector. Commit and PUSH first, then deploy each function as a
  one-line entrypoint importing
  `https://raw.githubusercontent.com/aliexpressgood585/spacehub/<SHA>/supabase/functions/<fn>/index.ts`
  with `verify_jwt: false` (all 6 functions are `--no-verify-jwt`). The SHA must
  be a commit already on the public repo or the bundler 404s. DB work goes through
  `apply_migration` / `execute_sql` on `adxgadwghgkwmntsnrar`.
- **Never force-push a feature branch from main.** Doing so discarded the status-
  bot commits on both branches on 2026-09-18 (recovered from the local refs).
  Always `git checkout <branch> && git merge main && git push`.
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

# PREREGISTRATION — Q15 (owner override P-Q15, 2026-10-04, PAPER ONLY)

Written BEFORE the exit code and BEFORE any number for this exact rule was computed. Do not edit the rule;
a change needs a new file with a new name and a new start date.

## Owner instruction
"I want the bot to trade aggressively every fifteen minutes, and to be profitable." Read as: every COMPLETED
15m bar the liquid universe is scanned and the bot enters ONLY where a gated signal fires. A quiet bar is a
valid outcome. Forcing an entry per bar is a bug.

## Rule (frozen) — LONG shown, SHORT is the mirror; all on the completed 15m bar i
1. Burst: (close[i] / close[i-3] - 1) > 1.5 x ATR%(14, 15m) x sqrt(3)
2. Volume: vol[i] >= 2 x mean(vol over the 20 bars before i)   (same av20 helper as FAST)
3. Flow: taker imbalance over bars i-2..i = sum(2*takerBuy - vol) / sum(vol) > +0.10. Missing taker data -> the
   coin is skipped, never inferred.
4. BTC: BTC's 15m close above its EMA20 (below for SHORT). BTC itself skips this condition.
5. Profit gate: expected gross - full round-trip cost (shared/costs.ts: taker 5 bps/side, observed spread, walked
   impact, published funding over the 2h hold) >= 2 bps. Expected gross = the measured gross of Q15's OWN
   signals (q15_shadow, each scored by the exact bracket below on 1m bars), clustered by signal bar, evidence
   weighted (positive mean x clamp(t/2,0,1)), >= 30 bars with signals or no estimate -> no entry.

## Execution (frozen)
- Entry: market at the next 15m open (first 3 minutes after the close), priced by walking the real Binance book.
- Reject: book beyond visible depth, entry impact > 25% of the stop distance, spread > 8 bps, quote older than 15 s.
- Stop 1.5 x ATR(14, 15m), floor 0.4% of price. Target 2R. Timeout 8 bars (120 min). Stop before target.
- Exits resolved on Binance aggTrades (stop-market at the trigger print minus book impact, target at the level).
- Sizing: isolated 10x paper, margin 5% of equity per trade, <= 8 open, Q15 margin <= 50% of equity,
  <= 20 Q15 entries per UTC day, one position per coin, strongest (|z| x volume ratio) first. PSYCH off.
- Account brake: equity -12% from the UTC day start -> no new entries in Q15/EVT/DONCH4H until the next UTC day.

## What is expected (stated before the result)
Every 1m-1h price rule measured here (v76bt..v121, the gym, the lab, engine-v120 15m pooled PASS 0 of 522)
had gross 0-5 bps vs ~14-16 bps round trip. Prior: Q15's gross is ~0. With the honest gate this means Q15 will
be MOSTLY SILENT (no measurement for days, then likely 'costs_exceed_edge'). It is not a path to large returns.

## Evaluation
Live: count only until 100 closed Q15 trades. Then net bps/trade with t on daily sums; PASS needs net > 0 and
t >= 2. One offline sanity read of this exact rule on the repo's 36m 15m archive (40 coins) is recorded in
status/q15-check.txt — measurement only; nothing in the rule may be changed because of it.

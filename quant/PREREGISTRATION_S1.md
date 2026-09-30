# PRE-REGISTRATION — CHAN-X shadow variant S1 ("more exposure + precision")

Written 2026-09-30, before any S1 forward data exists. The owner asked for more portfolio exposure
while keeping accuracy. The AI Council (rule 7) settles strategy disagreements with a bounded
PAPER/shadow comparison, and the owner chose that route ("בדיקת צל קודם"). **S1 never trades.** The
live bot is unchanged: up to 8 open, 20x, 2% risk per trade, aggressive mode.

## What S1 is (frozen)
`shared/chan-shadow.ts`, variant id `S1`:
- **Exposure:** up to **12** open positions instead of 8, with the same 2% risk per trade and the
  same cap of 2 same-side entries per 5m bar.
- **Precision:** a candidate is taken only if every gate passes. A gate whose input is missing
  abstains (passes) and is logged in `s1_missing`.
  1. The component matches the regime: MR / LIQ_SQUEEZE only in MEAN_REVERT or HIGH_VOL; momentum,
     breakout and pullback components only in TREND or NEUTRAL.
  2. `micro_execution.score >= 60` **and** the 3-minute taker buy/sell ratio is on our side.
  3. The 15/60m trend (`mtf`) is on our side. Neutral counts as not on our side.
  4. Funding does not charge us more than 1 bp per 8h.
  5. Open interest is rising (`oi_delta > 0`).

Prior, recorded now so it cannot be revised later: **LOW.** The same filters were replayed on 323
closed CHAN trades in P004. The result was avgR −0.184 vs −0.292 baseline, still negative, with
OOS n=4. The gain came from trading less.

## What is logged (`chan_shadow`, migration 20260930220000)
- `kind='live'`: every trade the live bot takes, with S1's verdict on it. Its outcome is the real
  `bot_trades` row, matched on sym, side and the entry bar.
- `kind='virtual'`: every candidate the live bot refused **only** because it already had 8
  positions open. S1 takes it if `s1_take` is true: all gates passed, fewer than 12 positions in
  S1's book, and fewer than 2 same-side entries in that bar.
  - The candidate had not yet passed the live bot's later execution checks: book, sizing,
    liquidation buffer, net R/R. This is a known optimistic bias.
  - Its outcome is replayed offline from 1m candles: entry at `ref_px`, exit at `stop`, or at
    `max_hold_bars` × 5m. Costs are taker 5 bps + 3 bps slippage per side, expressed in R.
    This is labelled APPROXIMATE: the live exit machinery (trail, breakeven, stalled exit,
    partials) is richer.
  - The evaluator replays the `live` rows with the same simplified model and reports the gap
    against their real outcomes. The virtual result is corrected by that gap.

## Rules for reading it (frozen)
- **T0** = the first `chan_shadow` row. Before S1 has **>= 100 taken trades** (live + virtual),
  only COUNTS may be reported. No R, no P&L, no tuning.
- Metrics, S1 vs baseline (baseline = every live CHAN trade in the same period): n, avgR (net),
  PF, win rate, net $ at 2% risk per trade, max DD, t on daily sums.
- **PROPOSE to the Council for live use** only if ALL of these hold:
  - S1 avgR > 0;
  - S1 avgR − baseline avgR >= 0.10R;
  - t(daily) of S1 >= 2;
  - the virtual component alone, after the replay-gap correction, has avgR >= 0.
- **REJECT** if, at n >= 100, S1 avgR <= baseline avgR, or S1 avgR < 0.
- Otherwise: keep collecting, up to n = 300, then decide with the same rules.
- A change to any gate or threshold is a NEW variant (S2) with a new T0. It is never an edit to S1.

Evaluator: `backtest/research/s1_evaluate.py` (read-only; uses the public anon REST key and public klines).

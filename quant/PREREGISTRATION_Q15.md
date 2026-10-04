# P-Q15 — frozen PAPER protocol (2026-10-04)

Registered before implementing exits. Owner authorized preparation only on
q15/aggressive-scan, one PR, wait before merge/deployment. No reset or live orders.

## Signal and timing
Every completed 15m bar, scan every coin in the current liquid USDT-M universe.
LONG (SHORT mirror): 3-bar close return >1.5 ATR% * sqrt(3), signal-bar volume
>=2x the 20-bar average, 3-bar taker imbalance >0.10, BTC closed 15m close
above EMA20 (BTC exempt). Missing/invalid taker data rejects. No added indicators.
Enter in the next 15m bar using a fresh executable book, never backdate a fill
to the historical opening price. Record scan/entry lag. Entry window 60 seconds;
a missed opening window rejects rather than fills late. No forced fill.
Stop 1.5 ATR, price floor 0.4%; target 2R; timeout 8 bars (120 minutes).
Ordered aggTrades, liquidation then stop then target; a target needs a print
strictly beyond it. Quote age <=5s, spread <=8bps, both-side walked impact
<=25% of stop, no fills beyond visible depth. PSYCH off.

## Evidence and costs
Q15 gross expectancy must come from Q15-only completed forward shadow outcomes
with these same exits, observed entry books and published settled funding.
No reuse of FAST/PRO/Donchian scores; no target-as-expectancy; no made-up edge.
Minimum 100 resolved samples and 20 distinct UTC opening days. Estimate a
conservative gross lower bound from equal-weight daily means (mean minus two
standard errors), separately by direction, strictly completed before entry.
The owner later enabled Immediate Paper mode: the historical evidence gate is bypassed for paper entries, while the live executable cost/quality gates remain mandatory. This is explicitly exploratory and may be negative; evidence is still collected and displayed.
Shadow records are virtual only, do not reserve cash and never become trades.
Full costs use shared/costs.ts: 5bps per taker side, observed spread, measured
walkBook impact (at least the shared floor), published funding and its interval.
Missing funding rejects entries. Require gross minus full cost >=2bps. Funding
receipts cannot manufacture a price edge (gate credits no negative funding cost).
Freeze the rule and estimator; report missing/truncated tape, not invented exits.

## Sizing / halt
Q15 isolated PAPER 10x (SQL clamp 1..10), margin <=5% equity, <=8 open,
<=50% sleeve margin, <=20 entries per UTC day, no directional cap.
EVT isolated <=10x, <=8% margin, <=3, announcement <=30s including SQL recheck;
profit gate waived only for EVT. DONCH4H always 1x, existing Donchian 15,
ADX(60)>22, 1.25% base risk, second unit >=0.6R, third >=1R.
One shared UTC daily equity baseline; at -12% latch off ALL new entries for
that day; exits continue; resume next day. Gaps may exhaust one margin, never
withdraw another position's margin. No account reset.

## Evaluation and rollback
Report counts before sufficient evidence; do not claim a skip-rate forecast
without observed scans. Initially expect 100% of Q15 candidates to be rejected
by the gate until the minimum evidence is present (not 100% of EVT/DONCH).
After 100 funded Q15 closes, report net P&L, PF, drawdown, day/symbol concentration,
fee/spread/impact/funding and missing-data rates. Negative net -> propose disabling
new Q15 entries; execution/isolation faults -> block entries immediately, keep exits.
Rollback to the previous shims only after closing Q15 rows under owner approval.
This is an unvalidated experiment, not a $5k-to-$100k claim.

# Poly playbook — how every Polymarket decision is judged (owner's framework, 2026-10-15)

Thorp/Kelly, Tetlock, Silver, Harris, Duke. Applies to the three PAPER desks and to any market the owner brings.
PAPER ONLY.

## Formulas
- Price = implied probability. Edge = p_mine − price (NO side: (1 − p_yes) − price_no).
- EV per $ (YES) = p / price − 1, then minus taker fee (0.07·p(1−p) crypto / per-market rate), spread and slippage (walk the real book).
- Kelly f* = (p − price) / (1 − price). Stake ≤ ¼ Kelly, never above 5–10% per event; correlated markets (same match, same
  asset, same theme) count as ONE position.
- Annualised = (1 / price)^(365 / days) − 1 at certainty; at win rate w: (w / price)^(365 / days) − 1. Capital lock is a cost.
- Bayes: posterior odds = prior odds × likelihood ratio. Small updates; base rate first; write p BEFORE looking at the price.
- Scoring: Brier = mean((p − outcome)^2); calibration by price bucket after ≥ 50 trades; CLV = exit/closing price vs entry.

## Biases to exploit or avoid
Favourite-longshot (1–5% outcomes overpriced → NO has a small edge with tail risk), fan bias, thin books (history prices are
not tradable prices — see ZEC 5m), resolution wording (read the rules word by word; UMA disputes; 0.97 is not certain).

## Seven-point answer for any market
1. Question + resolution rules + wording risks. 2. Base rate + evidence → p with a range. 3. Price, edge, EV after costs.
4. ¼-Kelly size + cap. 5. Annualised return. 6. Update / exit triggers. 7. Decision: buy YES / buy NO / **לא לגעת**, with
confidence. No clear edge after costs → לא לגעת.

## Applied to the desks
`python3 -I scripts/pm-kelly-report.py status/pm-kelly.json` (read only) prints, per desk, win rate vs average price (edge),
EV per $, t, Kelly and ¼ Kelly, the market's Brier on our trades and calibration by 5c bucket. The supervisor runs it in its
daily status. Rule: a desk whose ¼ Kelly on ≥ 100 judged closes is ≤ 0 is NOT sized up, whatever the backtest says; the
step-down / stop gates in docs/POLY_SUPERVISOR.md stay the only automatic actions.

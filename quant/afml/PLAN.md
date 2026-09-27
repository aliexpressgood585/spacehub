# AFML layer on top of CHAN — plan and fit for a 1m–5m bot

The principles come from López de Prado, *Advances in Financial Machine Learning*. This is our own implementation, not copied text.

Everything here is **optional** and **off by default** (`afml.enabled: false` in `config.yaml`). Plain CHAN is never modified.

The meta-filter can only ever *remove* a CHAN trade or *shrink* its size. Every risk limit stays in force on top of it:
- half-Kelly ≤ 1%;
- 3x leverage;
- daily −3%;
- 5 losses in a row;
- −10% drawdown kill;
- paper/testnet only.

## What was built, and why it fits (or not) a 1m–5m bot

| AFML idea | Built? | Fit for 1m–5m CHAN | Where |
|---|---|---|---|
| Triple-barrier labels, barriers scaled by EWMA volatility × √(holding) | yes | **Good.** It gives every CHAN signal an honest label within the strategy's own holding limit, net of the round-trip cost. | `labeling.py` |
| Sample uniqueness weights (overlapping labels) | yes | **Essential.** CHAN fires on many consecutive bars of the same extreme, and the average uniqueness is ~0.06, so a naive model would count one event ~15 times. | `labeling.py` |
| Meta-labeling (CHAN = side, ML = take / skip / size) | yes | **The right shape**, since it cannot change CHAN's direction. Its limit is that it can only *filter*: if no subset of signals has a gross edge above the ~20 bps cost, it cannot create one. | `meta.py`, `run_meta.py` |
| RF / LightGBM with uniqueness-bagging, balanced classes | yes | Fine, with large leaves (≥50–100 events) because labels are noisy. | `meta.py` |
| Bet sizing from probability (2Φ(z)−1, 0.1 steps) | yes | Fine. It only shrinks trades, which keeps it inside the existing caps. | `meta.py` |
| Fractional differentiation (FFD, smallest d passing ADF on training data) | yes, as a feature | **Marginal.** At 5m, the z-score and returns already carry the memory that matters. | `fracdiff.py`, `features.py` |
| Dollar / volume bars | yes, as a study | **Limited.** We only have 1m klines (no tick archive), so a bar cannot close inside a minute. The live CHAN windows (ADF/Hurst over N bars) are also defined in bars. The study compares return properties and plain CHAN on time, volume and dollar bars with the same bar count. | `bars.py`, `run_meta.py --bars-study` |
| Purged K-fold + embargo | yes | **Essential.** Without it, overlapping labels leak and inflate every score. | `cv.py` |
| Combinatorial Purged CV (paths) | yes (6 groups, 2 test → 15 splits, 5 paths) | Essential for choosing among variants. | `cv.py` |
| Deflated Sharpe, PSR | yes | Essential. N = the number of meta variants tried (24). | `overfit.py` |
| PBO via CSCV | yes | Essential. | `overfit.py` |
| MDA (purged, out-of-sample) + MDI feature importance | yes | Yes: it shows why trades are taken. SHAP was not added, because MDA answers the same question out-of-sample and needs no extra dependency. | `meta.py` |
| Structural-break tests (SADF/CUSUM filters), entropy, microstructure (VPIN, Kyle λ, Roll) | **no** | Microstructure features need tick/trade archives we do not have. SADF on 5m bars is heavy and duplicates the Hurst/ADF regime gate. The public-data evidence here (v101bt–v103bt) found order-flow effects ~50× smaller than costs. | — |
| Hierarchical Risk Parity | **no** | CHAN holds ≤5 single-coin bets under hard caps; there is no portfolio to optimise. | — |
| Sequential bootstrap | **replaced** by uniqueness-bagging (`max_samples` = average uniqueness) | Same purpose, far cheaper at ~50k events. | `meta.py` |

## Protocol (frozen before the holdout is read)

1. **Primary model.** The live CHAN regime router, with the parameters Phase 1 chose (`reports/backtest-5m.json`). Its candidate signals are the events.
2. **Split.** Development is the first 80% of the timeline and the holdout is the last 20%, the same split as Phase 1.
3. **Development evaluation.**
   - Purged 6-fold with a 1-day embargo gives one out-of-sample probability per event.
   - That gives out-of-sample daily returns for all 24 variants: model {rf, lgbm} × barrier {1, 2} × threshold {0.50, 0.55, 0.60} × sizing {off, on}.
   - These feed PBO and the trial Sharpes used in DSR.
4. **Selection.** CPCV gives 5 stitched out-of-sample paths per variant. The variant with the best **mean path Sharpe** is selected, using development data only.
5. **Holdout run.** The selected model is refit on development events whose labels end before the holdout. It is then run **once** on the holdout through the same engine as Phase 1, which includes real fills, fees, slippage and archive funding, next to plain CHAN.
6. **Gate.**
   - Meta must beat plain CHAN on the holdout in both Sharpe and return.
   - **DSR must be > 0.95.**
   - Otherwise the answer is **keep plain CHAN**. `MetaFilter` then stays a pass-through even if someone sets `afml.enabled: true`.

## Guardrails
- Retraining runs on a schedule (`python -m quant.run_meta`, weekly), on archived data only. The model never trains on live trades in real time.
- The live bot (Supabase edge function) is not touched by this layer. Wiring it in would require the gate to PASS first, and then an explicit port.

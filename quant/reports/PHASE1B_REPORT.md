# Phase 1b — four more candidates, same gates, same costs

Generated 2026-09-27T04:33:50 UTC. Gate (unchanged): holdout Sharpe > 1.5, max DD < 15%, >= 200 holdout trades, and no DECAY / HOLDOUT_FLIP flag. Walk-forward + untouched 20% holdout read once; taker 0.05% / maker 0.02%, slippage base + 5% of the previous bar's range per market fill, real 8h funding.

| study | verdict | holdout Sharpe | max DD | trades | return | gross bps | costs bps | net bps | WF-OOS Sharpe | in-sample DSR | flags |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A_chan_1h/mean_reversion | **NO-GO** | +0.00 | 0.0% | 0 | +0.0% | +0.5 | 9.5 | -9.0 | -0.53 | 0.18 | NO_EDGE_IN_SAMPLE; UNSTABLE; DEFLATED |
| A_chan_1h/momentum | **NO-GO** | -0.54 | 0.3% | 2 | -0.2% | -207.9 | 48.1 | -256.0 | +0.84 | 0.73 | DEFLATED; HOLDOUT_FLIP |
| A_chan_1h/regime_router | **NO-GO** | -0.94 | 3.6% | 7 | -2.6% | -5.0 | 10.3 | -15.3 | -0.59 | 0.29 | NO_EDGE_IN_SAMPLE; UNSTABLE; DEFLATED; HOLDOUT_FLIP |
| A_chan_4h/mean_reversion | **NO-GO** | +1.41 | 0.0% | 2 | +0.7% | +420.3 | 47.3 | +373.0 | +0.00 | 0.24 | NO_EDGE_IN_SAMPLE; UNSTABLE; DEFLATED |
| A_chan_4h/momentum | **NO-GO** | +0.57 | 0.4% | 3 | +0.4% | +115.2 | 44.9 | +70.2 | -0.09 | 0.37 | DECAY; DEFLATED |
| A_chan_4h/regime_router | **NO-GO** | -0.64 | 0.5% | 3 | -0.3% | -7.0 | 16.1 | -23.0 | -0.76 | 0.09 | NO_EDGE_IN_SAMPLE; UNSTABLE; DEFLATED; HOLDOUT_FLIP |
| B_maker_5m/mean_reversion | **NO-GO** | +0.00 | 0.0% | 0 | +0.0% | -8.6 | 11.5 | -20.1 | -0.84 | 0.25 | NO_EDGE_IN_SAMPLE; UNSTABLE; DEFLATED |
| B_maker_5m/momentum | **NO-GO** | -0.91 | 5.9% | 24 | -3.6% | -21.7 | 12.4 | -34.1 | -0.82 | 0.21 | DECAY; UNSTABLE; DEFLATED |
| B_maker_5m/regime_router | **NO-GO** | -2.72 | 10.0% | 21 | -10.0% | -7.3 | 11.5 | -18.9 | -1.69 | 0.17 | NO_EDGE_IN_SAMPLE; UNSTABLE; DEFLATED; HOLDOUT_FLIP |
| B_maker_1h/mean_reversion | **NO-GO** | +0.00 | 0.0% | 0 | +0.0% | +5.3 | 14.1 | -8.8 | +0.49 | 0.16 | UNSTABLE; DEFLATED |
| B_maker_1h/momentum | **NO-GO** | -0.48 | 0.3% | 2 | -0.1% | -206.5 | 22.7 | -229.1 | +0.94 | 0.77 | DEFLATED; HOLDOUT_FLIP |
| B_maker_1h/regime_router | **NO-GO** | -0.82 | 3.5% | 7 | -2.3% | -4.2 | 7.4 | -11.6 | -0.41 | 0.12 | NO_EDGE_IN_SAMPLE; UNSTABLE; DEFLATED; HOLDOUT_FLIP |
| B_maker_4h/mean_reversion | **NO-GO** | +1.41 | 0.0% | 2 | +0.9% | +419.1 | 18.6 | +400.5 | +0.00 | 0.56 | NO_EDGE_IN_SAMPLE; UNSTABLE; DEFLATED |
| B_maker_4h/momentum | **NO-GO** | +0.71 | 0.4% | 3 | +0.5% | +114.7 | 25.3 | +89.4 | +0.01 | 0.45 | DECAY; DEFLATED |
| B_maker_4h/regime_router | **NO-GO** | -0.58 | 0.5% | 3 | -0.3% | -14.1 | 19.5 | -33.6 | -0.73 | 0.24 | NO_EDGE_IN_SAMPLE; UNSTABLE; DEFLATED; HOLDOUT_FLIP |
| C_pairs_named_1h | **NO-GO** | -1.29 | 0.3% | 1 | -0.3% | -557.5 | 92.6 | -650.1 | -1.32 | 0.02 | NO_EDGE_IN_SAMPLE; DEFLATED |
| C_pairs_named_4h | **NO-GO** | +0.00 | 0.0% | 0 | +0.0% | +60.4 | 123.9 | -63.5 | -1.34 | 0.00 | NO_EDGE_IN_SAMPLE; DEFLATED |
| C_pairs_all45_1h | **NO-GO** | +0.00 | 0.0% | 0 | +0.0% | -0.0 | 113.4 | -113.4 | +0.00 | 0.00 | NO_EDGE_IN_SAMPLE; UNSTABLE; DEFLATED |
| D_funding_1h_40coins | **NO-GO** | +0.00 | 0.0% | 0 | +0.0% | +294.1 | -58.5 | +352.6 | -1.10 | 0.39 | DECAY; UNSTABLE; DEFLATED |

- B_maker_5m/maker_fill_rate: **93.3%**
- B_maker_1h/maker_fill_rate: **99.2%**
- B_maker_4h/maker_fill_rate: **99.6%**

(gross/costs/net bps = per-trade size-free edge of the raw signal on the holdout, all symbols, before portfolio limits.)


### C_pairs_named_1h: cointegration share of time and hedge ratio

| pair | cointegrated (Johansen 95%) | beta median | beta max (cost basis) |
|---|---|---|---|
| BTC/ETH | 16% | 0.52 | 4.17 |
| ETH/SOL | 14% | 0.59 | 4.97 |
| BTC/SOL | 18% | 0.43 | 2.83 |

### C_pairs_named_4h: cointegration share of time and hedge ratio

| pair | cointegrated (Johansen 95%) | beta median | beta max (cost basis) |
|---|---|---|---|
| BTC/ETH | 18% | 0.55 | 4.52 |
| ETH/SOL | 12% | 0.56 | 4.98 |
| BTC/SOL | 16% | 0.43 | 4.39 |

### C_pairs_all45_1h: cointegration share of time and hedge ratio

| pair | cointegrated (Johansen 95%) | beta median | beta max (cost basis) |
|---|---|---|---|
| BTC/ETH | 16% | 0.52 | 4.17 |
| BTC/SOL | 18% | 0.43 | 2.83 |
| BTC/BNB | 13% | 0.74 | 3.82 |
| BTC/XRP | 18% | 0.66 | 4.07 |
| BTC/DOGE | 15% | 0.39 | 4.41 |
| BTC/ADA | 9% | 0.34 | 4.18 |
| BTC/AVAX | 14% | 0.31 | 4.06 |
| BTC/LINK | 17% | 0.47 | 3.09 |
| BTC/DOT | 10% | 0.27 | 1.66 |
| ETH/SOL | 14% | 0.59 | 4.97 |
| ETH/BNB | 14% | 1.25 | 4.98 |
| ETH/XRP | 15% | 1.01 | 4.79 |
| ETH/DOGE | 13% | 0.60 | 4.84 |
| ETH/ADA | 9% | 0.61 | 2.98 |
| ETH/AVAX | 12% | 0.47 | 4.32 |
| ETH/LINK | 20% | 0.83 | 3.23 |
| ETH/DOT | 10% | 0.52 | 4.97 |
| SOL/BNB | 13% | 1.27 | 4.89 |
| SOL/XRP | 18% | 1.25 | 4.91 |
| SOL/DOGE | 14% | 0.71 | 4.35 |
| SOL/ADA | 14% | 0.76 | 4.59 |
| SOL/AVAX | 22% | 0.80 | 4.57 |
| SOL/LINK | 14% | 0.89 | 4.82 |
| SOL/DOT | 15% | 0.74 | 4.41 |
| BNB/XRP | 18% | 0.43 | 4.49 |
| BNB/DOGE | 14% | 0.22 | 4.38 |
| BNB/ADA | 10% | 0.20 | 3.67 |
| BNB/AVAX | 12% | 0.31 | 3.59 |
| BNB/LINK | 17% | 0.29 | 4.96 |
| BNB/DOT | 10% | 0.25 | 3.72 |
| XRP/DOGE | 20% | 0.58 | 4.94 |
| XRP/ADA | 16% | 0.58 | 4.98 |
| XRP/AVAX | 18% | 0.43 | 4.74 |
| XRP/LINK | 20% | 0.58 | 3.90 |
| XRP/DOT | 17% | 0.52 | 2.43 |
| DOGE/ADA | 21% | 0.83 | 4.83 |
| DOGE/AVAX | 16% | 0.80 | 4.83 |
| DOGE/LINK | 12% | 0.82 | 4.85 |
| DOGE/DOT | 20% | 0.79 | 4.93 |
| ADA/AVAX | 19% | 0.77 | 4.98 |
| ADA/LINK | 23% | 0.84 | 3.66 |
| ADA/DOT | 23% | 0.81 | 4.92 |
| AVAX/LINK | 16% | 0.94 | 2.75 |
| AVAX/DOT | 15% | 0.91 | 3.91 |
| LINK/DOT | 14% | 0.71 | 3.94 |

## Size-free edge of the in-sample-chosen parameters (why the Kelly-sized holdout has so few trades)

Half-Kelly sizes each strategy on its OWN in-sample record: a strategy that lost in-sample gets size 0, so the gated holdout trades almost nothing. The table below shows the raw signal anyway: every trade the chosen parameters produce, before portfolio limits, and the holdout at a fixed 0.25% risk (Kelly off). The gate is NOT computed on these rows. They exist to show there is no hidden edge being refused.

| study | in-sample n | IS net bps | IS t | holdout n | HO gross bps | HO net bps | HO t | fixed-risk HO Sharpe / trades / return / DD |
|---|---|---|---|---|---|---|---|---|
| A_chan_1h/mean_reversion | 864 | -13.5 | -4.37 | 350 | +0.5 | -9.0 | -2.83 | -1.59 / 287 / -6.0% / 6.7% |
| A_chan_1h/momentum | 19 | +505.0 | +1.16 | 2 | -207.9 | -256.0 | -0.56 | -0.54 / 2 / -0.2% / 0.3% |
| A_chan_1h/regime_router | 2602 | -18.4 | -3.17 | 522 | -5.0 | -15.3 | -3.63 | -1.70 / 325 / -10.2% / 10.7% |
| A_chan_4h/mean_reversion | 11 | +387.2 | +2.04 | 2 | +420.3 | +373.0 | +1.60 | +1.41 / 2 / +0.7% / 0.0% |
| A_chan_4h/momentum | 60 | +77.8 | +0.31 | 3 | +115.2 | +70.2 | +0.41 | +0.57 / 3 / +0.1% / 0.1% |
| A_chan_4h/regime_router | 871 | -29.0 | -3.30 | 177 | -7.0 | -23.0 | -1.80 | -0.61 / 155 / -3.1% / 4.4% |
| B_maker_5m/mean_reversion | 1754 | -20.2 | -7.40 | 356 | -8.6 | -20.1 | -4.13 | -2.96 / 83 / -9.3% / 9.9% |
| B_maker_5m/momentum | 109 | +2.7 | +0.15 | 91 | -21.7 | -34.1 | -3.04 | -2.86 / 81 / -5.9% / 6.9% |
| B_maker_5m/regime_router | 2038 | -14.0 | -4.32 | 481 | -7.3 | -18.9 | -3.41 | -2.89 / 84 / -9.5% / 9.8% |
| B_maker_1h/mean_reversion | 1422 | -25.6 | -3.91 | 569 | +5.3 | -8.8 | -1.38 | -1.29 / 240 / -9.1% / 10.3% |
| B_maker_1h/momentum | 19 | +552.5 | +1.27 | 2 | -206.5 | -229.1 | -0.51 | -0.48 / 2 / -0.1% / 0.3% |
| B_maker_1h/regime_router | 4933 | -16.8 | -3.84 | 1200 | -4.2 | -11.6 | -3.89 | -1.86 / 351 / -9.1% / 9.4% |
| B_maker_4h/mean_reversion | 10 | +480.2 | +2.40 | 2 | +419.1 | +400.5 | +1.69 | +1.41 / 2 / +0.9% / 0.0% |
| B_maker_4h/momentum | 60 | +130.0 | +0.52 | 3 | +114.7 | +89.4 | +0.52 | +0.70 / 3 / +0.1% / 0.1% |
| B_maker_4h/regime_router | 5390 | -56.8 | -9.12 | 1406 | -14.1 | -33.6 | -4.07 | -1.54 / 231 / -9.9% / 10.6% |
| C_pairs_named_1h | 10 | -77.6 | -0.35 | 1 | -557.5 | -650.1 | +0.00 | -1.29 / 1 / -0.3% / 0.3% |
| C_pairs_named_4h | 45 | -128.5 | -1.69 | 9 | +60.4 | -63.5 | -0.44 | -0.79 / 9 / -0.4% / 0.8% |
| C_pairs_all45_1h | 519 | -170.2 | -7.56 | 224 | -0.0 | -113.4 | -2.94 | -2.91 / 149 / -10.3% / 10.3% |
| D_funding_1h_40coins | 1620 | -66.9 | -2.07 | 118 | +294.1 | +352.6 | +2.75 | +0.26 / 105 / +1.3% / 4.5% |

## Reading, per candidate

**A. 1h / 4h (taker).** Larger bars do shrink costs relative to the move, but the router's gross edge stays at about zero or negative:
- 1h router: holdout gross −5.0 bps, net −15.3 bps (t −3.6).
- 4h router: gross −7.0 bps, net −23.0 bps.

The ADF + Hurst gate almost never opens on single-coin 1h/4h prices. Plain MR fired 11 times in-sample at 4h and 2 on the holdout, and momentum 60 / 3. Those small samples show large per-trade numbers (+373 bps, +70 bps) at t < 2. With n = 2 they are anecdotes, and the portfolio gate (≥ 200 holdout trades) correctly refuses them. **NO-GO.**

**B. Maker-only entries.**
- The fill rate is 93% (5m), 99% (1h) and 99.6% (4h). A post-only limit at the signal close is nearly always traded through on the next bar.
- That is the adverse selection: the orders that fill are the ones price runs through.
- The maker rebate saves about 6–10 bps per trade on 5m: router net −18.9 bps vs −29.2 bps taker.
- The gross edge gets WORSE (5m router −7.3 bps). Every variant still loses after costs. **NO-GO.**

**C. Pairs / cointegration (Johansen).** The index is built on 5m bars, so its hourly extremes are real, over 36 months, with both legs costed.
- Pairs are cointegrated at 95% only ~15% of the time on a 30-day window.
- All 45 pairs at 1h: in-sample net −170 bps (t −7.6), holdout gross 0.0 bps, net −113 bps.
- The named three pairs (BTC/ETH, ETH/SOL, BTC/SOL) are negative in-sample at both 1h and 4h.
- A direct check on BTC/ETH (no costs, no stops): after |z| ≥ 1.5 the spread moved a further 58 bps AWAY over one half-life instead of reverting.
- Johansen passes on a window and the relationship breaks right after. **NO-GO.**

**D. Extreme funding (40 coins, 1h).** The in-sample best parameter set (|rate| ≥ 0.10% per 8h, hold 72h) LOST in-sample (net −66.9 bps, t −2.07). It then showed +352.6 bps net on 118 holdout trades (t 2.75).
- A strategy that loses in-sample and wins out-of-sample is not evidence of an edge. It is one period (2026 H1) favouring fades of crowded longs.
- Half-Kelly gives it size 0.
- Even at a fixed 0.25% risk the holdout Sharpe is only +0.26 (gate 1.5).
- **NO-GO.** Worth re-testing only on NEW data (it is now watched, not traded).

**Nothing passed. The live bot stays on paper, unchanged; no gate was relaxed.**

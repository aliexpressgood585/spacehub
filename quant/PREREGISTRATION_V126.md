# v126 — new data sources, pre-registered 2026-10-25 before any number was computed

Owner: "find a new source, deploy and merge on your own". Sources never tested in this repo:

1. Deribit DVOL (BTC, ETH implied vol index), daily, public API `get_volatility_index_data`, from 2021-03.
2. DefiLlama total stablecoin supply (sum of all pegged USD), daily, `stablecoins.llama.fi/stablecoincharts/all`.
3. DefiLlama total DeFi TVL, daily, `api.llama.fi/v2/historicalChainTvl`.

Signals, computed at the 00:00 UTC daily close from data published by then (one-day lag applied):
- S1 VRP = DVOL - realised 30-day vol of the same coin (annualised %, from Binance USDT-M daily closes).
- S2 DVOL 7-day change (points).
- S3 stablecoin supply 7-day growth (%).
- S4 stablecoin supply 30-day growth (%).
- S5 DeFi TVL 7-day change (%).

Assets: BTC, ETH (Binance USDT-M daily, 2021-03..2026-09), and an equal-weight basket of the
CRYPTO_40 coins available on each day. S1/S2 trade their own coin and the basket (BTC DVOL for the basket).

Rule: terciles of the signal, thresholds fixed on the IS period only. Top tercile = +1, bottom = -1,
middle = 0. Direction (follow = +sign, fade = -sign) chosen on IS only. Position held H = 1, 3, 7 days
as a staggered book (each day's signal gets 1/H of the book for H days). Daily P&L on the book.
Costs: 8 bps per side on turnover (taker 5 + slip 3) + funding 0.03%/day paid by longs, received by shorts.

Split: first 70% of days IS, last 30% OOS, read once. t on daily P&L.
PASS = IS mean > 0 with IS t >= 1, OOS mean > 0 with OOS t >= 2, and the same OOS sign at all three H.
Rows: 5 signals x 3 assets (S3-S5 on 3 assets, S1-S2 on own coin + basket) x 3 holds; luck alone passes ~1 at t>=2.

Deploy only if something PASSES: then as a separate paper desk (GitHub Actions, like the Poly desks;
the Supabase project is quota-blocked). If nothing passes, the research is merged and nothing is deployed.

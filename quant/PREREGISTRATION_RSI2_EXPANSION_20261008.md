# RSI2 fixed-rule expansion — 2026-10-08
Research only; no runtime changes, no automatic promotion.
Frozen universe: BTCUSDT ETHUSDT SOLUSDT BNBUSDT XRPUSDT DOGEUSDT ADAUSDT AVAXUSDT LINKUSDT SUIUSDT AAVEUSDT LTCUSDT TRADOORUSDT MYXUSDT.
Historical fixed universe; current Binance listing status is NOT verified by archive availability.
Window: 2025-10-01 inclusive to 2026-10-01 exclusive UTC. Train through 2026-06-01 exclusive; validation thereafter. Existing historical periods have been exposed to other research; not a clean holdout.
28 trials: on each symbol, ADX<25 filter and volume>=20-bar mean filter, separately. Shared frozen RSI2 <=5 long / >=95 short, close relative to EMA200 5m and fully closed 15m EMA50/200 trend, target 1 ATR14, stop 2 ATR14, 32-bar timeout, next-bar open, stop first.
Replay the existing shared/rsi2-forward.ts functions (blob e261cf143bbfbe9a9d643f4ad2a77911fae403c7). Research maps the symbol to the filter selector only; actual candle and funding data always come from that symbol.
1000 15m bars warmup required; discard entries before this readiness point. Gaps invalidate a symbol; no interpolation. No trades may cross the train/validation split: exclude those from both metrics.
Costs 0.12% round trip base, 0.16% stress. Actual archived funding rates, funding settlement mark proxied by CLOSE of the preceding completed 5m mark-price candle. This mark proxy is explicitly different from runtime exact reported mark. Missing required archive months/settlement marks invalidate funding coverage and prohibit promotion.
Funding entry-inclusive/exit-exclusive, intrabar exit timestamp at bar end, matching runtime approximation.
Report counts, net win rate, PF, mean net bps, trades/day, both directions, coverage, excluded boundary trades, all failures. Fixed $5000 notional per observation; sum PnL is not a portfolio return.
Screen only if >=300 trades and PF>1.15 and positive expectancy in BOTH train and validation, base AND stress. All survivors still require fresh Shadow, exact-funding verification and portfolio simulation. No tuning after results.

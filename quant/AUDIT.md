# Audit of the existing bot (2026-09-26) — what to keep, what to replace

## What exists today
A TypeScript/Deno bot running as a Supabase Edge Function (`supabase/functions/trading-bot/`). A pg_cron job calls it
every 5 seconds. It trades on PAPER only: fills are simulated against real Binance order books and trade prints, and no
order ever reaches an exchange. It is hard-locked to paper by `ALLOW_LIVE_EXECUTION`. Pieces:

| Piece | Where | State |
|---|---|---|
| FAST sleeve: burst / 5m-close / Wyckoff modes | `shared/fast.ts`, `fast-runner.ts` | LIVE on paper: Wyckoff spring/upthrust at 50x isolated, 3 × 1/3 equity as margin |
| SCALP sleeve: 75 voting agents + profit gate | `shared/scalp.ts`, `shared/opportunity.ts`, `scalp-runner.ts` | enabled with 0 capital; the gate rejects everything (no measured edge) |
| LAB / ROTA / BRKV sleeves | `lab-runner.ts`, `rota-runner.ts`, `brkv-runner.ts` | off |
| Cost model | `shared/costs.ts` | taker/maker, observed spread + depth impact, published funding |
| Fill realism | `resolveExit` / `walkBook` / `liqCap` in `shared/fast.ts` | stops resolved on Binance aggTrades; market fills priced by walking the real book |
| Ledger | SQL functions `fast_commit_cycle` etc. | atomic, lease-guarded, caps enforced again in SQL |
| Research | `backtest/` (TS) | lab grid, gym, many one-off studies; archives in `backtest/data` |
| Forward data | `data-collector` edge fn | liquidations, OI/funding, Deribit options, news (since 2026-09-26) |
| Dashboard | `trading-app/` | read-only viewer |

## Against the new specification

| Requirement | Today | Verdict |
|---|---|---|
| Python, ccxt, pandas, statsmodels; `/strategies /backtest /risk /execution /data config.yaml` | TypeScript/Deno on Supabase | **REPLACE** → new `quant/` package (the TS bot stays until a quant strategy passes Phase 1) |
| Mean reversion with ADF + Hurst + OU half-life | none (the lab has z-score / RSI fades, no stationarity test) | **NEW** `quant/strategies/mean_reversion.py`, `stats.py` |
| Momentum only when statistically significant on recent data | FAST fires on a fixed threshold; no significance test | **NEW** `quant/strategies/momentum.py` |
| Regime filter (Hurst + vol) routing strategies | none (BTC-EMA side filter only) | **NEW** `quant/strategies/regime.py` |
| Honest backtest: maker/taker, slippage, funding, no look-ahead, walk-forward + untouched holdout, overfit flags | TS lab has IS/VAL/OOS and costs; no single engine shared with live execution, no deflated Sharpe | **REPLACE** → `quant/backtest/` (engine, portfolio with the live RiskManager, walk-forward, holdout, DSR) |
| Half-Kelly sizing capped at 1% risk | 1/3 of equity as margin per trade | **REPLACE** |
| Max leverage 3x (config) | **50x** isolated | **REPLACE** (the current live setting violates the hard limit by ~17x) |
| Daily loss limit 3% | removed in v86 (graded risk only); FAST has none | **REPLACE** |
| 10% drawdown kill switch (close all + halt) | none on FAST | **REPLACE** |
| Stop after 5 consecutive losses | v96.2 has "3 losses → 2h pause" + "3 losses/day → stop" | **REPLACE** with the spec (configurable) |
| Mandatory stop on EVERY order, exchange-side | simulated stops, no exchange | **NEW** `quant/execution/broker.py` (STOP_MARKET reduce-only right after the fill; if it cannot be placed the position is closed) |
| Testnet paper trading | not possible (no exchange connection by design) | **NEW** ccxt `binanceusdm` sandbox → testnet.binancefuture.com (reachable from here: HTTP 200) |
| Live only after manual approval, never automatic | paper hard-lock | **KEEP the principle** → `quant/execution/gate.py`: 4 separate manual acts, none of which code can perform |
| API keys from env only, never logged | Supabase env | **KEEP** + log redaction filter |
| Trade log SQLite/CSV + Telegram | Postgres tables + dashboard, no Telegram | **NEW** `journal.py` (SQLite + CSV), `alerts.py` (Telegram, never raises) |
| Reconnects, rate limits, partial fills, rejections | n/a (no orders) | **NEW** in `broker.py` / `runner.py` |
| Unit tests for risk + signals | TS suite (~400 assertions) for the TS bot | **NEW** pytest suite `quant/tests` |

## Keep (reuse, do not rebuild)
- **Data archives** in `backtest/data` (Binance USDT-M klines 5m × 36 months and 1m × 12 months for 10 coins, 8h
  funding). The Python loader reads them directly.
- **The cost lessons**: fees + spread + impact decide everything below 1 hour (v76–v105bt, gym, lab, FAST). They are
  built into the new engine's defaults.
- **Fill-realism ideas**: stop-first in a bar, gaps fill at the open, and limits need a trade-through. The TS aggTrades
  replay stays in the TS bot.
- **Forward data collectors**: liquidations, OI, options and news. They cannot be backtested on history, so they keep
  recording for later.
- **The dashboard**: it can later read `quant/reports/journal_*.sqlite` via an export. Not wired yet.

## Replace / retire
- The FAST sleeve's 50x / 1/3-equity sizing, and its missing daily-loss, drawdown and loss-streak limits.
  - It contradicts every hard limit in the spec. Recommendation: pause FAST, or cap it at 3x with the quant
    RiskManager's limits, until a strategy passes Phase 1.
  - **Not changed without the owner's decision:** the owner set this live paper experiment themselves on 2026-09-26.
- The SCALP agent swarm as a trading engine: 0 entries for days because nothing clears costs. Its learning tables
  can stay as research.
- Fixed-threshold signals with no significance or stationarity test (FAST burst, Wyckoff, the lab rules). The quant
  strategies gate on statistics estimated on past data only.

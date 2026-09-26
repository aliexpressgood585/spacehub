# quant/ — Chan-style research + execution stack (Binance USDT-M, 1m–5m)

Principles from Ernest Chan, *Algorithmic Trading* (implemented, not copied):
1. Test before trading. Stationarity (ADF), anti-persistence (Hurst) and the OU half-life decide whether mean reversion
   is even possible, and set its look-back. Momentum is traded only where past returns significantly predicted future
   returns on recent data.
2. Know the regime. Trade each strategy only in its regime (Hurst + volatility); otherwise stay flat.
3. Assume the backtest is lying until proven otherwise:
   - real costs;
   - no look-ahead;
   - walk-forward, plus a holdout read once;
   - deflated Sharpe for the number of trials.
4. Size by Kelly, and never by full Kelly. Half-Kelly, capped at 1% risk, with hard account-level limits.

## Layout
```
quant/
  config.yaml            every tunable number (risk limits, costs, grids, gates, mode)
  config.py              loader + validation (e.g. refuses risk_per_trade_cap > 1%)
  data/loader.py         Binance archive klines + real 8h funding
  strategies/
    base.py              the Signals contract (decisions at the CLOSE of bar i, filled at the OPEN of i+1)
    stats.py             ADF, Hurst, OU half-life, causal rolling estimates, ATR
    mean_reversion.py    A: stationarity-gated z-score reversion, half-life look-back, linear scale-in option
    momentum.py          B: time-series momentum + breakout, gated by a t-test of corr(past L, next H)
    regime.py            C: Hurst + volatility regime labels
  risk/manager.py        half-Kelly sizing (cap 1%), leverage cap, daily loss, DD kill, loss streak — ONE class used by
                         the backtest AND the live runner
  backtest/
    engine.py            per-symbol simulator: taker/maker fees, slippage, funding, gap-through stops, stop-first
    portfolio.py         applies sizing + every risk limit in time order (same RiskManager)
    metrics.py           Sharpe, Sortino, max DD, PF, win rate, avg trade, trades, exposure, deflated Sharpe
    walkforward.py       rolling walk-forward, untouched 20% holdout, overfit flags, Phase-1 gate
  execution/
    gate.py              mode resolution; live needs 4 separate manual acts
    exchange.py          ccxt binanceusdm (testnet via sandbox mode); keys from env only; log redaction
    broker.py            orders with retries/backoff, partial fills, mandatory exchange-side stop, reconcile
    journal.py           SQLite + CSV trade/order/event log
    alerts.py            Telegram (entries, exits, errors, kill switch); never raises
    runner.py            the live/testnet loop (closed candles only, same signal + risk code as the backtest)
  run_backtest.py        Phase 1: python -m quant.run_backtest --tf 5m|1m
  make_report.py         renders reports/BACKTEST_REPORT.md
  run_live.py            Phase 2/3: python -m quant.run_live --report quant/reports/phase1-approved.json
  tests/                 pytest: risk, stats/signals (incl. look-ahead tests), engine, execution (fake exchange)
  AUDIT.md               audit of the existing TS bot: keep / replace
```

## Implementation plan (status)
| # | Step | Status |
|---|---|---|
| 1 | Audit the existing bot | done — `AUDIT.md` |
| 2 | Config + data loader on the existing Binance archives | done |
| 3 | Stats (ADF / Hurst / half-life), strategies A, B, C with documented rationale / failure modes | done |
| 4 | Honest engine + portfolio replay using the live RiskManager | done |
| 5 | Walk-forward + holdout + overfit flags + Phase-1 gate | done |
| 6 | Risk module + unit tests | done |
| 7 | Execution: testnet client, broker (stops, retries, partial fills, reconcile), journal, Telegram, runner, live gate | done, **unit-tested against a fake exchange only**. It has never placed a real testnet order: that needs testnet keys, and the runner needs an always-on host |
| 8 | Phase 1 backtests, 5m (36 months) and 1m (12 months), 10 coins | done — **all NO-GO**, see `reports/BACKTEST_REPORT.md` |
| 9 | Phase 2 testnet ≥ 3 weeks | **blocked by the gate**: nothing passed Phase 1 |
| 10 | Phase 3 live | only by the owner's manual approval, after 9 |

## Running
```bash
pip install -r quant/requirements.txt
python -m pytest quant/tests -q
python -m quant.run_backtest --tf 5m && python -m quant.run_backtest --tf 1m && python -m quant.make_report
# Phase 2 (only with a GO strategy): set mode: testnet, export BINANCE_TESTNET_API_KEY / _SECRET
# (+ TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID), copy the GO report to reports/phase1-approved.json, then:
python -m quant.run_live --tf 5m --report quant/reports/phase1-approved.json
```
The runner must run on an always-on machine (a small VPS). This cloud sandbox is ephemeral.
Venue (`exchange.paper_venue`):
- `testnet` = testnet.binancefuture.com, keys in `BINANCE_TESTNET_API_KEY` / `_SECRET`.
- `demo` = Binance Demo Trading, keys in `BINANCE_DEMO_API_KEY` / `_SECRET`.

ccxt calls the futures testnet deprecated, so the code sets `disableFuturesSandboxWarning` explicitly.

Verified from this sandbox on 2026-09-26:
- testnet public candles and markets load through `make_exchange`;
- a private call reaches the testnet and is rejected only for the dummy key (`-2014 API-key format invalid`);
- Binance mainnet and `demo-fapi` answer 451 from here.

Behind a TLS-inspecting proxy, set `QUANT_CA_BUNDLE` to the proxy's CA file. Verification stays on.

## Known limits of the backtest (stated, not hidden)
- **Slippage is a model.** It is calibrated from the TS bot's measured book walks for liquid majors, not from each
  historical order book.
- **Skipped trades are not replaced.** A trade the risk layer refuses does not free the per-symbol simulator to take a
  different one. This can under-count trades, never invent them.
- **Scale-in sizing is conservative.** Layers are sized as if every layer were as far from the stop as the first one.
- **Kelly needs a real sample.** Kelly estimated from 30 trades is noise: the regime router's 5m holdout shows it,
  where +0.46R on 30 training trades sized at the full 1% and lost. Raising `kelly_min_trades` to 100+ is recommended
  before any Phase 2.

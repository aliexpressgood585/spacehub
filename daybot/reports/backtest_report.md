# daybot — backtest report

Coins: BTC, ETH, SOL, XRP, DOGE, BNB, SUI · Binance USDⓈ-M · 1m history 2024-10-06 → 2026-10-01 · in-sample 70% / out-of-sample 30% by time (split 2026-02-25) · start equity $10,000 per run.
Costs: maker 0.02% entry, taker 0.05% + slippage 0.03% on every market exit, real funding. Each setup runs ALONE, then all together.
Manual steps are simulated so the whole sample is measured: weekly stop approved at the next week, kill switch reset at the next midnight (each firing is counted below). Columns: trades, win rate, expectancy per trade in R, profit factor, max drawdown, longest losing run, P&L, t-stat of the mean R.

```
                     n    win      exp     PF  maxDD lossrun         P&L      t
S1 all              90  37.8%  +0.042R   1.08   5.9%   10       +135$  +0.37
S1 in-sample        72  34.7%  -0.007R   0.92   5.9%   10       -105$  -0.06
S1 out-of-sample    18  50.0%  +0.240R   1.74   1.7%    5       +240$  +0.81
S1 OOS 2x slip      18  50.0%  +0.212R   1.64   1.8%    5       +213$  +0.72
   -> FAIL (18 OOS trades, PF 1.743)
   stops fired: kill switch 0, weekly -5% 0, daily -2% 0, 3-loss pause 11

S2 all              23  39.1%  -0.221R   0.56   4.0%    7       -253$  -1.18
S2 in-sample        19  42.1%  -0.187R   0.63   4.0%    7       -178$  -0.85
S2 out-of-sample     4  25.0%  -0.383R   0.21   0.8%    2        -75$  -1.19
S2 OOS 2x slip       4  25.0%  -0.410R   0.19   0.8%    2        -80$  -1.28
   -> FAIL (4 OOS trades, PF 0.214)
   stops fired: kill switch 0, weekly -5% 0, daily -2% 0, 3-loss pause 2

S3 all            1948  35.6%  -0.099R   0.62  62.5%   12      -6229$  -7.57
S3 in-sample      1459  36.1%  -0.101R   0.62  52.3%   12      -5229$  -6.63
S3 out-of-sample   489  34.4%  -0.095R   0.62  10.3%   12      -1000$  -3.64
S3 OOS 2x slip     477  32.5%  -0.118R   0.56   9.9%   12       -973$  -4.41
   -> FAIL (489 OOS trades, PF 0.62)
   stops fired: kill switch 10, weekly -5% 0, daily -2% 0, 3-loss pause 264

S4 all             642  34.3%  -0.042R   0.89  14.8%   16      -1342$  -1.07
S4 in-sample       489  35.4%  -0.014R   0.96  12.9%   16       -414$  -0.31
S4 out-of-sample   153  30.7%  -0.131R   0.67  11.2%   11       -927$  -1.86
S4 OOS 2x slip     153  30.7%  -0.160R   0.62  11.9%   11      -1039$  -2.27
   -> FAIL (153 OOS trades, PF 0.668)
   stops fired: kill switch 2, weekly -5% 0, daily -2% 0, 3-loss pause 88

S5 all               3  66.7%  +0.278R   4.82   0.1%    1        +42$  +1.12
S5 in-sample         3  66.7%  +0.278R   4.82   0.1%    1        +42$  +1.12
S5 out-of-sample     0 trades
S5 OOS 2x slip       0 trades
   -> FAIL (0 OOS trades, PF 0)
   stops fired: kill switch 0, weekly -5% 0, daily -2% 0, 3-loss pause 0

S6 all             380  33.9%  -0.008R   0.97  10.3%   15       -212$  -0.16
S6 in-sample       292  34.2%  +0.014R   1.03   6.7%   15       +169$  +0.24
S6 out-of-sample    88  33.0%  -0.084R   0.79   8.4%   12       -381$  -0.81
S6 OOS 2x slip      88  33.0%  -0.102R   0.76   8.3%   12       -443$  -0.99
   -> FAIL (88 OOS trades, PF 0.792)
   stops fired: kill switch 1, weekly -5% 0, daily -2% 0, 3-loss pause 55

ALL all            2053  35.1%  -0.081R   0.73  58.1%   19      -5698$  -5.05
ALL in-sample      1542  35.8%  -0.076R   0.75  45.2%   19      -4524$  -4.06
ALL out-of-sample   511  33.1%  -0.094R   0.67  13.7%   12      -1174$  -3.12
ALL OOS 2x slip     509  31.4%  -0.124R   0.59  13.8%   12      -1248$  -4.16
   stops fired: kill switch 9, weekly -5% 0, daily -2% 1, 3-loss pause 268

```

Gate (OOS PF > 1.3 and OOS trades >= 300): **0 of 6 pass** — none; the bot will not trade any setup.

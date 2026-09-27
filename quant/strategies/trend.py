"""F. Daily trend following in the spirit of Andreas Clenow ("Following the Trend", "Stocks on the Move").
Independent of CHAN: its own universe, its own capital sleeve, its own risk limits. Pure functions on daily arrays.

Universe (point in time, survivorship-free): on the first day of each month, the `top_n` USDT perpetuals by mean
quote volume over the previous 30 days, among those with >= `min_history` days of data by then. Delisted coins are
included for as long as they traded; a position whose coin stops trading is closed at its last close.
Two entry families (config `trend.variant`):
  breakout  long when MA(fast) > MA(slow) and the close is the highest close of `breakout` days; short mirrored.
  momentum  score = annualised exponential-regression slope x R^2 over `mom_window` days; hold the top N longs
            (score > 0, close above MA(slow)) and, if shorts are on, the bottom N (score < 0, close below MA(slow)).
Regime: no NEW longs while BTC's close is below its `regime_ma`-day average.
Exit: trailing stop `stop_atr` x ATR from the best close since entry (an exchange-side stop), checked on each daily
bar; momentum positions are also sold at the weekly rebalance when their rank falls below 2N (hold buffer).
Sizing: volatility parity — units = risk_factor x sleeve equity / ATR, i.e. every position moves the sleeve by the
same amount on an average day.
WHY IT SHOULD WORK: persistent trends across a broad universe (time-series and cross-sectional momentum are the most
replicated effects in futures); low turnover keeps costs a small fraction of the move.
WHEN IT FAILS: choppy years whipsaw breakouts (the stop pays repeatedly); crowded momentum crashes at reversals.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

DENY = {"TSLA", "AAPL", "NVDA", "MSTR", "AMZN", "GOOGL", "META", "MSFT", "SPY", "QQQ", "COIN", "HOOD", "CRCL",
        "XAU", "XAG", "PAXG", "XAUT", "USDE", "USD1", "PYUSD", "DAI", "EUR", "GBP"}


def sma(x: np.ndarray, n: int) -> np.ndarray:
    return pd.DataFrame(x).rolling(n, min_periods=n).mean().to_numpy()


def atr(h, l, c, n: int = 20) -> np.ndarray:
    pc = np.vstack([np.full((1, c.shape[1]), np.nan), c[:-1]])
    tr = np.fmax(h - l, np.fmax(np.abs(h - pc), np.abs(l - pc)))
    return pd.DataFrame(tr).rolling(n, min_periods=n).mean().to_numpy()


def exp_reg_score(c: np.ndarray, n: int = 90) -> np.ndarray:
    """Annualised exponential regression slope x R^2 of log price over the last n days (T x N arrays)."""
    y = np.log(c)
    T, N = y.shape
    out = np.full((T, N), np.nan)
    x = np.arange(n, dtype=float)
    xm, sxx = x.mean(), ((x - x.mean()) ** 2).sum()
    for t in range(n - 1, T):
        w = y[t - n + 1:t + 1]
        ok = np.isfinite(w).all(axis=0)
        if not ok.any():
            continue
        ww = w[:, ok]
        ym = ww.mean(axis=0)
        b = ((x - xm)[:, None] * (ww - ym)).sum(axis=0) / sxx
        res = ww - (ym + b * (x - xm)[:, None])
        sst = ((ww - ym) ** 2).sum(axis=0)
        with np.errstate(invalid="ignore", divide="ignore"):
            r2 = np.where(sst > 0, 1 - (res ** 2).sum(axis=0) / sst, 0.0)
        out[t, ok] = (np.exp(b * 365) - 1) * r2
    return out


def universe(qv: np.ndarray, avail: np.ndarray, days: np.ndarray, top_n: int, min_history: int) -> np.ndarray:
    """Boolean T x N membership, recomputed on the first day of each month from the PREVIOUS 30 days only."""
    T, N = qv.shape
    mem = np.zeros((T, N), bool)
    hist = np.cumsum(avail, axis=0)
    month = pd.to_datetime(days, unit="ms").to_period("M").asi8
    cur = np.zeros(N, bool)
    for t in range(T):
        if t == 0 or month[t] != month[t - 1]:
            a = max(0, t - 30)
            with np.errstate(all="ignore"), __import__("warnings").catch_warnings():
                __import__("warnings").simplefilter("ignore")
                vol = np.nanmean(np.where(avail[a:t], qv[a:t], np.nan), axis=0) if t > a else np.full(N, np.nan)
            elig = (hist[t - 1] >= min_history if t > 0 else np.zeros(N, bool)) & avail[t] & np.isfinite(vol)
            cur = np.zeros(N, bool)
            idx = np.flatnonzero(elig)
            cur[idx[np.argsort(-vol[idx])[:top_n]]] = True
        mem[t] = cur & avail[t]
    return mem


def breakout_signal(c, fast: int, slow: int, look: int) -> np.ndarray:
    mf, ms = sma(c, fast), sma(c, slow)
    hi = pd.DataFrame(c).rolling(look, min_periods=look).max().to_numpy()
    lo = pd.DataFrame(c).rolling(look, min_periods=look).min().to_numpy()
    return np.where((mf > ms) & (c >= hi), 1, np.where((mf < ms) & (c <= lo), -1, 0)).astype(np.int8)

"""Statistical tests from Chan ch. 2: is a series mean-reverting, and how fast?

- ADF: rejects a unit root (random walk) -> the level is stationary.
- Hurst exponent: H < 0.5 mean-reverting, ~0.5 random walk, > 0.5 trending.
- Half-life of an Ornstein-Uhlenbeck fit: dy = lambda * y_{t-1} + mu  ->  halflife = -ln 2 / lambda.
  Chan uses it to set the look-back of the moving mean / std, which removes a free parameter.

`rolling_stats` re-estimates on a fixed schedule from a trailing window of CLOSED bars only: a value stamped at
bar i was computed from bars [i-window+1 .. i] and is used for decisions taken at the close of bar i or later.
"""
from __future__ import annotations

import math
import warnings

import numpy as np
import pandas as pd
from statsmodels.tsa.stattools import adfuller


def adf_pvalue(y: np.ndarray, maxlag: int = 1) -> float:
    y = np.asarray(y, float)
    if len(y) < 30 or not np.all(np.isfinite(y)) or np.std(y) == 0:
        return float("nan")
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        return float(adfuller(y, maxlag=maxlag, regression="c", autolag=None)[1])


def hurst(y: np.ndarray, max_lag: int = 100) -> float:
    """Variance-of-lagged-differences estimator: std(y[t+k]-y[t]) ~ k^H."""
    y = np.asarray(y, float)
    lags = np.unique(np.logspace(0.3, math.log10(max(3, min(max_lag, len(y) // 4))), 20).astype(int))
    lags = lags[lags >= 2]
    tau = np.array([np.std(y[k:] - y[:-k]) for k in lags])
    ok = tau > 0
    if ok.sum() < 3:
        return float("nan")
    return float(np.polyfit(np.log(lags[ok]), np.log(tau[ok]), 1)[0])


def half_life(y: np.ndarray) -> float:
    """OU half-life in bars; inf when the fitted lambda is not negative (no mean reversion)."""
    y = np.asarray(y, float)
    if len(y) < 30:
        return float("nan")
    lag, dy = y[:-1], np.diff(y)
    x = lag - lag.mean()
    denom = float(x @ x)
    if denom == 0:
        return float("nan")
    lam = float(x @ (dy - dy.mean())) / denom
    return -math.log(2) / lam if lam < 0 else float("inf")


def realized_vol(logp: np.ndarray) -> float:
    r = np.diff(logp)
    return float(np.std(r)) if len(r) > 1 else float("nan")


def rolling_stats(logp: np.ndarray, window: int, every: int, which=("adf", "hurst", "hl", "vol")) -> dict[str, np.ndarray]:
    """Arrays aligned to bars, NaN until the first full window. Value at i = estimate from bars <= i."""
    n = len(logp)
    out = {k: np.full(n, np.nan) for k in which}
    last = None
    for i in range(window - 1, n):
        if last is None or i - last >= every:
            w = logp[i - window + 1 : i + 1]
            vals = {}
            if "adf" in which:
                vals["adf"] = adf_pvalue(w)
            if "hurst" in which:
                vals["hurst"] = hurst(w)
            if "hl" in which:
                vals["hl"] = half_life(w)
            if "vol" in which:
                vals["vol"] = realized_vol(w)
            last, cur = i, vals
        for k in which:
            out[k][i] = cur[k]
    return out


def rolling_mean_std(x: np.ndarray, lookback: np.ndarray | int) -> tuple[np.ndarray, np.ndarray]:
    """Trailing mean / std over bars [i-L+1 .. i] with a per-bar look-back L (from the half-life). Uses prefix sums,
    so a variable window costs O(n)."""
    x = np.asarray(x, float)
    n = len(x)
    L = np.full(n, int(lookback)) if np.isscalar(lookback) else np.asarray(lookback)
    cs = np.concatenate([[0.0], np.cumsum(x)])
    cs2 = np.concatenate([[0.0], np.cumsum(x * x)])
    mean = np.full(n, np.nan)
    std = np.full(n, np.nan)
    idx = np.arange(n)
    ok = np.isfinite(L) & (L >= 2) & (idx + 1 >= np.where(np.isfinite(L), L, 0))
    Li = np.where(ok, L, 2).astype(int)
    a = idx + 1 - Li
    s = cs[idx + 1] - cs[a]
    s2 = cs2[idx + 1] - cs2[a]
    m = s / Li
    var = np.maximum(s2 / Li - m * m, 0.0) * Li / np.maximum(Li - 1, 1)
    mean[ok] = m[ok]
    std[ok] = np.sqrt(var[ok])
    return mean, std


def atr(high: np.ndarray, low: np.ndarray, close: np.ndarray, n: int = 14) -> np.ndarray:
    prev = np.concatenate([[close[0]], close[:-1]])
    tr = np.maximum(high - low, np.maximum(np.abs(high - prev), np.abs(low - prev)))
    out = pd.Series(tr).ewm(alpha=1.0 / n, adjust=False).mean().to_numpy().copy()   # Wilder smoothing
    out[: n - 1] = np.nan
    return out

"""Fractionally differentiated features, fixed-width window (AFML ch. 5).

Integer differencing (returns) makes a price stationary and throws its memory away; the level keeps memory and is
not stationary. FFD with 0 < d < 1 keeps as much memory as possible while passing a unit-root test. d is chosen on
TRAINING data only (the smallest d on a grid whose ADF p-value < 0.05) and then applied unchanged.
"""
from __future__ import annotations

import numpy as np
from statsmodels.tsa.stattools import adfuller


def ffd_weights(d: float, thresh: float = 1e-4, max_len: int = 5000) -> np.ndarray:
    w = [1.0]
    k = 1
    while k < max_len:
        wk = -w[-1] * (d - k + 1) / k
        if abs(wk) < thresh:
            break
        w.append(wk)
        k += 1
    return np.array(w)          # w[0] multiplies x_t, w[k] multiplies x_{t-k}


def ffd(x: np.ndarray, d: float, thresh: float = 1e-4, max_len: int = 5000) -> np.ndarray:
    w = ffd_weights(d, thresh, max_len)
    L = len(w)
    out = np.full(len(x), np.nan)
    if len(x) >= L:
        out[L - 1:] = np.convolve(x, w, mode="valid")   # convolve flips w: sum_k w[k] x[t-k]
    return out


def min_d(x: np.ndarray, grid=np.round(np.arange(0.1, 1.01, 0.1), 2), p=0.05, thresh=1e-4, max_len=2000, sample=60000) -> float:
    x = x[-sample:] if len(x) > sample else x
    for d in grid:
        y = ffd(x, float(d), thresh, max_len)
        y = y[np.isfinite(y)]
        if len(y) > 200 and adfuller(y[::max(1, len(y) // 5000)], maxlag=1, regression="c", autolag=None, result_object=False)[1] < p:
            return float(d)
    return 1.0

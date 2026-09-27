"""Selection-bias statistics: Probabilistic / Deflated Sharpe ratio and the Probability of Backtest Overfitting.

DSR (Bailey & Lopez de Prado 2014): probability that the true Sharpe exceeds the Sharpe the BEST of N unskilled
trials would show by luck, given the variance of the trial Sharpes, the sample length, skew and kurtosis.
PBO via CSCV (Bailey, Borwein, Lopez de Prado, Zhu 2015): split the T x N matrix of variant returns into S blocks;
for every half/half combination pick the in-sample best variant and record its out-of-sample rank; PBO is the share
of combinations where the IS winner lands in the bottom half OOS. 0.5 = selection is no better than a coin.
"""
from __future__ import annotations

import math
from itertools import combinations

import numpy as np
from scipy.stats import kurtosis, norm, skew


def sr(r: np.ndarray) -> float:
    r = np.asarray(r, float)
    return float(r.mean() / r.std(ddof=1)) if len(r) > 2 and r.std(ddof=1) > 0 else 0.0


def psr(r: np.ndarray, sr_star: float = 0.0) -> float:
    r = np.asarray(r, float)
    n = len(r)
    if n < 10:
        return float("nan")
    s = sr(r)
    den = math.sqrt(max(1e-12, 1 - skew(r) * s + (kurtosis(r, fisher=False) - 1) / 4 * s * s))
    return float(norm.cdf((s - sr_star) * math.sqrt(n - 1) / den))


def expected_max_sr(trial_srs: list[float], n_trials: int | None = None) -> float:
    N = max(2, n_trials or len(trial_srs))
    v = float(np.var(trial_srs, ddof=1)) if len(trial_srs) > 1 else 0.0
    g = 0.5772156649
    return math.sqrt(max(v, 0.0)) * ((1 - g) * norm.ppf(1 - 1 / N) + g * norm.ppf(1 - 1 / (N * math.e)))


def dsr(r: np.ndarray, trial_srs: list[float], n_trials: int | None = None) -> float:
    return psr(r, expected_max_sr(trial_srs, n_trials))


def pbo(M: np.ndarray, S: int = 16) -> dict:
    """M: T x N returns (rows = time, columns = variants)."""
    T, N = M.shape
    S = min(S, T // 2 * 2)
    blocks = np.array_split(np.arange(T), S)
    logits = []
    for comb in combinations(range(S), S // 2):
        tr = np.concatenate([blocks[b] for b in comb])
        te = np.concatenate([blocks[b] for b in range(S) if b not in comb])
        is_sr = np.array([sr(M[tr, j]) for j in range(N)])
        oos_sr = np.array([sr(M[te, j]) for j in range(N)])
        best = int(np.argmax(is_sr))
        rank = (oos_sr < oos_sr[best]).sum() + 0.5 * ((oos_sr == oos_sr[best]).sum() - 1)
        w = (rank + 1) / (N + 1)
        logits.append(math.log(w / (1 - w)))
    logits = np.array(logits)
    return {"pbo": float((logits <= 0).mean()), "n_combinations": len(logits), "median_logit": float(np.median(logits))}

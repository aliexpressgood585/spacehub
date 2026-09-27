"""Activity-sampled bars (AFML ch. 2): volume and dollar bars built from 1m klines.

A time bar samples the clock; a dollar bar closes each time a fixed amount of money has traded, so it samples more
often when information arrives and less in dead hours. The textbook claim is that returns sampled this way are
closer to i.i.d. normal. With only 1m klines (no tick archive) a bar can close no finer than one minute and a 1m
candle is never split: this is an approximation of true dollar bars, stated as such.
"""
from __future__ import annotations

import numpy as np
from scipy.stats import jarque_bera

from ..data.loader import Bars


def time_bars(b: Bars, k: int, tf: str) -> Bars:
    n = len(b) // k * k
    r = lambda x: x[:n].reshape(-1, k)
    return Bars(b.symbol, tf, r(b.t)[:, 0], r(b.open)[:, 0], r(b.high).max(1), r(b.low).min(1), r(b.close)[:, -1], r(b.volume).sum(1))


def activity_bars(b: Bars, measure: np.ndarray, n_target: int, tf_label: str) -> Bars:
    """Close a bar each time cumulative `measure` crosses a multiple of total/n_target."""
    thr = measure.sum() / max(1, n_target)
    cum = np.cumsum(measure)
    ids = np.floor((cum - 1e-12) / thr).astype(np.int64)
    ends = np.flatnonzero(np.diff(ids) > 0)
    ends = np.append(ends, len(measure) - 1)
    starts = np.concatenate([[0], ends[:-1] + 1])
    mx = np.maximum.reduceat(b.high, starts)
    mn = np.minimum.reduceat(b.low, starts)
    vol = np.add.reduceat(b.volume, starts)
    return Bars(b.symbol, tf_label, b.t[starts], b.open[starts], mx, mn, b.close[ends], vol)


def return_properties(b: Bars) -> dict:
    r = np.diff(np.log(b.close))
    r = r[np.isfinite(r)]
    ac = float(np.corrcoef(r[:-1], r[1:])[0, 1]) if len(r) > 3 else float("nan")
    jb = jarque_bera(r)
    return {"n_bars": int(len(b)), "jarque_bera": float(jb.statistic), "lag1_autocorr": ac,
            "kurtosis_excess": float(((r - r.mean()) ** 4).mean() / r.var() ** 2 - 3)}

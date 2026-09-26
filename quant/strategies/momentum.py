"""B. Time-series momentum and breakouts (Chan ch. 6).

WHY IT SHOULD WORK: when a market's past return over L bars positively predicts its return over the next H bars
(slow diffusion of information, forced flows — liquidations, funding-driven de-leveraging, stop cascades), trading
in the direction of the recent move captures it. Chan's rule: trade it only where the look-back/holding pair shows
a SIGNIFICANT correlation on recent data — here a t-test of corr(past L, next H) on non-overlapping samples from a
trailing window that has fully closed (no future bar enters the test).
WHEN IT FAILS: at 1-5m the autocorrelation is tiny and flips sign between regimes; the significance gate is
itself estimated with noise, so it switches on after a run of luck and off after the regime ended. Momentum pays
through the rare large move and bleeds costs through many small whipsaws — costs decide it at short horizons.
"""
from __future__ import annotations

import numpy as np

from ..config import per_tf
from .base import Signals
from .stats import atr


def significance(logp: np.ndarray, L: int, H: int, window: int, every: int) -> np.ndarray:
    """t-stat of corr(r_past(L), r_future(H)), stamped at bar i from samples whose future leg ended at or before i."""
    n = len(logp)
    t = np.full(n, np.nan)
    cur = np.nan
    last = None
    for i in range(window - 1, n):
        if last is None or i - last >= every:
            ks = np.arange(i - window + 1 + L, i - H + 1, H)   # sample anchors; future leg [k, k+H] <= i
            if len(ks) >= 20:
                x = logp[ks] - logp[ks - L]
                y = logp[ks + H] - logp[ks]
                if np.std(x) > 0 and np.std(y) > 0:
                    r = float(np.corrcoef(x, y)[0, 1])
                    cur = r * np.sqrt((len(ks) - 2) / max(1e-12, 1 - r * r))
                else:
                    cur = np.nan
            last = i
        t[i] = cur
    return t


def signals(bars, params: dict, cfg: dict, tf: str, sig_cache: dict | None = None) -> Signals:
    c = cfg["strategies"]["momentum"]
    L, H, kind = int(params["lookback"]), int(params["hold"]), params["kind"]
    close, high, low = bars.close, bars.high, bars.low
    n = len(close)
    logp = np.log(close)
    key = (L, H)
    if sig_cache is not None and key in sig_cache:
        tsig = sig_cache[key]
    else:
        tsig = significance(logp, L, H, int(per_tf(c["sig_window"], tf)), int(per_tf(c["recompute_every"], tf)))
        if sig_cache is not None:
            sig_cache[key] = tsig
    gate = np.nan_to_num(tsig) >= c["t_min"]
    a = atr(high, low, close, 14)
    s = Signals.empty(n)
    if kind == "tsmom":
        r = np.full(n, np.nan)
        r[L:] = logp[L:] - logp[:-L]
        vol = np.full(n, np.nan)
        dr = np.diff(logp, prepend=logp[0])
        import pandas as pd
        vol = pd.Series(dr).rolling(max(L * 4, 50)).std().to_numpy()
        zs = r / (vol * np.sqrt(L))
        side = np.where(zs > 1, 1, np.where(zs < -1, -1, 0))
    else:  # breakout of the prior L-bar range, decided on the close
        import pandas as pd
        hh = pd.Series(high).rolling(L).max().shift(1).to_numpy()
        ll = pd.Series(low).rolling(L).min().shift(1).to_numpy()
        side = np.where(close > hh, 1, np.where(close < ll, -1, 0))
    ok = gate & np.isfinite(a)
    s.side = np.where(ok, side, 0).astype(np.int8)
    s.stop_long = close - c["stop_atr"] * a
    s.stop_short = close + c["stop_atr"] * a
    s.max_hold = np.full(n, H, np.int64)
    s.info = {"t_sig": tsig, "gate": gate, "active_frac": float(np.mean(gate))}
    return s


def grid(cfg: dict) -> list[dict]:
    g = cfg["strategies"]["momentum"]["grid"]
    return [dict(kind=k, lookback=L, hold=H) for k in g["kind"] for L in g["lookback"] for H in g["hold"]]

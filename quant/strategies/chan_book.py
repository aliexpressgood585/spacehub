"""Book-style experiments inspired by Ernest Chan, *Algorithmic Trading* (2013) — NOT a reproduction of his code.

Two plain rules, evaluated as candidates next to the live regime router (strategies/regime.py + MR + MOM):

DON — channel breakout (ch. 6/7 time-series momentum, turtle-style):
  long when the close breaks ABOVE the high of the previous N bars, short when it breaks BELOW their low;
  exit on an ATR stop (k x ATR(14) from the signal close) or on the OPPOSITE break of a shorter M-bar channel
  (M = N/2: a long leaves when the close falls below the prior M-bar low); a 4N-bar time cap as a safety net.
  WHY: forced flows (liquidations, stop cascades) make a range break continue more often than chance.
  WHEN IT FAILS: at short bars most breaks are noise; each whipsaw pays a full round trip.

ZMR — rolling z-score mean reversion (ch. 2-3), WITHOUT the ADF/Hurst gate:
  z = (log price - rolling mean W) / rolling std W; long at z <= -2, short at z >= +2, exit at z = 0,
  stop at the mean -/+ s x std (fixed at entry), time cap W bars.
  "Only when the training data supports it": the walk-forward picks the parameter set on training data only, and
  the half-Kelly layer sizes a component to 0 when its own training record is negative.
  WHEN IT FAILS: single-coin prices trend; the "mean" walks away and the stop pays for it.

Every signal is decided on the CLOSE of bar i and filled at the OPEN of i+1 by backtest/engine.py (fees, spread/
slippage proxy and archived funding included) — the same engine the router is judged on.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .base import Signals
from .stats import atr

GRID = {
    "5m": {"N": [48, 144, 288], "W": [48, 144, 288]},     # 4h / 12h / 24h of 5m bars
    "1h": {"N": [24, 72, 168], "W": [24, 72, 168]},       # 1d / 3d / 7d of 1h bars
}


def don_grid(tf: str) -> list[dict]:
    return [dict(N=n, stop_atr=k) for n in GRID[tf]["N"] for k in (2.0, 3.0)]


def zmr_grid(tf: str) -> list[dict]:
    return [dict(W=w, entry_z=2.0, exit_z=0.0, stop_z=s) for w in GRID[tf]["W"] for s in (3.0, 4.0)]


def don_signals(bars, p: dict) -> Signals:
    N, M = int(p["N"]), max(2, int(p["N"]) // 2)
    c, h, l = bars.close, bars.high, bars.low
    n = len(c)
    hh = pd.Series(h).rolling(N).max().shift(1).to_numpy()
    ll = pd.Series(l).rolling(N).min().shift(1).to_numpy()
    xh = pd.Series(h).rolling(M).max().shift(1).to_numpy()
    xl = pd.Series(l).rolling(M).min().shift(1).to_numpy()
    a = atr(h, l, c, 14)
    ok = np.isfinite(a) & np.isfinite(hh) & np.isfinite(ll)
    s = Signals.empty(n)
    s.side = np.where(ok & (c > hh), 1, np.where(ok & (c < ll), -1, 0)).astype(np.int8)
    s.exit_long = np.isfinite(xl) & (c < xl)
    s.exit_short = np.isfinite(xh) & (c > xh)
    s.stop_long = c - p["stop_atr"] * a
    s.stop_short = c + p["stop_atr"] * a
    s.max_hold = np.full(n, 4 * N, np.int64)
    s.info = {"active_frac": 1.0}
    return s


def zmr_signals(bars, p: dict) -> Signals:
    W = int(p["W"])
    lp = np.log(bars.close)
    n = len(lp)
    r = pd.Series(lp).rolling(W)
    mean, std = r.mean().to_numpy(), r.std(ddof=0).to_numpy()
    z = (lp - mean) / std
    ok = np.isfinite(z) & (std > 0)
    ez, xz, sz = p["entry_z"], p["exit_z"], p["stop_z"]
    s = Signals.empty(n)
    s.side = np.where(ok & (z <= -ez), 1, np.where(ok & (z >= ez), -1, 0)).astype(np.int8)
    s.exit_long = np.isfinite(z) & (z >= -xz)
    s.exit_short = np.isfinite(z) & (z <= xz)
    s.stop_long = np.exp(mean - sz * std)
    s.stop_short = np.exp(mean + sz * std)
    s.max_hold = np.full(n, W, np.int64)
    s.info = {"z": z, "active_frac": 1.0}
    return s

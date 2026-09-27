"""E. Extreme funding: take the side that RECEIVES funding when the last settled rate is extreme.

WHY IT SHOULD WORK: a large positive funding rate means longs are crowded and paying to stay in; crowded positioning
tends to unwind (a squeeze of the crowded side), and the position collects the funding while it waits. The rate
used at bar i is the last settlement at or before the close of bar i (known). Entry at the next open, a volatility
stop (ATR), out after a fixed hold. Funding paid/received is charged from the archive in the engine, sign-correct.
WHEN IT FAILS: extreme funding usually sits on top of a strong trend; fading it early means standing in front of the
trend, and the funding collected (0.03-0.1% per 8h) is small next to a trend day's move.
"""
from __future__ import annotations

import numpy as np

from ..data.loader import TF_MS, Bars, Funding
from .base import Signals
from .stats import atr


def signals(b: Bars, f: Funding, params: dict) -> Signals:
    n = len(b.close)
    s = Signals.empty(n)
    if not len(f.t):
        return s
    close_t = b.t + TF_MS[b.tf]
    k = np.searchsorted(f.t, close_t, side="right") - 1
    rate = np.where(k >= 0, f.rate[np.maximum(k, 0)], 0.0)
    fresh = np.concatenate([[False], np.diff(k) > 0])            # act once per new settlement, not every bar after it
    a = atr(b.high, b.low, b.close, 14)
    thr = params["threshold"]
    side = np.where(rate >= thr, -1, np.where(rate <= -thr, 1, 0))
    s.side = np.where(fresh & np.isfinite(a), side, 0).astype(np.int8)
    s.stop_long = b.close - params["stop_atr"] * a
    s.stop_short = b.close + params["stop_atr"] * a
    s.max_hold = np.full(n, max(1, int(params["hold_h"] * 3_600_000 // TF_MS[b.tf])), np.int64)
    s.info = {"rate": rate, "active_frac": float((s.side != 0).mean())}
    return s


def grid(cfg: dict) -> list[dict]:
    g = cfg["funding"]["grid"]
    return [dict(threshold=t, hold_h=h, stop_atr=s) for t in g["threshold"] for h in g["hold_h"] for s in g["stop_atr"]]

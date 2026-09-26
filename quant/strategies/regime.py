"""C. Regime filter (Chan ch. 1/5 spirit: know which kind of market you are in before choosing a strategy).

Labels, re-estimated on a schedule from a trailing window of closed bars:
  HIGH_VOL      realised vol above its own trailing 90th percentile  -> stay FLAT (costs and gaps dominate)
  MEAN_REVERT   Hurst < 0.45                                          -> route to mean reversion
  TREND         Hurst > 0.55                                          -> route to momentum
  NEUTRAL       otherwise                                             -> FLAT
WHY: each strategy's edge exists only in its regime; trading MR in a trend (or momentum in a range) is how both lose.
WHEN IT FAILS: the Hurst estimate on a few days of bars is noisy (its standard error is ~0.05-0.1), so labels
lag the regime and flip on noise; a regime is only known after it has started. The filter reduces exposure — it
cannot create an edge the routed strategy does not have.
"""
from __future__ import annotations

import numpy as np

from ..config import per_tf
from .stats import rolling_stats

NEUTRAL, MEAN_REVERT, TREND, HIGH_VOL = 0, 1, 2, 3


def regimes(close: np.ndarray, cfg: dict, tf: str) -> np.ndarray:
    c = cfg["strategies"]["regime"]
    W, every = int(per_tf(c["window"], tf)), int(per_tf(c["recompute_every"], tf))
    st = rolling_stats(np.log(close), W, every, ("hurst", "vol"))
    h, v = st["hurst"], st["vol"]
    out = np.zeros(len(close), np.int8)
    # vol percentile vs the PAST distinct vol estimates only (trailing 90 re-estimates)
    hist: list[float] = []
    pct = np.full(len(close), np.nan)
    last = np.nan
    for i in range(len(close)):
        if np.isfinite(v[i]) and v[i] != last:
            hist.append(v[i])
            last = v[i]
        if len(hist) >= 20 and np.isfinite(v[i]):
            past = np.array(hist[-91:-1])
            pct[i] = float((past < v[i]).mean())
    out[np.nan_to_num(h, nan=0.5) < c["hurst_mr"]] = MEAN_REVERT
    out[np.nan_to_num(h, nan=0.5) > c["hurst_trend"]] = TREND
    out[np.nan_to_num(pct) > c["vol_pct_high"]] = HIGH_VOL
    out[~np.isfinite(h)] = NEUTRAL
    return out

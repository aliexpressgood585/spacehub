"""A. Mean reversion on a single price series (Chan ch. 2-4).

WHY IT SHOULD WORK: if a series is stationary (ADF rejects a unit root) or anti-persistent (Hurst < 0.5), a
deviation from its mean is more likely to shrink than grow; the OU half-life says how fast, so it sets the
look-back of the mean/std instead of a tuned constant. Linear scaling-in (buy more as the deviation grows) is the
textbook way to trade it without guessing the extreme.
WHEN IT FAILS: crypto PRICES are almost never stationary; the test passes by chance on a short window and the
"mean" then trends away (regime change) — the stop and the time limit (a few half-lives) exist for exactly that.
Short half-lives mean small targets, so costs (fees + spread) eat the edge at 1-5m; Chan's durable mean reversion
lives in spreads/pairs (cointegration), not in one coin's price.
"""
from __future__ import annotations

import numpy as np

from ..config import per_tf
from .base import Signals
from .stats import rolling_mean_std, rolling_stats

LAYER_STEP = 0.5


def stat_arrays(close: np.ndarray, cfg: dict, tf: str) -> dict[str, np.ndarray]:
    c = cfg["strategies"]["mean_reversion"]
    return rolling_stats(np.log(close), int(per_tf(c["stat_window"], tf)), int(per_tf(c["recompute_every"], tf)), ("adf", "hurst", "hl"))


def signals(bars, params: dict, cfg: dict, tf: str, stats: dict | None = None) -> Signals:
    c = cfg["strategies"]["mean_reversion"]
    close = bars.close
    n = len(close)
    st = stats if stats is not None else stat_arrays(close, cfg, tf)
    logp = np.log(close)
    hl = st["hl"]
    gate = (st["adf"] < c["adf_pvalue"]) & (st["hurst"] < c["hurst_max"]) & (hl >= c["halflife_min"]) & (hl <= c["halflife_max"])
    L = np.where(np.isfinite(hl), np.clip(np.round(hl), c["halflife_min"], c["halflife_max"]), np.nan)
    mean, std = rolling_mean_std(logp, L)
    z = (logp - mean) / std
    ez, xz, sz = params["entry_z"], params["exit_z"], params["stop_z"]
    ok = gate & np.isfinite(z) & (std > 0)
    s = Signals.empty(n)
    s.side = np.where(ok & (z <= -ez), 1, np.where(ok & (z >= ez), -1, 0)).astype(np.int8)
    s.exit_long = np.isfinite(z) & (z >= -xz)
    s.exit_short = np.isfinite(z) & (z <= xz)
    s.stop_long = np.exp(mean - sz * std)
    s.stop_short = np.exp(mean + sz * std)
    s.max_hold = np.where(np.isfinite(hl), np.ceil(c["max_hold_halflives"] * np.clip(hl, 1, c["halflife_max"])), 0).astype(np.int64)
    if params.get("scale_in"):
        s.n_layers = 3
        az = np.abs(np.nan_to_num(z))
        s.units = (1 + (az >= ez + LAYER_STEP) + (az >= ez + 2 * LAYER_STEP)).astype(np.int8)
    s.info = {"z": z, "gate": gate, "halflife": hl, "active_frac": float(np.nanmean(gate[np.isfinite(hl)])) if np.isfinite(hl).any() else 0.0}
    return s


def grid(cfg: dict) -> list[dict]:
    g = cfg["strategies"]["mean_reversion"]["grid"]
    return [dict(entry_z=e, exit_z=x, stop_z=s, scale_in=si) for e in g["entry_z"] for x in g["exit_z"] for s in g["stop_z"]
            for si in g["scale_in"] if x < e]

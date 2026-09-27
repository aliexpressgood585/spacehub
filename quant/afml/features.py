"""Features for the meta-model, each known at the CLOSE of the signal bar (no look-ahead).

volatility (EWMA, its trailing percentile, ATR/price, bar range), regime state (Hurst, ADF p, OU half-life, the
router's leg), deviation (the MR z-score, or the price z vs its 144-bar mean for momentum), the momentum
significance t, activity (volume vs its 1-day mean), order flow (taker-buy imbalance from the klines' own
taker column, 12 bars), funding (last settled rate), recent returns (1h/4h/1d), a fractionally differentiated
log price (memory-preserving, stationary; d chosen on the training period only), time of day and weekday.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from ..data.loader import Bars, Funding, archive_name
from ..strategies.stats import atr
from .fracdiff import ffd
from .labeling import ewm_vol

FEATURES = ["side", "leg", "vol", "vol_pct", "atr_pct", "range_pct", "hurst", "adf_p", "halflife", "z", "mom_t",
            "vol_ratio", "taker_imb", "funding", "ret_12", "ret_48", "ret_288", "ffd_z", "hour_sin", "hour_cos", "dow"]


def load_taker(data_dir, symbol: str, tf: str, t: np.ndarray) -> np.ndarray:
    """Taker-buy share of volume per bar (kline column 9 / column 5), aligned to `t`; NaN where missing."""
    p = Path(data_dir) / f"{archive_name(symbol)}-{tf}.csv"
    df = pd.read_csv(p, header=None, usecols=[0, 5, 9], names=["t", "v", "tb"], dtype={"t": "int64"}, on_bad_lines="skip")
    df = df.drop_duplicates("t").set_index("t")
    s = (df["tb"] / df["v"].replace(0, np.nan)).reindex(t)
    return s.to_numpy(float)


def bar_features(b: Bars, st: dict, z_mr: np.ndarray, mom_t: np.ndarray, taker_share: np.ndarray | None,
                 funding: Funding | None, ffd_d: float) -> dict[str, np.ndarray]:
    c, n = b.close, len(b)
    logp = np.log(c)
    f: dict[str, np.ndarray] = {}
    v = ewm_vol(c, 100)
    f["vol"] = v
    f["vol_pct"] = pd.Series(v).rolling(2016, min_periods=288).rank(pct=True).to_numpy()
    f["atr_pct"] = atr(b.high, b.low, c, 14) / c
    f["range_pct"] = (b.high - b.low) / c
    f["hurst"], f["adf_p"], f["halflife"] = st["hurst"], st["adf"], np.minimum(st["hl"], 1000)
    m144 = pd.Series(logp).rolling(144).mean().to_numpy()
    s144 = pd.Series(logp).rolling(144).std().to_numpy()
    f["z_mr"], f["z_mom"] = z_mr, (logp - m144) / s144
    f["mom_t"] = mom_t
    f["vol_ratio"] = b.volume / pd.Series(b.volume).rolling(288, min_periods=48).mean().to_numpy()
    if taker_share is not None:
        f["taker_imb"] = pd.Series(2 * taker_share - 1).rolling(12, min_periods=6).mean().to_numpy()
    else:
        f["taker_imb"] = np.full(n, np.nan)
    if funding is not None and len(funding.t):
        k = np.searchsorted(funding.t, b.t, side="right") - 1
        f["funding"] = np.where(k >= 0, funding.rate[np.maximum(k, 0)], np.nan)
    else:
        f["funding"] = np.full(n, np.nan)
    for L in (12, 48, 288):
        r = np.full(n, np.nan)
        r[L:] = logp[L:] - logp[:-L]
        f[f"ret_{L}"] = r
    x = ffd(logp, ffd_d, 1e-4, 2000)
    f["ffd_z"] = (x - pd.Series(x).rolling(288).mean().to_numpy()) / pd.Series(x).rolling(288).std().to_numpy()
    hrs = (b.t // 3_600_000) % 24 + ((b.t // 60_000) % 60) / 60
    f["hour_sin"], f["hour_cos"] = np.sin(2 * np.pi * hrs / 24), np.cos(2 * np.pi * hrs / 24)
    f["dow"] = ((b.t // 86_400_000) + 4) % 7          # 1970-01-01 was a Thursday -> 0 = Monday
    return f


def event_matrix(f: dict[str, np.ndarray], idx: np.ndarray, side: np.ndarray, leg: int) -> np.ndarray:
    cols = []
    for name in FEATURES:
        if name == "side":
            cols.append(side.astype(float))
        elif name == "leg":
            cols.append(np.full(len(idx), float(leg)))
        elif name == "z":
            cols.append((f["z_mr"] if leg == 0 else f["z_mom"])[idx] * side)   # signed toward the trade
        else:
            cols.append(f[name][idx])
    return np.column_stack(cols)

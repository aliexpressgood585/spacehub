"""D. Pairs / cointegration (Chan ch. 3-4) — the method Chan's mean-reversion edge actually lives in.

Every `recompute_every` bars a Johansen test runs on the trailing `window` bars of (log A, log B), closed bars only.
The pair is TRADEABLE only while the trace statistic for r = 0 exceeds its 95% critical value. The cointegrating
vector gives the hedge ratio beta (spread = log A - beta log B), and the spread's OU half-life sets the z-score
look-back, as in single-series mean reversion.
The traded instrument is a synthetic index I: I_t = I_{t-1} x (1 + rA_t - beta_t x rB_t), i.e. long 1 unit of A's
value, short beta units of B's value, re-hedged at each re-estimate. Its log follows the spread while beta is fixed.
Costs are charged on BOTH legs: fee and slippage per index unit = (1 + |beta|) x the per-leg cost (conservative
beta = the largest |beta| estimated for that pair). Funding is charged on both legs from the archive.
Intra-bar extremes are CONSERVATIVE: the index high takes A's high and B's low, the low takes A's low and B's high
(the two legs can never both be at their worst in the same instant), so stops trigger at least as often as reality.
WHEN IT FAILS: crypto pairs cointegrate for weeks and then break (a narrative decouples them); the test passes by
chance on some windows; beta drifts. The stop and the time limit are the defence.
"""
from __future__ import annotations

import numpy as np
from statsmodels.tsa.vector_ar.vecm import coint_johansen

from ..config import per_tf
from ..data.loader import Bars, Funding
from .base import Signals
from .stats import half_life, rolling_mean_std

BETA_MAX = 5.0


def align(a: Bars, b: Bars) -> tuple[Bars, Bars]:
    t = np.intersect1d(a.t, b.t)
    ia, ib = np.searchsorted(a.t, t), np.searchsorted(b.t, t)
    cut = lambda x, i: Bars(x.symbol, x.tf, x.t[i], x.open[i], x.high[i], x.low[i], x.close[i], x.volume[i])
    return cut(a, ia), cut(b, ib)


def johansen(la: np.ndarray, lb: np.ndarray) -> tuple[bool, float, float]:
    try:
        r = coint_johansen(np.column_stack([la, lb]), det_order=0, k_ar_diff=1)
    except Exception:
        return False, np.nan, np.nan
    ok = bool(r.lr1[0] > r.cvt[0, 1])
    v = r.evec[:, 0]
    if abs(v[0]) < 1e-12:
        return False, np.nan, np.nan
    beta = float(-v[1] / v[0])
    return ok, beta, float(r.lr1[0])


def rolling_coint(a: Bars, b: Bars, cfg: dict, tf: str) -> dict[str, np.ndarray]:
    c = cfg["pairs"]
    W, every = int(per_tf(c["window"], tf)), int(per_tf(c["recompute_every"], tf))
    la, lb = np.log(a.close), np.log(b.close)
    n = len(la)
    ok, beta, hl = np.zeros(n, bool), np.full(n, np.nan), np.full(n, np.nan)
    cur = (False, np.nan, np.nan)
    last = None
    for i in range(W - 1, n):
        if last is None or i - last >= every:
            o, be, _ = johansen(la[i - W + 1:i + 1], lb[i - W + 1:i + 1])
            h = half_life(la[i - W + 1:i + 1] - be * lb[i - W + 1:i + 1]) if np.isfinite(be) else np.nan
            cur, last = (o and np.isfinite(be) and 0 < be <= BETA_MAX, be, h), i      # beta <= 0 is not a hedge; > BETA_MAX is unstable
        ok[i], beta[i], hl[i] = cur
    return {"ok": ok, "beta": beta, "hl": hl}


def pair_index(a: Bars, b: Bars, beta: np.ndarray, name: str) -> Bars:
    """Synthetic index; beta used for bar t is the estimate known at the close of t-1."""
    n = len(a.close)
    # the hedge in force: the last estimate that was a valid hedge (0 < beta <= BETA_MAX), 1.0 before the first one
    valid = np.where(np.isfinite(beta) & (beta > 0) & (beta <= BETA_MAX), beta, np.nan)
    held = np.array(__import__("pandas").Series(valid).ffill().fillna(1.0))
    bb = np.concatenate([[1.0], held[:-1]])
    pa, pb = np.concatenate([[a.close[0]], a.close[:-1]]), np.concatenate([[b.close[0]], b.close[:-1]])
    rc = a.close / pa - 1 - bb * (b.close / pb - 1)
    ro = a.open / pa - 1 - bb * (b.open / pb - 1)
    rh = a.high / pa - 1 - bb * (b.low / pb - 1)
    rl = a.low / pa - 1 - bb * (b.high / pb - 1)
    rc[0] = ro[0] = rh[0] = rl[0] = 0.0
    idx = 100.0 * np.exp(np.cumsum(np.log1p(np.maximum(rc, -0.5))))
    prev = np.concatenate([[100.0], idx[:-1]])
    o, c = prev * np.maximum(1 + ro, 0.5), idx
    h = np.maximum(np.maximum(prev * np.maximum(1 + rh, 0.5), o), c)
    l = np.minimum(np.minimum(prev * np.maximum(1 + rl, 0.5), o), c)
    return Bars(name, a.tf, a.t, o, h, l, c, np.minimum(a.volume * a.close, b.volume * b.close))


def pair_bars(a5: Bars, b5: Bars, tf: str, cfg: dict, name: str):
    """Realistic intra-bar extremes: the index is built on 5m bars (hedge ratio re-estimated on `tf` bars, applied from
    the next `tf` bar), then aggregated to `tf`, so its high/low are the index's own 5m extremes."""
    from ..data.loader import TF_MS, aggregate
    a5, b5 = align(a5, b5)
    a, b = aggregate(a5, tf), aggregate(b5, tf)
    a, b = align(a, b)
    co = rolling_coint(a, b, cfg, tf)
    step = TF_MS[tf]
    k = np.searchsorted(a.t, (a5.t // step) * step)            # the tf bar each 5m bar belongs to
    k = np.clip(k, 0, len(a.t) - 1)
    # beta estimated at the close of tf bar k-1 is in force during tf bar k
    beta5 = np.where(k >= 1, co["beta"][np.maximum(k - 1, 0)], np.nan)
    fine = pair_index(a5, b5, np.concatenate([beta5[1:], [np.nan]]), name)
    ix = aggregate(fine, tf)
    keep = np.isin(a.t, ix.t)
    co = {kk: v[keep] for kk, v in co.items()}
    ix_keep = np.isin(ix.t, a.t[keep])
    ix = Bars(name, tf, ix.t[ix_keep], ix.open[ix_keep], ix.high[ix_keep], ix.low[ix_keep], ix.close[ix_keep], ix.volume[ix_keep])
    return ix, co


def pair_funding(fa: Funding, fb: Funding, beta_max: float) -> Funding:
    """Long the index = long A, short beta B: pays A's rate and receives beta x B's rate (settlements share a clock)."""
    t = np.union1d(fa.t, fb.t)
    ra = np.zeros(len(t)); rb = np.zeros(len(t))
    ra[np.searchsorted(t, fa.t)] = fa.rate
    rb[np.searchsorted(t, fb.t)] = fb.rate
    return Funding(t, ra - beta_max * rb)


def signals(ix: Bars, co: dict, params: dict, cfg: dict) -> Signals:
    c = cfg["pairs"]
    n = len(ix.close)
    logp = np.log(ix.close)
    hl = co["hl"]
    gate = co["ok"] & np.isfinite(hl) & (hl >= c["halflife_min"]) & (hl <= c["halflife_max"])
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
    s.info = {"z": z, "active_frac": float(gate.mean())}
    return s


def grid(cfg: dict) -> list[dict]:
    g = cfg["pairs"]["grid"]
    return [dict(entry_z=e, exit_z=x, stop_z=s) for e in g["entry_z"] for x in g["exit_z"] for s in g["stop_z"] if x < e]

"""Triple-barrier labels and sample uniqueness (Lopez de Prado, AFML ch. 3-4), for CHAN signals.

Each CHAN signal (side decided on the close of bar i) is entered at the open of bar i+1. Three barriers:
  upper (profit)  entry x (1 + d x pt x width)
  lower (loss)    entry x (1 - d x sl x width)
  vertical        the strategy's own holding limit (max_hold bars)
width = the EWMA volatility of 1-bar log returns at bar i x sqrt(max_hold): barriers scale with the market, not a
fixed percent. Within a bar that touches both, the LOSS barrier is assumed first (pessimistic, like the engine).
The label is the barrier touched first; the META label is 1 when the trade's return NET of a round-trip cost is > 0,
i.e. "was this CHAN signal worth taking after costs".
Uniqueness: labels overlap in time (a signal every bar of an extreme). Each event's weight is its average
uniqueness 1/concurrency over its life, so a cluster of near-identical events counts about once.
"""
from __future__ import annotations

import numpy as np
import pandas as pd


def ewm_vol(close: np.ndarray, span: int = 100) -> np.ndarray:
    r = np.diff(np.log(close), prepend=np.log(close[0]))
    return pd.Series(r).ewm(span=span, min_periods=span).std().to_numpy()


def triple_barrier(o, h, l, c, idx: np.ndarray, side: np.ndarray, hold: np.ndarray, vol: np.ndarray,
                   pt: float, sl: float, cost: np.ndarray | float) -> dict:
    """idx: signal bars; side: +1/-1; hold: vertical barrier in bars; cost: round-trip cost as a fraction of price."""
    n = len(c)
    m = len(idx)
    out = {"t1": np.full(m, -1, np.int64), "ret": np.full(m, np.nan), "bin": np.zeros(m, np.int8),
           "meta": np.zeros(m, np.int8), "valid": np.zeros(m, bool)}
    cost = np.broadcast_to(np.asarray(cost, float), (m,))
    for k in range(m):
        i, d, H = int(idx[k]), int(side[k]), int(hold[k])
        j = i + 1
        if j >= n or H <= 0 or not np.isfinite(vol[i]) or vol[i] <= 0:
            continue
        e = o[j]
        w = vol[i] * np.sqrt(H)
        up = e * (1 + d * pt * w)
        dn = e * (1 - d * sl * w)
        end = min(n - 1, j + H - 1)
        hs, ls = h[j:end + 1], l[j:end + 1]
        if d > 0:
            hit_loss, hit_gain = ls <= dn, hs >= up
        else:
            hit_loss, hit_gain = hs >= dn, ls <= up
        big = end - j + 5
        kl = int(np.argmax(hit_loss)) if hit_loss.any() else big
        kg = int(np.argmax(hit_gain)) if hit_gain.any() else big
        if kl == big and kg == big:
            b, px, lab = end, c[end], 0
        elif kl <= kg:
            b, lab = j + kl, -1
            px = o[b] if d * (o[b] - dn) < 0 else dn          # gap through the barrier fills at the open
        else:
            b, px, lab = j + kg, up, 1
        r = d * (px / e - 1) - cost[k]
        out["t1"][k], out["ret"][k], out["bin"][k] = b, r, lab
        out["meta"][k] = 1 if r > 0 else 0
        out["valid"][k] = True
    return out


def avg_uniqueness(t0: np.ndarray, t1: np.ndarray, n_bars: int) -> np.ndarray:
    """t0/t1 are bar indices (inclusive) on ONE symbol's timeline."""
    conc = np.zeros(n_bars + 1)
    np.add.at(conc, t0, 1)
    np.add.at(conc, np.minimum(t1 + 1, n_bars), -1)
    conc = np.cumsum(conc)[:n_bars]
    inv = np.concatenate([[0.0], np.cumsum(1.0 / np.maximum(conc, 1))])
    return (inv[t1 + 1] - inv[t0]) / (t1 - t0 + 1)

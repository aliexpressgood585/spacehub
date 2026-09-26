"""Writes tests/fixtures/chan_parity.json: kernel values computed by the Python quant/ code on synthetic series, so the
TypeScript live port (shared/chan.ts) can be checked against them to many decimals."""
import json
import math
from pathlib import Path

import numpy as np

from quant.strategies.stats import adf_pvalue, atr, half_life, hurst, rolling_mean_std

rng = np.random.default_rng(11)
out = []
n = 9000


def ou(theta, sig):
    x = np.zeros(n)
    for i in range(1, n):
        x[i] = x[i - 1] - theta * x[i - 1] + sig * rng.standard_normal()
    return x


series = {
    "ou": 4.6 + ou(0.05, 0.002),
    "rw": 4.6 + np.cumsum(rng.standard_normal(n) * 0.002),
    "trend": 4.6 + np.cumsum(np.convolve(rng.standard_normal(n + 99) * 0.002, np.ones(100) / 10, "valid")),
}
for name, lp0 in series.items():
    close = np.round(np.exp(lp0), 5)              # rounded first, so both languages start from identical inputs
    high = np.round(close * (1 + np.abs(rng.standard_normal(n)) * 0.001), 5)
    low = np.round(close * (1 - np.abs(rng.standard_normal(n)) * 0.001), 5)
    lp = np.log(close)
    win = lp[-2016:]
    hl = half_life(win)
    L = int(min(300, max(5, round(hl)))) if math.isfinite(hl) else None
    z = mu = sd = None
    if L:
        m, s = rolling_mean_std(lp, L)
        mu, sd = float(m[-1]), float(s[-1])
        z = (lp[-1] - mu) / sd
    i, Lm, H, W = n - 1, 144, 12, 4032
    ks = np.arange(i - W + 1 + Lm, i - H + 1, H)
    x = lp[ks] - lp[ks - Lm]
    y = lp[ks + H] - lp[ks]
    r = float(np.corrcoef(x, y)[0, 1])
    t = r * math.sqrt((len(ks) - 2) / max(1e-12, 1 - r * r))
    out.append({"name": name, "c": close.tolist(), "h": high.tolist(), "l": low.tolist(),
                "adf": adf_pvalue(win), "hurst": hurst(win), "hl": hl if math.isfinite(hl) else None, "z": z, "mu": mu, "sd": sd, "t": t,
                "atr": float(atr(high, low, close, 14)[-1]), "vol": float(np.std(np.diff(win)))})
Path("tests/fixtures/chan_parity.json").write_text(json.dumps(out))
print({o["name"]: {k: o[k] for k in ("adf", "hurst", "hl", "z", "t", "atr")} for o in out})

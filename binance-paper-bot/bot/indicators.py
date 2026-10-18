"""Vectorised numpy indicators (identical code path in live and backtest)."""
import numpy as np


def ema(x, n):
    x = np.asarray(x, float)
    out = np.full_like(x, np.nan)
    if len(x) < n:
        return out
    a = 2.0 / (n + 1)
    out[n - 1] = x[:n].mean()          # SMA seed (like TA-Lib)
    for i in range(n, len(x)):
        out[i] = a * x[i] + (1 - a) * out[i - 1]
    return out


def rma(x, n):
    x = np.asarray(x, float)
    out = np.full_like(x, np.nan)
    if len(x) < n:
        return out
    out[n - 1] = x[:n].mean()
    for i in range(n, len(x)):
        out[i] = (out[i - 1] * (n - 1) + x[i]) / n
    return out


def rsi(close, n=14):
    c = np.asarray(close, float)
    d = np.diff(c, prepend=c[0])
    up, dn = np.where(d > 0, d, 0.0), np.where(d < 0, -d, 0.0)
    au, ad = rma(up[1:], n), rma(dn[1:], n)
    rs = np.divide(au, ad, out=np.full_like(au, np.inf), where=ad > 0)
    r = 100 - 100 / (1 + rs)
    return np.concatenate([[np.nan], r])


def atr(high, low, close, n=14):
    h, l, c = (np.asarray(v, float) for v in (high, low, close))
    pc = np.concatenate([[c[0]], c[:-1]])
    tr = np.maximum(h - l, np.maximum(abs(h - pc), abs(l - pc)))
    return rma(tr, n)


def bollinger(close, n=20, k=2.0):
    c = np.asarray(close, float)
    mid = np.full_like(c, np.nan); up = mid.copy(); lo = mid.copy()
    for i in range(n - 1, len(c)):
        w = c[i - n + 1:i + 1]
        m, s = w.mean(), w.std(ddof=0)
        mid[i], up[i], lo[i] = m, m + k * s, m - k * s
    return mid, up, lo

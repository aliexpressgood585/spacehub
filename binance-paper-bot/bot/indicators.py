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


def true_range(high, low, close):
    h, l, c = (np.asarray(v, float) for v in (high, low, close))
    pc = np.concatenate([[c[0]], c[:-1]])
    return np.maximum(h - l, np.maximum(abs(h - pc), abs(l - pc)))


def atr(high, low, close, n=14):
    return rma(true_range(high, low, close), n)


def adx(high, low, close, n=14):
    """Wilder ADX. Values before 2*n-1 bars are NaN. Uses only data up to each index."""
    h, l, c = (np.asarray(v, float) for v in (high, low, close))
    up = np.diff(h, prepend=h[0])
    dn = -np.diff(l, prepend=l[0])
    up[0] = 0.0
    dn[0] = 0.0
    plus_dm = np.where((up > dn) & (up > 0), up, 0.0)
    minus_dm = np.where((dn > up) & (dn > 0), dn, 0.0)
    tr = true_range(h, l, c)
    atr_ = rma(tr, n)
    pdi = np.divide(100.0 * rma(plus_dm, n), atr_, out=np.full(len(c), np.nan), where=atr_ > 0)
    mdi = np.divide(100.0 * rma(minus_dm, n), atr_, out=np.full(len(c), np.nan), where=atr_ > 0)
    den = pdi + mdi
    dx = np.divide(100.0 * np.abs(pdi - mdi), den, out=np.full(len(c), np.nan), where=den > 0)
    out = np.full(len(c), np.nan)
    start = n - 1
    seed_at = start + n - 1
    if len(c) <= seed_at:
        return out
    seed = dx[start:seed_at + 1]
    if not np.all(np.isfinite(seed)):
        return out
    out[seed_at] = seed.mean()
    for i in range(seed_at + 1, len(c)):
        if not np.isfinite(dx[i]) or not np.isfinite(out[i - 1]):
            continue
        out[i] = (out[i - 1] * (n - 1) + dx[i]) / n
    return out


def bollinger(close, n=20, k=2.0):
    c = np.asarray(close, float)
    mid = np.full_like(c, np.nan)
    up = np.full_like(c, np.nan)
    lo = np.full_like(c, np.nan)
    if len(c) < n:
        return mid, up, lo
    win = np.lib.stride_tricks.sliding_window_view(c, n)
    m = win.mean(axis=1)
    s = win.std(axis=1, ddof=0)
    mid[n - 1:] = m
    up[n - 1:] = m + k * s
    lo[n - 1:] = m - k * s
    return mid, up, lo

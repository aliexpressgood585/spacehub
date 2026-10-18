"""NY opening-range breakout on 15m bars.

Faithful port of research/c/strats.py `orb` with the deployed parameter row
(summary_intraday.csv row 1). Features use pandas-compatible EWM (adjust=False,
ignore_na=False) so they are not the SMA-seeded EMAs in bot.indicators.

`win` is hours after the session open, not a bar count. With win=3 the signal
bars are the 15m closes from 10:30 New York inclusive to 12:30 exclusive.
`tstr` 0 is falsy in the research code, so the trend-strength filter is off.
"""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import numpy as np

from .base import Strategy, Signal, register

NY = ZoneInfo("America/New_York")
M1 = 60_000
M15 = 900_000

DEFAULTS = {
    "session": "ny",
    "rng": 60,
    "filt": "both",
    "slm": "half",
    "tpR": 2.0,
    "win": 3,
    "hold": 8,
    "maxw": 0,
    "dow": "wk",
    "vreg": "high",
    "volf": 1.0,
    "tstr": 0,
    "timeframe": "15m",
    "leverage": 3,
}


def ewm_mean(x, alpha, min_periods):
    """pandas Series.ewm(adjust=False, ignore_na=False).mean().

    A NaN consumes a time step: the previous state is decayed by (1-alpha)
    for each missed observation and the new point fills the remaining weight.
    Leading NaNs do not seed the average. Output starts once `min_periods`
    finite observations have been seen; a later NaN repeats the previous value.
    """
    x = np.asarray(x, float)
    out = np.full(len(x), np.nan)
    y = None
    n = 0
    gap = 0
    for i, v in enumerate(x):
        if v != v:
            gap += 1
            if y is not None and n >= min_periods:
                out[i] = y
            continue
        if y is None:
            y = float(v)
        else:
            decay = (1.0 - alpha) ** (gap + 1)
            y = decay * y + (1.0 - decay) * float(v)
        gap = 0
        n += 1
        if n >= min_periods:
            out[i] = y
    return out


def ema(x, n):
    return ewm_mean(x, 2.0 / (n + 1), n)


def wilder_atr(high, low, close, n):
    h = np.asarray(high, float)
    l = np.asarray(low, float)
    c = np.asarray(close, float)
    pc = np.concatenate([[np.nan], c[:-1]])
    tr = np.nanmax(np.vstack([h - l, np.abs(h - pc), np.abs(l - pc)]), 0)
    return ewm_mean(tr, 1.0 / n, n)


def rolling_median(x, window, min_periods):
    x = np.asarray(x, float)
    out = np.full(len(x), np.nan)
    for i in range(len(x)):
        w = x[max(0, i - window + 1): i + 1]
        w = w[np.isfinite(w)]
        if len(w) >= min_periods:
            out[i] = float(np.median(w))
    return out


def session_open_ms(ts_ms, session="ny"):
    """UTC ms of the session open on the America/New_York (or London) date of `ts_ms`.

    09:30 New York is 14:30 UTC in January (EST) and 13:30 UTC in July (EDT).
    """
    dt = datetime.fromtimestamp(int(ts_ms) / 1000, tz=timezone.utc)
    if session == "asia":
        local = dt.astimezone(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        return int(local.timestamp() * 1000)
    if session == "london":
        tz, hh, mm = ZoneInfo("Europe/London"), 8, 0
    else:
        tz, hh, mm = NY, 9, 30
    local = dt.astimezone(tz).replace(hour=hh, minute=mm, second=0, microsecond=0)
    return int(local.timestamp() * 1000)


def _arr(candles, tf):
    b = (candles or {}).get(tf)
    if not b or len(b.get("close", [])) == 0:
        return None
    return b


def _last_closed(b, close_ms):
    ct = np.asarray(b["close_time"], float)
    i = int(np.searchsorted(ct, float(close_ms), side="right")) - 1
    if i < 0:
        return None
    return i


def _trend_side(sign_close, e_fast, e_slow, i, kind):
    if i is None or not np.isfinite(e_slow[i]):
        return 0
    if kind == "1h":
        c = sign_close[i]
        if c > e_slow[i] and e_fast[i] > e_slow[i]:
            return 1
        if c < e_slow[i] and e_fast[i] < e_slow[i]:
            return -1
        return 0
    if e_fast[i] > e_slow[i]:
        return 1
    if e_fast[i] < e_slow[i]:
        return -1
    return 0


def signal_at(symbol, candles, params):
    """Signal for the last closed 15m bar, or None.

    The first 15m close outside the opening range consumes the session even
    when a filter rejects it. A later bar in the same window does not enter.
    Distances are measured from that signal close; the engine applies them
    around the fill. `info["exit_ts"]` is the 1m open of the time exit
    (session open + hold hours), and `info["tp_order"]` is "limit".
    """
    p = dict(DEFAULTS)
    p.update(params or {})
    b15 = _arr(candles, "15m")
    b1 = _arr(candles, "1m")
    if b15 is None or b1 is None:
        return None
    o15 = np.asarray(b15["open_time"], np.int64)
    c15 = np.asarray(b15["close"], float)
    ct15 = np.asarray(b15["close_time"], np.int64)
    i = len(c15) - 1
    bar_open = int(o15[i])
    bar_close = int(ct15[i])
    o0 = session_open_ms(bar_open, p.get("session") or "ny")
    rng_ms = int(p["rng"]) * M1
    win_end = o0 + int(p["win"]) * 60 * M1
    if bar_open < o0 + rng_ms or bar_open >= win_end:
        return None
    # Weekdays of the bar close. 09:30 New York is 13:30 or 14:30 UTC, so the
    # UTC date and the session date are the same.
    if p.get("dow") == "wk":
        if datetime.fromtimestamp(bar_close / 1000, tz=timezone.utc).weekday() >= 5:
            return None
    ot1 = np.asarray(b1["open_time"], np.int64)
    in_rng = (ot1 >= o0) & (ot1 < o0 + rng_ms)
    if int(in_rng.sum()) != int(p["rng"]):
        return None
    rh = np.asarray(b1["high"], float)[in_rng]
    rl = np.asarray(b1["low"], float)[in_rng]
    if not (np.isfinite(rh).all() and np.isfinite(rl).all()):
        return None
    hi = float(rh.max())
    lo = float(rl.min())
    if not (hi > lo):
        return None
    # Earlier window bars: the first close outside the range consumes the session
    # before the trend filter is applied.
    earlier = (o15 >= o0 + rng_ms) & (o15 < bar_open) & (o15 < win_end)
    if earlier.any():
        prev = c15[earlier]
        if np.any((prev > hi) | (prev < lo)):
            return None
    close = float(c15[i])
    if close > hi:
        side = 1
    elif close < lo:
        side = -1
    else:
        return None
    if p.get("maxw"):
        d1 = _arr(candles, "1d")
        j = _last_closed(d1, bar_close) if d1 is not None else None
        if j is None:
            return None
        a1 = wilder_atr(d1["high"], d1["low"], d1["close"], 14)
        width = hi - lo
        if not (np.isfinite(a1[j]) and a1[j] > 0 and width / a1[j] <= float(p["maxw"])):
            return None
    trend = _filters_ok(candles, p, side, bar_close)
    if trend is None:
        return None
    if p.get("slm") == "range":
        sl = (close - lo) if side > 0 else (hi - close)
    else:
        mid = (hi + lo) / 2.0
        sl = (close - mid) if side > 0 else (mid - close)
    sl = max(float(sl), 0.0015 * close)
    if not np.isfinite(sl) or sl <= 0:
        return None
    tp = sl * float(p["tpR"])
    exit_ts = o0 + int(p["hold"]) * 60 * M1
    action = "OPEN_LONG" if side > 0 else "OPEN_SHORT"
    return Signal(
        symbol, action, sl, tp, float(p.get("leverage", 3)),
        f"NY ORB {'long' if side > 0 else 'short'} close {close:.6g} range {lo:.6g}-{hi:.6g}",
        {"tp_order": "limit", "exit_ts": int(exit_ts), "session_open": int(o0),
         "range_hi": hi, "range_lo": lo, "side": side},
    )


def _filters_ok(candles, p, side, bar_close):
    """True when every enabled filter agrees with `side`. None means reject."""
    mode = p.get("filt") or "none"
    if mode != "none":
        h1 = _arr(candles, "1h")
        h4 = _arr(candles, "4h")
        s1 = s4 = 0
        if mode in ("1h", "both"):
            if h1 is None:
                return None
            i1 = _last_closed(h1, bar_close)
            if i1 is None:
                return None
            c = np.asarray(h1["close"], float)
            s1 = _trend_side(c, ema(c, 20), ema(c, 50), i1, "1h")
        if mode in ("4h", "both"):
            if h4 is None:
                return None
            i4 = _last_closed(h4, bar_close)
            if i4 is None:
                return None
            c4 = np.asarray(h4["close"], float)
            s4 = _trend_side(c4, ema(c4, 20), ema(c4, 100), i4, "4h")
        if mode == "1h":
            trend = s1
        elif mode == "4h":
            trend = s4
        else:
            trend = s1 if s1 == s4 else 0
        if trend != side:
            return None
    if p.get("vreg"):
        d1 = _arr(candles, "1d")
        if d1 is None:
            return None
        j = _last_closed(d1, bar_close)
        if j is None:
            return None
        c = np.asarray(d1["close"], float)
        ap = wilder_atr(d1["high"], d1["low"], c, 14) / c
        med = rolling_median(ap, 60, 30)
        r = ap[j] / med[j] if np.isfinite(med[j]) and med[j] != 0 else np.nan
        if p["vreg"] == "high":
            ok = np.isfinite(r) and r > 1.0
        else:
            ok = np.isfinite(r) and r < 1.0
        if not ok:
            return None
    if p.get("volf"):
        d1 = _arr(candles, "1d")
        if d1 is None:
            return None
        j = _last_closed(d1, bar_close)
        if j is None:
            return None
        v = np.asarray(d1["volume"], float)
        med = rolling_median(v, 20, 10)
        if not (np.isfinite(med[j]) and med[j] > 0 and v[j] / med[j] >= float(p["volf"])):
            return None
    if p.get("tstr"):
        h4 = _arr(candles, "4h")
        if h4 is None:
            return None
        i4 = _last_closed(h4, bar_close)
        if i4 is None:
            return None
        c4 = np.asarray(h4["close"], float)
        atr = wilder_atr(h4["high"], h4["low"], c4, 14)
        strength = np.abs(ema(c4, 20) - ema(c4, 100)) / atr
        if not (np.isfinite(strength[i4]) and strength[i4] >= float(p["tstr"])):
            return None
    return True


@register("orb_ny_15m")
class OrbNy15m(Strategy):
    """15m NY opening-range breakout. Exits are the stop, the 2R limit, and the hold."""

    def __init__(self, params):
        merged = dict(DEFAULTS)
        merged.update(params or {})
        super().__init__(merged)
        self.timeframe = merged.get("timeframe", "15m")

    def timeframes(self):
        return ["15m", "1m", "1h", "4h", "1d"]

    def warmup_bars(self):
        return {"15m": 16, "1m": 60, "1h": 80, "4h": 120, "1d": 90}

    def on_bar(self, ctx):
        if ctx.position is not None:
            return []
        sig = signal_at(ctx.symbol, ctx.candles, self.p)
        return [sig] if sig is not None else []

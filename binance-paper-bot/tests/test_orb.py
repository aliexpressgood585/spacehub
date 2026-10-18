"""NY opening-range breakout: session clock, filters, and the first breakout."""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import numpy as np
import pytest

from bot.strategies.orb_ny import DEFAULTS, ema, ewm_mean, session_open_ms, signal_at

NY = ZoneInfo("America/New_York")
M1 = 60_000
FIELDS = ("open_time", "open", "high", "low", "close", "volume", "close_time")


def _ms(dt):
    return int(dt.timestamp() * 1000)


def _pack(rows_by_tf):
    out = {}
    for tf, rows in rows_by_tf.items():
        a = np.array(rows, dtype=float)
        out[tf] = {name: a[:, i] for i, name in enumerate(FIELDS)}
    return out


def _minute_rows(start, n, high, low):
    mid = (high + low) / 2.0
    rows = []
    for i in range(n):
        ot = start + i * M1
        rows.append((ot, mid, high, low, mid, 1.0, ot + M1 - 1))
    return rows


def _bar(ot, span, close, high=None, low=None):
    high = close if high is None else high
    low = close if low is None else low
    return (ot, close, high, low, close, 1.0, ot + span - 1)


def _trend(n, up, tf_ms, end_ms):
    px = 100.0
    start = end_ms - n * tf_ms
    rows = []
    for i in range(n):
        ot = start + i * tf_ms
        px *= 1.002 if up else 0.998
        rows.append((ot, px, px * 1.002, px * 0.998, px, 1.0, ot + tf_ms - 1))
    return rows


def _breakout(session_dt, *, close_above=True, minutes=60, earlier_break=False, trend=None):
    """15m bar at 10:30 NY, range built from the preceding `minutes` one-minute bars."""
    o0 = _ms(session_dt)
    rng = 60
    m1 = _minute_rows(o0, minutes, high=100.0, low=99.0)
    first = o0 + rng * M1
    c_out = 101.0 if close_above else 98.0
    bars = []
    if earlier_break:
        bars.append(_bar(first, 900_000, c_out, high=c_out, low=c_out))
        bars.append(_bar(first + 900_000, 900_000, c_out, high=c_out, low=c_out))
    else:
        bars.append(_bar(first, 900_000, c_out, high=c_out, low=c_out))
    extra = {}
    if trend:
        end = bars[-1][6]
        h1_up, h4_up = trend
        extra["1h"] = _trend(220, h1_up, 3_600_000, end + 1)
        extra["4h"] = _trend(220, h4_up, 14_400_000, end + 1)
    return _pack({"1m": m1, "15m": bars, **extra}), bars[-1]


def test_ewm_matches_pandas_adjust_false():
    y = ema(np.arange(1, 25, dtype=float), 20)
    assert y[19] == pytest.approx(11.918650526094963)
    gap = ewm_mean(np.array([1.0, np.nan, 3.0]), 0.5, 1)
    assert list(gap) == pytest.approx([1.0, 1.0, 2.5])


def test_session_open_follows_new_york_dst():
    jan = datetime(2026, 1, 15, 9, 30, tzinfo=NY)
    jul = datetime(2026, 7, 15, 9, 30, tzinfo=NY)
    jan_ms, jul_ms = _ms(jan), _ms(jul)
    assert session_open_ms(jan_ms) == jan_ms
    assert session_open_ms(jul_ms) == jul_ms
    assert datetime.fromtimestamp(jan_ms / 1000, timezone.utc).hour == 14
    assert datetime.fromtimestamp(jul_ms / 1000, timezone.utc).hour == 13
    assert session_open_ms(jan_ms + 3_600_000) == jan_ms
    assert session_open_ms(jul_ms + 3_600_000) == jul_ms


def test_long_breakout_stop_is_close_to_midpoint_and_win_is_hours():
    candles, bar = _breakout(datetime(2026, 1, 15, 9, 30, tzinfo=NY))
    sig = signal_at("BTCUSDT", candles, {"filt": "none", "vreg": 0, "volf": 0, "tstr": 0, "dow": "wk"})
    assert sig is not None and sig.action == "OPEN_LONG"
    # close 101, range 99-100, midpoint 99.5 -> stop distance 1.5, above the 0.15% floor
    assert sig.sl_distance == pytest.approx(1.5)
    assert sig.tp_distance == pytest.approx(3.0)
    assert sig.info["tp_order"] == "limit"
    o0 = session_open_ms(bar[0])
    assert sig.info["exit_ts"] == o0 + 8 * 60 * M1
    # 12:30 NY is win=3 hours after 09:30, and the window is exclusive there.
    late_open = o0 + 3 * 60 * M1
    late = _pack({"1m": _minute_rows(o0, 60, 100.0, 99.0),
                  "15m": [_bar(late_open, 900_000, 101.0)]})
    assert signal_at("BTCUSDT", late, {"filt": "none", "vreg": 0, "volf": 0, "tstr": 0}) is None
    # July (EDT) uses the same local clock.
    jul, _ = _breakout(datetime(2026, 7, 15, 9, 30, tzinfo=NY))
    jul_sig = signal_at("BTCUSDT", jul, {"filt": "none", "vreg": 0, "volf": 0, "tstr": 0, "dow": "wk"})
    assert jul_sig is not None and jul_sig.action == "OPEN_LONG"
    assert datetime.fromtimestamp(jul_sig.info["session_open"] / 1000, timezone.utc).hour == 13


def test_stop_floor_is_fifteen_bps_when_the_range_is_tight():
    o0 = _ms(datetime(2026, 1, 15, 9, 30, tzinfo=NY))
    first = o0 + 60 * M1
    candles = _pack({
        "1m": _minute_rows(o0, 60, high=100.05, low=100.0),
        "15m": [_bar(first, 900_000, 100.10)],
    })
    sig = signal_at("BTCUSDT", candles, {"filt": "none", "vreg": 0, "volf": 0, "tstr": 0})
    assert sig.sl_distance == pytest.approx(0.0015 * 100.10)


def test_first_outside_close_consumes_the_session_even_if_filtered():
    # The 10:30 bar closed outside the range. Filters would reject it. The 10:45
    # bar is still not a new signal, including when its own filters are off.
    candles, _ = _breakout(datetime(2026, 1, 15, 9, 30, tzinfo=NY), earlier_break=True, trend=(False, False))
    assert signal_at("BTCUSDT", candles, {"filt": "both", "vreg": 0, "volf": 0, "tstr": 0}) is None
    assert signal_at("BTCUSDT", candles, {"filt": "none", "vreg": 0, "volf": 0, "tstr": 0}) is None
    # The consuming bar itself is a signal when the filters are off.
    only_first, _ = _breakout(datetime(2026, 1, 15, 9, 30, tzinfo=NY), earlier_break=False)
    assert signal_at("BTCUSDT", only_first, {"filt": "none", "vreg": 0, "volf": 0, "tstr": 0}) is not None


def test_weekend_and_missing_range_and_trend_disagreement():
    sat, _ = _breakout(datetime(2026, 1, 17, 9, 30, tzinfo=NY))
    assert signal_at("BTCUSDT", sat, {"filt": "none", "vreg": 0, "volf": 0, "tstr": 0, "dow": "wk"}) is None
    short = _breakout(datetime(2026, 1, 15, 9, 30, tzinfo=NY), minutes=59)[0]
    assert signal_at("BTCUSDT", short, {"filt": "none", "vreg": 0, "volf": 0, "tstr": 0}) is None
    disagree, _ = _breakout(datetime(2026, 1, 15, 9, 30, tzinfo=NY), trend=(True, False))
    assert signal_at("BTCUSDT", disagree, {"filt": "both", "vreg": 0, "volf": 0, "tstr": 0}) is None
    agree, _ = _breakout(datetime(2026, 1, 15, 9, 30, tzinfo=NY), trend=(True, True))
    sig = signal_at("BTCUSDT", agree, {"filt": "both", "vreg": 0, "volf": 0, "tstr": 0})
    assert sig is not None and sig.action == "OPEN_LONG"
    # tstr 0 is the shipped default and does not add a strength requirement.
    assert DEFAULTS["tstr"] == 0 and DEFAULTS["win"] == 3

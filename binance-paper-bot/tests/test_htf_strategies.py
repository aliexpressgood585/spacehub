"""Tests for the research-selected HTF strategies (ema_trend_4h, tsmom_4h) and no-TP bracket handling."""
import numpy as np
from bot.config import load_config
from bot.engine import TradingEngine
from bot.risk import RiskManager
from bot.strategies import REGISTRY
from bot.strategies.base import Context, Strategy, Signal
from bot.execution.base import Position
from tests.test_math import make_ex

H1, H4 = 3_600_000, 14_400_000


def bars(closes, step, t0=0, spread=0.002):
    c = np.asarray(closes, float)
    o = np.concatenate([[c[0]], c[:-1]])
    t = t0 + np.arange(len(c)) * step
    return {"open_time": t.astype(float), "open": o, "high": np.maximum(o, c) * (1 + spread),
            "low": np.minimum(o, c) * (1 - spread), "close": c, "volume": np.ones(len(c)),
            "close_time": (t + step - 1).astype(float)}


def ema_params(**kw):
    p = dict(timeframe="1h", signal_timeframe="4h", ema_fast=5, ema_slow=20, atr_period=5, sl_atr=3.0,
             tp_atr=0, regime="none", leverage=3)
    p.update(kw); return p


def test_registered():
    assert "ema_trend_4h" in REGISTRY and "tsmom_4h" in REGISTRY
    assert REGISTRY["ema_trend_4h"](ema_params(regime="self50")).timeframes() == ["1h", "4h", "1d"]


def test_ema_trend_enters_only_on_fresh_cross_and_exits_on_flip():
    s = REGISTRY["ema_trend_4h"](ema_params())
    closes = list(np.linspace(110, 100, 40)) + [104, 108]           # downtrend then sharp up -> fast crosses above slow
    h4 = bars(closes, H4)
    ts = int(h4["close_time"][-1]) + 1
    # find the cross bar: evaluate progressively
    sigs = []
    for n in range(25, len(closes) + 1):
        sub = {k: v[:n] for k, v in h4.items()}
        sigs = s.on_bar(Context("BTCUSDT", int(sub["close_time"][-1]) + 1, {"1h": bars([1, 1], H1), "4h": sub}))
        if sigs:
            break
    assert sigs and sigs[-1].action == "OPEN_LONG"
    assert sigs[-1].tp_distance == 0 and sigs[-1].sl_distance > 0
    # not a fresh 4h close (1h bar in the middle of the 4h bar) -> nothing
    assert s.on_bar(Context("BTCUSDT", ts + H1, {"1h": bars([1, 1], H1), "4h": h4})) == []
    # in a short position while the 4h state is long -> CLOSE (and reverse only on the cross bar)
    pos = Position("BTCUSDT", -1, 1.0, 100.0, 3, 33.0, 0)
    out = s.on_bar(Context("BTCUSDT", ts, {"1h": bars([1, 1], H1), "4h": h4}, pos))
    assert out and out[0].action == "CLOSE"


def test_ema_trend_regime_blocks_counter_trend_entries():
    s = REGISTRY["ema_trend_4h"](ema_params(regime="self50"))
    closes = list(np.linspace(110, 100, 40)) + [104, 108]
    h4 = bars(closes, H4)
    d1_down = bars(np.linspace(200, 100, 80), 86_400_000)         # daily below its EMA50 -> no longs
    for n in range(25, len(closes) + 1):
        sub = {k: v[:n] for k, v in h4.items()}
        out = s.on_bar(Context("BTCUSDT", int(sub["close_time"][-1]) + 1, {"1h": bars([1, 1], H1), "4h": sub, "1d": d1_down}))
        assert not any(x.action.startswith("OPEN") for x in out)


def test_tsmom_trailing_exit_on_1h_close():
    s = REGISTRY["tsmom_4h"](dict(timeframe="1h", signal_timeframe="4h", lookback=12, z_entry=2.0, vol_filter="expand",
                                  sl_atr=2.5, trail_atr=1.0, regime="none"))
    rng = np.random.default_rng(0)
    h4 = bars(100 * np.exp(np.cumsum(rng.normal(0, 0.01, 300))), H4)
    t_end = int(h4["close_time"][-1]) + 1
    h1_close = [h4["close"][-1]] * 10 + [h4["close"][-1] * 1.10] * 5 + [h4["close"][-1] * 0.95]
    h1 = bars(h1_close, H1, t0=t_end)
    pos = Position("BTCUSDT", 1, 1.0, float(h4["close"][-1]), 3, 33.0, t_end)
    out = s.on_bar(Context("BTCUSDT", int(h1["close_time"][-1]) + 1, {"1h": h1, "4h": h4}, pos))
    assert out and out[0].action == "CLOSE" and "trail" in out[0].reason


class LongNoTP(Strategy):
    name = "long_no_tp"
    def on_bar(self, ctx):
        return [] if ctx.position else [Signal(ctx.symbol, "OPEN_LONG", 500.0, 0.0, 3, "test")]


def test_engine_skips_take_profit_when_tp_distance_is_zero():
    cfg = load_config()
    ex, rec = make_ex(balance=10_000)
    eng = TradingEngine(cfg, ex, LongNoTP({"timeframe": "15m"}), RiskManager(cfg, 0.0005, 0.0), ex.si, ex.brackets, recorder=rec)
    eng.on_bar_closed("BTCUSDT", "15m", (0, 50_000, 50_010, 49_990, 50_000, 1, 899_999))
    assert ex.get_position("BTCUSDT") is not None
    assert [o.type for o in ex.open_orders()] == ["STOP_MARKET"]
    ex.update_market("BTCUSDT", 10, bid=50_800, ask=50_800.1, last=50_800, mark=50_800)
    assert ex.get_position("BTCUSDT") is not None                 # no TP -> still open

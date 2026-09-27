"""Trend sleeve: point-in-time universe, momentum score, breakout, simulator fills/sizing/kill, CHAN untouched."""
import numpy as np
import pytest

from quant.backtest import trend_sim as TS
from quant.strategies import trend as TR


def _panel(c, qv=None, syms=None):
    c = np.asarray(c, float)
    T, N = c.shape
    o = np.vstack([c[:1], c[:-1]])
    h, l = np.fmax(o, c) * 1.01, np.fmin(o, c) * 0.99
    days = (np.arange(T, dtype=np.int64) + 18262) * 86_400_000         # 2020-01-01 onwards
    syms = syms or ["BTC"] + [f"C{k}" for k in range(1, N)]
    qv = qv if qv is not None else np.ones((T, N))
    return TS.Panel(syms, days, o, h, l, c, qv, [None] * N, np.full(N, 3.0))


def _cfg(cfg, **kw):
    import copy
    c = copy.deepcopy(cfg)
    c["trend"].update(kw)
    return c


def test_exp_reg_score_ranks_steady_trend_above_noise():
    t = np.arange(200)
    rng = np.random.default_rng(0)
    c = np.column_stack([100 * np.exp(0.002 * t), 100 * np.exp(np.cumsum(rng.normal(0, 0.03, 200))), 100 * np.exp(-0.002 * t)])
    s = TR.exp_reg_score(c, 90)[-1]
    assert s[0] == pytest.approx(np.exp(0.002 * 365) - 1, rel=1e-6)       # R^2 = 1 for a pure exponential
    assert s[2] < 0 < s[0] and abs(s[1]) < s[0]


def test_universe_is_point_in_time_and_monthly():
    T = 120
    qv = np.ones((T, 3)); qv[:, 1] = 5; qv[95:, 2] = 100                    # C2's volume jumps on day 95
    avail = np.ones((T, 3), bool)
    days = (np.arange(T, dtype=np.int64) + 18262) * 86_400_000              # Jan 1 .. Apr 29, 2020
    m = TR.universe(qv, avail, days, 1, 10)
    assert m[60, 1] and not m[60, 2]                                        # March: C1 was the most liquid in Feb
    assert m[100, 1] and not m[100, 2]                                      # April 1 (day 91) decided on March only
    avail[70:, 1] = False
    assert not TR.universe(qv, avail, days, 1, 10)[80, 1]                   # a delisted coin leaves at once


def test_breakout_needs_trend_and_new_high():
    c = np.concatenate([np.linspace(100, 200, 150), [210.0]])[:, None]
    assert TR.breakout_signal(c, 50, 100, 50)[-1, 0] == 1
    c2 = np.concatenate([np.linspace(200, 100, 150), [210.0]])[:, None]       # new high but MA50 < MA100
    assert TR.breakout_signal(c2, 50, 100, 50)[-1, 0] == 0


def test_sim_vol_parity_stop_gap_and_kill(cfg):
    T = 400
    t = np.arange(T)
    btc = 100 * np.exp(0.003 * t)
    up = 50 * np.exp(0.004 * t)
    crash = up.copy(); crash[300:] = crash[299] * 0.5                       # gap down through the stop on day 300
    P = _panel(np.column_stack([btc, crash]))
    c = _cfg(cfg, universe_top=2, min_history=30, regime_ma=50, mom_window=30, breakout=20, ma_fast=10, ma_slow=20)
    I = TS.Indicators(P, c)
    r = TS.run(P, I, c, {"kind": "momentum", "shorts": False, "n": 2}, 120, T)
    stops = [x for x in r.trades if x["sym"] == "C1" and x["reason"] in ("STOP", "KILL")]
    assert stops, "the crash must close C1"
    assert r.daily_eq.min() > 0 and len(r.daily_eq) == T - 120
    assert stops[0]["exit_t"] == int(P.days[300])                          # the gap is filled at that day's open
    c2 = _cfg(c)
    c2["trend"]["risk"] = {**c["trend"]["risk"], "max_drawdown_kill": 0.0001}
    k = TS.run(P, I, c2, {"kind": "momentum", "shorts": False, "n": 2}, 120, T)
    assert k.killed_at is not None and np.allclose(k.daily_eq[-5:], k.daily_eq[-1])   # flat after the kill


def test_regime_blocks_new_longs_below_btc_ma(cfg):
    T = 300
    t = np.arange(T)
    btc = 100 * np.exp(-0.003 * t)                                           # BTC below its MA throughout
    alt = 50 * np.exp(0.004 * t)
    P = _panel(np.column_stack([btc, alt]))
    c = _cfg(cfg, universe_top=2, min_history=30, regime_ma=50, mom_window=30, breakout=20, ma_fast=10, ma_slow=20)
    I = TS.Indicators(P, c)
    for kind in ("momentum", "breakout"):
        r = TS.run(P, I, c, {"kind": kind, "shorts": False, "n": 2}, 100, T)
        assert not any(x["side"] > 0 for x in r.trades)


def test_chan_config_untouched_and_trend_off_by_default(cfg):
    assert cfg["trend"]["enabled"] is False
    assert cfg["risk"]["max_drawdown_kill"] == 0.10 and cfg["risk"]["risk_per_trade_cap"] == 0.01
    assert len(cfg["trend"]["variants"]) == 6

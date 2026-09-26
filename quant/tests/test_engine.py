import numpy as np
import pytest

from quant.backtest.engine import simulate
from quant.backtest.portfolio import run_portfolio
from quant.data.loader import Funding
from quant.strategies.base import Signals

from .conftest import make_bars


def one_signal(n, i, side, stop, hold=10, tp=np.nan):
    s = Signals.empty(n)
    s.side[i] = side
    (s.stop_long if side > 0 else s.stop_short)[i] = stop
    (s.tp_long if side > 0 else s.tp_short)[i] = tp
    s.max_hold[:] = hold
    return s


def test_fills_next_open_and_stop_first(cfg):
    close = np.array([100, 100, 100.5, 99, 101, 100, 100, 100, 100, 100, 100, 100], float)
    b = make_bars(close, spread=0.0)
    b.high[3], b.low[3] = 102, 97          # bar 3 touches both target and stop
    tr = simulate(b, one_signal(len(close), 1, 1, 98.0, tp=101.5), cfg, "T")[0]
    slip = 1e-4 + 0.05 * (b.high[1] - b.low[1]) / b.close[1]
    assert tr.entry_px == pytest.approx(b.open[2] * (1 + slip))
    assert tr.reason == "STOP"                      # stop assumed first when both touch
    assert tr.exit_px < 98.0                        # plus adverse slippage


def test_gap_through_stop_fills_at_open(cfg):
    close = np.array([100, 100, 100, 95, 95, 95, 95, 95], float)
    b = make_bars(close, spread=0.0)
    b.open[3] = 94.0
    tr = simulate(b, one_signal(len(close), 1, 1, 98.0), cfg, "T")[0]
    assert tr.reason == "STOP" and tr.exit_px < 94.0
    assert tr.r < -1.0                              # gap risk shows up as worse than -1R


def test_target_is_maker_and_needs_trade_through(cfg):
    close = np.array([100, 100, 100, 101, 101.2, 101, 101, 101], float)
    b = make_bars(close, spread=0.0)
    b.high[3] = 101.0                               # touches 101 exactly: not a fill
    b.high[4] = 101.3
    tr = simulate(b, one_signal(len(close), 1, 1, 98.0, tp=101.0), cfg, "T")[0]
    assert tr.reason == "TARGET" and tr.exit_px == 101.0
    assert tr.fees_q == pytest.approx(cfg["costs"]["taker_fee"] * tr.entry_px + cfg["costs"]["maker_fee"] * 101.0)


def test_timeout_and_no_trade_without_valid_stop(cfg):
    close = np.full(30, 100.0)
    b = make_bars(close, spread=0.0005)
    assert simulate(b, one_signal(30, 1, 1, np.nan), cfg, "T") == []
    assert simulate(b, one_signal(30, 1, 1, 100.5), cfg, "T") == []       # stop above a long's entry
    tr = simulate(b, one_signal(30, 1, 1, 98.0, hold=5), cfg, "T")[0]
    assert tr.reason == "TIMEOUT"


def test_funding_sign(cfg):
    close = np.full(40, 100.0)
    b = make_bars(close, spread=0.0005)
    f = Funding(np.array([b.t[5] + 1], np.int64), np.array([0.001]))
    lg = simulate(b, one_signal(40, 1, 1, 98.0, hold=20), cfg, "T", f)[0]
    sh = simulate(b, one_signal(40, 1, -1, 102.0, hold=20), cfg, "T", f)[0]
    assert lg.funding_q == pytest.approx(0.001 * lg.entry_px)     # long pays a positive rate
    assert sh.funding_q == pytest.approx(-0.001 * sh.entry_px)    # short receives it


def test_signal_exit_at_next_open(cfg):
    close = np.array([100, 100, 100, 100, 100, 100, 100, 100, 100, 100], float)
    b = make_bars(close, spread=0.0005)
    s = one_signal(10, 1, 1, 98.0, hold=8)
    s.exit_long[4] = True
    tr = simulate(b, s, cfg, "T")[0]
    assert tr.reason == "SIGNAL" and tr.exit_t == int(b.t[5])


def test_portfolio_applies_kill_switch(cfg):
    n = 400
    close = 100 * np.exp(-np.linspace(0, 0.5, n))    # steady fall
    b = make_bars(close, spread=0.001)
    s = Signals.empty(n)
    s.side[5::10] = 1
    s.stop_long[:] = close * 0.97
    s.max_hold[:] = 8
    trades = simulate(b, s, cfg, "T")
    res = run_portfolio(trades, {"BTC": b}, cfg, int(b.t[0]), int(b.t[-1]) + 1)
    eq = res.daily_equity
    assert len(res.taken) < len(trades)               # limits stopped it trading
    assert min(eq) > 10_000 * 0.8                     # never far past the 10% kill (gap/slippage allowance)

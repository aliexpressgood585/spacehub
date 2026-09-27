"""Phase 1b pieces: 4h aggregation, maker-only entries, the pairs index, the funding signal."""
import numpy as np
import pytest

from quant.backtest.engine import simulate
from quant.config import deep_merge
from quant.data.loader import Bars, Funding, aggregate
from quant.strategies import funding as FU
from quant.strategies import pairs as PA
from quant.strategies.base import Signals

from .conftest import make_bars


def test_aggregate_4h_complete_buckets_only():
    t = np.arange(10, dtype=np.int64) * 3_600_000          # 10 hourly bars from 00:00 -> two full 4h buckets
    b = Bars("X", "1h", t, np.arange(10.) + 1, np.arange(10.) + 3, np.arange(10.), np.arange(10.) + 2, np.ones(10))
    a = aggregate(b, "4h")
    assert len(a) == 2 and a.open[0] == 1 and a.close[0] == 5 and a.high[0] == 6 and a.low[0] == 0 and a.volume[0] == 4


def _one_long(n, i=5, stop=90.0):
    s = Signals.empty(n)
    s.side[i] = 1
    s.stop_long[:] = stop
    s.max_hold[:] = 3
    return s


def test_maker_entry_fills_only_when_traded_through(cfg):
    mk = deep_merge(cfg, {"execution": {"entry": "maker"}})
    b = make_bars(np.full(20, 100.0), spread=0.0)          # flat: next bar never trades below the limit -> missed
    s = _one_long(20)
    assert simulate(b, s, mk, "T") == [] and s.info["fills"] == {"attempted": 1, "filled": 0}
    b = make_bars(np.full(20, 100.0), spread=0.002)        # next bar's low 99.8 < limit 100 -> filled at 100, maker fee
    s = _one_long(20)
    tr = simulate(b, s, mk, "T")
    assert len(tr) == 1 and tr[0].entry_px == pytest.approx(100.0)
    fee_in = tr[0].fees_q - cfg["costs"]["taker_fee"] * tr[0].exit_px
    assert fee_in == pytest.approx(cfg["costs"]["maker_fee"] * 100.0)
    taker = simulate(b, _one_long(20), cfg, "T")[0]          # the default path is unchanged (taker, slippage)
    assert taker.entry_px > 100.0 and taker.pnl_q < tr[0].pnl_q


def test_pair_index_tracks_hedged_return_and_johansen_finds_cointegration(cfg):
    rng = np.random.default_rng(0)
    n = 3000
    lb = np.cumsum(rng.normal(0, 0.01, n)) + 5
    la = 0.8 * lb + rng.normal(0, 0.003, n) + 1              # cointegrated, beta 0.8
    ok, beta, _ = PA.johansen(la[-720:], lb[-720:])
    assert ok and beta == pytest.approx(0.8, abs=0.1)
    mk = lambda lp, s: make_bars(np.exp(lp), symbol=s, tf="1h")
    a, b = mk(la, "A"), mk(lb, "B")
    ix = PA.pair_index(a, b, np.full(n, 0.8), "A/B")
    r = ix.close[1:] / ix.close[:-1] - 1
    ra, rb = a.close[1:] / a.close[:-1] - 1, b.close[1:] / b.close[:-1] - 1
    assert np.allclose(r[1:], (ra - 0.8 * rb)[1:])
    assert np.all(ix.high >= ix.close) and np.all(ix.low <= ix.close) and ix.close.min() > 0


def test_funding_signal_takes_the_receiving_side_once_per_settlement():
    b = make_bars(np.full(100, 100.0), tf="1h")
    b.t = b.t[0] + np.arange(100, dtype=np.int64) * 3_600_000       # conftest spaces bars 5m apart; make them hourly
    t8 = b.t[0] + 24 * 3_600_000                             # after the ATR warm-up
    f = Funding(np.array([t8, t8 + 8 * 3_600_000], np.int64), np.array([0.002, -0.002]))
    s = FU.signals(b, f, {"threshold": 0.001, "hold_h": 8, "stop_atr": 3.0})
    sides = s.side[s.side != 0]
    assert list(sides) == [-1, 1]                             # positive funding -> short; negative -> long

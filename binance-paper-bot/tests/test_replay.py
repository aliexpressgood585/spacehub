"""Catch-up replay: 1m path hits a stop, funding is applied once, 15m bars reach the engine."""
from bot.execution.base import Order
from bot.replay import replay_minutes
from tests.test_math import make_ex


def _flat(t, px=50_000.0):
    return (t, px, px + 10, px - 10, px, 1, t + 59_999)


def test_replay_stop_on_1m_low():
    ex, rec = make_ex()
    ex.place_order(Order("BTCUSDT", "BUY", "MARKET", 0.1), 2)
    ex.place_order(Order("BTCUSDT", "SELL", "STOP_MARKET", stop_price=49_000, close_position=True), 2)
    t = 60_000
    bars = {"BTCUSDT": {t: (t, 50_000.0, 50_010.0, 47_000.0, 48_000.0, 1, t + 59_999)}}
    replay_minutes(ex, None, ["BTCUSDT"], [t], bars, {}, {}, {}, {}, {}, None)
    assert ex.get_position("BTCUSDT") is None
    assert rec.trades[-1]["reason"] == "STOP_LOSS"
    assert ex.traverse_fill is False


def test_funding_applied_once_against_isolated_margin():
    ex, _ = make_ex()
    ex.place_order(Order("BTCUSDT", "BUY", "MARKET", 0.1), 1_000)
    p = ex.get_position("BTCUSDT")
    m0, w0 = p.isolated_margin, ex.wallet
    t = 0
    bars = {"BTCUSDT": {t: _flat(t)}}
    funding = {"BTCUSDT": [{"fundingTime": 30_000, "fundingRate": "0.0001", "markPrice": "50500"}]}
    done = {}
    stats = replay_minutes(ex, None, ["BTCUSDT"], [t], bars, {}, {}, {}, funding, done, None)
    pay = -0.1 * 50_500 * 0.0001
    assert stats["funding_applied"] == 1
    assert done["BTCUSDT"] == 30_000
    assert ex.wallet == pytest_approx(w0 + pay)
    assert p.isolated_margin == pytest_approx(m0 + pay)
    replay_minutes(ex, None, ["BTCUSDT"], [t], bars, {}, {}, {}, funding, done, None)
    assert ex.wallet == pytest_approx(w0 + pay)
    assert ex.totals["funding"] == pytest_approx(pay)


def test_fifteen_minute_boundary_is_handed_to_the_engine():
    ex, _ = make_ex()
    calls = []

    class Eng:
        def on_bar_closed(self, sym, tf, row, run_strategy=True):
            calls.append((sym, tf, row[0], run_strategy))

    t = 840_000  # this minute closes exactly on a 15m boundary
    row = (0, 50_000, 50_100, 49_900, 50_050, 1, 899_999)
    stats = replay_minutes(ex, Eng(), ["BTCUSDT"], [t], {}, {}, {"BTCUSDT": {0: row}}, {}, {}, {}, None)
    assert ("BTCUSDT", "15m", 0, True) in calls
    assert stats["last_15m_open"] == 0 and stats["evaluated_15m"] == 1


def pytest_approx(v):
    import pytest
    return pytest.approx(v)

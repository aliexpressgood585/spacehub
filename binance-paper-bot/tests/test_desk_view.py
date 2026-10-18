"""Snapshot fields the live tab needs. Does not touch the wallet."""
from bot.desk import _bracket_view, _positions
from bot.execution.base import Order
from tests.test_math import make_ex


def test_position_view_carries_the_bracket_in_force():
    ex, _ = make_ex()
    ex.place_order(Order("BTCUSDT", "BUY", "MARKET", 0.1), 2)
    row = _positions(ex)[0]
    assert row["mmr"] == 0.004
    assert row["cum"] == 0.0
    assert row["side"] == "LONG"
    assert row["isolated_margin"] > 0
    view = _bracket_view(ex, ["BTCUSDT"])
    assert view[0]["symbol"] == "BTCUSDT"
    assert view[0]["brackets"][0]["mmr"] == 0.004
    assert view[0]["brackets"][1]["cum"] == 300

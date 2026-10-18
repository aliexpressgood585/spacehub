"""Tests for xs_mom_1d (cross-sectional daily momentum)."""
import numpy as np
from bot.strategies import REGISTRY
from bot.strategies.xs_momentum import xs_scores, target_book, NAME
from bot.execution.base import Position

DAY = 86_400_000


def daily(closes):
    c = np.asarray(closes, float)
    return {"open_time": np.arange(len(c)) * DAY * 1.0, "open": c, "high": c * 1.01, "low": c * 0.99, "close": c,
            "volume": np.ones(len(c)), "close_time": np.arange(len(c)) * DAY + DAY - 1.0}


def universe(n=12, days=100, seed=0):
    rng = np.random.default_rng(seed)
    out = {}
    for i in range(n):
        drift = (i - n / 2) * 0.004            # coin i has drift proportional to i -> clear ranking
        out[f"C{i:02d}USDT"] = 100 * np.exp(np.cumsum(drift + rng.normal(0, 0.02, days)))
    return out


def test_scores_rank_by_vol_normalised_momentum():
    u = universe()
    sc = xs_scores(u, lb=14, vol_win=70)
    assert len(sc) == 12
    assert sc["C11USDT"] > sc["C00USDT"]
    assert xs_scores({"X": [1.0] * 10}) == {}          # too short


def test_target_book_long_top_short_bottom():
    sc = {f"S{i}": float(i) for i in range(10)}
    b = target_book(sc, k=2, gross=1.0)
    assert b == {"S0": -0.25, "S1": -0.25, "S8": 0.25, "S9": 0.25}
    assert sum(abs(v) for v in b.values()) == 1.0
    assert target_book({"A": 1.0, "B": 2.0}, k=2) == {}  # not enough coins


def test_universe_bar_rebalance_schedule_and_signals():
    s = REGISTRY[NAME]({"k": 2, "reb_days": 3})
    u = {k: daily(v) for k, v in universe().items()}
    assert s.on_bar(None) == []
    assert s.on_universe_bar(4 * DAY, u, {}) == []      # day 4 % 3 != 0 -> no rebalance
    sig = s.on_universe_bar(3 * DAY, u, {})
    acts = {x.symbol: x.action for x in sig}
    assert len(sig) == 4 and list(acts.values()).count("OPEN_LONG") == 2
    assert all(x.info["strategy"] == NAME and x.info["target_weight"] == 0.25 and x.sl_distance > 0 for x in sig)


def test_universe_bar_closes_leavers_and_keeps_holders():
    s = REGISTRY[NAME]({"k": 2, "reb_days": 1})
    u = {k: daily(v) for k, v in universe().items()}
    first = s.on_universe_bar(DAY, u, {})
    longs = [x.symbol for x in first if x.action == "OPEN_LONG"]
    pos = {longs[0]: Position(longs[0], 1, 1.0, 100.0, 3, 33.0, 0, strategy=NAME),
           "C05USDT": Position("C05USDT", 1, 1.0, 100.0, 3, 33.0, 0, strategy=NAME)}   # middle coin -> must be closed
    sig = s.on_universe_bar(2 * DAY, u, pos)
    closes = [x.symbol for x in sig if x.action == "CLOSE"]
    opens = [x.symbol for x in sig if x.action.startswith("OPEN")]
    assert closes == ["C05USDT"] and longs[0] not in opens and len(opens) == 3


def test_live_gross_is_one_eighth_of_the_allocation_per_leg():
    """Desk config uses gross 0.30, so eight legs are 3.75% of equity notional each."""
    sc = {f"S{i}": float(i) for i in range(20)}
    b = target_book(sc, k=4, gross=0.30)
    assert len(b) == 8
    assert b["S0"] == -0.0375 and b["S19"] == 0.0375
    assert sum(abs(v) for v in b.values()) == 0.30

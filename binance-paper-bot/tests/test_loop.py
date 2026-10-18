"""Wall-clock loop: when a full cycle is due, when another job holds the desk, stops-only replay."""
import json

import pytest

from bot.desk import (HEARTBEAT_STALE_MS, account_sig, due_full, extend_replay_minutes,
                      handoff, other_loop_alive, pending_signal_hours, should_commit)
from bot.execution.base import Order
from bot.replay import replay_minutes
from bot.rest import INTERVAL_MS
from tests.test_math import make_ex

H = INTERVAL_MS["1h"]


def _at(hour, minute=0, second=0):
    return (hour * H) + minute * 60_000 + second * 1000


def test_full_cycle_waits_two_minutes_after_the_hour_close():
    # 11:00 bar closes at 12:00. Last signaled hour is 10:00.
    state = {"last_1h_open": _at(10), "last_1m_open": _at(11, 58)}
    assert due_full(_at(12, 1), state) is False
    assert due_full(_at(12, 2), state) is True
    assert due_full(_at(12, 2), {"last_1h_open": _at(11), "last_1m_open": _at(12, 1)}) is False


def test_older_hour_is_due_during_the_lag():
    state = {"last_1h_open": _at(9), "last_1m_open": _at(11, 59)}
    assert due_full(_at(12, 1), state) is True


def test_missing_cursor_is_a_full_cycle():
    assert due_full(_at(12, 5), None) is True
    assert due_full(_at(12, 5), {"last_1m_open": 1}) is True
    assert due_full(_at(12, 5), {"last_1h_open": _at(11)}) is True


def test_pending_hours_skip_the_minute_replay_will_signal():
    boundary = _at(12) - 60_000  # closing minute of the 11:00 bar
    assert pending_signal_hours(_at(10), _at(12, 5), []) == [_at(11)]
    assert pending_signal_hours(_at(10), _at(12, 5), [boundary]) == []
    # 12:01 is still inside the lag of the 11:00 bar, but 10:00's close is ready.
    assert pending_signal_hours(_at(9), _at(12, 1), []) == [_at(10)]


def test_extend_puts_the_consumed_hour_back_in_front_of_later_minutes():
    minutes, pending = extend_replay_minutes(_at(10), _at(12, 5), [_at(12, 1)])
    assert pending == [_at(11)]
    assert minutes[0] == _at(12) - 60_000
    assert minutes[-1] == _at(12, 1)
    # Already inside the window: nothing is prepended.
    same, none = extend_replay_minutes(_at(10), _at(12, 5), [_at(12) - 60_000])
    assert none == []
    assert same == [_at(12) - 60_000]


def test_other_loop_alive_requires_a_fresh_running_heartbeat():
    now = 1_000_000
    assert other_loop_alive(None, "2", now) is False
    assert other_loop_alive({"loop": {"status": "handoff", "run_id": "1", "heartbeat_ms": now}}, "2", now) is False
    assert other_loop_alive({"loop": {"status": "running", "run_id": "2", "heartbeat_ms": now}}, "2", now) is False
    assert other_loop_alive({"loop": {"status": "running", "run_id": "1", "heartbeat_ms": now - 10_000}}, "2", now) is True
    assert other_loop_alive({"loop": {"status": "running", "run_id": "1", "heartbeat_ms": now - HEARTBEAT_STALE_MS}}, "2", now) is False
    assert other_loop_alive({"loop": {"status": "running", "run_id": "1"}}, "2", now) is False


def test_price_ticks_do_not_force_a_commit_and_a_fill_does():
    before = {"wallet": 10_000, "liquidations": 0, "trades_closed": 0, "events": [], "positions": [],
              "equity": 10_000}
    priced = dict(before, equity=10_050)
    assert should_commit("stops", before, priced) is False
    assert should_commit("full", before, priced) is True
    filled = dict(before, wallet=10_010, trades_closed=1, positions=[{"symbol": "BTCUSDT", "side": "LONG", "qty": 0.01}])
    assert should_commit("stops", before, filled) is True
    assert account_sig(before) == account_sig(priced)


def test_stops_replay_hits_the_stop_and_does_not_call_the_engine():
    ex, rec = make_ex()
    ex.place_order(Order("BTCUSDT", "BUY", "MARKET", 0.1), 2)
    ex.place_order(Order("BTCUSDT", "SELL", "STOP_MARKET", stop_price=49_000, close_position=True), 2)
    t = 60_000

    class Eng:
        def on_bar_closed(self, *a, **k):
            raise AssertionError("stops replay must not run the strategy")

    bars = {"BTCUSDT": {t: (t, 50_000.0, 50_010.0, 47_000.0, 48_000.0, 1, t + 59_999)}}
    stats = replay_minutes(ex, Eng(), ["BTCUSDT"], [t], bars, {}, {}, {}, {}, {}, None, strategy_tf="stops")
    assert ex.get_position("BTCUSDT") is None
    assert rec.trades[-1]["reason"] == "STOP_LOSS"
    assert stats["evaluated_1h"] == 0 and stats["evaluated_15m"] == 0
    assert stats["last_signal_open"] is None


def test_hour_inside_the_lag_is_not_marked_signaled():
    ex, _ = make_ex()
    calls = []

    class Eng:
        def on_bar_closed(self, sym, tf, row, run_strategy=True):
            calls.append((tf, run_strategy))

    boundary = H
    t = boundary - 60_000
    row = (0, 1, 1, 1, 1, 1, boundary - 1)
    early = replay_minutes(
        ex, Eng(), ["BTCUSDT"], [t], {"BTCUSDT": {t: (t, 1, 1, 1, 1, 1, t + 59_999)}}, {}, {},
        {"BTCUSDT": {0: row}}, {}, {}, None, strategy_tf="1h", last_signal_open=None,
        strategy_ready_at=boundary + 60_000)
    assert calls == []
    assert early["last_signal_open"] is None
    ready = replay_minutes(
        ex, Eng(), ["BTCUSDT"], [t], {"BTCUSDT": {t: (t, 1, 1, 1, 1, 1, t + 59_999)}}, {}, {},
        {"BTCUSDT": {0: row}}, {}, {}, None, strategy_tf="1h", last_signal_open=None,
        strategy_ready_at=boundary + 120_000)
    assert calls == [("1h", True)]
    assert ready["last_signal_open"] == 0


def test_handoff_keeps_the_wallet_and_does_not_create_an_account(tmp_path):
    missing = tmp_path / "missing.json"
    assert handoff(str(missing), run_id="9", now=1_700_000_000_000) is None
    assert not missing.exists()
    path = tmp_path / "state.json"
    path.write_text(json.dumps({"wallet": 10000, "equity": 10000, "paper": True, "trades": [1]}))
    snap = handoff(str(path), run_id="9", now=1_700_000_000_000)
    assert snap["wallet"] == 10000
    assert snap["trades"] == [1]
    assert snap["loop"]["status"] == "handoff"
    assert snap["loop"]["run_id"] == "9"
    assert snap["loop"]["heartbeat_ms"] == 1_700_000_000_000
    disk = json.loads(path.read_text())
    assert disk["wallet"] == 10000
    assert disk["loop"]["mode"] == "handoff"


def test_stop_cycle_does_not_write_when_an_open_symbol_has_no_filters(tmp_path, monkeypatch):
    path = tmp_path / "state.json"
    original = {
        "wallet": 10000.0, "equity": 10000.0, "paper": True, "live_trading": False,
        "symbols": ["BTCUSDT", "ZECUSDT"],
        "last_1h_open": _at(11), "last_1m_open": _at(12, 1),
        "strategy": {"name": "ema_trend_4h"},
        "exchange": {"wallet": 10000.0, "positions": {"ZECUSDT": {"qty": 1}}, "orders": [],
                     "markets": {}, "leverage": {}, "totals": {}},
    }
    path.write_text(json.dumps(original))

    class Feed:
        kind = "binance"

    monkeypatch.setattr("bot.desk.connect", lambda cfg: (Feed(), []))
    monkeypatch.setattr("bot.desk.fetch_exchange_info", lambda cfg, feed: (None, None))
    monkeypatch.setattr("bot.desk.load_meta", lambda *a, **k: ({"BTCUSDT": object()}, object(), "cache"))
    from bot.desk import run_stops
    with pytest.raises(RuntimeError, match="state left untouched"):
        run_stops(str(path), now=_at(12, 3))
    assert json.loads(path.read_text()) == original

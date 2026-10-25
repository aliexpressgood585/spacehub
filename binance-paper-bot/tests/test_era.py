"""Era-2 reset, $100 min-notional sizing, disabled rules, and the drawdown halt."""
import io
import json
from contextlib import redirect_stdout
from datetime import datetime, timezone

from bot.clock import closed_bar_open, opens_after
from bot.config import load_config
from bot.desk import (account_is_fresh, archive_path_for, consume_era, due_full,
                      run, run_stops, should_commit, strategy_specs, tick, _print_cycle)
from bot.engine import TradingEngine
from bot.execution.base import Order
from bot.risk import RiskManager
from bot.strategies.base import Signal
from bot.symbols import SymbolInfo
from bot.universe import is_current
from tests.test_engine import AlwaysLong
from tests.test_math import make_ex


def test_era_reset_archives_once_and_the_next_cycle_keeps_the_book(tmp_path):
    cfg = load_config()
    path = tmp_path / "binance-paper" / "state.json"
    path.parent.mkdir()
    old = {
        "wallet": 10000, "equity": 9800, "peak_equity": 11000,
        "positions": [{"symbol": "BTCUSDT", "qty": 1}],
        "trades": [{"net_pnl": 5}],
        "events": [{"type": "OPEN"}],
        "signals": [{"symbol": "ETHUSDT"}],
        "equity_curve": [{"equity": 9800}],
        "last_1m_open": 1, "last_1h_open": 1,
        "universe": [{"symbol": "BTCUSDT", "rank": 1, "median_volume": 1.0, "slippage_bps": 3}],
        "universe_ranked_at": "2026-10-18T12:47:27Z",
        "universe_month": "2026-10",
        "catchup": {"minutes": 99999, "replay": True},
        "brackets": {"BTCUSDT": [{"max_lev": 20}]},
        "engine": {
            "risk": {"day": 3, "day_start_equity": 10000, "owner_halt": {"ema_trend_4h": 3}},
            "manual": {"ids": {"manual_aggr_1": {"status": "open"}}},
            "funding_done": {"BTCUSDT": 1},
        },
        "exchange": {
            "wallet": 10000,
            "positions": {"BTCUSDT": {"qty": 1}},
            "orders": [{"id": 1, "type": "STOP_MARKET"}],
        },
    }
    path.write_text(json.dumps(old))
    now = 1_700_000_000_000
    state, reset = consume_era(str(path), json.loads(path.read_text()), cfg, now)
    assert reset is True and account_is_fresh(state, reset) is True
    arch = archive_path_for(str(path))
    saved = json.loads(open(arch).read())
    assert saved["wallet"] == 10000 and saved["positions"][0]["symbol"] == "BTCUSDT"
    assert state["era"] == 2
    assert state["wallet"] == state["equity"] == state["peak_equity"] == 100.0
    assert state["positions"] == [] and state["trades"] == []
    assert state["signals"] == [] and state["equity_curve"] == []
    assert state["brackets"] == {}
    assert state["last_1m_open"] == closed_bar_open(now, 60_000)
    assert state["last_1h_open"] == closed_bar_open(now, 3_600_000)
    assert state["last_15m_open"] == closed_bar_open(now, 900_000)
    assert due_full(now, state) is False
    assert state["universe"][0]["symbol"] == "BTCUSDT"
    assert state["universe_month"] == "2026-10"
    assert state["catchup"]["replay"] is False and state["catchup"]["minutes"] == 0
    assert state["engine"]["risk"]["owner_halt"] == {}
    assert state["engine"]["manual"] is None
    assert state["engine"]["funding_done"] == {}
    assert state["exchange"]["wallet"] == 100.0
    assert state["exchange"]["positions"] == {} and state["exchange"]["orders"] == []
    ev = [e for e in state["events"] if e["type"] == "ERA_RESET"]
    assert len(ev) == 1 and ev[0]["time"] and ev[0]["ts"] == now
    assert opens_after(state["last_1m_open"], now, 60_000) == []

    raw = open(arch, "rb").read()
    again, reset_again = consume_era(str(path), {"era": 1, "wallet": 50}, cfg, now + 1000)
    assert reset_again is True and again["wallet"] == 100.0
    assert open(arch, "rb").read() == raw

    state["positions"] = [{"symbol": "ETHUSDT", "qty": 1}]
    state["wallet"] = 101.0
    state["last_1m_open"] = now
    path.write_text(json.dumps(state))
    kept, reset2 = consume_era(str(path), json.loads(path.read_text()), cfg, now + 60_000)
    assert reset2 is False
    assert kept["wallet"] == 101.0 and kept["positions"][0]["symbol"] == "ETHUSDT"
    assert open(arch, "rb").read() == raw


def _stale_book(now):
    """Shape of the live era-less book: hour cursor behind, October universe."""
    latest_h = closed_bar_open(now, 3_600_000)
    return {
        "wallet": 9368.66, "equity": 9468.23, "peak_equity": 10164.55,
        "paper": True, "live_trading": False,
        "starting_balance": 10000.0,
        "positions": [{"symbol": "BTCUSDT", "side": "LONG", "qty": 0.01}],
        "trades": [{"net_pnl": 1.0}],
        "trades_closed": 16,
        "events": [{"type": "OPEN", "ts": 1, "symbol": "", "msg": "old"}],
        "last_1m_open": closed_bar_open(now, 60_000) - 60_000,
        "last_1h_open": latest_h - 2 * 3_600_000,
        "last_15m_open": closed_bar_open(now, 900_000) - 900_000,
        "universe": [
            {"symbol": "BTCUSDT", "rank": 1, "median_volume": 1.0e9, "slippage_bps": 1.5},
            {"symbol": "ETHUSDT", "rank": 2, "median_volume": 1.0e8, "slippage_bps": 2.0},
        ],
        "universe_ranked_at": "2026-10-18T12:47:27Z",
        "universe_month": "2026-10",
        "universe_reused": True,
        "symbols": ["BTCUSDT", "ETHUSDT"],
        "price_source": {"id": "binance", "endpoint": "https://www.binance.com",
                         "filters": "cache"},
        "exchange": {
            "wallet": 9368.66,
            "positions": {"BTCUSDT": {"qty": 0.01}},
            "orders": [{"id": 1, "symbol": "BTCUSDT", "type": "STOP_MARKET"}],
        },
    }


def test_era_tick_writes_the_book_without_ranking(tmp_path, monkeypatch):
    """The first era-2 tick must not call connect or rank_live.

    On the live file, dropping the universe made choose_universe rank every
    eligible USDT-M perpetual. That fetch outlives the 90s tick kill, the
    workflow skips the commit, and the next minute starts the rank over.
    """
    def refuse(*_a, **_k):
        raise AssertionError("era reset must not touch the network")

    monkeypatch.setattr("bot.desk.connect", refuse)
    monkeypatch.setattr("bot.desk.rank_live", refuse)
    monkeypatch.setattr("bot.desk.fetch_exchange_info", refuse)

    now = int(datetime(2026, 10, 25, 11, 5, tzinfo=timezone.utc).timestamp() * 1000)
    old = _stale_book(now)
    assert due_full(now, old) is True
    cfg = load_config()

    for fn in (tick, run, run_stops):
        path = tmp_path / fn.__name__ / "state.json"
        path.parent.mkdir(parents=True)
        path.write_text(json.dumps(old))
        if fn is tick:
            snap = fn(str(path), now=now, run_id="test-run")
        else:
            snap = fn(str(path), now)
        assert snap["era"] == 2
        assert snap["paper"] is True and snap["live_trading"] is False
        assert snap["wallet"] == snap["equity"] == snap["peak_equity"] == 100.0
        assert snap["positions"] == [] and snap["trades_closed"] == 0
        assert snap["exchange"]["orders"] == [] and snap["exchange"]["positions"] == {}
        assert [r["symbol"] for r in snap["universe"]] == ["BTCUSDT", "ETHUSDT"]
        assert is_current(snap, now) is True
        assert due_full(now, snap) is False
        assert opens_after(snap["last_1m_open"], now, 60_000) == []
        assert any(e["type"] == "ERA_RESET" and e["ts"] == now for e in snap["events"])
        arch = archive_path_for(str(path))
        saved = json.loads(open(arch).read())
        assert saved["wallet"] == 9368.66
        assert saved["positions"][0]["symbol"] == "BTCUSDT"
        on_disk = json.loads(path.read_text())
        assert on_disk["era"] == 2 and on_disk["equity"] == 100.0
        kept, reset2 = consume_era(str(path), on_disk, cfg, now + 60_000)
        assert reset2 is False and kept["equity"] == 100.0

    path = tmp_path / "tick" / "state.json"
    snap = json.loads(path.read_text())
    assert snap["loop"]["mode"] == "era" and snap["loop"]["status"] == "running"
    assert due_full(now + 60_000, snap) is False
    assert should_commit("era", old, snap) is True
    buf = io.StringIO()
    with redirect_stdout(buf):
        _print_cycle(snap, commit=should_commit(snap["loop"]["mode"], old, snap))
    printed = buf.getvalue()
    assert "commit=yes" in printed
    assert "equity=100.00" in printed and "positions=0" in printed

    raw = open(archive_path_for(str(path)), "rb").read()

    def network(*_a, **_k):
        raise RuntimeError("network")

    monkeypatch.setattr("bot.desk.connect", network)
    try:
        tick(str(path), now=now + 60_000, run_id="test-run")
        raised = False
    except RuntimeError as e:
        raised = str(e) == "network"
    assert raised is True
    assert json.loads(path.read_text())["era"] == 2
    assert open(archive_path_for(str(path)), "rb").read() == raw


def _size(balance, sl, leverage, symbol="BTCUSDT", min_notional=100.0, step=0.001):
    ex, _ = make_ex(balance=balance)
    ex.si[symbol] = SymbolInfo(symbol, 0.1, step, step, 1000, step, step, 1000, min_notional)
    if symbol not in ex.mkt:
        from bot.execution.paper import Market
        ex.mkt[symbol] = Market()
    ex.update_market(symbol, 1, bid=50_000.0, ask=50_000.1, last=50_000.0, mark=50_000.0)
    risk = RiskManager(load_config(), 0.0005, 0.0)
    sig = Signal(symbol, "OPEN_LONG", sl, 0.0, leverage, "test")
    return risk.size(sig, ex, ex.si[symbol], ex.brackets, 1_000)


def test_min_notional_rounds_up_only_inside_risk_and_margin():
    # 5% risk on a $100 book. A 1000 USDT stop rounds down inside BTC's 100 floor.
    qty, why = _size(100, sl=1000, leverage=5)
    assert why == "ok"
    assert qty == 0.004
    assert qty * 50_000.1 >= 100

    # Raw size already equals the 100 floor, so no round-up is required.
    qty, why = _size(100, sl=2000, leverage=5)
    assert why == "ok" and qty == 0.002

    # Margin cap (60% of equity at 2x) still clears the floor.
    qty, why = _size(100, sl=800, leverage=2)
    assert why == "size capped by margin limit" and qty == 0.002

    # Round-up to 0.002 stays inside the 7% risk allowance.
    qty, why = _size(100, sl=3400, leverage=10)
    assert why == "ok" and qty == 0.002

    # The same round-up would risk more than 7%. Leave the order unsent.
    qty, why = _size(100, sl=3450, leverage=10)
    assert qty == 0 and why == "below min notional"

    risk = RiskManager(load_config(), 0.0005, 0.0)
    ex, _ = make_ex(balance=100)
    qty, why = risk.size(Signal("BTCUSDT", "OPEN_LONG", 0.0, 0.0, 5, "no stop"),
                         ex, ex.si["BTCUSDT"], ex.brackets, 1_000)
    assert qty == 0 and ex.get_position("BTCUSDT") is None


def test_disabled_strategies_emit_no_entries():
    cfg = load_config()
    specs = strategy_specs(cfg)
    assert specs[0].name == "ema_trend_4h"
    assert all(s.name not in ("orb_ny_15m", "xs_mom_1d") for s in specs)
    ex, rec = make_ex(balance=100)
    risk = RiskManager(cfg, 0.0005, 0.0)
    eng = TradingEngine(cfg, ex, specs[0], risk, ex.si, ex.brackets, recorder=rec, strategies=specs)
    eng.on_bar_closed("BTCUSDT", "15m", (0, 50_000, 50_010, 49_990, 50_000, 1, 899_999))
    eng.on_timeframe_done("1d", 86_400_000)
    assert ex.get_position("BTCUSDT") is None
    assert not any(e.get("strategy") in ("orb_ny_15m", "xs_mom_1d") for e in rec.events)


def test_drawdown_halt_blocks_new_entries():
    cfg = load_config()
    ex, rec = make_ex(balance=10_000)
    risk = RiskManager(cfg, 0.0005, 0.0)
    risk.peak_equity = 10_000
    ex.wallet = 5_000
    eng = TradingEngine(cfg, ex, AlwaysLong({}), risk, ex.si, ex.brackets, recorder=rec)
    eng.handle(Signal("BTCUSDT", "OPEN_LONG", 500.0, 0.0, 3, "test"), 1_000, eng.strat)
    assert ex.get_position("BTCUSDT") is None
    assert any(e["type"] == "HALT_DRAWDOWN" for e in rec.events)
    eng.handle(Signal("BTCUSDT", "OPEN_LONG", 500.0, 0.0, 3, "test"), 2_000, eng.strat)
    assert ex.get_position("BTCUSDT") is None
    assert sum(1 for e in rec.events if e["type"] == "HALT_DRAWDOWN") == 1

    ex.wallet = 7_100
    risk.drawdown_halt = False
    eng.handle(Signal("BTCUSDT", "OPEN_LONG", 500.0, 0.0, 3, "test"), 3_000, eng.strat)
    assert ex.get_position("BTCUSDT") is not None


def test_open_risk_to_stop_stays_within_15_percent():
    ex, _ = make_ex(balance=10_000)
    ex.place_order(Order("BTCUSDT", "BUY", "MARKET", 0.5), 2)
    pos = ex.get_position("BTCUSDT")
    pos.meta["sl"] = pos.entry_price - 1_000
    eth = SymbolInfo("ETHUSDT", 0.01, 0.001, 0.001, 10000, 0.001, 0.001, 10000, 20)
    ex.si["ETHUSDT"] = eth
    from bot.execution.paper import Market
    ex.mkt["ETHUSDT"] = Market()
    ex.leverage["ETHUSDT"] = 5
    ex.update_market("ETHUSDT", 3, bid=3_000.0, ask=3_000.1, last=3_000.0, mark=3_000.0)
    risk = RiskManager(load_config(), 0.0005, 0.0)
    sig = Signal("ETHUSDT", "OPEN_LONG", 30.0, 0.0, 5, "add")
    qty, why = risk.size(sig, ex, eth, ex.brackets, 4_000)
    assert qty > 0 and why
    new_risk = qty * (30.0 + 3_000.1 * 0.001)
    assert 0.5 * 1_000 + new_risk <= 10_000 * 0.15 + 1.0

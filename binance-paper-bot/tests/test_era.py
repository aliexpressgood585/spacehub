"""Era-2 reset, $100 min-notional sizing, disabled rules, and the drawdown halt."""
import json

from bot.clock import opens_after
from bot.config import load_config
from bot.desk import account_is_fresh, archive_path_for, consume_era, strategy_specs
from bot.engine import TradingEngine
from bot.execution.base import Order
from bot.risk import RiskManager
from bot.strategies.base import Signal
from bot.symbols import SymbolInfo
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
    assert state["last_1m_open"] is None and state["last_1h_open"] is None
    assert state["catchup"]["replay"] is False and state["catchup"]["minutes"] == 0
    assert state["engine"]["risk"]["owner_halt"] == {}
    assert state["engine"]["manual"] is None
    assert state["engine"]["funding_done"] == {}
    assert "exchange" not in state or not (state.get("exchange") or {}).get("orders")
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
    qty, why = _size(100, sl=1000, leverage=5)
    assert why == "ok"
    assert qty == 0.002
    assert qty * 50_000.1 >= 100

    qty, why = _size(100, sl=2000, leverage=5)
    assert qty == 0 and why == "below min notional"

    qty, why = _size(100, sl=800, leverage=2)
    assert qty == 0 and why == "below min notional"

    risk = RiskManager(load_config(), 0.0005, 0.0)
    ex, _ = make_ex(balance=100)
    qty, why = risk.size(Signal("BTCUSDT", "OPEN_LONG", 0.0, 0.0, 5, "no stop"),
                         ex, ex.si["BTCUSDT"], ex.brackets, 1_000)
    assert qty == 0 and ex.get_position("BTCUSDT") is None


def test_disabled_strategies_emit_no_entries():
    cfg = load_config()
    specs = strategy_specs(cfg)
    assert [s.name for s in specs] == ["ema_trend_4h"]
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
    ex.wallet = 7_000
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


def test_open_risk_to_stop_stays_within_6_percent():
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
    assert 0.5 * 1_000 + new_risk <= 10_000 * 0.06 + 1.0

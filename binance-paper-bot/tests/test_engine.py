"""Engine integration: signal -> risk sizing -> market entry -> SL/TP orders -> exit."""
import pytest
from bot.config import load_config
from bot.engine import TradingEngine
from bot.risk import RiskManager
from bot.strategies.base import Strategy, Signal
from bot.storage import MemoryRecorder
from tests.test_math import make_ex


class AlwaysLong(Strategy):
    name = "always_long"
    def on_bar(self, ctx):
        return [] if ctx.position else [Signal(ctx.symbol, "OPEN_LONG", 500.0, 750.0, 3, "test")]


def test_engine_entry_sizing_and_bracket_orders():
    cfg = load_config()
    ex, rec = make_ex(balance=10_000)
    ex.leverage["BTCUSDT"] = 3
    risk = RiskManager(cfg, 0.0005, 0.0)
    strat = AlwaysLong({"timeframe": "15m"})
    eng = TradingEngine(cfg, ex, strat, risk, ex.si, ex.brackets, recorder=rec)
    eng.on_bar_closed("BTCUSDT", "15m", (0, 50_000, 50_010, 49_990, 50_000, 1, 899_999))
    p = ex.get_position("BTCUSDT")
    assert p is not None and p.leverage == 3
    # 5% of 10k at a 500 stop is about 0.91 BTC. Margin cap 60% * 3x = 18000 notional.
    assert p.qty * p.entry_price <= 10_000 * 0.60 * 3 + 1
    assert p.qty == pytest.approx(0.359, abs=0.001)
    types = sorted(o.type for o in ex.open_orders())
    assert types == ["STOP_MARKET", "TAKE_PROFIT_MARKET"]
    sl = [o for o in ex.open_orders() if o.type == "STOP_MARKET"][0]
    assert sl.stop_price == pytest.approx(p.entry_price - 500, abs=0.1)
    ex.update_market("BTCUSDT", 10, bid=50_800, ask=50_800.1, last=50_800, mark=50_800)
    assert ex.get_position("BTCUSDT") is None and rec.trades[-1]["reason"] == "TAKE_PROFIT"
    assert not ex.open_orders()

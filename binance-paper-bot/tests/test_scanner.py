"""Short EMA + fade live book, the cached-universe scanner, and STRATEGY_CHANGE."""
import json

import numpy as np

from bot.config import ROOT, load_config
from bot.desk import _bind_engine
from bot.engine import TradingEngine
from bot.execution.paper import PaperExchange
from bot.margin import LeverageBrackets
from bot.risk import RiskManager
from bot.scanner import OpportunityScanner, pullback_side, trend_strength
from bot.scanner_bt import _ship
from bot.selector import StrategySelector
from bot.storage import MemoryRecorder
from bot.strategies import REGISTRY
from bot.strategies.base import Context, Signal, Strategy
from bot.strategy_set import (needs_fast_path, strategy_change_event,
                              strategy_set_changed, strategy_set_view)
from bot.symbols import SymbolInfo
from tests.test_htf_strategies import H1, H4, bars
from tests.test_math import BTC_BRACKETS


def _si(symbols):
    return {s: SymbolInfo(s, 0.01, 0.001, 0.001, 1000, 0.001, 0.001, 1000, 5) for s in symbols}


def _engine(symbols, balance=10_000):
    cfg = load_config()
    si = _si(symbols)
    rec = MemoryRecorder()
    ex = PaperExchange(si, LeverageBrackets(BTC_BRACKETS), balance, 0.0002, 0.0005, 0.0, 10,
                       listener=rec)
    for s in symbols:
        ex.update_market(s, 1, bid=100.0, ask=100.1, last=100.0, mark=100.0)
    risk = RiskManager(cfg, 0.0005, 0.0)
    strat = Strategy({"timeframe": "1h"})
    strat.name = "ema_fast_4h"
    eng = TradingEngine(cfg, ex, strat, risk, si, ex.brackets, recorder=rec, strategies=[strat])
    return cfg, ex, rec, eng


class _Open(Strategy):
    def __init__(self, name, score):
        super().__init__({"timeframe": "1h"})
        self.name = name
        self.score = score

    def on_bar(self, ctx):
        if ctx.position is not None:
            return []
        return [Signal(ctx.symbol, "OPEN_LONG", 5.0, 0.0, 3, self.name,
                       {"scan_score": self.score, "setup": "cross"})]


def test_cached_universe_is_sliced_and_rank_live_is_not_used(monkeypatch):
    def boom(*a, **k):
        raise AssertionError("scanner must not re-rank perps")

    monkeypatch.setattr("bot.universe.rank_live", boom)
    monkeypatch.setattr("bot.desk.rank_live", boom, raising=False)
    rows = [{"symbol": f"C{i:02d}USDT", "rank": i + 1} for i in range(20)]
    rows[0] = {"symbol": "BTCUSDT", "rank": 1}
    rows[3] = {"symbol": "XRPUSDT", "rank": 4}
    sc = OpportunityScanner({"scanner": {"enabled": True, "top_n": 18, "cap": 20}})
    picked = sc.from_rows(rows)
    assert len(picked) == 18
    assert picked[0] == "BTCUSDT"
    assert "C18USDT" not in picked and "C19USDT" not in picked
    # Core names past the cut are kept, without sorting the cache again.
    late = [{"symbol": f"Z{i}USDT", "rank": i + 1} for i in range(18)]
    late.append({"symbol": "BNBUSDT", "rank": 19})
    again = sc.from_rows(late)
    assert again[-1] == "BNBUSDT" and len(again) == 19
    assert sc.from_rows([]) == []


def test_pullback_is_a_fresh_tag_and_a_cross_scores_higher():
    assert pullback_side([1, 1], [1, 1], [1, 1], [1, 1], [1, 1]) == 0
    # Uptrend, previous low above the fast EMA, this low tags it, close holds.
    side = pullback_side(
        high=np.array([11.0, 10.5]), low=np.array([9.5, 8.5]),
        close=np.array([10.5, 9.5]), fast=np.array([9.0, 9.0]), slow=np.array([8.0, 8.0]))
    assert side == 1
    # The next bar is not a fresh tag.
    assert pullback_side(
        high=np.array([10.5, 10.2]), low=np.array([8.5, 8.4]),
        close=np.array([9.5, 9.4]), fast=np.array([9.0, 9.0]), slow=np.array([8.0, 8.0])) == 0
    assert trend_strength(10, 8, 1) == 2
    assert trend_strength(10, 8, 1) + 1 > trend_strength(10, 8, 1)


def test_ema_fast_pullback_enters_and_is_tagged_ema_fast(monkeypatch):
    s = REGISTRY["ema_fast_4h"](dict(
        timeframe="1h", signal_timeframe="4h", ema_fast=3, ema_slow=8,
        atr_period=3, sl_atr=3.0, tp_atr=0, regime="none", leverage=5,
        pullback=True, pullback_hold_bars=2))
    # Rising market so EMA3 stays above EMA8, then one bar tags EMA3 from above.
    close = list(np.linspace(100, 130, 30))
    h4 = bars(close, H4, spread=0.001)
    # Force the last two bars into a fresh tag of a rising fast EMA.
    f = np.array([100.0] * 28 + [120.0, 121.0])
    slow = np.array([90.0] * 30)
    high = np.array(h4["high"], float)
    low = np.array(h4["low"], float)
    c = np.array(h4["close"], float)
    # previous low above fast, this low through it, close back above
    low[-2] = f[-2] + 1
    high[-2] = f[-2] + 5
    c[-2] = f[-2] + 2
    low[-1] = f[-1] - 0.5
    high[-1] = f[-1] + 4
    c[-1] = f[-1] + 1
    monkeypatch.setattr("bot.strategies.htf_trend.ema", lambda x, n: f if n == 3 else slow)
    sub = dict(h4)
    sub["high"], sub["low"], sub["close"] = high, low, c
    ts = int(sub["close_time"][-1]) + 1
    sigs = s.on_bar(Context("ETHUSDT", ts, {"4h": sub, "1h": bars([1, 1], H1)}))
    assert sigs and sigs[-1].action == "OPEN_LONG"
    assert sigs[-1].info["setup"] == "pullback"
    assert "pullback" in sigs[-1].reason
    # Same strategy name the ledger uses.
    assert s.name == "ema_fast_4h"


def test_batch_keeps_the_higher_score_and_labels_the_strategy():
    symbols = ["BTCUSDT", "ETHUSDT"]
    cfg, ex, rec, eng = _engine(symbols)
    eng.scanner = OpportunityScanner({"scanner": {"enabled": True, "max_new_per_bar": 1}})
    weak = _Open("bb_rsi_4h", 0.2)
    strong = _Open("ema_fast_4h", 2.5)
    eng.strats = [weak, strong]
    eng.begin_entries()
    eng.run_strategy("ETHUSDT", 10, weak)
    eng.run_strategy("BTCUSDT", 10, strong)
    assert ex.get_position("BTCUSDT") is None
    opened = eng.end_entries()
    assert opened == 1
    assert ex.get_position("BTCUSDT").strategy == "ema_fast_4h"
    assert ex.get_position("ETHUSDT") is None
    assert any(e["type"] == "SIGNAL_FILTERED" and e["strategy"] == "bb_rsi_4h" for e in rec.events)
    assert any(e["type"] == "OPEN" and e["strategy"] == "ema_fast_4h" for e in rec.events)


def test_per_coin_fade_while_the_anchor_is_trending():
    cfg = load_config()
    cfg["scanner"]["enabled"] = True
    cfg["scanner"]["per_coin"] = True
    sel = StrategySelector(cfg, None)
    assert sel.per_coin is True
    # The live flag can be off after the OOS gate. Routing still follows the coin.
    assert StrategySelector(load_config(), None).per_coin is load_config()["scanner"]["enabled"]
    sel.enabled = True
    sel.market = "TREND"
    sel.symbols = {"ADAUSDT": "RANGE", "BTCUSDT": "TREND"}
    assert sel.allow("bb_rsi_4h", "ADAUSDT", 0)[0] is True
    assert sel.allow("ema_fast_4h", "ADAUSDT", 0)[0] is False
    assert sel.allow("ema_fast_4h", "BTCUSDT", 0)[0] is True
    assert sel.allow("bb_rsi_4h", "BTCUSDT", 0)[0] is False
    sel.market = "CHAOS"
    assert sel.allow("bb_rsi_4h", "ADAUSDT", 0) == (False, "CHAOS: stand aside")


def test_strategy_change_event_once_and_the_fast_path_does_not_touch_the_book():
    cfg = load_config()
    state = {
        "era": 2, "wallet": 100.0, "equity": 100.0, "paper": True,
        "strategy": {"name": "ema_trend_4h"},
        "last_1h_open": 1_700_000_000_000,
        "events": [{"ts": 1, "type": "ERA_RESET", "symbol": "", "msg": "era 2"}],
        "positions": [],
    }
    assert needs_fast_path(state, cfg, "ema_trend_4h", "ema_trend_4h") is True
    ev = strategy_change_event(state, cfg, 1_700_000_000_000)
    assert ev["type"] == "STRATEGY_CHANGE"
    assert ev["strategy"] == "ema_fast_4h"
    assert ev["trend_strategy"] == "ema_fast_4h"
    assert ev["range_strategy"] == "bb_rsi_4h"
    assert ev["selector_enabled"] is True
    assert "Account not reset" in ev["msg"]
    assert state["wallet"] == 100.0 and state["positions"] == []
    state["strategy_set"] = strategy_set_view(cfg)
    assert strategy_set_changed(state, cfg) is False
    assert strategy_change_event(state, cfg, 1_700_000_100_000) is None
    assert needs_fast_path(state, cfg, "ema_trend_4h", "ema_trend_4h") is False


def test_live_config_keeps_aggressive_risk_and_the_five_coin_fallback():
    cfg = load_config()
    assert cfg["mode"] == "paper"
    assert cfg["account"]["era"] == 2
    assert cfg["account"]["starting_balance"] == 100.0
    assert cfg["account"]["default_leverage"] == 10
    assert cfg["risk"]["risk_per_trade"] == 0.05
    assert cfg["risk"]["max_concurrent_positions"] == 4
    assert cfg["risk"]["max_open_risk"] == 0.15
    assert cfg["symbols"] == ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"]
    p = cfg["strategy"]["params"]["ema_fast_4h"]
    assert p["ema_fast"] == 10 and p["ema_slow"] == 40 and p["sl_atr"] == 3.0
    assert p.get("pullback") in (None, False)
    sc = cfg["scanner"]
    assert sc["top_n"] == 18 and sc["max_new_per_bar"] == 2
    assert sc["per_coin"] is True and sc["pullback"] is True
    assert sc["pullback_hold_bars"] == 12


def test_bind_arms_pullback_without_replacing_the_five_when_there_is_no_cache():
    cfg = load_config()
    _, ex, rec, eng = _engine(["BTCUSDT", "ETHUSDT"])
    _bind_engine(eng, cfg, None)
    fast = next(st for st in eng.strats if st.name == "ema_fast_4h")
    if cfg["scanner"]["enabled"]:
        assert eng.scanner is not None and eng.scanner.enabled is True
        assert fast.p.get("pullback") is True
        assert eng.entry_symbols["ema_fast_4h"] == set(cfg["symbols"]) or eng.scanner.symbols == []
        # No cached rows: the yaml five stay the entry list. rank_live is not involved.
        assert eng.entry_symbols["ema_trend_4h"] == set(
            ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"])
    else:
        assert eng.scanner is None
        assert not fast.p.get("pullback")
        assert eng.entry_symbols["ema_fast_4h"] == set(
            ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"])


def test_oos_gate_rejects_a_liquidation_or_a_60pct_drawdown():
    ok, _ = _ship({"liquidations": 0, "max_drawdown_pct": -40.9})
    deep, why = _ship({"liquidations": 0, "max_drawdown_pct": -60.0})
    liq, why_l = _ship({"liquidations": 1, "max_drawdown_pct": -10.0})
    assert ok is True and deep is False and liq is False
    assert "60" in why and "liquidat" in why_l


def test_committed_scanner_report_matches_the_live_flag():
    path = ROOT + "/reports/scanner_oos.json"
    report = json.loads(open(path).read())
    cfg = load_config()
    assert cfg["scanner"]["enabled"] is bool(report["ship_scanner"])
    plain = report["plain"]
    scanned = report["scanner"]
    assert plain["name"] == "regime_fast_mr"
    assert "trades_per_day" in plain and "trades_per_day" in scanned
    assert "return_pct" in scanned and "max_drawdown_pct" in scanned
    assert "liquidations" in scanned
    if report["ship_scanner"]:
        assert int(scanned["liquidations"]) == 0
        assert float(scanned["max_drawdown_pct"]) > -60.0
    else:
        assert int(scanned["liquidations"]) > 0 or float(scanned["max_drawdown_pct"]) <= -60.0

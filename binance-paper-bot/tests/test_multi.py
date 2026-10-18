"""Two extra paper rules share the account and do not close each other's positions."""
import pytest

from bot.config import load_config
from bot.desk import (bootstrap_flat, other_loop_alive, rebalance_still_due,
                      risk_overrides, strategy_specs, strategy_view)
from bot.engine import TradingEngine
from bot.execution.base import Order, Position
from bot.replay import replay_minutes
from bot.risk import RiskManager, delist_margin_reserve
from bot.strategies import REGISTRY
from bot.strategies.base import Strategy, Signal
from bot.strategies.xs_momentum import NAME, target_book, xs_scores
from tests.test_math import BTC_BRACKETS, make_ex
from tests.test_xs_momentum import DAY, universe

from bot.margin import LeverageBrackets
from bot.symbols import SymbolInfo
from bot.execution.paper import PaperExchange
from bot.storage import MemoryRecorder


class Named(Strategy):
    def __init__(self, name, timeframe="1h"):
        super().__init__({"timeframe": timeframe})
        self.name = name

    def on_bar(self, ctx):
        return []


class LimitEntry(Strategy):
    name = "orb_ny_15m"

    def __init__(self):
        super().__init__({"timeframe": "15m"})
        self.name = "orb_ny_15m"

    def on_bar(self, ctx):
        if ctx.position is not None:
            return []
        return [Signal(ctx.symbol, "OPEN_LONG", 500.0, 1000.0, 3, "orb",
                       {"tp_order": "limit", "exit_ts": 9_000_000})]


def _book(symbols, balance=10_000):
    si = {}
    for s in symbols:
        si[s] = SymbolInfo(s, 0.1, 0.001, 0.001, 1000, 0.001, 0.001, 1000, 5)
    rec = MemoryRecorder()
    ex = PaperExchange(si, LeverageBrackets(BTC_BRACKETS), balance, 0.0002, 0.0005, 0.0, 3,
                       listener=rec)
    for s in symbols:
        ex.update_market(s, 1, bid=100.0, ask=100.1, last=100.0, mark=100.0)
    return ex, rec


def _engine(ex, rec, names):
    cfg = load_config()
    risk = RiskManager(cfg, 0.0005, 0.0)
    strats = [Named(n, "15m" if n == "orb_ny_15m" else "1h") for n in names]
    eng = TradingEngine(cfg, ex, strats[0], risk, ex.si, ex.brackets, recorder=rec, strategies=strats)
    eng.overrides = risk_overrides(cfg)
    return eng, {s.name: s for s in strats}


def test_config_keeps_ema_and_lists_orb_and_xs():
    cfg = load_config()
    names = [s.name for s in strategy_specs(cfg)]
    assert names == ["ema_trend_4h", "delist_short", "orb_ny_15m", "xs_mom_1d"]
    assert cfg["strategy"]["name"] == "ema_trend_4h"
    assert cfg["risk"]["max_margin_per_position"] == 0.30
    assert cfg["risk"]["max_daily_loss"] == 0.05
    assert cfg["strategy"]["params"]["orb_ny_15m"]["win"] == 3
    assert cfg["strategy"]["params"]["xs_mom_1d"]["gross"] == 0.15
    ov = risk_overrides(cfg)
    assert ov["ema_trend_4h"]["max_concurrent_positions"] == 3
    assert "experimental" not in ov["ema_trend_4h"]
    assert ov["orb_ny_15m"]["risk_per_trade"] == 0.0025
    assert ov["orb_ny_15m"]["experimental"] is True
    assert ov["orb_ny_15m"]["max_concurrent_positions"] == 2
    assert ov["orb_ny_15m"]["max_daily_loss"] == 0.02
    assert ov["xs_mom_1d"]["experimental"] is True
    assert ov["xs_mom_1d"]["max_concurrent_positions"] == 8
    assert ov["xs_mom_1d"]["max_daily_loss"] == 0.02
    assert ov["delist_short"]["max_concurrent_positions"] == 10
    assert ov["delist_short"]["max_daily_loss"] == 0.02
    assert "experimental" not in ov["delist_short"]
    assert "risk_per_trade" not in ov["delist_short"]
    orb = strategy_view(REGISTRY["orb_ny_15m"]({}), cfg)
    xs = strategy_view(REGISTRY["xs_mom_1d"](cfg["strategy"]["params"]["xs_mom_1d"]), cfg)
    assert orb["backtest"]["oos"]["return_pct"] == 11.1
    assert orb["experimental"] is True
    assert "not a proven edge" in orb["backtest"]["note"]
    assert "forward test" in orb["backtest"]["note"]
    assert xs["experimental"] is True
    assert xs["backtest"]["oos"]["return_pct"] == 37.8
    assert xs["backtest"]["oos"]["return_pct_conservative"] == 13.0
    assert xs["backtest"]["oos"]["max_dd_pct"] == -11.2
    assert xs["backtest"]["oos"]["corr_ema_trend_4h"] == 0.05
    assert "Not a proven live edge" in xs["backtest"]["note"]


def test_one_strategy_cannot_close_or_open_the_others_symbol():
    ex, rec = make_ex()
    eng, by = _engine(ex, rec, ["ema_trend_4h", "orb_ny_15m"])
    ex.place_order(Order("BTCUSDT", "BUY", "MARKET", 0.01, tag="orb_ny_15m"), 2)
    held = ex.get_position("BTCUSDT")
    eng.handle(Signal("BTCUSDT", "CLOSE", reason="ema flip"), 3, by["ema_trend_4h"])
    assert ex.get_position("BTCUSDT") is held
    eng.handle(Signal("BTCUSDT", "OPEN_LONG", 500.0, 0.0, 3, "ema"), 4, by["ema_trend_4h"])
    assert ex.get_position("BTCUSDT").strategy == "orb_ny_15m"
    assert any(e["type"] == "RISK_REJECT" and e.get("strategy") == "ema_trend_4h" for e in rec.events)


def test_caps_are_counted_per_strategy():
    syms = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT"]
    ex, rec = _book(syms)
    eng, by = _engine(ex, rec, ["ema_trend_4h", "orb_ny_15m"])
    cfg = load_config()
    risk = eng.risk
    for s in ("ETHUSDT", "SOLUSDT", "BNBUSDT"):
        ex.place_order(Order(s, "BUY", "MARKET", 0.2, tag="ema_trend_4h"), 2)
    for s in ("XRPUSDT", "DOGEUSDT"):
        ex.place_order(Order(s, "BUY", "MARKET", 0.2, tag="orb_ny_15m"), 2)
    ts = 3 * DAY
    ema_sig = Signal("BTCUSDT", "OPEN_LONG", 5.0, 0.0, 3, "ema")
    orb_sig = Signal("BTCUSDT", "OPEN_SHORT", 5.0, 0.0, 3, "orb")
    q_ema, why_ema = risk.size(ema_sig, ex, ex.si["BTCUSDT"], ex.brackets, ts,
                               owner="ema_trend_4h", owner_max_pos=3, owner_risk=0.01)
    q_orb, why_orb = risk.size(orb_sig, ex, ex.si["BTCUSDT"], ex.brackets, ts,
                               owner="orb_ny_15m", owner_max_pos=2, owner_risk=0.005)
    assert q_ema == 0 and "max concurrent" in why_ema
    assert q_orb == 0 and "max concurrent" in why_orb
    # Drop one of each. The other strategy's book does not free the slot.
    ex.pos.pop("BNBUSDT")
    q_ema, _ = risk.size(ema_sig, ex, ex.si["BTCUSDT"], ex.brackets, ts,
                         owner="ema_trend_4h", owner_max_pos=3, owner_risk=0.01)
    q_orb, why_orb = risk.size(orb_sig, ex, ex.si["BTCUSDT"], ex.brackets, ts,
                               owner="orb_ny_15m", owner_max_pos=2, owner_risk=0.005)
    assert q_ema > 0 and q_orb == 0 and "max concurrent" in why_orb
    assert cfg["risk"]["max_concurrent_positions"] == 3


def test_owner_daily_loss_latches_until_the_next_utc_day():
    ex, rec = make_ex()
    eng, by = _engine(ex, rec, ["ema_trend_4h", "orb_ny_15m"])
    ts = 3 * DAY + 3_600_000
    loss = {"symbol": "ETHUSDT", "strategy": "orb_ny_15m", "open_ts": 1, "close_ts": ts,
            "net_pnl": -300.0}
    eng.closed_trades = [loss]
    sig = Signal("BTCUSDT", "OPEN_LONG", 2_000.0, 4_000.0, 3, "orb")
    eng.handle(sig, ts, by["orb_ny_15m"])
    assert ex.get_position("BTCUSDT") is None
    assert eng.risk.owner_halt["orb_ny_15m"] == ts // DAY
    eng.closed_trades = []
    eng.handle(sig, ts + 60_000, by["orb_ny_15m"])
    assert ex.get_position("BTCUSDT") is None
    eng.handle(Signal("BTCUSDT", "OPEN_LONG", 2_000.0, 0.0, 3, "ema"), ts + 120_000, by["ema_trend_4h"])
    assert ex.get_position("BTCUSDT").strategy == "ema_trend_4h"
    ex.pos.pop("BTCUSDT")
    eng.handle(sig, ts + DAY, by["orb_ny_15m"])
    assert ex.get_position("BTCUSDT").strategy == "orb_ny_15m"


def test_account_daily_stop_blocks_every_strategy():
    ex, rec = make_ex()
    eng, by = _engine(ex, rec, ["ema_trend_4h", "orb_ny_15m", "xs_mom_1d"])
    ts = 5 * DAY
    eng.risk._daily(ex, ts)
    ex.wallet = 9_400
    eng.handle(Signal("BTCUSDT", "OPEN_LONG", 2_000.0, 0.0, 3, "ema"), ts, by["ema_trend_4h"])
    eng.handle(Signal("BTCUSDT", "OPEN_LONG", 2_000.0, 0.0, 3, "orb"), ts, by["orb_ny_15m"])
    assert ex.get_position("BTCUSDT") is None
    assert any("daily loss" in e["msg"] for e in rec.events if e["type"] == "RISK_REJECT")


def test_target_weight_sizes_notional_not_stop_risk():
    ex, _ = make_ex()
    risk = RiskManager(load_config(), 0.0005, 0.0)
    sig = Signal("BTCUSDT", "OPEN_LONG", 5_000.0, 0.0, 3, "xs",
                 {"target_weight": 0.0375, "strategy": NAME})
    qty, why = risk.size(sig, ex, ex.si["BTCUSDT"], ex.brackets, DAY,
                         owner=NAME, owner_max_pos=8)
    ask = 50_000.1
    assert why == "ok"
    assert qty == pytest.approx(ex.si["BTCUSDT"].round_qty(10_000 * 0.0375 / ask, market=True))
    assert qty == pytest.approx(0.007, abs=0.0005)
    plain = Signal("BTCUSDT", "OPEN_LONG", 5_000.0, 0.0, 3, "ema")
    q_risk, _ = risk.size(plain, ex, ex.si["BTCUSDT"], ex.brackets, DAY,
                          owner="ema_trend_4h", owner_max_pos=3, owner_risk=0.01)
    assert q_risk > qty * 2


def test_experimental_entries_leave_margin_for_delist():
    ex, rec = _book(["BTCUSDT", "ETHUSDT"])
    cfg = load_config()
    assert ex.place_order(Order("BTCUSDT", "BUY", "MARKET", 270, tag="ema_trend_4h"), 2).status == "FILLED"
    assert delist_margin_reserve(cfg, ex) > ex.available_balance()
    eng, by = _engine(ex, rec, ["ema_trend_4h", "delist_short", "orb_ny_15m", "xs_mom_1d"])
    ts = 5 * DAY
    eng.handle(Signal("ETHUSDT", "OPEN_LONG", 5.0, 0.0, 3, "xs", {"target_weight": 0.15}),
               ts, by["xs_mom_1d"])
    assert ex.get_position("ETHUSDT") is None
    assert any(e["type"] == "RISK_REJECT" and "margin reserved for delist_short" in e["msg"]
               and e.get("strategy") == "xs_mom_1d" for e in rec.events)
    eng.handle(Signal("ETHUSDT", "OPEN_SHORT", 20.0, 0.0, 3, "delist", {"target_weight": 0.05}),
               ts, by["delist_short"])
    opened = ex.get_position("ETHUSDT")
    assert opened is not None and opened.strategy == "delist_short"
    # One filled slot is no longer reserved. Nine remain.
    assert delist_margin_reserve(cfg, ex) == pytest.approx(9 * ex.equity() * 0.05 / 3)


def test_half_percent_risk_is_half_the_ema_size_when_uncapped():
    ex, _ = make_ex()
    risk = RiskManager(load_config(), 0.0005, 0.0)
    sig = Signal("BTCUSDT", "OPEN_LONG", 2_000.0, 4_000.0, 3, "x")
    q_orb, _ = risk.size(sig, ex, ex.si["BTCUSDT"], ex.brackets, DAY,
                         owner="orb_ny_15m", owner_max_pos=2, owner_risk=0.005)
    q_ema, _ = risk.size(sig, ex, ex.si["BTCUSDT"], ex.brackets, DAY,
                         owner="ema_trend_4h", owner_max_pos=3, owner_risk=0.01)
    assert q_ema == pytest.approx(0.048, abs=0.001)
    assert q_orb == pytest.approx(0.024, abs=0.001)


def test_limit_take_profit_fills_as_maker_on_a_trade_through():
    ex, rec = make_ex()
    cfg = load_config()
    risk = RiskManager(cfg, 0.0005, 0.0)
    strat = LimitEntry()
    eng = TradingEngine(cfg, ex, strat, risk, ex.si, ex.brackets, recorder=rec)
    eng.on_bar_closed("BTCUSDT", "15m", (0, 50_000, 50_010, 49_990, 50_000, 1, 899_999))
    p = ex.get_position("BTCUSDT")
    assert p.strategy == "orb_ny_15m"
    assert p.meta["exit_ts"] == 9_000_000
    types = sorted(o.type for o in ex.open_orders())
    assert types == ["LIMIT", "STOP_MARKET"]
    tp = [o for o in ex.open_orders() if o.type == "LIMIT"][0]
    assert tp.reduce_only and tp.price == pytest.approx(p.entry_price + 1000, abs=0.1)
    ex.update_market("BTCUSDT", 10, bid=tp.price + 1, ask=tp.price + 2, last=tp.price + 1, mark=tp.price + 1)
    assert ex.get_position("BTCUSDT") is None
    assert rec.trades[-1]["reason"] == "TAKE_PROFIT"
    assert rec.trades[-1]["strategy"] == "orb_ny_15m"
    maker = [f for f in rec.fills if f["liquidity"] == "MAKER"][-1]
    assert maker["fee"] == pytest.approx(maker["qty"] * maker["price"] * 0.0002)


def test_xs_skips_a_symbol_another_strategy_holds():
    closes = universe()
    symbols = list(closes)
    ex, rec = _book(symbols, balance=50_000)
    cfg = load_config()
    risk = RiskManager(cfg, 0.0005, 0.0)
    ema = Named("ema_trend_4h", "1h")
    xs = REGISTRY[NAME]({"k": 2, "reb_days": 3, "gross": 0.30, "timeframe": "1d"})
    eng = TradingEngine(cfg, ex, ema, risk, ex.si, ex.brackets, recorder=rec, strategies=[ema, xs])
    eng.overrides = risk_overrides(cfg)
    boundary = 3 * DAY
    for sym, series in closes.items():
        rows = []
        for i, c in enumerate(series):
            ot = i * DAY
            rows.append((ot, float(c), float(c) * 1.01, float(c) * 0.99, float(c), 1.0, ot + DAY - 1))
        eng.add_history(sym, "1d", rows)
        last = float(series[-1])
        ex.update_market(sym, boundary, bid=last, ask=last, last=last, mark=last)
    book = target_book(xs_scores(closes), k=2, gross=0.30)
    held = max(book, key=book.get)
    ex.place_order(Order(held, "BUY", "MARKET", 0.05, tag="ema_trend_4h"), 2)
    eng.on_timeframe_done("1d", boundary)
    assert ex.get_position(held).strategy == "ema_trend_4h"
    xs_pos = [s for s, p in ex.positions().items() if p.strategy == NAME]
    assert held not in xs_pos and len(xs_pos) == 3
    assert any(e["type"] == "RISK_REJECT" and e["symbol"] == held and e.get("strategy") == NAME
               for e in rec.events)


def test_daily_hook_runs_after_the_hour_and_the_stops_path_skips_it():
    ex, _ = make_ex()
    calls = []

    class Eng:
        candles = {"BTCUSDT": {"1d": {}, "4h": {}, "1h": {}, "15m": {}}}

        def on_bar_closed(self, sym, tf, row, run_strategy=True):
            calls.append(("bar", tf, run_strategy))

        def on_timeframe_done(self, tf, ts):
            calls.append(("done", tf, ts))

    boundary = 86_400_000
    t = boundary - 60_000
    row_1d = (0, 1, 1, 1, 1, 1, boundary - 1)
    row_4h = (boundary - 14_400_000, 1, 1, 1, 1, 1, boundary - 1)
    row_1h = (boundary - 3_600_000, 1, 1, 1, 1, 1, boundary - 1)
    flat = (t, 50_000.0, 50_010.0, 49_990.0, 50_000.0, 1, t + 59_999)
    replay_minutes(
        ex, Eng(), ["BTCUSDT"], [t], {"BTCUSDT": {t: flat}}, {}, {},
        {"BTCUSDT": {row_1h[0]: row_1h}}, {}, {}, None,
        bars_4h={"BTCUSDT": {row_4h[0]: row_4h}},
        bars_1d={"BTCUSDT": {0: row_1d}},
        strategy_tf="1h", last_signal_open=None)
    assert ("bar", "1h", True) in calls
    assert calls[-1] == ("done", "1d", boundary)
    assert calls.index(("done", "1d", boundary)) > calls.index(("bar", "1h", True))
    calls.clear()
    replay_minutes(
        ex, Eng(), ["BTCUSDT"], [t], {"BTCUSDT": {t: flat}}, {}, {},
        {"BTCUSDT": {row_1h[0]: row_1h}}, {}, {}, None,
        bars_4h={"BTCUSDT": {row_4h[0]: row_4h}},
        bars_1d={"BTCUSDT": {0: row_1d}},
        strategy_tf="stops")
    assert ("done", "1d", boundary) not in calls
    assert all(c[0] != "done" for c in calls)


def test_time_exit_at_the_open_beats_the_stop():
    ex, rec = make_ex()
    ex.place_order(Order("BTCUSDT", "BUY", "MARKET", 0.1, tag="orb_ny_15m"), 1)
    ex.place_order(Order("BTCUSDT", "SELL", "STOP_MARKET", stop_price=47_000, close_position=True), 2)
    t = 60_000
    p = ex.get_position("BTCUSDT")
    p.meta["exit_ts"] = t
    p.opened_ts = 1
    bars = {"BTCUSDT": {t: (t, 50_000.0, 50_010.0, 40_000.0, 41_000.0, 1, t + 59_999)}}
    replay_minutes(ex, None, ["BTCUSDT"], [t], bars, {}, {}, {}, {}, {}, None, strategy_tf="stops")
    assert ex.get_position("BTCUSDT") is None
    assert rec.trades[-1]["reason"] == "TIME"
    assert rec.trades[-1]["strategy"] == "orb_ny_15m"
    assert rec.trades[-1]["exit_price"] > 49_000


def test_live_runs_ignore_a_heartbeat_from_a_finished_job(monkeypatch):
    now = 1_000_000
    state = {"loop": {"status": "running", "run_id": "1", "heartbeat_ms": now - 10_000}}
    monkeypatch.delenv("DESK_LIVE_RUNS", raising=False)
    assert other_loop_alive(state, "2", now) is True
    monkeypatch.setenv("DESK_LIVE_RUNS", "2,3")
    assert other_loop_alive(state, "2", now) is False
    monkeypatch.setenv("DESK_LIVE_RUNS", "1,2")
    assert other_loop_alive(state, "2", now) is True


def _seed_daily(eng, ex, closes, now):
    for sym, series in closes.items():
        rows = []
        for i, c in enumerate(series):
            ot = i * DAY
            px = float(c)
            rows.append((ot, px, px * 1.01, px * 0.99, px, 1.0, ot + DAY - 1))
        eng.add_history(sym, "1d", rows)
        last = float(series[-1])
        ex.update_market(sym, now, bid=last, ask=last, last=last, mark=last)


def test_bootstrap_enters_a_flat_book_once_and_skips_a_held_coin():
    closes = universe()
    symbols = list(closes)
    ex, rec = _book(symbols, balance=80_000)
    cfg = load_config()
    ema = Named("ema_trend_4h", "1h")
    xs = REGISTRY[NAME]({"k": 2, "reb_days": 3, "gross": 0.30, "timeframe": "1d"})
    eng = TradingEngine(cfg, ex, ema, RiskManager(cfg, 0.0005, 0.0), ex.si, ex.brackets,
                        recorder=rec, strategies=[ema, xs])
    eng.overrides = risk_overrides(cfg)
    # Day index 100 is not a rebalance day, and it is after the seeded daily bars have closed.
    now = 100 * DAY + 3 * 3_600_000
    _seed_daily(eng, ex, closes, now)
    book = target_book(xs_scores(closes), k=2, gross=0.30)
    held = max(book, key=book.get)
    ex.place_order(Order(held, "BUY", "MARKET", 0.05, tag="ema_trend_4h"), 2)
    n = bootstrap_flat(eng, now, last_1h_open=now)
    xs_pos = [s for s, p in ex.positions().items() if p.strategy == NAME]
    assert n == 4 and held not in xs_pos and len(xs_pos) == 3
    assert eng.universe_period[NAME] == xs.period_id(now)
    assert any(e["type"] == "RISK_REJECT" and e["symbol"] == held and e.get("strategy") == NAME for e in rec.events)
    for s in xs_pos:
        p = ex.get_position(s)
        side = "SELL" if p.side > 0 else "BUY"
        ex.place_order(Order(s, side, "MARKET", p.qty, reduce_only=True), now + 1)
    assert not any(getattr(p, "strategy", "") == NAME for p in ex.positions().values())
    assert bootstrap_flat(eng, now, last_1h_open=now) == 0
    assert not any(getattr(p, "strategy", "") == NAME for p in ex.positions().values())


def test_bootstrap_waits_out_the_midnight_rebalance_window():
    from datetime import datetime, timezone
    xs = REGISTRY[NAME]({"k": 2, "reb_days": 3, "timeframe": "1d"})
    # Day 102 is a rebalance day after the seeded history has closed.
    now = 102 * DAY + 60_000
    assert xs.is_rebalance_day(now)
    midnight_hour = 102 * DAY - 3_600_000
    assert rebalance_still_due(xs, now, midnight_hour - 3_600_000)
    assert not rebalance_still_due(xs, now, midnight_hour)
    oct19 = int(datetime(2026, 10, 19, 0, 1, tzinfo=timezone.utc).timestamp() * 1000)
    assert oct19 // DAY == 20745
    hour = (oct19 // DAY) * DAY - 3_600_000
    assert rebalance_still_due(xs, oct19, hour - 3_600_000)
    assert not rebalance_still_due(xs, oct19, hour)
    closes = universe()
    ex, rec = _book(list(closes), balance=80_000)
    cfg = load_config()
    eng = TradingEngine(cfg, ex, xs, RiskManager(cfg, 0.0005, 0.0), ex.si, ex.brackets,
                        recorder=rec, strategies=[xs])
    eng.overrides = risk_overrides(cfg)
    _seed_daily(eng, ex, closes, now)
    assert bootstrap_flat(eng, now, last_1h_open=midnight_hour - 3_600_000) == 0
    assert NAME not in eng.universe_period
    assert not ex.positions()
    assert bootstrap_flat(eng, now, last_1h_open=midnight_hour) == 4
    assert eng.universe_period[NAME] == xs.period_id(now)
    assert len(ex.positions()) == 4


def test_scheduled_rebalance_records_the_period_so_bootstrap_does_not_repeat():
    closes = universe()
    ex, rec = _book(list(closes), balance=80_000)
    cfg = load_config()
    xs = REGISTRY[NAME]({"k": 2, "reb_days": 3, "gross": 0.30, "timeframe": "1d"})
    eng = TradingEngine(cfg, ex, xs, RiskManager(cfg, 0.0005, 0.0), ex.si, ex.brackets,
                        recorder=rec, strategies=[xs])
    eng.overrides = risk_overrides(cfg)
    boundary = 3 * DAY
    _seed_daily(eng, ex, closes, boundary)
    eng.on_timeframe_done("1d", boundary)
    assert eng.universe_period[NAME] == xs.period_id(boundary)
    opened = [s for s, p in ex.positions().items() if p.strategy == NAME]
    assert opened
    for s in opened:
        p = ex.get_position(s)
        ex.place_order(Order(s, "SELL" if p.side > 0 else "BUY", "MARKET", p.qty, reduce_only=True), boundary + 1)
    assert bootstrap_flat(eng, boundary + 3_600_000, last_1h_open=boundary) == 0


def test_same_side_xs_holder_is_not_resized():
    """A coin already on the wanted side is left alone; weight is not reapplied."""
    s = REGISTRY[NAME]({"k": 2, "reb_days": 1, "gross": 1.0})
    from tests.test_xs_momentum import daily
    u = {k: daily(v) for k, v in universe().items()}
    first = s.on_universe_bar(DAY, u, {})
    long_sym = next(x.symbol for x in first if x.action == "OPEN_LONG")
    held = Position(long_sym, 1, 1.0, 100.0, 3, 33.0, 0, strategy=NAME)
    sig = s.on_universe_bar(2 * DAY, u, {long_sym: held})
    assert long_sym not in [x.symbol for x in sig if x.action.startswith("OPEN")]
    assert long_sym not in [x.symbol for x in sig if x.action == "CLOSE"]

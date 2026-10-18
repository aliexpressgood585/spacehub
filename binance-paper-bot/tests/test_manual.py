"""manual_aggr_1..5: 4h EMA direction, volume filter, one-shot fill, basket stop."""
import math

import pytest

from bot.execution.base import Order
from bot.execution.paper import PaperExchange
from bot.indicators import ema
from bot.config import ROOT
from bot.manual import (apply_basket_stop, arm_breakeven, basket_id_set, config_path,
                        ema_align_direction, ensure_blob, execute_plans, leg_pnl,
                        load_manual_config, plan_opens, rank_candidates, score_directions)
from bot.margin import LeverageBrackets
from bot.storage import MemoryRecorder
from bot.symbols import SymbolInfo


def _cfg():
    return load_manual_config(config_path({"_root": ROOT}))


def _bands(closes):
    c = list(closes)
    return (c[-1], float(ema(c, 20)[-1]), float(ema(c, 50)[-1]), float(ema(c, 200)[-1]))


def test_aggr_1_is_fixed_eth_short_1000_and_the_rest_are_auto():
    cfg = _cfg()
    assert cfg["window_h"] == 6
    assert cfg["selector"] == "ema_align_4h"
    assert cfg["prefer"] == ["XRPUSDT"]
    assert cfg["min_quote_volume"] == 200_000_000
    assert cfg["exclude"] == ["BTCUSDT", "ETHUSDT"]
    assert cfg["basket"]["tag"] == "manual_aggr"
    assert cfg["basket"]["stop_pnl"] == -800
    assert [t["id"] for t in cfg["trades"]] == [
        "manual_aggr_1", "manual_aggr_2", "manual_aggr_3", "manual_aggr_4", "manual_aggr_5"]
    fixed = cfg["trades"][0]
    assert fixed["symbol"] == "ETHUSDT"
    assert fixed["side"] == "SHORT"
    assert fixed["margin"] == 1000
    assert fixed["leverage"] == 5
    for t in cfg["trades"]:
        assert t["leverage"] == 5
        assert t["stop_pct"] == pytest.approx(0.06)
        assert t["tp_pct"] == pytest.approx(0.09)
        assert t["breakeven_pct"] == pytest.approx(0.045)
        assert t["max_hold_h"] == 24
    for t in cfg["trades"][1:]:
        assert t["symbol"] == "auto"
        assert t["margin"] == 600


def test_ema_align_direction_long_short_and_mixed():
    up = [50.0 + i for i in range(220)]
    assert ema_align_direction(up) == "LONG"
    px, e20, e50, e200 = _bands(up)
    assert px > e20 and px > e50 and px > e200

    dn = [400.0 - i for i in range(220)]
    assert ema_align_direction(dn) == "SHORT"
    px, e20, e50, e200 = _bands(dn)
    assert px < e20 and px < e50 and px < e200

    assert ema_align_direction(up[:199]) is None
    assert ema_align_direction([25.0] * 220) is None
    px, e20, e50, e200 = _bands([25.0] * 220)
    assert px == pytest.approx(e20) and px == pytest.approx(e200)

    base = [100.0 + i * 0.2 for i in range(219)]
    mixed = None
    for step in range(0, 120):
        series = base + [base[-1] - step]
        if ema_align_direction(series) is not None:
            continue
        px, e20, e50, e200 = _bands(series)
        if not all(math.isfinite(v) for v in (px, e20, e50, e200)):
            continue
        above = px > e20 and px > e50 and px > e200
        below = px < e20 and px < e50 and px < e200
        if not above and not below:
            mixed = series
            break
    assert mixed is not None
    assert ema_align_direction(mixed) is None


def _board():
    return [
        {"symbol": "BTCUSDT", "quote_volume": 5_000_000_000},
        {"symbol": "ETHUSDT", "quote_volume": 3_000_000_000},
        {"symbol": "XRPUSDT", "quote_volume": 250_000_000},
        {"symbol": "SOLUSDT", "quote_volume": 900_000_000},
        {"symbol": "DOGEUSDT", "quote_volume": 400_000_000},
        {"symbol": "ADAUSDT", "quote_volume": 150_000_000},
        {"symbol": "BNBUSDT", "quote_volume": 800_000_000},
        {"symbol": "LINKUSDT", "quote_volume": 300_000_000},
        {"symbol": "AVAXUSDT", "quote_volume": 220_000_000},
        {"symbol": "LTCUSDT", "quote_volume": 210_000_000},
    ]


def _directions():
    return {
        "BTCUSDT": "SHORT", "ETHUSDT": "LONG", "XRPUSDT": "LONG", "SOLUSDT": "SHORT",
        "DOGEUSDT": "LONG", "ADAUSDT": "LONG", "BNBUSDT": "LONG", "LINKUSDT": "SHORT",
        "AVAXUSDT": None, "LTCUSDT": "SHORT",
    }


def test_volume_exclusion_filter_prefers_xrp_then_volume():
    cfg = _cfg()
    ranked = rank_candidates(
        _board(), min_quote_volume=cfg["min_quote_volume"], exclude=cfg["exclude"],
        open_symbols={"BNBUSDT"}, chosen={"LINKUSDT"}, prefer=cfg["prefer"],
        directions=_directions())
    assert [r["symbol"] for r in ranked] == ["XRPUSDT", "SOLUSDT", "DOGEUSDT", "LTCUSDT"]
    assert ranked[0]["side"] == "LONG"
    assert ranked[1]["side"] == "SHORT"
    # XRP is first even though SOL's volume is higher. Open, chosen, thin, BTC/ETH and
    # a name with no EMA alignment are absent.
    assert "BTCUSDT" not in {r["symbol"] for r in ranked}
    assert "ETHUSDT" not in {r["symbol"] for r in ranked}
    assert "ADAUSDT" not in {r["symbol"] for r in ranked}
    assert "AVAXUSDT" not in {r["symbol"] for r in ranked}

    without_xrp = rank_candidates(
        _board(), min_quote_volume=cfg["min_quote_volume"], exclude=cfg["exclude"],
        open_symbols={"BNBUSDT", "XRPUSDT"}, chosen=set(), prefer=cfg["prefer"],
        directions=_directions())
    assert [r["symbol"] for r in without_xrp] == ["SOLUSDT", "DOGEUSDT", "LINKUSDT", "LTCUSDT"]


def _two_eligible():
    rows = [
        {"symbol": "XRPUSDT", "quote_volume": 250_000_000},
        {"symbol": "SOLUSDT", "quote_volume": 900_000_000},
        {"symbol": "ADAUSDT", "quote_volume": 150_000_000},
    ]
    directions = {"XRPUSDT": "LONG", "SOLUSDT": "SHORT", "ADAUSDT": "LONG"}
    return rows, directions


def test_auto_picks_skip_eth_and_btc_even_when_eth_leads_volume():
    """aggr_1 is the fixed ETH short. Auto ids do not take ETH or BTC."""
    cfg = _cfg()
    now = 1_700_000_000_000
    rows = [
        {"symbol": "ETHUSDT", "quote_volume": 9_000_000_000},
        {"symbol": "BTCUSDT", "quote_volume": 8_000_000_000},
        {"symbol": "XRPUSDT", "quote_volume": 250_000_000},
        {"symbol": "SOLUSDT", "quote_volume": 900_000_000},
    ]
    # ETH's own EMA stack says LONG. The fixed ticket stays SHORT anyway.
    directions = {"ETHUSDT": "LONG", "BTCUSDT": "LONG", "XRPUSDT": "LONG", "SOLUSDT": "SHORT"}
    blob, plans = plan_opens(cfg, None, now, rows, directions, set())
    assert plans[0]["id"] == "manual_aggr_1"
    assert plans[0]["symbol"] == "ETHUSDT" and plans[0]["side"] == "SHORT"
    assert plans[0]["margin"] == 1000 and plans[0]["leverage"] == 5
    auto = [p["symbol"] for p in plans if p["id"] != "manual_aggr_1"]
    assert "ETHUSDT" not in auto and "BTCUSDT" not in auto
    assert auto[0] == "XRPUSDT"

    held, late = plan_opens(cfg, None, now, rows, directions, {"ETHUSDT"})
    assert all(p["symbol"] != "ETHUSDT" for p in late)
    assert held["ids"]["manual_aggr_1"]["status"] == "skipped"
    assert held["ids"]["manual_aggr_1"]["reason"] == "position_open"


def test_opens_fewer_than_four_and_does_not_retry():
    cfg = _cfg()
    now = 1_700_000_000_000
    rows, directions = _two_eligible()
    blob, plans = plan_opens(cfg, None, now, None, None, set())
    assert plans == []
    assert blob["resolved"] is False
    assert all(blob["ids"][t["id"]]["status"] == "pending" for t in cfg["trades"])

    blob, plans = plan_opens(cfg, blob, now + 60_000, rows, directions, set())
    assert [p["id"] for p in plans] == ["manual_aggr_1", "manual_aggr_2", "manual_aggr_3"]
    assert [p["symbol"] for p in plans] == ["ETHUSDT", "XRPUSDT", "SOLUSDT"]
    assert plans[0]["side"] == "SHORT" and plans[0]["margin"] == 1000
    assert plans[0]["tag"] == "manual_aggr"
    assert blob["resolved"] is True
    assert blob["resolved_ms"] == now + 60_000
    for tid in ("manual_aggr_4", "manual_aggr_5"):
        assert blob["ids"][tid]["status"] == "skipped"
        assert blob["ids"][tid]["reason"] == "fewer_eligible"

    fuller = rows + [
        {"symbol": "DOGEUSDT", "quote_volume": 700_000_000},
        {"symbol": "LTCUSDT", "quote_volume": 600_000_000},
        {"symbol": "AVAXUSDT", "quote_volume": 500_000_000},
    ]
    fuller_dir = dict(directions, DOGEUSDT="LONG", LTCUSDT="SHORT", AVAXUSDT="LONG")
    again, more = plan_opens(cfg, blob, now + 120_000, fuller, fuller_dir, set())
    assert more == []
    for tid in ("manual_aggr_4", "manual_aggr_5"):
        assert again["ids"][tid]["status"] == "skipped"

    # The window expiring does not reopen a resolved id, and an unresolved book
    # that ages out is skipped even when names would qualify.
    stale = ensure_blob(cfg, {"window_start_ms": now - 7 * 3_600_000, "window_h": 6,
                              "resolved": False, "ids": {}}, now)
    expired, late = plan_opens(cfg, stale, now, fuller, fuller_dir, set())
    assert late == []
    assert expired["resolved"] is True
    assert all(expired["ids"][t["id"]]["status"] == "skipped" for t in cfg["trades"])
    assert all(expired["ids"][t["id"]]["reason"] == "window" for t in cfg["trades"])


def _si(symbol):
    return SymbolInfo(symbol, 0.01, 0.1, 0.1, 1e9, 0.1, 0.1, 1e9, 5.0)


def _book(ex, symbol, px, ts):
    ex.update_market(symbol, ts, bid=px, ask=px, last=px, mark=px)


def _basket_ex():
    si = {"SOLUSDT": _si("SOLUSDT"), "XRPUSDT": _si("XRPUSDT"), "ADAUSDT": _si("ADAUSDT")}
    rec = MemoryRecorder()
    ex = PaperExchange(si, LeverageBrackets([]), 10_000, 0.0002, 0.0005, 0.0, 5, listener=rec)
    return ex, rec


def _open(ex, symbol, qty, tag, ts, px=100.0, leverage=1):
    # 1x so a several-hundred-dollar open loss stays inside isolated margin.
    # The basket sums marks; it is not the per-leg liquidation price.
    _book(ex, symbol, px, ts)
    ex.set_leverage(symbol, leverage)
    o = ex.place_order(Order(symbol, "BUY", "MARKET", qty, tag=tag), ts)
    assert o.status == "FILLED"
    return ex.get_position(symbol)


def test_basket_stop_closes_open_legs_at_minus_800_including_fees():
    cfg = _cfg()
    ex, rec = _basket_ex()
    a = _open(ex, "SOLUSDT", 10, "manual_aggr_1", 2)
    b = _open(ex, "XRPUSDT", 10, "manual_aggr_2", 3)
    other = _open(ex, "ADAUSDT", 10, "ema_trend_4h", 4)
    a.fees = 100
    b.fees = 0
    other.fees = 0
    # -300 price + 100 fees, and -400 price. Together exactly -800. The other strategy is not in the sum.
    _book(ex, "SOLUSDT", a.entry_price - 30, 5)   # qty 10 → -300
    _book(ex, "XRPUSDT", b.entry_price - 40, 5)   # → -400
    _book(ex, "ADAUSDT", other.entry_price - 80, 5)
    pnl_a = leg_pnl(a.side, a.qty, a.entry_price, ex.mark("SOLUSDT"), a.fees)
    pnl_b = leg_pnl(b.side, b.qty, b.entry_price, ex.mark("XRPUSDT"), b.fees)
    assert pnl_a + pnl_b == pytest.approx(-800)

    blob = ensure_blob(cfg, None, 1)
    for tid, sym in (("manual_aggr_1", "SOLUSDT"), ("manual_aggr_2", "XRPUSDT")):
        blob["ids"][tid] = {"status": "open", "symbol": sym}
    assert apply_basket_stop(ex, rec, blob, cfg, 6) is True
    assert ex.get_position("SOLUSDT") is None
    assert ex.get_position("XRPUSDT") is None
    assert ex.get_position("ADAUSDT") is not None
    reasons = [t["reason"] for t in rec.trades]
    assert reasons == ["basket_stop", "basket_stop"]
    assert blob["ids"]["manual_aggr_1"]["status"] == "closed"
    assert blob["ids"]["manual_aggr_1"]["exit_reason"] == "basket_stop"
    assert blob["ids"]["manual_aggr_2"]["exit_reason"] == "basket_stop"

    # One dollar above the line does not close, and fees are what push a -700 price result over.
    ex2, rec2 = _basket_ex()
    p = _open(ex2, "SOLUSDT", 10, "manual_aggr_1", 2)
    p.fees = 100
    _book(ex2, "SOLUSDT", p.entry_price - 69.9, 3)  # -699 price - 100 fees = -799
    assert leg_pnl(p.side, p.qty, p.entry_price, ex2.mark("SOLUSDT"), p.fees) == pytest.approx(-799)
    blob2 = ensure_blob(cfg, None, 1)
    blob2["ids"]["manual_aggr_1"] = {"status": "open", "symbol": "SOLUSDT"}
    assert apply_basket_stop(ex2, rec2, blob2, cfg, 4) is False
    assert ex2.get_position("SOLUSDT") is not None
    assert rec2.trades == []


def test_missing_higher_priority_direction_does_not_fill_a_lower_name():
    priority = [
        {"symbol": "XRPUSDT", "quote_volume": 250_000_000},
        {"symbol": "SOLUSDT", "quote_volume": 900_000_000},
    ]

    def close_fn(sym):
        if sym == "XRPUSDT":
            return None
        return [50.0 + i for i in range(220)]

    assert score_directions(priority, close_fn, 5) is None
    # Once XRP has a real series and is not aligned, SOL may take the slot.
    def resolved(sym):
        if sym == "XRPUSDT":
            return [25.0] * 220
        return [50.0 + i for i in range(220)]

    directions = score_directions(priority, resolved, 5)
    assert directions["XRPUSDT"] is None
    assert directions["SOLUSDT"] == "LONG"


def test_breakeven_moves_the_stop_to_entry_at_plus_4_5pct():
    ex, _rec = _basket_ex()
    p = _open(ex, "SOLUSDT", 10, "manual_aggr_1", 2, leverage=5)
    entry = p.entry_price
    ex.place_order(Order("SOLUSDT", "SELL", "STOP_MARKET", stop_price=round(entry * 0.94, 2),
                         close_position=True, tag="SL"), 3)
    p.meta["breakeven_pct"] = 0.045
    p.meta["manual_id"] = "manual_aggr_1"
    _book(ex, "SOLUSDT", entry * 1.044, 4)
    arm_breakeven(ex, 4, basket_id_set(_cfg()))
    stops = [o.stop_price for o in ex.open_orders("SOLUSDT") if o.type == "STOP_MARKET"]
    assert stops == [pytest.approx(round(entry * 0.94, 2))]
    _book(ex, "SOLUSDT", entry * 1.045, 5)
    arm_breakeven(ex, 5, basket_id_set(_cfg()))
    stops = [o.stop_price for o in ex.open_orders("SOLUSDT") if o.type == "STOP_MARKET"]
    assert stops == [pytest.approx(entry)]
    assert p.meta["breakeven_done"] is True
    assert p.meta["breakeven"] == pytest.approx(entry)


def test_open_logs_symbol_side_entry_stop_tp_and_breakeven():
    cfg = _cfg()
    now = 1_700_000_000_000
    rows, directions = _two_eligible()
    blob, plans = plan_opens(cfg, None, now, rows, directions, set())
    si = {"ETHUSDT": _si("ETHUSDT"), "XRPUSDT": _si("XRPUSDT"), "SOLUSDT": _si("SOLUSDT")}
    rec = MemoryRecorder()
    ex = PaperExchange(si, LeverageBrackets([]), 50_000, 0.0002, 0.0005, 0.0, 3, listener=rec)
    _book(ex, "ETHUSDT", 2_000.0, now)
    _book(ex, "XRPUSDT", 1.0, now)
    _book(ex, "SOLUSDT", 100.0, now)
    execute_plans(ex, rec, plans, now, blob)
    eth = ex.get_position("ETHUSDT")
    assert eth.strategy == "manual_aggr"
    assert eth.meta["manual_id"] == "manual_aggr_1"
    assert eth.meta["basket"] == "manual_aggr"
    assert eth.side == -1
    assert eth.leverage == 5
    assert eth.qty * eth.entry_price == pytest.approx(5_000, rel=1e-6)
    assert eth.isolated_margin == pytest.approx(1_000, rel=1e-6)
    assert eth.meta["sl"] == pytest.approx(eth.entry_price * 1.06)
    assert eth.meta["tp"] == pytest.approx(eth.entry_price * 0.91)
    stops = [o for o in ex.open_orders("ETHUSDT") if o.type == "STOP_MARKET"]
    assert len(stops) == 1 and stops[0].close_position
    assert stops[0].stop_price == pytest.approx(eth.meta["sl"])
    assert ex.get_position("XRPUSDT").strategy == "manual_aggr"
    assert ex.get_position("XRPUSDT").meta["manual_id"] == "manual_aggr_2"
    assert ex.get_position("SOLUSDT").meta["manual_id"] == "manual_aggr_3"
    assert blob["ids"]["manual_aggr_4"]["status"] == "skipped"
    xrp = ex.get_position("XRPUSDT")
    assert xrp.leverage == 5
    assert xrp.qty * xrp.entry_price == pytest.approx(3_000, rel=1e-6)
    assert xrp.isolated_margin == pytest.approx(600, rel=1e-6)
    assert xrp.meta["sl"] == pytest.approx(xrp.entry_price * 0.94)
    assert xrp.meta["tp"] == pytest.approx(xrp.entry_price * 1.09)
    assert xrp.meta["breakeven"] == pytest.approx(xrp.entry_price)
    assert xrp.meta["exit_ts"] >= now + 24 * 3_600_000
    sol = ex.get_position("SOLUSDT")
    assert sol.side == -1
    assert sol.meta["sl"] == pytest.approx(sol.entry_price * 1.06)
    assert sol.meta["tp"] == pytest.approx(sol.entry_price * 0.91)
    logged = [e for e in rec.events if e["type"] == "MANUAL_OPEN"]
    assert [e["id"] for e in logged] == ["manual_aggr_1", "manual_aggr_2", "manual_aggr_3"]
    assert logged[0]["symbol"] == "ETHUSDT" and logged[0]["side"] == "SHORT"
    assert logged[0]["entry"] == pytest.approx(eth.entry_price)
    assert logged[0]["stop"] == pytest.approx(eth.meta["sl"])
    assert logged[0]["tp"] == pytest.approx(eth.meta["tp"])
    assert logged[0]["breakeven"] == pytest.approx(eth.entry_price)
    assert blob["log"][0]["id"] == "manual_aggr_1"
    assert "manual_aggr_1" in logged[0]["msg"]


# ── follow-up checks: time exit, short-side breakeven, basket edge cases ──

from bot.desk import expire_time_stops
from bot.manual import HOUR_MS, hold_exit_ts, maintain, sync_closed


def _opened_pair(now=1_700_000_000_000, extra=()):
    cfg = _cfg()
    rows, directions = _two_eligible()
    blob, plans = plan_opens(cfg, None, now, rows, directions, set())
    si = {s: _si(s) for s in ("ETHUSDT", "XRPUSDT", "SOLUSDT", *extra)}
    rec = MemoryRecorder()
    ex = PaperExchange(si, LeverageBrackets([]), 50_000, 0.0002, 0.0005, 0.0, 3, listener=rec)
    _book(ex, "ETHUSDT", 2_000.0, now)
    _book(ex, "XRPUSDT", 1.0, now)
    _book(ex, "SOLUSDT", 100.0, now)
    execute_plans(ex, rec, plans, now, blob)
    return cfg, ex, rec, blob, now


def test_hold_exit_ts_is_24h_rounded_up_to_the_next_minute_open():
    now = 1_700_000_000_000 + 12_345
    ets = hold_exit_ts(now, 24)
    assert ets % 60_000 == 0
    assert now + 24 * HOUR_MS <= ets < now + 24 * HOUR_MS + 60_000
    on_minute = 1_700_000_040_000
    assert hold_exit_ts(on_minute, 24) == on_minute + 24 * HOUR_MS


def test_time_exit_closes_every_leg_after_24h_and_not_before():
    cfg, ex, rec, blob, now = _opened_pair()
    ets = ex.get_position("XRPUSDT").meta["exit_ts"]
    assert ex.get_position("SOLUSDT").meta["exit_ts"] == ets
    # The exit minute has not closed yet: both legs stay open.
    expire_time_stops(ex, ets + 59_999)
    assert ex.get_position("XRPUSDT") is not None
    assert ex.get_position("SOLUSDT") is not None
    # Once the exit minute has closed, both legs go flat with reason TIME.
    expire_time_stops(ex, ets + 60_000)
    assert ex.get_position("XRPUSDT") is None
    assert ex.get_position("SOLUSDT") is None
    assert ex.get_position("ETHUSDT") is None
    assert sorted(t["reason"] for t in rec.trades) == ["TIME", "TIME", "TIME"]
    # The ids are closed for good and a later selection tick does not reopen them.
    sync_closed(ex, blob, basket_id_set(cfg))
    assert blob["ids"]["manual_aggr_1"]["status"] == "closed"
    assert blob["ids"]["manual_aggr_2"]["status"] == "closed"
    rows, directions = _two_eligible()
    again, plans = plan_opens(cfg, blob, ets + 120_000, rows, directions, set())
    assert plans == []


def test_time_exit_does_not_touch_other_strategies():
    cfg, ex, rec, blob, now = _opened_pair(extra=("ADAUSDT",))
    ets = ex.get_position("XRPUSDT").meta["exit_ts"]
    _open(ex, "ADAUSDT", 10, "ema_trend_4h", now + 1)
    expire_time_stops(ex, ets + 60_000)
    assert ex.get_position("ADAUSDT") is not None


def test_breakeven_on_a_short_moves_the_stop_down_to_entry_at_minus_4_5pct():
    cfg, ex, rec, blob, now = _opened_pair()
    sol = ex.get_position("SOLUSDT")
    assert sol.side == -1
    entry = sol.entry_price
    first = [o.stop_price for o in ex.open_orders("SOLUSDT") if o.type == "STOP_MARKET"]
    assert first == [pytest.approx(sol.meta["sl"])]
    _book(ex, "SOLUSDT", entry * 0.956, now + 60_000)   # -4.4%: not yet
    arm_breakeven(ex, now + 60_000, basket_id_set(cfg))
    assert [o.stop_price for o in ex.open_orders("SOLUSDT") if o.type == "STOP_MARKET"] == first
    _book(ex, "SOLUSDT", entry * 0.955, now + 120_000)  # -4.5%: armed
    arm_breakeven(ex, now + 120_000, basket_id_set(cfg))
    stops = [o.stop_price for o in ex.open_orders("SOLUSDT") if o.type == "STOP_MARKET"]
    assert stops == [pytest.approx(entry, abs=0.01)]
    assert sol.meta["breakeven_done"] is True
    # The take-profit order is still there.
    assert [o.type for o in ex.open_orders("SOLUSDT")].count("TAKE_PROFIT_MARKET") == 1


def test_breakeven_arms_once_and_survives_a_pullback():
    cfg, ex, rec, blob, now = _opened_pair()
    xrp = ex.get_position("XRPUSDT")
    entry = xrp.entry_price
    _book(ex, "XRPUSDT", entry * 1.05, now + 60_000)
    maintain(ex, rec, cfg, blob, now + 60_000)
    _book(ex, "XRPUSDT", entry * 1.01, now + 120_000)
    maintain(ex, rec, cfg, blob, now + 120_000)
    stops = [o for o in ex.open_orders("XRPUSDT") if o.type == "STOP_MARKET"]
    assert len(stops) == 1
    assert stops[0].stop_price == pytest.approx(entry, abs=0.01)


def test_basket_stop_sums_long_and_short_legs():
    cfg = _cfg()
    ex, rec = _basket_ex()
    a = _open(ex, "SOLUSDT", 10, "manual_aggr_1", 2)
    _book(ex, "XRPUSDT", 100.0, 3)
    ex.set_leverage("XRPUSDT", 1)
    assert ex.place_order(Order("XRPUSDT", "SELL", "MARKET", 10, tag="manual_aggr_2"), 3).status == "FILLED"
    b = ex.get_position("XRPUSDT")
    a.fees = b.fees = 0
    # Long down 50 (-500) and short up 30 (-300): together -800.
    _book(ex, "SOLUSDT", a.entry_price - 50, 4)
    _book(ex, "XRPUSDT", b.entry_price + 30, 4)
    blob = ensure_blob(cfg, None, 1)
    for tid, sym in (("manual_aggr_1", "SOLUSDT"), ("manual_aggr_2", "XRPUSDT")):
        blob["ids"][tid] = {"status": "open", "symbol": sym}
    assert apply_basket_stop(ex, rec, blob, cfg, 5) is True
    assert ex.get_position("SOLUSDT") is None and ex.get_position("XRPUSDT") is None
    # A winning short offsets a losing long, so the same long loss alone is not enough.
    ex2, rec2 = _basket_ex()
    a2 = _open(ex2, "SOLUSDT", 10, "manual_aggr_1", 2)
    _book(ex2, "XRPUSDT", 100.0, 3)
    ex2.set_leverage("XRPUSDT", 1)
    ex2.place_order(Order("XRPUSDT", "SELL", "MARKET", 10, tag="manual_aggr_2"), 3)
    b2 = ex2.get_position("XRPUSDT")
    a2.fees = b2.fees = 0
    _book(ex2, "SOLUSDT", a2.entry_price - 90, 4)   # -900
    _book(ex2, "XRPUSDT", b2.entry_price - 20, 4)   # +200
    blob2 = ensure_blob(cfg, None, 1)
    assert apply_basket_stop(ex2, rec2, blob2, cfg, 5) is False
    assert ex2.get_position("SOLUSDT") is not None


def test_basket_stop_waits_when_a_leg_has_no_mark():
    cfg = _cfg()
    ex, rec = _basket_ex()
    a = _open(ex, "SOLUSDT", 10, "manual_aggr_1", 2)
    a.fees = 0
    _book(ex, "SOLUSDT", a.entry_price - 90, 3)
    ex.mkt["SOLUSDT"].mark = float("nan")
    blob = ensure_blob(cfg, None, 1)
    assert apply_basket_stop(ex, rec, blob, cfg, 4) is False
    assert ex.get_position("SOLUSDT") is not None

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


def test_config_lists_five_auto_trades_with_the_same_size():
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
    for t in cfg["trades"]:
        assert t["symbol"] == "auto"
        assert t["margin"] == 600
        assert t["leverage"] == 5
        assert t["stop_pct"] == pytest.approx(0.06)
        assert t["tp_pct"] == pytest.approx(0.09)
        assert t["breakeven_pct"] == pytest.approx(0.045)
        assert t["max_hold_h"] == 24


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


def test_opens_fewer_than_four_and_does_not_retry():
    cfg = _cfg()
    now = 1_700_000_000_000
    rows, directions = _two_eligible()
    blob, plans = plan_opens(cfg, None, now, None, None, set())
    assert plans == []
    assert blob["resolved"] is False
    assert all(blob["ids"][t["id"]]["status"] == "pending" for t in cfg["trades"])

    blob, plans = plan_opens(cfg, blob, now + 60_000, rows, directions, set())
    assert [p["id"] for p in plans] == ["manual_aggr_1", "manual_aggr_2"]
    assert [p["symbol"] for p in plans] == ["XRPUSDT", "SOLUSDT"]
    assert blob["resolved"] is True
    assert blob["resolved_ms"] == now + 60_000
    for tid in ("manual_aggr_3", "manual_aggr_4", "manual_aggr_5"):
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
    for tid in ("manual_aggr_3", "manual_aggr_4", "manual_aggr_5"):
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
    si = {"XRPUSDT": _si("XRPUSDT"), "SOLUSDT": _si("SOLUSDT")}
    rec = MemoryRecorder()
    ex = PaperExchange(si, LeverageBrackets([]), 50_000, 0.0002, 0.0005, 0.0, 3, listener=rec)
    _book(ex, "XRPUSDT", 1.0, now)
    _book(ex, "SOLUSDT", 100.0, now)
    execute_plans(ex, rec, plans, now, blob)
    assert ex.get_position("XRPUSDT").strategy == "manual_aggr_1"
    assert ex.get_position("SOLUSDT").strategy == "manual_aggr_2"
    assert blob["ids"]["manual_aggr_3"]["status"] == "skipped"
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
    assert [e["id"] for e in logged] == ["manual_aggr_1", "manual_aggr_2"]
    assert logged[0]["symbol"] == "XRPUSDT" and logged[0]["side"] == "LONG"
    assert logged[0]["entry"] == pytest.approx(xrp.entry_price)
    assert logged[0]["stop"] == pytest.approx(xrp.meta["sl"])
    assert logged[0]["tp"] == pytest.approx(xrp.meta["tp"])
    assert logged[0]["breakeven"] == pytest.approx(xrp.entry_price)
    assert blob["log"][0]["id"] == "manual_aggr_1"
    assert "manual_aggr_1" in logged[0]["msg"]

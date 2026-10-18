"""Tests for fee, funding, liquidation and PnL math of the paper exchange."""
import pytest
from bot.symbols import SymbolInfo
from bot.margin import LeverageBrackets, Bracket, liquidation_price, maintenance_margin, funding_payment
from bot.execution.paper import PaperExchange
from bot.execution.base import Order
from bot.storage import MemoryRecorder

BTC_BRACKETS = [{"symbol": "BTCUSDT", "riskBrackets": [
    {"bracketNotionalFloor": 0, "bracketNotionalCap": 300000, "bracketMaintenanceMarginRate": 0.004,
     "cumFastMaintenanceAmount": 0, "maxOpenPosLeverage": 150},
    {"bracketNotionalFloor": 300000, "bracketNotionalCap": 800000, "bracketMaintenanceMarginRate": 0.005,
     "cumFastMaintenanceAmount": 300, "maxOpenPosLeverage": 100}]}]


def make_ex(balance=10_000, slip=0.0, traverse=False):
    si = {"BTCUSDT": SymbolInfo("BTCUSDT", 0.1, 0.001, 0.001, 1000, 0.001, 0.001, 120, 50)}
    rec = MemoryRecorder()
    ex = PaperExchange(si, LeverageBrackets(BTC_BRACKETS), balance, 0.0002, 0.0005, slip, 10,
                       traverse_fill=traverse, listener=rec)
    ex.update_market("BTCUSDT", 1, bid=50_000.0, ask=50_000.1, last=50_000.0, mark=50_000.0)
    return ex, rec


def test_taker_fee_and_fill_at_ask():
    ex, rec = make_ex()
    ex.place_order(Order("BTCUSDT", "BUY", "MARKET", 0.1), 2)
    p = ex.get_position("BTCUSDT")
    assert p.entry_price == 50_000.1                       # buy at best ask
    assert rec.fills[0]["fee"] == pytest.approx(0.1 * 50_000.1 * 0.0005)
    assert ex.wallet == pytest.approx(10_000 - 0.1 * 50_000.1 * 0.0005)
    assert p.isolated_margin == pytest.approx(0.1 * 50_000.1 / 10)


def test_slippage_adverse_and_tick_rounded():
    ex, rec = make_ex(slip=10)                             # 10 bps
    ex.place_order(Order("BTCUSDT", "SELL", "MARKET", 0.1), 2)
    px = rec.fills[0]["price"]
    assert px == pytest.approx(49_950.0)                   # 50000*(1-0.001) rounded down to tick
    assert round(px / 0.1) == px / 0.1 or abs(px * 10 - round(px * 10)) < 1e-6


def test_round_trip_pnl_with_fees():
    ex, rec = make_ex()
    ex.place_order(Order("BTCUSDT", "BUY", "MARKET", 0.2), 2)
    ex.update_market("BTCUSDT", 3, bid=51_000.0, ask=51_000.1, last=51_000.0, mark=51_000.0)
    assert ex.unrealized() == pytest.approx(0.2 * (51_000 - 50_000.1))
    ex.place_order(Order("BTCUSDT", "SELL", "MARKET", 0.2, reduce_only=True), 4)
    t = rec.trades[0]
    fees = 0.2 * 50_000.1 * 0.0005 + 0.2 * 51_000.0 * 0.0005
    assert t["gross_pnl"] == pytest.approx(0.2 * (51_000 - 50_000.1))
    assert t["fees"] == pytest.approx(fees)
    assert t["net_pnl"] == pytest.approx(t["gross_pnl"] - fees)
    assert ex.wallet == pytest.approx(10_000 + t["net_pnl"])
    assert ex.get_position("BTCUSDT") is None and ex.used_margin() == 0


def test_short_pnl_and_partial_close():
    ex, rec = make_ex()
    ex.place_order(Order("BTCUSDT", "SELL", "MARKET", 0.2), 2)      # entry at bid 50000
    ex.update_market("BTCUSDT", 3, bid=48_999.9, ask=49_000.0, last=49_000.0, mark=49_000.0)
    ex.place_order(Order("BTCUSDT", "BUY", "MARKET", 0.1, reduce_only=True), 4)
    p = ex.get_position("BTCUSDT")
    assert p.qty == pytest.approx(0.1)
    assert p.realized_pnl == pytest.approx(0.1 * (50_000 - 49_000))
    assert p.isolated_margin == pytest.approx(0.1 * 50_000 / 10)


def test_limit_order_maker_fee_only_when_traded_through():
    ex, rec = make_ex()
    o = ex.place_order(Order("BTCUSDT", "BUY", "LIMIT", 0.1, price=49_900), 2)
    assert o.status == "NEW"
    ex.update_market("BTCUSDT", 3, bid=49_899.9, ask=49_900.0, last=49_900.0, mark=49_900)  # touch only
    assert ex.get_position("BTCUSDT") is None
    ex.update_market("BTCUSDT", 4, bid=49_899.8, ask=49_899.9, last=49_899.8, mark=49_899.8)  # through
    p = ex.get_position("BTCUSDT")
    assert p.entry_price == 49_900
    assert rec.fills[0]["liquidity"] == "MAKER"
    assert rec.fills[0]["fee"] == pytest.approx(0.1 * 49_900 * 0.0002)


def test_post_only_rejected_when_marketable():
    ex, _ = make_ex()
    o = ex.place_order(Order("BTCUSDT", "BUY", "LIMIT", 0.1, price=50_001, post_only=True), 2)
    assert o.status == "REJECTED"


def test_filters_min_notional_and_step():
    ex, _ = make_ex()
    assert ex.place_order(Order("BTCUSDT", "BUY", "MARKET", 0.0009), 2).status == "REJECTED"   # < minQty
    o = ex.place_order(Order("BTCUSDT", "BUY", "MARKET", 0.0019), 2)    # rounds down to 0.001 -> 50 USDT ok
    assert o.qty == pytest.approx(0.001) and o.status == "FILLED"
    ex2, _ = make_ex()
    ex2.update_market("BTCUSDT", 2, bid=40_000.0, ask=40_000.1, last=40_000, mark=40_000)
    assert ex2.place_order(Order("BTCUSDT", "BUY", "MARKET", 0.001), 3).status == "REJECTED"  # 40 < 50 minNotional


def test_funding_long_pays_positive_rate_and_hits_isolated_margin():
    ex, rec = make_ex()
    ex.place_order(Order("BTCUSDT", "BUY", "MARKET", 0.1), 2)
    p = ex.get_position("BTCUSDT")
    m0, w0 = p.isolated_margin, ex.wallet
    pay = ex.apply_funding("BTCUSDT", 0.0001, 50_500.0, 10)
    assert pay == pytest.approx(-0.1 * 50_500 * 0.0001)
    assert ex.wallet == pytest.approx(w0 + pay) and p.isolated_margin == pytest.approx(m0 + pay)
    assert funding_payment(-1, 0.1, 50_500, 0.0001) == pytest.approx(+0.505)    # short receives
    assert funding_payment(1, 0.1, 50_500, -0.0001) == pytest.approx(+0.505)    # long receives on negative


def test_funding_not_applied_to_position_opened_after_settlement():
    ex, _ = make_ex()
    ex.place_order(Order("BTCUSDT", "BUY", "MARKET", 0.1), 100)
    assert ex.apply_funding("BTCUSDT", 0.001, 50_000, 100) == 0.0


def test_liquidation_price_formula_long_and_short():
    br = LeverageBrackets(BTC_BRACKETS).get("BTCUSDT")
    # long 1 BTC @ 50000, 10x -> margin 5000, mmr 0.4% (notional at LP < 300k)
    lp = liquidation_price(1, 1.0, 50_000, 5_000, br)
    assert lp == pytest.approx((1 * 50_000 - 5_000) / (1 * (1 - 0.004)))
    # at LP margin balance == maintenance margin
    assert 5_000 + (lp - 50_000) == pytest.approx(maintenance_margin(lp, br[0]))
    ls = liquidation_price(-1, 1.0, 50_000, 5_000, br)
    assert ls == pytest.approx((5_000 + 50_000) / (1 + 0.004))
    # higher bracket uses cum amount
    lp2 = liquidation_price(1, 10.0, 50_000, 50_000, br)    # notional 450k -> bracket 2
    assert lp2 == pytest.approx((10 * 50_000 - 50_000 - 300) / (10 * (1 - 0.005)))


def test_liquidation_simulation_on_mark_loses_isolated_margin():
    ex, rec = make_ex()
    ex.place_order(Order("BTCUSDT", "BUY", "MARKET", 0.1), 2)
    p = ex.get_position("BTCUSDT")
    lp = ex.liq_price("BTCUSDT")
    margin, fee_open = p.isolated_margin, p.fees
    w_before = ex.wallet
    ex.update_market("BTCUSDT", 3, last=lp + 50, mark=lp + 5)     # just above: alive
    assert ex.get_position("BTCUSDT") is not None
    ex.update_market("BTCUSDT", 4, last=lp - 20, mark=lp - 1)    # mark crosses LP
    assert ex.get_position("BTCUSDT") is None
    assert ex.totals["liquidations"] == 1
    assert ex.wallet == pytest.approx(w_before - margin)
    t = rec.trades[-1]
    assert t["reason"] == "LIQUIDATION"
    assert t["net_pnl"] == pytest.approx(-margin - fee_open)


def test_stop_loss_triggers_on_last_and_fills_at_bid_with_taker_fee():
    ex, rec = make_ex()
    ex.place_order(Order("BTCUSDT", "BUY", "MARKET", 0.1), 2)
    sl = ex.place_order(Order("BTCUSDT", "SELL", "STOP_MARKET", stop_price=49_000, close_position=True), 2)
    tp = ex.place_order(Order("BTCUSDT", "SELL", "TAKE_PROFIT_MARKET", stop_price=52_000, close_position=True), 2)
    assert sl.status == tp.status == "NEW"
    ex.update_market("BTCUSDT", 3, bid=48_950.0, ask=48_950.1, last=48_950.0, mark=49_100)
    assert ex.get_position("BTCUSDT") is None
    f = rec.fills[-1]
    assert f["price"] == 48_950.0 and f["liquidity"] == "TAKER"
    assert rec.trades[-1]["reason"] == "STOP_LOSS"
    assert not ex.open_orders()                                   # TP auto-cancelled (OCO style)


def test_mark_price_trigger_ignores_last():
    ex, _ = make_ex()
    ex.place_order(Order("BTCUSDT", "BUY", "MARKET", 0.1), 2)
    ex.place_order(Order("BTCUSDT", "SELL", "STOP_MARKET", stop_price=49_000, close_position=True,
                         working_type="MARK_PRICE"), 2)
    ex.update_market("BTCUSDT", 3, bid=48_900.0, ask=48_900.1, last=48_900, mark=49_050)   # wick on last only
    assert ex.get_position("BTCUSDT") is not None
    ex.update_market("BTCUSDT", 4, mark=48_990)
    assert ex.get_position("BTCUSDT") is None


def test_stop_that_would_immediately_trigger_is_rejected():
    ex, _ = make_ex()
    ex.place_order(Order("BTCUSDT", "BUY", "MARKET", 0.1), 2)
    o = ex.place_order(Order("BTCUSDT", "SELL", "STOP_MARKET", stop_price=50_100, close_position=True), 2)
    assert o.status == "REJECTED"


def test_backtest_traverse_fill_at_stop_vs_gap():
    ex, rec = make_ex(traverse=True)
    ex.place_order(Order("BTCUSDT", "BUY", "MARKET", 0.1), 2)
    ex.place_order(Order("BTCUSDT", "SELL", "STOP_MARKET", stop_price=49_000, close_position=True), 2)
    ex.update_market("BTCUSDT", 3, bid=48_000, ask=48_000.2, last=48_000.1, mark=48_000)
    assert rec.fills[-1]["price"] == pytest.approx(49_000 - 0.1, abs=0.11)  # traversed: ~stop - half spread
    ex2, rec2 = make_ex(traverse=True)
    ex2.place_order(Order("BTCUSDT", "BUY", "MARKET", 0.1), 2)
    ex2.place_order(Order("BTCUSDT", "SELL", "STOP_MARKET", stop_price=49_000, close_position=True), 2)
    ex2.update_market("BTCUSDT", 3, last=49_500, mark=49_500)
    ex2.mkt["BTCUSDT"].prev_last = 48_000                          # simulate gap (prev already beyond)
    ex2.mkt["BTCUSDT"].last = 48_000
    ex2.update_market("BTCUSDT", 4, bid=48_000, ask=48_000.1, last=48_000, mark=48_000)
    assert rec2.fills[-1]["price"] == 48_000                       # gap: filled at market, worse than stop


def test_insufficient_margin_rejected_and_bracket_leverage_cap():
    ex, _ = make_ex(balance=1_000)
    assert ex.place_order(Order("BTCUSDT", "BUY", "MARKET", 1.0), 2).status == "REJECTED"   # needs 5000 margin
    ex2, _ = make_ex(balance=1_000_000)
    ex2.set_leverage("BTCUSDT", 150)
    assert ex2.place_order(Order("BTCUSDT", "BUY", "MARKET", 7.0), 2).status == "REJECTED"  # 350k > 100x bracket
    assert ex2.place_order(Order("BTCUSDT", "BUY", "MARKET", 5.0), 3).status == "FILLED"    # 250k ok at 150x


def test_persistence_roundtrip():
    ex, _ = make_ex()
    ex.place_order(Order("BTCUSDT", "BUY", "MARKET", 0.1), 2)
    ex.place_order(Order("BTCUSDT", "SELL", "STOP_MARKET", stop_price=49_000, close_position=True), 2)
    d = ex.to_dict()
    ex2, _ = make_ex()
    ex2.load_dict(d)
    assert ex2.wallet == ex.wallet and ex2.get_position("BTCUSDT").qty == 0.1
    assert len(ex2.open_orders()) == 1

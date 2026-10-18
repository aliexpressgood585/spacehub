"""delist_short: parsers, entry clock, stop / time / settlement exits, idempotency."""
import json

from bot.config import load_config
from bot.delist import (_articles_from, fetch_article_list, install_saved_filters, normalize,
                        poll_delist)
from bot.desk import _bind_engine, _delist_blob, risk_overrides, strategy_specs, strategy_view
from bot.engine import TradingEngine
from bot.execution.base import Order
from bot.execution.paper import PaperExchange
from bot.margin import LeverageBrackets
from bot.replay import replay_minutes
from bot.risk import RiskManager
from bot.storage import MemoryRecorder
from bot.strategies import REGISTRY
from bot.strategies.delist_short import (
    HOUR_MS, NAME, article_symbols, body_text, entry_open_ms, exit_ms, futures_symbols,
    is_futures_delist, is_spot_delist, is_tag_notice, plan_entry, settlement_ms, spot_tokens,
    stop_distance, trading_perps)
from bot.symbols import SymbolInfo
from tests.test_math import BTC_BRACKETS

MIN = 60_000


def _perp(sym, status="TRADING"):
    return {
        "symbol": sym, "status": status, "contractType": "PERPETUAL", "quoteAsset": "USDT",
        "baseAsset": sym[:-4],
        "filters": [
            {"filterType": "PRICE_FILTER", "tickSize": "0.0001"},
            {"filterType": "LOT_SIZE", "minQty": "0.1", "maxQty": "1000000", "stepSize": "0.1"},
            {"filterType": "MARKET_LOT_SIZE", "minQty": "0.1", "maxQty": "1000000", "stepSize": "0.1"},
            {"filterType": "MIN_NOTIONAL", "notional": "5"},
        ],
    }


class Feed:
    def __init__(self, bid=10.0, fail=False):
        self.bid = bid
        self.fail = fail
        self.calls = []

    def book_ticker(self, symbol):
        self.calls.append(("book", symbol))
        if self.fail:
            raise RuntimeError("book down")
        return {"bidPrice": str(self.bid), "askPrice": str(self.bid + 0.01), "lastPrice": str(self.bid)}

    def premium_index(self, symbol):
        self.calls.append(("mark", symbol))
        if self.fail:
            raise RuntimeError("mark down")
        return {"markPrice": str(self.bid), "lastFundingRate": "0.0001", "nextFundingTime": 8 * HOUR_MS}


def _engine(symbols=("BTCUSDT",), balance=12_345.0):
    cfg = load_config()
    si = {s: SymbolInfo.from_exchange_info(_perp(s)) for s in symbols}
    rec = MemoryRecorder()
    ex = PaperExchange(si, LeverageBrackets(BTC_BRACKETS), balance, 0.0002, 0.0005, 1.0, 3, listener=rec)
    for s in symbols:
        ex.update_market(s, 1, bid=10.0, ask=10.01, last=10.0, mark=10.0)
    risk = RiskManager(cfg, 0.0005, 1.0)
    specs = strategy_specs(cfg)
    eng = TradingEngine(cfg, ex, specs[0], risk, si, ex.brackets, recorder=rec, strategies=specs)
    _bind_engine(eng, cfg, None)
    eng.overrides = risk_overrides(cfg)
    return eng, ex, rec


def _art(code, title, release, body=""):
    return {"code": code, "id": 1, "title": title, "releaseDate": release, "body": body}


def _detail(title, body):
    return {"title": title, "body": body}


# ---------------------------------------------------------------- parsers
def test_futures_title_and_body_symbols_and_spot_title_mapping():
    title = "Binance Futures Will Delist USDⓈ-M AERGOUSDT Perpetual Contract (2026-07-24)"
    assert is_futures_delist(title)
    assert not is_spot_delist(title)
    body = json.dumps({"node": "root", "child": [
        {"node": "text", "text": "automatic settlement the following perpetual contract(s) as below:"},
        {"node": "text", "text": "2026-07-24 06:30 (UTC)"},
        {"node": "text", "text": "AERGOUSDT and also PUMPBTCUSDT"},
    ]})
    text = body_text(body)
    assert futures_symbols(title, text) == ["AERGOUSDT", "PUMPBTCUSDT"]
    trading = {"AERGOUSDT", "PUMPBTCUSDT"}
    syms, kind = article_symbols(title, text, trading)
    assert kind == "fut" and syms == ["AERGOUSDT", "PUMPBTCUSDT"]
    # COIN-M names and a bare USDT mention are not contracts.
    assert "USDT" not in futures_symbols(title, "COIN-M APTUSD will delist. USDT-M margin.")

    spot = "Binance Will Delist EPIC, QUICK on 2026-10-28"
    assert is_spot_delist(spot) and not is_futures_delist(spot)
    assert spot_tokens(spot) == ["EPIC", "QUICK"]
    assert spot_tokens("Binance Will Delist FOO and BAR & BAZ on 2026-01-02") == ["FOO", "BAR", "BAZ"]
    syms, kind = article_symbols(spot, "", {"QUICKUSDT", "1000EPICUSDT"})
    assert kind == "spot" and syms == ["1000EPICUSDT", "QUICKUSDT"]
    # Not TRADING, or no perp at all: nothing to short.
    rows = {"symbols": [_perp("QUICKUSDT", "BREAK"), _perp("EPICUSDT", "PENDING_TRADING")]}
    assert trading_perps(rows) == {}
    assert article_symbols(spot, "", trading_perps({"symbols": [_perp("QUICKUSDT")]})) == (["QUICKUSDT"], "spot")

    assert not is_spot_delist("Binance Margin Will Delist WAN on 2026-04-10")
    assert not is_futures_delist("Binance Margin Will Delist WAN on 2026-04-10")
    assert article_symbols("Binance Margin And Loan Will Delist HOT, THE on 2026-07-03", "", trading) == ([], None)
    assert not is_spot_delist("Binance Will Delist UTK and Support Rebranding and Airdrop Plan on Binance Alpha")


def test_both_title_styles_monitoring_tag_cap_and_cross_type_dedupe():
    fut = "Binance Futures Will Delist USDⓈ-M MYROUSDT and 1000XUSDT Perpetual Contracts (2025-11-14)"
    assert is_futures_delist(fut) and not is_spot_delist(fut) and not is_tag_notice(fut)
    assert futures_symbols(fut, "") == ["1000XUSDT", "MYROUSDT"]
    syms, kind = article_symbols(fut, "", {"1000XUSDT", "MYROUSDT"})
    assert kind == "fut" and syms == ["1000XUSDT", "MYROUSDT"]

    spot = "Binance Will Delist EPIC, QUICK on 2026-10-28"
    assert is_spot_delist(spot) and not is_futures_delist(spot)
    # EPIC has no EPICUSDT; the 1000-prefixed perp is the contract. QUICK maps to QUICKUSDT.
    syms, kind = article_symbols(spot, "", {"1000EPICUSDT", "QUICKUSDT", "EPICUSDT"})
    assert kind == "spot" and syms == ["EPICUSDT", "QUICKUSDT"]
    syms, kind = article_symbols(spot, "", {"1000EPICUSDT", "QUICKUSDT"})
    assert syms == ["1000EPICUSDT", "QUICKUSDT"]

    monitor = "Binance Will Extend the Monitoring Tag to Include ACT, BLUR, PIVX & QKC on 2026-06-18"
    seed = "Binance Will Extend the Seed Tag to Include FOO & BAR on 2026-03-01"
    mixed = "Binance Will Delist FOO on 2026-06-18 and Extend the Monitoring Tag"
    for title in (monitor, seed, mixed):
        assert is_tag_notice(title)
        assert not is_futures_delist(title) and not is_spot_delist(title)
        assert article_symbols(title, "FOOUSDT ACTUSDT", {"FOOUSDT", "ACTUSDT", "BLURUSDT"}) == ([], None)

    names = ["ZZZ", "AAA", "MMM", "BBB"]
    trading = {f"{s}USDT" for s in names}
    long_fut = "Binance Futures Will Delist Multiple USDⓈ-M Perpetual Contracts (2026-01-01)"
    text = " ".join(f"{s}USDT" for s in names)
    assert article_symbols(long_fut, text, trading) == (["AAAUSDT", "BBBUSDT", "MMMUSDT"], "fut")
    volumes = {"ZZZUSDT": 9, "AAAUSDT": 1, "MMMUSDT": 8, "BBBUSDT": 7}
    assert article_symbols(long_fut, text, trading, volumes=volumes)[0] == [
        "ZZZUSDT", "MMMUSDT", "BBBUSDT"]
    long_spot = "Binance Will Delist ZZZ, AAA, MMM, BBB on 2026-01-01"
    assert article_symbols(long_spot, "", trading) == (["ZZZUSDT", "AAAUSDT", "MMMUSDT"], "spot")

    # SHARED is selected by the futures notice, so the spot notice does not take it again.
    shared_fut = "Binance Futures Will Delist USDⓈ-M SHAREDUSDT Perpetual Contract"
    spot_both = "Binance Will Delist SHARED, ZED, YEN, WON on 2026-06-01"
    book = {"SHAREDUSDT", "ZEDUSDT", "YENUSDT", "WONUSDT", "EXTRAUSDT"}
    taken = set()
    first, k1 = article_symbols(shared_fut, "SHAREDUSDT", book, taken=taken)
    assert k1 == "fut" and first == ["SHAREDUSDT"]
    taken.update(first)
    second, k2 = article_symbols(spot_both, "", book, taken=taken)
    assert k2 == "spot" and second == ["ZEDUSDT", "YENUSDT", "WONUSDT"]
    assert "SHAREDUSDT" not in second


def test_settlement_clock_is_the_automatic_settlement_stamp():
    text = (
        "Binance Futures will close all positions and conduct an automatic settlement "
        "the following perpetual contract(s) as below:\n2026-10-05 09:00 (UTC)\n"
        "Users are advised to close any open positions prior to the delisting time to avoid automatic settlement.\n"
        "Users are not allowed to open new positions starting from\n2026-10-05 08:30 (UTC)\n"
    )
    got = settlement_ms(text, 0)
    # 2026-10-05 09:00 UTC, not the 08:30 "no new positions" line and not a later product time.
    from datetime import datetime, timezone
    want = int(datetime(2026, 10, 5, 9, 0, tzinfo=timezone.utc).timestamp() * 1000)
    assert got == want
    later = text + (
        "\nBinance Futures will close all positions and conduct an automatic settlement "
        "on the contracts at\n2026-10-20 09:00 (UTC)\n"
    )
    assert settlement_ms(later, 0) == want
    assert settlement_ms("no clock here", 0) is None
    assert settlement_ms("automatic settlement was 2020-01-01 00:00 (UTC)", 1_700_000_000_000) is None


def test_entry_is_the_first_full_hour_and_exit_is_72h_or_settlement():
    # 10:15 -> 11:00. Exactly 10:00:00 -> 11:00, not the bar that opens on the release.
    assert entry_open_ms(10 * HOUR_MS + 15 * MIN) == 11 * HOUR_MS
    assert entry_open_ms(10 * HOUR_MS) == 11 * HOUR_MS
    entry = 11 * HOUR_MS
    assert exit_ms(entry, None) == entry + 72 * HOUR_MS
    settle = entry + 10 * HOUR_MS
    early = settle - 30 * MIN
    assert exit_ms(entry, settle) == early
    assert early < entry + 72 * HOUR_MS
    # Settlement after the 72h close does not shorten the hold.
    assert exit_ms(entry, entry + 80 * HOUR_MS) == entry + 72 * HOUR_MS
    # A settlement inside the entry bar is not a trade.
    assert plan_entry(10 * HOUR_MS + 15 * MIN, entry, settlement=entry + 10 * MIN)["action"] == "skip"
    assert stop_distance(100.0) == 20.0

    release = 10 * HOUR_MS + 15 * MIN
    assert plan_entry(release, entry - MIN)["action"] == "wait"
    assert plan_entry(release, entry + 10_000)["action"] == "enter"
    assert plan_entry(release, entry + 3 * MIN)["action"] == "enter"
    assert plan_entry(release, entry + 3 * MIN + 1)["reason"] == "late"
    # First start: a notice older than the lookback is ignored, even if we are still
    # inside what would have been its entry grace.
    assert plan_entry(release, entry + 10_000, since_ms=entry + 5 * HOUR_MS)["action"] == "ignore"


# ---------------------------------------------------------------- poll
def _release_entering_at(entry, minute=15):
    return entry - HOUR_MS + minute * MIN


def test_poll_caps_one_notice_at_three_and_does_not_double_a_shared_symbol():
    eng, ex, rec = _engine()
    entry = 100 * HOUR_MS
    release = _release_entering_at(entry)
    names = ["S1", "S2", "S3", "S4"]
    fut = "Binance Futures Will Delist Multiple USDⓈ-M Perpetual Contracts (2099-01-01)"
    body = " ".join(f"{s}USDT" for s in names)
    spot = "Binance Will Delist S1, S2 on 2099-01-01"
    monitor = "Binance Will Extend the Monitoring Tag to Include S1, S4 on 2099-01-01"
    info = {"symbols": [_perp(f"{s}USDT") for s in names]}
    articles = [
        _art("fut", fut, release),
        _art("spot", spot, release),
        _art("tag", monitor, release),
    ]
    details = {
        "fut": _detail(fut, body),
        "spot": _detail(spot, ""),
        "tag": _detail(monitor, "S1USDT S4USDT"),
    }
    poll_delist(eng, entry + 5_000, info, None, Feed(),
                list_fn=lambda: articles, detail_fn=lambda code: details[code])
    held = sorted(s for s, p in ex.positions().items() if p.strategy == NAME)
    # S1..S4 sort to S1 S2 S3. The spot notice does not open S1 again, and the tag opens nothing.
    assert held == ["S1USDT", "S2USDT", "S3USDT"]
    assert ex.get_position("S4USDT") is None
    assert all(p.side == -1 for p in ex.positions().values())


def test_poll_enters_on_the_entry_minute_and_is_idempotent():
    eng, ex, rec = _engine()
    entry = 100 * HOUR_MS
    release = _release_entering_at(entry)
    title = "Binance Futures Will Delist USDⓈ-M NEWCOINUSDT Perpetual Contract"
    body = "automatic settlement as below:\n2099-01-01 00:00 (UTC)\nNEWCOINUSDT"
    art = _art("c1", title, release)
    details = {"c1": _detail(title, body)}
    calls = {"n": 0}

    def detail(code):
        calls["n"] += 1
        return details[code]

    info = {"symbols": [_perp("NEWCOINUSDT"), _perp("BTCUSDT")]}
    now = entry + 5_000
    st = poll_delist(eng, now, info, None, Feed(), list_fn=lambda: [art], detail_fn=detail)
    p = ex.get_position("NEWCOINUSDT")
    assert p is not None and p.side == -1 and p.strategy == NAME
    assert abs(p.meta["sl"] / p.entry_price - 1.20) < 0.002
    assert p.meta["exit_ts"] == entry + 72 * HOUR_MS
    assert abs(p.qty * p.entry_price - 0.05 * 12_345.0) / (0.05 * 12_345.0) < 0.02
    assert ex.wallet != 10_000 and ex.wallet < 12_345.0
    assert any(o.type == "STOP_MARKET" and o.side == "BUY" and abs(o.stop_price - p.meta["sl"]) < 1e-9
               for o in ex.orders.values())
    qty = p.qty
    st2 = poll_delist(eng, now + 10_000, info, None, Feed(), list_fn=lambda: [art], detail_fn=detail)
    assert ex.get_position("NEWCOINUSDT").qty == qty
    assert calls["n"] == 1
    assert "c1:NEWCOINUSDT" in {row.split("|", 1)[0] for row in st2["done"]}
    assert st["since_ms"] == now

    # A rebuilt engine with the saved cursor does not enter again.
    eng2, ex2, _ = _engine()
    eng2.delist = normalize(st2)
    poll_delist(eng2, now + 20_000, info, None, Feed(), list_fn=lambda: [art], detail_fn=detail)
    assert ex2.get_position("NEWCOINUSDT") is None


def test_waits_for_the_entry_hour_and_skips_a_late_or_old_notice():
    eng, ex, rec = _engine()
    entry = 100 * HOUR_MS
    release = _release_entering_at(entry)
    title = "Binance Will Delist NEWCOIN on 2099-01-01"
    art = _art("spot1", title, release, "")
    info = {"symbols": [_perp("NEWCOINUSDT")]}
    seen_detail = []

    def detail(code):
        seen_detail.append(code)
        return _detail(title, "Binance Futures will conduct an automatic settlement at\n2099-06-01 00:00 (UTC)\n")

    poll_delist(eng, entry - 30 * MIN, info, None, Feed(), list_fn=lambda: [art], detail_fn=detail)
    assert ex.get_position("NEWCOINUSDT") is None
    assert "spot1:NEWCOINUSDT" in eng.delist["armed"]
    poll_delist(eng, entry + 1_000, info, None, Feed(), list_fn=lambda: [art], detail_fn=detail)
    assert ex.get_position("NEWCOINUSDT").strategy == NAME

    eng, ex, _ = _engine()
    old = _art("old", title, entry - 5 * HOUR_MS)
    poll_delist(eng, entry, info, None, Feed(), list_fn=lambda: [old], detail_fn=detail)
    assert ex.get_position("NEWCOINUSDT") is None
    assert eng.delist["armed"] == {}
    assert "old" not in seen_detail


def test_settlement_exit_is_earlier_than_72h_and_stop_and_time_both_close():
    eng, ex, rec = _engine()
    entry = 100 * HOUR_MS
    release = _release_entering_at(entry)
    # Settlement 10h after the entry open -> out at settlement-30min, not at +72h.
    from datetime import datetime, timezone
    settle_dt = datetime.fromtimestamp((entry + 10 * HOUR_MS) / 1000, timezone.utc)
    stamp = settle_dt.strftime("%Y-%m-%d %H:%M")
    title = "Binance Futures Will Delist USDⓈ-M NEWCOINUSDT Perpetual Contract"
    body = f"conduct an automatic settlement the following:\n{stamp} (UTC)\nNEWCOINUSDT"
    info = {"symbols": [_perp("NEWCOINUSDT")]}
    poll_delist(eng, entry + 1_000, info, None, Feed(),
                list_fn=lambda: [_art("c", title, release)],
                detail_fn=lambda code: _detail(title, body))
    p = ex.get_position("NEWCOINUSDT")
    assert p.meta["exit_ts"] == entry + 10 * HOUR_MS - 30 * MIN
    assert p.meta["exit_ts"] < entry + 72 * HOUR_MS

    sl = p.meta["sl"]
    ex.update_market("NEWCOINUSDT", entry + 2_000, bid=sl, ask=sl + 0.01, last=sl + 0.05, mark=sl)
    assert ex.get_position("NEWCOINUSDT") is None
    assert rec.trades[-1]["reason"] == "STOP_LOSS"
    assert rec.trades[-1]["strategy"] == NAME

    eng, ex, rec = _engine()
    poll_delist(eng, entry + 1_000, info, None, Feed(),
                list_fn=lambda: [_art("c", title, release)],
                detail_fn=lambda code: _detail(title, body))
    t = ex.get_position("NEWCOINUSDT").meta["exit_ts"]
    bar = {t: (t, 10.0, 10.2, 9.8, 10.0, 1.0, t + 59_999)}
    replay_minutes(ex, None, ["NEWCOINUSDT"], [t], {"NEWCOINUSDT": bar}, {}, {}, {}, {}, {},
                   None, strategy_tf="stops")
    assert ex.get_position("NEWCOINUSDT") is None
    assert rec.trades[-1]["reason"] == "TIME"
    assert rec.trades[-1]["strategy"] == NAME


def test_skips_a_symbol_another_strategy_holds_then_enters_if_it_is_free():
    eng, ex, rec = _engine(("NEWCOINUSDT",))
    ex.place_order(Order("NEWCOINUSDT", "BUY", "MARKET", 1.0, tag="ema_trend_4h"), entry := 50 * HOUR_MS)
    assert ex.get_position("NEWCOINUSDT").strategy == "ema_trend_4h"
    release = _release_entering_at(entry)
    title = "Binance Futures Will Delist NEWCOINUSDT"
    info = {"symbols": [_perp("NEWCOINUSDT")]}
    poll_delist(eng, entry + 1_000, info, None, Feed(),
                list_fn=lambda: [_art("c", title, release)],
                detail_fn=lambda code: _detail(title, "NEWCOINUSDT"))
    assert ex.get_position("NEWCOINUSDT").strategy == "ema_trend_4h"
    assert "c:NEWCOINUSDT" in eng.delist["armed"]
    ex.place_order(Order("NEWCOINUSDT", "SELL", "MARKET", 1.0, reduce_only=True, tag="SIGNAL_CLOSE"), entry + 2_000)
    assert ex.get_position("NEWCOINUSDT") is None
    poll_delist(eng, entry + 3_000, info, None, Feed(),
                list_fn=lambda: [_art("c", title, release)],
                detail_fn=lambda code: _detail(title, "NEWCOINUSDT"))
    assert ex.get_position("NEWCOINUSDT").strategy == NAME
    assert ex.get_position("NEWCOINUSDT").side == -1


def test_feed_error_does_not_raise_and_does_not_drop_an_armed_entry():
    eng, ex, _ = _engine()
    entry = 80 * HOUR_MS
    release = _release_entering_at(entry)
    title = "Binance Futures Will Delist NEWCOINUSDT"
    info = {"symbols": [_perp("NEWCOINUSDT")]}

    def boom_list():
        raise RuntimeError("cms down")

    st = poll_delist(eng, entry - MIN, info, None, Feed(fail=True), list_fn=boom_list, detail_fn=boom_list)
    assert ex.get_position("NEWCOINUSDT") is None
    assert st["since_ms"] == entry - MIN

    # List works, book does not: arm the event, do not open, do not throw.
    poll_delist(eng, entry + 1_000, info, None, Feed(fail=True),
                list_fn=lambda: [_art("c", title, release)],
                detail_fn=lambda code: _detail(title, "NEWCOINUSDT"))
    assert ex.get_position("NEWCOINUSDT") is None
    assert "c:NEWCOINUSDT" in eng.delist["armed"]
    # Next minute the book is back. Same article, one entry.
    poll_delist(eng, entry + 2_000, info, None, Feed(),
                list_fn=lambda: [_art("c", title, release)],
                detail_fn=lambda code: _detail(title, "NEWCOINUSDT"))
    assert ex.get_position("NEWCOINUSDT").strategy == NAME


def test_cap_blocks_the_eleventh_until_the_window_passes():
    syms = [f"S{i}USDT" for i in range(10)]
    eng, ex, _ = _engine(syms)
    for s in syms:
        ex.place_order(Order(s, "SELL", "MARKET", 1.0, tag=NAME), 2)
    assert sum(1 for p in ex.positions().values() if p.strategy == NAME) == 10
    entry = 40 * HOUR_MS
    release = _release_entering_at(entry)
    title = "Binance Futures Will Delist NEWCOINUSDT"
    info = {"symbols": [_perp("NEWCOINUSDT")] + [_perp(s) for s in syms]}
    poll_delist(eng, entry + 1_000, info, None, Feed(),
                list_fn=lambda: [_art("c", title, release)],
                detail_fn=lambda code: _detail(title, "NEWCOINUSDT"))
    assert ex.get_position("NEWCOINUSDT") is None
    assert "c:NEWCOINUSDT" in eng.delist["armed"]
    poll_delist(eng, entry + 3 * MIN + 5_000, info, None, Feed(),
                list_fn=lambda: [_art("c", title, release)],
                detail_fn=lambda code: _detail(title, "NEWCOINUSDT"))
    assert ex.get_position("NEWCOINUSDT") is None
    assert "c:NEWCOINUSDT" not in eng.delist["armed"]


def test_on_bar_does_not_trade_and_backtest_summary_is_the_research_row():
    cfg = load_config()
    st = REGISTRY[NAME](cfg["strategy"]["params"][NAME])
    assert st.on_bar(None) == []
    assert st.p["notional_frac"] == 0.05 and st.p["stop_frac"] == 0.20 and st.p["hold_h"] == 72
    names = [s.name for s in strategy_specs(cfg)]
    assert names.index(NAME) < names.index("orb_ny_15m")
    assert names.index(NAME) < names.index("xs_mom_1d")
    view = strategy_view(st, cfg)
    assert view["backtest"]["is"]["return_pct"] == 26.6
    assert view["backtest"]["is"]["pf"] == 3.06
    assert view["backtest"]["is"]["max_dd_pct"] == -2.1
    assert view["backtest"]["is"]["trades"] == 53
    assert view["backtest"]["oos"]["return_pct"] == 24.5
    assert view["backtest"]["oos"]["pf"] == 2.08
    assert view["backtest"]["oos"]["max_dd_pct"] == -7.8
    assert view["backtest"]["oos"]["trades"] == 62
    assert "Not a proven live edge" in view["backtest"]["note"]


def test_saved_filters_and_cursor_survive_a_tick_without_an_engine():
    row = _perp("NEWCOINUSDT")
    infos, brackets = {}, LeverageBrackets([])
    state = {"engine": {"delist": {"filters": {"NEWCOINUSDT": {"info": row, "bracket": None}},
                                   "since_ms": 5, "seen": ["abc"], "done": [], "armed": {}}}}
    install_saved_filters(infos, brackets, state)
    assert "NEWCOINUSDT" in infos
    assert infos["NEWCOINUSDT"].step_size == 0.1
    blob = {"since_ms": 5, "seen": ["abc"]}
    assert _delist_blob({"engine": {"delist": blob}}, None)["seen"] == ["abc"]
    assert _delist_blob({}, None) == {}


def test_announcement_list_fails_soft_and_accepts_both_response_shapes():
    assert _articles_from({"data": {"catalogs": [{"articles": [{"code": "a"}]}]}})[0]["code"] == "a"
    assert _articles_from({"data": {"articles": [{"code": "b"}], "total": 1}})[0]["code"] == "b"
    assert _articles_from({"success": False}) is None

    class Boom:
        def get(self, *a, **k):
            raise RuntimeError("cms down")

    assert fetch_article_list(session=Boom(), timeout=1) is None

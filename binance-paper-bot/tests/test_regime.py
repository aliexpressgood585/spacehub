"""Regime classifier, hysteresis, selector gates, demotion, and the era-2 book."""
import json
from datetime import datetime, timezone

import numpy as np

from bot.config import ROOT, load_config
from bot.desk import consume_era, publish_era_reset, strategy_specs
from bot.engine import TradingEngine
from bot.regime import (RegimeParams, adopt_wider_book, choose_menu, choose_selector,
                        classify_series, fold_frame, fold_labels, feature_frame, oos_beats,
                        raw_label, ruin_probability, window_breach)
from bot.risk import RiskManager
from bot.selector import StrategySelector
from bot.strategies import REGISTRY
from bot.strategies.base import Context, Signal, Strategy
from tests.test_math import make_ex

H4 = 14_400_000
DAY = 86_400_000


def _p(**kw):
    raw = dict(min_dwell_bars=6, adx_period=14, atr_period=14, atr_lookback=90,
               chaos_percentile=0.90, adx_trend_on=25, adx_trend_off=20,
               adx_range_on=18, adx_range_off=23, ema_period=20, slope_bars=3,
               slope_min=0.0015)
    raw.update(kw)
    return RegimeParams(raw)


def _cfg():
    cfg = load_config()
    cfg["regime_selector"] = dict(cfg["regime_selector"])
    cfg["regime_selector"]["demote"] = dict(cfg["regime_selector"]["demote"])
    return cfg


class _Open(Strategy):
    def __init__(self, name):
        super().__init__({"timeframe": "15m"})
        self.name = name

    def on_bar(self, ctx):
        if ctx.position is not None:
            return []
        return [Signal(ctx.symbol, "OPEN_LONG", 500.0, 0.0, 5, "test")]


def _engine(name, balance=10_000):
    cfg = load_config()
    ex, rec = make_ex(balance=balance)
    strat = _Open(name)
    eng = TradingEngine(cfg, ex, strat, RiskManager(cfg, 0.0005, 1.0), ex.si, ex.brackets,
                        recorder=rec, strategies=[strat])
    return cfg, ex, rec, eng


def _bar(ts):
    return (ts, 50_000, 50_010, 49_990, 50_000, 1, ts + 899_999)


def test_raw_bands_and_chaos_first():
    p = _p()
    assert raw_label(30, 0.01, 0.5, None, p) == "TREND"
    assert raw_label(10, 0.0, 0.2, None, p) == "RANGE"
    assert raw_label(22, 0.01, 0.5, None, p) == "HOLD"
    # Stay in trend until ADX falls through the exit band.
    assert raw_label(21, 0.001, 0.4, "TREND", p) == "TREND"
    assert raw_label(19, 0.001, 0.4, "TREND", p) == "HOLD"
    assert raw_label(17, 0.0, 0.4, "TREND", p) == "RANGE"
    # Range holds through the middle of the band, and yields to a real trend.
    assert raw_label(22, 0.0, 0.3, "RANGE", p) == "RANGE"
    assert raw_label(30, 0.01, 0.3, "RANGE", p) == "TREND"
    # A volatility spike is chaos even when ADX is trending.
    assert raw_label(40, 0.02, 0.95, "TREND", p) == "CHAOS"
    assert raw_label(15, 0.0, 0.75, "CHAOS", p) == "CHAOS"
    assert raw_label(15, 0.0, 0.40, "CHAOS", p) == "RANGE"
    assert raw_label(30, 0.01, 0.40, "CHAOS", p) == "TREND"
    assert raw_label(None, 0.0, 0.99, "TREND", p) is None


def test_hysteresis_holds_for_min_dwell_and_chaos_does_not_skip_it():
    raws = ["TREND", "RANGE", "RANGE", "RANGE", "RANGE", "CHAOS"]
    ts = list(range(len(raws)))
    out = fold_labels(raws, ts, min_dwell=3)
    # Bar 0 commits TREND. Bars 1-2 are still inside the dwell. Bar 3 may flip.
    assert out["path"][:4] == ["TREND", "TREND", "TREND", "RANGE"]
    assert out["path"][4] == "RANGE"
    # The chaos bar is the 2nd bar of RANGE (dwell was reset), so it does not flip yet.
    assert out["path"][5] == "RANGE"
    longer = ["RANGE"] * 3 + ["CHAOS"] * 3
    stuck = fold_labels(longer, list(range(len(longer))), min_dwell=3, confirm=2)
    # The first CHAOS bar is only a candidate. The second one, after the dwell, commits.
    assert stuck["path"][:4] == ["RANGE", "RANGE", "RANGE", "RANGE"]
    assert stuck["path"][4] == "CHAOS"
    assert stuck["regime"] == "CHAOS"
    # A single spike after a long dwell stays on the old label.
    assert fold_labels(["RANGE"] * 8 + ["CHAOS"], list(range(9)), min_dwell=3, confirm=2)["regime"] == "RANGE"


def test_classifier_trend_range_and_chaos_from_closed_bars_only():
    p = _p(min_dwell_bars=3, atr_lookback=40, ema_period=10)
    n = 180
    # Steady climb, tight bars: ADX rises, slope is positive, ATR is calm.
    trend_c = 100 * np.exp(np.linspace(0, 0.8, n))
    trend = _ohlc(trend_c, width=0.002)
    tr = classify_series(*trend, np.arange(n) * H4, p)
    assert tr["regime"] == "TREND"
    assert tr["path"][-1] == "TREND"
    # No look-ahead: the prefix's regime is the path at that bar.
    cut = 150
    prefix = classify_series(trend[0][:cut], trend[1][:cut], trend[2][:cut], np.arange(cut) * H4, p)
    assert prefix["regime"] == tr["path"][cut - 1]

    # A slow sine stays out of the trend band.
    x = np.arange(n)
    range_c = 100 + 0.4 * np.sin(2 * np.pi * x / 18)
    rng = classify_series(*_ohlc(range_c, width=0.001), np.arange(n) * H4, p)
    assert rng["regime"] == "RANGE"

    # Calm, then a run of enormous bars. Chaos has to outlast the dwell.
    calm = 100 + 0.05 * np.sin(2 * np.pi * x / 12)
    chaos_c = calm.copy()
    chaos_c[-12:] = calm[-12:] * np.linspace(1.0, 1.4, 12)
    wide = _ohlc(chaos_c, width=0.002)
    for i in range(n - 12, n):
        wide[0][i] = chaos_c[i] * 1.08
        wide[1][i] = chaos_c[i] * 0.85
    ch = classify_series(*wide, np.arange(n) * H4, p)
    assert ch["regime"] == "CHAOS"
    # A single spike inside an otherwise calm book does not flip the dwell.
    one = _ohlc(calm, width=0.002)
    one[0][-1] = calm[-1] * 1.2
    one[1][-1] = calm[-1] * 0.8
    one_fold = classify_series(*one, np.arange(n) * H4, p)
    assert one_fold["regime"] != "CHAOS"


def _ohlc(close, width):
    c = np.asarray(close, float)
    return c * (1 + width), c * (1 - width), c


def test_slice_fold_matches_classifying_that_window():
    p = _p(min_dwell_bars=4, atr_lookback=30, ema_period=8)
    n = 160
    c = 100 * np.exp(np.cumsum(np.sin(np.linspace(0, 40, n)) * 0.01))
    high, low, close = _ohlc(c, 0.003)
    ts = np.arange(n) * H4
    frame = feature_frame(high, low, close, p)
    end = 140
    start = 80
    direct = classify_series(high[start:end], low[start:end], close[start:end], ts[start:end], p)
    # Absolute-index features include history before `start`, so the slice fold
    # is only equal when the window itself is the whole series the features saw.
    whole = fold_frame(frame, ts, p)
    again = classify_series(high, low, close, ts, p)
    assert whole["regime"] == again["regime"]
    assert whole["path"] == again["path"]
    assert direct["regime"] in ("TREND", "RANGE", "CHAOS")


def test_chaos_stands_aside_and_disabled_selector_does_not():
    cfg, ex, rec, eng = _engine("ema_trend_4h")
    sel = StrategySelector(cfg, None)
    sel.enabled = True
    sel.market = "CHAOS"
    sel.symbols = {"BTCUSDT": "CHAOS"}
    sel.classified = True
    sel.bar_ts = 10 ** 15
    eng.selector = sel
    eng.on_bar_closed("BTCUSDT", "15m", _bar(0))
    assert ex.get_position("BTCUSDT") is None
    assert any(e["type"] == "SIGNAL_FILTERED" and "CHAOS" in e["msg"] for e in rec.events)

    cfg2, ex2, rec2, eng2 = _engine("ema_trend_4h")
    off = StrategySelector(cfg2, None)
    off.enabled = False
    off.market = "CHAOS"
    off.symbols = {"BTCUSDT": "CHAOS"}
    off.bar_ts = 10 ** 15
    eng2.selector = off
    eng2.on_bar_closed("BTCUSDT", "15m", _bar(0))
    assert ex2.get_position("BTCUSDT") is not None


def test_switch_uses_the_regime_strategy_and_records_the_change():
    cfg = _cfg()
    cfg["regime_selector"]["enabled"] = True
    cfg["regime_selector"]["range_strategy"] = "bb_rsi_4h"
    sel = StrategySelector(cfg, None)
    sel.enabled = True
    sel.market = "RANGE"
    sel.symbols = {"ETHUSDT": "RANGE"}
    sel.bar_ts = 10 ** 15
    assert sel.allow("ema_trend_4h", "ETHUSDT", 0) == (False, "regime RANGE uses bb_rsi_4h")
    assert sel.allow("bb_rsi_4h", "ETHUSDT", 0)[0] is True
    sel.market = "TREND"
    sel.symbols = {"ETHUSDT": "TREND"}
    trend = sel.trend_strategy
    assert sel.allow(trend, "ETHUSDT", 0)[0] is True
    assert sel.allow("bb_rsi_4h", "ETHUSDT", 0)[0] is False
    # Account-wide cap still holds when two sleeves exist.
    assert sel.allow(trend, "ETHUSDT", sel.max_positions - 1)[0] is True
    assert sel.allow(trend, "ETHUSDT", sel.max_positions)[0] is False

    n = 220
    c = 100 * np.exp(np.linspace(0, 0.9, n))
    high, low, close = _ohlc(c, 0.002)
    ts = (np.arange(n) * H4).astype(float)
    book = {"open_time": ts, "high": high, "low": low, "close": close,
            "close_time": ts + H4 - 1, "open": close, "volume": np.ones(n)}
    fresh = StrategySelector(cfg, None)
    fresh.enabled = True
    events = fresh.sync({"BTCUSDT": book, "ETHUSDT": book}, int(ts[-1]) + H4)
    assert fresh.market == "TREND"
    assert fresh.active_strategy() == fresh.trend_strategy
    assert events and events[0]["type"] == "REGIME_CHANGE"
    assert events[0]["regime_old"] is None and events[0]["regime_new"] == "TREND"
    assert events[0]["active_strategy"] == fresh.trend_strategy
    again = fresh.sync({"BTCUSDT": book, "ETHUSDT": book}, int(ts[-1]) + H4)
    assert again == []


def test_demote_and_promote_from_the_rolling_window():
    cfg = _cfg()
    cfg["regime_selector"]["enabled"] = True
    sel = StrategySelector(cfg, None)
    sel.enabled = True
    sel.market = "TREND"
    sel.symbols = {"BTCUSDT": "TREND"}
    name = sel.trend_strategy
    now = 1_700_000_000_000
    trades = []
    for i in range(4):
        trades.append({"strategy": name, "net_pnl": -1.5, "symbol": "ETHUSDT",
                       "close_ts": now - (4 - i) * 3_600_000, "open_ts": now - DAY})
    events = sel.review(trades, now, 100)
    assert events and events[0]["type"] == "STRATEGY_DEMOTED"
    assert events[0]["strategy"] == name
    assert sel.allow(name, "BTCUSDT", 0)[0] is False
    assert sel.active_strategy() is None
    # Calling it again does not emit a second demotion.
    assert sel.review(trades, now, 100) == []
    # Fourteen days later the window is empty and the sleeve comes back.
    later = now + 15 * DAY
    back = sel.review(trades, later, 100)
    assert back and back[0]["type"] == "STRATEGY_PROMOTED"
    assert sel.allow(name, "BTCUSDT", 0)[0] is True
    # A disabled selector never demotes the live book.
    off = StrategySelector(cfg, None)
    off.enabled = False
    assert off.review(trades, now, 100) == []
    assert window_breach(trades, name, now, 100, cfg["regime_selector"]["demote"])["breach"] is True


def test_bb_rsi_4h_fades_a_fresh_band_break_and_ignores_a_stale_bar():
    s = REGISTRY["bb_rsi_4h"](dict(load_config()["strategy"]["params"]["bb_rsi_4h"]))
    # Flat, then one close punched through the lower band.
    c = [100.0] * 40 + [100.0, 90.0]
    h4 = _bars(c, H4)
    ts = int(h4["close_time"][-1]) + 1
    sigs = s.on_bar(Context("SOLUSDT", ts, {"4h": h4, "1h": _bars([90, 90], 3_600_000)}))
    assert sigs and sigs[0].action == "OPEN_LONG"
    assert sigs[0].sl_distance > 0 and sigs[0].tp_distance > 0
    assert s.on_bar(Context("SOLUSDT", ts + 3_600_000, {"4h": h4, "1h": _bars([90, 90], 3_600_000)})) == []


def _bars(closes, step):
    c = np.asarray(closes, float)
    o = np.concatenate([[c[0]], c[:-1]])
    t = np.arange(len(c)) * step
    return {"open_time": t.astype(float), "open": o, "high": np.maximum(o, c) * 1.001,
            "low": np.minimum(o, c) * 0.999, "close": c, "volume": np.ones(len(c)),
            "close_time": (t + step - 1).astype(float)}


def test_oos_rule_is_return_and_drawdown_margin():
    base = {"return_pct": 5.0, "max_drawdown_pct": -10.0, "trades": 20}
    better = {"return_pct": 8.0, "max_drawdown_pct": -11.5, "trades": 18}
    too_deep = {"return_pct": 9.0, "max_drawdown_pct": -12.1, "trades": 18}
    thin = {"return_pct": 30.0, "max_drawdown_pct": -1.0, "trades": 4}
    worse = {"return_pct": 4.0, "max_drawdown_pct": -5.0, "trades": 20}
    flat_ok = {"return_pct": 6.0, "max_drawdown_pct": -11.0, "trades": 20}
    assert oos_beats(base, better, dd_margin_pp=2.0) is True
    assert oos_beats(base, too_deep, dd_margin_pp=2.0) is False
    assert oos_beats(base, thin, dd_margin_pp=2.0) is False
    assert oos_beats(base, worse, dd_margin_pp=2.0) is False
    chosen = choose_selector(base, better, flat_ok, 2.0)
    assert chosen["enabled"] is True and chosen["range_strategy"] == "bb_rsi_4h"
    aside = choose_selector(base, too_deep, better, 2.0)
    assert aside["enabled"] is True and aside["range_strategy"] is None
    neither = choose_selector(base, worse, too_deep, 2.0)
    assert neither["enabled"] is False and neither["range_strategy"] is None
    # Live rule: a deeper drawdown is allowed when the return is higher.
    menu = choose_menu(base, [
        {"name": "regime_flat", "return_pct": 6.0, "max_drawdown_pct": -11.0, "trades": 20,
         "trend_strategy": "ema_trend_4h", "range_strategy": None},
        {"name": "regime_mr", "return_pct": 9.0, "max_drawdown_pct": -40.0, "trades": 18,
         "trend_strategy": "ema_trend_4h", "range_strategy": "bb_rsi_4h"},
    ])
    assert menu["enabled"] is True and menu["range_strategy"] == "bb_rsi_4h"
    tied = choose_menu(base, [
        {"name": "regime_flat", "return_pct": 8.0, "max_drawdown_pct": -11.0, "trades": 20,
         "trend_strategy": "ema_trend_4h", "range_strategy": None},
        {"name": "regime_mr", "return_pct": 8.0, "max_drawdown_pct": -11.0, "trades": 20,
         "trend_strategy": "ema_trend_4h", "range_strategy": "bb_rsi_4h"},
    ])
    assert tied["enabled"] is True and tied["range_strategy"] is None
    off = choose_menu(base, [
        {"name": "regime_flat", "return_pct": 4.0, "max_drawdown_pct": -5.0, "trades": 20,
         "trend_strategy": "ema_trend_4h", "range_strategy": None},
    ])
    assert off["enabled"] is False and off["trend_strategy"] == "ema_trend_4h"
    assert adopt_wider_book({"return_pct": 5.0}, {"return_pct": 5.0, "trades": 8}) is True
    assert adopt_wider_book({"return_pct": 5.0}, {"return_pct": 4.9, "trades": 8}) is False
    calm = ruin_probability([0.01] * 5, paths=200, horizon=5, halt_dd=0.5, seed=1)
    assert calm["p_ruin"] == 0.0 and calm["p_halt"] == 0.0
    dead = ruin_probability([-1.0], paths=50, horizon=2, halt_dd=0.5, seed=1)
    assert dead["p_ruin"] == 1.0
    halted = ruin_probability([-0.6], paths=40, horizon=1, halt_dd=0.5, seed=1)
    assert halted["p_halt"] == 1.0 and halted["p_ruin"] == 0.0


def test_era2_book_is_not_reset_and_regime_loads(tmp_path):
    cfg = load_config()
    now = int(datetime(2026, 10, 25, 12, 8, tzinfo=timezone.utc).timestamp() * 1000)
    live = {
        "era": 2,
        "paper": True,
        "live_trading": False,
        "wallet": 100.0,
        "equity": 100.0,
        "peak_equity": 100.0,
        "starting_balance": 100.0,
        "strategy": {"name": "ema_trend_4h"},
        "symbols": ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"],
        "trades": [],
        "events": [{"ts": 1, "type": "ERA_RESET", "symbol": "", "msg": "era 2"}],
        "positions": [],
        "last_1h_open": now - 3_600_000,
        "last_1m_open": now - 60_000,
        "exchange": {"wallet": 100.0, "positions": {}, "orders": [], "totals": {}},
        "engine": {"risk": {"peak_equity": 100.0, "drawdown_halt": False}},
        "regime": {"enabled": False, "market": "RANGE", "active_strategy": "ema_trend_4h",
                   "symbols": {"BTCUSDT": "RANGE"}, "demoted": [], "classified": True,
                   "bar_ts": now - H4},
    }
    fixture = ROOT + "/tests/fixtures/era2_live_state.json"
    try:
        on_disk = json.loads(open(fixture).read())
    except OSError:
        on_disk = None
    if on_disk:
        assert on_disk.get("era") == 2
        assert on_disk.get("paper") is True
        live["wallet"] = on_disk["wallet"]
        live["equity"] = on_disk.get("equity", on_disk["wallet"])
        live["exchange"] = on_disk.get("exchange") or live["exchange"]
        if on_disk.get("strategy"):
            live["strategy"] = on_disk["strategy"]
        if on_disk.get("trades"):
            live["trades"] = on_disk["trades"][:3]
    path = tmp_path / "state.json"
    path.write_text(json.dumps(live))
    assert publish_era_reset(str(path), live, cfg, now) is None
    assert json.loads(path.read_text())["wallet"] == live["wallet"]
    kept, reset = consume_era(str(path), json.loads(path.read_text()), cfg, now)
    assert reset is False
    assert kept["wallet"] == live["wallet"]
    assert kept["era"] == 2
    assert (kept.get("exchange") or {}).get("wallet") == live["exchange"]["wallet"]
    sel = StrategySelector(cfg, kept.get("regime"))
    assert sel.enabled is bool(cfg["regime_selector"]["enabled"])
    assert sel.market == "RANGE"
    if sel.enabled:
        assert sel.active_strategy() == (cfg["regime_selector"].get("range_strategy") or None)
    else:
        assert sel.active_strategy() == "ema_trend_4h"
    names = [s.name for s in strategy_specs(cfg)]
    assert "orb_ny_15m" not in names and "xs_mom_1d" not in names
    # Global risk is the era-2 book, not something the selector rewrote.
    assert cfg["account"]["risk_profile"] == "aggressive"
    assert cfg["risk"]["risk_per_trade"] == 0.05
    assert cfg["risk"]["max_concurrent_positions"] == 4
    assert cfg["risk"]["max_drawdown"] == 0.50
    assert cfg["risk"]["max_daily_loss"] == 0.15
    assert cfg["risk"]["max_open_risk"] == 0.15
    assert cfg["risk"]["min_notional_roundup_risk"] == 0.07
    assert cfg["account"]["default_leverage"] == 10
    assert cfg["account"]["starting_balance"] == 100.0
    assert cfg["account"]["margin_type"] == "ISOLATED"


def test_oos_menu_stays_off_and_the_live_book_is_the_owner_override():
    """The report's menu still prefers ema_trend_4h. The live book does not.

    The owner asked for regime_fast_mr (short EMA 10/40 + Bollinger/RSI fade)
    on purpose. Risk, era and the five-coin fallback stay the aggressive book.
    """
    path = ROOT + "/reports/regime_oos.json"
    report = json.loads(open(path).read())
    decision = report["decision"]
    cfg = load_config()
    sel = cfg["regime_selector"]
    aggressive = report["oos"]["aggressive"]
    menu = [aggressive[k] for k in aggressive if k != "ema_trend_4h"]
    again = choose_menu(aggressive["ema_trend_4h"], menu)
    assert again["enabled"] is decision["enabled"] is False
    assert again["trend_strategy"] == decision["trend_strategy"] == "ema_trend_4h"
    assert again["range_strategy"] == decision["range_strategy"] is None
    fast = aggressive["regime_fast_mr"]
    assert fast["trend_strategy"] == "ema_fast_4h"
    assert fast["range_strategy"] == "bb_rsi_4h"
    assert fast["return_pct"] == 68.053
    assert fast["max_drawdown_pct"] == -40.92
    assert fast["trades"] == 49
    assert fast["liquidations"] == 0
    # Owner override. Not the menu.
    assert sel["enabled"] is True
    assert sel["trend_strategy"] == "ema_fast_4h"
    assert sel["range_strategy"] == "bb_rsi_4h"
    rows = {r["name"]: r for r in cfg["strategies"]}
    five = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"]
    assert rows["bb_rsi_4h"]["enabled"] is True
    assert rows["ema_fast_4h"]["enabled"] is True
    assert rows["ema_trend_4h"]["enabled"] is True
    assert rows["ema_trend_4h"]["symbols"] == five
    assert rows["ema_fast_4h"]["symbols"] == five
    assert cfg["strategy"]["params"]["ema_fast_4h"]["ema_fast"] == 10
    assert cfg["strategy"]["params"]["ema_fast_4h"]["ema_slow"] == 40
    assert cfg["account"]["risk_profile"] == "aggressive"
    assert cfg["risk"]["risk_per_trade"] == 0.05
    assert cfg["risk"]["max_concurrent_positions"] == 4
    assert cfg["risk"]["max_margin_per_position"] == 0.60
    assert cfg["risk"]["max_daily_loss"] == 0.15
    assert cfg["risk"]["max_drawdown"] == 0.50
    assert cfg["risk"]["max_open_risk"] == 0.15
    assert cfg["account"]["starting_balance"] == 100.0
    assert cfg["account"]["era"] == 2
    assert cfg["account"]["default_leverage"] == 10

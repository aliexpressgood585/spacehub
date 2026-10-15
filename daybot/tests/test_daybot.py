"""Safety + logic tests. Run: python -m pytest -q tests"""
from __future__ import annotations

import copy
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from daybot import filters as F  # noqa: E402
from daybot.backtest import SimBroker  # noqa: E402
from daybot.config import Config, ConfigError, load_config, validate  # noqa: E402
from daybot.data import Bars, SymbolView, aggregate, prepare, value_area  # noqa: E402
from daybot.engine import Engine, EntryOrder, Position, gate_pass  # noqa: E402
from daybot.executor import LiveBroker  # noqa: E402
from daybot.journal import MemoryJournal  # noqa: E402
from daybot.risk import RiskManager, cost_check, size_position  # noqa: E402
from daybot.setups import Candidate, s2_turtle_soup, s6_orb  # noqa: E402

TZ = ZoneInfo("Asia/Jerusalem")


@pytest.fixture()
def cfg(tmp_path):
    raw = yaml.safe_load((ROOT / "config.yaml").read_text())
    p = tmp_path / "config.yaml"
    p.write_text(yaml.safe_dump(raw))
    return load_config(p)


def ms(y, mo, d, h=0, mi=0, tz=TZ):
    return int(datetime(y, mo, d, h, mi, tzinfo=tz).timestamp() * 1000)


# ------------------------------------------------------------------ config / hard caps
def test_default_config_is_testnet(cfg):
    assert cfg.mode == "testnet"


@pytest.mark.parametrize("path,val", [("risk.risk_per_trade", 0.02), ("risk.max_leverage", 10), ("risk.kill_drawdown", 0.2),
                                      ("risk.daily_stop", 0.05), ("risk.max_open", 3), ("costs.max_cost_r", 0.5),
                                      ("risk.liq_vs_stop", 1.0), ("costs.min_target_r", 1.0)])
def test_hard_caps_refuse_to_start(cfg, path, val):
    raw = copy.deepcopy(cfg.raw)
    d = raw
    *head, last = path.split(".")
    for k in head:
        d = d[k]
    d[last] = val
    assert validate(raw), f"{path}={val} should be rejected"


def test_live_needs_explicit_env(tmp_path, cfg, monkeypatch):
    raw = copy.deepcopy(cfg.raw)
    raw["mode"] = "live"
    p = tmp_path / "live.yaml"
    p.write_text(yaml.safe_dump(raw))
    monkeypatch.delenv("DAYBOT_LIVE_CONFIRM", raising=False)
    with pytest.raises(ConfigError):
        load_config(p)
    monkeypatch.setenv("DAYBOT_LIVE_CONFIRM", "I_ACCEPT_REAL_MONEY_RISK")
    assert load_config(p).mode == "live"


def test_gate_missing_means_no_setups(cfg):
    raw = copy.deepcopy(cfg.raw)
    for s in raw["setups"].values():
        if isinstance(s, dict):
            s["enabled"] = True
    c = Config(raw, cfg.path)
    assert gate_pass(c, None) == set()
    g = {"setups": {"S1": {"pass": True}, "S2": {"pass": False}}}
    assert gate_pass(c, g) == {"S1"}
    raw["setups"]["S1"]["enabled"] = False            # config can switch a passing setup off
    assert gate_pass(c, g) == set()
    raw["gate"]["allow_failed_on_testnet"] = True     # testnet-only override
    assert gate_pass(c, g) == {"S2", "S3", "S4", "S5", "S6"}
    raw["mode"] = "live"
    assert gate_pass(c, g) == set()


def test_shipped_config_trades_nothing(cfg):
    import json
    gate = json.loads((ROOT / "reports" / "setup_gate.json").read_text())
    assert gate_pass(cfg, gate) == set()  # the backtest failed every setup


# ------------------------------------------------------------------ part A: cost rule
def test_cost_rule(cfg):
    assert not cost_check(1, 100, 99.5, [], cfg, 0.2).ok          # 0.16 / 0.5 = 0.32R
    r = cost_check(1, 100, 99, [], cfg, 0.2)                     # 0.16R, default 2R target
    assert r.ok and abs(r.cost_r - 0.16) < 1e-9 and abs(r.expected_r - 1.84) < 1e-9
    assert not cost_check(1, 100, 99, [(101.2, 1.0)], cfg, 0.2).ok   # 1.2R - 0.16 < 1.5
    assert not cost_check(1, 100, 101, [], cfg, 0.2).ok          # stop above a long
    assert not cost_check(-1, 100, 99, [], cfg, 0.2).ok          # stop below a short
    assert not cost_check(1, 100, 99, [], cfg, 0.15).ok          # night: 0.16R > 0.15R


# ------------------------------------------------------------------ part D: size
def test_size_basic(cfg):
    s = size_position(10_000, 10_000, 1, 100, 99, cfg)
    assert s.ok and abs(s.notional - 5_000) < 1e-6 and s.leverage == 1 and abs(s.risk_usd - 50) < 1e-6


def test_size_tight_stop_uses_leverage_but_capped(cfg):
    s = size_position(10_000, 10_000, 1, 100, 99.8, cfg)   # 0.2% stop -> $25k wanted
    assert s.ok and s.leverage <= 5 and s.notional <= 50_000
    assert (1 / s.leverage - 0.005) >= 2 * 0.002          # liquidation at least 2x the stop away
    s2 = size_position(10_000, 10_000, 1, 100, 99.99, cfg)  # 0.01% stop -> would need 50x
    assert s2.notional <= 10_000 * 5 + 1e-6


def test_size_refuses_when_liquidation_too_close(cfg):
    assert not size_position(10_000, 10_000, 1, 100, 40, cfg).ok  # 60% stop: no leverage keeps liq 2x away


def test_risk_never_above_hard_cap(cfg):
    raw = copy.deepcopy(cfg.raw)
    raw["risk"]["risk_per_trade"] = 0.5  # would be refused by config; risk.py clamps again anyway
    c = Config(raw, cfg.path)
    s = size_position(10_000, 10_000, 1, 100, 99, c)
    assert s.risk_usd <= 10_000 * 0.01 + 1e-6


# ------------------------------------------------------------------ part D: limits
def test_daily_weekly_kill(cfg):
    rm = RiskManager(cfg)
    t = ms(2026, 10, 13, 12)
    rm.update_equity(10_000, t)
    assert "DAY_STOP" in rm.update_equity(9_790, t + 60_000)
    ok, why = rm.can_enter(t + 120_000, [], "BTC", 1)
    assert not ok and "daily" in why
    rm.update_equity(9_790, ms(2026, 10, 14, 0, 1))
    assert rm.can_enter(ms(2026, 10, 14, 0, 2), [], "BTC", 1)[0]  # the daily stop ends at Israel midnight
    rm2 = RiskManager(cfg)
    rm2.update_equity(10_000, t)
    ev = rm2.update_equity(8_990, t + 60_000)
    assert "KILL" in ev and "WEEK_STOP" in ev
    assert not rm2.can_enter(t + 120_000, [], "BTC", 1)[0]


def test_streak_and_counts(cfg):
    rm = RiskManager(cfg)
    t = ms(2026, 10, 13, 12)
    rm.update_equity(10_000, t)
    for k in range(3):
        rm.on_close(-10, t + k)
    ok, why = rm.can_enter(t + 3_600_000, [], "BTC", 1)
    assert not ok and "losses" in why
    assert rm.can_enter(t + 4 * 3_600_000 + 10, [], "BTC", 1)[0]  # pause = 4h after the 3rd loss
    rm.s.entries = [t + 5 * 3_600_000 + k for k in range(6)]
    assert not rm.can_enter(t + 6 * 3_600_000, [], "BTC", 1)[0]


def test_book_limits_and_correlation(cfg):
    rm = RiskManager(cfg)
    t = ms(2026, 10, 13, 12)
    rm.update_equity(10_000, t)
    assert not rm.can_enter(t, [("BTC", 1), ("ETH", -1)], "SOL", 1)[0]          # 2 already
    assert not rm.can_enter(t, [("BTC", 1)], "BTC", -1)[0]                     # same coin
    assert not rm.can_enter(t, [("BTC", 1)], "ETH", 1, lambda a, b: 0.85)[0]   # correlated, same side
    assert rm.can_enter(t, [("BTC", 1)], "ETH", 1, lambda a, b: 0.2)[0]
    assert rm.can_enter(t, [("BTC", 1)], "ETH", -1, lambda a, b: 0.85)[0]      # opposite side is fine


# ------------------------------------------------------------------ filters
def test_night_and_weekend(cfg):
    assert F.is_night(ms(2026, 10, 13, 3), cfg)          # Tuesday 03:00 Israel
    assert not F.is_night(ms(2026, 10, 13, 12), cfg)     # Tuesday 12:00
    assert F.is_night(ms(2026, 10, 17, 15), cfg)         # Saturday
    assert F.is_night(ms(2026, 10, 18, 15), cfg)         # Sunday


def test_news_window(cfg):
    ev = datetime.fromisoformat("2026-10-28T14:00:00-04:00").timestamp() * 1000
    assert F.news_block(int(ev - 29 * 60_000), cfg)
    assert F.news_block(int(ev + 30 * 60_000), cfg)
    assert F.news_block(int(ev + 31 * 60_000), cfg) is None


# ------------------------------------------------------------------ synthetic market
def synth(n_min: int, start: int, path) -> Bars:
    t = start + np.arange(n_min, dtype=np.int64) * 60_000
    c = np.asarray([path(i) for i in range(n_min)], dtype=float)
    o = np.concatenate([[c[0]], c[:-1]])
    h = np.maximum(o, c) * 1.0004
    l = np.minimum(o, c) * 0.9996
    return Bars("1m", t, o, h, l, c, np.full(n_min, 1e6))


def test_aggregate_complete_buckets():
    b = synth(60 * 5 + 7, ms(2026, 10, 12, 0, tz=ZoneInfo("UTC")), lambda i: 100 + i * 0.01)
    a = aggregate(b, "15m")
    assert len(a) == 20 and a.t[1] - a.t[0] == 900_000
    assert a.o[0] == b.o[0] and a.c[0] == b.c[14] and a.h[0] == b.h[:15].max()


def test_value_area_contains_poc():
    rng = np.random.default_rng(1)
    c = 100 + rng.normal(0, 1, 200).cumsum() * 0.1
    va = value_area(c + 0.2, c - 0.2, np.ones(200))
    assert va and va[0] <= va[2] <= va[1]


def test_turtle_soup_long():
    t0 = ms(2026, 10, 12, 0, tz=ZoneInfo("UTC"))
    n = 15 * 200
    def path(i):
        k = i // 15
        if k < 198:
            return 100 + 0.5 * np.sin(k / 3)
        return 99.0 if k == 198 else 100.2
    b1 = synth(n, t0, path)
    bars = prepare(b1)
    q = bars["15m"]
    now = int(q.t[-1]) + 900_000
    v = SymbolView("ETH", now, bars)
    c = s2_turtle_soup(v, None)
    assert c and c[0].side == 1 and c[0].stop < q.l[-2:].min() and len(c[0].targets) == 2


def test_orb_first_close_outside(cfg):
    day = (2026, 10, 13)
    start = ms(*day, 0, 0) - 3 * 86_400_000
    a, z = ms(*day, 16, 30), ms(*day, 17, 30)
    def path(i):
        t = start + i * 60_000
        if t < z:
            return 100 + 0.1 * np.sin(i / 50)
        return 101.5
    n = (ms(*day, 17, 45) - start) // 60_000
    bars = prepare(synth(int(n), start, path))
    v = SymbolView("BTC", ms(*day, 17, 45), bars)
    c = s6_orb(v, cfg)
    assert c and c[0].side == 1


# ------------------------------------------------------------------ engine + simulated exchange
def make_engine(cfg, path, minutes=3000):
    start = ms(2026, 10, 12, 0, tz=ZoneInfo("UTC"))
    b1 = synth(minutes, start, path)
    data = {"BTC": prepare(b1)}
    fund = {"BTC": (np.array([], dtype=np.int64), np.array([]))}
    br = SimBroker(cfg, data, fund, 10_000, 0.0003)
    eng = Engine(cfg, br, MemoryJournal(), allowed=set(), assume_liquid=True)
    return eng, br, data, start


def views(data, now):
    return {"BTC": SymbolView("BTC", now, data["BTC"], funding=0.0)}


def test_post_only_fill_needs_trade_through_and_times_out(cfg):
    eng, br, data, start = make_engine(cfg, lambda i: 100.0)  # flat: low 99.96 never trades below 99.9
    now = start + 2000 * 60_000
    br.now = now
    c = Candidate("BTC", "S1", 1, "15m", now - 900_000, 99.0, note="t")
    o = EntryOrder("x1", c, 99.9, 10, 1, now, 10, [(102.0, 1.0)])
    assert br.place_entry(o)
    for k in range(1, 4):
        br.now = now + k * 60_000
        eng.step(br.now, views(data, br.now))
    assert not br.orders() and not br.positions(), "unfilled post-only order must be cancelled after 3 bars"


def test_stop_first_and_break_even(cfg):
    # price rises to +1R then falls back to the entry: the stop must have moved to break-even
    def path(i):
        if i < 2001:
            return 100.0
        if i < 2010:
            return 100.0 + (i - 2000) * 0.15   # reaches ~101.35 (> +1R with a 1.0 stop)
        return 99.5
    eng, br, data, start = make_engine(cfg, path)
    now = start + 2000 * 60_000
    br.now = now
    c = Candidate("BTC", "S1", 1, "15m", now - 900_000, 99.0)
    br.place_entry(EntryOrder("x2", c, 100.0, 10, 1, now, 10, [(103.0, 1.0)]))
    for k in range(1, 40):
        br.now = now + k * 60_000
        eng.step(br.now, views(data, br.now))
    tr = eng.journal.trades
    assert len(tr) == 1 and tr[0]["reason"] == "BE", tr
    assert abs(tr[0]["r"]) < 0.2  # fees + slippage only


def test_time_exit_without_progress(cfg):
    eng, br, data, start = make_engine(cfg, lambda i: 100.0 - (0.06 if i == 2000 else 0.0), minutes=4000)
    now = start + 2000 * 60_000
    br.now = now
    c = Candidate("BTC", "S1", 1, "15m", now - 900_000, 98.0)
    br.place_entry(EntryOrder("x3", c, 99.99, 10, 1, now, 20, [(104.0, 1.0)]))
    for k in range(1, 9 * 15 + 2):
        br.now = now + k * 60_000
        eng.step(br.now, views(data, br.now))
    tr = eng.journal.trades
    assert len(tr) == 1 and tr[0]["reason"] == "TIME"


def test_kill_switch_flattens(cfg):
    eng, br, data, start = make_engine(cfg, lambda i: 100.0 if i < 2005 else 85.0)
    now = start + 2000 * 60_000
    br.now = now
    eng.step(now, views(data, now))
    c = Candidate("BTC", "S1", 1, "15m", now - 900_000, 50.0)
    br.place_entry(EntryOrder("x4", c, 100.0, 80, 1, now, 50, [(200.0, 1.0)]))  # deliberately huge for the test
    for k in range(1, 10):
        br.now = now + k * 60_000
        eng.step(br.now, views(data, br.now))
    assert eng.risk.s.kill and not br.positions()
    assert eng.entries_blocked() == "kill switch"


# ------------------------------------------------------------------ executor against a fake exchange
class FakeEx:
    """Just enough of ccxt.binanceusdm for LiveBroker: orders, conditional orders, positions."""

    def __init__(self, drop_stops=False):
        self.orders, self.trig, self.pos, self.drop_stops, self.n = {}, {}, {}, drop_stops, 0
        self.market_closes = []

    def amount_to_precision(self, m, q): return f"{q:.3f}"
    def price_to_precision(self, m, p): return f"{p:.2f}"
    def market(self, m): return {"limits": {"cost": {"min": 5}}}
    def set_margin_mode(self, *a): return {}
    def set_leverage(self, *a): return {}
    def fetch_balance(self): return {"info": {"totalMarginBalance": "10000", "availableBalance": "9000"}, "USDT": {"total": 10000, "free": 9000}}

    def create_order(self, m, typ, side, qty, price=None, params=None):
        params = params or {}
        self.n += 1
        oid = str(self.n)
        if "stopLossPrice" in params or "takeProfitPrice" in params:
            if not (self.drop_stops and "stopLossPrice" in params):
                self.trig[oid] = {"id": oid, "side": side, "reduceOnly": True, "triggerPrice": float(params.get("stopLossPrice") or params.get("takeProfitPrice")),
                                  "type": "STOP_MARKET" if "stopLossPrice" in params else "TAKE_PROFIT_MARKET", "info": {"orderType": "STOP_MARKET" if "stopLossPrice" in params else "TAKE_PROFIT_MARKET"}}
            return {"id": oid, "status": "open"}
        if typ == "market" and params.get("reduceOnly"):
            self.market_closes.append(m)
            self.pos.pop(m, None)
            return {"id": oid, "status": "closed"}
        self.orders[oid] = {"id": oid, "status": "open", "filled": 0, "average": price, "clientOrderId": params.get("clientOrderId")}
        return {"id": oid, "status": "open"}

    def fill(self, oid, m, side, qty, px):
        self.orders[oid].update(status="closed", filled=qty, average=px)
        self.pos[m] = {"contracts": qty, "side": side, "entryPrice": px, "liquidationPrice": px * (0.5 if side == "long" else 1.5), "leverage": 2}

    def fetch_order(self, oid, m): return self.orders[oid]
    def fetch_positions(self, ms_): return [self.pos[m] for m in ms_ if m in self.pos]
    def fetch_open_orders(self, m, since=None, limit=None, params=None):
        return list(self.trig.values()) if params and params.get("trigger") else [o for o in self.orders.values() if o["status"] == "open"]
    def cancel_order(self, oid, m, params=None):
        self.trig.pop(oid, None)
        if oid in self.orders:
            self.orders[oid]["status"] = "canceled"
    def cancel_all_orders(self, m, params=None):
        if params and params.get("trigger"):
            self.trig.clear()
    def fetch_my_trades(self, m, since): return []
    def fetch_funding_history(self, m, since): return []


def test_executor_protects_every_fill(cfg):
    ex = FakeEx()
    br = LiveBroker(cfg, ex)
    c = Candidate("BTC", "S1", 1, "15m", 0, 99.0)
    o = EntryOrder("y1", c, 100.0, 1.0, 2, 0, 10, [(102.0, 1.0)])
    assert br.place_entry(o)
    ex.fill(o.exchange["id"], "BTC/USDT:USDT", "long", 1.0, 100.0)
    br.poll(0)
    assert len(br.positions()) == 1
    kinds = sorted(t["type"] for t in ex.trig.values())
    assert kinds == ["STOP_MARKET", "TAKE_PROFIT_MARKET"]


def test_executor_closes_when_stop_cannot_be_confirmed(cfg):
    ex = FakeEx(drop_stops=True)
    br = LiveBroker(cfg, ex)
    c = Candidate("BTC", "S1", 1, "15m", 0, 99.0)
    o = EntryOrder("y2", c, 100.0, 1.0, 2, 0, 10, [(102.0, 1.0)])
    br.place_entry(o)
    ex.fill(o.exchange["id"], "BTC/USDT:USDT", "long", 1.0, 100.0)
    evs = br.poll(0)
    assert "BTC/USDT:USDT" in ex.market_closes and "BTC/USDT:USDT" not in ex.pos
    assert any(e.kind == "ERROR" for e in evs)


def test_move_stop_places_new_before_cancelling_old(cfg):
    ex = FakeEx()
    br = LiveBroker(cfg, ex)
    c = Candidate("BTC", "S1", 1, "15m", 0, 99.0)
    o = EntryOrder("y3", c, 100.0, 1.0, 2, 0, 10, [(102.0, 1.0)])
    br.place_entry(o)
    ex.fill(o.exchange["id"], "BTC/USDT:USDT", "long", 1.0, 100.0)
    br.poll(0)
    p = br.positions()[0]
    old = p.exchange["stop_id"]
    assert br.move_stop(p, 100.0)
    assert old not in ex.trig and any(t["triggerPrice"] == 100.0 for t in ex.trig.values())


def test_startup_closes_position_without_stop(cfg, tmp_path):
    from daybot.journal import Journal
    ex = FakeEx()
    ex.pos["ETH/USDT:USDT"] = {"contracts": 2.0, "side": "long", "entryPrice": 2000.0, "leverage": 2}
    br = LiveBroker(cfg, ex)
    notes = br.reconcile(Journal(tmp_path / "j.sqlite"), ["BTC", "ETH"])
    assert "ETH/USDT:USDT" in ex.market_closes and any("WITHOUT a stop" in n for n in notes)

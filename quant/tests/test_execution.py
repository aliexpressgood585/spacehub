"""Execution against a fake exchange: mandatory stop, partial fills, retries, rejections, reconcile, live gate."""
import json

import pytest

from quant.execution.alerts import Alerts
from quant.execution.broker import Broker, OrderRejected
from quant.execution.gate import LIVE_PHRASE, GateError, resolve_mode
from quant.execution.journal import Journal


class NetworkError(Exception):
    pass


class InvalidOrder(Exception):
    pass


class FakeEx:
    def __init__(self, fill_ratio=1.0, fail_net=0, reject_stop=False, last=100.0):
        self.markets = {"BTC/USDT:USDT": {"limits": {"amount": {"min": 0.001}, "cost": {"min": 5}}}}
        self.orders, self.fill_ratio, self.fail_net, self.reject_stop, self.last = [], fill_ratio, fail_net, reject_stop, last
        self.position = 0.0
        self.calls = 0

    def load_markets(self):
        return self.markets

    def amount_to_precision(self, m, q):
        return f"{q:.3f}"

    def price_to_precision(self, m, p):
        return f"{p:.2f}"

    def fetch_ticker(self, m):
        return {"last": self.last}

    def create_order(self, m, typ, side, qty, price=None, params=None):
        self.calls += 1
        if self.fail_net > 0:
            self.fail_net -= 1
            raise NetworkError("timeout")
        if typ == "STOP_MARKET" and self.reject_stop:
            raise InvalidOrder("Order would immediately trigger")
        o = {"id": str(len(self.orders)), "symbol": m, "type": typ, "side": side, "amount": qty, "params": params or {}, "info": {}}
        if typ == "market":
            filled = qty if params and params.get("reduceOnly") else round(qty * self.fill_ratio, 3)
            self.position += (filled if side == "buy" else -filled)
            o.update(status="closed" if filled == qty else "open", filled=filled, average=self.last)
        else:
            o.update(status="open", filled=0.0, average=None)
        self.orders.append(o)
        return o

    def fetch_order(self, oid, m, params=None):
        o = self.orders[int(oid)]
        return o

    def cancel_order(self, oid, m):
        self.orders[int(oid)]["status"] = "canceled"

    def cancel_all_orders(self, m):
        for o in self.orders:
            if o["status"] == "open":
                o["status"] = "canceled"

    def fetch_open_orders(self, m):
        return [o for o in self.orders if o["status"] == "open"]

    def fetch_positions(self, syms):
        if not self.position:
            return []
        return [{"symbol": "BTC/USDT:USDT", "contracts": abs(self.position), "side": "long" if self.position > 0 else "short",
                 "entryPrice": 100.0, "markPrice": self.last, "unrealizedPnl": 0.0}]


@pytest.fixture
def parts(tmp_path, cfg):
    j = Journal(tmp_path / "j.sqlite", tmp_path / "csv")
    al = Alerts(enabled=False)
    return cfg, j, al


def broker(ex, parts):
    cfg, j, al = parts
    t = [0.0]
    return Broker(ex, j, al, cfg, sleep=lambda s: t.__setitem__(0, t[0] + s), clock=lambda: t[0])


def test_entry_places_exchange_stop(parts):
    ex = FakeEx()
    r = broker(ex, parts).open_position("BTC", 1, 0.5, 98.0, strategy="MR")
    stop = [o for o in ex.orders if o["type"] == "STOP_MARKET"][0]
    assert r["qty"] == 0.5 and stop["amount"] == 0.5 and stop["side"] == "sell"
    assert stop["params"]["reduceOnly"] is True and stop["params"]["stopPrice"] == 98.0


def test_partial_fill_sizes_stop_to_filled(parts):
    ex = FakeEx(fill_ratio=0.4)
    b = broker(ex, parts)
    r = b.open_position("BTC", 1, 1.0, 98.0, strategy="MR")
    stop = [o for o in ex.orders if o["type"] == "STOP_MARKET"][0]
    assert r["qty"] == 0.4 and stop["amount"] == 0.4
    assert any("PARTIAL" in m for m in parts[2].sent)


def test_stop_failure_closes_position(parts):
    ex = FakeEx(reject_stop=True)
    r = broker(ex, parts).open_position("BTC", 1, 0.5, 98.0, strategy="MR")
    assert r is None and ex.position == 0.0            # never left open without a stop
    assert any("closing the position" in m for m in parts[2].sent)


def test_network_errors_are_retried(parts):
    ex = FakeEx(fail_net=2)
    r = broker(ex, parts).open_position("BTC", -1, 0.5, 102.0, strategy="MOM")
    assert r is not None and ex.position == -0.5


def test_business_rejection_not_retried(parts):
    ex = FakeEx(reject_stop=True)
    b = broker(ex, parts)
    n0 = ex.calls
    with pytest.raises(OrderRejected):
        b.place_stop("BTC", 1, 0.5, 98.0)
    assert ex.calls == n0 + 1


def test_refuses_stop_on_wrong_side_and_below_minimum(parts):
    b = broker(FakeEx(last=100.0), parts)
    assert b.open_position("BTC", 1, 0.5, 101.0) is None
    assert b.open_position("BTC", 1, 0.0001, 98.0) is None


def test_reconcile_repairs_missing_stop_and_cancels_orphans(parts):
    ex = FakeEx()
    b = broker(ex, parts)
    b.open_position("BTC", 1, 0.5, 98.0)
    ex.cancel_all_orders("BTC/USDT:USDT")               # stop vanished
    out = b.reconcile(["BTC"], {"BTC": 98.0})
    assert out["repaired"] == ["BTC"]
    ex.position = 0.0                                   # stop filled on the exchange
    out = b.reconcile(["BTC"], {"BTC": 98.0})
    assert out["closed"] == ["BTC"] and out["orphans_cancelled"] == ["BTC"]


def test_reconcile_closes_position_with_unknown_stop(parts):
    ex = FakeEx()
    ex.position = 0.3
    out = broker(ex, parts).reconcile(["BTC"], {})
    assert out["closed_no_stop"] == ["BTC"] and ex.position == 0.0


def test_live_gate_refuses_without_every_manual_step(cfg, tmp_path):
    with pytest.raises(GateError):
        resolve_mode({**cfg, "mode": "backtest"}, tmp_path)
    assert resolve_mode({**cfg, "mode": "testnet"}, tmp_path) == "testnet"
    live = {**cfg, "mode": "live", "exchange": {**cfg["exchange"], "live_approved": True}}
    env = {"QUANT_LIVE_APPROVAL": LIVE_PHRASE}
    with pytest.raises(GateError, match="phase1"):
        resolve_mode(live, tmp_path, env)
    (tmp_path / "phase1-approved.json").write_text(json.dumps({"verdict": "GO"}))
    with pytest.raises(GateError, match="phase2"):
        resolve_mode(live, tmp_path, env)
    (tmp_path / "phase2-review.json").write_text(json.dumps({"approved": True, "days": 21}))
    with pytest.raises(GateError, match="QUANT_LIVE_APPROVAL"):
        resolve_mode(live, tmp_path, {})
    with pytest.raises(GateError, match="live_approved"):
        resolve_mode({**live, "exchange": {**cfg["exchange"], "live_approved": False}}, tmp_path, env)
    assert resolve_mode(live, tmp_path, env) == "live"


def test_keys_only_from_env_and_redacted(caplog):
    import logging

    from quant.execution.exchange import MissingKeys, install_redaction, keys
    with pytest.raises(MissingKeys, match="BINANCE_TESTNET_API_KEY"):
        keys("testnet", {})
    k, s = keys("testnet", {"BINANCE_TESTNET_API_KEY": "KEY123456", "BINANCE_TESTNET_API_SECRET": "SECRET98765"})
    install_redaction([k, s])
    with caplog.at_level(logging.INFO):
        logging.getLogger("x").info("sending with KEY123456 and SECRET98765")
    assert "KEY123456" not in caplog.text and "SECRET98765" not in caplog.text


def test_alerts_never_raise():
    def boom(msg):
        raise OSError("telegram down")
    a = Alerts(enabled=True, env={"TELEGRAM_BOT_TOKEN": "t", "TELEGRAM_CHAT_ID": "c"}, sender=boom, min_interval_s=0)
    a.send("KILL", "test")    # must not raise

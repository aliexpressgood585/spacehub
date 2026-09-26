"""Order execution on Binance USDT-M via ccxt, with the failure modes handled explicitly:

- Rate limits / network faults / exchange unavailable -> retried with exponential backoff (ccxt's own limiter on
  top). Business rejections (insufficient margin, invalid order, min notional) are NOT retried: logged + alerted.
- Partial fills: the entry is a market order; it is polled until filled or `order_timeout_s`; whatever filled is the
  position (the rest is cancelled), and the stop is sized to the FILLED quantity.
- MANDATORY STOP ON THE EXCHANGE: right after the fill a STOP_MARKET reduce-only order is placed at the strategy's
  stop (mark-price triggered). If it cannot be placed after retries, the position is closed at market immediately —
  a position without an exchange-side stop is never left open.
- Reconcile (on start and periodically): the exchange is the truth. A position without a stop gets one (or is closed
  if its stop price is unknown); a stop without a position is cancelled; positions the journal thinks are open but
  the exchange shows flat are reported as closed (the stop filled).
- Idempotency: every order carries a client order id; a retried create that already reached the exchange is found
  by that id instead of being sent twice.
"""
from __future__ import annotations

import logging
import time
import uuid

from .exchange import market_symbol

log = logging.getLogger("quant.broker")

RETRYABLE = ("NetworkError", "RequestTimeout", "ExchangeNotAvailable", "RateLimitExceeded", "DDoSProtection", "OnMaintenance")


def _is(e: Exception, names) -> bool:
    return any(c.__name__ in names for c in type(e).__mro__)


class OrderRejected(RuntimeError):
    pass


class Broker:
    def __init__(self, ex, journal, alerts, cfg: dict, sleep=time.sleep, clock=time.time, max_retries: int = 5):
        self.ex, self.journal, self.alerts, self.cfg = ex, journal, alerts, cfg
        self.sleep, self.clock, self.max_retries = sleep, clock, max_retries
        self.timeout_s = float(cfg["exchange"].get("order_timeout_s", 20))
        self._markets_loaded = False

    # --- plumbing -----------------------------------------------------------------------------------------
    def call(self, fn, *a, **kw):
        delay = 1.0
        for attempt in range(self.max_retries + 1):
            try:
                return fn(*a, **kw)
            except Exception as e:  # noqa: BLE001
                if _is(e, RETRYABLE) and attempt < self.max_retries:
                    log.warning("%s on %s, retry %d in %.0fs", type(e).__name__, getattr(fn, "__name__", "call"), attempt + 1, delay)
                    self.sleep(delay)
                    delay = min(delay * 2, 30)
                    continue
                raise

    def markets(self):
        if not self._markets_loaded:
            self.call(self.ex.load_markets)
            self._markets_loaded = True
        return self.ex.markets

    def prepare(self, coin: str, leverage: int) -> None:
        m = market_symbol(coin)
        self.markets()
        for fn, args in ((getattr(self.ex, "set_margin_mode", None), ("isolated", m)), (getattr(self.ex, "set_leverage", None), (leverage, m))):
            if fn is None:
                continue
            try:
                self.call(fn, *args)
            except Exception as e:  # noqa: BLE001 — "no need to change" is an error on Binance
                if "No need to change" not in str(e):
                    log.warning("prepare %s: %s", m, e)

    def equity(self) -> float:
        b = self.call(self.ex.fetch_balance)
        info = b.get("info") or {}
        for k in ("totalMarginBalance", "totalWalletBalance"):
            if k in info:
                return float(info[k])
        return float(b["USDT"]["total"])

    # --- orders -------------------------------------------------------------------------------------------
    def _create(self, m, typ, side, qty, price=None, params=None, reason=""):
        params = dict(params or {})
        cid = params.setdefault("newClientOrderId", "q" + uuid.uuid4().hex[:30])
        try:
            o = self.call(self.ex.create_order, m, typ, side, qty, price, params)
        except Exception as e:  # noqa: BLE001
            if _is(e, RETRYABLE):   # retries exhausted: did it reach the exchange anyway?
                o = self._find_by_client_id(m, cid)
                if o is not None:
                    return o
            self.journal.order(cid, m, side, typ, qty, price, "REJECTED", 0, None, f"{reason}: {type(e).__name__}: {e}")
            raise OrderRejected(f"{typ} {side} {qty} {m} rejected: {type(e).__name__}: {e}") from e
        self.journal.order(cid, m, side, typ, qty, price, o.get("status"), o.get("filled"), o.get("average"), reason, o.get("info"))
        return o

    def _find_by_client_id(self, m, cid):
        try:
            return self.ex.fetch_order(None, m, {"origClientOrderId": cid})
        except Exception:  # noqa: BLE001
            return None

    def _wait_fill(self, o, m):
        t0 = self.clock()
        while o.get("status") not in ("closed", "canceled", "rejected", "expired"):
            if self.clock() - t0 > self.timeout_s:
                try:
                    self.call(self.ex.cancel_order, o["id"], m)
                except Exception as e:  # noqa: BLE001
                    log.warning("cancel remainder %s: %s", o.get("id"), e)
                o = self.call(self.ex.fetch_order, o["id"], m)
                break
            self.sleep(0.5)
            o = self.call(self.ex.fetch_order, o["id"], m)
        return o

    def place_stop(self, coin: str, side: int, qty: float, stop_px: float) -> dict:
        m = market_symbol(coin)
        px = float(self.ex.price_to_precision(m, stop_px))
        return self._create(m, "STOP_MARKET", "sell" if side > 0 else "buy", qty, None,
                            {"stopPrice": px, "reduceOnly": True, "workingType": "MARK_PRICE"}, reason="stop")

    def open_position(self, coin: str, side: int, qty: float, stop_px: float, tp_px: float | None = None, strategy: str = "") -> dict | None:
        m = market_symbol(coin)
        mk = self.markets()[m]
        q = float(self.ex.amount_to_precision(m, qty))
        min_amt = (mk.get("limits", {}).get("amount", {}) or {}).get("min") or 0
        min_cost = (mk.get("limits", {}).get("cost", {}) or {}).get("min") or 0
        last = float(self.call(self.ex.fetch_ticker, m)["last"])
        if q <= 0 or q < min_amt or q * last < min_cost:
            self.journal.event("WARN", "size_below_minimum", f"{coin} qty {qty} -> {q} below exchange minimum")
            return None
        if side * (last - stop_px) <= 0:
            self.journal.event("WARN", "stop_wrong_side", f"{coin} last {last} vs stop {stop_px}")
            return None
        entry = self._create(m, "market", "buy" if side > 0 else "sell", q, reason=f"entry {strategy}")
        entry = self._wait_fill(entry, m)
        filled = float(entry.get("filled") or 0)
        if filled <= 0:
            self.journal.event("WARN", "not_filled", f"{coin} entry not filled: {entry.get('status')}")
            return None
        if filled < q:
            self.alerts.send("PARTIAL", f"{coin} entry filled {filled} of {q}; stop sized to the filled quantity")
        avg = float(entry.get("average") or last)
        try:
            stop = self.place_stop(coin, side, filled, stop_px)
        except OrderRejected as e:
            self.alerts.send("ERROR", f"{coin}: stop could not be placed ({e}); closing the position at market")
            self.market_close(coin, side, filled, "no_stop")
            return None
        tp = None
        if tp_px is not None:
            try:
                tp = self._create(m, "limit", "sell" if side > 0 else "buy", filled, float(self.ex.price_to_precision(m, tp_px)),
                                  {"reduceOnly": True, "timeInForce": "GTC"}, reason="take_profit")
            except OrderRejected as e:
                self.alerts.send("WARN", f"{coin}: take-profit not placed ({e}); the stop is in place")
        tid = self.journal.open_trade(coin, strategy, side, filled, avg, stop_px)
        self.alerts.send("ENTRY", f"{strategy} {coin} {'LONG' if side > 0 else 'SHORT'} {filled} @ {avg} stop {stop_px}")
        return {"trade_id": tid, "coin": coin, "side": side, "qty": filled, "entry": avg, "stop": stop_px, "stop_id": stop.get("id"), "tp_id": tp and tp.get("id")}

    def market_close(self, coin: str, side: int, qty: float, reason: str) -> dict | None:
        m = market_symbol(coin)
        try:
            self.call(self.ex.cancel_all_orders, m)
        except Exception as e:  # noqa: BLE001
            log.warning("cancel_all %s: %s", m, e)
        o = self._create(m, "market", "sell" if side > 0 else "buy", qty, None, {"reduceOnly": True}, reason=f"close {reason}")
        return self._wait_fill(o, m)

    def positions(self, coins: list[str]) -> dict[str, dict]:
        ps = self.call(self.ex.fetch_positions, [market_symbol(c) for c in coins])
        out = {}
        for p in ps:
            amt = float(p.get("contracts") or 0)
            if amt:
                coin = next((c for c in coins if market_symbol(c) == p["symbol"]), p["symbol"])
                out[coin] = {"qty": amt, "side": 1 if p.get("side") == "long" else -1, "entry": float(p.get("entryPrice") or 0),
                             "mark": float(p.get("markPrice") or 0), "upnl": float(p.get("unrealizedPnl") or 0)}
        return out

    def close_all(self, coins: list[str], reason: str) -> None:
        for coin, p in self.positions(coins).items():
            try:
                self.market_close(coin, p["side"], p["qty"], reason)
            except Exception as e:  # noqa: BLE001
                self.alerts.send("ERROR", f"close_all {coin} failed: {e}")
        for coin in coins:
            try:
                self.call(self.ex.cancel_all_orders, market_symbol(coin))
            except Exception:  # noqa: BLE001
                pass

    def reconcile(self, coins: list[str], known_stops: dict[str, float]) -> dict:
        """Returns {'closed': [coins the exchange shows flat but the journal had open], 'repaired': [...], 'closed_no_stop': [...]}"""
        pos = self.positions(coins)
        out = {"closed": [], "repaired": [], "closed_no_stop": [], "orphans_cancelled": []}
        for coin in coins:
            m = market_symbol(coin)
            orders = self.call(self.ex.fetch_open_orders, m)
            stops = [o for o in orders if str(o.get("type", "")).upper().startswith("STOP")]
            p = pos.get(coin)
            if p and not stops:
                sp = known_stops.get(coin)
                if sp is not None and p["side"] * (p["mark"] - sp) > 0:
                    self.place_stop(coin, p["side"], p["qty"], sp)
                    out["repaired"].append(coin)
                    self.alerts.send("REPAIR", f"{coin}: position had no exchange stop; re-placed at {sp}")
                else:
                    self.market_close(coin, p["side"], p["qty"], "no_stop_on_reconcile")
                    out["closed_no_stop"].append(coin)
                    self.alerts.send("ERROR", f"{coin}: position without a valid stop closed at market")
            if not p and stops:
                for o in stops:
                    self.call(self.ex.cancel_order, o["id"], m)
                out["orphans_cancelled"].append(coin)
            if not p and coin in known_stops:
                out["closed"].append(coin)
        return out

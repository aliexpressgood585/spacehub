"""Order execution on Binance USDⓈ-M Futures through ccxt (tested against ccxt 4.5.84, which sends STOP_MARKET /
TAKE_PROFIT_MARKET to Binance's conditional "algo" endpoint — required since Binance moved conditional orders there).

Safety rules implemented here (part E):
  * the stop and the targets live ON THE EXCHANGE (reduce-only, mark-price triggered), placed right after the fill;
  * after every order: read back from the exchange; a position whose stop cannot be confirmed is closed at market;
  * moving a stop = place the new stop first, then cancel the old one (never naked);
  * start-up: reconcile with the exchange; an open position without a stop is closed immediately;
  * isolated margin, leverage set per symbol before every entry; the real liquidation price is checked after the fill
    (must be >= liq_vs_stop x the stop distance away, else the position is closed);
  * network / rate-limit errors: limited retries with backoff; while the API is failing, `ok()` is False and the
    engine opens nothing new (stops are already resting on the exchange).
"""
from __future__ import annotations

import logging
import os
import time

import ccxt

from .engine import EntryOrder, Event, Position

log = logging.getLogger("daybot.exec")
RETRYABLE = (ccxt.NetworkError, ccxt.RateLimitExceeded, ccxt.DDoSProtection, ccxt.RequestTimeout, ccxt.ExchangeNotAvailable)
TAG = "db"  # client order id prefix: lets start-up tell our orders from manual ones


def make_exchange(cfg):
    """API keys come ONLY from the environment (.env). Keys must be Futures-only, no withdrawals, IP-locked."""
    key, secret = os.environ.get("BINANCE_API_KEY", ""), os.environ.get("BINANCE_API_SECRET", "")
    ex = ccxt.binanceusdm({
        "apiKey": key, "secret": secret, "enableRateLimit": True,
        "options": {"defaultType": "future", "adjustForTimeDifference": True, "disableFuturesSandboxWarning": True},
    })
    ca = os.environ.get("DAYBOT_CA_BUNDLE")  # only behind a TLS-inspecting proxy; not needed on a normal VPS
    if ca:
        os.environ["REQUESTS_CA_BUNDLE"] = ca
        ex.session.trust_env = True  # ccxt turns env lookups off by default; this lets requests read the bundle
    if cfg.mode == "testnet":
        ex.set_sandbox_mode(True)
    elif cfg.mode == "demo":
        ex.enable_demo_trading(True)
    ex.load_markets()
    return ex


def mkt(sym: str) -> str:
    return f"{sym}/USDT:USDT"


class LiveBroker:
    def __init__(self, cfg, ex, notifier=None):
        self.cfg = cfg
        self.ex = ex
        self.notify = notifier
        self._pos: list[Position] = []
        self._ord: list[EntryOrder] = []
        self.queue: list[Event] = []
        self._eq = 0.0
        self._free = 0.0
        self.last_ok = 0.0
        self.fail_streak = 0

    # ------------------------------------------------------------------ plumbing
    def _call(self, fn, *a, tries: int = 3, **k):
        delay = 1.0
        for n in range(tries):
            try:
                r = fn(*a, **k)
                self.last_ok = time.time()
                self.fail_streak = 0
                return r
            except RETRYABLE as e:
                log.warning("%s retry %d: %s", getattr(fn, "__name__", fn), n + 1, e)
                if n == tries - 1:
                    self.fail_streak += 1
                    raise
                time.sleep(delay)
                delay *= 2

    def ok(self) -> bool:
        return self.fail_streak == 0 and time.time() - self.last_ok < 90

    def positions(self) -> list[Position]:
        return self._pos

    def orders(self) -> list[EntryOrder]:
        return self._ord

    def equity(self) -> float:
        return self._eq

    def free_margin(self) -> float:
        return self._free

    def refresh_balance(self) -> None:
        b = self._call(self.ex.fetch_balance)
        info = b.get("info", {})
        self._eq = float(info.get("totalMarginBalance") or b["USDT"]["total"])
        self._free = float(info.get("availableBalance") or b["USDT"]["free"])

    def _side(self, side: int, closing: bool = False) -> str:
        buy = side > 0
        return ("sell" if buy else "buy") if closing else ("buy" if buy else "sell")

    def _amt(self, sym: str, q: float) -> float:
        return float(self.ex.amount_to_precision(mkt(sym), q))

    def _px(self, sym: str, p: float) -> float:
        return float(self.ex.price_to_precision(mkt(sym), p))

    def _exchange_position(self, sym: str) -> dict | None:
        for p in self._call(self.ex.fetch_positions, [mkt(sym)]):
            if abs(float(p.get("contracts") or 0)) > 0:
                return p
        return None

    def _open_triggers(self, sym: str) -> list[dict]:
        return self._call(self.ex.fetch_open_orders, mkt(sym), None, None, {"trigger": True})

    def _cancel_all(self, sym: str) -> None:
        for params in ({}, {"trigger": True}):
            try:
                self._call(self.ex.cancel_all_orders, mkt(sym), params)
            except ccxt.BaseError as e:
                log.warning("cancel_all %s %s: %s", sym, params, e)

    # ------------------------------------------------------------------ entries
    def prepare_symbol(self, sym: str, lev: int) -> None:
        m = mkt(sym)
        for fn, args in ((self.ex.set_margin_mode, ("isolated", m)), (self.ex.set_leverage, (lev, m))):
            try:
                self._call(fn, *args)
            except ccxt.BaseError as e:
                if "No need to change" not in str(e) and "-4046" not in str(e):
                    raise

    def place_entry(self, o: EntryOrder) -> bool:
        c = o.cand
        m = mkt(c.sym)
        try:
            qty, price = self._amt(c.sym, o.qty), self._px(c.sym, o.price)
            lim = self.ex.market(m)["limits"]
            if qty <= 0 or qty * price < (lim.get("cost", {}).get("min") or 5):
                log.info("entry %s below the exchange minimum", c.sym)
                return False
            self.prepare_symbol(c.sym, o.leverage)
            r = self._call(self.ex.create_order, m, "limit", self._side(c.side), qty, price,
                           {"postOnly": True, "clientOrderId": f"{TAG}-{o.id}"})
            if r.get("status") in ("rejected", "expired", "canceled"):
                return False  # a post-only order that would have crossed is rejected: no trade, by design
            o.qty, o.price = qty, price
            o.exchange["id"] = r["id"]
            self._ord.append(o)
            return True
        except ccxt.BaseError as e:
            self.queue.append(Event("ERROR", reason=f"entry {c.sym}: {e}"))
            return False

    def cancel_entry(self, o: EntryOrder) -> None:
        m = mkt(o.cand.sym)
        try:
            self._call(self.ex.cancel_order, o.exchange["id"], m)
        except ccxt.OrderNotFound:
            pass
        except ccxt.BaseError as e:
            self.queue.append(Event("ERROR", reason=f"cancel {o.cand.sym}: {e}"))
        try:
            r = self._call(self.ex.fetch_order, o.exchange["id"], m)
            filled = float(r.get("filled") or 0)
        except ccxt.BaseError:
            filled = 0.0
        if o in self._ord:
            self._ord.remove(o)
        if filled > 0:  # partially filled before the cancel: that part is a real position and gets protected
            self._on_fill(o, filled, float(r.get("average") or o.price))

    # ------------------------------------------------------------------ protection
    def _place_stop(self, p: Position, price: float) -> str:
        r = self._call(self.ex.create_order, mkt(p.sym), "market", self._side(p.side, True), self._amt(p.sym, p.qty), None,
                       {"stopLossPrice": self._px(p.sym, price), "reduceOnly": True, "workingType": "MARK_PRICE",
                        "clientOrderId": f"{TAG}-{p.id}-sl{int(time.time())}"})
        return r["id"]

    def _place_targets(self, p: Position) -> list[str]:
        ids, left = [], p.qty
        for k, (px, frac) in enumerate(p.targets):
            q = left if k == len(p.targets) - 1 else self._amt(p.sym, p.qty * frac)
            left -= q
            if q <= 0:
                continue
            r = self._call(self.ex.create_order, mkt(p.sym), "market", self._side(p.side, True), self._amt(p.sym, q), None,
                           {"takeProfitPrice": self._px(p.sym, px), "reduceOnly": True, "workingType": "MARK_PRICE",
                            "clientOrderId": f"{TAG}-{p.id}-tp{k}"})
            ids.append(r["id"])
        return ids

    def _verify_stop(self, p: Position) -> bool:
        trig = self._open_triggers(p.sym)
        want = self._side(p.side, True)
        return any(str(o["id"]) == str(p.exchange.get("stop_id")) or
                   (o.get("side") == want and o.get("reduceOnly") and abs(float(o.get("triggerPrice") or o.get("stopPrice") or 0) - p.stop) <= p.stop * 1e-6 + 1e-12)
                   for o in trig)

    def _on_fill(self, o: EntryOrder, qty: float, price: float) -> None:
        c = o.cand
        p = Position(o.id, c.sym, c.setup, c.side, c.tf, qty, price, c.stop, c.stop, o.targets, int(time.time() * 1000),
                     o.risk_usd * qty / max(o.qty, 1e-12), o.leverage, qty0=qty, tp_done=[False] * len(o.targets))
        try:
            p.exchange["stop_id"] = self._place_stop(p, p.stop)
            p.exchange["tp_ids"] = self._place_targets(p)
            if not self._verify_stop(p):
                raise RuntimeError("stop not visible on the exchange after placing it")
            ep = self._exchange_position(p.sym)
            liq = float(ep.get("liquidationPrice") or 0) if ep else 0
            if liq > 0 and abs(price - liq) < self.cfg["risk"]["liq_vs_stop"] * abs(price - p.stop):
                raise RuntimeError(f"liquidation {liq:g} closer than {self.cfg['risk']['liq_vs_stop']}x the stop")
        except Exception as e:  # cannot confirm protection -> do not hold the position
            self._pos.append(p)
            self.queue.append(Event("FILLED", p, o))
            self.queue.append(Event("ERROR", reason=f"{p.sym}: protection failed ({e}) — closing at market"))
            self.close_position(p, "PROTECTION_FAILED")
            return
        self._pos.append(p)
        self.queue.append(Event("FILLED", p, o))

    def move_stop(self, p: Position, price: float) -> bool:
        old = p.exchange.get("stop_id")
        prev = p.stop
        try:
            p.stop = price
            p.exchange["stop_id"] = self._place_stop(p, price)
            if not self._verify_stop(p):
                raise RuntimeError("new stop not visible")
        except Exception as e:
            p.stop = prev
            p.exchange["stop_id"] = old
            self.queue.append(Event("ERROR", reason=f"{p.sym}: move stop failed ({e})"))
            return False
        try:
            self._call(self.ex.cancel_order, old, mkt(p.sym), {"trigger": True})
        except ccxt.BaseError as e:
            log.warning("old stop cancel %s: %s", p.sym, e)  # both stops are reduce-only; the farther one is harmless
        return True

    def close_position(self, p: Position, reason: str) -> bool:
        p.exchange["close_reason"] = reason
        try:
            ep = self._exchange_position(p.sym)
            if ep:
                q = abs(float(ep["contracts"]))
                self._call(self.ex.create_order, mkt(p.sym), "market", self._side(p.side, True), q, None, {"reduceOnly": True})
            self._cancel_all(p.sym)
            return self._exchange_position(p.sym) is None
        except ccxt.BaseError as e:
            self.queue.append(Event("ERROR", reason=f"close {p.sym} failed: {e}"))
            return False

    # ------------------------------------------------------------------ polling
    def _realized(self, p: Position) -> tuple[float, float, float, float]:
        """(net pnl, exit price, fees, funding) from the exchange's own fills and funding records."""
        m = mkt(p.sym)
        since = p.opened_ms - 120_000
        trades = self._call(self.ex.fetch_my_trades, m, since)
        pnl = fees = 0.0
        last_px = p.entry
        for t in trades:
            pnl += float(t.get("info", {}).get("realizedPnl") or 0)
            fees += float((t.get("fee") or {}).get("cost") or 0)
            if t.get("side") == self._side(p.side, True):
                last_px = float(t["price"])
        try:
            fund = sum(float(f.get("amount") or 0) for f in self._call(self.ex.fetch_funding_history, m, since))
        except ccxt.BaseError:
            fund = 0.0
        return pnl - fees + fund, last_px, fees, -fund

    def poll(self, now_ms: int) -> list[Event]:
        try:
            self.refresh_balance()
            for o in list(self._ord):
                r = self._call(self.ex.fetch_order, o.exchange["id"], mkt(o.cand.sym))
                if r.get("status") == "closed":
                    self._ord.remove(o)
                    self._on_fill(o, float(r["filled"]), float(r.get("average") or o.price))
                elif r.get("status") in ("canceled", "expired", "rejected"):
                    self._ord.remove(o)
            for p in list(self._pos):
                ep = self._exchange_position(p.sym)
                if ep is None:
                    self._pos.remove(p)
                    self._cancel_all(p.sym)
                    pnl, px, fees, fund = self._realized(p)
                    p.fees, p.funding = fees, fund
                    why = p.exchange.get("close_reason") or ("TARGET" if p.side * (px - p.entry) > 0 else "BE" if p.hit1r else "STOP")
                    self.queue.append(Event("CLOSED", p, price=px, reason=why, pnl=pnl))
                    continue
                q = abs(float(ep["contracts"]))
                if q < p.qty - 1e-12:
                    p.qty = q
                    self.queue.append(Event("PARTIAL_TP", p, price=float(ep.get("markPrice") or 0), reason="TARGET"))
                if not self._verify_stop(p):  # someone/something removed the stop: put it back or close
                    try:
                        p.exchange["stop_id"] = self._place_stop(p, p.stop)
                        if not self._verify_stop(p):
                            raise RuntimeError("still missing")
                        self.queue.append(Event("ERROR", reason=f"{p.sym}: stop was missing — re-placed"))
                    except Exception as e:
                        self.queue.append(Event("ERROR", reason=f"{p.sym}: stop missing and cannot be re-placed ({e}) — closing"))
                        self.close_position(p, "NO_STOP")
        except ccxt.BaseError as e:
            self.queue.append(Event("ERROR", reason=f"poll: {e}"))
        out, self.queue = self.queue, []
        return out

    # ------------------------------------------------------------------ start-up
    def reconcile(self, journal, symbols: list[str]) -> list[str]:
        """Exchange is the truth. Cancel our stray entry orders; adopt positions that have a stop; close the ones that
        do not. Returns human-readable notes for the start-up alert."""
        notes = []
        self.refresh_balance()
        known = {r[1]: r for r in journal.open_trades()}
        for sym in symbols:
            m = mkt(sym)
            for o in self._call(self.ex.fetch_open_orders, m):
                if str(o.get("clientOrderId") or "").startswith(TAG + "-") and not o.get("reduceOnly"):
                    self._call(self.ex.cancel_order, o["id"], m)
                    notes.append(f"{sym}: cancelled a leftover entry order")
            ep = self._exchange_position(sym)
            if ep is None:
                if sym in known:
                    notes.append(f"{sym}: journal had an open trade, exchange has none — marked closed")
                    r = known[sym]
                    journal.record_close(Position(r[0], sym, r[2], r[3], r[4], 0, r[6], r[7], r[7], [], r[11], r[10], r[9]),
                                         int(time.time() * 1000), 0.0, "CLOSED_WHILE_DOWN", 0.0, 0.0)
                continue
            side = 1 if (ep.get("side") == "long") else -1
            qty = abs(float(ep["contracts"]))
            trig = [o for o in self._open_triggers(sym) if o.get("reduceOnly") and o.get("side") == self._side(side, True)]
            stops = [o for o in trig if "STOP" in str(o.get("info", {}).get("orderType") or o.get("type", "")).upper()]
            if not stops:
                self._call(self.ex.create_order, m, "market", self._side(side, True), qty, None, {"reduceOnly": True})
                self._cancel_all(sym)
                notes.append(f"🚨 {sym}: position WITHOUT a stop found at start-up — closed at market")
                continue
            sp = float(stops[0].get("triggerPrice") or stops[0].get("stopPrice"))
            if sym in known:
                r = known[sym]
                p = Position(r[0], sym, r[2], side, r[4], qty, float(ep.get("entryPrice") or r[6]), sp, r[7],
                             [], r[11], r[10], int(r[9]), qty0=r[5])
            else:
                p = Position(f"ext-{sym}", sym, "EXT", side, "15m", qty, float(ep.get("entryPrice")), sp, sp, [],
                             int(time.time() * 1000), 0.0, int(ep.get("leverage") or 1), qty0=qty)
                notes.append(f"{sym}: position not opened by the bot — kept (it has a stop), counted in the limits")
            p.exchange["stop_id"] = stops[0]["id"]
            p.hit1r = p.side * (sp - p.entry) >= 0
            self._pos.append(p)
            notes.append(f"{sym}: open position adopted, stop {sp:g}")
        return notes

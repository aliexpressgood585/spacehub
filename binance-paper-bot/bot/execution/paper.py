"""Paper exchange: realistic Binance USDT-M isolated-margin simulation.

- Market orders: fill at best ask (BUY) / best bid (SELL) +/- slippage, taker fee.
- Limit orders: fill at limit price only when price trades through, maker fee.
  A marketable limit (crosses the book on placement) fills as taker at the book,
  or is rejected if post_only (GTX).
- STOP_MARKET / TAKE_PROFIT_MARKET triggered on last (CONTRACT_PRICE) or mark.
- exchangeInfo filters (tick, step, minQty, minNotional) enforced.
- Isolated margin, leverage brackets, maintenance margin, liquidation on mark.
- Funding applied to isolated margin at funding times.
"""
import logging
from dataclasses import dataclass
from .base import ExecutionAdapter, Order, Position, next_order_id
from ..margin import liquidation_price, maintenance_margin, funding_payment
from .. import margin as M

log = logging.getLogger("paper")


@dataclass
class Market:
    bid: float = 0.0
    ask: float = 0.0
    last: float = 0.0
    mark: float = 0.0
    ts: int = 0
    prev_last: float = 0.0
    prev_mark: float = 0.0
    funding_rate: float = 0.0
    next_funding_time: int = 0


class PaperExchange(ExecutionAdapter):
    def __init__(self, symbol_infos, brackets, balance, maker_fee=0.0002, taker_fee=0.0005,
                 slippage_bps=1.0, default_leverage=3, traverse_fill=False,
                 trade_through=True, listener=None):
        self.si = symbol_infos
        self.brackets = brackets
        self.wallet = float(balance)          # Binance "wallet balance" (incl. isolated margins)
        self.maker_fee, self.taker_fee = maker_fee, taker_fee
        self.slip = slippage_bps / 1e4
        self.slip_by_symbol = {}          # symbol -> fraction; missing keys use self.slip
        self.leverage = {s: default_leverage for s in symbol_infos}
        self.pos = {}                         # symbol -> Position
        self.orders = {}                      # id -> Order
        self.mkt = {s: Market() for s in symbol_infos}
        self.traverse_fill = traverse_fill    # backtest: fill stops at trigger price when traversed
        self.trade_through = trade_through
        self.listener = listener              # object with on_fill/on_trade/on_event
        self.totals = {"fees": 0.0, "funding": 0.0, "realized": 0.0, "liquidations": 0,
                       "liquidation_loss": 0.0}

    # ------------------------------------------------------------- helpers
    def _emit(self, kind, payload):
        if self.listener is not None:
            getattr(self.listener, kind)(payload)

    def best_bid_ask(self, symbol):
        m = self.mkt[symbol]
        return m.bid, m.ask

    def get_position(self, symbol):
        return self.pos.get(symbol)

    def positions(self):
        return dict(self.pos)

    def open_orders(self, symbol=None):
        return [o for o in self.orders.values() if symbol is None or o.symbol == symbol]

    def mark(self, symbol):
        m = self.mkt[symbol]
        return m.mark or m.last or (m.bid + m.ask) / 2

    def unrealized(self):
        return sum(p.upnl(self.mark(s)) for s, p in self.pos.items())

    def equity(self):
        return self.wallet + self.unrealized()

    def used_margin(self):
        return sum(p.isolated_margin for p in self.pos.values())

    def available_balance(self):
        return self.wallet - self.used_margin()

    def set_leverage(self, symbol, leverage):
        p = self.pos.get(symbol)
        if p is not None:
            raise ValueError("cannot change isolated leverage with open position in this sim")
        self.leverage[symbol] = float(leverage)

    def liq_price(self, symbol):
        p = self.pos.get(symbol)
        if not p:
            return None
        return liquidation_price(p.side, p.qty, p.entry_price, p.isolated_margin,
                                 self.brackets.get(symbol))

    # ------------------------------------------------------------- orders
    def _reject(self, o, reason, ts):
        o.status, o.reject_reason = "REJECTED", reason
        self._emit("on_event", {"ts": ts, "type": "ORDER_REJECTED", "symbol": o.symbol,
                                "msg": f"{o.side} {o.type} {o.qty}: {reason}"})
        return o

    def place_order(self, o: Order, ts: int) -> Order:
        si = self.si[o.symbol]
        o.id = o.id or next_order_id()
        o.created_ts = ts
        p = self.pos.get(o.symbol)
        m = self.mkt[o.symbol]
        if o.close_position:
            if o.type not in ("STOP_MARKET", "TAKE_PROFIT_MARKET"):
                return self._reject(o, "closePosition only for stop/TP", ts)
            o.reduce_only = True
        else:
            o.qty = si.round_qty(o.qty, market=o.type != "LIMIT")
            if o.qty < (si.market_min_qty if o.type != "LIMIT" else si.min_qty):
                return self._reject(o, "qty below minQty (LOT_SIZE)", ts)
        if o.type == "LIMIT":
            o.price = si.round_price(o.price)
        if o.stop_price:
            o.stop_price = si.round_price(o.stop_price)
        if o.reduce_only and not o.close_position:
            if not p or (p.side > 0) == (o.side == "BUY"):
                return self._reject(o, "ReduceOnly order rejected (no opposite position)", ts)
        # minNotional for opening orders
        if not o.reduce_only:
            ref = o.price if o.type == "LIMIT" else (m.ask if o.side == "BUY" else m.bid) or m.last
            if ref <= 0:
                return self._reject(o, "no market data", ts)
            if o.qty * ref < si.min_notional:
                return self._reject(o, f"notional {o.qty*ref:.2f} < minNotional {si.min_notional}", ts)
        if o.type == "MARKET":
            px = self._market_px(o.symbol, o.side)
            if px <= 0:
                return self._reject(o, "no book", ts)
            return self._execute(o, o.qty, px, "TAKER", ts)
        if o.type == "LIMIT":
            crosses = (o.side == "BUY" and m.ask and o.price >= m.ask) or \
                      (o.side == "SELL" and m.bid and o.price <= m.bid)
            if crosses:
                if o.post_only:
                    return self._reject(o, "post-only would take liquidity (GTX)", ts)
                px = m.ask if o.side == "BUY" else m.bid
                return self._execute(o, o.qty, px, "TAKER", ts)
            if not o.reduce_only and not self._margin_ok(o.symbol, o.qty, o.price, o.side, maker=True):
                return self._reject(o, "insufficient margin", ts)
            self.orders[o.id] = o
            return o
        if o.type in ("STOP_MARKET", "TAKE_PROFIT_MARKET"):
            cur = m.mark if o.working_type == "MARK_PRICE" else m.last
            if cur and self._triggered(o, cur):
                return self._reject(o, "Order would immediately trigger (-2021)", ts)
            self.orders[o.id] = o
            return o
        return self._reject(o, f"unsupported type {o.type}", ts)

    def cancel_order(self, order_id, ts):
        o = self.orders.pop(order_id, None)
        if o:
            o.status = "CANCELED"
            return True
        return False

    def cancel_all(self, symbol, ts):
        for oid in [i for i, o in self.orders.items() if o.symbol == symbol]:
            self.cancel_order(oid, ts)

    def slip_for(self, symbol):
        return self.slip_by_symbol.get(symbol, self.slip)

    def _market_px(self, symbol, side, ref=None):
        m, si = self.mkt[symbol], self.si[symbol]
        if ref is None:
            base = m.ask if side == "BUY" else m.bid
        else:   # backtest traverse: trigger ref +/- half spread
            hs = (m.ask - m.bid) / 2 if m.ask and m.bid else 0
            base = ref + hs if side == "BUY" else ref - hs
        if base <= 0:
            return 0.0
        slip = self.slip_for(symbol)
        if side == "BUY":
            return si.round_price(base * (1 + slip), "up")
        return si.round_price(base * (1 - slip), "down")

    def _margin_ok(self, symbol, qty, px, side, maker=False):
        p = self.pos.get(symbol)
        opening = qty
        if p and (p.side > 0) != (side == "BUY"):
            opening = max(0.0, qty - p.qty)
        if opening <= 0:
            return True
        lev = self.leverage[symbol]
        notional = opening * px + (p.qty * p.entry_price if p and (p.side > 0) == (side == "BUY") else 0)
        if lev > self.brackets.max_leverage(symbol, notional):
            return False
        fee = opening * px * (self.maker_fee if maker else self.taker_fee)
        return self.available_balance() >= opening * px / lev + fee

    # ------------------------------------------------------------- fills
    def _execute(self, o, qty, px, liq, ts, reason=None):
        fee_rate = self.maker_fee if liq == "MAKER" else self.taker_fee
        p = self.pos.get(o.symbol)
        sgn = 1 if o.side == "BUY" else -1
        if o.close_position:
            if not p or p.side == sgn:
                o.status = "CANCELED"
                return o
            qty = p.qty
        if o.reduce_only and p:
            qty = min(qty, p.qty)
        if not o.reduce_only and not self._margin_ok(o.symbol, qty, px, o.side, liq == "MAKER"):
            return self._reject(o, "insufficient margin", ts)
        fee = qty * px * fee_rate
        self.wallet -= fee
        self.totals["fees"] += fee
        realized = 0.0
        remaining = qty
        closed_trade = None
        if p and p.side != sgn:                          # reduce / close / flip
            c = min(remaining, p.qty)
            realized = p.side * c * (px - p.entry_price)
            frac = c / p.qty
            p.isolated_margin -= p.isolated_margin * frac
            p.qty = round(p.qty - c, 12)
            p.realized_pnl += realized
            p.fees += fee * (c / qty)
            self.wallet += realized
            self.totals["realized"] += realized
            remaining = round(remaining - c, 12)
            p.meta.setdefault("exit_notional", 0.0)
            p.meta["exit_notional"] += c * px
            p.meta["exit_qty"] = p.meta.get("exit_qty", 0.0) + c
            if p.qty <= 1e-12:
                closed_trade = self._close_record(p, ts, reason or o.tag or o.type)
                del self.pos[o.symbol]
                self.cancel_all(o.symbol, ts)            # OCO-style cleanup of TP/SL
            if remaining > 0 and o.reduce_only:
                remaining = 0
        if remaining > 0:                                # open / add
            lev = self.leverage[o.symbol]
            if p and o.symbol in self.pos:
                new_qty = p.qty + remaining
                p.entry_price = (p.entry_price * p.qty + px * remaining) / new_qty
                p.qty = new_qty
                p.isolated_margin += remaining * px / lev
                p.fees += fee * (remaining / qty)
                p.max_qty = max(p.max_qty, p.qty)
                p.entry_notional += remaining * px
            else:
                self.pos[o.symbol] = Position(
                    symbol=o.symbol, side=sgn, qty=remaining, entry_price=px, leverage=lev,
                    isolated_margin=remaining * px / lev, opened_ts=ts, fees=fee * (remaining / qty),
                    strategy=o.tag, max_qty=remaining, entry_notional=remaining * px)
        o.status = "FILLED"
        self.orders.pop(o.id, None)
        fill = {"ts": ts, "order_id": o.id, "symbol": o.symbol, "side": o.side, "type": o.type,
                "qty": qty, "price": px, "fee": fee, "liquidity": liq, "realized_pnl": realized,
                "tag": o.tag, "reason": reason or ""}
        self._emit("on_fill", fill)
        if closed_trade:
            self._emit("on_trade", closed_trade)
        return o

    def _close_record(self, p, ts, reason):
        exit_px = p.meta["exit_notional"] / p.meta["exit_qty"]
        net = p.realized_pnl - p.fees + p.funding
        return {"symbol": p.symbol, "side": "LONG" if p.side > 0 else "SHORT", "qty": p.max_qty,
                "entry_price": p.entry_price, "exit_price": exit_px, "open_ts": p.opened_ts,
                "close_ts": ts, "gross_pnl": p.realized_pnl, "fees": p.fees, "funding": p.funding,
                "net_pnl": net, "reason": reason, "strategy": p.strategy, "leverage": p.leverage,
                "margin": p.entry_notional / p.leverage}

    # ------------------------------------------------------------- market updates
    @staticmethod
    def _triggered(o, price):
        if o.type == "STOP_MARKET":
            return price <= o.stop_price if o.side == "SELL" else price >= o.stop_price
        return price >= o.stop_price if o.side == "SELL" else price <= o.stop_price

    def update_market(self, symbol, ts, bid=None, ask=None, last=None, mark=None):
        m = self.mkt[symbol]
        if bid:
            m.bid = bid
        if ask:
            m.ask = ask
        if last:
            m.prev_last, m.last = (m.last or last), last
        if mark:
            m.prev_mark, m.mark = (m.mark or mark), mark
        m.ts = ts
        self._process(symbol, ts)

    def _process(self, symbol, ts):
        m = self.mkt[symbol]
        # 1) stop / take-profit triggers
        for o in sorted([o for o in self.orders.values() if o.symbol == symbol and o.stop_price],
                        key=lambda x: 0 if x.type == "STOP_MARKET" else 1):   # stops first (conservative)
            if o.id not in self.orders:
                continue
            mark_trig = o.working_type == "MARK_PRICE"
            cur = m.mark if mark_trig else m.last
            prev = m.prev_mark if mark_trig else m.prev_last
            if not cur or not self._triggered(o, cur):
                continue
            ref = None
            if self.traverse_fill and prev and not self._triggered(o, prev):
                ref = o.stop_price + ((m.last - m.mark) if mark_trig and m.last and m.mark else 0)
            px = self._market_px(symbol, o.side, ref)
            self.orders.pop(o.id, None)
            reason = "STOP_LOSS" if o.type == "STOP_MARKET" else "TAKE_PROFIT"
            self._emit("on_event", {"ts": ts, "type": reason, "symbol": symbol,
                                    "msg": f"{o.side} triggered @ {o.stop_price} ({o.working_type}) fill {px}"})
            self._execute(o, o.qty, px, "TAKER", ts, reason=reason)
        # 2) resting limit orders (maker) - only when price trades through
        for o in [o for o in self.orders.values() if o.symbol == symbol and o.type == "LIMIT"]:
            if o.side == "BUY":
                hit = (m.last and m.last < o.price) or (m.ask and m.ask < o.price) \
                    if self.trade_through else (m.last and m.last <= o.price)
            else:
                hit = (m.last and m.last > o.price) or (m.bid and m.bid > o.price) \
                    if self.trade_through else (m.last and m.last >= o.price)
            if hit:
                self._execute(o, o.qty, o.price, "MAKER", ts)
        # 3) liquidation on mark price
        self._check_liquidation(symbol, ts)

    def _check_liquidation(self, symbol, ts):
        p = self.pos.get(symbol)
        m = self.mkt[symbol]
        if not p or not m.mark:
            return
        br = self.brackets.for_notional(symbol, p.qty * m.mark)
        mb = p.isolated_margin + p.upnl(m.mark)
        if mb > maintenance_margin(p.qty * m.mark, br):
            return
        lp = self.liq_price(symbol) or m.mark
        gross = p.side * p.qty * (lp - p.entry_price)
        loss = p.isolated_margin          # whole isolated margin is lost
        clearance = max(0.0, p.isolated_margin + gross)
        self.wallet -= loss
        p.realized_pnl += gross
        p.fees += clearance
        self.totals["realized"] += gross
        self.totals["fees"] += clearance
        self.totals["liquidations"] += 1
        self.totals["liquidation_loss"] += loss
        p.meta["exit_notional"] = p.meta.get("exit_notional", 0.0) + p.qty * lp
        p.meta["exit_qty"] = p.meta.get("exit_qty", 0.0) + p.qty
        rec = self._close_record(p, ts, "LIQUIDATION")
        del self.pos[symbol]
        self.cancel_all(symbol, ts)
        self._emit("on_event", {"ts": ts, "type": "LIQUIDATION", "symbol": symbol,
                                "msg": f"liquidated at mark {m.mark} (liq px {lp:.6g}), lost margin {loss:.2f}"})
        self._emit("on_fill", {"ts": ts, "order_id": 0, "symbol": symbol,
                               "side": "SELL" if p.side > 0 else "BUY", "type": "LIQUIDATION",
                               "qty": p.qty, "price": lp, "fee": clearance, "liquidity": "TAKER",
                               "realized_pnl": gross, "tag": "", "reason": "LIQUIDATION"})
        self._emit("on_trade", rec)

    def apply_funding(self, symbol, rate, mark_price, funding_ts):
        """Apply a funding settlement. Only positions opened before funding_ts pay/receive."""
        p = self.pos.get(symbol)
        if not p or p.opened_ts >= funding_ts:
            return 0.0
        pay = funding_payment(p.side, p.qty, mark_price, rate)
        self.wallet += pay
        p.isolated_margin += pay          # isolated: funding settles against position margin
        p.funding += pay
        self.totals["funding"] += pay
        self._emit("on_event", {"ts": funding_ts, "type": "FUNDING", "symbol": symbol,
                                "msg": f"rate {rate*100:.4f}% mark {mark_price:.6g} -> {pay:+.4f} USDT",
                                "amount": pay})
        if self.listener is not None and hasattr(self.listener, "on_funding"):
            self.listener.on_funding({"ts": funding_ts, "symbol": symbol, "rate": rate,
                                      "mark": mark_price, "qty": p.qty * p.side, "amount": pay})
        self._check_liquidation(symbol, funding_ts)
        return pay

    # ------------------------------------------------------------- persistence
    def to_dict(self):
        return {"wallet": self.wallet, "leverage": self.leverage, "totals": self.totals,
                "positions": {s: p.to_dict() for s, p in self.pos.items()},
                "orders": [o.to_dict() for o in self.orders.values()],
                "markets": {s: vars(m) for s, m in self.mkt.items()}}

    def load_dict(self, d):
        self.wallet = d["wallet"]
        self.leverage.update(d.get("leverage", {}))
        self.totals.update(d.get("totals", {}))
        self.pos = {s: Position(**p) for s, p in d.get("positions", {}).items() if s in self.si}
        self.orders = {}
        for od in d.get("orders", []):
            if od["symbol"] in self.si:
                o = Order(**od)
                self.orders[o.id] = o
        mx = max([o.id for o in self.orders.values()] + [0])
        from . import base
        import itertools
        base._ids = itertools.count(max(mx + 1, next(base._ids)))
        for s, mv in d.get("markets", {}).items():
            if s in self.mkt:
                for k, v in mv.items():
                    setattr(self.mkt[s], k, v)

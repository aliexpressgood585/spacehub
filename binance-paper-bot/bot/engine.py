"""Trading engine: candles -> strategy -> risk -> execution adapter.

Used unchanged by both the backtester and the live paper runner.
"""
import logging
import numpy as np
from .execution.base import Order
from .risk import delist_margin_reserve
from .strategies import Context

log = logging.getLogger("engine")
FIELDS = ("open_time", "open", "high", "low", "close", "volume", "close_time")


class CandleBuffer:
    def __init__(self, maxlen):
        self.maxlen = maxlen
        self.rows = []          # list of tuples (open_time, o, h, l, c, v, close_time)

    def add(self, row):
        if self.rows and row[0] <= self.rows[-1][0]:
            if row[0] == self.rows[-1][0]:
                self.rows[-1] = row
            return
        self.rows.append(row)
        if len(self.rows) > self.maxlen:
            del self.rows[: len(self.rows) - self.maxlen]

    def arrays(self):
        a = np.array(self.rows, dtype=float) if self.rows else np.zeros((0, 7))
        return {f: a[:, i] for i, f in enumerate(FIELDS)}

    def last_open_time(self):
        return self.rows[-1][0] if self.rows else None


def kline_row(k):
    """REST kline array -> tuple."""
    return (int(k[0]), float(k[1]), float(k[2]), float(k[3]), float(k[4]), float(k[5]), int(k[6]))


class TradingEngine:
    def __init__(self, cfg, exchange, strategy, risk, symbol_infos, brackets, recorder=None,
                 strategies=None):
        self.cfg, self.ex, self.strat, self.risk = cfg, exchange, strategy, risk
        self.strats = list(strategies) if strategies else [strategy]
        self.si, self.brackets = symbol_infos, brackets
        self.rec = recorder
        self.symbols = list(symbol_infos)
        n = cfg["data"]["history_bars"]
        tfs = []
        for st in self.strats:
            for tf in st.timeframes():
                if tf not in tfs:
                    tfs.append(tf)
        self.candles = {s: {tf: CandleBuffer(n) for tf in tfs} for s in self.symbols}
        self.wt = cfg["execution"]["sl_tp_working_type"]
        self.last_signal = {}
        self.overrides = {}
        self.closed_trades = []
        # strategy name -> rebalance period already entered. Stops a flat book
        # from opening again before the next scheduled rebalance.
        self.universe_period = {}

    def event(self, ts, typ, symbol, msg, strategy=""):
        log.info("[%s] %s %s", typ, symbol, msg)
        if self.rec:
            ev = {"ts": ts, "type": typ, "symbol": symbol, "msg": msg}
            if strategy:
                ev["strategy"] = strategy
            self.rec.on_event(ev)

    def add_history(self, symbol, tf, rows):
        bufs = self.candles.get(symbol)
        if not bufs or tf not in bufs:
            return
        for r in rows:
            bufs[tf].add(r)

    def on_bar_closed(self, symbol, tf, row, run_strategy=True):
        bufs = self.candles.get(symbol)
        if not bufs or tf not in bufs:
            return
        bufs[tf].add(row)
        if not run_strategy:
            return
        for st in self.strats:
            if tf == st.timeframe:
                self.run_strategy(symbol, row[6] + 1, st)

    def _visible_position(self, symbol, strat):
        """Position this strategy may manage. Another strategy's position is hidden.

        An untagged position belongs to whoever is asking, so single-strategy
        tests still close it.
        """
        p = self.ex.get_position(symbol)
        if p is None or not p.strategy or p.strategy == strat.name:
            return p
        return None

    def _owner_day(self, name, ts):
        start = self.risk.day_start_equity
        if not start:
            return 0.0
        day = int(ts) // 86_400_000
        pnl = 0.0
        seen = set()
        rows = list(self.closed_trades or []) + list(getattr(self.rec, "trades", []) or [])
        for t in rows:
            if t.get("strategy") != name:
                continue
            key = (t.get("symbol"), t.get("open_ts"), t.get("close_ts"))
            if key in seen:
                continue
            seen.add(key)
            if int(t.get("close_ts") or 0) // 86_400_000 == day:
                pnl += float(t.get("net_pnl") or 0)
        for s, p in self.ex.positions().items():
            if getattr(p, "strategy", "") == name:
                pnl += p.upnl(self.ex.mark(s))
        return pnl / start

    def run_strategy(self, symbol, ts, strat=None):
        strat = strat or self.strat
        ctx = Context(symbol, ts, {tf: b.arrays() for tf, b in self.candles[symbol].items()},
                      self._visible_position(symbol, strat))
        try:
            sigs = strat.on_bar(ctx)
        except Exception:
            log.exception("strategy error on %s", symbol)
            return
        for s in sigs:
            self.last_signal[symbol] = {"ts": ts, "action": s.action, "reason": s.reason,
                                        "info": s.info, "strategy": strat.name}
            self.handle(s, ts, strat)

    def on_timeframe_done(self, tf, ts):
        """One cross-sectional pass after every symbol's bar for `tf` is stored.

        Called once per daily close, after the 1h and 15m strategies on that
        same timestamp, so a coin they just took is skipped.
        """
        if tf != "1d":
            return 0
        n = 0
        boundary = int(ts)
        for st in self.strats:
            fn = getattr(st, "on_universe_bar", None)
            if fn is None or getattr(st, "timeframe", None) != tf:
                continue
            candles = {}
            for sym, bufs in self.candles.items():
                buf = bufs.get(tf)
                if not buf or not buf.rows:
                    continue
                arrays = buf.arrays()
                if int(arrays["close_time"][-1]) + 1 < boundary:
                    continue
                candles[sym] = arrays
            positions = {s: p for s, p in self.ex.positions().items()
                         if getattr(p, "strategy", "") == st.name}
            try:
                sigs = fn(boundary, candles, positions) or []
            except Exception:
                log.exception("universe strategy error on %s", st.name)
                continue
            for sig in sigs:
                n += 1
                self.last_signal[sig.symbol] = {"ts": boundary, "action": sig.action, "reason": sig.reason,
                                                "info": sig.info, "strategy": st.name}
                self.handle(sig, boundary, st)
            if getattr(st, "is_rebalance_day", None) and st.is_rebalance_day(boundary):
                self.universe_period[st.name] = int(st.period_id(boundary))
        return n

    def handle(self, sig, ts, strat=None):
        strat = strat or self.strat
        sym = sig.symbol
        if sig.action == "INFO":
            self.event(ts, "SIGNAL_FILTERED", sym, sig.reason, strat.name)
            return
        if sig.action == "CLOSE":
            p = self.ex.get_position(sym)
            if p and p.strategy and p.strategy != strat.name:
                return
            if p:
                self.event(ts, "SIGNAL", sym, f"CLOSE: {sig.reason}", strat.name)
                self.ex.place_order(Order(sym, "SELL" if p.side > 0 else "BUY", "MARKET", p.qty,
                                          reduce_only=True, tag="SIGNAL_CLOSE"), ts)
            return
        held = self.ex.get_position(sym)
        if held is not None and held.strategy and held.strategy != strat.name:
            self.event(ts, "RISK_REJECT", sym, f"held by {held.strategy}", strat.name)
            return
        self.event(ts, "SIGNAL", sym, f"{sig.action}: {sig.reason}", strat.name)
        ov = self.overrides.get(strat.name) or {}
        day_ret = None
        if ov.get("max_daily_loss") is not None:
            self.risk._daily(self.ex, ts)
            day_ret = self._owner_day(strat.name, ts)
        reserve = delist_margin_reserve(self.cfg, self.ex) if ov.get("experimental") else 0.0
        qty, why = self.risk.size(
            sig, self.ex, self.si[sym], self.brackets, ts,
            owner=strat.name if self.overrides else None,
            owner_max_pos=ov.get("max_concurrent_positions"),
            owner_risk=ov.get("risk_per_trade"),
            owner_day_return=day_ret,
            owner_max_daily_loss=ov.get("max_daily_loss"),
            margin_reserve=reserve)
        if qty <= 0:
            self.event(ts, "RISK_REJECT", sym, why, strat.name)
            return
        if self.ex.get_position(sym) is None and self.ex.leverage.get(sym) != sig.leverage:
            self.ex.set_leverage(sym, sig.leverage)
        side = "BUY" if sig.action == "OPEN_LONG" else "SELL"
        o = self.ex.place_order(Order(sym, side, "MARKET", qty, tag=strat.name), ts)
        if o.status != "FILLED":
            return
        p = self.ex.get_position(sym)
        fill = p.entry_price
        d = 1 if side == "BUY" else -1
        si = self.si[sym]
        sl = si.round_price(fill - d * sig.sl_distance)
        tp = si.round_price(fill + d * sig.tp_distance) if sig.tp_distance > 0 else None
        exit_side = "SELL" if side == "BUY" else "BUY"
        slo = self.ex.place_order(Order(sym, exit_side, "STOP_MARKET", stop_price=sl, close_position=True,
                                        working_type=self.wt, tag="SL"), ts)
        if tp is not None and sig.info.get("tp_order") == "limit":
            self.ex.place_order(Order(sym, exit_side, "LIMIT", qty=p.qty, price=tp, reduce_only=True,
                                      tag="TP"), ts)
        elif tp is not None:
            self.ex.place_order(Order(sym, exit_side, "TAKE_PROFIT_MARKET", stop_price=tp, close_position=True,
                                      working_type=self.wt, tag="TP"), ts)
        p.meta.update({"sl": sl, "tp": tp, "reason": sig.reason})
        if sig.info.get("exit_ts") is not None:
            p.meta["exit_ts"] = int(sig.info["exit_ts"])
        if slo.status == "REJECTED":       # stop would trigger immediately -> flatten
            self.ex.place_order(Order(sym, exit_side, "MARKET", p.qty, reduce_only=True, tag="SL_REJECT"), ts)
        self.event(ts, "OPEN", sym, f"{side} {qty} @ {fill} lev {sig.leverage}x SL {sl} TP {tp} "
                                    f"liq {self.ex.liq_price(sym) or 0:.6g} ({why})", strat.name)

    def to_dict(self):
        return {"risk": self.risk.to_dict()}

    def load_dict(self, d):
        self.risk.load_dict(d.get("risk", {}))

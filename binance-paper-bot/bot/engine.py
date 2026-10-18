"""Trading engine: candles -> strategy -> risk -> execution adapter.

Used unchanged by both the backtester and the live paper runner.
"""
import logging
import numpy as np
from .execution.base import Order
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
    def __init__(self, cfg, exchange, strategy, risk, symbol_infos, brackets, recorder=None):
        self.cfg, self.ex, self.strat, self.risk = cfg, exchange, strategy, risk
        self.si, self.brackets = symbol_infos, brackets
        self.rec = recorder
        self.symbols = list(symbol_infos)
        n = cfg["data"]["history_bars"]
        self.candles = {s: {tf: CandleBuffer(n) for tf in strategy.timeframes()} for s in self.symbols}
        self.wt = cfg["execution"]["sl_tp_working_type"]
        self.last_signal = {}

    def event(self, ts, typ, symbol, msg):
        log.info("[%s] %s %s", typ, symbol, msg)
        if self.rec:
            self.rec.on_event({"ts": ts, "type": typ, "symbol": symbol, "msg": msg})

    def add_history(self, symbol, tf, rows):
        for r in rows:
            self.candles[symbol][tf].add(r)

    def on_bar_closed(self, symbol, tf, row, run_strategy=True):
        if tf not in self.candles[symbol]:
            return
        self.candles[symbol][tf].add(row)
        if tf == self.strat.timeframe and run_strategy:
            self.run_strategy(symbol, row[6] + 1)

    def run_strategy(self, symbol, ts):
        ctx = Context(symbol, ts, {tf: b.arrays() for tf, b in self.candles[symbol].items()},
                      self.ex.get_position(symbol))
        try:
            sigs = self.strat.on_bar(ctx)
        except Exception:
            log.exception("strategy error on %s", symbol)
            return
        for s in sigs:
            self.last_signal[symbol] = {"ts": ts, "action": s.action, "reason": s.reason, "info": s.info}
            self.handle(s, ts)

    def handle(self, sig, ts):
        sym = sig.symbol
        if sig.action == "INFO":
            self.event(ts, "SIGNAL_FILTERED", sym, sig.reason)
            return
        if sig.action == "CLOSE":
            p = self.ex.get_position(sym)
            if p:
                self.event(ts, "SIGNAL", sym, f"CLOSE: {sig.reason}")
                self.ex.place_order(Order(sym, "SELL" if p.side > 0 else "BUY", "MARKET", p.qty,
                                          reduce_only=True, tag="SIGNAL_CLOSE"), ts)
            return
        self.event(ts, "SIGNAL", sym, f"{sig.action}: {sig.reason}")
        qty, why = self.risk.size(sig, self.ex, self.si[sym], self.brackets, ts)
        if qty <= 0:
            self.event(ts, "RISK_REJECT", sym, why)
            return
        if self.ex.get_position(sym) is None and self.ex.leverage.get(sym) != sig.leverage:
            self.ex.set_leverage(sym, sig.leverage)
        side = "BUY" if sig.action == "OPEN_LONG" else "SELL"
        o = self.ex.place_order(Order(sym, side, "MARKET", qty, tag=self.strat.name), ts)
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
        if tp is not None:
            self.ex.place_order(Order(sym, exit_side, "TAKE_PROFIT_MARKET", stop_price=tp, close_position=True,
                                      working_type=self.wt, tag="TP"), ts)
        p.meta.update({"sl": sl, "tp": tp, "reason": sig.reason})
        if slo.status == "REJECTED":       # stop would trigger immediately -> flatten
            self.ex.place_order(Order(sym, exit_side, "MARKET", p.qty, reduce_only=True, tag="SL_REJECT"), ts)
        self.event(ts, "OPEN", sym, f"{side} {qty} @ {fill} lev {sig.leverage}x SL {sl} TP {tp} "
                                    f"liq {self.ex.liq_price(sym) or 0:.6g} ({why})")

    def to_dict(self):
        return {"risk": self.risk.to_dict()}

    def load_dict(self, d):
        self.risk.load_dict(d.get("risk", {}))

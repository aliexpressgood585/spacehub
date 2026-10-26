"""Trading engine: candles -> strategy -> risk -> execution adapter.

Used unchanged by both the backtester and the live paper runner.
"""
import logging
import numpy as np
from .execution.base import Order
from .strategies import Context

log = logging.getLogger("engine")
FIELDS = ("open_time", "open", "high", "low", "close", "volume", "close_time")


def _scan_score(sig):
    info = getattr(sig, "info", None) or {}
    try:
        return float(info.get("scan_score") or 0.0)
    except (TypeError, ValueError):
        return 0.0


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
        # strategy name -> symbols it may open. Absent means the shared book.
        # A held symbol outside the set is still evaluated so its own exit can fire.
        self.entry_symbols = {}
        self.closed_trades = []
        # strategy name -> rebalance period already entered. Stops a flat book
        # from opening again before the next scheduled rebalance.
        self.universe_period = {}
        # Optional. None keeps the single-strategy path exactly as it was.
        self.selector = None
        self.scanner = None
        self._batch = False
        self._pending = []
        self._regime_touch_ts = None

    def event(self, ts, typ, symbol, msg, strategy="", extra=None):
        log.info("[%s] %s %s", typ, symbol, msg)
        if self.rec:
            ev = {"ts": ts, "type": typ, "symbol": symbol, "msg": msg}
            if strategy:
                ev["strategy"] = strategy
            if extra:
                for k, v in extra.items():
                    if k not in ev:
                        ev[k] = v
            self.rec.on_event(ev)

    def _emit_selector(self, ev):
        extra = {k: v for k, v in ev.items() if k not in ("ts", "type", "symbol", "msg", "strategy")}
        self.event(ev.get("ts"), ev.get("type"), ev.get("symbol") or "", ev.get("msg") or "",
                   ev.get("strategy") or "", extra=extra)

    def _closed_books(self, tf, ts):
        books = {}
        ts = int(ts)
        for sym, bufs in self.candles.items():
            buf = bufs.get(tf)
            if not buf or not buf.rows:
                continue
            rows = [r for r in buf.rows if int(r[6]) + 1 <= ts]
            if len(rows) < 2:
                continue
            a = np.array(rows, dtype=float)
            books[sym] = {f: a[:, i] for i, f in enumerate(FIELDS)}
        return books

    def sync_regime(self, ts):
        """Fold the regime from 4h bars already stored. No fetch, no old trades."""
        sel = self.selector
        if sel is None:
            return []
        ts = int(ts)
        if sel.bar_ts is not None and sel.bar_ts <= ts < sel.bar_ts + 14_400_000:
            return []
        events = sel.sync(self._closed_books(sel.timeframe, ts), ts)
        for ev in events:
            self._emit_selector(ev)
        return events

    def _selector_touch(self, ts):
        sel = self.selector
        if sel is None or self._regime_touch_ts == ts:
            return
        self._regime_touch_ts = ts
        self.sync_regime(ts)
        if not sel.enabled:
            return
        trades = list(self.closed_trades or []) + list(getattr(self.rec, "trades", []) or [])
        for ev in sel.review(trades, ts, self.ex.equity()):
            self._emit_selector(ev)

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
        self._selector_touch(ts)
        allow = self.entry_symbols.get(strat.name)
        pos = self._visible_position(symbol, strat)
        if allow is not None and symbol not in allow and pos is None:
            return
        ctx = Context(symbol, ts, {tf: b.arrays() for tf, b in self.candles[symbol].items()}, pos)
        try:
            sigs = strat.on_bar(ctx)
        except Exception:
            log.exception("strategy error on %s", symbol)
            return
        if allow is not None and symbol not in allow:
            sigs = [s for s in sigs if s.action not in ("OPEN_LONG", "OPEN_SHORT")]
        if self.selector is not None and self.selector.enabled:
            sigs = self.selector.gate(strat.name, symbol, sigs, len(self.ex.positions()))
        for s in sigs:
            self.last_signal[symbol] = {"ts": ts, "action": s.action, "reason": s.reason,
                                        "info": s.info, "strategy": strat.name}
            if (self._batch and self.scanner is not None and self.scanner.enabled
                    and s.action in ("OPEN_LONG", "OPEN_SHORT")):
                self._pending.append((s, ts, strat, _scan_score(s)))
                continue
            self.handle(s, ts, strat)

    def begin_entries(self):
        """Hold new entries until end_entries so one bar can be ranked."""
        if self._pending:
            self.flush_opens()
        self._batch = True

    def end_entries(self):
        try:
            return self.flush_opens()
        finally:
            self._batch = False

    def flush_opens(self):
        """Open the highest-scoring queued entries, up to the scanner cap.

        A risk rejection does not consume the cap: the next score is tried.
        Outside a batch, or with the scanner off, nothing is queued.
        """
        pending = self._pending
        self._pending = []
        if not pending:
            return 0
        pending.sort(key=lambda item: (-item[3], item[0].symbol))
        cap = int(self.scanner.max_new) if self.scanner is not None else len(pending)
        opened = 0
        for sig, ts, strat, score in pending:
            if opened >= cap:
                self.event(ts, "SIGNAL_FILTERED", sig.symbol,
                           f"scanner kept the top {cap} (score {score:.3f})", strat.name)
                continue
            # The selector saw the book before this bar's fills. Re-check so a
            # batch cannot open past the account position cap.
            if self.selector is not None and self.selector.enabled:
                ok, why = self.selector.allow(strat.name, sig.symbol, len(self.ex.positions()))
                if not ok:
                    self.event(ts, "SIGNAL_FILTERED", sig.symbol, why, strat.name)
                    continue
            before = self.ex.get_position(sig.symbol)
            self.handle(sig, ts, strat)
            after = self.ex.get_position(sig.symbol)
            if before is None and after is not None:
                opened += 1
        return opened

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
        qty, why = self.risk.size(
            sig, self.ex, self.si[sym], self.brackets, ts,
            owner=strat.name if self.overrides else None,
            owner_max_pos=ov.get("max_concurrent_positions"),
            owner_risk=ov.get("risk_per_trade"),
            owner_day_return=day_ret,
            owner_max_daily_loss=ov.get("max_daily_loss"))
        if qty <= 0:
            if why == "HALT_DRAWDOWN":
                pct = self.risk.max_drawdown * 100
                self.event(ts, "HALT_DRAWDOWN", sym,
                           f"equity drawdown from peak reached {pct:.0f}%; new entries halted",
                           strat.name)
                why = "drawdown halt"
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
        if sig.info.get("setup"):
            p.meta["setup"] = sig.info["setup"]
        if sig.info.get("scan_score") is not None:
            p.meta["scan_score"] = sig.info["scan_score"]
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

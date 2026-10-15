"""The decision core, shared by main.py (live) and backtest.py: on every closed 1m bar
    broker events -> equity / kill switch -> working orders (3-bar timeout) -> open positions (1R break-even,
    time exit) -> new setups -> filters -> cost rule -> size -> limits -> post-only entry.
The engine never talks to an exchange itself; it goes through a Broker (executor.LiveBroker or backtest.SimBroker).
"""
from __future__ import annotations

import itertools
import json
import logging
from dataclasses import dataclass, field
from typing import Protocol

import numpy as np

from . import filters as F
from .data import TF_MS, SymbolView
from .risk import RiskManager, RiskState, corr_1h, cost_check, size_position
from .setups import SETUP_TF, Candidate, find_candidates

log = logging.getLogger("daybot.engine")
_ids = itertools.count(1)


@dataclass
class Position:
    id: str
    sym: str
    setup: str
    side: int
    tf: str
    qty: float
    entry: float
    stop: float
    stop0: float
    targets: list[tuple[float, float]]
    opened_ms: int
    risk_usd: float
    leverage: int
    qty0: float = 0.0
    hit1r: bool = False
    bars: int = 0
    fees: float = 0.0
    funding: float = 0.0
    realized: float = 0.0          # gross P&L of partial exits so far
    tp_done: list[bool] = field(default_factory=list)
    exchange: dict = field(default_factory=dict)  # order ids etc. (live)

    @property
    def r0(self) -> float:
        return abs(self.entry - self.stop0)


@dataclass
class EntryOrder:
    id: str
    cand: Candidate
    price: float
    qty: float
    leverage: int
    placed_ms: int
    risk_usd: float
    targets: list[tuple[float, float]]
    waited: int = 0
    exchange: dict = field(default_factory=dict)


@dataclass
class Event:
    kind: str                      # FILLED | PARTIAL_TP | CLOSED | ERROR
    pos: Position | None = None
    order: EntryOrder | None = None
    price: float = 0.0
    reason: str = ""
    pnl: float = 0.0               # net, for CLOSED (whole trade incl. partials, fees, funding)


class Broker(Protocol):
    def ok(self) -> bool: ...
    def equity(self) -> float: ...
    def free_margin(self) -> float: ...
    def positions(self) -> list[Position]: ...
    def orders(self) -> list[EntryOrder]: ...
    def poll(self, now_ms: int) -> list[Event]: ...
    def place_entry(self, o: EntryOrder) -> bool: ...
    def cancel_entry(self, o: EntryOrder) -> None: ...
    def move_stop(self, p: Position, price: float) -> bool: ...
    def close_position(self, p: Position, reason: str) -> bool: ...


class NullNotifier:
    def send(self, text: str) -> None:
        pass


def gate_pass(cfg, gate: dict | None) -> set[str]:
    """Setups allowed to trade: enabled in config AND passed the out-of-sample gate written by backtest.py.
    No gate file -> nothing passes."""
    ok = set()
    for s in SETUP_TF:
        if not cfg["setups"][s]["enabled"]:
            continue
        passed = bool(gate and gate.get("setups", {}).get(s, {}).get("pass"))
        if passed or (cfg.mode == "testnet" and cfg["gate"]["allow_failed_on_testnet"]):
            ok.add(s)
    return ok


class Engine:
    def __init__(self, cfg, broker: Broker, journal, notifier=None, allowed: set[str] | None = None,
                 assume_liquid: bool = False, risk_state: RiskState | None = None):
        self.cfg = cfg
        self.broker = broker
        self.journal = journal
        self.notify = notifier or NullNotifier()
        self.allowed = set(allowed or ())
        self.assume_liquid = assume_liquid
        self.risk = RiskManager(cfg, risk_state)
        self.armed: dict[str, Candidate] = {}
        self.seen: set[str] = set()
        self.stopped = False          # /stop: manual halt until /resume
        self.views: dict[str, SymbolView] = {}

    # ------------------------------------------------------------------ helpers
    def _book(self) -> list[tuple[str, int]]:
        return [(p.sym, p.side) for p in self.broker.positions()] + [(o.cand.sym, o.cand.side) for o in self.broker.orders()]

    def _corr(self, a: str, b: str) -> float:
        va, vb = self.views.get(a), self.views.get(b)
        if not va or not vb:
            return float("nan")
        ha, hb = va.bars["1h"], vb.bars["1h"]
        ia, ib = ha.last_closed(va.now_ms), hb.last_closed(vb.now_ms)
        return corr_1h(ha.c[max(0, ia - 100):ia + 1], hb.c[max(0, ib - 100):ib + 1])

    def _persist(self) -> None:
        self.journal.save_state("risk", self.risk.s.to_dict())
        self.journal.save_state("engine", {"stopped": self.stopped})

    def entries_blocked(self) -> str | None:
        s = self.risk.s
        if self.stopped:
            return "stopped by /stop"
        if s.kill:
            return "kill switch"
        if s.week_halt:
            return "weekly stop"
        if not self.broker.ok():
            return "exchange/API not healthy"
        return None

    # ------------------------------------------------------------------ main step
    def step(self, now_ms: int, views: dict[str, SymbolView]) -> None:
        self.views = views
        for ev in self.broker.poll(now_ms):
            self._on_event(ev, now_ms)

        eq = self.broker.equity()
        for e in self.risk.update_equity(eq, now_ms):
            self._on_risk_event(e, eq, now_ms)
        self.journal.equity(now_ms, eq)

        self._manage_orders(now_ms, views)
        self._manage_positions(now_ms, views)
        if self.entries_blocked() is None:
            self._new_entries(now_ms, views)
        self._persist()

    # ------------------------------------------------------------------ events
    def _on_event(self, ev: Event, now_ms: int) -> None:
        if ev.kind == "FILLED":
            p = ev.pos
            self.risk.on_entry(now_ms)
            self.journal.record_open(p, now_ms)
            self.notify.send(f"🟢 כניסה {p.sym} {'לונג' if p.side > 0 else 'שורט'} {p.setup} @ {p.entry:g} · סטופ {p.stop:g} · "
                             f"יעדים {', '.join(f'{px:g}' for px, _ in p.targets)} · סיכון ${p.risk_usd:.2f} · {p.leverage}x")
        elif ev.kind == "PARTIAL_TP":
            self.journal.record_event(now_ms, "PARTIAL_TP", f"{ev.pos.sym} @ {ev.price:g}")
        elif ev.kind == "CLOSED":
            p = ev.pos
            R = ev.pnl / p.risk_usd if p.risk_usd else 0.0
            self.journal.record_close(p, now_ms, ev.price, ev.reason, ev.pnl, R)
            for e in self.risk.on_close(ev.pnl, now_ms):
                self._on_risk_event(e, self.broker.equity(), now_ms)
            self.notify.send(f"{'✅' if ev.pnl > 0 else '🔴'} יציאה {p.sym} {p.setup} · {ev.reason} @ {ev.price:g} · "
                             f"{ev.pnl:+.2f}$ ({R:+.2f}R)")
        elif ev.kind == "ERROR":
            self.journal.record_event(now_ms, "ERROR", ev.reason)
            self.notify.send(f"⚠️ שגיאה: {ev.reason}")

    def _on_risk_event(self, e: str, eq: float, now_ms: int) -> None:
        if e == "DAY_ROLL":
            return
        text = {"KILL": f"🛑 KILL SWITCH: ירידה של {self.cfg['risk']['kill_drawdown'] * 100:.0f}% מהשיא. סוגר הכל ועוצר.",
                "DAY_STOP": "⛔ מינוס 2% היום — אין כניסות עד חצות",
                "WEEK_STOP": "⛔ מינוס 5% בשבוע — עצירה עד /approve",
                "STREAK_PAUSE": f"⏸ {self.cfg['risk']['loss_streak']} הפסדים ברצף — הפסקה של {self.cfg['risk']['loss_streak_pause_h']} שעות"}[e]
        self.journal.record_event(now_ms, e, f"{text} (equity {eq:.2f})")
        self.notify.send(f"{text}\nהון: ${eq:,.2f}")
        if e == "KILL":
            self.flatten(now_ms, "KILL_SWITCH")

    def flatten(self, now_ms: int, reason: str) -> None:
        for o in list(self.broker.orders()):
            self.broker.cancel_entry(o)
        self.armed.clear()
        for p in list(self.broker.positions()):
            if not self.broker.close_position(p, reason):
                self.notify.send(f"🚨 לא הצלחתי לסגור {p.sym}! בדוק ידנית בבינאנס.")
        for ev in self.broker.poll(now_ms):
            self._on_event(ev, now_ms)

    # ------------------------------------------------------------------ working entry orders
    def _manage_orders(self, now_ms: int, views: dict[str, SymbolView]) -> None:
        for o in list(self.broker.orders()):
            o.waited += 1
            if o.waited >= self.cfg["entry"]["limit_timeout_1m"] or self.entries_blocked():
                self.broker.cancel_entry(o)
                self.journal.record_decision(now_ms, o.cand, "CANCELLED", "limit not filled in time" if not self.entries_blocked() else self.entries_blocked(), {})
        for key, c in list(self.armed.items()):  # breakout entries waiting for a 1m close through the trigger
            v = views.get(c.sym)
            if now_ms > c.arm_until or v is None:
                del self.armed[key]
                continue
            b = v.bars["1m"]
            i = b.last_closed(now_ms)
            if i >= 0 and (b.c[i] - c.trigger) * c.side > 0:
                del self.armed[key]
                if self.entries_blocked() is None:
                    self._try_enter(c, v, now_ms, triggered=True)

    # ------------------------------------------------------------------ open positions
    def _manage_positions(self, now_ms: int, views: dict[str, SymbolView]) -> None:
        r = self.cfg["risk"]
        for p in list(self.broker.positions()):
            v = views.get(p.sym)
            if v is None:
                continue
            b = v.bars["1m"]
            i = b.last_closed(now_ms)
            if i < 0 or b.t[i] <= p.opened_ms:  # never judge the bar the fill happened in
                continue
            fav = b.h[i] if p.side > 0 else b.l[i]
            if not p.hit1r and p.side * (fav - p.entry) >= r["be_at_r"] * p.r0:
                p.hit1r = True
                if p.side * (p.entry - p.stop) > 0:  # stop still on the losing side -> move to entry
                    if self.broker.move_stop(p, p.entry):
                        self.journal.record_event(now_ms, "BREAKEVEN", f"{p.sym} stop -> {p.entry:g}")
                    else:
                        self.notify.send(f"⚠️ {p.sym}: הזזת הסטופ לכניסה נכשלה — סוגר את הפוזיציה")
                        self.broker.close_position(p, "BE_FAILED")
                        continue
            if now_ms % TF_MS[p.tf] == 0 and now_ms > p.opened_ms:
                p.bars += 1
                if not p.hit1r and p.bars >= r["time_exit_bars"]:
                    self.broker.close_position(p, "TIME")
                elif p.bars >= r["max_hold_bars"]:
                    self.broker.close_position(p, "MAX_HOLD")
        for ev in self.broker.poll(now_ms):
            self._on_event(ev, now_ms)

    # ------------------------------------------------------------------ new entries
    def _new_entries(self, now_ms: int, views: dict[str, SymbolView]) -> None:
        btc = views.get("BTC")
        found: list[Candidate] = []
        for sym, v in views.items():
            for c in find_candidates(v, self.cfg, self.allowed):
                if c.key not in self.seen:
                    self.seen.add(c.key)
                    found.append(c)
        if len(self.seen) > 50_000:  # keys carry the bar time; anything older than a day can never recur
            cut = now_ms - 86_400_000
            self.seen = {k for k in self.seen if int(k.rsplit("|", 1)[1]) >= cut}
        for c in found:
            v = views[c.sym]
            verdict = F.check(c, v, btc, self.cfg, assume_liquid=self.assume_liquid)
            if not verdict.ok:
                self.journal.record_decision(now_ms, c, "SKIP", verdict.reason, {})
                continue
            c._verdict = verdict  # type: ignore[attr-defined]
            if c.trigger is not None:
                self.armed[c.key] = c
                self.journal.record_decision(now_ms, c, "ARMED", f"waiting for a 1m close beyond {c.trigger:g}", {})
                continue
            self._try_enter(c, v, now_ms)

    def _try_enter(self, c: Candidate, v: SymbolView, now_ms: int, triggered: bool = False) -> None:
        verdict = getattr(c, "_verdict", None)
        b = v.bars["1m"]
        i = b.last_closed(now_ms)
        if i < 0:
            return
        # post-only limit at the touch: bid for a long, ask for a short (backtest: the 1m close)
        price = (v.bid if c.side > 0 else v.ask) if (v.bid and v.ask) else float(b.c[i])
        cost = cost_check(c.side, price, c.stop, c.targets, self.cfg, verdict.max_cost_r if verdict else self.cfg["costs"]["max_cost_r"])
        if not cost.ok:
            self.journal.record_decision(now_ms, c, "SKIP", f"cost: {cost.reason}", {})
            return
        ok, why = self.risk.can_enter(now_ms, self._book(), c.sym, c.side, self._corr)
        if not ok:
            self.journal.record_decision(now_ms, c, "SKIP", f"risk: {why}", {})
            return
        sz = size_position(self.broker.equity(), self.broker.free_margin(), c.side, price, c.stop, self.cfg,
                           verdict.size_mult if verdict else 1.0)
        if not sz.ok:
            self.journal.record_decision(now_ms, c, "SKIP", f"size: {sz.reason}", {})
            return
        o = EntryOrder(f"e{next(_ids)}", c, price, sz.qty, sz.leverage, now_ms, sz.risk_usd, cost.targets)
        data = {"cost_r": round(cost.cost_r, 3), "exp_r": round(cost.expected_r, 2), "lev": sz.leverage,
                "notional": round(sz.notional, 2), "liq": sz.liq_price, "night": bool(verdict and verdict.night)}
        if self.broker.place_entry(o):
            self.journal.record_decision(now_ms, c, "ORDER", "post-only limit placed", data)
        else:
            self.journal.record_decision(now_ms, c, "SKIP", "order rejected by the exchange", data)

    # ------------------------------------------------------------------ commands
    def status(self) -> str:
        s = self.risk.s
        lines = [f"הון: ${self.broker.equity():,.2f} · שיא ${s.peak:,.2f} · רצף הפסדים {s.streak}",
                 f"עסקאות ב-24ש: {len(s.entries)}/{self.cfg['risk']['max_trades_24h']} · סטאפים פעילים: {','.join(sorted(self.allowed)) or 'אין'}",
                 f"חסימה: {self.entries_blocked() or 'אין'}"]
        for p in self.broker.positions():
            lines.append(f"• {p.sym} {'לונג' if p.side > 0 else 'שורט'} {p.setup} כניסה {p.entry:g} סטופ {p.stop:g}{' (BE)' if p.hit1r else ''}")
        for o in self.broker.orders():
            lines.append(f"• פקודת כניסה {o.cand.sym} {o.cand.setup} @ {o.price:g} (נר {o.waited}/{self.cfg['entry']['limit_timeout_1m']})")
        return "\n".join(lines)

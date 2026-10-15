"""SQLite journal: every decision (incl. skips and their reason), every trade, events, equity, persisted state, and the
daily summary. MemoryJournal has the same interface for the backtest (keeps trades + decision counts only)."""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from collections import Counter
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

SCHEMA = """
create table if not exists decisions (ts integer, sym text, setup text, side integer, decision text, reason text, data text);
create table if not exists trades (id text primary key, sym text, setup text, side integer, tf text, qty real, entry real,
  stop0 real, targets text, leverage integer, risk_usd real, opened_ms integer, closed_ms integer, exit_px real,
  reason text, pnl real, r real, fees real, funding real);
create table if not exists events (ts integer, kind text, text text);
create table if not exists equity (ts integer primary key, value real);
create table if not exists state (key text primary key, value text);
create index if not exists ix_dec_ts on decisions(ts);
create index if not exists ix_tr_closed on trades(closed_ms);
"""


class Journal:
    def __init__(self, path: str | Path):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(str(path), check_same_thread=False)
        self.db.executescript(SCHEMA)
        self.lock = threading.Lock()
        self._last_eq = 0

    def _x(self, sql: str, args=()) -> None:
        with self.lock:
            self.db.execute(sql, args)
            self.db.commit()

    def record_decision(self, ts: int, c, decision: str, reason: str, data: dict) -> None:
        self._x("insert into decisions values (?,?,?,?,?,?,?)", (ts, c.sym, c.setup, c.side, decision, reason, json.dumps(data)))

    def record_open(self, p, ts: int) -> None:
        self._x("insert or replace into trades (id,sym,setup,side,tf,qty,entry,stop0,targets,leverage,risk_usd,opened_ms) "
                "values (?,?,?,?,?,?,?,?,?,?,?,?)",
                (p.id, p.sym, p.setup, p.side, p.tf, p.qty0 or p.qty, p.entry, p.stop0, json.dumps(p.targets), p.leverage, p.risk_usd, p.opened_ms))

    def record_close(self, p, ts: int, px: float, reason: str, pnl: float, r: float) -> None:
        self._x("update trades set closed_ms=?, exit_px=?, reason=?, pnl=?, r=?, fees=?, funding=? where id=?",
                (ts, px, reason, pnl, r, p.fees, p.funding, p.id))

    def record_event(self, ts: int, kind: str, text: str) -> None:
        self._x("insert into events values (?,?,?)", (ts, kind, text))

    def equity(self, ts: int, value: float) -> None:
        if ts - self._last_eq >= 300_000:  # one row per 5 minutes is plenty
            self._last_eq = ts
            self._x("insert or replace into equity values (?,?)", (ts, value))

    def save_state(self, key: str, value: dict) -> None:
        self._x("insert or replace into state values (?,?)", (key, json.dumps(value)))

    def load_state(self, key: str) -> dict | None:
        with self.lock:
            r = self.db.execute("select value from state where key=?", (key,)).fetchone()
        return json.loads(r[0]) if r else None

    def open_trades(self) -> list[tuple]:
        with self.lock:
            return self.db.execute("select id,sym,setup,side,tf,qty,entry,stop0,targets,leverage,risk_usd,opened_ms "
                                   "from trades where closed_ms is null").fetchall()

    def daily_summary(self, tz: str, now: float | None = None) -> str:
        z = ZoneInfo(tz)
        now = now or time.time()
        d0 = datetime.fromtimestamp(now, z).replace(hour=0, minute=0, second=0, microsecond=0)
        a = int(d0.timestamp() * 1000)
        with self.lock:
            rows = self.db.execute("select setup, pnl, r from trades where closed_ms >= ?", (a,)).fetchall()
            dec = self.db.execute("select decision, reason from decisions where ts >= ?", (a,)).fetchall()
        n = len(rows)
        w = sum(1 for r in rows if r[1] > 0)
        pnl = sum(r[1] for r in rows)
        rr = sum(r[2] for r in rows)
        skips = Counter(r[1].split(":")[0] for r in dec if r[0] == "SKIP").most_common(4)
        lines = [f"📊 סיכום יומי {d0:%d/%m}", f"עסקאות שנסגרו: {n} · הצליחו {w} · P&L {pnl:+.2f}$ ({rr:+.2f}R)",
                 f"החלטות: {len(dec)} · דילוגים עיקריים: " + (", ".join(f"{k} ({v})" for k, v in skips) or "אין")]
        return "\n".join(lines)


class MemoryJournal:
    """Backtest journal: keeps closed trades and counts decisions by reason."""

    def __init__(self):
        self.trades: list[dict] = []
        self.decisions: Counter = Counter()
        self.events: list[tuple] = []
        self.state: dict = {}
        self.open: dict = {}

    def record_decision(self, ts, c, decision, reason, data):
        self.decisions[(c.setup, decision, reason.split(" (")[0].split(":")[0] if decision == "SKIP" else decision)] += 1

    def record_open(self, p, ts):
        self.open[p.id] = ts

    def record_close(self, p, ts, px, reason, pnl, r):
        self.trades.append({"id": p.id, "sym": p.sym, "setup": p.setup, "side": p.side, "opened": p.opened_ms, "closed": ts,
                            "entry": p.entry, "exit": px, "reason": reason, "pnl": pnl, "r": r, "fees": p.fees,
                            "funding": p.funding, "risk": p.risk_usd})

    def record_event(self, ts, kind, text):
        self.events.append((ts, kind, text))

    def equity(self, ts, value):
        pass

    def save_state(self, key, value):
        self.state[key] = value

    def load_state(self, key):
        return self.state.get(key)

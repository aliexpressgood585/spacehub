"""Full trade logging: SQLite (source of truth) + CSV mirrors, for orders, trades and events. Nothing secret is ever
passed in; raw exchange payloads are stored with auth-looking fields stripped."""
from __future__ import annotations

import csv
import json
import sqlite3
import time
from pathlib import Path

SCHEMA = """
create table if not exists orders (ts integer, client_id text, symbol text, side text, type text, qty real, price real,
  status text, filled real, avg_price real, reason text, raw text);
create table if not exists trades (id integer primary key autoincrement, open_ts integer, close_ts integer, symbol text,
  strategy text, side integer, qty real, entry real, stop real, exit real, pnl real, r real, reason text, status text);
create table if not exists events (ts integer, level text, kind text, message text);
"""
_STRIP = {"apiKey", "secret", "signature", "X-MBX-APIKEY"}


def _clean(raw) -> str:
    if isinstance(raw, dict):
        raw = {k: v for k, v in raw.items() if k not in _STRIP}
    try:
        return json.dumps(raw, default=str)[:4000]
    except (TypeError, ValueError):
        return ""


class Journal:
    def __init__(self, sqlite_path: str | Path, csv_dir: str | Path):
        Path(sqlite_path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(str(sqlite_path))
        self.db.executescript(SCHEMA)
        self.csv_dir = Path(csv_dir)
        self.csv_dir.mkdir(parents=True, exist_ok=True)

    def _csv(self, name: str, row: dict) -> None:
        p = self.csv_dir / f"{name}.csv"
        new = not p.exists()
        with open(p, "a", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(row))
            if new:
                w.writeheader()
            w.writerow(row)

    def order(self, client_id, symbol, side, typ, qty, price, status, filled, avg_price, reason, raw=None) -> None:
        row = dict(ts=int(time.time() * 1000), client_id=client_id, symbol=symbol, side=side, type=typ, qty=qty, price=price,
                   status=status, filled=filled, avg_price=avg_price, reason=reason)
        self.db.execute("insert into orders values (?,?,?,?,?,?,?,?,?,?,?,?)", (*row.values(), _clean(raw)))
        self.db.commit()
        self._csv("orders", row)

    def open_trade(self, symbol, strategy, side, qty, entry, stop) -> int:
        cur = self.db.execute("insert into trades (open_ts, symbol, strategy, side, qty, entry, stop, status) values (?,?,?,?,?,?,?, 'OPEN')",
                              (int(time.time() * 1000), symbol, strategy, side, qty, entry, stop))
        self.db.commit()
        self._csv("trades", dict(event="open", id=cur.lastrowid, symbol=symbol, strategy=strategy, side=side, qty=qty, entry=entry, stop=stop))
        return int(cur.lastrowid)

    def close_trade(self, trade_id: int, exit_px: float, pnl: float, r: float, reason: str) -> None:
        self.db.execute("update trades set close_ts=?, exit=?, pnl=?, r=?, reason=?, status='CLOSED' where id=?",
                        (int(time.time() * 1000), exit_px, pnl, r, reason, trade_id))
        self.db.commit()
        self._csv("trades", dict(event="close", id=trade_id, exit=exit_px, pnl=pnl, r=r, reason=reason))

    def open_trades(self) -> list[dict]:
        cur = self.db.execute("select id, symbol, strategy, side, qty, entry, stop, open_ts from trades where status='OPEN'")
        cols = [c[0] for c in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]

    def event(self, level: str, kind: str, message: str) -> None:
        ts = int(time.time() * 1000)
        self.db.execute("insert into events values (?,?,?,?)", (ts, level, kind, message))
        self.db.commit()
        self._csv("events", dict(ts=ts, level=level, kind=kind, message=message))

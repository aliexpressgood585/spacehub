"""SQLite persistence (+CSV trade log) and an in-memory recorder for backtests."""
import csv
import json
import os
import sqlite3
import threading

TRADE_FIELDS = ["symbol", "side", "qty", "entry_price", "exit_price", "open_ts", "close_ts", "gross_pnl",
                "fees", "funding", "net_pnl", "reason", "strategy", "leverage", "margin"]

SCHEMA = """
CREATE TABLE IF NOT EXISTS state (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS fills (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, order_id INTEGER, symbol TEXT,
  side TEXT, type TEXT, qty REAL, price REAL, fee REAL, liquidity TEXT, realized_pnl REAL, tag TEXT, reason TEXT);
CREATE TABLE IF NOT EXISTS trades (id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT, side TEXT, qty REAL,
  entry_price REAL, exit_price REAL, open_ts INTEGER, close_ts INTEGER, gross_pnl REAL, fees REAL, funding REAL,
  net_pnl REAL, reason TEXT, strategy TEXT, leverage REAL, margin REAL);
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, type TEXT, symbol TEXT, msg TEXT);
CREATE TABLE IF NOT EXISTS equity (ts INTEGER PRIMARY KEY, equity REAL, wallet REAL, upnl REAL, n_pos INTEGER);
CREATE TABLE IF NOT EXISTS funding (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, symbol TEXT, rate REAL,
  mark REAL, qty REAL, amount REAL);
"""


class MemoryRecorder:
    def __init__(self):
        self.fills, self.trades, self.events, self.funding = [], [], [], []

    def on_fill(self, f): self.fills.append(f)
    def on_trade(self, t): self.trades.append(t)
    def on_event(self, e): self.events.append(e)
    def on_funding(self, f): self.funding.append(f)


class SqliteStore:
    def __init__(self, db_path, trades_csv=None):
        os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
        self.lock = threading.Lock()
        self.db = sqlite3.connect(db_path, check_same_thread=False)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.executescript(SCHEMA)
        self.csv = trades_csv
        self.extra_listeners = []

    def _ins(self, table, d):
        cols = list(d)
        with self.lock:
            self.db.execute(f"INSERT INTO {table} ({','.join(cols)}) VALUES ({','.join('?'*len(cols))})",
                            [d[c] for c in cols])
            self.db.commit()

    # listener API
    def on_fill(self, f):
        self._ins("fills", {k: f[k] for k in ("ts", "order_id", "symbol", "side", "type", "qty", "price", "fee",
                                               "liquidity", "realized_pnl", "tag", "reason")})

    def on_trade(self, t):
        self._ins("trades", {k: t[k] for k in TRADE_FIELDS})
        if self.csv:
            new = not os.path.exists(self.csv)
            with open(self.csv, "a", newline="") as fh:
                w = csv.DictWriter(fh, TRADE_FIELDS)
                if new:
                    w.writeheader()
                w.writerow({k: t[k] for k in TRADE_FIELDS})
        for l in self.extra_listeners:
            l("trade", t)

    def on_event(self, e):
        self._ins("events", {"ts": e["ts"], "type": e["type"], "symbol": e.get("symbol", ""), "msg": e.get("msg", "")})
        for l in self.extra_listeners:
            l("event", e)

    def on_funding(self, f):
        self._ins("funding", f)

    def equity(self, ts, equity, wallet, upnl, n_pos):
        with self.lock:
            self.db.execute("INSERT OR REPLACE INTO equity VALUES (?,?,?,?,?)", (ts, equity, wallet, upnl, n_pos))
            self.db.commit()

    def save_state(self, key, obj):
        with self.lock:
            self.db.execute("INSERT OR REPLACE INTO state VALUES (?,?)", (key, json.dumps(obj)))
            self.db.commit()

    def load_state(self, key):
        r = self.db.execute("SELECT v FROM state WHERE k=?", (key,)).fetchone()
        return json.loads(r[0]) if r else None

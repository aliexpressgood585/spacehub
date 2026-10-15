"""Backtest = the live engine (engine.py, setups.py, filters.py, risk.py) on history, through a simulated exchange.

Execution model (conservative where history is ambiguous):
  * entry: post-only limit at the signal 1m close; fills only if a LATER 1m bar trades THROUGH the price
    (low < limit for a buy); maker fee; not filled in 3 bars -> cancelled. Never a market chase.
  * if the fill bar also touched the stop, the stop is assumed hit after the fill (worst case);
  * stop first inside every 1m bar; a gap through the stop fills at the bar open; stop / take-profit / time exits are
    market fills: taker fee + slippage against us;
  * funding: the real Binance settlement rate x position notional at each settlement (sign by side);
  * no order book in the archive -> F4 (volume / spread) assumed true for the fixed liquid list.

    python -m daybot.backtest                  # 24 months in ./data, every setup alone + all together, writes the gate
    python -m daybot.backtest --no-write       # report only
"""
from __future__ import annotations

import argparse
import csv
import json
import multiprocessing as mp
import re
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from .config import load_config
from .data import TF_MS, Bars, SymbolView, prepare
from .engine import Engine, EntryOrder, Event, Position
from .journal import MemoryJournal
from .setups import SETUP_TF

M1 = 60_000


# ------------------------------------------------------------------------------------------------ data
def load_symbol(path: Path, sym: str) -> tuple[dict[str, Bars], tuple[np.ndarray, np.ndarray]]:
    z = np.load(path / f"{sym}-1m.npz")
    b1 = Bars("1m", z["t"], z["o"], z["h"], z["l"], z["c"], z["v"])
    ft, fr = [], []
    fp = path / f"{sym}-funding.csv"
    if fp.exists():
        for r in csv.reader(open(fp)):
            ft.append(int(r[0]))
            fr.append(float(r[1]))
    o = np.argsort(ft)
    return prepare(b1), (np.asarray(ft, dtype=np.int64)[o], np.asarray(fr)[o])


# ------------------------------------------------------------------------------------------------ simulated exchange
class SimBroker:
    def __init__(self, cfg, data: dict[str, dict[str, Bars]], funding, equity0: float, slip: float):
        self.cfg, self.data, self.fund = cfg, data, funding
        c = cfg["costs"]
        self.taker, self.maker, self.slip = c["taker_fee"], c["maker_fee"], slip
        self.cash = equity0
        self._pos: list[Position] = []
        self._ord: list[EntryOrder] = []
        self.queue: list[Event] = []
        self.marks: dict[str, float] = {}
        self.now = 0
        self.done_until: dict[str, int] = {}

    def busy(self) -> bool:
        return bool(self._pos or self._ord)

    def ok(self) -> bool:
        return True

    def positions(self) -> list[Position]:
        return self._pos

    def orders(self) -> list[EntryOrder]:
        return self._ord

    def _upnl(self, p: Position) -> float:
        return p.side * (self.marks.get(p.sym, p.entry) - p.entry) * p.qty

    def equity(self) -> float:
        return self.cash + sum(self._upnl(p) for p in self._pos)

    def free_margin(self) -> float:
        used = sum(p.entry * p.qty / p.leverage for p in self._pos) + sum(o.price * o.qty / o.leverage for o in self._ord)
        return self.equity() - used

    def mark(self, now_ms: int, syms) -> None:
        for s in syms:
            b = self.data[s]["1m"]
            i = b.last_closed(now_ms)
            if i >= 0:
                self.marks[s] = float(b.c[i])

    # -- fills ---------------------------------------------------------------------------------------
    def _exit(self, p: Position, qty: float, px: float, why: str, t: int) -> None:
        fill = px * (1 - p.side * self.slip)
        gross = p.side * (fill - p.entry) * qty
        fee = fill * qty * self.taker
        self.cash += gross - fee
        p.realized += gross
        p.fees += fee
        p.qty -= qty
        if p.qty <= p.qty0 * 1e-9:
            self._pos.remove(p)
            self.queue.append(Event("CLOSED", p, price=fill, reason=why, pnl=p.realized - p.fees - p.funding))
        else:
            self.queue.append(Event("PARTIAL_TP", p, price=fill, reason=why))

    def _bar(self, s: str, i: int) -> None:
        b = self.data[s]["1m"]
        t, o, h, l, c = int(b.t[i]), b.o[i], b.h[i], b.l[i], b.c[i]
        for e in [x for x in self._ord if x.cand.sym == s]:
            if (e.cand.side > 0 and l < e.price) or (e.cand.side < 0 and h > e.price):
                self._ord.remove(e)
                fee = e.price * e.qty * self.maker
                self.cash -= fee
                p = Position(e.id, s, e.cand.setup, e.cand.side, e.cand.tf, e.qty, e.price, e.cand.stop, e.cand.stop,
                             e.targets, t, e.risk_usd, e.leverage, qty0=e.qty, fees=fee, tp_done=[False] * len(e.targets))
                self._pos.append(p)
                self.queue.append(Event("FILLED", p, e))
                if (p.side > 0 and l <= p.stop) or (p.side < 0 and h >= p.stop):  # fill bar also reached the stop
                    self._exit(p, p.qty, p.stop, "STOP", t)
        ft, fr = self.fund[s]
        if len(ft):
            a, z = np.searchsorted(ft, t, "right"), np.searchsorted(ft, t + M1, "right")
            for k in range(a, z):
                for p in [x for x in self._pos if x.sym == s]:
                    f = p.side * fr[k] * p.qty * o
                    p.funding += f
                    self.cash -= f
        for p in [x for x in self._pos if x.sym == s]:
            if p.opened_ms == t:
                continue  # handled at the fill above
            if (p.side > 0 and o <= p.stop) or (p.side < 0 and o >= p.stop):
                self._exit(p, p.qty, o, "STOP_GAP" if not p.hit1r else "BE", t)
                continue
            if (p.side > 0 and l <= p.stop) or (p.side < 0 and h >= p.stop):
                self._exit(p, p.qty, p.stop, "STOP" if not p.hit1r else "BE", t)
                continue
            for k, (tp, frac) in enumerate(p.targets):
                if p.tp_done[k] or p not in self._pos:
                    continue
                if (p.side > 0 and h >= tp) or (p.side < 0 and l <= tp):
                    p.tp_done[k] = True
                    q = p.qty if all(p.tp_done) else min(p.qty, p.qty0 * frac)
                    self._exit(p, q, max(tp, o) if p.side > 0 else min(tp, o), "TARGET", t)

    def poll(self, now_ms: int) -> list[Event]:
        syms = sorted({p.sym for p in self._pos} | {o.cand.sym for o in self._ord})  # fixed order = deterministic runs
        for s in syms:
            b = self.data[s]["1m"]
            i = b.last_closed(now_ms)
            j = self.done_until.get(s, i - 1)
            for k in range(max(j + 1, 0), i + 1):  # every 1m bar since the last one processed, in order
                self._bar(s, k)
            self.done_until[s] = i
        self.mark(now_ms, syms)
        out, self.queue = self.queue, []
        return out

    def place_entry(self, o: EntryOrder) -> bool:
        b = self.data[o.cand.sym]["1m"]
        self.done_until[o.cand.sym] = b.last_closed(self.now)  # the order sees only later bars
        self._ord.append(o)
        return True

    def cancel_entry(self, o: EntryOrder) -> None:
        if o in self._ord:
            self._ord.remove(o)

    def move_stop(self, p: Position, price: float) -> bool:
        p.stop = price
        return True

    def close_position(self, p: Position, reason: str) -> bool:
        if p in self._pos:
            self._exit(p, p.qty, self.marks.get(p.sym, p.entry), reason, self.now)
        return True


# ------------------------------------------------------------------------------------------------ run
_DATA: dict = {}


def run(cfg, setups: set[str], slip: float, start_ms: int, end_ms: int, equity0: float = 10_000.0,
        stops: dict | None = None) -> list[dict]:
    """The manual steps the live bot waits for are simulated so the whole sample is measured: the weekly stop is
    approved at the start of the next week, the kill switch is reset at the next Israel midnight. Each firing is
    counted in `stops` and shown in the report."""
    data, fund = _DATA["bars"], _DATA["funding"]
    stops = stops if stops is not None else {}
    broker = SimBroker(cfg, data, fund, equity0, slip)
    eng = Engine(cfg, broker, MemoryJournal(), allowed=setups, assume_liquid=True)
    syms = list(data)
    t1 = data["BTC"]["1m"].t
    t1 = t1[(t1 >= start_ms) & (t1 < end_ms)]
    fund_last = {s: fund[s] for s in syms}
    for t in t1:
        now = int(t) + M1
        if now % 300_000 and not broker.busy() and not eng.armed:
            continue
        broker.now = now
        views = {}
        for s in syms:
            ft, fr = fund_last[s]
            k = np.searchsorted(ft, now, "right") - 1
            views[s] = SymbolView(s, now, data[s], funding=float(fr[k]) if k >= 0 else None)
        broker.mark(now, syms)
        rs = eng.risk.s
        was = (rs.kill, rs.week_halt, rs.day_halt_until, rs.pause_until)
        wk, dk = rs.week_key, rs.day_key
        eng.step(now, views)
        if rs.kill and not was[0]:
            stops["kill"] = stops.get("kill", 0) + 1
        if rs.week_halt and not was[1]:
            stops["week"] = stops.get("week", 0) + 1
        if rs.day_halt_until > was[2]:
            stops["day"] = stops.get("day", 0) + 1
        if rs.pause_until > was[3]:
            stops["streak"] = stops.get("streak", 0) + 1
        if rs.week_halt and rs.week_key != wk and wk:   # new week -> the operator approves
            eng.risk.approve_week()
        if rs.kill and rs.day_key != dk and dk:          # next day -> the operator resets the kill switch
            eng.risk.reset_kill(broker.equity())
    for p in list(broker.positions()):  # end of data: close at the last mark
        broker.close_position(p, "END")
    for ev in broker.poll(int(t1[-1]) + M1):
        eng._on_event(ev, int(t1[-1]) + M1)
    return eng.journal.trades


def stats(tr: list[dict], equity0: float = 10_000.0) -> dict:
    n = len(tr)
    if not n:
        return {"n": 0, "win": 0, "exp_r": 0, "pf": 0, "max_dd": 0, "streak": 0, "pnl": 0}
    tr = sorted(tr, key=lambda x: x["closed"])
    r = np.array([x["r"] for x in tr])
    pnl = np.array([x["pnl"] for x in tr])
    gp, gl = pnl[pnl > 0].sum(), -pnl[pnl <= 0].sum()
    eq = equity0 + np.cumsum(pnl)
    peak = np.maximum.accumulate(np.concatenate([[equity0], eq]))[1:]
    streak = cur = 0
    for x in pnl:
        cur = cur + 1 if x <= 0 else 0
        streak = max(streak, cur)
    return {"n": n, "win": float((pnl > 0).mean()), "exp_r": float(r.mean()), "pf": float(gp / gl) if gl else float("inf"),
            "max_dd": float((1 - eq / peak).max()), "streak": int(streak), "pnl": float(pnl.sum()),
            "t": float(r.mean() / (r.std(ddof=1) or 1) * np.sqrt(n)) if n > 1 else 0.0}


def _job(args):
    cfg, name, setups, slip, a, z = args
    t0 = time.time()
    st: dict = {}
    tr = run(cfg, setups, slip, a, z, stops=st)
    return name, slip, tr, st, time.time() - t0


def fmt(s: dict) -> str:
    if not s["n"]:
        return "     0 trades"
    pf = "inf" if s["pf"] == float("inf") else f"{s['pf']:.2f}"
    return (f"{s['n']:6d} {s['win'] * 100:5.1f}% {s['exp_r']:+7.3f}R {pf:>6} {s['max_dd'] * 100:5.1f}% "
            f"{s['streak']:4d} {s['pnl']:+10.0f}$ {s.get('t', 0):+6.2f}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="config.yaml")
    ap.add_argument("--no-write", action="store_true", help="report only: do not write the gate file / config")
    ap.add_argument("--workers", type=int, default=max(1, min(8, mp.cpu_count())))
    a = ap.parse_args()
    cfg = load_config(a.config, check_live=False)
    path = cfg.p("data")
    print("loading data ...", flush=True)
    bars, funding = {}, {}
    for s in cfg.universe:
        if not (path / f"{s}-1m.npz").exists():
            sys.exit(f"missing {path}/{s}-1m.npz — run: python scripts/fetch_history.py --months 24")
        bars[s], funding[s] = load_symbol(path, s)
    _DATA.update(bars=bars, funding=funding)
    t = bars["BTC"]["1m"].t
    start = int(t[0]) + 5 * 86_400_000  # indicator warm-up
    end = int(t[-1]) + M1
    split = start + int(0.7 * (end - start))
    slip = cfg["costs"]["slippage"]
    runs = [(s, {s}) for s in SETUP_TF] + [("ALL", set(SETUP_TF))]
    jobs = [(cfg, name, st, sl, start, end) for name, st in runs for sl in (slip, 2 * slip)]
    print(f"{len(jobs)} runs on {len(bars)} coins, {datetime.fromtimestamp(start / 1000, timezone.utc):%Y-%m-%d} .. "
          f"{datetime.fromtimestamp(end / 1000, timezone.utc):%Y-%m-%d}, split {datetime.fromtimestamp(split / 1000, timezone.utc):%Y-%m-%d}", flush=True)
    ctx = mp.get_context("fork")
    with ctx.Pool(a.workers) as pool:
        res, fired = {}, {}
        for name, sl, tr, st, sec in pool.imap_unordered(_job, jobs):
            res[(name, sl)] = tr
            fired[(name, sl)] = st
            print(f"  done {name} slip {sl * 1e4:.0f}bp: {len(tr)} trades ({sec:.0f}s)", flush=True)

    g = cfg["gate"]
    lines = ["# daybot — backtest report", "",
             f"Coins: {', '.join(cfg.universe)} · Binance USDⓈ-M · 1m history {datetime.fromtimestamp(start / 1000, timezone.utc):%Y-%m-%d} → "
             f"{datetime.fromtimestamp(end / 1000, timezone.utc):%Y-%m-%d} · in-sample 70% / out-of-sample 30% by time "
             f"(split {datetime.fromtimestamp(split / 1000, timezone.utc):%Y-%m-%d}) · start equity $10,000 per run.",
             f"Costs: maker {cfg['costs']['maker_fee'] * 100:.2f}% entry, taker {cfg['costs']['taker_fee'] * 100:.2f}% + slippage "
             f"{slip * 100:.2f}% on every market exit, real funding. Each setup runs ALONE, then all together.",
             "Manual steps are simulated so the whole sample is measured: weekly stop approved at the next week, kill switch "
             "reset at the next midnight (each firing is counted below). Columns: trades, win rate, expectancy per trade in R, "
             "profit factor, max drawdown, longest losing run, P&L, t-stat of the mean R.", "",
             "```", f"{'':16}{'n':>6} {'win':>6} {'exp':>8} {'PF':>6} {'maxDD':>6} {'lossrun':>4} {'P&L':>11} {'t':>6}"]
    gate = {"generated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "rule": f"OOS PF > {g['min_pf']} and OOS trades >= {g['min_trades']}", "setups": {}}
    for name, _ in runs:
        tr, tr2 = res[(name, slip)], res[(name, 2 * slip)]
        A = stats(tr)
        IS = stats([x for x in tr if x["closed"] < split])
        OOS = stats([x for x in tr if x["closed"] >= split])
        OOS2 = stats([x for x in tr2 if x["closed"] >= split])
        f = fired[(name, slip)]
        lines += [f"{name} all          {fmt(A)}", f"{name} in-sample    {fmt(IS)}", f"{name} out-of-sample{fmt(OOS)}",
                  f"{name} OOS 2x slip  {fmt(OOS2)}"]
        if name != "ALL":
            ok = OOS["n"] >= g["min_trades"] and OOS["pf"] > g["min_pf"]
            gate["setups"][name] = {"pass": bool(ok), "oos_n": OOS["n"], "oos_pf": round(OOS["pf"], 3) if OOS["n"] else 0,
                                    "oos_exp_r": round(OOS["exp_r"], 4), "is_pf": round(IS["pf"], 3) if IS["n"] else 0}
            lines.append(f"   -> {'PASS' if ok else 'FAIL'} ({gate['setups'][name]['oos_n']} OOS trades, PF {gate['setups'][name]['oos_pf']})")
        lines.append(f"   stops fired: kill switch {f.get('kill', 0)}, weekly -5% {f.get('week', 0)}, daily -2% {f.get('day', 0)}, 3-loss pause {f.get('streak', 0)}")
        lines.append("")
    lines.append("```")
    passed = [s for s, v in gate["setups"].items() if v["pass"]]
    lines += ["", f"Gate ({gate['rule']}): **{len(passed)} of 6 pass** — " + (", ".join(passed) if passed else "none; the bot will not trade any setup") + "."]
    report = "\n".join(lines)
    print(report)
    out = cfg.root / "reports"
    out.mkdir(exist_ok=True)
    (out / "backtest_report.md").write_text(report + "\n", encoding="utf-8")
    json.dump({k: {"n": len(v)} for k, v in {f"{n}|{s}": t for (n, s), t in res.items()}.items()}, open(out / "backtest_runs.json", "w"))
    if not a.no_write:
        gp = cfg.root / g["file"]
        gp.parent.mkdir(parents=True, exist_ok=True)
        gp.write_text(json.dumps(gate, indent=2), encoding="utf-8")
        txt = cfg.path.read_text(encoding="utf-8")
        for s, v in gate["setups"].items():
            if not v["pass"]:
                txt = re.sub(rf"(\n\s*{s}:\s*\{{enabled:\s*)true", r"\1false", txt)
        cfg.path.write_text(txt, encoding="utf-8")
        print(f"\nwrote {gp} and disabled the failed setups in {cfg.path.name}")


if __name__ == "__main__":
    main()

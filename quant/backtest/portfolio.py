"""Portfolio replay: takes per-symbol trades (size-free) and applies sizing + every risk limit in time order, using the
SAME RiskManager class the live runner uses.

Honesty notes:
- Sizing and every limit decision use only information available at the decision time: equity is realised equity
  plus open positions marked at the last closed bar; closed trades are recognised only after their exit time.
- A trade skipped by a limit does not free the per-symbol simulator to take a different trade in its place
  (a standard approximation; it can only UNDER-count trades, never invent them).
- The drawdown kill switch is checked at every trade close and at every bar close of a daily mark; when it fires,
  every open position is closed at the current bar's close minus taker fee and slippage, and nothing trades after.
- One open position per symbol across strategies.
"""
from __future__ import annotations

import heapq
from dataclasses import dataclass, field

import numpy as np

from ..data.loader import Bars
from ..risk.manager import DAY_MS, RiskManager
from .engine import Trade, slip_base


@dataclass
class Taken:
    trade: Trade
    qty: float
    risk_frac: float
    pnl: float = 0.0
    exit_t: int = 0
    killed: bool = False


@dataclass
class PortfolioResult:
    taken: list[Taken]
    daily_t: np.ndarray
    daily_equity: np.ndarray
    events: list[tuple[int, str, str]] = field(default_factory=list)
    skipped: dict[str, int] = field(default_factory=dict)
    t0: int = 0
    t1: int = 0
    equity0: float = 0.0


def _price_at(bars: Bars, t_ms: int) -> float:
    k = int(np.searchsorted(bars.t, t_ms, side="right")) - 1
    return float(bars.close[max(k, 0)])


def run_portfolio(trades: list[Trade], bars_by_sym: dict[str, Bars], cfg: dict, t0: int, t1: int,
                  equity0: float | None = None, seed_r: dict[str, list[float]] | None = None) -> PortfolioResult:
    equity0 = float(equity0 or cfg["backtest"]["initial_equity"])
    rm = RiskManager(cfg, equity0)
    for strat, rs in (seed_r or {}).items():
        for r in rs:
            rm.sizer(strat).add(r)
    taker = cfg["costs"]["taker_fee"]
    cand = sorted((tr for tr in trades if t0 <= tr.entry_t < t1), key=lambda x: (x.entry_t, x.symbol))
    realised = equity0
    open_pos: dict[str, Taken] = {}
    exits: list[tuple[int, int, str]] = []    # heap (exit_t, seq, symbol)
    taken: list[Taken] = []
    events: list[tuple[int, str, str]] = []
    skipped: dict[str, int] = {}
    halted = False
    seq = 0

    def mtm(now: int) -> float:
        u = 0.0
        for sym, tk in open_pos.items():
            px = _price_at(bars_by_sym[sym], now - 1)
            u += tk.qty * tk.trade.side * (px - tk.trade.entry_px)
        return realised + u

    def close_trade(sym: str, now: int) -> None:
        nonlocal realised, halted
        tk = open_pos.pop(sym)
        tk.pnl = tk.qty * tk.trade.pnl_q
        tk.exit_t = tk.trade.exit_t
        realised += tk.pnl
        ev = rm.on_trade_closed(now, tk.pnl, tk.trade.r, tk.trade.strategy, mtm(now))
        if ev:
            events.append((now, ev, sym))
            if ev == "KILL":
                kill_all(now)

    def kill_all(now: int) -> None:
        nonlocal realised, halted
        halted = True
        for sym in list(open_pos):
            tk = open_pos.pop(sym)
            px = _price_at(bars_by_sym[sym], now)
            px *= 1 - tk.trade.side * slip_base(sym, cfg)
            tk.pnl = tk.qty * (tk.trade.side * (px - tk.trade.entry_px) - taker * (tk.trade.entry_px + px))
            tk.exit_t, tk.killed = now, True
            realised += tk.pnl

    def settle_until(now: int) -> None:
        while exits and exits[0][0] <= now:
            t_ex, _, sym = heapq.heappop(exits)
            if sym in open_pos and open_pos[sym].trade.exit_t == t_ex:
                close_trade(sym, t_ex)

    # daily marks: equity curve + drawdown kill on mark-to-market equity
    day0 = (t0 // DAY_MS + 1) * DAY_MS
    marks = list(range(day0, t1 + DAY_MS, DAY_MS))
    daily_t, daily_eq = [t0], [equity0]
    mi = 0
    for tr in cand + [None]:
        now = tr.entry_t if tr is not None else t1
        while mi < len(marks) and marks[mi] <= now:
            settle_until(marks[mi])
            eq = mtm(marks[mi])
            if not halted and rm.mark(marks[mi], eq) == "KILL":
                events.append((marks[mi], "KILL", "*"))
                kill_all(marks[mi])
                eq = realised
            daily_t.append(marks[mi]); daily_eq.append(eq)
            mi += 1
        if tr is None:
            break
        settle_until(now)
        if halted:
            skipped["halted"] = skipped.get("halted", 0) + 1
            continue
        if tr.symbol in open_pos:
            skipped["symbol_busy"] = skipped.get("symbol_busy", 0) + 1
            continue
        eq = mtm(now)
        ok, why = rm.can_open(now, eq, len(open_pos))
        if not ok:
            key = why.split(":")[0].split(" (")[0]
            skipped[key] = skipped.get(key, 0) + 1
            continue
        open_notional = sum(tk.qty * tk.trade.entry_px for tk in open_pos.values())
        qty, f, why = rm.size(tr.strategy, eq, tr.entry_px, tr.stop_px, open_notional)
        if qty <= 0:
            skipped[why] = skipped.get(why, 0) + 1
            continue
        tk = Taken(tr, qty, f)
        open_pos[tr.symbol] = tk
        taken.append(tk)
        heapq.heappush(exits, (tr.exit_t, seq, tr.symbol)); seq += 1
    # positions still open at t1: marked in the final equity but left out of the trade statistics
    taken = [tk for tk in taken if tk.exit_t]
    return PortfolioResult(taken, np.array(daily_t, np.int64), np.array(daily_eq, float), events, skipped, t0, t1, equity0)

"""Part A (the cost rule) and part D (risk): position size, leverage, liquidation distance, daily/weekly stops,
loss-streak pause, the drawdown kill switch. Pure logic; persisted state is a plain dict (journal.py stores it)."""
from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import numpy as np

# Code-level ceilings. config.py already refuses a config past them; these clamp again so no code path can exceed them.
HARD_RISK_PER_TRADE = 0.01
HARD_MAX_LEVERAGE = 5
DEFAULT_MMR = 0.005  # maintenance margin rate used for the liquidation estimate (Binance tier 1 for majors is 0.4-0.5%)


# ---------------------------------------------------------------------------------------------- part A: costs
@dataclass
class CostResult:
    ok: bool
    reason: str
    stop_pct: float = 0.0
    cost_r: float = 0.0
    expected_r: float = 0.0
    targets: list[tuple[float, float]] = field(default_factory=list)


def cost_check(side: int, entry: float, stop: float, targets: list[tuple[float, float]], cfg, max_cost_r: float) -> CostResult:
    """cost in R = round-trip cost % / stop distance %. Reject above max_cost_r. Expected reward (weighted over the
    targets) minus the cost must be >= min_target_r. A setup without targets gets default_target_r."""
    c = cfg["costs"]
    dist = side * (entry - stop)
    if not (entry > 0 and dist > 0):
        return CostResult(False, "stop on the wrong side of the entry")
    stop_pct = dist / entry
    cost_r = c["round_trip"] / stop_pct
    if cost_r > max_cost_r:
        return CostResult(False, f"cost {cost_r:.2f}R > {max_cost_r}R (stop {stop_pct * 100:.2f}%)", stop_pct, cost_r)
    tg = targets or [(entry + side * c["default_target_r"] * dist, 1.0)]
    if abs(sum(f for _, f in tg) - 1) > 1e-9 or any(side * (p - entry) <= 0 for p, _ in tg):
        return CostResult(False, "target on the wrong side of the entry", stop_pct, cost_r)
    exp_r = sum(f * side * (p - entry) / dist for p, f in tg) - cost_r
    if exp_r < c["min_target_r"]:
        return CostResult(False, f"target {exp_r:.2f}R after costs < {c['min_target_r']}R", stop_pct, cost_r, exp_r)
    return CostResult(True, "ok", stop_pct, cost_r, exp_r, tg)


# ---------------------------------------------------------------------------------------------- part D: size
@dataclass
class Sizing:
    ok: bool
    reason: str
    notional: float = 0.0
    qty: float = 0.0
    leverage: int = 1
    margin: float = 0.0
    risk_usd: float = 0.0
    liq_price: float = 0.0


def liq_price(side: int, entry: float, lev: int, mmr: float = DEFAULT_MMR) -> float:
    """Isolated-margin liquidation estimate (no fees): entry x (1 - side x (1/lev - mmr))."""
    return entry * (1 - side * (1 / lev - mmr))


def size_position(equity: float, free_margin: float, side: int, entry: float, stop: float, cfg,
                  size_mult: float = 1.0, mmr: float = DEFAULT_MMR, min_notional: float = 5.0) -> Sizing:
    """size $ = equity x risk% / stop distance %. Leverage is DERIVED (smallest that fits the free margin), capped at 5x.
    The liquidation price must be at least liq_vs_stop x the stop distance away; otherwise a lower leverage with a
    SMALLER position is tried, and if nothing fits there is no trade."""
    r = cfg["risk"]
    risk_frac = min(float(r["risk_per_trade"]), HARD_RISK_PER_TRADE) * min(size_mult, 1.0)
    max_lev = int(min(int(r["max_leverage"]), HARD_MAX_LEVERAGE))
    stop_pct = side * (entry - stop) / entry
    if stop_pct <= 0 or equity <= 0 or free_margin <= 0:
        return Sizing(False, "bad inputs")
    want = equity * risk_frac / stop_pct
    want = min(want, equity * max_lev)
    usable = free_margin * 0.95  # keep a little margin for fees
    lev0 = max(1, min(max_lev, math.ceil(want / usable)))
    for lev in range(lev0, 0, -1):
        notional = min(want, usable * lev)
        dist_liq = 1 / lev - mmr
        if dist_liq >= r["liq_vs_stop"] * stop_pct and notional >= min_notional:
            return Sizing(True, "ok", notional, notional / entry, lev, notional / lev, notional * stop_pct,
                          liq_price(side, entry, lev, mmr))
    return Sizing(False, f"liquidation would sit closer than {r['liq_vs_stop']}x the stop ({stop_pct * 100:.2f}%) at every leverage that fits")


def corr_1h(ca: np.ndarray, cb: np.ndarray, n: int = 100) -> float:
    """Correlation of the last n closed 1h returns of two close series (NaN if not enough data)."""
    ra, rb = np.diff(np.log(ca[-(n + 1):])), np.diff(np.log(cb[-(n + 1):]))
    k = min(len(ra), len(rb))
    if k < 30:
        return float("nan")
    return float(np.corrcoef(ra[-k:], rb[-k:])[0, 1])


# ---------------------------------------------------------------------------------------------- part D: limits
@dataclass
class RiskState:
    peak: float = 0.0
    day_key: str = ""
    day_start: float = 0.0
    week_key: str = ""
    week_start: float = 0.0
    streak: int = 0
    pause_until: int = 0          # ms, loss-streak pause
    day_halt_until: int = 0       # ms, daily -2% stop (next Israel midnight)
    week_halt: bool = False       # weekly -5%: until /approve
    kill: bool = False            # drawdown kill switch: until manual reset
    entries: list[int] = field(default_factory=list)  # entry times (ms) in the last 24h

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict | None) -> "RiskState":
        return cls(**d) if d else cls()


class RiskManager:
    def __init__(self, cfg, state: RiskState | None = None):
        self.cfg = cfg
        self.r = cfg["risk"]
        self.tz = ZoneInfo(cfg["timezone"])
        self.s = state or RiskState()

    def _local(self, now_ms: int) -> datetime:
        return datetime.fromtimestamp(now_ms / 1000, self.tz)

    def _next_midnight_ms(self, now_ms: int) -> int:
        d = self._local(now_ms).date() + timedelta(days=1)
        return int(datetime(d.year, d.month, d.day, tzinfo=self.tz).timestamp() * 1000)

    def update_equity(self, equity: float, now_ms: int) -> list[str]:
        """Roll the day/week anchors, track the peak, fire the stops. Returns event codes for alerts."""
        s, ev = self.s, []
        loc = self._local(now_ms)
        dk, wk = loc.strftime("%Y-%m-%d"), "%d-W%02d" % loc.isocalendar()[:2]
        if s.day_key != dk:
            s.day_key, s.day_start = dk, equity
            ev.append("DAY_ROLL")
        if s.week_key != wk:
            s.week_key, s.week_start = wk, equity
        s.peak = max(s.peak, equity)
        if not s.kill and s.peak > 0 and equity <= s.peak * (1 - self.r["kill_drawdown"]):
            s.kill = True
            ev.append("KILL")
        if s.day_start > 0 and equity <= s.day_start * (1 - self.r["daily_stop"]) and s.day_halt_until <= now_ms:
            s.day_halt_until = self._next_midnight_ms(now_ms)
            ev.append("DAY_STOP")
        if not s.week_halt and s.week_start > 0 and equity <= s.week_start * (1 - self.r["weekly_stop"]):
            s.week_halt = True
            ev.append("WEEK_STOP")
        return ev

    def can_enter(self, now_ms: int, book: list[tuple[str, int]], sym: str, side: int,
                  corr=None) -> tuple[bool, str]:
        """book = (symbol, side) of open positions AND working entry orders."""
        s, r = self.s, self.r
        s.entries = [t for t in s.entries if t > now_ms - 86_400_000]
        if s.kill:
            return False, "kill switch (drawdown) — manual reset needed"
        if s.week_halt:
            return False, "weekly stop — waiting for /approve"
        if s.day_halt_until > now_ms:
            return False, "daily stop until midnight"
        if s.pause_until > now_ms:
            return False, f"{r['loss_streak']} losses in a row — pause"
        if len(book) >= r["max_open"]:
            return False, f"{r['max_open']} positions/orders already"
        if len(s.entries) >= r["max_trades_24h"]:
            return False, f"{r['max_trades_24h']} trades in 24h"
        for osym, oside in book:
            if osym == sym:
                return False, "already in this coin"
            if oside == side:
                c = corr(osym, sym) if corr else float("nan")
                if not np.isfinite(c) or c >= r["correlation_threshold"]:
                    return False, f"same side as {osym}, correlation {c:.2f}" if np.isfinite(c) else f"same side as {osym}, correlation unknown"
        return True, "ok"

    def on_entry(self, now_ms: int) -> None:
        self.s.entries.append(now_ms)

    def on_close(self, pnl: float, now_ms: int) -> list[str]:
        s = self.s
        if pnl < 0:
            s.streak += 1
            if s.streak >= self.r["loss_streak"]:
                s.pause_until = now_ms + int(self.r["loss_streak_pause_h"] * 3_600_000)
                s.streak = 0
                return ["STREAK_PAUSE"]
        else:
            s.streak = 0
        return []

    def approve_week(self) -> None:
        self.s.week_halt = False
        self.s.week_start = 0.0  # re-anchored on the next equity update... set to current by caller
        self.s.week_key = ""

    def reset_kill(self, equity: float) -> None:
        self.s.kill = False
        self.s.peak = equity

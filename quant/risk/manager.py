"""Risk management — hard limits, identical in the backtest and live (one class, two callers).

Sizing: half-Kelly on the strategy's own past R-multiples, capped at 1% of equity at risk per trade.
  With a fixed fraction f of equity risked per trade and outcomes r (in R), expected log growth is
  g(f) = E[log(1 + f r)] ~= f E[r] - f^2 E[r^2] / 2  ->  f* = E[r] / E[r^2].  We use kelly_fraction * f*, capped.
  No positive edge on the evidence (E[r] <= 0) -> size 0 -> no trade. Too few past trades -> a small default risk.
Limits (from config; daily_loss_limit=0 disables only the daily pause):
  - max leverage: total open notional <= max_leverage x equity (a new trade is trimmed to fit, or refused)
  - daily loss limit: realised loss today >= limit x the day's opening equity -> no entries until 00:00 UTC
  - max drawdown kill switch: equity <= (1 - limit) x peak -> close everything, HALT (manual reset only)
  - consecutive losses: N losing trades in a row -> no entries until 00:00 UTC
  - max open positions
  - a stop closer than min_stop_to_cost x the round-trip fee is refused (such a trade cannot pay for itself)
Every refusal returns a reason string so it can be logged and alerted.
"""
from __future__ import annotations

from dataclasses import dataclass, field

DAY_MS = 86_400_000


@dataclass
class KellySizer:
    fraction: float = 0.5
    cap: float = 0.01
    min_trades: int = 30
    default_risk: float = 0.0025
    rs: list[float] = field(default_factory=list)

    def add(self, r_multiple: float) -> None:
        self.rs.append(float(r_multiple))

    def full_kelly(self) -> float | None:
        if len(self.rs) < self.min_trades:
            return None
        n = len(self.rs)
        m = sum(self.rs) / n
        m2 = sum(r * r for r in self.rs) / n
        return m / m2 if m2 > 0 else 0.0

    def risk_fraction(self) -> float:
        f = self.full_kelly()
        if f is None:
            return min(self.default_risk, self.cap)
        return max(0.0, min(self.cap, self.fraction * f))


@dataclass
class RiskState:
    peak_equity: float
    day: int = -1
    day_open_equity: float = 0.0
    day_realised: float = 0.0
    consecutive_losses: int = 0
    paused_until_day: int = -1
    halted: bool = False
    halt_reason: str = ""


class RiskManager:
    def __init__(self, cfg: dict, equity: float):
        r = cfg["risk"]
        self.max_leverage = float(r["max_leverage"])
        self.daily_loss_limit = float(r["daily_loss_limit"])
        self.max_dd = float(r["max_drawdown_kill"])
        self.max_consec = int(r["max_consecutive_losses"])
        self.max_open = int(r.get("max_open_positions", 5))
        self.min_stop_to_cost = float(r.get("min_stop_to_cost", 0.0))
        self.round_trip_cost = 2 * float(cfg["costs"]["taker_fee"])
        self.kelly_cfg = dict(fraction=float(r["kelly_fraction"]), cap=float(r["risk_per_trade_cap"]),
                              min_trades=int(r["kelly_min_trades"]), default_risk=float(r["default_risk"]))
        self.state = RiskState(peak_equity=equity, day_open_equity=equity)
        self.sizers: dict[str, KellySizer] = {}

    # --- state updates -------------------------------------------------------------------------------------
    def sizer(self, strategy: str) -> KellySizer:
        if strategy not in self.sizers:
            self.sizers[strategy] = KellySizer(**self.kelly_cfg)
        return self.sizers[strategy]

    def _roll_day(self, now_ms: int, equity: float) -> None:
        d = int(now_ms // DAY_MS)
        if d != self.state.day:
            self.state.day = d
            self.state.day_open_equity = equity
            self.state.day_realised = 0.0
            if self.state.paused_until_day != -1 and d >= self.state.paused_until_day:
                self.state.paused_until_day = -1
                self.state.consecutive_losses = 0

    def mark(self, now_ms: int, equity: float) -> str | None:
        """Call with the current (marked-to-market) equity. Returns 'KILL' when the drawdown kill switch fires."""
        self._roll_day(now_ms, equity)
        if equity > self.state.peak_equity:
            self.state.peak_equity = equity
        if not self.state.halted and equity <= self.state.peak_equity * (1 - self.max_dd):
            self.state.halted = True
            self.state.halt_reason = f"max drawdown {self.max_dd:.0%} hit: equity {equity:.2f} vs peak {self.state.peak_equity:.2f}"
            return "KILL"
        return None

    def on_trade_closed(self, now_ms: int, pnl: float, r_multiple: float, strategy: str, equity_after: float) -> str | None:
        """Record a closed trade. Returns 'KILL' / 'DAILY_STOP' / 'CONSEC_STOP' when a limit fires."""
        self._roll_day(now_ms, equity_after - pnl)
        self.sizer(strategy).add(r_multiple)
        self.state.day_realised += pnl
        self.state.consecutive_losses = self.state.consecutive_losses + 1 if pnl < 0 else 0
        ev = self.mark(now_ms, equity_after)
        if ev:
            return ev
        if self.daily_loss_limit > 0 and self.state.day_realised <= -self.daily_loss_limit * self.state.day_open_equity and self.state.paused_until_day == -1:
            self.state.paused_until_day = self.state.day + 1
            return "DAILY_STOP"
        if self.state.consecutive_losses >= self.max_consec and self.state.paused_until_day == -1:
            self.state.paused_until_day = self.state.day + 1
            return "CONSEC_STOP"
        return None

    # --- decisions -----------------------------------------------------------------------------------------
    def can_open(self, now_ms: int, equity: float, open_positions: int) -> tuple[bool, str]:
        self._roll_day(now_ms, equity)
        if self.state.halted:
            return False, "halted: " + self.state.halt_reason
        if self.state.paused_until_day != -1:
            why = "daily loss limit" if self.daily_loss_limit > 0 and self.state.day_realised <= -self.daily_loss_limit * self.state.day_open_equity else "consecutive losses"
            return False, f"paused until next UTC day ({why})"
        if open_positions >= self.max_open:
            return False, "max open positions"
        return True, "ok"

    def size(self, strategy: str, equity: float, entry: float, stop: float, open_notional: float) -> tuple[float, float, str]:
        """Quantity (coins) and the risk fraction used. qty = 0 with a reason when refused."""
        dist = abs(entry - stop)
        if not (entry > 0 and dist > 0):
            return 0.0, 0.0, "invalid stop distance"
        if dist < self.min_stop_to_cost * self.round_trip_cost * entry:
            return 0.0, 0.0, "stop closer than min_stop_to_cost x round-trip cost"
        f = self.sizer(strategy).risk_fraction()
        if f <= 0:
            return 0.0, 0.0, "half-Kelly <= 0 (no positive edge in the strategy's own record)"
        qty = equity * f / dist
        room = self.max_leverage * equity - open_notional
        if room <= 0:
            return 0.0, f, "max leverage reached"
        if qty * entry > room:
            qty = room / entry
        return qty, f, "ok"

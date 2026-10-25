"""Risk manager: position sizing by % equity at risk, exposure and loss limits."""
import logging

log = logging.getLogger("risk")

# Floors used when exchangeInfo is missing or older than the live schedule.
# BTC 100 / ETH 20 / everything else 5. The sizer uses the higher of this and
# the symbol's own MIN_NOTIONAL.
KNOWN_MIN_NOTIONAL = {"BTCUSDT": 100.0, "ETHUSDT": 20.0}
DEFAULT_MIN_NOTIONAL = 5.0


def effective_min_notional(symbol, reported):
    known = KNOWN_MIN_NOTIONAL.get(symbol, DEFAULT_MIN_NOTIONAL)
    try:
        reported = float(reported or 0.0)
    except (TypeError, ValueError):
        reported = 0.0
    return max(reported, known)


class RiskManager:
    def __init__(self, cfg, taker_fee, slippage_bps):
        r = cfg["risk"]
        self.risk = r["risk_per_trade"]
        self.max_pos = r["max_concurrent_positions"]
        self.max_margin_frac = r["max_margin_per_position"]
        self.max_daily_loss = r.get("max_daily_loss", 1.0)
        self.max_drawdown = float(r.get("max_drawdown", 1.0))
        self.max_open_risk = float(r.get("max_open_risk", 1.0))
        self.roundup_risk = float(r.get("min_notional_roundup_risk", 0.0))
        self.taker, self.slip = taker_fee, slippage_bps / 1e4
        self.slip_by_symbol = {}          # symbol -> fraction; missing keys use self.slip
        self.day, self.day_start_equity = None, None
        self.peak_equity = None
        self.drawdown_halt = False
        # strategy name -> UTC day index. A per-strategy daily cap stays latched
        # until the next UTC day even if the open loss later recovers.
        self.owner_halt = {}

    def _daily(self, ex, ts):
        day = ts // 86_400_000
        if day != self.day:
            self.day, self.day_start_equity = day, ex.equity()
        return (ex.equity() - self.day_start_equity) / self.day_start_equity

    def to_dict(self):
        return {"day": self.day, "day_start_equity": self.day_start_equity,
                "owner_halt": dict(self.owner_halt),
                "peak_equity": self.peak_equity, "drawdown_halt": bool(self.drawdown_halt)}

    def load_dict(self, d):
        self.day, self.day_start_equity = d.get("day"), d.get("day_start_equity")
        raw = d.get("owner_halt") or {}
        self.owner_halt = {str(k): int(v) for k, v in raw.items() if v is not None}
        peak = d.get("peak_equity")
        self.peak_equity = float(peak) if peak is not None else None
        self.drawdown_halt = bool(d.get("drawdown_halt"))

    def _drawdown_status(self, ex):
        """'' if entries are allowed, else 'HALT_DRAWDOWN' on the trip or 'drawdown halt'."""
        eq = float(ex.equity())
        if self.peak_equity is None:
            self.peak_equity = eq
            self.drawdown_halt = False
            return ""
        if eq > float(self.peak_equity):
            self.peak_equity = eq
            self.drawdown_halt = False
            return ""
        peak = float(self.peak_equity)
        dd = (eq - peak) / peak if peak else 0.0
        if dd <= -float(self.max_drawdown):
            newly = not self.drawdown_halt
            self.drawdown_halt = True
            return "HALT_DRAWDOWN" if newly else "drawdown halt"
        self.drawdown_halt = False
        return ""

    def _open_stop_risk(self, ex):
        """USDT still at risk if every open position is stopped from here."""
        total = 0.0
        for sym, p in ex.positions().items():
            meta = getattr(p, "meta", None) or {}
            sl = meta.get("sl")
            px = ex.mark(sym) or p.entry_price
            if sl is None or not px:
                total += float(getattr(p, "isolated_margin", 0.0) or 0.0)
                continue
            total += abs(float(px) - float(sl)) * float(p.qty)
        return total

    def size(self, sig, ex, si, brackets, ts, owner=None, owner_max_pos=None,
             owner_risk=None, owner_day_return=None, owner_max_daily_loss=None):
        """Return (qty, reason). qty == 0 means rejected.

        `owner` counts only that strategy's positions and, when given, uses its
        own risk and concurrent cap. The account daily loss still applies.
        Without an owner every open position counts, which is the single-strategy path.
        """
        day = int(ts) // 86_400_000
        if owner is None:
            npos = len(ex.positions())
            cap = self.max_pos
        else:
            npos = sum(1 for p in ex.positions().values() if getattr(p, "strategy", "") == owner)
            cap = self.max_pos if owner_max_pos is None else int(owner_max_pos)
            if self.owner_halt.get(owner) == day:
                return 0, f"{owner} daily loss limit hit (paused until next UTC day)"
        if npos >= cap:
            return 0, f"max concurrent positions ({cap}) reached"
        if ex.get_position(sig.symbol):
            return 0, "already in position"
        halt = self._drawdown_status(ex)
        if halt:
            return 0, halt
        dd = self._daily(ex, ts)
        if dd <= -self.max_daily_loss:
            return 0, f"daily loss limit hit ({dd*100:.2f}%)"
        if (owner is not None and owner_max_daily_loss is not None and owner_day_return is not None
                and owner_day_return <= -float(owner_max_daily_loss)):
            self.owner_halt[owner] = day
            return 0, f"{owner} daily loss limit hit ({owner_day_return*100:.2f}%)"
        bid, ask = ex.best_bid_ask(sig.symbol)
        px = ask if sig.action == "OPEN_LONG" else bid
        if not px or sig.sl_distance <= 0:
            return 0, "no price / invalid stop"
        eq = ex.equity()
        slip = self.slip_by_symbol.get(sig.symbol, self.slip)
        # loss per unit if stopped: stop distance + entry & exit taker fee + slippage on exit
        per_unit = sig.sl_distance + px * (2 * self.taker + 2 * slip)
        risk = self.risk if owner_risk is None else float(owner_risk)
        weight = (getattr(sig, "info", None) or {}).get("target_weight")
        if weight is not None and float(weight) > 0:
            # Cross-sectional legs are a share of equity notional, not 1% at the stop.
            qty = eq * float(weight) / px
        else:
            qty = eq * risk / per_unit
        lev = sig.leverage
        # Per-position margin cap, and notional cannot exceed equity times leverage.
        cap_notional = min(eq * self.max_margin_frac * lev, ex.available_balance() * 0.98 * lev, eq * lev)
        capped = qty * px > cap_notional
        qty = min(qty, cap_notional / px)
        open_risk = self._open_stop_risk(ex)
        room = eq * self.max_open_risk - open_risk
        if room <= 0:
            return 0, "open risk cap"
        if per_unit > 0 and qty * per_unit > room:
            qty = room / per_unit
            capped = True
        max_lev = brackets.max_leverage(sig.symbol, max(qty, 0.0) * px)
        if lev > max_lev:
            return 0, f"leverage {lev} > bracket max {max_lev}"
        qty = si.round_qty(max(qty, 0.0), market=True)
        floor = effective_min_notional(sig.symbol, si.min_notional)
        if qty < si.market_min_qty or qty * px < floor:
            qty_up = self._round_up_to_min(si, px, floor)
            if not self._roundup_ok(qty_up, px, per_unit, eq, lev, si, ex, brackets, sig, open_risk):
                return 0, "below min notional"
            qty = qty_up
            capped = False
        if qty > si.market_max_qty:
            qty = si.round_qty(si.market_max_qty, market=True)
        if qty <= 0 or qty * px < floor:
            return 0, "below min notional"
        return qty, ("size capped by margin limit" if capped else "ok")

    def _round_up_to_min(self, si, px, floor):
        if not px:
            return 0.0
        qty = si.round_qty_up(floor / px, market=True)
        step = si.market_step_size or si.step_size
        guard = 0
        while qty * px < floor - 1e-8 and guard < 4:
            qty = si.round_qty_up(qty + step, market=True)
            guard += 1
        return qty

    def _roundup_ok(self, qty, px, per_unit, eq, lev, si, ex, brackets, sig, open_risk):
        """True when lifting to min notional stays inside risk, margin and the open-risk cap."""
        if qty < si.market_min_qty or qty > si.market_max_qty or eq <= 0 or lev <= 0:
            return False
        risk_frac = (qty * per_unit) / eq
        margin = qty * px / lev
        if risk_frac > self.roundup_risk + 1e-9:
            return False
        if margin > eq * self.max_margin_frac + 1e-6:
            return False
        if margin > ex.available_balance() * 0.98 + 1e-6:
            return False
        if open_risk + qty * per_unit > eq * self.max_open_risk + 1e-6:
            return False
        if lev > brackets.max_leverage(sig.symbol, qty * px):
            return False
        return True

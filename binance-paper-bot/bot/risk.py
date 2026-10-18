"""Risk manager: position sizing by % equity at risk, exposure and loss limits."""
import logging

log = logging.getLogger("risk")

DELIST_NAME = "delist_short"


def delist_margin_reserve(cfg, ex):
    """USDT of free margin experimental entries must leave for delist_short.

    Each still-open slot is `notional_frac` of equity at that rule's leverage.
    Slots already filled have their margin inside `used_margin` and are not
    reserved again. ema_trend_4h does not pay this reserve.
    """
    row = next((r for r in (cfg.get("strategies") or []) if (r or {}).get("name") == DELIST_NAME), None)
    if not row:
        return 0.0
    params = ((cfg.get("strategy") or {}).get("params") or {}).get(DELIST_NAME) or {}
    frac = float(params.get("notional_frac") or 0.0)
    lev = float(params.get("leverage") or (cfg.get("account") or {}).get("default_leverage") or 0.0)
    cap = int(row.get("max_concurrent_positions") or 0)
    if frac <= 0 or lev <= 0 or cap <= 0:
        return 0.0
    open_n = sum(1 for p in ex.positions().values() if getattr(p, "strategy", "") == DELIST_NAME)
    slots = max(0, cap - open_n)
    return slots * float(ex.equity()) * frac / lev


class RiskManager:
    def __init__(self, cfg, taker_fee, slippage_bps):
        r = cfg["risk"]
        self.risk = r["risk_per_trade"]
        self.max_pos = r["max_concurrent_positions"]
        self.max_margin_frac = r["max_margin_per_position"]
        self.max_daily_loss = r.get("max_daily_loss", 1.0)
        self.taker, self.slip = taker_fee, slippage_bps / 1e4
        self.slip_by_symbol = {}          # symbol -> fraction; missing keys use self.slip
        self.day, self.day_start_equity = None, None
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
                "owner_halt": dict(self.owner_halt)}

    def load_dict(self, d):
        self.day, self.day_start_equity = d.get("day"), d.get("day_start_equity")
        raw = d.get("owner_halt") or {}
        self.owner_halt = {str(k): int(v) for k, v in raw.items() if v is not None}

    def size(self, sig, ex, si, brackets, ts, owner=None, owner_max_pos=None,
             owner_risk=None, owner_day_return=None, owner_max_daily_loss=None,
             margin_reserve=0.0):
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
        reserved = max(0.0, float(margin_reserve or 0.0))
        avail = max(0.0, ex.available_balance() - reserved)
        # Per-position margin cap, and notional cannot exceed equity times leverage.
        # Experimental books pass `reserved` so delist_short can still open a slot.
        cap_notional = min(eq * self.max_margin_frac * lev, avail * 0.98 * lev, eq * lev)
        if reserved and cap_notional <= 0:
            return 0, "margin reserved for delist_short"
        capped = qty * px > cap_notional
        qty = min(qty, cap_notional / px)
        held_back = reserved and avail * 0.98 * lev <= min(eq * self.max_margin_frac * lev, eq * lev)
        max_lev = brackets.max_leverage(sig.symbol, qty * px)
        if lev > max_lev:
            return 0, f"leverage {lev} > bracket max {max_lev}"
        qty = si.round_qty(qty, market=True)
        if qty < si.market_min_qty:
            if reserved and capped:
                return 0, "margin reserved for delist_short"
            return 0, "qty below minQty"
        if qty * px < si.min_notional:
            return 0, f"notional {qty*px:.2f} below minNotional {si.min_notional}"
        if qty > si.market_max_qty:
            qty = si.round_qty(si.market_max_qty, market=True)
        if capped and held_back:
            return qty, "margin reserved for delist_short"
        return qty, ("size capped by margin limit" if capped else "ok")

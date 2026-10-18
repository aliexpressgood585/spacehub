"""Risk manager: position sizing by % equity at risk, exposure and loss limits."""
import logging

log = logging.getLogger("risk")


class RiskManager:
    def __init__(self, cfg, taker_fee, slippage_bps):
        r = cfg["risk"]
        self.risk = r["risk_per_trade"]
        self.max_pos = r["max_concurrent_positions"]
        self.max_margin_frac = r["max_margin_per_position"]
        self.max_daily_loss = r.get("max_daily_loss", 1.0)
        self.taker, self.slip = taker_fee, slippage_bps / 1e4
        self.day, self.day_start_equity = None, None

    def to_dict(self):
        return {"day": self.day, "day_start_equity": self.day_start_equity}

    def load_dict(self, d):
        self.day, self.day_start_equity = d.get("day"), d.get("day_start_equity")

    def _daily(self, ex, ts):
        day = ts // 86_400_000
        if day != self.day:
            self.day, self.day_start_equity = day, ex.equity()
        return (ex.equity() - self.day_start_equity) / self.day_start_equity

    def size(self, sig, ex, si, brackets, ts):
        """Return (qty, reason). qty == 0 means rejected."""
        if len(ex.positions()) >= self.max_pos:
            return 0, f"max concurrent positions ({self.max_pos}) reached"
        if ex.get_position(sig.symbol):
            return 0, "already in position"
        dd = self._daily(ex, ts)
        if dd <= -self.max_daily_loss:
            return 0, f"daily loss limit hit ({dd*100:.2f}%)"
        bid, ask = ex.best_bid_ask(sig.symbol)
        px = ask if sig.action == "OPEN_LONG" else bid
        if not px or sig.sl_distance <= 0:
            return 0, "no price / invalid stop"
        eq = ex.equity()
        # loss per unit if stopped: stop distance + entry & exit taker fee + slippage on exit
        per_unit = sig.sl_distance + px * (2 * self.taker + 2 * self.slip)
        qty = eq * self.risk / per_unit
        lev = sig.leverage
        cap_notional = min(eq * self.max_margin_frac * lev, ex.available_balance() * 0.98 * lev)
        capped = qty * px > cap_notional
        qty = min(qty, cap_notional / px)
        max_lev = brackets.max_leverage(sig.symbol, qty * px)
        if lev > max_lev:
            return 0, f"leverage {lev} > bracket max {max_lev}"
        qty = si.round_qty(qty, market=True)
        if qty < si.market_min_qty:
            return 0, "qty below minQty"
        if qty * px < si.min_notional:
            return 0, f"notional {qty*px:.2f} below minNotional {si.min_notional}"
        if qty > si.market_max_qty:
            qty = si.round_qty(si.market_max_qty, market=True)
        return qty, ("size capped by margin limit" if capped else "ok")

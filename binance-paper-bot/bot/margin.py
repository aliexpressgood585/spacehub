"""Leverage brackets, maintenance margin and isolated liquidation price.

Binance isolated-margin liquidation (one-way mode, single position):
    margin_balance(P) = isolated_margin + side*Q*(P - entry)
    maint(P)          = Q*P*MMR - cum
Liquidation when margin_balance <= maint, giving
    LP = (iso + cum - side*Q*entry) / (Q*MMR - side*Q)
MMR/cum come from the bracket containing notional at LP.
"""
from dataclasses import dataclass


@dataclass
class Bracket:
    floor: float
    cap: float
    mmr: float
    cum: float
    max_lev: float


# Approximate fallback tiers (used only if the public bracket table is unavailable)
APPROX_TIERS = [
    Bracket(0, 50_000, 0.004, 0, 125), Bracket(50_000, 600_000, 0.005, 50, 100),
    Bracket(600_000, 3_000_000, 0.01, 3_050, 75), Bracket(3_000_000, 12_000_000, 0.025, 48_050, 50),
    Bracket(12_000_000, 70_000_000, 0.05, 348_050, 20), Bracket(70_000_000, 1e12, 0.10, 3_848_050, 10),
]


class LeverageBrackets:
    def __init__(self, raw=None):
        self.table = {}
        for item in raw or []:
            bl = [Bracket(float(b["bracketNotionalFloor"]), float(b["bracketNotionalCap"]),
                          float(b["bracketMaintenanceMarginRate"]), float(b["cumFastMaintenanceAmount"]),
                          float(b["maxOpenPosLeverage"])) for b in item["riskBrackets"]]
            self.table[item["symbol"]] = sorted(bl, key=lambda x: x.floor)

    def source(self, symbol):
        return "binance" if symbol in self.table else "approx"

    def get(self, symbol):
        return self.table.get(symbol, APPROX_TIERS)

    def for_notional(self, symbol, notional):
        bl = self.get(symbol)
        for b in bl:
            if b.floor <= notional < b.cap:
                return b
        return bl[-1]

    def max_leverage(self, symbol, notional):
        return self.for_notional(symbol, notional).max_lev

    def to_raw(self):
        return [{"symbol": s, "riskBrackets": [
            {"bracketNotionalFloor": b.floor, "bracketNotionalCap": b.cap,
             "bracketMaintenanceMarginRate": b.mmr, "cumFastMaintenanceAmount": b.cum,
             "maxOpenPosLeverage": b.max_lev} for b in bl]} for s, bl in self.table.items()]


def maintenance_margin(notional, bracket):
    return notional * bracket.mmr - bracket.cum


def liquidation_price(side, qty, entry, isolated_margin, brackets):
    """side=+1 long / -1 short. brackets: list[Bracket] for the symbol."""
    if qty <= 0:
        return None
    candidates = []
    for b in brackets:
        denom = qty * b.mmr - side * qty
        if denom == 0:
            continue
        lp = (isolated_margin + b.cum - side * qty * entry) / denom
        lp = max(lp, 0.0)
        candidates.append((b, lp))
        if b.floor <= lp * qty < b.cap:
            return lp
    # fallback: bracket of entry notional
    nb = next((b for b in brackets if b.floor <= qty * entry < b.cap), brackets[-1])
    for b, lp in candidates:
        if b is nb:
            return lp
    return candidates[0][1] if candidates else 0.0


def funding_payment(side, qty, mark_price, rate):
    """Positive = received, negative = paid. Longs pay when rate > 0."""
    return -side * qty * mark_price * rate

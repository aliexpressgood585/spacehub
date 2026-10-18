"""exchangeInfo filters: tickSize, stepSize, minQty, minNotional."""
from dataclasses import dataclass, asdict
from decimal import Decimal, ROUND_DOWN, ROUND_UP, ROUND_HALF_UP


def _q(x, step, rounding):
    d, s = Decimal(str(x)), Decimal(str(step))
    return float((d / s).to_integral_value(rounding=rounding) * s)


@dataclass
class SymbolInfo:
    symbol: str
    tick_size: float
    step_size: float
    min_qty: float
    max_qty: float
    market_step_size: float
    market_min_qty: float
    market_max_qty: float
    min_notional: float
    status: str = "TRADING"

    @classmethod
    def from_exchange_info(cls, s):
        f = {x["filterType"]: x for x in s["filters"]}
        lot, mlot = f["LOT_SIZE"], f.get("MARKET_LOT_SIZE", f["LOT_SIZE"])
        return cls(symbol=s["symbol"], tick_size=float(f["PRICE_FILTER"]["tickSize"]),
                   step_size=float(lot["stepSize"]), min_qty=float(lot["minQty"]),
                   max_qty=float(lot["maxQty"]), market_step_size=float(mlot["stepSize"]),
                   market_min_qty=float(mlot["minQty"]), market_max_qty=float(mlot["maxQty"]),
                   min_notional=float(f.get("MIN_NOTIONAL", {}).get("notional", 5)),
                   status=s.get("status", "TRADING"))

    def round_price(self, p, mode="nearest"):
        r = {"nearest": ROUND_HALF_UP, "down": ROUND_DOWN, "up": ROUND_UP}[mode]
        return _q(p, self.tick_size, r)

    def round_qty(self, q, market=False):
        return _q(q, self.market_step_size if market else self.step_size, ROUND_DOWN)

    def to_dict(self):
        return asdict(self)


def load_symbol_infos(exchange_info, symbols):
    by = {s["symbol"]: s for s in exchange_info["symbols"]}
    missing = [s for s in symbols if s not in by]
    if missing:
        raise ValueError(f"Symbols not found in exchangeInfo: {missing}")
    return {s: SymbolInfo.from_exchange_info(by[s]) for s in symbols}

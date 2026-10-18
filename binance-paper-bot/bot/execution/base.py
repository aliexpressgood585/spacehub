"""Execution adapter interface.

The engine only talks to an ExecutionAdapter. `PaperExchange` implements it
with a full simulation. A future `BinanceLiveAdapter` would implement the same
methods with signed REST calls (POST /fapi/v1/order, /fapi/v1/leverage,
/fapi/v1/marginType, user-data stream for fills) -- intentionally NOT included.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field, asdict
import itertools

_ids = itertools.count(1)


@dataclass
class Order:
    symbol: str
    side: str                       # BUY / SELL
    type: str                       # MARKET / LIMIT / STOP_MARKET / TAKE_PROFIT_MARKET
    qty: float = 0.0
    price: float = 0.0              # limit price
    stop_price: float = 0.0         # trigger price
    working_type: str = "CONTRACT_PRICE"   # or MARK_PRICE
    reduce_only: bool = False
    close_position: bool = False
    post_only: bool = False
    tag: str = ""
    id: int = 0
    status: str = "NEW"             # NEW / FILLED / CANCELED / REJECTED
    created_ts: int = 0
    reject_reason: str = ""

    def to_dict(self):
        return asdict(self)


@dataclass
class Position:
    symbol: str
    side: int                       # +1 long, -1 short
    qty: float
    entry_price: float
    leverage: float
    isolated_margin: float
    opened_ts: int
    fees: float = 0.0               # fees paid on this position (positive number)
    funding: float = 0.0            # net funding (+received / -paid)
    realized_pnl: float = 0.0       # gross realized on partial closes
    strategy: str = ""
    max_qty: float = 0.0
    entry_notional: float = 0.0
    meta: dict = field(default_factory=dict)

    def upnl(self, price):
        return self.side * self.qty * (price - self.entry_price)

    def to_dict(self):
        return asdict(self)


class ExecutionAdapter(ABC):
    @abstractmethod
    def place_order(self, order: Order, ts: int) -> Order: ...
    @abstractmethod
    def cancel_order(self, order_id: int, ts: int) -> bool: ...
    @abstractmethod
    def cancel_all(self, symbol: str, ts: int): ...
    @abstractmethod
    def set_leverage(self, symbol: str, leverage: float): ...
    @abstractmethod
    def get_position(self, symbol: str): ...
    @abstractmethod
    def positions(self) -> dict: ...
    @abstractmethod
    def open_orders(self, symbol: str = None) -> list: ...
    @abstractmethod
    def equity(self) -> float: ...
    @abstractmethod
    def available_balance(self) -> float: ...
    @abstractmethod
    def best_bid_ask(self, symbol: str): ...


def next_order_id():
    return next(_ids)

"""The one contract every strategy module fulfils, used by BOTH the backtest engine and the live runner.

All arrays are aligned to bars and describe decisions taken at the CLOSE of bar i (so they may use bars <= i
only). The engine fills them at the OPEN of bar i+1; live, the runner acts on the last CLOSED candle.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np


@dataclass
class Signals:
    side: np.ndarray          # int8: +1 open long / -1 open short / 0 nothing (only acted on when flat)
    exit_long: np.ndarray     # bool: close a long at the next open
    exit_short: np.ndarray    # bool: close a short at the next open
    stop_long: np.ndarray     # stop PRICE for a long opened at the next open (mandatory: NaN = no trade)
    stop_short: np.ndarray
    tp_long: np.ndarray       # take-profit PRICE (limit, maker) or NaN
    tp_short: np.ndarray
    max_hold: np.ndarray      # bars, decided at entry
    units: np.ndarray | None = None   # scale-in: target layer count at close i (1..n_layers), None = single layer
    n_layers: int = 1
    info: dict = field(default_factory=dict)

    @staticmethod
    def empty(n: int) -> "Signals":
        nan = np.full(n, np.nan)
        return Signals(np.zeros(n, np.int8), np.zeros(n, bool), np.zeros(n, bool), nan.copy(), nan.copy(),
                       nan.copy(), nan.copy(), np.zeros(n, np.int64))

    def masked(self, allow: np.ndarray) -> "Signals":
        """Entries only where `allow` (exits untouched): used by the regime router."""
        s = Signals(**{**self.__dict__})
        s.side = np.where(allow, self.side, 0).astype(np.int8)
        return s

"""Strategy plugin interface.

A strategy receives closed candles (no look-ahead) and returns Signals.
Register new classes with @register("name") and select via config.strategy.name.
"""
from dataclasses import dataclass, field

REGISTRY = {}


def register(name):
    def deco(cls):
        cls.name = name
        REGISTRY[name] = cls
        return cls
    return deco


@dataclass
class Signal:
    symbol: str
    action: str                 # OPEN_LONG / OPEN_SHORT / CLOSE
    sl_distance: float = 0.0    # absolute price distance from fill for stop-loss
    tp_distance: float = 0.0    # absolute price distance from fill for take-profit
    leverage: float = 3
    reason: str = ""
    info: dict = field(default_factory=dict)


@dataclass
class Context:
    symbol: str
    ts: int                                  # close time of the bar that just closed (ms)
    candles: dict                            # tf -> dict of numpy arrays (open_time, open, high, low, close, volume)
    position: object = None                  # Position or None


class Strategy:
    name = "base"
    timeframe = "15m"

    def __init__(self, params):
        self.p = params
        self.timeframe = params.get("timeframe", "15m")

    def timeframes(self):
        return [self.timeframe]

    def warmup_bars(self):
        return {self.timeframe: 100}

    def on_bar(self, ctx: Context):
        raise NotImplementedError

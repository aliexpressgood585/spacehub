"""Historical data: Binance USDT-M kline + funding archives (data.binance.vision), as already fetched into
backtest/data by the repo's fetch scripts. Live candles come from execution/exchange.py instead.

Kline CSV columns (Binance): open_time, open, high, low, close, volume, close_time, quote_volume, trades,
taker_buy_base, taker_buy_quote, ignore. Funding CSV: calc_time, interval_hours, rate.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

TF_MS = {"1m": 60_000, "5m": 300_000, "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000}


@dataclass
class Bars:
    symbol: str
    tf: str
    t: np.ndarray       # open time, ms (int64)
    open: np.ndarray
    high: np.ndarray
    low: np.ndarray
    close: np.ndarray
    volume: np.ndarray

    def __len__(self) -> int:
        return len(self.t)

    def slice(self, a: int, b: int) -> "Bars":
        return Bars(self.symbol, self.tf, self.t[a:b], self.open[a:b], self.high[a:b], self.low[a:b], self.close[a:b], self.volume[a:b])

    def to_frame(self) -> pd.DataFrame:
        return pd.DataFrame({"t": self.t, "open": self.open, "high": self.high, "low": self.low, "close": self.close, "volume": self.volume})


def archive_name(symbol: str) -> str:
    return "1000PEPE" if symbol == "PEPE" else symbol


def aggregate(b: Bars, tf: str) -> Bars:
    """UTC-aligned buckets of `tf` from finer bars; only COMPLETE buckets are kept (no partial last bar)."""
    step = TF_MS[tf]
    per = step // TF_MS[b.tf]
    key = b.t // step
    starts = np.flatnonzero(np.concatenate([[True], np.diff(key) != 0]))
    ends = np.append(starts[1:], len(b.t))
    full = (ends - starts == per) & (b.t[starts] % step == 0)
    s, e = starts[full], ends[full] - 1
    return Bars(b.symbol, tf, b.t[s], b.open[s], np.maximum.reduceat(b.high, starts)[full],
                np.minimum.reduceat(b.low, starts)[full], b.close[e], np.add.reduceat(b.volume, starts)[full])


def load_bars(data_dir: str | Path, symbol: str, tf: str) -> Bars:
    p = Path(data_dir) / f"{archive_name(symbol)}-{tf}.csv"
    if tf == "4h" and not p.exists():
        return aggregate(load_bars(data_dir, symbol, "1h"), "4h")
    df = pd.read_csv(p, header=None, usecols=[0, 1, 2, 3, 4, 5], names=["t", "o", "h", "l", "c", "v"],
                     dtype={"t": "int64"}, on_bad_lines="skip")
    df = df.drop_duplicates("t").sort_values("t")
    df = df[(df[["o", "h", "l", "c"]] > 0).all(axis=1)]
    k = 1000.0 if symbol == "PEPE" else 1.0   # prices per ONE coin, same unit as the live bot
    return Bars(symbol, tf, df["t"].to_numpy(np.int64), df["o"].to_numpy(float) / k, df["h"].to_numpy(float) / k,
                df["l"].to_numpy(float) / k, df["c"].to_numpy(float) / k, df["v"].to_numpy(float) * k)


@dataclass
class Funding:
    t: np.ndarray      # settlement time, ms
    rate: np.ndarray   # long pays rate x notional when positive

    def between(self, t0: int, t1: int) -> np.ndarray:
        """Rates of settlements in (t0, t1]."""
        a, b = np.searchsorted(self.t, t0, side="right"), np.searchsorted(self.t, t1, side="right")
        return self.rate[a:b]


def load_funding(data_dir: str | Path, symbol: str) -> Funding:
    p = Path(data_dir) / f"{archive_name(symbol)}-funding.csv"
    if not p.exists():
        return Funding(np.array([], np.int64), np.array([], float))
    df = pd.read_csv(p, header=None, names=["t", "h", "r"], on_bad_lines="skip")
    df = df[pd.to_numeric(df["t"], errors="coerce").notna()].astype({"t": "int64", "r": float}).sort_values("t")
    # settlement stamps in the archive carry a few ms of jitter (e.g. ...000001): snap to the second
    return Funding((df["t"].to_numpy(np.int64) // 1000) * 1000, df["r"].to_numpy(float))

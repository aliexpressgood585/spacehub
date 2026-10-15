"""Market data: bars for 1m/5m/15m/30m/1h, indicators (EMA, ATR, ADX/DMI, daily VWAP, volume profile / value area),
and the live feed (Binance websocket for 1m closes + book ticker, REST for history, funding, open interest, 24h volume).

The SAME `Bars` / `SymbolView` objects and indicator functions feed the live bot and the backtest, so a setup sees
identical numbers in both. All timestamps are bar OPEN times in milliseconds UTC; a bar is used only once CLOSED.
"""
from __future__ import annotations

import asyncio
import json
import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Callable

import numpy as np

log = logging.getLogger("daybot.data")

TF_MS = {"1m": 60_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000, "1h": 3_600_000}
DAY_MS = 86_400_000


# ----------------------------------------------------------------------------------------------- indicators (pure)
def ema(x: np.ndarray, n: int) -> np.ndarray:
    """EMA seeded with the SMA of the first n values (NaN before)."""
    out = np.full(len(x), np.nan)
    if len(x) < n:
        return out
    k = 2.0 / (n + 1)
    out[n - 1] = x[:n].mean()
    for i in range(n, len(x)):
        out[i] = x[i] * k + out[i - 1] * (1 - k)
    return out


def true_range(h: np.ndarray, l: np.ndarray, c: np.ndarray) -> np.ndarray:
    pc = np.concatenate([[c[0]], c[:-1]])
    return np.maximum(h - l, np.maximum(np.abs(h - pc), np.abs(l - pc)))


def atr(h: np.ndarray, l: np.ndarray, c: np.ndarray, n: int = 14) -> np.ndarray:
    """Wilder ATR."""
    tr = true_range(h, l, c)
    out = np.full(len(c), np.nan)
    if len(c) <= n:
        return out
    out[n] = tr[1:n + 1].mean()
    for i in range(n + 1, len(c)):
        out[i] = (out[i - 1] * (n - 1) + tr[i]) / n
    return out


def dmi(h: np.ndarray, l: np.ndarray, c: np.ndarray, n: int = 14) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Wilder +DI, -DI, ADX."""
    N = len(c)
    pdi, mdi, adx = np.full(N, np.nan), np.full(N, np.nan), np.full(N, np.nan)
    if N <= 2 * n:
        return pdi, mdi, adx
    up = np.diff(h, prepend=h[0])
    dn = -np.diff(l, prepend=l[0])
    pdm = np.where((up > dn) & (up > 0), up, 0.0)
    mdm = np.where((dn > up) & (dn > 0), dn, 0.0)
    tr = true_range(h, l, c)
    s_tr, s_p, s_m = tr[1:n + 1].sum(), pdm[1:n + 1].sum(), mdm[1:n + 1].sum()
    dxs: list[float] = []
    a = np.nan
    for i in range(n, N):
        if i > n:
            s_tr = s_tr - s_tr / n + tr[i]
            s_p = s_p - s_p / n + pdm[i]
            s_m = s_m - s_m / n + mdm[i]
        P = 100 * s_p / s_tr if s_tr else 0.0
        M = 100 * s_m / s_tr if s_tr else 0.0
        pdi[i], mdi[i] = P, M
        d = 100 * abs(P - M) / (P + M) if P + M else 0.0
        dxs.append(d)
        if len(dxs) == n:
            a = sum(dxs) / n
        elif len(dxs) > n:
            a = (a * (n - 1) + d) / n
        adx[i] = a
    return pdi, mdi, adx


def rolling_mean(x: np.ndarray, n: int) -> np.ndarray:
    out = np.full(len(x), np.nan)
    if len(x) < n:
        return out
    cs = np.cumsum(np.where(np.isnan(x), 0.0, x))
    cnt = np.cumsum(~np.isnan(x))
    s = cs[n - 1:] - np.concatenate([[0.0], cs[:-n]])
    k = cnt[n - 1:] - np.concatenate([[0], cnt[:-n]])
    out[n - 1:] = np.where(k == n, s / n, np.nan)
    return out


def daily_vwap(t: np.ndarray, h: np.ndarray, l: np.ndarray, c: np.ndarray, v: np.ndarray) -> np.ndarray:
    """VWAP anchored at 00:00 UTC (the Binance daily open)."""
    day = t // DAY_MS
    tp = (h + l + c) / 3
    out = np.empty(len(c))
    pv = vv = 0.0
    cur = None
    for i in range(len(c)):
        if day[i] != cur:
            cur, pv, vv = day[i], 0.0, 0.0
        pv += tp[i] * v[i]
        vv += v[i]
        out[i] = pv / vv if vv else c[i]
    return out


def value_area(h: np.ndarray, l: np.ndarray, v: np.ndarray, bins: int = 50, share: float = 0.70):
    """Volume profile of one session -> (VAL, VAH, POC). Each bar's volume is spread evenly over its price range."""
    if len(h) < 20:
        return None
    lo, hi = float(l.min()), float(h.max())
    w = (hi - lo) / bins or 1e-12
    prof = np.zeros(bins)
    for a_, z_, vol in zip(((l - lo) / w).astype(int), ((h - lo) / w).astype(int), v):
        a_, z_ = max(0, min(bins - 1, a_)), max(0, min(bins - 1, z_))
        prof[a_:z_ + 1] += vol / (z_ - a_ + 1)
    poc = int(prof.argmax())
    a_ = z_ = poc
    acc, tot = prof[poc], prof.sum()
    while acc < share * tot and (a_ > 0 or z_ < bins - 1):
        up = prof[z_ + 1] if z_ < bins - 1 else -1
        dn = prof[a_ - 1] if a_ > 0 else -1
        if up >= dn:
            z_ += 1
            acc += prof[z_]
        else:
            a_ -= 1
            acc += prof[a_]
    return lo + a_ * w, lo + (z_ + 1) * w, lo + (poc + 0.5) * w


# ----------------------------------------------------------------------------------------------- bars
@dataclass
class Bars:
    tf: str
    t: np.ndarray
    o: np.ndarray
    h: np.ndarray
    l: np.ndarray
    c: np.ndarray
    v: np.ndarray
    ind: dict[str, np.ndarray] = field(default_factory=dict)
    va: dict[int, tuple[float, float, float] | None] = field(default_factory=dict)  # UTC day -> PREVIOUS day's VA

    def __len__(self) -> int:
        return len(self.t)

    def last_closed(self, now_ms: int) -> int:
        """Index of the newest bar whose close time is <= now_ms, -1 if none."""
        return int(np.searchsorted(self.t, now_ms - TF_MS[self.tf], side="right")) - 1

    def closed_at(self, now_ms: int) -> int:
        """Index of the bar that closes EXACTLY at now_ms, else -1."""
        i = self.last_closed(now_ms)
        return i if i >= 0 and self.t[i] + TF_MS[self.tf] == now_ms else -1


def aggregate(b1: Bars, tf: str) -> Bars:
    """Complete higher-timeframe buckets from 1m bars (incomplete buckets are dropped)."""
    if tf == "1m":
        return b1
    step = TF_MS[tf]
    k = step // 60_000
    bucket = b1.t // step
    starts = np.flatnonzero(np.concatenate([[True], bucket[1:] != bucket[:-1]]))
    ends = np.concatenate([starts[1:], [len(b1.t)]])
    full = (ends - starts == k) & (b1.t[ends - 1] - b1.t[starts] == (k - 1) * 60_000)
    s, e = starts[full], ends[full]
    return Bars(
        tf,
        bucket[s] * step,
        b1.o[s],
        np.maximum.reduceat(b1.h, starts)[full],
        np.minimum.reduceat(b1.l, starts)[full],
        b1.c[e - 1],
        np.add.reduceat(b1.v, starts)[full],
    )


def add_indicators(b: Bars) -> Bars:
    """Everything the filters and setups read, computed once per series."""
    b.ind["ema20"] = ema(b.c, 20)
    b.ind["ema50"] = ema(b.c, 50)
    b.ind["atr"] = atr(b.h, b.l, b.c, 14)
    b.ind["atr_avg"] = rolling_mean(b.ind["atr"], 100)
    b.ind["pdi"], b.ind["mdi"], b.ind["adx"] = dmi(b.h, b.l, b.c, 14)
    b.ind["vwap"] = daily_vwap(b.t, b.h, b.l, b.c, b.v)
    return b


def add_value_areas(b: Bars) -> Bars:
    """b.va[d] = value area of UTC day d-1 (what S5 compares day d's open to)."""
    day = b.t // DAY_MS
    days = np.unique(day)
    prev = None
    for d in days:
        b.va[int(d)] = prev
        m = day == d
        prev = value_area(b.h[m], b.l[m], b.v[m]) if m.sum() >= 20 else None
    return b


def prepare(b1m: Bars, tfs=("5m", "15m", "30m", "1h")) -> dict[str, Bars]:
    out = {"1m": b1m}
    for tf in tfs:
        out[tf] = add_indicators(aggregate(b1m, tf))
    add_value_areas(out["15m"])
    out["30m"].va = out["15m"].va
    return out


def from_rows(tf: str, rows: list[list[float]]) -> Bars:
    """ccxt OHLCV rows [t, o, h, l, c, base_volume] -> Bars (volume kept as BASE units x close ~ quote)."""
    a = np.asarray(rows, dtype=float).reshape(-1, 6)
    return Bars(tf, a[:, 0].astype(np.int64), a[:, 1], a[:, 2], a[:, 3], a[:, 4], a[:, 5] * a[:, 4])


@dataclass
class SymbolView:
    """Everything known about one symbol at decision time `now_ms` (a 1m close)."""
    sym: str
    now_ms: int
    bars: dict[str, Bars]
    funding: float | None = None       # current/predicted funding rate (fraction per 8h)
    open_interest: float | None = None  # informational
    volume_24h: float | None = None     # quote volume, USDT
    spread: float | None = None         # (ask - bid) / mid
    bid: float | None = None
    ask: float | None = None
    data_ts: float | None = None        # epoch seconds of the freshest market data

    def i(self, tf: str) -> int:
        return self.bars[tf].last_closed(self.now_ms)


# ----------------------------------------------------------------------------------------------- live feed
WS_URL = {"live": "wss://fstream.binance.com/stream?streams=", "demo": "wss://fstream.binance.com/stream?streams=",
          "testnet": "wss://stream.binancefuture.com/stream?streams="}


class LiveFeed:
    """Websocket thread: 1m kline closes (wakes the main loop) + best bid/ask per symbol.
    REST (ccxt) supplies the bar history; this only adds timeliness. If the socket dies, `healthy()` turns False and the
    main loop falls back to a timer and REST, and opens no new trades until data is fresh again."""

    def __init__(self, mode: str, symbols: list[str], on_close: Callable[[str, int], None] | None = None):
        self.url = WS_URL[mode] + "/".join(f"{s.lower()}usdt@kline_1m/{s.lower()}usdt@bookTicker" for s in symbols)
        self.book: dict[str, tuple[float, float, float]] = {}  # sym -> (bid, ask, epoch s)
        self.last_msg = 0.0
        self.on_close = on_close
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name="ws", daemon=True)

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def healthy(self, max_age_s: float = 30.0) -> bool:
        return time.time() - self.last_msg < max_age_s

    def _run(self) -> None:
        asyncio.run(self._loop())

    async def _loop(self) -> None:
        import websockets  # imported here so the backtest does not need it

        backoff = 1
        while not self._stop.is_set():
            try:
                async with websockets.connect(self.url, ping_interval=20, ping_timeout=20, max_size=2**22) as ws:
                    backoff = 1
                    log.info("websocket connected")
                    while not self._stop.is_set():
                        msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=60))
                        self.last_msg = time.time()
                        d = msg.get("data", {})
                        if d.get("e") == "bookTicker":
                            self.book[d["s"][:-4]] = (float(d["b"]), float(d["a"]), time.time())
                        elif d.get("e") == "kline" and d["k"]["x"] and self.on_close:
                            self.on_close(d["s"][:-4], int(d["k"]["t"]) + 60_000)
            except Exception as e:  # reconnect with capped backoff; entries pause meanwhile (healthy() is False)
                log.warning("websocket error: %s (reconnect in %ss)", e, backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 60)


class MarketData:
    """REST side of the live feed. History limits are sized so every indicator is warm (EMA50 on 1h, ATR avg 100,
    yesterday's value area on 15m)."""

    LIMITS = {"1m": 120, "5m": 400, "15m": 400, "30m": 300, "1h": 400}

    def __init__(self, exchange, feed: LiveFeed | None, symbols: list[str]):
        self.ex = exchange
        self.feed = feed
        self.symbols = symbols
        self.cache: dict[tuple[str, str], Bars] = {}
        self.funding: dict[str, float] = {}
        self.volume: dict[str, float] = {}
        self.oi: dict[str, float] = {}
        self.last_ok = 0.0

    @staticmethod
    def market(sym: str) -> str:
        return f"{sym}/USDT:USDT"

    def _bars(self, sym: str, tf: str, now_ms: int) -> Bars:
        key = (sym, tf)
        old = self.cache.get(key)
        newest = (now_ms // TF_MS[tf]) * TF_MS[tf] - TF_MS[tf]  # open time of the newest bar that has closed
        if old is not None and len(old) and old.t[-1] >= newest:
            return old  # no new closed bar of this timeframe since the last fetch
        rows = self.ex.fetch_ohlcv(self.market(sym), tf, limit=self.LIMITS[tf])
        rows = [r for r in rows if r[0] + TF_MS[tf] <= now_ms]  # drop the forming bar
        b = from_rows(tf, rows)
        if tf != "1m":
            add_indicators(b)
        self.cache[key] = b
        return b

    def refresh_slow(self) -> None:
        """Funding, 24h volume (one call each for all symbols), open interest. Called every minute."""
        mk = [self.market(s) for s in self.symbols]
        fr = self.ex.fetch_funding_rates(mk)
        self.funding = {s: float(fr[m]["fundingRate"]) for s, m in zip(self.symbols, mk) if m in fr and fr[m].get("fundingRate") is not None}
        tk = self.ex.fetch_tickers(mk)
        self.volume = {s: float(tk[m].get("quoteVolume") or 0) for s, m in zip(self.symbols, mk) if m in tk}

    def view(self, sym: str, now_ms: int) -> SymbolView:
        bars = {tf: self._bars(sym, tf, now_ms) for tf in ("1m", "5m", "15m", "30m", "1h")}
        add_value_areas(bars["15m"])
        bars["30m"].va = bars["15m"].va
        bid = ask = None
        ts = None
        if self.feed and sym in self.feed.book:
            bid, ask, ts = self.feed.book[sym]
        if bid is None or (ts is not None and time.time() - ts > 30):
            ob = self.ex.fetch_order_book(self.market(sym), limit=5)
            bid, ask, ts = ob["bids"][0][0], ob["asks"][0][0], time.time()
        mid = (bid + ask) / 2
        self.last_ok = time.time()
        return SymbolView(sym, now_ms, bars, self.funding.get(sym), self.oi.get(sym), self.volume.get(sym),
                          (ask - bid) / mid if mid else None, bid, ask, ts)

"""Part B filters F1-F7. Each check answers allowed / blocked + the reason. Unknown data counts as BLOCKED
(live). The backtest passes `assume_liquid=True` only for F4 and freshness, because the public archive has no
historical order book or 24h-volume snapshot (said in the backtest report)."""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from datetime import datetime
from zoneinfo import ZoneInfo

import numpy as np

from .data import SymbolView
from .setups import Candidate, _hm


@dataclass
class Check:
    name: str
    ok: bool
    detail: str = ""


@dataclass
class Verdict:
    ok: bool
    checks: list[Check] = field(default_factory=list)
    night: bool = False
    size_mult: float = 1.0
    max_cost_r: float = 0.2

    @property
    def reason(self) -> str:
        bad = [c for c in self.checks if not c.ok]
        return f"{bad[0].name}: {bad[0].detail}" if bad else "ok"


def is_night(now_ms: int, cfg) -> bool:
    """F1: 00:00-10:00 Israel time, or a weekend day."""
    n = cfg["night"]
    loc = datetime.fromtimestamp(now_ms / 1000, ZoneInfo(cfg["timezone"]))
    if loc.weekday() in n["weekend_days"]:
        return True
    a, z = _hm(n["start"]), _hm(n["end"])
    t = loc.time()
    return (a <= t < z) if a < z else (t >= a or t < z)


_EVENTS_CACHE: dict[int, list[tuple[float, str]]] = {}


def news_events(cfg) -> list[tuple[float, str]]:
    key = id(cfg["news_events"])
    if key not in _EVENTS_CACHE:
        evs = []
        for e in cfg["news_events"] or []:
            evs.append((datetime.fromisoformat(str(e["time"])).timestamp(), str(e["name"])))
        _EVENTS_CACHE[key] = sorted(evs)
    return _EVENTS_CACHE[key]


def news_block(now_ms: int, cfg) -> str | None:
    w = cfg["filters"]["news_window_min"] * 60
    now = now_ms / 1000
    for ts, name in news_events(cfg):
        if ts - w <= now <= ts + w:
            return name
    return None


def calendar_is_stale(now_ms: int, cfg, horizon_days: int = 45) -> bool:
    """True when no event is listed in the coming `horizon_days`: the list needs maintenance (warned, not traded on)."""
    now = now_ms / 1000
    return not any(now <= ts <= now + horizon_days * 86400 for ts, _ in news_events(cfg))


def trend_dir(b, i: int, key: str = "ema50") -> int:
    if i < 0 or not np.isfinite(b.ind[key][i]):
        return 0
    return 1 if b.c[i] > b.ind[key][i] else -1


def check(c: Candidate, v: SymbolView, btc: SymbolView | None, cfg, *, assume_liquid: bool = False) -> Verdict:
    f, n = cfg["filters"], cfg["night"]
    night = is_night(v.now_ms, cfg)
    out: list[Check] = []

    # F1 session / night mode
    if night:
        out.append(Check("F1", v.sym in n["coins"] and c.setup in n["setups"],
                         f"night/weekend: only {','.join(n['coins'])} and {','.join(n['setups'])}"))
    else:
        out.append(Check("F1", True, "day"))

    # F2 news
    ev = news_block(v.now_ms, cfg)
    out.append(Check("F2", ev is None, f"within {f['news_window_min']} min of {ev}" if ev else "no event"))

    # F3 BTC 15m direction (alts only)
    if v.sym == "BTC":
        out.append(Check("F3", True, "BTC itself"))
    else:
        bd = trend_dir(btc.bars["15m"], btc.bars["15m"].last_closed(v.now_ms)) if btc else 0
        out.append(Check("F3", bd == c.side, f"BTC 15m {'up' if bd > 0 else 'down' if bd < 0 else 'unknown'}"))

    # F4 liquidity
    if assume_liquid:
        out.append(Check("F4", True, "backtest: fixed liquid list"))
    else:
        ok = v.volume_24h is not None and v.spread is not None and v.volume_24h >= f["min_volume_24h_usd"] and v.spread <= f["max_spread"]
        out.append(Check("F4", ok, f"vol24 {v.volume_24h and round(v.volume_24h / 1e6)}M, spread {v.spread and round(v.spread * 1e4, 2)}bp"))

    # F5 volatility: ATR(14) 15m vs its 100-bar average (night: must be ABOVE the average)
    q = v.bars["15m"]
    j = q.last_closed(v.now_ms)
    a, avg = (q.ind["atr"][j], q.ind["atr_avg"][j]) if j >= 0 else (np.nan, np.nan)
    ratio = a / avg if np.isfinite(a) and np.isfinite(avg) and avg > 0 else np.nan
    need = n["atr_vs_avg"] if night else f["atr_vs_avg"]
    ok5 = bool(np.isfinite(ratio) and (ratio > need if night else ratio >= need))
    out.append(Check("F5", ok5, f"ATR/avg {ratio:.2f} (need {'>' if night else '>='}{need})"))

    # F6 funding
    fr = v.funding
    if fr is None:
        out.append(Check("F6", False, "funding unknown"))
    else:
        bad = (c.side > 0 and fr > f["funding_max"]) or (c.side < 0 and fr < -f["funding_max"])
        out.append(Check("F6", not bad, f"funding {fr * 100:.4f}%"))

    # F7 timeframe ladder: 1h direction (EMA50), 5m confirmation (close in direction and beyond the 5m EMA20)
    h = v.bars["1h"]
    hd = trend_dir(h, h.last_closed(v.now_ms))
    out.append(Check("F7-1h", hd == c.side, f"1h {'up' if hd > 0 else 'down' if hd < 0 else 'unknown'}"))
    m5 = v.bars["5m"]
    k = m5.last_closed(v.now_ms)
    conf = k >= 0 and np.isfinite(m5.ind["ema20"][k]) and (
        (c.side > 0 and m5.c[k] > m5.o[k] and m5.c[k] > m5.ind["ema20"][k]) or
        (c.side < 0 and m5.c[k] < m5.o[k] and m5.c[k] < m5.ind["ema20"][k]))
    out.append(Check("F7-5m", bool(conf), "5m confirmation"))

    # data freshness (live)
    if not assume_liquid:
        age = None if v.data_ts is None else time.time() - v.data_ts
        out.append(Check("DATA", age is not None and age <= f["data_max_age_s"], f"age {age and round(age)}s"))

    return Verdict(all(x.ok for x in out), out, night,
                   n["size_mult"] if night else 1.0,
                   n["max_cost_r"] if night else cfg["costs"]["max_cost_r"])

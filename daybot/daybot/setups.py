"""S1-S6 as exact rules. A setup is evaluated only on the close of its own timeframe bar and returns candidates:
direction, entry trigger, stop (always from 15m structure) and targets. No discretion anywhere.

Where the brief leaves a choice open, the rule picked is written next to the code:
  * structure stops sit 0.05 x ATR(14, 15m) beyond the extreme (S2: 0.1 x ATR, as the brief says);
  * a setup without a structural target (S3, S4, S6) aims at costs.default_target_r (2R);
  * S3 is a breakout entry: it arms at the 5m signal bar and needs a 1m close beyond that bar's extreme within the next
    two 5m bars; the order is still a post-only limit at that 1m close (never a market chase);
  * day boundaries for VWAP and the value area are 00:00 UTC (the Binance daily open); S6 uses Israel time.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, time as dtime
from zoneinfo import ZoneInfo

import numpy as np

from .data import DAY_MS, TF_MS, SymbolView

LONG, SHORT = 1, -1


@dataclass
class Candidate:
    sym: str
    setup: str
    side: int                      # +1 long / -1 short
    tf: str                        # the setup's own timeframe (time exit counts these bars)
    bar_t: int                     # open time of the signal bar
    stop: float
    targets: list[tuple[float, float]] = field(default_factory=list)  # (price, fraction); empty -> default R
    trigger: float | None = None   # breakout level that a 1m close must cross before the entry is placed
    arm_until: int = 0             # ms; the trigger expires after this
    note: str = ""

    @property
    def key(self) -> str:
        return f"{self.sym}|{self.setup}|{self.side}|{self.bar_t}"


def _buf(v: SymbolView, k: float) -> float:
    b = v.bars["15m"]
    i = b.last_closed(v.now_ms)
    a = b.ind["atr"][i] if i >= 0 else np.nan
    return k * a if np.isfinite(a) else np.nan


def s1_holy_grail(v: SymbolView, cfg) -> list[Candidate]:
    """ADX(14) 15m > 30, the bar touches EMA20 and closes back on the trend side in the trend direction.
    Stop beyond the pullback extreme (from the 20-bar swing to now). Target = that swing extreme."""
    b = v.bars["15m"]
    i = b.closed_at(v.now_ms)
    if i < 120 or not b.ind["adx"][i] > 30:
        return []
    e20, buf = b.ind["ema20"][i], _buf(v, 0.05)
    out = []
    if b.ind["pdi"][i] > b.ind["mdi"][i] and b.l[i] <= e20 < b.c[i] and b.c[i] > b.o[i]:
        k = i - 20 + int(np.argmax(b.h[i - 20:i]))
        out.append(Candidate(v.sym, "S1", LONG, "15m", int(b.t[i]), float(b.l[k:i + 1].min() - buf), [(float(b.h[k]), 1.0)], note="Holy Grail"))
    if b.ind["mdi"][i] > b.ind["pdi"][i] and b.h[i] >= e20 > b.c[i] and b.c[i] < b.o[i]:
        k = i - 20 + int(np.argmin(b.l[i - 20:i]))
        out.append(Candidate(v.sym, "S1", SHORT, "15m", int(b.t[i]), float(b.h[k:i + 1].max() + buf), [(float(b.l[k]), 1.0)], note="Holy Grail"))
    return out


def s2_turtle_soup(v: SymbolView, cfg) -> list[Candidate]:
    """The 20-bar 15m low/high (bars before the break) is broken by this bar or the previous one, and this bar closes back
    inside. Trade the other way; stop = break extreme + 0.1 x ATR; targets: half at mid-range, half at the far side."""
    b = v.bars["15m"]
    i = b.closed_at(v.now_ms)
    if i < 120:
        return []
    L, H = b.l[i - 21:i - 1].min(), b.h[i - 21:i - 1].max()
    mid, buf = (L + H) / 2, _buf(v, 0.1)
    lo2, hi2 = min(b.l[i - 1], b.l[i]), max(b.h[i - 1], b.h[i])
    out = []
    if lo2 < L < b.c[i]:
        out.append(Candidate(v.sym, "S2", LONG, "15m", int(b.t[i]), float(lo2 - buf), [(float(mid), 0.5), (float(H), 0.5)], note="Turtle Soup"))
    if hi2 > H > b.c[i]:
        out.append(Candidate(v.sym, "S2", SHORT, "15m", int(b.t[i]), float(hi2 + buf), [(float(mid), 0.5), (float(L), 0.5)], note="Turtle Soup"))
    return out


def s3_second_entry(v: SymbolView, cfg) -> list[Candidate]:
    """5m trend (close beyond EMA20, EMA20 sloping over 5 bars). Pullback from the 10-bar extreme; counter-trend legs are
    counted; this bar is the SECOND time price pushes back with the trend (H2 / L2). Entry on a break of this bar.
    Stop = 15m structure (extreme of the last 4 closed 15m bars)."""
    b = v.bars["5m"]
    i = b.closed_at(v.now_ms)
    if i < 120:
        return []
    e = b.ind["ema20"]
    q = v.bars["15m"]
    j = q.last_closed(v.now_ms)
    buf = _buf(v, 0.05)
    out = []
    arm = v.now_ms + 2 * TF_MS["5m"]
    if b.c[i] > e[i] > e[i - 5]:
        ph = i - 10 + int(np.argmax(b.h[i - 10:i]))
        legs = [k for k in range(ph + 1, i + 1) if b.h[k] > b.h[k - 1]]
        if ph < i - 1 and len(legs) == 2 and legs[-1] == i:
            out.append(Candidate(v.sym, "S3", LONG, "5m", int(b.t[i]), float(q.l[j - 3:j + 1].min() - buf), [], float(b.h[i]), arm, "Second Entry (H2)"))
    if b.c[i] < e[i] < e[i - 5]:
        pl = i - 10 + int(np.argmin(b.l[i - 10:i]))
        legs = [k for k in range(pl + 1, i + 1) if b.l[k] < b.l[k - 1]]
        if pl < i - 1 and len(legs) == 2 and legs[-1] == i:
            out.append(Candidate(v.sym, "S3", SHORT, "5m", int(b.t[i]), float(q.h[j - 3:j + 1].max() + buf), [], float(b.l[i]), arm, "Second Entry (L2)"))
    return out


def s4_vwap_reclaim(v: SymbolView, cfg) -> list[Candidate]:
    """A 15m close crossed the daily VWAP within the last 4 bars (same UTC day); this bar re-tests VWAP (within 0.1%) and
    holds: closes on the reclaimed side in the trade direction. Stop beyond the extreme since the cross."""
    b = v.bars["15m"]
    i = b.closed_at(v.now_ms)
    if i < 120:
        return []
    w, buf = b.ind["vwap"], _buf(v, 0.05)
    d0 = b.t[i] // DAY_MS
    for j in range(i - 4, i):
        if b.t[j - 1] // DAY_MS != d0:
            continue
        if b.c[j - 1] < w[j - 1] and b.c[j] > w[j] and b.l[i] <= w[i] * 1.001 and b.c[i] > w[i] and b.c[i] > b.o[i]:
            return [Candidate(v.sym, "S4", LONG, "15m", int(b.t[i]), float(b.l[j:i + 1].min() - buf), note="VWAP Reclaim")]
        if b.c[j - 1] > w[j - 1] and b.c[j] < w[j] and b.h[i] >= w[i] * 0.999 and b.c[i] < w[i] and b.c[i] < b.o[i]:
            return [Candidate(v.sym, "S4", SHORT, "15m", int(b.t[i]), float(b.h[j:i + 1].max() + buf), note="VWAP Reclaim")]
    return []


def s5_eighty_percent(v: SymbolView, cfg) -> list[Candidate]:
    """Today opened outside yesterday's value area; two consecutive 30m closes back inside (first time today)
    -> target the other edge. Stop beyond today's extreme (15m structure)."""
    b = v.bars["30m"]
    i = b.closed_at(v.now_ms)
    if i < 50:
        return []
    d0 = int(b.t[i] // DAY_MS)
    va = b.va.get(d0)
    if not va:
        return []
    val, vah, _ = va
    s = i
    while s > 0 and b.t[s - 1] // DAY_MS == d0:
        s -= 1
    if s == i or b.t[s] != d0 * DAY_MS:
        return []  # need the day's first bar to know the open
    inside = (b.c[s:i + 1] > val) & (b.c[s:i + 1] < vah)
    pairs = inside[1:] & inside[:-1]
    if not (len(pairs) and pairs[-1] and pairs.sum() == 1):
        return []
    buf = _buf(v, 0.05)
    op = b.o[s]
    if op > vah:
        return [Candidate(v.sym, "S5", SHORT, "30m", int(b.t[i]), float(b.h[s:i + 1].max() + buf), [(float(val), 1.0)], note="80% rule")]
    if op < val:
        return [Candidate(v.sym, "S5", LONG, "30m", int(b.t[i]), float(b.l[s:i + 1].min() - buf), [(float(vah), 1.0)], note="80% rule")]
    return []


def _hm(s: str) -> dtime:
    h, m = s.split(":")
    return dtime(int(h), int(m))


def s6_orb(v: SymbolView, cfg) -> list[Candidate]:
    """Opening range = 15m bars between orb_start and orb_end Israel time. After orb_end and until orb_last_entry, the
    FIRST 15m close outside the range is the signal (the 1h direction filter decides whether it may be taken).
    Stop = the middle of the range."""
    b = v.bars["15m"]
    i = b.closed_at(v.now_ms)
    if i < 120:
        return []
    tz = ZoneInfo(cfg["timezone"])
    st = cfg["setups"]
    close_local = datetime.fromtimestamp(v.now_ms / 1000, tz)
    a_t, z_t, last = _hm(st["orb_start"]), _hm(st["orb_end"]), _hm(st["orb_last_entry"])
    if not (z_t < close_local.time() <= last):
        return []
    day = close_local.date()
    a_ms = int(datetime.combine(day, a_t, tz).timestamp() * 1000)
    z_ms = int(datetime.combine(day, z_t, tz).timestamp() * 1000)
    m = (b.t >= a_ms) & (b.t < z_ms)
    rng = np.flatnonzero(m)
    if len(rng) != (z_ms - a_ms) // TF_MS["15m"]:
        return []
    H, L = b.h[rng].max(), b.l[rng].min()
    after = np.arange(rng[-1] + 1, i)
    if len(after) and ((b.c[after] > H) | (b.c[after] < L)).any():
        return []  # not the first close outside
    mid = (H + L) / 2
    if b.c[i] > H:
        return [Candidate(v.sym, "S6", LONG, "15m", int(b.t[i]), float(mid), note="ORB")]
    if b.c[i] < L:
        return [Candidate(v.sym, "S6", SHORT, "15m", int(b.t[i]), float(mid), note="ORB")]
    return []


SETUP_FUNCS = {"S1": s1_holy_grail, "S2": s2_turtle_soup, "S3": s3_second_entry,
               "S4": s4_vwap_reclaim, "S5": s5_eighty_percent, "S6": s6_orb}
SETUP_TF = {"S1": "15m", "S2": "15m", "S3": "5m", "S4": "15m", "S5": "30m", "S6": "15m"}  # fixed by the rules above


def check_config_tfs(cfg) -> list[str]:
    return [f"setups.{s}.tf is {cfg['setups'][s]['tf']}, the rule is written for {tf}"
            for s, tf in SETUP_TF.items() if cfg["setups"][s]["tf"] != tf]


def find_candidates(v: SymbolView, cfg, allowed: set[str]) -> list[Candidate]:
    """Every allowed setup whose own timeframe bar closed exactly at v.now_ms."""
    out: list[Candidate] = []
    for name in sorted(allowed):
        tf = SETUP_TF[name]
        if v.now_ms % TF_MS[tf]:
            continue
        cands = SETUP_FUNCS[name](v, cfg)
        out.extend(c for c in cands if np.isfinite(c.stop))
    return out

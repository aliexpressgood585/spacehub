"""Replay closed 1m candles through the paper exchange (SL / TP / liquidation / funding).

Used by the scheduled runner to catch up the gap since the previous cycle.
No network and no strategy code: the caller passes already-fetched bars and an engine.
"""
from .clock import bar_path

# Half of a 1bp spread. Matches the live catch-up in the original runner and the
# backtest's assumed book when no historical bid/ask exists.
HALF_SPREAD = 0.5e-4


def apply_ohlc_path(ex, si, symbol, o, h, l, c, mark_ohlc, ts):
    """Walk one candle's high/low through the paper book. `mark_ohlc` is (o,h,l,c) or None."""
    path = bar_path(float(o), float(h), float(l), float(c))
    mpath = bar_path(*(float(x) for x in mark_ohlc)) if mark_ohlc else list(path)
    for i, (p, mk) in enumerate(zip(path, mpath)):
        hs = max(si.tick_size / 2.0, abs(p) * HALF_SPREAD)
        ex.update_market(symbol, int(ts) + i * 15_000, bid=p - hs, ask=p + hs, last=p, mark=mk)


def _fnum(v):
    if v is None or v == "":
        return None
    return float(v)


def replay_minutes(ex, eng, symbols, minutes, bars_1m, marks_1m, bars_15m, bars_1h,
                   funding, funding_done, last_15m_open, bars_4h=None, bars_1d=None,
                   strategy_tf="15m", last_signal_open=None):
    """Replay fully closed 1-minute opens in `minutes` (oldest first).

    bars_*: symbol -> {open_time: (open_time, o, h, l, c, v, close_time)}
    marks_1m: symbol -> {open_time: (o, h, l, c)}
    funding: symbol -> [{fundingTime, fundingRate, markPrice}] sorted by time
    funding_done: symbol -> last applied funding time (mutated)

    strategy_tf "15m" (default) keeps the original clock: 1h bars are stored and
    the strategy runs on each closed 15m bar. "1h" runs the strategy on each
    closed 1h bar, after that boundary's 1d and 4h bars are stored, and does not
    evaluate 15m. `last_signal_open` is the last 1h open already signaled.
    """
    prev_traverse = ex.traverse_fill
    ex.traverse_fill = True
    degraded = set()
    evaluated = 0
    evaluated_1h = 0
    funded = 0
    minute_set = set(minutes)
    seen_1m = {s: False for s in symbols}
    fi = {s: 0 for s in symbols}
    bars_4h = bars_4h or {}
    bars_1d = bars_1d or {}
    try:
        for t in minutes:
            boundary = t + 60_000
            for s in symbols:
                row = bars_1m.get(s, {}).get(t)
                if row:
                    mk = marks_1m.get(s, {}).get(t)
                    apply_ohlc_path(ex, ex.si[s], s, row[1], row[2], row[3], row[4], mk, t)
                    seen_1m[s] = True
                else:
                    degraded.add(s)
                evs = funding.get(s) or []
                i = fi[s]
                while i < len(evs) and int(evs[i]["fundingTime"]) <= boundary:
                    f = evs[i]
                    ft = int(f["fundingTime"])
                    if ft <= t or ft <= int(funding_done.get(s, 0)):
                        i += 1
                        continue
                    mpx = _fnum(f.get("markPrice")) or ex.mark(s)
                    if not mpx:
                        break  # no price yet; the next minute retries this settlement
                    ex.apply_funding(s, float(f["fundingRate"]), mpx, ft)
                    funding_done[s] = ft
                    funded += 1
                    i += 1
                fi[s] = i
            if strategy_tf == "1h":
                if boundary % 86_400_000 == 0 and eng is not None:
                    dopen = boundary - 86_400_000
                    for s in symbols:
                        row = bars_1d.get(s, {}).get(dopen)
                        if row:
                            eng.on_bar_closed(s, "1d", row, run_strategy=False)
                        else:
                            degraded.add(s)
                if boundary % 14_400_000 == 0 and eng is not None:
                    fopen = boundary - 14_400_000
                    for s in symbols:
                        row = bars_4h.get(s, {}).get(fopen)
                        if row:
                            eng.on_bar_closed(s, "4h", row, run_strategy=False)
                        else:
                            degraded.add(s)
                if boundary % 3_600_000 == 0:
                    hopen = boundary - 3_600_000
                    if last_signal_open is None or hopen > last_signal_open:
                        for s in symbols:
                            row = bars_1h.get(s, {}).get(hopen)
                            if not row:
                                degraded.add(s)
                                continue
                            if eng is not None:
                                eng.on_bar_closed(s, "1h", row, run_strategy=True)
                                evaluated_1h += 1
                        last_signal_open = hopen
                if boundary % 900_000 == 0:
                    last_15m_open = boundary - 900_000
                    seen_1m = {s: False for s in symbols}
            else:
                if boundary % 3_600_000 == 0 and eng is not None:
                    hopen = boundary - 3_600_000
                    for s in symbols:
                        row = bars_1h.get(s, {}).get(hopen)
                        if row:
                            eng.on_bar_closed(s, "1h", row, run_strategy=False)
                if boundary % 900_000 == 0:
                    bopen = boundary - 900_000
                    if last_15m_open is None or bopen > last_15m_open:
                        for s in symbols:
                            row = bars_15m.get(s, {}).get(bopen)
                            if not row:
                                degraded.add(s)
                                continue
                            if bopen in minute_set and not seen_1m[s]:
                                apply_ohlc_path(ex, ex.si[s], s, row[1], row[2], row[3], row[4], None, bopen)
                            if eng is not None:
                                eng.on_bar_closed(s, "15m", row, run_strategy=True)
                                evaluated += 1
                        last_15m_open = bopen
                    seen_1m = {s: False for s in symbols}
    finally:
        ex.traverse_fill = prev_traverse
    return {"last_15m_open": last_15m_open, "last_signal_open": last_signal_open,
            "minutes": len(minutes), "evaluated_15m": evaluated, "evaluated_1h": evaluated_1h,
            "degraded": sorted(degraded), "funding_applied": funded}

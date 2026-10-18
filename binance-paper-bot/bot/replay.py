"""Replay closed 1m candles through the paper exchange (SL / TP / liquidation / funding).

Used by the scheduled runner to catch up the gap since the previous cycle.
No network and no strategy code: the caller passes already-fetched bars and an engine.
"""
from .clock import bar_path
from .execution.base import Order

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


def _has_tf(eng, tf):
    """True only for a real engine that keeps this timeframe. Test doubles do not."""
    candles = getattr(eng, "candles", None)
    if not candles:
        return False
    return any(tf in (bufs or {}) for bufs in candles.values())


def _time_exit_at_open(ex, symbol, row, t):
    """Market-close at this minute's open when it is the position's time exit.

    The research simulator checks the time exit before that minute's stop. The
    book is set to the open without walking highs and lows first.
    """
    p = ex.get_position(symbol)
    if p is None:
        return False
    ets = (p.meta or {}).get("exit_ts")
    if ets is None or int(ets) != int(t):
        return False
    if int(p.opened_ts) >= int(t):
        return False
    o = float(row[1])
    si = ex.si[symbol]
    hs = max(si.tick_size / 2.0, abs(o) * HALF_SPREAD)
    m = ex.mkt[symbol]
    m.prev_last, m.prev_mark = o, o
    m.bid, m.ask, m.last, m.mark = o - hs, o + hs, o, o
    m.ts = int(t)
    side = "SELL" if p.side > 0 else "BUY"
    ex.place_order(Order(symbol, side, "MARKET", p.qty, reduce_only=True, tag="TIME"), int(t))
    return True


def _store_bar(eng, symbol, tf, row, run_strategy):
    if eng is None or row is None:
        return False
    if not _has_tf(eng, tf):
        return False
    eng.on_bar_closed(symbol, tf, row, run_strategy=run_strategy)
    return True


# A 1h close is acted on only after this lag, so the minute loop can watch stops
# first and the strategy cycle runs a couple of minutes after the hour.
STRATEGY_LAG_MS = 120_000


def replay_minutes(ex, eng, symbols, minutes, bars_1m, marks_1m, bars_15m, bars_1h,
                   funding, funding_done, last_15m_open, bars_4h=None, bars_1d=None,
                   strategy_tf="15m", last_signal_open=None, strategy_ready_at=None,
                   strategy_lag_ms=STRATEGY_LAG_MS, on_minute=None):
    """Replay fully closed 1-minute opens in `minutes` (oldest first).

    bars_*: symbol -> {open_time: (open_time, o, h, l, c, v, close_time)}
    marks_1m: symbol -> {open_time: (o, h, l, c)}
    funding: symbol -> [{fundingTime, fundingRate, markPrice}] sorted by time
    funding_done: symbol -> last applied funding time (mutated)

    strategy_tf "15m" (default) keeps the original clock: 1h bars are stored and
    the strategy runs on each closed 15m bar. "1h" runs the 1h strategy on each
    closed 1h bar, after that boundary's 1d and 4h bars are stored. A 15m
    strategy also runs on that path when the engine actually buffers 15m bars.
    "stops" walks 1m highs/lows, funding and liquidation; it runs a 15m strategy
    only when the engine buffers 15m and the minute closes a 15m bar.
    `last_signal_open` is the last 1h open already signaled. When
    `strategy_ready_at` is set, a 1h close is not signaled until that timestamp
    is at least `strategy_lag_ms` past the close (the minute is still walked).
    `on_minute(open_ts)`, when set, runs after that minute's stops and marks
    and before the strategy bar. The manual basket uses it.
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
        if minutes:
            t0 = int(minutes[0])
            for s in symbols:
                p = ex.get_position(s)
                ets = (p.meta or {}).get("exit_ts") if p is not None else None
                if ets is None or int(p.opened_ts) >= int(ets) or int(ets) >= t0:
                    continue
                row = (bars_1m.get(s) or {}).get(int(ets)) or (bars_1m.get(s) or {}).get(t0)
                if row:
                    _time_exit_at_open(ex, s, row, int(ets))
        for t in minutes:
            boundary = t + 60_000
            for s in symbols:
                row = bars_1m.get(s, {}).get(t)
                if row:
                    _time_exit_at_open(ex, s, row, t)
                    mk = marks_1m.get(s, {}).get(t)
                    apply_ohlc_path(ex, ex.si[s], s, row[1], row[2], row[3], row[4], mk, t)
                    seen_1m[s] = True
                    _store_bar(eng, s, "1m", row, False)
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
            if on_minute is not None:
                on_minute(int(t))
            if strategy_tf == "stops":
                if _has_tf(eng, "15m") or _has_tf(eng, "1h") or _has_tf(eng, "4h") or _has_tf(eng, "1d"):
                    if boundary % 86_400_000 == 0:
                        dopen = boundary - 86_400_000
                        for s in symbols:
                            row = bars_1d.get(s, {}).get(dopen)
                            if row:
                                _store_bar(eng, s, "1d", row, False)
                            elif _has_tf(eng, "1d"):
                                degraded.add(s)
                    if boundary % 14_400_000 == 0:
                        fopen = boundary - 14_400_000
                        for s in symbols:
                            row = bars_4h.get(s, {}).get(fopen)
                            if row:
                                _store_bar(eng, s, "4h", row, False)
                            elif _has_tf(eng, "4h"):
                                degraded.add(s)
                    if boundary % 3_600_000 == 0:
                        hopen = boundary - 3_600_000
                        for s in symbols:
                            row = bars_1h.get(s, {}).get(hopen)
                            if row:
                                _store_bar(eng, s, "1h", row, False)
                            elif _has_tf(eng, "1h"):
                                degraded.add(s)
                    if boundary % 900_000 == 0 and _has_tf(eng, "15m"):
                        bopen = boundary - 900_000
                        if last_15m_open is None or bopen > last_15m_open:
                            ran = False
                            for s in symbols:
                                row = bars_15m.get(s, {}).get(bopen)
                                if not row:
                                    degraded.add(s)
                                    continue
                                eng.on_bar_closed(s, "15m", row, run_strategy=True)
                                evaluated += 1
                                ran = True
                            if ran:
                                last_15m_open = bopen
                continue
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
                    ready = strategy_ready_at is None or int(strategy_ready_at) >= boundary + int(strategy_lag_ms)
                    if ready and (last_signal_open is None or hopen > last_signal_open):
                        for s in symbols:
                            row = bars_1h.get(s, {}).get(hopen)
                            if not row:
                                degraded.add(s)
                                continue
                            if eng is not None:
                                eng.on_bar_closed(s, "1h", row, run_strategy=True)
                                evaluated_1h += 1
                        last_signal_open = hopen
                    elif eng is not None and hasattr(eng, "add_history"):
                        for s in symbols:
                            row = bars_1h.get(s, {}).get(hopen)
                            if row:
                                eng.add_history(s, "1h", [row])
                if boundary % 900_000 == 0:
                    if _has_tf(eng, "15m"):
                        bopen = boundary - 900_000
                        if last_15m_open is None or bopen > last_15m_open:
                            ran = False
                            for s in symbols:
                                row = bars_15m.get(s, {}).get(bopen)
                                if not row:
                                    degraded.add(s)
                                    continue
                                eng.on_bar_closed(s, "15m", row, run_strategy=True)
                                evaluated += 1
                                ran = True
                            if ran:
                                last_15m_open = bopen
                    else:
                        last_15m_open = boundary - 900_000
                    seen_1m = {s: False for s in symbols}
                if boundary % 86_400_000 == 0 and eng is not None:
                    done = getattr(eng, "on_timeframe_done", None)
                    if done:
                        done("1d", boundary)
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

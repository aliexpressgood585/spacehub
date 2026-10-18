"""Closed-bar clock helpers shared by the scheduled runner and the tests.

`bar_path` is the same intrabar heuristic as `bot.backtest.bar_path`:
a bullish bar is walked O-L-H-C and a bearish bar O-H-L-C. It lives here so the
runner does not import the backtester (that module pulls in optional plotting deps).
"""


def bar_path(o, h, l, c):
    return [o, l, h, c] if c >= o else [o, h, l, c]


def closed_bar_open(now_ms: int, step_ms: int) -> int:
    """Open time of the latest bar of `step_ms` that is fully closed at `now_ms`."""
    if step_ms <= 0:
        raise ValueError("step_ms")
    return (now_ms // step_ms) * step_ms - step_ms


def opens_after(prev_open, now_ms: int, step_ms: int, cap: int | None = None) -> list[int]:
    """Open times of bars that closed after `prev_open` and are closed at `now_ms`.

    `prev_open` is the open time of the last bar already processed. The result is
    oldest-first. When `cap` is set and the gap is longer, only the newest `cap`
    bars are returned (the skipped older ones are not retried by the caller).
    """
    last = closed_bar_open(now_ms, step_ms)
    if prev_open is None:
        return []
    start = int(prev_open) + step_ms
    if start > last:
        return []
    n = (last - start) // step_ms + 1
    if cap is not None and n > cap:
        start = last - (cap - 1) * step_ms
    return list(range(start, last + step_ms, step_ms))

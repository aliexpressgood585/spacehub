from bot.clock import bar_path, closed_bar_open, opens_after


def test_bar_path_matches_backtest_heuristic():
    assert bar_path(1, 3, 0, 2) == [1, 0, 3, 2]   # bullish: O-L-H-C
    assert bar_path(2, 3, 0, 1) == [2, 3, 0, 1]   # bearish: O-H-L-C
    assert bar_path(5, 5, 5, 5) == [5, 5, 5, 5]


def test_closed_bar_open_is_the_previous_boundary():
    step = 60_000
    now = 10 * step + 5_000
    assert closed_bar_open(now, step) == 9 * step
    assert closed_bar_open(10 * step, step) == 9 * step


def test_opens_after_is_empty_until_a_new_bar_closes():
    step = 60_000
    prev = 9 * step
    now = 10 * step + 1_000          # last closed open is still 9*step
    assert opens_after(prev, now, step) == []
    assert opens_after(None, now, step) == []


def test_opens_after_returns_only_new_closed_bars():
    step = 60_000
    prev = 5 * step
    now = 10 * step + 1_000          # last closed open = 9*step
    assert opens_after(prev, now, step) == [6 * step, 7 * step, 8 * step, 9 * step]


def test_opens_after_cap_keeps_the_newest():
    step = 60_000
    now = 100 * step + 10
    got = opens_after(0, now, step, cap=3)
    assert got == [97 * step, 98 * step, 99 * step]
    assert got[-1] == closed_bar_open(now, step)

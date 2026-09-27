"""Look-ahead invariance of the book-inspired candidates: a signal at bar i may not change when later bars change."""
import numpy as np

from quant.data.loader import Bars
from quant.strategies import chan_book as B


def _bars(n=900, seed=3):
    rng = np.random.default_rng(seed)
    c = 100 * np.exp(np.cumsum(rng.normal(0, 0.004, n)))
    h, l = c * (1 + rng.uniform(0, 0.003, n)), c * (1 - rng.uniform(0, 0.003, n))
    return Bars("BTC", "5m", np.arange(n, dtype=np.int64) * 300_000, c.copy(), h, l, c, np.ones(n))


def _cut(b, k):
    return Bars(b.symbol, b.tf, b.t[:k], b.open[:k], b.high[:k], b.low[:k], b.close[:k], b.volume[:k])


def test_no_lookahead():
    b = _bars()
    for fn, p in ((B.don_signals, B.don_grid("5m")[0]), (B.zmr_signals, B.zmr_grid("5m")[0])):
        full, part = fn(b, p), fn(_cut(b, 600), p)
        for f in ("side", "exit_long", "exit_short"):
            assert np.array_equal(getattr(full, f)[:600], getattr(part, f)), (fn.__name__, f)
        assert np.allclose(full.stop_long[:600], part.stop_long, equal_nan=True)


def test_rules():
    b = _bars()
    d = B.don_signals(b, dict(N=48, stop_atr=2.0))
    i = np.flatnonzero(d.side == 1)
    assert len(i) and all(b.close[k] > b.high[k - 48:k].max() for k in i)
    z = B.zmr_signals(b, dict(W=48, entry_z=2.0, exit_z=0.0, stop_z=3.0))
    j = np.flatnonzero(z.side == -1)
    zz = z.info["z"][j]
    assert len(j) and np.all(zz >= 2.0) and np.all((z.stop_short[j] > b.close[j]) == (zz < 3.0))   # z beyond the stop: the engine refuses it

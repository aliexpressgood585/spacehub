import numpy as np
import pytest

from quant.strategies import mean_reversion as MR
from quant.strategies import momentum as MOM
from quant.strategies import regime as RG
from quant.strategies.stats import adf_pvalue, half_life, hurst, rolling_mean_std, rolling_stats

from .conftest import make_bars

rng = np.random.default_rng(7)


def ou(n, theta, sigma=0.001, mu=0.0):
    x = np.zeros(n)
    for i in range(1, n):
        x[i] = x[i - 1] + theta * (mu - x[i - 1]) + sigma * rng.standard_normal()
    return x


def test_adf_separates_stationary_from_random_walk():
    assert adf_pvalue(ou(3000, 0.1)) < 0.01
    assert adf_pvalue(np.cumsum(rng.standard_normal(3000))) > 0.05


def test_hurst_regimes():
    assert hurst(np.cumsum(rng.standard_normal(5000))) == pytest.approx(0.5, abs=0.08)
    assert hurst(ou(5000, 0.2)) < 0.4
    trend = np.cumsum(np.convolve(rng.standard_normal(5100), np.ones(50) / 50, "valid"))
    assert hurst(trend) > 0.6


def test_half_life_matches_ou():
    theta = 0.05
    assert half_life(ou(20000, theta)) == pytest.approx(np.log(2) / theta, rel=0.25)
    assert half_life(np.cumsum(rng.standard_normal(3000)) + 1e-9 * np.arange(3000) ** 2) > 200 or np.isinf(half_life(np.arange(100.0)))


def test_rolling_mean_std_variable_window():
    x = rng.standard_normal(500)
    m, s = rolling_mean_std(x, np.full(500, 20.0))
    assert m[100] == pytest.approx(x[81:101].mean())
    assert s[100] == pytest.approx(x[81:101].std(ddof=1))
    assert np.isnan(m[10])


def _no_lookahead(fn, close, cut):
    """Signals up to `cut` must not change when every bar after `cut` is replaced by garbage."""
    a = fn(make_bars(close))
    close2 = close.copy()
    close2[cut + 1:] = close2[cut + 1:] * np.exp(np.cumsum(rng.standard_normal(len(close) - cut - 1) * 0.05))
    b = fn(make_bars(close2))
    for name in ("side", "exit_long", "exit_short", "stop_long", "stop_short", "max_hold"):
        x, y = getattr(a, name)[: cut + 1], getattr(b, name)[: cut + 1]
        assert np.array_equal(np.nan_to_num(x, nan=-7), np.nan_to_num(y, nan=-7)), name


def test_rolling_stats_are_causal():
    lp = np.log(100 * np.exp(ou(3000, 0.05, 0.002)))
    a = rolling_stats(lp, 500, 100)
    lp2 = lp.copy()
    lp2[2000:] += 1.0
    b = rolling_stats(lp2, 500, 100)
    for k in a:
        assert np.array_equal(np.nan_to_num(a[k][:2000]), np.nan_to_num(b[k][:2000]))


def test_mean_reversion_no_lookahead_and_direction(cfg):
    close = 100 * np.exp(ou(6000, 0.05, 0.003))
    p = {"entry_z": 2.0, "exit_z": 0.0, "stop_z": 3.5, "scale_in": True}
    fn = lambda b: MR.signals(b, p, cfg, "5m")  # noqa: E731
    _no_lookahead(fn, close, 4500)
    s = fn(make_bars(close))
    z = s.info["z"]
    longs = s.side == 1
    assert longs.any() and np.all(z[longs] <= -2.0)
    assert np.all(s.stop_long[longs] < close[longs])        # stop below price for longs
    assert s.n_layers == 3 and s.units.max() <= 3


def test_mean_reversion_gate_blocks_random_walk(cfg):
    close = 100 * np.exp(np.cumsum(rng.standard_normal(6000) * 0.002) + np.linspace(0, 1.5, 6000))
    s = MR.signals(make_bars(close), {"entry_z": 2.0, "exit_z": 0.0, "stop_z": 3.5, "scale_in": False}, cfg, "5m")
    assert s.info["active_frac"] < 0.2


def test_momentum_no_lookahead_and_gate(cfg):
    x = np.cumsum(np.convolve(rng.standard_normal(9100) * 0.002, np.ones(100) / 10, "valid"))  # persistent returns
    close = 100 * np.exp(x)
    for kind in ("tsmom", "breakout"):
        p = {"kind": kind, "lookback": 12, "hold": 12}
        fn = lambda b: MOM.signals(b, p, cfg, "5m")  # noqa: E731
        _no_lookahead(fn, close, 7000)
        s = fn(make_bars(close))
        assert s.info["active_frac"] > 0.3, "persistent series should pass the significance gate"
        assert np.all(s.stop_long[s.side == 1] < close[s.side == 1])
    noise = 100 * np.exp(np.cumsum(rng.standard_normal(9000) * 0.002))
    s = MOM.signals(make_bars(noise), {"kind": "tsmom", "lookback": 12, "hold": 12}, cfg, "5m")
    assert s.info["active_frac"] < 0.2, "a random walk should rarely pass t >= 2"


def test_regime_labels(cfg):
    mr = 100 * np.exp(ou(6000, 0.2, 0.002))
    reg = RG.regimes(mr, cfg, "5m")
    assert (reg[2100:] == RG.MEAN_REVERT).mean() > 0.5
    tr = 100 * np.exp(np.cumsum(np.convolve(rng.standard_normal(6100) * 0.002, np.ones(100) / 10, "valid")))
    reg = RG.regimes(tr, cfg, "5m")
    assert (reg[2100:] == RG.TREND).mean() > 0.5


def test_masked_only_touches_entries(cfg):
    close = 100 * np.exp(ou(6000, 0.05, 0.003))
    s = MR.signals(make_bars(close), {"entry_z": 2.0, "exit_z": 0.0, "stop_z": 3.5, "scale_in": False}, cfg, "5m")
    m = s.masked(np.zeros(len(close), bool))
    assert not m.side.any() and np.array_equal(m.exit_long, s.exit_long)

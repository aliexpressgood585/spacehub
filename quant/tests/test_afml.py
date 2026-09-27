"""AFML layer: labels, weights, fractional differentiation, purged CV, overfitting statistics, meta sizing, bars."""
import numpy as np
import pytest

from quant.afml.bars import activity_bars, return_properties, time_bars
from quant.afml.cv import cpcv, purged_kfold
from quant.afml.fracdiff import ffd, ffd_weights, min_d
from quant.afml.labeling import avg_uniqueness, ewm_vol, triple_barrier
from quant.afml.live_filter import MetaFilter
from quant.afml.meta import bet_size, fit_predict
from quant.afml.overfit import dsr, expected_max_sr, pbo, psr
from quant.data.loader import Bars

from .conftest import make_bars


def _ohlc(close, spread=0.0):
    close = np.asarray(close, float)
    o = np.concatenate([[close[0]], close[:-1]])
    return o, np.maximum(o, close) * (1 + spread), np.minimum(o, close) * (1 - spread), close


# ---- triple barrier -------------------------------------------------------------------------------------------
def test_triple_barrier_upper_lower_vertical():
    c = np.full(50, 100.0)
    o, h, l, c = _ohlc(c)
    vol = np.full(50, 0.01)
    up = h.copy(); up[5] = 103.0                     # long: gain barrier at 100*(1+1*0.01*sqrt(4)) = 102
    L = triple_barrier(o, up, l, c, np.array([1]), np.array([1]), np.array([4]), vol, 1, 1, 0.0)
    assert L["bin"][0] == 1 and L["t1"][0] == 5 and L["ret"][0] == pytest.approx(0.02)
    dn = l.copy(); dn[4] = 97.0
    L = triple_barrier(o, h, dn, c, np.array([1]), np.array([1]), np.array([4]), vol, 1, 1, 0.0)
    assert L["bin"][0] == -1 and L["ret"][0] == pytest.approx(-0.02) and L["meta"][0] == 0
    L = triple_barrier(o, h, l, c, np.array([1]), np.array([1]), np.array([4]), vol, 1, 1, 0.001)
    assert L["bin"][0] == 0 and L["t1"][0] == 5 and L["ret"][0] == pytest.approx(-0.001)   # time exit, costs only


def test_triple_barrier_short_and_loss_first_when_both_touched():
    c = np.full(20, 100.0)
    o, h, l, c = _ohlc(c)
    vol = np.full(20, 0.01)
    h2, l2 = h.copy(), l.copy()
    h2[3], l2[3] = 103.0, 97.0                       # both barriers in one bar -> the loss is assumed first
    L = triple_barrier(o, h2, l2, c, np.array([1]), np.array([-1]), np.array([4]), vol, 1, 1, 0.0)
    assert L["bin"][0] == -1 and L["ret"][0] == pytest.approx(-0.02)
    L = triple_barrier(o, h, l2, c, np.array([1]), np.array([-1]), np.array([4]), vol, 1, 1, 0.0)
    assert L["bin"][0] == 1 and L["ret"][0] == pytest.approx(0.02)


def test_barriers_scale_with_volatility():
    rng = np.random.default_rng(0)
    c = 100 * np.exp(np.cumsum(rng.normal(0, 0.002, 3000)))
    v = ewm_vol(c, 100)
    assert np.nanmedian(v) == pytest.approx(0.002, rel=0.2)
    c2 = 100 * np.exp(np.cumsum(rng.normal(0, 0.01, 3000)))
    assert np.nanmedian(ewm_vol(c2, 100)) > 4 * np.nanmedian(v)


def test_uniqueness():
    u = avg_uniqueness(np.array([0, 0, 10]), np.array([4, 4, 12]), 20)
    assert u == pytest.approx([0.5, 0.5, 1.0])


# ---- fractional differentiation -------------------------------------------------------------------------------
def test_ffd_limits_and_weights():
    x = np.cumsum(np.random.default_rng(1).normal(size=500))
    assert np.allclose(ffd(x, 1.0)[1:], np.diff(x))              # d = 1 is the first difference
    assert np.allclose(ffd(x, 0.0), x)                           # d = 0 is the level
    w = ffd_weights(0.4)
    assert w[0] == 1 and w[1] == pytest.approx(-0.4) and np.all(w[1:] < 0)


def test_min_d_between_zero_and_one_for_random_walk():
    x = np.cumsum(np.random.default_rng(2).normal(size=6000)) + 1000
    d = min_d(x)
    assert 0.0 < d <= 1.0


# ---- purged CV ------------------------------------------------------------------------------------------------
def test_purged_kfold_no_overlap_and_embargo():
    t0 = np.arange(100) * 10
    t1 = t0 + 25                                           # each label spans 3 events
    for tr, te in purged_kfold(t0, t1, 5, embargo_ms=30):
        a, e = t0[te].min(), t1[te].max()
        assert not np.any((t0[tr] <= e) & (t1[tr] >= a))    # no train label overlaps the test span
        assert not np.any((t0[tr] > e) & (t0[tr] <= e + 30))  # embargo
        assert len(np.intersect1d(tr, te)) == 0


def test_cpcv_paths_cover_every_group_once():
    t0 = np.arange(120) * 10
    splits, paths, groups = cpcv(t0, t0 + 5, 6, 2, 0)
    assert len(splits) == 15 and len(paths) == 5
    for P in paths:
        assert sorted(P) == list(range(6))
        for g, s in P.items():
            assert g in splits[s][1]


# ---- overfitting statistics -----------------------------------------------------------------------------------
def test_dsr_penalises_many_trials():
    rng = np.random.default_rng(3)
    r = rng.normal(0.001, 0.01, 500)
    assert dsr(r, list(rng.normal(0, 0.05, 2))) > dsr(r, list(rng.normal(0, 0.05, 200)))
    assert expected_max_sr([0.0, 0.1, -0.1], 1000) > expected_max_sr([0.0, 0.1, -0.1], 3)
    assert psr(rng.normal(0.01, 0.01, 300)) > 0.99


def test_pbo_noise_near_half_and_real_edge_low():
    rng = np.random.default_rng(4)
    noise = rng.normal(0, 0.01, (400, 20))
    avg = np.mean([pbo(np.random.default_rng(s).normal(0, 0.01, (400, 20)), 8)["pbo"] for s in range(8)])
    assert 0.3 < avg < 0.7                                 # selection among pure noise is a coin flip on average
    edge = noise.copy()
    edge[:, 0] += 0.005                                    # one variant genuinely better everywhere
    assert pbo(edge, 10)["pbo"] < 0.1


# ---- meta model -----------------------------------------------------------------------------------------------
def test_bet_size_monotone_and_bounded():
    p = np.linspace(0.3, 0.99, 30)
    m = bet_size(p)
    assert np.all(np.diff(m) >= 0) and m.min() == 0 and m.max() <= 1
    assert bet_size(np.array([0.5]))[0] == 0


def test_meta_model_learns_a_real_feature():
    rng = np.random.default_rng(5)
    X = rng.normal(size=(4000, 3))
    y = (X[:, 0] + 0.5 * rng.normal(size=4000) > 0).astype(int)
    w = np.ones(4000)
    tr, te = np.arange(3000), np.arange(3000, 4000)
    for kind in ("rf", "lgbm"):
        p = fit_predict(kind, X, y, w, tr, te, 0.5)
        assert ((p > 0.5) == y[te]).mean() > 0.75


def test_live_filter_is_passthrough_unless_gate_passed(tmp_path, cfg):
    f = MetaFilter(cfg, tmp_path / "none.json", model=object())
    assert not f.active and f.decide(np.zeros(3)) == (True, 1.0)            # config disabled
    rep = tmp_path / "meta.json"
    rep.write_text('{"gate": {"PASS": false, "verdict": "KEEP PLAIN CHAN", "selected": "rf_k1.0_t0.55"}}')
    f = MetaFilter({**cfg, "afml": {"enabled": True}}, rep, model=object())
    assert not f.active and "did not pass" in f.reason


# ---- bars -----------------------------------------------------------------------------------------------------
def test_activity_bars_close_on_threshold_and_keep_ohlc():
    rng = np.random.default_rng(6)
    c = 100 * np.exp(np.cumsum(rng.normal(0, 0.001, 1000)))
    b = make_bars(c, tf="1m")
    b.volume[:] = rng.uniform(0.5, 2, 1000)
    t5 = time_bars(b, 5, "5m")
    assert len(t5) == 200 and t5.high[0] == b.high[:5].max() and t5.close[0] == b.close[4]
    db = activity_bars(b, b.volume * b.close, 200, "5m")
    assert abs(len(db) - 200) <= 2
    assert db.volume.sum() == pytest.approx(b.volume.sum())
    assert db.high.max() == pytest.approx(b.high.max()) and db.close[-1] == b.close[-1]
    assert return_properties(db)["n_bars"] == len(db)

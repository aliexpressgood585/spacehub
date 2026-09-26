import pytest

from quant.risk.manager import DAY_MS, KellySizer, RiskManager

T0 = 1_700_000_000_000 // DAY_MS * DAY_MS


def test_kelly_default_until_enough_trades():
    k = KellySizer(fraction=0.5, cap=0.01, min_trades=30, default_risk=0.0025)
    for _ in range(29):
        k.add(1.0)
    assert k.risk_fraction() == 0.0025


def test_half_kelly_formula_and_cap():
    k = KellySizer(fraction=0.5, cap=0.01, min_trades=4, default_risk=0.0025)
    for r in (0.2, -0.1, 0.2, -0.1):   # E[r]=0.05, E[r^2]=0.025 -> f*=2 -> half 1.0 -> capped at 1%
        k.add(r)
    assert k.full_kelly() == pytest.approx(2.0)
    assert k.risk_fraction() == 0.01
    k2 = KellySizer(fraction=0.5, cap=0.01, min_trades=4)
    for r in (1.0, -1.0, 1.0, -0.98):   # tiny edge: f* = 0.005/0.99 -> half ~0.25%
        k2.add(r)
    assert k2.risk_fraction() == pytest.approx(0.5 * 0.005 / (sum(x * x for x in (1, 1, 1, 0.98)) / 4))


def test_no_edge_means_no_size():
    k = KellySizer(min_trades=3)
    for r in (-1, 0.5, -1):
        k.add(r)
    assert k.risk_fraction() == 0.0


def test_size_caps_risk_at_1pct_and_leverage(cfg):
    rm = RiskManager(cfg, 10_000)
    for _ in range(40):
        rm.sizer("S").add(2.0)            # huge edge -> Kelly wants a lot -> capped at 1%
    qty, f, why = rm.size("S", 10_000, 100.0, 99.0, 0.0)
    assert f == 0.01 and qty == pytest.approx(100.0) and why == "ok"   # $100 risk / $1 stop
    qty, f, _ = rm.size("S", 10_000, 100.0, 99.9, 0.0)                # tight stop -> would be $100k notional
    assert qty * 100.0 <= 3 * 10_000 + 1e-6                            # leverage 3x
    qty, _, why = rm.size("S", 10_000, 100.0, 99.0, 30_000.0)
    assert qty == 0 and why == "max leverage reached"


def test_min_stop_to_cost(cfg):
    rm = RiskManager(cfg, 10_000)
    qty, _, why = rm.size("S", 10_000, 100.0, 99.99, 0.0)   # 1 bp stop vs 10 bp round trip
    assert qty == 0 and "round-trip" in why


def test_daily_loss_limit_pauses_until_next_day(cfg):
    rm = RiskManager(cfg, 10_000)
    rm.mark(T0 + 1000, 10_000)
    eq = 10_000
    for _ in range(3):
        eq -= 101
        ev = rm.on_trade_closed(T0 + 2000, -101, -1.0, "S", eq)
    assert ev == "DAILY_STOP"
    assert rm.can_open(T0 + 3000, eq, 0) == (False, "paused until next UTC day (daily loss limit)")
    assert rm.can_open(T0 + DAY_MS + 10, eq, 0)[0] is True


def test_consecutive_losses(cfg):
    rm = RiskManager(cfg, 100_000)
    ev = None
    for k in range(5):
        ev = rm.on_trade_closed(T0 + k, -10, -0.1, "S", 100_000 - 10 * (k + 1))
    assert ev == "CONSEC_STOP"
    assert rm.can_open(T0 + 10, 99_950, 0)[0] is False
    assert rm.can_open(T0 + DAY_MS, 99_950, 0)[0] is True


def test_win_resets_streak(cfg):
    rm = RiskManager(cfg, 100_000)
    for k in range(4):
        rm.on_trade_closed(T0 + k, -10, -0.1, "S", 100_000)
    rm.on_trade_closed(T0 + 5, 10, 0.1, "S", 100_000)
    assert rm.state.consecutive_losses == 0


def test_drawdown_kill_is_permanent(cfg):
    rm = RiskManager(cfg, 10_000)
    rm.mark(T0, 11_000)                           # new peak; the kill level is 10% below it = 9,900
    assert rm.mark(T0 + 1, 9_901) is None
    assert rm.mark(T0 + 2, 9_899) == "KILL"
    assert rm.can_open(T0 + 10 * DAY_MS, 20_000, 0)[0] is False   # never resumes by itself


def test_kill_threshold_exact(cfg):
    rm = RiskManager(cfg, 10_000)
    assert rm.mark(T0, 9_001) is None
    assert rm.mark(T0, 9_000) == "KILL"


def test_max_open_positions(cfg):
    rm = RiskManager(cfg, 10_000)
    assert rm.can_open(T0, 10_000, 5) == (False, "max open positions")


def test_config_rejects_risk_above_1pct(tmp_path):
    from quant.config import ROOT, load_config
    with pytest.raises(ValueError):
        load_config(ROOT / "config.yaml", {"risk": {"risk_per_trade_cap": 0.02}})

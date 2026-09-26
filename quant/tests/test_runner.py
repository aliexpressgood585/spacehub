"""Runner lifecycle: refuses to start while HALT exists; the kill switch closes everything and writes HALT;
risk state survives a restart."""
import pytest

from quant.execution.alerts import Alerts
from quant.execution.journal import Journal
from quant.execution.runner import Runner


class StubBroker:
    def __init__(self, equity=10_000.0):
        self.eq, self.closed_all, self.ex = equity, 0, None

    def equity(self):
        return self.eq

    def prepare(self, coin, lev):
        pass

    def reconcile(self, coins, stops):
        return {"closed": [], "repaired": [], "closed_no_stop": [], "orphans_cancelled": []}

    def close_all(self, coins, reason):
        self.closed_all += 1


def make(tmp_path, cfg, broker):
    j = Journal(tmp_path / "j.sqlite", tmp_path / "csv")
    return Runner(cfg, "testnet", broker, j, Alerts(enabled=False), [], "5m", tmp_path, clock=lambda: 1_790_000_000.0)


def test_refuses_to_start_when_halted(tmp_path, cfg):
    (tmp_path / "HALT").write_text("manual")
    with pytest.raises(RuntimeError, match="HALT"):
        make(tmp_path, cfg, StubBroker()).start()


def test_drawdown_kill_closes_all_and_halts(tmp_path, cfg):
    b = StubBroker(10_000)
    r = make(tmp_path, cfg, b)
    r.start()
    b.eq = 8_900                   # 11% below the peak
    r.step()
    assert b.closed_all == 1 and (tmp_path / "HALT").exists()
    assert any("KILL" in m for m in r.alerts.sent)


def test_risk_state_persists_across_restart(tmp_path, cfg):
    b = StubBroker(10_000)
    r = make(tmp_path, cfg, b)
    r.start()
    b.eq = 12_000
    r.step()                       # new peak saved
    r2 = make(tmp_path, cfg, StubBroker(10_700))
    r2.start()
    assert r2.risk.state.peak_equity == 12_000
    r2.broker.eq = 10_700          # 10.8% below the persisted peak -> kill even after a restart
    r2.step()
    assert (tmp_path / "HALT").exists()

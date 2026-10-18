"""Publish recovery and the desk-loop watchdog.

Run 39137494470 kept ticking. The state push sat for about 20 minutes because
pm/pmc/pmn commit to the same branch every few seconds, and a dirty
state.json made `git pull --rebase` refuse. Publishing resets to origin and
reapplies only binance-paper/.
"""
import subprocess
from pathlib import Path

import pytest
import requests

from bot.rest import HardTimeoutSession, PublicRest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "desk_loop.sh"
WORKFLOW = ROOT.parents[0] / ".github" / "workflows" / "binance-paper-desk.yml"


def _git(cwd, *args):
    subprocess.check_call(["git", *args], cwd=cwd)


def _init_pair(tmp_path):
    origin = tmp_path / "origin.git"
    subprocess.check_call(["git", "init", "--bare", "-b", "pm-desk-data", str(origin)])
    desk = tmp_path / "desk"
    subprocess.check_call(["git", "clone", "-q", str(origin), str(desk)])
    _git(desk, "config", "user.email", "desk@test")
    _git(desk, "config", "user.name", "desk")
    state = desk / "binance-paper" / "state.json"
    state.parent.mkdir(parents=True)
    state.write_text('{"wallet": 10000, "n": 1}\n')
    _git(desk, "add", "binance-paper/state.json")
    _git(desk, "commit", "-q", "-m", "base")
    _git(desk, "push", "-q", "origin", "pm-desk-data")
    return origin, desk


def _push_state(desk: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["bash", "-c", f'source "{SCRIPT}"; push_state'],
        cwd=desk, capture_output=True, text=True,
    )


def test_rejected_push_reapplies_only_binance_paper(tmp_path):
    origin, desk = _init_pair(tmp_path)
    state = desk / "binance-paper" / "state.json"
    state.write_text('{"wallet": 10000, "n": 2}\n')
    _git(desk, "add", "binance-paper/state.json")
    _git(desk, "commit", "-q", "-m", "local tick")
    other = tmp_path / "other"
    subprocess.check_call(["git", "clone", "-q", str(origin), str(other)])
    _git(other, "config", "user.email", "other@test")
    _git(other, "config", "user.name", "other")
    pm = other / "pm" / "state.json"
    pm.parent.mkdir(parents=True)
    pm.write_text('{"desk": "pm"}\n')
    (other / "binance-paper" / "state.json").write_text('{"wallet": 10000, "n": 9}\n')
    _git(other, "add", "pm/state.json", "binance-paper/state.json")
    _git(other, "commit", "-q", "-m", "pm desk")
    _git(other, "push", "-q", "origin", "pm-desk-data")
    newest = '{"wallet": 9998.53, "n": 3, "positions": 8}\n'
    state.write_text(newest)
    # The failure this replaces: rebase will not start on a dirty tree.
    bare = subprocess.run(
        ["git", "pull", "-q", "--rebase", "-X", "ours", "origin", "pm-desk-data"],
        cwd=desk, capture_output=True, text=True,
    )
    assert bare.returncode != 0
    assert "unstaged" in (bare.stderr + bare.stdout).lower()

    got = _push_state(desk)
    assert got.returncode == 0, got.stderr + got.stdout
    assert state.read_text() == newest
    assert subprocess.check_output(
        ["git", "show", "HEAD:binance-paper/state.json"], cwd=origin, text=True,
    ) == newest
    assert subprocess.check_output(
        ["git", "show", "HEAD:pm/state.json"], cwd=origin, text=True,
    ) == '{"desk": "pm"}\n'
    assert subprocess.check_output(["git", "status", "--porcelain"], cwd=desk, text=True) == ""


def test_publish_stale_at_ten_minutes():
    script = f'source "{SCRIPT}"; publish_stale "$1" "$2"'
    fresh = subprocess.run(["bash", "-c", script, "bash", "699", "100"], capture_output=True)
    due = subprocess.run(["bash", "-c", script, "bash", "700", "100"], capture_output=True)
    assert fresh.returncode != 0
    assert due.returncode == 0


def test_hard_timeout_session_fills_a_missing_timeout(monkeypatch):
    seen = {}

    def fake(self, method, url, **kwargs):
        seen["timeout"] = kwargs.get("timeout")
        raise requests.RequestException("stop")

    monkeypatch.setattr(requests.Session, "request", fake)
    session = HardTimeoutSession(9)
    with pytest.raises(requests.RequestException):
        session.get("https://example.invalid/fapi/v1/time")
    assert seen["timeout"] == 9
    with pytest.raises(requests.RequestException):
        session.get("https://example.invalid/fapi/v1/time", timeout=3)
    assert seen["timeout"] == 3


def test_public_rest_uses_the_hard_timeout_session():
    rest = PublicRest(["https://example.invalid"], timeout=7)
    assert isinstance(rest.s, HardTimeoutSession)
    assert rest.s.timeout == 7


def test_shallow_fetch_takes_only_the_pm_desk_tip(tmp_path):
    """actions/checkout is depth 1 with a wildcard refspec. A later fetch of
    pm-desk-data without --depth walks every commit on that branch."""
    origin = tmp_path / "origin.git"
    subprocess.check_call(["git", "init", "--bare", "-b", "main", str(origin)])
    full = tmp_path / "full"
    subprocess.check_call(["git", "clone", "-q", str(origin), str(full)])
    _git(full, "config", "user.email", "desk@test")
    _git(full, "config", "user.name", "desk")
    (full / "README").write_text("main\n")
    _git(full, "add", "README")
    _git(full, "commit", "-q", "-m", "main")
    _git(full, "push", "-q", "origin", "main")
    _git(full, "checkout", "-q", "--orphan", "pm-desk-data")
    _git(full, "rm", "-rf", ".")
    state = full / "binance-paper" / "state.json"
    state.parent.mkdir(parents=True)
    for n in range(1, 7):
        state.write_text('{"n": %d}\n' % n)
        _git(full, "add", "binance-paper/state.json")
        _git(full, "commit", "-q", "-m", "state %d" % n)
    _git(full, "push", "-q", "origin", "pm-desk-data")
    shallow = tmp_path / "shallow"
    shallow.mkdir()
    _git(shallow, "init", "-q", "-b", "main")
    # file:// so --depth is honored. A local path ignores it.
    _git(shallow, "remote", "add", "origin", origin.as_uri())
    _git(shallow, "fetch", "-q", "--depth=1", "origin", "main")
    _git(shallow, "checkout", "-q", "main")
    got = subprocess.run(
        ["bash", "-c", f'source "{SCRIPT}"; fetch_pm_desk 30'],
        cwd=shallow, capture_output=True, text=True,
    )
    assert got.returncode == 0, got.stderr + got.stdout
    _git(shallow, "checkout", "-q", "-B", "pm-desk-data", "origin/pm-desk-data")
    _git(shallow, "config", "user.email", "desk@test")
    _git(shallow, "config", "user.name", "desk")
    assert (shallow / "binance-paper" / "state.json").read_text() == '{"n": 6}\n'
    assert subprocess.check_output(
        ["git", "rev-list", "--count", "HEAD"], cwd=shallow, text=True,
    ).strip() == "1"
    (shallow / "binance-paper" / "state.json").write_text('{"n": 7}\n')
    pushed = _push_state(shallow)
    assert pushed.returncode == 0, pushed.stderr + pushed.stdout
    assert subprocess.check_output(
        ["git", "show", "pm-desk-data:binance-paper/state.json"], cwd=origin, text=True,
    ) == '{"n": 7}\n'


def test_workflow_watchdog_contract():
    text = WORKFLOW.read_text()
    script = SCRIPT.read_text()
    assert "timeout-minutes: 350" in text
    assert "timeout --kill-after=15s 90s python" in text
    assert "publish_stale" in text
    assert "::error::no successful binance-paper push" in text
    assert "source /tmp/desk/binance-paper-bot/scripts/desk_loop.sh" in text
    assert "fetch_pm_desk 120" in text
    assert "not creating an empty book" in text
    assert "git fetch -q --depth=1 origin pm-desk-data" in script
    assert "fetch_pm_desk" in script
    # The chain step runs even when the loop step is killed. It still
    # refuses to dispatch when this job proved another loop is alive.
    chain = text.split("- name: chain successor", 1)[1]
    assert "if: always()" in chain
    assert "steps.loop.outputs.chain == 'yes'" not in chain
    assert 'steps.loop.outputs.chain }}" = "no"' in chain
    assert "sleep 60" in chain

"""Publish recovery and the desk-loop watchdog.

The live loop hung after the xs bootstrap because every minute rewrote
state.json and left it unstaged, so `git pull --rebase` refused to start
and the push never landed. These cover that recovery and the 10-minute exit.
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


def _other_commit(tmp_path, origin, text, message):
    other = tmp_path / "other"
    subprocess.check_call(["git", "clone", "-q", str(origin), str(other)])
    _git(other, "config", "user.email", "other@test")
    _git(other, "config", "user.name", "other")
    path = other / "binance-paper" / "state.json"
    path.write_text(text)
    _git(other, "add", "binance-paper/state.json")
    _git(other, "commit", "-q", "-m", message)
    _git(other, "push", "-q", "origin", "pm-desk-data")


def _push_state(desk: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["bash", "-c", f'source "{SCRIPT}"; push_state'],
        cwd=desk, capture_output=True, text=True,
    )


def test_dirty_tree_rebases_and_keeps_the_newest_state(tmp_path):
    origin, desk = _init_pair(tmp_path)
    state = desk / "binance-paper" / "state.json"
    state.write_text('{"wallet": 10000, "n": 2}\n')
    _git(desk, "add", "binance-paper/state.json")
    _git(desk, "commit", "-q", "-m", "local tick")
    _other_commit(tmp_path, origin, '{"wallet": 10000, "n": 9}\n', "remote moved")
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
    assert got.returncode == 0, got.stderr
    assert state.read_text() == newest
    remote = subprocess.check_output(
        ["git", "log", "-1", "--format=%s", "pm-desk-data"], cwd=origin, text=True,
    ).strip()
    assert remote == "local tick"
    committed = subprocess.check_output(
        ["git", "show", "HEAD:binance-paper/state.json"], cwd=desk, text=True,
    )
    assert '"n": 2' in committed
    # The parked tick is unstaged, not silently committed or dropped.
    porcelain = subprocess.check_output(["git", "status", "--porcelain"], cwd=desk, text=True)
    assert "binance-paper/state.json" in porcelain


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


def test_workflow_watchdog_contract():
    text = WORKFLOW.read_text()
    assert "timeout-minutes: 350" in text
    assert "timeout --kill-after=15s 90s python" in text
    assert "publish_stale" in text
    assert "source /tmp/desk/binance-paper-bot/scripts/desk_loop.sh" in text
    # The chain step runs even when the loop step is killed. It still
    # refuses to dispatch when this job proved another loop is alive.
    chain = text.split("- name: chain successor", 1)[1]
    assert "if: always()" in chain
    assert "steps.loop.outputs.chain == 'yes'" not in chain
    assert 'steps.loop.outputs.chain }}" = "no"' in chain

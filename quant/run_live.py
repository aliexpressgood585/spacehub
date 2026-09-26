"""Phase 2 / 3 entry point.

    python -m quant.run_live --tf 5m --report quant/reports/phase1-approved.json

The plan (which strategies, which parameters) comes from a Phase-1 report with verdict GO. Mode comes from
config.yaml and is checked by execution/gate.py; nothing here can switch to live. `--allow-no-go` exists only to
exercise the plumbing on the TESTNET with a NO-GO plan (it refuses in live mode).
"""
from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path

from .config import ROOT, load_config
from .execution.alerts import Alerts
from .execution.broker import Broker
from .execution.exchange import make_exchange
from .execution.gate import GateError, resolve_mode
from .execution.journal import Journal
from .execution.runner import Runner


def plan_from_report(report: dict, strategy: str) -> tuple[list[dict], str]:
    st = report["strategies"][strategy]
    return [{"strategy": k, "params": v} for k, v in st["chosen_final"].items()], st["verdict"]


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--tf", default="5m")
    ap.add_argument("--report", required=True)
    ap.add_argument("--strategy", default=None, help="mean_reversion | momentum | regime_router (default: the GO one)")
    ap.add_argument("--allow-no-go", action="store_true")
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    cfg = load_config()
    rd = ROOT / "reports"
    try:
        mode = resolve_mode(cfg, rd)
    except GateError as e:
        raise SystemExit(str(e))
    report = json.loads(Path(a.report).read_text())
    names = [a.strategy] if a.strategy else [k for k, v in report["strategies"].items() if v["verdict"] == "GO"]
    if not names:
        if not (a.allow_no_go and mode == "testnet"):
            raise SystemExit("no strategy in the report passed Phase 1 (verdict GO): nothing to trade")
        names = list(report["strategies"])[:1]
    plan, verdict = plan_from_report(report, names[0])
    if verdict != "GO" and not (a.allow_no_go and mode == "testnet"):
        raise SystemExit(f"{names[0]} is {verdict}: refusing (use --allow-no-go on the testnet only, for plumbing tests)")
    j = Journal(ROOT / cfg["journal"]["sqlite"].replace(".sqlite", f"_{mode}.sqlite"), ROOT / cfg["journal"]["csv_dir"] / mode)
    al = Alerts(cfg["alerts"].get("telegram", True))
    ex = make_exchange(cfg, mode)
    Runner(cfg, mode, Broker(ex, j, al, cfg), j, al, plan, a.tf, rd).run_forever()


if __name__ == "__main__":
    main()

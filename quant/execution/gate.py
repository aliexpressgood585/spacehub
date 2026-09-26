"""Deployment gates. Mode is read from config and NEVER changed by code.

  backtest  research only; the runner refuses to start.
  testnet   Binance USDT-M testnet (testnet.binancefuture.com) with testnet keys. Phase 2.
  live      real money. Refused unless ALL of these hold — each is a separate, manual act by the owner:
              1. config.yaml  exchange.live_approved: true
              2. env QUANT_LIVE_APPROVAL equals LIVE_PHRASE exactly
              3. reports/phase1-approved.json exists with "verdict": "GO"  (a copy of a GO backtest verdict)
              4. reports/phase2-review.json exists with "approved": true and "days" >= gates.phase2.min_days
            There is no code path that writes any of these four.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

LIVE_PHRASE = "I APPROVE LIVE TRADING WITH REAL MONEY"


class GateError(RuntimeError):
    pass


def resolve_mode(cfg: dict, reports_dir: str | Path, env: dict | None = None) -> str:
    env = os.environ if env is None else env
    mode = cfg["mode"]
    if mode == "backtest":
        raise GateError("config mode is 'backtest': set mode: testnet to paper-trade on the Binance testnet")
    if mode == "testnet":
        return "testnet"
    if mode != "live":
        raise GateError(f"unknown mode {mode!r}")
    why = []
    if cfg["exchange"].get("live_approved") is not True:
        why.append("config exchange.live_approved is not true")
    if env.get("QUANT_LIVE_APPROVAL") != LIVE_PHRASE:
        why.append("env QUANT_LIVE_APPROVAL does not carry the approval phrase")
    rd = Path(reports_dir)
    p1 = rd / "phase1-approved.json"
    try:
        if json.loads(p1.read_text()).get("verdict") != "GO":
            why.append("phase1-approved.json verdict is not GO")
    except (OSError, ValueError):
        why.append("reports/phase1-approved.json missing or unreadable (Phase 1 backtest gate)")
    p2 = rd / "phase2-review.json"
    try:
        j = json.loads(p2.read_text())
        if j.get("approved") is not True or int(j.get("days", 0)) < int(cfg["gates"]["phase2"]["min_days"]):
            why.append("phase2-review.json not approved or shorter than the minimum testnet period")
    except (OSError, ValueError):
        why.append("reports/phase2-review.json missing or unreadable (Phase 2 testnet gate)")
    if why:
        raise GateError("LIVE REFUSED: " + "; ".join(why))
    return "live"

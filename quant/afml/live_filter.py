"""Optional live hook: the meta-filter may only ever be ACTIVE when (1) config afml.enabled is true, (2) the latest
report's gate PASSED and (3) a model artifact trained on archived data exists. Otherwise it is a pass-through and
plain CHAN trades exactly as before. It never learns from live trades, and its size can only shrink a trade.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from .meta import bet_size


class MetaFilter:
    def __init__(self, cfg: dict, report_path: Path, model=None):
        self.active = False
        self.reason = "afml.enabled is false"
        if not cfg.get("afml", {}).get("enabled"):
            return
        if not report_path.exists():
            self.reason = "no meta report"
            return
        gate = json.loads(report_path.read_text()).get("gate", {})
        if not gate.get("PASS"):
            self.reason = f"gate did not pass ({gate.get('verdict', 'unknown')})"
            return
        if model is None:
            self.reason = "no model artifact"
            return
        sel = gate["selected"]
        self.model, self.thr, self.sizing = model, float(sel.split("_t")[1][:4]), sel.endswith("_size")
        self.active, self.reason = True, f"active: {sel}"

    def decide(self, x: np.ndarray) -> tuple[bool, float]:
        """-> (take, size multiplier in [0, 1]). Pass-through when inactive."""
        if not self.active:
            return True, 1.0
        p = float(self.model.predict_proba(np.nan_to_num(x.reshape(1, -1)))[0, 1])
        if p <= self.thr:
            return False, 0.0
        return True, float(bet_size(np.array([p]))[0]) if self.sizing else 1.0

"""Config loading. The YAML file is the only source of tunable numbers; code never hard-codes a risk limit."""
from __future__ import annotations

import copy
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parent


def load_config(path: str | Path | None = None, overrides: dict[str, Any] | None = None) -> dict[str, Any]:
    p = Path(path) if path else ROOT / "config.yaml"
    with open(p, "r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    if overrides:
        cfg = deep_merge(cfg, overrides)
    validate(cfg)
    return cfg


def deep_merge(a: dict, b: dict) -> dict:
    out = copy.deepcopy(a)
    for k, v in b.items():
        out[k] = deep_merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def per_tf(value: Any, tf: str) -> Any:
    """Config values may be given per timeframe ({5m: .., 1m: ..}) or as a scalar."""
    return value[tf] if isinstance(value, dict) else value


def validate(cfg: dict) -> None:
    r = cfg["risk"]
    if not 0 < r["risk_per_trade_cap"] <= 0.01:
        raise ValueError("risk.risk_per_trade_cap must be in (0, 1%]")
    if not 0 < r["kelly_fraction"] <= 1:
        raise ValueError("risk.kelly_fraction must be in (0, 1]")
    if not 1 <= r["max_leverage"] <= 20:
        raise ValueError("risk.max_leverage must be in [1, 20]")
    if not 0 <= r["daily_loss_limit"] < 1:
        raise ValueError("risk.daily_loss_limit must be in [0, 1); 0 disables it")
    for k in ("max_drawdown_kill",):
        if not 0 < r[k] < 1:
            raise ValueError(f"risk.{k} must be a fraction in (0, 1)")
    if int(r["max_consecutive_losses"]) < 1:
        raise ValueError("risk.max_consecutive_losses must be >= 1")
    if cfg["mode"] not in ("backtest", "testnet", "live"):
        raise ValueError("mode must be backtest | testnet | live")

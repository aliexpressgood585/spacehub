"""Config loading + the HARD caps. A config that tries to go past a cap does not get clamped silently:
the bot refuses to start (safety first: a typo must not turn into a bigger position)."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

LIVE_CONFIRM_ENV = "DAYBOT_LIVE_CONFIRM"
LIVE_CONFIRM_VALUE = "I_ACCEPT_REAL_MONEY_RISK"

# (path, kind, bound): 'max' = the value may not exceed bound, 'min' = may not go below it
HARD_CAPS: list[tuple[str, str, float]] = [
    ("risk.risk_per_trade", "max", 0.01),
    ("risk.max_leverage", "max", 5),
    ("risk.max_open", "max", 2),
    ("risk.max_trades_24h", "max", 6),
    ("risk.daily_stop", "max", 0.02),
    ("risk.weekly_stop", "max", 0.05),
    ("risk.kill_drawdown", "max", 0.10),
    ("risk.loss_streak", "max", 3),
    ("risk.loss_streak_pause_h", "min", 4),
    ("risk.liq_vs_stop", "min", 2.0),
    ("risk.time_exit_bars", "max", 8),
    ("costs.max_cost_r", "max", 0.20),
    ("costs.min_target_r", "min", 1.5),
    ("costs.round_trip", "min", 0.0016),
    ("night.size_mult", "max", 0.5),
    ("night.max_cost_r", "max", 0.15),
    ("filters.max_spread", "max", 0.0002),
    ("filters.min_volume_24h_usd", "min", 200_000_000),
    ("filters.news_window_min", "min", 30),
    ("entry.limit_timeout_1m", "max", 3),
]

SETUPS = ("S1", "S2", "S3", "S4", "S5", "S6")
TIMEFRAMES = ("1m", "5m", "15m", "30m", "1h")


class ConfigError(Exception):
    pass


def _get(d: dict, path: str) -> Any:
    for k in path.split("."):
        if not isinstance(d, dict) or k not in d:
            raise ConfigError(f"missing config key: {path}")
        d = d[k]
    return d


@dataclass
class Config:
    raw: dict
    path: Path

    def __getitem__(self, k: str) -> Any:
        return self.raw[k]

    def get(self, path: str) -> Any:
        return _get(self.raw, path)

    @property
    def mode(self) -> str:
        return self.raw["mode"]

    @property
    def universe(self) -> list[str]:
        return list(self.raw["universe"])

    @property
    def root(self) -> Path:
        return self.path.parent

    def p(self, key: str) -> Path:
        """A path from the `paths` section, relative to the config file."""
        q = Path(self.raw["paths"][key])
        return q if q.is_absolute() else self.root / q

    def setup_enabled(self, s: str) -> bool:
        return bool(self.raw["setups"][s]["enabled"])

    def setup_tf(self, s: str) -> str:
        return self.raw["setups"][s]["tf"]


def validate(raw: dict) -> list[str]:
    errs: list[str] = []
    if raw.get("mode") not in ("testnet", "demo", "live"):
        errs.append("mode must be testnet | demo | live")
    for path, kind, bound in HARD_CAPS:
        try:
            v = float(_get(raw, path))
        except (ConfigError, TypeError, ValueError) as e:
            errs.append(f"{path}: {e}")
            continue
        if kind == "max" and v > bound:
            errs.append(f"{path}={v} is above the hard cap {bound}")
        if kind == "min" and v < bound:
            errs.append(f"{path}={v} is below the hard floor {bound}")
        if v < 0:
            errs.append(f"{path} must not be negative")
    for s in SETUPS:
        tf = raw.get("setups", {}).get(s, {}).get("tf")
        if tf not in TIMEFRAMES:
            errs.append(f"setups.{s}.tf must be one of {TIMEFRAMES}")
    if not raw.get("universe"):
        errs.append("universe is empty")
    bad = set(raw.get("night", {}).get("coins", [])) - set(raw.get("universe", []))
    if bad:
        errs.append(f"night.coins not in universe: {sorted(bad)}")
    return errs


def load_config(path: str | Path = "config.yaml", check_live: bool = True) -> Config:
    path = Path(path).resolve()
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    errs = validate(raw)
    if errs:
        raise ConfigError("config rejected:\n  " + "\n  ".join(errs))
    if check_live and raw["mode"] == "live" and os.environ.get(LIVE_CONFIRM_ENV) != LIVE_CONFIRM_VALUE:
        raise ConfigError(
            f"mode: live needs {LIVE_CONFIRM_ENV}={LIVE_CONFIRM_VALUE} in the environment as well. "
            "Refusing to start in live mode."
        )
    return Config(raw, path)

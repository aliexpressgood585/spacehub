"""YAML config loader."""
import os
import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_config(path=None):
    path = path or os.path.join(ROOT, "config.yaml")
    with open(path) as f:
        cfg = yaml.safe_load(f)
    cfg["_root"] = ROOT
    return cfg


def rpath(cfg, p):
    """Resolve a path relative to project root."""
    return p if os.path.isabs(p) else os.path.join(cfg["_root"], p)

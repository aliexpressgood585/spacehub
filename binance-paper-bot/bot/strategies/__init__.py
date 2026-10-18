from .base import REGISTRY, Strategy, Signal, Context, register  # noqa
from . import trend_ema, bollinger_mr  # noqa  (registers plugins)


def make_strategy(cfg):
    name = cfg["strategy"]["name"]
    if name not in REGISTRY:
        raise ValueError(f"unknown strategy {name}; available: {list(REGISTRY)}")
    return REGISTRY[name](cfg["strategy"]["params"].get(name, {}))

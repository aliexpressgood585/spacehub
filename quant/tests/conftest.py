import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from quant.config import load_config  # noqa: E402
from quant.data.loader import Bars  # noqa: E402


@pytest.fixture
def cfg():
    return load_config()


def make_bars(close, symbol="BTC", tf="5m", spread=0.001):
    close = np.asarray(close, float)
    n = len(close)
    o = np.concatenate([[close[0]], close[:-1]])
    h = np.maximum(o, close) * (1 + spread)
    l = np.minimum(o, close) * (1 - spread)
    t = np.arange(n, dtype=np.int64) * 300_000 + 1_700_000_000_000
    return Bars(symbol, tf, t, o, h, l, close, np.ones(n))

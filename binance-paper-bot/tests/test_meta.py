"""The committed Binance contract cache parses, and the paper account is the one we ship."""
import json
import os

from bot.config import ROOT, load_config
from bot.margin import LeverageBrackets
from bot.symbols import load_symbol_infos


def test_config_is_paper_10k_with_binance_vip0_fees():
    cfg = load_config()
    assert cfg["mode"] == "paper"
    assert cfg["account"]["starting_balance"] == 10_000
    assert cfg["fees"]["maker"] == 0.0002 and cfg["fees"]["taker"] == 0.0005
    assert cfg["symbols"] == ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"]
    assert cfg["strategy"]["name"] == "ema_trend_4h"
    p = cfg["strategy"]["params"]["ema_trend_4h"]
    assert p["timeframe"] == "1h" and p["signal_timeframe"] == "4h"
    assert p["ema_fast"] == 20 and p["ema_slow"] == 150 and p["tp_atr"] == 0
    assert p["regime"] == "self50" and p["leverage"] == 3 and p["sl_atr"] == 3.0
    assert cfg["data"]["rest_bases"][0] == "https://fapi.binance.com"
    assert "www.binance.com" in cfg["data"]["rest_bases"][1]


def test_cached_exchange_info_and_brackets():
    meta = json.load(open(os.path.join(ROOT, "data", "market_meta.json")))
    cfg = load_config()
    infos = load_symbol_infos(meta["exchange_info"], cfg["symbols"])
    br = LeverageBrackets(meta["brackets"])
    assert infos["BTCUSDT"].tick_size == 0.1
    assert infos["BTCUSDT"].min_notional == 50
    assert infos["ETHUSDT"].tick_size == 0.01
    assert br.source("BTCUSDT") == "binance"
    assert br.max_leverage("BTCUSDT", 1_000) == 150
    assert br.max_leverage("BNBUSDT", 1_000) == 75
    for s in cfg["symbols"]:
        assert br.source(s) == "binance"
        assert infos[s].step_size > 0

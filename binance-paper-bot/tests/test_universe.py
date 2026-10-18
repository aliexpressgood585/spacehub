"""Top-20 universe: eligibility, monthly reuse, volume rank, slippage tiers."""
from datetime import datetime, timezone

from bot.execution.base import Order
from bot.universe import (eligible, is_current, median_quote, month_key,
                          quote_volume, rank_from_info, slippage_bps)
from bot.desk import strategy_view
from bot.strategies import make_strategy
from bot.config import load_config
from tests.test_math import make_ex

NOW = int(datetime(2026, 10, 2, tzinfo=timezone.utc).timestamp() * 1000)


def _info(symbol, base, onboard, status="TRADING", contract="PERPETUAL", quote="USDT"):
    return {"symbol": symbol, "baseAsset": base, "quoteAsset": quote, "status": status,
            "contractType": contract, "onboardDate": onboard}


def test_slippage_tiers():
    assert slippage_bps(500_000_000) == 1.0
    assert slippage_bps(100_000_000) == 2.0
    assert slippage_bps(30_000_000) == 3.0
    assert slippage_bps(29_000_000) == 5.0


def test_eligible_drops_stables_gold_young_and_non_perps():
    old = NOW - 400 * 86_400_000
    assert eligible(_info("BTCUSDT", "BTC", old), NOW)
    assert not eligible(_info("USDCUSDT", "USDC", old), NOW)
    assert not eligible(_info("PAXGUSDT", "PAXG", old), NOW)
    assert not eligible(_info("XAUTUSDT", "XAUT", old), NOW)
    assert not eligible(_info("NEWUSDT", "NEW", NOW - 20 * 86_400_000), NOW)
    assert not eligible(_info("BTCUSDT", "BTC", old, status="SETTLING"), NOW)
    assert not eligible(_info("BTCUSDT_241227", "BTC", old, contract="CURRENT_QUARTER"), NOW)
    assert not eligible(_info("BTCUSDC", "BTC", old, quote="USDC"), NOW)


def test_rank_takes_top_20_by_median_and_skips_thin_history():
    old = NOW - 400 * 86_400_000
    symbols = []
    volumes = {}
    for i in range(25):
        sym = f"C{i}USDT"
        symbols.append(_info(sym, f"C{i}", old))
        volumes[sym] = [float((i + 1) * 1_000_000)] * 90
    symbols.append(_info("USDCUSDT", "USDC", old))
    volumes["USDCUSDT"] = [9e12] * 90
    symbols.append(_info("THINUSDT", "THIN", old))
    volumes["THINUSDT"] = [1e9] * 10
    rows = rank_from_info({"symbols": symbols}, volumes, NOW)
    assert len(rows) == 20
    assert rows[0]["symbol"] == "C24USDT" and rows[0]["rank"] == 1
    assert rows[-1]["symbol"] == "C5USDT" and rows[-1]["rank"] == 20
    assert all(r["symbol"] not in ("USDCUSDT", "THINUSDT") for r in rows)
    assert rows[0]["median_volume"] == 25_000_000
    assert rows[0]["slippage_bps"] == 5.0


def test_median_uses_last_90_only():
    vols = [1.0] * 30 + [100.0] * 90
    assert median_quote(vols) == 100.0
    assert median_quote([1.0] * 59) is None
    assert quote_volume([0, 0, 0, 0, 0, 0, 0, "12.5"]) == 12.5


def test_month_reuse():
    ms = NOW
    state = {"universe": [{"symbol": "BTCUSDT", "rank": 1, "median_volume": 1, "slippage_bps": 1}],
             "universe_ranked_at": "2026-10-02T00:00:00Z", "universe_month": month_key(ms)}
    assert month_key(ms) == "2026-10"
    assert is_current(state, ms)
    assert not is_current(state, ms + 40 * 86_400_000)
    assert not is_current({"universe": state["universe"]}, ms)


def test_strategy_view_carries_backtest():
    cfg = load_config()
    view = strategy_view(make_strategy(cfg), cfg)
    assert view["name"] == "ema_trend_4h" and view["timeframe"] == "1h"
    assert view["backtest"]["oos"]["return_pct"] == 43.4
    assert view["backtest"]["oos"]["trades"] == 30
    assert view["backtest"]["is"]["return_pct"] == 107.2
    assert view["params"]["tp_atr"] == 0


def test_per_symbol_slippage_changes_the_fill():
    ex, _ = make_ex()
    ex.slip_by_symbol["BTCUSDT"] = 5.0 / 1e4
    ex.place_order(Order("BTCUSDT", "BUY", "MARKET", 0.01), 1)
    p = ex.get_position("BTCUSDT")
    ask = 50_000.1
    assert p.entry_price >= ask * (1 + 4.5e-4)

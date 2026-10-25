"""OOS check of the opportunity scanner against the plain short-EMA + fade book.

Same window, costs and aggressive profile as bot.regime_bt (Jan 2026 through
the last 4h bar, $100). The plain book is regime_fast_mr on the original five
coins. The scanner book is that sleeve on the cached October 2026 volume rank
(top 18), with per-coin routing, EMA10 pullbacks and a 2-entry cap per 4h close.

Ship the scanner only when it does not liquidate and its max drawdown is not
deeper than 60%. Otherwise the live flag stays off and the plain book ships.

    python3 -m bot.scanner_bt --klines /tmp/regime-klines --out reports/scanner_oos.json
"""
import argparse
import json
import os
from datetime import datetime, timezone

from .config import ROOT, load_config
from .regime import params_from_cfg
from .regime_bt import (FUNDING_RATE, OOS_START, _book_cfg, _load_symbol_set,
                        _ms, label_series, run_book)

# Rank order of the live October 2026 cache (binance-paper state), top 18.
# Not chosen from this backtest. AAVEUSDT and AVAXUSDT are 19 and 20.
CACHED_TOP18 = [
    "BTCUSDT", "ETHUSDT", "SOLUSDT", "ZECUSDT", "XRPUSDT", "HYPEUSDT",
    "DOGEUSDT", "BNBUSDT", "SUIUSDT", "NEARUSDT", "ENAUSDT", "1000PEPEUSDT",
    "UNIUSDT", "ADAUSDT", "PUMPUSDT", "WLDUSDT", "LINKUSDT", "TAOUSDT",
]
FIVE = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"]
DD_LIMIT = -60.0


def _available(symbols, series):
    return [s for s in symbols if s in series]


def _per_day(stats):
    days = float(stats.get("days") or 0)
    n = int(stats.get("trades") or 0)
    return round(n / days, 4) if days else 0.0


def _ship(stats):
    liq = int(stats.get("liquidations") or 0)
    dd = float(stats.get("max_drawdown_pct") or 0)
    if liq > 0:
        return False, f"scanner liquidated {liq} time(s); shipping the plain 5-coin book"
    if dd <= DD_LIMIT:
        return False, f"scanner max drawdown {dd}% is deeper than {DD_LIMIT}%; shipping the plain 5-coin book"
    return True, "scanner had no liquidation and max drawdown was inside 60%"


def _enable(cfg, symbols):
    sc = cfg["scanner"]
    sc["enabled"] = True
    sc["symbols"] = list(symbols)
    sc["per_coin"] = True
    sc["pullback"] = True
    sc["pullback_hold_bars"] = 12
    sc["max_new_per_bar"] = 2
    sc["top_n"] = 18
    sc["cap"] = 20
    return cfg


def run(klines, out_path):
    base = load_config()
    params = params_from_cfg(base)
    print("loading klines", flush=True)
    series, dailies, missing = _load_symbol_set(klines, CACHED_TOP18)
    if series is None:
        # A young perp can 404. Load what exists, one symbol at a time.
        series, dailies = {}, {}
        missing = []
        for s in CACHED_TOP18:
            got, days, miss = _load_symbol_set(klines, [s])
            if miss:
                missing.append(s)
                print(f"  skip {s}: no 4h file", flush=True)
                continue
            series[s] = got[s]
            dailies[s] = days[s]
    have = _available(CACHED_TOP18, series)
    five = _available(FIVE, series)
    if len(five) < 5:
        raise FileNotFoundError(f"plain book is missing klines for {[s for s in FIVE if s not in series]}")
    print("folding regimes", flush=True)
    labels = {}
    for s in have:
        labels[s] = label_series(series[s], params)
        print(f"  {s}: {len(labels[s])} labels", flush=True)
    oos_start = _ms(OOS_START)
    data_end = max(int(series[s][-1][6]) + 1 for s in have) + 14_400_000

    print("plain regime_fast_mr n=5", flush=True)
    plain_cfg, _, _, _ = _book_cfg(base, "fast_mr", five, "aggressive")
    plain = run_book(plain_cfg, "fast_mr", series, dailies, labels, oos_start, data_end, check_labels=False)
    plain["name"] = "regime_fast_mr"
    plain["trades_per_day"] = _per_day(plain)
    plain["trades_per_week"] = round(plain["trades_per_day"] * 7, 3)
    print(f"  plain return {plain['return_pct']}% DD {plain['max_drawdown_pct']}% "
          f"trades {plain['trades']} /day {plain['trades_per_day']} liq {plain['liquidations']}", flush=True)

    print(f"scanner n={len(have)}", flush=True)
    scan_cfg, _, _, _ = _book_cfg(base, "fast_mr", have, "aggressive")
    _enable(scan_cfg, have)
    scanned = run_book(scan_cfg, "fast_mr", series, dailies, labels, oos_start, data_end, check_labels=False)
    scanned["name"] = "short_ema_fade_scan"
    scanned["symbols"] = list(have)
    scanned["trades_per_day"] = _per_day(scanned)
    scanned["trades_per_week"] = round(scanned["trades_per_day"] * 7, 3)
    scanned["missing_symbols"] = list(missing or [])
    ship, reason = _ship(scanned)
    print(f"  scan return {scanned['return_pct']}% DD {scanned['max_drawdown_pct']}% "
          f"trades {scanned['trades']} /day {scanned['trades_per_day']} liq {scanned['liquidations']}", flush=True)
    print("ship", ship, reason, flush=True)
    report = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "oos_start": OOS_START,
        "dd_limit_pct": DD_LIMIT,
        "costs": {
            "taker_per_side": base["fees"]["taker"],
            "slippage_bps": base["execution"]["slippage_bps"],
            "spread_bps": base["backtest"]["spread_bps"],
            "funding_rate_per_8h": FUNDING_RATE,
        },
        "plain": plain,
        "scanner": scanned,
        "ship_scanner": ship,
        "reason": reason,
        "published_plain": {
            "name": "regime_fast_mr",
            "source": "reports/regime_oos.json",
            "return_pct": 68.053,
            "max_drawdown_pct": -40.92,
            "trades": 49,
            "liquidations": 0,
            "days": 297.2,
            "trades_per_day": 0.1649,
            "trades_per_week": 1.154,
            "note": ("Reproduced exactly when each 4h close was replayed once per "
                     "symbol. That second pass can stop a fill on the same bar's "
                     "high and low. The live desk walks each close once, so plain "
                     "and scanner above are the one-pass book."),
        },
        "note": ("One pass per 4h close, matching the live desk. "
                 "Universe is the October 2026 cached volume rank, applied across "
                 "Jan-Oct 2026 (the names were not known in January). "
                 "Funding is a flat 0.01%/8h, longs pay."),
    }
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    json.dump(report, open(out_path, "w"), indent=2)
    print("wrote", out_path, flush=True)
    return report


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--klines", default="/tmp/regime-klines")
    p.add_argument("--out", default=os.path.join(ROOT, "reports", "scanner_oos.json"))
    args = p.parse_args()
    run(args.klines, args.out)


if __name__ == "__main__":
    main()

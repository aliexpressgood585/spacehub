"""Monthly top-20 USDT-M universe.

Eligible: TRADING perpetual, quote USDT, listed at least ~12 months, not a
stablecoin and not gold. Rank by the median daily quote volume of the last 90
closed days. Re-rank when the UTC month changes. Slippage follows that median:

  >= $500M/day -> 1 bp, >= $100M -> 2 bp, >= $30M -> 3 bp, else 5 bp.
"""
import logging
import time
from datetime import datetime, timezone

log = logging.getLogger("universe")

TOP_N = 20
MIN_DAILY_BARS = 60
VOLUME_DAYS = 90
LOOKBACK_DAYS = 100
LISTED_MS = 365 * 86_400_000

STABLE_BASES = {
    "USDC", "USDT", "FDUSD", "TUSD", "DAI", "USDP", "USDE", "USD1", "EUR", "AEUR",
    "BUSD", "USTC", "USDD", "PYUSD", "GUSD", "USDS", "RLUSD", "USD", "EURI", "USDY",
    "USDG", "BFUSD", "USDE", "USD1",
}
GOLD_BASES = {"PAXG", "XAUT", "GOLD"}


def month_key(ms):
    dt = datetime.fromtimestamp(int(ms) / 1000, timezone.utc)
    return f"{dt.year:04d}-{dt.month:02d}"


def slippage_bps(median_quote):
    v = float(median_quote or 0)
    if v >= 500_000_000:
        return 1.0
    if v >= 100_000_000:
        return 2.0
    if v >= 30_000_000:
        return 3.0
    return 5.0


def eligible(info, now_ms, listed_ms=LISTED_MS):
    """One exchangeInfo symbol object. False when it cannot join the universe."""
    if not isinstance(info, dict):
        return False
    if info.get("status") != "TRADING":
        return False
    if info.get("contractType") != "PERPETUAL":
        return False
    if info.get("quoteAsset") != "USDT":
        return False
    base = str(info.get("baseAsset") or "")
    if base in STABLE_BASES or base in GOLD_BASES:
        return False
    try:
        onboard = int(info.get("onboardDate") or 0)
    except (TypeError, ValueError):
        return False
    if onboard <= 0 or onboard > int(now_ms) - int(listed_ms):
        return False
    return True


def quote_volume(kline):
    """Binance kline index 7, or the same slot on an OKX row we converted."""
    if not kline or len(kline) <= 7:
        return None
    raw = kline[7]
    if raw is None or raw == "":
        return None
    try:
        v = float(raw)
    except (TypeError, ValueError):
        return None
    if v != v or v < 0:
        return None
    return v


def median_quote(volumes, days=VOLUME_DAYS):
    import numpy as np
    vals = [float(v) for v in volumes if v is not None]
    if len(vals) < MIN_DAILY_BARS:
        return None
    window = vals[-days:]
    return float(np.median(window))


def build_rows(median_by_symbol, n=TOP_N):
    ordered = sorted(median_by_symbol.items(), key=lambda kv: (-kv[1], kv[0]))[:n]
    return [{"symbol": s, "rank": i + 1, "median_volume": float(v), "slippage_bps": slippage_bps(v)}
            for i, (s, v) in enumerate(ordered)]


def stored_rows(state):
    rows = (state or {}).get("universe") or []
    out = []
    for r in rows:
        if isinstance(r, dict) and r.get("symbol"):
            out.append(r)
    return out


def is_current(state, now_ms):
    """True when `state` already holds a universe ranked in this UTC month."""
    rows = stored_rows(state)
    if len(rows) < 1:
        return False
    ranked = (state or {}).get("universe_ranked_at")
    if not ranked:
        return False
    try:
        if isinstance(ranked, (int, float)):
            ms = int(ranked)
        else:
            ms = int(datetime.fromisoformat(str(ranked).replace("Z", "+00:00")).timestamp() * 1000)
    except (TypeError, ValueError):
        return False
    month = (state or {}).get("universe_month")
    return month == month_key(now_ms) and month_key(ms) == month_key(now_ms)


def closed_quote_volumes(raw, now_ms, step=86_400_000):
    vols = []
    for k in raw or []:
        try:
            ct = int(k[6]) if len(k) > 6 else int(k[0]) + step - 1
        except (TypeError, ValueError, IndexError):
            continue
        if ct >= int(now_ms):
            continue
        q = quote_volume(k)
        if q is not None:
            vols.append(q)
    return vols


def rank_from_info(exchange_info, volumes_by_symbol, now_ms, allowed=None, n=TOP_N):
    """Pure ranking. `allowed` is an optional set (OKX listings); None keeps everyone eligible."""
    med = {}
    for info in (exchange_info or {}).get("symbols") or []:
        if not eligible(info, now_ms):
            continue
        sym = info.get("symbol")
        if not sym or (allowed is not None and sym not in allowed):
            continue
        m = median_quote(volumes_by_symbol.get(sym) or [])
        if m is None:
            continue
        med[sym] = m
    return build_rows(med, n)


def fetch_daily_quotes(feed, symbol, now_ms, days=LOOKBACK_DAYS):
    """Latest `days` daily klines, unclosed bar dropped. One request."""
    step = 86_400_000
    if getattr(feed, "kind", "") == "binance" and getattr(feed, "rest", None) is not None:
        raw = feed.rest.get("/fapi/v1/klines", {"symbol": symbol, "interval": "1d", "limit": days})
    else:
        raw = feed.klines(symbol, "1d", int(now_ms) - days * step, int(now_ms) + 1)
    return closed_quote_volumes(raw, now_ms, step)


def rank_live(feed, exchange_info, now_ms, allowed=None, n=TOP_N, pause=0.03):
    """Hit the feed once per eligible symbol. Failures skip that symbol."""
    names = []
    for info in (exchange_info or {}).get("symbols") or []:
        if not eligible(info, now_ms):
            continue
        sym = info.get("symbol")
        if not sym or (allowed is not None and sym not in allowed):
            continue
        names.append(sym)
    log.info("universe candidates: %d", len(names))
    volumes = {}
    for i, sym in enumerate(names):
        try:
            volumes[sym] = fetch_daily_quotes(feed, sym, now_ms)
        except Exception:
            log.warning("daily volume failed for %s", sym, exc_info=True)
            volumes[sym] = []
        if pause and i + 1 < len(names):
            time.sleep(pause)
        if (i + 1) % 40 == 0:
            log.info("universe volumes %d/%d", i + 1, len(names))
    return rank_from_info(exchange_info, volumes, now_ms, allowed=allowed, n=n)

"""Market-data feed for the scheduled runner.

Order, matching the desk config:
  1. https://fapi.binance.com
  2. https://www.binance.com/fapi  (same public USDT-M data; fapi.binance.com is often HTTP 451)
  3. OKX USDT-SWAP candles, mark price and funding, if both Binance bases fail.

Fees and contract filters are NOT taken from OKX. The runner keeps the Binance VIP0
fee schedule and the cached (or live) Binance exchangeInfo / leverage brackets.
"""
import logging
import time

log = logging.getLogger("feed")

OKX_BAR = {"1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m", "30m": "30m",
           "1h": "1H", "2h": "2H", "4h": "4H", "1d": "1D"}


def inst_id(symbol: str) -> str:
    if not symbol.endswith("USDT"):
        raise ValueError(f"unsupported symbol {symbol}")
    return symbol[:-4] + "-USDT-SWAP"


def okx_bar(interval: str) -> str:
    try:
        return OKX_BAR[interval]
    except KeyError:
        raise ValueError(f"unsupported interval {interval}") from None


def kline_from_okx(row, interval_ms: int) -> list:
    """OKX candle row -> Binance kline shape [openTime, o, h, l, c, volume, closeTime]."""
    ot = int(row[0])
    vol = row[5] if len(row) > 5 else "0"
    return [ot, row[1], row[2], row[3], row[4], vol, ot + interval_ms - 1]


def funding_from_okx(symbol: str, row: dict) -> dict:
    return {"symbol": symbol, "fundingTime": int(row["fundingTime"]), "fundingRate": row["fundingRate"],
            "markPrice": row.get("markPrice") or ""}


def probe_binance(session, bases, timeout) -> tuple:
    """Return (base_or_None, probes). A base is usable only on HTTP 200 with serverTime."""
    probes = []
    for b in bases:
        url = b.rstrip("/") + "/fapi/v1/time"
        try:
            r = session.get(url, timeout=timeout, allow_redirects=False)
            probes.append({"url": b, "status": getattr(r, "status_code", 0)})
            text = getattr(r, "text", "") or ""
            if getattr(r, "status_code", 0) == 200 and "serverTime" in text:
                return b.rstrip("/"), probes
        except Exception as e:
            probes.append({"url": b, "status": type(e).__name__})
            log.warning("Binance probe %s failed: %s", b, e)
    return None, probes


class BinanceFeed:
    kind = "binance"

    def __init__(self, rest):
        self.rest = rest
        self.endpoint = rest.base

    def klines(self, symbol, interval, start_ms, end_ms):
        return self.rest.klines(symbol, interval, start_ms, end_ms)

    def mark_klines(self, symbol, interval, start_ms, end_ms):
        return self.rest.mark_klines(symbol, interval, start_ms, end_ms)

    def funding_history(self, symbol, start_ms, end_ms):
        return self.rest.funding_history(symbol, start_ms, end_ms)

    def book_ticker(self, symbol):
        r = self.rest.book_ticker(symbol)
        return {"bidPrice": r["bidPrice"], "askPrice": r["askPrice"], "lastPrice": r.get("lastPrice") or ""}

    def premium_index(self, symbol):
        return self.rest.premium_index(symbol)

    def exchange_info(self):
        return self.rest.exchange_info()

    def leverage_brackets(self):
        return self.rest.leverage_brackets()


class OkxFeed:
    kind = "okx"

    def __init__(self, base="https://www.okx.com", session=None, timeout=12):
        self.endpoint = base.rstrip("/")
        self.timeout = timeout
        if session is None:
            import requests
            session = requests.Session()
            session.headers["User-Agent"] = "spacehub-paper/1.0"
        self.s = session

    def _get(self, path, params):
        url = self.endpoint + path
        last = None
        for i in range(4):
            try:
                r = self.s.get(url, params=params, timeout=self.timeout)
                if getattr(r, "status_code", 200) in (418, 429):
                    time.sleep(1 + i)
                    continue
                r.raise_for_status()
                body = r.json()
                if isinstance(body, dict) and str(body.get("code", "0")) not in ("0", "None"):
                    raise RuntimeError(f"okx {body.get('code')} {body.get('msg')}")
                return body.get("data", body) if isinstance(body, dict) else body
            except Exception as e:
                last = e
                log.warning("OKX %s failed (%s), retry %d", path, e, i + 1)
                time.sleep(0.4 + i)
        raise RuntimeError(f"OKX {path} failed: {last}")

    def _convert(self, data, step, start_ms, end_ms, confirm_idx):
        rows, seen = [], set()
        for r in data or []:
            ts = int(r[0])
            if ts in seen or ts < start_ms or ts >= end_ms:
                continue
            if len(r) > confirm_idx and str(r[confirm_idx]) == "0":
                continue
            seen.add(ts)
            rows.append(kline_from_okx(r, step))
        rows.sort(key=lambda x: x[0])
        return rows

    def _page(self, path, inst, bar, start_ms, end_ms, limit):
        out, after, seen, guard = [], str(end_ms), set(), 0
        while guard < 500:
            guard += 1
            data = self._get(path, {"instId": inst, "bar": bar, "after": after, "limit": str(limit)})
            if not data:
                break
            oldest = None
            for r in data:
                ts = int(r[0])
                oldest = ts if oldest is None else min(oldest, ts)
                if ts not in seen:
                    seen.add(ts)
                    out.append(r)
            if oldest is None or oldest <= start_ms or len(data) < limit:
                break
            nxt = str(oldest)
            if nxt == after:
                break
            after = nxt
        return out

    def _step(self, interval):
        from .rest import INTERVAL_MS
        return INTERVAL_MS[interval]

    def klines(self, symbol, interval, start_ms, end_ms):
        step, bar, inst = self._step(interval), okx_bar(interval), inst_id(symbol)
        now = int(time.time() * 1000)
        if end_ms >= now - step and (end_ms - start_ms) <= 300 * step:
            data = self._get("/api/v5/market/candles", {"instId": inst, "bar": bar, "limit": "300"})
            if data and min(int(r[0]) for r in data) <= start_ms:
                return self._convert(data, step, start_ms, end_ms, 8)
        data = self._page("/api/v5/market/history-candles", inst, bar, start_ms, end_ms, 100)
        return self._convert(data, step, start_ms, end_ms, 8)

    def mark_klines(self, symbol, interval, start_ms, end_ms):
        step, bar, inst = self._step(interval), okx_bar(interval), inst_id(symbol)
        if (end_ms - start_ms) <= 100 * step:
            data = self._get("/api/v5/market/mark-price-candles", {"instId": inst, "bar": bar, "limit": "100"})
            if data and min(int(r[0]) for r in data) <= start_ms:
                return self._convert(data, step, start_ms, end_ms, 5)
        data = self._page("/api/v5/market/history-mark-price-candles", inst, bar, start_ms, end_ms, 100)
        return self._convert(data, step, start_ms, end_ms, 5)

    def funding_history(self, symbol, start_ms, end_ms):
        inst, out, after, seen = inst_id(symbol), [], str(end_ms + 1), set()
        for _ in range(40):
            data = self._get("/api/v5/public/funding-rate-history",
                             {"instId": inst, "after": after, "limit": "100"})
            if not data:
                break
            oldest = None
            for r in data:
                ft = int(r["fundingTime"])
                oldest = ft if oldest is None else min(oldest, ft)
                if ft not in seen:
                    seen.add(ft)
                    if start_ms < ft <= end_ms:
                        out.append(funding_from_okx(symbol, r))
            if oldest is None or oldest <= start_ms or len(data) < 100:
                break
            nxt = str(oldest)
            if nxt == after:
                break
            after = nxt
        out.sort(key=lambda x: x["fundingTime"])
        return out

    def book_ticker(self, symbol):
        d = self._get("/api/v5/market/ticker", {"instId": inst_id(symbol)})[0]
        return {"bidPrice": d["bidPx"], "askPrice": d["askPx"], "lastPrice": d.get("last") or ""}

    def premium_index(self, symbol):
        inst = inst_id(symbol)
        fr = self._get("/api/v5/public/funding-rate", {"instId": inst})[0]
        mk = self._get("/api/v5/public/mark-price", {"instType": "SWAP", "instId": inst})[0]
        return {"symbol": symbol, "markPrice": mk["markPx"],
                "lastFundingRate": fr.get("fundingRate") or "0",
                "nextFundingTime": fr.get("fundingTime") or fr.get("nextFundingTime") or 0}

    def exchange_info(self):
        raise RuntimeError("OKX feed has no Binance exchangeInfo")

    def leverage_brackets(self):
        return None


def connect(cfg):
    """Pick the first working Binance base, otherwise OKX. Returns (feed, probes)."""
    from .rest import PublicRest
    d = cfg["data"]
    rest = PublicRest(d["rest_bases"], d.get("brackets_url"), timeout=12)
    base, probes = probe_binance(rest.s, list(rest.bases), rest.timeout)
    if base:
        rest.base = base
        log.info("price source: Binance %s", base)
        return BinanceFeed(rest), probes
    log.warning("Binance futures REST unreachable %s; using OKX USDT-SWAP", probes)
    return OkxFeed(d.get("okx_base", "https://www.okx.com")), probes


def describe(feed, filters_src, probes) -> dict:
    if feed.kind == "binance":
        host = feed.endpoint
        if "fapi.binance.com" in host:
            label = "Binance Futures — fapi.binance.com"
        else:
            label = "Binance Futures — www.binance.com/fapi (fapi.binance.com לא זמין)"
        mark = "markPriceKlines"
    else:
        label = "OKX USDT-SWAP — Binance Futures חסום מהרץ. עמלות ומדרגות מינוף לפי לוח Binance."
        mark = "okx-mark-price-candles"
    filters_he = {
        "live": "פילטרי חוזה ומדרגות מינוף נמשכו עכשיו מ-Binance",
        "live-info+cached-brackets": "פילטרי חוזה חיים מ-Binance; מדרגות מינוף מהמטמון בריפו",
        "cache": "פילטרי חוזה ומדרגות מינוף מקובץ המטמון בריפו (Binance exchangeInfo)",
    }.get(filters_src, filters_src)
    return {"id": feed.kind, "endpoint": feed.endpoint, "label_he": label, "filters": filters_src,
            "filters_he": filters_he, "mark": mark,
            "fees_he": "עמלות Binance VIP0: מייקר 0.02% · טייקר 0.05% (גם כשהמחיר מגיע מ-OKX)",
            "probes": probes}

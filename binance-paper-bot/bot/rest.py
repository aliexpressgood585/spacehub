"""Public Binance USDT-M Futures REST client (no API keys).

fapi.binance.com is geo-blocked (HTTP 451) from some locations; we try a list
of base URLs and keep the first that answers. www.binance.com/fapi/* serves the
same production data.
"""
import logging
import time
import requests

log = logging.getLogger("rest")
INTERVAL_MS = {"1m": 60_000, "3m": 180_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000,
               "1h": 3_600_000, "2h": 7_200_000, "4h": 14_400_000, "1d": 86_400_000}


class PublicRest:
    def __init__(self, bases, brackets_url=None, timeout=10):
        self.bases = list(bases)
        self.base = None
        self.brackets_url = brackets_url
        self.timeout = timeout
        self.s = requests.Session()
        self.s.headers["User-Agent"] = "paper-bot/1.0"

    def _pick_base(self):
        for b in self.bases:
            try:
                r = self.s.get(b + "/fapi/v1/time", timeout=self.timeout, allow_redirects=False)
                if r.status_code == 200 and "serverTime" in r.text:
                    self.base = b
                    log.info("REST base selected: %s", b)
                    return b
                log.warning("REST base %s unusable: HTTP %s", b, r.status_code)
            except Exception as e:  # noqa
                log.warning("REST base %s error: %s", b, e)
        raise RuntimeError("No Binance futures REST endpoint reachable")

    def get(self, path, params=None, retries=4):
        if self.base is None:
            self._pick_base()
        for i in range(retries):
            try:
                r = self.s.get(self.base + path, params=params, timeout=self.timeout)
                if r.status_code in (418, 429):
                    time.sleep(2 + 3 * i)
                    continue
                if r.status_code in (451, 403):
                    self._pick_base()
                    continue
                r.raise_for_status()
                return r.json()
            except requests.RequestException as e:
                log.warning("GET %s failed (%s), retry %d", path, e, i + 1)
                time.sleep(1 + i)
        raise RuntimeError(f"GET {path} failed after {retries} retries")

    # ---- endpoints ----
    def server_time(self):
        return self.get("/fapi/v1/time")["serverTime"]

    def exchange_info(self):
        return self.get("/fapi/v1/exchangeInfo")

    def premium_index(self, symbol=None):
        return self.get("/fapi/v1/premiumIndex", {"symbol": symbol} if symbol else None)

    def book_ticker(self, symbol):
        return self.get("/fapi/v1/ticker/bookTicker", {"symbol": symbol})

    def leverage_brackets(self):
        """Public (unsigned) bracket table from the Binance web API."""
        if not self.brackets_url:
            return None
        try:
            r = self.s.post(self.brackets_url, json={}, timeout=self.timeout)
            r.raise_for_status()
            return r.json()["data"]["brackets"]
        except Exception as e:
            log.warning("leverage brackets unavailable (%s); using approximate tiers", e)
            return None

    def _paged_klines(self, path, symbol, interval, start_ms, end_ms, limit=1500):
        out, step = [], INTERVAL_MS[interval]
        cur = start_ms
        while cur < end_ms:
            rows = self.get(path, {"symbol": symbol, "interval": interval, "startTime": cur,
                                   "endTime": end_ms, "limit": limit})
            if not rows:
                break
            out.extend(rows)
            nxt = rows[-1][0] + step
            if nxt <= cur:
                break
            cur = nxt
            if len(rows) < limit:
                break
        # dedupe
        seen, res = set(), []
        for r in out:
            if r[0] not in seen:
                seen.add(r[0]); res.append(r)
        return res

    def klines(self, symbol, interval, start_ms, end_ms):
        return self._paged_klines("/fapi/v1/klines", symbol, interval, start_ms, end_ms)

    def mark_klines(self, symbol, interval, start_ms, end_ms):
        return self._paged_klines("/fapi/v1/markPriceKlines", symbol, interval, start_ms, end_ms)

    def recent_klines(self, symbol, interval, limit=500):
        return self.get("/fapi/v1/klines", {"symbol": symbol, "interval": interval, "limit": min(limit, 1500)})

    def funding_history(self, symbol, start_ms, end_ms):
        out, cur = [], start_ms
        while cur < end_ms:
            rows = self.get("/fapi/v1/fundingRate", {"symbol": symbol, "startTime": cur,
                                                      "endTime": end_ms, "limit": 1000})
            if not rows:
                break
            out.extend(rows)
            cur = rows[-1]["fundingTime"] + 1
            if len(rows) < 1000:
                break
        return out

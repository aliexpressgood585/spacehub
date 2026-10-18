"""Price-source selection and OKX row conversion. No network."""
from bot.feed import (OkxFeed, funding_from_okx, inst_id, kline_from_okx, okx_bar, okx_contract,
                       probe_binance)


class _Resp:
    def __init__(self, status, text="", data=None):
        self.status_code = status
        self.text = text
        self._data = data if data is not None else []

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        return {"code": "0", "msg": "", "data": self._data}


class _Sess:
    def __init__(self, mapping):
        self.mapping = mapping
        self.calls = []

    def get(self, url, params=None, timeout=None, allow_redirects=None):
        self.calls.append(url)
        hit = self.mapping.get(url)
        if hit is None:
            raise OSError(url)
        if isinstance(hit, tuple):
            return _Resp(hit[0], hit[1])
        return _Resp(200, data=hit)


def test_symbol_and_bar_mapping():
    assert inst_id("BTCUSDT") == "BTC-USDT-SWAP"
    assert inst_id("XRPUSDT") == "XRP-USDT-SWAP"
    assert okx_bar("1h") == "1H" and okx_bar("15m") == "15m"
    assert okx_contract("BTCUSDT") == [("BTC", 1.0)]
    assert okx_contract("1000PEPEUSDT") == [("1000PEPE", 1.0), ("PEPE", 1000.0)]
    feed = OkxFeed(session=object(), timeout=1)
    feed._swap_bases = {"PEPE", "BTC"}
    assert feed.resolve("1000PEPEUSDT") == ("PEPE-USDT-SWAP", 1000.0)
    assert feed.supports("1000PEPEUSDT") and not feed.supports("NOSUCHUSDT")
    row = feed._kline(["1700000000000", "0.01", "0.02", "0.009", "0.011", "3000", "1", "50", "1"], 60_000, 1000)
    assert float(row[4]) == 11.0 and float(row[5]) == 3.0 and row[7] == "50"


def test_kline_and_funding_conversion():
    row = kline_from_okx(["1700000000000", "10", "12", "9", "11", "5", "1", "1", "1"], 60_000)
    assert row[0] == 1700000000000 and row[4] == "11" and row[6] == 1700000000000 + 59_999
    f = funding_from_okx("ETHUSDT", {"fundingTime": "1700000000000", "fundingRate": "0.0001"})
    assert f == {"symbol": "ETHUSDT", "fundingTime": 1700000000000, "fundingRate": "0.0001", "markPrice": ""}


def test_probe_prefers_fapi_then_www_then_none():
    bases = ["https://fapi.binance.com", "https://www.binance.com"]
    ok = _Sess({"https://fapi.binance.com/fapi/v1/time": (200, '{"serverTime":1}')})
    base, probes = probe_binance(ok, bases, 1)
    assert base == "https://fapi.binance.com" and len(ok.calls) == 1 and probes[0]["status"] == 200

    fall = _Sess({"https://fapi.binance.com/fapi/v1/time": (451, "restricted"),
                  "https://www.binance.com/fapi/v1/time": (200, '{"serverTime":1}')})
    base, probes = probe_binance(fall, bases, 1)
    assert base == "https://www.binance.com" and probes[0]["status"] == 451

    blocked = _Sess({"https://fapi.binance.com/fapi/v1/time": (451, "no"),
                     "https://www.binance.com/fapi/v1/time": (403, "no")})
    base, probes = probe_binance(blocked, bases, 1)
    assert base is None and [p["status"] for p in probes] == [451, 403]


def test_okx_klines_drop_the_open_candle():
    step = 900_000
    closed = 1_700_000_000_000
    forming = closed + step

    def candle(ot, confirm):
        return [str(ot), "10", "11", "9", "10.5", "3", "1", "1", confirm]

    # One payload for every URL. The window is older than "now", so the feed pages history.
    payload = [candle(forming, "0"), candle(closed, "1"), candle(closed - step, "1")]

    class Any:
        def get(self, url, params=None, timeout=None):
            return _Resp(200, data=payload)

    feed = OkxFeed(session=Any(), timeout=1)
    rows = feed.klines("BTCUSDT", "15m", closed - step, forming + step)
    assert [r[0] for r in rows] == [closed - step, closed]
    assert rows[-1][6] == closed + step - 1
    assert all(int(r[6]) < forming + step for r in rows)

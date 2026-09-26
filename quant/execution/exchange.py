"""Exchange client (ccxt binanceusdm). API keys come from environment variables ONLY and are never logged:
testnet, venue 'testnet'  BINANCE_TESTNET_API_KEY / BINANCE_TESTNET_API_SECRET  (testnet.binancefuture.com)
testnet, venue 'demo'     BINANCE_DEMO_API_KEY / BINANCE_DEMO_API_SECRET        (demo-fapi.binance.com, Binance "Demo Trading")
live                      BINANCE_API_KEY / BINANCE_API_SECRET
ccxt marks the futures testnet as deprecated in favour of Demo Trading and blocks private calls to it unless
`disableFuturesSandboxWarning` is set. The testnet still serves orders, so venue 'testnet' sets that flag explicitly;
venue 'demo' uses ccxt's enable_demo_trading.
`install_redaction` adds a logging filter that masks the key values anywhere they would appear in a log line."""
from __future__ import annotations

import logging
import os


class MissingKeys(RuntimeError):
    pass


ENV = {"testnet": ("BINANCE_TESTNET_API_KEY", "BINANCE_TESTNET_API_SECRET"), "demo": ("BINANCE_DEMO_API_KEY", "BINANCE_DEMO_API_SECRET"),
       "live": ("BINANCE_API_KEY", "BINANCE_API_SECRET")}
SYMBOL_MAP = {"PEPE": ("1000PEPE/USDT:USDT", 1000.0)}   # contract, coins per contract unit


def market_symbol(coin: str) -> str:
    return SYMBOL_MAP.get(coin, (f"{coin}/USDT:USDT", 1.0))[0]


def keys(mode: str, env: dict | None = None) -> tuple[str, str]:
    env = os.environ if env is None else env
    k, s = ENV[mode]
    key, sec = env.get(k), env.get(s)
    if not key or not sec:
        raise MissingKeys(f"set {k} and {s} in the environment (never in config or code)")
    return key, sec


class _Redact(logging.Filter):
    def __init__(self, secrets: list[str]):
        super().__init__()
        self.secrets = [s for s in secrets if s and len(s) >= 6]

    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        for s in self.secrets:
            msg = msg.replace(s, "***")
        record.msg, record.args = msg, ()
        return True


def install_redaction(secrets: list[str]) -> None:
    f = _Redact(secrets)
    root = logging.getLogger()
    root.addFilter(f)
    for h in root.handlers:
        h.addFilter(f)


def make_exchange(cfg: dict, mode: str, env: dict | None = None):
    import ccxt

    venue = cfg["exchange"].get("paper_venue", "testnet") if mode == "testnet" else "live"
    if venue not in ("testnet", "demo", "live"):
        raise ValueError("exchange.paper_venue must be testnet | demo")
    key, sec = keys(venue, env)
    install_redaction([key, sec])
    params = {"apiKey": key, "secret": sec, "enableRateLimit": True,
              "options": {"adjustForTimeDifference": True, "recvWindow": int(cfg["exchange"].get("recv_window_ms", 5000))}}
    ca = (os.environ if env is None else env).get("QUANT_CA_BUNDLE")
    if ca:   # TLS stays VERIFIED, against a custom CA bundle (corporate / sandbox TLS proxies); ccxt ignores env by default
        os.environ["REQUESTS_CA_BUNDLE"] = ca
        params["requests_trust_env"] = True
    ex = ccxt.binanceusdm(params)
    if venue == "testnet":
        ex.set_sandbox_mode(True)      # -> testnet.binancefuture.com
        ex.options["disableFuturesSandboxWarning"] = True
    elif venue == "demo":
        ex.enable_demo_trading(True)   # -> demo-fapi.binance.com
    return ex

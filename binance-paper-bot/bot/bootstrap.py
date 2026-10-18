"""Shared setup: REST client, exchangeInfo filters, leverage brackets (cached on disk)."""
import json
import logging
import os
import time
from .config import rpath
from .rest import PublicRest
from .symbols import load_symbol_infos
from .margin import LeverageBrackets

log = logging.getLogger("bootstrap")


def make_rest(cfg):
    d = cfg["data"]
    return PublicRest(d["rest_bases"], d.get("brackets_url"))


def load_market_meta(cfg, rest, max_age_h=12):
    cache = rpath(cfg, "data/market_meta.json")
    meta = None
    if os.path.exists(cache) and time.time() - os.path.getmtime(cache) < max_age_h * 3600:
        meta = json.load(open(cache))
    if meta is None:
        try:
            ei = rest.exchange_info()
            ei = {"symbols": [s for s in ei["symbols"] if s["symbol"] in cfg["symbols"]]}
            br = rest.leverage_brackets() or []
            br = [b for b in br if b["symbol"] in cfg["symbols"]]
            meta = {"exchange_info": ei, "brackets": br, "fetched": int(time.time() * 1000),
                    "rest_base": rest.base}
            json.dump(meta, open(cache, "w"))
        except Exception:
            if os.path.exists(cache):
                log.exception("meta refresh failed, using stale cache")
                meta = json.load(open(cache))
            else:
                raise
    infos = load_symbol_infos(meta["exchange_info"], cfg["symbols"])
    brackets = LeverageBrackets(meta["brackets"])
    for s in cfg["symbols"]:
        log.info("%s tick=%s step=%s minNotional=%s brackets=%s", s, infos[s].tick_size, infos[s].step_size,
                 infos[s].min_notional, brackets.source(s))
    return infos, brackets

"""Minute poll for delist_short.

The announcements feed is the public CMS on www.binance.com, not fapi.
fapi.binance.com returns HTTP 451 from GitHub runners; this module never
calls it. A feed error is logged and swallowed: the rest of the tick still
runs, and an article already armed is still eligible to enter.

Seen article codes and processed (code, symbol) pairs live in
state["engine"]["delist"] so a restart does not enter twice. The first poll
sets since_ms and ignores releases older than max_age (no backfill).
"""
import logging

import requests

from .execution.paper import Market
from .margin import LeverageBrackets
from .strategies.delist_short import (
    NAME, article_symbols, body_text, is_futures_delist, is_spot_delist, plan_entry,
    settlement_ms, trading_perps)
from .symbols import SymbolInfo

log = logging.getLogger("delist")

HOSTS = ("https://www.binance.com", "https://binance.com")
LIST_PATHS = (
    "/bapi/composite/v1/public/cms/article/list/query",
    "/bapi/composite/v1/public/cms/article/catalog/list/query",
)
DETAIL_PATH = "/bapi/composite/v1/public/cms/article/detail/query"
CATALOG_ID = 161
PAGE_SIZE = 20
_SEEN_CAP = 400
_DONE_CAP = 400


def empty_state():
    return {"since_ms": None, "seen": [], "done": [], "armed": {}, "filters": {}}


def normalize(raw):
    raw = raw if isinstance(raw, dict) else {}
    since = raw.get("since_ms")
    armed = {}
    for key, val in (raw.get("armed") or {}).items():
        if isinstance(val, dict) and val.get("symbol"):
            armed[str(key)] = dict(val)
    filters = {}
    for key, val in (raw.get("filters") or {}).items():
        if isinstance(val, dict) and isinstance(val.get("info"), dict):
            filters[str(key)] = {"info": val["info"], "bracket": val.get("bracket")}
    return {
        "since_ms": None if since is None else int(since),
        "seen": [str(x) for x in (raw.get("seen") or [])][-_SEEN_CAP:],
        "done": [str(x) for x in (raw.get("done") or [])][-_DONE_CAP:],
        "armed": armed,
        "filters": filters,
    }


def install_saved_filters(infos, brackets, state):
    """Put persisted delist contract rows back when live exchangeInfo missed them.

    A stop tick refuses to write if an open symbol has no filters. Saving the
    row at entry keeps that tick from depending on a later Binance fetch.
    """
    saved = ((state or {}).get("engine") or {}).get("delist") or {}
    saved = saved.get("filters") or {} if isinstance(saved, dict) else {}
    for sym, blob in saved.items():
        if not isinstance(blob, dict):
            continue
        row = blob.get("info")
        if isinstance(row, dict) and sym not in infos:
            try:
                infos[sym] = SymbolInfo.from_exchange_info(row)
            except Exception:
                log.exception("saved delist filter for %s is unusable", sym)
        bracket = blob.get("bracket")
        table = getattr(brackets, "table", None)
        if bracket and table is not None and sym not in table:
            try:
                extra = LeverageBrackets([bracket])
                if sym in extra.table:
                    table[sym] = extra.table[sym]
            except Exception:
                log.exception("saved delist bracket for %s is unusable", sym)
    return infos, brackets


def _session():
    s = requests.Session()
    s.headers["User-Agent"] = "Mozilla/5.0 (compatible; spacehub-paper/1.0)"
    return s


def _articles_from(payload):
    if not isinstance(payload, dict):
        return None
    data = payload.get("data")
    if not isinstance(data, dict):
        return None
    if isinstance(data.get("articles"), list):
        return data["articles"]
    cats = data.get("catalogs")
    if isinstance(cats, list) and cats:
        arts = (cats[0] or {}).get("articles")
        if isinstance(arts, list):
            return arts
    return None


def fetch_article_list(session=None, timeout=8):
    """Latest Delisting-catalog articles, or None when every host failed."""
    s = session or _session()
    errors = []
    for host in HOSTS:
        for path in LIST_PATHS:
            params = {"catalogId": CATALOG_ID, "pageNo": 1, "pageSize": PAGE_SIZE}
            if path.endswith("/list/query"):
                params["type"] = 1
            url = host + path
            try:
                r = s.get(url, params=params, timeout=timeout)
                if getattr(r, "status_code", 0) != 200:
                    errors.append(f"{url} HTTP {getattr(r, 'status_code', 0)}")
                    continue
                arts = _articles_from(r.json())
                if arts is None:
                    errors.append(f"{url} unexpected shape")
                    continue
                return arts
            except Exception as e:
                errors.append(f"{url} {type(e).__name__}")
    log.warning("delist announcement list unreachable: %s", "; ".join(errors)[:500])
    return None


def fetch_detail(code, session=None, timeout=8):
    """Article detail dict, or None when every host failed."""
    s = session or _session()
    for host in HOSTS:
        url = host + DETAIL_PATH
        try:
            r = s.get(url, params={"articleCode": code}, timeout=timeout)
            if getattr(r, "status_code", 0) != 200:
                continue
            data = r.json()
            body = data.get("data") if isinstance(data, dict) else None
            if isinstance(body, dict):
                return body
        except Exception:
            continue
    log.warning("delist article detail unreachable: %s", code)
    return None


def _strat(eng):
    for st in getattr(eng, "strats", None) or []:
        if getattr(st, "name", None) == NAME:
            return st
    return None


def _remember(st, key, reason):
    if key not in _done_keys(st):
        st["done"].append(f"{key}|{reason}" if reason else key)
    st["armed"].pop(key, None)


def _done_keys(st):
    out = set()
    for row in st["done"]:
        out.add(row.split("|", 1)[0])
    return out


def _bracket_row(brackets_raw, symbol):
    for row in brackets_raw or []:
        if isinstance(row, dict) and row.get("symbol") == symbol:
            return row
    return None


def attach_symbol(eng, row, bracket, feed, now):
    """Load filters and a live book for a perp that is not in the monthly universe.

    Returns False when the book or the mark cannot be read. The caller leaves
    the event armed and tries again on the next minute.
    """
    sym = row["symbol"]
    try:
        si = SymbolInfo.from_exchange_info(row)
    except Exception:
        log.exception("delist exchangeInfo row for %s is unusable", sym)
        return False
    eng.si[sym] = si
    eng.ex.si[sym] = si
    if sym not in eng.ex.mkt:
        eng.ex.mkt[sym] = Market()
    eng.ex.leverage.setdefault(sym, float(eng.cfg["account"].get("default_leverage", 3)))
    if bracket:
        try:
            extra = LeverageBrackets([bracket])
            if sym in extra.table:
                eng.brackets.table[sym] = extra.table[sym]
                eng.ex.brackets.table[sym] = extra.table[sym]
        except Exception:
            log.exception("delist bracket for %s is unusable", sym)
    # Unknown volume uses the desk's 5bp tier (same bucket as a thin universe name).
    if sym not in eng.ex.slip_by_symbol:
        eng.ex.slip_by_symbol[sym] = 5e-4
    if sym not in eng.risk.slip_by_symbol:
        eng.risk.slip_by_symbol[sym] = 5e-4
    if feed is None:
        return False
    try:
        bt = feed.book_ticker(sym)
        pi = feed.premium_index(sym)
        bid, ask = float(bt["bidPrice"]), float(bt["askPrice"])
        mark = float(pi["markPrice"])
        last = float(bt["lastPrice"]) if bt.get("lastPrice") else (bid + ask) / 2.0
    except Exception:
        log.warning("delist book/mark failed for %s", sym, exc_info=True)
        return False
    if bid <= 0 or ask <= 0 or mark <= 0:
        return False
    eng.ex.mkt[sym].funding_rate = float((pi or {}).get("lastFundingRate") or 0)
    if (pi or {}).get("nextFundingTime"):
        eng.ex.mkt[sym].next_funding_time = int(pi["nextFundingTime"])
    eng.ex.update_market(sym, int(now), bid=bid, ask=ask, last=last, mark=mark)
    return True


def _discover(st, strat, articles, detail_fn, trading, now):
    # No exchangeInfo means we cannot tell TRADING from a dead contract.
    # Leave the articles unseen and try again next minute.
    if not trading:
        return
    seen = set(st["seen"])
    done = _done_keys(st)
    taken = {ev.get("symbol") for ev in st["armed"].values() if ev.get("symbol")}
    limit = int(strat.p.get("max_per_announcement", 3))
    for art in articles or []:
        if not isinstance(art, dict):
            continue
        code = str(art.get("code") or art.get("id") or "")
        title = art.get("title") or ""
        if not code:
            continue
        try:
            release = int(art.get("releaseDate") or 0)
        except (TypeError, ValueError):
            continue
        if release <= 0:
            continue
        plan = plan_entry(
            release, now, None, since_ms=st["since_ms"], hold_h=strat.p["hold_h"],
            buffer_ms=strat.buffer_ms(), grace_ms=strat.grace_ms(), max_age_ms=strat.max_age_ms())
        if plan["action"] == "ignore":
            continue
        if code in seen:
            continue
        if not is_futures_delist(title) and not is_spot_delist(title):
            st["seen"].append(code)
            seen.add(code)
            continue
        try:
            detail = detail_fn(code)
        except Exception:
            log.warning("delist detail failed for %s", code, exc_info=True)
            detail = None
        if not isinstance(detail, dict):
            # Leave it unseen so the next minute tries the body again.
            continue
        text = body_text(detail.get("body"))
        title = detail.get("title") or title
        settle = settlement_ms(text, release)
        syms, kind = article_symbols(title, text, trading, limit=limit, taken=taken)
        st["seen"].append(code)
        seen.add(code)
        if not syms:
            continue
        for sym in syms:
            key = f"{code}:{sym}"
            if key in done or key in st["armed"]:
                taken.add(sym)
                continue
            plan = plan_entry(
                release, now, settle, since_ms=st["since_ms"], hold_h=strat.p["hold_h"],
                buffer_ms=strat.buffer_ms(), grace_ms=strat.grace_ms(),
                max_age_ms=strat.max_age_ms())
            if plan["action"] in ("skip", "ignore"):
                _remember(st, key, plan["reason"])
                done.add(key)
                continue
            st["armed"][key] = {
                "symbol": sym, "code": code, "release": release, "src": kind,
                "entry_open": plan["entry_open"], "exit_ts": plan["exit_ts"],
                "settlement": plan["settlement"],
            }
            taken.add(sym)


def _enter_due(eng, strat, st, trading, brackets_raw, feed, now):
    done = _done_keys(st)
    for key, ev in list(st["armed"].items()):
        sym = ev.get("symbol")
        if not sym or key in done:
            st["armed"].pop(key, None)
            continue
        plan = plan_entry(
            ev.get("release") or 0, now, ev.get("settlement"), since_ms=None,
            hold_h=strat.p["hold_h"], buffer_ms=strat.buffer_ms(), grace_ms=strat.grace_ms(),
            max_age_ms=strat.max_age_ms())
        if plan["action"] == "wait":
            ev["entry_open"] = plan["entry_open"]
            ev["exit_ts"] = plan["exit_ts"]
            continue
        if plan["action"] != "enter":
            _remember(st, key, plan["reason"])
            continue
        held = eng.ex.get_position(sym)
        if held is not None and getattr(held, "strategy", "") == NAME:
            _remember(st, key, "open")
            continue
        if held is not None and getattr(held, "strategy", ""):
            # Another rule owns the coin. Retry until the entry window ends.
            continue
        row = trading.get(sym) or (st["filters"].get(sym) or {}).get("info")
        if trading and sym not in trading:
            _remember(st, key, "not_trading")
            continue
        if not isinstance(row, dict):
            continue
        if sym not in st["filters"]:
            st["filters"][sym] = {"info": row, "bracket": _bracket_row(brackets_raw, sym)}
        if not attach_symbol(eng, row, st["filters"][sym].get("bracket"), feed, now):
            continue
        bid, _ask = eng.ex.best_bid_ask(sym)
        sig = strat.signal_for(sym, bid, plan["entry_open"], ev.get("settlement"))
        if sig is None:
            _remember(st, key, "settlement")
            continue
        eng.handle(sig, int(now), strat)
        opened = eng.ex.get_position(sym)
        if opened is not None and getattr(opened, "strategy", "") == NAME:
            _remember(st, key, "filled")
        # A risk reject (cap, daily loss, someone else filled it) stays armed
        # until the entry grace ends, then plan_entry returns skip/late.


def _prune(eng, st):
    open_syms = set(getattr(eng.ex, "pos", {}) or {})
    armed_syms = {v.get("symbol") for v in st["armed"].values()}
    st["filters"] = {s: f for s, f in st["filters"].items() if s in open_syms or s in armed_syms}
    st["seen"] = st["seen"][-_SEEN_CAP:]
    st["done"] = st["done"][-_DONE_CAP:]
    return st


def poll_delist(eng, now, exchange_info=None, brackets_raw=None, feed=None, *,
                list_fn=None, detail_fn=None):
    """One announcement pass. Never raises. Returns the state to persist."""
    stored = normalize(getattr(eng, "delist", None))
    try:
        eng.delist = _poll(eng, int(now), exchange_info, brackets_raw, feed, stored,
                           list_fn, detail_fn)
    except Exception:
        log.exception("delist poll failed")
        eng.delist = stored
    return eng.delist


def _poll(eng, now, exchange_info, brackets_raw, feed, st, list_fn, detail_fn):
    strat = _strat(eng)
    if strat is None:
        return st
    if st["since_ms"] is None:
        st["since_ms"] = int(now)
    trading = trading_perps(exchange_info)
    if list_fn is None:
        list_fn = fetch_article_list
    if detail_fn is None:
        detail_fn = fetch_detail
    articles = None
    try:
        articles = list_fn()
    except Exception:
        log.exception("delist announcement list failed")
        articles = None
    if articles is not None:
        _discover(st, strat, articles, detail_fn, trading, now)
    _enter_due(eng, strat, st, trading, brackets_raw, feed, now)
    return _prune(eng, st)

"""One-shot manual basket. Paper only: orders go to the paper exchange, never to Binance.

`config/manual_trades.json` lists `manual_aggr_1` .. `manual_aggr_5`. Each id opens
at most once, on the first tick inside `window_h` that can score the book.
Ids that do not get a symbol on that tick are skipped. A later tick does not
loosen the volume floor, the EMA rule, or the exclude list. After the window,
anything still pending is skipped.

`manual_aggr_1` is fixed: ETHUSDT SHORT, isolated margin 1000, leverage 5.
It does not use the EMA selector. `manual_aggr_2` .. `manual_aggr_5` are auto:
4h close against EMA20, EMA50 and EMA200 (all three must agree), USDT-M
perpetuals with 24h quote volume at or above the floor, minus BTCUSDT,
ETHUSDT, anything already open, and anything another id already took (so ETH
is out of the auto book because aggr_1 holds it). `prefer` (XRPUSDT) is placed
first when it is eligible; the rest follow 24h quote volume descending.
Autos are tagged `manual_aggr`. A trade may set its own `tag`; `manual_aggr_1`
uses `manual_aggr_1`. Every leg still shares the basket.

The basket tag is `manual_aggr`. If the open legs' unrealized PnL including
fees already paid is at or below `stop_pnl`, every open leg is closed with
reason `basket_stop`.

`breakeven_at_pct` is optional and is a percent (4.5 means +4.5% in favour).
When the mark reaches it, the stop moves to the entry. `breakeven_pct` is the
same threshold as a fraction (0.045). If neither is set, the stop stays put.
"""
import json
import math
import os

from .execution.base import Order
from .execution.paper import Market
from .indicators import ema
from .symbols import SymbolInfo

HOUR_MS = 3_600_000
MINUTE_MS = 60_000
_FIELDS = ("id", "symbol", "margin", "leverage", "stop_pct", "tp_pct", "max_hold_h")


def config_path(cfg):
    root = cfg.get("_root") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(root, "config", "manual_trades.json")


def load_manual_config(path):
    with open(path) as f:
        cfg = json.load(f)
    if not isinstance(cfg, dict):
        raise ValueError("manual trades config must be an object")
    trades = cfg.get("trades")
    if not isinstance(trades, list) or not trades:
        raise ValueError("manual trades config has no trades")
    seen = set()
    for t in trades:
        if not isinstance(t, dict):
            raise ValueError("manual trade must be an object")
        for k in _FIELDS:
            if k not in t:
                raise ValueError(f"manual trade missing {k}")
        if t["id"] in seen:
            raise ValueError(f"duplicate manual trade id {t['id']}")
        seen.add(t["id"])
        symbol = str(t.get("symbol") or "auto")
        if symbol.lower() == "auto":
            t["symbol"] = "auto"
        else:
            t["symbol"] = symbol.upper()
            if not t["symbol"].endswith("USDT"):
                raise ValueError(f"{t['id']} symbol must be auto or a USDT perpetual")
            side = str(t.get("side") or "").upper()
            if side not in ("LONG", "SHORT"):
                raise ValueError(f"{t['id']} fixed symbol needs side LONG or SHORT")
            t["side"] = side
        t["breakeven_pct"] = breakeven_fraction(t)
        if t.get("tag"):
            t["tag"] = str(t["tag"])
    cfg["window_h"] = float(cfg.get("window_h", 6))
    cfg["selector"] = cfg.get("selector") or "ema_align_4h"
    cfg["prefer"] = list(cfg.get("prefer") or [])
    cfg["exclude"] = list(cfg.get("exclude") or [])
    cfg["min_quote_volume"] = float(cfg.get("min_quote_volume"))
    basket = dict(cfg.get("basket") or {})
    basket.setdefault("tag", "manual_aggr")
    basket["stop_pnl"] = float(basket.get("stop_pnl"))
    cfg["basket"] = basket
    return cfg


def trade_ids(cfg):
    return [t["id"] for t in cfg["trades"]]


def breakeven_fraction(trade):
    """Favorable move that arms a stop at the entry.

    `breakeven_at_pct` is optional and is percent points (4.5 = 4.5%).
    `breakeven_pct` is the same threshold as a fraction (0.045). When both
    are set, the percent field wins. Missing both leaves the stop where it is.
    """
    raw = trade.get("breakeven_at_pct", None)
    if raw is not None and raw != "":
        pct = float(raw)
        if not math.isfinite(pct):
            raise ValueError(f"{trade.get('id')} breakeven_at_pct must be a percent")
        return pct / 100.0
    raw = trade.get("breakeven_pct", None)
    if raw is None or raw == "":
        return 0.0
    pct = float(raw)
    if not math.isfinite(pct):
        raise ValueError(f"{trade.get('id')} breakeven_pct must be a fraction")
    return pct


def ema_align_direction(closes):
    """LONG if the last 4h close is above EMA20, EMA50 and EMA200.

    SHORT if it is below all three. Anything else, including a series shorter
    than 200 closes, is not eligible. Thresholds are not relaxed.
    """
    c = [float(x) for x in closes]
    if len(c) < 200:
        return None
    px = c[-1]
    e20 = float(ema(c, 20)[-1])
    e50 = float(ema(c, 50)[-1])
    e200 = float(ema(c, 200)[-1])
    if not all(math.isfinite(v) for v in (px, e20, e50, e200)):
        return None
    if px > e20 and px > e50 and px > e200:
        return "LONG"
    if px < e20 and px < e50 and px < e200:
        return "SHORT"
    return None


def volume_priority(rows, *, min_quote_volume, exclude, open_symbols, prefer):
    """Liquid names in selection order, before the direction filter.

    `prefer` keeps its list order at the front when those names pass the
    volume floor and the exclude / open filters. Everyone else is 24h quote
    volume descending.
    """
    exclude = set(exclude or [])
    open_symbols = set(open_symbols or [])
    prefer_rank = {s: i for i, s in enumerate(prefer or [])}
    kept = []
    for row in rows or []:
        sym = row.get("symbol")
        if not sym:
            continue
        try:
            vol = float(row.get("quote_volume"))
        except (TypeError, ValueError):
            continue
        if not math.isfinite(vol):
            continue
        if sym in exclude or sym in open_symbols or vol < float(min_quote_volume):
            continue
        kept.append({"symbol": sym, "quote_volume": vol})
    def key(item):
        if item["symbol"] in prefer_rank:
            return (0, prefer_rank[item["symbol"]], 0.0, item["symbol"])
        return (1, 0, -item["quote_volume"], item["symbol"])
    kept.sort(key=key)
    return kept


def rank_candidates(rows, *, min_quote_volume, exclude, open_symbols, chosen, prefer, directions):
    """Eligible (symbol, side, volume) rows. XRP-style `prefer` first, then volume."""
    chosen = set(chosen or [])
    directions = directions or {}
    ordered = volume_priority(rows, min_quote_volume=min_quote_volume, exclude=exclude,
                              open_symbols=set(open_symbols or []) | chosen, prefer=prefer)
    out = []
    for row in ordered:
        side = directions.get(row["symbol"])
        if side not in ("LONG", "SHORT"):
            continue
        out.append({"symbol": row["symbol"], "side": side, "quote_volume": row["quote_volume"]})
    return out


def score_directions(priority, close_fn, need):
    """Walk `priority` until `need` names have a LONG/SHORT, or the list ends.

    `close_fn` returns a close series, or None when that fetch failed. A failed
    fetch stops the walk and returns None: a lower-volume name must not take
    the slot while a higher-priority name has no direction yet. The caller
    leaves the ids pending and tries the same rules again. A fetched series
    that is not aligned is stored as None and is not eligible.
    """
    directions = {}
    got = 0
    for item in priority:
        sym = item["symbol"]
        closes = close_fn(sym)
        if closes is None:
            return None
        directions[sym] = ema_align_direction(closes)
        if directions[sym] in ("LONG", "SHORT"):
            got += 1
            if need and got >= need:
                break
    return directions


def _copy_ids(raw):
    return {str(k): dict(v) for k, v in (raw or {}).items() if isinstance(v, dict)}


def ensure_blob(cfg, prev, now):
    prev = prev or {}
    blob = {
        "window_start_ms": prev.get("window_start_ms"),
        "window_h": float(cfg.get("window_h", 6)),
        "resolved": bool(prev.get("resolved")),
        "ids": _copy_ids(prev.get("ids")),
        "contracts": {str(k): dict(v) for k, v in (prev.get("contracts") or {}).items() if isinstance(v, dict)},
        "log": [dict(x) for x in (prev.get("log") or []) if isinstance(x, dict)],
    }
    if prev.get("resolved_ms") is not None:
        blob["resolved_ms"] = int(prev["resolved_ms"])
    if blob["window_start_ms"] is None:
        blob["window_start_ms"] = int(now)
    else:
        blob["window_start_ms"] = int(blob["window_start_ms"])
    expired = not window_open(blob, now)
    for tid in trade_ids(cfg):
        if tid in blob["ids"]:
            continue
        if blob["resolved"] or expired:
            blob["ids"][tid] = {"status": "skipped", "reason": "window"}
        else:
            blob["ids"][tid] = {"status": "pending"}
    return blob


def window_open(blob, now):
    start = int(blob["window_start_ms"])
    end = start + int(round(float(blob["window_h"]) * HOUR_MS))
    return int(now) <= end


def _pending(cfg, blob):
    return [t for t in cfg["trades"] if blob["ids"].get(t["id"], {}).get("status") == "pending"]


def _skip(blob, tid, reason, **extra):
    row = dict(blob["ids"].get(tid) or {})
    row["status"] = "skipped"
    row["reason"] = reason
    row.update(extra)
    blob["ids"][tid] = row


def plan_opens(cfg, prev, now, rows, directions, open_symbols):
    """Decide every still-pending id in one call.

    `rows is None` or `directions is None` means the book could not be scored.
    Pending ids stay pending while the window is open. When the book is scored,
    every pending id is either given a plan or skipped. The next call does not
    open anything, even if more symbols would qualify later.
    """
    blob = ensure_blob(cfg, prev, now)
    if blob.get("resolved"):
        return blob, []
    if cfg.get("selector") not in (None, "ema_align_4h"):
        for t in _pending(cfg, blob):
            _skip(blob, t["id"], "selector")
        blob["resolved"] = True
        blob["resolved_ms"] = int(now)
        return blob, []
    if not window_open(blob, now):
        for t in _pending(cfg, blob):
            _skip(blob, t["id"], "window")
        blob["resolved"] = True
        blob["resolved_ms"] = int(now)
        return blob, []
    if rows is None or directions is None:
        return blob, []
    pending = _pending(cfg, blob)
    open_symbols = set(open_symbols or [])
    chosen = set()
    for row in blob["ids"].values():
        if row.get("status") in ("open", "reserved") and row.get("symbol"):
            chosen.add(row["symbol"])
    ranked = rank_candidates(
        rows, min_quote_volume=cfg["min_quote_volume"], exclude=cfg["exclude"],
        open_symbols=open_symbols, chosen=chosen, prefer=cfg["prefer"], directions=directions)
    pool = list(ranked)
    used = set(open_symbols) | chosen
    plans = []
    basket_tag = (cfg.get("basket") or {}).get("tag") or "manual_aggr"
    for trade in pending:
        spec_sym = str(trade.get("symbol") or "auto")
        # A named symbol is a fixed ticket. It does not consult the EMA selector
        # or the volume floor. Auto ids never see that symbol afterwards.
        if spec_sym != "auto":
            side = str(trade.get("side") or "").upper()
            if side not in ("LONG", "SHORT"):
                _skip(blob, trade["id"], "bad_side", symbol=spec_sym)
                continue
            if spec_sym in used:
                _skip(blob, trade["id"], "position_open", symbol=spec_sym)
                continue
            pick = {"symbol": spec_sym, "side": side}
        else:
            pick = None
            while pool:
                cand = pool.pop(0)
                if cand["symbol"] in used:
                    continue
                pick = cand
                break
            if pick is None:
                _skip(blob, trade["id"], "fewer_eligible")
                continue
        used.add(pick["symbol"])
        blob["ids"][trade["id"]] = {"status": "reserved", "symbol": pick["symbol"], "side": pick["side"]}
        plans.append({
            "id": trade["id"], "symbol": pick["symbol"], "side": pick["side"],
            "margin": float(trade["margin"]), "leverage": float(trade["leverage"]),
            "stop_pct": float(trade["stop_pct"]), "tp_pct": float(trade["tp_pct"]),
            "breakeven_pct": breakeven_fraction(trade), "max_hold_h": float(trade["max_hold_h"]),
            "tag": str(trade.get("tag") or basket_tag),
        })
    blob["resolved"] = True
    blob["resolved_ms"] = int(now)
    return blob, plans


def hold_exit_ts(opened_ts, hours):
    """First 1m open at or after the hold deadline. Replay and expire_time_stops key on it."""
    deadline = int(opened_ts) + int(round(float(hours) * HOUR_MS))
    return ((deadline + MINUTE_MS - 1) // MINUTE_MS) * MINUTE_MS


def _sign(side):
    if side in (1, "LONG", "BUY"):
        return 1
    if side in (-1, "SHORT", "SELL"):
        return -1
    raise ValueError(f"bad side {side}")


def leg_pnl(side, qty, entry, mark, fees):
    """Unrealized price PnL minus fees already paid on the position."""
    return _sign(side) * float(qty) * (float(mark) - float(entry)) - float(fees or 0)


def basket_id_set(cfg):
    return set(trade_ids(cfg))


def in_basket(position, id_set):
    if getattr(position, "strategy", "") in id_set:
        return True
    return (getattr(position, "meta", None) or {}).get("manual_id") in id_set


def basket_open_pnl(ex, id_set):
    """Sum of open basket legs. None when any of them has no mark yet."""
    total = 0.0
    held = []
    for sym, p in ex.pos.items():
        if not in_basket(p, id_set):
            continue
        mark = ex.mark(sym)
        if mark is None or not math.isfinite(mark) or mark <= 0:
            return None, []
        total += leg_pnl(p.side, p.qty, p.entry_price, mark, p.fees)
        held.append(p)
    return total, held


def _flatten(ex, symbol, now, tag):
    p = ex.get_position(symbol)
    if p is None:
        return
    side = "SELL" if p.side > 0 else "BUY"
    ex.place_order(Order(symbol, side, "MARKET", p.qty, reduce_only=True, tag=tag), int(now))


def open_manual_position(ex, rec, plan, now, working_type="CONTRACT_PRICE"):
    """Market-open one id. Isolated margin is notional/leverage, notional = margin * leverage."""
    symbol, side = plan["symbol"], plan["side"]
    m = ex.mkt.get(symbol)
    if m is None or not m.bid or not m.ask:
        return None
    if ex.get_position(symbol) is not None:
        return None
    ref = m.ask if side == "LONG" else m.bid
    if ref <= 0:
        return None
    notional = float(plan["margin"]) * float(plan["leverage"])
    qty = notional / ref
    ex.set_leverage(symbol, plan["leverage"])
    order_side = "BUY" if side == "LONG" else "SELL"
    opened = ex.place_order(Order(symbol, order_side, "MARKET", qty, tag=plan.get("tag") or "manual_aggr"), int(now))
    if opened.status != "FILLED":
        return None
    p = ex.get_position(symbol)
    if p is None:
        return None
    entry = float(p.entry_price)
    d = 1 if side == "LONG" else -1
    si = ex.si[symbol]
    stop = si.round_price(entry * (1 - d * float(plan["stop_pct"])))
    tp = si.round_price(entry * (1 + d * float(plan["tp_pct"])))
    exit_side = "SELL" if side == "LONG" else "BUY"
    slo = ex.place_order(Order(symbol, exit_side, "STOP_MARKET", stop_price=stop, close_position=True,
                               working_type=working_type, tag="SL"), int(now))
    if slo.status == "REJECTED":
        _flatten(ex, symbol, now, "SL_REJECT")
        return None
    tpo = ex.place_order(Order(symbol, exit_side, "TAKE_PROFIT_MARKET", stop_price=tp, close_position=True,
                               working_type=working_type, tag="TP"), int(now))
    if tpo.status == "REJECTED":
        _flatten(ex, symbol, now, "TP_REJECT")
        return None
    p = ex.get_position(symbol)
    if p is None:
        return None
    be = float(p.entry_price)
    exit_ts = hold_exit_ts(now, plan["max_hold_h"])
    p.meta.update({
        "sl": stop, "tp": tp, "breakeven": be, "breakeven_pct": float(plan["breakeven_pct"]),
        "breakeven_done": False, "manual_id": plan["id"], "basket": "manual_aggr",
        "exit_ts": exit_ts, "reason": plan["id"],
    })
    record = {
        "id": plan["id"], "symbol": symbol, "side": side, "entry": be,
        "stop": stop, "tp": tp, "breakeven": be, "opened_ts": int(now), "status": "open",
    }
    if rec is not None:
        rec.on_event({
            "ts": int(now), "type": "MANUAL_OPEN", "symbol": symbol,
            "id": plan["id"], "side": side, "entry": be, "stop": stop, "tp": tp, "breakeven": be,
            "msg": (f"{plan['id']} {side} {symbol} entry {be} stop {stop} tp {tp} breakeven {be}"),
        })
    return record


def execute_plans(ex, rec, plans, now, blob, working_type="CONTRACT_PRICE"):
    """Fill the plans from this tick. A reject skips that id. It is not tried again."""
    blob.setdefault("log", [])
    blob.setdefault("contracts", {})
    for plan in plans:
        tid = plan["id"]
        if ex.si.get(plan["symbol"]) is None:
            _skip(blob, tid, "no_contract", symbol=plan["symbol"], side=plan["side"])
            _note_skip(rec, now, tid, plan["symbol"], "no_contract")
            continue
        record = open_manual_position(ex, rec, plan, now, working_type=working_type)
        if record is None:
            _skip(blob, tid, "rejected", symbol=plan["symbol"], side=plan["side"])
            _note_skip(rec, now, tid, plan["symbol"], "rejected")
            continue
        blob["ids"][tid] = record
        info = ex.si.get(plan["symbol"])
        if info is not None:
            blob["contracts"][plan["symbol"]] = info.to_dict()
        blob["log"].append({k: record[k] for k in ("id", "symbol", "side", "entry", "stop", "tp", "breakeven", "opened_ts")})
    return blob


def _note_skip(rec, now, tid, symbol, reason):
    if rec is None:
        return
    rec.on_event({"ts": int(now), "type": "MANUAL_SKIP", "symbol": symbol or "",
                  "id": tid, "msg": f"{tid} skipped: {reason}"})


def sync_closed(ex, blob, id_set):
    """An id whose position is gone (stop, target, time) stays closed. It does not re-enter."""
    for tid in id_set:
        row = blob["ids"].get(tid) or {}
        if row.get("status") != "open":
            continue
        sym = row.get("symbol")
        p = ex.get_position(sym) if sym else None
        if p is not None and in_basket(p, {tid}):
            continue
        closed = dict(row)
        closed["status"] = "closed"
        blob["ids"][tid] = closed


def arm_breakeven(ex, now, id_set, working_type="CONTRACT_PRICE"):
    """Move the stop to the entry once the mark is `breakeven_pct` through the trade."""
    for sym, p in list(ex.pos.items()):
        if not in_basket(p, id_set):
            continue
        if p.meta.get("breakeven_done"):
            continue
        try:
            pct = float(p.meta.get("breakeven_pct") or 0)
        except (TypeError, ValueError):
            continue
        if pct <= 0:
            continue
        mark = ex.mark(sym)
        if not mark or not math.isfinite(mark):
            continue
        entry = float(p.entry_price)
        if p.side > 0 and mark < entry * (1 + pct):
            continue
        if p.side < 0 and mark > entry * (1 - pct):
            continue
        old = [o for o in ex.open_orders(sym) if o.type == "STOP_MARKET"]
        for o in old:
            ex.cancel_order(o.id, int(now))
        exit_side = "SELL" if p.side > 0 else "BUY"
        stop = ex.si[sym].round_price(entry)
        placed = ex.place_order(Order(sym, exit_side, "STOP_MARKET", stop_price=stop, close_position=True,
                                      working_type=working_type, tag="SL"), int(now))
        if placed.status == "REJECTED":
            for prev in old:
                ex.place_order(Order(sym, prev.side, "STOP_MARKET", stop_price=prev.stop_price,
                                     close_position=True, working_type=prev.working_type,
                                     tag=prev.tag or "SL"), int(now))
            continue
        p.meta["sl"] = stop
        p.meta["breakeven"] = stop
        p.meta["breakeven_done"] = True


def apply_basket_stop(ex, rec, blob, cfg, now):
    """Close every open basket leg when their combined unrealized PnL including fees is <= stop."""
    id_set = basket_id_set(cfg)
    stop = float(cfg["basket"]["stop_pnl"])
    pnl, held = basket_open_pnl(ex, id_set)
    if pnl is None or not held or pnl > stop:
        return False
    symbols = [p.symbol for p in held]
    for p in held:
        if ex.get_position(p.symbol) is None:
            continue
        side = "SELL" if p.side > 0 else "BUY"
        ex.place_order(Order(p.symbol, side, "MARKET", p.qty, reduce_only=True, tag="basket_stop"), int(now))
        tid = p.strategy if p.strategy in id_set else (p.meta or {}).get("manual_id")
        if tid in blob.get("ids", {}) and ex.get_position(p.symbol) is None:
            row = dict(blob["ids"][tid])
            row["status"] = "closed"
            row["exit_reason"] = "basket_stop"
            blob["ids"][tid] = row
    if rec is not None:
        rec.on_event({
            "ts": int(now), "type": "basket_stop", "symbol": ",".join(symbols),
            "msg": f"manual_aggr basket_stop pnl {pnl:.2f} <= {stop:.2f} closed {','.join(symbols)}",
        })
    return True


def maintain(ex, rec, cfg, blob, now, working_type="CONTRACT_PRICE"):
    """Sync closes, then the basket stop, then breakeven. No new entries."""
    id_set = basket_id_set(cfg)
    sync_closed(ex, blob, id_set)
    apply_basket_stop(ex, rec, blob, cfg, now)
    arm_breakeven(ex, now, id_set, working_type=working_type)
    return blob


def prune_contracts(ex, blob):
    blob["contracts"] = {s: c for s, c in (blob.get("contracts") or {}).items() if s in ex.pos}
    return blob


def attach_symbol(ex, info):
    ex.si[info.symbol] = info
    ex.mkt.setdefault(info.symbol, Market())
    ex.leverage.setdefault(info.symbol, 5)
    return info


def merge_contracts(infos, blob):
    """Put contracts stored with the basket back on the exchange so a restart can load them."""
    out = dict(infos or {})
    fields = list(SymbolInfo.__dataclass_fields__)
    for sym, row in ((blob or {}).get("contracts") or {}).items():
        if sym in out or not isinstance(row, dict):
            continue
        try:
            out[sym] = SymbolInfo(**{k: row[k] for k in fields})
        except Exception:
            continue
    return out


def contract_symbols(state):
    blob = ((state or {}).get("engine") or {}).get("manual") or {}
    if not isinstance(blob, dict):
        return []
    return [s for s in (blob.get("contracts") or {}) if isinstance(s, str)]


def ticker_to_rows(ticker_rows, perp_symbols):
    """24h ticker rows limited to the USDT-M perpetual set. None ticker → None (try again)."""
    if ticker_rows is None:
        return None
    perp_symbols = set(perp_symbols or [])
    rows = []
    for r in ticker_rows:
        if not isinstance(r, dict):
            continue
        sym = r.get("symbol")
        if sym not in perp_symbols:
            continue
        try:
            vol = float(r.get("quoteVolume"))
        except (TypeError, ValueError):
            continue
        if not math.isfinite(vol) or vol < 0:
            continue
        rows.append({"symbol": sym, "quote_volume": vol})
    return rows


def usdt_perp_symbols(exchange_info):
    out = set()
    for s in (exchange_info or {}).get("symbols") or []:
        if not isinstance(s, dict):
            continue
        if s.get("status") != "TRADING":
            continue
        if s.get("contractType") != "PERPETUAL":
            continue
        if s.get("quoteAsset") != "USDT":
            continue
        if s.get("symbol"):
            out.add(s["symbol"])
    return out

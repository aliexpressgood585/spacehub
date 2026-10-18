"""delist_short: short a USDT perp when Binance announces its delisting.

Research rule E2 (streamE/delist.py, events(0, 72, -1, 0.2)):
  entry at the OPEN of the first 1h bar whose open is strictly after the CMS
  release timestamp (searchsorted side='right', delay D=0). That is the next
  hour even when the release falls exactly on an hour.
  hold 72 of those hours, exit at that bar's close (entry open + 72h).
  stop is 20% above the raw entry (short). Size is 5% of equity notional.

The live desk adds the settlement exit the research simulator did not have:
leave at least 30 minutes before the announced futures settlement when that
is earlier than the 72h close. Catalog 161 also carries margin, loan, and
monitoring/seed-tag notices. Only two title families are trades:
"Binance Futures Will Delist ..." (USDT-M names in the title and body) and
"Binance Will Delist X, Y, ... on <date>" (each spot token mapped to its
TRADING USDT perp, including a 1000-prefixed contract). At most three perps
per announcement. A symbol named by both families is taken once.

on_bar stays empty. The desk polls the announcement feed once a minute and
hands entries to the engine, so a 1h strategy cycle cannot open these late.
"""
import json
import re
from datetime import datetime, timezone

from .base import Strategy, Signal, register

NAME = "delist_short"
HOUR_MS = 3_600_000
MINUTE_MS = 60_000

# Futures delist notices name the contracts in the body. Spot notices name
# tokens in the title; a token is tradable only when that USDT perp exists.
FUT_USDT_RE = re.compile(r"\b([0-9A-Z]{2,20}USDT)\b")
SPOT_TITLE_RE = re.compile(r"Binance Will Delist (.+?) on \d{4}-\d{2}-\d{2}")
# The settlement clock is the UTC stamp after "conduct an automatic settlement".
# "avoid automatic settlement" is followed by the earlier time when new positions
# are banned (about 30 minutes before the real settlement) and must not win.
# Bodies are a JSON document or HTML; the caller passes flattened text.
SETTLE_RE = re.compile(
    r"conduct an automatic settlement.{0,500}?(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})\s*\(UTC\)",
    re.IGNORECASE | re.DOTALL)
TOKEN_SPLIT_RE = re.compile(r",\s*|\s+and\s+|\s*&amp;\s*|\s*&\s*", re.IGNORECASE)
# Adding or extending a monitoring/seed tag is a catalog neighbor, not a delist.
TAG_NOTICE_RE = re.compile(r"\b(?:monitoring|seed)\s+tag\b", re.IGNORECASE)
MAX_PER_ANNOUNCEMENT = 3


def is_tag_notice(title):
    """True for a monitoring-tag or seed-tag announcement. Those are not delistings."""
    return bool(TAG_NOTICE_RE.search(title or ""))


def is_futures_delist(title):
    """'Binance Futures Will Delist ...' (research: both words in the title)."""
    text = title or ""
    if is_tag_notice(text):
        return False
    return "Futures" in text and "Delist" in text


def is_spot_delist(title):
    if is_tag_notice(title):
        return False
    return bool(SPOT_TITLE_RE.match(title or ""))


def spot_tokens(title):
    m = SPOT_TITLE_RE.match(title or "")
    if not m:
        return []
    out = []
    for tok in TOKEN_SPLIT_RE.split(m.group(1)):
        word = tok.strip().split(" ")[0].strip()
        if word:
            out.append(word)
    return out


def futures_symbols(title, text):
    return sorted(set(FUT_USDT_RE.findall(f"{text or ''} {title or ''}")))


def candidate_perps(token):
    """Spot token -> USDT perp names. 1000-prefix contracts are listed that way."""
    tok = (token or "").strip().upper()
    if not tok or not re.fullmatch(r"[0-9A-Z]{1,15}", tok):
        return []
    return [tok + "USDT", "1000" + tok + "USDT"]


def body_text(body):
    """CMS body (JSON document, JSON string, or HTML) -> plain text."""
    if body is None:
        return ""
    if isinstance(body, (dict, list)):
        return _walk_text(body)
    if isinstance(body, str):
        s = body.strip()
        if s.startswith("{") or s.startswith("["):
            try:
                return _walk_text(json.loads(s))
            except (ValueError, TypeError):
                pass
        return re.sub(r"<[^>]+>", " ", s)
    return str(body)


def _walk_text(node):
    acc = []

    def rec(n):
        if isinstance(n, dict):
            if n.get("node") == "text" and n.get("text"):
                acc.append(str(n["text"]))
            elif isinstance(n.get("text"), str) and "child" not in n:
                acc.append(n["text"])
            for c in n.get("child") or []:
                rec(c)
        elif isinstance(n, list):
            for c in n:
                rec(c)

    rec(node)
    return "\n".join(acc)


def trading_perps(exchange_info):
    """symbol -> exchangeInfo row, USDT perpetual, status TRADING only."""
    out = {}
    for row in (exchange_info or {}).get("symbols") or []:
        if not isinstance(row, dict):
            continue
        if (row.get("quoteAsset") == "USDT" and row.get("contractType") == "PERPETUAL"
                and row.get("status") == "TRADING" and row.get("symbol")):
            out[row["symbol"]] = row
    return out


def cap_symbols(symbols, limit=MAX_PER_ANNOUNCEMENT, volumes=None):
    """At most `limit` names. With 24h quote volume, the largest three win.

    Without volume the announcement order is kept (futures names are already
    sorted, spot names follow the title).
    """
    rows = []
    seen = set()
    for sym in symbols or []:
        if not sym or sym in seen:
            continue
        seen.add(sym)
        rows.append(sym)
    if volumes:
        def rank(sym):
            raw = volumes.get(sym) if isinstance(volumes, dict) else None
            try:
                vol = float(raw)
            except (TypeError, ValueError):
                vol = float("-inf")
            if vol != vol:
                vol = float("-inf")
            return (-vol, sym)
        rows.sort(key=rank)
    if limit is None:
        return rows
    return rows[:max(0, int(limit))]


def article_symbols(title, text, trading, *, limit=MAX_PER_ANNOUNCEMENT, volumes=None, taken=None):
    """Perp symbols this article may short. `trading` is a set or dict of TRADING perps.

    `taken` drops symbols already claimed by another announcement, so a coin
    named in both a spot notice and a futures notice is one position.
    """
    if is_tag_notice(title):
        return [], None
    if is_futures_delist(title):
        found = futures_symbols(title, text)
        kind = "fut"
    elif is_spot_delist(title):
        found = []
        for tok in spot_tokens(title):
            # One perp per spot token: the plain USDT contract when it trades,
            # otherwise the 1000-prefixed contract (1000XUSDT).
            for sym in candidate_perps(tok):
                if sym in trading and sym not in found:
                    found.append(sym)
                    break
        kind = "spot"
    else:
        return [], None
    claimed = set(taken or ())
    kept = [s for s in found if s in trading and s not in claimed]
    return cap_symbols(kept, limit, volumes), kind


def entry_open_ms(release_ms):
    """Open of the first 1h bar strictly after `release_ms`."""
    return (int(release_ms) // HOUR_MS + 1) * HOUR_MS


def _utc_ms(year, month, day, hour, minute):
    return int(datetime(year, month, day, hour, minute, tzinfo=timezone.utc).timestamp() * 1000)


def settlement_ms(text, release_ms=None):
    """Earliest automatic-settlement UTC time after the release, or None."""
    found = []
    for m in SETTLE_RE.finditer(text or ""):
        try:
            ts = _utc_ms(int(m.group(1)[0:4]), int(m.group(1)[5:7]), int(m.group(1)[8:10]),
                         int(m.group(2)), int(m.group(3)))
        except (ValueError, OverflowError):
            continue
        if release_ms is not None and ts <= int(release_ms):
            continue
        found.append(ts)
    return min(found) if found else None


def exit_ms(entry_open, settlement=None, hold_h=72, buffer_ms=30 * MINUTE_MS):
    """Close at entry+hold, or at the minute open at least `buffer` before settlement.

    The earlier of the two wins. The settlement exit is floored to a minute
    open so the 1m time-stop is not later than the buffer.
    """
    t = int(entry_open) + int(hold_h) * HOUR_MS
    if settlement is not None:
        early = (int(settlement) - int(buffer_ms)) // MINUTE_MS * MINUTE_MS
        if early < t:
            t = early
    return t


def stop_distance(entry_px, frac=0.20):
    """Absolute distance that places a short stop `frac` above the entry."""
    return float(entry_px) * float(frac)


def plan_entry(release_ms, now_ms, settlement=None, *, since_ms=None, hold_h=72,
               buffer_ms=30 * MINUTE_MS, grace_ms=3 * MINUTE_MS, max_age_ms=2 * HOUR_MS):
    """What to do with one announcement at `now_ms`.

    action is enter / wait / skip / ignore. ignore = older than the first-start
    lookback (no backfill). skip = seen, but not a trade (too late, or the
    settlement exit is already due).
    """
    release_ms = int(release_ms)
    now_ms = int(now_ms)
    entry = entry_open_ms(release_ms)
    exit_at = exit_ms(entry, settlement, hold_h, buffer_ms)
    base = {"entry_open": entry, "exit_ts": exit_at, "release": release_ms,
            "settlement": None if settlement is None else int(settlement)}
    if since_ms is not None and release_ms < int(since_ms) - int(max_age_ms):
        return {**base, "action": "ignore", "reason": "before_start"}
    if exit_at <= entry:
        return {**base, "action": "skip", "reason": "settlement"}
    if now_ms < entry:
        return {**base, "action": "wait", "reason": "before_entry"}
    if now_ms > entry + int(grace_ms):
        return {**base, "action": "skip", "reason": "late"}
    if exit_at <= now_ms:
        return {**base, "action": "skip", "reason": "exit_passed"}
    return {**base, "action": "enter", "reason": "entry_open"}


@register(NAME)
class DelistShort(Strategy):
    """Registered so the desk can construct it. Entries come from the poller."""

    def __init__(self, params):
        params = params or {}
        super().__init__(params)
        self.timeframe = params.get("timeframe", "1h")
        self.p = {
            "hold_h": int(params.get("hold_h", 72)),
            "stop_frac": float(params.get("stop_frac", 0.20)),
            "notional_frac": float(params.get("notional_frac", 0.05)),
            "settle_buffer_min": int(params.get("settle_buffer_min", 30)),
            "max_age_h": float(params.get("max_age_h", 2)),
            "entry_grace_min": float(params.get("entry_grace_min", 3)),
            "leverage": float(params.get("leverage", 3)),
            "max_per_announcement": int(params.get("max_per_announcement", MAX_PER_ANNOUNCEMENT)),
        }

    def on_bar(self, ctx):
        return []

    def buffer_ms(self):
        return int(self.p["settle_buffer_min"]) * MINUTE_MS

    def grace_ms(self):
        return int(float(self.p["entry_grace_min"]) * MINUTE_MS)

    def max_age_ms(self):
        return int(float(self.p["max_age_h"]) * HOUR_MS)

    def signal_for(self, symbol, entry_px, entry_open, settlement):
        exit_at = exit_ms(entry_open, settlement, self.p["hold_h"], self.buffer_ms())
        if exit_at <= int(entry_open):
            return None
        return Signal(
            symbol, "OPEN_SHORT",
            stop_distance(entry_px, self.p["stop_frac"]), 0.0, self.p["leverage"],
            "delist short",
            {"strategy": NAME, "target_weight": self.p["notional_frac"],
             "exit_ts": int(exit_at), "entry_open": int(entry_open),
             "settlement_ms": None if settlement is None else int(settlement)})

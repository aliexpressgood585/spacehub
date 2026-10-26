"""Opportunity scanner for the short-EMA + fade book.

The plain book (ema_fast_4h on TREND, bb_rsi_4h on RANGE, BTC anchor) is the
OOS variant in reports/regime_oos.json under regime_fast_mr. On five coins
that book trades about once a week. This scanner does not invent a new
indicator. It does three things, all off unless config scanner.enabled:

  * entry universe = the first top_n names of the desk's already-cached
    monthly volume rank (no exchange re-rank)
  * a coin in TREND may take the fast EMA sleeve and a coin in RANGE may take
    the fade at the same time (the anchor CHAOS label still stands the book aside)
  * on one 4h close, at most max_new_per_bar new entries, highest score first

The fast EMA sleeve may also buy/sell a fresh tag of EMA(fast) while the
10/40 state is already aligned. That entry is still ema_fast_4h. A pullback
is closed after pullback_hold_bars closed 4h bars; a cross keeps the
backtested flip/stop exit. Scores are fixed, not fit on the OOS window:

  cross    |EMA10-EMA40|/ATR + 1
  pullback |EMA10-EMA40|/ATR
  fade     |RSI-50|/50
"""
import numpy as np

CORE = ("BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT")


def trend_strength(fast, slow, atr_v):
    if atr_v is None or not np.isfinite(atr_v) or atr_v <= 0:
        return 0.0
    if not (np.isfinite(fast) and np.isfinite(slow)):
        return 0.0
    return abs(float(fast) - float(slow)) / float(atr_v)


def pullback_side(high, low, close, fast, slow):
    """+1 long, -1 short, 0 none. Fresh tag of the fast EMA inside an aligned trend.

    The previous bar's extreme is still on the far side of the fast EMA, and
    this bar's extreme tags it while the close holds the trend side.
    """
    if min(len(high), len(low), len(close), len(fast), len(slow)) < 2:
        return 0
    f1, f2 = float(fast[-1]), float(fast[-2])
    s1 = float(slow[-1])
    hi1, hi2 = float(high[-1]), float(high[-2])
    lo1, lo2 = float(low[-1]), float(low[-2])
    c1 = float(close[-1])
    vals = (f1, f2, s1, hi1, hi2, lo1, lo2, c1)
    if not all(np.isfinite(v) for v in vals):
        return 0
    if f1 > s1 and lo1 <= f1 and lo2 > f2 and c1 > f1:
        return 1
    if f1 < s1 and hi1 >= f1 and hi2 < f2 and c1 < f1:
        return -1
    return 0


class OpportunityScanner:
    def __init__(self, cfg):
        sc = (cfg or {}).get("scanner") or {}
        self.enabled = bool(sc.get("enabled"))
        self.top_n = max(1, int(sc.get("top_n") or 18))
        self.cap = max(self.top_n, int(sc.get("cap") or 20))
        self.max_new = max(1, int(sc.get("max_new_per_bar") or 2))
        self.per_coin = bool(sc.get("per_coin"))
        self.pullback = bool(sc.get("pullback"))
        self.pullback_hold_bars = int(sc.get("pullback_hold_bars") or 12)
        self.symbols = [str(s) for s in (sc.get("symbols") or []) if s][:self.cap]

    def from_rows(self, rows):
        """First top_n of an already-ranked universe. Does not sort or fetch.

        `rows` is the desk cache, rank 1 first. Core names that the cache
        still lists past top_n are appended until `cap`, so the original five
        are not dropped by a rank that sits them at 19. Missing core names
        are not invented.
        """
        picked = []
        seen = set()
        listed = []
        for r in rows or []:
            if not isinstance(r, dict):
                continue
            sym = str(r.get("symbol") or "")
            if not sym or sym in seen:
                continue
            seen.add(sym)
            listed.append(sym)
            if len(picked) < self.top_n:
                picked.append(sym)
        for sym in CORE:
            if sym in seen and sym not in picked and len(picked) < self.cap:
                picked.append(sym)
        return picked


def arm(eng, cfg):
    """Attach the scanner to an engine. No-op when it is off.

    Pullback lives on the ema_fast_4h instance only. The plain OOS book leaves
    the flag off, so its entries stay the cross.
    """
    sc = (cfg or {}).get("scanner") or {}
    eng.scanner = OpportunityScanner(cfg) if sc.get("enabled") else None
    if eng.scanner is None:
        return eng.scanner
    for st in eng.strats:
        if st.name == "ema_fast_4h" and eng.scanner.pullback:
            st.p["pullback"] = True
            st.p["pullback_hold_bars"] = eng.scanner.pullback_hold_bars
    if eng.scanner.symbols:
        _set_sleeves(eng, cfg, eng.scanner.symbols)
    return eng.scanner


def apply_cached_universe(eng, cfg, rows):
    """Point the fast sleeves at the cached rank. None when the scanner is off.

    Caller passes the rows `choose_universe` already resolved. This function
    does not call rank_live.
    """
    scn = getattr(eng, "scanner", None)
    if scn is None or not scn.enabled:
        return None
    picked = scn.from_rows(rows)
    if not picked:
        return None
    scn.symbols = picked
    _set_sleeves(eng, cfg, picked)
    sel = getattr(eng, "selector", None)
    if sel is not None:
        sel.watch.update(picked)
    return picked


def _sleeve_names(cfg):
    sel = (cfg or {}).get("regime_selector") or {}
    names = []
    trend = sel.get("trend_strategy")
    rng = sel.get("range_strategy")
    if trend:
        names.append(str(trend))
    if rng and str(rng) not in names:
        names.append(str(rng))
    return names


def _set_sleeves(eng, cfg, symbols):
    allow = set(symbols)
    for name in _sleeve_names(cfg):
        eng.entry_symbols[name] = set(allow)

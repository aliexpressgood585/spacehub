"""Regime selector: which strategy may open, and when a sleeve is stood down.

The desk attaches one of these to the engine. With `enabled: false` it still
classifies and records state['regime'], and it does not block ema_trend_4h.
Global risk limits are not read from here except the account-wide position
cap, which is applied only while the selector is on so two sleeves cannot
each open a full book.
"""
from .regime import H4_MS, classify_series, params_from_cfg, window_breach
from .strategies.base import Signal


def _num(v, nd=4):
    if v is None:
        return None
    return round(float(v), nd)


class StrategySelector:
    def __init__(self, cfg, saved=None):
        block = (cfg or {}).get("regime_selector") or {}
        self.block = block
        self.p = params_from_cfg(cfg)
        self.enabled = bool(block.get("enabled"))
        self.anchor = str(block.get("anchor") or "BTCUSDT")
        self.timeframe = str(block.get("timeframe") or "4h")
        self.trend_strategy = str(block.get("trend_strategy") or "ema_trend_4h")
        rng = block.get("range_strategy")
        self.range_strategy = str(rng) if rng else None
        self.primary = ((cfg or {}).get("strategy") or {}).get("name") or self.trend_strategy
        self.max_positions = int(((cfg or {}).get("risk") or {}).get("max_concurrent_positions") or 3)
        sc = (cfg or {}).get("scanner") or {}
        # Per-coin routing is part of the scanner. The plain book keeps the anchor gate.
        self.per_coin = bool(sc.get("enabled") and sc.get("per_coin"))
        self.demote_cfg = block.get("demote") or {}
        self.watch = {self.anchor}
        for row in (cfg or {}).get("strategies") or []:
            if not row or not row.get("name"):
                continue
            if row["name"] in (self.trend_strategy, self.range_strategy):
                for s in row.get("symbols") or []:
                    if s:
                        self.watch.add(str(s))
        for s in sc.get("symbols") or []:
            if s:
                self.watch.add(str(s))
        saved = saved or {}
        self.market = saved.get("market") or None
        self.bar_ts = int(saved["bar_ts"]) if saved.get("bar_ts") else None
        self.since_ts = int(saved["since_ts"]) if saved.get("since_ts") else None
        self.symbols = {str(k): v for k, v in (saved.get("symbols") or {}).items() if v}
        self.demotions = {}
        for name, rec in (saved.get("demotions") or {}).items():
            if isinstance(rec, dict) and rec.get("since_ts") is not None:
                self.demotions[str(name)] = dict(rec)
        # Older snapshots stored only the names.
        for name in saved.get("demoted") or []:
            if name not in self.demotions:
                self.demotions[str(name)] = {"since_ts": saved.get("updated_ts") or 0, "reason": "restored"}
        self.anchor_adx = saved.get("anchor_adx")
        self.anchor_atr_pct = saved.get("anchor_atr_pct")
        self.classified = bool(saved.get("classified"))
        self._active_published = saved.get("active_strategy")

    @property
    def demoted(self):
        return sorted(self.demotions)

    def menu_strategy(self):
        """What the market regime would run, before a demotion blanks it."""
        if self.market == "TREND":
            return self.trend_strategy
        if self.market == "RANGE":
            return self.range_strategy
        return None

    def active_strategy(self):
        if not self.enabled:
            return self.primary
        name = self.menu_strategy()
        if not name or name in self.demotions:
            return None
        return name

    def allow(self, strategy, symbol, n_positions):
        if not self.enabled:
            return True, ""
        if strategy in self.demotions:
            return False, f"{strategy} demoted"
        if self.market == "CHAOS":
            return False, "CHAOS: stand aside"
        sym = self.symbols.get(symbol)
        if sym == "CHAOS":
            return False, f"{symbol} CHAOS: stand aside"
        if self.per_coin:
            if sym == "TREND":
                want, label = self.trend_strategy, sym
            elif sym == "RANGE":
                want, label = self.range_strategy, sym
            else:
                want, label = None, sym
        else:
            want, label = self.menu_strategy(), self.market
        if not want:
            if self.per_coin:
                return False, f"{symbol} regime {sym or 'UNKNOWN'}"
            return False, f"regime {self.market or 'UNKNOWN'}: stand aside"
        if strategy != want:
            return False, f"regime {label} uses {want}"
        if not self.per_coin and sym != self.market:
            return False, f"{symbol} regime {sym or 'UNKNOWN'}"
        if int(n_positions) >= self.max_positions:
            return False, "max concurrent positions"
        return True, ""

    def gate(self, strategy, symbol, sigs, n_positions):
        if not self.enabled:
            return sigs
        out = []
        for s in sigs:
            if s.action not in ("OPEN_LONG", "OPEN_SHORT"):
                out.append(s)
                continue
            ok, why = self.allow(strategy, symbol, n_positions)
            if ok:
                out.append(s)
            else:
                out.append(Signal(symbol, "INFO", reason=why, info={
                    "regime": self.market, "blocked": strategy}))
        return out

    def sync(self, books, ts):
        """Refold watched symbols from bars already closed at `ts`.

        Returns REGIME_CHANGE events. Does nothing when the anchor's latest
        closed 4h bar is the one already published, so a 1h decision inside
        that bar does not recompute.
        """
        ts = int(ts)
        anchor = books.get(self.anchor)
        if not anchor or len(anchor["close"]) < self.p.min_history:
            return []
        bar_ts = int(anchor["close_time"][-1]) + 1
        if bar_ts > ts:
            # Caller handed a series that includes a bar still open at ts.
            keep = anchor["close_time"] + 1 <= ts
            if not keep.any():
                return []
            anchor = {k: v[keep] for k, v in anchor.items()}
            if len(anchor["close"]) < self.p.min_history:
                return []
            bar_ts = int(anchor["close_time"][-1]) + 1
        if self.bar_ts is not None and bar_ts <= self.bar_ts:
            return []
        if self.bar_ts is not None and self.bar_ts <= ts < self.bar_ts + H4_MS and bar_ts == self.bar_ts:
            return []
        old_market = self.market
        old_symbols = dict(self.symbols)
        new_symbols = {}
        anchor_stats = None
        for sym in sorted(self.watch):
            book = books.get(sym)
            if book is None:
                continue
            if int(book["close_time"][-1]) + 1 > bar_ts:
                keep = book["close_time"] + 1 <= bar_ts
                if not keep.any():
                    continue
                book = {k: v[keep] for k, v in book.items()}
            folded = classify_series(book["high"], book["low"], book["close"],
                                     book["close_time"] + 1, self.p)
            if not folded["regime"]:
                continue
            new_symbols[sym] = folded["regime"]
            if sym == self.anchor:
                anchor_stats = folded
        if anchor_stats is None:
            return []
        self.symbols = new_symbols
        self.market = anchor_stats["regime"]
        self.since_ts = anchor_stats["since_ts"]
        self.bar_ts = bar_ts
        self.anchor_adx = anchor_stats.get("adx")
        self.anchor_atr_pct = anchor_stats.get("atr_pct")
        self.classified = True
        events = []
        active = self.active_strategy()
        changed = set(old_symbols) | set(new_symbols)
        # Anchor event carries the market regime. Other watched names only
        # when their own label changed, so the monitor can see a coin go quiet.
        ordered = [self.anchor] + [s for s in sorted(changed) if s != self.anchor]
        for sym in ordered:
            new = new_symbols.get(sym)
            old = old_symbols.get(sym)
            if sym == self.anchor:
                if new == old_market and new == old:
                    continue
                if new is None:
                    continue
                old_r = old_market
            else:
                if new == old or new is None:
                    continue
                old_r = old
            events.append(self._regime_event(bar_ts, sym, old_r, new, active))
        self._active_published = active
        return events

    def _regime_event(self, ts, symbol, old, new, active):
        old_s = old or "none"
        active_s = active or "stand aside"
        return {
            "ts": int(ts),
            "type": "REGIME_CHANGE",
            "symbol": symbol,
            "strategy": active or "",
            "msg": (f"{old_s} -> {new}, active {active_s}"
                    + ("" if self.enabled else " (selector off)")),
            "regime_old": old,
            "regime_new": new,
            "active_strategy": active,
            "selector_enabled": self.enabled,
        }

    def review(self, trades, now, equity):
        """Demote / promote from the rolling window. Idempotent if called twice."""
        if not self.enabled:
            return []
        names = [self.trend_strategy]
        if self.range_strategy:
            names.append(self.range_strategy)
        events = []
        now = int(now)
        for name in names:
            status = window_breach(trades, name, now, equity, self.demote_cfg)
            on = name in self.demotions
            if status["breach"] and not on:
                self.demotions[name] = {
                    "since_ts": now,
                    "reason": status.get("reason") or "window",
                    "n": int(status["n"]),
                    "net": round(float(status["net"]), 4),
                }
                events.append({
                    "ts": now,
                    "type": "STRATEGY_DEMOTED",
                    "symbol": "",
                    "strategy": name,
                    "msg": (f"{name} demoted ({status.get('reason')}): "
                            f"last {status['n']} trades net {status['net']:.2f} USDT"),
                    "active_strategy": self.active_strategy(),
                    "regime_old": self.market,
                    "regime_new": self.market,
                })
            elif on and not status["breach"]:
                self.demotions.pop(name, None)
                events.append({
                    "ts": now,
                    "type": "STRATEGY_PROMOTED",
                    "symbol": "",
                    "strategy": name,
                    "msg": (f"{name} promoted: rolling window cleared "
                            f"(n={status['n']}, net {status['net']:.2f} USDT)"),
                    "active_strategy": self.active_strategy(),
                    "regime_old": self.market,
                    "regime_new": self.market,
                })
        if events:
            self._active_published = self.active_strategy()
        return events

    def view(self, now):
        return {
            "enabled": self.enabled,
            "market": self.market,
            "anchor": self.anchor,
            "active_strategy": self.active_strategy(),
            "menu_strategy": self.menu_strategy(),
            "since_ts": self.since_ts,
            "bar_ts": self.bar_ts,
            "symbols": dict(self.symbols),
            "demoted": self.demoted,
            "demotions": {k: dict(v) for k, v in self.demotions.items()},
            "anchor_adx": _num(self.anchor_adx, 2),
            "anchor_atr_pct": _num(self.anchor_atr_pct, 3),
            "classified": self.classified,
            "dwell_bars": self.p.min_dwell,
            "updated_ts": int(now),
            "range_strategy": self.range_strategy,
            "trend_strategy": self.trend_strategy,
        }


def initial_regime_view(cfg, now, active=None):
    block = (cfg or {}).get("regime_selector") or {}
    name = active or ((cfg or {}).get("strategy") or {}).get("name") or "ema_trend_4h"
    return {
        "enabled": bool(block.get("enabled")),
        "market": None,
        "anchor": block.get("anchor") or "BTCUSDT",
        "active_strategy": name,
        "menu_strategy": None,
        "since_ts": None,
        "bar_ts": None,
        "symbols": {},
        "demoted": [],
        "demotions": {},
        "classified": False,
        "dwell_bars": int(block.get("min_dwell_bars") or 6),
        "updated_ts": int(now),
        "range_strategy": block.get("range_strategy"),
        "trend_strategy": block.get("trend_strategy") or "ema_trend_4h",
    }

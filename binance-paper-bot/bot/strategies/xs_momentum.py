"""xs_mom_1d: cross-sectional daily momentum.

Every `reb_days` UTC days, at the 00:00 UTC daily close:
  score = log(close_t / close_{t-lb}) / (std of daily log returns * sqrt(lb))
  long the top k, short the bottom k.
The research book used gross=1 (each leg 1/8 of equity notional). This desk sets
gross=0.15 in config, so a new book is about 1.875% of equity notional per leg.
A leg that stays on the same side is not closed and not resized.
A wide disaster stop is 5x daily ATR. Research ran without a stop; the stop is
only there because the paper risk path requires one.

The entry point is on_universe_bar, called once per daily close with every
symbol. on_bar returns nothing.

If the strategy is flat and has not yet entered the current rebalance period,
bootstrap_signals opens the book from the most recent closed daily bar. The
desk records that period in state so a later flatten does not enter again
before the next scheduled rebalance.
"""
import numpy as np

from .base import Strategy, Signal, register
from ..indicators import atr

NAME = "xs_mom_1d"
DAY = 86_400_000


def xs_scores(closes, lb=14, vol_win=70):
    """closes: sym -> daily closes, oldest first, last = the day that just closed."""
    out = {}
    for s, c in closes.items():
        c = np.asarray(c, float)
        if len(c) < max(lb, 20) + 1 or not np.all(np.isfinite(c[-(lb + 1):])) or c[-1] <= 0:
            continue
        r1 = np.diff(np.log(c[-(vol_win + 1):]))
        r1 = r1[np.isfinite(r1)]
        if len(r1) < 20:
            continue
        sd = r1.std(ddof=1) * np.sqrt(lb)
        if sd <= 0:
            continue
        out[s] = float(np.log(c[-1] / c[-1 - lb]) / sd)
    return out


def target_book(scores, k=4, gross=1.0, min_coins=None):
    """Signed target weight as a fraction of equity notional. Empty if too few coins."""
    if len(scores) < (min_coins or 2 * k + 2):
        return {}
    order = sorted(scores, key=lambda s: scores[s])
    g = gross / (2 * k)
    book = {s: -g for s in order[:k]}
    book.update({s: g for s in order[-k:]})
    return book


@register(NAME)
class XsMomentum1d(Strategy):
    DEFAULTS = dict(timeframe="1d", lb=14, vol_win=70, reb_days=3, k=4, gross=1.0,
                    disaster_sl_atr=5.0, leverage=3)

    def __init__(self, params):
        p = dict(self.DEFAULTS)
        p.update(params or {})
        super().__init__(p)
        self.timeframe = "1d"

    def warmup_bars(self):
        return {"1d": self.p["vol_win"] + self.p["lb"] + 5}

    def on_bar(self, ctx):
        return []

    def is_rebalance_day(self, ts):
        """True on a UTC day whose Unix index is divisible by `reb_days`."""
        return (int(ts) // DAY) % int(self.p["reb_days"]) == 0

    def period_id(self, ts):
        """Rebalance period. The scheduled entry is the first day of the period."""
        return (int(ts) // DAY) // int(self.p["reb_days"])

    def needs_bootstrap(self, ts, positions, entered_period):
        """Flat, and this period has not been entered yet.

        A recorded period stays entered even after every leg has stopped out.
        The next scheduled rebalance is what opens the following book.
        """
        if positions:
            return False
        if entered_period is not None and int(entered_period) == self.period_id(ts):
            return False
        return True

    def _ranked(self, candles):
        p = self.p
        sc = xs_scores({s: b["close"] for s, b in candles.items()}, p["lb"], p["vol_win"])
        return sc, target_book(sc, p["k"], p["gross"])

    def _opens(self, candles, scores, book, prefix, extra):
        p = self.p
        out = []
        for s, w in sorted(book.items()):
            b = candles[s]
            a = atr(b["high"], b["low"], b["close"], 14)[-1]
            if not np.isfinite(a) or a <= 0:
                continue
            info = {"strategy": NAME, "target_weight": abs(float(w)), "score": scores[s]}
            info.update(extra)
            out.append(Signal(
                s, "OPEN_LONG" if w > 0 else "OPEN_SHORT", p["disaster_sl_atr"] * float(a), 0.0,
                p["leverage"],
                f"{prefix} ({'top' if w > 0 else 'bottom'} {p['k']}), score {scores[s]:+.2f}",
                info))
        return out

    def on_universe_bar(self, ts, candles, positions):
        """candles: sym -> daily arrays. positions: this strategy's positions only.

        CLOSE names that leave the book or flip, then OPEN the new legs.
        A coin already on the same side is left in place, including its size,
        so a lower gross applies only to new opens. Off-schedule days do
        nothing; a flat book between rebalances uses bootstrap_signals.
        """
        if not self.is_rebalance_day(ts):
            return []
        sc, book = self._ranked(candles)
        out = []
        for s, pos in positions.items():
            want = np.sign(book.get(s, 0.0))
            if want != pos.side:
                out.append(Signal(s, "CLOSE", reason=f"xs rebalance: {'flat' if want == 0 else 'flip'}",
                                  info={"strategy": NAME, "score": sc.get(s)}))
        held = {s for s, pos in positions.items() if pos.side == np.sign(book.get(s, 0.0)) and book.get(s, 0.0) != 0}
        out.extend(sig for sig in self._opens(
            candles, sc, book, "xs 1d momentum rank", {}) if sig.symbol not in held)
        return out

    def bootstrap_signals(self, candles):
        """OPEN the book from the last closed daily bar. No closes.

        `_bootstrap_status` is `no_data` when the candles cannot be scored,
        `empty_book` when too few coins rank, and `signals` when legs are emitted.
        """
        sc, book = self._ranked(candles)
        if not sc:
            self._bootstrap_status = "no_data"
            return []
        if not book:
            self._bootstrap_status = "empty_book"
            return []
        self._bootstrap_status = "signals"
        return self._opens(candles, sc, book, "xs bootstrap from last closed daily bar", {"bootstrap": True})

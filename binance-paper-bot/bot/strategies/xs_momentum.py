"""xs_mom_1d: cross-sectional daily momentum.

Every `reb_days` UTC days, at the 00:00 UTC daily close:
  score = log(close_t / close_{t-lb}) / (std of daily log returns * sqrt(lb))
  long the top k, short the bottom k.
The research book used gross=1 (each leg 1/8 of equity notional). This desk sets
gross=0.30 in config, so the eight legs are about 3.75% of equity notional each.
A wide disaster stop is 5x daily ATR. Research ran without a stop; the stop is
only there because the paper risk path requires one.

The entry point is on_universe_bar, called once per daily close with every
symbol. on_bar returns nothing.
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
        """True at 00:00 UTC every `reb_days` days of the Unix epoch."""
        return (int(ts) // DAY) % int(self.p["reb_days"]) == 0

    def on_universe_bar(self, ts, candles, positions):
        """candles: sym -> daily arrays. positions: this strategy's positions only.

        CLOSE names that leave the book or flip, then OPEN the new legs.
        A coin already on the same side is left in place.
        """
        if not self.is_rebalance_day(ts):
            return []
        p = self.p
        sc = xs_scores({s: b["close"] for s, b in candles.items()}, p["lb"], p["vol_win"])
        book = target_book(sc, p["k"], p["gross"])
        out = []
        for s, pos in positions.items():
            want = np.sign(book.get(s, 0.0))
            if want != pos.side:
                out.append(Signal(s, "CLOSE", reason=f"xs rebalance: {'flat' if want == 0 else 'flip'}",
                                  info={"strategy": NAME, "score": sc.get(s)}))
        for s, w in sorted(book.items()):
            pos = positions.get(s)
            if pos is not None and pos.side == np.sign(w):
                continue
            b = candles[s]
            a = atr(b["high"], b["low"], b["close"], 14)[-1]
            if not np.isfinite(a) or a <= 0:
                continue
            out.append(Signal(
                s, "OPEN_LONG" if w > 0 else "OPEN_SHORT", p["disaster_sl_atr"] * float(a), 0.0,
                p["leverage"],
                f"xs 1d momentum rank ({'top' if w > 0 else 'bottom'} {p['k']}), score {sc[s]:+.2f}",
                {"strategy": NAME, "target_weight": abs(float(w)), "score": sc[s]}))
        return out

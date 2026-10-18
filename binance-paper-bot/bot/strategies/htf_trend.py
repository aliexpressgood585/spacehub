"""Higher-timeframe trend strategies selected by the 2024-09..2026-10 research
(research/ + results/research/summary_a.csv).

Both run on 1h bar closes (so stops/trailing are handled on 1h data) but take their
decisions from completed 4h bars; an optional regime filter uses the coin's own daily
close vs EMA50 (longs only above, shorts only below).

ema_trend_4h : stop-and-reverse on 4h EMA(fast)/EMA(slow) crosses, hard stop = sl_atr*ATR20(4h),
               optional take-profit (tp_atr <= 0 -> none, exit on opposite cross).
tsmom_4h     : 4h time-series momentum. Enter when the volatility-normalised L-bar return
               |z| > z_entry and 4h ATR% is above its 200-bar median (volatility expanding);
               exit when the momentum sign flips, on a close-based chandelier trail
               (trail_atr*ATR14(4h) from the best price since entry) or the hard stop.
"""
import numpy as np
from .base import Strategy, Signal, register
from ..indicators import ema, atr

H4 = 14_400_000


def _regime_ok(p, d1, side):
    if p.get("regime", "none") != "self50":
        return True
    if d1 is None or len(d1["close"]) < 60:
        return False
    c = d1["close"]
    up = c[-1] > ema(c, 50)[-1]
    return up if side > 0 else not up


class _HTFBase(Strategy):
    def __init__(self, params):
        super().__init__(params)
        self.timeframe = params.get("timeframe", "1h")
        self.htf = params.get("signal_timeframe", "4h")

    def timeframes(self):
        tfs = [self.timeframe, self.htf]
        if self.p.get("regime", "none") == "self50":
            tfs.append("1d")
        return tfs

    @staticmethod
    def _fresh(h4, ts):
        """True when the newest completed 4h bar closed exactly at this 1h close."""
        return len(h4["close"]) > 0 and int(h4["close_time"][-1]) + 1 == ts


@register("ema_trend_4h")
class EmaTrend4h(_HTFBase):
    def warmup_bars(self):
        return {self.timeframe: 2, self.htf: self.p["ema_slow"] + 30}

    def on_bar(self, ctx):
        h4 = ctx.candles.get(self.htf)
        if h4 is None or len(h4["close"]) < self.p["ema_slow"] + 2 or not self._fresh(h4, ctx.ts):
            return []
        c = h4["close"]
        f, s = ema(c, self.p["ema_fast"]), ema(c, self.p["ema_slow"])
        st, st_prev = (1 if f[-1] > s[-1] else -1), (1 if f[-2] > s[-2] else -1)
        a = atr(h4["high"], h4["low"], c, self.p.get("atr_period", 20))[-1]
        info = {"ema_fast": round(float(f[-1]), 6), "ema_slow": round(float(s[-1]), 6), "atr4h": float(a)}
        out, pos = [], ctx.position
        if pos is not None:
            if pos.side == st:
                return []
            out.append(Signal(ctx.symbol, "CLOSE", reason=f"4h EMA{self.p['ema_fast']}/{self.p['ema_slow']} flipped", info=info))
        if st == st_prev or not np.isfinite(a) or a <= 0:        # only enter on the cross bar
            return out
        if not _regime_ok(self.p, ctx.candles.get("1d"), st):
            out.append(Signal(ctx.symbol, "INFO", reason="cross blocked by daily EMA50 regime", info=info))
            return out
        tp = self.p.get("tp_atr", 0) * a
        out.append(Signal(ctx.symbol, "OPEN_LONG" if st > 0 else "OPEN_SHORT", self.p["sl_atr"] * a, tp,
                          self.p.get("leverage", 3), f"4h EMA{self.p['ema_fast']} crossed {'above' if st > 0 else 'below'} "
                          f"EMA{self.p['ema_slow']}", info))
        return out


@register("tsmom_4h")
class TsMom4h(_HTFBase):
    def warmup_bars(self):
        return {self.timeframe: 2, self.htf: 260}

    def _z_and_filter(self, h4, upto):
        """momentum z-score and vol-expansion flag using 4h bars [..upto] (upto = -1 or -2)."""
        n = len(h4["close"]) + upto + 1
        c = h4["close"][:n]; L = self.p["lookback"]
        lr = np.diff(np.log(c))
        vol = lr[-100:].std(ddof=1)
        z = np.log(c[-1] / c[-1 - L]) / (vol * np.sqrt(L)) if vol > 0 else 0.0
        a = atr(h4["high"][:n], h4["low"][:n], c, 14)
        atrp = a / c
        ratio = atrp[-1] / np.nanmedian(atrp[-200:])
        sig = 1 if z > self.p["z_entry"] else (-1 if z < -self.p["z_entry"] else 0)
        if self.p.get("vol_filter", "expand") == "expand" and not ratio > 1.0:
            sig = 0
        return z, sig, a[-1], ratio

    def on_bar(self, ctx):
        h4 = ctx.candles.get(self.htf)
        if h4 is None or len(h4["close"]) < 230:
            return []
        h1, pos = ctx.candles[self.timeframe], ctx.position
        fresh = self._fresh(h4, ctx.ts)
        a4 = atr(h4["high"], h4["low"], h4["close"], 14)[-1]
        if pos is not None:
            # close-based chandelier trail on 1h bars since entry (entry bar included)
            m = h1["open_time"] >= (pos.opened_ts // 3_600_000) * 3_600_000
            hi = max(pos.entry_price, float(h1["high"][m].max())) if m.any() else pos.entry_price
            lo = min(pos.entry_price, float(h1["low"][m].min())) if m.any() else pos.entry_price
            c = h1["close"][-1]; tr = self.p["trail_atr"] * a4
            if (pos.side > 0 and c < hi - tr) or (pos.side < 0 and c > lo + tr):
                return [Signal(ctx.symbol, "CLOSE", reason=f"chandelier trail {self.p['trail_atr']}xATR4h")]
            if fresh:
                z, _, _, _ = self._z_and_filter(h4, -1)
                if (z > 0) != (pos.side > 0):
                    return [Signal(ctx.symbol, "CLOSE", reason=f"momentum flipped (z {z:.2f})")]
            return []
        if not fresh:
            return []
        z, sig, a, ratio = self._z_and_filter(h4, -1)
        _, prev, _, _ = self._z_and_filter(h4, -2)
        info = {"z": round(float(z), 3), "atr_ratio": round(float(ratio), 3), "atr4h": float(a)}
        if sig == 0 or sig == prev or not np.isfinite(a) or a <= 0:
            return []
        if not _regime_ok(self.p, ctx.candles.get("1d"), sig):
            return [Signal(ctx.symbol, "INFO", reason="momentum signal blocked by daily EMA50 regime", info=info)]
        return [Signal(ctx.symbol, "OPEN_LONG" if sig > 0 else "OPEN_SHORT", self.p["sl_atr"] * a, 0.0,
                       self.p.get("leverage", 3), f"4h momentum z {z:.2f}, vol ratio {ratio:.2f}", info)]

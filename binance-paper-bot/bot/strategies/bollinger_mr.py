"""Mean reversion: fade closes outside Bollinger(20,2) with RSI confirmation; TP at mid band."""
import numpy as np
from .base import Strategy, Signal, register
from ..indicators import bollinger, rsi, atr


@register("bollinger_mr")
class BollingerMR(Strategy):
    def warmup_bars(self):
        return {self.timeframe: self.p["bb_period"] + self.p["atr_period"] + 5}

    def on_bar(self, ctx):
        c = ctx.candles[self.timeframe]
        close = c["close"]
        if len(close) < self.warmup_bars()[self.timeframe] or ctx.position is not None:
            return []
        mid, up, lo = bollinger(close, self.p["bb_period"], self.p["bb_std"])
        r = rsi(close, self.p["rsi_period"])[-1]
        a = atr(c["high"], c["low"], close, self.p["atr_period"])[-1]
        px = close[-1]
        if not np.isfinite(a) or a <= 0:
            return []
        info = {"bb_mid": float(mid[-1]), "bb_up": float(up[-1]), "bb_lo": float(lo[-1]), "rsi": float(r)}
        lev = self.p.get("leverage", 3)
        sl = self.p["sl_atr_mult"] * a
        if px < lo[-1] and r < self.p["rsi_oversold"]:
            return [Signal(ctx.symbol, "OPEN_LONG", sl, max(mid[-1] - px, a * 0.5), lev,
                           f"close<lowerBB, RSI {r:.1f}", info)]
        if px > up[-1] and r > self.p["rsi_overbought"]:
            return [Signal(ctx.symbol, "OPEN_SHORT", sl, max(px - mid[-1], a * 0.5), lev,
                           f"close>upperBB, RSI {r:.1f}", info)]
        return []

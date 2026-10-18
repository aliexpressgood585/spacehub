"""Trend following: EMA20/50 cross on 15m, filtered by 1h EMA200 and RSI(14)."""
import numpy as np
from .base import Strategy, Signal, register
from ..indicators import ema, rsi, atr


@register("trend_ema")
class TrendEMA(Strategy):
    def __init__(self, params):
        super().__init__(params)
        self.ttf = params.get("trend_timeframe", "1h")

    def timeframes(self):
        return [self.timeframe, self.ttf]

    def warmup_bars(self):
        return {self.timeframe: self.p["ema_slow"] + 5, self.ttf: self.p["trend_ema"] + 5}

    def on_bar(self, ctx):
        c = ctx.candles[self.timeframe]
        h1 = ctx.candles.get(self.ttf)
        if h1 is None or len(c["close"]) < self.p["ema_slow"] + 2 or len(h1["close"]) < self.p["trend_ema"] + 1:
            return []
        close = c["close"]
        ef, es = ema(close, self.p["ema_fast"]), ema(close, self.p["ema_slow"])
        r = rsi(close, self.p["rsi_period"])[-1]
        a = atr(c["high"], c["low"], close, self.p["atr_period"])[-1]
        t = ema(h1["close"], self.p["trend_ema"])[-1]
        trend_up, trend_dn = h1["close"][-1] > t, h1["close"][-1] < t
        cross_up = ef[-2] <= es[-2] and ef[-1] > es[-1]
        cross_dn = ef[-2] >= es[-2] and ef[-1] < es[-1]
        info = {"ema_fast": round(ef[-1], 6), "ema_slow": round(es[-1], 6), "rsi": round(float(r), 2),
                "atr": float(a), "h1_close": float(h1["close"][-1]), "h1_ema200": round(float(t), 6)}
        out = []
        pos = ctx.position
        if pos is not None and self.p.get("exit_on_opposite_cross"):
            if (pos.side > 0 and cross_dn) or (pos.side < 0 and cross_up):
                out.append(Signal(ctx.symbol, "CLOSE", reason="opposite EMA cross", info=info))
                return out
        if pos is not None or not np.isfinite(a) or a <= 0:
            return out
        lev = self.p.get("leverage", 3)
        if cross_up and trend_up and r < self.p["rsi_long_max"]:
            out.append(Signal(ctx.symbol, "OPEN_LONG", self.p["sl_atr_mult"] * a, self.p["tp_atr_mult"] * a,
                              lev, f"EMA{self.p['ema_fast']}>EMA{self.p['ema_slow']} cross, 1h>EMA200, RSI {r:.1f}", info))
        elif cross_dn and trend_dn and r > self.p["rsi_short_min"]:
            out.append(Signal(ctx.symbol, "OPEN_SHORT", self.p["sl_atr_mult"] * a, self.p["tp_atr_mult"] * a,
                              lev, f"EMA{self.p['ema_fast']}<EMA{self.p['ema_slow']} cross, 1h<EMA200, RSI {r:.1f}", info))
        elif cross_up or cross_dn:
            info["filtered"] = True
            out.append(Signal(ctx.symbol, "INFO", reason=f"{'bull' if cross_up else 'bear'} cross filtered "
                              f"(trend {'up' if trend_up else 'down'}, RSI {r:.1f})", info=info))
        return out

"""4h Bollinger + RSI fade. A standard mean-reversion rule, not a new idea.

Runs on the same 1h clock as ema_trend_4h and only reads a 4h bar that closed
on this timestamp. Long a fresh close through the lower band when RSI is
oversold; short the upper band when RSI is overbought. Stop is ATR. Target is
the middle band (at least half an ATR so the target is larger than the spread).
The regime selector decides whether RANGE is allowed to call this. The rule
itself does not look at ADX.
"""
import numpy as np

from .base import Strategy, Signal, register
from ..indicators import atr, bollinger, rsi


@register("bb_rsi_4h")
class BbRsi4h(Strategy):
    def __init__(self, params):
        super().__init__(params)
        self.timeframe = params.get("timeframe", "1h")
        self.htf = params.get("signal_timeframe", "4h")

    def timeframes(self):
        return [self.timeframe, self.htf]

    def warmup_bars(self):
        n = max(int(self.p.get("bb_period", 20)), int(self.p.get("rsi_period", 14)),
                int(self.p.get("atr_period", 14)))
        return {self.timeframe: 2, self.htf: n + 5}

    def on_bar(self, ctx):
        h4 = ctx.candles.get(self.htf)
        need = self.warmup_bars()[self.htf] + 1
        if h4 is None or len(h4["close"]) < need:
            return []
        if int(h4["close_time"][-1]) + 1 != int(ctx.ts):
            return []
        c = h4["close"]
        n, k = int(self.p.get("bb_period", 20)), float(self.p.get("bb_std", 2.0))
        mid, up, lo = bollinger(c, n, k)
        r = rsi(c, int(self.p.get("rsi_period", 14)))
        a = atr(h4["high"], h4["low"], c, int(self.p.get("atr_period", 14)))
        if not (np.isfinite(a[-1]) and a[-1] > 0 and np.isfinite(mid[-1]) and np.isfinite(mid[-2])):
            return []
        if not (np.isfinite(lo[-1]) and np.isfinite(lo[-2]) and np.isfinite(up[-1]) and np.isfinite(up[-2])):
            return []
        if not np.isfinite(r[-1]):
            return []
        px = float(c[-1])
        prev = float(c[-2])
        # |RSI-50|/50. Fixed rank key for the scanner. Does not change the entry.
        score = abs(float(r[-1]) - 50.0) / 50.0
        info = {"bb_mid": float(mid[-1]), "bb_up": float(up[-1]), "bb_lo": float(lo[-1]),
                "rsi": float(r[-1]), "atr4h": float(a[-1]), "scan_score": round(score, 6),
                "setup": "fade"}
        pos = ctx.position
        if pos is not None:
            if (pos.side > 0 and px >= float(mid[-1])) or (pos.side < 0 and px <= float(mid[-1])):
                return [Signal(ctx.symbol, "CLOSE", reason="4h close back through Bollinger mid", info=info)]
            return []
        sl = float(self.p.get("sl_atr", 1.5)) * float(a[-1])
        lev = float(self.p.get("leverage", 5))
        if px < float(lo[-1]) and prev >= float(lo[-2]) and r[-1] < float(self.p.get("rsi_oversold", 30)):
            tp = max(float(mid[-1]) - px, float(a[-1]) * 0.5)
            return [Signal(ctx.symbol, "OPEN_LONG", sl, tp, lev,
                           f"4h close crossed below BB{n}, RSI {r[-1]:.1f}", info)]
        if px > float(up[-1]) and prev <= float(up[-2]) and r[-1] > float(self.p.get("rsi_overbought", 70)):
            tp = max(px - float(mid[-1]), float(a[-1]) * 0.5)
            return [Signal(ctx.symbol, "OPEN_SHORT", sl, tp, lev,
                           f"4h close crossed above BB{n}, RSI {r[-1]:.1f}", info)]
        return []

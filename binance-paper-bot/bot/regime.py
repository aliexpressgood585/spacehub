"""Closed-bar market regime and the OOS rule that decides whether it may trade.

Labels use only bars at or before the index being labelled. TREND / RANGE /
CHAOS are sticky: the book stays put for `min_dwell` closed bars, and a new
label then has to repeat for `confirm_bars` consecutive closes. One spike
does not flip the book.
"""
import numpy as np

from .indicators import adx, atr, ema

REGIMES = ("TREND", "RANGE", "CHAOS")
H4_MS = 14_400_000


class RegimeParams:
    def __init__(self, raw=None):
        b = raw or {}
        self.adx_period = int(b.get("adx_period", 14))
        self.atr_period = int(b.get("atr_period", 14))
        self.atr_lookback = int(b.get("atr_lookback", 90))
        self.chaos_percentile = float(b.get("chaos_percentile", 0.90))
        self.chaos_exit = float(b.get("chaos_exit", 0.70))
        self.adx_trend_on = float(b.get("adx_trend_on", 25))
        self.adx_trend_off = float(b.get("adx_trend_off", 20))
        self.adx_range_on = float(b.get("adx_range_on", 18))
        self.adx_range_off = float(b.get("adx_range_off", 23))
        self.ema_period = int(b.get("ema_period", 20))
        self.slope_bars = int(b.get("slope_bars", 3))
        self.slope_min = float(b.get("slope_min", 0.0015))
        self.min_dwell = int(b.get("min_dwell_bars", b.get("min_dwell", 6)))
        # A different raw label has to repeat this many closes, after the dwell,
        # before it replaces the committed regime. 2 blocks a one-bar spike.
        self.confirm_bars = int(b.get("confirm_bars", 2))

    @property
    def min_history(self):
        return max(self.atr_lookback, self.adx_period * 2 + self.slope_bars, self.ema_period + self.slope_bars)


def params_from_cfg(cfg):
    return RegimeParams((cfg or {}).get("regime_selector") or {})


def raw_label(adx_v, slope, atr_pct, prev, p):
    """One bar's label. HOLD keeps the committed regime. None means not enough data.

    Chaos is a volatility spike (ATR in the top of its own trailing window).
    Trend and range use an enter/stay band on ADX so the boundary itself does
    not chatter; `fold_labels` adds the dwell time on top of that.
    """
    if adx_v is None or not np.isfinite(adx_v):
        return None
    slope = 0.0 if slope is None or not np.isfinite(slope) else float(slope)
    chaos_now = atr_pct is not None and np.isfinite(atr_pct) and atr_pct >= p.chaos_percentile
    if chaos_now:
        return "CHAOS"
    trend_enter = adx_v >= p.adx_trend_on and slope >= p.slope_min
    trend_stay = adx_v >= p.adx_trend_off and slope >= p.slope_min * 0.5
    range_enter = adx_v <= p.adx_range_on
    range_stay = adx_v <= p.adx_range_off
    if prev == "CHAOS":
        # Stay while ATR% is still elevated. Once it cools, a trend resumes
        # or the book falls back to range. HOLD here would never leave chaos.
        still = atr_pct is not None and np.isfinite(atr_pct) and atr_pct >= p.chaos_exit
        if still:
            return "CHAOS"
        if trend_enter:
            return "TREND"
        return "RANGE"
    if prev == "TREND":
        if trend_stay:
            return "TREND"
        if range_enter:
            return "RANGE"
        return "HOLD"
    if prev == "RANGE":
        if trend_enter:
            return "TREND"
        if range_stay:
            return "RANGE"
        return "HOLD"
    if trend_enter:
        return "TREND"
    if range_enter:
        return "RANGE"
    return "HOLD"


class _Fold:
    """Dwell plus a short confirm. Shared by the public fold and the raw-label loop."""

    def __init__(self):
        self.regime = None
        self.dwell = 0
        self.since = None
        self.pending = None
        self.pending_n = 0

    def step(self, raw, ts, min_dwell, confirm):
        if self.regime is None:
            if raw in REGIMES:
                self.regime = raw
                self.dwell = 1
                self.since = int(ts)
            return self.regime
        self.dwell += 1
        if raw in REGIMES and raw != self.regime:
            if raw != self.pending:
                self.pending = raw
                self.pending_n = 1
            else:
                self.pending_n += 1
            # `dwell` already includes this bar, so `>` keeps the old label for
            # min_dwell closes. The new one still has to have repeated.
            if self.dwell > int(min_dwell) and self.pending_n >= int(confirm):
                self.regime = raw
                self.dwell = 1
                self.since = int(ts)
                self.pending = None
                self.pending_n = 0
        else:
            self.pending = None
            self.pending_n = 0
        return self.regime


def fold_labels(raws, timestamps, min_dwell, confirm=2):
    """Commit a label only after the previous one has dwelled, and the new one repeated.

    The first decisive label (not HOLD / None) starts the regime immediately.
    A later flip waits until the committed label has been in force for more than
    `min_dwell` closed bars and the challenger has been the raw label for
    `confirm` consecutive closes. One bar of CHAOS after a long quiet stretch
    does not flip.
    """
    fold = _Fold()
    path = []
    for raw, ts in zip(raws, timestamps):
        path.append(fold.step(raw, ts, min_dwell, confirm))
    return {"regime": fold.regime, "since_ts": fold.since, "dwell": int(fold.dwell), "path": path}


def _atr_percentile(atr_v, close, i, lookback):
    """ATR/close versus the previous `lookback` bars, current bar excluded.

    Raw ATR rises with price, so a calm bull market would look like a permanent
    spike. Leaving the current bar out of the window means a flat history is
    not a spike: the bar cannot vote itself into the top percentile.
    """
    if i < lookback or not np.isfinite(atr_v[i]) or not close[i]:
        return None
    ref = atr_v[i - lookback:i] / close[i - lookback:i]
    cur = float(atr_v[i] / close[i])
    if not np.all(np.isfinite(ref)) or not np.isfinite(cur) or cur <= 0:
        return None
    return float(np.mean(ref < cur))


def _atr_percentiles(atr_v, close, lookback):
    """ATR/close rank at every index. Same rule as `_atr_percentile`, vectorised."""
    atr_v = np.asarray(atr_v, float)
    close = np.asarray(close, float)
    n = len(close)
    out = np.full(n, np.nan)
    if n <= lookback or lookback <= 0:
        return out
    ratio = np.divide(atr_v, close, out=np.full(n, np.nan), where=close != 0)
    win = np.lib.stride_tricks.sliding_window_view(ratio, lookback)
    # win[k] is ratio[k:k+lookback]. For index i the reference is ratio[i-lookback:i],
    # which is win[i-lookback], compared with ratio[i]. The current bar is not in it.
    prev = win[:n - lookback]
    cur = ratio[lookback:]
    ok = np.isfinite(prev).all(axis=1) & np.isfinite(cur) & (cur > 0)
    pct = np.mean(prev < cur[:, None], axis=1)
    out[lookback:] = np.where(ok, pct, np.nan)
    return out


def feature_frame(high, low, close, p):
    """Causal ADX, EMA slope and ATR percentile at each index. NaN until warm."""
    high = np.asarray(high, float)
    low = np.asarray(low, float)
    close = np.asarray(close, float)
    adx_v = adx(high, low, close, p.adx_period)
    atr_v = atr(high, low, close, p.atr_period)
    ema_v = ema(close, p.ema_period)
    n = len(close)
    slope = np.full(n, np.nan)
    k = p.slope_bars
    if n > k:
        delta = np.abs(ema_v[k:] - ema_v[:-k])
        base = close[k:]
        ok = np.isfinite(ema_v[k:]) & np.isfinite(ema_v[:-k]) & (base != 0)
        slope[k:] = np.where(ok, delta / base, np.nan)
    return {"adx": adx_v, "slope": slope, "atr_pct": _atr_percentiles(atr_v, close, p.atr_lookback)}


def fold_frame(frame, timestamps, p, start=0, end=None):
    """Fold a slice. `start:end` is what a trailing window would see, nothing after `end`."""
    adx_v, slope, atr_pct = frame["adx"], frame["slope"], frame["atr_pct"]
    end = len(adx_v) if end is None else int(end)
    start = int(start)
    ts = [int(t) for t in timestamps[start:end]]
    raws = []
    fold = _Fold()
    for i in range(start, end):
        if i < p.min_history or not np.isfinite(adx_v[i]):
            raws.append(None)
        else:
            sl = float(slope[i]) if np.isfinite(slope[i]) else 0.0
            pct = float(atr_pct[i]) if np.isfinite(atr_pct[i]) else None
            raws.append(raw_label(float(adx_v[i]), sl, pct, fold.regime, p))
        fold.step(raws[-1], timestamps[i], p.min_dwell, p.confirm_bars)
    folded = fold_labels(raws, ts, p.min_dwell, p.confirm_bars)
    last = end - 1
    folded["adx"] = float(adx_v[last]) if last >= 0 and np.isfinite(adx_v[last]) else None
    folded["atr_pct"] = float(atr_pct[last]) if last >= 0 and np.isfinite(atr_pct[last]) else None
    folded["slope"] = float(slope[last]) if last >= 0 and np.isfinite(slope[last]) else None
    return folded


def classify_series(high, low, close, timestamps, p):
    """Fold TREND / RANGE / CHAOS over a closed series. No bar sees the future."""
    close = np.asarray(close, float)
    n = len(close)
    if n < p.min_history:
        return {"regime": None, "since_ts": None, "dwell": 0, "path": [None] * n,
                "adx": None, "atr_pct": None, "slope": None}
    return fold_frame(feature_frame(high, low, close, p), timestamps, p)


def _window_trades(trades, name, now, demote):
    days = int(demote.get("window_days", 14))
    keep = int(demote.get("window_trades", 8))
    cut = int(now) - days * 86_400_000
    rows = []
    for t in trades or []:
        if t.get("strategy") != name:
            continue
        cts = int(t.get("close_ts") or 0)
        if cts < cut:
            continue
        rows.append(t)
    rows.sort(key=lambda t: int(t.get("close_ts") or 0))
    if keep > 0:
        rows = rows[-keep:]
    return rows


def window_breach(trades, name, now, equity, demote):
    """True when the live window has lost enough to stand this strategy down.

    Two ways, either is enough:
    - at least `min_trades` closes, mean pnl <= 0, and the sum is at least
      `loss_frac` of equity (non-positive expectancy with real damage)
    - at least 2 closes and the sum is at least `hard_loss_frac` of equity
    Trades older than `window_days` fall out, which is what clears a demotion.
    """
    rows = _window_trades(trades, name, now, demote)
    n = len(rows)
    net = sum(float(t.get("net_pnl") or 0) for t in rows)
    eq = float(equity or 0)
    if eq <= 0 or n == 0:
        return {"breach": False, "n": n, "net": net}
    min_n = int(demote.get("min_trades", 4))
    loss = float(demote.get("loss_frac", 0.04)) * eq
    hard = float(demote.get("hard_loss_frac", 0.08)) * eq
    mean = net / n
    if n >= min_n and mean <= 0 and net <= -loss:
        return {"breach": True, "n": n, "net": net, "reason": "expectancy"}
    if n >= 2 and net <= -hard:
        return {"breach": True, "n": n, "net": net, "reason": "drawdown"}
    return {"breach": False, "n": n, "net": net}


def oos_beats(baseline, challenger, dd_margin_pp=2.0, min_trades=5):
    """Challenger wins when its OOS return is higher and its max drawdown is
    not worse by more than `dd_margin_pp` percentage points.

    max_drawdown_pct is zero or negative. A margin of 2 means -12 beats a
    baseline of -10; -13 does not.
    """
    if int(challenger.get("trades") or 0) < int(min_trades):
        return False
    if float(challenger["return_pct"]) <= float(baseline["return_pct"]):
        return False
    worst = float(baseline["max_drawdown_pct"]) - float(dd_margin_pp)
    if float(challenger["max_drawdown_pct"]) < worst:
        return False
    return True


def trade_returns(trades, start):
    """Closed-trade equity returns, in close order. Overlapping open pnl is not in here."""
    eq = float(start)
    out = []
    rows = sorted(trades or [], key=lambda t: int(t.get("close_ts") or 0))
    for t in rows:
        net = float(t.get("net_pnl") or 0)
        if eq <= 0:
            break
        out.append(net / eq)
        eq += net
    return out


def ruin_probability(returns, start=100.0, paths=4000, horizon=None, halt_dd=0.50, seed=0):
    """i.i.d. resample of closed-trade returns.

    p_ruin is the share of paths whose equity hits 0. p_halt is the share whose
    peak-to-trough drawdown reaches `halt_dd`. This is not a forecast: it
    reshuffles the trades we already have.
    """
    r = np.asarray(list(returns or []), float)
    if len(r) == 0 or paths <= 0:
        return {"paths": 0, "horizon_trades": 0, "p_ruin": None, "p_halt": None,
                "terminal_p05": None, "terminal_p50": None}
    horizon = int(horizon or len(r))
    rng = np.random.default_rng(int(seed))
    draw = r[rng.integers(0, len(r), size=(int(paths), horizon))]
    eq = float(start) * np.cumprod(1.0 + draw, axis=1)
    eq = np.concatenate([np.full((int(paths), 1), float(start)), eq], axis=1)
    peak = np.maximum.accumulate(eq, axis=1)
    dd = (eq - peak) / np.where(peak > 0, peak, np.nan)
    terminal = eq[:, -1]
    return {
        "paths": int(paths),
        "horizon_trades": horizon,
        "p_ruin": round(float(np.mean(np.min(eq, axis=1) <= 0.0)), 4),
        "p_halt": round(float(np.mean(np.nanmin(dd, axis=1) <= -float(halt_dd))), 4),
        "terminal_p05": round(float(np.quantile(terminal, 0.05)), 2),
        "terminal_p50": round(float(np.quantile(terminal, 0.50)), 2),
    }


def _sleeves(book):
    n = 1
    if book.get("range_strategy"):
        n += 1
    if book.get("trend_strategy") not in (None, "", "ema_trend_4h"):
        n += 1
    return n


def choose_menu(baseline, books, min_trades=5):
    """Live enable rule. Return is the gate. Drawdown is not.

    Among the precommitted switched books, take the highest OOS return that is
    at least the ema-only return and has enough trades. An equal return keeps
    the simpler book (fewer sleeves, then the shallower drawdown).
    """
    base_ret = float(baseline["return_pct"])
    eligible = []
    for b in books or []:
        if int(b.get("trades") or 0) < int(min_trades):
            continue
        if float(b["return_pct"]) < base_ret:
            continue
        eligible.append(b)
    if not eligible:
        return {
            "enabled": False,
            "trend_strategy": "ema_trend_4h",
            "range_strategy": None,
            "book": None,
            "reason": "OOS: no regime-switched book matched or beat ema_trend_4h on return; selector stays off",
        }
    eligible.sort(key=lambda b: (
        -float(b["return_pct"]),
        _sleeves(b),
        -float(b["max_drawdown_pct"]),
    ))
    w = eligible[0]
    trend = w.get("trend_strategy") or "ema_trend_4h"
    rng = w.get("range_strategy") or None
    return {
        "enabled": True,
        "trend_strategy": trend,
        "range_strategy": rng,
        "book": w.get("name"),
        "reason": (f"OOS: {w.get('name')} return {float(w['return_pct']):.3f}% "
                   f">= ema_trend_4h {base_ret:.3f}%"),
    }


def adopt_wider_book(narrow, wider, min_trades=5):
    """True when the wider symbol book matches or beats the narrow one on OOS return."""
    if int(wider.get("trades") or 0) < int(min_trades):
        return False
    return float(wider["return_pct"]) >= float(narrow["return_pct"])


def choose_selector(ema, switched_mr, switched_flat, dd_margin_pp=2.0):
    """Legacy gate: higher return and drawdown inside `dd_margin_pp`.

    The live flag uses `choose_menu` (return only). This one is still computed
    so the report can say whether the old, tighter rule would have agreed.
    """
    margin = float(dd_margin_pp)
    mr_ok = oos_beats(ema, switched_mr, margin)
    flat_ok = oos_beats(ema, switched_flat, margin)
    mr_vs_flat = (
        float(switched_mr["return_pct"]) > float(switched_flat["return_pct"])
        and float(switched_mr["max_drawdown_pct"]) >= float(switched_flat["max_drawdown_pct"]) - margin
    )
    if mr_ok and mr_vs_flat:
        return {
            "enabled": True,
            "range_strategy": "bb_rsi_4h",
            "reason": "OOS: regime switch with 4h Bollinger/RSI beats ema_trend_4h and beats standing aside in RANGE",
        }
    if flat_ok:
        return {
            "enabled": True,
            "range_strategy": None,
            "reason": "OOS: regime switch beats ema_trend_4h only when RANGE stands aside; mean reversion stays off",
        }
    return {
        "enabled": False,
        "range_strategy": None,
        "reason": "OOS: regime switch does not beat ema_trend_4h on return with drawdown inside the margin; selector stays off",
    }

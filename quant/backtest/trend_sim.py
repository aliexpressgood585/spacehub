"""Daily portfolio simulator for the trend sleeve. Honest by construction, same cost model as the rest of quant/:
- decisions on the CLOSE of day t, fills at the OPEN of day t+1 (market order: taker fee + slippage);
- slippage per fill = base_bps(symbol) + range_frac x (previous day's range / sqrt(288)) — the SAME per-order impact
  the 5m engine charges (its range term is a 5m bar's range; a daily range is ~sqrt(288) 5m ranges). A stress
  multiplier (`slip_mult`) re-runs everything at 2x / 5x to show the dependence;
- trailing stop placed on the exchange: if the day opens through it the fill is the open, else the stop level, both
  less slippage; the stop trails the best CLOSE and moves only in the position's favour, effective the next day;
- funding: every real 8h settlement while held, sign-correct, from the archive (0.01%/8h where a coin has none,
  counted and reported as INFERRED);
- risk: per position notional <= max_pos x equity, risk at the stop <= 1% of equity, gross <= max_leverage x
  equity; sleeve kill switch (equity <= (1 - dd_kill) x peak -> flatten, halt for the rest of the run), daily-loss
  limit (a day losing >= daily_loss blocks entries on the next rebalance).
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from ..strategies import trend as TR

DAY = 86_400_000


@dataclass
class Panel:
    syms: list[str]
    days: np.ndarray                 # ms, daily open times
    o: np.ndarray; h: np.ndarray; l: np.ndarray; c: np.ndarray; qv: np.ndarray   # T x N, NaN when not trading
    fund: list                       # per symbol: (t_ms array, rate array) or None
    base_bps: np.ndarray             # N

    @property
    def avail(self):
        return np.isfinite(self.c)


@dataclass
class TrendResult:
    daily_eq: np.ndarray
    days: np.ndarray
    trades: list = field(default_factory=list)      # dicts: sym, side, entry_t, exit_t, pnl, r, reason
    killed_at: int | None = None
    fees: float = 0.0
    slippage: float = 0.0
    funding: float = 0.0
    funding_inferred_days: int = 0
    gross: float = 0.0


class Indicators:
    def __init__(self, P: Panel, cfg: dict):
        t = cfg["trend"]
        self.atr = TR.atr(P.h, P.l, P.c, t["atr_days"])
        self.ma_slow = TR.sma(P.c, t["ma_slow"])
        self.brk = TR.breakout_signal(P.c, t["ma_fast"], t["ma_slow"], t["breakout"])
        self.score = TR.exp_reg_score(P.c, t["mom_window"])
        self.uni = TR.universe(P.qv, P.avail, P.days, t["universe_top"], t["min_history"])
        bi = P.syms.index("BTC")
        bma = TR.sma(P.c[:, [bi]], t["regime_ma"])[:, 0]
        self.btc_up = np.nan_to_num(P.c[:, bi] > bma, nan=0).astype(bool) & np.isfinite(bma)
        prev_rng = np.vstack([np.full((1, P.c.shape[1]), np.nan), ((P.h - P.l) / P.c)[:-1]])
        self.prev_rng = np.nan_to_num(prev_rng, nan=0.0)


def run(P: Panel, I: Indicators, cfg: dict, variant: dict, t0: int, t1: int, equity0: float = 10_000.0,
        slip_mult: float = 1.0) -> TrendResult:
    """Simulate day indices [t0, t1). variant: {kind: breakout|momentum, shorts: bool, n: int}."""
    tc, costs, risk = cfg["trend"], cfg["costs"], cfg["trend"]["risk"]
    taker, rf = costs["taker_fee"], costs["slippage"]["range_frac"]
    T, N = P.c.shape
    cash = equity0
    pos: dict[int, dict] = {}                           # j -> {side, units, entry, best, stop, t_in, fund, risk}
    eq_hist, trades = [], []
    res = TrendResult(np.array([]), P.days[t0:t1])
    peak, halted, block_next = equity0, False, False
    fidx = [0] * N

    def slip(j, t):
        return (P.base_bps[j] / 1e4 + rf * I.prev_rng[t, j] / np.sqrt(288)) * slip_mult

    def mark(t):
        u = cash
        for j, p in pos.items():
            px = P.c[t, j] if np.isfinite(P.c[t, j]) else p["last"]
            u += p["margin"] + p["side"] * p["units"] * (px - p["entry"]) - p["fund"]
        return u

    def close(j, t, px_raw, reason, at_open=True):
        nonlocal cash
        p = pos.pop(j)
        s = slip(j, t)
        px = px_raw * (1 - p["side"] * s)
        fee = taker * px * p["units"]
        pnl = p["side"] * p["units"] * (px - p["entry"]) - fee - p["fee_in"] - p["fund"]
        cash += p["margin"] + p["side"] * p["units"] * (px - p["entry"]) - fee - p["fund"]
        res.fees += fee; res.slippage += s * px * p["units"]; res.funding += p["fund"]
        res.gross += p["side"] * p["units"] * (px_raw - p["entry_raw"])
        trades.append({"sym": P.syms[j], "side": p["side"], "entry_t": int(P.days[p["t_in"]]), "exit_t": int(P.days[t]),
                       "pnl": pnl, "r": pnl / p["risk"] if p["risk"] > 0 else 0.0, "reason": reason})

    for t in range(t0, t1):
        # 1) funding accrued over day t for held positions (settlements inside [day t, day t+1))
        a, b = P.days[t], P.days[t] + DAY
        for j, p in pos.items():
            f = P.fund[j]
            px = P.c[t, j] if np.isfinite(P.c[t, j]) else p["last"]
            if f is None or not len(f[0]):
                p["fund"] += p["side"] * 3 * 0.0001 * p["units"] * px
                res.funding_inferred_days += 1
            else:
                k0, k1 = np.searchsorted(f[0], a), np.searchsorted(f[0], b)
                p["fund"] += p["side"] * float(f[1][k0:k1].sum()) * p["units"] * px
        # 2) stops on today's bar (exchange-side), delisted coins closed at their last close
        for j in list(pos):
            p = pos[j]
            if not np.isfinite(P.c[t, j]):
                close(j, t, p["last"], "DELISTED"); continue
            o, lo, hi = P.o[t, j], P.l[t, j], P.h[t, j]
            if p["side"] > 0 and lo <= p["stop"]:
                close(j, t, o if o <= p["stop"] else p["stop"], "STOP")
            elif p["side"] < 0 and hi >= p["stop"]:
                close(j, t, o if o >= p["stop"] else p["stop"], "STOP")
        # 3) daily mark, trailing update, kill switch
        eq = mark(t)
        for j, p in pos.items():
            p["last"] = P.c[t, j]
            a_ = I.atr[t, j]
            if np.isfinite(a_):
                p["best"] = max(p["best"], P.c[t, j]) if p["side"] > 0 else min(p["best"], P.c[t, j])
                ns = p["best"] - p["side"] * tc["stop_atr"] * a_
                p["stop"] = max(p["stop"], ns) if p["side"] > 0 else min(p["stop"], ns)
        prev = eq_hist[-1] if eq_hist else equity0
        if eq <= prev * (1 - risk["daily_loss"]):
            block_next = True
        peak = max(peak, eq)
        if not halted and eq <= peak * (1 - risk["max_drawdown_kill"]):
            halted, res.killed_at = True, int(P.days[t])
            if t + 1 < T:
                for j in list(pos):
                    px = P.o[t + 1, j] if np.isfinite(P.o[t + 1, j]) else pos[j]["last"]
                    close(j, t + 1, px, "KILL")
            eq = cash
        eq_hist.append(eq)
        # 4) weekly rebalance on the close of the last day of the ISO week (Sunday) -> fills Monday open
        if halted or t + 1 >= T or not ((P.days[t] // DAY + 4) % 7 == 6):
            continue
        tn = t + 1
        if variant["kind"] == "momentum":
            sc = np.where(I.uni[t] & np.isfinite(I.score[t]), I.score[t], np.nan)
            order = np.argsort(-np.nan_to_num(sc, nan=-np.inf))
            valid = np.isfinite(sc[order])
            ranked_long = [j for j, v in zip(order, valid) if v]
            keep_long = set(ranked_long[:2 * variant["n"]])
            ranked_short = [j for j in reversed(ranked_long)]
            keep_short = set(ranked_short[:2 * variant["n"]])
            for j in list(pos):
                p = pos[j]
                if (p["side"] > 0 and j not in keep_long) or (p["side"] < 0 and j not in keep_short) or not I.uni[t, j]:
                    if np.isfinite(P.o[tn, j]):
                        close(j, tn, P.o[tn, j], "REBALANCE")
            want = []
            for j in ranked_long[:variant["n"]]:
                if sc[j] > 0 and P.c[t, j] > I.ma_slow[t, j] and I.btc_up[t]:
                    want.append((j, 1))
            if variant["shorts"]:
                for j in ranked_short[:variant["n"]]:
                    if sc[j] < 0 and P.c[t, j] < I.ma_slow[t, j]:
                        want.append((j, -1))
        else:
            for j in list(pos):
                if not I.uni[t, j] and np.isfinite(P.o[tn, j]):
                    close(j, tn, P.o[tn, j], "UNIVERSE")
            want = []
            for j in np.flatnonzero(I.uni[t] & (I.brk[t] != 0)):
                d = int(I.brk[t, j])
                if d > 0 and not I.btc_up[t]:
                    continue
                if d < 0 and not variant["shorts"]:
                    continue
                want.append((j, d))
        if block_next:
            block_next = False
            continue
        eq = mark(t)
        gross = sum(p["units"] * P.c[t, j] for j, p in pos.items() if np.isfinite(P.c[t, j]))
        for j, d in want:
            if j in pos or not np.isfinite(P.o[tn, j]) or not np.isfinite(I.atr[t, j]) or I.atr[t, j] <= 0:
                continue
            s = slip(j, tn)
            e = P.o[tn, j] * (1 + d * s)
            units = tc["risk_factor"] * eq / I.atr[t, j]
            units = min(units, risk["max_pos"] * eq / e)
            stop = e - d * tc["stop_atr"] * I.atr[t, j]
            units = min(units, 0.01 * eq / max(abs(e - stop), 1e-12))          # <= 1% of equity at the stop
            room = risk["max_leverage"] * eq - gross
            units = min(units, max(0.0, room) / e)
            if units * e < 10:
                continue
            fee = taker * e * units
            margin = units * e / risk["max_leverage"]
            if margin + fee > cash:
                continue
            cash -= margin + fee
            gross += units * e
            res.fees += fee; res.slippage += s * P.o[tn, j] * units
            pos[j] = {"side": d, "units": units, "entry": e, "entry_raw": P.o[tn, j], "best": e, "stop": stop, "t_in": tn,
                      "fund": 0.0, "fee_in": fee, "margin": margin, "risk": units * abs(e - stop), "last": P.o[tn, j]}
    # positions open at the end are marked, not counted as trades
    res.daily_eq = np.array(eq_hist)
    res.trades = trades
    return res

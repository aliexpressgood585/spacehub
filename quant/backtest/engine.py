"""Per-symbol trade simulator. Honest by construction:

- Decisions come from `Signals` computed on CLOSED bars (value at i uses bars <= i) and are filled at the OPEN of
  bar i+1. No signal ever sees the bar it trades on.
- Market fills (entries, signal exits, stops, time exits) pay the TAKER fee plus adverse slippage:
  base_bps(symbol) + range_frac x the PREVIOUS bar's (high-low)/close — a volatility-scaled spread/impact proxy
  that is known at fill time. A take-profit is a resting LIMIT: MAKER fee, filled only if price trades strictly
  through it (touching is not a fill).
- The stop is live from the entry bar on (it is placed on the exchange right after the fill). Within one bar, the
  STOP is assumed to hit before the target when both are touched (the pessimistic convention). A bar that opens
  beyond the stop fills at that open (gap risk), not at the stop.
- Funding: every real 8h settlement between fill and exit is charged/credited at the archived rate, sign-correct
  (a long pays a positive rate).
Output is per 1 coin of FULL position quantity, independent of size; the portfolio layer applies sizing and the
risk limits. With scale-in, each of the n layers is 1/n of the quantity; risk is measured from the FIRST fill to
the stop, which over-states the true risk of later layers (they are closer to the stop) — conservative sizing.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from ..data.loader import TF_MS, Bars, Funding
from ..strategies.base import Signals


@dataclass
class Trade:
    symbol: str
    strategy: str
    side: int
    entry_t: int
    exit_t: int
    entry_px: float
    exit_px: float
    stop_px: float
    layers: int
    n_layers: int
    pnl_q: float        # net money per 1 coin of full quantity (fees, slippage, funding all included)
    gross_q: float
    fees_q: float
    funding_q: float
    slip_q: float
    risk_q: float       # |first entry - stop|, per coin
    reason: str

    @property
    def r(self) -> float:
        return self.pnl_q / self.risk_q if self.risk_q > 0 else 0.0


def slip_base(symbol: str, cfg: dict) -> float:
    b = cfg["costs"]["slippage"]["base_bps"]
    return float(b.get(symbol, b["default"])) / 1e4


def simulate(bars: Bars, sig: Signals, cfg: dict, strategy: str, funding: Funding | None = None) -> list[Trade]:
    o, h, l, c, t = bars.open, bars.high, bars.low, bars.close, bars.t
    n = len(c)
    tf_ms = TF_MS[bars.tf]
    taker, maker = cfg["costs"]["taker_fee"], cfg["costs"]["maker_fee"]
    base, rf = slip_base(bars.symbol, cfg), float(cfg["costs"]["slippage"]["range_frac"])
    min_stop = float(cfg["risk"].get("min_stop_to_cost", 0.0))
    rng = np.concatenate([[0.0], (h - l)[:-1] / c[:-1]])          # previous bar's range, known at the open of i
    slip = base + rf * rng
    maker_entry = cfg.get("execution", {}).get("entry", "taker") == "maker"
    stats = sig.info.setdefault("fills", {"attempted": 0, "filled": 0}) if maker_entry else None
    cand = np.flatnonzero(sig.side != 0)
    trades: list[Trade] = []
    nl = max(1, int(sig.n_layers))
    i_next = 0
    while True:
        p = int(np.searchsorted(cand, i_next))
        if p >= len(cand):
            break
        i = int(cand[p])
        j = i + 1
        if j >= n:
            break
        d = int(sig.side[i])
        stop = float(sig.stop_long[i] if d > 0 else sig.stop_short[i])
        tp = float(sig.tp_long[i] if d > 0 else sig.tp_short[i])
        if maker_entry:
            # post-only limit at the signal close, valid for bar j only; filled only if bar j trades THROUGH it
            stats["attempted"] += 1
            lim = c[i]
            if not ((l[j] < lim) if d > 0 else (h[j] > lim)):
                i_next = i + 1          # missed fill: no trade (never chased with a market order)
                continue
            stats["filled"] += 1
            e1 = float(lim)
        else:
            e1 = o[j] * (1 + d * slip[j])
        if not np.isfinite(stop) or d * (e1 - stop) <= 0 or sig.max_hold[i] <= 0:
            i_next = i + 1          # no valid mandatory stop -> no trade
            continue
        if abs(e1 - stop) < min_stop * (2 * taker + 2 * slip[j]) * e1:
            i_next = i + 1          # stop closer than a few round-trip costs: the trade cannot pay for itself
            continue
        end = min(n - 1, j + int(sig.max_hold[i]) - 1)
        seg_l, seg_h, seg_o = l[j:end + 1], h[j:end + 1], o[j:end + 1]
        m = end - j + 1
        stop_hit = seg_l <= stop if d > 0 else seg_h >= stop
        tp_hit = (seg_h > tp if d > 0 else seg_l < tp) if np.isfinite(tp) else np.zeros(m, bool)
        ex = sig.exit_long if d > 0 else sig.exit_short
        open_exit = np.zeros(m, bool)
        open_exit[1:] = ex[j:end]    # signal at close of bar k -> exit at open of k+1
        big = m + 10
        k_open = int(np.argmax(open_exit)) if open_exit.any() else big
        k_stop = int(np.argmax(stop_hit)) if stop_hit.any() else big
        k_tp = int(np.argmax(tp_hit)) if tp_hit.any() else big
        k_ex = min(k_open, k_stop, k_tp)
        if k_ex == big:
            b, reason = end, "TIMEOUT"
            raw = c[b]
            xp = raw * (1 - d * slip[min(b + 1, n - 1)])
            xfee, t_exit = taker, int(t[b] + tf_ms)
        elif k_open == k_ex:
            b, reason = j + k_open, "SIGNAL"
            raw = o[b]
            xp = raw * (1 - d * slip[b])
            xfee, t_exit = taker, int(t[b])
        elif k_stop == k_ex:
            b, reason = j + k_stop, "STOP"
            raw = o[b] if d * (seg_o[k_stop] - stop) <= 0 else stop
            xp = raw * (1 - d * slip[b])
            xfee, t_exit = taker, int(t[b] + tf_ms)
        else:
            b, reason = j + k_tp, "TARGET"
            raw = tp
            xp, xfee, t_exit = tp, maker, int(t[b] + tf_ms)
        # layers (scale-in): layer k fills at the open after the first close with units >= k, strictly before the exit
        fills = [(j, e1)]
        efee = maker if maker_entry else taker
        if sig.units is not None and nl > 1:
            last_ok = b - 1 if reason == "SIGNAL" else b
            for k in range(2, nl + 1):
                q = np.flatnonzero(sig.units[j:last_ok] >= k)
                if len(q):
                    fb = j + int(q[0]) + 1
                    if fb <= last_ok and fb >= fills[-1][0]:
                        fills.append((fb, o[fb] * (1 + d * slip[fb])))
        w = 1.0 / nl
        gross = fees = fund = slp = 0.0
        for fb, ep in fills:
            gross += w * d * (xp - ep)
            fees += w * ((efee if fb == j else taker) * ep + xfee * xp)
            if funding is not None and len(funding.t):
                fund += w * d * float(funding.between(int(t[fb]), t_exit).sum()) * ep
            slp += w * ((0.0 if (maker_entry and fb == j) else d * (ep - o[fb])) + d * (raw - xp))
        pnl = gross - fees - fund
        trades.append(Trade(bars.symbol, strategy, d, int(t[j]), t_exit, float(e1), float(xp), stop, len(fills), nl,
                            float(pnl), float(gross), float(fees), float(fund), float(slp), float(abs(e1 - stop)), reason))
        i_next = b if reason != "TIMEOUT" else end
        if i_next <= i:
            i_next = i + 1
    return trades

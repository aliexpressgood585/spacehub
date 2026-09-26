"""Performance metrics. Sharpe / Sortino use DAILY mark-to-market returns (annualised with sqrt(365), crypto trades
every day); max drawdown is on the daily marked equity; trade statistics are on realised, fully-costed trades."""
from __future__ import annotations

import math

import numpy as np
from scipy.stats import kurtosis, norm, skew

from .portfolio import PortfolioResult


def daily_returns(res: PortfolioResult) -> np.ndarray:
    eq = res.daily_equity
    return np.diff(eq) / eq[:-1] if len(eq) > 1 else np.array([])


def sharpe(r: np.ndarray) -> float:
    return float(np.mean(r) / np.std(r, ddof=1) * math.sqrt(365)) if len(r) > 2 and np.std(r) > 0 else 0.0


def sortino(r: np.ndarray) -> float:
    dn = r[r < 0]
    dd = math.sqrt(float(np.mean(np.minimum(r, 0) ** 2))) if len(r) else 0.0
    return float(np.mean(r) / dd * math.sqrt(365)) if dd > 0 and len(dn) else 0.0


def max_drawdown(eq: np.ndarray) -> float:
    if len(eq) == 0:
        return 0.0
    peak = np.maximum.accumulate(eq)
    return float(np.max(1 - eq / peak))


def exposure(res: PortfolioResult) -> float:
    iv = sorted((tk.trade.entry_t, tk.exit_t) for tk in res.taken)
    tot, cur_s, cur_e = 0, None, None
    for s, e in iv:
        if cur_e is None or s > cur_e:
            if cur_e is not None:
                tot += cur_e - cur_s
            cur_s, cur_e = s, e
        else:
            cur_e = max(cur_e, e)
    if cur_e is not None:
        tot += cur_e - cur_s
    span = max(1, res.t1 - res.t0)
    return tot / span


def summarize(res: PortfolioResult) -> dict:
    r = daily_returns(res)
    pnl = np.array([tk.pnl for tk in res.taken])
    wins, losses = pnl[pnl > 0].sum(), -pnl[pnl < 0].sum()
    fees = sum(tk.qty * tk.trade.fees_q for tk in res.taken)
    fund = sum(tk.qty * tk.trade.funding_q for tk in res.taken)
    slp = sum(tk.qty * tk.trade.slip_q for tk in res.taken)
    gross = sum(tk.qty * tk.trade.gross_q for tk in res.taken)
    rs = np.array([tk.trade.r for tk in res.taken])
    return {
        "net_pnl": float(res.daily_equity[-1] - res.equity0),
        "return_pct": float(res.daily_equity[-1] / res.equity0 - 1) * 100,
        "sharpe": sharpe(r),
        "sortino": sortino(r),
        "max_dd": max_drawdown(res.daily_equity),
        "profit_factor": float(wins / losses) if losses > 0 else (float("inf") if wins > 0 else 0.0),
        "win_rate": float((pnl > 0).mean()) if len(pnl) else 0.0,
        "avg_trade": float(pnl.mean()) if len(pnl) else 0.0,
        "avg_r": float(rs.mean()) if len(rs) else 0.0,
        "n_trades": int(len(pnl)),
        "exposure": exposure(res),
        "gross_pnl_before_costs": float(gross + slp),
        "fees": float(fees),
        "slippage": float(slp),
        "funding": float(fund),
        "days": int(len(r)),
        "kill_events": [e for e in res.events if e[1] == "KILL"],
        "skipped": dict(res.skipped),
    }


def deflated_sharpe(sr_daily: float, n_obs: int, trial_srs_daily: list[float], ret: np.ndarray) -> float:
    """Bailey & Lopez de Prado: probability that the selected strategy's true Sharpe > the best of N null trials."""
    n_trials = max(2, len(trial_srs_daily))
    v = float(np.var(trial_srs_daily, ddof=1)) if len(trial_srs_daily) > 1 else 0.0
    if n_obs < 10 or v <= 0:
        return float("nan")
    g = 0.5772156649
    sr0 = math.sqrt(v) * ((1 - g) * norm.ppf(1 - 1 / n_trials) + g * norm.ppf(1 - 1 / (n_trials * math.e)))
    sk = float(skew(ret)) if len(ret) > 3 else 0.0
    ku = float(kurtosis(ret, fisher=False)) if len(ret) > 3 else 3.0
    den = math.sqrt(max(1e-12, 1 - sk * sr_daily + (ku - 1) / 4 * sr_daily ** 2))
    return float(norm.cdf((sr_daily - sr0) * math.sqrt(n_obs - 1) / den))

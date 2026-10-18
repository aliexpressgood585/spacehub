"""Performance statistics."""
import numpy as np
import pandas as pd


def compute_stats(trades, equity, start_balance, totals=None):
    """trades: list of dicts; equity: list of (ts_ms, equity)."""
    eq = pd.Series([e for _, e in equity], index=pd.to_datetime([t for t, _ in equity], unit="ms"))
    net = [t["net_pnl"] for t in trades]
    wins = [x for x in net if x > 0]
    losses = [x for x in net if x <= 0]
    s = {}
    final = float(eq.iloc[-1]) if len(eq) else start_balance
    s["start_balance"] = start_balance
    s["final_equity"] = round(final, 2)
    s["net_pnl"] = round(final - start_balance, 2)
    s["return_pct"] = round((final / start_balance - 1) * 100, 3)
    s["trades"] = len(trades)
    s["win_rate_pct"] = round(100 * len(wins) / len(trades), 2) if trades else 0.0
    s["profit_factor"] = round(sum(wins) / abs(sum(losses)), 3) if losses and sum(losses) != 0 else (float("inf") if wins else 0.0)
    s["avg_win"] = round(float(np.mean(wins)), 2) if wins else 0.0
    s["avg_loss"] = round(float(np.mean(losses)), 2) if losses else 0.0
    s["gross_pnl"] = round(sum(t["gross_pnl"] for t in trades), 2)
    s["fees_paid"] = round(sum(t["fees"] for t in trades), 2)
    s["funding_net"] = round(sum(t["funding"] for t in trades), 2)   # + received / - paid
    if totals:
        s["fees_paid_total_incl_open"] = round(totals["fees"], 2)
        s["funding_net_total_incl_open"] = round(totals["funding"], 2)
        s["liquidations"] = totals["liquidations"]
    if len(eq) > 1:
        peak = eq.cummax()
        dd = (eq - peak) / peak
        s["max_drawdown_pct"] = round(float(dd.min()) * 100, 3)
        s["max_drawdown_usdt"] = round(float((eq - peak).min()), 2)
        daily = eq.resample("1D").last().dropna()
        r = daily.pct_change().dropna()
        s["sharpe_daily_ann"] = round(float(r.mean() / r.std() * np.sqrt(365)), 3) if len(r) > 2 and r.std() > 0 else 0.0
        s["days"] = round((eq.index[-1] - eq.index[0]).total_seconds() / 86400, 1)
    by = {}
    for t in trades:
        b = by.setdefault(t["symbol"], {"trades": 0, "net_pnl": 0.0, "wins": 0})
        b["trades"] += 1; b["net_pnl"] += t["net_pnl"]; b["wins"] += t["net_pnl"] > 0
    s["by_symbol"] = {k: {"trades": v["trades"], "net_pnl": round(v["net_pnl"], 2),
                          "win_rate_pct": round(100 * v["wins"] / v["trades"], 1)} for k, v in by.items()}
    reasons = {}
    for t in trades:
        reasons[t["reason"]] = reasons.get(t["reason"], 0) + 1
    s["exit_reasons"] = reasons
    s["long_trades"] = sum(t["side"] == "LONG" for t in trades)
    s["short_trades"] = sum(t["side"] == "SHORT" for t in trades)
    return s

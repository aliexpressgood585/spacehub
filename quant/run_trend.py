"""Trend sleeve study (Clenow-style), through the SAME gates as Phase 1, then side by side with CHAN.

    KIND=funding bash backtest/fetch-daily-all.sh    (funding archives for every coin that ever enters the universe)
    python -m quant.run_trend                        (writes reports/TREND_REPORT.md + trend.json)

Protocol, every choice frozen before the holdout is read:
  - data: daily klines of every USDT perpetual Binance ever listed, delisted included (point-in-time universe);
  - development = first 80% of the usable days, holdout = last 20%, read ONCE;
  - walk-forward on development: train 2y -> test 6m, rolling; the variant with the best TRAIN Sharpe is run on the
    next test window; stitched test windows = WF-OOS;
  - final variant = best Sharpe over the whole development period; the holdout is run once with it;
  - N for the deflated Sharpe = every variant listed in config (6); PBO by CSCV over their development returns;
  - GATE (unchanged): holdout Sharpe > 1.5, max DD < 15%, >= 200 holdout trades, deflated Sharpe >= 0.95,
    PBO < 0.5, no DECAY / HOLDOUT_FLIP. Fail -> trend.enabled stays false.
"""
from __future__ import annotations

import datetime as dt
import json
import time
from pathlib import Path

import numpy as np
import pandas as pd

from .afml.overfit import dsr, pbo, sr
from .backtest import trend_sim as TS
from .config import ROOT, load_config

DAY = 86_400_000


def load_panel(cfg) -> TS.Panel:
    d = (ROOT / cfg["trend"]["data_dir"]).resolve()
    frames, fund = {}, {}
    for p in sorted(d.glob("*-1d.csv")):
        s = p.name[:-7]
        base = s[4:] if s.startswith("1000") else s
        if base in __import__("quant.strategies.trend", fromlist=["DENY"]).DENY:
            continue
        df = pd.read_csv(p, header=None, usecols=[0, 1, 2, 3, 4, 7], names=["t", "o", "h", "l", "c", "qv"])
        df = df[(df[["o", "h", "l", "c"]] > 0).all(axis=1)].drop_duplicates("t").set_index("t")
        if len(df) >= 30:
            frames[s] = df
            fp = d / f"{s}-funding.csv"
            if fp.exists():
                f = pd.read_csv(fp, header=None, usecols=[0, 2], names=["t", "r"]).dropna()
                fund[s] = ((f["t"].to_numpy(np.int64) // 1000) * 1000, f["r"].to_numpy(float))
    days = np.array(sorted(set().union(*[df.index for df in frames.values()])), np.int64)
    syms = sorted(frames, key=lambda s: (s != "BTC", s))
    arr = {k: np.full((len(days), len(syms)), np.nan) for k in ("o", "h", "l", "c", "qv")}
    for j, s in enumerate(syms):
        ix = np.searchsorted(days, frames[s].index.to_numpy())
        for k in arr:
            arr[k][ix, j] = frames[s][k].to_numpy(float)
    bb = cfg["costs"]["slippage"]["base_bps"]
    base = np.array([float(bb.get(s, bb["default"])) for s in syms])
    return TS.Panel(syms, days, arr["o"], arr["h"], arr["l"], arr["c"], arr["qv"], [fund.get(s) for s in syms], base)


def rets(eq):
    return np.diff(eq) / eq[:-1] if len(eq) > 1 else np.array([])


def stats(res: TS.TrendResult) -> dict:
    eq = res.daily_eq
    r = rets(eq)
    pk = np.maximum.accumulate(eq) if len(eq) else eq
    pnl = np.array([t["pnl"] for t in res.trades])
    return {"sharpe": sr(r) * np.sqrt(365) if len(r) > 2 else 0.0, "return_pct": float(eq[-1] / eq[0] - 1) * 100 if len(eq) else 0.0,
            "max_dd": float(np.max(1 - eq / pk)) if len(eq) else 0.0, "n_trades": len(res.trades),
            "win_rate": float((pnl > 0).mean()) if len(pnl) else 0.0, "avg_r": float(np.mean([t["r"] for t in res.trades])) if res.trades else 0.0,
            "profit_factor": float(pnl[pnl > 0].sum() / -pnl[pnl < 0].sum()) if (pnl < 0).any() else 0.0,
            "fees": res.fees, "slippage": res.slippage, "funding": res.funding, "gross_before_costs": res.gross,
            "funding_inferred_position_days": res.funding_inferred_days, "killed": res.killed_at is not None,
            "exits": {k: int(sum(t["reason"] == k for t in res.trades)) for k in ("STOP", "REBALANCE", "UNIVERSE", "DELISTED", "KILL")}}


def vname(v):
    return f"{v['kind']}{'' if v['kind'] == 'breakout' else v['n']}_{'ls' if v['shorts'] else 'long'}"


def main(argv=None):
    cfg = load_config()
    tc = cfg["trend"]
    T0 = time.time()
    P = load_panel(cfg)
    I = TS.Indicators(P, cfg)
    ever = [P.syms[j] for j in np.flatnonzero(I.uni.any(axis=0))]
    (ROOT / tc["data_dir"]).resolve().joinpath("funding-symbols.txt").write_text("\n".join(s + "USDT" for s in ever) + "\n")
    nfund = sum(P.fund[P.syms.index(s)] is not None for s in ever)
    n_uni = I.uni.sum(axis=1)
    start = int(np.argmax((n_uni >= 20) & np.isfinite(TS.TR.sma(P.c[:, [0]], tc["regime_ma"])[:, 0])))
    Tn = len(P.days)
    hold = start + int(0.8 * (Tn - start))
    print(f"{len(P.syms)} symbols ({len(ever)} ever in the universe, funding archive for {nfund}); "
          f"usable {pd.to_datetime(P.days[start], unit='ms').date()} .. {pd.to_datetime(P.days[-1], unit='ms').date()}, "
          f"holdout from {pd.to_datetime(P.days[hold], unit='ms').date()}")
    V = tc["variants"]
    names = [vname(v) for v in V]
    # development: full-period run per variant (for selection, DSR trials and PBO)
    dev = {n: TS.run(P, I, cfg, v, start, hold) for n, v in zip(names, V)}
    dev_stats = {n: stats(r) for n, r in dev.items()}
    for n in names:
        s = dev_stats[n]
        print(f"  dev {n:18s} Sharpe {s['sharpe']:+.2f} ret {s['return_pct']:+7.1f}% DD {s['max_dd']:.1%} trades {s['n_trades']}{' KILLED' if s['killed'] else ''}")
    # walk-forward inside development
    tr_d, te_d = tc["wf"]["train_days"], tc["wf"]["test_days"]
    a, folds, oos_r, oos_trades, is_srs, picks = start, [], [], 0, [], []
    while a + tr_d + te_d <= hold:
        srs = {n: stats(TS.run(P, I, cfg, v, a, a + tr_d))["sharpe"] for n, v in zip(names, V)}
        best = max(srs, key=srs.get)
        te = TS.run(P, I, cfg, V[names.index(best)], a + tr_d, a + tr_d + te_d)
        s = stats(te)
        folds.append({"train": [str(pd.to_datetime(P.days[a], unit='ms').date()), str(pd.to_datetime(P.days[a + tr_d], unit='ms').date())],
                      "chosen": best, "train_sharpe": srs[best], "test_sharpe": s["sharpe"], "test_return_pct": s["return_pct"], "test_trades": s["n_trades"]})
        oos_r.append(rets(te.daily_eq)); oos_trades += s["n_trades"]; is_srs.append(srs[best]); picks.append(best)
        a += te_d
    rr = np.concatenate(oos_r) if oos_r else np.array([])
    eqo = np.cumprod(np.concatenate([[1.0], 1 + rr]))
    wf = {"sharpe": sr(rr) * np.sqrt(365), "trades": oos_trades, "return_pct": float(eqo[-1] - 1) * 100,
          "max_dd": float(np.max(1 - eqo / np.maximum.accumulate(eqo))), "folds": folds}
    # final choice on development, then the holdout ONCE
    sel = max(names, key=lambda n: dev_stats[n]["sharpe"])
    ho = TS.run(P, I, cfg, V[names.index(sel)], hold, Tn)
    hs = stats(ho)
    stress = {f"x{m}": stats(TS.run(P, I, cfg, V[names.index(sel)], hold, Tn, slip_mult=m)) for m in (2.0, 5.0)}
    ho_all = {n: stats(TS.run(P, I, cfg, v, hold, Tn)) for n, v in zip(names, V)}
    L = min(len(r.daily_eq) for r in dev.values())
    M = np.column_stack([rets(dev[n].daily_eq[:L]) for n in names])
    pb = pbo(M, 16)
    trial = [sr(M[:, k]) for k in range(len(names))]
    d_dev = dsr(rets(dev[sel].daily_eq), trial, len(names))
    d_ho = dsr(rets(ho.daily_eq), trial, len(names))
    flags = []
    is_mean = float(np.mean(is_srs)) if is_srs else 0.0
    if is_mean > 0 and wf["sharpe"] < 0.5 * is_mean:
        flags.append(f"DECAY: WF-OOS Sharpe {wf['sharpe']:.2f} vs mean in-sample {is_mean:.2f}")
    if dev_stats[sel]["sharpe"] > 0 and hs["sharpe"] < 0:
        flags.append("HOLDOUT_FLIP")
    if len(picks) > 2 and sum(picks[i] != picks[i - 1] for i in range(1, len(picks))) > (len(picks) - 1) / 2:
        flags.append("UNSTABLE: the chosen variant changed in most folds")
    g = cfg["gates"]["phase1"]
    checks = {"holdout_sharpe>1.5": hs["sharpe"] > g["min_sharpe"], "max_dd<15%": hs["max_dd"] < g["max_drawdown"],
              "trades>=200": hs["n_trades"] >= g["min_trades"], "dsr_dev>=0.95": bool(np.isfinite(d_dev) and d_dev >= 0.95),
              "pbo<0.5": pb["pbo"] < 0.5, "no_decay_or_flip": not any(f.startswith(("DECAY", "HOLDOUT_FLIP")) for f in flags)}
    verdict = "GO" if all(checks.values()) else "NO-GO"
    print(f"selected {sel}: holdout Sharpe {hs['sharpe']:+.2f} ret {hs['return_pct']:+.1f}% DD {hs['max_dd']:.1%} trades {hs['n_trades']}; "
          f"WF-OOS Sharpe {wf['sharpe']:+.2f} ({oos_trades} trades); DSR dev {d_dev:.2f} / holdout {d_ho:.2f}; PBO {pb['pbo']:.2f} -> {verdict}")
    out = {"generated_utc": dt.datetime.utcnow().isoformat(timespec="seconds"), "symbols_total": len(P.syms), "ever_in_universe": len(ever),
           "funding_archives": nfund, "usable_from": str(pd.to_datetime(P.days[start], unit='ms').date()),
           "holdout_from": str(pd.to_datetime(P.days[hold], unit='ms').date()), "to": str(pd.to_datetime(P.days[-1], unit='ms').date()),
           "n_variants": len(names), "dev": dev_stats, "wf_oos": wf, "selected": sel, "holdout": hs, "holdout_all_variants": ho_all,
           "cost_stress": stress, "dsr_dev": d_dev, "dsr_holdout": d_ho, "pbo": pb, "flags": flags, "gate": checks, "verdict": verdict}
    out["combined"] = combined(cfg, P, I, V[names.index(sel)], sel)
    out["runtime_s"] = round(time.time() - T0)
    rp = ROOT / "reports"
    (rp / "trend.json").write_text(json.dumps(out, indent=1, default=lambda x: float(x) if isinstance(x, (np.floating, np.integer)) else str(x)))
    from .trend_report import write
    write(out, rp / "TREND_REPORT.md")
    print(f"done in {out['runtime_s']}s")


def combined(cfg, P, I, variant, name):
    """CHAN (Phase-1 router, its own risk manager and 10% kill) and the trend sleeve on separate capital, 50/50,
    over CHAN's 36-month span; portfolio kill across both. Per-strategy P&L and the correlation of daily returns."""
    from . import run_backtest as RB
    from .backtest.portfolio import run_portfolio
    share = cfg["trend"]["capital_share"]
    bars, comps, _ = RB.build(cfg, "5m", cfg["universe"], log=lambda *a: None)
    params = json.load(open(ROOT / "reports" / "backtest-5m.json"))["strategies"]["regime_router"]["chosen_final"]
    trades = []
    for c in comps["regime_router"]:
        trades += c.trades[c.params.index(params[c.name])]
    t0 = int(min(b.t[0] for b in bars.values())) // DAY * DAY + DAY
    t1 = int(max(b.t[-1] for b in bars.values()))
    hold = int(t0 + 0.8 * (t1 - t0)) // DAY * DAY
    ch = run_portfolio(trades, bars, cfg, t0, t1, equity0=10_000 * (1 - share))
    ch_eq = pd.Series(ch.daily_equity[1:], index=(ch.daily_t[1:] // DAY) * DAY)
    i0, i1 = int(np.searchsorted(P.days, ch_eq.index[0])), int(np.searchsorted(P.days, ch_eq.index[-1]))
    tr = TS.run(P, I, cfg, variant, i0, i1 + 1, equity0=10_000 * share)
    tr_eq = pd.Series(tr.daily_eq, index=P.days[i0:i1 + 1])
    df = pd.concat({"chan": ch_eq, "trend": tr_eq}, axis=1).ffill().dropna()
    tot = df.sum(axis=1)
    pk = tot.cummax()
    kill = (tot <= pk * (1 - cfg["portfolio"]["max_drawdown_kill"])).to_numpy()
    kill_at = int(np.argmax(kill)) if kill.any() else None
    comb = tot.copy()
    if kill_at is not None:
        comb.iloc[kill_at:] = comb.iloc[kill_at]
    r = df.pct_change().dropna()
    cr = comb.pct_change().dropna()

    def seg(mask):
        s = comb[mask]
        rr = s.pct_change().dropna()
        return {"return_pct": float(s.iloc[-1] / s.iloc[0] - 1) * 100 if len(s) > 1 else 0.0, "sharpe": sr(rr.to_numpy()) * np.sqrt(365),
                "max_dd": float((1 - s / s.cummax()).max()),
                "chan_pnl": float(df["chan"][mask].iloc[-1] - df["chan"][mask].iloc[0]), "trend_pnl": float(df["trend"][mask].iloc[-1] - df["trend"][mask].iloc[0])}
    idx = df.index.to_numpy()
    return {"span": [str(pd.to_datetime(idx[0], unit='ms').date()), str(pd.to_datetime(idx[-1], unit='ms').date())],
            "trend_variant": name, "capital_share_trend": share,
            "correlation_daily": float(r["chan"].corr(r["trend"])),
            "chan_alone": {"pnl": float(df["chan"].iloc[-1] - df["chan"].iloc[0]), "sharpe": sr(r["chan"].to_numpy()) * np.sqrt(365),
                           "max_dd": float((1 - df["chan"] / df["chan"].cummax()).max()), "trades": len(ch.taken)},
            "trend_alone": {"pnl": float(df["trend"].iloc[-1] - df["trend"].iloc[0]), "sharpe": sr(r["trend"].to_numpy()) * np.sqrt(365),
                            "max_dd": float((1 - df["trend"] / df["trend"].cummax()).max()), "trades": len(tr.trades)},
            "combined_full": {**seg(np.ones(len(df), bool)), "sharpe": sr(cr.to_numpy()) * np.sqrt(365)},
            "combined_chan_holdout": seg(idx >= hold),
            "portfolio_kill": None if kill_at is None else str(pd.to_datetime(idx[kill_at], unit='ms').date()),
            "note": "CHAN's parameters were chosen on its own first 80% (Phase 1), so the part of this span before "
                    f"{pd.to_datetime(hold, unit='ms').date()} is in-sample for CHAN; the trend variant was chosen on its own development period."}


if __name__ == "__main__":
    main()

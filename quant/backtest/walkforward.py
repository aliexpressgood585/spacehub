"""Walk-forward optimisation + an untouched holdout (Chan ch. 1: data-snooping bias).

Timeline:  [ ---------------- walk-forward region (80%) ---------------- ][ ---- HOLDOUT (20%) ---- ]
           [ train 1 ][ test 1 ]
                     [ train 2 ][ test 2 ] ...    rolling, test windows never overlap
- In each fold the parameter set with the best TRAIN Sharpe is chosen and run on the next TEST window; the stitched
  test windows are the walk-forward out-of-sample (WF-OOS) record.
- The parameters for the holdout are chosen on the whole walk-forward region only. The holdout is then run ONCE.
  Nothing learned from it feeds back into any choice (the gate reads it; nobody tunes on it).
- Kelly sizing in a test window is seeded with the chosen parameters' trades from its training window, so position
  sizes use only past evidence.
Overfit flags raised on a strategy:
  DECAY        WF-OOS Sharpe < 50% of the mean in-sample (train) Sharpe of the chosen sets
  UNSTABLE     the chosen parameter set changes in more than half of the folds
  DEFLATED     deflated Sharpe ratio (Bailey & Lopez de Prado, N = grid size) of the selection < 0.95
  HOLDOUT_FLIP positive in-sample, negative on the holdout
  NO_EDGE_IN_SAMPLE  the best-in-train parameter sets are not even positive in-sample
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field

import numpy as np

from ..data.loader import Bars
from .engine import Trade
from .metrics import daily_returns, deflated_sharpe, sharpe, summarize
from .portfolio import run_portfolio

DAY = 86_400_000


@dataclass
class Component:
    """One strategy inside an evaluation: its grid and the (size-free) trades each parameter set produces."""
    name: str
    params: list[dict]
    trades: list[list[Trade]]          # trades[k] = all symbols' trades for params[k]


@dataclass
class Evaluation:
    name: str
    folds: list[dict] = field(default_factory=list)
    wf_oos: dict = field(default_factory=dict)
    holdout: dict = field(default_factory=dict)
    in_sample: dict = field(default_factory=dict)
    chosen_final: dict = field(default_factory=dict)
    flags: list[str] = field(default_factory=list)
    gate: dict = field(default_factory=dict)
    edge: dict = field(default_factory=dict)
    holdout_fixed_risk: dict = field(default_factory=dict)
    verdict: str = ""
    notes: list[str] = field(default_factory=list)


def edge_stats(trades: list[Trade], a: int, b: int) -> dict:
    """Size-free per-trade edge of the raw signal (all symbols, no portfolio limits): the cleanest read of whether
    the idea has an edge at all, and how much of it the costs take."""
    ts = [t for t in trades if a <= t.entry_t < b]
    if not ts:
        return {"n": 0}
    px = np.array([t.entry_px for t in ts])
    net = np.array([t.pnl_q for t in ts]) / px * 1e4
    gross = np.array([t.gross_q + t.slip_q for t in ts]) / px * 1e4
    cost = np.array([t.fees_q + t.funding_q + t.slip_q for t in ts]) / px * 1e4
    r = np.array([t.r for t in ts])
    sd = float(np.std(net, ddof=1)) if len(net) > 1 else 0.0
    return {"n": len(ts), "avg_r": float(r.mean()), "win_rate": float((net > 0).mean()),
            "gross_bps_before_costs": float(gross.mean()), "costs_bps": float(cost.mean()), "net_bps": float(net.mean()),
            "t_stat_net": float(net.mean() / sd * np.sqrt(len(net))) if sd > 0 else 0.0,
            "exits": {k: int(sum(t.reason == k for t in ts)) for k in ("STOP", "TARGET", "SIGNAL", "TIMEOUT")}}


def _score(trades, bars, cfg, a, b, seed=None):
    res = run_portfolio(trades, bars, cfg, a, b, seed_r=seed)
    return res, sharpe(daily_returns(res))


def _pick(comp: Component, bars, cfg, a, b) -> tuple[int, float, list[float]]:
    scores = []
    for k in range(len(comp.params)):
        res, s = _score(comp.trades[k], bars, cfg, a, b)
        n = len(res.taken)
        scores.append((s if n >= 10 else -99.0, n))
    best = max(range(len(scores)), key=lambda k: (scores[k][0], scores[k][1]))
    return best, scores[best][0], [s for s, _ in scores]


def _seed(comp: Component, k: int, a: int, b: int) -> list[float]:
    return [tr.r for tr in comp.trades[k] if a <= tr.entry_t and tr.exit_t <= b]


def evaluate(name: str, comps: list[Component], bars: dict[str, Bars], cfg: dict, tf: str) -> Evaluation:
    bt = cfg["backtest"]
    t_start = int(min(b.t[0] for b in bars.values()))
    t_end = int(max(b.t[-1] for b in bars.values()))
    hold_start = int(t_start + (1 - bt["holdout_frac"]) * (t_end - t_start))
    hold_start = (hold_start // DAY) * DAY
    train = int((bt["wf_train_days"][tf] if isinstance(bt["wf_train_days"], dict) else bt["wf_train_days"]) * DAY)
    test = int((bt["wf_test_days"][tf] if isinstance(bt["wf_test_days"], dict) else bt["wf_test_days"]) * DAY)
    ev = Evaluation(name)
    # --- walk-forward --------------------------------------------------------------------------------------
    a = (t_start // DAY + 1) * DAY
    wf_ret, wf_trades, chosen_hist, is_sharpes = [], [], [], []
    while a + train + test <= hold_start:
        tr_a, tr_b, te_b = a, a + train, a + train + test
        picks, seed, fold_trades = [], {}, []
        for comp in comps:
            k, s_is, _ = _pick(comp, bars, cfg, tr_a, tr_b)
            picks.append((comp.name, k))
            is_sharpes.append(s_is)
            seed[comp.name] = _seed(comp, k, tr_a, tr_b)
            fold_trades += comp.trades[k]
        res = run_portfolio(fold_trades, bars, cfg, tr_b, te_b, seed_r=seed)
        r = daily_returns(res)
        wf_ret.append(r)
        wf_trades += res.taken
        chosen_hist.append(tuple(picks))
        ev.folds.append({"train": [tr_a, tr_b], "test": [tr_b, te_b],
                         "chosen": {c: comps[i].params[k] for i, (c, k) in enumerate(picks)},
                         "test_sharpe": sharpe(r), "test_trades": len(res.taken),
                         "test_return_pct": float(res.daily_equity[-1] / res.equity0 - 1) * 100})
        a += test
    if ev.folds:
        rr = np.concatenate(wf_ret)
        pnl = np.array([tk.pnl for tk in wf_trades])
        eq = np.cumprod(np.concatenate([[1.0], 1 + rr]))
        ev.wf_oos = {"sharpe": sharpe(rr), "trades": len(wf_trades), "compounded_return_pct": float(eq[-1] - 1) * 100,
                     "max_dd": float(np.max(1 - eq / np.maximum.accumulate(eq))),
                     "win_rate": float((pnl > 0).mean()) if len(pnl) else 0.0, "folds": len(ev.folds),
                     "positive_folds": int(sum(f["test_return_pct"] > 0 for f in ev.folds))}
    # --- final choice on the whole WF region, then the holdout (once) --------------------------------------
    wf_a = (t_start // DAY + 1) * DAY
    final, seed, trial_srs, hold_trades = {}, {}, [], []
    for comp in comps:
        k, s_is, srs = _pick(comp, bars, cfg, wf_a, hold_start)
        final[comp.name] = comp.params[k]
        trial_srs += srs
        seed[comp.name] = _seed(comp, k, wf_a, hold_start)
        hold_trades += comp.trades[k]
    ev.chosen_final = final
    is_res = run_portfolio([t for c, (cn, p) in zip(comps, final.items()) for t in c.trades[c.params.index(p)]], bars, cfg, wf_a, hold_start)
    ev.in_sample = summarize(is_res)
    hres = run_portfolio(hold_trades, bars, cfg, hold_start, t_end + 1, seed_r=seed)
    ev.holdout = summarize(hres)
    ev.holdout["period"] = [hold_start, t_end]
    # the same holdout at a FIXED default risk (Kelly switched off): shows the strategy even when half-Kelly refuses it
    import copy
    cfg_fixed = copy.deepcopy(cfg)
    cfg_fixed["risk"]["kelly_min_trades"] = 10 ** 9
    ev.holdout_fixed_risk = summarize(run_portfolio(hold_trades, bars, cfg_fixed, hold_start, t_end + 1))
    ev.edge = {"in_sample": edge_stats(is_res_trades := [t for c in comps for t in c.trades[c.params.index(final[c.name])]], wf_a, hold_start),
               "holdout": edge_stats(is_res_trades, hold_start, t_end + 1)}
    # --- overfit flags -------------------------------------------------------------------------------------
    is_mean = float(np.mean([s for s in is_sharpes if s > -99])) if is_sharpes else 0.0
    if ev.folds and is_mean > 0 and ev.wf_oos["sharpe"] < 0.5 * is_mean:
        ev.flags.append(f"DECAY: WF-OOS Sharpe {ev.wf_oos['sharpe']:.2f} vs mean in-sample {is_mean:.2f}")
    if ev.folds and is_mean <= 0:
        ev.flags.append(f"NO_EDGE_IN_SAMPLE: even the best in-sample parameter sets average Sharpe {is_mean:.2f}")
    if len(chosen_hist) > 2:
        changes = sum(chosen_hist[i] != chosen_hist[i - 1] for i in range(1, len(chosen_hist)))
        if changes > (len(chosen_hist) - 1) / 2:
            ev.flags.append(f"UNSTABLE: chosen parameters changed in {changes} of {len(chosen_hist) - 1} fold transitions")
    r_is = daily_returns(is_res)
    sr_d = float(np.mean(r_is) / np.std(r_is, ddof=1)) if len(r_is) > 2 and np.std(r_is) > 0 else 0.0
    trial_d = [s / np.sqrt(365) for s in trial_srs if s > -99]
    dsr = deflated_sharpe(sr_d, len(r_is), trial_d, r_is)
    ev.in_sample["deflated_sharpe_prob"] = dsr
    if not (dsr >= 0.95):
        ev.flags.append(f"DEFLATED: probability the in-sample winner beats {len(trial_srs)} null trials = {dsr:.2f} (< 0.95)")
    if ev.in_sample["sharpe"] > 0 and ev.holdout["sharpe"] < 0:
        ev.flags.append("HOLDOUT_FLIP: positive in-sample, negative on the untouched holdout")
    # --- phase-1 gate --------------------------------------------------------------------------------------
    g = cfg["gates"]["phase1"]
    h = ev.holdout
    checks = {"sharpe": (h["sharpe"], h["sharpe"] > g["min_sharpe"]), "max_dd": (h["max_dd"], h["max_dd"] < g["max_drawdown"]),
              "trades": (h["n_trades"], h["n_trades"] >= g["min_trades"])}
    ev.gate = {k: {"value": v, "pass": bool(p)} for k, (v, p) in checks.items()}
    ev.verdict = "GO" if all(p for _, p in checks.values()) and not any(f.startswith(("DECAY", "HOLDOUT_FLIP")) for f in ev.flags) else "NO-GO"
    return ev


def to_json(ev: Evaluation) -> str:
    def conv(x):
        if isinstance(x, (np.floating,)):
            return float(x)
        if isinstance(x, (np.integer,)):
            return int(x)
        return str(x)
    return json.dumps(ev.__dict__, default=conv, indent=1)

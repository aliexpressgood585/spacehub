"""AFML study: CHAN router alone vs CHAN + meta-labeling, out-of-sample, after costs.

    python -m quant.run_meta --tf 5m               (36 months, 10 coins; writes reports/META_REPORT.md + meta-5m.json)
    python -m quant.run_meta --bars-study          (also: time vs volume vs dollar bars from 1m, 12 months)

Protocol (every choice frozen before the holdout is read):
  1. The primary model is the CHAN regime router with the parameters Phase 1 chose (reports/backtest-5m.json).
     Its candidate signals are the events; each gets triple-barrier labels (k = 1, 2) and features at its close.
  2. Development = the first 80% of the timeline (same split as Phase 1); holdout = the last 20%, read once.
  3. On development: purged K-fold with embargo -> one OOS probability per event per model config -> OOS daily
     returns for all variants (model x label x threshold x sizing) -> PBO (CSCV) and the trial Sharpes for DSR.
     CPCV (6 groups, 2 test) -> 5 stitched OOS paths per variant; the variant with the best MEAN path Sharpe is selected.
  4. The selected variant is refitted on development (events that end before the holdout) and run once on the
     holdout through the SAME engine as Phase 1 (real fills, fees, slippage, funding), next to plain CHAN.
  5. Gate: meta beats plain on the holdout (Sharpe and net return) AND DSR > 0.95 (N = number of variants).
     Otherwise the answer is: keep plain CHAN. The live bot is not touched by this script.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import time
from pathlib import Path

import numpy as np

from .afml import bars as AB
from .afml import meta as M
from .afml.cv import cpcv, purged_kfold
from .afml.features import FEATURES, bar_features, event_matrix, load_taker
from .afml.fracdiff import min_d
from .afml.labeling import avg_uniqueness, triple_barrier
from .afml.overfit import dsr, pbo, psr, sr
from .backtest.engine import simulate, slip_base
from .config import ROOT, load_config
from .data.loader import TF_MS, load_bars, load_funding
from .strategies import mean_reversion as MR
from .strategies import momentum as MOM
from .strategies import regime as RG

DAY = 86_400_000
LEGS = ("RG_MR", "RG_MOM")


def router_signals(b, cfg, tf, params, mst=None, reg=None):
    mst = mst if mst is not None else MR.stat_arrays(b.close, cfg, tf)
    reg = reg if reg is not None else RG.regimes(b.close, cfg, tf)
    s_mr = MR.signals(b, params["RG_MR"], cfg, tf, stats={**mst, "adf": np.zeros(len(b))})
    z = s_mr.info["z"]
    s_mr = s_mr.masked(reg == RG.MEAN_REVERT)
    s_mom = MOM.signals(b, params["RG_MOM"], cfg, tf)
    t_sig = s_mom.info["t_sig"]
    s_mom = s_mom.masked(reg == RG.TREND)
    return mst, reg, [s_mr, s_mom], z, t_sig


def build(cfg, tf, symbols, params, log=print):
    ddir = (ROOT / cfg["data"]["dir"]).resolve()
    A = cfg["afml"]
    bars = {s: load_bars(ddir, s, tf) for s in symbols}
    fund = {s: load_funding(ddir, s) for s in symbols}
    t_start = int(min(b.t[0] for b in bars.values()))
    t_end = int(max(b.t[-1] for b in bars.values()))
    hold_start = int(t_start + (1 - cfg["backtest"]["holdout_frac"]) * (t_end - t_start)) // DAY * DAY
    ev = {k: [] for k in ("sym", "leg", "i", "t0", "t1", "side", "w", "X")}
    lab = {k: {"meta": [], "ret": [], "bin": []} for k in A["labels"]["barrier_mult"]}
    sigs, dmap = {}, {}
    taker, tf_ms = cfg["costs"]["taker_fee"], TF_MS[tf]
    for s in symbols:
        t0c = time.time()
        b = bars[s]
        mst, reg, legs, z_mr, mom_t = router_signals(b, cfg, tf, params)
        d = min_d(np.log(b.close[b.t < hold_start]))
        dmap[s] = d
        tb = load_taker(ddir, s, tf, b.t)
        f = bar_features(b, mst, z_mr, mom_t, tb, fund[s], d)
        rng = np.concatenate([[0.0], (b.high - b.low)[:-1] / b.close[:-1]])
        slip = slip_base(s, cfg) + float(cfg["costs"]["slippage"]["range_frac"]) * rng
        n = len(b)
        iv0, iv1, rows = [], [], []
        for leg, sg in enumerate(legs):
            sigs[(s, leg)] = sg
            idx = np.flatnonzero(sg.side != 0)
            idx = idx[idx + 1 < n]
            side = sg.side[idx].astype(int)
            hold = sg.max_hold[idx]
            ok = hold > 0
            idx, side, hold = idx[ok], side[ok], hold[ok]
            cost = 2 * taker + 2 * slip[idx + 1]
            for k in lab:
                L = triple_barrier(b.open, b.high, b.low, b.close, idx, side, hold, f["vol"], k, k, cost)
                lab[k]["meta"].append(L["meta"]); lab[k]["ret"].append(L["ret"]); lab[k]["bin"].append(L["bin"])
            end = np.minimum(n - 1, idx + hold)
            ev["sym"] += [s] * len(idx); ev["leg"].append(np.full(len(idx), leg)); ev["i"].append(idx)
            ev["t0"].append(b.t[idx + 1]); ev["t1"].append(b.t[end] + tf_ms); ev["side"].append(side)
            ev["X"].append(event_matrix(f, idx, side, leg))
            iv0.append(idx + 1); iv1.append(end)
            rows.append(len(idx))
        u = avg_uniqueness(np.concatenate(iv0), np.concatenate(iv1), n)
        ev["w"].append(u)
        log(f"  {s}: {sum(rows)} events (MR {rows[0]}, MOM {rows[1]}), ffd d={d:.1f}, {time.time() - t0c:.1f}s")
    E = {"sym": np.array(ev["sym"]), "leg": np.concatenate(ev["leg"]), "i": np.concatenate(ev["i"]),
         "t0": np.concatenate(ev["t0"]), "t1": np.concatenate(ev["t1"]), "side": np.concatenate(ev["side"]),
         "w": np.concatenate(ev["w"]), "X": np.vstack(ev["X"])}
    for k in lab:
        E[f"meta_{k}"] = np.concatenate(lab[k]["meta"]).astype(int)
        E[f"ret_{k}"] = np.concatenate(lab[k]["ret"])
        E[f"bin_{k}"] = np.concatenate(lab[k]["bin"])
    o = np.argsort(E["t0"], kind="stable")
    E = {k: v[o] for k, v in E.items()}
    return bars, fund, sigs, E, hold_start, t_start, t_end, dmap


class Evaluator:
    """Runs a probability vector through the real engine and returns daily fixed-risk returns + trade stats."""

    def __init__(self, bars, fund, sigs, E, cfg):
        self.bars, self.fund, self.sigs, self.E, self.cfg = bars, fund, sigs, E, cfg
        self.risk = float(cfg["afml"]["eval_risk_per_trade"])
        self.key = {}
        for j, (s, leg) in enumerate(zip(E["sym"], E["leg"])):
            self.key.setdefault((s, int(leg)), []).append(j)
        self.key = {k: np.array(v) for k, v in self.key.items()}
        self._plain = {}

    def run(self, p, thr, sizing, a, b):
        trades, mults = [], []
        for (s, leg), sg in self.sigs.items():
            bb = self.bars[s]
            js = self.key.get((s, leg), np.array([], int))
            pe = p[js] if p is not None else np.ones(len(js))
            if p is None:
                if (s, leg) not in self._plain:
                    self._plain[(s, leg)] = simulate(bb, sg, self.cfg, LEGS[leg], self.fund[s])
                tr = self._plain[(s, leg)]
            else:
                allow = np.ones(len(bb), bool)
                keep = ~np.isfinite(pe) | (pe > thr)
                allow[self.E["i"][js]] = keep
                tr = simulate(bb, sg.masked(allow), self.cfg, LEGS[leg], self.fund[s])
            pm = dict(zip(self.E["i"][js], pe))
            for t in tr:
                if not (a <= t.entry_t < b):
                    continue
                i = int(np.searchsorted(bb.t, t.entry_t)) - 1
                pi = pm.get(i, np.nan)
                m = float(M.bet_size(np.array([pi]))[0]) if (sizing and np.isfinite(pi)) else 1.0
                if m <= 0:
                    continue
                trades.append(t); mults.append(m)
        return self.stats(trades, np.array(mults), a, b)

    def stats(self, trades, mults, a, b):
        days = np.arange(a // DAY, (b - 1) // DAY + 1)
        ret = np.zeros(len(days))
        if trades:
            r = np.array([t.r for t in trades])
            dd = np.clip(np.array([t.exit_t // DAY for t in trades]) - days[0], 0, len(days) - 1)
            np.add.at(ret, dd, self.risk * mults * r)
            px = np.array([t.entry_px for t in trades])
            net = np.array([t.pnl_q for t in trades]) / px * 1e4
            gross = np.array([t.gross_q + t.slip_q for t in trades]) / px * 1e4
            cost = np.array([t.fees_q + t.funding_q + t.slip_q for t in trades]) / px * 1e4
        else:
            net = gross = cost = np.array([])
        return {"daily": ret, "n": len(trades), "avg_size": float(mults.mean()) if len(mults) else 0.0,
                "net_bps": float(net.mean()) if len(net) else 0.0, "gross_bps": float(gross.mean()) if len(gross) else 0.0,
                "cost_bps": float(cost.mean()) if len(cost) else 0.0, "win_rate": float((net > 0).mean()) if len(net) else 0.0,
                "return_pct": float(ret.sum() * 100), "sharpe_ann": sr(ret) * np.sqrt(365), "sr_daily": sr(ret)}


def summary(st):
    return {k: v for k, v in st.items() if k != "daily"}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--tf", default="5m")
    ap.add_argument("--symbols", default=None)
    ap.add_argument("--bars-study", action="store_true")
    ap.add_argument("--out", default=str(ROOT / "reports"))
    a = ap.parse_args(argv)
    cfg = load_config()
    A = cfg["afml"]
    symbols = a.symbols.split(",") if a.symbols else cfg["universe"]
    params = json.load(open(ROOT / "reports" / f"backtest-{a.tf}.json"))["strategies"]["regime_router"]["chosen_final"]
    T0 = time.time()
    print(f"router params (frozen by Phase 1): {params}")
    bars, fund, sigs, E, hold_start, t_start, t_end, dmap = build(cfg, a.tf, symbols, params)
    ev = Evaluator(bars, fund, sigs, E, cfg)
    dev = E["t0"] < hold_start
    hold = ~dev
    Xd = E["X"][dev]
    wd = E["w"][dev]
    wd = wd / wd.mean()
    avg_u = float(E["w"][dev].mean())
    t0d, t1d = E["t0"][dev], E["t1"][dev]
    emb = int(A["cv"]["embargo_days"] * DAY)
    kf = list(purged_kfold(t0d, t1d, A["cv"]["n_splits"], emb))
    splits, paths, groups = cpcv(t0d, t1d, A["cv"]["cpcv_groups"], A["cv"]["cpcv_test_groups"], emb)
    dev_a, dev_b = int(t_start // DAY * DAY), int(hold_start)
    ho_a, ho_b = int(hold_start), int(t_end + DAY)
    print(f"events: {len(E['t0'])} (dev {dev.sum()}, holdout {hold.sum()}), avg uniqueness {avg_u:.3f}, "
          f"kfold {len(kf)} splits, CPCV {len(splits)} splits / {len(paths)} paths")
    out = {"tf": a.tf, "symbols": symbols, "router_params": params, "generated_utc": dt.datetime.utcnow().isoformat(timespec="seconds"),
           "events": {"total": int(len(E["t0"])), "dev": int(dev.sum()), "holdout": int(hold.sum()), "avg_uniqueness": avg_u},
           "ffd_d": dmap, "labels": {}, "variants": {}, "cpcv": {}}
    for k in A["labels"]["barrier_mult"]:
        y = E[f"meta_{k}"]
        out["labels"][str(k)] = {"meta_positive_dev": float(y[dev].mean()), "meta_positive_holdout": float(y[hold].mean()),
                                 "tb_upper": float((E[f"bin_{k}"] == 1).mean()), "tb_lower": float((E[f"bin_{k}"] == -1).mean()),
                                 "tb_vertical": float((E[f"bin_{k}"] == 0).mean()), "mean_net_ret_bps": float(np.nanmean(E[f"ret_{k}"]) * 1e4)}
    plain_dev = ev.run(None, 0, False, dev_a, dev_b)
    plain_ho = ev.run(None, 0, False, ho_a, ho_b)
    variants, dev_series, path_sr, oosp, cpcv_auc = [], {}, {}, {}, {}
    from sklearn.metrics import roc_auc_score
    for model in A["models"]:
        for k in A["labels"]["barrier_mult"]:
            y = E[f"meta_{k}"][dev]
            cfgname = f"{model}_k{k}"
            t1 = time.time()
            p_oos = np.full(dev.sum(), np.nan)
            for tr, te in kf:
                p_oos[te] = M.fit_predict(model, Xd, y, wd, tr, te, avg_u)
            oosp[cfgname] = p_oos
            cpcv_auc[cfgname] = float(roc_auc_score(y, p_oos, sample_weight=wd)) if len(np.unique(y)) > 1 else float("nan")
            sp = []
            for tr, tg in splits:
                te = np.concatenate([groups[g] for g in tg])
                sp.append((te, M.fit_predict(model, Xd, y, wd, tr, te, avg_u)))
            path_p = []
            for P in paths:
                pv = np.full(dev.sum(), np.nan)
                for g, sidx in P.items():
                    te, pr = sp[sidx]
                    pos = np.searchsorted(te, groups[g])
                    pv[groups[g]] = pr[pos]
                path_p.append(pv)
            for thr in A["thresholds"]:
                for sz in A["sizing"]:
                    name = f"{cfgname}_t{thr:.2f}{'_size' if sz else ''}"
                    full = np.full(len(E["t0"]), np.nan)
                    full[dev] = p_oos
                    st = ev.run(full, thr, sz, dev_a, dev_b)
                    dev_series[name] = st["daily"]
                    srs = []
                    for pv in path_p:
                        full = np.full(len(E["t0"]), np.nan)
                        full[dev] = pv
                        srs.append(ev.run(full, thr, sz, dev_a, dev_b)["sharpe_ann"])
                    path_sr[name] = srs
                    variants.append(name)
                    out["variants"][name] = {"dev_kfold_oos": summary(st), "cpcv_path_sharpe": srs,
                                             "cpcv_mean_sharpe": float(np.mean(srs)), "cpcv_min_sharpe": float(np.min(srs))}
            print(f"  {cfgname}: OOS AUC {cpcv_auc[cfgname]:.3f}, {time.time() - t1:.0f}s")
    out["oos_auc"] = cpcv_auc
    # selection on development only
    best = max(variants, key=lambda v: out["variants"][v]["cpcv_mean_sharpe"])
    Mx = np.column_stack([dev_series[v] for v in variants])
    out["pbo"] = pbo(Mx, 16)
    trial_srs = [sr(dev_series[v]) for v in variants]
    out["selected"] = best
    out["plain"] = {"dev": summary(plain_dev), "holdout": summary(plain_ho)}
    # final fit on development events that end before the holdout, one read of the holdout
    ho_res = {}
    fin_p = {}
    for model in A["models"]:
        for k in A["labels"]["barrier_mult"]:
            cfgname = f"{model}_k{k}"
            y = E[f"meta_{k}"]
            tr = np.flatnonzero(dev & (E["t1"] < hold_start))
            te = np.flatnonzero(hold)
            w = E["w"] / E["w"][dev].mean()
            full = np.full(len(E["t0"]), np.nan)
            full[te] = M.fit_predict(model, E["X"], y, w, tr, te, avg_u)
            fin_p[cfgname] = full
    for v in variants:
        model, k, rest = v.split("_", 2)
        thr = float(rest[1:5])
        ho_res[v] = ev.run(fin_p[f"{model}_{k}"], thr, rest.endswith("size"), ho_a, ho_b)
        out["variants"][v]["holdout"] = summary(ho_res[v])
    sel = ho_res[best]
    d_ho = dsr(sel["daily"], trial_srs, len(variants))
    d_dev = dsr(dev_series[best], trial_srs, len(variants))
    beats = sel["sharpe_ann"] > plain_ho["sharpe_ann"] and sel["return_pct"] > plain_ho["return_pct"]
    gate = beats and np.isfinite(d_ho) and d_ho > A["gate"]["min_dsr"]
    out["gate"] = {"selected": best, "holdout_meta": summary(sel), "holdout_plain": summary(plain_ho),
                   "beats_plain": bool(beats), "dsr_holdout": d_ho, "dsr_dev_oos": d_dev, "psr_holdout_vs_0": psr(sel["daily"]),
                   "n_trials": len(variants), "min_dsr": A["gate"]["min_dsr"], "PASS": bool(gate),
                   "verdict": "USE META-LABELING" if gate else "KEEP PLAIN CHAN"}
    # feature importance for the selected model config (why trades are taken)
    model, k, _ = best.split("_", 2)
    y = E[f"meta_{float(k[1:])}"][dev]
    out["importance"] = {"mda_purged_kfold": M.mda(model, Xd, y, wd, kf, avg_u, FEATURES),
                         "mdi_rf_in_sample": M.mdi(model, Xd, y, wd, avg_u, FEATURES)}
    if a.bars_study:
        out["bars_study"] = bars_study(cfg, symbols, params)
    out["runtime_s"] = round(time.time() - T0, 1)
    Path(a.out).mkdir(parents=True, exist_ok=True)
    (Path(a.out) / f"meta-{a.tf}.json").write_text(json.dumps(out, indent=1, default=float))
    from .afml.report import write_report
    write_report(out, Path(a.out) / "META_REPORT.md")
    print(f"selected {best}: holdout Sharpe {sel['sharpe_ann']:.2f} vs plain {plain_ho['sharpe_ann']:.2f}, "
          f"DSR {d_ho:.3f}, PBO {out['pbo']['pbo']:.2f} -> {out['gate']['verdict']}  ({out['runtime_s']}s)")


def bars_study(cfg, symbols, params, log=print):
    """Time vs volume vs dollar bars built from the same 1m archive, same bar COUNT; plain CHAN router on each."""
    ddir = (ROOT / cfg["data"]["dir"]).resolve()
    res = {"time_5m": [], "volume": [], "dollar": []}
    edges = {k: {"net": [], "gross": [], "cost": [], "n": 0} for k in res}
    for s in symbols:
        m1 = load_bars(ddir, s, "1m")
        f = load_funding(ddir, s)
        tb = AB.time_bars(m1, 5, "5m")
        vb = AB.activity_bars(m1, m1.volume, len(tb), "5m")
        db = AB.activity_bars(m1, m1.volume * m1.close, len(tb), "5m")
        for name, bb in (("time_5m", tb), ("volume", vb), ("dollar", db)):
            res[name].append(AB.return_properties(bb))
            _, _, legs, _, _ = router_signals(bb, cfg, "5m", params)
            for leg, sg in enumerate(legs):
                for t in simulate(bb, sg, cfg, LEGS[leg], f):
                    edges[name]["net"].append(t.pnl_q / t.entry_px * 1e4)
                    edges[name]["gross"].append((t.gross_q + t.slip_q) / t.entry_px * 1e4)
                    edges[name]["cost"].append((t.fees_q + t.funding_q + t.slip_q) / t.entry_px * 1e4)
        log(f"  bars study {s}: {len(tb)} bars each")
    out = {}
    for name in res:
        e = edges[name]
        net = np.array(e["net"])
        out[name] = {"median_jarque_bera": float(np.median([r["jarque_bera"] for r in res[name]])),
                     "median_abs_lag1_autocorr": float(np.median([abs(r["lag1_autocorr"]) for r in res[name]])),
                     "median_excess_kurtosis": float(np.median([r["kurtosis_excess"] for r in res[name]])),
                     "router_trades": int(len(net)), "router_net_bps": float(net.mean()) if len(net) else 0.0,
                     "router_gross_bps": float(np.mean(e["gross"])) if len(net) else 0.0,
                     "router_cost_bps": float(np.mean(e["cost"])) if len(net) else 0.0,
                     "router_t_net": float(net.mean() / net.std(ddof=1) * np.sqrt(len(net))) if len(net) > 2 else 0.0}
    return out


if __name__ == "__main__":
    main()

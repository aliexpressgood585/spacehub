"""Phase 1: run every strategy through walk-forward + holdout and write the report with a go/no-go verdict.

    python -m quant.run_backtest --tf 5m            (36 months, 10 coins)
    python -m quant.run_backtest --tf 1m            (12 months, 10 coins)
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import time
from pathlib import Path

import numpy as np

from .backtest.engine import simulate
from .backtest.walkforward import Component, evaluate, to_json
from .config import ROOT, load_config
from .data.loader import load_bars, load_funding
from .strategies import mean_reversion as MR
from .strategies import momentum as MOM
from .strategies import regime as RG


def build(cfg: dict, tf: str, symbols: list[str], log=print):
    ddir = (ROOT / cfg["data"]["dir"]).resolve()
    bars = {s: load_bars(ddir, s, tf) for s in symbols}
    funding = {s: load_funding(ddir, s) for s in symbols}
    log(f"loaded {tf}: " + ", ".join(f"{s} {len(b):,}" for s, b in bars.items()))
    mr_grid, mom_grid = MR.grid(cfg), MOM.grid(cfg)
    mr_tr = [[] for _ in mr_grid]; mom_tr = [[] for _ in mom_grid]
    rmr_tr = [[] for _ in mr_grid]; rmom_tr = [[] for _ in mom_grid]
    diag = {"mr_gate_active": {}, "mom_gate_active": {}, "regime_share": {}}
    for s in symbols:
        t0 = time.time()
        b = bars[s]
        mst = MR.stat_arrays(b.close, cfg, tf)
        reg = RG.regimes(b.close, cfg, tf)
        diag["regime_share"][s] = {name: float((reg == v).mean()) for name, v in
                                   (("neutral", RG.NEUTRAL), ("mean_revert", RG.MEAN_REVERT), ("trend", RG.TREND), ("high_vol", RG.HIGH_VOL))}
        for k, p in enumerate(mr_grid):
            sg = MR.signals(b, p, cfg, tf, stats=mst)
            if k == 0:
                diag["mr_gate_active"][s] = sg.info["active_frac"]
            mr_tr[k] += simulate(b, sg, cfg, "MR", funding[s])
            # router: MR only where the regime filter says mean-reverting (its own ADF gate is replaced by the regime)
            sg_r = MR.signals(b, p, cfg, tf, stats={**mst, "adf": np.zeros(len(b))})
            rmr_tr[k] += simulate(b, sg_r.masked(reg == RG.MEAN_REVERT), cfg, "RG_MR", funding[s])
        cache: dict = {}
        for k, p in enumerate(mom_grid):
            sg = MOM.signals(b, p, cfg, tf, sig_cache=cache)
            diag["mom_gate_active"].setdefault(s, {})[f"{p['lookback']}/{p['hold']}"] = sg.info["active_frac"]
            mom_tr[k] += simulate(b, sg, cfg, "MOM", funding[s])
            rmom_tr[k] += simulate(b, sg.masked(reg == RG.TREND), cfg, "RG_MOM", funding[s])
        log(f"  {s}: signals + trades in {time.time() - t0:.1f}s")
    comps = {
        "mean_reversion": [Component("MR", mr_grid, mr_tr)],
        "momentum": [Component("MOM", mom_grid, mom_tr)],
        "regime_router": [Component("RG_MR", mr_grid, rmr_tr), Component("RG_MOM", mom_grid, rmom_tr)],
    }
    return bars, comps, diag


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--tf", default="5m")
    ap.add_argument("--config", default=None)
    ap.add_argument("--symbols", default=None)
    ap.add_argument("--out", default=str(ROOT / "reports"))
    a = ap.parse_args(argv)
    cfg = load_config(a.config)
    symbols = a.symbols.split(",") if a.symbols else cfg["universe"]
    t0 = time.time()
    bars, comps, diag = build(cfg, a.tf, symbols)
    out = {"tf": a.tf, "symbols": symbols, "generated_utc": dt.datetime.utcnow().isoformat(timespec="seconds"), "diagnostics": diag, "strategies": {}}
    for name, cs in comps.items():
        ev = evaluate(name, cs, bars, cfg, a.tf)
        out["strategies"][name] = json.loads(to_json(ev))
        print(f"{name}: holdout Sharpe {ev.holdout['sharpe']:.2f} DD {ev.holdout['max_dd']:.1%} trades {ev.holdout['n_trades']} -> {ev.verdict}")
    Path(a.out).mkdir(parents=True, exist_ok=True)
    p = Path(a.out) / f"backtest-{a.tf}.json"
    p.write_text(json.dumps(out, indent=1, default=str))
    print(f"wrote {p} in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()

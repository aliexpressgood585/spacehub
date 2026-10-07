"""Broad 3Y research: candle-pattern + regime discovery, LONG/SHORT, train-only selection."""
import json
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from numba import njit

import flow_reversal as flow
import market_gate_check as core
from strategy_specs import TOP10

COST = core.COST
START, SPLIT, END = core.START, core.SPLIT, core.END
TIMEFRAMES = (5, 15)
LENGTHS = (2, 3, 4, 5, 6)
HORIZONS = (15, 30, 60, 120)
TOPK = 40
MIN_STAGE = 800
MIN_FILTER = 400
MIN_EXACT = 300
EXIT_CONFIGS = (
    (0.003, 0.003, 30),
    (0.004, 0.003, 60),
    (0.005, 0.003, 60),
    (0.006, 0.004, 60),
    (0.008, 0.004, 120),
    (0.008, 0.006, 120),
    (0.010, 0.005, 120),
    (0.010, 0.008, 180),
    (0.0125, 0.0075, 180),
    (0.015, 0.010, 240),
    (0.020, 0.010, 240),
)
FILTER_NAMES = (
    "none",
    "trend_align",
    "trend_oppose",
    "volume_spike",
    "atr_high",
    "btc_align",
    "btc_oppose",
    "trend_volume",
    "trend_btc",
    "volume_btc",
    "trend_volume_btc",
    "oppose_volume",
)

def make_bars(a, minutes):
    m = int(minutes)
    step = m * 60000
    t = a[:, 0].astype(np.int64)
    starts = np.flatnonzero(t % step == 0)
    starts = starts[starts + m - 1 < len(a)]
    starts = starts[t[starts + m - 1] - t[starts] == (m - 1) * 60000]
    blocks = a[starts[:, None] + np.arange(m)]
    bars = np.column_stack((
        a[starts, 0],
        a[starts, 1],
        blocks[:, :, 2].max(axis=1),
        blocks[:, :, 3].min(axis=1),
        a[starts + m - 1, 4],
        blocks[:, :, 5].sum(axis=1),
    ))
    entry = starts + m
    return bars, entry

def prev_mean(x, n=20):
    out = np.full(len(x), np.nan)
    if len(x) <= n:
        return out
    cs = np.r_[0.0, np.cumsum(x)]
    out[n:] = (cs[n:-0 if False else len(x)] - cs[:len(x)-n]) / n
    return out

def pattern_arrays(bars, length):
    n = len(bars)
    idx = np.arange(length - 1, n, dtype=np.int64)
    code = np.zeros(len(idx), dtype=np.int64)
    valid = np.ones(len(idx), dtype=bool)
    green = bars[:, 4] > bars[:, 1]
    non_doji = bars[:, 4] != bars[:, 1]
    for pos in range(length):
        src = idx - (length - 1 - pos)
        code = (code << 1) | green[src].astype(np.int64)
        valid &= non_doji[src]
    return idx, code, valid

def pattern_text(code, length):
    return "".join("G" if (code >> (length - 1 - i)) & 1 else "R" for i in range(length))

def ema_features(bars, minutes):
    rsi, e50, e200, adx, plus, minus = core.indicators(bars, minutes * 60000)
    atr = flow.atr14(bars)
    vol_prev = np.full(len(bars), np.nan)
    v = bars[:, 5]
    if len(v) > 20:
        cs = np.r_[0.0, np.cumsum(v)]
        vol_prev[20:] = (cs[20:len(v)] - cs[:len(v)-20]) / 20
    atr_pct = atr / bars[:, 4]
    train = (bars[:, 0] >= START) & (bars[:, 0] < SPLIT) & np.isfinite(atr_pct)
    atr_cut = float(np.nanmedian(atr_pct[train])) if np.any(train) else np.nan
    return {
        "e50": e50, "e200": e200, "atr_pct": atr_pct, "atr_cut": atr_cut,
        "vol_prev": vol_prev,
    }

def btc_features(bars, minutes):
    k = max(1, int(round(60 / minutes)))
    r = np.full(len(bars), np.nan)
    if len(bars) > k:
        r[k:] = bars[k:, 4] / bars[:-k, 4] - 1
    return {"t": bars[:, 0].astype(np.int64), "ret60": r}

def build_dataset(sym, a):
    out = {"minutes": a}
    for tf in TIMEFRAMES:
        bars, entry = make_bars(a, tf)
        out[tf] = {
            "bars": bars,
            "entry": entry,
            "feat": ema_features(bars, tf),
        }
    return sym, out

def stage_aggregate(datasets):
    candidates = []
    for tf in TIMEFRAMES:
        for length in LENGTHS:
            groups = 1 << length
            for horizon in HORIZONS:
                stats = {
                    1: {"n": np.zeros(groups), "sum": np.zeros(groups), "sq": np.zeros(groups), "win": np.zeros(groups)},
                    -1: {"n": np.zeros(groups), "sum": np.zeros(groups), "sq": np.zeros(groups), "win": np.zeros(groups)},
                }
                for sym in TOP10:
                    ds = datasets[sym]
                    a = ds["minutes"]
                    bars = ds[tf]["bars"]
                    entry_map = ds[tf]["entry"]
                    idx, code, valid = pattern_arrays(bars, length)
                    eidx = entry_map[idx]
                    ok = valid & (eidx + horizon - 1 < len(a))
                    if not np.any(ok):
                        continue
                    idx2 = idx[ok]
                    code2 = code[ok]
                    e2 = eidx[ok]
                    x2 = e2 + horizon - 1
                    entry_ts = a[e2, 0]
                    exit_ts = a[x2, 0]
                    train = (entry_ts >= START) & (entry_ts < SPLIT) & (exit_ts < SPLIT)
                    if not np.any(train):
                        continue
                    code2 = code2[train]
                    e2 = e2[train]
                    x2 = x2[train]
                    gross = a[x2, 4] / a[e2, 1] - 1
                    for side in (1, -1):
                        net = side * gross - COST
                        st = stats[side]
                        st["n"] += np.bincount(code2, minlength=groups)
                        st["sum"] += np.bincount(code2, weights=net, minlength=groups)
                        st["sq"] += np.bincount(code2, weights=net * net, minlength=groups)
                        st["win"] += np.bincount(code2, weights=(net > 0).astype(float), minlength=groups)
                for side in (1, -1):
                    st = stats[side]
                    for codev in range(groups):
                        n = int(st["n"][codev])
                        if n < MIN_STAGE:
                            continue
                        mean = st["sum"][codev] / n
                        var = max(0.0, st["sq"][codev] / n - mean * mean)
                        se = (var / n) ** 0.5 if var > 0 else 0.0
                        tscore = mean / se if se > 0 else 0.0
                        candidates.append({
                            "tf": tf, "length": length, "code": codev,
                            "pattern": pattern_text(codev, length),
                            "side": side, "screen_horizon_min": horizon,
                            "screen_train_n": n,
                            "screen_train_wr": round(100 * st["win"][codev] / n, 3),
                            "screen_train_avg_net_bps": round(mean * 10000, 4),
                            "screen_train_t": round(float(tscore), 4),
                        })
    # Deduplicate the same pattern/side/tf across horizons using train-only average net.
    best = {}
    for c in candidates:
        key = (c["tf"], c["length"], c["code"], c["side"])
        if key not in best or c["screen_train_avg_net_bps"] > best[key]["screen_train_avg_net_bps"]:
            best[key] = c
    ranked = sorted(best.values(), key=lambda c: (c["screen_train_avg_net_bps"], c["screen_train_t"]), reverse=True)
    return ranked[:TOPK], ranked

def filter_masks(ds, tf, idx, side, btc):
    bars = ds[tf]["bars"]
    f = ds[tf]["feat"]
    align = np.isfinite(f["e200"][idx]) & (
        ((side == 1) & (f["e50"][idx] > f["e200"][idx]) & (bars[idx, 4] > f["e200"][idx])) |
        ((side == -1) & (f["e50"][idx] < f["e200"][idx]) & (bars[idx, 4] < f["e200"][idx]))
    )
    oppose = np.isfinite(f["e200"][idx]) & (
        ((side == 1) & (f["e50"][idx] < f["e200"][idx]) & (bars[idx, 4] < f["e200"][idx])) |
        ((side == -1) & (f["e50"][idx] > f["e200"][idx]) & (bars[idx, 4] > f["e200"][idx]))
    )
    vol = np.isfinite(f["vol_prev"][idx]) & (bars[idx, 5] >= 1.5 * f["vol_prev"][idx])
    atr = np.isfinite(f["atr_pct"][idx]) & np.isfinite(f["atr_cut"]) & (f["atr_pct"][idx] >= f["atr_cut"])

    bt = btc["t"]
    j = np.searchsorted(bt, bars[idx, 0].astype(np.int64))
    exact = (j < len(bt))
    jj = np.minimum(j, len(bt) - 1)
    exact &= bt[jj] == bars[idx, 0].astype(np.int64)
    br = np.full(len(idx), np.nan)
    br[exact] = btc["ret60"][jj[exact]]
    ba = np.isfinite(br) & (side * br > 0)
    bo = np.isfinite(br) & (side * br < 0)

    return {
        "none": np.ones(len(idx), dtype=bool),
        "trend_align": align,
        "trend_oppose": oppose,
        "volume_spike": vol,
        "atr_high": atr,
        "btc_align": ba,
        "btc_oppose": bo,
        "trend_volume": align & vol,
        "trend_btc": align & ba,
        "volume_btc": vol & ba,
        "trend_volume_btc": align & vol & ba,
        "oppose_volume": oppose & vol,
    }

def entries_and_fixed_net(ds, btc, cand, filter_name, period):
    tf, length, codev, side, horizon = (
        cand["tf"], cand["length"], cand["code"], cand["side"], cand["screen_horizon_min"]
    )
    bars = ds[tf]["bars"]
    a = ds["minutes"]
    entry_map = ds[tf]["entry"]
    idx, codes, valid = pattern_arrays(bars, length)
    keep = valid & (codes == codev)
    idx = idx[keep]
    if not len(idx):
        return np.empty(0, dtype=np.int64), np.empty(0)
    masks = filter_masks(ds, tf, idx, side, btc)
    idx = idx[masks[filter_name]]
    if not len(idx):
        return np.empty(0, dtype=np.int64), np.empty(0)
    eidx = entry_map[idx]
    ok = eidx + horizon - 1 < len(a)
    eidx = eidx[ok]
    if not len(eidx):
        return np.empty(0, dtype=np.int64), np.empty(0)
    xidx = eidx + horizon - 1
    if period == "train":
        pm = (a[eidx, 0] >= START) & (a[eidx, 0] < SPLIT) & (a[xidx, 0] < SPLIT)
    else:
        pm = (a[eidx, 0] >= SPLIT) & (a[eidx, 0] < END) & (a[xidx, 0] < END)
    eidx = eidx[pm]
    xidx = xidx[pm]
    net = side * (a[xidx, 4] / a[eidx, 1] - 1) - COST
    return eidx.astype(np.int64), net

@njit
def simulate_exact(a, entries, side, tp, sl, hold_min, start, end):
    out = np.empty(len(entries), np.float64)
    count = 0
    last_exit = -1
    boundary = np.searchsorted(a[:, 0], end)
    for k in range(len(entries)):
        i = int(entries[k])
        if i <= last_exit:
            continue
        ts = a[i, 0]
        if ts < start or ts >= end:
            continue
        e = a[i, 1]
        if side > 0:
            target = e * (1 + tp)
            stop = e * (1 - sl)
        else:
            target = e * (1 - tp)
            stop = e * (1 + sl)
        limit = min(boundary, i + hold_min)
        found = False
        for j in range(i, limit):
            if side > 0:
                if a[j, 1] <= stop:
                    px = a[j, 1]
                    found = True
                elif a[j, 1] >= target:
                    px = target
                    found = True
                elif a[j, 3] <= stop:
                    px = stop
                    found = True
                elif a[j, 2] >= target:
                    px = target
                    found = True
                else:
                    continue
            else:
                if a[j, 1] >= stop:
                    px = a[j, 1]
                    found = True
                elif a[j, 1] <= target:
                    px = target
                    found = True
                elif a[j, 2] >= stop:
                    px = stop
                    found = True
                elif a[j, 3] <= target:
                    px = target
                    found = True
                else:
                    continue
            out[count] = side * (px / e - 1) - COST
            count += 1
            last_exit = j
            break
        if not found:
            if i + hold_min > boundary:
                break
            j = i + hold_min - 1
            px = a[j, 4]
            out[count] = side * (px / e - 1) - COST
            count += 1
            last_exit = j
    return out[:count]

def metrics(v):
    v = np.asarray(v, dtype=float)
    n = len(v)
    if not n:
        return {"n": 0, "wins": 0, "wr": None, "pf": None, "avg_net_bps": None, "sum_net_pct": 0}
    pos = float(v[v > 0].sum())
    neg = float(-v[v < 0].sum())
    wins = int((v > 0).sum())
    return {
        "n": n,
        "wins": wins,
        "wr": round(100 * wins / n, 3),
        "pf": round(pos / neg, 4) if neg else None,
        "avg_net_bps": round(float(v.mean()) * 10000, 4),
        "sum_net_pct": round(float(v.sum()) * 100, 4),
    }

def evaluate_candidate(datasets, btc_by_tf, cand):
    # Train-only filter selection using the screen horizon.
    filter_stats = {}
    for fname in FILTER_NAMES:
        vals = []
        for sym in TOP10:
            _, net = entries_and_fixed_net(datasets[sym], btc_by_tf[cand["tf"]], cand, fname, "train")
            if len(net):
                vals.append(net)
        v = np.concatenate(vals) if vals else np.empty(0)
        filter_stats[fname] = metrics(v)
    eligible_filters = [k for k, m in filter_stats.items() if m["n"] >= MIN_FILTER and m["avg_net_bps"] is not None]
    chosen_filter = max(eligible_filters, key=lambda k: filter_stats[k]["avg_net_bps"]) if eligible_filters else "none"

    # Cache train/validation entries for the chosen filter.
    per_symbol_entries = {}
    for sym in TOP10:
        tr, _ = entries_and_fixed_net(datasets[sym], btc_by_tf[cand["tf"]], cand, chosen_filter, "train")
        va, _ = entries_and_fixed_net(datasets[sym], btc_by_tf[cand["tf"]], cand, chosen_filter, "validation")
        per_symbol_entries[sym] = (tr, va)

    config_rows = []
    for tp, sl, hold in EXIT_CONFIGS:
        vals = []
        for sym in TOP10:
            a = datasets[sym]["minutes"]
            tr = per_symbol_entries[sym][0]
            if len(tr):
                x = simulate_exact(a, tr, cand["side"], tp, sl, hold, START, SPLIT)
                if len(x):
                    vals.append(x)
        v = np.concatenate(vals) if vals else np.empty(0)
        m = metrics(v)
        config_rows.append({"tp_pct": tp * 100, "sl_pct": sl * 100, "hold_min": hold, "train": m})

    eligible_cfg = [x for x in config_rows if x["train"]["n"] >= MIN_EXACT and x["train"]["avg_net_bps"] is not None]
    chosen = max(
        eligible_cfg,
        key=lambda x: (x["train"]["avg_net_bps"], x["train"]["pf"] or 0)
    ) if eligible_cfg else max(config_rows, key=lambda x: x["train"]["n"])

    vals = []
    for sym in TOP10:
        a = datasets[sym]["minutes"]
        va = per_symbol_entries[sym][1]
        if len(va):
            x = simulate_exact(
                a, va, cand["side"],
                chosen["tp_pct"] / 100, chosen["sl_pct"] / 100, chosen["hold_min"],
                SPLIT, END
            )
            if len(x):
                vals.append(x)
    validation = metrics(np.concatenate(vals) if vals else np.empty(0))
    train = chosen["train"]
    eligible = (
        train["n"] >= MIN_EXACT and validation["n"] >= MIN_EXACT and
        (train["pf"] or 0) > 1.15 and (validation["pf"] or 0) > 1.15 and
        (train["avg_net_bps"] or -999) > 0 and (validation["avg_net_bps"] or -999) > 0
    )
    return {
        **cand,
        "side_name": "LONG" if cand["side"] == 1 else "SHORT",
        "filter_train_metrics": filter_stats,
        "selected_filter_train_only": chosen_filter,
        "exit_grid_train": config_rows,
        "selected_exit_train_only": {"tp_pct": chosen["tp_pct"], "sl_pct": chosen["sl_pct"], "hold_min": chosen["hold_min"]},
        "train_exact": train,
        "validation_exact": validation,
        "eligible_for_shadow": bool(eligible),
    }

def run():
    symbols = list(TOP10) + ["BTCUSDT"]
    with ThreadPoolExecutor(max_workers=4) as pool:
        loaded = list(pool.map(lambda s: (s, flow.load_minutes(s)[0]), symbols))
    minutes = dict(loaded)
    datasets = {}
    for sym in TOP10:
        k, ds = build_dataset(sym, minutes[sym])
        datasets[k] = ds

    btc_by_tf = {}
    for tf in TIMEFRAMES:
        b, _ = make_bars(minutes["BTCUSDT"], tf)
        btc_by_tf[tf] = btc_features(b, tf)

    top, all_ranked = stage_aggregate(datasets)
    print("STAGE_TOP " + json.dumps(top[:10]), flush=True)

    results = []
    for i, cand in enumerate(top, 1):
        r = evaluate_candidate(datasets, btc_by_tf, cand)
        results.append(r)
        compact = {
            "rank": i, "tf": r["tf"], "pattern": r["pattern"], "side": r["side_name"],
            "screen_bps": r["screen_train_avg_net_bps"], "filter": r["selected_filter_train_only"],
            "exit": r["selected_exit_train_only"], "train": r["train_exact"],
            "validation": r["validation_exact"], "eligible": r["eligible_for_shadow"],
        }
        print("PATTERN_RESULT " + json.dumps(compact), flush=True)

    eligible = [r for r in results if r["eligible_for_shadow"]]
    best_validation = sorted(
        results,
        key=lambda r: ((r["validation_exact"]["pf"] or -1), (r["validation_exact"]["avg_net_bps"] or -999)),
        reverse=True
    )
    report = {
        "window": {
            "start": core.START_DT.isoformat(),
            "split": core.SPLIT_DT.isoformat(),
            "end_exclusive": core.END_DT.isoformat(),
        },
        "universe": list(TOP10),
        "timeframes_min": list(TIMEFRAMES),
        "pattern_lengths": list(LENGTHS),
        "screen_horizons_min": list(HORIZONS),
        "roundtrip_cost_pct": COST * 100,
        "filters": list(FILTER_NAMES),
        "exit_configs": [{"tp_pct": x[0]*100, "sl_pct": x[1]*100, "hold_min": x[2]} for x in EXIT_CONFIGS],
        "selection": {
            "stage_min_trades": MIN_STAGE,
            "filter_min_trades": MIN_FILTER,
            "exact_min_trades": MIN_EXACT,
            "topk_distinct_pattern_side_tf": TOPK,
            "shadow_gate": "PF > 1.15, avg net > 0, and >=300 trades in BOTH train and validation",
        },
        "method": [
            "Research only; no trading runtime or account state is changed.",
            "Actual Binance Futures 1m archives; 5m/15m bars are built only from completed 1m bars.",
            "Stage A scans every non-doji red/green pattern of length 2-6 on both LONG and SHORT at 15/30/60/120m fixed exits.",
            "Stage A, regime-filter choice, and TP/SL/time-stop choice use TRAIN ONLY; validation is evaluated only after selections are frozen.",
            "Filters cover coin trend alignment/opposition, volume spike, ATR regime, BTC 60m direction, and selected combinations.",
            "Exact exits use next-minute-open entries, 1m barriers, same-bar stop-first ordering, adverse stop-gap fills, and limit-price target fills.",
            "Same-symbol overlapping positions are suppressed independently per candidate; time stops are marked at the final 1m close.",
            "Round-trip cost is 0.16% = prior fee/slippage/funding reserve assumption; funding is a reserve, not realized historical funding.",
            "Validation year has been inspected in earlier research and is therefore temporal OOS, not a pristine untouched holdout.",
            "No leverage, compounding, liquidation model, or portfolio-capacity model is used; metrics are independent-trade statistics.",
        ],
        "stage_top": top,
        "stage_ranked_count": len(all_ranked),
        "results": results,
        "eligible_for_shadow": [
            {
                "tf": r["tf"], "pattern": r["pattern"], "side": r["side_name"],
                "filter": r["selected_filter_train_only"], "exit": r["selected_exit_train_only"],
                "train": r["train_exact"], "validation": r["validation_exact"],
            } for r in eligible
        ],
        "best_validation": [
            {
                "tf": r["tf"], "pattern": r["pattern"], "side": r["side_name"],
                "filter": r["selected_filter_train_only"], "exit": r["selected_exit_train_only"],
                "train": r["train_exact"], "validation": r["validation_exact"],
                "eligible": r["eligible_for_shadow"],
            } for r in best_validation[:10]
        ],
    }
    out = Path("research-output")
    out.mkdir(exist_ok=True)
    (out / "pattern-regime-search-3y.json").write_text(json.dumps(report, indent=2, allow_nan=False))
    print("PATTERN_SUMMARY " + json.dumps({
        "tested_finalists": len(results),
        "eligible_count": len(eligible),
        "best_validation": report["best_validation"][:5],
    }), flush=True)

if __name__ == "__main__":
    run()

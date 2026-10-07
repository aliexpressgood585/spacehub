"""Focused follow-up on the strongest Broad Alpha result: bearish volatility expansion.

Research only. Uses train-development + train-selection subwindows before frozen
last-year validation. Searches signal intensity, volume confirmation, regime
filters and a wide TP/SL/holding grid, including TP10%/SL4%.
"""
import json
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import numpy as np

import market_gate_check as core
import broad_alpha_search as broad

SYMBOLS = broad.SYMBOLS
START, SPLIT, END = core.START, core.SPLIT, core.END
DEV_END = int(datetime(2025,4,7,tzinfo=timezone.utc).timestamp()*1000)
COST = core.COST
TFS = (15, 60)

BODY_ATR = (1.0, 1.25, 1.5, 1.75, 2.0, 2.25)
VOL_MULT = (1.0, 1.25, 1.5, 2.0)
EXIT_CONFIGS = [
    (tp, sl, hold)
    for tp in (.04,.06,.08,.10,.12)
    for sl in (.02,.03,.04,.05)
    for hold in (24,48,72,96)
]
FILTERS = (
    "none",
    "bear_trend",
    "btc4_down",
    "btc4_down1",
    "btc24_down2",
    "relweak1",
    "relweak2",
    "rsi55",
    "rsi60",
    "atr_high",
    "bear_btc4",
    "bear_relweak1",
    "bear_atr",
    "btc4_relweak1",
    "bear_btc_relweak",
)
TOP_FINALISTS = 24
MIN_DEV = 100
MIN_SELECT = 40
MIN_VALID = 80

def ret_n(c,n):
    out=np.full(len(c),np.nan)
    if len(c)>n:out[n:]=c[n:]/c[:-n]-1
    return out

def align_ref(bars, btc, x):
    bt=btc[:,0].astype(np.int64)
    j=np.searchsorted(bt,bars[:,0].astype(np.int64))
    ok=j<len(bt);jj=np.minimum(j,len(bt)-1)
    ok &= bt[jj]==bars[:,0].astype(np.int64)
    out=np.full(len(bars),np.nan)
    out[ok]=x[jj[ok]]
    return out

def features(a, tf):
    f=broad.features(a)
    c=a[:,4]
    k4=max(1,int(round(240/tf)))
    k24=max(1,int(round(1440/tf)))
    f["ret4h"]=ret_n(c,k4)
    f["ret24h"]=ret_n(c,k24)
    ap=f["atr"]/c
    train=(a[:,0]>=START)&(a[:,0]<DEV_END)&np.isfinite(ap)
    f["atr_cut"]=float(np.nanmedian(ap[train])) if np.any(train) else np.nan
    f["atr_pct"]=ap
    return f

def build_signal_rows(a, f, btc, bf, tf):
    c,o,v=a[:,4],a[:,1],a[:,5]
    body=np.abs(c-o)
    btc4=align_ref(a,btc,bf["ret4h"])
    btc24=align_ref(a,btc,bf["ret24h"])
    rel4=f["ret4h"]-btc4
    bear=np.isfinite(f["e100"])&(f["e20"]<f["e100"])&(c<f["e100"])
    atr_high=np.isfinite(f["atr_pct"])&(f["atr_pct"]>=f["atr_cut"])

    masks={
      "none":np.ones(len(a),bool),
      "bear_trend":bear,
      "btc4_down":btc4<0,
      "btc4_down1":btc4<=-.01,
      "btc24_down2":btc24<=-.02,
      "relweak1":rel4<=-.01,
      "relweak2":rel4<=-.02,
      "rsi55":f["rsi"]>=55,
      "rsi60":f["rsi"]>=60,
      "atr_high":atr_high,
      "bear_btc4":bear&(btc4<0),
      "bear_relweak1":bear&(rel4<=-.01),
      "bear_atr":bear&atr_high,
      "btc4_relweak1":(btc4<0)&(rel4<=-.01),
      "bear_btc_relweak":bear&(btc4<0)&(rel4<=-.01),
    }
    out=[]
    for bm in BODY_ATR:
        base=np.isfinite(f["atr"])&(c<o)&(body>=bm*f["atr"])
        for vm in VOL_MULT:
            vol=np.isfinite(f["vm20"])&(v>=vm*f["vm20"])
            s=base&vol
            for name in FILTERS:
                idx=np.flatnonzero(s&masks[name])
                idx=idx[idx+1<len(a)]
                out.append((bm,vm,name,idx.astype(np.int64)))
    return out

def subset_idx(a,idx,start,end):
    if not len(idx):return idx
    et=a[idx+1,0]
    return idx[(et>=start)&(et<end)]

def agg_sim(data, sigs, tf, params, start, end):
    tp,sl,hold=params
    vals=[];per={}
    for sym in SYMBOLS:
        a=data[sym][tf]
        idx=subset_idx(a,sigs[sym],start,end)
        if len(idx):
            x=broad.simulate(a,idx,-1,tp,sl,hold,tf,start,end)
        else:x=np.empty(0)
        per[sym]=broad.metrics(x)
        if len(x):vals.append(x)
    return broad.metrics(np.concatenate(vals) if vals else []), per

def quarter_metrics(data,sigs,tf,params):
    # fixed calendar-ish 91d blocks within validation, for stability diagnostics
    q=91*86400000
    out=[]
    s=SPLIT
    while s<END:
        e=min(END,s+q)
        m,_=agg_sim(data,sigs,tf,params,s,e)
        out.append({"start_ms":s,"end_ms":e,**m})
        s=e
    return out

def run():
    with ThreadPoolExecutor(max_workers=6) as pool:
        loaded=list(pool.map(lambda s:(s,core.load(s,"15m")[0]),SYMBOLS))
    data={}
    for sym,a15 in loaded:
        data[sym]={15:a15,60:broad.resample_1h(a15)}
        print("LOADED",sym,len(a15),len(data[sym][60]),flush=True)

    btc_feat={}
    for tf in TFS:
        btc=data["BTCUSDT"][tf]
        btc_feat[tf]=features(btc,tf)

    defs={}
    for tf in TFS:
        btc=data["BTCUSDT"][tf];bf=btc_feat[tf]
        for sym in SYMBOLS:
            a=data[sym][tf];f=features(a,tf)
            for bm,vm,fname,idx in build_signal_rows(a,f,btc,bf,tf):
                key=(tf,bm,vm,fname)
                defs.setdefault(key,{"tf":tf,"body_atr":bm,"volume_mult":vm,"filter":fname,"by_symbol":{}})
                defs[key]["by_symbol"][sym]=idx

    # Screen with the previously promising 10/4/72 setup, but require both
    # train subwindows positive. This reduces exit-grid overfitting.
    screened=[]
    base_exit=(.10,.04,72)
    for d in defs.values():
        md,_=agg_sim(data,d["by_symbol"],d["tf"],base_exit,START,DEV_END)
        ms,_=agg_sim(data,d["by_symbol"],d["tf"],base_exit,DEV_END,SPLIT)
        robust=(md["n"]>=MIN_DEV and ms["n"]>=MIN_SELECT and
                (md["avg_net_bps"] or -999)>0 and (ms["avg_net_bps"] or -999)>0)
        score=min(md["avg_net_bps"] or -999,ms["avg_net_bps"] or -999) if robust else -999
        screened.append({**d,"screen_dev":md,"screen_selection":ms,"robust_screen":bool(robust),"screen_score":score})
    screened.sort(key=lambda x:(x["screen_score"],x["screen_selection"]["pf"] or -1),reverse=True)
    finalists=[x for x in screened if x["robust_screen"]][:TOP_FINALISTS]
    if len(finalists)<TOP_FINALISTS:
        # retain diagnostics but never call these robust
        have={(x["tf"],x["body_atr"],x["volume_mult"],x["filter"]) for x in finalists}
        for x in screened:
            k=(x["tf"],x["body_atr"],x["volume_mult"],x["filter"])
            if k not in have:
                finalists.append(x);have.add(k)
            if len(finalists)>=TOP_FINALISTS:break

    results=[]
    for rank,d in enumerate(finalists,1):
        best=None
        for params in EXIT_CONFIGS:
            md,_=agg_sim(data,d["by_symbol"],d["tf"],params,START,DEV_END)
            ms,_=agg_sim(data,d["by_symbol"],d["tf"],params,DEV_END,SPLIT)
            robust=(md["n"]>=MIN_DEV and ms["n"]>=MIN_SELECT and
                    (md["avg_net_bps"] or -999)>0 and (ms["avg_net_bps"] or -999)>0)
            score=min(md["avg_net_bps"] or -999,ms["avg_net_bps"] or -999) if robust else -999
            rec={"params":params,"dev":md,"selection":ms,"robust_train":bool(robust),"score":score}
            if best is None or rec["score"]>best["score"] or (
                rec["score"]==best["score"] and (ms["pf"] or 0)>(best["selection"]["pf"] or 0)
            ):best=rec
        if best["score"]<=-999:
            # Do not optimize on validation; for non-robust screens keep 10/4/72
            md,_=agg_sim(data,d["by_symbol"],d["tf"],base_exit,START,DEV_END)
            ms,_=agg_sim(data,d["by_symbol"],d["tf"],base_exit,DEV_END,SPLIT)
            best={"params":base_exit,"dev":md,"selection":ms,"robust_train":False,"score":-999}

        mv,per=agg_sim(data,d["by_symbol"],d["tf"],best["params"],SPLIT,END)
        q=quarter_metrics(data,d["by_symbol"],d["tf"],best["params"])
        positive_q=sum(1 for x in q if x["avg_net_bps"] is not None and x["avg_net_bps"]>0)
        # Leave-one-symbol-out validation robustness computed from per-symbol trade sums/counts.
        loo=[]
        for drop in SYMBOLS:
            vals=[]
            for sym in SYMBOLS:
                if sym==drop:continue
                a=data[sym][d["tf"]];idx=subset_idx(a,d["by_symbol"][sym],SPLIT,END)
                x=broad.simulate(a,idx,-1,*best["params"],d["tf"],SPLIT,END) if len(idx) else np.empty(0)
                if len(x):vals.append(x)
            loo.append({"drop":drop,**broad.metrics(np.concatenate(vals) if vals else [])})
        loo_positive=sum(1 for x in loo if x["avg_net_bps"] is not None and x["avg_net_bps"]>0)
        eligible=bool(
            best["robust_train"] and mv["n"]>=MIN_VALID and (mv["pf"] or 0)>1.10 and
            (mv["avg_net_bps"] or -999)>0 and positive_q>=3 and loo_positive>=len(SYMBOLS)-2
        )
        r={
          "rank":rank,"tf_min":d["tf"],"body_atr":d["body_atr"],"volume_mult":d["volume_mult"],
          "filter":d["filter"],"side":"SHORT",
          "selected_exit":{"tp_pct":best["params"][0]*100,"sl_pct":best["params"][1]*100,"hold_hours":best["params"][2]},
          "dev":best["dev"],"selection":best["selection"],"robust_train":best["robust_train"],
          "validation":mv,"validation_by_symbol":per,"validation_quarters":q,
          "positive_validation_quarters":positive_q,"leave_one_out_positive":loo_positive,
          "eligible_for_shadow":eligible,
        }
        results.append(r)
        print("FOCUSED_RESULT "+json.dumps({k:r[k] for k in ("rank","tf_min","body_atr","volume_mult","filter","selected_exit","dev","selection","validation","positive_validation_quarters","leave_one_out_positive","eligible_for_shadow")}),flush=True)

    results.sort(key=lambda r:(
        1 if r["eligible_for_shadow"] else 0,
        1 if r["robust_train"] else 0,
        r["validation"]["pf"] or -1,
        r["validation"]["avg_net_bps"] or -999
    ),reverse=True)
    elig=[r for r in results if r["eligible_for_shadow"]]
    report={
      "window":{"start":core.START_DT.isoformat(),"dev_end":"2025-04-07T00:00:00+00:00","split":core.SPLIT_DT.isoformat(),"end_exclusive":core.END_DT.isoformat()},
      "symbols":SYMBOLS,"roundtrip_cost_pct":COST*100,
      "search":{"body_atr":BODY_ATR,"volume_mult":VOL_MULT,"filters":FILTERS,
                "exit_configs":[{"tp_pct":a*100,"sl_pct":b*100,"hold_hours":h} for a,b,h in EXIT_CONFIGS]},
      "gate":"positive avg net in both train subwindows; validation PF>1.10, avg net>0, >=80 trades, >=3 positive ~quarter blocks, and >=14/16 positive leave-one-symbol-out tests",
      "method":[
        "Research only; no runtime/account changes.",
        "Focused on the Broad Alpha family that looked strongest in final-year validation: red volatility-expansion SHORT.",
        "Signal and exit selection use only pre-validation data split into development and six-month temporal selection windows.",
        "Validation is the final year and is never used to choose parameters.",
        "Search includes the user's example TP10%/SL4% plus nearby 4-12% targets, 2-5% stops and 24-96h time exits.",
        "All trades include the inherited 0.16% round-trip cost assumption.",
        "Validation robustness also reports per-symbol, ~quarter blocks and leave-one-symbol-out results.",
      ],
      "screened_count":len(screened),"finalists_count":len(results),"eligible_count":len(elig),
      "eligible":elig,"results":results,
    }
    out=Path("research-output");out.mkdir(exist_ok=True)
    (out/"vol-short-focus-3y.json").write_text(json.dumps(report,indent=2,allow_nan=False))
    print("FOCUSED_SUMMARY "+json.dumps({"eligible_count":len(elig),"best":results[0] if results else None}),flush=True)

if __name__=="__main__":
    run()

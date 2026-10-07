"""Candle-context search around the strongest volatility-expansion SHORT setup.

Research only. The base trade is frozen:
15m bearish expansion >=2.25 ATR, volume >= prior20 mean,
BTC 4h return <0, coin 4h relative return <= BTC-1%,
SHORT next bar open, TP 10%, SL 3%, max hold 96h.

This run asks whether the 2-6 candles immediately BEFORE the trigger contain a
repeatable configuration that improves stability. Pattern selection is based
only on pre-validation data; the last year is reported after the candidate is frozen.
"""
import json
from itertools import product
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import numpy as np

import market_gate_check as core
import broad_alpha_search as broad

SYMBOLS = broad.SYMBOLS
START, SPLIT, END = core.START, core.SPLIT, core.END
DEV_END = int(datetime(2025,4,7,tzinfo=timezone.utc).timestamp()*1000)
TF=15
TP,SL,HOLD_H=.10,.03,96
MIN_DEV=70
MIN_SEL=25
MIN_VAL=50

def ret_n(c,n):
    out=np.full(len(c),np.nan)
    if len(c)>n: out[n:]=c[n:]/c[:-n]-1
    return out

def feat(a):
    c,o,v=a[:,4],a[:,1],a[:,5]
    return {
      "c":c,"o":o,"h":a[:,2],"l":a[:,3],"v":v,
      "atr":broad.atr(a,14),
      "vm20":broad.rolling_mean(v,20),
      "r4":ret_n(c,16),
    }

def align_ref(a,ref,x):
    rt=ref[:,0].astype(np.int64);t=a[:,0].astype(np.int64)
    j=np.searchsorted(rt,t);ok=j<len(rt);jj=np.minimum(j,len(rt)-1)
    ok &= rt[jj]==t
    out=np.full(len(a),np.nan);out[ok]=x[jj[ok]]
    return out

def base_signal(a,f,btc,bf):
    c,o,v=f["c"],f["o"],f["v"]
    btc4=align_ref(a,btc,bf["r4"])
    rel=f["r4"]-btc4
    body=np.abs(c-o)
    m=(np.isfinite(f["atr"]) & np.isfinite(f["vm20"]) &
       (c<o) & (body>=2.25*f["atr"]) &
       (v>=f["vm20"]) & (btc4<0) & (rel<=-.01))
    idx=np.flatnonzero(m)
    return idx[idx+1<len(a)].astype(np.int64)

def exact_pattern_mask(a,idx,pat):
    n=len(pat)
    keep=np.zeros(len(idx),bool)
    for k,i in enumerate(idx):
        if i<n: continue
        ok=True
        for q,ch in enumerate(pat):
            j=i-n+q
            green=a[j,4]>a[j,1]
            red=a[j,4]<a[j,1]
            if ch=="G" and not green: ok=False;break
            if ch=="R" and not red: ok=False;break
        keep[k]=ok
    return keep

def structural_mask(a,f,idx,name):
    keep=np.zeros(len(idx),bool)
    for k,i in enumerate(idx):
        if i<6: continue
        if name.startswith("red_count"):
            # format red_count_N_K
            _,_,n,kmin=name.split("_");n=int(n);kmin=int(kmin)
            x=a[i-n:i]
            keep[k]=int(np.sum(x[:,4]<x[:,1]))>=kmin
        elif name.startswith("green_count"):
            _,_,n,kmin=name.split("_");n=int(n);kmin=int(kmin)
            x=a[i-n:i]
            keep[k]=int(np.sum(x[:,4]>x[:,1]))>=kmin
        elif name.startswith("lower_closes"):
            n=int(name.split("_")[-1]);x=a[i-n:i,4]
            keep[k]=bool(np.all(np.diff(x)<0))
        elif name.startswith("higher_closes"):
            n=int(name.split("_")[-1]);x=a[i-n:i,4]
            keep[k]=bool(np.all(np.diff(x)>0))
        elif name.startswith("lower_highs_lows"):
            n=int(name.split("_")[-1]);x=a[i-n:i]
            keep[k]=bool(np.all(np.diff(x[:,2])<0) and np.all(np.diff(x[:,3])<0))
        elif name.startswith("higher_highs_lows"):
            n=int(name.split("_")[-1]);x=a[i-n:i]
            keep[k]=bool(np.all(np.diff(x[:,2])>0) and np.all(np.diff(x[:,3])>0))
        elif name.startswith("compression"):
            # average prior body <= fraction of current pre-trigger ATR
            frac=float(name.split("_")[-1])
            x=a[i-4:i]
            avgb=float(np.mean(np.abs(x[:,4]-x[:,1])))
            at=float(f["atr"][i])
            keep[k]=np.isfinite(at) and avgb<=frac*at
        elif name=="upper_wick_rejection":
            j=i-1;body=abs(a[j,4]-a[j,1]);uw=a[j,2]-max(a[j,1],a[j,4])
            keep[k]=uw>=1.5*max(body,1e-12)
        elif name=="green_green_then_trigger":
            keep[k]=(a[i-2,4]>a[i-2,1]) and (a[i-1,4]>a[i-1,1])
        elif name=="red_red_then_trigger":
            keep[k]=(a[i-2,4]<a[i-2,1]) and (a[i-1,4]<a[i-1,1])
        elif name=="three_green_then_trigger":
            keep[k]=bool(np.all(a[i-3:i,4]>a[i-3:i,1]))
        elif name=="three_red_then_trigger":
            keep[k]=bool(np.all(a[i-3:i,4]<a[i-3:i,1]))
    return keep

def candidates():
    out=[]
    for n in range(2,7):
        for p in product("GR",repeat=n):
            out.append(("exact","".join(p)))
    for n in (3,4,5,6):
        for k in range(max(2,n-2),n+1):
            out.append(("struct",f"red_count_{n}_{k}"))
            out.append(("struct",f"green_count_{n}_{k}"))
    for n in (3,4):
        out += [("struct",f"lower_closes_{n}"),("struct",f"higher_closes_{n}"),
                ("struct",f"lower_highs_lows_{n}"),("struct",f"higher_highs_lows_{n}")]
    for x in (.4,.6,.8):
        out.append(("struct",f"compression_{x}"))
    out += [("struct","upper_wick_rejection"),
            ("struct","green_green_then_trigger"),("struct","red_red_then_trigger"),
            ("struct","three_green_then_trigger"),("struct","three_red_then_trigger")]
    return out

def period_idx(a,idx,start,end):
    et=a[idx+1,0]
    return idx[(et>=start)&(et<end)]

def sim(data,sigs,start,end):
    vals=[];per={}
    for sym in SYMBOLS:
        a=data[sym];idx=period_idx(a,sigs.get(sym,np.empty(0,dtype=np.int64)),start,end)
        x=broad.simulate(a,idx,-1,TP,SL,HOLD_H,TF,start,end) if len(idx) else np.empty(0)
        per[sym]=broad.metrics(x)
        if len(x):vals.append(x)
    return broad.metrics(np.concatenate(vals) if vals else []),per

def folds():
    cuts=[
      START,
      int(datetime(2024,4,8,tzinfo=timezone.utc).timestamp()*1000),
      int(datetime(2024,10,8,tzinfo=timezone.utc).timestamp()*1000),
      DEV_END,SPLIT,
    ]
    return list(zip(cuts[:-1],cuts[1:]))

def val_quarters():
    cuts=[
      SPLIT,
      int(datetime(2026,1,7,tzinfo=timezone.utc).timestamp()*1000),
      int(datetime(2026,4,7,tzinfo=timezone.utc).timestamp()*1000),
      int(datetime(2026,7,7,tzinfo=timezone.utc).timestamp()*1000),
      END,
    ]
    return list(zip(cuts[:-1],cuts[1:]))

def run():
    with ThreadPoolExecutor(max_workers=6) as pool:
        loaded=list(pool.map(lambda s:(s,core.load(s,"15m")[0]),SYMBOLS))
    data={s:a for s,a in loaded}
    btc=data["BTCUSDT"];bf=feat(btc)
    base={}
    feats={}
    for s,a in loaded:
        f=feat(a);feats[s]=f;base[s]=base_signal(a,f,btc,bf)
        print("LOADED",s,len(a),"BASE",len(base[s]),flush=True)

    rows=[]
    for kind,name in candidates():
        sigs={}
        for s in SYMBOLS:
            a=data[s];idx=base[s]
            mask=exact_pattern_mask(a,idx,name) if kind=="exact" else structural_mask(a,feats[s],idx,name)
            sigs[s]=idx[mask]
        md,_=sim(data,sigs,START,DEV_END)
        ms,_=sim(data,sigs,DEV_END,SPLIT)
        fs=[]
        for a,b in folds():
            m,_=sim(data,sigs,a,b);fs.append(m)
        posf=sum(1 for m in fs if m["avg_net_bps"] is not None and m["avg_net_bps"]>0)
        robust=bool(md["n"]>=MIN_DEV and ms["n"]>=MIN_SEL and
                    (md["avg_net_bps"] or -999)>0 and (ms["avg_net_bps"] or -999)>0 and posf>=3)
        mv,per=sim(data,sigs,SPLIT,END)
        qs=[]
        for a,b in val_quarters():
            m,_=sim(data,sigs,a,b);qs.append(m)
        posq=sum(1 for m in qs if m["avg_net_bps"] is not None and m["avg_net_bps"]>0)
        eligible=bool(robust and mv["n"]>=MIN_VAL and (mv["pf"] or 0)>1.10 and
                      (mv["avg_net_bps"] or -999)>0 and posq>=3)
        rows.append({
          "kind":kind,"pattern":name,"dev":md,"selection":ms,"train_folds":fs,
          "positive_train_folds":posf,"robust_train":robust,
          "validation":mv,"validation_quarters":qs,"positive_validation_quarters":posq,
          "validation_by_symbol":per,"eligible_for_shadow":eligible
        })
        print("CANDLE_RESULT "+json.dumps({
          "kind":kind,"pattern":name,"dev":md,"selection":ms,
          "positive_train_folds":posf,"validation":mv,
          "positive_validation_quarters":posq,"eligible":eligible
        }),flush=True)

    rows.sort(key=lambda r:(
      1 if r["eligible_for_shadow"] else 0,
      1 if r["robust_train"] else 0,
      r["positive_validation_quarters"],
      r["validation"]["pf"] or -1,
      r["validation"]["avg_net_bps"] if r["validation"]["avg_net_bps"] is not None else -999
    ),reverse=True)
    elig=[r for r in rows if r["eligible_for_shadow"]]
    report={
      "base_strategy":{"timeframe_min":15,"side":"SHORT","body_atr_min":2.25,
        "volume_vs_prior20_mean_min":1.0,"btc_4h_return":"<0",
        "coin_minus_btc_4h_return":"<= -1%","tp_pct":10,"sl_pct":3,"max_hold_hours":96},
      "roundtrip_cost_pct":core.COST*100,
      "tested_candidates":len(rows),"eligible_count":len(elig),"eligible":elig,
      "method":[
        "Research only; no account/runtime changes.",
        "The current trigger candle is frozen; patterns describe the 2-6 completed 15m candles immediately before it.",
        "All exact green/red sequences of length 2-6 are tested, plus red/green counts, monotonic closes, monotonic highs/lows, compression and wick/retrace structures.",
        "No exit retuning: every candidate uses the same frozen TP10%, SL3%, max 96h and 0.16% round-trip cost.",
        "A candidate must be positive in both pre-validation train subwindows and at least 3/4 train folds before final-year validation is considered.",
        "Final-year gate requires PF>1.10, positive average net, >=50 trades and at least 3/4 positive calendar quarters.",
        "The final year has already been inspected in earlier research, so it remains temporal OOS but not a pristine untouched holdout."
      ],
      "results":rows
    }
    out=Path("research-output");out.mkdir(exist_ok=True)
    (out/"vol-short-candle-context-3y.json").write_text(json.dumps(report,indent=2,allow_nan=False))
    print("CANDLE_SUMMARY "+json.dumps({"eligible_count":len(elig),"best":rows[0] if rows else None}),flush=True)

if __name__=="__main__":
    run()

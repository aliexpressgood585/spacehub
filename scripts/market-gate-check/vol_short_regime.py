"""Regime analysis for the strongest volatility-expansion SHORT candidate.

Research only; no account/runtime mutation.
Base trade is frozen from the prior train-only search:
15m bearish expansion >=2.25 ATR, volume >= prior20 mean,
BTC 4h down and coin 4h relative return <= BTC-1%,
SHORT next bar open, TP 10%, SL 3%, max hold 96h.

This script does NOT retune the base trade. It tests whether broad-market regime
gates explain the unstable quarters, choosing gates only on pre-validation
subwindows and then reporting the final year by quarter.
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
COST = core.COST
TF = 15
TP, SL, HOLD_H = .10, .03, 96

def ema(x,n):
    return broad.ema(x,n)

def ret_n(c,n):
    out=np.full(len(c),np.nan)
    if len(c)>n: out[n:]=c[n:]/c[:-n]-1
    return out

def atr_pct(a,n=14):
    x=broad.atr(a,n)
    return x/a[:,4]

def metrics(v):
    return broad.metrics(v)

def base_features(a):
    c,o,v=a[:,4],a[:,1],a[:,5]
    atr=broad.atr(a,14)
    vm=broad.rolling_mean(v,20)
    r4=ret_n(c,16)   # 4h
    r24=ret_n(c,96)  # 24h
    r72=ret_n(c,288) # 72h
    e96=ema(c,96)
    e288=ema(c,288)
    ap=atr_pct(a)
    return dict(c=c,o=o,v=v,atr=atr,vm=vm,r4=r4,r24=r24,r72=r72,e96=e96,e288=e288,atrp=ap)

def align_ref(a, ref, arr):
    rt=ref[:,0].astype(np.int64)
    t=a[:,0].astype(np.int64)
    j=np.searchsorted(rt,t)
    ok=j<len(rt); jj=np.minimum(j,len(rt)-1)
    ok &= rt[jj]==t
    out=np.full(len(a),np.nan)
    out[ok]=arr[jj[ok]]
    return out

def build_base_signal(a, f, btc, bf):
    c,o,v=f["c"],f["o"],f["v"]
    btc4=align_ref(a,btc,bf["r4"])
    rel4=f["r4"]-btc4
    body=np.abs(c-o)
    mask=(
        np.isfinite(f["atr"]) & np.isfinite(f["vm"]) &
        (c<o) & (body>=2.25*f["atr"]) &
        (v>=1.0*f["vm"]) &
        (btc4<0) &
        (rel4<=-.01)
    )
    idx=np.flatnonzero(mask)
    return idx[idx+1<len(a)].astype(np.int64)

def common_market_features(data):
    # All symbols share 15m boundaries after alignment by timestamp.
    btc=data["BTCUSDT"]; bf=base_features(btc)
    bt=btc[:,0].astype(np.int64)
    n=len(btc)
    rets4=[]; rets24=[]; below96=[]
    for sym in SYMBOLS:
        a=data[sym]; f=base_features(a)
        t=a[:,0].astype(np.int64)
        j=np.searchsorted(t,bt)
        ok=j<len(t); jj=np.minimum(j,len(t)-1)
        ok &= t[jj]==bt
        x4=np.full(n,np.nan);x24=np.full(n,np.nan);xb=np.full(n,np.nan)
        x4[ok]=f["r4"][jj[ok]]
        x24[ok]=f["r24"][jj[ok]]
        xb[ok]=(f["c"][jj[ok]]<f["e96"][jj[ok]]).astype(float)
        rets4.append(x4);rets24.append(x24);below96.append(xb)
    r4=np.vstack(rets4);r24=np.vstack(rets24);bl=np.vstack(below96)
    breadth4=np.nanmean(r4<0,axis=0)
    breadth24=np.nanmean(r24<0,axis=0)
    breadth_below96=np.nanmean(bl,axis=0)
    med4=np.nanmedian(r4,axis=0)
    med24=np.nanmedian(r24,axis=0)
    train=(bt>=START)&(bt<SPLIT)&np.isfinite(bf["atrp"])
    atr_med=float(np.nanmedian(bf["atrp"][train]))
    return {
      "time":bt,
      "btc_r24":bf["r24"],"btc_r72":bf["r72"],
      "btc_below96":bf["c"]<bf["e96"],
      "btc_below288":bf["c"]<bf["e288"],
      "btc_bear_cross":bf["e96"]<bf["e288"],
      "btc_atr_high":bf["atrp"]>=atr_med,
      "breadth4":breadth4,"breadth24":breadth24,"breadth_below96":breadth_below96,
      "med4":med4,"med24":med24,
    }

def gate_masks(m):
    g={"none":np.ones(len(m["time"]),bool)}
    for th in (0,-.01,-.02,-.03,-.05):
        g[f"btc24_le_{th}"]=m["btc_r24"]<=th
    for th in (0,-.02,-.04,-.06,-.08):
        g[f"btc72_le_{th}"]=m["btc_r72"]<=th
    g["btc_below_24h_ema"]=m["btc_below96"]
    g["btc_below_72h_ema"]=m["btc_below288"]
    g["btc_24h_ema_below_72h"]=m["btc_bear_cross"]
    g["btc_atr_high"]=m["btc_atr_high"]
    for th in (.50,.625,.75):
        g[f"breadth4_neg_ge_{th}"]=m["breadth4"]>=th
        g[f"breadth24_neg_ge_{th}"]=m["breadth24"]>=th
        g[f"breadth_below24ema_ge_{th}"]=m["breadth_below96"]>=th
    for th in (0,-.01,-.02):
        g[f"median4_le_{th}"]=m["med4"]<=th
    for th in (0,-.02,-.04):
        g[f"median24_le_{th}"]=m["med24"]<=th
    # Pre-declared combinations, not generated adaptively.
    g["btc24down_breadth4_625"]=(m["btc_r24"]<0)&(m["breadth4"]>=.625)
    g["btc24down_breadth24_625"]=(m["btc_r24"]<0)&(m["breadth24"]>=.625)
    g["btc72down_breadth24_625"]=(m["btc_r72"]<0)&(m["breadth24"]>=.625)
    g["btc_bear_breadth4_625"]=m["btc_bear_cross"]&(m["breadth4"]>=.625)
    g["btc_bear_breadth24_625"]=m["btc_bear_cross"]&(m["breadth24"]>=.625)
    g["btc24m2_breadth4_75"]=(m["btc_r24"]<=-.02)&(m["breadth4"]>=.75)
    g["btc72m4_breadth24_75"]=(m["btc_r72"]<=-.04)&(m["breadth24"]>=.75)
    g["bear_highvol_breadth4"]=m["btc_bear_cross"]&m["btc_atr_high"]&(m["breadth4"]>=.625)
    return g

def gate_for_symbol(a, idx, market, mask):
    mt=market["time"]
    t=a[idx,0].astype(np.int64)
    j=np.searchsorted(mt,t)
    ok=j<len(mt); jj=np.minimum(j,len(mt)-1)
    ok &= mt[jj]==t
    keep=np.zeros(len(idx),bool)
    keep[ok]=mask[jj[ok]]
    return idx[keep]

def sim_period(data, sigs, market, gmask, start, end):
    vals=[];per={}
    for sym in SYMBOLS:
        a=data[sym]
        idx=gate_for_symbol(a,sigs[sym],market,gmask)
        et=a[idx+1,0]
        idx=idx[(et>=start)&(et<end)]
        x=broad.simulate(a,idx,-1,TP,SL,HOLD_H,TF,start,end) if len(idx) else np.empty(0)
        per[sym]=metrics(x)
        if len(x):vals.append(x)
    return metrics(np.concatenate(vals) if vals else []),per

def fold_ranges():
    # Four roughly six-month pre-validation folds.
    cuts=[
      START,
      int(datetime(2024,4,8,tzinfo=timezone.utc).timestamp()*1000),
      int(datetime(2024,10,8,tzinfo=timezone.utc).timestamp()*1000),
      int(datetime(2025,4,7,tzinfo=timezone.utc).timestamp()*1000),
      SPLIT,
    ]
    return list(zip(cuts[:-1],cuts[1:]))

def validation_quarters():
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
    for s,a in loaded: print("LOADED",s,len(a),flush=True)

    btc=data["BTCUSDT"];bf=base_features(btc)
    sigs={}
    for sym in SYMBOLS:
        sigs[sym]=build_base_signal(data[sym],base_features(data[sym]),btc,bf)

    market=common_market_features(data)
    gates=gate_masks(market)
    rows=[]
    for name,gmask in gates.items():
        folds=[]
        for a,b in fold_ranges():
            m,_=sim_period(data,sigs,market,gmask,a,b)
            folds.append(m)
        pos=sum(1 for m in folds if m["avg_net_bps"] is not None and m["avg_net_bps"]>0)
        agg,_=sim_period(data,sigs,market,gmask,START,SPLIT)
        robust_train=bool(
            agg["n"]>=250 and (agg["pf"] or 0)>1.05 and (agg["avg_net_bps"] or -999)>0 and pos>=3
        )

        val,per=sim_period(data,sigs,market,gmask,SPLIT,END)
        q=[]
        for a,b in validation_quarters():
            m,_=sim_period(data,sigs,market,gmask,a,b)
            q.append({"start_ms":a,"end_ms":b,**m})
        posq=sum(1 for m in q if m["avg_net_bps"] is not None and m["avg_net_bps"]>0)
        eligible=bool(
            robust_train and val["n"]>=100 and (val["pf"] or 0)>1.10 and
            (val["avg_net_bps"] or -999)>0 and posq>=3
        )
        rows.append({
          "gate":name,"train":agg,"train_folds":folds,"positive_train_folds":pos,
          "robust_train":robust_train,"validation":val,"validation_quarters":q,
          "positive_validation_quarters":posq,"validation_by_symbol":per,
          "eligible_for_shadow":eligible,
        })
        print("REGIME_RESULT "+json.dumps({
          "gate":name,"train":agg,"positive_train_folds":pos,
          "validation":val,"positive_validation_quarters":posq,
          "eligible_for_shadow":eligible
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
      "base_strategy":{
        "timeframe_min":15,"side":"SHORT","body_atr_min":2.25,
        "volume_vs_prior20_mean_min":1.0,"btc_4h_return":"<0",
        "coin_minus_btc_4h_return":"<= -1%",
        "tp_pct":10,"sl_pct":3,"max_hold_hours":96,
      },
      "roundtrip_cost_pct":COST*100,
      "method":[
        "Research only; no runtime/account changes.",
        "The base trade is frozen from the previous search; this run changes only the market-regime gate.",
        "Regime candidates are predeclared from BTC 24h/72h trend, BTC moving-average state, BTC volatility, market breadth and median market returns.",
        "A gate must be profitable in at least 3 of 4 pre-validation folds and aggregate pre-validation PF>1.05 with >=250 trades.",
        "Final-year validation requires PF>1.10, positive average net, >=100 trades and at least 3 of 4 positive calendar quarters.",
        "Final-year data has already been inspected in prior research, so this is temporal OOS but not a pristine untouched holdout.",
      ],
      "tested_gates":len(rows),"eligible_count":len(elig),"eligible":elig,"results":rows,
    }
    out=Path("research-output");out.mkdir(exist_ok=True)
    (out/"vol-short-regime-3y.json").write_text(json.dumps(report,indent=2,allow_nan=False))
    print("REGIME_SUMMARY "+json.dumps({"eligible_count":len(elig),"best":rows[0] if rows else None}),flush=True)

if __name__=="__main__":
    run()

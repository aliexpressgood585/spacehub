"""Quarter-hour order-flow research on 1m Binance Futures bars. Research only."""
import json
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import numpy as np
import sys
sys.path.append("scripts/market-gate-check")
import flow_reversal as flow
core=flow.core

SYMS=["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","DOGEUSDT","AVAXUSDT"]
START,SPLIT,END=core.START,core.SPLIT,core.END
COST=.0016
HORIZONS=(120,240,480,720)
QS=(.7,.8,.9)

def metrics(v):
    a=np.asarray(v,float);a=a[np.isfinite(a)]
    if not len(a):return {"n":0,"wins":0,"wr":None,"pf":None,"avg_net_bps":None,"sum_net_pct":0}
    pos=float(a[a>0].sum());neg=float(-a[a<0].sum());w=int((a>0).sum())
    return {"n":len(a),"wins":w,"wr":round(100*w/len(a),3),"pf":round(pos/neg,4) if neg else None,
            "avg_net_bps":round(10000*float(a.mean()),4),"sum_net_pct":round(100*float(a.sum()),4)}

def events(a):
    # a columns: t,o,h,l,c,base_volume,taker_buy_base_volume
    t=a[:,0].astype(np.int64)
    idx=np.flatnonzero((t%900000==0)&(t>=START)&(t<END))
    # Need 60m history and 12h future.
    idx=idx[(idx>=60)&(idx+max(HORIZONS)<len(a))]
    vol=a[:,5];tb=a[:,6]
    imb=2*np.divide(tb[idx],vol[idx],out=np.full(len(idx),np.nan),where=vol[idx]>0)-1
    ret1=a[idx,4]/a[idx,1]-1
    vm=np.array([np.mean(vol[i-60:i]) for i in idx])
    vratio=np.divide(vol[idx],vm,out=np.full(len(idx),np.nan),where=vm>0)
    return idx,imb,ret1,vratio

def fit_residual(imb,ret1,ts):
    m=(ts<SPLIT)&np.isfinite(imb)&np.isfinite(ret1)
    x=ret1[m];y=imb[m]
    if len(x)<100:return 0.,0.
    X=np.column_stack((np.ones(len(x)),x))
    beta=np.linalg.lstsq(X,y,rcond=None)[0]
    return float(beta[0]),float(beta[1])

def score_rules(a):
    idx,imb,ret1,vr=events(a);ts=a[idx,0].astype(np.int64)
    aa,bb=fit_residual(imb,ret1,ts);resid=imb-(aa+bb*ret1)
    feats={"imbalance":imb,"residual":resid}
    out=[]
    for feature,x in feats.items():
      train=x[(ts<SPLIT)&np.isfinite(x)]
      for q in QS:
        hi=float(np.quantile(train,q));lo=float(np.quantile(train,1-q))
        for horizon in HORIZONS:
          for mode in ("LONG_HIGH","SHORT_LOW","BOTH","LONG_HIGH_VOL","SHORT_LOW_VOL","LONG_DIVERGENCE","SHORT_DIVERGENCE"):
            tr=[];va=[];last=-1
            for k,i in enumerate(idx):
                if i<=last or not np.isfinite(x[k]):continue
                if i+horizon>=len(a):continue
                sig=side=0
                if mode=="LONG_HIGH" and x[k]>=hi:sig=1;side=1
                elif mode=="SHORT_LOW" and x[k]<=lo:sig=1;side=-1
                elif mode=="BOTH":
                    if x[k]>=hi:sig=1;side=1
                    elif x[k]<=lo:sig=1;side=-1
                elif mode=="LONG_HIGH_VOL" and x[k]>=hi and vr[k]>=1.5:sig=1;side=1
                elif mode=="SHORT_LOW_VOL" and x[k]<=lo and vr[k]>=1.5:sig=1;side=-1
                elif mode=="LONG_DIVERGENCE" and x[k]>=hi and ret1[k]<0:sig=1;side=1
                elif mode=="SHORT_DIVERGENCE" and x[k]<=lo and ret1[k]>0:sig=1;side=-1
                if not sig:continue
                e=a[i+1,1]  # enter next minute open, after first quarter-hour minute completes
                ex=a[i+horizon,4]
                net=side*(ex/e-1)-COST
                ets=a[i+1,0];xts=a[i+horizon,0]+60000
                if ets<SPLIT and xts<=SPLIT:tr.append(net)
                elif ets>=SPLIT and xts<=END:va.append(net)
                last=i+horizon
            out.append({"feature":feature,"q":q,"horizon_min":horizon,"mode":mode,
                        "train":metrics(tr),"validation":metrics(va),
                        "fit":{"alpha":aa,"beta_ret1":bb},"thresholds":{"lo":lo,"hi":hi}})
    return out

def pooled_cross(data):
    # Cross-sectional top/bottom flow across the 6 contracts at each quarter-hour.
    ev={}
    fits={}
    for s,a in data.items():
        idx,imb,ret1,vr=events(a);ts=a[idx,0].astype(np.int64)
        aa,bb=fit_residual(imb,ret1,ts);fits[s]=(aa,bb)
        for k,i in enumerate(idx):
            ev.setdefault(int(a[i,0]),[]).append((s,int(i),imb[k],imb[k]-(aa+bb*ret1[k]),vr[k]))
    out=[]
    for feature_pos,feature in ((2,"imbalance"),(3,"residual")):
      for horizon in HORIZONS:
       for mode in ("TOP_LONG","BOTTOM_SHORT","LONG_SHORT","TOP_LONG_VOL","BOTTOM_SHORT_VOL"):
        tr=[];va=[];last_by={s:-1 for s in data}
        for t in sorted(ev):
            rows=[r for r in ev[t] if np.isfinite(r[feature_pos])]
            if len(rows)<4:continue
            rows.sort(key=lambda r:r[feature_pos])
            low=rows[0];high=rows[-1]
            legs=[]
            if mode=="TOP_LONG":legs=[(high,1)]
            elif mode=="BOTTOM_SHORT":legs=[(low,-1)]
            elif mode=="LONG_SHORT":legs=[(high,1),(low,-1)]
            elif mode=="TOP_LONG_VOL" and high[4]>=1.5:legs=[(high,1)]
            elif mode=="BOTTOM_SHORT_VOL" and low[4]>=1.5:legs=[(low,-1)]
            vals=[]
            blocked=False
            for row,side in legs:
                s,i=row[0],row[1];a=data[s]
                if i<=last_by[s] or i+horizon>=len(a):blocked=True;break
                e=a[i+1,1];x=a[i+horizon,4];vals.append(side*(x/e-1)-COST)
            if blocked or not vals:continue
            net=float(np.mean(vals))
            ets=t+60000;xts=t+horizon*60000+60000
            if ets<SPLIT and xts<=SPLIT:tr.append(net)
            elif ets>=SPLIT and xts<=END:va.append(net)
            for row,_ in legs:last_by[row[0]]=row[1]+horizon
        out.append({"family":"cross_section","feature":feature,"horizon_min":horizon,"mode":mode,
                    "train":metrics(tr),"validation":metrics(va)})
    return out

def run():
    data={};coverage=[]
    # Limit concurrency due memory.
    with ThreadPoolExecutor(max_workers=3) as ex:
        for s,(a,cov) in zip(SYMS,ex.map(flow.load_minutes,SYMS)):
            data[s]=a;coverage.append(cov);print("FLOW_LOADED",s,len(a),flush=True)
    per=[]
    for s,a in data.items():
        rr=score_rules(a)
        for r in rr:r["symbol"]=s
        per.extend(rr)
    cross=pooled_cross(data)
    allr=per+cross
    # Finalists are chosen by train only.
    ranked=sorted([r for r in allr if r["train"]["n"]>=150],
                  key=lambda r:((r["train"]["pf"] or 0),r["train"]["avg_net_bps"] or -999),reverse=True)
    finalists=ranked[:60]
    eligible=[]
    for r in finalists:
        mt,mv=r["train"],r["validation"]
        ok=mt["n"]>=150 and mv["n"]>=75 and (mt["pf"] or 0)>1.15 and (mv["pf"] or 0)>1.15 and \
           (mt["avg_net_bps"] or -999)>0 and (mv["avg_net_bps"] or -999)>0
        r["eligible"]=bool(ok)
        if ok:eligible.append(r)
    report={
      "window":{"start":core.START_DT.isoformat(),"split":core.SPLIT_DT.isoformat(),"end_exclusive":core.END_DT.isoformat()},
      "symbols":SYMS,"cost_roundtrip_pct":COST*100,"coverage":coverage,
      "method":[
        "Research only; no runtime/account changes.",
        "Actual Binance Futures 1m archives. Only bars beginning exactly on 15-minute clock marks are candidate information bars.",
        "Order-flow imbalance = 2*taker-buy-base-volume/base-volume - 1 from the first minute of each quarter-hour.",
        "Residual order flow removes the train-fitted linear component associated with the same-minute return.",
        "Signals enter at the next minute open and hold 2/4/8/12 hours; 0.16% round-trip drag is deducted.",
        "Quantile thresholds and residual regressions use train only. Finalists are ranked on train only before validation is considered.",
        "This approximates literature order-flow effects with Binance aggressor volume; it does not reproduce tick-level trade-size or multi-exchange world order flow."
      ],
      "train_ranked_top":ranked[:60],"eligible":eligible,
      "summary":{"tested":len(allr),"finalists":len(finalists),"eligible":len(eligible)}
    }
    out=Path("research-output");out.mkdir(exist_ok=True)
    (out/"quarter-hour-flow-3y.json").write_text(json.dumps(report,indent=2,allow_nan=False))
    print("QH_SUMMARY "+json.dumps(report["summary"]),flush=True)
    print("QH_ELIGIBLE "+json.dumps(eligible[:15]),flush=True)

if __name__=="__main__":run()

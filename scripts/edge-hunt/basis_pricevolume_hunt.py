"""Cross-sectional basis/premium + price-volume factor hunt. Research only."""
import json, urllib.request, urllib.parse, time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import numpy as np

START=1696723200000
SPLIT=1759795200000
END=1791331200000
COST=.0016
UNIVERSE=[
"BTCUSDT","ETHUSDT","SOLUSDT","ZECUSDT","XRPUSDT","NEARUSDT","DOGEUSDT","SANDUSDT","UNIUSDT","SUIUSDT",
"BNBUSDT","NMRUSDT","QNTUSDT","AVAXUSDT","ADAUSDT","WLDUSDT","RLCUSDT","1000PEPEUSDT","LINKUSDT","GTCUSDT",
"FILUSDT","AAVEUSDT","INJUSDT","MINAUSDT","ARBUSDT","LTCUSDT","BCHUSDT","FETUSDT","DOTUSDT","XLMUSDT",
"APTUSDT","HBARUSDT","1000SHIBUSDT","TRXUSDT","OPUSDT","DASHUSDT","API3USDT","XMRUSDT","ICPUSDT","ETCUSDT",
"STXUSDT","TRBUSDT","CRVUSDT","MANAUSDT","PENDLEUSDT","MAGICUSDT","LDOUSDT","AXSUSDT","SEIUSDT","GALAUSDT"
]

def get_json(path,params):
    qs=urllib.parse.urlencode(params)
    urls=["https://fapi.binance.com"+path+"?"+qs,"https://fapi1.binance.com"+path+"?"+qs]
    last=None
    for u in urls:
        for k in range(3):
            try:
                req=urllib.request.Request(u,headers={"User-Agent":"spacehub-basis-research/1.0"})
                with urllib.request.urlopen(req,timeout=30) as r:return json.loads(r.read())
            except Exception as e:last=e;time.sleep(1+k)
    raise last

def fetch(sym):
    base={"symbol":sym,"interval":"1d","startTime":START-60*86400000,"endTime":END-1,"limit":1500}
    k=get_json("/fapi/v1/klines",base)
    p=get_json("/fapi/v1/premiumIndexKlines",base)
    price={int(x[0]):[float(x[1]),float(x[2]),float(x[3]),float(x[4]),float(x[7])] for x in k}
    prem={int(x[0]):float(x[4]) for x in p}
    ts=sorted(set(price)&set(prem))
    if len([t for t in ts if START<=t<END])<900:raise RuntimeError(sym+" insufficient aligned daily data")
    return {t:{"o":price[t][0],"h":price[t][1],"l":price[t][2],"c":price[t][3],"qv":price[t][4],"premium":prem[t]} for t in ts}

def port_metrics(v):
    a=np.asarray(v,float);a=a[np.isfinite(a)]
    if not len(a):return {"n_periods":0}
    eq=np.cumprod(1+a);peak=np.maximum.accumulate(eq);dd=eq/peak-1
    yrs=len(a)/365.25
    cagr=float(eq[-1]**(1/yrs)-1) if yrs>0 and eq[-1]>0 else None
    sd=float(a.std(ddof=1)) if len(a)>1 else 0
    sh=float(a.mean()/sd*np.sqrt(365.25)) if sd>0 else None
    pos=float(a[a>0].sum());neg=float(-a[a<0].sum())
    return {"n_periods":len(a),"win_pct":round(100*float((a>0).mean()),3),
            "avg_bps":round(10000*float(a.mean()),4),"compound_pct":round(100*float(eq[-1]-1),3),
            "cagr_pct":round(100*cagr,3) if cagr is not None else None,
            "max_dd_pct":round(100*float(dd.min()),3),"sharpe":round(sh,3) if sh is not None else None,
            "pf":round(pos/neg,4) if neg else None}

def panel(data):
    times=sorted(set().union(*[set(d.keys()) for d in data.values()]) & set(range(START,END,86400000)))
    by={t:{} for t in times}
    for s,d in data.items():
        for t in times:
            if t in d:by[t][s]=d[t]
    return times,by

def feature(rows,by,times,i,s,kind,L):
    t=times[i];r=rows
    if kind=="premium":return r["premium"]
    if i<L:return np.nan
    t0=times[i-L]
    if s not in by.get(t0,{}):return np.nan
    r0=by[t0][s]
    ret=r["c"]/r0["c"]-1
    if kind=="momentum":return ret
    if kind=="premium_change":return r["premium"]-r0["premium"]
    if kind=="volume_change":return np.log(max(r["qv"],1)/max(r0["qv"],1))
    if kind=="price_volume":return ret*np.log(max(r["qv"],1)/max(r0["qv"],1))
    if kind=="volatility":
        vals=[]
        for j in range(max(1,i-L+1),i+1):
            t1,tprev=times[j],times[j-1]
            if s in by.get(t1,{}) and s in by.get(tprev,{}):
                vals.append(np.log(by[t1][s]["c"]/by[tprev][s]["c"]))
        return float(np.std(vals)) if len(vals)>=max(3,L//2) else np.nan
    if kind=="mom_minus_premium":
        # Scale premium into daily-return-like units without peeking at validation.
        return ret-3*r["premium"]
    return np.nan

def cs(times,by,kind,L,H,orientation,q=.2,vol_condition=None):
    out={"train":[],"validation":[]}
    for period,lo,hi in (("train",START,SPLIT),("validation",SPLIT,END)):
        last=-1
        for i,t in enumerate(times):
            if not(lo<=t<hi) or i<max(L,20 if vol_condition else L) or i<=last or i+H>=len(times):continue
            te=times[i+1];tx=times[i+H]
            if te<lo or tx>=hi:continue
            ranks=[]
            # current cross-section features
            for s,r in by[t].items():
                if s not in by.get(te,{}) or s not in by.get(tx,{}):continue
                f=feature(r,by,times,i,s,kind,L)
                if not np.isfinite(f):continue
                if vol_condition:
                    hist=[]
                    for j in range(i-20,i):
                        tj=times[j]
                        if s in by.get(tj,{}):hist.append(by[tj][s]["qv"])
                    if len(hist)<10:continue
                    ratio=r["qv"]/max(np.mean(hist),1)
                    if vol_condition=="HIGH" and ratio<1.5:continue
                    if vol_condition=="LOW" and ratio>1.0:continue
                ranks.append((s,f))
            if len(ranks)<12:continue
            ranks.sort(key=lambda x:x[1]);k=max(1,int(len(ranks)*q))
            low=[s for s,_ in ranks[:k]];high=[s for s,_ in ranks[-k:]]
            def leg(names,side):
                vals=[]
                for s in names:
                    e=by[te][s]["o"];x=by[tx][s]["c"]
                    vals.append(side*(x/e-1)-COST)
                return float(np.mean(vals)) if vals else np.nan
            if orientation=="HIGH_LONG":r=leg(high,1)
            elif orientation=="LOW_LONG":r=leg(low,1)
            elif orientation=="HIGH_SHORT":r=leg(high,-1)
            elif orientation=="LOW_SHORT":r=leg(low,-1)
            elif orientation=="HIGH_LONG_LOW_SHORT":r=.5*(leg(high,1)+leg(low,-1))
            else:r=.5*(leg(low,1)+leg(high,-1))
            if np.isfinite(r):out[period].append(r);last=i+H
    return port_metrics(out["train"]),port_metrics(out["validation"])

def run():
    data={};errors={}
    with ThreadPoolExecutor(max_workers=8) as ex:
        fs={ex.submit(fetch,s):s for s in UNIVERSE}
        for f in as_completed(fs):
            s=fs[f]
            try:data[s]=f.result();print("LOADED",s,len(data[s]),flush=True)
            except Exception as e:errors[s]=repr(e);print("FAILED",s,repr(e),flush=True)
    if len(data)<35:raise RuntimeError("too few aligned symbols")
    times,by=panel(data)
    grid=[]
    for kind,Ls in {
        "premium":(1,),
        "premium_change":(1,3,7,14,28),
        "momentum":(1,3,7,14,28,56),
        "volume_change":(1,3,7,14),
        "price_volume":(1,3,7,14,28),
        "volatility":(7,14,28),
        "mom_minus_premium":(3,7,14,28),
    }.items():
      for L in Ls:
       for H in (1,3,5,7,14):
        for ori in ("HIGH_LONG","LOW_LONG","HIGH_SHORT","LOW_SHORT","HIGH_LONG_LOW_SHORT","LOW_LONG_HIGH_SHORT"):
            mt,_=cs(times,by,kind,L,H,ori,.2,None)
            if mt.get("n_periods",0)>=35:
                grid.append({"kind":kind,"L":L,"H":H,"orientation":ori,"train":mt})
    # Explicit price-volume interactions with high/low volume subsets.
    for kind in ("momentum","price_volume"):
      for L in (1,3,7,14,28):
       for H in (1,3,5,7):
        for vc in ("HIGH","LOW"):
         for ori in ("HIGH_LONG","LOW_LONG","HIGH_LONG_LOW_SHORT","LOW_LONG_HIGH_SHORT"):
            mt,_=cs(times,by,kind,L,H,ori,.25,vc)
            if mt.get("n_periods",0)>=30:
                grid.append({"kind":kind,"L":L,"H":H,"orientation":ori,"volume_condition":vc,"train":mt})
    grid.sort(key=lambda z:(z["train"].get("sharpe") or -99,z["train"].get("cagr_pct") or -999),reverse=True)
    finalists=[]
    for z in grid[:60]:
        mt,mv=cs(times,by,z["kind"],z["L"],z["H"],z["orientation"],.25 if "volume_condition" in z else .2,z.get("volume_condition"))
        d={**z,"train":mt,"validation":mv}
        d["eligible"]=bool(mt.get("n_periods",0)>=35 and mv.get("n_periods",0)>=18 and
                           (mt.get("sharpe") or -99)>.6 and (mv.get("sharpe") or -99)>.6 and
                           (mt.get("cagr_pct") or -999)>0 and (mv.get("cagr_pct") or -999)>0 and
                           (mt.get("max_dd_pct") or -100)>-40 and (mv.get("max_dd_pct") or -100)>-40)
        finalists.append(d)
    eligible=[x for x in finalists if x["eligible"]]
    report={
      "window":{"start_ms":START,"split_ms":SPLIT,"end_exclusive_ms":END},
      "cost_roundtrip_pct_per_leg":COST*100,
      "universe_requested":UNIVERSE,"loaded":sorted(data),"errors":errors,
      "method":[
        "Research only; no trading runtime changed.",
        "Daily USD-M perpetual price klines plus Binance premium-index daily klines.",
        "Cross-sectional factor families: premium level/change, momentum, quote-volume change, price-volume interaction, volatility, and momentum minus premium.",
        "Both factor orientations are tested in train. Only top train-ranked finalists are evaluated as candidates in temporal validation.",
        "Positions enter at next UTC daily open and exit at a future daily close. Each constituent leg pays 0.16% round-trip drag.",
        "Current-listing/current-liquidity universe creates survivorship and selection bias. Any survivor requires intraday and broader-universe verification."
      ],
      "train_top":grid[:60],"finalists":finalists,"eligible":eligible,
      "summary":{"loaded_symbols":len(data),"tested_train":len(grid),"finalists":len(finalists),"eligible":len(eligible)}
    }
    out=Path("research-output");out.mkdir(exist_ok=True)
    (out/"basis-pricevolume-hunt-3y.json").write_text(json.dumps(report,indent=2,allow_nan=False))
    print("BASIS_SUMMARY "+json.dumps(report["summary"]),flush=True)
    print("BASIS_ELIGIBLE "+json.dumps(eligible[:15]),flush=True)

if __name__=="__main__":run()

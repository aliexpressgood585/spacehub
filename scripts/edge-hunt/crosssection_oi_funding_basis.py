"""Cross-sectional relative-strength / crowding research with OI, funding,
basis (premium index), volume and price. Research only; no trading state changes.

Data:
- Binance USD-M 5m perpetual klines + premium-index klines, Apr-Sep 2026.
- Binance USD-M daily metrics files (5m open-interest snapshots).
- Binance monthly funding-rate archives.
Universe is the 20 majors with verified OI archive coverage in this repo.

Method:
- Aggregate to hourly observations.
- Build cross-sectional factor scores from price momentum/reversal, OI change,
  funding, premium/basis and relative volume.
- Select candidate definitions using only first 70% of time.
- Freeze finalists and evaluate final 30% OOS.
- Next-hour-open entry, fixed 4/8/12/24h holding, actual funding settlements
  applied by side, 0.16% round-trip trading drag per constituent leg.
"""
import csv, io, json, math, hashlib, urllib.request, urllib.error, urllib.parse, zipfile
from pathlib import Path
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
SYMS=["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","DOGEUSDT","ADAUSDT","AVAXUSDT",
      "LINKUSDT","DOTUSDT","LTCUSDT","BCHUSDT","NEARUSDT","SUIUSDT","TRXUSDT","APTUSDT",
      "ARBUSDT","OPUSDT","ATOMUSDT","FILUSDT"]
MONTHS=[(2026,m) for m in range(4,10)]
START=int(datetime(2026,4,1,tzinfo=timezone.utc).timestamp()*1000)
END=int(datetime(2026,10,1,tzinfo=timezone.utc).timestamp()*1000)
SPLIT=START+int(.70*(END-START))
COST=.0016
STRESS_COST=.0025
BASE="https://data.binance.vision/data/futures/um"
UA={"User-Agent":"spacehub-cs-oi-funding-basis/1.0"}
HOLDS=(4,8,12,24)
KS=(1,2,3)

def fetch_zip(url,timeout=30):
    try:
        req=urllib.request.Request(url,headers=UA)
        with urllib.request.urlopen(req,timeout=timeout) as r:raw=r.read()
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            return z.read(z.namelist()[0]).decode(),hashlib.sha256(raw).hexdigest()
    except urllib.error.HTTPError as e:
        if e.code==404:return None,None
        return None,None
    except Exception:return None,None

def ms_from_any(x):
    x=x.strip()
    if x.isdigit():
        t=int(x);return t//1000 if t>10**14 else t
    try:
        dt=datetime.fromisoformat(x.replace("Z","+00:00").replace(" ","T"))
        if dt.tzinfo is None:dt=dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp()*1000)
    except Exception:return None

def load_monthly_kind(sym,kind,tf="5m"):
    rows={};manifest=[]
    q=urllib.parse.quote(sym,safe="")
    for y,m in MONTHS:
        url=f"{BASE}/monthly/{kind}/{q}/{tf}/{q}-{tf}-{y}-{m:02d}.zip"
        txt,sha=fetch_zip(url)
        meta={"url":url,"sha256":sha}
        if txt:
            n=0
            for r in csv.reader(io.StringIO(txt)):
                if not r:continue
                t=ms_from_any(r[0])
                if t is None or not(START<=t<END):continue
                rows[t]=r;n+=1
            meta["rows"]=n
        else:meta["missing"]=True
        manifest.append(meta)
    return rows,manifest

def load_funding(sym):
    out=[];manifest=[]
    q=urllib.parse.quote(sym,safe="")
    for y,m in MONTHS:
        url=f"{BASE}/monthly/fundingRate/{q}/{q}-fundingRate-{y}-{m:02d}.zip"
        txt,sha=fetch_zip(url);meta={"url":url,"sha256":sha}
        if txt:
            n=0
            for r in csv.reader(io.StringIO(txt)):
                if not r:continue
                t=ms_from_any(r[0])
                if t is None or not(START<=t<END):continue
                try:rate=float(r[2])
                except Exception:
                    try:rate=float(r[-1])
                    except Exception:continue
                out.append((t,rate));n+=1
            meta["rows"]=n
        else:meta["missing"]=True
        manifest.append(meta)
    out.sort()
    return out,manifest

def days_between():
    a=datetime(2026,4,1,tzinfo=timezone.utc);b=datetime(2026,10,1,tzinfo=timezone.utc)
    while a<b:
        yield a.strftime("%Y-%m-%d")
        a+=timedelta(days=1)

DATES=list(days_between())

def load_metrics_day(sym,d):
    q=urllib.parse.quote(sym,safe="")
    url=f"{BASE}/daily/metrics/{q}/{q}-metrics-{d}.zip"
    txt,sha=fetch_zip(url,20)
    vals=[]
    if txt:
        for r in csv.reader(io.StringIO(txt)):
            if not r:continue
            t=ms_from_any(r[0])
            if t is None or not(START<=t<END):continue
            try:oi=float(r[3])
            except Exception:continue
            if oi>0:vals.append((t,oi))
    return vals,{"url":url,"sha256":sha,"rows":len(vals),"missing":txt is None}

def load_metrics(sym):
    vals=[];manifest=[]
    with ThreadPoolExecutor(max_workers=24) as ex:
        fs={ex.submit(load_metrics_day,sym,d):d for d in DATES}
        for f in as_completed(fs):
            a,m=f.result();vals+=a;manifest.append(m)
    vals=sorted({t:v for t,v in vals}.items())
    return vals,manifest

def load_symbol(sym):
    k,km=load_monthly_kind(sym,"klines")
    p,pm=load_monthly_kind(sym,"premiumIndexKlines")
    f,fm=load_funding(sym)
    oi,oim=load_metrics(sym)
    if not k or not p or len(oi)<1000:
        return sym,None,{"k":len(k),"p":len(p),"oi":len(oi),"funding":len(f)}
    # Hourly aggregation from 5m klines: first open, last close, quote volume sum.
    buckets={}
    for t,r in k.items():
        h=t-(t%3600000)
        try:o,hi,lo,c,qv=float(r[1]),float(r[2]),float(r[3]),float(r[4]),float(r[7])
        except Exception:continue
        z=buckets.get(h)
        if z is None:buckets[h]=[t,o,hi,lo,c,qv]
        else:
            z[2]=max(z[2],hi);z[3]=min(z[3],lo);z[4]=c;z[5]+=qv
    prem={}
    for t,r in p.items():
        h=t-(t%3600000)
        try:v=float(r[4])
        except Exception:continue
        # later 5m bar wins
        prem[h]=(t,v)
    oih={}
    for t,v in oi:
        h=t-(t%3600000)
        if h not in oih or t>oih[h][0]:oih[h]=(t,v)
    hrs=sorted(set(buckets)&set(prem)&set(oih))
    data={}
    for h in hrs:
        z=buckets[h]
        data[h]={"o":z[1],"h":z[2],"l":z[3],"c":z[4],"qv":z[5],
                 "premium":prem[h][1],"oi":oih[h][1]}
    cov=len(data)/max(1,(END-START)//3600000)
    return sym,{"hourly":data,"funding":f},{"coverage":cov,"hours":len(data),"funding_n":len(f),
        "manifest":{"klines":km,"premium":pm,"funding":fm,"metrics_days":len(oim),
                    "metrics_missing_days":sum(1 for x in oim if x.get("missing"))}}

def zscores(vals):
    a=np.asarray(vals,float)
    if len(a)<2 or not np.isfinite(a).all():return np.zeros(len(a))
    sd=a.std()
    return (a-a.mean())/sd if sd>1e-12 else np.zeros(len(a))

def build_panel(data):
    times=sorted(set().union(*[set(v["hourly"]) for v in data.values()]))
    by={t:{} for t in times}
    for s,v in data.items():
        for t,r in v["hourly"].items():by.setdefault(t,{})[s]=r
    return times,by

def prior(by,times,i,s,lag):
    if i<lag:return None
    return by.get(times[i-lag],{}).get(s)

def last_funding_before(funds,t):
    # funding known only at/after settlement timestamp
    out=0.0
    for ts,r in funds:
        if ts<=t:out=r
        else:break
    return out

def funding_between(funds,a,b):
    return sum(r for t,r in funds if a<=t<=b)

def raw_features(data,times,by,i):
    t=times[i];rows=[]
    for s,r in by.get(t,{}).items():
        p1=prior(by,times,i,s,1);p4=prior(by,times,i,s,4);p12=prior(by,times,i,s,12);p24=prior(by,times,i,s,24)
        if None in (p1,p4,p12,p24):continue
        if min(p1["c"],p4["c"],p12["c"],p4["oi"],p12["oi"])<=0:continue
        hist=[]
        for j in range(max(0,i-24),i):
            rr=by.get(times[j],{}).get(s)
            if rr is not None:hist.append(rr["qv"])
        if len(hist)<18:continue
        rows.append({
          "s":s,
          "ret1":r["c"]/p1["c"]-1,
          "ret4":r["c"]/p4["c"]-1,
          "ret12":r["c"]/p12["c"]-1,
          "oi1":r["oi"]/p1["oi"]-1,
          "oi4":r["oi"]/p4["oi"]-1,
          "oi12":r["oi"]/p12["oi"]-1,
          "premium":r["premium"],
          "premium4":r["premium"]-p4["premium"],
          "vrel":r["qv"]/max(1e-12,float(np.mean(hist))),
          "fund":last_funding_before(data[s]["funding"],t),
        })
    return rows

FACTOR_NAMES=[
 "rel_mom4","rel_mom12","meanrev1","meanrev4","oi_mom4","oi_div4",
 "price_oi_cont4","price_oi_revert4","crowded_long","crowded_short",
 "basis_revert","funding_revert","volume_momentum","multi_cont","multi_revert"
]

def factor_scores(rows):
    if len(rows)<8:return {}
    keys=["ret1","ret4","ret12","oi1","oi4","oi12","premium","premium4","vrel","fund"]
    zs={}
    for k in keys:zs[k]=zscores([r[k] for r in rows])
    out={}
    out["rel_mom4"]=zs["ret4"]
    out["rel_mom12"]=zs["ret12"]
    out["meanrev1"]=-zs["ret1"]
    out["meanrev4"]=-zs["ret4"]
    out["oi_mom4"]=zs["oi4"]
    out["oi_div4"]=zs["ret4"]-zs["oi4"]
    out["price_oi_cont4"]=zs["ret4"]+zs["oi4"]
    out["price_oi_revert4"]=-(zs["ret4"]+zs["oi4"])
    out["crowded_long"]=zs["ret4"]+zs["oi4"]+zs["premium"]+zs["fund"]
    out["crowded_short"]=-(zs["ret4"]+zs["oi4"]+zs["premium"]+zs["fund"])
    out["basis_revert"]=-zs["premium"]
    out["funding_revert"]=-zs["fund"]
    out["volume_momentum"]=zs["ret4"]+.5*zs["vrel"]
    out["multi_cont"]=zs["ret4"]+.75*zs["oi4"]+.5*zs["vrel"]-.5*zs["premium"]-.5*zs["fund"]
    out["multi_revert"]=-zs["ret4"]-.5*zs["oi4"]+.5*zs["vrel"]-.5*zs["premium"]-.5*zs["fund"]
    return out

def period_metric(v):
    a=np.asarray(v,float);a=a[np.isfinite(a)]
    if not len(a):return {"n":0,"win_pct":None,"avg_bps":None,"pf":None,"compound_pct":0,"max_dd_pct":0,"sharpe":None}
    eq=np.cumprod(1+a);pk=np.maximum.accumulate(eq);dd=eq/pk-1
    pos=float(a[a>0].sum());neg=float(-a[a<0].sum())
    sd=float(a.std(ddof=1)) if len(a)>1 else 0
    sh=float(a.mean()/sd*np.sqrt(365.25*24/8)) if sd>0 else None
    return {"n":len(a),"win_pct":round(100*float((a>0).mean()),3),
            "avg_bps":round(10000*float(a.mean()),4),
            "pf":round(pos/neg,4) if neg else None,
            "compound_pct":round(100*float(eq[-1]-1),3),
            "max_dd_pct":round(100*float(dd.min()),3),
            "sharpe":round(sh,3) if sh is not None else None}

def trade_leg(data,by,times,i,s,side,H,cost):
    if i+1>=len(times) or i+H>=len(times):return None
    te=times[i+1];tx=times[i+H]
    if s not in by.get(te,{}) or s not in by.get(tx,{}):return None
    e=by[te][s]["o"];x=by[tx][s]["c"]
    if e<=0:return None
    fsum=funding_between(data[s]["funding"],te,tx)
    return side*(x/e-1)-cost-side*fsum

def run_rule(data,times,by,factor,H,k,mode,cost,lo,hi):
    vals=[];timestamps=[];i=24
    while i<len(times)-H:
        t=times[i]
        if not(lo<=t<hi):i+=1;continue
        if times[i+1]<lo or times[i+H]>=hi:i+=1;continue
        rows=raw_features(data,times,by,i)
        fs=factor_scores(rows)
        if factor not in fs or len(rows)<max(8,2*k):i+=1;continue
        ranked=sorted(zip(rows,fs[factor]),key=lambda z:z[1])
        low=[r["s"] for r,_ in ranked[:k]];high=[r["s"] for r,_ in ranked[-k:]]
        legs=[]
        if mode=="TOP_LONG":legs=[(s,1) for s in high]
        elif mode=="BOTTOM_SHORT":legs=[(s,-1) for s in low]
        elif mode=="LONG_SHORT":legs=[(s,1) for s in high]+[(s,-1) for s in low]
        elif mode=="TOP_SHORT":legs=[(s,-1) for s in high]
        elif mode=="BOTTOM_LONG":legs=[(s,1) for s in low]
        elif mode=="REVERSE_LS":legs=[(s,-1) for s in high]+[(s,1) for s in low]
        rr=[]
        for s,side in legs:
            x=trade_leg(data,by,times,i,s,side,H,cost)
            if x is not None:rr.append(x)
        if len(rr)>=max(1,len(legs)//2):
            vals.append(float(np.mean(rr)));timestamps.append(t);i+=H
        else:i+=1
    return vals,timestamps

def chunks(vals,n=3):
    a=np.asarray(vals,float)
    if not len(a):return []
    out=[]
    for part in np.array_split(a,n):out.append(period_metric(part))
    return out

def main():
    loaded={};coverage={};errors={}
    # Symbols load in parallel; each symbol internally parallelizes daily OI requests.
    with ThreadPoolExecutor(max_workers=4) as ex:
        fs={ex.submit(load_symbol,s):s for s in SYMS}
        for f in as_completed(fs):
            s=fs[f]
            try:
                sym,d,c=f.result()
                if d is not None and c.get("coverage",0)>=.85:
                    loaded[sym]=d;coverage[sym]=c
                    print("LOADED",sym,c["hours"],round(c["coverage"],3),c["funding_n"],flush=True)
                else:
                    errors[sym]=c;print("SKIP",sym,c,flush=True)
            except Exception as e:
                errors[s]=repr(e);print("FAIL",s,repr(e),flush=True)
    if len(loaded)<12:raise RuntimeError(f"too few loaded symbols: {len(loaded)}")
    times,by=build_panel(loaded)
    modes=("TOP_LONG","BOTTOM_SHORT","LONG_SHORT","TOP_SHORT","BOTTOM_LONG","REVERSE_LS")
    train=[]
    for factor in FACTOR_NAMES:
      for H in HOLDS:
       for k in KS:
        for mode in modes:
            v,_=run_rule(loaded,times,by,factor,H,k,mode,COST,START,SPLIT)
            m=period_metric(v)
            if m["n"]>=35:
                train.append({"factor":factor,"hold_h":H,"k":k,"mode":mode,"train":m})
    train.sort(key=lambda z:((z["train"]["sharpe"] or -99),(z["train"]["pf"] or 0),z["train"]["avg_bps"] or -999),reverse=True)
    finalists=[]
    for z in train[:80]:
        vo,_=run_rule(loaded,times,by,z["factor"],z["hold_h"],z["k"],z["mode"],COST,SPLIT,END)
        vs,_=run_rule(loaded,times,by,z["factor"],z["hold_h"],z["k"],z["mode"],STRESS_COST,SPLIT,END)
        mo=period_metric(vo);ms=period_metric(vs);ch=chunks(vo,3)
        posch=sum(1 for x in ch if (x.get("avg_bps") or -999)>0)
        eligible=bool(z["train"]["n"]>=35 and mo["n"]>=20 and (z["train"]["pf"] or 0)>1.10 and
                      (mo["pf"] or 0)>1.15 and (mo["avg_bps"] or -999)>0 and
                      posch>=2 and (ms["pf"] or 0)>1.0)
        finalists.append({**z,"oos":mo,"oos_stress_025":ms,"oos_chunks":ch,
                          "positive_oos_chunks":posch,"eligible":eligible})
    eligible=[x for x in finalists if x["eligible"]]
    eligible.sort(key=lambda z:((z["oos"]["sharpe"] or -99),(z["oos"]["pf"] or 0),z["oos"]["avg_bps"] or -999),reverse=True)

    # Portfolio estimate for the single train-best rule, not OOS-picked.
    best=train[0] if train else None
    best_oos={}
    if best:
        v,ts=run_rule(loaded,times,by,best["factor"],best["hold_h"],best["k"],best["mode"],COST,SPLIT,END)
        best_oos=period_metric(v)
        best_oos["start_balance"]=1000.
        best_oos["final_balance"]=round(1000*np.prod(1+np.asarray(v,float)),2) if v else 1000.
        best_oos["train_selected_rule"]={k:best[k] for k in ("factor","hold_h","k","mode")}
    report={
      "schema":"crosssection-oi-funding-basis/1.0",
      "window":{"start_ms":START,"split_ms":SPLIT,"end_exclusive_ms":END},
      "requested_symbols":SYMS,"loaded_symbols":sorted(loaded),"coverage":coverage,"errors":errors,
      "base_cost_roundtrip_pct_per_leg":COST*100,"stress_cost_roundtrip_pct_per_leg":STRESS_COST*100,
      "method":[
        "Research only; no paper/live state changes.",
        "Hourly cross-sectional ranks built from Binance 5m perpetual klines, 5m premium-index klines, 5m OI metrics, and archived funding settlements.",
        "Factors include relative momentum and mean reversion, OI momentum/divergence, price+OI continuation/reversal, crowded long/short composites, basis/funding reversal, volume-confirmed momentum, and multi-factor continuation/reversal.",
        "Candidate definitions are ranked only on the first 70% of time. Only the top 80 train candidates are exposed to the final 30% OOS.",
        "Entry is next-hour open; exits are 4/8/12/24 hours later. Actual archived funding settlements inside each position are applied by side.",
        "Each constituent leg pays 0.16% round-trip drag; OOS stress repeats at 0.25%.",
        "Eligibility requires OOS PF>1.15, positive expectancy, >=20 OOS rebalances, >=2/3 positive OOS chunks, and PF>1 under 0.25% cost stress.",
        "The $1,000 figure is for the single best train-selected basket rule compounded across non-overlapping OOS rebalances; no leverage. Max DD is closed-equity."
      ],
      "train_tested":len(train),"train_top":train[:80],"finalists":finalists,
      "eligible_count":len(eligible),"eligible":eligible,
      "train_best_rule_oos_1000":best_oos
    }
    out=ROOT/"research-output";out.mkdir(exist_ok=True)
    (out/"crosssection-oi-funding-basis.json").write_text(json.dumps(report,indent=2,allow_nan=False))
    print("CS_OI_SUMMARY "+json.dumps({
      "loaded":len(loaded),"train_tested":len(train),"finalists":len(finalists),
      "eligible_count":len(eligible),
      "eligible":[{k:x[k] for k in ("factor","hold_h","k","mode","train","oos","oos_stress_025")} for x in eligible[:10]],
      "train_best_rule_oos_1000":best_oos
    }),flush=True)

if __name__=="__main__":
    main()

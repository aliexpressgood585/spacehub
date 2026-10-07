"""Independent survival test for the nine standout symbols from the user's all-coin scan.

Research only. This intentionally does NOT trust the original aggregate table.
It rediscovers a fast 1m rule per symbol using early data only, freezes the rule,
then evaluates later unseen-in-this-run data, cost stress, parameter neighbors,
and a one-position-at-a-time $1,000 rotating portfolio.

Universe:
AKE, MARSCOIN, TUT, SKYAI, ESPORTS, H, NAORIS, BROCCOLI714, CTR.

Data: Binance USDT-M 1m archives, roughly 2026-04-01..2026-10-06 UTC
(or all available data after listing, minimum 60 days).
"""
import csv, io, json, math, urllib.request, urllib.error, zipfile, hashlib
from pathlib import Path
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from numba import njit

SYMBOLS=[
 "AKEUSDT","MARSCOINUSDT","TUTUSDT","SKYAIUSDT","ESPORTSUSDT",
 "HUSDT","NAORISUSDT","BROCCOLI714USDT","CTRUSDT"
]
START_DT=datetime(2026,4,1,tzinfo=timezone.utc)
END_DT=datetime(2026,10,7,tzinfo=timezone.utc)
START=int(START_DT.timestamp()*1000); END=int(END_DT.timestamp()*1000)
BASE="https://data.binance.vision/data/futures/um"
UA={"User-Agent":"spacehub-top9-survival/1.0"}
STEP=60000
BASE_COST=.0016
COST_STRESS=(.0016,.0025,.0035)
HORIZONS=(5,10,15,30,60)
TPS=(.003,.005,.0075,.01,.015,.02)
SLS=(.003,.005,.0075,.01,.015,.02)
TOP_SCREEN=20

def month_iter(a,b):
    y,m=a.year,a.month
    while (y,m)<=(b.year,b.month):
        yield y,m
        m+=1
        if m==13:y+=1;m=1

def read_zip(url):
    try:
        req=urllib.request.Request(url,headers=UA)
        with urllib.request.urlopen(req,timeout=30) as r: raw=r.read()
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            txt=z.read(z.namelist()[0]).decode()
        rows=[]
        for rr in csv.reader(io.StringIO(txt)):
            if not rr or not rr[0].isdigit():continue
            t=int(rr[0]); t=t//1000 if t>10**14 else t
            if START<=t<END:
                rows.append((t,float(rr[1]),float(rr[2]),float(rr[3]),float(rr[4]),float(rr[5])))
        return rows,{"url":url,"sha256":hashlib.sha256(raw).hexdigest(),"rows":len(rows)}
    except urllib.error.HTTPError as e:
        if e.code==404:return [],{"url":url,"missing":404}
        raise

def load(sym):
    rows=[];manifest=[]
    # Fully completed months.
    for y,m in month_iter(START_DT,END_DT):
        if (y,m)==(END_DT.year,END_DT.month):break
        u=f"{BASE}/monthly/klines/{sym}/1m/{sym}-1m-{y}-{m:02d}.zip"
        a,meta=read_zip(u);rows+=a;manifest.append(meta)
    # Current partial month.
    for d in range(1,END_DT.day):
        u=f"{BASE}/daily/klines/{sym}/1m/{sym}-1m-{END_DT.year}-{END_DT.month:02d}-{d:02d}.zip"
        a,meta=read_zip(u);rows+=a;manifest.append(meta)
    rows=sorted({r[0]:r for r in rows}.values())
    if not rows:return sym,None,{"error":"no_data","manifest":manifest}
    a=np.array(rows,float)
    t=a[:,0].astype(np.int64)
    gaps=np.flatnonzero(np.diff(t)!=STEP)
    span_days=(t[-1]-t[0])/86400000
    coverage=len(a)/max(1,((t[-1]-t[0])//STEP+1))
    info={"first_ms":int(t[0]),"last_ms":int(t[-1]),"bars":len(a),
          "span_days":span_days,"coverage":coverage,"gap_count":int(len(gaps)),
          "manifest":manifest}
    return sym,a,info

def ema(x,n):
    out=np.full(len(x),np.nan)
    if len(x)<n:return out
    out[n-1]=np.mean(x[:n]);alpha=2/(n+1)
    for i in range(n,len(x)):out[i]=out[i-1]+alpha*(x[i]-out[i-1])
    return out

def rsi(x,n=14):
    out=np.full(len(x),np.nan)
    if len(x)<=n:return out
    d=np.diff(x);g=np.maximum(d,0);l=np.maximum(-d,0)
    ag=np.mean(g[:n]);al=np.mean(l[:n]);out[n]=100*ag/(ag+al) if ag+al else 50
    for i in range(n+1,len(x)):
        ag=(ag*(n-1)+g[i-1])/n;al=(al*(n-1)+l[i-1])/n
        out[i]=100*ag/(ag+al) if ag+al else 50
    return out

def atr(a,n=14):
    out=np.full(len(a),np.nan)
    if len(a)<=n:return out
    tr=np.zeros(len(a));tr[0]=a[0,2]-a[0,3]
    for i in range(1,len(a)):
        tr[i]=max(a[i,2]-a[i,3],abs(a[i,2]-a[i-1,4]),abs(a[i,3]-a[i-1,4]))
    v=np.mean(tr[1:n+1]);out[n]=v
    for i in range(n+1,len(a)):
        v=(v*(n-1)+tr[i])/n;out[i]=v
    return out

def rmean(x,n):
    out=np.full(len(x),np.nan)
    if len(x)<n:return out
    cs=np.r_[0.,np.cumsum(x)]
    out[n-1:]=(cs[n:]-cs[:-n])/n
    return out

def rstd(x,n):
    out=np.full(len(x),np.nan)
    if len(x)<n:return out
    cs=np.r_[0.,np.cumsum(x)];cs2=np.r_[0.,np.cumsum(x*x)]
    s=cs[n:]-cs[:-n];q=cs2[n:]-cs2[:-n]
    out[n-1:]=np.sqrt(np.maximum(0,q/n-(s/n)**2))
    return out

def ret_n(c,n):
    out=np.full(len(c),np.nan)
    if len(c)>n:out[n:]=c[n:]/c[:-n]-1
    return out

def features(a):
    c,o,v=a[:,4],a[:,1],a[:,5]
    aa=atr(a);vm=rmean(v,60);e20=ema(c,20);e100=ema(c,100);rr=rsi(c)
    ma60=rmean(c,60);sd60=rstd(c,60);z=(c-ma60)/sd60
    return {"c":c,"o":o,"v":v,"atr":aa,"vm":vm,"e20":e20,"e100":e100,"rsi":rr,"z":z}

def add(out,name,side,mask,fam,detail=None):
    idx=np.flatnonzero(mask)
    idx=idx[idx+1<len(mask)]
    if len(idx):out.append({"name":name,"side":int(side),"idx":idx.astype(np.int64),
                            "family":fam,"detail":detail or {}})

def gen_signals(a):
    f=features(a);c,o,v=f["c"],f["o"],f["v"];out=[]
    green=c>o;red=c<o
    # Every exact R/G sequence length 1-5, both continuation and fade.
    for n in range(1,6):
        for code in range(2**n):
            bits=[(code>>(n-1-k))&1 for k in range(n)]
            m=np.ones(len(a),bool);m[:n-1]=False
            for pos,b in enumerate(bits):
                lag=n-1-pos
                src=green if b else red
                if lag==0:m &= src
                else:m &= np.r_[np.zeros(lag,dtype=bool),src[:-lag]]
            pat=''.join('G' if b else 'R' for b in bits)
            add(out,f"pat_{pat}_follow",1 if bits[-1] else -1,m,"pattern",{"pattern":pat,"mode":"follow"})
            add(out,f"pat_{pat}_fade",-1 if bits[-1] else 1,m,"pattern",{"pattern":pat,"mode":"fade"})
    # Momentum/reversal.
    for mins in (3,5,10,15,30,60):
        rr=ret_n(c,mins)
        for th in (.002,.004,.006,.01,.015,.02):
            up=np.isfinite(rr)&(rr>=th);dn=np.isfinite(rr)&(rr<=-th)
            add(out,f"mom_{mins}_{th}_up",1,up,"momentum",{"mins":mins,"thr":th})
            add(out,f"mom_{mins}_{th}_dn",-1,dn,"momentum",{"mins":mins,"thr":th})
            add(out,f"rev_{mins}_{th}_up",-1,up,"reversal",{"mins":mins,"thr":th})
            add(out,f"rev_{mins}_{th}_dn",1,dn,"reversal",{"mins":mins,"thr":th})
    # RSI.
    for th in (20,25,30,35):
        lo=np.isfinite(f["rsi"])&(f["rsi"]<=th)
        add(out,f"rsi_le_{th}_rev",1,lo,"rsi_reversal")
        add(out,f"rsi_le_{th}_trend",-1,lo,"rsi_trend")
    for th in (65,70,75,80):
        hi=np.isfinite(f["rsi"])&(f["rsi"]>=th)
        add(out,f"rsi_ge_{th}_rev",-1,hi,"rsi_reversal")
        add(out,f"rsi_ge_{th}_trend",1,hi,"rsi_trend")
    # Vol expansion / fade.
    body=np.abs(c-o)
    for bm in (1.0,1.5,2.0,2.5):
        for vm in (1.0,1.5,2.0):
            ok=np.isfinite(f["atr"])&np.isfinite(f["vm"])&(body>=bm*f["atr"])&(v>=vm*f["vm"])
            add(out,f"exp_b{bm}_v{vm}_g",1,ok&green,"vol_expansion")
            add(out,f"exp_b{bm}_v{vm}_r",-1,ok&red,"vol_expansion")
            add(out,f"fade_b{bm}_v{vm}_g",-1,ok&green,"vol_fade")
            add(out,f"fade_b{bm}_v{vm}_r",1,ok&red,"vol_fade")
    # Trend pullback / trend state.
    bull=np.isfinite(f["e100"])&(f["e20"]>f["e100"])&(c>f["e20"])
    bear=np.isfinite(f["e100"])&(f["e20"]<f["e100"])&(c<f["e20"])
    add(out,"trend_state_long",1,bull,"trend")
    add(out,"trend_state_short",-1,bear,"trend")
    # Z-score continuation / fade.
    for zt in (1.5,2.0,2.5):
        up=np.isfinite(f["z"])&(f["z"]>=zt);dn=np.isfinite(f["z"])&(f["z"]<=-zt)
        add(out,f"z{zt}_up_follow",1,up,"z_momentum")
        add(out,f"z{zt}_up_fade",-1,up,"z_reversion")
        add(out,f"z{zt}_dn_follow",-1,dn,"z_momentum")
        add(out,f"z{zt}_dn_fade",1,dn,"z_reversion")
    return out

def metrics(v):
    v=np.asarray(v,float);n=len(v)
    if not n:return {"n":0,"wins":0,"wr":None,"pf":None,"avg_net_bps":None,"sum_net_pct":0}
    wins=int((v>0).sum());pos=float(v[v>0].sum());neg=float(-v[v<0].sum())
    return {"n":n,"wins":wins,"wr":round(100*wins/n,3),
            "pf":round(pos/neg,4) if neg else None,
            "avg_net_bps":round(float(v.mean())*10000,4),
            "sum_net_pct":round(float(v.sum())*100,4)}

def splits(a):
    t=a[:,0].astype(np.int64);lo=int(t[0]);hi=int(t[-1]+STEP);span=hi-lo
    if span>=120*86400000:
        d=lo+int(.60*span);s=lo+int(.80*span)
    else:
        d=lo+int(.50*span);s=lo+int(.75*span)
    return lo,d,s,hi

def fixed_nonoverlap(a,idx,side,horizon,start,end,cost=BASE_COST):
    vals=[];last=-1
    for sig in idx:
        j=int(sig)+1
        if j<=last or j+horizon>len(a):continue
        ts=a[j,0]
        if ts<start or ts>=end:continue
        e=a[j,1];x=a[j+horizon-1,4]
        vals.append(side*(x/e-1)-cost);last=j+horizon-1
    return np.array(vals,float)

@njit
def exact_records_numba(a,idx,side,tp,sl,hold,start,end,cost):
    # columns: entry_ms, exit_ms, net
    tmp=np.empty((len(idx),3),np.float64);n=0;last=-1
    boundary=np.searchsorted(a[:,0],end)
    for kk in range(len(idx)):
        j0=int(idx[kk])+1
        if j0<=last or j0>=boundary:continue
        ts=a[j0,0]
        if ts<start or ts>=end:continue
        e=a[j0,1];target=e*(1+side*tp);stop=e*(1-side*sl)
        lim=min(boundary,j0+hold);done=False
        for j in range(j0,lim):
            px=0.0;hit=False
            if side>0:
                if a[j,1]<=stop:px=a[j,1];hit=True
                elif a[j,1]>=target:px=target;hit=True
                elif a[j,3]<=stop:px=stop;hit=True
                elif a[j,2]>=target:px=target;hit=True
            else:
                if a[j,1]>=stop:px=a[j,1];hit=True
                elif a[j,1]<=target:px=target;hit=True
                elif a[j,2]>=stop:px=stop;hit=True
                elif a[j,3]<=target:px=target;hit=True
            if hit:
                tmp[n,0]=ts;tmp[n,1]=a[j,0];tmp[n,2]=side*(px/e-1)-cost
                n+=1;last=j;done=True;break
        if not done and j0+hold<=boundary:
            j=j0+hold-1;px=a[j,4]
            tmp[n,0]=ts;tmp[n,1]=a[j,0];tmp[n,2]=side*(px/e-1)-cost
            n+=1;last=j
    return tmp[:n]

def exact_records(a,idx,side,tp,sl,hold,start,end,cost=BASE_COST):
    return exact_records_numba(a,idx,side,tp,sl,hold,start,end,cost)

def days(start,end):return max(1,(end-start)/86400000)
def velocity(mm,start,end):
    if mm["n"]<=0 or mm["avg_net_bps"] is None:return -999
    return (mm["avg_net_bps"]/10000)*mm["n"]/days(start,end)

def screen(a,sigs,lo,dev,sel):
    rows=[]
    for s in sigs:
        for h in HORIZONS:
            md=metrics(fixed_nonoverlap(a,s["idx"],s["side"],h,lo,dev))
            ms=metrics(fixed_nonoverlap(a,s["idx"],s["side"],h,dev,sel))
            robust=(md["n"]>=50 and ms["n"]>=20 and (md["pf"] or 0)>1.01 and (ms["pf"] or 0)>1.01
                    and (md["avg_net_bps"] or -999)>0 and (ms["avg_net_bps"] or -999)>0)
            sc=min(velocity(md,lo,dev),velocity(ms,dev,sel)) if robust else -999
            rows.append({"sig":s,"h":h,"dev":md,"selection":ms,"score":sc})
    rows.sort(key=lambda r:(r["score"],r["selection"]["pf"] or -1),reverse=True)
    seen=set();out=[]
    for r in rows:
        k=(r["sig"]["name"],r["sig"]["side"])
        if k in seen:continue
        seen.add(k);out.append(r)
        if len(out)>=TOP_SCREEN:break
    return out

def exact_select(a,screened,lo,dev,sel):
    best=None
    for r in screened:
        s=r["sig"]
        for tp in TPS:
            for sl in SLS:
                for h in HORIZONS:
                    rd=exact_records(a,s["idx"],s["side"],tp,sl,h,lo,dev)
                    rs=exact_records(a,s["idx"],s["side"],tp,sl,h,dev,sel)
                    md=metrics(rd[:,2] if len(rd) else [])
                    ms=metrics(rs[:,2] if len(rs) else [])
                    robust=(md["n"]>=40 and ms["n"]>=18 and (md["pf"] or 0)>1.02 and (ms["pf"] or 0)>1.02
                            and (md["avg_net_bps"] or -999)>0 and (ms["avg_net_bps"] or -999)>0)
                    sc=min(velocity(md,lo,dev),velocity(ms,dev,sel)) if robust else -999
                    rec={"signal":s["name"],"family":s["family"],"detail":s["detail"],"side":s["side"],
                         "idx":s["idx"],"tp":tp,"sl":sl,"hold":h,"dev":md,"selection":ms,"score":sc}
                    if best is None or (sc,ms["pf"] or -1)>(best["score"],best["selection"]["pf"] or -1):
                        best=rec
    return best

def neighbor_tests(a,best,lo,dev,sel,hold_start,hold_end):
    tps=list(TPS);sls=list(SLS);hs=list(HORIZONS)
    ti=tps.index(best["tp"]);si=sls.index(best["sl"]);hi=hs.index(best["hold"])
    cfg=set()
    for di in (-1,0,1):
        if 0<=ti+di<len(tps):cfg.add((tps[ti+di],best["sl"],best["hold"]))
        if 0<=si+di<len(sls):cfg.add((best["tp"],sls[si+di],best["hold"]))
        if 0<=hi+di<len(hs):cfg.add((best["tp"],best["sl"],hs[hi+di]))
    rows=[]
    for tp,sl,h in sorted(cfg):
        rr=exact_records(a,best["idx"],best["side"],tp,sl,h,lo,sel)
        rv=exact_records(a,best["idx"],best["side"],tp,sl,h,hold_start,hold_end)
        mt=metrics(rr[:,2] if len(rr) else []);mv=metrics(rv[:,2] if len(rv) else [])
        rows.append({"tp_pct":tp*100,"sl_pct":sl*100,"hold_min":h,
                     "train_selection":mt,"holdout":mv})
    return rows

def chunks(a,best,start,end,n=3):
    cuts=[int(start+i*(end-start)/n) for i in range(n+1)]
    out=[]
    for x,y in zip(cuts[:-1],cuts[1:]):
        rr=exact_records(a,best["idx"],best["side"],best["tp"],best["sl"],best["hold"],x,y)
        out.append({"start_ms":x,"end_ms":y,**metrics(rr[:,2] if len(rr) else [])})
    return out

def comp_stats(records,start_balance=1000.0):
    bal=start_balance;peak=bal;dd=0.;wins=0
    for r in records:
        bal*=1+float(r[2]);wins+=float(r[2])>0
        peak=max(peak,bal);dd=max(dd,(peak-bal)/peak)
    return {"start_balance":start_balance,"final_balance":round(bal,2),
            "return_pct":round((bal/start_balance-1)*100,3),
            "trades":len(records),"wins":int(wins),
            "win_rate_pct":round(100*wins/len(records),3) if len(records) else None,
            "max_closed_equity_drawdown_pct":round(dd*100,3)}

def run_symbol(item):
    sym,a,info=item
    if a is None or info.get("span_days",0)<60 or info.get("coverage",0)<.95:
        return {"symbol":sym,"status":"SKIP","data":info}
    lo,dev,sel,hi=splits(a)
    sigs=gen_signals(a)
    screened=screen(a,sigs,lo,dev,sel)
    best=exact_select(a,screened,lo,dev,sel)
    if best is None or best["score"]<=-999:
        return {"symbol":sym,"status":"NO_ROBUST_TRAIN","data":info,
                "generated_signals":len(sigs)}
    hold=exact_records(a,best["idx"],best["side"],best["tp"],best["sl"],best["hold"],sel,hi,BASE_COST)
    mh=metrics(hold[:,2] if len(hold) else [])
    ch=chunks(a,best,sel,hi,3);posch=sum(1 for x in ch if x["avg_net_bps"] is not None and x["avg_net_bps"]>0)
    stress={}
    for cc in COST_STRESS:
        rr=exact_records(a,best["idx"],best["side"],best["tp"],best["sl"],best["hold"],sel,hi,cc)
        stress[str(cc)]=metrics(rr[:,2] if len(rr) else [])
    neigh=neighbor_tests(a,best,lo,dev,sel,sel,hi)
    train_neigh=sum(1 for x in neigh if (x["train_selection"]["pf"] or 0)>1 and (x["train_selection"]["avg_net_bps"] or -999)>0)
    hold_neigh=sum(1 for x in neigh if (x["holdout"]["pf"] or 0)>1 and (x["holdout"]["avg_net_bps"] or -999)>0)
    survive=bool(mh["n"]>=20 and (mh["pf"] or 0)>1.10 and (mh["avg_net_bps"] or -999)>0 and
                 posch>=2 and (stress[str(.0025)]["pf"] or 0)>1.0 and train_neigh>=max(3,len(neigh)//2))
    return {"symbol":sym,"status":"PASS" if survive else "FAIL","data":info,
            "split":{"start_ms":lo,"dev_end_ms":dev,"selection_end_ms":sel,"end_ms":hi},
            "generated_signals":len(sigs),
            "chosen":{"signal":best["signal"],"family":best["family"],"detail":best["detail"],
                      "side":"LONG" if best["side"]==1 else "SHORT",
                      "tp_pct":best["tp"]*100,"sl_pct":best["sl"]*100,"hold_min":best["hold"],
                      "dev":best["dev"],"selection":best["selection"],"train_velocity_score":best["score"]},
            "holdout":mh,"holdout_chunks":ch,"positive_holdout_chunks":posch,
            "cost_stress":stress,"neighbors":neigh,
            "positive_train_neighbors":train_neigh,"positive_holdout_neighbors":hold_neigh,
            "holdout_records":hold.tolist()}

def rotating(results,start,end):
    cand=[r for r in results if r.get("chosen")]
    cand.sort(key=lambda r:r["chosen"]["train_velocity_score"],reverse=True)
    events=[]
    for rank,r in enumerate(cand):
        for rec in r.get("holdout_records",[]):
            if start<=rec[0]<end:events.append((rec[0],rank,r["symbol"],rec))
    events.sort(key=lambda x:(x[0],x[1]))
    chosen=[];busy=-1
    for _,rank,sym,rec in events:
        if rec[0]<busy:continue
        chosen.append(rec);busy=rec[1]
    return comp_stats(np.asarray(chosen,float) if chosen else np.empty((0,3)))

def main():
    with ThreadPoolExecutor(max_workers=6) as ex:
        loaded=list(ex.map(load,SYMBOLS))
    results=[]
    # Sequential research to avoid memory spikes.
    for item in loaded:
        r=run_symbol(item);results.append(r)
        print("SYMBOL_RESULT "+json.dumps({k:r.get(k) for k in ("symbol","status","chosen","holdout","positive_holdout_chunks","positive_train_neighbors","positive_holdout_neighbors")}),flush=True)
    passed=[r for r in results if r["status"]=="PASS"]
    # Diagnostic survivor portfolio uses holdout-confirmed symbols, therefore NOT a pristine deployable estimate.
    survivor_events=[]
    for rank,r in enumerate(sorted(passed,key=lambda x:x["chosen"]["train_velocity_score"],reverse=True)):
        for rec in r.get("holdout_records",[]):
            survivor_events.append((rec[0],rank,r["symbol"],rec))
    survivor_events.sort(key=lambda x:(x[0],x[1]))
    chosen=[];busy=-1
    for _,rank,sym,rec in survivor_events:
        if rec[0]<busy:continue
        chosen.append(rec);busy=rec[1]
    survivor_stats=comp_stats(np.asarray(chosen,float) if chosen else np.empty((0,3)))

    report={
      "window":{"requested_start":START_DT.isoformat(),"requested_end_exclusive":END_DT.isoformat()},
      "symbols":SYMBOLS,"base_roundtrip_cost_pct":BASE_COST*100,
      "method":[
        "Independent survival test; the original summary table is treated only as a candidate generator.",
        "Binance USDT-M 1m archives. Symbols need at least 60 days and >=95% coverage from first to last available bar.",
        "Per symbol: early development + temporal selection choose one rule; final segment is not used for parameter selection.",
        "Rules searched: all exact 1-5 candle color patterns in continuation/fade direction, multi-horizon momentum/reversal, RSI, volatility/volume expansion/fade, EMA trend, z-score continuation/reversion.",
        "Exact exits search TP/SL 0.3%-2.0% and 5-60 minute holds, with stop-first same-bar ordering and 0.16% round-trip cost.",
        "Survival requires holdout PF>1.10, positive expectancy, >=20 trades, >=2/3 positive holdout chunks, PF>1 under 0.25% cost stress, and a positive train parameter neighborhood.",
        "The final 'survivor portfolio' is diagnostic because membership uses holdout results; it is not a pristine future performance estimate."
      ],
      "pass_count":len(passed),"passed_symbols":[r["symbol"] for r in passed],
      "survivor_portfolio_diagnostic":survivor_stats,
      "results":results,
    }
    out=Path("research-output");out.mkdir(exist_ok=True)
    (out/"top9-survival-1m.json").write_text(json.dumps(report,indent=2,allow_nan=False))
    print("TOP9_SURVIVAL_SUMMARY "+json.dumps({
      "pass_count":len(passed),"passed_symbols":[r["symbol"] for r in passed],
      "survivor_portfolio_diagnostic":survivor_stats,
      "brief":[{"symbol":r["symbol"],"status":r["status"],"chosen":r.get("chosen"),"holdout":r.get("holdout")} for r in results]
    }),flush=True)

if __name__=="__main__":
    main()

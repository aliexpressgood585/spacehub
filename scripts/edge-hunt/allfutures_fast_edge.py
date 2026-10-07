"""All-Futures fast-edge discovery, research only.

Two-stage, train-first design:
1) Scan the 525-symbol Binance USDT perpetual universe on completed 5m monthly
   archives (2026-04..2026-09) to shortlist high-turnover edges WITHOUT reading
   the final 20% holdout.
2) For the train-only shortlist, download 1m data, construct 1m/3m/5m bars,
   search price-action/volume/volatility continuation and mean-reversion rules,
   freeze one rule per symbol on the first 80%, and evaluate the final 20%.

No live/paper trading state is modified.
"""
import csv, io, json, math, hashlib, urllib.request, urllib.error, urllib.parse, zipfile
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import numpy as np
from numba import njit

ROOT=Path(__file__).resolve().parents[2]
UNIVERSE_FILE=ROOT/"status/five-falling-scan.json"
MONTHS=[(2026,m) for m in range(4,10)]  # six completed months only
BASE="https://data.binance.vision/data/futures/um/monthly/klines"
UA={"User-Agent":"spacehub-fast-edge/1.0"}
BASE_COST=.0016
COSTS=(.0016,.0025,.0035)
SHORTLIST_N=30
STAGE1_HOLDS=(3,6,12)  # 5m bars => 15/30/60m
DEEP_TFS=(1,3,5)
DEEP_SCREEN_HOLD_MIN=(5,10,20,40)
TPS=(.003,.005,.0075,.01,.015)
SLS=(.003,.005,.0075,.01,.015)

def universe():
    j=json.loads(UNIVERSE_FILE.read_text())
    xs=[x.get("symbol") for x in j.get("all",[]) if x.get("symbol")]
    return list(dict.fromkeys(xs))

def url_for(sym,tf,y,m):
    q=urllib.parse.quote(sym,safe="")
    return f"{BASE}/{q}/{tf}m/{q}-{tf}m-{y}-{m:02d}.zip"

def get_month(sym,tf,y,m):
    url=url_for(sym,tf,y,m)
    try:
        req=urllib.request.Request(url,headers=UA)
        with urllib.request.urlopen(req,timeout=35) as r: raw=r.read()
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            txt=z.read(z.namelist()[0]).decode()
        rows=[]
        for rr in csv.reader(io.StringIO(txt)):
            if not rr or not rr[0].isdigit(): continue
            t=int(rr[0]); t=t//1000 if t>10**14 else t
            rows.append((t,float(rr[1]),float(rr[2]),float(rr[3]),float(rr[4]),float(rr[5])))
        return rows,{"url":url,"sha256":hashlib.sha256(raw).hexdigest(),"rows":len(rows)}
    except urllib.error.HTTPError as e:
        if e.code==404:return [],{"url":url,"missing":404}
        return [],{"url":url,"error":f"http_{e.code}"}
    except Exception as e:
        return [],{"url":url,"error":type(e).__name__}

def load_symbol(sym,tf):
    rows=[];manifest=[]
    for y,m in MONTHS:
        a,meta=get_month(sym,tf,y,m); rows+=a; manifest.append(meta)
    if not rows:return sym,None,{"error":"no_data","manifest":manifest}
    rows=sorted({r[0]:r for r in rows}.values())
    a=np.array(rows,float); t=a[:,0].astype(np.int64)
    step=tf*60000
    span=max(step,int(t[-1]-t[0]+step))
    exp=max(1,span//step)
    info={"bars":len(a),"first_ms":int(t[0]),"last_ms":int(t[-1]),
          "span_days":span/86400000,"coverage":len(a)/exp,
          "manifest":manifest}
    return sym,a,info

def ema(x,n):
    out=np.full(len(x),np.nan)
    if len(x)<n:return out
    out[n-1]=np.mean(x[:n]); alpha=2/(n+1)
    for i in range(n,len(x)):out[i]=out[i-1]+alpha*(x[i]-out[i-1])
    return out

def atr(a,n=14):
    out=np.full(len(a),np.nan)
    if len(a)<=n:return out
    tr=np.empty(len(a));tr[0]=a[0,2]-a[0,3]
    for i in range(1,len(a)):
        tr[i]=max(a[i,2]-a[i,3],abs(a[i,2]-a[i-1,4]),abs(a[i,3]-a[i-1,4]))
    x=np.mean(tr[1:n+1]);out[n]=x
    for i in range(n+1,len(a)):
        x=(x*(n-1)+tr[i])/n;out[i]=x
    return out

def rmean(x,n):
    out=np.full(len(x),np.nan)
    if len(x)<n:return out
    cs=np.r_[0.,np.cumsum(x)]
    out[n-1:]=(cs[n:]-cs[:-n])/n
    return out

def ret_n(c,n):
    out=np.full(len(c),np.nan)
    if len(c)>n:out[n:]=c[n:]/c[:-n]-1
    return out

def add(out,name,side,mask,fam,detail=None):
    idx=np.flatnonzero(mask)
    idx=idx[idx+1<len(mask)]
    if len(idx):
        out.append({"name":name,"side":int(side),"idx":idx.astype(np.int64),
                    "family":fam,"detail":detail or {}})

def signals(a,tf):
    c,o,h,l,v=a[:,4],a[:,1],a[:,2],a[:,3],a[:,5]
    aa=atr(a); vm=rmean(v,20); e20=ema(c,20);e100=ema(c,100)
    out=[];green=c>o;red=c<o
    # Multi-horizon price impulse: continuation and fade.
    for mins in (15,30,60,120):
        n=max(1,round(mins/tf));rr=ret_n(c,n)
        for th in (.004,.0075,.012,.02,.03):
            up=np.isfinite(rr)&(rr>=th);dn=np.isfinite(rr)&(rr<=-th)
            add(out,f"mom_{mins}m_ge_{th}",1,up,"momentum",{"mins":mins,"thr":th})
            add(out,f"mom_{mins}m_le_-{th}",-1,dn,"momentum",{"mins":mins,"thr":th})
            add(out,f"rev_{mins}m_ge_{th}",-1,up,"reversal",{"mins":mins,"thr":th})
            add(out,f"rev_{mins}m_le_-{th}",1,dn,"reversal",{"mins":mins,"thr":th})
    # Body + volume expansion/fade.
    body=np.abs(c-o)
    for bm in (1.0,1.5,2.0):
        for vmul in (1.0,1.5):
            ok=np.isfinite(aa)&np.isfinite(vm)&(body>=bm*aa)&(v>=vmul*vm)
            add(out,f"expand_b{bm}_v{vmul}_g",1,ok&green,"vol_expansion")
            add(out,f"expand_b{bm}_v{vmul}_r",-1,ok&red,"vol_expansion")
            add(out,f"fade_b{bm}_v{vmul}_g",-1,ok&green,"vol_fade")
            add(out,f"fade_b{bm}_v{vmul}_r",1,ok&red,"vol_fade")
    # Candle streaks 2-5, continuation/fade.
    for n in range(2,6):
        mg=np.ones(len(a),bool);mr=np.ones(len(a),bool);mg[:n-1]=False;mr[:n-1]=False
        for lag in range(n):
            if lag==0: mg&=green;mr&=red
            else:
                mg &= np.r_[np.zeros(lag,dtype=bool),green[:-lag]]
                mr &= np.r_[np.zeros(lag,dtype=bool),red[:-lag]]
        add(out,f"{n}green_follow",1,mg,"streak")
        add(out,f"{n}green_fade",-1,mg,"streak")
        add(out,f"{n}red_follow",-1,mr,"streak")
        add(out,f"{n}red_fade",1,mr,"streak")
    # Wick rejection/follow with unusual range.
    rng=h-l; eps=np.maximum(rng,1e-12)
    lw=(np.minimum(o,c)-l)/eps; uw=(h-np.maximum(o,c))/eps
    for rm in (1.5,2.0):
        big=np.isfinite(aa)&(rng>=rm*aa)
        add(out,f"lower_wick_{rm}_rev",1,big&(lw>=.55),"wick_reversal")
        add(out,f"upper_wick_{rm}_rev",-1,big&(uw>=.55),"wick_reversal")
        add(out,f"lower_wick_{rm}_follow",-1,big&(lw>=.55),"wick_follow")
        add(out,f"upper_wick_{rm}_follow",1,big&(uw>=.55),"wick_follow")
    # Trend-aligned impulse/fade.
    bull=np.isfinite(e100)&(e20>e100)&(c>e20)
    bear=np.isfinite(e100)&(e20<e100)&(c<e20)
    add(out,"trend_long",1,bull,"trend")
    add(out,"trend_short",-1,bear,"trend")
    return out

def metrics(vals):
    v=np.asarray(vals,float);n=len(v)
    if not n:return {"n":0,"wins":0,"wr":None,"pf":None,"avg_net_bps":None,"sum_net_pct":0}
    pos=float(v[v>0].sum());neg=float(-v[v<0].sum());wins=int((v>0).sum())
    return {"n":n,"wins":wins,"wr":round(100*wins/n,3),
            "pf":round(pos/neg,4) if neg>0 else None,
            "avg_net_bps":round(float(v.mean())*10000,4),
            "sum_net_pct":round(float(v.sum())*100,4)}

def split_times(a):
    lo=int(a[0,0]);hi=int(a[-1,0])+1;span=hi-lo
    return lo,lo+int(.60*span),lo+int(.80*span),hi

def fixed_vec(a,idx,side,hold,start,end,cost=BASE_COST):
    j=idx+1;k=j+hold-1
    ok=k<len(a);j=j[ok];k=k[ok]
    if not len(j):return np.empty(0)
    ts=a[j,0];m=(ts>=start)&(ts<end);j=j[m];k=k[m]
    if not len(j):return np.empty(0)
    return side*(a[k,4]/a[j,1]-1)-cost

def velocity(mm,start,end):
    if mm["n"]<=0 or mm["avg_net_bps"] is None:return -999
    days=max(1,(end-start)/86400000)
    return (mm["avg_net_bps"]/10000)*mm["n"]/days

def stage1_one(item):
    sym,a,info=item
    if a is None or info.get("span_days",0)<60 or info.get("coverage",0)<.94:
        return {"symbol":sym,"status":"SKIP","data":info}
    lo,dev,sel,hi=split_times(a)
    best=None
    for s in signals(a,5):
        for hold in STAGE1_HOLDS:
            md=metrics(fixed_vec(a,s["idx"],s["side"],hold,lo,dev))
            ms=metrics(fixed_vec(a,s["idx"],s["side"],hold,dev,sel))
            robust=(md["n"]>=100 and ms["n"]>=30 and (md["pf"] or 0)>1.05 and (ms["pf"] or 0)>1.05
                    and (md["avg_net_bps"] or -999)>0 and (ms["avg_net_bps"] or -999)>0)
            sc=min(velocity(md,lo,dev),velocity(ms,dev,sel)) if robust else -999
            rec={"signal":s["name"],"family":s["family"],"side":s["side"],
                 "hold_min":hold*5,"dev":md,"selection":ms,"score":sc}
            if best is None or (sc,ms["pf"] or -1)>(best["score"],best["selection"]["pf"] or -1):
                best=rec
    return {"symbol":sym,"status":"CANDIDATE" if best and best["score"]>-999 else "NO_EDGE",
            "data":{k:info[k] for k in ("bars","first_ms","last_ms","span_days","coverage")},
            "best":best}

def resample(a,tf):
    if tf==1:return a
    t=a[:,0].astype(np.int64);bucket=tf*60000
    start=np.flatnonzero(t%bucket==0)
    start=start[start+tf-1<len(a)]
    if not len(start):return np.empty((0,6))
    good=(t[start+tf-1]-t[start])==(tf-1)*60000
    start=start[good]
    if not len(start):return np.empty((0,6))
    b=a[start[:,None]+np.arange(tf)]
    return np.column_stack((a[start,0],a[start,1],b[:,:,2].max(1),b[:,:,3].min(1),a[start+tf-1,4],b[:,:,5].sum(1)))

@njit
def exact_numba(a,idx,side,tp,sl,hold,start,end,cost):
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
            hit=False;px=0.
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

def exact(a,idx,side,tp,sl,hold,start,end,cost=BASE_COST):
    return exact_numba(a,idx,side,tp,sl,hold,start,end,cost)

def deep_screen(a,tf,lo,dev,sel):
    rows=[]
    for s in signals(a,tf):
        for hm in DEEP_SCREEN_HOLD_MIN:
            hold=max(1,round(hm/tf))
            md=metrics(fixed_vec(a,s["idx"],s["side"],hold,lo,dev))
            ms=metrics(fixed_vec(a,s["idx"],s["side"],hold,dev,sel))
            robust=(md["n"]>=80 and ms["n"]>=25 and (md["pf"] or 0)>1.03 and (ms["pf"] or 0)>1.03
                    and (md["avg_net_bps"] or -999)>0 and (ms["avg_net_bps"] or -999)>0)
            sc=min(velocity(md,lo,dev),velocity(ms,dev,sel)) if robust else -999
            rows.append({"sig":s,"hold_min":hm,"dev":md,"selection":ms,"score":sc})
    rows.sort(key=lambda r:(r["score"],r["selection"]["pf"] or -1),reverse=True)
    out=[];seen=set()
    for r in rows:
        k=(r["sig"]["name"],r["sig"]["side"])
        if k in seen:continue
        seen.add(k);out.append(r)
        if len(out)>=2:break
    return out

def deep_select(a,tf,lo,dev,sel):
    best=None
    for r in deep_screen(a,tf,lo,dev,sel):
        if r["score"]<=-999:continue
        s=r["sig"]
        for tp in TPS:
            for sl in SLS:
                for hm in DEEP_SCREEN_HOLD_MIN:
                    hold=max(1,round(hm/tf))
                    rd=exact(a,s["idx"],s["side"],tp,sl,hold,lo,dev)
                    rs=exact(a,s["idx"],s["side"],tp,sl,hold,dev,sel)
                    md=metrics(rd[:,2] if len(rd) else [])
                    ms=metrics(rs[:,2] if len(rs) else [])
                    robust=(md["n"]>=50 and ms["n"]>=18 and (md["pf"] or 0)>1.02 and (ms["pf"] or 0)>1.02
                            and (md["avg_net_bps"] or -999)>0 and (ms["avg_net_bps"] or -999)>0)
                    sc=min(velocity(md,lo,dev),velocity(ms,dev,sel)) if robust else -999
                    rec={"signal":s["name"],"family":s["family"],"detail":s["detail"],"side":s["side"],
                         "idx":s["idx"],"tf_min":tf,"tp":tp,"sl":sl,"hold_min":hm,
                         "dev":md,"selection":ms,"score":sc}
                    if best is None or (sc,ms["pf"] or -1)>(best["score"],best["selection"]["pf"] or -1):
                        best=rec
    return best

def neighbor_rows(a,b,lo,sel,hi):
    tps=list(TPS);sls=list(SLS);hs=list(DEEP_SCREEN_HOLD_MIN)
    ti=tps.index(b["tp"]);si=sls.index(b["sl"]);hi0=hs.index(b["hold_min"])
    cfg=set()
    for d in (-1,0,1):
        if 0<=ti+d<len(tps):cfg.add((tps[ti+d],b["sl"],b["hold_min"]))
        if 0<=si+d<len(sls):cfg.add((b["tp"],sls[si+d],b["hold_min"]))
        if 0<=hi0+d<len(hs):cfg.add((b["tp"],b["sl"],hs[hi0+d]))
    out=[]
    tf=b["tf_min"]
    for tp,sl,hm in sorted(cfg):
        hold=max(1,round(hm/tf))
        tr=exact(a,b["idx"],b["side"],tp,sl,hold,lo,sel)
        oo=exact(a,b["idx"],b["side"],tp,sl,hold,sel,hi)
        out.append({"tp_pct":tp*100,"sl_pct":sl*100,"hold_min":hm,
                    "train_selection":metrics(tr[:,2] if len(tr) else []),
                    "oos":metrics(oo[:,2] if len(oo) else [])})
    return out

def chunks(a,b,start,end,n=3,cost=BASE_COST):
    cuts=[int(start+i*(end-start)/n) for i in range(n+1)];out=[]
    hold=max(1,round(b["hold_min"]/b["tf_min"]))
    for x,y in zip(cuts[:-1],cuts[1:]):
        rr=exact(a,b["idx"],b["side"],b["tp"],b["sl"],hold,x,y,cost)
        out.append({"start_ms":x,"end_ms":y,**metrics(rr[:,2] if len(rr) else [])})
    return out

def deep_one(sym):
    _,a1,info=load_symbol(sym,1)
    if a1 is None or info.get("span_days",0)<60 or info.get("coverage",0)<.94:
        return {"symbol":sym,"status":"SKIP_DEEP","data":info}
    bars={1:a1,3:resample(a1,3),5:resample(a1,5)}
    lo,dev,sel,hi=split_times(a1)
    best=None
    for tf,a in bars.items():
        if len(a)<5000:continue
        # split boundaries are timestamps; valid across resampled bars.
        b=deep_select(a,tf,lo,dev,sel)
        if b is not None and (best is None or (b["score"],b["selection"]["pf"] or -1)>(best["score"],best["selection"]["pf"] or -1)):
            best=b
    if best is None or best["score"]<=-999:
        return {"symbol":sym,"status":"NO_ROBUST_TRAIN","data":{k:info[k] for k in ("bars","span_days","coverage")}}
    a=bars[best["tf_min"]];hold=max(1,round(best["hold_min"]/best["tf_min"]))
    oo=exact(a,best["idx"],best["side"],best["tp"],best["sl"],hold,sel,hi,BASE_COST)
    mo=metrics(oo[:,2] if len(oo) else [])
    stress={}
    for cc in COSTS:
        rr=exact(a,best["idx"],best["side"],best["tp"],best["sl"],hold,sel,hi,cc)
        stress[str(cc)]=metrics(rr[:,2] if len(rr) else [])
    ch=chunks(a,best,sel,hi,3,BASE_COST)
    posq=sum(1 for x in ch if x["avg_net_bps"] is not None and x["avg_net_bps"]>0)
    neigh=neighbor_rows(a,best,lo,sel,hi)
    train_neigh=sum(1 for x in neigh if (x["train_selection"]["pf"] or 0)>1 and (x["train_selection"]["avg_net_bps"] or -999)>0)
    oos_neigh=sum(1 for x in neigh if (x["oos"]["pf"] or 0)>1 and (x["oos"]["avg_net_bps"] or -999)>0)
    passed=bool(mo["n"]>=30 and (mo["pf"] or 0)>=1.25 and (mo["avg_net_bps"] or -999)>0 and
                posq>=2 and (stress[str(.0025)]["pf"] or 0)>1.0 and train_neigh>=max(3,len(neigh)//2))
    return {"symbol":sym,"status":"PASS" if passed else "FAIL",
            "data":{k:info[k] for k in ("bars","first_ms","last_ms","span_days","coverage")},
            "split":{"start_ms":lo,"dev_end_ms":dev,"selection_end_ms":sel,"end_ms":hi},
            "chosen":{"signal":best["signal"],"family":best["family"],"detail":best["detail"],
                      "side":"LONG" if best["side"]==1 else "SHORT","tf_min":best["tf_min"],
                      "tp_pct":best["tp"]*100,"sl_pct":best["sl"]*100,"hold_min":best["hold_min"],
                      "dev":best["dev"],"selection":best["selection"],"train_velocity_score":best["score"]},
            "oos":mo,"oos_chunks":ch,"positive_oos_chunks":posq,
            "cost_stress":stress,"neighbors":neigh,
            "positive_train_neighbors":train_neigh,"positive_oos_neighbors":oos_neigh,
            "oos_records":oo.tolist()}

def compound(events):
    bal=1000.;peak=1000.;dd=0.;wins=0
    for e in events:
        r=e["net"];bal*=1+r;wins+=r>0;peak=max(peak,bal);dd=max(dd,(peak-bal)/peak)
    return {"start_balance":1000.,"final_balance":round(bal,2),
            "return_pct":round((bal/1000-1)*100,3),"trades":len(events),
            "wins":wins,"win_rate_pct":round(100*wins/len(events),3) if events else None,
            "max_closed_equity_drawdown_pct":round(100*dd,3)}

def portfolio(deep,k=5):
    chosen=[r for r in deep if r.get("chosen")]
    chosen.sort(key=lambda x:x["chosen"]["train_velocity_score"],reverse=True)
    chosen=chosen[:k]
    events=[]
    for rank,r in enumerate(chosen):
        for x in r.get("oos_records",[]):
            events.append({"entry_ms":x[0],"exit_ms":x[1],"net":x[2],"rank":rank,"symbol":r["symbol"]})
    events.sort(key=lambda x:(x["entry_ms"],x["rank"]))
    take=[];busy=-1
    for e in events:
        if e["entry_ms"]<busy:continue
        take.append(e);busy=e["exit_ms"]
    return [r["symbol"] for r in chosen],compound(take),take

def main():
    syms=universe()
    print("UNIVERSE",len(syms),flush=True)
    with ThreadPoolExecutor(max_workers=24) as ex:
        loaded=list(ex.map(lambda s:load_symbol(s,5),syms))
    stage1=[]
    for i,item in enumerate(loaded,1):
        r=stage1_one(item);stage1.append(r)
        if i%25==0:print("STAGE1",i,"/",len(loaded),flush=True)
    good=[r for r in stage1 if r["status"]=="CANDIDATE"]
    good.sort(key=lambda r:(r["best"]["score"],r["best"]["selection"]["pf"] or -1),reverse=True)
    shortlist=[r["symbol"] for r in good[:SHORTLIST_N]]
    print("SHORTLIST",json.dumps(shortlist),flush=True)

    # Download/deep-test sequentially to keep memory bounded.
    deep=[]
    for i,s in enumerate(shortlist,1):
        r=deep_one(s);deep.append(r)
        print("DEEP_RESULT "+json.dumps({k:r.get(k) for k in ("symbol","status","chosen","oos","positive_oos_chunks","positive_train_neighbors","positive_oos_neighbors")}),flush=True)
        print("DEEP_PROGRESS",i,"/",len(shortlist),flush=True)
    passed=[r for r in deep if r["status"]=="PASS"]
    top5,port_stats,port_events=portfolio(deep,5)
    report={
      "schema":"allfutures-fast-edge/1.0",
      "window":"2026-04-01 through 2026-09-30 UTC (six completed months)",
      "universe_count":len(syms),
      "stage1_usable":sum(r["status"]!="SKIP" for r in stage1),
      "stage1_candidate_count":len(good),
      "shortlist_count":len(shortlist),"shortlist":shortlist,
      "base_roundtrip_cost_pct":BASE_COST*100,
      "cost_stress_roundtrip_pct":[x*100 for x in COSTS],
      "method":[
        "Research only; no trading state modified.",
        "Stage 1 scans all 525 listed symbols on 5m data using only the first 80% for discovery/selection; final 20% is not read for ranking.",
        "Stage 2 deep-tests the train-only top 30 on 1m/3m/5m and selects one rule per symbol using only development+selection data.",
        "Signal families: multi-horizon impulse continuation/reversal, candle streak continuation/fade, ATR+volume expansion/fade, wick rejection/follow, EMA trend.",
        "Entry at next bar open. Exact bracket uses stop-first same-bar ordering. Holds 5/10/20/40m. TP/SL grid 0.3%-1.5%.",
        "Base execution cost is 0.16% round trip; OOS cost stress also tests 0.25% and 0.35%. Historical funding is not separately joined.",
        "PASS requires OOS PF>=1.25, positive net expectancy, >=30 OOS trades, >=2/3 positive OOS chunks, PF>1 at 0.25% cost, and a positive train parameter neighborhood.",
        "The top-5 portfolio is selected strictly by pre-OOS train velocity score; it rotates 100% of $1,000 into one position at a time with no leverage and skips overlap. Drawdown is closed-equity only."
      ],
      "train_top5_symbols":top5,
      "oos_top5_portfolio":port_stats,
      "oos_top5_portfolio_events":port_events,
      "pass_count":len(passed),"passed_symbols":[r["symbol"] for r in passed],
      "passes":[{k:r[k] for k in ("symbol","chosen","oos","oos_chunks","cost_stress","positive_train_neighbors","positive_oos_neighbors")} for r in passed],
      "deep_results":deep,
      "stage1_top50":[{"symbol":r["symbol"],"best":r["best"]} for r in good[:50]],
      "stage1_status_counts":{s:sum(r["status"]==s for r in stage1) for s in sorted(set(r["status"] for r in stage1))}
    }
    out=ROOT/"research-output";out.mkdir(exist_ok=True)
    (out/"allfutures-fast-edge-6m.json").write_text(json.dumps(report,indent=2,allow_nan=False))
    print("FAST_EDGE_SUMMARY "+json.dumps({
      "universe":len(syms),"stage1_usable":report["stage1_usable"],"stage1_candidates":len(good),
      "shortlist":shortlist,"train_top5":top5,"oos_top5_portfolio":port_stats,
      "pass_count":len(passed),"passed_symbols":[r["symbol"] for r in passed],
      "passes":[{"symbol":r["symbol"],"chosen":r["chosen"],"oos":r["oos"],"cost_stress":r["cost_stress"]} for r in passed]
    }),flush=True)

if __name__=="__main__":
    main()

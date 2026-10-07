"""EMA200 + RSI14 + liquidity-sweep rejection on 5m BTC/ETH.

Research-only backtest of the user's proposed confluence strategy.
No paper/live state is modified.

Primary interpretation:
LONG:
  close > EMA200
  current 5m bar pulls back to within a configurable ATR distance of EMA200
  previous RSI14 <= oversold threshold and current RSI14 turns upward
  current low sweeps the prior N-bar low and closes back above that low
  green rejection candle with lower wick/body >= configured ratio
SHORT: exact mirror.

Entry: next 5m bar open.
Stop: trigger low/high +/- ATR buffer.
Target: fixed R multiple.
Time exit: configurable maximum hold.
Same-bar TP/SL conflict: stop first.
Costs: 0.16% round trip base; 0.25% stress.
"""
import csv,io,json,hashlib,urllib.request,urllib.error,urllib.parse,zipfile
from pathlib import Path
from datetime import datetime,timezone
from itertools import product
import numpy as np
from numba import njit

ROOT=Path(__file__).resolve().parents[2]
SYMS=["BTCUSDT","ETHUSDT"]
START_DT=datetime(2023,10,8,tzinfo=timezone.utc)
END_DT=datetime(2026,10,7,tzinfo=timezone.utc)
START=int(START_DT.timestamp()*1000);END=int(END_DT.timestamp()*1000)
BASE="https://data.binance.vision/data/futures/um"
UA={"User-Agent":"spacehub-ema-rsi-sweep/1.0"}
BASE_COST=.0016
STRESS_COST=.0025

RSI_LEVELS=(25,30,35)
PROX_ATR=(0.25,0.50,0.75)
SWEEP_N=(10,20,30)
WICK_RATIOS=(1.5,2.0)
STOP_BUFFERS=(0.05,0.15)
RRS=(1.0,1.5,2.0)
HOLDS=(24,48,96)  # 2h/4h/8h on 5m
DEFAULT={"rsi":30,"prox_atr":.5,"sweep_n":20,"wick_ratio":2.0,"stop_buffer":.15,"rr":1.5,"hold":48}

def ym_iter(a,b):
    y,m=a.year,a.month
    while (y,m)<=(b.year,b.month):
        yield y,m
        m+=1
        if m==13:y+=1;m=1

def fetch_zip(url):
    try:
        req=urllib.request.Request(url,headers=UA)
        with urllib.request.urlopen(req,timeout=35) as r:raw=r.read()
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            txt=z.read(z.namelist()[0]).decode()
        return txt,hashlib.sha256(raw).hexdigest()
    except urllib.error.HTTPError as e:
        if e.code==404:return None,None
        raise

def parse_rows(txt):
    out=[]
    if not txt:return out
    for r in csv.reader(io.StringIO(txt)):
        if not r or not r[0].isdigit():continue
        t=int(r[0]);t=t//1000 if t>10**14 else t
        if START<=t<END:
            out.append((t,float(r[1]),float(r[2]),float(r[3]),float(r[4]),float(r[5])))
    return out

def load(sym):
    q=urllib.parse.quote(sym,safe="")
    rows=[];manifest=[]
    # Completed months through 2026-09.
    for y,m in ym_iter(START_DT,datetime(2026,9,1,tzinfo=timezone.utc)):
        url=f"{BASE}/monthly/klines/{q}/5m/{q}-5m-{y}-{m:02d}.zip"
        txt,sha=fetch_zip(url);a=parse_rows(txt);rows+=a
        manifest.append({"url":url,"sha256":sha,"rows":len(a),"missing":txt is None})
    # 2026-10 partial daily.
    for d in range(1,7):
        url=f"{BASE}/daily/klines/{q}/5m/{q}-5m-2026-10-{d:02d}.zip"
        txt,sha=fetch_zip(url);a=parse_rows(txt);rows+=a
        manifest.append({"url":url,"sha256":sha,"rows":len(a),"missing":txt is None})
    rows=sorted({x[0]:x for x in rows}.values())
    a=np.asarray(rows,float)
    if not len(a):return None,{"error":"no_data","manifest":manifest}
    t=a[:,0].astype(np.int64)
    expected=max(1,(t[-1]-t[0])//300000+1)
    return a,{"bars":len(a),"first_ms":int(t[0]),"last_ms":int(t[-1]),
              "coverage":len(a)/expected,"manifest":manifest}

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
    out=np.full(len(a),np.nan);tr=np.zeros(len(a))
    if len(a)<=n:return out
    tr[0]=a[0,2]-a[0,3]
    for i in range(1,len(a)):
        tr[i]=max(a[i,2]-a[i,3],abs(a[i,2]-a[i-1,4]),abs(a[i,3]-a[i-1,4]))
    v=np.mean(tr[1:n+1]);out[n]=v
    for i in range(n+1,len(a)):
        v=(v*(n-1)+tr[i])/n;out[i]=v
    return out

def rolling_prev_min(x,n):
    out=np.full(len(x),np.nan)
    from collections import deque
    q=deque()
    for i in range(len(x)):
        # q holds indices from [i-n, i-1]
        while q and q[0]<i-n:q.popleft()
        if i>=n and q:out[i]=x[q[0]]
        while q and x[q[-1]]>=x[i]:q.pop()
        q.append(i)
    return out

def rolling_prev_max(x,n):
    out=np.full(len(x),np.nan)
    from collections import deque
    q=deque()
    for i in range(len(x)):
        while q and q[0]<i-n:q.popleft()
        if i>=n and q:out[i]=x[q[0]]
        while q and x[q[-1]]<=x[i]:q.pop()
        q.append(i)
    return out

def features(a):
    o,h,l,c=a[:,1],a[:,2],a[:,3],a[:,4]
    e=ema(c,200);r=rsi(c,14);at=atr(a,14)
    prevmins={n:rolling_prev_min(l,n) for n in SWEEP_N}
    prevmaxs={n:rolling_prev_max(h,n) for n in SWEEP_N}
    body=np.abs(c-o)
    lower=np.minimum(o,c)-l
    upper=h-np.maximum(o,c)
    # Avoid unstable infinite wick/body ratios on doji; ATR floor defines a real body denominator.
    denom=np.maximum(body,.05*at)
    return {"ema":e,"rsi":r,"atr":at,"prevmins":prevmins,"prevmaxs":prevmaxs,
            "body":body,"lower":lower,"upper":upper,"denom":denom}

def signal_idx(a,f,rsi_level,prox_atr,sweep_n,wick_ratio,side):
    o,h,l,c=a[:,1],a[:,2],a[:,3],a[:,4]
    e,r,at=f["ema"],f["rsi"],f["atr"]
    valid=np.isfinite(e)&np.isfinite(r)&np.isfinite(at)&(at>0)
    prev_r=np.r_[np.nan,r[:-1]]
    if side==1:
        lvl=f["prevmins"][sweep_n]
        trend=c>e
        prox=l<=e+prox_atr*at
        rturn=(prev_r<=rsi_level)&(r>prev_r)
        sweep=np.isfinite(lvl)&(l<lvl)&(c>lvl)
        candle=(c>o)&(f["lower"]>=wick_ratio*f["denom"])
        m=valid&trend&prox&rturn&sweep&candle
    else:
        lvl=f["prevmaxs"][sweep_n]
        trend=c<e
        prox=h>=e-prox_atr*at
        rturn=(prev_r>=100-rsi_level)&(r<prev_r)
        sweep=np.isfinite(lvl)&(h>lvl)&(c<lvl)
        candle=(c<o)&(f["upper"]>=wick_ratio*f["denom"])
        m=valid&trend&prox&rturn&sweep&candle
    idx=np.flatnonzero(m)
    return idx[idx+1<len(a)].astype(np.int64)

@njit
def simulate(a,atrv,idx,side,buffer_atr,rr,hold,start,end,cost):
    tmp=np.empty((len(idx),5),np.float64) # entry_ts,exit_ts,net,risk_pct,exit_reason(1 tp,-1 sl,0 time)
    n=0;last_exit=-1
    boundary=np.searchsorted(a[:,0],end)
    for kk in range(len(idx)):
        sig=int(idx[kk]);j0=sig+1
        if j0<=last_exit or j0>=boundary:continue
        ts=a[j0,0]
        if ts<start or ts>=end:continue
        e=a[j0,1]
        if side>0:
            stop=a[sig,3]-buffer_atr*atrv[sig]
            risk=e-stop
            if risk<=0:continue
            target=e+rr*risk
        else:
            stop=a[sig,2]+buffer_atr*atrv[sig]
            risk=stop-e
            if risk<=0:continue
            target=e-rr*risk
        if risk/e>.03:continue # reject pathological >3% stop on 5m
        lim=min(boundary,j0+hold)
        done=False
        for j in range(j0,lim):
            oo=a[j,1];hi=a[j,2];lo=a[j,3]
            if side>0:
                if oo<=stop:px=oo;reason=-1;done=True
                elif oo>=target:px=target;reason=1;done=True
                elif lo<=stop:px=stop;reason=-1;done=True
                elif hi>=target:px=target;reason=1;done=True
                else:continue
            else:
                if oo>=stop:px=oo;reason=-1;done=True
                elif oo<=target:px=target;reason=1;done=True
                elif hi>=stop:px=stop;reason=-1;done=True
                elif lo<=target:px=target;reason=1;done=True
                else:continue
            net=side*(px/e-1)-cost
            tmp[n,0]=ts;tmp[n,1]=a[j,0];tmp[n,2]=net;tmp[n,3]=risk/e;tmp[n,4]=reason
            n+=1;last_exit=j;break
        if not done and j0+hold<=boundary:
            j=j0+hold-1;px=a[j,4];net=side*(px/e-1)-cost
            tmp[n,0]=ts;tmp[n,1]=a[j,0];tmp[n,2]=net;tmp[n,3]=risk/e;tmp[n,4]=0
            n+=1;last_exit=j
    return tmp[:n]

def metrics(rec):
    if rec is None or len(rec)==0:
        return {"n":0,"wins":0,"win_rate_pct":None,"pf":None,"avg_net_bps":None,"sum_net_pct":0,
                "avg_risk_pct":None,"tp":0,"sl":0,"time":0}
    v=rec[:,2];pos=float(v[v>0].sum());neg=float(-v[v<0].sum());wins=int((v>0).sum())
    return {"n":len(v),"wins":wins,"win_rate_pct":round(100*wins/len(v),3),
            "pf":round(pos/neg,4) if neg else None,
            "avg_net_bps":round(float(v.mean())*10000,4),
            "sum_net_pct":round(float(v.sum())*100,4),
            "avg_risk_pct":round(100*float(rec[:,3].mean()),4),
            "tp":int((rec[:,4]==1).sum()),"sl":int((rec[:,4]==-1).sum()),"time":int((rec[:,4]==0).sum())}

def split_times(a):
    lo=int(a[0,0]);hi=int(a[-1,0])+300000;span=hi-lo
    dev=lo+int(.60*span);sel=lo+int(.80*span)
    return lo,dev,sel,hi

def quality(m,start,end):
    if m["n"]<=0 or m["avg_net_bps"] is None:return -999
    days=max(1,(end-start)/86400000)
    return (m["avg_net_bps"]/10000)*m["n"]/days

def config_key(c):
    return (c["rsi"],c["prox_atr"],c["sweep_n"],c["wick_ratio"],c["stop_buffer"],c["rr"],c["hold"])

def eval_config(a,f,c,lo,dev,sel,hi,cost=BASE_COST):
    all_parts={}
    for side,name in ((1,"long"),(-1,"short")):
        idx=signal_idx(a,f,c["rsi"],c["prox_atr"],c["sweep_n"],c["wick_ratio"],side)
        d=simulate(a,f["atr"],idx,side,c["stop_buffer"],c["rr"],c["hold"],lo,dev,cost)
        s=simulate(a,f["atr"],idx,side,c["stop_buffer"],c["rr"],c["hold"],dev,sel,cost)
        o=simulate(a,f["atr"],idx,side,c["stop_buffer"],c["rr"],c["hold"],sel,hi,cost)
        all_parts[name]={"idx":idx,"dev_rec":d,"sel_rec":s,"oos_rec":o,
                         "dev":metrics(d),"selection":metrics(s),"oos":metrics(o)}
    def cat(k):
        xs=[all_parts["long"][k],all_parts["short"][k]]
        xs=[x for x in xs if len(x)]
        if not xs:return np.empty((0,5))
        z=np.vstack(xs);z=z[np.argsort(z[:,0])]
        # combine directions as one sequential strategy: skip overlaps globally
        keep=[];busy=-1
        for r in z:
            if r[0]<busy:continue
            keep.append(r);busy=r[1]
        return np.asarray(keep,float) if keep else np.empty((0,5))
    dr,sr,orr=cat("dev_rec"),cat("sel_rec"),cat("oos_rec")
    return {"config":c,"dev":metrics(dr),"selection":metrics(sr),"oos":metrics(orr),
            "dev_rec":dr,"sel_rec":sr,"oos_rec":orr,
            "long":{"dev":all_parts["long"]["dev"],"selection":all_parts["long"]["selection"],"oos":all_parts["long"]["oos"]},
            "short":{"dev":all_parts["short"]["dev"],"selection":all_parts["short"]["selection"],"oos":all_parts["short"]["oos"]}}

def chunks(rec,n=3):
    if rec is None or len(rec)==0:return []
    idx=np.array_split(np.arange(len(rec)),n)
    return [metrics(rec[ix]) if len(ix) else metrics(np.empty((0,5))) for ix in idx]

def comp(rec,start=1000.):
    bal=start;peak=bal;dd=0.
    for r in rec:
        bal*=1+r[2];peak=max(peak,bal);dd=max(dd,(peak-bal)/peak)
    return {"start_balance":start,"final_balance":round(bal,2),
            "return_pct":round((bal/start-1)*100,3),
            "max_closed_equity_drawdown_pct":round(dd*100,3)}

def select_on_train(a,f,lo,dev,sel,hi):
    ranked=[]
    configs=[]
    for vals in product(RSI_LEVELS,PROX_ATR,SWEEP_N,WICK_RATIOS,STOP_BUFFERS,RRS,HOLDS):
        c=dict(zip(("rsi","prox_atr","sweep_n","wick_ratio","stop_buffer","rr","hold"),vals))
        e=eval_config(a,f,c,lo,dev,sel,hi,BASE_COST)
        md,ms=e["dev"],e["selection"]
        robust=(md["n"]>=18 and ms["n"]>=8 and (md["pf"] or 0)>1.0 and (ms["pf"] or 0)>1.0
                and (md["avg_net_bps"] or -999)>0 and (ms["avg_net_bps"] or -999)>0)
        score=min(quality(md,lo,dev),quality(ms,dev,sel)) if robust else -999
        ranked.append({"config":c,"dev":md,"selection":ms,"score":score,
                       "long":{"dev":e["long"]["dev"],"selection":e["long"]["selection"]},
                       "short":{"dev":e["short"]["dev"],"selection":e["short"]["selection"]}})
    ranked.sort(key=lambda x:(x["score"],x["selection"]["pf"] or -1,x["selection"]["avg_net_bps"] or -999),reverse=True)
    return ranked

def neighbors(c):
    out=[]
    grids={"rsi":RSI_LEVELS,"prox_atr":PROX_ATR,"sweep_n":SWEEP_N,"wick_ratio":WICK_RATIOS,
           "stop_buffer":STOP_BUFFERS,"rr":RRS,"hold":HOLDS}
    for k,g in grids.items():
        i=list(g).index(c[k])
        for j in (i-1,i+1):
            if 0<=j<len(g):
                d=c.copy();d[k]=g[j];out.append(d)
    # unique
    seen=set();z=[]
    for x in out:
        key=config_key(x)
        if key not in seen:seen.add(key);z.append(x)
    return z

def run_symbol(sym,a,info):
    f=features(a);lo,dev,sel,hi=split_times(a)
    ranked=select_on_train(a,f,lo,dev,sel,hi)
    best=ranked[0] if ranked else None
    default=eval_config(a,f,DEFAULT.copy(),lo,dev,sel,hi,BASE_COST)
    default_stress=eval_config(a,f,DEFAULT.copy(),lo,dev,sel,hi,STRESS_COST)
    if best is None or best["score"]<=-999:
        return {"symbol":sym,"status":"NO_ROBUST_TRAIN","data":info,
                "default":{"config":DEFAULT,"dev":default["dev"],"selection":default["selection"],
                           "oos":default["oos"],"oos_stress_025":default_stress["oos"]},
                "train_top":ranked[:20]}
    full=eval_config(a,f,best["config"],lo,dev,sel,hi,BASE_COST)
    stress=eval_config(a,f,best["config"],lo,dev,sel,hi,STRESS_COST)
    ch=chunks(full["oos_rec"],3);posch=sum(1 for x in ch if (x["avg_net_bps"] or -999)>0)
    neigh=[]
    for c in neighbors(best["config"]):
        e=eval_config(a,f,c,lo,dev,sel,hi,BASE_COST)
        neigh.append({"config":c,"train_selection":metrics(np.vstack([e["dev_rec"],e["sel_rec"]]) if len(e["dev_rec"])+len(e["sel_rec"]) else np.empty((0,5))),
                      "oos":e["oos"]})
    train_neigh=sum(1 for x in neigh if (x["train_selection"]["pf"] or 0)>1 and (x["train_selection"]["avg_net_bps"] or -999)>0)
    oos_neigh=sum(1 for x in neigh if (x["oos"]["pf"] or 0)>1 and (x["oos"]["avg_net_bps"] or -999)>0)
    mo=full["oos"];ms=stress["oos"]
    passed=bool(mo["n"]>=15 and (mo["pf"] or 0)>=1.15 and (mo["avg_net_bps"] or -999)>0 and
                posch>=2 and (ms["pf"] or 0)>1.0 and train_neigh>=max(3,len(neigh)//2))
    return {"symbol":sym,"status":"PASS" if passed else "FAIL","data":info,
            "split":{"start_ms":lo,"dev_end_ms":dev,"selection_end_ms":sel,"end_ms":hi},
            "chosen":{"config":best["config"],"dev":full["dev"],"selection":full["selection"],
                      "oos":mo,"long":full["long"],"short":full["short"],"train_score":best["score"]},
            "oos_stress_025":ms,"oos_chunks":ch,"positive_oos_chunks":posch,
            "neighbors":neigh,"positive_train_neighbors":train_neigh,"positive_oos_neighbors":oos_neigh,
            "oos_compound_1000":comp(full["oos_rec"]),
            "default":{"config":DEFAULT,"dev":default["dev"],"selection":default["selection"],
                       "oos":default["oos"],"oos_stress_025":default_stress["oos"],
                       "oos_compound_1000":comp(default["oos_rec"])},
            "train_top":ranked[:20]}

def pooled_train_selected(results):
    # one rule per asset chosen before OOS; merge OOS events, one position at a time.
    events=[]
    for rank,r in enumerate(results):
        if not r.get("chosen"):continue
        # records are not serialized in run_symbol, so rebuild not available here.
    return None

def main():
    loaded=[]
    for s in SYMS:
        a,info=load(s)
        print("LOADED",s,0 if a is None else len(a),round(info.get("coverage",0),4),flush=True)
        if a is None:raise RuntimeError(s+" no data")
        loaded.append((s,a,info))
    results=[]
    for s,a,info in loaded:
        r=run_symbol(s,a,info);results.append(r)
        print("SYMBOL_RESULT "+json.dumps({
            "symbol":s,"status":r["status"],"chosen":r.get("chosen"),
            "oos_stress_025":r.get("oos_stress_025"),"default":r.get("default"),
            "positive_oos_chunks":r.get("positive_oos_chunks"),
            "positive_train_neighbors":r.get("positive_train_neighbors"),
            "positive_oos_neighbors":r.get("positive_oos_neighbors")
        }),flush=True)
    passed=[r for r in results if r["status"]=="PASS"]
    report={
      "schema":"ema200-rsi14-liquidity-sweep-5m/1.0",
      "window":{"start":START_DT.isoformat(),"end_exclusive":END_DT.isoformat()},
      "symbols":SYMS,"base_roundtrip_cost_pct":BASE_COST*100,"stress_roundtrip_cost_pct":STRESS_COST*100,
      "primary_rule":{
        "long":"close>EMA200; bar pulls within prox_atr*ATR14 of EMA; prior RSI14<=threshold and current RSI turns up; low sweeps prior N-bar low and closes back above it; green rejection bar with lower wick/body ratio; enter next open",
        "short":"mirror of long below EMA200",
        "stop":"trigger low/high +/- ATR buffer",
        "target":"fixed reward:risk multiple",
        "same_bar_conflict":"stop first",
        "time_exit":"2h/4h/8h grid"
      },
      "default_config":DEFAULT,
      "parameter_grid":{"rsi":RSI_LEVELS,"prox_atr":PROX_ATR,"sweep_n":SWEEP_N,
                        "wick_ratio":WICK_RATIOS,"stop_buffer_atr":STOP_BUFFERS,
                        "rr":RRS,"hold_bars_5m":HOLDS},
      "method":[
        "Three-year Binance USD-M 5m archives for BTCUSDT and ETHUSDT.",
        "Chronological split 60% development / 20% selection / 20% OOS validation.",
        "Only development+selection can select parameters. OOS is read after one configuration per symbol is frozen.",
        "All entries occur at the next 5m open after the complete trigger candle; no same-bar signal fill.",
        "Base round-trip drag 0.16%; OOS stress 0.25%. Funding is not separately joined because intended holding is intraday.",
        "PASS requires positive OOS expectancy, PF>=1.15, >=15 OOS trades, >=2/3 positive OOS chunks, PF>1 at 0.25% stress, and a positive train parameter neighborhood.",
        "The default configuration tests the user's stated RSI30/70, EMA200, sweep/rejection, 1:1.5 concept with explicit numerical definitions."
      ],
      "pass_count":len(passed),"passed_symbols":[r["symbol"] for r in passed],
      "results":results
    }
    out=ROOT/"research-output";out.mkdir(exist_ok=True)
    (out/"ema200-rsi-sweep-5m-3y.json").write_text(json.dumps(report,indent=2,allow_nan=False))
    print("EMA_RSI_SWEEP_SUMMARY "+json.dumps({
      "pass_count":len(passed),"passed_symbols":[r["symbol"] for r in passed],
      "results":[{"symbol":r["symbol"],"status":r["status"],"chosen":r.get("chosen"),
                  "oos_stress_025":r.get("oos_stress_025"),"default":r.get("default")} for r in results]
    }),flush=True)

if __name__=="__main__":
    main()

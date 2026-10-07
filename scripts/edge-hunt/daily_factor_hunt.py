"""Broad daily factor hunt on liquid Binance USD-M perpetuals. Research only."""
import json, math, urllib.request, urllib.error, time, io, zipfile, csv
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import numpy as np

START=1696723200000          # 2023-10-08 UTC
SPLIT=1759795200000          # 2025-10-07 UTC
END=1791331200000            # 2026-10-07 UTC exclusive
COST=.0016
UNIVERSE=[
"BTCUSDT","ETHUSDT","SOLUSDT","ZECUSDT","XRPUSDT","NEARUSDT","DOGEUSDT","SANDUSDT","UNIUSDT","SUIUSDT",
"BNBUSDT","NMRUSDT","QNTUSDT","AVAXUSDT","ADAUSDT","WLDUSDT","RLCUSDT","1000PEPEUSDT","LINKUSDT","GTCUSDT",
"FILUSDT","AAVEUSDT","INJUSDT","MINAUSDT","ARBUSDT","LTCUSDT","BCHUSDT","FETUSDT","DOTUSDT","XLMUSDT"
]

BASE="https://data.binance.vision/data/futures/um"
LOAD=START-60*86400000

def read_zip(url):
    last=None
    for k in range(3):
        try:
            req=urllib.request.Request(url,headers={"User-Agent":"spacehub-edge-research/1.1"})
            with urllib.request.urlopen(req,timeout=30) as r:raw=r.read()
            with zipfile.ZipFile(io.BytesIO(raw)) as z:return z.read(z.namelist()[0]).decode()
        except urllib.error.HTTPError as e:
            if e.code==404:return None
            last=e
        except Exception as e:last=e
        time.sleep(1+k)
    raise last

def fetch(sym):
    rows=[]
    y,m=2023,8
    while (y,m)<=(2026,9):
        url=f"{BASE}/monthly/klines/{sym}/1d/{sym}-1d-{y}-{m:02d}.zip"
        txt=read_zip(url)
        if txt:
            for r in csv.reader(io.StringIO(txt)):
                if not r or not r[0].isdigit():continue
                t=int(r[0]);t=t//1000 if t>10**14 else t
                if LOAD<=t<END:rows.append((t,float(r[1]),float(r[2]),float(r[3]),float(r[4]),float(r[7])))
        m+=1
        if m==13:y+=1;m=1
    for day in range(1,7):
        url=f"{BASE}/daily/klines/{sym}/1d/{sym}-1d-2026-10-{day:02d}.zip"
        txt=read_zip(url)
        if txt:
            for r in csv.reader(io.StringIO(txt)):
                if r and r[0].isdigit():
                    t=int(r[0]);t=t//1000 if t>10**14 else t
                    if LOAD<=t<END:rows.append((t,float(r[1]),float(r[2]),float(r[3]),float(r[4]),float(r[7])))
    rows=sorted({x[0]:x for x in rows}.values())
    a=np.array(rows,float)
    inwin=a[(a[:,0]>=START)&(a[:,0]<END)]
    if len(inwin)<900:raise RuntimeError(f"{sym}: only {len(inwin)} daily bars")
    return a

def metrics(v):
    a=np.asarray(v,float);a=a[np.isfinite(a)]
    n=len(a)
    if not n:return {"n":0,"wins":0,"wr":None,"pf":None,"avg_net_bps":None,"sum_net_pct":0}
    pos=float(a[a>0].sum());neg=float(-a[a<0].sum());wins=int((a>0).sum())
    return {"n":n,"wins":wins,"wr":round(100*wins/n,3),"pf":round(pos/neg,4) if neg else None,
            "avg_net_bps":round(10000*float(a.mean()),4),"sum_net_pct":round(100*float(a.sum()),4)}

def portfolio_metrics(v):
    a=np.asarray(v,float);a=a[np.isfinite(a)]
    if not len(a):return {"n_days":0}
    eq=np.cumprod(1+a);peak=np.maximum.accumulate(eq);dd=eq/peak-1
    years=len(a)/365.25;cagr=float(eq[-1]**(1/years)-1) if years>0 and eq[-1]>0 else None
    annvol=float(a.std(ddof=1)*np.sqrt(365.25)) if len(a)>1 else None
    sharpe=float(a.mean()/a.std(ddof=1)*np.sqrt(365.25)) if len(a)>1 and a.std(ddof=1)>0 else None
    pos=float(a[a>0].sum());neg=float(-a[a<0].sum())
    return {"n_days":len(a),"positive_days":int((a>0).sum()),"win_days_pct":round(100*float((a>0).mean()),3),
            "avg_bps_day":round(10000*float(a.mean()),4),"compound_pct":round(100*float(eq[-1]-1),3),
            "cagr_pct":round(100*cagr,3) if cagr is not None else None,
            "max_dd_pct":round(100*float(dd.min()),3),"sharpe":round(sharpe,3) if sharpe is not None else None,
            "daily_pf":round(pos/neg,4) if neg else None}

def qtile(x,q):
    x=np.asarray(x,float);x=x[np.isfinite(x)]
    return float(np.quantile(x,q)) if len(x) else np.nan

def trade_candidate(data,L,H,q,mode,volume_gate=False,breakout=None):
    tr=[];va=[]
    for sym,a in data.items():
        if len(a)<L+H+3:continue
        last=-1
        # train-only threshold per symbol
        if breakout is None:
            rr=np.full(len(a),np.nan);rr[L:]=a[L:,4]/a[:-L,4]-1
            train_rr=rr[(a[:,0]>=START)&(a[:,0]<SPLIT)]
            thr=qtile(train_rr,q if mode in ("LONG","FADE_LOSERS_LONG") else 1-q)
        vol=a[:,5]
        vm=np.full(len(a),np.nan)
        if len(a)>20:
            for i in range(20,len(a)):vm[i]=np.mean(vol[i-20:i])
        for i in range(max(L,20 if volume_gate else L),len(a)-H-1):
            if i<=last:continue
            if breakout is not None:
                n=breakout
                if i<n:continue
                hi=np.max(a[i-n:i,2]);lo=np.min(a[i-n:i,3])
                sig=a[i,4]>hi if mode=="LONG" else a[i,4]<lo
            else:
                x=a[i,4]/a[i-L,4]-1
                if mode=="LONG":sig=x>=thr
                elif mode=="SHORT":sig=x<=thr
                elif mode=="FADE_WINNERS_SHORT":sig=x>=thr
                else:sig=x<=thr
            if not sig:continue
            if volume_gate and not (np.isfinite(vm[i]) and vol[i]>=1.5*vm[i]):continue
            e=a[i+1,1];x=a[i+H,4]
            side=1 if mode in ("LONG","FADE_LOSERS_LONG") else -1
            net=side*(x/e-1)-COST
            ets=int(a[i+1,0]);xts=int(a[i+H,0])
            if ets<SPLIT and xts<SPLIT:tr.append(net)
            elif ets>=SPLIT and xts<END:va.append(net)
            last=i+H
    return metrics(tr),metrics(va)

def screen_trade_families(data):
    candidates=[]
    # Time-series tails and reversal tails
    for L in (1,2,3,5,7,14,28,56):
      for H in (1,2,3,5,7,14):
       for q in (.5,.667,.8):
        for mode in ("LONG","SHORT","FADE_WINNERS_SHORT","FADE_LOSERS_LONG"):
            mt,_=trade_candidate(data,L,H,q,mode,False,None)
            if mt["n"]>=300:candidates.append({"family":"tail","L":L,"H":H,"q":q,"mode":mode,"train":mt})
    # Volume conditioned
    for L in (1,3,7,14,28):
      for H in (1,3,5,7):
       for q in (.667,.8):
        for mode in ("LONG","SHORT","FADE_WINNERS_SHORT","FADE_LOSERS_LONG"):
            mt,_=trade_candidate(data,L,H,q,mode,True,None)
            if mt["n"]>=250:candidates.append({"family":"volume_tail","L":L,"H":H,"q":q,"mode":mode,"train":mt})
    # Donchian
    for N in (5,10,20,40,60):
      for H in (1,3,5,7,14):
       for mode in ("LONG","SHORT"):
            mt,_=trade_candidate(data,1,H,.5,mode,False,N)
            if mt["n"]>=250:candidates.append({"family":"breakout","N":N,"H":H,"mode":mode,"train":mt})
    candidates.sort(key=lambda z:((z["train"]["pf"] or 0),z["train"]["avg_net_bps"] or -999),reverse=True)
    # Freeze top train candidates only, then validation
    finalists=[]
    for c in candidates[:60]:
        if c["family"]=="breakout":
            mt,mv=trade_candidate(data,1,c["H"],.5,c["mode"],False,c["N"])
        else:
            mt,mv=trade_candidate(data,c["L"],c["H"],c["q"],c["mode"],c["family"]=="volume_tail",None)
        d={**c,"train":mt,"validation":mv}
        d["eligible"]=bool(mt["n"]>=300 and mv["n"]>=150 and (mt["pf"] or 0)>1.10 and (mv["pf"] or 0)>1.10 and
                           (mt["avg_net_bps"] or -999)>0 and (mv["avg_net_bps"] or -999)>0)
        finalists.append(d)
    return candidates[:60],finalists

def cross_section_panel(data):
    # common daily closes/opens; missing symbols are simply excluded that day
    by={}
    for sym,a in data.items():
        for row in a:
            t=int(row[0]);by.setdefault(t,{})[sym]=row
    times=sorted(t for t in by if START<=t<END)
    return times,by

def cs_strategy(times,by,L,H,leg,q=.2,volume_filter=False):
    # Rebalance every H days to avoid overlap; train and validation reset independently.
    out={"train":[],"validation":[]}
    for period,lo,hi in (("train",START,SPLIT),("validation",SPLIT,END)):
        pts=[t for t in times if lo<=t<hi]
        if not pts:continue
        index={t:i for i,t in enumerate(times)}
        last_exit=-1
        for t in pts:
            i=index[t]
            if i<=last_exit or i-L<0 or i+H>=len(times):continue
            t0=times[i-L];te=times[i+1];tx=times[i+H]
            if te<lo or tx>=hi:continue
            rows=[]
            for s,row in by[t].items():
                if s not in by.get(t0,{}) or s not in by.get(te,{}) or s not in by.get(tx,{}):continue
                past=row[4]/by[t0][s][4]-1
                volok=True
                if volume_filter:
                    hist=[]
                    for j in range(max(0,i-20),i):
                        tj=times[j]
                        if s in by.get(tj,{}):hist.append(by[tj][s][5])
                    volok=len(hist)>=10 and row[5]>=1.5*np.mean(hist)
                if volok:rows.append((s,past))
            if len(rows)<10:continue
            rows.sort(key=lambda x:x[1]);k=max(1,int(len(rows)*q))
            bottom=[s for s,_ in rows[:k]];top=[s for s,_ in rows[-k:]]
            def legret(names,side):
                rr=[]
                for s in names:
                    e=by[te][s][1];x=by[tx][s][4]
                    rr.append(side*(x/e-1)-COST)
                return float(np.mean(rr)) if rr else np.nan
            if leg=="WINNERS_LONG":r=legret(top,1)
            elif leg=="LOSERS_LONG":r=legret(bottom,1)
            elif leg=="WINNERS_SHORT":r=legret(top,-1)
            elif leg=="LOSERS_SHORT":r=legret(bottom,-1)
            else:r=.5*(legret(top,1)+legret(bottom,-1))
            if np.isfinite(r):out[period].append(r)
            last_exit=i+H
    return portfolio_metrics(out["train"]),portfolio_metrics(out["validation"])

def market_timing(data,times,by):
    btc=data["BTCUSDT"];lookup={int(r[0]):r for r in btc}
    cands=[]
    for L in (7,14,28,56):
      for H in (1,3,5,7):
       for q in (.5,.667,.8):
        rr=[];trainvals=[]
        for i,t in enumerate(times):
            if i<L or t not in lookup or times[i-L] not in lookup:continue
            r=lookup[t][4]/lookup[times[i-L]][4]-1
            if START<=t<SPLIT:trainvals.append(r)
        thr=qtile(trainvals,q)
        for basket in ("ALL_LONG","TOP20_LONG"):
          p={"train":[],"validation":[]}
          for period,lo,hi in (("train",START,SPLIT),("validation",SPLIT,END)):
            last=-1
            for i,t in enumerate(times):
                if not(lo<=t<hi) or i<L or i<=last or i+H>=len(times):continue
                if t not in lookup or times[i-L] not in lookup:continue
                rbtc=lookup[t][4]/lookup[times[i-L]][4]-1
                if rbtc<thr:continue
                te=times[i+1];tx=times[i+H]
                if te<lo or tx>=hi:continue
                avail=[s for s in by[t] if s in by.get(te,{}) and s in by.get(tx,{}) and s!="BTCUSDT"]
                if len(avail)<10:continue
                if basket=="TOP20_LONG":
                    ranks=[]
                    t0=times[i-L]
                    for s in avail:
                        if s in by.get(t0,{}):ranks.append((s,by[t][s][4]/by[t0][s][4]-1))
                    ranks.sort(key=lambda x:x[1]);k=max(1,len(ranks)//5);avail=[s for s,_ in ranks[-k:]]
                vals=[by[tx][s][4]/by[te][s][1]-1-COST for s in avail]
                if vals:p[period].append(float(np.mean(vals)));last=i+H
          mt=portfolio_metrics(p["train"]);mv=portfolio_metrics(p["validation"])
          cands.append({"family":"btc_market_timing","L":L,"H":H,"q":q,"basket":basket,"train":mt,"validation":mv,
                        "eligible":bool(mt.get("cagr_pct", -999)>0 and mv.get("cagr_pct",-999)>0 and
                                        mt.get("max_dd_pct",-100)>-40 and mv.get("max_dd_pct",-100)>-40)})
    cands.sort(key=lambda z:(z["train"].get("sharpe") or -99,z["train"].get("cagr_pct") or -999),reverse=True)
    return cands

def run():
    data={}
    errors={}
    with ThreadPoolExecutor(max_workers=8) as ex:
        fut={ex.submit(fetch,s):s for s in UNIVERSE}
        for f in as_completed(fut):
            s=fut[f]
            try:data[s]=f.result();print("LOADED",s,len(data[s]),flush=True)
            except Exception as e:errors[s]=repr(e);print("FAILED",s,repr(e),flush=True)
    if len(data)<35:raise RuntimeError(f"Only {len(data)} symbols loaded")
    top_train,finalists=screen_trade_families(data)
    times,by=cross_section_panel(data)
    cs=[]
    for L in (1,3,7,14,28,56):
      for H in (1,3,5,7,14):
       for leg in ("WINNERS_LONG","LOSERS_LONG","WINNERS_SHORT","LOSERS_SHORT","LONG_SHORT"):
        mt,mv=cs_strategy(times,by,L,H,leg,.2,False)
        cs.append({"family":"cross_section","L":L,"H":H,"leg":leg,"train":mt,"validation":mv})
    # train-only ranking; only top 40 are considered finalists
    cs.sort(key=lambda z:(z["train"].get("sharpe") or -99,z["train"].get("cagr_pct") or -999),reverse=True)
    cs_final=cs[:40]
    for z in cs_final:
        z["eligible"]=bool((z["train"].get("cagr_pct") or -999)>0 and (z["validation"].get("cagr_pct") or -999)>0 and
                           (z["train"].get("sharpe") or -99)>.5 and (z["validation"].get("sharpe") or -99)>.5)
    timing=market_timing(data,times,by)
    eligible_trades=[x for x in finalists if x["eligible"]]
    eligible_cs=[x for x in cs_final if x["eligible"]]
    timing_final=timing[:30]
    eligible_timing=[x for x in timing_final if x["eligible"] and (x["validation"].get("sharpe") or -99)>.5]
    report={
      "window":{"start_ms":START,"split_ms":SPLIT,"end_exclusive_ms":END},
      "cost_roundtrip_pct":COST*100,
      "universe_requested":UNIVERSE,"loaded":sorted(data),"load_errors":errors,
      "method":[
        "Research only. No trading runtime or account state is changed.",
        "Daily Binance USD-M perpetual klines; next-day-open entries and future daily-close exits.",
        "Current-liquid, currently-listed contracts that were listed before the research start are used; this creates survivorship/current-liquidity selection bias and is disclosed.",
        "All quantile thresholds are computed on train only. Families are ranked on train; only frozen top train finalists are judged on validation.",
        "Round-trip trading drag is fixed at 0.16% for every single-symbol leg. Cross-sectional leg returns deduct the same 0.16% per constituent round trip.",
        "Daily screening cannot model intraday liquidation or barrier ordering; any survivor must be re-tested on intraday bars before shadow promotion."
      ],
      "single_symbol_train_top":top_train,
      "single_symbol_finalists":finalists,
      "single_symbol_eligible":eligible_trades,
      "cross_section_train_top":cs_final,
      "cross_section_eligible":eligible_cs,
      "market_timing_train_top":timing_final,
      "market_timing_eligible":eligible_timing,
      "summary":{"loaded_symbols":len(data),"single_finalists":len(finalists),"single_eligible":len(eligible_trades),
                 "cross_eligible":len(eligible_cs),"timing_eligible":len(eligible_timing)}
    }
    out=Path("research-output");out.mkdir(exist_ok=True)
    (out/"daily-factor-hunt-3y.json").write_text(json.dumps(report,indent=2,allow_nan=False))
    print("EDGE_SUMMARY "+json.dumps(report["summary"]),flush=True)
    print("EDGE_SINGLE "+json.dumps(eligible_trades[:10]),flush=True)
    print("EDGE_CS "+json.dumps(eligible_cs[:10]),flush=True)
    print("EDGE_TIMING "+json.dumps(eligible_timing[:10]),flush=True)

if __name__=="__main__":run()

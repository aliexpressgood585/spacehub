"""Preregistered cross-sectional relative-strength grid; research only."""
import csv, hashlib, io, json, urllib.error, urllib.request, zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
from pathlib import Path

import numpy as np

END_DT=datetime(2026,10,7,tzinfo=timezone.utc); START_DT=END_DT-timedelta(days=1095)
SPLIT_DT=END_DT-timedelta(days=365); LOAD_DT=START_DT-timedelta(days=8)
START,SPLIT,END,LOAD=[int(x.timestamp()*1000) for x in (START_DT,SPLIT_DT,END_DT,LOAD_DT)]
SYMBOLS=["ANKRUSDT","ARKUSDT","1000000MOGUSDT","AGTUSDT","SUSHIUSDT","LQTYUSDT","HYPERUSDT","KAVAUSDT","LUMIAUSDT","ALPINEUSDT"]
MODES=("momentum","contrarian"); SIDES=("LONG","SHORT")
LOOKBACKS={"1h":12,"4h":48}; HOLDS={"1h":12,"4h":48}
FILTERS=("none","dispersion","volume","all")
COST=.0016; BASE="https://data.binance.vision/data/futures/um"
GATE={"min_n_each":300,"min_pf_each":1.15,"positive_avg_each":True}

def urls(sym):
    y,m=LOAD_DT.year,LOAD_DT.month
    while (y,m)<(END_DT.year,END_DT.month):
        yield f"{BASE}/monthly/klines/{sym}/1m/{sym}-1m-{y}-{m:02d}.zip"
        m+=1
        if m==13:y+=1;m=1
    for d in range(1,END_DT.day):
        yield f"{BASE}/daily/klines/{sym}/1m/{sym}-1m-{END_DT.year}-{END_DT.month:02d}-{d:02d}.zip"

def load(sym):
    chunks=[]; archives=[]
    for url in urls(sym):
      for attempt in range(3):
       try:
        req=urllib.request.Request(url,headers={"User-Agent":"spacehub-cross-sectional/1.0"})
        with urllib.request.urlopen(req,timeout=40) as r: raw=r.read()
        with zipfile.ZipFile(io.BytesIO(raw)) as z: txt=z.read(z.namelist()[0]).decode()
        rows=[]
        for row in csv.reader(io.StringIO(txt)):
            if not row or not row[0].isdigit():continue
            t=int(row[0]);t=t//1000 if t>10**14 else t
            if LOAD<=t<END:rows.append((t,*map(float,row[1:6])))
        chunks.extend(rows);archives.append({"url":url,"sha256":hashlib.sha256(raw).hexdigest(),"rows":len(rows)});break
       except urllib.error.HTTPError as e:
        if e.code==404:archives.append({"url":url,"missing":404});break
        if attempt==2:raise
       except Exception:
        if attempt==2:raise
    if not chunks:raise RuntimeError("no data "+sym)
    a=np.array(sorted({r[0]:r for r in chunks}.values()),float);t=a[:,0].astype(np.int64)
    gaps=int(np.sum(np.diff(t)!=60000))
    if gaps or t[-1]+60000!=END:raise ValueError(f"incomplete {sym}: gaps={gaps} last={t[-1]}")
    idx=np.flatnonzero(t%300000==0);idx=idx[idx+4<len(a)];idx=idx[t[idx+4]-t[idx]==240000]
    blocks=a[idx[:,None]+np.arange(5)]
    b=np.column_stack((a[idx,0],a[idx,1],blocks[:,:,2].max(1),blocks[:,:,3].min(1),a[idx+4,4],blocks[:,:,5].sum(1)))
    cov={"symbol":sym,"minute_bars":len(a),"five_minute_bars":len(b),"first_ms":int(t[0]),"last_ms":int(t[-1]),"gaps":gaps,"archives":archives}
    print("LOADED "+json.dumps({k:v for k,v in cov.items() if k!="archives"}),flush=True)
    return b,cov

def align(data):
    times=np.arange(LOAD,END,300000,dtype=np.int64);n=len(times);syms=["BTCUSDT"]+SYMBOLS
    op=np.full((n,len(syms)),np.nan);cl=np.full_like(op,np.nan);vol=np.full_like(op,np.nan)
    for j,s in enumerate(syms):
        b=data[s][0];ii=((b[:,0].astype(np.int64)-LOAD)//300000).astype(int);good=(ii>=0)&(ii<n)
        op[ii[good],j]=b[good,1];cl[ii[good],j]=b[good,4];vol[ii[good],j]=b[good,5]
    return times,syms,op,cl,vol

def volume_gate(vol):
    out=np.zeros_like(vol,dtype=bool);window=288
    for j in range(vol.shape[1]):
        x=np.nan_to_num(vol[:,j]);present=np.isfinite(vol[:,j]).astype(float)
        sx=np.r_[0.,np.cumsum(x)];sn=np.r_[0.,np.cumsum(present)]
        for i in range(window,len(x)):
            n=sn[i]-sn[i-window]
            if n>=window*.95 and np.isfinite(vol[i,j]):out[i,j]=vol[i,j]>=1.5*(sx[i]-sx[i-window])/n
    return out

def build_candidates(times,cl,volgate,lookback,mode,side,filter_name):
    rows=[];threshold=.005 if lookback==12 else .01
    for i in range(max(lookback,288),len(times)-1):
        if not np.isfinite(cl[i,0]) or not np.isfinite(cl[i-lookback,0]):continue
        btc_ret=cl[i,0]/cl[i-lookback,0]-1
        vals=[]
        for j in range(1,cl.shape[1]):
            if np.isfinite(cl[i,j]) and np.isfinite(cl[i-lookback,j]):vals.append((cl[i,j]/cl[i-lookback,j]-1-btc_ret,j))
        if len(vals)<5:continue
        vals.sort();disp=float(np.std([x[0] for x in vals]));high=disp>=threshold
        chosen=([x[1] for x in vals[-2:]] if side=="LONG" else [x[1] for x in vals[:2]]) if mode=="momentum" else ([x[1] for x in vals[:2]] if side=="LONG" else [x[1] for x in vals[-2:]])
        for j in chosen:
            ok=True
            if filter_name in ("dispersion","all"):ok &= high
            if filter_name in ("volume","all"):ok &= bool(volgate[i,j])
            if filter_name=="all":ok &= btc_ret>=0 if side=="LONG" else btc_ret<=0
            if ok:rows.append((i,j,disp,btc_ret))
    return rows

def simulate(candidates,times,op,cl,hold,side,start,end):
    out=[];last={}
    for i,j,disp,btc_ret in candidates:
        ets=int(times[i+1]);x=i+hold
        if ets<start or ets>=end or x>=len(times) or x>=np.searchsorted(times,end):continue
        if i<=last.get(j,-1):continue
        entry=op[i+1,j];exitp=cl[x,j]
        if not np.isfinite(entry) or not np.isfinite(exitp):continue
        net=(exitp/entry-1 if side=="LONG" else 1-exitp/entry)-COST
        out.append((ets,int(times[x]+240000),float(net),j,disp,btc_ret));last[j]=x
    return out

def metrics(rows,start,end):
    v=np.array([r[2] for r in rows]);n=len(v)
    if not n:return {"n":0,"wr":None,"pf":None,"avg_net_bps":None,"sum_net_pct":0,"weekly_block_avg_bps_ci95":None}
    pos=float(v[v>0].sum());neg=float(-v[v<0].sum());wins=int((v>0).sum())
    bins=int(np.ceil((end-start)/604800000));sums=np.zeros(bins);counts=np.zeros(bins)
    for r in rows:k=min(bins-1,int((r[0]-start)//604800000));sums[k]+=r[2];counts[k]+=1
    rng=np.random.default_rng(20261008);draw=rng.integers(0,bins,size=(2000,bins));nn=counts[draw].sum(1);vv=sums[draw].sum(1);ci=np.quantile(vv[nn>0]/nn[nn>0],[.025,.975])
    return {"n":n,"wins":wins,"wr":round(100*wins/n,3),"pf":round(pos/neg,4) if neg else None,"avg_net_bps":round(10000*float(v.mean()),4),"sum_net_pct":round(100*float(v.sum()),4),"weekly_block_avg_bps_ci95":[round(float(x*10000),4) for x in ci]}

def run():
    with ThreadPoolExecutor(max_workers=4) as p:
        vals=list(p.map(load,["BTCUSDT"]+SYMBOLS))
    data=dict(zip(["BTCUSDT"]+SYMBOLS,vals));times,syms,op,cl,vol=align(data);vg=volume_gate(vol)
    aggregate={};by_symbol={s:{} for s in SYMBOLS};raw={}
    for mode in MODES:
     for side in SIDES:
      for lname,lookback in LOOKBACKS.items():
       for filt in FILTERS:
        cand=build_candidates(times,cl,vg,lookback,mode,side,filt)
        for hname,hold in HOLDS.items():
         key="|".join((mode,side,lname,hname,filt));aggregate[key]={};raw[key]={}
         for period,(start,end) in {"train":(START,SPLIT),"validation":(SPLIT,END)}.items():
            tr=simulate(cand,times,op,cl,hold,side,start,end);raw[key][period]=tr;aggregate[key][period]=metrics(tr,start,end)
            for j,s in enumerate(SYMBOLS,1):by_symbol[s].setdefault(key,{})[period]=metrics([r for r in tr if r[3]==j],start,end)
    eligible=[k for k,v in aggregate.items() if all(v[p]["n"]>=300 and v[p]["pf"] is not None and v[p]["pf"]>1.15 and v[p]["avg_net_bps"]>0 for p in ("train","validation"))]
    report={"window":{"start":START_DT.isoformat(),"split":SPLIT_DT.isoformat(),"end_exclusive":END_DT.isoformat()},"symbols":SYMBOLS,"modes":MODES,"sides":SIDES,"lookbacks":LOOKBACKS,"holds":HOLDS,"filters":FILTERS,"variant_count":len(aggregate),"cost_roundtrip_pct":.16,"gate":GATE,"eligible":eligible,
      "method":["At each completed 5m bar, rank alt returns minus BTC return over fixed 1h/4h lookback; require at least five listed symbols.","Momentum buys top two/sells bottom two; contrarian reverses that mapping. Entry is next 5m open, equal constant notional per trade.","Exit is close after fixed 1h/4h hold; 0.16% round-trip cost. Same symbol/variant cannot overlap; periods reset independently.","Dispersion threshold is fixed at 0.5% for 1h and 1.0% for 4h. Volume means current 5m volume >=1.5x prior 24h mean. All also requires BTC lookback direction aligned with side.","No stop/target, leverage, liquidation, funding realization or portfolio compounding. Validation is previously exposed and not pristine."],"warnings":["Fixed prior ten-symbol universe has selection/survivorship bias.","The 2 bps funding component is a reserve, not actual funding.","Any survivor requires cross-symbol robustness, overlapping-position portfolio simulation and new forward Shadow."],"coverage":[x[1] for x in vals],"aggregate":aggregate,"by_symbol":by_symbol}
    out=Path("research-output");out.mkdir(exist_ok=True);(out/"cross-sectional-grid-3y.json").write_text(json.dumps(report,indent=2,allow_nan=False))
    print("CROSS_RESULT "+json.dumps({"variants":len(aggregate),"eligible":eligible,"top_train":sorted(aggregate,key=lambda k:aggregate[k]["train"]["avg_net_bps"] or -1e9,reverse=True)[:10]}),flush=True)

if __name__=="__main__":run()

"""Preregistered BTC-shock delayed-response pair study; research only."""
import csv, hashlib, io, json, urllib.error, urllib.request, zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
from pathlib import Path

import numpy as np

END_DT=datetime(2026,10,7,tzinfo=timezone.utc);START_DT=END_DT-timedelta(days=1095)
SPLIT_DT=END_DT-timedelta(days=365);LOAD_DT=START_DT-timedelta(days=15)
START,SPLIT,END,LOAD=[int(x.timestamp()*1000) for x in (START_DT,SPLIT_DT,END_DT,LOAD_DT)]
SYMBOLS=["ANKRUSDT","ARKUSDT","1000000MOGUSDT","AGTUSDT","SUSHIUSDT","LQTYUSDT","HYPERUSDT","KAVAUSDT","LUMIAUSDT","ALPINEUSDT"]
SHOCKS=(.004,.007);RATIOS=(.25,.50);FILTERS=("none","btc_volume");HOLDS={"15m":3,"30m":6,"60m":12}
BETA_WINDOW=4032;VOLUME_WINDOW=288;COST=.0016;BASE="https://data.binance.vision/data/futures/um"
GATE={"min_n_each":300,"min_pf_each":1.15,"positive_avg_each":True}

def urls(sym):
    y,m=LOAD_DT.year,LOAD_DT.month
    while (y,m)<(END_DT.year,END_DT.month):
        yield f"{BASE}/monthly/klines/{sym}/1m/{sym}-1m-{y}-{m:02d}.zip";m+=1
        if m==13:y+=1;m=1
    for d in range(1,END_DT.day):yield f"{BASE}/daily/klines/{sym}/1m/{sym}-1m-{END_DT.year}-{END_DT.month:02d}-{d:02d}.zip"

def load(sym):
    chunks=[];archives=[]
    for url in urls(sym):
      for attempt in range(3):
       try:
        req=urllib.request.Request(url,headers={"User-Agent":"spacehub-btc-lag/1.0"})
        with urllib.request.urlopen(req,timeout=40) as r:raw=r.read()
        with zipfile.ZipFile(io.BytesIO(raw)) as z:txt=z.read(z.namelist()[0]).decode()
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
    idx=np.flatnonzero(t%300000==0);idx=idx[idx+4<len(a)];idx=idx[t[idx+4]-t[idx]==240000]
    blocks=a[idx[:,None]+np.arange(5)]
    b=np.column_stack((a[idx,0],a[idx,1],blocks[:,:,2].max(1),blocks[:,:,3].min(1),a[idx+4,4],blocks[:,:,5].sum(1)))
    cov={"symbol":sym,"minute_bars":len(a),"five_minute_bars":len(b),"first_ms":int(t[0]),"last_ms":int(t[-1]),"minute_gaps":int(np.sum(np.diff(t)!=60000)),"archives":archives}
    print("LOADED "+json.dumps({k:v for k,v in cov.items() if k!="archives"}),flush=True);return b,cov

def align(data):
    times=np.arange(LOAD,END,300000,dtype=np.int64);syms=["BTCUSDT"]+SYMBOLS
    op=np.full((len(times),len(syms)),np.nan);cl=np.full_like(op,np.nan);vol=np.full_like(op,np.nan)
    for j,s in enumerate(syms):
        b=data[s][0];ii=((b[:,0].astype(np.int64)-LOAD)//300000).astype(int);good=(ii>=0)&(ii<len(times))
        op[ii[good],j]=b[good,1];cl[ii[good],j]=b[good,4];vol[ii[good],j]=b[good,5]
    return times,syms,op,cl,vol

def rolling_beta(ret_btc,ret_alt):
    ok=np.isfinite(ret_btc)&np.isfinite(ret_alt);x=np.where(ok,ret_btc,0.);y=np.where(ok,ret_alt,0.)
    def pref(v):return np.r_[0.,np.cumsum(v)]
    n=len(x);idx=np.arange(BETA_WINDOW-1,n);lo=idx+1-BETA_WINDOW;hi=idx+1
    cnt=pref(ok.astype(float))[hi]-pref(ok.astype(float))[lo];sx=pref(x)[hi]-pref(x)[lo];sy=pref(y)[hi]-pref(y)[lo]
    sxx=pref(x*x)[hi]-pref(x*x)[lo];sxy=pref(x*y)[hi]-pref(x*y)[lo]
    vx=sxx/cnt-(sx/cnt)**2;cov=sxy/cnt-(sx/cnt)*(sy/cnt);b=cov/vx
    good=(cnt>=.95*BETA_WINDOW)&(vx>0)&(b>=.1)&(b<=3);out=np.full(n,np.nan);out[idx[good]]=b[good];return out

def btc_volume_gate(vol):
    ok=np.isfinite(vol);x=np.where(ok,vol,0.);p=np.r_[0.,np.cumsum(x)];n=np.r_[0.,np.cumsum(ok.astype(float))]
    out=np.zeros(len(vol),bool)
    i=np.arange(VOLUME_WINDOW,len(vol));cnt=n[i]-n[i-VOLUME_WINDOW];mean=np.divide(p[i]-p[i-VOLUME_WINDOW],cnt,out=np.full(len(i),np.nan),where=cnt>0)
    out[i]=(cnt>=.95*VOLUME_WINDOW)&ok[i]&(vol[i]>=1.5*mean);return out

def build_signals(times,cl,vol,shock,ratio_max,filter_name):
    ret=np.full_like(cl,np.nan);ret[1:]=np.log(cl[1:]/cl[:-1]);vok=btc_volume_gate(vol[:,0]);out=[]
    shock_ok=np.isfinite(ret[:,0])&(np.abs(ret[:,0])>=shock)
    if filter_name=="btc_volume":shock_ok &= vok
    for j in range(1,cl.shape[1]):
        beta=rolling_beta(ret[:,0],ret[:,j]);den=np.abs(beta*ret[:,0]);direction=np.sign(ret[:,0])
        ratio=np.divide(direction*ret[:,j],den,out=np.full(len(times),np.nan),where=den>0)
        good=shock_ok&np.isfinite(beta)&np.isfinite(ratio)&(ratio>=-.5)&(ratio<=ratio_max)&(np.arange(len(times))<len(times)-1)
        for i in np.flatnonzero(good):out.append((int(i),j,float(beta[i]),float(ratio[i]),int(direction[i])))
    return out

def simulate(signals,times,op,cl,hold,start,end):
    out=[];last={}
    for i,j,b,ratio,side in signals:
        ets=int(times[i+1]);x=i+hold
        if ets<start or ets>=end or x>=len(times) or int(times[x]+240000)>=end or i<=last.get(j,-1):continue
        prices=np.array((op[i+1,j],cl[x,j],op[i+1,0],cl[x,0]),float)
        if not np.isfinite(prices).all() or min(prices)<=0:continue
        wa=1/(1+abs(b));wb=abs(b)/(1+abs(b));ra=prices[1]/prices[0]-1;rb=prices[3]/prices[2]-1
        gross=wa*side*ra+wb*(-side)*rb;out.append((ets,int(times[x]+240000),float(gross-COST),j,b,ratio,side,float(gross),wa,wb));last[j]=x
    return out

def metrics(rows,start,end):
    v=np.array([r[2] for r in rows]);n=len(v)
    if not n:return {"n":0,"wr":None,"pf":None,"avg_net_bps":None,"sum_net_pct":0,"weekly_block_avg_bps_ci95":None}
    pos=float(v[v>0].sum());neg=float(-v[v<0].sum());wins=int((v>0).sum());bins=int(np.ceil((end-start)/604800000));sums=np.zeros(bins);counts=np.zeros(bins)
    for r in rows:k=min(bins-1,int((r[0]-start)//604800000));sums[k]+=r[2];counts[k]+=1
    rng=np.random.default_rng(20261008);draw=rng.integers(0,bins,size=(2000,bins));nn=counts[draw].sum(1);vv=sums[draw].sum(1);ci=np.quantile(vv[nn>0]/nn[nn>0],[.025,.975])
    return {"n":n,"wins":wins,"wr":round(100*wins/n,3),"pf":round(pos/neg,4) if neg else None,"avg_net_bps":round(10000*float(v.mean()),4),"sum_net_pct":round(100*float(v.sum()),4),"weekly_block_avg_bps_ci95":[round(float(x*10000),4) for x in ci]}

def run():
    names=["BTCUSDT"]+SYMBOLS
    with ThreadPoolExecutor(max_workers=4) as p:vals=list(p.map(load,names))
    data=dict(zip(names,vals));times,syms,op,cl,vol=align(data);aggregate={};by_symbol={s:{} for s in SYMBOLS}
    for shock in SHOCKS:
      for ratio in RATIOS:
       for filt in FILTERS:
        sig=build_signals(times,cl,vol,shock,ratio,filt)
        for hname,hold in HOLDS.items():
          key=f"shock={shock:.4f}|ratio={ratio:.2f}|filter={filt}|hold={hname}";aggregate[key]={}
          for period,(start,end) in {"train":(START,SPLIT),"validation":(SPLIT,END)}.items():
            rows=simulate(sig,times,op,cl,hold,start,end);aggregate[key][period]=metrics(rows,start,end)
            for j,s in enumerate(SYMBOLS,1):by_symbol[s].setdefault(key,{})[period]=metrics([r for r in rows if r[3]==j],start,end)
    eligible=[k for k,v in aggregate.items() if all(v[p]["n"]>=300 and v[p]["pf"] is not None and v[p]["pf"]>1.15 and v[p]["avg_net_bps"]>0 for p in ("train","validation"))]
    report={"window":{"start":START_DT.isoformat(),"split":SPLIT_DT.isoformat(),"end_exclusive":END_DT.isoformat()},"symbols":SYMBOLS,"beta_symbol":"BTCUSDT","beta_window_bars":BETA_WINDOW,"shocks":SHOCKS,"response_ratios":RATIOS,"filters":FILTERS,"holds":HOLDS,"variant_count":len(aggregate),"cost_roundtrip_pct_on_normalized_gross":.16,"gate":GATE,"eligible":eligible,"method":["Completed BTC 5m shock and simultaneous alt response only; rolling 14-day beta uses no future bars.","Candidate requires alt signed response ratio in [-0.50, threshold], optionally with BTC quote volume >=1.5x prior 24h mean.","Trade alt in BTC direction and beta-weighted BTC in opposite direction; total gross normalized to 1.","Both legs enter next 5m open and exit at fixed completed close; same-alt overlap suppressed.","Validation is already exposed and not pristine."],"warnings":["Fixed prior ten-symbol universe has selection/survivorship bias.","0.16% includes a funding reserve rather than realized leg-by-leg funding.","Different alt pairs may overlap; portfolio netting and drawdown are not simulated.","Any survivor requires symbol robustness, portfolio simulation and new forward Shadow."],"coverage":[x[1] for x in vals],"aggregate":aggregate,"by_symbol":by_symbol}
    out=Path("research-output");out.mkdir(exist_ok=True);(out/"btc-lag-pairs-3y.json").write_text(json.dumps(report,indent=2,allow_nan=False))
    print("BTC_LAG_RESULT "+json.dumps({"variants":len(aggregate),"eligible":eligible,"top":sorted(aggregate,key=lambda k:min(aggregate[k][p]["pf"] or 0 for p in ("train","validation")),reverse=True)}),flush=True)

if __name__=="__main__":run()

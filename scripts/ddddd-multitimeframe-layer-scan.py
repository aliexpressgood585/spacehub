import csv, io, json, os, urllib.request, zipfile, concurrent.futures
from datetime import datetime, timezone
import numpy as np

SYMS=["ANKRUSDT","ARKUSDT","1000000MOGUSDT","AGTUSDT","SUSHIUSDT","LQTYUSDT","HYPERUSDT","KAVAUSDT","LUMIAUSDT","ALPINEUSDT"]
START=int(datetime(2026,7,8,tzinfo=timezone.utc).timestamp()*1000)
END=int(datetime(2026,10,6,tzinfo=timezone.utc).timestamp()*1000)
SPLIT=int(datetime(2026,9,6,tzinfo=timezone.utc).timestamp()*1000)
BASE="https://data.binance.vision/data/futures/um"
UA={"User-Agent":"spacehub-1m-dynamic/1.0"}
FEE=.001
HORIZON=60
TPS=[.0025,.0035,.005,.0075,.01]
SLS=[.0025,.005,.0075,.01,.015]

def load_zip(url):
    try:
        req=urllib.request.Request(url,headers=UA)
        with urllib.request.urlopen(req,timeout=30) as r: raw=r.read()
        with zipfile.ZipFile(io.BytesIO(raw)) as z: txt=z.read(z.namelist()[0]).decode()
        out=[]
        for row in csv.reader(io.StringIO(txt)):
            if not row or not row[0].isdigit(): continue
            t=int(row[0])
            if START<=t<END: out.append((t,float(row[1]),float(row[2]),float(row[3]),float(row[4])))
        return out
    except Exception:
        return []

def load(sym):
    urls=[f"{BASE}/monthly/klines/{sym}/1m/{sym}-1m-2026-{m:02d}.zip" for m in (7,8,9)]
    urls += [f"{BASE}/daily/klines/{sym}/1m/{sym}-1m-2026-10-{d:02d}.zip" for d in range(1,6)]
    a=[]
    for u in urls: a.extend(load_zip(u))
    a.sort(key=lambda x:x[0]); z=[]; seen=set()
    for x in a:
        if x[0] not in seen: seen.add(x[0]); z.append(x)
    return z

def pattern_masks(t,o,c):
    N=len(t); out={}
    col=np.where(c>o,1,np.where(c<o,0,-1))
    for n in (1,2,3):
        start=n-1
        idx=np.arange(start,N)
        valid=np.zeros(N,dtype=bool); valid[idx]=True
        for lag in range(n-1):
            valid[idx] &= (t[idx-lag]-t[idx-lag-1]==60000)
        for code in range(2**n):
            bits=[(code>>(n-1-k))&1 for k in range(n)]
            m=valid.copy()
            for k,b in enumerate(bits):
                m[idx] &= (col[idx-(n-1-k)]==b)
            label=''.join('G' if b else 'R' for b in bits)
            out[label]=m
    return out

def outcome_arrays(t,o,h,l,c,tp,sl,side):
    N=len(t); net=np.full(N,np.nan); ex=np.full(N,-1,dtype=np.int32)
    unresolved=np.arange(N)<N-1
    e=c.copy()
    for off in range(1,HORIZON+1):
        n=N-off
        if n<=0: break
        idx=np.arange(n)
        u=unresolved[:n]
        if not u.any(): continue
        if side==1:
            stop=l[off:]<=e[:n]*(1-sl); targ=h[off:]>=e[:n]*(1+tp)
        else:
            stop=h[off:]>=e[:n]*(1+sl); targ=l[off:]<=e[:n]*(1-tp)
        hit=u & (stop|targ)
        if hit.any():
            loss=hit & stop
            win=hit & ~stop & targ
            li=idx[loss]; wi=idx[win]; hi=idx[hit]
            net[li]=-sl-FEE
            net[wi]=tp-FEE
            ex[hi]=hi+off
            unresolved[hi]=False
    remain=np.where(unresolved & (np.arange(N)+HORIZON<N))[0]
    if len(remain):
        endc=c[remain+HORIZON]
        gross=(endc/e[remain]-1)*side
        net[remain]=gross-FEE
        ex[remain]=remain+HORIZON
        unresolved[remain]=False
    return net,ex

def take_nonoverlap(indices,net,ex):
    vals=[]; times=[]; last=-1
    for i in indices:
        if i<=last or ex[i]<0 or not np.isfinite(net[i]): continue
        vals.append(float(net[i])); times.append(int(i)); last=int(ex[i])
    return np.array(vals),np.array(times,dtype=np.int32)

def metrics(vals,idx,t):
    if len(vals)==0:return {"n":0,"wins":0,"wr":0,"pf":0,"net_pct":0,"avg_bps":0,"pos_pct":0,"neg_pct":0}
    wins=int((vals>0).sum()); pos=float(vals[vals>0].sum()); neg=float(-vals[vals<0].sum())
    return {"n":int(len(vals)),"wins":wins,"wr":round(100*wins/len(vals),2),
            "pf":round(pos/neg,3) if neg>0 else 999,
            "net_pct":round(100*float(vals.sum()),2),
            "avg_bps":round(10000*float(vals.mean()),2),
            "pos_pct":round(100*pos,4),"neg_pct":round(100*neg,4)}

def scan_symbol(sym):
    b=load(sym)
    if len(b)<1000:return {"sym":sym,"bars":len(b),"rows":[]}
    a=np.array(b,dtype=float); t=a[:,0].astype(np.int64); o=a[:,1]; h=a[:,2]; l=a[:,3]; c=a[:,4]
    masks=pattern_masks(t,o,c)
    rows=[]
    for tp in TPS:
      for sl in SLS:
       for side in (1,-1):
        net,ex=outcome_arrays(t,o,h,l,c,tp,sl,side)
        for pat,m in masks.items():
            idx=np.where(m & (np.arange(len(t))<len(t)-HORIZON))[0]
            vals,chosen=take_nonoverlap(idx,net,ex)
            ts=t[chosen] if len(chosen) else np.array([],dtype=np.int64)
            first=vals[ts<SPLIT]; firsti=chosen[ts<SPLIT]
            last=vals[ts>=SPLIT]; lasti=chosen[ts>=SPLIT]
            rows.append({"pattern":pat,"side":"LONG" if side==1 else "SHORT","tp":tp,"sl":sl,
              "all90":metrics(vals,chosen,t),"first60":metrics(first,firsti,t),"last30":metrics(last,lasti,t)})
    return {"sym":sym,"bars":len(b),"rows":rows}

res=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:
    for k,r in enumerate(ex.map(scan_symbol,SYMS),1):
        res.append(r); print("progress",k,"/",len(SYMS),r["sym"],r["bars"],flush=True)

keys=[]
for n in (1,2,3):
 for code in range(2**n):
  pat=''.join('G' if (code>>(n-1-k))&1 else 'R' for k in range(n))
  for side in ("LONG","SHORT"):
   for tp in TPS:
    for sl in SLS: keys.append((pat,side,tp,sl))

def agg(rows,key):
    n=sum(x[key]["n"] for x in rows); wins=sum(x[key]["wins"] for x in rows)
    if not n:return {"n":0,"wins":0,"wr":0,"pf":0,"net_pct":0,"avg_bps":0}
    net=sum(x[key]["net_pct"] for x in rows)
    pos=sum(x[key]["pos_pct"] for x in rows); neg=sum(x[key]["neg_pct"] for x in rows)
    avg=100*net/n
    return {"n":n,"wins":wins,"wr":round(100*wins/n,2),"pf":round(pos/neg,3) if neg>0 else 999,
            "net_pct":round(net,2),"avg_bps":round(avg,2)}

all_settings=[]
for pat,side,tp,sl in keys:
    per=[]
    for r in res:
        row=next(x for x in r["rows"] if x["pattern"]==pat and x["side"]==side and x["tp"]==tp and x["sl"]==sl)
        per.append({"sym":r["sym"],**row})
    A=agg(per,"all90"); F=agg(per,"first60"); L=agg(per,"last30")
    # robust symbol subset: enough observations and positive after fees in both temporal splits.
    selected=[x for x in per if x["all90"]["n"]>=80 and x["first60"]["n"]>=40 and x["last30"]["n"]>=20
              and x["all90"]["avg_bps"]>0 and x["first60"]["avg_bps"]>0 and x["last30"]["avg_bps"]>0]
    S=agg(selected,"all90") if selected else {"n":0,"wins":0,"wr":0,"net_pct":0,"avg_bps":0}
    SF=agg(selected,"first60") if selected else S.copy(); SL=agg(selected,"last30") if selected else S.copy()
    breakeven=100*(sl+FEE)/(tp+sl)
    all_settings.append({"pattern":pat,"side":side,"tp_pct":round(tp*100,3),"sl_pct":round(sl*100,3),
      "breakeven_wr":round(breakeven,2),"all10":A,"first60":F,"last30":L,
      "subset_symbols":[x["sym"] for x in selected],"subset90":S,"subset_first60":SF,"subset_last30":SL})

robust_all=[x for x in all_settings if x["all10"]["n"]>=800 and x["all10"]["avg_bps"]>0 and x["first60"]["avg_bps"]>0 and x["last30"]["avg_bps"]>0]
robust_all.sort(key=lambda x:(min(x["first60"]["avg_bps"],x["last30"]["avg_bps"]),x["all10"]["avg_bps"],x["all10"]["n"]),reverse=True)
robust_sub=[x for x in all_settings if x["subset90"]["n"]>=300 and x["subset90"]["avg_bps"]>0 and x["subset_first60"]["avg_bps"]>0 and x["subset_last30"]["avg_bps"]>0]
robust_sub.sort(key=lambda x:(min(x["subset_first60"]["avg_bps"],x["subset_last30"]["avg_bps"]),x["subset90"]["avg_bps"],x["subset90"]["n"]),reverse=True)
high_wr=[x for x in all_settings if x["subset90"]["n"]>=300 and x["subset90"]["avg_bps"]>0]
high_wr.sort(key=lambda x:(x["subset90"]["wr"],x["subset90"]["avg_bps"],x["subset90"]["n"]),reverse=True)

report={"generated_at":datetime.now(timezone.utc).isoformat(),"window":"2026-07-08 through 2026-10-05 UTC",
 "symbols":SYMS,"timeframe":"1m","pattern_lengths":[1,2,3],"tp_grid_pct":[x*100 for x in TPS],"sl_grid_pct":[x*100 for x in SLS],
 "fee_roundtrip_pct":FEE*100,"horizon_minutes":HORIZON,
 "method":"entry after completed 1m color pattern; every R/G sequence length 1-3; LONG and SHORT; TP/SL grid; same-bar conflict=SL; unresolved exits at 60m close; per-pattern same-symbol overlap suppressed; fees included",
 "robust_all10":robust_all[:30],"robust_subsets":robust_sub[:40],"highest_wr_profitable_subsets":high_wr[:30]}

print("DYN1M_RESULT_START")
print(json.dumps(report,indent=2))
print("DYN1M_RESULT_END")

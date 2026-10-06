import csv, io, json, urllib.request, zipfile, concurrent.futures
from datetime import datetime, timezone
import numpy as np

SYMS=["ANKRUSDT","ARKUSDT","1000000MOGUSDT","AGTUSDT","SUSHIUSDT","LQTYUSDT","HYPERUSDT","KAVAUSDT","LUMIAUSDT","ALPINEUSDT"]
START=int(datetime(2026,7,8,tzinfo=timezone.utc).timestamp()*1000)
END=int(datetime(2026,10,6,tzinfo=timezone.utc).timestamp()*1000)
SPLIT=int(datetime(2026,9,6,tzinfo=timezone.utc).timestamp()*1000)
BASE="https://data.binance.vision/data/futures/um"
UA={"User-Agent":"spacehub-1m-wide/1.0"}
FEE=.001
LEVELS=[.0025,.005,.0075,.01,.0125,.015,.02]
HORIZONS=[15,30,60,120]
MAXH=max(HORIZONS)

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
    a.sort(key=lambda x:x[0]); out=[]; seen=set()
    for x in a:
        if x[0] not in seen: seen.add(x[0]); out.append(x)
    return out

def pattern_indices(t,o,c):
    N=len(t); color=np.where(c>o,1,np.where(c<o,0,-1)); out={}
    for n in (1,2,3):
        idx=np.arange(n-1,N-MAXH)
        ok=np.ones(len(idx),dtype=bool)
        for lag in range(n-1):
            ok &= (t[idx-lag]-t[idx-lag-1]==60000)
        for code in range(2**n):
            bits=[(code>>(n-1-k))&1 for k in range(n)]
            m=ok.copy()
            for k,b in enumerate(bits):
                m &= (color[idx-(n-1-k)]==b)
            out[''.join('G' if b else 'R' for b in bits)]=idx[m]
    return out

def first_hits(c,h,l):
    N=len(c); INF=32767
    up={x:np.full(N,INF,dtype=np.int16) for x in LEVELS}
    dn={x:np.full(N,INF,dtype=np.int16) for x in LEVELS}
    for off in range(1,MAXH+1):
        n=N-off
        base=c[:n]
        hi=h[off:]; lo=l[off:]
        for x in LEVELS:
            u=up[x][:n]; mask=(u==INF)&(hi>=base*(1+x)); u[mask]=off
            d=dn[x][:n]; mask=(d==INF)&(lo<=base*(1-x)); d[mask]=off
    return up,dn

def calc(idx,t,c,up,dn,side,tp,sl,H):
    if len(idx)==0:return {"n":0,"wins":0,"wr":0,"pf":0,"net_pct":0,"avg_bps":0}
    jt=(up[tp] if side==1 else dn[tp])[idx].astype(np.int32)
    js=(dn[sl] if side==1 else up[sl])[idx].astype(np.int32)
    hitT=jt<=H; hitS=js<=H
    stop=hitS & (~hitT | (js<=jt))
    targ=hitT & ~stop
    vals=np.empty(len(idx),dtype=float)
    vals[stop]=-sl-FEE; vals[targ]=tp-FEE
    tout=~(stop|targ)
    if tout.any():
        ii=idx[tout]
        gross=(c[ii+H]/c[ii]-1)*side
        vals[tout]=gross-FEE
    wins=vals>0; pos=vals[wins].sum(); neg=-vals[vals<0].sum()
    return {"n":int(len(vals)),"wins":int(wins.sum()),"wr":round(100*wins.mean(),2),
            "pf":round(float(pos/neg),3) if neg>0 else 999,
            "net_pct":round(100*float(vals.sum()),2),
            "avg_bps":round(10000*float(vals.mean()),2),
            "_pos":float(pos),"_neg":float(neg)}

def scan(sym):
    b=load(sym)
    a=np.array(b,dtype=float); t=a[:,0].astype(np.int64); o=a[:,1]; h=a[:,2]; l=a[:,3]; c=a[:,4]
    pats=pattern_indices(t,o,c); up,dn=first_hits(c,h,l); rows=[]
    for pat,idx in pats.items():
      for side in (1,-1):
       for tp in LEVELS:
        for sl in LEVELS:
         for H in HORIZONS:
          allm=calc(idx,t,c,up,dn,side,tp,sl,H)
          fidx=idx[t[idx]<SPLIT]; lidx=idx[t[idx]>=SPLIT]
          fm=calc(fidx,t,c,up,dn,side,tp,sl,H); lm=calc(lidx,t,c,up,dn,side,tp,sl,H)
          rows.append({"pattern":pat,"side":"LONG" if side==1 else "SHORT","tp":tp,"sl":sl,"H":H,
                       "all90":allm,"first60":fm,"last30":lm})
    return {"sym":sym,"bars":len(b),"rows":rows}

with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:
    res=list(ex.map(scan,SYMS))
for r in res: print("done",r["sym"],r["bars"],flush=True)

def agg(rows,key):
    n=sum(x[key]["n"] for x in rows); wins=sum(x[key]["wins"] for x in rows)
    if not n:return {"n":0,"wins":0,"wr":0,"pf":0,"net_pct":0,"avg_bps":0}
    pos=sum(x[key]["_pos"] for x in rows); neg=sum(x[key]["_neg"] for x in rows)
    net=pos-neg
    return {"n":n,"wins":wins,"wr":round(100*wins/n,2),"pf":round(pos/neg,3) if neg else 999,
            "net_pct":round(100*net,2),"avg_bps":round(10000*net/n,2)}

keys=[]
for n in (1,2,3):
 for code in range(2**n):
  pat=''.join('G' if (code>>(n-1-k))&1 else 'R' for k in range(n))
  for side in ("LONG","SHORT"):
   for tp in LEVELS:
    for sl in LEVELS:
     for H in HORIZONS: keys.append((pat,side,tp,sl,H))

settings=[]
for pat,side,tp,sl,H in keys:
    per=[]
    for r in res:
        x=next(z for z in r["rows"] if z["pattern"]==pat and z["side"]==side and z["tp"]==tp and z["sl"]==sl and z["H"]==H)
        per.append({"sym":r["sym"],**x})
    A=agg(per,"all90"); F=agg(per,"first60"); L=agg(per,"last30")
    chosen=[x for x in per if x["all90"]["n"]>=100 and x["all90"]["avg_bps"]>0 and x["first60"]["avg_bps"]>0 and x["last30"]["avg_bps"]>0]
    SA=agg(chosen,"all90") if chosen else {"n":0,"wins":0,"wr":0,"pf":0,"net_pct":0,"avg_bps":0}
    SF=agg(chosen,"first60") if chosen else SA.copy(); SL=agg(chosen,"last30") if chosen else SA.copy()
    settings.append({"pattern":pat,"side":side,"tp_pct":tp*100,"sl_pct":sl*100,"hold_min":H,
                     "breakeven_hit_wr":round(100*(sl+FEE)/(tp+sl),2),
                     "all10":A,"first60":F,"last30":L,
                     "subset_symbols":[x["sym"] for x in chosen],
                     "subset90":SA,"subset_first60":SF,"subset_last30":SL})

allpos=[x for x in settings if x["all10"]["n"]>=1000 and x["all10"]["avg_bps"]>0 and x["first60"]["avg_bps"]>0 and x["last30"]["avg_bps"]>0]
allpos.sort(key=lambda x:(min(x["first60"]["avg_bps"],x["last30"]["avg_bps"]),x["all10"]["avg_bps"],x["all10"]["n"]),reverse=True)
sub=[x for x in settings if x["subset90"]["n"]>=300 and x["subset90"]["avg_bps"]>0 and x["subset_first60"]["avg_bps"]>0 and x["subset_last30"]["avg_bps"]>0]
sub.sort(key=lambda x:(min(x["subset_first60"]["avg_bps"],x["subset_last30"]["avg_bps"]),x["subset90"]["avg_bps"],x["subset90"]["n"]),reverse=True)
wr=[x for x in sub if x["subset90"]["wr"]>=58]
wr.sort(key=lambda x:(x["subset90"]["wr"],x["subset90"]["avg_bps"],x["subset90"]["n"]),reverse=True)
best=sorted(settings,key=lambda x:(min(x["first60"]["avg_bps"],x["last30"]["avg_bps"]),x["all10"]["avg_bps"]),reverse=True)[:30]

report={"generated_at":datetime.now(timezone.utc).isoformat(),"window":"2026-07-08 through 2026-10-05 UTC",
 "symbols":SYMS,"timeframe":"1m","patterns":"all R/G sequences of length 1,2,3","tp_sl_pct":[x*100 for x in LEVELS],
 "holds_min":HORIZONS,"fee_roundtrip_pct":FEE*100,
 "method":"signal-level screen; entry after completed pattern; same-bar TP+SL=SL; if neither hit by hold window, exit at window close; fees included in every exit",
 "profitable_all10":allpos[:30],"profitable_robust_subsets":sub[:40],"subsets_wr58plus":wr[:30],"best_overall_even_if_negative":best}

print("WIDE1M_RESULT_START")
print(json.dumps(report,indent=2))
print("WIDE1M_RESULT_END")

import csv,io,json,urllib.request,zipfile
from datetime import datetime,timezone
import numpy as np
SYM="AGTUSDT"; START=int(datetime(2026,7,8,tzinfo=timezone.utc).timestamp()*1000); END=int(datetime(2026,10,6,tzinfo=timezone.utc).timestamp()*1000); SPLIT=int(datetime(2026,9,6,tzinfo=timezone.utc).timestamp()*1000)
BASE="https://data.binance.vision/data/futures/um"; FEE=.001; MAXH=120
PATS={"R":"R","RR":"RR","RRR":"RRR","RGR":"RGR","GRR":"GRR","GGR":"GGR"}
TPS=[.015,.02]; SLS=[.01,.0125,.015,.02]; HS=[60,120]
def loadzip(u):
 try:
  req=urllib.request.Request(u,headers={"User-Agent":"spacehub-verify/1.0"})
  with urllib.request.urlopen(req,timeout=30) as r: raw=r.read()
  with zipfile.ZipFile(io.BytesIO(raw)) as z: txt=z.read(z.namelist()[0]).decode()
  return [(int(x[0]),float(x[1]),float(x[2]),float(x[3]),float(x[4])) for x in csv.reader(io.StringIO(txt)) if x and x[0].isdigit() and START<=int(x[0])<END]
 except:return []
a=[]
for m in (7,8,9): a+=loadzip(f"{BASE}/monthly/klines/{SYM}/1m/{SYM}-1m-2026-{m:02d}.zip")
for d in range(1,6): a+=loadzip(f"{BASE}/daily/klines/{SYM}/1m/{SYM}-1m-2026-10-{d:02d}.zip")
a=sorted({x[0]:x for x in a}.values()); q=np.array(a,float); t=q[:,0].astype(np.int64); o=q[:,1]; h=q[:,2]; l=q[:,3]; c=q[:,4]; N=len(t)
col=np.where(c>o,"G",np.where(c<o,"R","X"))
def pidx(p):
 n=len(p); idx=np.arange(n-1,N-MAXH); ok=np.ones(len(idx),bool)
 for lag in range(n-1): ok&=(t[idx-lag]-t[idx-lag-1]==60000)
 for k,ch in enumerate(p): ok&=(col[idx-(n-1-k)]==ch)
 return idx[ok]
def first(arr,thr,up=True):
 z=np.full(N,32767,dtype=np.int16)
 for off in range(1,MAXH+1):
  n=N-off; base=c[:n]; v=arr[off:]
  m=(z[:n]==32767)&((v>=base*(1+thr)) if up else (v<=base*(1-thr)))
  z[np.where(m)[0]]=off
 return z
UP={x:first(h,x,True) for x in sorted(set(TPS+SLS))}
DN={x:first(l,x,False) for x in sorted(set(TPS+SLS))}
def run(p,tp,sl,H):
 idx=pidx(p); jt=UP[tp][idx].astype(int); js=DN[sl][idx].astype(int)
 hitT=jt<=H; hitS=js<=H; stop=hitS&(~hitT|(js<=jt)); targ=hitT&~stop
 off=np.where(stop,js,np.where(targ,jt,H)); vals=np.empty(len(idx),float); vals[stop]=-sl-FEE; vals[targ]=tp-FEE
 tout=~(stop|targ); ii=idx[tout]; vals[tout]=(c[ii+H]/c[ii]-1)-FEE
 chosen=[]; cv=[]; last=-1
 for j,i in enumerate(idx):
  if i<=last: continue
  chosen.append(i);cv.append(vals[j]);last=i+int(off[j])
 chosen=np.array(chosen,int);cv=np.array(cv,float)
 def met(mask):
  v=cv[mask]; n=len(v)
  if not n:return {"n":0,"wr":0,"pf":0,"avg_bps":0,"net_pct":0}
  w=(v>0);pos=v[w].sum();neg=-v[v<0].sum()
  return {"n":n,"wins":int(w.sum()),"wr":round(100*w.mean(),2),"pf":round(float(pos/neg),3) if neg else 999,"avg_bps":round(10000*v.mean(),2),"net_pct":round(100*v.sum(),2)}
 ts=t[chosen]
 return {"pattern":p,"tp_pct":tp*100,"sl_pct":sl*100,"hold":H,"all90":met(np.ones(len(cv),bool)),"first60":met(ts<SPLIT),"last30":met(ts>=SPLIT)}
rows=[]
for p in PATS:
 for tp in TPS:
  for sl in SLS:
   for H in HS: rows.append(run(p,tp,sl,H))
rows.sort(key=lambda x:(min(x["first60"]["avg_bps"],x["last30"]["avg_bps"]),x["all90"]["avg_bps"],x["all90"]["n"]),reverse=True)
print("VERIFY_AGT_START");print(json.dumps(rows[:30],indent=2));print("VERIFY_AGT_END")

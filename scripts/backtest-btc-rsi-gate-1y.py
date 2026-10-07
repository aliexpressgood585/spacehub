import csv, io, json, urllib.request, zipfile, concurrent.futures
from datetime import datetime, timezone, timedelta
import numpy as np

END_DT=datetime(2026,10,7,tzinfo=timezone.utc)
START_DT=END_DT-timedelta(days=365)
START=int(START_DT.timestamp()*1000); END=int(END_DT.timestamp()*1000)
BASE="https://data.binance.vision/data/futures/um"; UA={"User-Agent":"spacehub-btc-rsi-1y/1.0"}
COST=.0016
TOP10=["ANKRUSDT","ARKUSDT","1000000MOGUSDT","AGTUSDT","SUSHIUSDT","LQTYUSDT","HYPERUSDT","KAVAUSDT","LUMIAUSDT","ALPINEUSDT"]
STRATS=[
 {"name":"DDDDD_5M","tf":"5m","symbols":TOP10,"kind":"red","n":5,"tp":.01,"sl":.01,"hold":None},
 {"name":"R6_3M","tf":"3m","symbols":["KAVAUSDT","1000000MOGUSDT"],"kind":"red","n":6,"tp":.01,"sl":.01,"hold":None},
 {"name":"R7_3M","tf":"3m","symbols":["KAVAUSDT","LQTYUSDT","LUMIAUSDT"],"kind":"red","n":7,"tp":.01,"sl":.01,"hold":None},
 {"name":"FALL5_10M","tf":"10m","symbols":["KAVAUSDT"],"kind":"fall","n":5,"tp":.01,"sl":.01,"hold":None},
 {"name":"R6_10M","tf":"10m","symbols":["KAVAUSDT","SUSHIUSDT"],"kind":"red","n":6,"tp":.01,"sl":.01,"hold":None},
 {"name":"FALL7_15M","tf":"15m","symbols":["ANKRUSDT","1000000MOGUSDT","SUSHIUSDT","HYPERUSDT","LUMIAUSDT"],"kind":"fall","n":7,"tp":.01,"sl":.01,"hold":None},
 {"name":"FALL5_30M","tf":"30m","symbols":["KAVAUSDT"],"kind":"fall","n":5,"tp":.01,"sl":.01,"hold":None},
 {"name":"FALL4_30M","tf":"30m","symbols":["ANKRUSDT"],"kind":"fall","n":4,"tp":.01,"sl":.01,"hold":None},
 {"name":"AGT_GRR_1M","tf":"1m","symbols":["AGTUSDT"],"kind":"agt","n":3,"tp":.005,"sl":.02,"hold":120},
 {"name":"LQTY_RRR_1M","tf":"1m","symbols":["LQTYUSDT"],"kind":"lqty","n":3,"tp":.005,"sl":.02,"hold":60},
]
def months(a,b):
 y,m=a.year,a.month; out=[]
 while (y,m)<=(b.year,b.month):
  out.append((y,m));m+=1
  if m==13:y+=1;m=1
 return out
MONTHS=months(START_DT,END_DT)

def one(url):
 try:
  with urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=35) as r: raw=r.read()
  with zipfile.ZipFile(io.BytesIO(raw)) as z: txt=z.read(z.namelist()[0]).decode()
  out=[]
  for row in csv.reader(io.StringIO(txt)):
   if row and row[0].isdigit():
    t=int(row[0])
    if START<=t<END:out.append((t,float(row[1]),float(row[2]),float(row[3]),float(row[4]),float(row[5])))
  return out
 except:return []

CACHE={}
def load(sym,tf):
 key=(sym,tf)
 if key in CACHE:return CACHE[key]
 src="5m" if tf=="10m" else tf
 urls=[f"{BASE}/monthly/klines/{sym}/{src}/{sym}-{src}-{y}-{m:02d}.zip" for y,m in MONTHS if (y,m)!=(END_DT.year,END_DT.month)]
 d=datetime(END_DT.year,END_DT.month,1,tzinfo=timezone.utc)
 while d<END_DT:
  urls.append(f"{BASE}/daily/klines/{sym}/{src}/{sym}-{src}-{d.year}-{d.month:02d}-{d.day:02d}.zip");d+=timedelta(days=1)
 arr=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex:
  for z in ex.map(one,urls):arr+=z
 arr=sorted({x[0]:x for x in arr}.values())
 if tf=="10m":
  z=[];i=0
  while i+1<len(arr):
   a,b=arr[i],arr[i+1];bucket=(a[0]//600000)*600000
   if a[0]==bucket and b[0]==a[0]+300000:z.append((a[0],a[1],max(a[2],b[2]),min(a[3],b[3]),b[4],a[5]+b[5]));i+=2
   else:i+=1
  arr=z
 CACHE[key]=arr;return arr

def rsi(c):
 d=np.diff(c,prepend=c[0]);g=np.maximum(d,0);l=np.maximum(-d,0);ag=np.full(len(c),np.nan);al=np.full(len(c),np.nan)
 if len(c)>14:
  ag[14]=g[1:15].mean();al[14]=l[1:15].mean()
  for i in range(15,len(c)):ag[i]=(ag[i-1]*13+g[i])/14;al[i]=(al[i-1]*13+l[i])/14
 rs=np.divide(ag,al,out=np.full(len(c),np.nan),where=al>0);return 100-100/(1+rs)
def sma(x,n):
 cs=np.cumsum(np.insert(x,0,0.));return np.r_[np.full(n-1,np.nan),(cs[n:]-cs[:-n])/n]
def sig(b,s):
 a=np.array(b,float);t=a[:,0].astype(np.int64);o=a[:,1];c=a[:,4];v=a[:,5];n=s["n"];idx=np.arange(n-1,len(a)-1)
 step={"1m":60000,"3m":180000,"5m":300000,"10m":600000,"15m":900000,"30m":1800000}[s["tf"]];ok=np.ones(len(idx),bool)
 for lag in range(n-1):ok&=(t[idx-lag]-t[idx-lag-1]==step)
 if s["kind"]=="red":
  for lag in range(n):ok&=(c[idx-lag]<o[idx-lag])
 elif s["kind"]=="fall":
  for lag in range(n-1):ok&=(c[idx-lag]<c[idx-lag-1])
 elif s["kind"]=="agt":
  av=sma(v,20);ok&=(c[idx-2]>o[idx-2])&(c[idx-1]<o[idx-1])&(c[idx]<o[idx])&(c[idx]/o[idx-2]-1<=-.005)&np.isfinite(av[idx])&(v[idx]>=1.5*av[idx])
 else:
  rr=rsi(c);ok&=(c[idx-2]<o[idx-2])&(c[idx-1]<o[idx-1])&(c[idx]<o[idx])&(c[idx]/o[idx-2]-1<=-.0075)&np.isfinite(rr[idx])&(rr[idx]<=40)
 return idx[ok]
btc=load("BTCUSDT","5m");ba=np.array(btc,float);bt=ba[:,0].astype(np.int64);br=rsi(ba[:,4])
def gate(ts):
 j=np.searchsorted(bt,ts,side="left")-1
 return j>=0 and np.isfinite(br[j]) and br[j]>=50
def ev(sym,s,usegate):
 b=load(sym,s["tf"])
 if len(b)<100:return []
 a=np.array(b,float);t=a[:,0].astype(np.int64);h=a[:,2];l=a[:,3];c=a[:,4];out=[];last=-1
 for i in sig(b,s):
  if i<=last or (usegate and not gate(t[i])):continue
  e=c[i];limit=min(len(c)-1,i+(s["hold"] if s["hold"] is not None else len(c)));kind=None
  for j in range(i+1,limit+1):
   hs=l[j]<=e*(1-s["sl"]);ht=h[j]>=e*(1+s["tp"])
   if hs or ht:
    if hs:kind="SL";px=e*(1-s["sl"])
    else:kind="TP";px=e*(1+s["tp"])
    last=j;break
  if kind is None:
   if s["hold"] is None:break
   last=limit;px=c[limit];kind="TIME"
  out.append((kind,px/e-1-COST))
 return out
def met(x):
 n=len(x)
 if not n:return {"n":0,"wins":0,"wr":0,"pf":0,"avg_bps":0,"net_pct_sum":0}
 v=np.array([z[1] for z in x]);w=int((v>0).sum());pos=v[v>0].sum();neg=-v[v<0].sum()
 return {"n":n,"wins":w,"wr":round(100*w/n,2),"pf":round(float(pos/neg),3) if neg else 999,"avg_bps":round(10000*float(v.mean()),2),"net_pct_sum":round(100*float(v.sum()),2)}
res=[]
for s in STRATS:
 base=[];flt=[]
 for sym in s["symbols"]:base+=ev(sym,s,False);flt+=ev(sym,s,True)
 res.append({"strategy":s["name"],"baseline":met(base),"btc_rsi50":met(flt)})
allb=[];allf=[]
for s in STRATS:
 for sym in s["symbols"]:allb+=ev(sym,s,False);allf+=ev(sym,s,True)
report={"window":{"start":START_DT.isoformat(),"end":END_DT.isoformat()},"cost_pct":COST*100,"aggregate":{"baseline":met(allb),"btc_rsi50":met(allf)},"results":res}
with open("status/btc-rsi-gate-1y.json","w") as f:json.dump(report,f,indent=2)
print(json.dumps(report,indent=2))

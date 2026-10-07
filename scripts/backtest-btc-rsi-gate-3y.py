import csv, io, json, urllib.request, zipfile, concurrent.futures
from datetime import datetime, timezone, timedelta
import numpy as np

END_DT=datetime(2026,10,7,tzinfo=timezone.utc)
START_DT=END_DT-timedelta(days=1095)
SPLIT_DT=END_DT-timedelta(days=365)
START=int(START_DT.timestamp()*1000); END=int(END_DT.timestamp()*1000); SPLIT=int(SPLIT_DT.timestamp()*1000)
BASE="https://data.binance.vision/data/futures/um"
UA={"User-Agent":"spacehub-btc-rsi-gate-3y/1.0"}
COST=.0016  # 0.10% roundtrip fee + 0.04% slippage + 0.02% funding reserve
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
THRESHOLDS=[None,45,50,55]

def months_between(a,b):
 y,m=a.year,a.month; out=[]
 while (y,m)<=(b.year,b.month):
  out.append((y,m)); m+=1
  if m==13: y+=1; m=1
 return out
MONTHS=months_between(START_DT,END_DT)

def load_zip(url):
 try:
  req=urllib.request.Request(url,headers=UA)
  with urllib.request.urlopen(req,timeout=45) as r: raw=r.read()
  with zipfile.ZipFile(io.BytesIO(raw)) as z: txt=z.read(z.namelist()[0]).decode()
  out=[]
  for row in csv.reader(io.StringIO(txt)):
   if row and row[0].isdigit():
    t=int(row[0])
    if START<=t<END: out.append((t,float(row[1]),float(row[2]),float(row[3]),float(row[4]),float(row[5])))
  return out
 except Exception:
  return []

CACHE={}
def load_raw(sym,tf):
 key=(sym,tf)
 if key in CACHE:return CACHE[key]
 src="5m" if tf=="10m" else tf
 arr=[]
 for y,m in MONTHS:
  if (y,m)==(END_DT.year,END_DT.month): continue
  arr+=load_zip(f"{BASE}/monthly/klines/{sym}/{src}/{sym}-{src}-{y}-{m:02d}.zip")
 d=datetime(END_DT.year,END_DT.month,1,tzinfo=timezone.utc)
 while d<END_DT:
  arr+=load_zip(f"{BASE}/daily/klines/{sym}/{src}/{sym}-{src}-{d.year}-{d.month:02d}-{d.day:02d}.zip")
  d+=timedelta(days=1)
 arr=sorted({x[0]:x for x in arr}.values())
 if tf=="10m":
  z=[];i=0
  while i+1<len(arr):
   a,b=arr[i],arr[i+1]; bucket=(a[0]//600000)*600000
   if a[0]==bucket and b[0]==a[0]+300000:
    z.append((a[0],a[1],max(a[2],b[2]),min(a[3],b[3]),b[4],a[5]+b[5])); i+=2
   else:i+=1
  arr=z
 CACHE[key]=arr
 return arr

def rsi14(c):
 d=np.diff(c,prepend=c[0]); g=np.maximum(d,0); l=np.maximum(-d,0)
 ag=np.full(len(c),np.nan); al=np.full(len(c),np.nan)
 if len(c)>14:
  ag[14]=g[1:15].mean(); al[14]=l[1:15].mean()
  for i in range(15,len(c)):
   ag[i]=(ag[i-1]*13+g[i])/14; al[i]=(al[i-1]*13+l[i])/14
 rs=np.divide(ag,al,out=np.full(len(c),np.nan),where=al>0)
 return 100-100/(1+rs)

def sma(x,n):
 cs=np.cumsum(np.insert(x,0,0.)); y=(cs[n:]-cs[:-n])/n
 return np.r_[np.full(n-1,np.nan),y]

def signal_indices(b,s):
 if not b:return np.array([],dtype=int)
 a=np.array(b,float); t=a[:,0].astype(np.int64); o=a[:,1]; c=a[:,4]; v=a[:,5]
 n=s["n"]; idx=np.arange(n-1,len(b)-1)
 step={"1m":60000,"3m":180000,"5m":300000,"10m":600000,"15m":900000,"30m":1800000}[s["tf"]]
 ok=np.ones(len(idx),bool)
 for lag in range(n-1): ok&=(t[idx-lag]-t[idx-lag-1]==step)
 if s["kind"]=="red":
  for lag in range(n): ok&=(c[idx-lag]<o[idx-lag])
 elif s["kind"]=="fall":
  for lag in range(n-1): ok&=(c[idx-lag]<c[idx-lag-1])
 elif s["kind"]=="agt":
  ok&=(c[idx-2]>o[idx-2])&(c[idx-1]<o[idx-1])&(c[idx]<o[idx])&(c[idx]/o[idx-2]-1<=-.005)
  av=sma(v,20); ok&=np.isfinite(av[idx])&(v[idx]>=1.5*av[idx])
 elif s["kind"]=="lqty":
  rr=rsi14(c)
  ok&=(c[idx-2]<o[idx-2])&(c[idx-1]<o[idx-1])&(c[idx]<o[idx])&(c[idx]/o[idx-2]-1<=-.0075)&np.isfinite(rr[idx])&(rr[idx]<=40)
 return idx[ok]

def btc_gate():
 b=load_raw("BTCUSDT","5m")
 a=np.array(b,float); t=a[:,0].astype(np.int64); c=a[:,4]
 return t,rsi14(c)
BTC_T,BTC_R=btc_gate()

def btc_rsi_at(ts):
 j=np.searchsorted(BTC_T,ts,side="left")-1
 if j<0 or j>=len(BTC_R) or not np.isfinite(BTC_R[j]): return np.nan
 return float(BTC_R[j])

def eval_symbol(sym,s,threshold):
 b=load_raw(sym,s["tf"])
 if len(b)<100:return []
 a=np.array(b,float); t=a[:,0].astype(np.int64); h=a[:,2]; l=a[:,3]; c=a[:,4]
 idx=signal_indices(b,s); out=[]; last=-1
 H=s["hold"]; maxH=(H if H is not None else len(b))
 for i in idx:
  if i<=last:continue
  br=btc_rsi_at(t[i])
  if threshold is not None and (not np.isfinite(br) or br<threshold): continue
  e=c[i]; outcome=None; ex=None; px=None; limit=min(len(b)-1,i+maxH)
  for j in range(i+1,limit+1):
   hitS=l[j]<=e*(1-s["sl"]); hitT=h[j]>=e*(1+s["tp"])
   if hitS or hitT:
    if hitS: outcome="SL"; px=e*(1-s["sl"])
    else: outcome="TP"; px=e*(1+s["tp"])
    ex=j; break
  if outcome is None:
   if H is None: break
   outcome="TIME"; ex=limit; px=c[ex]
  net=px/e-1-COST
  out.append({"t":int(t[i]),"outcome":outcome,"net":float(net),"btc_rsi":br})
  last=ex
 return out

def metrics(trades):
 n=len(trades)
 if not n:return {"n":0,"wins":0,"wr":0,"pf":0,"avg_net_bps":0,"net_pct_sum":0}
 vals=np.array([x["net"] for x in trades]); wins=int((vals>0).sum())
 pos=float(vals[vals>0].sum()); neg=float(-vals[vals<0].sum())
 return {"n":n,"wins":wins,"wr":round(100*wins/n,2),"pf":round(pos/neg,3) if neg else 999,
         "avg_net_bps":round(10000*float(vals.mean()),2),"net_pct_sum":round(100*float(vals.sum()),2)}

def run_one(s):
 out={"strategy":s["name"],"tf":s["tf"],"thresholds":{}}
 for th in THRESHOLDS:
  alltr=[]
  for sym in s["symbols"]: alltr+=eval_symbol(sym,s,th)
  train=[x for x in alltr if x["t"]<SPLIT]; hold=[x for x in alltr if x["t"]>=SPLIT]
  out["thresholds"]["baseline" if th is None else f"BTC_RSI5>={th}"]={"train":metrics(train),"holdout":metrics(hold),"all3y":metrics(alltr)}
 return out

with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:
 results=list(ex.map(run_one,STRATS))

def aggregate(key,period):
 allm=[]
 for r in results:
  # metrics can't be recombined exactly; collect by re-evaluating trades below
  pass
 trades=[]
 for s in STRATS:
  th=None if key=="baseline" else int(key.split(">=")[1])
  for sym in s["symbols"]: trades+=eval_symbol(sym,s,th)
 if period=="train": trades=[x for x in trades if x["t"]<SPLIT]
 elif period=="holdout": trades=[x for x in trades if x["t"]>=SPLIT]
 return metrics(trades)

agg={}
for key in ["baseline","BTC_RSI5>=45","BTC_RSI5>=50","BTC_RSI5>=55"]:
 agg[key]={"train":aggregate(key,"train"),"holdout":aggregate(key,"holdout"),"all3y":aggregate(key,"all3y")}

report={"window":{"start":START_DT.isoformat(),"split":SPLIT_DT.isoformat(),"end_exclusive":END_DT.isoformat()},
 "cost_roundtrip_pct":COST*100,
 "method":"same active LONG strategies and symbol sets as scripts/backtest-3year-all-active.py; non-overlapping same-symbol trades; same-bar TP+SL=SL; BTC gate uses last completed BTCUSDT 5m RSI(14); first 2y train + last 1y holdout",
 "aggregate":agg,"results":results}
with open("status/btc-rsi-gate-3y.json","w") as f: json.dump(report,f,indent=2)
print("BTC_RSI_GATE_START")
print(json.dumps(report["aggregate"],indent=2))
print("BTC_RSI_GATE_END")

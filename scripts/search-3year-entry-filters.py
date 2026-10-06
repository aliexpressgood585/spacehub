import csv,io,json,urllib.request,zipfile,math,concurrent.futures
from datetime import datetime,timezone,timedelta
import numpy as np

END_DT=datetime(2026,10,6,tzinfo=timezone.utc)
START_DT=END_DT-timedelta(days=1095)
SPLIT_DT=END_DT-timedelta(days=365)
START=int(START_DT.timestamp()*1000); END=int(END_DT.timestamp()*1000); SPLIT=int(SPLIT_DT.timestamp()*1000)
BASE="https://data.binance.vision/data/futures/um"; UA={"User-Agent":"spacehub-3y-filter-search/1.0"}
COST=.0016
TP_LEVELS=[.005,.0075,.01,.0125,.015,.02]
SL_LEVELS=[.005,.0075,.01,.0125,.015,.02,.025]
TOP10=["ANKRUSDT","ARKUSDT","1000000MOGUSDT","AGTUSDT","SUSHIUSDT","LQTYUSDT","HYPERUSDT","KAVAUSDT","LUMIAUSDT","ALPINEUSDT"]
STRATS=[
 {"name":"DDDDD_5M","tf":"5m","symbols":TOP10,"kind":"red","n":5,"hold":None},
 {"name":"R6_3M","tf":"3m","symbols":["KAVAUSDT","1000000MOGUSDT"],"kind":"red","n":6,"hold":None},
 {"name":"R7_3M","tf":"3m","symbols":["KAVAUSDT","LQTYUSDT","LUMIAUSDT"],"kind":"red","n":7,"hold":None},
 {"name":"FALL5_10M","tf":"10m","symbols":["KAVAUSDT"],"kind":"fall","n":5,"hold":None},
 {"name":"R6_10M","tf":"10m","symbols":["KAVAUSDT","SUSHIUSDT"],"kind":"red","n":6,"hold":None},
 {"name":"FALL7_15M","tf":"15m","symbols":["ANKRUSDT","1000000MOGUSDT","SUSHIUSDT","HYPERUSDT","LUMIAUSDT"],"kind":"fall","n":7,"hold":None},
 {"name":"FALL5_30M","tf":"30m","symbols":["KAVAUSDT"],"kind":"fall","n":5,"hold":None},
 {"name":"FALL4_30M","tf":"30m","symbols":["ANKRUSDT"],"kind":"fall","n":4,"hold":None},
 {"name":"AGT_GRR_1M","tf":"1m","symbols":["AGTUSDT"],"kind":"agt","n":3,"hold":120},
 {"name":"LQTY_RRR_1M","tf":"1m","symbols":["LQTYUSDT"],"kind":"lqty","n":3,"hold":60},
]

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
 except:return []

def months(a,b):
 y,m=a.year,a.month;out=[]
 while (y,m)<=(b.year,b.month):
  out.append((y,m));m+=1
  if m==13:y+=1;m=1
 return out
MONTHS=months(START_DT,END_DT)
CACHE={}
def load(sym,tf):
 key=(sym,tf)
 if key in CACHE:return CACHE[key]
 src="5m" if tf=="10m" else tf;arr=[]
 for y,m in MONTHS:
  if (y,m)==(END_DT.year,END_DT.month):continue
  arr+=load_zip(f"{BASE}/monthly/klines/{sym}/{src}/{sym}-{src}-{y}-{m:02d}.zip")
 d=datetime(END_DT.year,END_DT.month,1,tzinfo=timezone.utc)
 while d<END_DT:
  arr+=load_zip(f"{BASE}/daily/klines/{sym}/{src}/{sym}-{src}-{d.year}-{d.month:02d}-{d.day:02d}.zip");d+=timedelta(days=1)
 arr=sorted({x[0]:x for x in arr}.values())
 if tf=="10m":
  z=[];i=0
  while i+1<len(arr):
   a,b=arr[i],arr[i+1];bucket=(a[0]//600000)*600000
   if a[0]==bucket and b[0]==a[0]+300000:z.append((a[0],a[1],max(a[2],b[2]),min(a[3],b[3]),b[4],a[5]+b[5]));i+=2
   else:i+=1
  arr=z
 CACHE[key]=arr;return arr

def ema(x,n):
 a=2/(n+1);y=np.empty(len(x));y[0]=x[0]
 for i in range(1,len(x)):y[i]=a*x[i]+(1-a)*y[i-1]
 return y
def sma(x,n):
 cs=np.cumsum(np.insert(x,0,0.));return np.r_[np.full(n-1,np.nan),(cs[n:]-cs[:-n])/n]
def rsi14(c):
 d=np.diff(c,prepend=c[0]);g=np.maximum(d,0);l=np.maximum(-d,0);ag=np.full(len(c),np.nan);al=np.full(len(c),np.nan)
 if len(c)>14:
  ag[14]=g[1:15].mean();al[14]=l[1:15].mean()
  for i in range(15,len(c)):ag[i]=(ag[i-1]*13+g[i])/14;al[i]=(al[i-1]*13+l[i])/14
 rs=np.divide(ag,al,out=np.full(len(c),np.nan),where=al>0);return 100-100/(1+rs)
def atr14(h,l,c):
 pc=np.r_[c[0],c[:-1]];tr=np.maximum(h-l,np.maximum(abs(h-pc),abs(l-pc)));return sma(tr,14)

def base_signals(a,s):
 t=a[:,0].astype(np.int64);o=a[:,1];c=a[:,4];v=a[:,5];n=s["n"];idx=np.arange(n-1,len(a)-1)
 step={"1m":60000,"3m":180000,"5m":300000,"10m":600000,"15m":900000,"30m":1800000}[s["tf"]];ok=np.ones(len(idx),bool)
 for lag in range(n-1):ok&=(t[idx-lag]-t[idx-lag-1]==step)
 if s["kind"]=="red":
  for lag in range(n):ok&=(c[idx-lag]<o[idx-lag])
 elif s["kind"]=="fall":
  for lag in range(n-1):ok&=(c[idx-lag]<c[idx-lag-1])
 elif s["kind"]=="agt":
  ok&=(c[idx-2]>o[idx-2])&(c[idx-1]<o[idx-1])&(c[idx]<o[idx])&(c[idx]/o[idx-2]-1<=-.005);av=sma(v,20);ok&=np.isfinite(av[idx])&(v[idx]>=1.5*av[idx])
 elif s["kind"]=="lqty":
  rr=rsi14(c);ok&=(c[idx-2]<o[idx-2])&(c[idx-1]<o[idx-1])&(c[idx]<o[idx])&(c[idx]/o[idx-2]-1<=-.0075)&np.isfinite(rr[idx])&(rr[idx]<=40)
 return idx[ok]

def prep(sym,s):
 b=load(sym,s["tf"])
 if len(b)<100:return None
 a=np.array(b,float);t=a[:,0].astype(np.int64);o=a[:,1];h=a[:,2];l=a[:,3];c=a[:,4];v=a[:,5]
 idx=base_signals(a,s)
 r=rsi14(c);e20=ema(c,20);e50=ema(c,50);av=sma(v,20);at=atr14(h,l,c)
 feats={}
 feats["none"]=np.ones(len(idx),bool)
 for q in [30,35,40,45]:feats[f"RSI<={q}"]=r[idx]<=q
 for q in [1.25,1.5,2.0]:feats[f"VOL>={q}x"]=v[idx]>=av[idx]*q
 for q in [.002,.003,.005,.0075,.01]:feats[f"EMA20_DIST<={-q*100:.2f}%"]=(c[idx]/e20[idx]-1)<=-q
 for q in [.002,.003,.005,.0075]:feats[f"ATR%>={q*100:.2f}"]=at[idx]/c[idx]>=q
 feats["EMA20<EMA50"]=e20[idx]<e50[idx]
 feats["CLOSE<EMA20"]=c[idx]<e20[idx]
 feats["CLOSE<EMA50"]=c[idx]<e50[idx]
 for rq in [35,40]:
  for vq in [1.25,1.5]:
   feats[f"RSI<={rq}&VOL>={vq}x"]=(r[idx]<=rq)&(v[idx]>=av[idx]*vq)
 for rq in [35,40]:
  for dq in [.003,.005]:
   feats[f"RSI<={rq}&EMA20_DIST<={-dq*100:.2f}%"]=(r[idx]<=rq)&((c[idx]/e20[idx]-1)<=-dq)
 for vq in [1.25,1.5]:
  for dq in [.003,.005]:
   feats[f"VOL>={vq}x&EMA20_DIST<={-dq*100:.2f}%"]=(v[idx]>=av[idx]*vq)&((c[idx]/e20[idx]-1)<=-dq)
 valid=np.isfinite(r[idx])&np.isfinite(av[idx])&np.isfinite(at[idx])&np.isfinite(e20[idx])&np.isfinite(e50[idx])
 for k in list(feats):feats[k]&=valid
 return {"sym":sym,"t":t,"h":h,"l":l,"c":c,"idx":idx,"feats":feats}

def eval_one(P,mask,tp,sl,H):
 t=P["t"];h=P["h"];l=P["l"];c=P["c"];ids=P["idx"][mask];vals_tr=[];vals_va=[];tp_tr=sl_tr=to_tr=tp_va=sl_va=to_va=0;last=-1
 for i in ids:
  if i<=last:continue
  e=c[i];limit=min(len(c)-1,i+(H if H is not None else len(c)-i-1));kind=None
  for j in range(i+1,limit+1):
   hitS=l[j]<=e*(1-sl);hitT=h[j]>=e*(1+tp)
   if hitS or hitT:
    if hitS:kind="sl";net=-sl-COST
    else:kind="tp";net=tp-COST
    last=j;break
  if kind is None:
   if H is None:break
   last=limit;kind="to";net=c[limit]/e-1-COST
  if t[i]<SPLIT:
   vals_tr.append(net);tp_tr+=kind=="tp";sl_tr+=kind=="sl";to_tr+=kind=="to"
  else:
   vals_va.append(net);tp_va+=kind=="tp";sl_va+=kind=="sl";to_va+=kind=="to"
 def met(vals,tpN,slN,toN):
  if not vals:return {"n":0,"wr":0,"pf":0,"avg_bps":0,"tp":0,"sl":0,"timeouts":0}
  x=np.array(vals);pos=x[x>0].sum();neg=-x[x<0].sum()
  return {"n":len(vals),"wr":100*tpN/len(vals),"pf":float(pos/neg) if neg else 999,"avg_bps":10000*x.mean(),"tp":tpN,"sl":slN,"timeouts":toN}
 return met(vals_tr,tp_tr,sl_tr,to_tr),met(vals_va,tp_va,sl_va,to_va)

def combine(parts):
 vals=[]
 n=sum(x["n"] for x in parts)
 if not n:return {"n":0,"wr":0,"pf":0,"avg_bps":0}
 # combine PF exactly from per-part PF + avg is not reconstructible; reconstruct positive/negative from counts only when no timeouts.
 tp=sum(x["tp"] for x in parts);sl=sum(x["sl"] for x in parts);to=sum(x["timeouts"] for x in parts)
 avg=sum(x["avg_bps"]*x["n"] for x in parts)/n
 # for timeout-free legacy strategies exact from fixed outcomes
 return {"n":n,"wr":100*tp/n,"avg_bps":avg,"tp":tp,"sl":sl,"timeouts":to}

def exact_pf(m,tp,sl):
 if m["timeouts"]:return None
 pos=m["tp"]*(tp-COST);neg=m["sl"]*(sl+COST)
 return pos/neg if neg else 999

def run(s):
 pre=[prep(sym,s) for sym in s["symbols"]];pre=[x for x in pre if x]
 filter_names=sorted(set.intersection(*[set(P["feats"].keys()) for P in pre])) if pre else []
 hits=[]
 for filt in filter_names:
  for tp in TP_LEVELS:
   for sl in SL_LEVELS:
    parts=[eval_one(P,P["feats"][filt],tp,sl,s["hold"]) for P in pre]
    tr=combine([x[0] for x in parts]);va=combine([x[1] for x in parts]);tr["pf"]=exact_pf(tr,tp,sl);va["pf"]=exact_pf(va,tp,sl)
    if tr["n"]<100 or va["n"]<50:continue
    row={"filter":filt,"tp_pct":round(tp*100,3),"sl_pct":round(sl*100,3),
         "train":{k:(round(v,3) if isinstance(v,float) else v) for k,v in tr.items()},
         "validate":{k:(round(v,3) if isinstance(v,float) else v) for k,v in va.items()}}
    # robust profitability; for timeout strategies PF omitted from aggregate, avg must be positive in both
    pfok=(tr["pf"] is None or tr["pf"]>1.0) and (va["pf"] is None or va["pf"]>1.0)
    if tr["wr"]>=57 and va["wr"]>=57 and tr["avg_bps"]>0 and va["avg_bps"]>0 and pfok:hits.append(row)
 hits.sort(key=lambda x:(min(x["train"]["avg_bps"],x["validate"]["avg_bps"]),min(x["train"]["wr"],x["validate"]["wr"]),x["validate"]["n"]),reverse=True)
 return {"strategy":s["name"],"tf":s["tf"],"robust":hits[:10]}

results=[]
for s in STRATS:
 print("FILTER_SEARCH",s["name"],flush=True)
 results.append(run(s))
print("FILTER3Y_START")
print(json.dumps({"window":{"start":START_DT.isoformat(),"split":SPLIT_DT.isoformat(),"end":END_DT.isoformat()},"cost_roundtrip_pct":COST*100,"method":"same base strategies; RSI/volume/ATR/EMA filters and combinations; TP/SL grid; first 2y discovery + last 1y holdout; non-overlapping per symbol; same-bar conflict=SL","results":results},indent=2))
print("FILTER3Y_END")
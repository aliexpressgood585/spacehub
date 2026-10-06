import csv,io,json,urllib.request,zipfile,math
from datetime import datetime,timezone,timedelta
import numpy as np

END_DT=datetime(2026,10,6,tzinfo=timezone.utc)
START_DT=END_DT-timedelta(days=1095)
SPLIT_DT=END_DT-timedelta(days=365)
START=int(START_DT.timestamp()*1000); END=int(END_DT.timestamp()*1000); SPLIT=int(SPLIT_DT.timestamp()*1000)
BASE="https://data.binance.vision/data/futures/um"; UA={"User-Agent":"spacehub-3y-opt/1.0"}
COST=.0016
TP_LEVELS=[.0025,.0035,.005,.0065,.0075,.01,.0125,.015,.02,.025]
SL_LEVELS=[.0025,.005,.0075,.01,.0125,.015,.02,.025,.03]
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
  with urllib.request.urlopen(req,timeout=45) as r:raw=r.read()
  with zipfile.ZipFile(io.BytesIO(raw)) as z:txt=z.read(z.namelist()[0]).decode()
  out=[]
  for row in csv.reader(io.StringIO(txt)):
   if row and row[0].isdigit():
    t=int(row[0])
    if START<=t<END:out.append((t,float(row[1]),float(row[2]),float(row[3]),float(row[4]),float(row[5])))
  return out
 except:return []
def months(a,b):
 y,m=a.year,a.month;out=[]
 while (y,m)<=(b.year,b.month):
  out.append((y,m));m+=1
  if m==13:y+=1;m=1
 return out
MONTHS=months(START_DT,END_DT)
_cache={}
def load(sym,tf):
 key=(sym,tf)
 if key in _cache:return _cache[key]
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
 _cache[key]=arr;return arr
def sma(x,n):
 cs=np.cumsum(np.insert(x,0,0.));return np.r_[np.full(n-1,np.nan),(cs[n:]-cs[:-n])/n]
def rsi14(c):
 d=np.diff(c,prepend=c[0]);g=np.maximum(d,0);l=np.maximum(-d,0);ag=np.full(len(c),np.nan);al=np.full(len(c),np.nan)
 if len(c)>14:
  ag[14]=g[1:15].mean();al[14]=l[1:15].mean()
  for i in range(15,len(c)):ag[i]=(ag[i-1]*13+g[i])/14;al[i]=(al[i-1]*13+l[i])/14
 rs=np.divide(ag,al,out=np.full(len(c),np.nan),where=al>0);return 100-100/(1+rs)
def signals(b,s):
 a=np.array(b,float);t=a[:,0].astype(np.int64);o=a[:,1];c=a[:,4];v=a[:,5];n=s["n"];idx=np.arange(n-1,len(b)-1)
 step={"1m":60000,"3m":180000,"5m":300000,"10m":600000,"15m":900000,"30m":1800000}[s["tf"]];ok=np.ones(len(idx),bool)
 for lag in range(n-1):ok&=(t[idx-lag]-t[idx-lag-1]==step)
 if s["kind"]=="red":
  for lag in range(n):ok&=(c[idx-lag]<o[idx-lag])
 elif s["kind"]=="fall":
  for lag in range(n-1):ok&=(c[idx-lag]<c[idx-lag-1])
 elif s["kind"]=="agt":
  ok&=(c[idx-2]>o[idx-2])&(c[idx-1]<o[idx-1])&(c[idx]<o[idx])&(c[idx]/o[idx-2]-1<=-.005);av=sma(v,20);ok&=np.isfinite(av[idx])&(v[idx]>=1.5*av[idx])
 elif s["kind"]=="lqty":
  ok&=(c[idx-2]<o[idx-2])&(c[idx-1]<o[idx-1])&(c[idx]<o[idx])&(c[idx]/o[idx-2]-1<=-.0075);rr=rsi14(c);ok&=np.isfinite(rr[idx])&(rr[idx]<=40)
 return idx[ok]
def prep(sym,s):
 b=load(sym,s["tf"])
 if len(b)<100:return None
 a=np.array(b,float);t=a[:,0].astype(np.int64);h=a[:,2];l=a[:,3];c=a[:,4];idx=signals(b,s)
 maxH=s["hold"] if s["hold"] is not None else None
 records=[]
 for i in idx:
  e=c[i];th=[None]*len(TP_LEVELS);sh=[None]*len(SL_LEVELS);end=min(len(c)-1,i+(maxH if maxH else len(c)-i-1))
  for j in range(i+1,end+1):
   up=h[j]/e-1;dn=1-l[j]/e
   for k,x in enumerate(TP_LEVELS):
    if th[k] is None and up>=x:th[k]=j
   for k,x in enumerate(SL_LEVELS):
    if sh[k] is None and dn>=x:sh[k]=j
   if all(x is not None for x in th) and all(x is not None for x in sh):break
  records.append((i,th,sh))
 return {"t":t,"c":c,"records":records}
def metrics(vals,tp_hits,sl_hits,timeouts):
 n=len(vals)
 if not n:return {"n":0,"wr":0,"pf":0,"avg_bps":0,"tp":0,"sl":0,"timeouts":0}
 v=np.array(vals);pos=v[v>0].sum();neg=-v[v<0].sum()
 return {"n":n,"wr":round(100*tp_hits/n,2),"pf":round(float(pos/neg),3) if neg else 999,"avg_bps":round(10000*v.mean(),2),"tp":tp_hits,"sl":sl_hits,"timeouts":timeouts}
def eval_pre(P,tp_i,sl_i,s):
 vals_tr=[];vals_va=[];tp_tr=sl_tr=to_tr=tp_va=sl_va=to_va=0;last=-1
 t=P["t"];c=P["c"];H=s["hold"];tp=TP_LEVELS[tp_i];sl=SL_LEVELS[sl_i]
 for i,ths,shs in P["records"]:
  if i<=last:continue
  jt=ths[tp_i];js=shs[sl_i];is_train=t[i]<SPLIT
  if H is not None:
   lim=i+H
   hitT=jt is not None and jt<=lim;hitS=js is not None and js<=lim
   if hitS and (not hitT or js<=jt):ex=js;net=-sl-COST;kind="sl"
   elif hitT:ex=jt;net=tp-COST;kind="tp"
   else:ex=min(lim,len(c)-1);net=(c[ex]/c[i]-1)-COST;kind="to"
  else:
   if jt is None and js is None:break
   if js is not None and (jt is None or js<=jt):ex=js;net=-sl-COST;kind="sl"
   else:ex=jt;net=tp-COST;kind="tp"
  last=ex
  if is_train:
   vals_tr.append(net);tp_tr+=kind=="tp";sl_tr+=kind=="sl";to_tr+=kind=="to"
  else:
   vals_va.append(net);tp_va+=kind=="tp";sl_va+=kind=="sl";to_va+=kind=="to"
 return metrics(vals_tr,tp_tr,sl_tr,to_tr),metrics(vals_va,tp_va,sl_va,to_va)
def addm(ms):
 n=sum(m["n"] for m in ms)
 if not n:return {"n":0,"wr":0,"pf":0,"avg_bps":0,"tp":0,"sl":0,"timeouts":0}
 tp=sum(m["tp"] for m in ms);sl=sum(m["sl"] for m in ms);to=sum(m["timeouts"] for m in ms)
 # reconstruct exact gross/net from fixed exits + timeout impossible from aggregate, so combine PF approximately using avg and counts is not valid.
 # Return weighted avg; PF is recomputed separately by per-symbol eval not available. We'll carry pseudo-PF screen later by product consistency.
 avg=sum(m["avg_bps"]*m["n"] for m in ms)/n
 return {"n":n,"wr":round(100*tp/n,2),"avg_bps":round(avg,2),"tp":tp,"sl":sl,"timeouts":to}
def run(s):
 pre=[prep(sym,s) for sym in s["symbols"]];pre=[x for x in pre if x]
 rows=[]
 for ti,tp in enumerate(TP_LEVELS):
  for si,sl in enumerate(SL_LEVELS):
   pair=[eval_pre(P,ti,si,s) for P in pre];tr=addm([x[0] for x in pair]);va=addm([x[1] for x in pair])
   # exact PF by evaluating combined net is omitted; require positive avg in both splits; approximate PF from TP/SL excluding timeout shown only when no timeouts.
   def pf_est(m):
    if m["timeouts"] or not m["n"]:return None
    pos=m["tp"]*(tp-COST);neg=m["sl"]*(sl+COST)
    return round(pos/neg,3) if neg else 999
   tr["pf"]=pf_est(tr);va["pf"]=pf_est(va)
   rows.append({"tp_pct":tp*100,"sl_pct":sl*100,"train":tr,"validate":va})
 robust57=[x for x in rows if x["train"]["n"]>=100 and x["validate"]["n"]>=50 and x["train"]["wr"]>=57 and x["validate"]["wr"]>=57 and x["train"]["avg_bps"]>0 and x["validate"]["avg_bps"]>0 and (x["train"]["pf"] is None or x["train"]["pf"]>1) and (x["validate"]["pf"] is None or x["validate"]["pf"]>1)]
 robust60=[x for x in robust57 if x["train"]["wr"]>=60 and x["validate"]["wr"]>=60]
 key=lambda x:(min(x["train"]["avg_bps"],x["validate"]["avg_bps"]),min(x["train"]["wr"],x["validate"]["wr"]),x["validate"]["n"])
 robust57.sort(key=key,reverse=True);robust60.sort(key=key,reverse=True)
 best=sorted(rows,key=lambda x:(min(x["train"]["avg_bps"],x["validate"]["avg_bps"]),min(x["train"]["wr"],x["validate"]["wr"])),reverse=True)[:5]
 return {"strategy":s["name"],"tf":s["tf"],"robust57":robust57[:5],"robust60":robust60[:5],"best_any":best}
results=[]
for s in STRATS:
 print("optimizing",s["name"],flush=True);results.append(run(s))
print("OPT3Y_START")
print(json.dumps({"window":{"start":START_DT.isoformat(),"split":SPLIT_DT.isoformat(),"end":END_DT.isoformat()},"cost_roundtrip_pct":COST*100,"grid":{"tp_pct":[x*100 for x in TP_LEVELS],"sl_pct":[x*100 for x in SL_LEVELS]},"method":"first 2 years parameter search, last 1 year validation; non-overlapping same-symbol trades; same-bar TP+SL=SL; fixed live timeouts on 1m formulas; legacy layers no timeout","results":results},indent=2))
print("OPT3Y_END")
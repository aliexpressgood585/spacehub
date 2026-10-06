import csv,io,json,urllib.request,zipfile
from datetime import datetime,timezone
import numpy as np

START=int(datetime(2026,7,8,tzinfo=timezone.utc).timestamp()*1000)
END=int(datetime(2026,10,6,tzinfo=timezone.utc).timestamp()*1000)
SPLIT=int(datetime(2026,9,6,tzinfo=timezone.utc).timestamp()*1000)
BASE="https://data.binance.vision/data/futures/um"
UA={"User-Agent":"spacehub-strict-verify/1.0"}
FEE_RT=.001
SLIP_RT=.0004
COST_RT=FEE_RT+SLIP_RT

CASES=[
 {"name":"AGT_GRR_VOL","sym":"AGTUSDT","pattern":"GRR","ret_max":-.005,"vol_min":1.5,"rsi_max":None,"tp":.005,"sl":.02,"H":120},
 {"name":"LQTY_RRR_RSI","sym":"LQTYUSDT","pattern":"RRR","ret_max":-.0075,"vol_min":None,"rsi_max":40,"tp":.005,"sl":.02,"H":60},
]

def get(url):
 req=urllib.request.Request(url,headers=UA)
 with urllib.request.urlopen(req,timeout=30) as r:return r.read()

def loadzip(u):
 try:
  raw=get(u)
  with zipfile.ZipFile(io.BytesIO(raw)) as z: txt=z.read(z.namelist()[0]).decode()
  return [(int(x[0]),float(x[1]),float(x[2]),float(x[3]),float(x[4]),float(x[5])) for x in csv.reader(io.StringIO(txt)) if x and x[0].isdigit() and START<=int(x[0])<END]
 except:return []

def load(sym):
 a=[]
 for m in (7,8,9): a+=loadzip(f"{BASE}/monthly/klines/{sym}/1m/{sym}-1m-2026-{m:02d}.zip")
 for d in range(1,6): a+=loadzip(f"{BASE}/daily/klines/{sym}/1m/{sym}-1m-2026-10-{d:02d}.zip")
 return sorted({x[0]:x for x in a}.values())

def rsi(c,n=14):
 d=np.diff(c,prepend=c[0]);g=np.maximum(d,0);l=np.maximum(-d,0)
 ag=np.full(len(c),np.nan);al=np.full(len(c),np.nan)
 if len(c)>n:
  ag[n]=g[1:n+1].mean();al[n]=l[1:n+1].mean()
  for i in range(n+1,len(c)):
   ag[i]=(ag[i-1]*(n-1)+g[i])/n;al[i]=(al[i-1]*(n-1)+l[i])/n
 rs=np.divide(ag,al,out=np.full(len(c),np.nan),where=al>0)
 return 100-100/(1+rs)

def sma(x,n):
 cs=np.cumsum(np.insert(x,0,0.)); y=(cs[n:]-cs[:-n])/n
 return np.r_[np.full(n-1,np.nan),y]

def funding(sym):
 url=f"https://fapi.binance.com/fapi/v1/fundingRate?symbol={sym}&startTime={START}&endTime={END}&limit=1000"
 try:
  rows=json.loads(get(url).decode())
  return [(int(x["fundingTime"]),float(x["fundingRate"])) for x in rows]
 except:return []

def signal_idx(t,o,c,v,case):
 p=case["pattern"];n=len(p);col=np.where(c>o,"G",np.where(c<o,"R","X"))
 idx=np.arange(n-1,len(t)-case["H"])
 ok=np.ones(len(idx),bool)
 for lag in range(n-1):ok&=(t[idx-lag]-t[idx-lag-1]==60000)
 for k,ch in enumerate(p):ok&=(col[idx-(n-1-k)]==ch)
 ret=c[idx]/o[idx-(n-1)]-1
 ok&=ret<=case["ret_max"]
 if case["vol_min"] is not None:
  av=sma(v,20);ok&=np.isfinite(av[idx])&(v[idx]>=av[idx]*case["vol_min"])
 if case["rsi_max"] is not None:
  rr=rsi(c);ok&=np.isfinite(rr[idx])&(rr[idx]<=case["rsi_max"])
 return idx[ok]

def simulate(t,o,h,l,c,v,case,funds):
 idx=signal_idx(t,o,c,v,case); trades=[];last_exit=-1
 for i in idx:
  if i<=last_exit: continue
  e=c[i]; tp=e*(1+case["tp"]); sl=e*(1-case["sl"]); outcome="TIME"; ex=i+case["H"]; px=c[ex]
  for j in range(i+1,min(len(c),i+case["H"]+1)):
   hitS=l[j]<=sl; hitT=h[j]>=tp
   if hitS or hitT:
    if hitS:
     outcome="SL";ex=j;px=sl
    else:
     outcome="TP";ex=j;px=tp
    break
  gross=px/e-1
  # long pays positive funding, receives negative funding
  fsum=sum(rate for ft,rate in funds if t[i]<ft<=t[ex])
  net=gross-COST_RT-fsum
  trades.append((i,ex,outcome,net,fsum))
  last_exit=ex
 return trades

def met(tr,t):
 if not tr:return {"n":0}
 n=len(tr);tp=sum(x[2]=="TP" for x in tr);sl=sum(x[2]=="SL" for x in tr);to=n-tp-sl
 vals=np.array([x[3] for x in tr]);pos=vals[vals>0].sum();neg=-vals[vals<0].sum()
 return {"n":n,"tp_first":tp,"sl_first":sl,"timeouts":to,
  "tp_first_rate_pct":round(100*tp/n,2),
  "resolved_tp_rate_pct":round(100*tp/max(1,tp+sl),2),
  "net_win_rate_pct":round(100*(vals>0).mean(),2),
  "pf_net":round(float(pos/neg),3) if neg>0 else 999,
  "avg_net_bps":round(10000*vals.mean(),2),
  "net_pct_sum":round(100*vals.sum(),2),
  "funding_bps_sum":round(10000*sum(x[4] for x in tr),2)}

out=[]
for case in CASES:
 b=load(case["sym"]);a=np.array(b,float);t=a[:,0].astype(np.int64);o=a[:,1];h=a[:,2];l=a[:,3];c=a[:,4];v=a[:,5]
 fs=funding(case["sym"]);tr=simulate(t,o,h,l,c,v,case,fs)
 first=[x for x in tr if t[x[0]]<SPLIT];last=[x for x in tr if t[x[0]]>=SPLIT]
 out.append({"case":case,"assumptions":{"fee_roundtrip_pct":FEE_RT*100,"slippage_roundtrip_pct":SLIP_RT*100,"funding":"actual Binance funding events crossed by each trade","same_bar_tp_sl":"SL first","timeouts":"closed at H-minute close and count as non-TP for strict TP-first rate"},"all90":met(tr,t),"first60":met(first,t),"last30":met(last,t)})
print("STRICT_VERIFY_START");print(json.dumps(out,indent=2));print("STRICT_VERIFY_END")

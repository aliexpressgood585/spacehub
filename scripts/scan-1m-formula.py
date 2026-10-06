import csv,io,json,urllib.request,zipfile,concurrent.futures,math
from datetime import datetime,timezone
import numpy as np

SYMS=["ANKRUSDT","ARKUSDT","1000000MOGUSDT","AGTUSDT","SUSHIUSDT","LQTYUSDT","HYPERUSDT","KAVAUSDT","LUMIAUSDT","ALPINEUSDT"]
START=int(datetime(2026,7,8,tzinfo=timezone.utc).timestamp()*1000)
END=int(datetime(2026,10,6,tzinfo=timezone.utc).timestamp()*1000)
SPLIT=int(datetime(2026,9,6,tzinfo=timezone.utc).timestamp()*1000)
BASE="https://data.binance.vision/data/futures/um"; UA={"User-Agent":"spacehub-formula/1.0"}
FEE=.001; TPS=[.005,.0075,.01,.0125,.015,.02]; SLS=[.005,.0075,.01,.0125,.015,.02]; HS=[30,60,120]; MAXH=max(HS)
PATS=["R","RR","RRR","GRR","RGR","GGR"]

def loadzip(u):
 try:
  req=urllib.request.Request(u,headers=UA)
  with urllib.request.urlopen(req,timeout=30) as r: raw=r.read()
  with zipfile.ZipFile(io.BytesIO(raw)) as z: txt=z.read(z.namelist()[0]).decode()
  return [(int(x[0]),float(x[1]),float(x[2]),float(x[3]),float(x[4]),float(x[5])) for x in csv.reader(io.StringIO(txt)) if x and x[0].isdigit() and START<=int(x[0])<END]
 except:return []

def load(sym):
 a=[]
 for m in (7,8,9): a+=loadzip(f"{BASE}/monthly/klines/{sym}/1m/{sym}-1m-2026-{m:02d}.zip")
 for d in range(1,6): a+=loadzip(f"{BASE}/daily/klines/{sym}/1m/{sym}-1m-2026-10-{d:02d}.zip")
 return sorted({x[0]:x for x in a}.values())

def ema(x,n):
 a=2/(n+1); y=np.empty(len(x)); y[0]=x[0]
 for i in range(1,len(x)): y[i]=a*x[i]+(1-a)*y[i-1]
 return y

def rsi(c,n=14):
 d=np.diff(c,prepend=c[0]); g=np.maximum(d,0); q=np.maximum(-d,0)
 ag=np.zeros(len(c)); al=np.zeros(len(c)); ag[:n]=np.nan; al[:n]=np.nan
 if len(c)>n:
  ag[n]=g[1:n+1].mean();al[n]=q[1:n+1].mean()
  for i in range(n+1,len(c)):
   ag[i]=(ag[i-1]*(n-1)+g[i])/n; al[i]=(al[i-1]*(n-1)+q[i])/n
 rs=np.divide(ag,al,out=np.full(len(c),np.nan),where=al>0)
 return 100-100/(1+rs)

def sma(x,n):
 cs=np.cumsum(np.insert(x,0,0.)); y=(cs[n:]-cs[:-n])/n
 return np.r_[np.full(n-1,np.nan),y]

def atr(h,l,c,n=14):
 pc=np.r_[c[0],c[:-1]]; tr=np.maximum(h-l,np.maximum(abs(h-pc),abs(l-pc)));return sma(tr,n)

def patidx(t,o,c,p):
 n=len(p); idx=np.arange(n-1,len(t)-MAXH); ok=np.ones(len(idx),bool)
 col=np.where(c>o,"G",np.where(c<o,"R","X"))
 for lag in range(n-1):ok&=(t[idx-lag]-t[idx-lag-1]==60000)
 for k,ch in enumerate(p):ok&=(col[idx-(n-1-k)]==ch)
 return idx[ok]

def firsthits(c,h,l,levels):
 N=len(c);INF=32767;up={x:np.full(N,INF,dtype=np.int16) for x in levels};dn={x:np.full(N,INF,dtype=np.int16) for x in levels}
 for off in range(1,MAXH+1):
  n=N-off;base=c[:n];hi=h[off:];lo=l[off:]
  for x in levels:
   z=up[x][:n];m=(z==INF)&(hi>=base*(1+x));z[m]=off
   z=dn[x][:n];m=(z==INF)&(lo<=base*(1-x));z[m]=off
 return up,dn

def outcome(idx,c,up,dn,tp,sl,H):
 jt=up[tp][idx].astype(int);js=dn[sl][idx].astype(int);hitT=jt<=H;hitS=js<=H
 stop=hitS&(~hitT|(js<=jt));targ=hitT&~stop;off=np.where(stop,js,np.where(targ,jt,H))
 vals=np.empty(len(idx));vals[stop]=-sl-FEE;vals[targ]=tp-FEE
 q=~(stop|targ)
 if q.any():
  ii=idx[q];vals[q]=(c[ii+H]/c[ii]-1)-FEE
 return vals,off

def nonoverlap(idx,vals,off):
 keep=[];v=[];last=-1
 for j,i in enumerate(idx):
  if i<=last:continue
  keep.append(i);v.append(vals[j]);last=i+int(off[j])
 return np.array(keep,int),np.array(v,float)

def met(vals):
 if len(vals)==0:return {"n":0,"wins":0,"wr":0,"pf":0,"avg_bps":0,"net_pct":0}
 w=vals>0;pos=vals[w].sum();neg=-vals[vals<0].sum()
 return {"n":len(vals),"wins":int(w.sum()),"wr":round(100*w.mean(),2),"pf":round(float(pos/neg),3) if neg else 999,"avg_bps":round(10000*vals.mean(),2),"net_pct":round(100*vals.sum(),2)}

def rules(idx,c,o,v,rs,e20,e50,at,p):
 n=len(p);ret=(c[idx]/o[idx-(n-1)]-1)*100;ed=(c[idx]/e20[idx]-1)*100;vr=v[idx]/sma(v,20)[idx];ap=at[idx]/c[idx]*100
 out=[("base",np.ones(len(idx),bool))]
 for x in [20,25,30,35,40,45]:out.append((f"RSI<={x}",rs[idx]<=x))
 for x in [-.1,-.2,-.3,-.5,-.75,-1.0]:out.append((f"RET<={x}%",ret<=x))
 for x in [-.1,-.25,-.5,-.75,-1.0]:out.append((f"EMA20_DIST<={x}%",ed<=x))
 for x in [1.0,1.25,1.5,2.0]:out.append((f"VOL>={x}x",vr>=x))
 for x in [.1,.2,.3,.5]:out.append((f"ATR%>={x}",ap>=x))
 out += [("EMA20<EMA50",e20[idx]<e50[idx]),("EMA20>EMA50",e20[idx]>e50[idx])]
 for r in [25,30,35,40]:
  for z in [-.2,-.3,-.5,-.75]:
   out.append((f"RSI<={r}&RET<={z}%",(rs[idx]<=r)&(ret<=z)))
 for r in [25,30,35,40]:
  for z in [-.25,-.5,-.75]:
   out.append((f"RSI<={r}&EMA20_DIST<={z}%",(rs[idx]<=r)&(ed<=z)))
 for z in [-.2,-.3,-.5,-.75]:
  for q in [1.25,1.5,2.0]:
   out.append((f"RET<={z}%&VOL>={q}x",(ret<=z)&(vr>=q)))
 for r in [25,30,35,40]:
  for q in [1.25,1.5,2.0]:
   out.append((f"RSI<={r}&VOL>={q}x",(rs[idx]<=r)&(vr>=q)))
 return out

def scan(sym):
 b=load(sym);a=np.array(b,float);t=a[:,0].astype(np.int64);o=a[:,1];h=a[:,2];l=a[:,3];c=a[:,4];v=a[:,5]
 rs=rsi(c);e20=ema(c,20);e50=ema(c,50);at=atr(h,l,c);up,dn=firsthits(c,h,l,sorted(set(TPS+SLS)))
 candidates=[]
 for p in PATS:
  base=patidx(t,o,c,p)
  for rn,mask in rules(base,c,o,v,rs,e20,e50,at,p):
   idx=base[mask & np.isfinite(rs[base]) & np.isfinite(at[base])]
   first=idx[t[idx]<SPLIT]
   if len(first)<120:continue
   for tp in TPS:
    for sl in SLS:
     for H in HS:
      vals,off=outcome(first,c,up,dn,tp,sl,H);ki,kv=nonoverlap(first,vals,off);m=met(kv)
      if m["n"]>=80 and m["wr"]>=57 and m["pf"]>1.02 and m["avg_bps"]>0.5:
       candidates.append({"sym":sym,"pattern":p,"rule":rn,"tp":tp,"sl":sl,"H":H,"train":m})
 candidates.sort(key=lambda x:(x["train"]["wr"],x["train"]["avg_bps"],x["train"]["n"]),reverse=True)
 verified=[]
 seen=set()
 for z in candidates[:250]:
  key=(z["pattern"],z["rule"],z["tp"],z["sl"],z["H"])
  if key in seen:continue
  seen.add(key)
  p,rn,tp,sl,H=key;base=patidx(t,o,c,p)
  rr=dict(rules(base,c,o,v,rs,e20,e50,at,p));idx=base[rr[rn] & np.isfinite(rs[base]) & np.isfinite(at[base])]
  vals,off=outcome(idx,c,up,dn,tp,sl,H);ki,kv=nonoverlap(idx,vals,off);ts=t[ki]
  A=met(kv);F=met(kv[ts<SPLIT]);L=met(kv[ts>=SPLIT])
  if L["n"]>=30 and L["wr"]>=57 and L["pf"]>1.0 and L["avg_bps"]>0:
   verified.append({**z,"all90":A,"first60":F,"last30":L})
 verified.sort(key=lambda x:(min(x["first60"]["wr"],x["last30"]["wr"]),min(x["first60"]["avg_bps"],x["last30"]["avg_bps"]),x["all90"]["n"]),reverse=True)
 return {"sym":sym,"verified":verified[:30],"train_candidates":len(candidates)}

with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:res=list(ex.map(scan,SYMS))
allv=[x for r in res for x in r["verified"]]
allv.sort(key=lambda x:(min(x["first60"]["wr"],x["last30"]["wr"]),min(x["first60"]["avg_bps"],x["last30"]["avg_bps"]),x["all90"]["n"]),reverse=True)
print("FORMULA1M_START");print(json.dumps({"window":"2026-07-08 through 2026-10-05 UTC","fee_roundtrip_pct":.1,"selection":"first 60 days discovery, last 30 days validation; non-overlapping trades; same-bar TP+SL=SL","verified":allv[:50],"per_symbol_counts":[{"sym":r["sym"],"train_candidates":r["train_candidates"],"verified":len(r["verified"])} for r in res]},indent=2));print("FORMULA1M_END")

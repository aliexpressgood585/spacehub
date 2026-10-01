# v114bt-B — NEW SOURCE: Coinbase (US spot, USD) vs Binance (USDT) — the "Coinbase premium".
# Rules fixed BEFORE reading any result:
#   BTC, ETH; Coinbase 1m BTC-USD / ETH-USD vs Binance spot 1m; traded on Binance USDT-M futures.
#   prem = ln(coinbase) - ln(binance spot); premz = (prem - 24h mean) / 24h std. Decision every 15 min.
#   B1 premium CHANGE: dprem over the last L (15 / 60) min in the top decile of |dprem| (IS cut) -> trade sign(dprem),
#      hold H = 15 / 60 min  (US buyers pushing Coinbase above Binance first).
#   B2 premium LEVEL: |premz| >= 2 -> trade sign(premz), hold H = 15 / 60 min.
#   Cost 16 bps round trip, IS first 70% of days / OOS last 30%, t on daily sums. PASS = IS net>0, OOS net>0, OOS t>=2.
#   6 rows -> luck alone ~0.14 passes.
import json, zipfile, io, glob, os, numpy as np, pandas as pd
D=os.path.dirname(os.path.abspath(__file__)); COST=16e-4
def bn(kind,c):
    out=[]
    for f in sorted(glob.glob(f"{D}/{kind}/{c}-*.zip")):
        z=zipfile.ZipFile(f); raw=z.read(z.namelist()[0]).decode()
        if raw[:4]=='open': raw=raw.split('\n',1)[1]
        x=pd.read_csv(io.StringIO(raw),header=None,usecols=[0,4]); x.columns=['t','c']; out.append(x)
    x=pd.concat(out); t=x.t.astype('int64'); x['t']=np.where(t>1e14,t//1000,t)//60000
    return x.drop_duplicates('t').set_index('t').c.sort_index()
res=[]
for c in ('BTC','ETH'):
    cb=json.load(open(f"{D}/cb-{c}-USD.json")); cb=pd.Series({r[0]//60:r[4] for r in cb}).sort_index()
    sp,fu=bn('spot',c),bn('fut',c)
    j=pd.DataFrame({'cb':cb,'sp':sp,'fu':fu}).dropna()
    print(c,'rows',len(j),flush=True)
    prem=np.log(j.cb)-np.log(j.sp); m=prem.rolling(1440,min_periods=600).mean(); s=prem.rolling(1440,min_periods=600).std()
    premz=(prem-m)/s; lf=np.log(j.fu)
    for H in (15,60):
        fwd=lf.shift(-H)-lf
        for L in (15,60):
            d=pd.DataFrame({'dp':prem-prem.shift(L),'fwd':fwd}); d=d[(d.index%15)==0].dropna(); d['day']=d.index//1440
            res.append(('B1 prem change',c,L,H,d,'dp'))
        d=pd.DataFrame({'z':premz,'fwd':fwd}); d=d[(d.index%15)==0].dropna(); d['day']=d.index//1440
        res.append(('B2 prem level z>=2',c,0,H,d,'z'))
allday=np.sort(np.unique(np.concatenate([r[4].day.values for r in res]))); cut=allday[int(len(allday)*0.7)]
# pool BTC+ETH per (test, L, H)
from collections import defaultdict
pool=defaultdict(list)
for name,c,L,H,d,col in res:
    d=d.copy(); d['is']=d.day<cut
    if col=='dp': q=d[d['is']].dp.abs().quantile(0.9); m=d.dp.abs()>=q
    else: m=d.z.abs()>=2
    x=d[m].copy(); x['gross']=np.sign(x[col])*x.fwd; x['net']=x.gross-COST; pool[(name,L,H)].append(x)
print(f"\nIS days {int((allday<cut).sum())}, OOS days {int((allday>=cut).sum())}, cost 16 bps (BTC+ETH pooled)")
print(f"{'test':20s} L   H  | IS n  gross  net    t   | OOS n  gross  net    t   | PASS")
for (name,L,H),xs in pool.items():
    x=pd.concat(xs); line=[]
    for part in (True,False):
        y=x[x['is']==part]; dd=y.groupby('day').net.sum(); t=dd.mean()/dd.std()*np.sqrt(len(dd)) if len(dd)>2 else np.nan
        line.append((len(y),y.gross.mean()*1e4,y.net.mean()*1e4,t))
    a,b=line; ok=a[2]>0 and b[2]>0 and b[3]>=2
    print(f"{name:20s}{L:3d}{H:4d} |{a[0]:6d}{a[1]:7.2f}{a[2]:7.2f}{a[3]:7.2f} |{b[0]:6d}{b[1]:7.2f}{b[2]:7.2f}{b[3]:7.2f} | {'PASS' if ok else '-'}")

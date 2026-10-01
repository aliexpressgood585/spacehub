# v114bt-D — NEW SOURCE: Binance announcements (events, not prices), 2024-06 .. 2026-09.
# Rules fixed BEFORE reading any result:
#   SPOT_LIST ("Binance Will List X (X)") on a coin that ALREADY had a USDT-M perp -> LONG the perp.
#   SPOT_DELIST ("Binance Will Delist A, B on ...") -> SHORT the perp.  PERP_DELIST ("Binance Futures Will Delist ...") -> SHORT.
#   m0 = announcement minute. Entry = open of minute m0+2 (>= 60 s after the announcement; what a polling bot can get).
#   Exit = close of minute m0+1+H, H = 15 / 60 / 240. Cost 16 bps round trip (also shown at 40 bps: thin books at news).
#   IS = first 70% of announcements in time, OOS = last 30%. t over per-ANNOUNCEMENT mean returns (coins in one
#   announcement are not independent). PASS = IS net>0, OOS net>0, OOS t>=2. 9 rows -> luck alone ~0.2 passes.
import json, zipfile, io, glob, os, time, numpy as np, pandas as pd
D=os.path.dirname(os.path.abspath(__file__)); ev=json.load(open(f"{D}/events.json"))
cache={}
def bars(sym,ts):
    out=[]
    for dd in (0,1):
        day=time.strftime('%Y-%m-%d',time.gmtime(ts/1000+dd*86400))
        for p,k in ((sym,1),('1000'+sym,1000)):
            f=f"{D}/ev/{p}-{day}.zip"
            if os.path.exists(f):
                z=zipfile.ZipFile(f); raw=z.read(z.namelist()[0]).decode()
                if raw[:4]=='open': raw=raw.split('\n',1)[1]
                x=pd.read_csv(io.StringIO(raw),header=None,usecols=[0,1,4]); x.columns=['t','o','c']; x['t']=x.t//60000; out.append(x); break
    if not out: return None
    return pd.concat(out).drop_duplicates('t').set_index('t').sort_index()
rows=[]
for kind,ts,syms,title in ev:
    m0=ts//60000; sign=1 if kind=='SPOT_LIST' else -1
    for s in syms:
        b=bars(s,ts)
        if b is None or (m0-1) not in b.index or (m0+2) not in b.index: continue
        pre=b.c[m0-1]; ent=b.o[m0+2]; first=b.o.get(m0+1,np.nan)
        r={'kind':kind,'ts':ts,'sym':s,'react_1m':sign*(first/pre-1),'pre_entry':sign*(ent/pre-1)}
        for H in (15,60,240):
            ex=b.c.get(m0+1+H,np.nan); r[f'g{H}']=sign*(ex/ent-1)
        rows.append(r)
R=pd.DataFrame(rows); print(R.groupby('kind').size().to_string())
print("\nmove already done BEFORE a bot can enter (announcement -> entry, signed, bps):")
print((R.groupby('kind')[['react_1m','pre_entry']].median()*1e4).round(1).to_string())
anns=np.sort(R.ts.unique()); cut=anns[int(len(anns)*0.7)]; R['is']=R.ts<cut
print(f"\n{'kind':12s}  H  | IS ann  gross   net16  net40   t   | OOS ann  gross   net16  net40   t   | PASS")
for kind in ('SPOT_LIST','SPOT_DELIST','PERP_DELIST'):
    for H in (15,60,240):
        x=R[(R.kind==kind)].dropna(subset=[f'g{H}']); line=[]
        for part in (True,False):
            y=x[x['is']==part].groupby('ts')[f'g{H}'].mean()
            n=len(y); g=y.mean()*1e4 if n else np.nan; t=(y.mean()-16e-4)/y.std()*np.sqrt(n) if n>2 else np.nan
            line.append((n,g,g-16,g-40,t))
        a,b=line; ok=a[2]>0 and b[2]>0 and (b[4]>=2)
        print(f"{kind:12s}{H:4d} |{a[0]:5d}{a[1]:9.1f}{a[2]:8.1f}{a[3]:7.1f}{a[4]:6.2f} |{b[0]:6d}{b[1]:9.1f}{b[2]:8.1f}{b[3]:7.1f}{b[4]:6.2f} | {'PASS' if ok else '-'}")

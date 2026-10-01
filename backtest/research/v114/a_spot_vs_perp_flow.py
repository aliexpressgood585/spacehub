# v114bt-A — NEW SOURCE: Binance SPOT taker flow vs FUTURES taker flow (spot-led vs leverage-led moves).
# Rules fixed BEFORE reading any result:
#   10 coins, 1m spot + USDT-M futures, 2025-09 .. 2026-08. Decision every 15 min, features over the last L min
#   (L = 15, 60): TIs / TIf = taker imbalance (2*takerbuy - vol)/vol on spot / futures; D = TIs - TIf;
#   r = futures return over L; S = spot share of quote volume vs its trailing 7-day median.
#   A1 divergence: trade sign(D) when |D| is in the top decile (cut on IS only), hold H = 15 / 60 min.
#   A2 spot-led follow: |r|/sigma in the top quintile (IS cut), sign(TIs)==sign(r), S>=1 -> follow r.
#   A3 perp-led fade:  |r|/sigma top quintile, sign(TIs)!=sign(r) -> fade r.
#   Cost 16 bps round trip. IS first 70% of days, OOS last 30%. t on daily sums.
#   PASS = IS net > 0 and OOS net > 0 and OOS t >= 2. 12 rows -> luck alone ~0.3 passes.
import zipfile, io, glob, os, numpy as np, pandas as pd
D=os.path.dirname(os.path.abspath(__file__)); COST=16e-4
COINS=['BTC','ETH','SOL','XRP','DOGE','BNB','ADA','LINK','AVAX','SUI']
def load(kind,c):
    out=[]
    for f in sorted(glob.glob(f"{D}/{kind}/{c}-*.zip")):
        z=zipfile.ZipFile(f); raw=z.read(z.namelist()[0]).decode()
        if raw[:4]=='open': raw=raw.split('\n',1)[1]
        x=pd.read_csv(io.StringIO(raw),header=None,usecols=[0,4,5,7,9])
        x.columns=['t','c','v','q','tb']; out.append(x)
    x=pd.concat(out); t=x.t.astype('int64'); x['t']=np.where(t>1e14,t//1000,t)//60000
    return x.drop_duplicates('t').set_index('t').sort_index()
rows=[]
for c in COINS:
    s,f=load('spot',c),load('fut',c); j=f.join(s,rsuffix='_s',how='inner')
    for L in (15,60):
        roll=lambda col:j[col].rolling(L).sum()
        tis=(2*roll('tb_s')-roll('v_s'))/roll('v_s'); tif=(2*roll('tb')-roll('v'))/roll('v')
        qs,qf=roll('q_s'),roll('q'); share=qs/(qs+qf); S=share/share.rolling(7*1440,min_periods=1440).median()
        lr=np.log(j.c); r=lr-lr.shift(L); sig=lr.diff().rolling(1440,min_periods=600).std()*np.sqrt(L)
        for H in (15,60):
            fwd=lr.shift(-H)-lr
            d=pd.DataFrame({'D':tis-tif,'TIs':tis,'r':r,'rz':(r/sig).abs(),'S':S,'fwd':fwd})
            d=d[(d.index%15)==0].dropna(); d['coin']=c; d['L']=L; d['H']=H; d['day']=d.index//1440
            rows.append(d)
    print(c,len(j),flush=True)
A=pd.concat(rows); days=np.sort(A.day.unique()); cut=days[int(len(days)*0.7)]
A['is']=A.day<cut
def report(name,sel,sign):
    out=[]
    for part in (True,False):
        x=sel[sel['is']==part]; g=sign.loc[x.index] if False else None
    return out
res=[]
for (L,H),g in A.groupby(['L','H']):
    g=g.copy(); IS=g[g['is']]
    qD=IS.D.abs().quantile(0.9); qr=IS.rz.quantile(0.8)
    tests={
     'A1 divergence':(g.D.abs()>=qD, np.sign(g.D)),
     'A2 spot-led follow':((g.rz>=qr)&(np.sign(g.TIs)==np.sign(g.r))&(g.S>=1), np.sign(g.r)),
     'A3 perp-led fade':((g.rz>=qr)&(np.sign(g.TIs)!=np.sign(g.r)), -np.sign(g.r)),
    }
    for name,(m,sg) in tests.items():
        x=g[m].copy(); x['gross']=sg[m]*x.fwd; x['net']=x.gross-COST
        line={'test':name,'L':L,'H':H}
        for lab,part in (('IS',True),('OOS',False)):
            y=x[x['is']==part]; dd=y.groupby('day').net.sum()
            t=dd.mean()/dd.std()*np.sqrt(len(dd)) if len(dd)>2 and dd.std()>0 else np.nan
            line[lab]=(len(y),y.gross.mean()*1e4,y.net.mean()*1e4,t)
        line['PASS']=line['IS'][2]>0 and line['OOS'][2]>0 and line['OOS'][3]>=2
        res.append(line)
print(f"\nIS days {int((days<cut).sum())}, OOS days {int((days>=cut).sum())}, cost 16 bps")
print(f"{'test':22s} L   H  | IS n  gross  net   t    | OOS n  gross  net   t   | PASS")
for l in res:
    a,b=l['IS'],l['OOS']
    print(f"{l['test']:22s}{l['L']:3d}{l['H']:4d} |{a[0]:6d}{a[1]:7.2f}{a[2]:7.2f}{a[3]:6.2f} |{b[0]:6d}{b[1]:7.2f}{b[2]:7.2f}{b[3]:6.2f} | {'PASS' if l['PASS'] else '-'}")

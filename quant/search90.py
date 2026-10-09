#!/usr/bin/env python3
import numpy as np,json
from pathlib import Path
from quant.data.loader import load_bars
SYMS=["BTC","ETH","SOL","BNB","XRP","DOGE","ADA","AVAX","LINK","DOT"]; TFS=["1m","5m","10m"]; HOLD={"1m":60,"5m":12,"10m":6}
FEE=.0005; SLIP=.0002; out=[]
for tf in TFS:
 data={s:load_bars("backtest/data",s,tf) for s in SYMS}
 for side in ("LONG","SHORT"):
  for dev in (.001,.002,.003,.005,.0075,.01):
   for vm in (1.,1.5,2.):
    for tp in (.0015,.002,.0025,.003,.004,.005,.0075,.01,.015,.02):
     for sl in (.002,.003,.005,.0075,.01,.015,.02,.03):
      rows=[]
      for s,b in data.items():
       o,h,l,c,v=b.open,b.high,b.low,b.close,b.volume;i=23
       while i<len(c)-1:
        p=slice(i-20,i);vv=v[p].sum()
        if vv<=0:i+=1;continue
        vw=(((h[p]+l[p]+c[p])/3)*v[p]).sum()/vv; prior=np.sum(c[i-3:i]>o[i-3:i])
        sig=(l[i]<=vw*(1-dev) and c[i]>o[i] and prior<=1) if side=="LONG" else (h[i]>=vw*(1+dev) and c[i]<o[i] and prior>=2)
        if not(sig and v[i]>=v[p].mean()*vm):i+=1;continue
        ei=i+1;e=o[ei];t=e*(1+tp) if side=="LONG" else e*(1-tp);st=e*(1-sl) if side=="LONG" else e*(1+sl);xi=min(ei+HOLD[tf]-1,len(c)-1);xp=c[xi];win=False
        for j in range(ei,min(ei+HOLD[tf],len(c))):
         stop=l[j]<=st if side=="LONG" else h[j]>=st; hit=h[j]>=t if side=="LONG" else l[j]<=t
         if stop:xi=j;xp=st;break
         if hit:xi=j;xp=t;win=True;break
        gross=(xp-e)/e if side=="LONG" else (e-xp)/e;rows.append((int(b.t[i]),win,gross-2*(FEE+SLIP)));i=xi+1
      rows.sort();cut=int(len(rows)*.8);a,z=rows[:cut],rows[cut:]
      def S(x):
       return (len(x),100*sum(w for _,w,_ in x)/len(x) if x else 0,100*sum(p for *_,p in x)/len(x) if x else -999)
      an,aw,ae=S(a);zn,zw,ze=S(z)
      if an>=200 and zn>=50 and ae>0 and ze>0:out.append(dict(tf=tf,side=side,dev=dev,vol=vm,tp=tp,sl=sl,train_n=an,train_wr=round(aw,2),train_exp=round(ae,4),holdout_n=zn,holdout_wr=round(zw,2),holdout_exp=round(ze,4)))
out.sort(key=lambda x:(x["holdout_wr"],x["holdout_exp"]),reverse=True)
r={"tested_grid":3*2*6*3*10*8,"qualifying":len(out),"gte90":[x for x in out if x["holdout_wr"]>=90],"top":out[:25]}
Path("quant/reports").mkdir(exist_ok=True);Path("quant/reports/SEARCH90_REPORT.json").write_text(json.dumps(r,indent=2));print(json.dumps(r,indent=2))

#!/usr/bin/env python3
import json, numpy as np
from pathlib import Path
from quant.data.loader import load_bars

SYMS=["BTC","ETH","SOL","BNB","XRP","DOGE","ADA","AVAX","LINK","DOT"]
TFS=["1m","5m","10m"]; TP=.005; SL=.01

def test(b):
 o,h,l,c,v=b.open,b.high,b.low,b.close,b.volume
 out=[]
 for i in range(23,len(c)-13):
  p=slice(i-20,i); vv=v[p].sum()
  if vv<=0: continue
  vw=(((h[p]+l[p]+c[p])/3)*v[p]).sum()/vv
  ups=int(np.sum(c[i-3:i]>o[i-3:i]))
  if not (h[i]>=vw*1.002 and c[i]<o[i] and ups>=2 and v[i]>=np.mean(v[p])): continue
  e=o[i+1]; target=e*(1-TP); stop=e*(1+SL); r="TIMEOUT"
  for j in range(i+1,min(i+13,len(c))):
   if h[j]>=stop: r="LOSS"; break
   if l[j]<=target: r="WIN"; break
  out.append((int(b.t[i]),r))
 return out

root=Path("backtest/data"); report={"rule":"SHORT: high>=VWAP20*1.002, bearish signal, >=2/3 prior bullish, volume>=avg20; next-open; TP .5%; SL 1%; max 60m equivalent"}
for tf in TFS:
 allr=[]
 for s in SYMS:
  try:
   b=load_bars(root,s,tf); rr=test(b); allr += [(t,r,s) for t,r in rr]
  except Exception as e: report.setdefault("errors",[]).append(f"{s}-{tf}: {e}")
 allr.sort()
 cut=int(len(allr)*.8); a=allr[:cut]; z=allr[cut:]
 def stat(x):
  w=sum(r=="WIN" for _,r,*_ in x); L=sum(r=="LOSS" for _,r,*_ in x); u=len(x)-w-L
  return {"signals":len(x),"wins":w,"losses":L,"timeouts":u,"win_rate_all_pct":round(100*w/len(x),2) if x else 0,"win_rate_decided_pct":round(100*w/(w+L),2) if w+L else 0}
 report[tf]={"train80":stat(a),"holdout20":stat(z)}
Path("quant/reports").mkdir(parents=True,exist_ok=True)
Path("quant/reports/SHORT75_REPORT.json").write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))

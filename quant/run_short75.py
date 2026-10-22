#!/usr/bin/env python3
import json, numpy as np
from pathlib import Path
from quant.data.loader import load_bars

SYMS=["BTC","ETH","SOL","BNB","XRP","DOGE","ADA","AVAX","LINK","DOT"]
TFS=["1m","5m","10m"]; HOLD={"1m":60,"5m":12,"10m":6}
TP=.005; SL=.01; FEE_SIDE=.0005; SLIP_SIDE=.0002

def test(b,tf):
 o,h,l,c,v=b.open,b.high,b.low,b.close,b.volume
 out=[]; i=23; hold=HOLD[tf]
 while i < len(c)-1:
  p=slice(i-20,i); vv=v[p].sum()
  if vv<=0: i+=1; continue
  vw=(((h[p]+l[p]+c[p])/3)*v[p]).sum()/vv
  ups=int(np.sum(c[i-3:i]>o[i-3:i]))
  if not (h[i]>=vw*1.002 and c[i]<o[i] and ups>=2 and v[i]>=np.mean(v[p])):
   i+=1; continue
  entry_i=i+1; e=o[entry_i]; target=e*(1-TP); stop=e*(1+SL)
  r="TIMEOUT"; exit_i=min(entry_i+hold-1,len(c)-1); exit_px=c[exit_i]
  for j in range(entry_i,min(entry_i+hold,len(c))):
   if h[j]>=stop: r="LOSS"; exit_i=j; exit_px=stop; break
   if l[j]<=target: r="WIN"; exit_i=j; exit_px=target; break
  gross=(e-exit_px)/e
  net=gross-2*(FEE_SIDE+SLIP_SIDE)
  out.append((int(b.t[i]),r,float(net)))
  i=exit_i+1
 return out

root=Path("backtest/data")
report={"rule":"SHORT S5: VWAP20 +0.2%, bearish, >=2/3 prior bullish, volume>=avg20; next-open; TP .5%; SL 1%; exact 60m hold; one open/symbol; stop-first","costs":{"taker_fee_each_side_pct":.05,"slippage_each_side_pct":.02}}
for tf in TFS:
 allr=[]
 for s in SYMS:
  try:
   b=load_bars(root,s,tf); rr=test(b,tf); allr += [(t,r,p,s) for t,r,p in rr]
  except Exception as e: raise RuntimeError(f"{s}-{tf}: {e}") from e
 allr.sort(); cut=int(len(allr)*.8); a=allr[:cut]; z=allr[cut:]
 def stat(x):
  n=len(x); w=sum(r=="WIN" for _,r,_,_ in x); L=sum(r=="LOSS" for _,r,_,_ in x); u=n-w-L
  pnl=sum(p for _,_,p,_ in x)
  return {"signals":n,"wins":w,"losses":L,"timeouts":u,
   "win_rate_all_pct":round(100*w/n,2) if n else 0,
   "win_rate_decided_pct":round(100*w/(w+L),2) if w+L else 0,
   "net_return_sum_pct":round(100*pnl,2),
   "avg_net_per_trade_pct":round(100*pnl/n,4) if n else 0}
 report[tf]={"train80":stat(a),"holdout20":stat(z)}
Path("quant/reports").mkdir(parents=True,exist_ok=True)
Path("quant/reports/SHORT75_REPORT.json").write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))

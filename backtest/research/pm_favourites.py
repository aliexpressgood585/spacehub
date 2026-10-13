"""Polymarket favourites search (owner 2026-10-13: "a strategy with at least 75% win rate").
Same data/cost model as pm_research.py; grid over category x horizon x price band, 70/30 time split.
Run: python3 backtest/research/pm_favourites.py <hist.jsonl> > status/pm-favourites.txt
"""
import json,sys,math,statistics as st,re
rows=[json.loads(l) for l in open(sys.argv[1])]
rows=[m for m in rows if len(m.get('h') or [])>=5]; rows.sort(key=lambda m:m['ct']); cut=rows[int(len(rows)*.7)]['ct']
def cat(m):
    t=(m.get('tag') or '')+' '+(m.get('q') or '')
    t=t.lower()
    if re.search(r'bitcoin|btc|ethereum|eth-|solana|xrp|crypto|-up-or-down|price-of',t): return 'crypto'
    if re.search(r'nba|nfl|mlb|nhl|epl|ufc|soccer|-vs-|fc-|lol-|cs2|dota|valorant|tennis|atp|wta|f1|vs\.',t): return 'sports'
    if re.search(r'tweet|musk|post',t): return 'tweets'
    if re.search(r'temperature|weather|highest-temp',t): return 'weather'
    return 'other'
for m in rows: m['c']=cat(m)
def run(H,lo,hi,c,fees,slip):
    out=[]
    for m in rows:
        if c!='all' and m['c']!=c: continue
        if fees=='nofee' and m.get('fees'): continue
        t0=m['ct']-H*3600
        for t,p in m['h']:
            if t<t0 or t>m['ct']-600: continue
            hit=False
            for k,q in ((0,p),(1,1-p)):
                if lo<=q<hi:
                    won=(m['win']==1) if k==0 else (m['win']==0); px=min(.999,q+slip); fee=.03*px*(1-px) if m.get('fees') else 0
                    out.append((((1 if won else 0)-px-fee)/(px+fee),won,m['ct']>=cut)); hit=True;break
            if hit: break
    return out
def s(r):
    if len(r)<30: return None
    x=[a for a,_,_ in r];n=len(x);mu=sum(x)/n;sd=st.pstdev(x) or 1e-9
    return n,sum(w for _,w,_ in r)/n,mu,mu/sd*math.sqrt(n)
res=[]
for c in ['all','crypto','sports','tweets','weather','other']:
  for fees in ['any','nofee']:
    for H in [1,3,6,12,24,48,72]:
      for lo,hi in [(.75,.85),(.8,.9),(.85,.92),(.9,.95),(.92,.97),(.95,.98),(.97,.995),(.75,.95),(.8,.97)]:
        r=run(H,lo,hi,c,fees,.005)
        a=s([x for x in r if not x[2]]);b=s([x for x in r if x[2]])
        if a and b: res.append((c,fees,H,lo,hi,a,b))
res.sort(key=lambda r:-r[5][2])
print('cat     fee   H   band        | IS n   WR    ret/$   t   | OOS n  WR    ret/$   t')
for c,f,H,lo,hi,a,b in res[:25]:
    print(f"{c:7} {f:5} {H:3} {lo:.2f}-{hi:.3f} | {a[0]:5} {a[1]*100:5.1f} {a[2]*100:+6.2f} {a[3]:+5.2f} | {b[0]:5} {b[1]*100:5.1f} {b[2]*100:+6.2f} {b[3]:+5.2f}")
print('rows',len(res),'both>0:',sum(1 for r in res if r[5][2]>0 and r[6][2]>0))
from collections import Counter;print(Counter(m['c'] for m in rows))
print('--- chosen candidate, slippage sensitivity, all categories')
for H in (2,3,4,6):
  for sl in (0.0,0.005,0.01):
    r=run(H,.85,.92,'all','any',sl);a=s([x for x in r if not x[2]]);b=s([x for x in r if x[2]])
    print(H,sl,'IS',a and (a[0],round(a[1]*100,1),round(a[2]*100,2),round(a[3],2)),'OOS',b and (b[0],round(b[1]*100,1),round(b[2]*100,2),round(b[3],2)))

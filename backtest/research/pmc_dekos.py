# Dekos-style price bands (owner's external prompt, 2026-10-15): buy either side of a 5m crypto Up/Down market at 13-74c,
# hold to the result, fee 0.07 p(1-p) + slip. Input: pmc_long_fetch.py output (pmc5_180.jsonl in the cwd). Research only.
import json,math,statistics as st,sys
rows=[json.loads(l) for l in open('pmc5_180.jsonl')]
rows.sort(key=lambda r:r['end']); cut=rows[int(len(rows)*.7)]['end']
def px(r,L):
    pt=None
    for t,p in r['h']:
        if t<=r['end']-L: pt=p
        else: break
    return pt
def ret(q,won,slip):
    b=min(.999,q+slip); c=b+.07*b*(1-b); return ((1 if won else 0)-c)/c
for slip in (.01,.02):
  print(f'--- slip {slip*100:.0f}c, fee 0.07p(1-p), hold to result, 5m BTC/ETH/SOL/XRP, 180 days sampled')
  for L in (240,180,120,60):
    for lo,hi in ((.13,.28),(.27,.33),(.33,.45),(.45,.53),(.53,.60),(.56,.62),(.60,.74)):
      I,O=[],[]
      for r in rows:
        p=px(r,L)
        if p is None: continue
        for q,won in ((p,r['up_won']),(1-p,not r['up_won'])):
          if lo<=q<hi: (I if r['end']<cut else O).append((ret(q,won,slip),won))
      def s(v):
        if len(v)<30: return f'n{len(v)}'
        m=sum(a for a,_ in v)/len(v); sd=st.pstdev([a for a,_ in v]) or 1e-9
        return f'n{len(v):5} WR{100*sum(w for _,w in v)/len(v):5.1f}% {100*m:+6.2f}%/$ t{m/sd*math.sqrt(len(v)):+5.1f}'
      print(f'L{L:3} {int(lo*100)}-{int(hi*100)}c  IS {s(I):36} OOS {s(O)}')

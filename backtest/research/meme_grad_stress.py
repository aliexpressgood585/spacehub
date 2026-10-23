# Stress test of the best meme_grad.py rule (buy 1 min after graduation, tp +100%, sl -20%, 180 min): where does the stop
# fill inside a crash minute (at the level / at the minute's close / at its low), more impact, and 1-3 min entry delay.
# Usage: python3 meme_grad_stress.py grad.jsonl  (run from backtest/research)
import sys, runpy, statistics as st, math
sys.argv=['x', sys.argv[1]]
import io, contextlib
with contextlib.redirect_stdout(io.StringIO()): g = runpy.run_path('meme_grad.py')
C=g['C']; split=g['split']
def go(stopmode, imp, delay=1, tp=1.0, sl=-0.2, H=180):
    out=[]
    for c in C:
        i,px=g['fill_after'](c, c['tg']+delay*60)
        if i is None or not px: continue
        tend=c['bars'][i][0]+H*60; ex=None
        for k in range(i,len(c['bars'])):
            ts,o,h,l,cl,v=c['bars'][k]
            if ts>tend: break
            if l<=px*(1+sl):
                ex = {'level':min(o,px*(1+sl)),'close':min(cl,px*(1+sl)),'low':l}[stopmode]; break
            if h>=px*(1+tp): ex=px*(1+tp); break
        if ex is None: ex=c['bars'][max(i,__import__('bisect').bisect_right(c['ts'],tend)-1)][4]
        r=ex/px*(1-0.003-imp)**2-1-0.0143
        out.append((c['tg']<split,r))
    f=lambda v:(len(v),st.mean(v),st.mean(v)/(st.pstdev(v)/math.sqrt(len(v))))
    return f([r for a,r in out if a]), f([r for a,r in out if not a]), f([r for a,r in out])
for sm in ('level','close','low'):
  for imp in (0.005,0.01,0.02):
    for d in (1,2,3):
      a,b,c=go(sm,imp,d); print(f"stop@{sm:<5} imp{imp*100:.1f}% delay{d}m  IS n{a[0]} {a[1]*100:+.1f}% t{a[2]:+.1f} | OOS n{b[0]} {b[1]*100:+.1f}% t{b[2]:+.1f} | ALL {c[1]*100:+.1f}% t{c[2]:+.1f}")

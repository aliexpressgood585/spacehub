import numpy as np
import cross_sectional_grid as g

assert len(g.MODES)*len(g.SIDES)*len(g.LOOKBACKS)*len(g.HOLDS)*len(g.FILTERS)==64
assert g.COST==.0016 and g.GATE["min_n_each"]==300

# Completed signal at i=2, entry at i+1 open, timed exit at i+hold close.
times=np.arange(0,8*300000,300000,dtype=np.int64)
op=np.full((8,2),100.);cl=np.full((8,2),100.);cl[4,1]=102
c=[(2,1,.01,.01)]
r=g.simulate(c,times,op,cl,2,"LONG",0,10**9)
assert len(r)==1 and abs(r[0][2]-(.02-g.COST))<1e-12
r=g.simulate(c,times,op,cl,2,"SHORT",0,10**9)
assert len(r)==1 and abs(r[0][2]-(-.02-g.COST))<1e-12

# Overlap is suppressed per symbol.
r=g.simulate([(2,1,0,0),(3,1,0,0)],times,op,cl,2,"LONG",0,10**9)
assert len(r)==1
print("cross-sectional checks passed")

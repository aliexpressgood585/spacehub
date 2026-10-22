import numpy as np
import long_short_grid as g

assert len(g.FAMILIES)*len(g.SIDES)*len(g.EXITS)*len(g.FILTERS)==108
assert g.GATE=={"min_n_each":300,"min_pf_each":1.15,"positive_avg_each":True}

# Synthetic LONG and SHORT: both barriers in same minute must take the stop first.
a=np.array([[0,100,102,98,100,1,0.5],[60000,100,103,97,100,1,0.5],[120000,100,100,100,100,1,0.5]],float)
for side in (1,-1):
    r=g.simulate(a,np.array([1]),np.array([1.0]),side,1.5,1.0,1,0,180000)
    assert len(r)==1 and int(r[0,3])==1 and r[0,2]<0

# Adverse gap must fill at the worse opening price, not at the stop.
a2=np.array([[0,100,100,100,100,1,.5],[60000,100,100.5,99.5,100,1,.5],[120000,95,96,94,95,1,.5]],float)
r=g.simulate(a2,np.array([1]),np.array([1.0]),1,1.5,1.0,2,0,180000)
assert r[0,2] < -.04
print("long_short_grid checks passed")

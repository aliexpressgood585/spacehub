import numpy as np
import residual_pairs as g

assert len(g.FORMATIONS)*len(g.ZS)*len(g.HOLDS)==8
assert g.BETA_WINDOW==4032 and g.COST==.0016 and g.GATE["min_n_each"]==300

# Beta estimate is exact for y=2x.
x=np.linspace(-.01,.01,g.BETA_WINDOW);y=2*x
assert abs(g.beta_at(x,y,g.BETA_WINDOW-1)-2)<1e-12

# Pair weights normalize gross and next-bar execution is used.
times=np.arange(0,10*300000,300000,dtype=np.int64)
op=np.full((10,2),100.);cl=np.full((10,2),100.)
op[3]=[100,100];cl[4]=[101,98]
r=g.simulate([(2,1,1,2)],times,op,cl,2,0,10**12)
assert len(r)==1
# z>0: short alt, long BTC, equal weights; gross = .5*(+2% +1%).
assert abs(r[0][6]-.015)<1e-12 and abs(r[0][2]-(.015-g.COST))<1e-12

# Same-alt overlap is suppressed.
r=g.simulate([(2,1,1,2),(3,1,1,2)],times,op,cl,2,0,10**12)
assert len(r)==1
print("residual pair checks passed")

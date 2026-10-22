import numpy as np
import btc_lag_pairs as g

assert len(g.SHOCKS)*len(g.RATIOS)*len(g.FILTERS)*len(g.HOLDS)==24
assert g.COST==.0016 and g.GATE["min_n_each"]==300
x=np.linspace(-.01,.01,g.BETA_WINDOW);assert abs(g.rolling_beta(x,2*x)[-1]-2)<1e-12

times=np.arange(0,10*300000,300000,dtype=np.int64);op=np.full((10,2),100.);cl=np.full((10,2),100.)
op[3]=[100,100];cl[4]=[101,102]
r=g.simulate([(2,1,1,.2,1)],times,op,cl,2,0,10**12)
assert len(r)==1 and abs(r[0][7]-.005)<1e-12 and abs(r[0][2]-(.005-g.COST))<1e-12
r=g.simulate([(2,1,1,.2,1),(3,1,1,.2,1)],times,op,cl,2,0,10**12);assert len(r)==1

v=np.r_[np.ones(g.VOLUME_WINDOW),2.]
assert g.btc_volume_gate(v)[-1]
print("btc lag pair checks passed")

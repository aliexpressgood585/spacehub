import sys,types
try:import numba
except ImportError:sys.modules['numba']=types.SimpleNamespace(njit=lambda f:f)
import numpy as np
import flow_reversal as f

n=600;a=np.zeros((n,7));a[:,0]=f.core.START+(np.arange(n)-500)*60000
a[:,1]=100;a[:,2]=100.1;a[:,3]=99.9;a[:,4]=100;a[:,5]=100;a[:,6]=50
for i in range(500,525):
    o=100-.12*(i-500);c=o-.12
    a[i,1:5]=[o,o+.02,c-.02,c]
a[525,1:5]=[97,97.05,96.85,96.9]
a[526,1:5]=[96.9,97.25,96.85,97.2];a[526,6]=54
a[527,1:5]=[97.2,97.35,97.15,97.3];a[527,6]=56
a[528,1:5]=[97.3,97.35,97.25,97.3]
a[529,1:5]=[97.3,97.35,97.25,97.3]
entries,features,counts=f.candidates(a)
assert 525 in entries['baseline'] and 525 in entries['atr_only']
assert 527 in entries['price_confirm'] and 528 in entries['full']
feat=features['full'][list(entries['full']).index(528)]
assert np.isclose(feat['atr_ratio'],15.) and np.isclose(feat['last_closed_1m_buy_fraction'],.56)
# Future taker volume cannot change a decision already completed.
b=a.copy();b[529:,6]=0
assert np.array_equal(f.candidates(b)[0]['full'],entries['full'])
# A high ATR before the sequence removes the ATR condition without removing price/flow.
b=a.copy();b[:500,2]=102;b[:500,3]=98
ee,_,_=f.candidates(b)
assert 528 not in ee['full'] and 528 in ee['price_flow']
# Entry-minute ambiguous TP/SL resolves to loss. Duplicate entries cannot overlap.
b=a.copy();b[528,2]=100;b[528,3]=95
tr,oc,on=f.simulate(b,np.array([528,528]),int(b[528,0]),int(b[530,0]))
assert len(tr)==1 and tr[0,3]==1 and np.isclose(tr[0,2],-.0116)
# Position without a touched barrier is reported open at the period boundary.
tr,oc,on=f.simulate(a,np.array([528]),int(a[528,0]),int(a[530,0]))
assert len(tr)==0 and oc==1 and np.isclose(on,-f.core.COST)
print('PASS: pre-pattern ATR, 1m next-open entry, actual taker fraction, no future flow, intrabar SL, nonoverlap, boundary open trade')

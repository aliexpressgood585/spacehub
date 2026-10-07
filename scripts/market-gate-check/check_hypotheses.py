import sys,types
try:import numba
except ImportError:sys.modules['numba']=types.SimpleNamespace(njit=lambda f:f)
import numpy as np
import check_flow as fixture
import three_hypotheses as h
a=fixture.a.copy();btc=a.copy();btc[:,1:5]=100
cc,audit=h.candidate_entries(a,btc)
assert 525 in cc['baseline'][:,0] and 525 not in cc['relative_btc'][:,0]
btc[524,4]=90
cc,audit=h.candidate_entries(a,btc)
assert 525 in cc['relative_btc'][:,0] and audit['btc_alignment_rejected']==0
atr_row=cc['atr_exits'][cc['atr_exits'][:,0]==525][0]
assert np.isclose(atr_row[2],2*atr_row[3])
# Changes after the entry decision cannot alter ATR distances or relative gating.
future=a.copy();future[526:,2]=200
cc2,_=h.candidate_entries(future,btc)
assert np.allclose(cc2['atr_exits'][cc2['atr_exits'][:,0]==525][0],atr_row)
btc2=btc.copy();btc2[525:,4]=1
assert 525 in h.candidate_entries(a,btc2)[0]['relative_btc'][:,0]
# Reversal must first be confirmed, then fail below the ORIGINAL pattern low.
b=a.copy();b[528,1:5]=[97.3,97.4,96.75,96.8]
cs,_=h.candidate_entries(b,btc)
assert 529 in cs['failed_short'][:,0]
assert np.all(np.diff(cs['failed_short'][:,0])>0)
# SHORT execution: ambiguous bar -> SL; worse stop gap -> opening fill.
x=np.array([[0,100,102,98,100,1,1],[60000,100,100.5,99.5,100,1,1],[120000,102,103,101,102,1,1]],float)
c=np.array([[0,-1,.01,.01,0,1,0]],float)
tr,oc,on=h.simulate(x,c,0,180000)
assert len(tr)==1 and tr[0,3]==1 and np.isclose(tr[0,2],-.0116)
x[0,2:4]=[100.5,99.5]
tr,oc,on=h.simulate(x,c,0,180000)
assert tr[0,1]==120000 and np.isclose(tr[0,2],-.0216)
# Equality of old/new baseline simulation on synthetic data.
base=cc['baseline'];start=int(a[0,0]);end=int(a[-1,0]+60000)
new=h.simulate(a,base,start,end)[0]
old=h.flow.simulate(a,base[:,0].astype(np.int64),start,end)[0]
assert np.allclose(new,old,rtol=0,atol=1e-12)
print('PASS: BTC synchronous returns, ATR fixed before entry, failed-bounce order, short stop/gap handling, baseline parity')

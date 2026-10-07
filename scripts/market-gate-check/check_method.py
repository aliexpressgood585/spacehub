"""Synthetic checks of temporal alignment and conservative exit accounting."""
import sys, types
try:
    import numba
except ImportError:
    sys.modules['numba']=types.SimpleNamespace(njit=lambda f:f)
import market_gate_check as m
import numpy as np
a=np.zeros((300,6));a[:,0]=np.arange(300)*300000
p=100+np.arange(300);a[:,1]=p;a[:,2]=p+1;a[:,3]=p-1;a[:,4]=p;a[:,5]=1
r,e50,e200,adx,plus,minus=m.indicators(a,300000)
assert np.isclose(r[20],100) and np.isclose(adx[30],100) and plus[30]>minus[30]
assert e50[-1]>e200[-1]
b=a.copy();b[250:,0]+=300000
assert np.isnan(m.indicators(b,300000)[0][250])
c=np.array([[0,100,101,99,100,1],[300000,100,102,98,100,1],[600000,98,99,97,98,1]],float)
n,x,reason=m.outcomes(c,np.array([0]),.01,.01,0,300000)
assert reason[0]==1 and np.isclose(n[0],-.0116)
c[1]=[300000,100,100.5,99.5,100,1]
n,x,reason=m.outcomes(c,np.array([0]),.01,.01,0,300000)
assert x[0]==2 and np.isclose(n[0],-.0216)
coin=a.copy();coin[:,0]+=60000;ix=np.array([210]);bi=list(m.indicators(a,300000))
entry=coin[211,0];j=np.searchsorted(a[:,0]+300000,entry,side='right')-1
bi[0][:]=40;bi[0][j+1:]=100
assert not m.gates(coin,ix,m.indicators(coin,300000),a,tuple(bi),'5m')['rsi50'][0]
bi[0][j]=60
assert m.gates(coin,ix,m.indicators(coin,300000),a,tuple(bi),'5m')['rsi50'][0]
print('PASS: Wilder RSI/ADX, EMA seed, gap reset, ambiguous barriers, stop gaps, completed BTC bars')

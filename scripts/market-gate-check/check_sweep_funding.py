import sys,types
try: import numba
except ImportError: sys.modules['numba']=types.SimpleNamespace(njit=lambda f:f)
import numpy as np
import sweep_funding as h
t=h.core.START
a=np.zeros((100,7));a[:,0]=t+np.arange(100)*60000;a[:,1:5]=100;a[:,5:]=10
b,_=h.flow.five_minutes(a);atr=np.ones(len(b))
a[30,3]=98;a[30,5]=20;a[31,4]=100.1
c=h.find_sweeps(a,b,atr)
assert len(c)==1 and c[0,0]==32
assert np.isclose(c[0,2],.03) and np.isclose(c[0,3],.02294)
future=a.copy();future[33:,2]=900
assert np.allclose(h.find_sweeps(future,b,atr)[0],c[0])
a[31,4]=99
assert not len(h.find_sweeps(a,b,atr))
# Ambiguous bars stop first, adverse gaps fill at the worse open.
x=np.array([[0,100,102,98,100,1,1],[60000,100,100.5,99.5,100,1,1],[120000,102,103,101,102,1,1]],float)
c=np.array([[0,-1,.01,.01,180000,0,0,-1]],float)
r,_=h.simulate(x,c,0,180000,False)
assert r[0,3]==1 and np.isclose(r[0,2],-.0116)
x[0,2:4]=[100.5,99.5]
r,_=h.simulate(x,c,0,180000,False)
assert r[0,1]==120000 and np.isclose(r[0,2],-.0216)
# Funding signal is first completed 5m counter-move after publication.
a[:,1:5]=100;b,_=h.flow.five_minutes(a)
f=np.array([[t+10*60000+5,.0005,1],[t+70*60000+5,.001,1]],float)
b[2,4]=99.5
c,audit=h.find_funding(a,b,f,t+100*60000)
assert len(c)==1 and c[0,0]==15 and c[0,1]==1 and c[0,4]==t+71*60000
f[0,1]=-.0005;b[2,4]=100.5
c,_=h.find_funding(a,b,f,t+100*60000)
assert c[0,1]==-1
r,_=h.simulate(a,c,t,t+100*60000,True)
assert len(r)==1 and r[0,1]==t+71*60000 and r[0,3]==3
adjusted,cash=h.apply_funding(r,c,f,{t+70*60000:(110,111,109)})
assert len(cash)==1 and np.isclose(adjusted[0,2],-.0016+.0011)
r[0,1]=t+70*60000
assert not h.funding_links(r,c,f)
# Sweep timeout is 45 completed minutes; period boundary censors unfinished trades.
c=np.array([[0,1,.5,.5,t+45*60000,t,98,-1]],float)
r,n=h.simulate(a,c,t,t+100*60000,False)
assert r[0,1]==t+45*60000 and r[0,3]==3
r,n=h.simulate(a,c,t,t+30*60000,False)
assert len(r)==0 and n==1
print('PASS: sweep timing/levels, funding direction/settlement/mark cash flow, stop-first/gaps, timeouts and censoring')

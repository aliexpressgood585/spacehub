import json,sys,math,statistics as st
exec(open('backtest/research/pmc_research.py').read().split("print('markets'")[0].replace("sys.argv[1]","sys.argv[1]"))
for tf in ['5m','15m']:
  for L in [60,90,120,180]:
    for lo,hi in [(.90,.95),(.92,.97),(.95,.98),(.90,.98),(.85,.95)]:
      r=run(tf,'all',L,lo,hi,.01)
      for nm,x in (('IS',[a for a in r if not a[2]]),('OOS',[a for a in r if a[2]])):
        v=[a for a,_,_ in x]; n=len(v); mu=sum(v)/n; sd=st.pstdev(v) or 1e-9
        print(tf,L,lo,hi,nm,n,round(100*sum(w for _,w,_ in x)/n,1),round(100*mu,2),round(mu/sd*math.sqrt(n),2),'losses',sum(1 for _,w,_ in x if not w))

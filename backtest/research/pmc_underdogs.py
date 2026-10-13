# Poly coins: buying the UNDERDOG (10-25c, ~1:4-1:9 risk:reward) in short crypto Up/Down markets. Run: python3 backtest/research/pmc_underdogs.py <pmc.jsonl>
import sys,math,statistics as st
exec(open('backtest/research/pmc_research.py').read().split("print('markets'")[0].replace("open(sys.argv[1])","open(sys.argv[1])"))
for tf,Ls in (('5m',[60,120,180,240]),('15m',[120,300,600,840]),('4h',[1800,3600,7200,10800])):
  for L in Ls:
    for lo,hi in ((.10,.17),(.15,.22),(.17,.25)):
      r=run(tf,'all',L,lo,hi,.01)
      out=[]
      for nm,x in (('IS',[a for a in r if not a[2]]),('OOS',[a for a in r if a[2]])):
        v=[a for a,_,_ in x]; n=len(v)
        if n<30: out.append(f'{nm} n{n}'); continue
        mu=sum(v)/n; sd=st.pstdev(v) or 1e-9
        out.append(f'{nm} n{n} WR {100*sum(w for _,w,_ in x)/n:4.1f}% {100*mu:+6.1f}%/$ t{mu/sd*math.sqrt(n):+.2f}')
      print(tf,L,lo,hi,' | '.join(out))

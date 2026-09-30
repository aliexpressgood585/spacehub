import { readFileSync } from 'node:fs'
const COINS=['BTC','ETH','SOL','BNB','XRP','DOGE','ADA','AVAX','LINK','DOT'], MAKER=0.0002, FUND=0.0001/480, C=1000
function load(s){const L=readFileSync(`backtest/data/${s}-1m.csv`,'utf8').trim().split('\n');const n=L.length,d={n,t:new Float64Array(n),o:new Float64Array(n),h:new Float64Array(n),l:new Float64Array(n),c:new Float64Array(n)};for(let i=0;i<n;i++){const r=L[i].split(',');d.t[i]=+r[0];d.o[i]=+r[1];d.h[i]=+r[2];d.l[i]=+r[3];d.c[i]=+r[4]}return d}
// classic grid: no stop; beyond the outer level no new orders, inventory held until price returns
function run(d,s,N){const unit=C/N,center=d.o[0],lvl=k=>center*Math.pow(1+s,k);let a=0,pos=0,cash=0,worst=0,daily=new Map(),last=0
 for(let i=0;i<d.n;i++){const path=d.c[i]>=d.o[i]?[d.l[i],d.h[i],d.c[i]]:[d.h[i],d.l[i],d.c[i]]
  for(const p of path){while(a>-N&&p<lvl(a-1)){a--;const L=lvl(a),q=unit/L;pos+=q;cash-=q*L+unit*MAKER}
   while(a<N&&p>lvl(a+1)){a++;const L=lvl(a),q=unit/L;pos-=q;cash+=q*L-unit*MAKER}}
  cash-=Math.abs(pos)*d.c[i]*FUND;const eq=cash+pos*d.c[i];worst=Math.min(worst,eq);const day=Math.floor(d.t[i]/864e5);daily.set(day,(daily.get(day)??0)+eq-last);last=eq}
 return {pnl:last,worst,daily}}
const data=COINS.map(load)
for(const s of [0.008,0.015,0.03])for(const N of [10,20]){let tot=0,worst=0,per=[];for(const [k,d] of data.entries()){const r=run(d,s,N);tot+=r.pnl;worst+=r.worst;per.push(COINS[k]+' '+(r.pnl/C*100).toFixed(0)+'%')}
 console.log(`HOLD s ${(s*100).toFixed(1)}% N ${N}: 12m total ${(tot/(C*10)*100).toFixed(1)}% of capital | sum of per-coin worst equity ${(worst/(C*10)*100).toFixed(1)}% | ${per.join(', ')}`)}

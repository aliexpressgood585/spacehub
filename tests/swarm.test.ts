import assert from 'node:assert/strict'
import {SCALP} from '../shared/scalp.ts'
import {SWARM,SWARM_IDS,TEAMS,runSwarm,scoreSnapshot,decayStat,learnedWeight,tStat,LEARN,meanBps,teamWeights,bestHorizon,hKey,hT,halfLifeFor,horizonOf} from '../shared/swarm.ts'
import {NEW_AGENTS} from '../shared/agents.ts'
const now=1_800_000_000_000
const mk=(f:(i:number)=>number,v=(i:number)=>100)=>Array.from({length:65},(_,i)=>{const c=f(i),o=f(i-1);return {t:now-(65-i)*60000,o,h:Math.max(o,c)*1.0002,l:Math.min(o,c)*0.9998,c,v:v(i)}})
const up=mk(i=>100*(1+0.001*i)), down=mk(i=>100*(1-0.001*i)), flat=mk(i=>100+(i%2)*0.01)
assert.equal(SWARM.length,60); assert.equal(new Set(SWARM_IDS).size,60)
for(const t of Object.keys(TEAMS))assert.equal(SWARM.filter(a=>a.team===t).length,10,t)
assert.ok(SWARM_IDS.every(id=>!NEW_AGENTS.includes(id)&&!['regime','rota','donch','trader','risk'].includes(id)),'ids do not collide')
for(const b of [up,down,flat]){const r=runSwarm(b,{btc:up});assert.equal(Object.keys(r).length,60);assert.ok(Object.values(r).every(d=>d===-1||d===0||d===1))}
// sanity: trend + momentum agents agree with a clean up-move, reversal agents never say long into it
const u=runSwarm(up,{}), d=runSwarm(down,{})
assert.ok(SWARM.filter(a=>a.team==='trend').every(a=>u[a.id]>=0)); assert.ok(SWARM.filter(a=>a.team==='trend').filter(a=>u[a.id]===1).length>=7)
assert.ok(SWARM.filter(a=>a.team==='trend').filter(a=>d[a.id]===-1).length>=7)
assert.ok(SWARM.filter(a=>a.team==='rev').every(a=>u[a.id]<=0))
assert.equal(u.roc5,1); assert.equal(d.roc5,-1); assert.equal(runSwarm(flat,{}).roc5,0)
// a bad bar series must never throw out of runSwarm
assert.doesNotThrow(()=>runSwarm(up.slice(0,5),{}))
// learning: right votes build a positive score, wrong ones a negative one
const t0=new Date(now).toISOString()
let st:any={}
for(let i=0;i<150;i++){
  const upd=scoreSnapshot(st,{BTC:{good:1,bad:-1,mute:0},ETH:{good:-1,bad:1}},{BTC:100,ETH:100},{BTC:100.3+(i%3)*0.01,ETH:99.7-(i%3)*0.01},now)
  st={...st,...upd}
}
assert.equal(st.mute,undefined,'a 0 vote is not scored')
assert.equal(st.good.n,300); assert.ok(meanBps(st.good)>13&&meanBps(st.good)<16,'30bps right minus 16bps cost'); assert.ok(meanBps(st.bad)<-40)
assert.ok(tStat(st.good)>2); assert.ok(tStat(st.bad)<-2)
assert.equal(learnedWeight(st.good),LEARN.hi); assert.equal(learnedWeight(st.bad),0,'consistently wrong -> benched')
assert.equal(learnedWeight({agent:'x',n:LEARN.minN-1,s:-500,s2:5000,updated_at:t0}),1,'still learning keeps weight 1')
assert.equal(learnedWeight(undefined),1)
// decay: 12h half-life halves the evidence
const dcy=decayStat({agent:'x',n:200,s:100,s2:1000,updated_at:new Date(now-LEARN.halfLifeMs).toISOString()},'x',now)
assert.ok(Math.abs(dcy.n-100)<1e-9&&Math.abs(dcy.s-50)<1e-9)
assert.ok(learnedWeight(dcy)===1||learnedWeight(dcy)>=0,'decayed stat stays valid')
// noise: random-sign edges should not produce extreme weights
let noise:any={}; let seed=7; const rnd=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648}
for(let i=0;i<300;i++){noise={...noise,...scoreSnapshot(noise,{BTC:{z:1}},{BTC:100},{BTC:100*(1+(rnd()-0.5)*0.004)},now,0)}}
assert.ok(Math.abs(tStat(noise.z))<3,'pure noise stays near zero t')
assert.ok(SWARM.filter(a=>a.team==='combo').every(a=>u[a.id]>=0&&d[a.id]<=0),'combos never fight a clean trend except the reversal ones'||'')
assert.equal(u.c_multi_tf,1); assert.equal(d.c_multi_tf,-1)
// v78.0: learning is NET of costs — right direction but smaller than the round trip scores negative
assert.equal(LEARN.costBps,Math.round((SCALP.fee+SCALP.slip)*2*1e4),'learning cost = SCALP round trip')
let tiny:any={}; for(let i=0;i<150;i++) tiny={...tiny,...scoreSnapshot(tiny,{BTC:{t:1}},{BTC:100},{BTC:100.05+(i%3)*0.01},now)}
assert.ok(meanBps(tiny.t)<0&&learnedWeight(tiny.t)<1,'a 5bps right call does not pay 16bps and is not boosted')
// v79.0: horizons + never-all-zero weights
{const mk=(n:number,m:number)=>({agent:'x',n,s:m*n,s2:(m*m+100)*n,ev:n,updated_at:new Date(now).toISOString()})  // ev=n: one coin per event, so only the overlap term deflates
 const S:any={a:mk(300,-20),'a@240':mk(300,40),b:mk(300,-20),c:mk(300,-25),d:mk(300,-30),e:mk(300,-22),f:mk(300,-40)}
 assert.equal(bestHorizon(S,'a').h,240,'agent judged on its best horizon')
 const tw=teamWeights(S,['a','b','c','d','e','f'])
 assert.equal(tw.H.a,240); assert.equal(tw.mode,'relative','fewer than minActive profitable -> relative mode')
 assert.ok(Object.values(tw.W).some(w=>w>0),'weights never all zero'); assert.ok(tw.W.a>tw.W.f,'relative mode follows the best')
 const up:any={};for(const k of ['a','b','c','d','e','f'])up[k]=mk(300,10)
 const ta=teamWeights(up,['a','b','c','d','e','f']);assert.equal(ta.mode,'proven');assert.equal(ta.active,6)
 const mix:any={...S,b:mk(300,10),c:mk(300,10)};const tm=teamWeights(mix,['a','b','c','d','e','f']);assert.equal(tm.mode,'proven','a, b, c proven');assert.equal(tm.W.d,0,'unproven agents get no vote');assert.ok(tm.W.b>=1&&tm.W.a>=1)
 // v81.0: t~1.7 is no longer "proven" (multiple-testing guard)
 const weak:any={};for(const k of ['a','b','c','d','e','f'])weak[k]=mk(300,1);assert.equal(teamWeights(weak,['a','b','c','d','e','f']).mode,'relative','t=1.7 < provenT')
 assert.equal(LEARN.provenT,2.5)
 // v81.1: overlapping h-minute scores are deflated by sqrt(h): same raw t at 240m counts ~15.5x less
 // v83.0: ...and by the cross-coin factor sqrt(1+(k-1)rho); a row without ev uses kDefault, a row with ev=n (one coin per event) only the overlap term
 {const st={...mk(300,8),ev:0},kd=Math.sqrt(1+(LEARN.kDefault-1)*LEARN.rho);assert.ok(Math.abs(hT(st,240)*Math.sqrt(240)*kd-tStat(st))<1e-9);assert.ok(hT(st,240)<LEARN.provenT&&tStat(st)>LEARN.provenT,'raw t 13.9 at 240m is not proven after correction')
  const one={...st,ev:300};assert.ok(Math.abs(hT(one,240)*Math.sqrt(240)-tStat(one))<1e-9,'k=1 -> no cross-coin deflation');assert.ok(hT({...st,ev:15},60)<hT(one,60),'more coins per event -> smaller t')
  const only240:any={};for(const k of ['a','b','c'])only240[`${k}@240`]=mk(300,8);assert.equal(teamWeights(only240,['a','b','c']).mode,'relative','inflated 4h scores no longer flip proven mode')}
 assert.equal(hKey('a',5),'a');assert.equal(hKey('a',60),'a@60')
 assert.deepEqual([...LEARN.horizonsMin],[5,15,60,240,1440]);assert.equal(horizonOf('x@1440'),1440);assert.equal(horizonOf('x#o@60'),60);assert.equal(horizonOf('x'),5)
 assert.equal(halfLifeFor(60),LEARN.halfLifeMs);assert.equal(halfLifeFor(1440),6*1440*60_000,'a 24h horizon remembers 6 days')
 {const d=decayStat({agent:'q@1440',n:200,s:100,s2:1000,ev:10,updated_at:new Date(now-LEARN.halfLifeMs).toISOString()},'q@1440',now);assert.ok(d.n>180&&d.n<195,'24h stats decay ~6% over 12h (6-day half-life)');assert.ok(d.ev!>9)}
 {const sc=scoreSnapshot({},{BTC:{a:1},ETH:{a:1,b:-1}},{BTC:100,ETH:100},{BTC:101,ETH:99},now);assert.equal(sc.a.ev,1,'one event per snapshot');assert.equal(sc.a.n,2);assert.equal(sc.b.ev,1)}
 const sx=scoreSnapshot({},{BTC:{a:1}},{BTC:100},{BTC:101},now,16,'@60');assert.ok(sx['a@60']&&Math.abs(sx['a@60'].s-84)<1e-6,'100bps move minus 16 = 84 net')}
console.log('Swarm: 60 agents in 6 teams, shadow learning, decay and benching passed')

import assert from 'node:assert/strict'
import {SWARM,SWARM_IDS,TEAMS,runSwarm,scoreSnapshot,decayStat,learnedWeight,tStat,LEARN,meanBps} from '../shared/swarm.ts'
import {NEW_AGENTS} from '../shared/agents.ts'
const now=1_800_000_000_000
const mk=(f:(i:number)=>number,v=(i:number)=>100)=>Array.from({length:65},(_,i)=>{const c=f(i),o=f(i-1);return {t:now-(65-i)*60000,o,h:Math.max(o,c)*1.0002,l:Math.min(o,c)*0.9998,c,v:v(i)}})
const up=mk(i=>100*(1+0.001*i)), down=mk(i=>100*(1-0.001*i)), flat=mk(i=>100+(i%2)*0.01)
assert.equal(SWARM.length,50); assert.equal(new Set(SWARM_IDS).size,50)
for(const t of Object.keys(TEAMS))assert.equal(SWARM.filter(a=>a.team===t).length,10,t)
assert.ok(SWARM_IDS.every(id=>!NEW_AGENTS.includes(id)&&!['regime','rota','donch','trader','risk'].includes(id)),'ids do not collide')
for(const b of [up,down,flat]){const r=runSwarm(b,{btc:up});assert.equal(Object.keys(r).length,50);assert.ok(Object.values(r).every(d=>d===-1||d===0||d===1))}
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
  const upd=scoreSnapshot(st,{BTC:{good:1,bad:-1,mute:0},ETH:{good:-1,bad:1}},{BTC:100,ETH:100},{BTC:100.1+(i%3)*0.01,ETH:99.9-(i%3)*0.01},now)
  st={...st,...upd}
}
assert.equal(st.mute,undefined,'a 0 vote is not scored')
assert.equal(st.good.n,300); assert.ok(meanBps(st.good)>9&&meanBps(st.good)<12); assert.ok(meanBps(st.bad)<-9)
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
for(let i=0;i<300;i++){noise={...noise,...scoreSnapshot(noise,{BTC:{z:1}},{BTC:100},{BTC:100*(1+(rnd()-0.5)*0.004)},now)}}
assert.ok(Math.abs(tStat(noise.z))<3,'pure noise stays near zero t')
console.log('Swarm: 50 agents in 5 teams, shadow learning, decay and benching passed')

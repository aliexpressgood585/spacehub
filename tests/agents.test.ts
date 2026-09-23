import assert from 'node:assert/strict'
import {AGENTS,NEW_AGENTS,rsi,weightOf,weights,WEIGHT} from '../shared/agents.ts'
const now=1_800_000_000_000
const mk=(f:(i:number)=>number,v=100)=>Array.from({length:65},(_,i)=>{const c=f(i),o=f(i-1);return {t:now-(65-i)*60000,o,h:Math.max(o,c)+0.01,l:Math.min(o,c)-0.01,c,v}})
const up=mk(i=>100+i*0.05), down=mk(i=>100-i*0.05), flat=mk(i=>100+(i%2)*0.01)
assert.equal(NEW_AGENTS.length,10)
for(const k of NEW_AGENTS){ for(const b of [up,down,flat]){ const r=AGENTS[k].run(b,{}); assert.ok([-1,0,1].includes(r.dir),k); assert.ok(r.says.length>0,k) } }
assert.equal(rsi(up.map(x=>x.c)),100); assert.equal(rsi(down.map(x=>x.c)),0)
assert.equal(AGENTS.rsi.run(up,{}).dir,1); assert.equal(AGENTS.rsi.run(down,{}).dir,-1)
assert.equal(AGENTS.vwap.run(up,{}).dir,1); assert.equal(AGENTS.vwap.run(down,{}).dir,-1)
assert.equal(AGENTS.htf.run(up,{}).dir,1); assert.equal(AGENTS.htf.run(down,{}).dir,-1); assert.equal(AGENTS.htf.run(flat,{}).dir,0)
assert.equal(AGENTS.macd.run(up,{}).dir,1); assert.equal(AGENTS.macd.run(down,{}).dir,-1)
// breakout: last close above the prior 15-bar high
const br=[...flat.slice(0,-1),{...flat[64],o:100,c:100.5,h:100.6,l:99.99}]
assert.equal(AGENTS.breakout.run(br,{}).dir,1); assert.equal(AGENTS.breakout.run(flat,{}).dir,0)
// volume spike with a green bar
assert.equal(AGENTS.volume.run([...flat.slice(0,-1),{...flat[64],o:100,c:100.2,h:100.21,l:99.99,v:500}],{}).dir,1)
assert.equal(AGENTS.volume.run(flat,{}).dir,0)
// candle: strong bull body closing near the high
assert.equal(AGENTS.candle.run([...flat.slice(0,-1),{...flat[64],o:100,l:99.99,h:100.21,c:100.2}],{}).dir,1)
// btc lead uses BTC's bars; for BTC itself it abstains
assert.equal(AGENTS.btclead.run(flat,{btc:up}).dir,1); assert.equal(AGENTS.btclead.run(up,{btc:up}).dir,0); assert.equal(AGENTS.btclead.run(flat,{}).dir,0)
// funding: contrarian on crowding, silent when missing
assert.equal(AGENTS.funding.run(flat,{funding:0.0005}).dir,-1); assert.equal(AGENTS.funding.run(flat,{funding:-0.0002}).dir,1)
assert.equal(AGENTS.funding.run(flat,{funding:0.0001}).dir,0); assert.equal(AGENTS.funding.run(flat,{funding:null}).dir,0)
// weights: 1 below 30 votes, shrunk toward 1, clamped to [0.5,2]
assert.equal(weightOf({n:29,right:29}),1); assert.equal(weightOf(undefined),1)
assert.equal(weightOf({n:30,right:15}),1)
assert.ok(weightOf({n:30,right:24})>1&&weightOf({n:30,right:24})<2)
assert.ok(weightOf({n:30,right:6})<1&&weightOf({n:30,right:6})>=0.5)
assert.equal(weightOf({n:10000,right:10000}),WEIGHT.hi); assert.equal(weightOf({n:10000,right:0}),WEIGHT.lo)
assert.deepEqual(weights({a:{n:0,right:0}}),{a:1})
console.log('Agents: 10 signal agents and performance weights passed')

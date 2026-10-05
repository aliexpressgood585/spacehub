import assert from 'node:assert/strict'
import {flowSignal,flowFill,flowExit,flowResult,validBook,type Depth} from '../shared/flow-shadow.ts'
const now=10000,b:Depth={ts:now,bids:[[100,100]],asks:[[100.01,10]]},t=[{ts:now,usd:10000,buy:true}]
assert.equal(flowSignal(b,t,99.9,now).dir,1)
assert.equal(flowSignal({...b,bids:[[100,10]],asks:[[100.01,100]]},[{ts:now,usd:10000,buy:false}],100.1,now).dir,-1)
assert.equal(flowSignal(b,[],99,now).dir,0)
assert.equal(flowSignal({...b,ts:now-2001},t,99,now).dir,0)
assert.equal(flowSignal(b,[{ts:now+1,usd:10000,buy:true}],99,now).dir,0)
assert.equal(flowSignal(b,t,undefined,now).reason,'warmup')
assert.equal(validBook({...b,bids:[[101,1]]},now),false)
assert.equal(validBook({...b,bids:[[100,1],[100.1,1]]},now),false)
assert.equal(flowFill(b,1,100000,now),null)
const en=flowFill(b,1,100,now)!,ex=flowFill(b,-1,100,now)!
assert.ok(en>100.01&&ex<100,'adverse slip floor on both fills')
assert.ok(flowResult(en,ex,1).net_bps < -10,'unchanged market loses spread, impact and taker fees')
assert.equal(flowResult(100,100,1).net_bps,-10)
console.log('flow shadow: stale/future data, mirror signals, costs and thin books passed')

assert.equal(flowExit(b,-1,101,now),null,'exit cannot invent depth')
assert.ok(flowExit(b,-1,10,now)!<100)

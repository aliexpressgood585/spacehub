import assert from 'node:assert/strict'
import {FLOW_REST,depthFrom,mergeTrades,flowSignal,flowFill,flowExit,flowResult,validBook,type Depth} from '../shared/flow-shadow.ts'
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

// v1.1 REST transport: depth parsing, trade merge (dedupe, future rows, gap), weight budget
const d=depthFrom({E:now,bids:[['100','2']],asks:[['100.01','3']]})!
assert.deepEqual(d,{ts:now,bids:[[100,2]],asks:[[100.01,3]]}); assert.equal(depthFrom({bids:[]}),null)
const rows=[{id:5,time:now-500,price:'100',qty:'1',quoteQty:'100',isBuyerMaker:false},{id:6,time:now-100,price:'100',qty:'2',quoteQty:'200',isBuyerMaker:true},{id:7,time:now+5000,price:'1',qty:'1',isBuyerMaker:false}]
const m1=mergeTrades([],-1,rows,now); assert.equal(m1.tape.length,2,'future print dropped'); assert.equal(m1.last,6); assert.equal(m1.gap,false)
assert.deepEqual(m1.tape.map(x=>x.buy),[true,false],'isBuyerMaker=false is an aggressive buy')
const m2=mergeTrades(m1.tape,m1.last,rows,now); assert.equal(m2.tape.length,2,'no duplicates on re-poll')
assert.equal(mergeTrades(m1.tape,6,[{id:9,time:now,price:'1',qty:'1',isBuyerMaker:true}],now).gap,true,'missed ids are flagged')
assert.ok(6*2*60000/FLOW_REST.depthEveryMs+6*5*60000/FLOW_REST.tradesEveryMs<=1400&&FLOW_REST.guardAll<2400,'poll budget leaves room for the trading bot')
const src=(await import('node:fs')).readFileSync('supabase/functions/flow-shadow/index.ts','utf8').replace(/\/\/.*$/gm,'')
assert.ok(!src.includes('WebSocket')&&src.includes('x-mbx-used-weight-1m')&&!/bot_trades|bot_state|commit_cycle/.test(src),'REST transport, weight guard, no trading tables')
console.log('flow shadow v1.1: REST transport passed')

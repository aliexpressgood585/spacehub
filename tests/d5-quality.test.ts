import assert from 'node:assert/strict'
import { pagedTape,candleTape } from '../shared/q15-tape.ts'
import { d5Execution } from '../shared/d5-execution.ts'
import { q15Tape,exitRow } from '../supabase/functions/trading-bot/q15-runner.ts'
const from=1800000,to=from+120000
const page=(id:number,n:number,time=from)=>Array.from({length:n},(_,i)=>({a:id+i,T:time+i,p:100}))
let calls:string[]=[]
const t=await pagedTape(async u=>{calls.push(u);return calls.length===1?page(0,1000):[{a:1000,T:from+2000,p:98}]},'spot','TEST',1,from,to)
assert.equal(t.complete,true);assert.equal(t.trades.at(-1)?.p,98);assert.ok(calls[1].includes('fromId=1000'))
let count=0
const capped=await pagedTape(async()=>page((count++)*1000,1000,from+(count-1)*1000),'spot','TEST',1,from,to)
assert.equal(capped.complete,false);assert.equal(capped.checkedUntil,from+4998)
assert.equal(capped.trades.at(-1)?.T,from+4998)
await assert.rejects(()=>pagedTape(async()=>[{a:2,T:from,p:100},{a:1,T:from,p:100}],'spot','TEST',1,from,to),/order/)
const bar=(t:number)=>({t,open:100,high:101,low:99,close:100,vol:1})
assert.equal(candleTape([],from,to,1,'test').checkedUntil,from)
assert.equal(candleTape([bar(from+60000)],from,to,1,'test').checkedUntil,from,'missing prefix cannot advance')
assert.equal(candleTape([bar(from),bar(from+120000)],from,to+60000,1,'test').checkedUntil,from+59999,'interior gap cannot advance')
assert.equal(candleTape([bar(from)],from,from+30000,1,'test').trades.length,0,'forming candle is excluded')
assert.equal(candleTape([bar(from)],from,from+60000,1,'test').inferred,true)
const partial=candleTape([{...bar(from),low:98,high:102}],from+45000,from+60000,1,'test')
assert.deepEqual(partial.trades.map(x=>x.p),[98,100],'partial candle retains adverse uncertainty, no favorable invented high')
assert.equal(candleTape([bar(from),bar(from+60000)],from+60000,from+120000,1,'test').trades[0].T,from+60001,'processed minute is not replayed')
const b={bids:[[99.99,1e6]] as [number,number][],asks:[[100,1e6]] as [number,number][],E:to}
const e=d5Execution(b,11250,15,to,.0001,8);assert.ok(e.ok)
if(e.ok){
 assert.ok(e.price>=100.03);assert.ok(e.protection.trigger>e.protection.stop)
 const exit=e.protection.stop*(1-e.protection.exit_slip)
 const net=exit*(1-.0005)-e.price*(1+.0005+e.protection.funding_reserve)
 assert.ok(net>0,'estimated protected net includes fee, slip, funding and buffer')
}
assert.equal(d5Execution({...b,E:to-9000},11250,15,to,0,8).ok,false)
assert.equal(d5Execution(b,11250,15,to,null,8).ok,false)
const thin={...b,bids:[[99.99,2],[99.5,200]] as [number,number][],asks:[[100,2],[100.5,200]] as [number,number][]}
const small=d5Execution(thin,11250,15,to,0,8);assert.ok(small.ok);if(small.ok)assert.ok(small.notional<11250&&small.notional/15>=5)
const real=globalThis.fetch
try{
 let futures=0
 globalThis.fetch=(async(u:string)=>{
  if(u.includes('fapi')){if(futures++===0)return new Response(JSON.stringify(page(0,1000)));throw new Error('outage')}
  return new Response(JSON.stringify([{a:1,T:from+2000,p:101}]))
 }) as typeof fetch
 const r=await q15Tape({sym:'TEST',s:'TESTUSDT',k:1},from,to)
 assert.deepEqual(r.trades,[{p:101,T:from+2000}],'failed primary buffer discarded');assert.equal(r.source,'binance-spot')
}finally{globalThis.fetch=real}
console.log('d5-quality: pagination, gaps, source isolation, cost sizing and protection passed')

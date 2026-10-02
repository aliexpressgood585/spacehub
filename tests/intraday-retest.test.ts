import assert from 'node:assert/strict'
import { RETEST, retestSignal, retestLevels, retestExecution } from '../shared/intraday-retest.ts'
import { runFast } from '../supabase/functions/trading-bot/fast-runner.ts'
import type { LBar } from '../shared/lab.ts'
const NOW = Date.UTC(2026,9,2,3,0,30), end=NOW-330000
const b: LBar[] = Array.from({length: 64},(_,i)=>({t:end-(63-i)*300000,open:100,close:100,high:101,low:99,vol:1000,tb:500}))
b[62]={...b[62],open:100,close:102,high:102.2,low:100,vol:2000,tb:1400}
b[63]={...b[63],open:101.1,close:101.8,high:102,low:100.95,vol:1000,tb:700}
const s=retestSignal(b,true,false)!; assert.ok(s); assert.equal(s.dir,1)
const mirrored=b.map(x=>({...x,open:200-x.open,close:200-x.close,high:200-x.low,low:200-x.high,tb:x.vol-x.tb!}))
assert.equal(retestSignal(mirrored,false,false)?.dir,-1)
assert.equal(retestSignal(b,false,false),null,'BTC conflict')
assert.equal(retestSignal(b,null,false),null,'missing BTC')
assert.equal(retestSignal(b.map((x,i)=>i===30?{...x,t:x.t-300000}:x),true,false),null,'missing candle')
assert.equal(retestSignal(b.map(x=>({...x,tb:undefined})),true,false),null,'missing flow')
assert.equal(retestSignal(b.slice(0,-1),true,false),null,'breakout without retest')
const px=101.85, lv=retestLevels(s,px)
assert.ok(lv.stop<px && lv.target>px); assert.ok(Math.abs((lv.target-px)/lv.r-2)<1e-10)
const check=(bid=101.79,ask=101.81,ts=NOW)=>retestExecution(s,px,bid,ask,ts,NOW,0.0005,0.0005,0.0005)
assert.ok(check().ok); assert.equal(check(101.79,101.81,NOW-6000).ok,false)
assert.equal(check(101,102).ok,false,'wide spread'); assert.equal(check(103,103.01).ok,false,'no chase')
assert.equal(retestExecution(s,px,101.79,101.81,NOW,NOW,.01,.01,.01).ok,false,'cost gate')
assert.equal(retestExecution(s,px,101.79,101.81,NOW,NOW,.0005,NaN,0).ok,false)
// Actual runner, including same-cycle exposure caps and immutable exit metadata.
const originalFetch=globalThis.fetch, originalNow=Date.now, g=globalThis as any
const keys=['__FAST_MODE','__FAST_LEV','__FAST_SHARE','__FAST_MAX_OPEN','__FAST_PER_TRADE']
const previous=keys.map(k=>g[k]); let commit:any
const pairs=['BTC',...Array.from({length:20},(_,i)=>`C${i}`)].map(sym=>({sym,s:`${sym}USDT`,k:1}))
const db={from(table:string){const q:any=new Proxy({}, {get(_t,key){
  if(key==='throwOnError')return async()=>({data:table==='market_cache'?[{data:{pairs}}]:[]})
  if(key==='then')return(resolve:any)=>resolve({data:[],count:0})
  if(key==='insert')return async()=>({})
  return()=>q
}});return q},rpc(name:string,args:any){return{throwOnError:async()=>{if(name==='fast_commit_cycle')commit=args;return{data:{}}}}}}
try {
 Date.now=()=>NOW; Object.assign(g,{__FAST_MODE:'retest',__FAST_LEV:100,__FAST_SHARE:.5,__FAST_MAX_OPEN:15,__FAST_PER_TRADE:.0625})
 globalThis.fetch=(async(url:string)=>new Response(JSON.stringify(url.includes('/klines')?
 b.map(x=>[x.t,x.open,x.high,x.low,x.close,x.vol,x.t+299999,0,0,x.tb]):
 {bids:[[101.79,1e6]],asks:[[101.81,1e6]],E:NOW}))) as typeof fetch
 await assert.rejects(()=>runFast(db,{balance:5000},'lease',false),/paper-only/)
 await runFast(db,{balance:5000,bot_params:{}},'lease',true)
 assert.equal(commit.p_entries.length,4,'same-side cap includes entries in this cycle')
 for(const e of commit.p_entries){assert.equal(e.lev,1);assert.equal(e.fast.mode,'retest');assert.equal(e.fast.hold_min,15)
 assert.ok(e.notional*(e.fast.r/e.price+e.fast.entry_check.cost_fraction)<=5000*RETEST.riskFraction+1e-8,'stop plus cost risk cap')
 assert.ok(Math.abs((e.fast.target-e.price)/e.fast.r-2)<1e-10)}
}finally{globalThis.fetch=originalFetch;Date.now=originalNow;keys.forEach((k,i)=>{if(previous[i]===undefined)delete g[k];else g[k]=previous[i]})}
console.log('Retest: long/short, no look-ahead breakout, malformed data, fees/spread/chase, paper guard, leverage, same-cycle concentration, risk and hold passed')

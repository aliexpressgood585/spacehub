import assert from 'node:assert/strict'
import { confirmationShadow } from '../supabase/functions/trading-bot/d5-confirmation-shadow.ts'
const start=1800000,now=start+302000,realNow=Date.now
const seed=()=>({trade_id:1,sym:'TEST',pair:{sym:'TEST',s:'TESTUSDT',k:1},baseline_opened_at:new Date(start+2000).toISOString(),status:'pending',next_check:new Date(now).toISOString()})
let row:any=seed(),writes:string[]=[],bad=false,missing=false
const db={from(table:string){assert.equal(table,'d5_confirmation_shadow','no trading table writes');const q:any=new Proxy({},{get(_t,k){if(k==='update')return(v:any)=>{Object.assign(row,v);writes.push(table);return q};if(k==='throwOnError')return async()=>({data:[row]});return()=>q}});return q}}
const deps={bars:async()=>missing?[]:[{t:start,open:100,high:102,low:99,close:bad?Infinity:101,vol:1}],book:async()=>({bids:[[100,100000]],asks:[[100.01,100000]],E:now}),exit:async()=>({close:{price:102,funding:.01,reason:'TARGET'},update:null})}
try{
 Date.now=()=>now
 await confirmationShadow(db,now,new Date(now+50000).toISOString(),deps)
 assert.equal(row.status,'open');assert.equal(row.payload.lev,1);assert.ok(row.payload.entry_price*row.payload.size<=100.000001)
 await confirmationShadow(db,now,new Date(now+50000).toISOString(),deps)
 assert.equal(row.status,'closed');assert.ok(row.net_bps>0)
 row=seed();bad=true;await confirmationShadow(db,now,new Date(now+50000).toISOString(),deps)
 assert.equal(row.status,'pending','invalid candle cannot confirm');assert.equal(row.payload,undefined)
 row=seed();bad=false;missing=true;const late=start+1000000;Date.now=()=>late
 await confirmationShadow(db,late,new Date(late+50000).toISOString(),deps);assert.equal(row.status,'expired');assert.equal(row.reason,'confirmation_data_gap')
 row=seed();missing=false;await confirmationShadow(db,late,new Date(late+50000).toISOString(),deps);assert.equal(row.status,'expired');assert.equal(row.reason,'confirmation_quote_late')
 row=seed();const before=writes.length;await confirmationShadow(db,late,new Date(late+10000).toISOString(),deps);assert.equal(writes.length,before,'lease budget skips work')
}finally{Date.now=realNow}
console.log('d5-shadow: independent state machine, no trading writes, invalid/missing/late/lease coverage passed')

import assert from 'node:assert/strict'
import {SCALP,validQuote,assess,exitPlan,allocation} from '../shared/scalp.ts'
const now=1800000000000, q={bid:100,ask:100.02,ts:now,imbalance:0.4,source:'test'}
assert.equal(validQuote(q,now),true)
assert.equal(validQuote({...q,ts:now-21000},now),false)
assert.equal(validQuote({...q,bid:NaN},now),false)
assert.equal(validQuote({...q,ask:99},now),false)
const b=Array.from({length:60},(_,i)=>({t:now-(60-i)*60000,o:99+i*.02,h:100+i*.02,l:98+i*.02,c:99.1+i*.02,v:100}))
assert.equal(assess('BTCUSDT',b,q,now).side,1)
assert.equal(assess('BTCUSDT',b,{...q,ask:102},now).side,0)
assert.equal(assess('BTCUSDT',b.slice(0,10),q,now).side,0)
assert.equal(assess('BTCUSDT',[...b.slice(0,50),...b.slice(51)],q,now).side,0)
const t={entry_price:100,side:'LONG',trail_sl:99,opened_at:new Date(now-60000).toISOString(),scalp_meta:{stop_pct:.004}}
assert.equal(exitPlan(t,q,now).close,false)
assert.equal(exitPlan({...t,opened_at:new Date(now-SCALP.maxHoldMs).toISOString()},q,now).reason,'TIMEOUT')
assert.equal(exitPlan(t,{...q,bid:98},now).close,true)
assert.ok(exitPlan(t,{...q,bid:102},now).stop>99)
assert.equal(exitPlan({...t,trail_sl:101},{...q,bid:100.9},now).reason,'STOP')
const sh={...t,side:'SHORT',trail_sl:101}
assert.equal(exitPlan(sh,{...q,ask:102},now).close,true)
assert.ok(exitPlan(sh,{...q,ask:98},now).stop<101)
assert.equal(allocation(1000,1000,0,4),247.5)
assert.equal(allocation(0,1000,0,4),0)
assert.equal(allocation(100,1000,1000,1),0)
assert.equal(allocation(100,1000,0,0),0)
for(let c=0;c<1000;c+=7){const n=allocation(c,1000,900,1);assert.ok(n>=0&&n*1.0005<=c+1e-9&&n<=90)}
console.log('Scalp signal, timing, trailing and cash invariants passed')

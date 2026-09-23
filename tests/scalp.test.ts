import assert from 'node:assert/strict'
import {SCALP,validQuote,assess,exitPlan,allocation,liquiditySweep,newsCheck,liqCheck,planHold} from '../shared/scalp.ts'
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
assert.equal(SCALP.maxPositions,8);assert.equal(SCALP.meetingMs,60000);assert.equal(SCALP.maxHoldMs,15*60000)
// trailing only ratchets after the 1-minute minimum hold; the hard stop still fires at once
assert.equal(exitPlan({...t,opened_at:new Date(now-30000).toISOString()},{...q,bid:102},now).stop,99)
assert.equal(exitPlan({...t,opened_at:new Date(now-30000).toISOString()},{...q,bid:98},now).reason,'STOP')
// liquidity sweep: last bar wicks under the 20-bar low and closes back inside
const flat=Array.from({length:30},(_,i)=>({t:now-(30-i)*60000,o:100,h:100.5,l:99.5,c:100,v:1}))
assert.equal(liquiditySweep([...flat.slice(0,-1),{...flat[29],l:99,c:100.2,h:100.3}]).dir,1)
assert.equal(liquiditySweep([...flat.slice(0,-1),{...flat[29],h:101,c:99.8,o:100}]).dir,-1)
assert.equal(liquiditySweep(flat).dir,0)
// news: needs coin name, freshness and a >=0.3% price move since publication
const up=Array.from({length:30},(_,i)=>({t:now-(30-i)*60000,o:100+i*.05,h:100.1+i*.05,l:99.9+i*.05,c:100.05+i*.05,v:1}))
const n1={title:'Bitcoin ETF inflows surge',source:'test',url:'u',ts:now-20*60000}
assert.equal(newsCheck('BTC',up,[n1],now).dir,1);assert.equal(newsCheck('BTC',up,[n1],now).verified,true)
assert.equal(newsCheck('ETH',up,[n1],now).item,null)
assert.equal(newsCheck('BTC',up,[{...n1,ts:now-2*3600000}],now).item,null)
assert.equal(newsCheck('BTC',flat,[n1],now).verified,false)
assert.equal(newsCheck('BTC',flat,[{...n1,source:''}],now).item,null)
// liquidations: fresh, priced near the mid, one-sided, and reclaimed
const L=(side:'long'|'short',px:number,ts=now-60000)=>({side,px,sz:1,ts,source:'okx'})
assert.equal(liqCheck([L('long',99),L('long',99.5)],100,now).dir,1)
assert.equal(liqCheck([L('short',101),L('short',100.5)],100,now).dir,-1)
assert.equal(liqCheck([L('long',99),L('short',101)],100,now).dir,0)
assert.equal(liqCheck([L('long',50),L('long',50)],100,now).valid,0)
assert.equal(liqCheck([L('long',99,now-3600000),L('long',99)],100,now).dir,0)
assert.equal(allocation(1000,1000,0,8),123.75)
// v76.0 whole portfolio: fewer entries -> bigger tickets, capped at 50% per coin
assert.equal(allocation(1000,1000,0,1),500); assert.equal(allocation(1000,1000,0,2),495); assert.equal(allocation(1000,1000,500,1),490)
// v74.0 adaptive hold
assert.equal(planHold(1,0.2,0,0.001),5); assert.equal(planHold(1,0.5,1,0.001),13); assert.equal(planHold(1,0.2,-1,0.003),1)
assert.equal(planHold(-1,-0.5,-1,0.0005),13); assert.ok(planHold(1,1,1,0)<=15)
const at=(min:number)=>new Date(now-min*60000).toISOString()
const h5={entry_price:100,side:'LONG',trail_sl:99,opened_at:at(6),scalp_meta:{stop_pct:.004,hold_min:5}}
assert.equal(exitPlan(h5,{...q,bid:99.9},now).reason,'PLANNED')                         // loser past plan: out
assert.equal(exitPlan(h5,{...q,bid:100.5},now).close,false)                             // winner, no fresh view: wait for the meeting
assert.equal(exitPlan(h5,{...q,bid:100.5},now,{side:1,weighted:0.3}).reason,'EXTEND')   // winner the team backs: extended
assert.equal(exitPlan(h5,{...q,bid:100.5},now,{side:0,weighted:0}).reason,'PLANNED')   // winner nobody backs: out
assert.equal(exitPlan({...h5,opened_at:at(2)},{...q,bid:100.5},now,{side:-1,weighted:-0.3}).reason,'FLIP') // team flips: out early
assert.equal(exitPlan({...h5,opened_at:at(0.5)},{...q,bid:100.5},now,{side:-1,weighted:-0.3}).close,false) // never inside the first minute
assert.equal(exitPlan({...h5,opened_at:at(16)},{...q,bid:100.5},now,{side:1,weighted:0.9}).reason,'TIMEOUT') // 15 min is a hard cap
assert.equal(exitPlan({...h5,opened_at:at(0.2)},{...q,bid:98},now).reason,'STOP')      // stop always fires
assert.equal(exitPlan({...h5,scalp_meta:{stop_pct:.004,hold_min:1},opened_at:at(1.1)},{...q,bid:99.95},now).reason,'PLANNED') // a 1-minute trade
console.log('Scalp signal, timing, trailing and cash invariants passed')
// DB guard, edge function and UI must agree on the position cap.
import {readFileSync,readdirSync} from 'node:fs'
const mig=readdirSync('supabase/migrations').filter(f=>readFileSync(`supabase/migrations/${f}`,'utf8').includes('scalp_commit_cycle')).sort().pop()!
assert.ok(readFileSync(`supabase/migrations/${mig}`,'utf8').includes(`countopen>=${SCALP.maxPositions}`),`latest ledger migration ${mig} must cap at ${SCALP.maxPositions}`)
assert.ok(readFileSync(`supabase/migrations/${mig}`,'utf8').includes(`eq*${SCALP.perCoin}`),`latest ledger migration ${mig} must cap each coin at ${SCALP.perCoin}`)
console.log(`DB ledger cap matches SCALP.maxPositions (${mig})`)

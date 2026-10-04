// Real PostgreSQL/WASM transactions. Clock injection changes time only, never ledger branches.
// PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js node tests/sql/q15.test.mjs
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db=new PGlite(),read=p=>readFileSync(p,'utf8')
await db.exec(read('tests/sql/schema.sql'))
const agg=read('supabase/migrations/20261004120000_agg2.sql')
await db.exec(agg.slice(agg.indexOf('create or replace function public.agg2_day'),agg.indexOf('create table if not exists public.fast_shadow')))
await db.exec(`create function public.q15_test_clock() returns timestamptz language sql as $$select to_timestamp(floor(extract(epoch from now())/900)*900+2)$$;`)
await db.exec(read('supabase/migrations/20261004120001_q15_sleeve.sql').replaceAll('clock_timestamp()', 'public.q15_test_clock()'))
const [{rows:[clock]}]=await db.exec("select public.q15_test_clock() as ts,extract(epoch from public.q15_test_clock())*1000 as ms")
const ms=Number(clock.ms),bar=Math.floor(ms/900000)*900000,lease=new Date(ms+60000).toISOString()
const reset=async()=>{await db.exec("truncate bot_trades;delete from bot_state;");await db.query('insert into bot_state(id,balance,lock_until) values(1,5000,$1)',[lease])}
const entry=(sym='AAA',lev=10)=>({sym,side:'LONG',price:100,notional:1e6,lev,quote_ts:ms,profit_gate:'passed',net_bps:20,q15:{hold_ms:7200000,stop:99,target:102,chk:ms}})
const q=async(entries=[],closes=[],note={marks_fresh:true},b=bar,marks={})=>(await db.query('select q15_commit_cycle($1,$2,$3,$4,$5,.9,$6) as r',[lease,JSON.stringify(closes),JSON.stringify(entries),JSON.stringify(marks),JSON.stringify(note),b])).rows[0].r
const blade=async(sleeve,entries=[],closes=[])=>(await db.query("select blade_commit_cycle($1,$2,$3,'[]','[]',$4,'{}','{}','EVT',3,false) as r",[lease,sleeve,JSON.stringify(closes),JSON.stringify(entries)])).rows[0].r
const be=(sym='EV1',lev=100)=>({sym,lev,side:'LONG',price:100,notional:1e6,stop:96,target:108,quote_ts:ms,release_at:new Date(ms).toISOString(),meta:{ladder:{origSlDist:4}}})
const rows=async()=> (await db.query('select * from bot_trades order by id')).rows
await reset();await db.exec('update bot_state set paper_mode=false');await assert.rejects(()=>q([entry()]),/paper account/)
await reset();await assert.rejects(()=>q([{...entry(),net_bps:1.99}]),/profit gate/)
await reset();let r=await q(Array.from({length:12},(_,i)=>entry('Q'+i,100)));let tr=await rows();assert.equal(tr.length,8);assert.ok(tr.every(t=>Number(t.lev)===10&&Number(t.entry_price)*Number(t.size)/Number(t.lev)<=250));assert.ok(tr.reduce((s,t)=>s+Number(t.entry_price)*Number(t.size)/Number(t.lev),0)<=2500)
assert.equal((await q([entry('REPEAT')])).opened,0,'same bar duplicate commit')
await reset();await q([entry()]);let first=(await rows())[0],cash=Number((await db.query('select balance from bot_state')).rows[0].balance)
r=await q([],[{id:first.id,price:1,quote_ts:ms,funding:0,funding_complete:true,reason:'LIQUIDATION'}]);assert.equal(Number(r.balance),cash,'wipe cannot take another dollar of cash');first=(await rows())[0];assert.ok(Number(first.pnl)>=-Number(first.entry_price)*Number(first.size)/10-Number(first.fee)-1e-8)
await reset();await q([],[],{marks_fresh:true});await db.exec("update bot_state set balance=4399");r=await q([entry()]);assert.equal(r.halted,true);assert.equal(r.opened,0);assert.equal((await blade('EVT',[be()])).opened,0);assert.equal((await blade('DONCH4H',[be('DON')])).opened,0)
await db.exec('update bot_state set balance=6000');assert.equal((await q([entry()])).opened,0,'sticky halt survives equity recovery')
await db.exec("update bot_state set bot_params=jsonb_set(bot_params,'{agg_day,day}','\"2000-01-01\"')- 'q15_bar'");assert.equal((await q([entry()])).opened,1,'next UTC day clears halt')
// Exit still accepted while halted, and the bad-day flag does not shrink size instead of stopping entries.
first=(await rows())[0];await db.exec("update bot_state set bot_params=jsonb_set(bot_params,'{agg_day,halted}','true')");assert.equal((await q([],[{id:first.id,price:101,quote_ts:ms,funding:0,funding_complete:true,reason:'TARGET'}])).closed,1)
await reset();r=await q([entry()],[],{marks_fresh:false});assert.equal(r.opened,0);assert.equal((await blade('EVT',[be()])).opened,0,'missing equity marks block all new entries')
await reset();await blade('EVT',[be(),be('EV2'),be('EV3'),be('EV4')]);tr=await rows();assert.equal(tr.length,3);assert.ok(tr.every(t=>Number(t.lev)===10&&Number(t.entry_price)*Number(t.size)/10<=400))
await reset();assert.equal((await blade('EVT',[{...be(),release_at:new Date(ms-30001).toISOString()}])).opened,0,'30 seconds is a hard ledger age limit')
await reset();await blade('DONCH4H',[{...be('DON',100),notional:400}]);tr=await rows();assert.equal(Number(tr[0].lev),1);assert.ok(Number(tr[0].risk_usd)<=62.5,'DONCH risk <=1.25%, including ADX tiers')
assert.equal((await blade('DONCH4H',[{...be('DON'),price:101,meta:{pyramid:{unit:2},ladder:{origSlDist:4}}}])).opened,0,'second pyramid below .6R rejected')
assert.equal((await blade('DONCH4H',[{...be('DON'),price:103,meta:{pyramid:{unit:2},ladder:{origSlDist:4}}}])).opened,1,'second pyramid after .6R accepted')
await reset();await db.query("insert into bot_trades(sym,side,entry_price,size,strategy,lev) values('OLD','LONG',100,1,'DONCH4H',10)");await assert.rejects(()=>blade('EVT',[be()]),/foreign or non-paper/)
await reset();await db.exec("insert into bot_trades(sym,side,entry_price,size,strategy,lev,status) select 'X'||i,'LONG',100,1,'Q15',10,'TP' from generate_series(1,20)i");assert.equal((await q([entry()])).opened,0,'20 entries per UTC day hard cap')
// A late restart must compare with midnight, not silently reset to the already depleted book.
await reset();await db.exec("update bot_state set balance=4000;insert into bot_trades(sym,side,entry_price,size,strategy,lev) values('NIGHT','LONG',100,10,'DONCH4H',1)");
r=await q([entry()],[],{marks_fresh:true,day_start_marks:{NIGHT:100}},bar,{NIGHT:30});assert.equal(Number(r.day_start),5000);assert.equal(r.halted,true);assert.equal(r.opened,0)
// Missing midnight data blocks entries; resolving it later uses the saved pre-exit book.
await reset();await db.exec("update bot_state set balance=4000;insert into bot_trades(sym,side,entry_price,size,strategy,lev) values('NIGHT','LONG',100,10,'DONCH4H',1)");
r=await q([entry()],[],{marks_fresh:false});assert.equal(r.halted,true);first=(await rows())[0]
assert.equal((await blade('DONCH4H',[],[{id:first.id,price:30,quote_ts:ms,funding:0,reason:'STOP'}])).closed,1)
r=await q([entry()],[],{marks_fresh:true,day_start_marks:{NIGHT:100}});assert.equal(Number(r.day_start),5000);assert.equal(r.halted,true,'recovering the baseline never erases the overnight loss')
await db.close();console.log('q15 SQL: paper lock, caps, isolation, pyramids, halt and exits — all checks passed')

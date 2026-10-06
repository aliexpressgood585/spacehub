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
await db.exec(read('supabase/migrations/20261004120001_q15_sleeve.sql').replaceAll('clock_timestamp()', 'public.q15_test_clock()').replaceAll('now()', 'public.q15_test_clock()'))
await db.exec(read('supabase/migrations/20261005140628_q15_autonomous_reliability.sql').replaceAll('clock_timestamp()', 'public.q15_test_clock()').replaceAll('now()', 'public.q15_test_clock()'))
const [{rows:[clock]}]=await db.exec("select public.q15_test_clock() as ts,extract(epoch from public.q15_test_clock())*1000 as ms")
const ms=Number(clock.ms),bar=Math.floor(ms/900000)*900000,lease=new Date(ms+60000).toISOString()
const reset=async()=>{await db.exec("truncate bot_trades;delete from bot_state;");await db.query('insert into bot_state(id,balance,lock_until) values(1,5000,$1)',[lease])}
const entry=(sym='AAA',lev=10)=>({sym,side:'LONG',price:100,notional:1e6,lev,quote_ts:ms,profit_gate:'passed',net_bps:20,q15:{hold_ms:7200000,stop:99,target:102,chk:ms}})
const q=async(entries=[],closes=[],note={marks_fresh:true},b=bar,marks={})=>(await db.query('select q15_commit_cycle($1,$2,$3,$4,$5,.9,$6) as r',[lease,JSON.stringify(closes),JSON.stringify(entries),JSON.stringify(marks),JSON.stringify(note),b])).rows[0].r
const blade=async(sleeve,entries=[],closes=[])=>(await db.query("select blade_commit_cycle($1,$2,$3,'[]','[]',$4,'{}','{}','EVT',3,false) as r",[lease,sleeve,JSON.stringify(closes),JSON.stringify(entries)])).rows[0].r
const be=(sym='EV1',lev=100)=>({sym,lev,side:'LONG',price:100,notional:1e6,stop:96,target:108,quote_ts:ms,release_at:new Date(ms).toISOString(),meta:{ladder:{origSlDist:4}}})
const rows=async()=> (await db.query('select * from bot_trades order by id')).rows
await reset();await db.exec('update bot_state set paper_mode=false');await assert.rejects(()=>q([entry()]),/paper account/)
await reset();await assert.rejects(()=>q([{...entry(),net_bps:-1000}]),/profit gate/)
await reset();let r=await q(Array.from({length:12},(_,i)=>entry('Q'+i,100)));let tr=await rows();assert.ok(tr.length>=6);assert.ok(tr.every(t=>Number(t.lev)===25&&Number(t.entry_price)*Number(t.size)/Number(t.lev)<=750));assert.ok(tr.reduce((s,t)=>s+Number(t.entry_price)*Number(t.size)/Number(t.lev),0)<=4500)
assert.equal((await q([entry('REPEAT')])).opened,0,'same bar duplicate commit')
await reset();await q([entry()]);let first=(await rows())[0],cash=Number((await db.query('select balance from bot_state')).rows[0].balance)
r=await q([],[{id:first.id,price:1,quote_ts:ms,funding:0,funding_complete:true,reason:'LIQUIDATION'}]);assert.equal(Number(r.balance),cash,'wipe cannot take another dollar of cash');first=(await rows())[0];assert.ok(Number(first.pnl)>=-Number(first.entry_price)*Number(first.size)/Number(first.lev)-Number(first.fee)-1e-8)
await reset();await q([],[],{marks_fresh:true});await db.exec("update bot_state set balance=4399");r=await q([entry()]);assert.equal(r.halted,true);assert.equal(r.opened,0);assert.equal((await blade('EVT',[be()])).opened,0);assert.equal((await blade('DONCH4H',[be('DON')])).opened,0)
await db.exec('update bot_state set balance=6000');assert.equal((await q([entry()])).opened,0,'sticky halt survives equity recovery')
await db.exec("update bot_state set bot_params=jsonb_set(bot_params,'{agg_day,day}','\"2000-01-01\"')- 'q15_bar'");assert.equal((await q([entry()])).opened,1,'next UTC day clears halt')
// Exit still accepted while halted, and the bad-day flag does not shrink size instead of stopping entries.
first=(await rows())[0];await db.exec("update bot_state set bot_params=jsonb_set(bot_params,'{agg_day,halted}','true')");assert.equal((await q([],[{id:first.id,price:101,quote_ts:ms,funding:0,funding_complete:true,reason:'TARGET'}])).closed,1)
await reset();r=await q([entry()],[],{marks_fresh:false});assert.equal(r.opened,0);assert.equal((await blade('EVT',[be()])).opened,0,'missing equity marks block all new entries')
await reset();await blade('EVT',[be(),be('EV2'),be('EV3'),be('EV4')]);tr=await rows();assert.equal(tr.length,3);assert.ok(tr.every(t=>Number(t.lev)===10&&Number(t.entry_price)*Number(t.size)/10<=400.5))
await reset();assert.equal((await blade('EVT',[{...be(),release_at:new Date(ms-90001).toISOString()}])).opened,0,'90-second commit allowance is preserved')
await reset();await blade('DONCH4H',[{...be('DON',100),notional:400}]);tr=await rows();assert.equal(Number(tr[0].lev),1);assert.ok(Number(tr[0].risk_usd)<=62.5,'DONCH risk <=1.25%, including ADX tiers')
assert.equal((await blade('DONCH4H',[{...be('DON'),price:101,meta:{pyramid:{unit:2},ladder:{origSlDist:4}}}])).opened,0,'second pyramid below .6R rejected')
assert.equal((await blade('DONCH4H',[{...be('DON'),price:103,meta:{pyramid:{unit:2},ladder:{origSlDist:4}}}])).opened,1,'second pyramid after .6R accepted')
await reset();await db.query("insert into bot_trades(sym,side,entry_price,size,strategy,lev) values('OLD','LONG',100,1,'DONCH4H',10)");await assert.rejects(()=>blade('EVT',[be()]),/foreign or non-paper/)
await reset();await db.exec("insert into bot_trades(sym,side,entry_price,size,strategy,lev,status) select 'X'||i,'LONG',100,1,'Q15',10,'TP' from generate_series(1,200)i");assert.equal((await q([entry()])).opened,0,'200 entries per UTC day hard cap')
// A late restart must compare with midnight, not silently reset to the already depleted book.
await reset();await db.exec("update bot_state set balance=4000;insert into bot_trades(sym,side,entry_price,size,strategy,lev) values('NIGHT','LONG',100,10,'DONCH4H',1)");
r=await q([entry()],[],{marks_fresh:true,day_start_marks:{NIGHT:100}},bar,{NIGHT:30});assert.equal(Number(r.day_start),5000);assert.equal(r.halted,true);assert.equal(r.opened,0)
// Missing midnight data blocks entries; resolving it later uses the saved pre-exit book.
await reset();await db.exec("update bot_state set balance=4000;insert into bot_trades(sym,side,entry_price,size,strategy,lev) values('NIGHT','LONG',100,10,'DONCH4H',1)");
r=await q([entry()],[],{marks_fresh:false});assert.equal(r.halted,true);first=(await rows())[0]
assert.equal((await blade('DONCH4H',[],[{id:first.id,price:30,quote_ts:ms,funding:0,reason:'STOP'}])).closed,1)
r=await q([entry()],[],{marks_fresh:true,day_start_marks:{NIGHT:100}});assert.equal(Number(r.day_start),5000);assert.equal(r.halted,true,'recovering the baseline never erases the overnight loss')
await reset();r=await q([],[],{marks_fresh:true,q15_autonomy:{version:2,learned_at:'test'}});assert.equal((await db.query("select bot_params->'q15_autonomy' as a from bot_state")).rows[0].a.version,2,'learning commits atomically with ledger');
await reset();await q(Array.from({length:25},(_,i)=>({...entry('CAP'+i,25),notional:250})));assert.equal((await rows()).length,20,'20-position hard cap remains available');
await reset();await q([entry('Q25',25)]);assert.equal((await blade('EVT',[be('EV')])).opened,1,'restored Blade can transact alongside 25x Q15');
// Owner can disable only the paper loss brake; existing execution controls still apply.
await reset();await q([],[],{marks_fresh:true});await db.exec('update bot_state set balance=4000');
assert.equal((await q()).halted,true);
await db.exec(read('supabase/migrations/20261005163138_paper_daily_halt_optional.sql'));
assert.equal((await db.query("select bot_params->'agg_day'->'halted' as h from bot_state")).rows[0].h,false,'migration clears existing loss latch');
await db.exec("update bot_state set bot_params=bot_params-'q15_bar'");
r=await q([entry('RESUME')]);assert.equal(r.halted,false);assert.equal(r.opened,1,'paper autonomously resumes below former loss limit');
await reset();await db.exec("update bot_state set bot_params='{\"daily_loss_halt_enabled\":false}',hard_halt_at=now()");
assert.equal((await q([entry()])).opened,0,'manual stop remains');
await db.exec('update bot_state set hard_halt_at=null');assert.equal((await q([entry()],[],{marks_fresh:false})).opened,0,'fresh marks remain required');
await db.exec("update bot_state set paper_mode=false");await assert.rejects(()=>q([entry()]),/paper account/);
await reset();await db.exec("update bot_state set bot_params='{\"daily_loss_halt_enabled\":false}'");await q([],[],{marks_fresh:true});
await db.exec("update bot_state set balance=4000,bot_params=jsonb_set(bot_params,'{daily_loss_halt_enabled}','true')");
assert.equal((await q([entry()])).halted,true,'re-enable restores loss brake');
await db.exec(read('supabase/migrations/20261005163138_paper_daily_halt_optional.sql'));
assert.equal((await q([entry()])).halted,true,'redeployment preserves explicit re-enable');
// The DDDDD mode uses the same atomic ledger but exclusively long 1%/1% levels.
await db.exec(read('supabase/migrations/20261005193450_ddddd_paper_strategy.sql').replaceAll('clock_timestamp()', 'public.q15_test_clock()').replaceAll('now()', 'public.q15_test_clock()'));
await reset();await db.exec("update bot_state set bot_params='{\"paper_strategy\":\"DDDDD\",\"daily_loss_halt_enabled\":false}'");
const de={...entry('DD',25),q15:{hold_ms:0,stop:99,target:101,chk:ms,bar,pattern:'DDDDD'}};
r=await q([de]);assert.equal(r.opened,1);
assert.equal((await blade('EVT',[be()])).opened,0,'other sleeves disabled in pattern-only mode');
assert.equal((await q([{...de,sym:'DD2'}])).opened,1,'next scan batch can commit in same 5m bar');
const dd=(await rows())[0];await q([],[{id:dd.id,price:101,quote_ts:ms,funding:0,funding_complete:true,reason:'TARGET'}]);
assert.equal((await q([de])).opened,0,'same pattern cannot re-enter after close');
await assert.rejects(()=>q([{...de,sym:'BAD',side:'SHORT'}]),/wrong side|DDDDD/);
await assert.rejects(()=>q([{...de,sym:'BAD',q15:{...de.q15,target:102}}]),/DDDDD/);
await db.exec("alter table bot_state add peak_balance numeric,add day_start_balance numeric,add day_date date,add hard_halt_reason text,add trade_count integer,add streak integer,add overall_wr numeric,add overall_pf numeric,add coin_weights jsonb;create table bot_trade_snapshots(id bigint,trade_id bigint references bot_trades(id));");
await db.exec(read('scripts/activate-ddddd-paper.sql'));
assert.equal(Number((await db.query('select balance from bot_state')).rows[0].balance),5000);assert.equal((await rows()).length,0);
assert.ok((await db.query("select * from paper_reset_archive where source='bot_trades'")).rows.length>0,'reset archives old trades');
await db.exec('update bot_state set balance=4321');await db.exec(read('scripts/activate-ddddd-paper.sql'));
assert.equal(Number((await db.query('select balance from bot_state')).rows[0].balance),4321,'redeploy cannot reset account again');
await db.exec('drop table bot_trade_snapshots');
// Execution v2: run the final deployed function against real PostgreSQL semantics.
const {readdirSync}=await import('node:fs')
const qualityPath=process.env.D5_MIGRATION || 'supabase/migrations/'+readdirSync('supabase/migrations').find(n=>n.endsWith('_ddddd_execution_quality.sql'))
await db.exec(read(qualityPath).replaceAll('clock_timestamp()', 'public.q15_test_clock()').replaceAll('now()', 'public.q15_test_clock()'));
await reset();await db.exec("truncate bot_equity,d5_confirmation_shadow;update bot_state set bot_params='{\"paper_strategy\":\"DDDDD\",\"daily_loss_halt_enabled\":false,\"d5_execution_version\":2}'");
const v2={...de,sym:'V2',lev:15,notional:1000,q15:{...de.q15,pair:{sym:'V2',s:'V2USDT',k:1},execution_version:2,gate:{costBps:25},protection:{version:2,stop:100.15,trigger:100.4,enabled:true}}};
await assert.rejects(()=>q([{...v2,q15:{...v2.q15,execution_version:1}}]),/v2/);
await assert.rejects(()=>q([{...v2,q15:{...v2.q15,gate:{costBps:51}}}]),/v2/);
await assert.rejects(()=>q([{...v2,lev:25}]),/v2/);
r=await q([v2],[],{marks_fresh:true,execution_version:2},bar,{V2:100});assert.equal(r.opened,1);
let samples=(await db.query('select * from bot_equity')).rows;
assert.equal(samples.length,1);assert.equal(Number(samples[0].equity),4999.5);assert.equal(Number(samples[0].exposure),1000,'exposure remains gross notional dollars');
assert.equal((await db.query('select * from d5_confirmation_shadow')).rows.length,1,'one observation seeded atomically');
await q([],[],{marks_fresh:true},null,{V2:100});assert.equal((await db.query('select * from bot_equity')).rows.length,1,'same minute throttled');
await db.exec("update bot_state set bot_params=bot_params-'q15_equity_sample_at'");
await q([],[],{marks_fresh:false},null,{});assert.equal((await db.query('select * from bot_equity')).rows.length,1,'unhealthy marks not stored');
await q([],[],{marks_fresh:true},null,{});assert.equal((await db.query('select * from bot_equity')).rows.length,1,'missing position mark not invented');
first=(await rows())[0];r=await q([],[{id:first.id,price:101,quote_ts:ms,funding:0,funding_complete:true,reason:'TARGET'}],{marks_fresh:true},null,{});
samples=(await db.query('select * from bot_equity order by id')).rows;
assert.equal(samples.length,2);assert.ok(Math.abs(Number(samples.at(-1).equity)-5008.995)<1e-8);assert.equal(Number(samples.at(-1).exposure),0);
assert.equal(Number(samples.at(-1).balance),Number(r.balance),'snapshot uses committed final cash');
console.log('q15 ledger v2: cost enforcement, no reset, isolated shadow and atomic equity samples passed');
await db.close();
console.log('q15 SQL: paper lock, caps, isolation, pyramids, halt and exits — all checks passed')


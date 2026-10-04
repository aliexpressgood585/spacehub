-- P-Q15 ledger tests (run by tests/sql/run.sh after the BLADE + AGG2 + Q15 migrations). Every check raises on failure.
\set ON_ERROR_STOP 1
create or replace function t_q15(sym text, side text, px numeric, notional numeric, lev int, stop numeric, target numeric, pass boolean default true) returns jsonb language sql as $$
  select jsonb_build_object('sym',sym,'side',side,'price',px,'notional',notional,'lev',lev,'quote_ts',t_ms(),'source','test',
   'q15',jsonb_build_object('stop',stop,'target',target,'gate',jsonb_build_object('pass',pass))) $$;
create or replace function t_note() returns jsonb language sql as $$ select '{"share":0.5,"per_trade":0.05,"max_open":8}'::jsonb $$;
delete from bot_trades; update bot_state set balance=5000, paper_mode=true, active=true, hard_halt_at=null, bot_params='{}';

-- 1. lev clamped 1..10, margin <= 5% of equity, stored as Q15
select q15_commit_cycle(t_lease(),'[]',jsonb_build_array(t_q15('QA','LONG',100,1000000,50,99,102)),'[]','{}',t_note(),null);
select t_check((select lev from bot_trades where sym='QA' and strategy='Q15')=10, 'Q15 lev clamped to 10');
select t_check((select entry_price*size/lev from bot_trades where sym='QA') <= 5000*0.0501+0.01, 'Q15 margin <= 5% of equity');

-- 2. <= 8 open, share passed above 0.5 is capped, per_trade above 5% is capped
delete from bot_trades; update bot_state set balance=5000, bot_params='{}';
select q15_commit_cycle(t_lease(),'[]',(select jsonb_agg(t_q15('Q'||i,'LONG',100,5000,10,99,102)) from generate_series(1,12) i),'[]','{}','{"share":0.9,"per_trade":0.5,"max_open":20}',null);
select t_check((select count(*) from bot_trades where status='OPEN' and strategy='Q15')=8, 'Q15 <= 8 open even if 20 is passed');
select t_check((select max(entry_price*size/lev) from bot_trades where strategy='Q15') <= 5000*0.0501+0.01, 'per trade capped at 5% even if 0.5 is passed');
select t_check((select sum(entry_price*size/lev) from bot_trades where strategy='Q15') <= 5000*0.5+1, 'Q15 share <= 50%');

-- 3. an ungated entry and a stop under 0.4% are refused
do $$ begin delete from bot_trades; update bot_state set balance=5000, bot_params='{}';
  perform q15_commit_cycle(t_lease(),'[]',jsonb_build_array(t_q15('NG','LONG',100,1000,10,99,102,false)),'[]','{}',t_note(),null);
  raise exception 'FAILED: ungated entry accepted'; exception when others then if sqlerrm like 'FAILED%' then raise; end if; end $$;
do $$ begin delete from bot_trades; update bot_state set balance=5000, bot_params='{}';
  perform q15_commit_cycle(t_lease(),'[]',jsonb_build_array(t_q15('TS','LONG',100,1000,10,99.7,102)),'[]','{}',t_note(),null);
  raise exception 'FAILED: 0.3%% stop accepted'; exception when others then if sqlerrm like 'FAILED%' then raise; end if; end $$;

-- 4. 20 Q15 entries per UTC day
delete from bot_trades; update bot_state set balance=5000, bot_params='{}';
insert into bot_trades(sym,side,entry_price,size,fee,status,paper_mode,strategy,lev,opened_at,closed_at,pnl) select 'D'||i,'LONG',100,1,0,'SL',true,'Q15',10,now(),now(),0 from generate_series(1,20) i;
select q15_commit_cycle(t_lease(),'[]',jsonb_build_array(t_q15('D21','LONG',100,1000,10,99,102)),'[]','{}',t_note(),null);
select t_check((select count(*) from bot_trades where sym='D21')=0, 'no 21st Q15 entry in the UTC day');

-- 5. paper lock + leverage isolation: a leveraged DONCH4H row or a non-paper row stops the ledger
do $$ begin delete from bot_trades; update bot_state set balance=5000, bot_params='{}';
  insert into bot_trades(sym,side,entry_price,size,fee,status,paper_mode,strategy,lev) values ('DX','LONG',100,1,0,'OPEN',true,'DONCH4H',10);
  perform q15_commit_cycle(t_lease(),'[]','[]','[]','{}',t_note(),null);
  raise exception 'FAILED: leveraged DONCH4H accepted'; exception when others then if sqlerrm like 'FAILED%' then raise; end if; end $$;
do $$ begin delete from bot_trades; update bot_state set balance=5000, paper_mode=false, bot_params='{}';
  perform q15_commit_cycle(t_lease(),'[]','[]','[]','{}',t_note(),null);
  raise exception 'FAILED: non-paper account accepted'; exception when others then if sqlerrm like 'FAILED%' then raise; end if; end $$;
update bot_state set paper_mode=true;

-- 6. DONCH4H next to Q15 rows: accepted by the EVT/DONCH ledger and still forced to 1x
delete from bot_trades; update bot_state set balance=5000, bot_params='{}';
select q15_commit_cycle(t_lease(),'[]',jsonb_build_array(t_q15('QB','LONG',100,2500,10,99,102)),'[]','{}',t_note(),null);
select blade_commit_cycle(t_lease(),'DONCH4H','[]','[]','[]',jsonb_build_array(t_blade('DQ','LONG',100,500,10,97)),'{}','{}','DONCH',30,false);
select t_check((select lev from bot_trades where sym='DQ')=1, 'DONCH4H stays 1x next to a 10x Q15 row');

-- 7. the -12% day halt blocks Q15 entries; exits still run and are isolated
update bot_state set bot_params=jsonb_build_object('agg_day',jsonb_build_object('day',to_char((now() at time zone 'UTC')::date,'YYYY-MM-DD'),'start',6000,'halted',false));
select q15_commit_cycle(t_lease(),jsonb_build_array(jsonb_build_object('id',(select id from bot_trades where sym='QB'),'price',80,'reason','STOP','quote_ts',t_ms())),
  jsonb_build_array(t_q15('QC','LONG',100,1000,10,99,102)),'[]','{}',t_note(),null);
select t_check((select status from bot_trades where sym='QB')='SL', 'exit runs while halted');
select t_check((select pnl from bot_trades where sym='QB') >= -(select entry_price*size/lev + fee from bot_trades where sym='QB')-0.01, 'isolated: loss bounded by margin + fee');
select t_check((select count(*) from bot_trades where sym='QC')=0, 'halt blocks new Q15 entries');
select t_check((select (bot_params->'agg_day'->>'halted')::boolean from bot_state), 'halt recorded');
select 'q15 sql: all checks passed';

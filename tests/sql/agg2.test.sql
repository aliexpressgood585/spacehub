-- P-AGG2 ledger tests (run by tests/sql/run.sh against a throw-away local Postgres with tests/sql/schema.sql).
-- Every check raises on failure, so psql -v ON_ERROR_STOP=1 exits non-zero.
\set ON_ERROR_STOP 1
create or replace function t_lease() returns timestamptz language sql as $$ update bot_state set lock_until=clock_timestamp()+interval '1 minute' where id=1 returning lock_until $$;
create or replace function t_ms() returns bigint language sql as $$ select (extract(epoch from clock_timestamp())*1000)::bigint $$;
create or replace function t_check(ok boolean, what text) returns void language plpgsql as $$ begin if not coalesce(ok,false) then raise exception 'FAILED: %', what; end if; end $$;
create or replace function t_fast(sym text, side text, px numeric, notional numeric, lev int, stop numeric, target numeric) returns jsonb language sql as $$
  select jsonb_build_object('sym',sym,'side',side,'price',px,'notional',notional,'lev',lev,'quote_ts',t_ms(),'source','test','fast',jsonb_build_object('stop',stop,'target',target)) $$;
create or replace function t_blade(sym text, side text, px numeric, notional numeric, lev int, stop numeric, meta jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('sym',sym,'side',side,'price',px,'notional',notional,'lev',lev,'stop',stop,'target',px*1.1,'quote_ts',t_ms(),'source','test','release_at',now(),'meta',meta) $$;

insert into bot_state(id,balance,paper_mode,active,bot_params) values (1,5000,true,true,'{}');

-- 1. FAST: leverage clamped to 10, margin <= 5% of equity, stored lev 10
select fast_commit_cycle(t_lease(),'[]',jsonb_build_array(t_fast('AAA','LONG',100,1000000,50,99,102)),'{}',0.5,'{}',null);
select t_check((select lev from bot_trades where sym='AAA')=10, 'FAST lev clamped to 10');
select t_check((select entry_price*size/lev from bot_trades where sym='AAA') <= 5000*0.0501+0.01, 'FAST margin <= 5% of equity');
select t_check((select bot_params->'agg_day'->>'start' from bot_state)::numeric between 4990 and 5000, 'day start recorded');

-- 2. FAST: <= 8 open, and a stop tighter than 0.3% is refused
select fast_commit_cycle(t_lease(),'[]',(select jsonb_agg(t_fast('F'||i,'LONG',100,2000,10,99,102)) from generate_series(1,10) i),'{}',0.5,'{}',null);
select t_check((select count(*) from bot_trades where status='OPEN' and strategy='FAST')=8, 'FAST <= 8 open');
do $$ begin delete from bot_trades; update bot_state set balance=5000, bot_params='{}'; perform fast_commit_cycle(t_lease(),'[]',jsonb_build_array(t_fast('TIGHT','LONG',100,1000,10,99.9,102)),'{}',0.5,'{}',null);
  raise exception 'FAILED: tight stop accepted'; exception when others then if sqlerrm like 'FAILED%' then raise; end if; end $$;

-- 3. FAST share <= 50% of equity in margin (fresh book)
delete from bot_trades; update bot_state set balance=5000, bot_params='{}';
select fast_commit_cycle(t_lease(),'[]',(select jsonb_agg(t_fast('S'||i,'LONG',100,2500,10,99,102)) from generate_series(1,8) i),'{}',0.9,'{}',null);
select t_check((select sum(entry_price*size/lev) from bot_trades where strategy='FAST') <= 5000*0.5+1, 'FAST share capped at 50% even when 0.9 is passed');

-- 4. EVT: lev 10 max, margin <= 8%, <= 3 open, stop <= 4.5%
delete from bot_trades; update bot_state set balance=5000, bot_params='{}';
select blade_commit_cycle(t_lease(),'EVT','[]','[]','[]',jsonb_build_array(t_blade('EV1','LONG',100,1000000,25,96)),'{}','{}','EVT',3,false);
select t_check((select lev from bot_trades where sym='EV1')=10, 'EVT lev clamped to 10');
select t_check((select entry_price*size/lev from bot_trades where sym='EV1') <= 5000*0.0801+0.01, 'EVT margin <= 8% of equity');
select blade_commit_cycle(t_lease(),'EVT','[]','[]','[]',(select jsonb_agg(t_blade('EV'||i,'SHORT',100,4000,10,104)) from generate_series(2,6) i),'{}','{}','EVT',3,false);
select t_check((select count(*) from bot_trades where status='OPEN' and strategy='EVT')=3, 'EVT <= 3 open');
do $$ begin delete from bot_trades where sym like 'EV%' and sym<>'EV1'; update bot_state set bot_params='{}';
  perform blade_commit_cycle(t_lease(),'EVT','[]','[]','[]',jsonb_build_array(t_blade('WIDE','LONG',100,1000,10,95)),'{}','{}','EVT',3,false);
  raise exception 'FAILED: 5%% EVT stop accepted'; exception when others then if sqlerrm like 'FAILED%' then raise; end if; end $$;
-- isolated: a stop beyond the margin returns 0, never negative cash beyond that position
select blade_commit_cycle(t_lease(),'EVT',jsonb_build_array(jsonb_build_object('id',(select id from bot_trades where sym='EV1'),'price',80,'reason','LIQUIDATION','quote_ts',t_ms())),'[]','[]','[]','{}','{}','EVT',3,false);
select t_check((select pnl from bot_trades where sym='EV1') >= -(select entry_price*size/lev + fee from bot_trades where sym='EV1')-0.01, 'EVT loss bounded by its own margin + fee');

-- 5. DONCH4H: always 1x; pyramid unit stacks only with the pyramid flag, same side, per-coin 20%
delete from bot_trades; update bot_state set balance=5000, bot_params='{}';
select blade_commit_cycle(t_lease(),'DONCH4H','[]','[]','[]',jsonb_build_array(t_blade('DC','LONG',100,500,10,97)),'{}','{}','DONCH',30,false);
select t_check((select lev from bot_trades where sym='DC')=1, 'DONCH4H lev forced to 1');
select blade_commit_cycle(t_lease(),'DONCH4H','[]','[]','[]',jsonb_build_array(t_blade('DC','LONG',101,300,1,98)),'{}','{}','DONCH',30,false);
select t_check((select count(*) from bot_trades where sym='DC' and status='OPEN')=1, 'no second unit without the pyramid flag');
select blade_commit_cycle(t_lease(),'DONCH4H','[]','[]','[]',jsonb_build_array(t_blade('DC','LONG',101,800,1,98,'{"pyramid":{"unit":2}}')),'{}','{}','DONCH',30,false);
select t_check((select count(*) from bot_trades where sym='DC' and status='OPEN')=2, 'pyramid unit 2 stacks');
select t_check((select sum(entry_price*size) from bot_trades where sym='DC' and status='OPEN') <= 5000*0.2001+1, 'per-coin 20% includes pyramid units');
select blade_commit_cycle(t_lease(),'DONCH4H','[]','[]','[]',jsonb_build_array(t_blade('DC','SHORT',101,300,1,104,'{"pyramid":{"unit":3}}')),'{}','{}','DONCH',30,false);
select t_check((select count(*) from bot_trades where sym='DC' and status='OPEN' and side='SHORT')=0, 'no opposite-side pyramid');

-- 6. the account halt: -12% from the UTC day start -> no new entries in any sleeve; exits still run
delete from bot_trades; update bot_state set balance=5000, bot_params=jsonb_build_object('agg_day',jsonb_build_object('day',to_char((now() at time zone 'UTC')::date,'YYYY-MM-DD'),'start',6000,'halted',false));
insert into bot_trades(sym,side,entry_price,size,fee,trail_sl,status,paper_mode,strategy,lev,scalp_meta) values ('OPENF','LONG',100,10,0.5,99,'OPEN',true,'FAST',10,'{"fast":{"stop":99,"target":102}}');
select fast_commit_cycle(t_lease(),jsonb_build_array(jsonb_build_object('id',(select id from bot_trades where sym='OPENF'),'price',101,'reason','TARGET','quote_ts',t_ms())),
  jsonb_build_array(t_fast('H1','LONG',100,1000,10,99,102)),'{}',0.5,'{}',null);
select t_check((select status from bot_trades where sym='OPENF')<>'OPEN', 'exit still runs under the halt');
select t_check(not exists(select 1 from bot_trades where sym='H1'), 'FAST entry blocked by the halt');
select t_check((select bot_params->'agg_day'->>'halted' from bot_state)::boolean, 'halt flag recorded');
select blade_commit_cycle(t_lease(),'EVT','[]','[]','[]',jsonb_build_array(t_blade('H2','LONG',100,1000,10,96)),'{}','{}','EVT',3,false);
select blade_commit_cycle(t_lease(),'DONCH4H','[]','[]','[]',jsonb_build_array(t_blade('H3','LONG',100,500,1,97)),'{}','{}','DONCH',30,false);
select t_check(not exists(select 1 from bot_trades where sym in ('H2','H3')), 'EVT and DONCH entries blocked by the halt');
-- sticky for the day even if equity recovers
update bot_state set bot_params=jsonb_set(bot_params,'{agg_day,start}','5000');
select fast_commit_cycle(t_lease(),'[]',jsonb_build_array(t_fast('H4','LONG',100,1000,10,99,102)),'{}',0.5,'{}',null);
select t_check(not exists(select 1 from bot_trades where sym='H4'), 'halt is sticky for the UTC day');
-- next UTC day: the start resets and entries resume automatically
update bot_state set bot_params=jsonb_set(bot_params,'{agg_day,day}','"2000-01-01"');
select fast_commit_cycle(t_lease(),'[]',jsonb_build_array(t_fast('H5','LONG',100,1000,10,99,102)),'{}',0.5,'{}',null);
select t_check(exists(select 1 from bot_trades where sym='H5'), 'entries resume the next UTC day');
select t_check(not (select bot_params->'agg_day'->>'halted' from bot_state)::boolean, 'halt cleared on the new day');
-- -11.9% does not halt, -12% does
delete from bot_trades; update bot_state set balance=4405, bot_params=jsonb_build_object('agg_day',jsonb_build_object('day',to_char((now() at time zone 'UTC')::date,'YYYY-MM-DD'),'start',5000,'halted',false));
select fast_commit_cycle(t_lease(),'[]',jsonb_build_array(t_fast('E1','LONG',100,1000,10,99,102)),'{}',0.5,'{}',null);
select t_check(exists(select 1 from bot_trades where sym='E1'), '-11.9% still trades');
delete from bot_trades; update bot_state set balance=4400, bot_params=jsonb_build_object('agg_day',jsonb_build_object('day',to_char((now() at time zone 'UTC')::date,'YYYY-MM-DD'),'start',5000,'halted',false));
select fast_commit_cycle(t_lease(),'[]',jsonb_build_array(t_fast('E2','LONG',100,1000,10,99,102)),'{}',0.5,'{}',null);
select t_check(not exists(select 1 from bot_trades where sym='E2'), '-12.0% halts');

-- 7. paper lock and foreign rows
delete from bot_trades; update bot_state set balance=5000, bot_params='{}', paper_mode=false;
do $$ begin perform fast_commit_cycle(t_lease(),'[]','[]','{}',0.5,'{}',null); raise exception 'FAILED: fast ran on a non-paper account';
  exception when others then if sqlerrm like 'FAILED%' then raise; end if; end $$;
do $$ begin perform blade_commit_cycle(t_lease(),'EVT','[]','[]','[]','[]','{}','{}','EVT',3,false); raise exception 'FAILED: evt ran on a non-paper account';
  exception when others then if sqlerrm like 'FAILED%' then raise; end if; end $$;
update bot_state set paper_mode=true;
insert into bot_trades(sym,side,entry_price,size,status,paper_mode,strategy,lev) values ('PROX','LONG',1,1,'OPEN',true,'PRO',10);
do $$ begin perform blade_commit_cycle(t_lease(),'DONCH4H','[]','[]','[]','[]','{}','{}','DONCH',30,false); raise exception 'FAILED: foreign PRO row accepted';
  exception when others then if sqlerrm like 'FAILED%' then raise; end if; end $$;
delete from bot_trades; insert into bot_trades(sym,side,entry_price,size,status,paper_mode,strategy,lev) values ('DLEV','LONG',1,1,'OPEN',true,'DONCH4H',10);
do $$ begin perform blade_commit_cycle(t_lease(),'EVT','[]','[]','[]','[]','{}','{}','EVT',3,false); raise exception 'FAILED: leveraged DONCH4H row accepted';
  exception when others then if sqlerrm like 'FAILED%' then raise; end if; end $$;
select 'agg2 sql: all checks passed';

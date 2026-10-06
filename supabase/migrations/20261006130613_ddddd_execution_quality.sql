-- P-DDDDD-EXECUTION-V2: transactional telemetry, isolated observation, no reset.
create table if not exists public.d5_confirmation_shadow (
 trade_id bigint primary key, sym text not null, pair jsonb not null,
 baseline_opened_at timestamptz not null, signal_bar bigint not null,
 status text not null default 'pending' check(status in ('pending','open','closed','expired')),
 next_check timestamptz not null, reason text, confirmed_bar bigint, entry_at timestamptz,
 payload jsonb, assumptions jsonb, net_bps double precision, closed_at timestamptz, exit jsonb
);
create index if not exists d5_confirmation_due on public.d5_confirmation_shadow(next_check) where status in ('pending','open');
alter table public.d5_confirmation_shadow enable row level security;
revoke all on public.d5_confirmation_shadow from public,anon,authenticated;
grant select,insert,update on public.d5_confirmation_shadow to service_role;

create or replace function public.q15_commit_cycle(p_lease timestamp with time zone, p_closes jsonb, p_entries jsonb, p_marks jsonb, p_note jsonb, p_share numeric default 0.90, p_bar bigint default null, p_updates jsonb default '[]'::jsonb)
returns jsonb language plpgsql set search_path to 'public','pg_temp' as $function$
declare
 s public.bot_state%rowtype; t public.bot_trades%rowtype; x jsonb; cfg jsonb; m jsonb; a jsonb;
 new_id bigint; d5 boolean; cash numeric; eq numeric; mg numeric; ret numeric; lv integer; px numeric; n numeric; gross numeric; exitfee numeric; funding numeric; v_pnl numeric; expo numeric; book numeric;
 basis jsonb; day_marks jsonb; start_eq numeric; utc_day text:=to_char((now() at time zone 'UTC')::date,'YYYY-MM-DD');
 opens integer:=0; closes integer:=0; cnt integer; dayn integer; accepted jsonb:='[]'::jsonb; share numeric:=least(0.90,greatest(0.05,coalesce(p_share,0.90)));
begin
 select * into strict s from bot_state where id=1 for update;
 if p_lease is null or s.lock_until is distinct from p_lease or clock_timestamp()>p_lease then raise exception 'stale q15 lease'; end if;
 if not s.active or not s.paper_mode then raise exception 'q15 requires active paper account'; end if;
 if exists(select 1 from bot_trades where status='OPEN' and (paper_mode is not true or strategy not in ('Q15','EVT','DONCH4H') or lev<1 or lev>case when strategy='DONCH4H' then 1 else 35 end)) then raise exception 'q15 book holds an incompatible or non-paper row'; end if;
 d5:=coalesce(s.bot_params->>'paper_strategy','')='DDDDD';
 cash:=s.balance; cfg:=coalesce(s.bot_params,'{}')||jsonb_build_object('q15_marks_blocked',not coalesce((p_note->>'marks_fresh')::boolean,false));
 if p_note->>'execution_version'='2' then cfg:=cfg||jsonb_build_object('d5_execution_version',2); end if;
 if not d5 and (cfg->'agg_day'->>'day' is distinct from utc_day or coalesce((cfg->>'q15_day_pending')::boolean,false)) then
  basis:=cfg->'q15_day_basis';
  if basis->>'day' is distinct from utc_day then
   select jsonb_build_object('day',utc_day,'cash',cash,'rows',coalesce(jsonb_agg(jsonb_build_object('sym',sym,'side',side,'entry_price',entry_price,'size',size,'lev',lev)),'[]'))
    into basis from bot_trades where status='OPEN';
  end if;
  day_marks:=coalesce(p_note->'day_start_marks','{}');
  if exists(select 1 from jsonb_array_elements(basis->'rows') r where coalesce((day_marks->>(r->>'sym'))::numeric,0)<=0) then
   cfg:=cfg||jsonb_build_object('q15_day_basis',basis,'q15_day_pending',true,'q15_marks_blocked',true,
    'agg_day',jsonb_build_object('day',utc_day,'start',null,'halted',true,'baseline_pending',true));
  else
   select (basis->>'cash')::numeric+coalesce(sum(greatest(0,(r->>'entry_price')::numeric*(r->>'size')::numeric/greatest((r->>'lev')::numeric,1)+
    (case when r->>'side'='LONG' then 1 else -1 end)*((day_marks->>(r->>'sym'))::numeric-(r->>'entry_price')::numeric)*(r->>'size')::numeric)),0)
    into start_eq from jsonb_array_elements(basis->'rows') r;
   cfg:=cfg||jsonb_build_object('q15_day_basis',basis,'q15_day_pending',false,
    'agg_day',jsonb_build_object('day',utc_day,'start',start_eq,'halted',false,'baseline_source','UTC_midnight_1m_close'));
  end if;
 end if;
 for x in select value from jsonb_array_elements(coalesce(p_closes,'[]')) loop
  select * into t from bot_trades where id=(x->>'id')::bigint and status='OPEN' and strategy='Q15' for update;
  if not found then continue; end if;
  if t.paper_mode is not true then raise exception 'non-paper position'; end if;
  px:=(x->>'price')::numeric;
  if (x->>'quote_ts') is null or px is null or px<=0 or px='NaN'::numeric or abs(extract(epoch from clock_timestamp())*1000-(x->>'quote_ts')::numeric)>20000 then raise exception 'invalid close quote'; end if;
  gross:=(px-t.entry_price)*t.size*(case when t.side='LONG' then 1 else -1 end); exitfee:=px*t.size*0.0005;
  if x->>'funding_complete' is distinct from 'true' then raise exception 'Q15 requires settled funding'; end if;
  funding:=(x->>'funding')::numeric;
  if funding is null or funding='NaN'::numeric then raise exception 'invalid funding'; end if;
  mg:=t.entry_price*t.size/greatest(t.lev,1);
  ret:=greatest(0,mg+gross-exitfee-funding);
  v_pnl:=ret-mg-coalesce(t.fee,0);
  cash:=cash+ret;
  update bot_trades set status=case when v_pnl>=0 then 'TP' else 'SL' end,exit_price=px,pnl=v_pnl,pnl_pct=v_pnl/mg,closed_at=now(),
   scalp_meta=coalesce(scalp_meta,'{}')||jsonb_build_object('exit_reason',x->>'reason','fill',coalesce(x->'fill','null'::jsonb),'exit_fee',exitfee,'funding_paid',funding,'funding_model',funding,'funding_inferred',false,'margin',mg,'lev',t.lev) where id=t.id;
  closes:=closes+1;
 end loop;
 select cash+coalesce(sum(entry_price*size/greatest(lev,1)+((case when side='LONG' then 1 else -1 end)*(coalesce((p_marks->>sym)::numeric,entry_price)-entry_price)*size)),0) into eq from bot_trades where status='OPEN';
 for x in select value from jsonb_array_elements(coalesce(p_updates,'[]')) loop
  update bot_trades set scalp_meta=
   case when x ? 'be_active'
    then jsonb_set(jsonb_set(scalp_meta,'{q15,chk}',x->'chk'),'{q15,be_active}',to_jsonb((x->>'be_active')::boolean),true)
    else jsonb_set(scalp_meta,'{q15,chk}',x->'chk') end
   where id=(x->>'id')::bigint and status='OPEN' and strategy='Q15'
   and (x->>'chk')::numeric>=coalesce((scalp_meta->'q15'->>'chk')::numeric,0);
 end loop;
 a:=public.agg2_day(cfg,cash,p_marks);
 eq:=(a->>'eq')::numeric;
 cfg:=cfg||jsonb_build_object('agg_day',a-'marks','agg_marks',a->'marks');
 for x in select value from jsonb_array_elements(coalesce(p_entries,'[]')) loop
  if s.hard_halt_at is not null or (a->>'halted')::boolean or coalesce((p_note->>'marks_fresh')::boolean,false)=false then exit; end if;
  if p_bar is null or (not d5 and p_bar<=coalesce((cfg->>'q15_bar')::bigint,0)) or p_bar%(case when d5 then 300000 else 60000 end)<>0
     or extract(epoch from clock_timestamp())*1000-p_bar not between 0 and (case when d5 then 300000 else 60000 end) then continue; end if;
  if x->>'profit_gate' is distinct from 'passed' or coalesce((x->>'net_bps')::numeric,-1)<-999 or (x->>'net_bps')::numeric='NaN'::numeric then raise exception 'Q15 entry without profit gate'; end if;
  if exists(select 1 from bot_trades where status='OPEN' and sym=x->>'sym') then continue; end if;
  select count(*),coalesce(sum(entry_price*size/greatest(lev,1)),0) into cnt,expo from bot_trades where status='OPEN' and strategy='Q15';
  select count(*) into dayn from bot_trades where strategy='Q15' and opened_at>=((now() at time zone 'UTC')::date)::timestamp at time zone 'UTC';
  if cnt>=(case when d5 then 8 else 20 end) or dayn>=200 then exit; end if;
  if x->>'sym' !~ '^[A-Z0-9]{2,30}$' or (not d5 and x->>'sym' = any(array['USDC','FDUSD','TUSD','BUSD','DAI','USDP','USDE','USD1','PYUSD','XAU','XAG','PAXG','XAUT','BTCDOM','DEFI','TSLA','AAPL','NVDA','MSTR','AMZN','GOOGL','META','MSFT','SPY','QQQ'])) or x->>'side' not in ('LONG','SHORT') then raise exception 'invalid q15 instrument'; end if;
  m:=x->'q15';
  if not d5 and coalesce((m->>'hold_ms')::bigint,0) not in (3600000,7200000) then raise exception 'invalid Q15 timeout'; end if;
  if m is null or coalesce((m->>'stop')::numeric,0)<=0 or coalesce((m->>'target')::numeric,0)<=0 or (m->>'stop')::numeric='NaN'::numeric or (m->>'target')::numeric='NaN'::numeric then raise exception 'q15 entry without levels'; end if;
  px:=(x->>'price')::numeric;
  if (x->>'quote_ts') is null or px is null or px<=0 or px='NaN'::numeric or abs(extract(epoch from clock_timestamp())*1000-(x->>'quote_ts')::numeric)>8000 then raise exception 'invalid entry quote'; end if;
  if (x->>'side'='LONG' and not ((m->>'stop')::numeric<px and (m->>'target')::numeric>px)) or (x->>'side'='SHORT' and not ((m->>'stop')::numeric>px and (m->>'target')::numeric<px)) then raise exception 'q15 levels on the wrong side'; end if;
  if abs(px-(m->>'stop')::numeric)/px<0.003999999999 then raise exception 'q15 stop tighter than 0.4%%'; end if;
  if not d5 and abs(abs((m->>'target')::numeric-px)-2*abs(px-(m->>'stop')::numeric))>px*0.000001 then raise exception 'invalid Q15 2R target'; end if;
  if d5 then
   if m->>'pattern'='DDDDD' then
    if cfg->>'d5_execution_version'='2' or m ? 'execution_version' then
     if coalesce((m->>'execution_version')::int,0)<>2
        or coalesce((m->'gate'->>'costBps')::numeric,-1) not between 0 and 50
        or coalesce((m->'protection'->>'version')::int,0)<>2
        or coalesce((m->'protection'->>'stop')::numeric,0)<=px
        or (m->'protection'->>'stop')::numeric='NaN'::numeric
        or coalesce((m->'protection'->>'trigger')::numeric,0)<=(m->'protection'->>'stop')::numeric
        or (m->'protection'->>'trigger')::numeric='NaN'::numeric
        or ((m->'protection'->>'enabled')::boolean and (m->'protection'->>'trigger')::numeric>=(m->>'target')::numeric)
        or coalesce((x->>'lev')::int,0) not between 1 and 25
     then raise exception 'invalid DDDDD v2 cost/protection'; end if;
    end if;
    if x->>'side' is distinct from 'LONG' or coalesce((m->>'hold_ms')::bigint,-1)<>0
       or abs((m->>'stop')::numeric-px*0.99)>px*0.00000001 or abs((m->>'target')::numeric-px*1.01)>px*0.00000001
       or (m->>'bar')::bigint is distinct from p_bar then raise exception 'invalid DDDDD entry'; end if;
   elsif m->>'pattern'='FALL7_15M' then
    if x->>'side' is distinct from 'LONG'
       or coalesce((x->>'lev')::int,0)<>30
       or coalesce((m->>'execution_version')::int,0)<>2
       or coalesce((m->'gate'->>'costBps')::numeric,-1) not between 0 and 50
       or coalesce((m->>'hold_ms')::bigint,-1)<>0
       or p_bar%900000<>0
       or (m->>'bar')::bigint is distinct from p_bar
       or x->>'sym'<>all(array['ANKR','1000000MOG','SUSHI','HYPER','LUMIA'])
       or abs((m->>'stop')::numeric-px*0.99)>px*0.00000001
       or abs((m->>'target')::numeric-px*1.01)>px*0.00000001
       then raise exception 'invalid FALL7_15M entry'; end if;
   elsif m->>'pattern'='R7_3M' then
    if x->>'side' is distinct from 'LONG'
       or coalesce((x->>'lev')::int,0)<>28
       or coalesce((m->>'execution_version')::int,0)<>2
       or coalesce((m->'gate'->>'costBps')::numeric,-1) not between 0 and 50
       or coalesce((m->>'hold_ms')::bigint,-1)<>0
       or (m->>'bar')::bigint%180000<>0
       or extract(epoch from clock_timestamp())*1000-(m->>'bar')::bigint not between 0 and 180000
       or x->>'sym'<>all(array['KAVA','LQTY','LUMIA'])
       or abs((m->>'stop')::numeric-px*0.99)>px*0.00000001
       or abs((m->>'target')::numeric-px*1.01)>px*0.00000001
       then raise exception 'invalid R7_3M entry'; end if;
   elsif m->>'pattern'='R6_3M' then
    if x->>'side' is distinct from 'LONG'
       or coalesce((x->>'lev')::int,0)<>28
       or coalesce((m->>'execution_version')::int,0)<>2
       or coalesce((m->'gate'->>'costBps')::numeric,-1) not between 0 and 50
       or coalesce((m->>'hold_ms')::bigint,-1)<>0
       or (m->>'bar')::bigint%180000<>0
       or extract(epoch from clock_timestamp())*1000-(m->>'bar')::bigint not between 0 and 180000
       or x->>'sym'<>all(array['KAVA','1000000MOG'])
       or abs((m->>'stop')::numeric-px*0.99)>px*0.00000001
       or abs((m->>'target')::numeric-px*1.01)>px*0.00000001
       then raise exception 'invalid R6_3M entry'; end if;
   elsif m->>'pattern'='FALL5_10M' then
    if x->>'side' is distinct from 'LONG'
       or coalesce((x->>'lev')::int,0)<>29
       or coalesce((m->>'execution_version')::int,0)<>2
       or coalesce((m->'gate'->>'costBps')::numeric,-1) not between 0 and 50
       or coalesce((m->>'hold_ms')::bigint,-1)<>0
       or (m->>'bar')::bigint%600000<>0
       or extract(epoch from clock_timestamp())*1000-(m->>'bar')::bigint not between 0 and 600000
       or x->>'sym'<>'KAVA'
       or abs((m->>'stop')::numeric-px*0.99)>px*0.00000001
       or abs((m->>'target')::numeric-px*1.01)>px*0.00000001
       then raise exception 'invalid FALL5_10M entry'; end if;
   elsif m->>'pattern'='R6_10M' then
    if x->>'side' is distinct from 'LONG'
       or coalesce((x->>'lev')::int,0)<>29
       or coalesce((m->>'execution_version')::int,0)<>2
       or coalesce((m->'gate'->>'costBps')::numeric,-1) not between 0 and 50
       or coalesce((m->>'hold_ms')::bigint,-1)<>0
       or (m->>'bar')::bigint%600000<>0
       or extract(epoch from clock_timestamp())*1000-(m->>'bar')::bigint not between 0 and 600000
       or x->>'sym'<>all(array['KAVA','SUSHI'])
       or abs((m->>'stop')::numeric-px*0.99)>px*0.00000001
       or abs((m->>'target')::numeric-px*1.01)>px*0.00000001
       then raise exception 'invalid R6_10M entry'; end if;
   elsif m->>'pattern'='FALL5_30M' then
    if x->>'side' is distinct from 'LONG'
       or coalesce((x->>'lev')::int,0)<>35
       or coalesce((m->>'execution_version')::int,0)<>2
       or coalesce((m->'gate'->>'costBps')::numeric,-1) not between 0 and 50
       or coalesce((m->>'hold_ms')::bigint,-1)<>0
       or (m->>'bar')::bigint%1800000<>0
       or extract(epoch from clock_timestamp())*1000-(m->>'bar')::bigint not between 0 and 1800000
       or x->>'sym'<>'KAVA'
       or abs((m->>'stop')::numeric-px*0.99)>px*0.00000001
       or abs((m->>'target')::numeric-px*1.01)>px*0.00000001
       then raise exception 'invalid FALL5_30M entry'; end if;
   elsif m->>'pattern'='FALL4_30M' then
    if x->>'side' is distinct from 'LONG'
       or coalesce((x->>'lev')::int,0)<>35
       or coalesce((m->>'execution_version')::int,0)<>2
       or coalesce((m->'gate'->>'costBps')::numeric,-1) not between 0 and 50
       or coalesce((m->>'hold_ms')::bigint,-1)<>0
       or (m->>'bar')::bigint%1800000<>0
       or extract(epoch from clock_timestamp())*1000-(m->>'bar')::bigint not between 0 and 1800000
       or x->>'sym'<>'ANKR'
       or abs((m->>'stop')::numeric-px*0.99)>px*0.00000001
       or abs((m->>'target')::numeric-px*1.01)>px*0.00000001
       then raise exception 'invalid FALL4_30M entry'; end if;
   elsif m->>'pattern'='AGT_GRR_1M' then
    if x->>'side' is distinct from 'LONG'
       or coalesce((x->>'lev')::int,0)<>12
       or coalesce((m->>'execution_version')::int,0)<>2
       or coalesce((m->'gate'->>'costBps')::numeric,-1) not between 0 and 50
       or coalesce((m->>'hold_ms')::bigint,-1)<>7200000
       or (m->>'bar')::bigint%60000<>0
       or extract(epoch from clock_timestamp())*1000-(m->>'bar')::bigint not between 0 and 60000
       or x->>'sym'<>'AGT'
       or abs((m->>'stop')::numeric-px*0.98)>px*0.00000001
       or abs((m->>'target')::numeric-px*1.005)>px*0.00000001
       then raise exception 'invalid AGT_GRR_1M entry'; end if;
   elsif m->>'pattern'='LQTY_RRR_1M' then
    if x->>'side' is distinct from 'LONG'
       or coalesce((x->>'lev')::int,0)<>12
       or coalesce((m->>'execution_version')::int,0)<>2
       or coalesce((m->'gate'->>'costBps')::numeric,-1) not between 0 and 50
       or coalesce((m->>'hold_ms')::bigint,-1)<>3600000
       or (m->>'bar')::bigint%60000<>0
       or extract(epoch from clock_timestamp())*1000-(m->>'bar')::bigint not between 0 and 60000
       or x->>'sym'<>'LQTY'
       or abs((m->>'stop')::numeric-px*0.98)>px*0.00000001
       or abs((m->>'target')::numeric-px*1.005)>px*0.00000001
       then raise exception 'invalid LQTY_RRR_1M entry'; end if;
   elsif m->>'pattern'='VWAP_REV_1M' then
    if coalesce((m->>'hold_ms')::bigint,-1)<>3600000
       or (x->>'side'='LONG' and (abs((m->>'stop')::numeric-px*0.99)>px*0.00000001 or abs((m->>'target')::numeric-px*1.005)>px*0.00000001))
       or (x->>'side'='SHORT' and (abs((m->>'stop')::numeric-px*1.01)>px*0.00000001 or abs((m->>'target')::numeric-px*0.995)>px*0.00000001))
       then raise exception 'invalid VWAP_REV_1M entry'; end if;
   else raise exception 'unknown combined strategy pattern'; end if;
   if exists(select 1 from bot_trades where sym=x->>'sym' and scalp_meta->'q15'->>'pattern'=m->>'pattern' and (scalp_meta->'q15'->>'bar')::bigint=(m->>'bar')::bigint) then continue; end if;
  end if;
  lv:=least(35,greatest(1,coalesce((x->>'lev')::int,1)));
  mg:=least((x->>'notional')::numeric/lv,eq*0.15,greatest(0,eq*share-expo),greatest(0,cash/(1+lv*0.0005)));
  if mg<5 or mg is null or mg='NaN'::numeric then continue; end if;
  n:=mg*lv;
  insert into bot_trades(sym,side,entry_price,size,fee,trail_sl,hi,lo,status,paper_mode,strategy,lev,risk_usd,partial_done,scalp_meta)
  values(x->>'sym',x->>'side',px,n/px,n*0.0005,(m->>'stop')::numeric,px,px,'OPEN',true,'Q15',lv,n*abs(px-(m->>'stop')::numeric)/px,true,
   jsonb_build_object('q15',m,'source',x->>'source','entry_fee',n*0.0005,'margin',mg,'notional0',n,'experimental',true)) returning id into new_id;
  if m->>'pattern'='DDDDD' and m->>'execution_version'='2' then
   insert into public.d5_confirmation_shadow(trade_id,sym,pair,baseline_opened_at,signal_bar,next_check)
   values(new_id,x->>'sym',m->'pair',now(),(m->>'bar')::bigint,to_timestamp((floor(extract(epoch from now())/300)+1)*300))
   on conflict(trade_id) do nothing;
  end if;
  cash:=cash-mg-n*0.0005; eq:=eq-n*0.0005; opens:=opens+1; accepted:=accepted||jsonb_build_array(x->>'sym');
  a:=public.agg2_day(cfg,cash,p_marks);
  cfg:=cfg||jsonb_build_object('agg_day',a-'marks','agg_marks',a->'marks');
 end loop;
 cfg:=cfg||jsonb_build_object('q15_cycle',coalesce(cfg->'q15_cycle','{}')||coalesce(p_note,'{}')||jsonb_build_object('ts',now(),'opened',opens,'fills',case when p_bar is null then coalesce((cfg->'q15_cycle'->>'fills')::int,0) else opens end,'accepted',accepted,'closed',closes,'halted',(a->>'halted')::boolean));
 if d5 and p_note ? 'd5_scan' then cfg:=cfg||jsonb_build_object('d5_scan',p_note->'d5_scan'); end if;
 if d5 and p_note ? 'r3_scan_bar' then cfg:=cfg||jsonb_build_object('r3_scan_bar',p_note->'r3_scan_bar'); end if;
 if d5 and p_note ? 'l10_scan_bar' then cfg:=cfg||jsonb_build_object('l10_scan_bar',p_note->'l10_scan_bar'); end if;
 if d5 and p_note ? 'l30_scan_bar' then cfg:=cfg||jsonb_build_object('l30_scan_bar',p_note->'l30_scan_bar'); end if;
 if d5 and p_note ? 'm1_scan_bar' then cfg:=cfg||jsonb_build_object('m1_scan_bar',p_note->'m1_scan_bar'); end if;
 if p_note ? 'q15_autonomy' then cfg:=cfg||jsonb_build_object('q15_autonomy',p_note->'q15_autonomy'); end if;
 if p_bar is not null then cfg:=cfg||jsonb_build_object('q15_bar',p_bar); end if;
 -- Final marked equity and observations commit under the same account lock.
 a:=public.agg2_day(cfg,cash,p_marks); eq:=(a->>'eq')::numeric;
 cfg:=cfg||jsonb_build_object('agg_day',a-'marks','agg_marks',a->'marks');
 if coalesce((p_note->>'marks_fresh')::boolean,false)
    and not exists(select 1 from bot_trades where status='OPEN' and
      (coalesce((p_marks->>sym)::numeric,0)<=0 or (p_marks->>sym)::numeric in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)))
    and (cfg->>'q15_equity_sample_at' is null or now()>=(cfg->>'q15_equity_sample_at')::timestamptz+interval '1 minute') then
  select coalesce(sum(entry_price*size),0) into expo from bot_trades where status='OPEN';
  insert into bot_equity(ts,equity,balance,exposure) values(now(),eq,cash,expo);
  cfg:=cfg||jsonb_build_object('q15_equity_sample_at',now());
 end if;
 update bot_state set balance=cash,paper_mode=true,updated_at=now(),bot_params=cfg where id=1;
 return jsonb_build_object('opened',opens,'accepted',accepted,'closed',closes,'balance',cash,'equity',eq,'halted',(a->>'halted')::boolean,'day_start',(a->>'start')::numeric);
end $function$;
revoke all on function public.q15_commit_cycle(timestamptz,jsonb,jsonb,jsonb,jsonb,numeric,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.q15_commit_cycle(timestamptz,jsonb,jsonb,jsonb,jsonb,numeric,bigint,jsonb) to service_role;


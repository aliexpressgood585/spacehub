-- MAX LOTTERY paper unlock (surgical patch of q15_commit_cycle)
-- Owner 2026-10-05. Paper only.

create or replace function public.q15_commit_cycle(p_lease timestamp with time zone, p_closes jsonb, p_entries jsonb, p_marks jsonb, p_note jsonb, p_share numeric default 0.5, p_bar bigint default null, p_updates jsonb default '[]'::jsonb)
returns jsonb language plpgsql set search_path to 'public','pg_temp' as $function$
declare
 s public.bot_state%rowtype; t public.bot_trades%rowtype; x jsonb; cfg jsonb; m jsonb; a jsonb;
 cash numeric; eq numeric; mg numeric; ret numeric; lv integer; px numeric; n numeric; gross numeric; exitfee numeric; funding numeric; v_pnl numeric;
 basis jsonb; day_marks jsonb; start_eq numeric; utc_day text:=to_char((now() at time zone 'UTC')::date,'YYYY-MM-DD');
 opens integer:=0; closes integer:=0; cnt integer; dayn integer; accepted jsonb:='[]'::jsonb; share numeric:=least(0.90,greatest(0.05,coalesce(p_share,0.90)));
begin
 select * into strict s from bot_state where id=1 for update;
 if p_lease is null or s.lock_until is distinct from p_lease or clock_timestamp()>p_lease then raise exception 'stale q15 lease'; end if;
 if not s.active or not s.paper_mode then raise exception 'q15 requires active paper account'; end if;
 if exists(select 1 from bot_trades where status='OPEN' and (paper_mode is not true or strategy not in ('Q15','EVT','DONCH4H') or lev<1 or lev>case when strategy='DONCH4H' then 1 else 25 end)) then raise exception 'q15 book holds an incompatible or non-paper row'; end if;
 cash:=s.balance; cfg:=coalesce(s.bot_params,'{}')||jsonb_build_object('q15_marks_blocked',not coalesce((p_note->>'marks_fresh')::boolean,false));
 if cfg->'agg_day'->>'day' is distinct from utc_day or coalesce((cfg->>'q15_day_pending')::boolean,false) then
  basis:=cfg->'q15_day_basis';
  if basis->>'day' is distinct from utc_day then
   select jsonb_build_object('day',utc_day,'cash',cash,'rows',coalesce(jsonb_agg(jsonb_build_object('sym',sym,'side',side,'entry_price',entry_price,'size',size,'lev',lev)),'[]'))
    into basis from bot_trades where status='OPEN';
  end if;
  day_marks:=coalesce(p_note->'day_start_marks','{}');
  if exists(select 1 from jsonb_array_elements(coalesce(basis->'rows','[]')) r where coalesce((day_marks->>(r->>'sym'))::numeric,0)<=0) then
   cfg:=cfg||jsonb_build_object('q15_day_basis',basis,'q15_day_pending',true,'q15_marks_blocked',true,
    'agg_day',jsonb_build_object('day',utc_day,'start',null,'halted',true,'baseline_pending',true));
  else
   start_eq:=coalesce((basis->>'cash')::numeric,cash);
   cfg:=cfg||jsonb_build_object('q15_day_basis',null,'q15_day_pending',false,
    'agg_day',jsonb_build_object('day',utc_day,'start',start_eq,'eq',start_eq,'halted',false,'dd',0));
  end if;
 end if;
 for x in select value from jsonb_array_elements(coalesce(p_closes,'[]')) loop
  select * into t from bot_trades where id=(x->>'id')::bigint for update;
  if not found or t.status is distinct from 'OPEN' or t.strategy is distinct from 'Q15' or t.paper_mode is not true then continue; end if;
  px:=(x->>'price')::numeric;
  if (x->>'quote_ts') is null or px is null or px<=0 or px='NaN'::numeric or abs(extract(epoch from clock_timestamp())*1000-(x->>'quote_ts')::numeric)>20000 then raise exception 'invalid close quote'; end if;
  gross:=(px-t.entry_price)*t.size*(case when t.side='LONG' then 1 else -1 end);
  exitfee:=px*t.size*0.0005;
  funding:=coalesce((x->>'funding')::numeric,0);
  v_pnl:=gross-exitfee+funding-coalesce(t.fee,0);
  mg:=t.entry_price*t.size/greatest(t.lev,1);
  cash:=cash+mg+v_pnl;
  update bot_trades set status=coalesce(nullif(x->>'reason',''),'CLOSE'),exit_price=px,pnl=v_pnl,closed_at=now(),
   scalp_meta=coalesce(scalp_meta,'{}')||jsonb_build_object('exit',x,'funding_inferred',false,'margin',mg,'lev',t.lev) where id=t.id;
  closes:=closes+1;
 end loop;
 for x in select value from jsonb_array_elements(coalesce(p_updates,'[]')) loop
  update bot_trades set scalp_meta=jsonb_set(coalesce(scalp_meta,'{}'),'{q15,chk}',to_jsonb((x->>'chk')::numeric),true)
   where id=(x->>'id')::bigint and status='OPEN' and strategy='Q15'
   and (x->>'chk')::numeric>=coalesce((scalp_meta->'q15'->>'chk')::numeric,0);
 end loop;
 a:=public.agg2_day(cfg,cash,p_marks);
 eq:=(a->>'eq')::numeric;
 cfg:=cfg||jsonb_build_object('agg_day',a-'marks','agg_marks',a->'marks');
 for x in select value from jsonb_array_elements(coalesce(p_entries,'[]')) loop
  if s.hard_halt_at is not null or (a->>'halted')::boolean or coalesce((p_note->>'marks_fresh')::boolean,false)=false then exit; end if;
  if p_bar is null or p_bar<=coalesce((cfg->>'q15_bar')::bigint,0) or p_bar%60000<>0
     or extract(epoch from clock_timestamp())*1000-p_bar not between 0 and 60000 then continue; end if;
  if x->>'profit_gate' is distinct from 'passed' or coalesce((x->>'net_bps')::numeric,-1)<-999 or (x->>'net_bps')::numeric='NaN'::numeric then raise exception 'Q15 entry without profit gate'; end if;
  if exists(select 1 from bot_trades where status='OPEN' and sym=x->>'sym') then continue; end if;
  select count(*),coalesce(sum(entry_price*size/greatest(lev,1)),0) into cnt,expo from bot_trades where status='OPEN' and strategy='Q15';
  select count(*) into dayn from bot_trades where strategy='Q15' and opened_at>=((now() at time zone 'UTC')::date)::timestamp at time zone 'UTC';
  if cnt>=20 or dayn>=200 then exit; end if;
  if x->>'sym' !~ '^[A-Z0-9]{2,16}$' or x->>'sym' = any(array['USDC','FDUSD','TUSD','BUSD','DAI','USDP','USDE','USD1','PYUSD','XAU','XAG','PAXG','XAUT','BTCDOM','DEFI','TSLA','AAPL','NVDA','MSTR','AMZN','GOOGL','META','MSFT','SPY','QQQ']) or x->>'side' not in ('LONG','SHORT') then raise exception 'invalid q15 instrument'; end if;
  m:=x->'q15';
  if coalesce((m->>'hold_ms')::bigint,0) not in (3600000,7200000) then raise exception 'invalid Q15 timeout'; end if;
  if m is null or coalesce((m->>'stop')::numeric,0)<=0 or coalesce((m->>'target')::numeric,0)<=0 or (m->>'stop')::numeric='NaN'::numeric or (m->>'target')::numeric='NaN'::numeric then raise exception 'q15 entry without levels'; end if;
  px:=(x->>'price')::numeric;
  if (x->>'quote_ts') is null or px is null or px<=0 or px='NaN'::numeric or abs(extract(epoch from clock_timestamp())*1000-(x->>'quote_ts')::numeric)>8000 then raise exception 'invalid entry quote'; end if;
  if (x->>'side'='LONG' and not ((m->>'stop')::numeric<px and (m->>'target')::numeric>px)) or (x->>'side'='SHORT' and not ((m->>'stop')::numeric>px and (m->>'target')::numeric<px)) then raise exception 'q15 levels on the wrong side'; end if;
  if abs(px-(m->>'stop')::numeric)/px<0.003999999999 then raise exception 'q15 stop tighter than 0.4%%'; end if;
  if abs(abs((m->>'target')::numeric-px)-2*abs(px-(m->>'stop')::numeric))>px*0.000001 then raise exception 'invalid Q15 2R target'; end if;
  lv:=least(25,greatest(1,coalesce((x->>'lev')::int,1)));
  mg:=least((x->>'notional')::numeric/lv,eq*0.15,greatest(0,eq*share-expo),greatest(0,cash/(1+lv*0.0005)));
  if mg<5 or mg is null or mg='NaN'::numeric then continue; end if;
  n:=mg*lv;
  insert into bot_trades(sym,side,entry_price,size,fee,trail_sl,hi,lo,status,paper_mode,strategy,lev,risk_usd,partial_done,scalp_meta)
  values(x->>'sym',x->>'side',px,n/px,n*0.0005,(m->>'stop')::numeric,px,px,'OPEN',true,'Q15',lv,n*abs(px-(m->>'stop')::numeric)/px,true,
   jsonb_build_object('q15',m,'source',x->>'source','entry_fee',n*0.0005,'margin',mg,'notional0',n,'experimental',true));
  cash:=cash-mg-n*0.0005; eq:=eq-n*0.0005; opens:=opens+1; accepted:=accepted||jsonb_build_array(x->>'sym');
  a:=public.agg2_day(cfg,cash,p_marks);
  cfg:=cfg||jsonb_build_object('agg_day',a-'marks','agg_marks',a->'marks');
 end loop;
 cfg:=cfg||jsonb_build_object('q15_cycle',coalesce(cfg->'q15_cycle','{}')||coalesce(p_note,'{}')||jsonb_build_object('ts',now(),'opened',opens,'fills',case when p_bar is null then coalesce((cfg->'q15_cycle'->>'fills')::int,0) else opens end,'accepted',accepted,'closed',closes,'halted',(a->>'halted')::boolean));
 if p_bar is not null then cfg:=cfg||jsonb_build_object('q15_bar',p_bar); end if;
 update bot_state set balance=cash,paper_mode=true,updated_at=now(),bot_params=cfg where id=1;
 return jsonb_build_object('opened',opens,'accepted',accepted,'closed',closes,'balance',cash,'equity',eq,'halted',(a->>'halted')::boolean,'day_start',(a->>'start')::numeric);
end $function$;

revoke all on function public.q15_commit_cycle(timestamptz,jsonb,jsonb,jsonb,jsonb,numeric,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.q15_commit_cycle(timestamptz,jsonb,jsonb,jsonb,jsonb,numeric,bigint,jsonb) to service_role;

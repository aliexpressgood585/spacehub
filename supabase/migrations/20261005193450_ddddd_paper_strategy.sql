-- Reliability only: preserve Q15 25x / 15% / 20 open / 90% / 200 per day.
-- Restore complete Blade/DONCH/EVT transactions; persist learning under the lease.
create or replace function public.q15_commit_cycle(p_lease timestamp with time zone, p_closes jsonb, p_entries jsonb, p_marks jsonb, p_note jsonb, p_share numeric default 0.90, p_bar bigint default null, p_updates jsonb default '[]'::jsonb)
returns jsonb language plpgsql set search_path to 'public','pg_temp' as $function$
declare
 s public.bot_state%rowtype; t public.bot_trades%rowtype; x jsonb; cfg jsonb; m jsonb; a jsonb;
 d5 boolean; cash numeric; eq numeric; mg numeric; ret numeric; lv integer; px numeric; n numeric; gross numeric; exitfee numeric; funding numeric; v_pnl numeric; expo numeric; book numeric;
 basis jsonb; day_marks jsonb; start_eq numeric; utc_day text:=to_char((now() at time zone 'UTC')::date,'YYYY-MM-DD');
 opens integer:=0; closes integer:=0; cnt integer; dayn integer; accepted jsonb:='[]'::jsonb; share numeric:=least(0.90,greatest(0.05,coalesce(p_share,0.90)));
begin
 select * into strict s from bot_state where id=1 for update;
 if p_lease is null or s.lock_until is distinct from p_lease or clock_timestamp()>p_lease then raise exception 'stale q15 lease'; end if;
 if not s.active or not s.paper_mode then raise exception 'q15 requires active paper account'; end if;
 if exists(select 1 from bot_trades where status='OPEN' and (paper_mode is not true or strategy not in ('Q15','EVT','DONCH4H') or lev<1 or lev>case when strategy='DONCH4H' then 1 else 25 end)) then raise exception 'q15 book holds an incompatible or non-paper row'; end if;
 d5:=coalesce(s.bot_params->>'paper_strategy','')='DDDDD';
 cash:=s.balance; cfg:=coalesce(s.bot_params,'{}')||jsonb_build_object('q15_marks_blocked',not coalesce((p_note->>'marks_fresh')::boolean,false));
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
  update bot_trades set scalp_meta=jsonb_set(scalp_meta,'{q15,chk}',x->'chk')
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
  if cnt>=20 or dayn>=200 then exit; end if;
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
   if x->>'side' is distinct from 'LONG' or m->>'pattern' is distinct from 'DDDDD' or coalesce((m->>'hold_ms')::bigint,-1)<>0
      or abs((m->>'stop')::numeric-px*0.99)>px*0.00000001 or abs((m->>'target')::numeric-px*1.01)>px*0.00000001
      or (m->>'bar')::bigint is distinct from p_bar then raise exception 'invalid DDDDD entry'; end if;
   if exists(select 1 from bot_trades where sym=x->>'sym' and scalp_meta->'q15'->>'pattern'='DDDDD' and (scalp_meta->'q15'->>'bar')::bigint=p_bar) then continue; end if;
  end if;
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
 if d5 and p_note ? 'd5_scan' then cfg:=cfg||jsonb_build_object('d5_scan',p_note->'d5_scan'); end if;
 if p_note ? 'q15_autonomy' then cfg:=cfg||jsonb_build_object('q15_autonomy',p_note->'q15_autonomy'); end if;
 if p_bar is not null then cfg:=cfg||jsonb_build_object('q15_bar',p_bar); end if;
 update bot_state set balance=cash,paper_mode=true,updated_at=now(),bot_params=cfg where id=1;
 return jsonb_build_object('opened',opens,'accepted',accepted,'closed',closes,'balance',cash,'equity',eq,'halted',(a->>'halted')::boolean,'day_start',(a->>'start')::numeric);
end $function$;
revoke all on function public.q15_commit_cycle(timestamptz,jsonb,jsonb,jsonb,jsonb,numeric,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.q15_commit_cycle(timestamptz,jsonb,jsonb,jsonb,jsonb,numeric,bigint,jsonb) to service_role;


create or replace function public.blade_commit_cycle(p_lease timestamptz, p_sleeve text, p_closes jsonb, p_legs jsonb, p_ratchets jsonb,
  p_entries jsonb, p_marks jsonb, p_note jsonb, p_level text default 'SHADOW', p_max_open integer default 0, p_snapshot boolean default false)
returns jsonb language plpgsql security invoker set search_path = public,pg_temp as $$
declare
 s public.bot_state%rowtype; t public.bot_trades%rowtype; x jsonb; cfg jsonb; m jsonb;
 cash numeric; eq numeric; gross_open numeric; net_open numeric; px numeric; q numeric; n numeric; mg numeric; lv numeric; st numeric; old numeric;
 dir integer; gross numeric; v_fee numeric; funding numeric; ret numeric; mshare numeric; v_pnl numeric; risk numeric;
 opens integer:=0; closes integer:=0; legs integer:=0; rat integer:=0; cnt integer; a jsonb;
begin
 if p_sleeve not in ('BLADE','DONCH4H','EVT') then raise exception 'unknown sleeve %', p_sleeve; end if;
 select * into strict s from bot_state where id=1 for update;
 if p_lease is null or s.lock_until is distinct from p_lease or clock_timestamp()>p_lease then raise exception 'stale blade lease'; end if;
 if not s.active or not s.paper_mode then raise exception 'blade requires active paper account'; end if;
 if exists(select 1 from bot_trades where status='OPEN' and (strategy not in ('BLADE','DONCH4H','EVT','FAST','Q15') or paper_mode is not true or lev<1 or (strategy='Q15' and lev>25) or (strategy in ('FAST','EVT') and lev>10) or (strategy in ('BLADE','DONCH4H') and lev>case when strategy='BLADE' then 5 else 1 end))) then raise exception 'blade book holds a foreign or non-paper row'; end if;
 cash:=s.balance; cfg:=coalesce(s.bot_params,'{}');

 -- partial closes (ladder legs / Blade scale-out)
 for x in select value from jsonb_array_elements(coalesce(p_legs,'[]')) loop
  select * into t from bot_trades where id=(x->>'id')::bigint and status='OPEN' and strategy=p_sleeve for update;
  if not found then continue; end if;
  px:=(x->>'price')::numeric; q:=least(t.size,greatest(0,(x->>'qty')::numeric));
  if px is null or px<=0 or q is null or q<=0 or q>=t.size then raise exception 'invalid leg'; end if;
  if (x->>'quote_ts') is null or abs(extract(epoch from clock_timestamp())*1000-(x->>'quote_ts')::numeric)>3600000 then raise exception 'stale leg quote'; end if;
  dir:=case when t.side='LONG' then 1 else -1 end; lv:=greatest(t.lev,1);
  mshare:=t.entry_price*q/lv; gross:=dir*(px-t.entry_price)*q; v_fee:=px*q*0.0005;
  ret:=greatest(0,mshare+gross-v_fee); cash:=cash+ret;
  m:=coalesce(t.scalp_meta,'{}')||coalesce(x->'meta','{}')||jsonb_build_object('legs',coalesce(t.scalp_meta->'legs','[]'::jsonb)||jsonb_build_array(jsonb_build_object('px',px,'qty',q,'reason',x->>'reason','at',now(),'ret',ret-mshare)));
  update bot_trades set size=t.size-q,legs_banked=coalesce(t.legs_banked,0)+ret-mshare,exit_stage=coalesce((x->>'stage')::int,t.exit_stage),
   trail_sl=coalesce((x->>'stop_after')::numeric,t.trail_sl),partial_done=true,scalp_meta=m where id=t.id;
  legs:=legs+1;
 end loop;

 -- full closes
 for x in select value from jsonb_array_elements(coalesce(p_closes,'[]')) loop
  select * into t from bot_trades where id=(x->>'id')::bigint and status='OPEN' and strategy=p_sleeve for update;
  if not found then continue; end if;
  px:=(x->>'price')::numeric; funding:=coalesce((x->>'funding')::numeric,0);
  if px is null or px<=0 or px='NaN'::numeric then raise exception 'invalid close price'; end if;
  if (x->>'quote_ts') is null or abs(extract(epoch from clock_timestamp())*1000-(x->>'quote_ts')::numeric)>3600000 then raise exception 'stale close quote'; end if;
  if abs(funding)>t.entry_price*t.size*0.2 then raise exception 'implausible funding'; end if;
  dir:=case when t.side='LONG' then 1 else -1 end; lv:=greatest(t.lev,1);
  mshare:=t.entry_price*t.size/lv; gross:=dir*(px-t.entry_price)*t.size; v_fee:=px*t.size*0.0005;
  ret:=greatest(0,mshare+gross-v_fee-funding); cash:=cash+ret;
  v_pnl:=coalesce(t.legs_banked,0)+ret-mshare-coalesce(t.fee,0);
  update bot_trades set status=case when v_pnl>=0 then 'TP' else 'SL' end,exit_price=px,pnl=v_pnl,
   pnl_pct=v_pnl/nullif(coalesce((t.scalp_meta->>'notional0')::numeric,t.entry_price*t.size)/lv,0),closed_at=now(),
   scalp_meta=coalesce(t.scalp_meta,'{}')||jsonb_build_object('exit_reason',x->>'reason','exit_fee',v_fee,'funding_paid',funding,
    'funding_missing',coalesce((x->>'funding_missing')::boolean,false),'fill',x->'fill',
    'r_mult',case when coalesce(t.risk_usd,0)>0 then v_pnl/t.risk_usd else null end) where id=t.id;
  closes:=closes+1;
 end loop;

 -- stop ratchets / state (favourable direction only)
 for x in select value from jsonb_array_elements(coalesce(p_ratchets,'[]')) loop
  select * into t from bot_trades where id=(x->>'id')::bigint and status='OPEN' and strategy=p_sleeve for update;
  if not found then continue; end if;
  st:=(x->>'stop')::numeric; old:=t.trail_sl;
  if st is not null and old is not null and ((t.side='LONG' and st<old) or (t.side='SHORT' and st>old)) then st:=old; end if;
  update bot_trades set trail_sl=coalesce(st,old),scalp_meta=coalesce(t.scalp_meta,'{}')||coalesce(x->'meta','{}') where id=t.id;
  rat:=rat+1;
 end loop;

 -- book after exits
 select cash+coalesce(sum(entry_price*size/greatest(lev,1)+(case when side='LONG' then 1 else -1 end)*(coalesce((p_marks->>sym)::numeric,entry_price)-entry_price)*size),0),
        coalesce(sum(entry_price*size),0), coalesce(sum((case when side='LONG' then 1 else -1 end)*entry_price*size) filter (where strategy='DONCH4H'),0)
   into eq, gross_open, net_open from bot_trades where status='OPEN';

 -- P-AGG2: account-level daily halt (-12% from the UTC day start), all sleeves, entries only
 a:=public.agg2_day(cfg,cash,p_marks);
 cfg:=cfg||jsonb_build_object('agg_day',a-'marks','agg_marks',a->'marks');

 -- entries
 for x in select value from jsonb_array_elements(coalesce(p_entries,'[]')) loop
  if cfg->>'paper_strategy'='DDDDD' or s.hard_halt_at is not null or (a->>'halted')::boolean or coalesce((cfg->>'q15_marks_blocked')::boolean,false) then exit; end if;
  if exists(select 1 from bot_trades where status='OPEN' and sym=x->>'sym') then
   -- P-AGG2: a DONCH4H pyramid unit may stack on its own same-side units (<= 3 units, no other strategy on the coin)
   if not (p_sleeve='DONCH4H' and coalesce(x->'meta','{}') ? 'pyramid'
      and not exists(select 1 from bot_trades where status='OPEN' and sym=x->>'sym' and (strategy<>'DONCH4H' or side<>x->>'side'))
      and (select count(*) from bot_trades where status='OPEN' and sym=x->>'sym')<3) then continue; end if;
   -- Re-check the runner's existing 0.6R / 1R winner-only pyramid rule.
   select count(*) into cnt from bot_trades where status='OPEN' and sym=x->>'sym';
   if exists(select 1 from bot_trades u where u.status='OPEN' and u.sym=x->>'sym' and
     (coalesce((u.scalp_meta->'ladder'->>'origSlDist')::numeric,0)<=0 or
      (case when u.side='LONG' then 1 else -1 end)*((x->>'price')::numeric-u.entry_price)
        < (case when cnt=1 then 0.6 else 1.0 end)*coalesce((u.scalp_meta->'ladder'->>'origSlDist')::numeric,0))) then continue; end if;
  end if;
  if x->>'sym' !~ '^[A-Z0-9]{2,16}$' or x->>'sym' = any(array['USDC','FDUSD','TUSD','BUSD','DAI','USDP','USDE','USD1','PYUSD','XAU','XAG','PAXG','XAUT','BTCDOM','DEFI','TSLA','AAPL','NVDA','MSTR','AMZN','GOOGL','META','MSFT','SPY','QQQ']) or x->>'side' not in ('LONG','SHORT') then raise exception 'invalid blade instrument'; end if;
  px:=(x->>'price')::numeric; st:=(x->>'stop')::numeric; n:=(x->>'notional')::numeric; dir:=case when x->>'side'='LONG' then 1 else -1 end;
  if px is null or px<=0 or n is null or n<=0 or st is null or st<=0 then raise exception 'invalid blade entry'; end if;
  if (x->>'quote_ts') is null or abs(extract(epoch from clock_timestamp())*1000-(x->>'quote_ts')::numeric)>20000 then raise exception 'stale entry quote'; end if;
  if dir*(px-st)<=0 then raise exception 'stop on the wrong side'; end if;
  if p_sleeve='BLADE' then
   if p_level not in ('PROBE','ATTACK') then exit; end if;                      -- SHADOW / HALT never book money
   select count(*) into cnt from bot_trades where status='OPEN' and strategy='BLADE';
   if cnt>=least(greatest(coalesce(p_max_open,0),0),3) then exit; end if;
   lv:=least(5,greatest(1,coalesce((x->>'lev')::numeric,1)));
   if abs(px-st)/px>0.045 then raise exception 'blade stop wider than 4.5%%'; end if;
   if (x->>'release_at')::timestamptz < now()-interval '90 seconds' then continue; end if;   -- age gate re-checked (30 s rule + decision latency)
   n:=least(n,eq*(case when p_level='ATTACK' then 0.081 else 0.021 end)*lv);   -- margin <= 8% (ATTACK) / 2% (PROBE) of equity
  elsif p_sleeve='EVT' then
   -- P-AGG2 EVT: isolated 10x paper, margin <= 8% of equity, <= 3 open, stop <= 4.5%, announcement age re-checked
   select count(*) into cnt from bot_trades where status='OPEN' and strategy='EVT';
   if cnt>=least(greatest(coalesce(p_max_open,0),0),3) then exit; end if;
   lv:=least(10,greatest(1,coalesce((x->>'lev')::numeric,1)));
   if abs(px-st)/px>0.045 then raise exception 'evt stop wider than 4.5%%'; end if;
   if (x->>'release_at')::timestamptz < now()-interval '90 seconds' then continue; end if;
   n:=least(n,eq*0.0801*lv);
  else
   lv:=1;
   if abs(px-st)/px>0.08 or abs(px-st)/px<0.0049 then raise exception 'donch stop outside 0.5..8%%'; end if;
   n:=least(n,eq*0.2001,greatest(0,eq*0.95-gross_open));                        -- per position 20%, heat 95%
   n:=least(n,greatest(0,eq*0.2001-coalesce((select sum(entry_price*size) from bot_trades where status='OPEN' and sym=x->>'sym'),0)));   -- per coin 20% (pyramid units included)
   risk:=n*abs(px-st)/px;
   if risk>eq*0.0125*2.0*1.01 then n:=eq*0.0125*2.0*px/abs(px-st); end if;      -- 1.25% x the top ADX tier
   if abs(net_open+dir*n)>eq*0.70 then continue; end if;                        -- net directional <= 70%
  end if;
  n:=least(n,greatest(0,cash/(1.0/lv+0.0005)));                                 -- margin + fee must fit the cash
  mg:=n/lv;
  if n<20 or mg<1 then continue; end if;
  insert into bot_trades(sym,side,entry_price,size,fee,trail_sl,hi,lo,status,paper_mode,strategy,lev,risk_usd,exit_stage,legs_banked,partial_done,scalp_meta)
  values(x->>'sym',x->>'side',px,n/px,n*0.0005,st,px,px,'OPEN',true,p_sleeve,lv,n*abs(px-st)/px,0,0,false,
   coalesce(x->'meta','{}')||jsonb_build_object('notional0',n,'margin',mg,'source',x->>'source','experimental',true,
    'validated',false,'target',(x->>'target')::numeric));
  cash:=cash-mg-n*0.0005; eq:=eq-n*0.0005; gross_open:=gross_open+n; if p_sleeve='DONCH4H' then net_open:=net_open+dir*n; end if; opens:=opens+1;
 end loop;

 cfg:=cfg||jsonb_build_object(case when p_sleeve='BLADE' then 'blade_cycle' when p_sleeve='EVT' then 'evt2_cycle' else 'donch_cycle' end,
   coalesce(p_note,'{}')||jsonb_build_object('ts',now(),'opened',opens,'closed',closes,'legs',legs,'ratcheted',rat,'level',p_level));
 if p_snapshot then
  insert into bot_equity(ts,equity,balance,exposure)
   select now(),cash+coalesce(sum(entry_price*size/greatest(lev,1)+(case when side='LONG' then 1 else -1 end)*(coalesce((p_marks->>sym)::numeric,entry_price)-entry_price)*size),0),cash,coalesce(sum(entry_price*size),0)
   from bot_trades where status='OPEN';
  cfg:=cfg||jsonb_build_object('blade_eq_ts',extract(epoch from now())*1000);
 end if;
 update bot_state set balance=cash,paper_mode=true,updated_at=now(),bot_params=cfg where id=1;
 return jsonb_build_object('opened',opens,'closed',closes,'legs',legs,'ratcheted',rat,'balance',cash,'equity',eq,'halted',(a->>'halted')::boolean,'day_start',(a->>'start')::numeric);
end $$;
revoke all on function public.blade_commit_cycle(timestamptz,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text,integer,boolean) from public,anon,authenticated;
grant execute on function public.blade_commit_cycle(timestamptz,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text,integer,boolean) to service_role;

-- Private archive for the explicitly authorized one-time demo reset.
create table if not exists public.paper_reset_archive(run_key text not null,source text not null,payload jsonb not null,archived_at timestamptz not null default now());
alter table public.paper_reset_archive enable row level security;
revoke all on public.paper_reset_archive from public,anon,authenticated;
grant select,insert on public.paper_reset_archive to service_role;

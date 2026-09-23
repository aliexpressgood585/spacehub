-- v74.0 adaptive hold: store the team's planned hold (1-15 min) with each SCALP entry.
alter table public.bot_trades add column if not exists scalp_meta jsonb;
create or replace function public.scalp_commit_cycle(p_lease timestamptz,p_closes jsonb,p_updates jsonb,p_entries jsonb,p_minutes jsonb,p_marks jsonb,p_feed jsonb,p_candidates jsonb)
returns jsonb language plpgsql security invoker set search_path = public,pg_temp as $$
declare
 s public.bot_state%rowtype; t public.bot_trades%rowtype; x jsonb; cfg jsonb;
 cash numeric; eq numeric; expo numeric; pk numeric; baseline numeric; px numeric; n numeric; sz numeric; gross numeric; exitfee numeric; funding numeric;
 v_pnl numeric; stop numeric; opens integer:=0; closes integer:=0; countopen integer; paused boolean; daytext text:=to_char(now() at time zone 'UTC','YYYY-MM-DD');
 reasons jsonb:='[]'::jsonb;
begin
 select * into strict s from bot_state where id=1 for update;
 if p_lease is null or s.lock_until is distinct from p_lease or clock_timestamp()>p_lease then raise exception 'stale scalp lease'; end if;
 if not s.active or not s.paper_mode then raise exception 'scalp requires active paper account'; end if;
 cash:=s.balance; cfg:=coalesce(s.bot_params,'{}');
 for x in select value from jsonb_array_elements(p_closes) loop
  select * into t from bot_trades where id=(x->>'id')::bigint and status='OPEN' for update;
  if not found then continue; end if;
  if t.paper_mode is not true or t.lev<>1 then raise exception 'non-paper or leveraged position'; end if;
  px:=(x->>'price')::numeric;
  if (x->>'quote_ts') is null or px is null or px<=0 or px='NaN'::numeric or abs(extract(epoch from clock_timestamp())*1000-(x->>'quote_ts')::numeric)>20000 then raise exception 'invalid close quote'; end if;
  gross:=(px-t.entry_price)*t.size*(case when t.side='LONG' then 1 else -1 end); exitfee:=px*t.size*0.0005;
  funding:=case when t.strategy='SCALP' then t.entry_price*t.size*0.0001*greatest(0,extract(epoch from now()-t.opened_at))/28800*(case when t.side='LONG' then 1 else -1 end) else 0 end;
  v_pnl:=gross-exitfee-funding-case when t.strategy='SCALP' then coalesce(t.fee,0) else 0 end;
  cash:=cash+t.entry_price*t.size+gross-exitfee-funding;
  update bot_trades set status=case when v_pnl>=0 then 'TP' else 'SL' end,exit_price=px,pnl=v_pnl,pnl_pct=v_pnl/(t.entry_price*t.size),closed_at=now(),
   scalp_meta=coalesce(scalp_meta,'{}')||jsonb_build_object('exit_reason',x->>'reason','exit_fee',exitfee,'funding_model',funding) where id=t.id;
  closes:=closes+1;
 end loop;
 for x in select value from jsonb_array_elements(p_updates) loop
  select * into t from bot_trades where id=(x->>'id')::bigint and status='OPEN' and strategy='SCALP' for update;
  if found then
   stop:=(x->>'stop')::numeric;
   if stop>0 and stop<>'NaN'::numeric then update bot_trades set trail_sl=case when side='LONG' then greatest(trail_sl,stop) else least(trail_sl,stop) end where id=t.id; end if;
  end if;
 end loop;
 select coalesce(sum(entry_price*size),0),count(*) into expo,countopen from bot_trades where status='OPEN';
 select cash+coalesce(sum(entry_price*size+((case when side='LONG' then 1 else -1 end)*(coalesce((p_marks->>sym)::numeric,entry_price)-entry_price)*size)),0) into eq from bot_trades where status='OPEN';
 pk:=greatest(coalesce((cfg->>'scalp_peak')::numeric,eq),eq);
 baseline:=case when cfg->>'scalp_day'=daytext then coalesce((cfg->>'scalp_day_equity')::numeric,eq) else eq end;
 paused:=s.hard_halt_at is not null or eq<=pk*0.85 or eq<=baseline*0.95;
 for x in select value from jsonb_array_elements(p_entries) loop
  if p_minutes is null or paused or countopen>=8 then continue; end if;
  if exists(select 1 from bot_trades where status='OPEN' and sym=x->>'sym') then continue; end if;
  if exists(select 1 from bot_trades where status='OPEN' and strategy is distinct from 'SCALP') then continue; end if;
  if not (x->>'sym'=any(array['BTC','ETH','SOL','XRP','DOGE','ADA','LINK','AVAX'])) or x->>'side' not in ('LONG','SHORT') then raise exception 'invalid scalp instrument'; end if;
  px:=(x->>'price')::numeric; stop:=(x->>'stop_pct')::numeric;
  if (x->>'quote_ts') is null or px is null or px<=0 or px='NaN'::numeric or stop is null or stop not between 0.003 and 0.01 or abs(extract(epoch from clock_timestamp())*1000-(x->>'quote_ts')::numeric)>20000 then raise exception 'invalid entry quote'; end if;
  n:=least((x->>'notional')::numeric,eq*0.25,greatest(0,eq*0.99-expo),greatest(0,cash/1.0005));
  if n<20 or n is null then continue; end if;
  sz:=n/px;
  insert into bot_trades(sym,side,entry_price,size,fee,trail_sl,hi,lo,status,paper_mode,strategy,lev,risk_usd,partial_done,scalp_meta)
  values(x->>'sym',x->>'side',px,sz,n*0.0005,px*(1+(case when x->>'side'='LONG' then -1 else 1 end)*stop),px,px,'OPEN',true,'SCALP',1,n*stop,true,
   jsonb_build_object('stop_pct',stop,'hold_min',least(15,greatest(1,coalesce((x->>'hold_min')::int,15))),'deadline',now()+make_interval(mins=>least(15,greatest(1,coalesce((x->>'hold_min')::int,15)))),'max_deadline',now()+interval '15 minutes','source',x->>'source','votes',x->'votes','experimental',true));
  cash:=cash-n*1.0005; eq:=eq-n*0.0005; expo:=expo+n; opens:=opens+1;countopen:=countopen+1;
 end loop;
 if p_minutes is not null then
  insert into team_meetings(decision,action,minutes) values(case when opens>0 then 'SCALP_OPEN' when paused then 'SCALP_PAUSED' else 'SCALP_HOLD' end,
    format('בוצעו ונשמרו %s פתיחות, %s סגירות. %s פוזיציות פתוחות; מזומן $%s. %s',opens,closes,countopen,round(cash,2),case when paused then 'כניסות מושהות לפי מגבלת סיכון.' else 'מנוע דמו 1–15 דקות.' end),p_minutes);
 end if;
 cfg:=cfg||jsonb_build_object('scalp_started',true,'scalp_peak',pk,'scalp_day',daytext,'scalp_day_equity',baseline,'scalp_paused',paused,'scalp_cycle',jsonb_build_object('ts',now(),'opened',opens,'closed',closes,'open_count',countopen));
 if p_candidates is not null then cfg:=cfg||jsonb_build_object('scalp_candidates',p_candidates); end if;
 update bot_state set balance=cash,paper_mode=true,updated_at=now(),lock_until=now(),bot_params=cfg,feed_health=p_feed||jsonb_build_object('ts',now()),shields=jsonb_build_object('scalp_paused',paused,'feed_stale',coalesce((p_feed->>'fail')::int,0)>0) where id=1;
 -- Limit equity rows to one/minute; exit checks can run every ten seconds.
 if not exists(select 1 from bot_equity where ts>now()-interval '55 seconds') then insert into bot_equity(equity,balance,exposure) values(eq,cash,expo); end if;
 return jsonb_build_object('opened',opens,'closed',closes,'balance',cash,'equity',eq,'paused',paused,'open_count',countopen);
end $$;
revoke all on function public.scalp_commit_cycle(timestamptz,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.scalp_commit_cycle(timestamptz,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) to service_role;

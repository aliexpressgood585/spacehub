-- v86.0: profit gate + one cost model + graded risk (owner, 2026-09-24).
-- (1) scalp_commit_cycle: the loss kill switch (day -5% / DD 15% -> paused) is REMOVED; losses now only scale
--     size (rmult, same tiers as shared/costs.ts riskScale); entries stop only on hard_halt_at (technical/human).
--     16 SCALP positions, 25% per coin, risk budget 0.5% of equity at the stop, holds 5-240 min, funding at the
--     observed rate, and every entry stores its cost breakdown / expected gross+net / risk & correlation scale.
-- (2) trade_decisions: every ranked candidate each meeting, accepted or rejected WITH the reason, costs, and
--     OBSERVED market data kept apart from INFERRED estimates. Anon read (dashboard), 48h retention (runner).
-- (3) agent_events: promotions / demotions / duplicates / unstable, diffed each meeting. Anon read.
create table if not exists public.trade_decisions(
 id bigserial primary key, ts timestamptz not null default now(), sym text not null, side text not null,
 decision text not null check (decision in ('accepted','rejected')), reason text not null, rank int,
 gross_bps numeric, cost_bps numeric, net_bps numeric, hold_min int, notional numeric, backers int, risk_mult numeric,
 observed jsonb, inferred jsonb);
create index if not exists trade_decisions_ts on public.trade_decisions(ts desc);
alter table public.trade_decisions enable row level security;
drop policy if exists trade_decisions_anon_read on public.trade_decisions;
create policy trade_decisions_anon_read on public.trade_decisions for select to anon, authenticated using (true);
create table if not exists public.agent_events(
 id bigserial primary key, ts timestamptz not null default now(), agent text not null, from_status text, to_status text not null,
 t numeric, horizon_min int, detail text);
create index if not exists agent_events_ts on public.agent_events(ts desc);
alter table public.agent_events enable row level security;
drop policy if exists agent_events_anon_read on public.agent_events;
create policy agent_events_anon_read on public.agent_events for select to anon, authenticated using (true);

create or replace function public.scalp_commit_cycle(p_lease timestamptz,p_closes jsonb,p_updates jsonb,p_entries jsonb,p_minutes jsonb,p_marks jsonb,p_feed jsonb,p_candidates jsonb)
returns jsonb language plpgsql security invoker set search_path = public,pg_temp as $$
declare
 s public.bot_state%rowtype; t public.bot_trades%rowtype; x jsonb; cfg jsonb;
 cash numeric; eq numeric; expo numeric; pk numeric; baseline numeric; px numeric; n numeric; sz numeric; gross numeric; exitfee numeric; funding numeric;
 v_pnl numeric; stop numeric; opens integer:=0; closes integer:=0; countopen integer; paused boolean; daytext text:=to_char(now() at time zone 'UTC','YYYY-MM-DD');
 reasons jsonb:='[]'::jsonb; rmult numeric:=1;
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
  -- v86.0 one cost model: funding at the PUBLISHED rate the runner observed (x.funding_rate), Binance's 0.01%/8h baseline when not observed
  funding:=case when t.strategy in ('SCALP','ROTA') then t.entry_price*t.size*coalesce(nullif(x->>'funding_rate','')::numeric,0.0001)*greatest(0,extract(epoch from now()-t.opened_at))/28800*(case when t.side='LONG' then 1 else -1 end) else 0 end;
  v_pnl:=gross-exitfee-funding-case when t.strategy in ('SCALP','ROTA') then coalesce(t.fee,0) else 0 end;
  cash:=cash+t.entry_price*t.size+gross-exitfee-funding;
  update bot_trades set status=case when v_pnl>=0 then 'TP' else 'SL' end,exit_price=px,pnl=v_pnl,pnl_pct=v_pnl/(t.entry_price*t.size),closed_at=now(),
   scalp_meta=coalesce(scalp_meta,'{}')||jsonb_build_object('exit_reason',x->>'reason','exit_fee',exitfee,'funding_model',funding,'funding_rate',coalesce(nullif(x->>'funding_rate','')::numeric,0.0001),'funding_observed',(x->>'funding_rate') is not null,'gross_pnl',gross) where id=t.id;
  closes:=closes+1;
 end loop;
 for x in select value from jsonb_array_elements(p_updates) loop
  select * into t from bot_trades where id=(x->>'id')::bigint and status='OPEN' and strategy='SCALP' for update;
  if found then
   stop:=(x->>'stop')::numeric;
   if stop>0 and stop<>'NaN'::numeric then update bot_trades set trail_sl=case when side='LONG' then greatest(trail_sl,stop) else least(trail_sl,stop) end where id=t.id; end if;
  end if;
 end loop;
 select coalesce(sum(entry_price*size),0) into expo from bot_trades where status='OPEN';
 select count(*) into countopen from bot_trades where status='OPEN' and strategy='SCALP';
 select cash+coalesce(sum(entry_price*size+((case when side='LONG' then 1 else -1 end)*(coalesce((p_marks->>sym)::numeric,entry_price)-entry_price)*size)),0) into eq from bot_trades where status='OPEN';
 pk:=greatest(coalesce((cfg->>'scalp_peak')::numeric,eq),eq);
 baseline:=case when cfg->>'scalp_day'=daytext then coalesce((cfg->>'scalp_day_equity')::numeric,eq) else eq end;
 -- v86.0: NO loss kill switch. Only a hard halt (set for severe technical faults / by a human) stops entries;
 -- losses only scale size down (graded, never to zero) — same tiers as shared/costs.ts riskScale().
 paused:=s.hard_halt_at is not null;
 rmult:=greatest(0.1,(case when eq>=pk*0.95 then 1 when eq>=pk*0.90 then 0.75 when eq>=pk*0.85 then 0.5 when eq>=pk*0.75 then 0.3 else 0.15 end)
        *(case when eq>=baseline*0.97 then 1 when eq>=baseline*0.95 then 0.75 when eq>=baseline*0.92 then 0.5 else 0.3 end));
 for x in select value from jsonb_array_elements(p_entries) loop
  if p_minutes is null or paused or countopen>=16 then continue; end if;
  if exists(select 1 from bot_trades where status='OPEN' and sym=x->>'sym') then continue; end if;
  if not (x->>'sym'=any(array['BTC','ETH','SOL','BNB','XRP','DOGE','ADA','AVAX','LINK','DOT','LTC','BCH','NEAR','INJ','SUI','TRX','APT','ARB','OP','ATOM','FIL','UNI','AAVE','ICP','ALGO','SEI','WLD','TIA','RUNE','LDO','CRV','DYDX','GALA','SAND','AXS','IMX','ENA','PEPE','WIF','FET'])) or x->>'side' not in ('LONG','SHORT') then raise exception 'invalid scalp instrument'; end if;
  px:=(x->>'price')::numeric; stop:=(x->>'stop_pct')::numeric;
  if (x->>'quote_ts') is null or px is null or px<=0 or px='NaN'::numeric or stop is null or stop not between 0.003 and 0.04 or abs(extract(epoch from clock_timestamp())*1000-(x->>'quote_ts')::numeric)>20000 then raise exception 'invalid entry quote'; end if;
  -- risk budget: 0.5% of equity at the stop × graded risk multiplier; 25% per coin
  n:=least((x->>'notional')::numeric,eq*0.25,eq*0.005*rmult/stop,greatest(0,eq*0.99-expo),greatest(0,cash/1.0005));
  if n<20 or n is null then continue; end if;
  sz:=n/px;
  insert into bot_trades(sym,side,entry_price,size,fee,trail_sl,hi,lo,status,paper_mode,strategy,lev,risk_usd,partial_done,scalp_meta)
  values(x->>'sym',x->>'side',px,sz,n*0.0005,px*(1+(case when x->>'side'='LONG' then -1 else 1 end)*stop),px,px,'OPEN',true,'SCALP',1,n*stop,true,
   jsonb_build_object('stop_pct',stop,'hold_min',least(240,greatest(5,coalesce((x->>'hold_min')::int,15))),'deadline',now()+make_interval(mins=>least(240,greatest(5,coalesce((x->>'hold_min')::int,15)))),'max_deadline',now()+interval '240 minutes','source',x->>'source','votes',x->'votes','experimental',true,
    'costs',x->'costs','gross_bps_expected',(x->>'gross_bps')::numeric,'net_bps_expected',(x->>'net_bps')::numeric,'risk_mult',rmult,'corr_mult',(x->>'corr_mult')::numeric,'profit_gate','passed'));
  cash:=cash-n*1.0005; eq:=eq-n*0.0005; expo:=expo+n; opens:=opens+1;countopen:=countopen+1;
 end loop;
 if p_minutes is not null then
  insert into team_meetings(decision,action,minutes) values(case when opens>0 then 'SCALP_OPEN' when paused then 'SCALP_PAUSED' else 'SCALP_HOLD' end,
    format('בוצעו ונשמרו %s פתיחות, %s סגירות. %s פוזיציות פתוחות; מזומן $%s. %s',opens,closes,countopen,round(cash,2),case when paused then 'כניסות מושהות: עצירה טכנית (hard halt).' else format('מנוע דמו, החזקה 5–240 דקות; כל כניסה עברה את שער הרווח; מכפיל סיכון %s.',round(rmult,2)) end),p_minutes);
 end if;
 cfg:=cfg||jsonb_build_object('scalp_started',true,'scalp_peak',pk,'scalp_day',daytext,'scalp_day_equity',baseline,'scalp_paused',paused,'scalp_risk_mult',rmult,'scalp_cycle',jsonb_build_object('ts',now(),'opened',opens,'closed',closes,'open_count',countopen));
 if p_candidates is not null then cfg:=cfg||jsonb_build_object('scalp_candidates',p_candidates); end if;
 update bot_state set balance=cash,paper_mode=true,updated_at=now(),lock_until=now(),bot_params=cfg,feed_health=p_feed||jsonb_build_object('ts',now()),shields=jsonb_build_object('scalp_paused',paused,'feed_stale',coalesce((p_feed->>'fail')::int,0)>0) where id=1;
 -- Limit equity rows to one/minute; exit checks can run every ten seconds.
 if not exists(select 1 from bot_equity where ts>now()-interval '55 seconds') then insert into bot_equity(equity,balance,exposure) values(eq,cash,expo); end if;
 return jsonb_build_object('opened',opens,'closed',closes,'balance',cash,'equity',eq,'paused',paused,'risk_mult',rmult,'open_count',countopen);
end $$;
revoke all on function public.scalp_commit_cycle(timestamptz,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.scalp_commit_cycle(timestamptz,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) to service_role;

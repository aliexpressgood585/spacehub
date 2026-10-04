-- P-AGG2 (owner override 2026-10-04, PAPER ONLY): "level 2 — more aggressive and risky; no lotto, no 50x, no PRO".
-- Sleeves FAST + EVT + DONCH4H in one paper book. This migration is the ledger side; every cap is enforced here again.
--  1. agg2_day(): the ONE remaining brake. Account equity (cash + isolated margin + unrealised, each position floored at
--     0 = isolated) at -12% from the UTC day start -> every NEW entry is off for the rest of the UTC day, all sleeves.
--     Exits, stops, trails and timeouts keep running. The day start is the equity at the first commit of the UTC day;
--     the halt is sticky for that day and clears automatically the next UTC day. Marks: this call's marks, else the last
--     mark any sleeve published (bot_params.agg_marks), else the entry price.
--  2. fast_commit_cycle: leverage clamped 1..10 (was 100), margin <= 5% of equity per trade (was 34%), <= 8 open
--     (was 15), FAST margin share <= 50% of equity, the halt.
--  3. blade_commit_cycle: new sleeve EVT (isolated 10x, margin <= 8% of equity, <= 3 open, stop <= 4.5%, age re-check),
--     DONCH4H stays 1x with pyramid units (<= 3 same-side units on a coin, per-coin 20% combined), FAST/EVT rows may share
--     the book, the halt. Note key for EVT: bot_params.evt2_cycle.
--  4. fast_shadow: every confirmed FAST real-time signal, scored at its hold horizon — the measured gross the FAST
--     profit gate reads (no estimate is invented: no measurement -> no entry).
-- Paper lock: every function refuses unless bot_state.paper_mode and every touched row is paper.

create or replace function public.agg2_day(p_cfg jsonb, p_cash numeric, p_marks jsonb)
returns jsonb language plpgsql stable set search_path = public,pg_temp as $$
declare
 d text:=to_char((now() at time zone 'UTC')::date,'YYYY-MM-DD');
 mk jsonb:=coalesce(p_cfg->'agg_marks','{}'::jsonb)||coalesce(p_marks,'{}'::jsonb);
 eq numeric; st numeric; h boolean; ha text;
begin
 select p_cash+coalesce(sum(greatest(0,entry_price*size/greatest(lev,1)+(case when side='LONG' then 1 else -1 end)*(coalesce((mk->>sym)::numeric,entry_price)-entry_price)*size)),0)
   into eq from bot_trades where status='OPEN';
 if p_cfg->'agg_day'->>'day' is distinct from d then st:=eq; h:=false; ha:=null;
 else st:=coalesce((p_cfg->'agg_day'->>'start')::numeric,eq); h:=coalesce((p_cfg->'agg_day'->>'halted')::boolean,false); ha:=p_cfg->'agg_day'->>'halted_at'; end if;
 if not h and st>0 and eq<=st*0.88 then h:=true; ha:=now()::text; end if;
 return jsonb_build_object('day',d,'start',st,'eq',eq,'halted',h,'halted_at',ha,'dd',case when st>0 then 1-eq/st end,'limit',0.12,'marks',mk);
end $$;
revoke all on function public.agg2_day(jsonb,numeric,jsonb) from public,anon,authenticated;
grant execute on function public.agg2_day(jsonb,numeric,jsonb) to service_role;

create table if not exists public.fast_shadow (
  id bigserial primary key,
  sym text not null, side smallint not null check (side in (1,-1)), t0 bigint not null, px0 double precision not null,
  hold_min integer not null, z double precision, vol_ratio double precision, imb double precision, taken boolean not null default false,
  status text not null default 'open' check (status in ('open','closed','failed')), px1 double precision, gross_bps double precision,
  created_at timestamptz not null default now(), closed_at timestamptz,
  unique (sym, t0)
);
create index if not exists fast_shadow_status on public.fast_shadow(status, t0);
alter table public.fast_shadow enable row level security;
drop policy if exists fast_shadow_anon_read on public.fast_shadow;
create policy fast_shadow_anon_read on public.fast_shadow for select to anon using (true);
grant select on public.fast_shadow to anon;

create or replace function public.fast_commit_cycle(p_lease timestamp with time zone, p_closes jsonb, p_entries jsonb, p_marks jsonb, p_share numeric, p_note jsonb, p_bar timestamp with time zone default null::timestamp with time zone)
returns jsonb language plpgsql set search_path to 'public','pg_temp' as $function$
declare
 s public.bot_state%rowtype; t public.bot_trades%rowtype; x jsonb; cfg jsonb; m jsonb; a jsonb;
 cash numeric; eq numeric; mg numeric; ret numeric; lv integer; px numeric; n numeric; gross numeric; exitfee numeric; funding numeric; v_pnl numeric; expo numeric; book numeric;
 opens integer:=0; closes integer:=0; cnt integer; dayn integer; share numeric:=least(0.5,greatest(0.05,coalesce(p_share,0.5)));
begin
 select * into strict s from bot_state where id=1 for update;
 if p_lease is null or s.lock_until is distinct from p_lease or clock_timestamp()>p_lease then raise exception 'stale fast lease'; end if;
 if not s.active or not s.paper_mode then raise exception 'fast requires active paper account'; end if;
 if exists(select 1 from bot_trades where status='OPEN' and paper_mode is not true) then raise exception 'fast book holds a non-paper row'; end if;
 cash:=s.balance; cfg:=coalesce(s.bot_params,'{}');
 for x in select value from jsonb_array_elements(coalesce(p_closes,'[]')) loop
  select * into t from bot_trades where id=(x->>'id')::bigint and status='OPEN' and strategy='FAST' for update;
  if not found then continue; end if;
  if t.paper_mode is not true then raise exception 'non-paper position'; end if;
  px:=(x->>'price')::numeric;
  if (x->>'quote_ts') is null or px is null or px<=0 or px='NaN'::numeric or abs(extract(epoch from clock_timestamp())*1000-(x->>'quote_ts')::numeric)>20000 then raise exception 'invalid close quote'; end if;
  gross:=(px-t.entry_price)*t.size*(case when t.side='LONG' then 1 else -1 end); exitfee:=px*t.size*0.0005;
  funding:=t.entry_price*t.size*0.0001*greatest(0,extract(epoch from now()-t.opened_at))/28800*(case when t.side='LONG' then 1 else -1 end);
  mg:=t.entry_price*t.size/greatest(t.lev,1);
  ret:=greatest(0,mg+gross-exitfee-funding);          -- isolated: a position can lose its own margin, never more
  v_pnl:=ret-mg-coalesce(t.fee,0);
  cash:=cash+ret;
  update bot_trades set status=case when v_pnl>=0 then 'TP' else 'SL' end,exit_price=px,pnl=v_pnl,pnl_pct=v_pnl/mg,closed_at=now(),
   scalp_meta=coalesce(scalp_meta,'{}')||jsonb_build_object('exit_reason',x->>'reason','fill',coalesce(x->'fill','null'::jsonb),'exit_fee',exitfee,'funding_paid',funding,'funding_model',funding,'funding_inferred',true,'margin',mg,'lev',t.lev) where id=t.id;
  closes:=closes+1;
 end loop;
 select cash+coalesce(sum(entry_price*size/greatest(lev,1)+((case when side='LONG' then 1 else -1 end)*(coalesce((p_marks->>sym)::numeric,entry_price)-entry_price)*size)),0) into eq from bot_trades where status='OPEN';
 a:=public.agg2_day(cfg,cash,p_marks);
 cfg:=cfg||jsonb_build_object('agg_day',a-'marks','agg_marks',a->'marks');
 for x in select value from jsonb_array_elements(coalesce(p_entries,'[]')) loop
  if s.hard_halt_at is not null or (a->>'halted')::boolean then exit; end if;
  if exists(select 1 from bot_trades where status='OPEN' and sym=x->>'sym') then continue; end if;
  select count(*),coalesce(sum(entry_price*size/greatest(lev,1)),0) into cnt,expo from bot_trades where status='OPEN' and strategy='FAST';
  select count(*) into dayn from bot_trades where strategy='FAST' and opened_at>=((now() at time zone 'UTC')::date)::timestamp at time zone 'UTC';
  if cnt>=8 or dayn>=20 then exit; end if;
  if x->>'sym' !~ '^[A-Z0-9]{2,16}$' or x->>'sym' = any(array['USDC','FDUSD','TUSD','BUSD','DAI','USDP','USDE','USD1','PYUSD','XAU','XAG','PAXG','XAUT','BTCDOM','DEFI','TSLA','AAPL','NVDA','MSTR','AMZN','GOOGL','META','MSFT','SPY','QQQ']) or x->>'side' not in ('LONG','SHORT') then raise exception 'invalid fast instrument'; end if;
  m:=x->'fast';
  if m is null or (m->>'stop')::numeric<=0 or (m->>'target')::numeric<=0 then raise exception 'fast entry without levels'; end if;
  px:=(x->>'price')::numeric;
  if (x->>'quote_ts') is null or px is null or px<=0 or px='NaN'::numeric or abs(extract(epoch from clock_timestamp())*1000-(x->>'quote_ts')::numeric)>20000 then raise exception 'invalid entry quote'; end if;
  if (x->>'side'='LONG' and not ((m->>'stop')::numeric<px and (m->>'target')::numeric>px)) or (x->>'side'='SHORT' and not ((m->>'stop')::numeric>px and (m->>'target')::numeric<px)) then raise exception 'fast levels on the wrong side'; end if;
  if abs(px-(m->>'stop')::numeric)/px<0.00299 then raise exception 'fast stop tighter than 0.3%%'; end if;
  lv:=least(10,greatest(1,coalesce((x->>'lev')::int,1)));
  mg:=least((x->>'notional')::numeric/lv,eq*0.0501,greatest(0,eq*share-expo),greatest(0,cash/(1+lv*0.0005)));
  if mg<5 or mg is null then continue; end if;
  n:=mg*lv;
  insert into bot_trades(sym,side,entry_price,size,fee,trail_sl,hi,lo,status,paper_mode,strategy,lev,risk_usd,partial_done,scalp_meta)
  values(x->>'sym',x->>'side',px,n/px,n*0.0005,(m->>'stop')::numeric,px,px,'OPEN',true,'FAST',lv,n*abs(px-(m->>'stop')::numeric)/px,true,
   jsonb_build_object('fast',m,'source',x->>'source','entry_fee',n*0.0005,'margin',mg,'notional0',n,'experimental',true));
  cash:=cash-mg-n*0.0005; eq:=eq-n*0.0005; opens:=opens+1;
 end loop;
 cfg:=cfg||jsonb_build_object('fast_cycle',coalesce(p_note,'{}')||jsonb_build_object('ts',now(),'opened',opens,'closed',closes,'halted',(a->>'halted')::boolean));
 if p_bar is not null then cfg:=cfg||jsonb_build_object('fast_bar',(extract(epoch from p_bar)*1000)::bigint); end if;
 update bot_state set balance=cash,paper_mode=true,updated_at=now(),bot_params=cfg where id=1;
 return jsonb_build_object('opened',opens,'closed',closes,'balance',cash,'equity',eq,'halted',(a->>'halted')::boolean,'day_start',(a->>'start')::numeric);
end $function$;
revoke all on function public.fast_commit_cycle(timestamptz,jsonb,jsonb,jsonb,numeric,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.fast_commit_cycle(timestamptz,jsonb,jsonb,jsonb,numeric,jsonb,timestamptz) to service_role;

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
 if exists(select 1 from bot_trades where status='OPEN' and (strategy not in ('BLADE','DONCH4H','EVT','FAST') or paper_mode is not true or (strategy in ('BLADE','DONCH4H') and lev>case when strategy='BLADE' then 5 else 1 end))) then raise exception 'blade book holds a foreign or non-paper row'; end if;
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
  if s.hard_halt_at is not null or (a->>'halted')::boolean then exit; end if;
  if exists(select 1 from bot_trades where status='OPEN' and sym=x->>'sym') then
   -- P-AGG2: a DONCH4H pyramid unit may stack on its own same-side units (<= 3 units, no other strategy on the coin)
   if not (p_sleeve='DONCH4H' and coalesce(x->'meta','{}') ? 'pyramid'
      and not exists(select 1 from bot_trades where status='OPEN' and sym=x->>'sym' and (strategy<>'DONCH4H' or side<>x->>'side'))
      and (select count(*) from bot_trades where status='OPEN' and sym=x->>'sym')<3) then continue; end if;
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

-- BLADE (quant/PREREGISTRATION_BLADE.md) + DONCH4H background sleeve, one paper book.
-- 1. blade_events: the journal of every parsed announcement candidate (gate verdict, detect lag, SHADOW virtual fills,
--    PROBE/ATTACK paper fills). Written by the runner with the service role; anon may read (house panel).
-- 2. blade_commit_cycle: the ONLY writer of money for both sleeves. A call names its sleeve (p_sleeve) and can touch
--    only rows of that strategy, so Blade can never close a DONCH4H row and vice versa. Every cap is enforced again here.
--    Isolated margin: an entry posts notional/lev + the taker fee; a partial or full close returns its share of the margin
--    + P&L - exit fee, floored at 0 (isolated). DONCH4H is always 1x.
-- PAPER ONLY: refuses unless bot_state.paper_mode and every touched row is paper.
create table if not exists public.blade_events (
  id bigserial primary key,
  ann_key text not null,                  -- '<releaseDate>:<coin>'
  rule text not null check (rule in ('BL1','BD1')),
  coin text not null, perp text not null, side smallint not null check (side in (1,-1)),
  title text, release_at timestamptz not null, seen_at timestamptz not null, detect_lag_ms bigint,
  decided_at timestamptz not null default now(), level text not null, gate text,           -- gate null = passed
  mode text not null check (mode in ('shadow','paper','skipped')),
  trade_id bigint, entry_px double precision, pos jsonb, chk bigint,
  status text not null default 'open' check (status in ('open','closed','skipped')),
  fills jsonb, net double precision, closed_at timestamptz, note jsonb,
  unique (ann_key, rule)
);
alter table public.blade_events enable row level security;
drop policy if exists blade_events_anon_read on public.blade_events;
create policy blade_events_anon_read on public.blade_events for select to anon using (true);
grant select on public.blade_events to anon;

create or replace function public.blade_commit_cycle(p_lease timestamptz, p_sleeve text, p_closes jsonb, p_legs jsonb, p_ratchets jsonb,
  p_entries jsonb, p_marks jsonb, p_note jsonb, p_level text default 'SHADOW', p_max_open integer default 0, p_snapshot boolean default false)
returns jsonb language plpgsql security invoker set search_path = public,pg_temp as $$
declare
 s public.bot_state%rowtype; t public.bot_trades%rowtype; x jsonb; cfg jsonb; m jsonb;
 cash numeric; eq numeric; gross_open numeric; net_open numeric; px numeric; q numeric; n numeric; mg numeric; lv numeric; st numeric; old numeric;
 dir integer; gross numeric; v_fee numeric; funding numeric; ret numeric; mshare numeric; v_pnl numeric; risk numeric;
 opens integer:=0; closes integer:=0; legs integer:=0; rat integer:=0; cnt integer;
begin
 if p_sleeve not in ('BLADE','DONCH4H') then raise exception 'unknown sleeve %', p_sleeve; end if;
 select * into strict s from bot_state where id=1 for update;
 if p_lease is null or s.lock_until is distinct from p_lease or clock_timestamp()>p_lease then raise exception 'stale blade lease'; end if;
 if not s.active or not s.paper_mode then raise exception 'blade requires active paper account'; end if;
 if exists(select 1 from bot_trades where status='OPEN' and (strategy not in ('BLADE','DONCH4H') or paper_mode is not true)) then raise exception 'blade book holds a foreign or non-paper row'; end if;
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

 -- entries
 for x in select value from jsonb_array_elements(coalesce(p_entries,'[]')) loop
  if s.hard_halt_at is not null then exit; end if;
  if exists(select 1 from bot_trades where status='OPEN' and sym=x->>'sym') then continue; end if;
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
  else
   lv:=1;
   if abs(px-st)/px>0.08 or abs(px-st)/px<0.0049 then raise exception 'donch stop outside 0.5..8%%'; end if;
   n:=least(n,eq*0.2001,greatest(0,eq*0.95-gross_open));                        -- per position 20%, heat 95%
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

 cfg:=cfg||jsonb_build_object(case when p_sleeve='BLADE' then 'blade_cycle' else 'donch_cycle' end,
   coalesce(p_note,'{}')||jsonb_build_object('ts',now(),'opened',opens,'closed',closes,'legs',legs,'ratcheted',rat,'level',p_level));
 if p_snapshot then
  insert into bot_equity(ts,equity,balance,exposure)
   select now(),cash+coalesce(sum(entry_price*size/greatest(lev,1)+(case when side='LONG' then 1 else -1 end)*(coalesce((p_marks->>sym)::numeric,entry_price)-entry_price)*size),0),cash,coalesce(sum(entry_price*size),0)
   from bot_trades where status='OPEN';
  cfg:=cfg||jsonb_build_object('blade_eq_ts',extract(epoch from now())*1000);
 end if;
 update bot_state set balance=cash,paper_mode=true,updated_at=now(),bot_params=cfg where id=1;
 return jsonb_build_object('opened',opens,'closed',closes,'legs',legs,'ratcheted',rat,'balance',cash,'equity',eq);
end $$;
revoke all on function public.blade_commit_cycle(timestamptz,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text,integer,boolean) from public,anon,authenticated;
grant execute on function public.blade_commit_cycle(timestamptz,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text,integer,boolean) to service_role;

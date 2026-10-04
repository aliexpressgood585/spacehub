-- P-Q15 (owner override 2026-10-04, PAPER ONLY): "trade aggressively every fifteen minutes, and be profitable".
-- Sleeves Q15 + EVT + DONCH4H in one paper book (quant/PREREGISTRATION_Q15.md). Ledger side; every cap is enforced here.
--  1. q15_shadow: every Q15 signal (taken or not), scored later by the exact bracket on 1m bars — the measured gross the
--     Q15 profit gate reads. No measurement -> no entry.
--  2. q15_commit_cycle: paper lock; leverage clamped 1..10 (isolated); margin <= 5% of equity per trade; <= 8 Q15 open;
--     Q15 margin <= 50% of equity; <= 20 Q15 entries per UTC day; one position per coin; stop >= 0.4%; target and stop on
--     the right side; fresh quotes; the account -12% UTC-day halt (agg2_day, shared with EVT/DONCH4H). Exits: isolated
--     (a position never loses more than its margin).
--  3. blade_commit_cycle (EVT / DONCH4H): Q15 rows may share the book. DONCH4H stays forced to 1x there.
-- Rollback: previous shim ('FAST,EVT,DONCH4H'); close open Q15 rows first.

create table if not exists public.q15_shadow (
  id bigserial primary key,
  sym text not null, side smallint not null check (side in (1,-1)), bar bigint not null, t0 bigint not null, px0 double precision not null,
  stop double precision not null, target double precision not null, hold_min integer not null,
  z double precision, vol_ratio double precision, imb double precision, taken boolean not null default false,
  status text not null default 'open' check (status in ('open','closed','failed')), px1 double precision, why text, gross_bps double precision,
  created_at timestamptz not null default now(), closed_at timestamptz,
  unique (sym, bar)
);
create index if not exists q15_shadow_status on public.q15_shadow(status, bar);
alter table public.q15_shadow enable row level security;
drop policy if exists q15_shadow_anon_read on public.q15_shadow;
create policy q15_shadow_anon_read on public.q15_shadow for select to anon using (true);
grant select on public.q15_shadow to anon;

create or replace function public.q15_commit_cycle(p_lease timestamptz, p_closes jsonb, p_entries jsonb, p_updates jsonb, p_marks jsonb,
  p_note jsonb, p_bar timestamptz default null)
returns jsonb language plpgsql set search_path to 'public','pg_temp' as $function$
declare
 s public.bot_state%rowtype; t public.bot_trades%rowtype; x jsonb; cfg jsonb; m jsonb; a jsonb;
 cash numeric; eq numeric; mg numeric; ret numeric; lv integer; px numeric; n numeric; gross numeric; exitfee numeric; funding numeric; v_pnl numeric; expo numeric;
 opens integer:=0; closes integer:=0; upd integer:=0; cnt integer; dayn integer; share numeric; per numeric; maxo integer;
begin
 select * into strict s from bot_state where id=1 for update;
 if p_lease is null or s.lock_until is distinct from p_lease or clock_timestamp()>p_lease then raise exception 'stale q15 lease'; end if;
 if not s.active or not s.paper_mode then raise exception 'q15 requires active paper account'; end if;
 if exists(select 1 from bot_trades where status='OPEN' and (paper_mode is not true or (strategy not in ('Q15','EVT','FAST') and lev>1))) then raise exception 'q15 book holds a non-paper or leveraged non-Q15/EVT row'; end if;
 cash:=s.balance; cfg:=coalesce(s.bot_params,'{}');
 share:=least(0.5,greatest(0.05,coalesce((p_note->>'share')::numeric,0.5)));
 per:=least(0.05,greatest(0.001,coalesce((p_note->>'per_trade')::numeric,0.05)));
 maxo:=least(8,greatest(1,coalesce((p_note->>'max_open')::int,8)));

 -- exits (isolated: ret >= 0)
 for x in select value from jsonb_array_elements(coalesce(p_closes,'[]')) loop
  select * into t from bot_trades where id=(x->>'id')::bigint and status='OPEN' and strategy='Q15' for update;
  if not found then continue; end if;
  px:=(x->>'price')::numeric;
  if (x->>'quote_ts') is null or px is null or px<=0 or px='NaN'::numeric or abs(extract(epoch from clock_timestamp())*1000-(x->>'quote_ts')::numeric)>20000 then raise exception 'invalid q15 close quote'; end if;
  funding:=coalesce((x->>'funding')::numeric,t.entry_price*t.size*0.0001*greatest(0,extract(epoch from now()-t.opened_at))/28800*(case when t.side='LONG' then 1 else -1 end));
  if abs(funding)>t.entry_price*t.size*0.2 then raise exception 'implausible funding'; end if;
  gross:=(px-t.entry_price)*t.size*(case when t.side='LONG' then 1 else -1 end); exitfee:=px*t.size*0.0005;
  mg:=t.entry_price*t.size/greatest(t.lev,1);
  ret:=greatest(0,mg+gross-exitfee-funding);
  v_pnl:=ret-mg-coalesce(t.fee,0);
  cash:=cash+ret;
  update bot_trades set status=case when v_pnl>=0 then 'TP' else 'SL' end,exit_price=px,pnl=v_pnl,pnl_pct=v_pnl/mg,closed_at=now(),
   scalp_meta=coalesce(scalp_meta,'{}')||jsonb_build_object('exit_reason',x->>'reason','fill',coalesce(x->'fill','null'::jsonb),'exit_fee',exitfee,'funding_paid',funding,
    'funding_inferred',(x->>'funding') is null,'margin',mg,'lev',t.lev,'r_mult',case when coalesce(t.risk_usd,0)>0 then v_pnl/t.risk_usd else null end) where id=t.id;
  closes:=closes+1;
 end loop;

 -- tape checkpoint / best price (no stop change: Q15 stops and targets are fixed at entry)
 for x in select value from jsonb_array_elements(coalesce(p_updates,'[]')) loop
  select * into t from bot_trades where id=(x->>'id')::bigint and status='OPEN' and strategy='Q15' for update;
  if not found then continue; end if;
  m:=t.scalp_meta;
  if (x->>'chk') is not null and (x->>'chk')::numeric > coalesce((m->'q15'->>'chk')::numeric,0) then m:=jsonb_set(m,'{q15,chk}',x->'chk'); end if;
  if (x->>'best') is not null then m:=jsonb_set(m,'{q15,best}',x->'best'); end if;
  update bot_trades set scalp_meta=m where id=t.id; upd:=upd+1;
 end loop;

 select cash+coalesce(sum(greatest(0,entry_price*size/greatest(lev,1)+(case when side='LONG' then 1 else -1 end)*(coalesce((p_marks->>sym)::numeric,entry_price)-entry_price)*size)),0) into eq from bot_trades where status='OPEN';
 a:=public.agg2_day(cfg,cash,p_marks);
 cfg:=cfg||jsonb_build_object('agg_day',a-'marks','agg_marks',a->'marks');

 -- entries
 for x in select value from jsonb_array_elements(coalesce(p_entries,'[]')) loop
  if s.hard_halt_at is not null or (a->>'halted')::boolean then exit; end if;
  if exists(select 1 from bot_trades where status='OPEN' and sym=x->>'sym') then continue; end if;
  select count(*),coalesce(sum(entry_price*size/greatest(lev,1)),0) into cnt,expo from bot_trades where status='OPEN' and strategy='Q15';
  select count(*) into dayn from bot_trades where strategy='Q15' and opened_at>=((now() at time zone 'UTC')::date)::timestamp at time zone 'UTC';
  if cnt>=maxo or dayn>=20 then exit; end if;
  if x->>'sym' !~ '^[A-Z0-9]{2,16}$' or x->>'sym' = any(array['USDC','FDUSD','TUSD','BUSD','DAI','USDP','USDE','USD1','PYUSD','XAU','XAG','PAXG','XAUT','BTCDOM','DEFI','TSLA','AAPL','NVDA','MSTR','AMZN','GOOGL','META','MSFT','SPY','QQQ']) or x->>'side' not in ('LONG','SHORT') then raise exception 'invalid q15 instrument'; end if;
  m:=x->'q15';
  if m is null or (m->>'stop')::numeric<=0 or (m->>'target')::numeric<=0 then raise exception 'q15 entry without levels'; end if;
  px:=(x->>'price')::numeric;
  if (x->>'quote_ts') is null or px is null or px<=0 or px='NaN'::numeric or abs(extract(epoch from clock_timestamp())*1000-(x->>'quote_ts')::numeric)>20000 then raise exception 'invalid q15 entry quote'; end if;
  if (x->>'side'='LONG' and not ((m->>'stop')::numeric<px and (m->>'target')::numeric>px)) or (x->>'side'='SHORT' and not ((m->>'stop')::numeric>px and (m->>'target')::numeric<px)) then raise exception 'q15 levels on the wrong side'; end if;
  if abs(px-(m->>'stop')::numeric)/px<0.00399 then raise exception 'q15 stop tighter than 0.4%%'; end if;
  if coalesce((m->'gate'->>'pass')::boolean,false) is not true then raise exception 'q15 entry without profit gate'; end if;
  lv:=least(10,greatest(1,coalesce((x->>'lev')::int,1)));
  mg:=least((x->>'notional')::numeric/lv,eq*(per+0.0001),greatest(0,eq*share-expo),greatest(0,cash/(1+lv*0.0005)));
  if mg<5 or mg is null then continue; end if;
  n:=mg*lv;
  insert into bot_trades(sym,side,entry_price,size,fee,trail_sl,hi,lo,status,paper_mode,strategy,lev,risk_usd,partial_done,scalp_meta)
  values(x->>'sym',x->>'side',px,n/px,n*0.0005,(m->>'stop')::numeric,px,px,'OPEN',true,'Q15',lv,n*abs(px-(m->>'stop')::numeric)/px,true,
   jsonb_build_object('q15',m,'source',x->>'source','entry_fee',n*0.0005,'margin',mg,'notional0',n,'experimental',true,'validated',false));
  cash:=cash-mg-n*0.0005; eq:=eq-n*0.0005; opens:=opens+1;
 end loop;

 cfg:=cfg||jsonb_build_object('q15_cycle',coalesce(p_note,'{}')||jsonb_build_object('ts',now(),'opened',opens,'closed',closes,'halted',(a->>'halted')::boolean));
 if p_bar is not null then cfg:=cfg||jsonb_build_object('q15_bar',(extract(epoch from p_bar)*1000)::bigint); end if;
 update bot_state set balance=cash,paper_mode=true,updated_at=now(),bot_params=cfg where id=1;
 return jsonb_build_object('opened',opens,'closed',closes,'updated',upd,'balance',cash,'equity',eq,'halted',(a->>'halted')::boolean,'day_start',(a->>'start')::numeric);
end $function$;
revoke all on function public.q15_commit_cycle(timestamptz,jsonb,jsonb,jsonb,jsonb,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.q15_commit_cycle(timestamptz,jsonb,jsonb,jsonb,jsonb,jsonb,timestamptz) to service_role;

-- EVT / DONCH4H ledger: allow Q15 rows in the shared book (exact in-place edit of the P-AGG2 definition; DONCH4H stays 1x)
do $$
declare d text; old text := $q$strategy not in ('BLADE','DONCH4H','EVT','FAST')$q$; new text := $q$strategy not in ('BLADE','DONCH4H','EVT','FAST','Q15')$q$;
begin
 d := pg_get_functiondef('public.blade_commit_cycle(timestamptz,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text,integer,boolean)'::regprocedure);
 if position(new in d) > 0 then return; end if;
 if position(old in d) = 0 then raise exception 'blade_commit_cycle foreign check not found; refusing to patch'; end if;
 execute replace(d, old, new);
end $$;

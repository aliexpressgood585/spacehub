-- v100.6 (2026-10-03, owner): risk per trade 5% of equity on the 4h ladder -> the risk cap is 5.1% (was 0.6%).
-- Everything else identical to 20261002090000_pro_sleeve.sql.
-- v100.0: PRO sleeve ledger — the owner's 1m scalping specification (shared/pro.ts), alone in the paper book.
-- Isolated margin like FAST: cash posts notional/lev + the taker fee; a close returns margin + P&L floored at 0.
-- Re-checked here: paper only, <= 3 PRO open, one position per coin, lev 1..20, notional <= 5x equity, risk <= 0.6% of
-- equity at the stop, stop/target on the correct side, quotes <= 20 s old, funding within 20% of notional.
-- Stop / best / reached-1R are ratcheted through p_updates (favourable direction only). NOT VALIDATED: v100bt rejected
-- the rule out-of-sample after costs; it runs on paper on the owner's explicit instruction.
create or replace function public.pro_commit_cycle(p_lease timestamptz,p_closes jsonb,p_updates jsonb,p_entries jsonb,p_marks jsonb,p_note jsonb,p_bar bigint default null)
returns jsonb language plpgsql security invoker set search_path = public,pg_temp as $$
declare
 s public.bot_state%rowtype; t public.bot_trades%rowtype; x jsonb; cfg jsonb; m jsonb;
 cash numeric; eq numeric; mg numeric; ret numeric; lv integer; px numeric; n numeric; gross numeric; exitfee numeric; funding numeric; v_pnl numeric;
 st numeric; old numeric; opens integer:=0; closes integer:=0; upd integer:=0; cnt integer;
begin
 select * into strict s from bot_state where id=1 for update;
 if p_lease is null or s.lock_until is distinct from p_lease or clock_timestamp()>p_lease then raise exception 'stale pro lease'; end if;
 if not s.active or not s.paper_mode then raise exception 'pro requires active paper account'; end if;
 cash:=s.balance; cfg:=coalesce(s.bot_params,'{}');
 -- closes
 for x in select value from jsonb_array_elements(coalesce(p_closes,'[]')) loop
  select * into t from bot_trades where id=(x->>'id')::bigint and status='OPEN' and strategy='PRO' for update;
  if not found then continue; end if;
  if t.paper_mode is not true then raise exception 'non-paper position'; end if;
  px:=(x->>'price')::numeric; funding:=coalesce((x->>'funding')::numeric,0);
  if (x->>'quote_ts') is null or px is null or px<=0 or px='NaN'::numeric or abs(extract(epoch from clock_timestamp())*1000-(x->>'quote_ts')::numeric)>20000 then raise exception 'invalid close quote'; end if;
  if abs(funding)>t.entry_price*t.size*0.2 then raise exception 'implausible funding'; end if;
  gross:=(px-t.entry_price)*t.size*(case when t.side='LONG' then 1 else -1 end); exitfee:=px*t.size*0.0005;
  mg:=t.entry_price*t.size/greatest(t.lev,1);
  ret:=greatest(0,mg+gross-exitfee-funding);
  v_pnl:=ret-mg-coalesce(t.fee,0);
  cash:=cash+ret;
  update bot_trades set status=case when v_pnl>=0 then 'TP' else 'SL' end,exit_price=px,pnl=v_pnl,pnl_pct=v_pnl/mg,closed_at=now(),
   scalp_meta=coalesce(scalp_meta,'{}')||jsonb_build_object('exit_reason',x->>'reason','exit_fee',exitfee,'funding_paid',funding,
    'funding_missing',coalesce((x->>'funding_missing')::boolean,false),'gross',gross,'margin',mg,'lev',t.lev,
    'r_mult',case when coalesce(t.risk_usd,0)>0 then v_pnl/t.risk_usd else null end) where id=t.id;
  closes:=closes+1;
 end loop;
 -- stop ratchet (favourable only)
 for x in select value from jsonb_array_elements(coalesce(p_updates,'[]')) loop
  select * into t from bot_trades where id=(x->>'id')::bigint and status='OPEN' and strategy='PRO' for update;
  if not found then continue; end if;
  st:=(x->>'stop')::numeric; old:=(t.scalp_meta->'pro'->>'stop')::numeric;
  if st is null or st<=0 or st='NaN'::numeric then continue; end if;
  if (t.side='LONG' and st<old) or (t.side='SHORT' and st>old) then st:=old; end if;
  m:=jsonb_set(t.scalp_meta,'{pro,stop}',to_jsonb(st));
  m:=jsonb_set(m,'{pro,best}',to_jsonb(coalesce((x->>'best')::numeric,(t.scalp_meta->'pro'->>'best')::numeric,t.entry_price)));
  m:=jsonb_set(m,'{pro,reached_1r}',to_jsonb(coalesce((x->>'reached_1r')::boolean,false) or coalesce((t.scalp_meta->'pro'->>'reached_1r')::boolean,false)));
  update bot_trades set trail_sl=st,scalp_meta=m where id=t.id;
  upd:=upd+1;
 end loop;
 select cash+coalesce(sum(entry_price*size/greatest(lev,1)+((case when side='LONG' then 1 else -1 end)*(coalesce((p_marks->>sym)::numeric,entry_price)-entry_price)*size)),0) into eq from bot_trades where status='OPEN';
 -- entries
 for x in select value from jsonb_array_elements(coalesce(p_entries,'[]')) loop
  if s.hard_halt_at is not null then exit; end if;
  if exists(select 1 from bot_trades where status='OPEN' and sym=x->>'sym') then continue; end if;
  select count(*) into cnt from bot_trades where status='OPEN' and strategy='PRO';
  if cnt>=3 then exit; end if;
  if x->>'sym' !~ '^[A-Z0-9]{2,16}$' or x->>'sym' = any(array['USDC','FDUSD','TUSD','BUSD','DAI','USDP','USDE','USD1','PYUSD','XAU','XAG','PAXG','XAUT','BTCDOM','DEFI','TSLA','AAPL','NVDA','MSTR','AMZN','GOOGL','META','MSFT','SPY','QQQ']) or x->>'side' not in ('LONG','SHORT') then raise exception 'invalid pro instrument'; end if;
  m:=x->'pro';
  if m is null or (m->>'stop')::numeric<=0 or (m->>'target')::numeric<=0 then raise exception 'pro entry without levels'; end if;
  px:=(x->>'price')::numeric;
  if (x->>'quote_ts') is null or px is null or px<=0 or px='NaN'::numeric or abs(extract(epoch from clock_timestamp())*1000-(x->>'quote_ts')::numeric)>20000 then raise exception 'invalid entry quote'; end if;
  if (x->>'side'='LONG' and not ((m->>'stop')::numeric<px and (m->>'target')::numeric>px)) or (x->>'side'='SHORT' and not ((m->>'stop')::numeric>px and (m->>'target')::numeric<px)) then raise exception 'pro levels on the wrong side'; end if;
  lv:=least(20,greatest(1,coalesce((x->>'lev')::int,1)));
  n:=least((x->>'notional')::numeric,eq*5,greatest(0,cash/(1.0/lv+0.0005)));
  if n*abs(px-(m->>'stop')::numeric)/px > eq*0.051 then n:=eq*0.051*px/abs(px-(m->>'stop')::numeric); end if;
  mg:=n/lv;
  if mg<1 or mg is null then continue; end if;
  insert into bot_trades(sym,side,entry_price,size,fee,trail_sl,hi,lo,status,paper_mode,strategy,lev,risk_usd,partial_done,scalp_meta)
  values(x->>'sym',x->>'side',px,n/px,n*0.0005,(m->>'stop')::numeric,px,px,'OPEN',true,'PRO',lv,n*abs(px-(m->>'stop')::numeric)/px,true,
   jsonb_build_object('pro',m,'source',x->>'source','entry_fee',n*0.0005,'margin',mg,'experimental',true,'validated',false));
  cash:=cash-mg-n*0.0005; eq:=eq-n*0.0005; opens:=opens+1;
 end loop;
 cfg:=cfg||jsonb_build_object('pro_cycle',coalesce(p_note,'{}')||jsonb_build_object('ts',now(),'opened',opens,'closed',closes,'ratcheted',upd));
 if p_marks is not null and p_marks<>'{}'::jsonb then cfg:=cfg||jsonb_build_object('pro_marks',jsonb_build_object('ts',now(),'marks',p_marks)); end if;
 if p_bar is not null then
  cfg:=cfg||jsonb_build_object('pro_bar',p_bar);
  insert into bot_equity(ts,equity,balance,exposure)
   select now(),cash+coalesce(sum(entry_price*size/greatest(lev,1)+((case when side='LONG' then 1 else -1 end)*(coalesce((p_marks->>sym)::numeric,entry_price)-entry_price)*size)),0),cash,coalesce(sum(entry_price*size),0)
   from bot_trades where status='OPEN';
 end if;
 update bot_state set balance=cash,paper_mode=true,updated_at=now(),bot_params=cfg where id=1;
 return jsonb_build_object('opened',opens,'closed',closes,'ratcheted',upd,'balance',cash,'equity',eq);
end $$;
revoke all on function public.pro_commit_cycle(timestamptz,jsonb,jsonb,jsonb,jsonb,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.pro_commit_cycle(timestamptz,jsonb,jsonb,jsonb,jsonb,jsonb,bigint) to service_role;

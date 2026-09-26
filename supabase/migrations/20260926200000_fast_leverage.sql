-- v95.2: FAST with ISOLATED LEVERAGE (owner: "most aggressive, 400%/1000% a day, fine if it wipes — it's a demo").
-- Paper only. <= 3 open FAST, <= 20 entries per UTC day, margin per trade <= 34% of equity, lev 1..100 (runner default 50).
-- Cash posts the MARGIN (notional / lev) + the taker fee on the notional; a close returns margin + P&L floored at 0
-- (isolated: a position can never lose more than its margin). Equity everywhere = cash + margin + unrealised.
-- Also: scalp_commit_cycle's equity (which writes the bot_equity snapshots) now counts margin, not notional, for
-- leveraged rows — the v67.2 bug family (every place that turns positions into money must divide by lev).
create or replace function public.fast_commit_cycle(p_lease timestamptz,p_closes jsonb,p_entries jsonb,p_marks jsonb,p_share numeric,p_note jsonb,p_bar timestamptz default null)
returns jsonb language plpgsql security invoker set search_path = public,pg_temp as $$
declare
 s public.bot_state%rowtype; t public.bot_trades%rowtype; x jsonb; cfg jsonb; m jsonb;
 cash numeric; eq numeric; mg numeric; ret numeric; lv integer; px numeric; n numeric; gross numeric; exitfee numeric; funding numeric; v_pnl numeric; expo numeric; book numeric;
 opens integer:=0; closes integer:=0; cnt integer; dayn integer; share numeric:=least(1,greatest(0.05,coalesce(p_share,1)));
begin
 select * into strict s from bot_state where id=1 for update;
 if p_lease is null or s.lock_until is distinct from p_lease or clock_timestamp()>p_lease then raise exception 'stale fast lease'; end if;
 if not s.active or not s.paper_mode then raise exception 'fast requires active paper account'; end if;
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
  ret:=greatest(0,mg+gross-exitfee-funding);            -- isolated margin: a position can never lose more than its margin
  v_pnl:=ret-mg-coalesce(t.fee,0);
  cash:=cash+ret;
  update bot_trades set status=case when v_pnl>=0 then 'TP' else 'SL' end,exit_price=px,pnl=v_pnl,pnl_pct=v_pnl/mg,closed_at=now(),
   scalp_meta=coalesce(scalp_meta,'{}')||jsonb_build_object('exit_reason',x->>'reason','exit_fee',exitfee,'funding_model',funding,'funding_inferred',true,'margin',mg,'lev',t.lev) where id=t.id;
  closes:=closes+1;
 end loop;
 select cash+coalesce(sum(entry_price*size/greatest(lev,1)+((case when side='LONG' then 1 else -1 end)*(coalesce((p_marks->>sym)::numeric,entry_price)-entry_price)*size)),0) into eq from bot_trades where status='OPEN';
 for x in select value from jsonb_array_elements(coalesce(p_entries,'[]')) loop
  if s.hard_halt_at is not null then exit; end if;
  if exists(select 1 from bot_trades where status='OPEN' and sym=x->>'sym') then continue; end if;
  select count(*),coalesce(sum(entry_price*size/greatest(lev,1)),0) into cnt,expo from bot_trades where status='OPEN' and strategy='FAST';
  select count(*) into dayn from bot_trades where strategy='FAST' and opened_at>=((now() at time zone 'UTC')::date)::timestamp at time zone 'UTC';
  select coalesce(sum(entry_price*size),0) into book from bot_trades where status='OPEN';
  if cnt>=3 or dayn>=20 then exit; end if;
  if x->>'sym' !~ '^[A-Z0-9]{2,16}$' or x->>'sym' = any(array['USDC','FDUSD','TUSD','BUSD','DAI','USDP','USDE','USD1','PYUSD','XAU','XAG','PAXG','XAUT','BTCDOM','DEFI','TSLA','AAPL','NVDA','MSTR','AMZN','GOOGL','META','MSFT','SPY','QQQ']) or x->>'side' not in ('LONG','SHORT') then raise exception 'invalid fast instrument'; end if;
  m:=x->'fast';
  if m is null or (m->>'stop')::numeric<=0 or (m->>'target')::numeric<=0 then raise exception 'fast entry without levels'; end if;
  px:=(x->>'price')::numeric;
  if (x->>'quote_ts') is null or px is null or px<=0 or px='NaN'::numeric or abs(extract(epoch from clock_timestamp())*1000-(x->>'quote_ts')::numeric)>20000 then raise exception 'invalid entry quote'; end if;
  if (x->>'side'='LONG' and not ((m->>'stop')::numeric<px and (m->>'target')::numeric>px)) or (x->>'side'='SHORT' and not ((m->>'stop')::numeric>px and (m->>'target')::numeric<px)) then raise exception 'fast levels on the wrong side'; end if;
  lv:=least(100,greatest(1,coalesce((x->>'lev')::int,1)));
  mg:=least((x->>'notional')::numeric/lv,eq*0.34,greatest(0,eq*share-expo),greatest(0,cash/(1+lv*0.0005)));
  if mg<5 or mg is null then continue; end if;
  n:=mg*lv;
  insert into bot_trades(sym,side,entry_price,size,fee,trail_sl,hi,lo,status,paper_mode,strategy,lev,risk_usd,partial_done,scalp_meta)
  values(x->>'sym',x->>'side',px,n/px,n*0.0005,(m->>'stop')::numeric,px,px,'OPEN',true,'FAST',lv,n*abs(px-(m->>'stop')::numeric)/px,true,
   jsonb_build_object('fast',m,'source',x->>'source','entry_fee',n*0.0005,'margin',mg,'experimental',true));
  cash:=cash-mg-n*0.0005; eq:=eq-n*0.0005; opens:=opens+1;
 end loop;
 cfg:=cfg||jsonb_build_object('fast_cycle',coalesce(p_note,'{}')||jsonb_build_object('ts',now(),'opened',opens,'closed',closes));
 if p_bar is not null then cfg:=cfg||jsonb_build_object('fast_bar',(extract(epoch from p_bar)*1000)::bigint); end if;
 update bot_state set balance=cash,paper_mode=true,updated_at=now(),bot_params=cfg where id=1;
 return jsonb_build_object('opened',opens,'closed',closes,'balance',cash,'equity',eq);
end $$;
revoke all on function public.fast_commit_cycle(timestamptz,jsonb,jsonb,jsonb,numeric,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.fast_commit_cycle(timestamptz,jsonb,jsonb,jsonb,numeric,jsonb,timestamptz) to service_role;

-- scalp_commit_cycle: same text, equity term divided by lev (exact in-place replace of the live function)
do $d$ declare f text; begin
  select pg_get_functiondef('public.scalp_commit_cycle(timestamptz,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure) into f;
  if position('entry_price*size/greatest(lev,1)+((case' in f)=0 then
    if position('select cash+coalesce(sum(entry_price*size+((case' in f)=0 then raise exception 'scalp equity expression not found'; end if;
    execute replace(f,'select cash+coalesce(sum(entry_price*size+((case','select cash+coalesce(sum(entry_price*size/greatest(lev,1)+((case');
  end if;
end $d$;

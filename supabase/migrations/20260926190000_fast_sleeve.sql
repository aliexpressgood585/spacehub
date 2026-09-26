-- v95.0: FAST sleeve ledger (owner's all-in intraday rule, see shared/fast.ts). Paper 1x only, crypto only
-- (same symbol check + deny list as the dynamic-universe SCALP ledger), <= 5 open FAST positions, <= 20 FAST entries
-- per UTC day, per trade <= 21% of equity, sleeve <= share of equity, whole book <= 100% gross, never doubles a coin,
-- same lease check. Levels live in scalp_meta.fast; trail_sl mirrors the stop. Fees taker 5 bps per side; funding =
-- the baseline 0.01%/8h model (INFERRED, labelled).
create or replace function public.fast_commit_cycle(p_lease timestamptz,p_closes jsonb,p_entries jsonb,p_marks jsonb,p_share numeric,p_note jsonb,p_bar timestamptz default null)
returns jsonb language plpgsql security invoker set search_path = public,pg_temp as $$
declare
 s public.bot_state%rowtype; t public.bot_trades%rowtype; x jsonb; cfg jsonb; m jsonb;
 cash numeric; eq numeric; px numeric; n numeric; gross numeric; exitfee numeric; funding numeric; v_pnl numeric; expo numeric; book numeric;
 opens integer:=0; closes integer:=0; cnt integer; dayn integer; share numeric:=least(1,greatest(0.05,coalesce(p_share,1)));
begin
 select * into strict s from bot_state where id=1 for update;
 if p_lease is null or s.lock_until is distinct from p_lease or clock_timestamp()>p_lease then raise exception 'stale fast lease'; end if;
 if not s.active or not s.paper_mode then raise exception 'fast requires active paper account'; end if;
 cash:=s.balance; cfg:=coalesce(s.bot_params,'{}');
 for x in select value from jsonb_array_elements(coalesce(p_closes,'[]')) loop
  select * into t from bot_trades where id=(x->>'id')::bigint and status='OPEN' and strategy='FAST' for update;
  if not found then continue; end if;
  if t.paper_mode is not true or t.lev<>1 then raise exception 'non-paper or leveraged position'; end if;
  px:=(x->>'price')::numeric;
  if (x->>'quote_ts') is null or px is null or px<=0 or px='NaN'::numeric or abs(extract(epoch from clock_timestamp())*1000-(x->>'quote_ts')::numeric)>20000 then raise exception 'invalid close quote'; end if;
  gross:=(px-t.entry_price)*t.size*(case when t.side='LONG' then 1 else -1 end); exitfee:=px*t.size*0.0005;
  funding:=t.entry_price*t.size*0.0001*greatest(0,extract(epoch from now()-t.opened_at))/28800*(case when t.side='LONG' then 1 else -1 end);
  v_pnl:=gross-exitfee-funding-coalesce(t.fee,0);
  cash:=cash+t.entry_price*t.size+gross-exitfee-funding;
  update bot_trades set status=case when v_pnl>=0 then 'TP' else 'SL' end,exit_price=px,pnl=v_pnl,pnl_pct=v_pnl/(t.entry_price*t.size),closed_at=now(),
   scalp_meta=coalesce(scalp_meta,'{}')||jsonb_build_object('exit_reason',x->>'reason','exit_fee',exitfee,'funding_model',funding,'funding_inferred',true) where id=t.id;
  closes:=closes+1;
 end loop;
 select cash+coalesce(sum(entry_price*size+((case when side='LONG' then 1 else -1 end)*(coalesce((p_marks->>sym)::numeric,entry_price)-entry_price)*size)),0) into eq from bot_trades where status='OPEN';
 for x in select value from jsonb_array_elements(coalesce(p_entries,'[]')) loop
  if s.hard_halt_at is not null then exit; end if;
  if exists(select 1 from bot_trades where status='OPEN' and sym=x->>'sym') then continue; end if;
  select count(*),coalesce(sum(entry_price*size),0) into cnt,expo from bot_trades where status='OPEN' and strategy='FAST';
  select count(*) into dayn from bot_trades where strategy='FAST' and opened_at>=((now() at time zone 'UTC')::date)::timestamp at time zone 'UTC';
  select coalesce(sum(entry_price*size),0) into book from bot_trades where status='OPEN';
  if cnt>=5 or dayn>=20 then exit; end if;
  if x->>'sym' !~ '^[A-Z0-9]{2,16}$' or x->>'sym' = any(array['USDC','FDUSD','TUSD','BUSD','DAI','USDP','USDE','USD1','PYUSD','XAU','XAG','PAXG','XAUT','BTCDOM','DEFI','TSLA','AAPL','NVDA','MSTR','AMZN','GOOGL','META','MSFT','SPY','QQQ']) or x->>'side' not in ('LONG','SHORT') then raise exception 'invalid fast instrument'; end if;
  m:=x->'fast';
  if m is null or (m->>'stop')::numeric<=0 or (m->>'target')::numeric<=0 then raise exception 'fast entry without levels'; end if;
  px:=(x->>'price')::numeric;
  if (x->>'quote_ts') is null or px is null or px<=0 or px='NaN'::numeric or abs(extract(epoch from clock_timestamp())*1000-(x->>'quote_ts')::numeric)>20000 then raise exception 'invalid entry quote'; end if;
  if (x->>'side'='LONG' and not ((m->>'stop')::numeric<px and (m->>'target')::numeric>px)) or (x->>'side'='SHORT' and not ((m->>'stop')::numeric>px and (m->>'target')::numeric<px)) then raise exception 'fast levels on the wrong side'; end if;
  n:=least((x->>'notional')::numeric,eq*0.21,greatest(0,eq*share-expo),greatest(0,eq-book),greatest(0,cash/1.0005));
  if n<20 or n is null then continue; end if;
  insert into bot_trades(sym,side,entry_price,size,fee,trail_sl,hi,lo,status,paper_mode,strategy,lev,risk_usd,partial_done,scalp_meta)
  values(x->>'sym',x->>'side',px,n/px,n*0.0005,(m->>'stop')::numeric,px,px,'OPEN',true,'FAST',1,n*abs(px-(m->>'stop')::numeric)/px,true,
   jsonb_build_object('fast',m,'source',x->>'source','entry_fee',n*0.0005,'experimental',true));
  cash:=cash-n*1.0005; eq:=eq-n*0.0005; opens:=opens+1;
 end loop;
 cfg:=cfg||jsonb_build_object('fast_cycle',coalesce(p_note,'{}')||jsonb_build_object('ts',now(),'opened',opens,'closed',closes));
 if p_bar is not null then cfg:=cfg||jsonb_build_object('fast_bar',(extract(epoch from p_bar)*1000)::bigint); end if;
 update bot_state set balance=cash,paper_mode=true,updated_at=now(),bot_params=cfg where id=1;
 return jsonb_build_object('opened',opens,'closed',closes,'balance',cash,'equity',eq);
end $$;
revoke all on function public.fast_commit_cycle(timestamptz,jsonb,jsonb,jsonb,numeric,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.fast_commit_cycle(timestamptz,jsonb,jsonb,jsonb,numeric,jsonb,timestamptz) to service_role;

-- v99.0: LIST sleeve ledger — SHORT fresh Binance USDT-M perp listings. Paper 1x only, short only, <= 10 open,
-- per trade <= 11% of equity, sleeve <= 105% of equity, one short per coin ever, same lease check as the other sleeves.
-- Stop +20% / target -30% / 21 days are stored on the row (trail_sl = the stop price). NOT VALIDATED (owner override).
create or replace function public.list_commit_cycle(p_lease timestamptz,p_closes jsonb,p_entries jsonb,p_marks jsonb,p_note jsonb,p_scan boolean default false)
returns jsonb language plpgsql security invoker set search_path = public,pg_temp as $$
declare
 s public.bot_state%rowtype; t public.bot_trades%rowtype; x jsonb; cfg jsonb;
 cash numeric; eq numeric; px numeric; n numeric; gross numeric; exitfee numeric; funding numeric; v_pnl numeric; expo numeric;
 opens integer:=0; closes integer:=0; cnt integer;
begin
 select * into strict s from bot_state where id=1 for update;
 if p_lease is null or s.lock_until is distinct from p_lease or clock_timestamp()>p_lease then raise exception 'stale list lease'; end if;
 if not s.active or not s.paper_mode then raise exception 'list requires active paper account'; end if;
 cash:=s.balance; cfg:=coalesce(s.bot_params,'{}');
 for x in select value from jsonb_array_elements(p_closes) loop
  select * into t from bot_trades where id=(x->>'id')::bigint and status='OPEN' and strategy='LIST' for update;
  if not found then continue; end if;
  if t.paper_mode is not true or t.lev<>1 then raise exception 'non-paper or leveraged position'; end if;
  px:=(x->>'price')::numeric;
  if (x->>'quote_ts') is null or px is null or px<=0 or px='NaN'::numeric or abs(extract(epoch from clock_timestamp())*1000-(x->>'quote_ts')::numeric)>20000 then raise exception 'invalid close quote'; end if;
  gross:=(px-t.entry_price)*t.size*(case when t.side='LONG' then 1 else -1 end); exitfee:=px*t.size*0.0005;
  funding:=t.entry_price*t.size*0.0001*greatest(0,extract(epoch from now()-t.opened_at))/28800*(case when t.side='LONG' then 1 else -1 end);
  v_pnl:=gross-exitfee-funding-coalesce(t.fee,0);
  cash:=cash+t.entry_price*t.size+gross-exitfee-funding;
  update bot_trades set status=case when v_pnl>=0 then 'TP' else 'SL' end,exit_price=px,pnl=v_pnl,pnl_pct=v_pnl/(t.entry_price*t.size),closed_at=now(),
   scalp_meta=coalesce(scalp_meta,'{}')||jsonb_build_object('exit_reason',x->>'reason','exit_fee',exitfee,'funding_model',funding) where id=t.id;
  closes:=closes+1;
 end loop;
 select cash+coalesce(sum(entry_price*size+((case when side='LONG' then 1 else -1 end)*(coalesce((p_marks->>sym)::numeric,entry_price)-entry_price)*size)),0) into eq from bot_trades where status='OPEN';
 for x in select value from jsonb_array_elements(p_entries) loop
  if s.hard_halt_at is not null then exit; end if;
  if exists(select 1 from bot_trades where status='OPEN' and sym=x->>'sym') then continue; end if;
  if exists(select 1 from bot_trades where strategy='LIST' and sym=x->>'sym') then continue; end if;
  select count(*),coalesce(sum(entry_price*size),0) into cnt,expo from bot_trades where status='OPEN' and strategy='LIST';
  if cnt>=10 then exit; end if;
  if x->>'sym' !~ '^[A-Z0-9]{2,16}$' or x->>'sym' = any(array['USDC','FDUSD','TUSD','BUSD','DAI','USDP','USDE','USD1','PYUSD','XAU','XAG','PAXG','XAUT','BTCDOM','DEFI','TSLA','AAPL','NVDA','MSTR','AMZN','GOOGL','META','MSFT','SPY','QQQ']) or x->>'side'<>'SHORT' then raise exception 'invalid list instrument'; end if;
  px:=(x->>'price')::numeric;
  if (x->>'quote_ts') is null or px is null or px<=0 or px='NaN'::numeric or abs(extract(epoch from clock_timestamp())*1000-(x->>'quote_ts')::numeric)>20000 then raise exception 'invalid entry quote'; end if;
  n:=least((x->>'notional')::numeric,eq*0.11,greatest(0,eq*1.05-expo),greatest(0,cash/1.0005));
  if n<20 or n is null then continue; end if;
  insert into bot_trades(sym,side,entry_price,size,fee,trail_sl,hi,lo,status,paper_mode,strategy,lev,risk_usd,partial_done,scalp_meta)
  values(x->>'sym','SHORT',px,n/px,n*0.0005,px*1.20,px,px,'OPEN',true,'LIST',1,n*0.20,true,
   jsonb_build_object('list',true,'source',x->>'source','age_days',(x->>'age_days')::numeric,'quote_vol_24h',(x->>'qv')::numeric,
    'stop_pct',0.20,'target_pct',0.30,'stop_px',px*1.20,'target_px',px*0.70,'deadline',now()+interval '21 days',
    'experimental',true,'validated',false));
  cash:=cash-n*1.0005; eq:=eq-n*0.0005; opens:=opens+1;
 end loop;
 cfg:=cfg||jsonb_build_object('list_cycle',coalesce(p_note,'{}')||jsonb_build_object('ts',now(),'opened',opens,'closed',closes));
 if p_scan then
  cfg:=cfg||jsonb_build_object('list_scan',(extract(epoch from now())*1000)::bigint);
  insert into bot_equity(ts, equity, balance, exposure)
   select now(), eq, cash, coalesce(sum(entry_price*size),0) from bot_trades where status='OPEN';
 end if;
 update bot_state set balance=cash,paper_mode=true,updated_at=now(),bot_params=cfg where id=1;
 return jsonb_build_object('opened',opens,'closed',closes,'balance',cash,'equity',eq);
end $$;
revoke all on function public.list_commit_cycle(timestamptz,jsonb,jsonb,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.list_commit_cycle(timestamptz,jsonb,jsonb,jsonb,jsonb,boolean) to service_role;

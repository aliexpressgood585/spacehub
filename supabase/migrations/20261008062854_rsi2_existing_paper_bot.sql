-- Connect the frozen simulator to the owner's EXISTING paper account, atomically.
-- No HTTP/exchange calls in these functions. This does not alter the frozen signal rules or T0.
create unique index if not exists rsi2_bot_trade_key on public.bot_trades ((scalp_meta->>'rsi2_key'))
  where strategy='RSI2_FORWARD_PAPER';

create or replace function public.rsi2_existing_ledger_guard() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if (select bot_params->>'paper_strategy' from public.bot_state where id=1)='RSI2_FORWARD_20X'
     and coalesce(current_setting('rsi2.forward_writer',true),'')<>'1' then
    raise exception 'Only the frozen paper simulator may write the existing trade ledger';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger rsi2_existing_ledger_guard before insert or update or delete on public.bot_trades
  for each row execute function public.rsi2_existing_ledger_guard();

create or replace function public.rsi2_existing_state_guard() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if old.bot_params->>'paper_strategy'='RSI2_FORWARD_20X'
     and coalesce(current_setting('rsi2.forward_writer',true),'')<>'1'
     and (new.balance is distinct from old.balance or new.bot_params is distinct from old.bot_params
       or new.paper_mode is distinct from old.paper_mode or (new.active and not old.active)) then
    raise exception 'Frozen RSI2 paper account rejects legacy engine/optimizer mutation';
  end if;
  return new;
end $$;
create trigger rsi2_existing_state_guard before update on public.bot_state
  for each row execute function public.rsi2_existing_state_guard();

create or replace function public.rsi2_mirror_existing_trade() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare s public.bot_state; t public.bot_trades; r jsonb; k text; px numeric; qty numeric;
  net_usd numeric; m jsonb; pnl_gross numeric;
begin
  select * into s from public.bot_state where id=1 for update;
  if s.bot_params->>'paper_strategy' is distinct from 'RSI2_FORWARD_20X' then return new; end if;
  if not s.paper_mode or not s.active or s.hard_halt_at is not null then raise exception 'Existing account must be active PAPER'; end if;
  r=new.data; k=new.symbol || ':' || new.entry_ts;
  if new.entry_ts < (s.bot_params->>'rsi2_account_start_ms')::bigint then return new; end if;
  if new.symbol not in ('TRADOORUSDT','MYXUSDT') or new.label<>'SIMULATED_TRADE_ONLY'
     or r->>'leverage'<>'20' or (r->>'side')::int not in (-1,1) then raise exception 'Invalid simulated candidate'; end if;
  px=(r->>'entry')::numeric; qty=5000/px;
  if px<=0 or (r->>'atr')::numeric<=0 then raise exception 'Invalid simulated price/ATR'; end if;
  if abs((r->>'tp')::numeric-(px+(r->>'side')::int*(r->>'atr')::numeric))>0.000000001
     or abs((r->>'sl')::numeric-(px-(r->>'side')::int*2*(r->>'atr')::numeric))>0.000000001 then
    raise exception 'Frozen ATR levels do not match';
  end if;
  perform set_config('rsi2.forward_writer','1',true);
  select * into t from public.bot_trades where strategy='RSI2_FORWARD_PAPER' and scalp_meta->>'rsi2_key'=k for update;
  if not found then
    if exists(select 1 from public.rsi2_forward_journal where symbol=new.symbol and entry_ts=new.entry_ts and data ? 'existing_account_skip') then
      new.data=new.data || '{"existing_account_skip":"previously_skipped"}'; return new;
    end if;
    if (select report->>'qualification' from public.rsi2_forward_runs where symbol=new.symbol)='NOT_QUALIFIED' then
      new.data=new.data || '{"existing_account_skip":"qualification_failed_observation_only"}'; return new;
    end if;
    if s.balance<253 then new.data=new.data || '{"existing_account_skip":"insufficient_paper_cash"}'; return new; end if;
    if exists(select 1 from public.bot_trades where status='OPEN' and sym=replace(new.symbol,'USDT','')) then
      raise exception 'Duplicate open simulated position';
    end if;
    m=jsonb_build_object('rsi2_key',k,'label','SIMULATED_TRADE_ONLY','research_only',true,'qualified',false,
      'exact_contract',new.symbol,'hold_min',160,'target_px',(r->>'tp')::numeric,
      'rsi2',r,'entry_cost',3,'entry_slippage_cost',0.5,'entry_taker_fee',2.5,
      'base_roundtrip_cost',6,'stress_roundtrip_cost',8,'funding_cost',0);
    insert into public.bot_trades(sym,side,entry_price,size,status,paper_mode,strategy,lev,fee,trail_sl,
      risk_usd,hi,lo,opened_at,scalp_meta)
      values(replace(new.symbol,'USDT',''),case when (r->>'side')::int=1 then 'LONG' else 'SHORT' end,
        px,qty,'OPEN',true,'RSI2_FORWARD_PAPER',20,3,(r->>'sl')::numeric,
        2*(r->>'atr')::numeric*qty,px,px,to_timestamp(new.entry_ts/1000.0),m) returning * into t;
    update public.bot_state set balance=balance-253 where id=1;
  end if;
  if new.status='CLOSED_SIMULATED' and t.status='OPEN' then
    if coalesce((r->>'fundingMissing')::boolean,true) then raise exception 'Missing funding prevents account settlement'; end if;
    net_usd=(r->>'net')::numeric*5000;
    pnl_gross=(r->>'side')::int*((r->>'exit')::numeric/px-1);
    if abs((r->>'net')::numeric-(pnl_gross-(r->>'fundingCost')::numeric-0.0012))>0.000000001
       or abs((r->>'stressNet')::numeric-(pnl_gross-(r->>'fundingCost')::numeric-0.0016))>0.000000001 then
      raise exception 'Frozen cost/funding calculation mismatch';
    end if;
    update public.bot_trades set exit_price=(r->>'exit')::numeric,closed_at=to_timestamp((r->>'exitTs')::bigint/1000.0),
      status='CLOSED',pnl=net_usd,pnl_pct=net_usd/250*100,
      scalp_meta=scalp_meta || jsonb_build_object('rsi2',r,'exit_reason',r->>'reason',
        'exit_fee',3,'exit_taker_fee',2.5,'exit_slippage_cost',0.5,'funding_cost',(r->>'fundingCost')::numeric*5000,
        'stress_pnl',(r->>'stressNet')::numeric*5000)
      where id=t.id;
    -- Entry cost was already deducted: margin + full net + entry cost returns to cash.
    update public.bot_state set balance=balance+250+net_usd+3 where id=1;
  end if;
  return new;
end $$;
create trigger rsi2_mirror_existing_trade before insert or update on public.rsi2_forward_journal
  for each row execute function public.rsi2_mirror_existing_trade();

create or replace function public.rsi2_existing_heartbeat() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare s public.bot_state; e numeric; exposure_now numeric; rp jsonb;
begin
  select * into s from public.bot_state where id=1 for update;
  if s.bot_params->>'paper_strategy' is distinct from 'RSI2_FORWARD_20X' then return new; end if;
  if not s.paper_mode or not s.active then return new; end if;
  perform set_config('rsi2.forward_writer','1',true);
  select jsonb_object_agg(symbol,report) into rp from public.rsi2_forward_runs;
  update public.bot_trades t set scalp_meta=t.scalp_meta || jsonb_build_object('funding_cost',coalesce((r.report->>'openFundingCostUsd')::numeric,0))
    from public.rsi2_forward_runs r where t.status='OPEN' and t.strategy='RSI2_FORWARD_PAPER' and r.symbol=t.scalp_meta->>'exact_contract';
  select s.balance+coalesce(sum(t.entry_price*t.size/20+
      (case when t.side='LONG' then 1 else -1 end)*(coalesce((r.state->'five'->'last'->>'c')::numeric,t.entry_price)-t.entry_price)*t.size-3-coalesce((t.scalp_meta->>'funding_cost')::numeric,0)),0),
    coalesce(sum(t.entry_price*t.size),0) into e,exposure_now
    from public.bot_trades t left join public.rsi2_forward_runs r on r.symbol=t.scalp_meta->>'exact_contract'
    where t.status='OPEN' and t.strategy='RSI2_FORWARD_PAPER';
  update public.bot_state set updated_at=now(),lock_until=now()+interval '70 seconds',
    bot_params=bot_params || jsonb_build_object('rsi2_reports',rp,'rsi2_last_cycle',now(),'rsi2_data_status',new.report->>'dataStatus'),
    trade_count=(select count(*) from public.bot_trades where strategy='RSI2_FORWARD_PAPER' and status='CLOSED'),
    overall_wr=(select 100.0*count(*) filter(where pnl>0)/nullif(count(*),0) from public.bot_trades where strategy='RSI2_FORWARD_PAPER' and status='CLOSED')
    where id=1;
  if not exists(select 1 from public.bot_equity where ts>now()-interval '50 seconds') then
    insert into public.bot_equity(ts,equity,balance,exposure) values(now(),e,s.balance,exposure_now);
  end if;
  return new;
end $$;
-- Runs after the checkpoint transaction, including journal inserts, has completed.
create constraint trigger rsi2_existing_heartbeat after update on public.rsi2_forward_runs
  deferrable initially deferred for each row execute function public.rsi2_existing_heartbeat();

revoke all on function public.rsi2_existing_ledger_guard(),public.rsi2_existing_state_guard(),
  public.rsi2_mirror_existing_trade(),public.rsi2_existing_heartbeat() from public,anon,authenticated;

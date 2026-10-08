-- Store win rate as the 0..1 ratio expected by bot_state.overall_wr numeric(5,4).
-- The original 0..100 percentage overflowed as soon as RSI2 had a winning close,
-- rolling back the deferred checkpoint heartbeat.
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
    overall_wr=(select 1.0*count(*) filter(where pnl>0)/nullif(count(*),0) from public.bot_trades where strategy='RSI2_FORWARD_PAPER' and status='CLOSED')
    where id=1;
  if not exists(select 1 from public.bot_equity where ts>now()-interval '50 seconds') then
    insert into public.bot_equity(ts,equity,balance,exposure) values(now(),e,s.balance,exposure_now);
  end if;
  return new;
end $$;

revoke all on function public.rsi2_existing_heartbeat() from public,anon,authenticated;

-- Owner's existing $5,000 PAPER account; no reset, no exchange endpoints.
begin;
select pg_advisory_xact_lock(7151520);
select set_config('rsi2.forward_writer','1',true);
do $$
declare s public.bot_state; observation_job text; trade_job bigint;
begin
  select * into s from public.bot_state where id=1 for update;
  if not s.paper_mode then raise exception 'PAPER account required'; end if;
  if exists(select 1 from public.bot_trades where status='OPEN' and (paper_mode is not true or strategy<>'RSI2_FORWARD_PAPER')) then
    raise exception 'Existing positions need an explicit transition; no forced close';
  end if;
  if not exists(select 1 from public.rsi2_forward_runs where symbol='TRADOORUSDT' and report->>'dataStatus'='OK')
     or not exists(select 1 from public.rsi2_forward_runs where symbol='MYXUSDT' and report->>'dataStatus'='OK') then
    raise exception 'Both exact candidate data feeds must be healthy';
  end if;
  select command into observation_job from cron.job where jobname='rsi2-forward';
  if observation_job is null then raise exception 'Missing authenticated simulator schedule'; end if;
  -- Keep the EXISTING bot scheduler name; replace its handler with the public-data-only simulation engine.
  select jobid into trade_job from cron.job where jobname='trading-bot';
  if trade_job is null then raise exception 'Existing bot scheduler missing'; end if;
  perform cron.alter_job(trade_job,schedule:='* * * * *',command:=observation_job,active:=true);
  perform cron.alter_job(jobid,active:=false) from cron.job where jobname in ('rsi2-forward','trading-optimizer');
  update public.bot_state set active=true,paper_mode=true,updated_at=now(),lock_until=now(),
    bot_params=coalesce(bot_params,'{}') || jsonb_build_object('paper_strategy','RSI2_FORWARD_20X',
      'enabled_sleeves','RSI2_FORWARD_PAPER','leverage',20,'symbols',jsonb_build_array('TRADOORUSDT','MYXUSDT'),
      'manager_state','ACTIVE_FROZEN_FORWARD_PAPER','rsi2_account_start_ms',
        coalesce((bot_params->>'rsi2_account_start_ms')::bigint,(ceil(extract(epoch from now())/300)*300000)::bigint),
      'rsi2_account_activated_at',coalesce(bot_params->>'rsi2_account_activated_at',now()::text),
      'rsi2_balance_at_activation',coalesce((bot_params->>'rsi2_balance_at_activation')::numeric,balance),
      'qualification','INSUFFICIENT_DATA','research_only',true,'fixed_margin_usd',250,
      'roundtrip_cost_pct',0.12,'stress_roundtrip_cost_pct',0.16)
    where id=1;
end $$;
commit;

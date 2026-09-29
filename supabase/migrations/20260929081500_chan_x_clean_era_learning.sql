-- Bind CHAN risk state to the active clean evaluation era.
update public.bot_state
set bot_params = coalesce(bot_params,'{}'::jsonb) ||
  jsonb_build_object(
    'chan_risk_era', bot_params->>'chan_era_id',
    'chan_risk', '{}'::jsonb
  ),
    hard_halt_at = null,
    hard_halt_reason = null,
    updated_at = now()
where id=1;

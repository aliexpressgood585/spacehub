-- Add dynamic parameter storage to bot_state
ALTER TABLE bot_state
  ADD COLUMN IF NOT EXISTS bot_params JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_optimized_at TIMESTAMPTZ;

-- Parameter change history log
CREATE TABLE IF NOT EXISTS bot_params_history (
  id           BIGSERIAL PRIMARY KEY,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  trade_count  INT,
  overall_wr   NUMERIC(5,4),
  overall_pf   NUMERIC(6,3),
  params_before JSONB,
  params_after  JSONB,
  reasoning    TEXT
);

-- Supabase cron job (requires pg_cron + pg_net extensions enabled)
-- Run this manually in the SQL editor after enabling extensions:
--
-- SELECT cron.schedule(
--   'trading-optimizer',
--   '* * * * *',
--   $$SELECT net.http_post(
--       url     := current_setting('app.optimizer_url'),
--       headers := jsonb_build_object('Authorization','Bearer ' || current_setting('app.service_key'))
--   )$$
-- );

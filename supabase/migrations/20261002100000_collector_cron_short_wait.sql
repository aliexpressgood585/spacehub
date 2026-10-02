-- v100.1: the data-collector holds its request ~45 s (Binance liquidation websocket). pg_net sends a batch and waits
-- for it, so every trading-bot call queued behind it: the bot ran only between :45 and :00 of each minute (measured
-- on net._http_response 2026-10-02 09:51-09:54). pg_net now waits only 3 s for the collector; the edge function keeps
-- running and writing (verified: mkt_derivs / mkt_liquidations rows kept arriving). Applied live with cron.alter_job.
select cron.alter_job(5, command := $c$select net.http_post(url:='https://adxgadwghgkwmntsnrar.supabase.co/functions/v1/data-collector', headers:='{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds:=3000)$c$);

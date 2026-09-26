-- v95.3 (owner: "scan every 5 seconds"): the trading-bot cron 10 s -> 5 s. Applied live 2026-09-26 17:45 UTC.
-- Cycles hold a 50 s lease and release it on commit; a call that finds the lease held is skipped, never doubled.
-- FAST entries still need a COMPLETED 5m bar (so 5 s makes entries land ~5 s after the close and checks exits/stops
-- twice as often); it does not create more signals.
select cron.alter_job(1, schedule := '5 seconds');

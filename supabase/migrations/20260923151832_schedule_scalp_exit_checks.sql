-- Applied live 2026-09-23: exit checks every 10 seconds; team meeting/entries are gated to once per minute inside the runner.
select cron.alter_job(job_id := jobid, schedule := '10 seconds') from cron.job where jobname='trading-bot';

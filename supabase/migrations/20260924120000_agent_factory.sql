-- v82.0 agent factory + market-data cache.
-- factory_agents: every genome ever generated (retired rows are kept so a genome is never re-tested).
-- market_cache:   slow-moving public data (daily closes, hourly open interest) refreshed on a timer,
--                 so 40 coins are not re-fetched every minute. Both written only by the bot (service role).
create table if not exists public.factory_agents (
  id text primary key,
  genome jsonb not null,
  stage text not null check (stage in ('trial','oos','live','retired')),
  born timestamptz not null default now(),
  stage_at timestamptz not null default now(),
  h integer,
  note text
);
create index if not exists factory_agents_stage on public.factory_agents(stage);
create table if not exists public.market_cache (
  key text primary key,
  data jsonb not null,
  ts timestamptz not null default now()
);
alter table public.factory_agents enable row level security;
alter table public.market_cache enable row level security;
drop policy if exists factory_agents_anon_read on public.factory_agents;
create policy factory_agents_anon_read on public.factory_agents for select to anon, authenticated using (true);
revoke insert, update, delete on public.factory_agents from anon, authenticated;
revoke all on public.market_cache from anon, authenticated;

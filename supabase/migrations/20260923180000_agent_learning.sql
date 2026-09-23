-- v75.0 shadow learning for the agent swarm.
-- agent_stats: exponentially decayed score per agent (edge in bps vs the next 5 minutes).
-- agent_snapshots: one row per meeting with every agent's vote per coin and the mid price;
-- scored 5 minutes later, pruned after 24h. Written only by the bot (service role).
create table if not exists public.agent_stats (
  agent text primary key,
  n double precision not null default 0,
  s double precision not null default 0,
  s2 double precision not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists public.agent_snapshots (
  id bigserial primary key,
  ts timestamptz not null default now(),
  votes jsonb not null,
  px jsonb not null,
  scored boolean not null default false
);
create index if not exists agent_snapshots_ts on public.agent_snapshots(ts);
alter table public.agent_stats enable row level security;
alter table public.agent_snapshots enable row level security;
drop policy if exists agent_stats_anon_read on public.agent_stats;
create policy agent_stats_anon_read on public.agent_stats for select to anon, authenticated using (true);
revoke insert, update, delete on public.agent_stats from anon, authenticated;
revoke all on public.agent_snapshots from anon, authenticated;

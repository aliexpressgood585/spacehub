-- SpaceHub website tables (separate from the trading-bot migrations in
-- supabase/migrations/, which belong to a different Supabase project).
-- Run this once against the project that backs the website API routes.

-- ---------------------------------------------------------------------------
-- Web Push subscriptions
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  endpoint      text primary key,
  p256dh        text not null,
  auth          text not null,
  lat           double precision,
  lng           double precision,
  city          text,
  tz            text,
  last_sent_at  timestamptz,
  last_pass_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists push_subscriptions_lat_idx
  on public.push_subscriptions (lat)
  where lat is not null;

alter table public.push_subscriptions enable row level security;
-- No anon policies: every read/write goes through the API route using the
-- service key, so browsers can never enumerate other people's endpoints.

-- ---------------------------------------------------------------------------
-- Observation log — cloud copy of what used to live only in localStorage
-- ---------------------------------------------------------------------------
-- Mirrors the Observation shape in src/components/ObservationLog.tsx. `id` is
-- the client-generated id so the same row upserts cleanly from any device.
create table if not exists public.observations (
  id            text not null,
  user_id       uuid not null references auth.users (id) on delete cascade,
  date          date not null,
  object        text not null,
  telescope     text default '',
  eyepiece      text default '',
  magnification integer default 0,
  seeing        smallint default 3,
  transparency  smallint default 3,
  darkness      smallint default 3,
  notes         text default '',
  created_at    bigint not null,
  updated_at    timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists observations_user_idx
  on public.observations (user_id, date desc);

alter table public.observations enable row level security;

drop policy if exists "own observations" on public.observations;
create policy "own observations" on public.observations
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

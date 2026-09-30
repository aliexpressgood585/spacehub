-- CHAN-X shadow variant journal (AI Council rule 7: disagreements go to a bounded PAPER/shadow comparison).
-- Written by chan-runner for S1 ("more exposure + precision"); it NEVER trades and no ledger function reads it.
-- kind 'live'    = a trade the live bot actually took, with S1's verdict on it (outcome = the real bot_trades row)
-- kind 'virtual' = a candidate the live bot refused only for its 8-position cap; S1 (12 positions) would
--                  have taken it if s1_take. Outcome is replayed offline from Binance 1m bars (approximate).
create table if not exists public.chan_shadow (
  id bigserial primary key,
  ts timestamptz not null default now(),
  variant text not null,
  kind text not null check (kind in ('live','virtual')),
  sym text not null,
  side text not null check (side in ('LONG','SHORT')),
  comp text,
  bar timestamptz,
  ref_px double precision,
  stop double precision,
  max_hold_bars integer,
  expires_at timestamptz,
  live_open integer,
  s1_take boolean not null,
  s1_fails text[] not null default '{}',
  s1_missing text[] not null default '{}',
  regime text,
  quality double precision,
  micro double precision,
  taker3m double precision,
  mtf integer,
  funding double precision,
  oi_delta double precision
);
create index if not exists chan_shadow_open_idx on public.chan_shadow (variant, kind, s1_take, expires_at);
alter table public.chan_shadow enable row level security;
drop policy if exists chan_shadow_anon_read on public.chan_shadow;
create policy chan_shadow_anon_read on public.chan_shadow for select to anon using (true);
grant select on public.chan_shadow to anon;

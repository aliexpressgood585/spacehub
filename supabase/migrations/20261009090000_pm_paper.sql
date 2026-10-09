-- Polymarket PAPER desk (owner 2026-10-09): a separate $1,000 demo account on real Polymarket prices.
-- Never trades for real; never touches bot_state / bot_trades. Written only by the pm-bot edge function
-- (service role); anon can read everything for the dashboard (pm.html).
create table if not exists pm_state (
  id int primary key default 1 check (id = 1),
  start_cash numeric not null default 1000,
  cash numeric not null default 1000,
  strategy jsonb not null default '{}'::jsonb,
  last_scan timestamptz,
  last_note jsonb,
  updated_at timestamptz not null default now()
);
insert into pm_state (id) values (1) on conflict (id) do nothing;

create table if not exists pm_trades (
  id bigserial primary key,
  market_id text not null,
  slug text,
  event_slug text,
  question text,
  outcome text,
  token_id text not null,
  end_time timestamptz,
  qty numeric not null,
  entry_px numeric not null,      -- volume-weighted fill over the real ask book
  entry_fee numeric not null default 0,
  cost numeric not null,          -- qty*entry_px + entry_fee
  best_ask numeric,
  model_p numeric,
  opened_at timestamptz not null default now(),
  status text not null default 'OPEN' check (status in ('OPEN','CLOSED')),
  mark_px numeric,
  mark_at timestamptz,
  exit_px numeric,
  exit_fee numeric default 0,
  proceeds numeric,
  pnl numeric,
  reason text,
  closed_at timestamptz,
  meta jsonb
);
create unique index if not exists pm_trades_one_per_token on pm_trades (token_id);
create index if not exists pm_trades_status on pm_trades (status);

create table if not exists pm_equity (
  ts timestamptz primary key default now(),
  equity numeric not null,
  cash numeric not null,
  open_value numeric not null,
  open_count int not null
);

create table if not exists pm_decisions (
  id bigserial primary key,
  ts timestamptz not null default now(),
  market_id text, question text, outcome text, price numeric, decision text, reason text
);
create index if not exists pm_decisions_ts on pm_decisions (ts desc);

alter table pm_state enable row level security;
alter table pm_trades enable row level security;
alter table pm_equity enable row level security;
alter table pm_decisions enable row level security;
drop policy if exists pm_state_read on pm_state;      create policy pm_state_read on pm_state for select to anon using (true);
drop policy if exists pm_trades_read on pm_trades;    create policy pm_trades_read on pm_trades for select to anon using (true);
drop policy if exists pm_equity_read on pm_equity;    create policy pm_equity_read on pm_equity for select to anon using (true);
drop policy if exists pm_decisions_read on pm_decisions; create policy pm_decisions_read on pm_decisions for select to anon using (true);
grant select on pm_state, pm_trades, pm_equity, pm_decisions to anon;

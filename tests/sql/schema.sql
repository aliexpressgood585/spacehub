-- Minimal replica of the live paper-book tables (columns as in production, 2026-10-04) for local ledger tests.
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create table bot_state (id bigint primary key, balance numeric default 10000, active boolean default true, updated_at timestamptz default now(),
  paper_mode boolean default true, bot_params jsonb default '{}'::jsonb, lock_until timestamptz, hard_halt_at timestamptz);
create table bot_trades (id bigserial primary key, sym text, side text, entry_price numeric, exit_price numeric, size numeric, pnl numeric, pnl_pct numeric,
  status text default 'OPEN', trail_sl numeric, fee numeric, hi numeric, lo numeric, opened_at timestamptz default now(), closed_at timestamptz,
  partial_done boolean default false, paper_mode boolean default true, strategy text default 'LEGACY', exit_stage integer default 0, risk_usd numeric,
  legs_banked numeric default 0, lev numeric default 1, scalp_meta jsonb);
create table bot_equity (id bigserial primary key, ts timestamptz default now(), equity numeric, balance numeric, exposure numeric);

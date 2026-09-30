-- Forward-test lab (quant/PREREGISTRATION_H6.md). VIRTUAL positions written by data-collector; nothing trades
-- on them and no ledger function reads them. Kept forever (not in mkt_retention).
create table if not exists public.fwd_trades (
  id bigserial primary key,
  hyp text not null,
  symbol text not null,
  settle_at timestamptz not null,
  side smallint not null check (side in (-1, 1)),
  entry_ts timestamptz not null default now(),
  entry_px double precision not null,
  exit_due timestamptz not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  exit_ts timestamptz,
  exit_px double precision,
  realised double precision,
  net double precision,
  funding_missing boolean,
  unique (hyp, symbol, settle_at)
);
create index if not exists fwd_trades_open_idx on public.fwd_trades (status, exit_due);
alter table public.fwd_trades enable row level security;
drop policy if exists fwd_trades_anon_read on public.fwd_trades;
create policy fwd_trades_anon_read on public.fwd_trades for select to anon using (true);
grant select on public.fwd_trades to anon;

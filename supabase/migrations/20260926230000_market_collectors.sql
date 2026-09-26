-- v96.0 forward data collection (data-collector edge function). Research data only; nothing here is read by trading.
create table if not exists public.mkt_liquidations (
  id bigserial primary key,
  source text not null, symbol text not null, side text not null check (side in ('long','short')),
  px double precision not null, qty double precision not null, usd double precision not null,
  ts timestamptz not null,
  unique (source, symbol, ts, side, px, qty)
);
create index if not exists mkt_liquidations_ts on public.mkt_liquidations (ts);
create index if not exists mkt_liquidations_sym_ts on public.mkt_liquidations (symbol, ts);

create table if not exists public.mkt_derivs (
  ts timestamptz not null, symbol text not null,
  mark double precision, oi_coins double precision, oi_usd double precision, funding double precision, premium double precision,
  primary key (symbol, ts)
);
create index if not exists mkt_derivs_ts on public.mkt_derivs (ts);

create table if not exists public.mkt_options (
  ts timestamptz not null, currency text not null,
  dvol double precision, underlying double precision, expiry text, days double precision,
  atm_iv double precision, iv_put10 double precision, iv_call10 double precision, skew10 double precision,
  put_oi double precision, call_oi double precision, pc_oi double precision, put_vol double precision, call_vol double precision,
  instruments int,
  primary key (currency, ts)
);

create table if not exists public.mkt_news (
  url text primary key, source text not null, title text not null,
  published_at timestamptz not null, seen_at timestamptz not null default now(), coins text[] not null default '{}'
);
create index if not exists mkt_news_pub on public.mkt_news (published_at);

do $$ declare t text; begin
  foreach t in array array['mkt_liquidations','mkt_derivs','mkt_options','mkt_news'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists anon_read on public.%I', t);
    execute format('create policy anon_read on public.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

create or replace function public.mkt_retention(days int default 90) returns void
language sql security definer set search_path = public as $$
  delete from public.mkt_liquidations where ts < now() - make_interval(days => days);
  delete from public.mkt_derivs where ts < now() - make_interval(days => days);
  delete from public.mkt_options where ts < now() - make_interval(days => days);
  delete from public.mkt_news where published_at < now() - make_interval(days => days);
$$;
revoke all on function public.mkt_retention(int) from public, anon, authenticated;

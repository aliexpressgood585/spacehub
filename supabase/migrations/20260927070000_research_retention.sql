-- Pre-registered research (quant/PREREGISTRATION.md) needs these sources for longer than 90 days, and the free DB
-- cannot hold raw liquidations for years (~20 MB/month). Keep exactly what the frozen rules read:
--   mkt_liq_15m   15-minute UTC buckets per coin x liquidated side (usd, n) — kept forever
--   mkt_options   one snapshot per hour (minute 0) kept forever; the 5-minute rows expire after 90 days
--   mkt_news      kept forever (tiny)
--   mkt_derivs    90 days (no hypothesis reads it)
-- Same function signature, so the collector's hourly call is unchanged. Buckets are (re)computed only while all
-- their raw rows still exist (bucket start > now - 89 days), so a partly-deleted bucket is never overwritten.
create table if not exists public.mkt_liq_15m (
  bucket timestamptz not null, source text not null, symbol text not null, side text not null,
  usd double precision not null, n integer not null, primary key (bucket, source, symbol, side));
alter table public.mkt_liq_15m enable row level security;
drop policy if exists mkt_liq_15m_read on public.mkt_liq_15m;
create policy mkt_liq_15m_read on public.mkt_liq_15m for select to anon using (true);

create or replace function public.mkt_retention(days int default 90) returns void
language sql security definer set search_path = public as $$
  insert into public.mkt_liq_15m (bucket, source, symbol, side, usd, n)
    select to_timestamp(floor(extract(epoch from ts) / 900) * 900), source, symbol, side, sum(usd), count(*)
    from public.mkt_liquidations
    where ts > now() - interval '89 days' and ts < to_timestamp(floor(extract(epoch from now()) / 900) * 900)
    group by 1, 2, 3, 4
  on conflict (bucket, source, symbol, side) do update set usd = excluded.usd, n = excluded.n;
  delete from public.mkt_liquidations where ts < now() - $1 * interval '1 day';
  delete from public.mkt_derivs where ts < now() - $1 * interval '1 day';
  delete from public.mkt_options where ts < now() - $1 * interval '1 day' and extract(minute from ts) <> 0;
$$;
revoke all on function public.mkt_retention(int) from public, anon, authenticated;

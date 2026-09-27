-- v97.3 house: the pixel house shows the live CHAN engine only. The per-coin regime statistics the bot computes once per
-- UTC day (market_cache 'chan_daily') and the scanned universe ('universe') become readable with the public anon key.
-- Read-only, two keys only; both are derived from public Binance market data. RLS stays on; no write policy.
alter table public.market_cache enable row level security;
drop policy if exists market_cache_house_read on public.market_cache;
create policy market_cache_house_read on public.market_cache for select to anon, authenticated
  using (key in ('chan_daily', 'universe'));
grant select on public.market_cache to anon, authenticated;   -- the table had no anon grant; RLS above limits it to two keys

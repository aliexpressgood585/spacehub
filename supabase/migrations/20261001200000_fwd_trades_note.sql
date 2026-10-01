-- v99.5: H7 announcement events write a short audit note (detection lag + announcement title) on each virtual row.
alter table public.fwd_trades add column if not exists note text;

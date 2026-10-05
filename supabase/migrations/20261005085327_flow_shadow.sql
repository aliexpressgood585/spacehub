BEGIN;
-- Observation-only tables. No access to bot_state, bot_trades or trading RPCs.
create table if not exists public.flow_lease (id integer primary key check(id=1), until_at timestamptz not null);
insert into public.flow_lease values (1,'epoch') on conflict do nothing;
alter table public.flow_lease enable row level security;
revoke all on public.flow_lease from public,anon,authenticated;
grant all on public.flow_lease to service_role;
create or replace function public.flow_claim() returns timestamptz language plpgsql security invoker set search_path=public as $$
declare lease timestamptz;
begin
 update flow_lease set until_at=now()+interval '90 seconds' where id=1 and until_at<now() returning until_at into lease;
 return lease;
end $$;
revoke all on function public.flow_claim() from public,anon,authenticated;
grant execute on function public.flow_claim() to service_role;
create table if not exists public.flow_shadow (
 symbol text not null, t0 bigint not null, due bigint not null, side integer not null check(side in(-1,1)),
 qty double precision not null check(qty>0), entry_price double precision not null check(entry_price>0),
 funding_at bigint not null, features jsonb not null,
 status text not null check(status in('open','closed','expired')), closed_at timestamptz,
 exit_price double precision, exit_lag_ms bigint, gross_bps double precision,fee_bps double precision,net_bps double precision,
 primary key(symbol,t0), check(status!='closed' or (exit_price>0 and net_bps is not null))
);
create index if not exists flow_shadow_time on public.flow_shadow(t0);
create table if not exists public.flow_sessions (
 started_at timestamptz primary key, finished_at timestamptz not null, ticks integer not null,
 ready_ticks integer not null,frames integer not null,reasons jsonb not null,error text,symbols text[] not null,
 mode text not null check(mode='SHADOW')
);
alter table public.flow_shadow enable row level security;
alter table public.flow_sessions enable row level security;
drop policy if exists flow_read on public.flow_shadow;
create policy flow_read on public.flow_shadow for select to anon,authenticated using(true);
drop policy if exists flow_read on public.flow_sessions;
create policy flow_read on public.flow_sessions for select to anon,authenticated using(true);
revoke all on public.flow_shadow,public.flow_sessions from public,anon,authenticated;
grant select on public.flow_shadow,public.flow_sessions to anon,authenticated;
grant all on public.flow_shadow,public.flow_sessions to service_role;
-- Return immediately using EdgeRuntime.waitUntil; do not stall the pg_net queue.
select cron.schedule('flow-shadow','* * * * *',$c$select net.http_post(url:='https://adxgadwghgkwmntsnrar.supabase.co/functions/v1/flow-shadow',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{}'::jsonb,timeout_milliseconds:=3000)$c$);
select cron.schedule('flow-shadow-retention','17 3 * * *',$c$delete from public.flow_sessions where started_at<now()-interval '30 days'; delete from public.flow_shadow where t0<extract(epoch from now()-interval '90 days')*1000 and status!='open';$c$);

COMMIT;

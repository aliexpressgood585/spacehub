-- Read-only market observations and LOCAL research simulation. No trading ledger access.
create table if not exists public.rsi2_forward_runs (
  symbol text primary key check (symbol in ('TRADOORUSDT','MYXUSDT')),
  active boolean not null default true,
  started_at timestamptz not null,
  spec jsonb not null,
  training jsonb,
  state jsonb,
  report jsonb not null default '{"qualification":"INSUFFICIENT_DATA","qualifiedBotSignals":false}',
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists public.rsi2_forward_journal (
  symbol text not null references public.rsi2_forward_runs(symbol),
  entry_ts bigint not null,
  status text not null check (status in ('OPEN_SIMULATED','CLOSED_SIMULATED')),
  label text not null default 'SIMULATED_TRADE_ONLY' check (label='SIMULATED_TRADE_ONLY'),
  data jsonb not null,
  recorded_at timestamptz not null default now(),
  primary key(symbol,entry_ts)
);
create table if not exists public.rsi2_forward_scheduler (
  id smallint primary key check (id=1), token_hash text not null
);
alter table public.rsi2_forward_runs enable row level security;
alter table public.rsi2_forward_journal enable row level security;
alter table public.rsi2_forward_scheduler enable row level security;
revoke all on public.rsi2_forward_scheduler from anon, authenticated;
grant select on public.rsi2_forward_scheduler to service_role;
grant select,insert,update on public.rsi2_forward_runs,public.rsi2_forward_journal to service_role;
-- Clients see only reports and the explicitly simulated journal, not internal checkpoints.
grant select(symbol,active,started_at,spec,training,report,updated_at) on public.rsi2_forward_runs to anon,authenticated;
grant select on public.rsi2_forward_journal to anon,authenticated;
create policy rsi2_runs_read on public.rsi2_forward_runs for select to anon,authenticated using (true);
create policy rsi2_journal_read on public.rsi2_forward_journal for select to anon,authenticated using (true);

create or replace function public.rsi2_forward_freeze() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.spec is distinct from old.spec or new.started_at is distinct from old.started_at or new.symbol is distinct from old.symbol then
    raise exception 'Frozen forward rules/T0 cannot change: register a new study instead';
  end if;
  return new;
end $$;
create trigger rsi2_forward_freeze before update on public.rsi2_forward_runs for each row execute function public.rsi2_forward_freeze();
revoke all on function public.rsi2_forward_freeze() from public,anon,authenticated;

-- Compare-and-swap makes overlapping minute invocations idempotent and journals atomically.
create or replace function public.rsi2_forward_checkpoint(p_symbol text,p_revision bigint,p_state jsonb,p_report jsonb,p_journal jsonb)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare changed integer; r jsonb; p jsonb;
begin
  update public.rsi2_forward_runs set state=p_state,report=p_report,revision=revision+1,updated_at=now()
    where symbol=p_symbol and revision=p_revision;
  get diagnostics changed=row_count;
  if changed=0 then return false; end if;
  for r in select value from jsonb_array_elements(p_journal) loop
    if r->>'label' <> 'SIMULATED_TRADE_ONLY' or r->>'leverage' <> '20' then raise exception 'simulation label/leverage required'; end if;
    insert into public.rsi2_forward_journal(symbol,entry_ts,status,data)
      values(p_symbol,(r->>'entryTs')::bigint,'CLOSED_SIMULATED',r)
      on conflict(symbol,entry_ts) do update set status=excluded.status,data=excluded.data;
  end loop;
  p=p_state->'position';
  if p is not null and p <> 'null'::jsonb then
    insert into public.rsi2_forward_journal(symbol,entry_ts,status,data)
      values(p_symbol,(p->>'entryTs')::bigint,'OPEN_SIMULATED',p || '{"label":"SIMULATED_TRADE_ONLY","leverage":20,"simulatedMarginUsd":250,"simulatedNotionalUsd":5000}'::jsonb)
      on conflict(symbol,entry_ts) do nothing;
  end if;
  return true;
end $$;
revoke all on function public.rsi2_forward_checkpoint(text,bigint,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.rsi2_forward_checkpoint(text,bigint,jsonb,jsonb,jsonb) to service_role;

insert into public.rsi2_forward_runs(symbol,started_at,spec)
select symbol,to_timestamp(ceil(extract(epoch from now())/300)*300),'{"id":"RSI2_FORWARD_20X_V1","symbols":["TRADOORUSDT","MYXUSDT"],"intervalMs":300000,"trendMs":900000,"warmupBars":1000,"rsiPeriod":2,"rsiLong":5,"rsiShort":95,"emaPeriod":200,"trendFast":50,"adxPeriod":14,"adxMax":25,"volumePeriod":20,"volumeIncludesSignal":true,"atrPeriod":14,"tpAtr":1,"slAtr":2,"maxBars":32,"leverage":20,"initialEquityUsd":5000,"fixedMarginUsd":250,"feeSide":0.0005,"slipSide":0.0001,"costRt":0.0012,"stressRt":0.0016,"minTrades":100,"minNetWinRate":0.61,"oneOpenPerSymbol":true,"indicatorSeed":"EMA:first-close;Wilder:SMA","qualifiedBotSignals":false,"funding":"settled-rate-times-mark-notional"}'::jsonb
from unnest(array['TRADOORUSDT','MYXUSDT']) symbol on conflict(symbol) do nothing;

-- Scheduler token is generated inside the DB, never returned or checked into source.
do $$
declare raw_token text;
begin
  if not exists(select 1 from vault.secrets where name='rsi2_forward_scheduler_token') then
    raw_token=encode(extensions.gen_random_bytes(32),'hex');
    perform vault.create_secret(raw_token,'rsi2_forward_scheduler_token');
    insert into public.rsi2_forward_scheduler values(1,encode(extensions.digest(raw_token,'sha256'),'hex'));
  end if;
end $$;

select cron.schedule('rsi2-forward','* * * * *',$cron$
  select net.http_post(
    url:='https://adxgadwghgkwmntsnrar.supabase.co/functions/v1/rsi2-forward',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name='rsi2_forward_scheduler_token')),
    body:='{}'::jsonb, timeout_milliseconds:=50000);
$cron$);

-- v95.6: FAST fill realism. The runner now resolves exits against Binance aggTrades since the last check (see
-- shared/fast.ts resolveExit) and prices market fills by walking the order book. Two ledger additions:
--  1. fast_trail also persists the last checked trade time (scalp_meta.fast.chk), so the next cycle re-reads exactly
--     the trades it has not seen yet — a late or skipped cycle can no longer miss a stop print.
--  2. fast_commit_cycle stores the fill provenance of each close (trigger trade time/price, detection time, lag, book
--     impact, beyond_book flag) in scalp_meta.fill. Exact in-place edit of the live function text.
create or replace function public.fast_trail(p_lease timestamptz,p_updates jsonb)
returns integer language plpgsql security invoker set search_path = public,pg_temp as $$
declare s public.bot_state%rowtype; t public.bot_trades%rowtype; x jsonb; st numeric; old numeric; n integer:=0; m jsonb;
begin
 select * into strict s from bot_state where id=1;
 if p_lease is null or s.lock_until is distinct from p_lease or clock_timestamp()>p_lease then raise exception 'stale fast lease'; end if;
 for x in select value from jsonb_array_elements(coalesce(p_updates,'[]')) loop
  select * into t from bot_trades where id=(x->>'id')::bigint and status='OPEN' and strategy='FAST' for update;
  if not found then continue; end if;
  st:=(x->>'stop')::numeric; old:=(t.scalp_meta->'fast'->>'stop')::numeric;
  if st is null or st<=0 or st='NaN'::numeric then continue; end if;
  if (t.side='LONG' and st<old) or (t.side='SHORT' and st>old) then st:=old; end if;
  m:=jsonb_set(jsonb_set(t.scalp_meta,'{fast,stop}',to_jsonb(st)),'{fast,best}',to_jsonb(coalesce((x->>'best')::numeric,(t.scalp_meta->'fast'->>'best')::numeric,t.entry_price)));
  if (x->>'chk') is not null and (x->>'chk')::numeric > coalesce((t.scalp_meta->'fast'->>'chk')::numeric,0) then m:=jsonb_set(m,'{fast,chk}',x->'chk'); end if;
  update bot_trades set trail_sl=st, scalp_meta=m where id=t.id;
  n:=n+1;
 end loop;
 return n;
end $$;
revoke all on function public.fast_trail(timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.fast_trail(timestamptz,jsonb) to service_role;

do $d$ declare f text; begin
  select pg_get_functiondef('public.fast_commit_cycle(timestamptz,jsonb,jsonb,jsonb,numeric,jsonb,timestamptz)'::regprocedure) into f;
  if position('''fill'',x->''fill''' in f)=0 then
    if position('jsonb_build_object(''exit_reason'',x->>''reason'',' in f)=0 then raise exception 'fast close meta not found'; end if;
    execute replace(f,'jsonb_build_object(''exit_reason'',x->>''reason'',','jsonb_build_object(''exit_reason'',x->>''reason'',''fill'',coalesce(x->''fill'',''null''::jsonb),');
  end if;
end $d$;

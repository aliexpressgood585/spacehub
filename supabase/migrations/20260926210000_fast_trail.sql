-- v95.5: FAST trailing stop. Ratchets scalp_meta.fast.stop (and trail_sl) behind the best price seen, only ever in the
-- position's favour, under the same run lease. Levels only; no cash moves here.
create or replace function public.fast_trail(p_lease timestamptz,p_updates jsonb)
returns integer language plpgsql security invoker set search_path = public,pg_temp as $$
declare s public.bot_state%rowtype; t public.bot_trades%rowtype; x jsonb; st numeric; old numeric; n integer:=0;
begin
 select * into strict s from bot_state where id=1;
 if p_lease is null or s.lock_until is distinct from p_lease or clock_timestamp()>p_lease then raise exception 'stale fast lease'; end if;
 for x in select value from jsonb_array_elements(coalesce(p_updates,'[]')) loop
  select * into t from bot_trades where id=(x->>'id')::bigint and status='OPEN' and strategy='FAST' for update;
  if not found then continue; end if;
  st:=(x->>'stop')::numeric; old:=(t.scalp_meta->'fast'->>'stop')::numeric;
  if st is null or st<=0 or st='NaN'::numeric then continue; end if;
  if (t.side='LONG' and st<old) or (t.side='SHORT' and st>old) then st:=old; end if;
  update bot_trades set trail_sl=st,
   scalp_meta=jsonb_set(jsonb_set(scalp_meta,'{fast,stop}',to_jsonb(st)),'{fast,best}',to_jsonb(coalesce((x->>'best')::numeric,(t.scalp_meta->'fast'->>'best')::numeric,t.entry_price)))
  where id=t.id;
  n:=n+1;
 end loop;
 return n;
end $$;
revoke all on function public.fast_trail(timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.fast_trail(timestamptz,jsonb) to service_role;

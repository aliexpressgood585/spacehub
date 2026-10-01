-- v99.1: LIST live marks for the house. The runner already quotes every open LIST position each cycle; this stores
-- those marks in bot_params.list_marks (merge, never overwrites other keys) so the page always has the bot's own price.
create or replace function public.list_marks(p_lease timestamptz, p_marks jsonb)
returns void language plpgsql security invoker set search_path = public,pg_temp as $$
begin
 update bot_state set bot_params=coalesce(bot_params,'{}')||jsonb_build_object('list_marks',jsonb_build_object('ts',now(),'marks',coalesce(p_marks,'{}')))
  where id=1 and lock_until is not distinct from p_lease and clock_timestamp()<=p_lease;
end $$;
revoke all on function public.list_marks(timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.list_marks(timestamptz,jsonb) to service_role;

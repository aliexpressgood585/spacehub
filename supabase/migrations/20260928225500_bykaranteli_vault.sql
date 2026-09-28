-- Secure server-only access to an optional ByKaranteli free API key stored in Supabase Vault.
-- The bot remains fully functional without the key; ByKaranteli LiqMap simply abstains.
create or replace function public.chan_get_bykaranteli_key()
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_key text;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'service_role required';
  end if;

  select decrypted_secret
    into v_key
    from vault.decrypted_secrets
   where name = 'BYKARANTELI_API_KEY'
   order by created_at desc
   limit 1;

  return v_key;
end;
$$;

revoke all on function public.chan_get_bykaranteli_key() from public, anon, authenticated;
grant execute on function public.chan_get_bykaranteli_key() to service_role;

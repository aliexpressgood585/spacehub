-- Existing platform default privileges must be revoked before column-only read grants.
revoke all on public.rsi2_forward_runs,public.rsi2_forward_journal from anon,authenticated;
grant select(symbol,active,started_at,spec,training,report,updated_at) on public.rsi2_forward_runs to anon,authenticated;
grant select on public.rsi2_forward_journal to anon,authenticated;

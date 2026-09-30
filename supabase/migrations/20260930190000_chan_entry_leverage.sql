-- v98.1: chan_commit_cycle takes leverage from the entry (x->>'lev'), clamped 1..50, instead of a fixed 50.
-- Applied as an exact in-place replace of `lv := 50;` in the live function text. Default stays 50 when absent.
do $$
declare d text;
begin
  select pg_get_functiondef('chan_commit_cycle(timestamp with time zone,jsonb,jsonb,jsonb,jsonb,jsonb,timestamp with time zone,text)'::regprocedure) into d;
  if position('lv := 50;' in d) = 0 then raise exception 'chan_commit_cycle: fixed leverage line not found'; end if;
  execute replace(d, 'lv := 50;', 'lv := least(50, greatest(1, coalesce(nullif(x->>''lev'','''')::numeric, 50)));');
end $$;

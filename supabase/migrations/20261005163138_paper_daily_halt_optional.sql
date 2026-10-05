-- Owner-requested PAPER-only removal of the daily loss brake. No balance or position reset.
create or replace function public.agg2_day(p_cfg jsonb, p_cash numeric, p_marks jsonb)
returns jsonb language plpgsql stable set search_path = public,pg_temp as $$
declare
 d text:=to_char((now() at time zone 'UTC')::date,'YYYY-MM-DD');
 mk jsonb:=coalesce(p_cfg->'agg_marks','{}'::jsonb)||coalesce(p_marks,'{}'::jsonb);
 eq numeric; st numeric; h boolean; ha text; disabled boolean;
begin
 disabled:=coalesce(p_cfg->'daily_loss_halt_enabled'='false'::jsonb,false)
   and exists(select 1 from bot_state where id=1 and paper_mode=true)
   and not exists(select 1 from bot_trades where status='OPEN' and paper_mode is not true);
 select p_cash+coalesce(sum(greatest(0,entry_price*size/greatest(lev,1)+(case when side='LONG' then 1 else -1 end)*(coalesce((mk->>sym)::numeric,entry_price)-entry_price)*size)),0)
   into eq from bot_trades where status='OPEN';
 if p_cfg->'agg_day'->>'day' is distinct from d then st:=eq; h:=false; ha:=null;
 else st:=coalesce((p_cfg->'agg_day'->>'start')::numeric,eq); h:=coalesce((p_cfg->'agg_day'->>'halted')::boolean,false); ha:=p_cfg->'agg_day'->>'halted_at'; end if;
 if disabled and not coalesce((p_cfg->'agg_day'->>'baseline_pending')::boolean,false) then
   h:=false; ha:=null;
 elsif not disabled and not h and st>0 and eq<=st*0.88 then h:=true; ha:=now()::text; end if;
 return jsonb_build_object('day',d,'start',st,'eq',eq,'halted',h,'halted_at',ha,'dd',case when st>0 then 1-eq/st end,'limit',case when disabled then null else 0.12 end,'loss_halt_enabled',not disabled,'baseline_pending',coalesce((p_cfg->'agg_day'->>'baseline_pending')::boolean,false),'marks',mk);
end $$;
revoke all on function public.agg2_day(jsonb,numeric,jsonb) from public,anon,authenticated;
grant execute on function public.agg2_day(jsonb,numeric,jsonb) to service_role;

-- Preserve any later explicit re-enable during repeated deployments.
update public.bot_state set bot_params=coalesce(bot_params,'{}'::jsonb)||jsonb_build_object('daily_loss_halt_enabled',false)
where id=1 and paper_mode=true and not (coalesce(bot_params,'{}'::jsonb)?'daily_loss_halt_enabled');
-- Clear the existing loss latch immediately, while retaining missing-baseline protection.
update public.bot_state set bot_params=bot_params||jsonb_build_object('agg_day',public.agg2_day(bot_params,balance,'{}'::jsonb)-'marks')
where id=1 and paper_mode=true;

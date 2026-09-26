-- v94.0: LAB sleeve ledger. Trades only specs from the research grid's ELITE pool (plus small EXPLORE trades).
-- Paper 1x only, pinned 40, <= 8 open LAB positions, per trade <= 15% of equity (elite) / 2% (explore), sleeve
-- <= share x 1.1 of equity, whole book <= 95% gross, never doubles a coin held by any sleeve, same lease check.
-- The stop/target/breakeven/trail state lives in scalp_meta.lab (trail_sl mirrors the stop); p_updates ratchets
-- stops in the favourable direction only. Exit fees = taker 5 bps; funding = the baseline 0.01%/8h model
-- (INFERRED, labelled 'funding_model' like the other sleeves).
create or replace function public.lab_commit_cycle(p_lease timestamptz,p_closes jsonb,p_entries jsonb,p_updates jsonb,p_marks jsonb,p_share numeric,p_note jsonb,p_bars jsonb,p_state jsonb)
returns jsonb language plpgsql security invoker set search_path = public,pg_temp as $$
declare
 s public.bot_state%rowtype; t public.bot_trades%rowtype; x jsonb; cfg jsonb; m jsonb;
 cash numeric; eq numeric; px numeric; n numeric; gross numeric; exitfee numeric; funding numeric; v_pnl numeric; expo numeric; book numeric; st numeric;
 opens integer:=0; closes integer:=0; ups integer:=0; cnt integer; share numeric:=least(0.6,greatest(0.05,coalesce(p_share,0.25)));
begin
 select * into strict s from bot_state where id=1 for update;
 if p_lease is null or s.lock_until is distinct from p_lease or clock_timestamp()>p_lease then raise exception 'stale lab lease'; end if;
 if not s.active or not s.paper_mode then raise exception 'lab requires active paper account'; end if;
 cash:=s.balance; cfg:=coalesce(s.bot_params,'{}');
 for x in select value from jsonb_array_elements(coalesce(p_closes,'[]')) loop
  select * into t from bot_trades where id=(x->>'id')::bigint and status='OPEN' and strategy='LAB' for update;
  if not found then continue; end if;
  if t.paper_mode is not true or t.lev<>1 then raise exception 'non-paper or leveraged position'; end if;
  px:=(x->>'price')::numeric;
  if (x->>'quote_ts') is null or px is null or px<=0 or px='NaN'::numeric or abs(extract(epoch from clock_timestamp())*1000-(x->>'quote_ts')::numeric)>20000 then raise exception 'invalid close quote'; end if;
  gross:=(px-t.entry_price)*t.size*(case when t.side='LONG' then 1 else -1 end); exitfee:=px*t.size*0.0005;
  funding:=t.entry_price*t.size*0.0001*greatest(0,extract(epoch from now()-t.opened_at))/28800*(case when t.side='LONG' then 1 else -1 end);
  v_pnl:=gross-exitfee-funding-coalesce(t.fee,0);
  cash:=cash+t.entry_price*t.size+gross-exitfee-funding;
  update bot_trades set status=case when v_pnl>=0 then 'TP' else 'SL' end,exit_price=px,pnl=v_pnl,pnl_pct=v_pnl/(t.entry_price*t.size),closed_at=now(),
   scalp_meta=coalesce(scalp_meta,'{}')||jsonb_build_object('exit_reason',x->>'reason','exit_fee',exitfee,'funding_model',funding,'funding_inferred',true) where id=t.id;
  closes:=closes+1;
 end loop;
 -- stop ratchets (breakeven / trail): only ever in the position's favour
 for x in select value from jsonb_array_elements(coalesce(p_updates,'[]')) loop
  select * into t from bot_trades where id=(x->>'id')::bigint and status='OPEN' and strategy='LAB' for update;
  if not found then continue; end if;
  st:=(x->>'stop')::numeric; m:=coalesce(t.scalp_meta->'lab','{}');
  if st is null or st<=0 then continue; end if;
  if (t.side='LONG' and st<(m->>'stop')::numeric) or (t.side='SHORT' and st>(m->>'stop')::numeric) then st:=(m->>'stop')::numeric; end if;
  update bot_trades set trail_sl=st,scalp_meta=jsonb_set(jsonb_set(scalp_meta,'{lab,stop}',to_jsonb(st)),'{lab,best}',to_jsonb(coalesce((x->>'best')::numeric,(m->>'best')::numeric))) where id=t.id;
  ups:=ups+1;
 end loop;
 select cash+coalesce(sum(entry_price*size+((case when side='LONG' then 1 else -1 end)*(coalesce((p_marks->>sym)::numeric,entry_price)-entry_price)*size)),0) into eq from bot_trades where status='OPEN';
 for x in select value from jsonb_array_elements(coalesce(p_entries,'[]')) loop
  if s.hard_halt_at is not null then exit; end if;
  if exists(select 1 from bot_trades where status='OPEN' and sym=x->>'sym') then continue; end if;
  select count(*),coalesce(sum(entry_price*size),0) into cnt,expo from bot_trades where status='OPEN' and strategy='LAB';
  select coalesce(sum(entry_price*size),0) into book from bot_trades where status='OPEN';
  if cnt>=8 then exit; end if;
  if not (x->>'sym'=any(array['BTC','ETH','SOL','BNB','XRP','DOGE','ADA','AVAX','LINK','DOT','LTC','BCH','NEAR','INJ','SUI','TRX','APT','ARB','OP','ATOM','FIL','UNI','AAVE','ICP','ALGO','SEI','WLD','TIA','RUNE','LDO','CRV','DYDX','GALA','SAND','AXS','IMX','ENA','PEPE','WIF','FET'])) or x->>'side' not in ('LONG','SHORT') then raise exception 'invalid lab instrument'; end if;
  m:=x->'lab';
  if m is null or m->>'spec' is null or m->>'tier' not in ('elite','explore') or (m->>'stop')::numeric<=0 or (m->>'target')::numeric<=0 then raise exception 'lab entry without a spec and levels'; end if;
  px:=(x->>'price')::numeric;
  if (x->>'quote_ts') is null or px is null or px<=0 or px='NaN'::numeric or abs(extract(epoch from clock_timestamp())*1000-(x->>'quote_ts')::numeric)>20000 then raise exception 'invalid entry quote'; end if;
  if (x->>'side'='LONG' and not ((m->>'stop')::numeric<px and (m->>'target')::numeric>px)) or (x->>'side'='SHORT' and not ((m->>'stop')::numeric>px and (m->>'target')::numeric<px)) then raise exception 'lab levels on the wrong side'; end if;
  n:=least((x->>'notional')::numeric,eq*(case when m->>'tier'='elite' then 0.15 else 0.02 end),greatest(0,eq*share*1.1-expo),greatest(0,eq*0.95-book),greatest(0,cash/1.0005));
  if n<20 or n is null then continue; end if;
  insert into bot_trades(sym,side,entry_price,size,fee,trail_sl,hi,lo,status,paper_mode,strategy,lev,risk_usd,partial_done,scalp_meta)
  values(x->>'sym',x->>'side',px,n/px,n*0.0005,(m->>'stop')::numeric,px,px,'OPEN',true,'LAB',1,n*abs(px-(m->>'stop')::numeric)/px,true,
   jsonb_build_object('lab',m,'source',x->>'source','entry_fee',n*0.0005));
  cash:=cash-n*1.0005; eq:=eq-n*0.0005; opens:=opens+1;
 end loop;
 cfg:=cfg||jsonb_build_object('lab_cycle',coalesce(p_note,'{}')||jsonb_build_object('ts',now(),'opened',opens,'closed',closes,'ratchets',ups));
 if p_bars is not null then cfg:=cfg||jsonb_build_object('lab_bars',p_bars); end if;
 if p_state is not null then cfg:=cfg||jsonb_build_object('lab_state',p_state); end if;
 update bot_state set balance=cash,paper_mode=true,updated_at=now(),bot_params=cfg where id=1;
 return jsonb_build_object('opened',opens,'closed',closes,'ratchets',ups,'balance',cash,'equity',eq);
end $$;
revoke all on function public.lab_commit_cycle(timestamptz,jsonb,jsonb,jsonb,jsonb,numeric,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.lab_commit_cycle(timestamptz,jsonb,jsonb,jsonb,jsonb,numeric,jsonb,jsonb,jsonb) to service_role;

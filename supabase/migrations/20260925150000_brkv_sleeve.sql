-- v93.0: BRKV sleeve ledger (owner's rule: breakout with volume, +7% / -4%). Paper 1x only, pinned 40, <= 10 open,
-- per trade <= 10% of equity, sleeve <= share x 1.1 of equity, same lease check as the other sleeves, never doubles a
-- coin held by any sleeve. Stop and target levels are stored on the row (trail_sl = the stop price).
create or replace function public.brkv_commit_cycle(p_lease timestamptz,p_closes jsonb,p_entries jsonb,p_marks jsonb,p_share numeric,p_note jsonb,p_bar timestamptz default null)
returns jsonb language plpgsql security invoker set search_path = public,pg_temp as $$
declare
 s public.bot_state%rowtype; t public.bot_trades%rowtype; x jsonb; cfg jsonb;
 cash numeric; eq numeric; px numeric; n numeric; gross numeric; exitfee numeric; funding numeric; v_pnl numeric; expo numeric;
 opens integer:=0; closes integer:=0; cnt integer; share numeric:=least(0.6,greatest(0.05,coalesce(p_share,0.3)));
begin
 select * into strict s from bot_state where id=1 for update;
 if p_lease is null or s.lock_until is distinct from p_lease or clock_timestamp()>p_lease then raise exception 'stale brkv lease'; end if;
 if not s.active or not s.paper_mode then raise exception 'brkv requires active paper account'; end if;
 cash:=s.balance; cfg:=coalesce(s.bot_params,'{}');
 for x in select value from jsonb_array_elements(p_closes) loop
  select * into t from bot_trades where id=(x->>'id')::bigint and status='OPEN' and strategy='BRKV' for update;
  if not found then continue; end if;
  if t.paper_mode is not true or t.lev<>1 then raise exception 'non-paper or leveraged position'; end if;
  px:=(x->>'price')::numeric;
  if (x->>'quote_ts') is null or px is null or px<=0 or px='NaN'::numeric or abs(extract(epoch from clock_timestamp())*1000-(x->>'quote_ts')::numeric)>20000 then raise exception 'invalid close quote'; end if;
  gross:=(px-t.entry_price)*t.size*(case when t.side='LONG' then 1 else -1 end); exitfee:=px*t.size*0.0005;
  funding:=t.entry_price*t.size*0.0001*greatest(0,extract(epoch from now()-t.opened_at))/28800*(case when t.side='LONG' then 1 else -1 end);
  v_pnl:=gross-exitfee-funding-coalesce(t.fee,0);
  cash:=cash+t.entry_price*t.size+gross-exitfee-funding;
  update bot_trades set status=case when v_pnl>=0 then 'TP' else 'SL' end,exit_price=px,pnl=v_pnl,pnl_pct=v_pnl/(t.entry_price*t.size),closed_at=now(),
   scalp_meta=coalesce(scalp_meta,'{}')||jsonb_build_object('exit_reason',x->>'reason','exit_fee',exitfee,'funding_model',funding) where id=t.id;
  closes:=closes+1;
 end loop;
 select cash+coalesce(sum(entry_price*size+((case when side='LONG' then 1 else -1 end)*(coalesce((p_marks->>sym)::numeric,entry_price)-entry_price)*size)),0) into eq from bot_trades where status='OPEN';
 for x in select value from jsonb_array_elements(p_entries) loop
  if s.hard_halt_at is not null then exit; end if;
  if exists(select 1 from bot_trades where status='OPEN' and sym=x->>'sym') then continue; end if;
  select count(*),coalesce(sum(entry_price*size),0) into cnt,expo from bot_trades where status='OPEN' and strategy='BRKV';
  if cnt>=10 then exit; end if;
  if not (x->>'sym'=any(array['BTC','ETH','SOL','BNB','XRP','DOGE','ADA','AVAX','LINK','DOT','LTC','BCH','NEAR','INJ','SUI','TRX','APT','ARB','OP','ATOM','FIL','UNI','AAVE','ICP','ALGO','SEI','WLD','TIA','RUNE','LDO','CRV','DYDX','GALA','SAND','AXS','IMX','ENA','PEPE','WIF','FET'])) or x->>'side' not in ('LONG','SHORT') then raise exception 'invalid brkv instrument'; end if;
  px:=(x->>'price')::numeric;
  if (x->>'quote_ts') is null or px is null or px<=0 or px='NaN'::numeric or abs(extract(epoch from clock_timestamp())*1000-(x->>'quote_ts')::numeric)>20000 then raise exception 'invalid entry quote'; end if;
  n:=least((x->>'notional')::numeric,eq*0.1,greatest(0,eq*share*1.1-expo),greatest(0,cash/1.0005));
  if n<20 or n is null then continue; end if;
  insert into bot_trades(sym,side,entry_price,size,fee,trail_sl,hi,lo,status,paper_mode,strategy,lev,risk_usd,partial_done,scalp_meta)
  values(x->>'sym',x->>'side',px,n/px,n*0.0005,case when x->>'side'='LONG' then px*0.96 else px*1.04 end,px,px,'OPEN',true,'BRKV',1,n*0.04,true,
   jsonb_build_object('brkv',true,'source',x->>'source','bar',x->>'bar','stop_pct',0.04,'target_pct',0.07,
    'stop_px',case when x->>'side'='LONG' then px*0.96 else px*1.04 end,'target_px',case when x->>'side'='LONG' then px*1.07 else px*0.93 end,
    'deadline',now()+interval '14 days','experimental',true));
  cash:=cash-n*1.0005; eq:=eq-n*0.0005; opens:=opens+1;
 end loop;
 cfg:=cfg||jsonb_build_object('brkv_cycle',coalesce(p_note,'{}')||jsonb_build_object('ts',now(),'opened',opens,'closed',closes));
 if p_bar is not null then cfg:=cfg||jsonb_build_object('brkv_bar',(extract(epoch from p_bar)*1000)::bigint); end if;
 update bot_state set balance=cash,paper_mode=true,updated_at=now(),bot_params=cfg where id=1;
 return jsonb_build_object('opened',opens,'closed',closes,'balance',cash,'equity',eq);
end $$;
revoke all on function public.brkv_commit_cycle(timestamptz,jsonb,jsonb,jsonb,numeric,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.brkv_commit_cycle(timestamptz,jsonb,jsonb,jsonb,numeric,jsonb,timestamptz) to service_role;

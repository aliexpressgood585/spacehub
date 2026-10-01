-- v99.5: EVT sleeve ledger — Binance listing / delisting announcements (H7L240 / H7D240 rules) traded in the paper book,
-- 1x, both sides, <= p_max_open open (capped at 8), <= p_per_trade of equity per position (capped at 34%), hold <= 4h05m,
-- one open position per coin across all sleeves. Books the funding the runner summed from Binance's settled rates
-- (funding_missing flagged when it could not). No stop (the rule as pre-registered). NOT VALIDATED.
create or replace function public.evt_commit_cycle(p_lease timestamptz,p_closes jsonb,p_entries jsonb,p_note jsonb,p_poll bigint default null,
 p_per_trade numeric default 0.25,p_max_open integer default 4)
returns jsonb language plpgsql security invoker set search_path = public,pg_temp as $$
declare
 s public.bot_state%rowtype; t public.bot_trades%rowtype; x jsonb; cfg jsonb;
 cash numeric; eq numeric; px numeric; n numeric; gross numeric; exitfee numeric; funding numeric; v_pnl numeric;
 opens integer:=0; closes integer:=0; cnt integer; pt numeric; mo integer;
begin
 select * into strict s from bot_state where id=1 for update;
 if p_lease is null or s.lock_until is distinct from p_lease or clock_timestamp()>p_lease then raise exception 'stale evt lease'; end if;
 if not s.active or not s.paper_mode then raise exception 'evt requires active paper account'; end if;
 pt:=least(greatest(coalesce(p_per_trade,0.25),0),0.34); mo:=least(greatest(coalesce(p_max_open,4),0),8);
 cash:=s.balance; cfg:=coalesce(s.bot_params,'{}');
 for x in select value from jsonb_array_elements(p_closes) loop
  select * into t from bot_trades where id=(x->>'id')::bigint and status='OPEN' and strategy='EVT' for update;
  if not found then continue; end if;
  if t.paper_mode is not true or t.lev<>1 then raise exception 'non-paper or leveraged position'; end if;
  px:=(x->>'price')::numeric; funding:=coalesce((x->>'funding')::numeric,0);
  if (x->>'quote_ts') is null or px is null or px<=0 or px='NaN'::numeric or abs(extract(epoch from clock_timestamp())*1000-(x->>'quote_ts')::numeric)>20000 then raise exception 'invalid close quote'; end if;
  if abs(funding)>t.entry_price*t.size*0.2 then raise exception 'implausible funding'; end if;
  gross:=(px-t.entry_price)*t.size*(case when t.side='LONG' then 1 else -1 end); exitfee:=px*t.size*0.0005;
  v_pnl:=gross-exitfee-funding-coalesce(t.fee,0);
  cash:=cash+t.entry_price*t.size+gross-exitfee-funding;
  update bot_trades set status=case when v_pnl>=0 then 'TP' else 'SL' end,exit_price=px,pnl=v_pnl,pnl_pct=v_pnl/(t.entry_price*t.size),closed_at=now(),
   scalp_meta=coalesce(scalp_meta,'{}')||jsonb_build_object('exit_reason',x->>'reason','exit_fee',exitfee,'funding_paid',funding,
    'funding_sum',(x->>'funding_sum')::numeric,'funding_missing',coalesce((x->>'funding_missing')::boolean,false),'gross',gross) where id=t.id;
  closes:=closes+1;
 end loop;
 select cash+coalesce(sum(entry_price*size),0) into eq from bot_trades where status='OPEN';
 for x in select value from jsonb_array_elements(p_entries) loop
  if s.hard_halt_at is not null then exit; end if;
  if exists(select 1 from bot_trades where status='OPEN' and sym=x->>'sym') then continue; end if;
  if exists(select 1 from bot_trades where strategy='EVT' and sym=x->>'sym' and scalp_meta->>'announced_at'=x->>'announced_at') then continue; end if;
  select count(*) into cnt from bot_trades where status='OPEN' and strategy='EVT';
  if cnt>=mo then exit; end if;
  if x->>'sym' !~ '^[A-Z0-9]{2,16}$' or x->>'sym' = any(array['USDC','FDUSD','TUSD','BUSD','DAI','USDP','USDE','USD1','PYUSD','XAU','XAG','PAXG','XAUT','BTCDOM','DEFI','TSLA','AAPL','NVDA','MSTR','AMZN','GOOGL','META','MSFT','SPY','QQQ']) or x->>'side' not in ('LONG','SHORT') then raise exception 'invalid evt instrument'; end if;
  px:=(x->>'price')::numeric;
  if (x->>'quote_ts') is null or px is null or px<=0 or px='NaN'::numeric or abs(extract(epoch from clock_timestamp())*1000-(x->>'quote_ts')::numeric)>20000 then raise exception 'invalid entry quote'; end if;
  if (x->>'exit_due')::timestamptz > now()+interval '245 minutes' then raise exception 'evt hold too long'; end if;
  if (x->>'announced_at')::timestamptz < now()-interval '11 minutes' then continue; end if;
  n:=least((x->>'notional')::numeric,eq*pt,greatest(0,cash/1.0005));
  if n<20 or n is null then continue; end if;
  insert into bot_trades(sym,side,entry_price,size,fee,trail_sl,hi,lo,status,paper_mode,strategy,lev,risk_usd,partial_done,scalp_meta)
  values(x->>'sym',x->>'side',px,n/px,n*0.0005,null,px,px,'OPEN',true,'EVT',1,null,true,
   jsonb_build_object('evt',true,'hyp',case when x->>'side'='LONG' then 'H7L240' else 'H7D240' end,'source',x->>'source','symbol',x->>'symbol',
    'announced_at',x->>'announced_at','exit_due',x->>'exit_due','note',left(x->>'note',200),'experimental',true,'validated',false));
  cash:=cash-n*1.0005; eq:=eq-n*0.0005; opens:=opens+1;
 end loop;
 cfg:=cfg||jsonb_build_object('evt_cycle',coalesce(p_note,'{}')||jsonb_build_object('ts',now(),'opened',opens,'closed',closes));
 if p_poll is not null then cfg:=cfg||jsonb_build_object('evt_poll',p_poll); end if;
 update bot_state set balance=cash,paper_mode=true,updated_at=now(),bot_params=cfg where id=1;
 return jsonb_build_object('opened',opens,'closed',closes,'balance',cash,'equity',eq);
end $$;
revoke all on function public.evt_commit_cycle(timestamptz,jsonb,jsonb,jsonb,bigint,numeric,integer) from public,anon,authenticated;
grant execute on function public.evt_commit_cycle(timestamptz,jsonb,jsonb,jsonb,bigint,numeric,integer) to service_role;

-- live marks for the house: EVT joins LIST / FUND
create or replace function public.sleeve_marks(p_lease timestamptz, p_key text, p_marks jsonb)
returns void language plpgsql security invoker set search_path = public,pg_temp as $$
begin
 if p_key not in ('list_marks','fund_marks','evt_marks') then raise exception 'bad marks key'; end if;
 update bot_state set bot_params=coalesce(bot_params,'{}')||jsonb_build_object(p_key,jsonb_build_object('ts',now(),'marks',coalesce(p_marks,'{}')))
  where id=1 and lock_until is not distinct from p_lease and clock_timestamp()<=p_lease;
end $$;
revoke all on function public.sleeve_marks(timestamptz,text,jsonb) from public,anon,authenticated;
grant execute on function public.sleeve_marks(timestamptz,text,jsonb) to service_role;

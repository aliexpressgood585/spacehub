-- All test observations are rolled back. No test/fabricated trades may persist.
begin;
select set_config('rsi2.forward_writer','1',true);
do $$
declare initial_cash numeric; after_cash numeric; r jsonb; entry_ms bigint:=2000000000000; k text;
begin
  select balance into initial_cash from public.bot_state where id=1 for update;
  if exists(select 1 from bot_trades where status='OPEN') then raise exception 'Run fixture only with empty paper book'; end if;
  update bot_state set active=true,paper_mode=true,bot_params=bot_params||'{"paper_strategy":"RSI2_FORWARD_20X","rsi2_account_start_ms":0}' where id=1;
  r=jsonb_build_object('label','SIMULATED_TRADE_ONLY','entry',100,'entryTs',entry_ms,'side',1,'atr',1,'tp',101,'sl',98,'bars',0,'leverage',20);
  insert into rsi2_forward_journal(symbol,entry_ts,status,data) values('MYXUSDT',entry_ms,'OPEN_SIMULATED',r);
  select balance into after_cash from bot_state where id=1;
  if after_cash<>initial_cash-253 then raise exception 'Entry margin/cost mismatch: %',after_cash; end if;
  if not exists(select 1 from bot_trades where strategy='RSI2_FORWARD_PAPER' and lev=20 and paper_mode and size=50 and fee=3 and status='OPEN') then raise exception 'Missing expected simulated position'; end if;
  r=r||jsonb_build_object('exit',101,'exitTs',entry_ms+300000,'net',0.0088,'stressNet',0.0084,'fundingCost',0,'fundingMissing',false,'reason','TARGET_SIMULATED');
  update rsi2_forward_journal set status='CLOSED_SIMULATED',data=r where symbol='MYXUSDT' and entry_ts=entry_ms;
  select balance into after_cash from bot_state where id=1;
  if after_cash<>initial_cash+44 then raise exception 'Close cash mismatch: %',after_cash; end if;
  update rsi2_forward_journal set data=r where symbol='MYXUSDT' and entry_ts=entry_ms;
  if (select balance from bot_state where id=1)<>after_cash then raise exception 'Duplicate close booked twice'; end if;
  if not exists(select 1 from bot_trades where strategy='RSI2_FORWARD_PAPER' and pnl=44 and scalp_meta->>'stress_pnl'='42.0000') then
    if not exists(select 1 from bot_trades where strategy='RSI2_FORWARD_PAPER' and pnl=44 and (scalp_meta->>'stress_pnl')::numeric=42) then raise exception 'Net/stress mismatch'; end if;
  end if;
  perform set_config('rsi2.forward_writer','0',true);
  begin
    insert into bot_trades(sym,side,strategy) values('BTC','LONG','Q15');
    raise exception 'foreign ledger insert accepted';
  exception when others then if SQLERRM not like 'Only the frozen paper%' then raise; end if; end;
  begin
    update bot_state set balance=999999 where id=1;
    raise exception 'foreign balance mutation accepted';
  exception when others then if SQLERRM not like 'Frozen RSI2 paper%' then raise; end if; end;
end $$;

-- Regression: a winning close must store a 0..1 ratio and must not overflow
-- bot_state.overall_wr numeric(5,4) when the deferred heartbeat fires.
select set_config('rsi2.forward_writer','1',true);
update rsi2_forward_runs set report=report where symbol='MYXUSDT';
set constraints all immediate;
do $$
declare expected numeric; actual numeric;
begin
  select 1.0*count(*) filter(where pnl>0)/nullif(count(*),0)
    into expected from bot_trades where strategy='RSI2_FORWARD_PAPER' and status='CLOSED';
  select overall_wr into actual from bot_state where id=1;
  if actual is distinct from expected then
    raise exception 'Heartbeat win-rate mismatch: actual %, expected %',actual,expected;
  end if;
  if actual is not null and (actual<0 or actual>1) then
    raise exception 'Heartbeat win rate must be a 0..1 ratio: %',actual;
  end if;
end $$;
rollback;

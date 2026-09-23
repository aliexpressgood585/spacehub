do $$
declare r jsonb; q numeric:=extract(epoch from clock_timestamp())*1000; l timestamptz; ops jsonb;
begin
 begin
 perform id from public.bot_state where id=1 for update;
 update public.bot_trades set status='TEST_HELD' where status='OPEN';
 update public.bot_state set balance=1000,bot_params='{}',hard_halt_at=null,paper_mode=true,active=true,lock_until=now()+interval '45 seconds' where id=1 returning lock_until into l;
 r:=scalp_commit_cycle(l,'[]','[]',jsonb_build_array(jsonb_build_object('sym','BTC','side','LONG','price',100,'notional',247.5,'stop_pct',0.004,'quote_ts',q),jsonb_build_object('sym','BTC','side','LONG','price',100,'notional',247.5,'stop_pct',0.004,'quote_ts',q)), '[]','{}','{"ok":1,"fail":0}',null);
 if (r->>'opened')::int<>1 then raise exception 'duplicate prevention failed %',r; end if;
 if abs((r->>'balance')::numeric-752.37625)>0.00001 then raise exception 'cash debit wrong %',r; end if;
 begin
  perform scalp_commit_cycle(l,'[]','[]','[]',null,'{}','{}',null);
  raise exception 'replayed lease accepted';
 exception when others then
  if sqlerrm not like '%stale scalp lease%' then raise; end if;
 end;
 update bot_state set lock_until=clock_timestamp()+interval '45 seconds' where id=1 returning lock_until into l;
 select jsonb_agg(jsonb_build_object('id',id,'price',101,'quote_ts',q,'reason','LEDGER_TEST')) into ops from bot_trades where status='OPEN' and strategy='SCALP';
 r:=scalp_commit_cycle(l,ops,'[]','[]',null,'{}','{}',null);
 if (r->>'closed')::int<>1 then raise exception 'close failed'; end if;
 if abs((r->>'balance')::numeric-1000-(select sum(pnl) from bot_trades where scalp_meta->>'exit_reason'='LEDGER_TEST'))>0.00001 then raise exception 'net pnl reconciliation failed'; end if;
 raise exception using errcode='Z0001',message='rollback all test effects';
 exception when sqlstate 'Z0001' then null;
 end;
end $$;

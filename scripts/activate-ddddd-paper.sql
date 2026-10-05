-- Idempotent, atomic, owner-authorized reset; invoked only after the new function is deployed.
DO $reset$
BEGIN
 PERFORM pg_advisory_xact_lock(7151501);
 PERFORM id FROM public.bot_state WHERE id=1 FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.bot_state WHERE id=1 AND paper_mode=true) THEN RAISE EXCEPTION 'paper account required'; END IF;
 IF EXISTS(SELECT 1 FROM public.paper_reset_archive WHERE run_key='DDDDD-20261005') THEN RETURN; END IF;
 -- Revoking the previous lease makes any in-flight old worker fail its next ledger write.
INSERT INTO public.paper_reset_archive SELECT 'DDDDD-20261005','bot_state',to_jsonb(t),now() FROM public.bot_state t WHERE id=1;
INSERT INTO public.paper_reset_archive SELECT 'DDDDD-20261005','bot_trades',to_jsonb(t),now() FROM public.bot_trades t;
INSERT INTO public.paper_reset_archive SELECT 'DDDDD-20261005','bot_trade_snapshots',to_jsonb(t),now() FROM public.bot_trade_snapshots t;
INSERT INTO public.paper_reset_archive SELECT 'DDDDD-20261005','bot_equity',to_jsonb(t),now() FROM public.bot_equity t;
DELETE FROM public.bot_trade_snapshots;
DELETE FROM public.bot_trades;
DELETE FROM public.bot_equity;
UPDATE public.bot_state SET balance=5000,peak_balance=5000,day_start_balance=5000,day_date=(now() at time zone 'UTC')::date,hard_halt_reason=null,active=true,paper_mode=true,hard_halt_at=null,lock_until=null,updated_at=now(),
 trade_count=0,streak=0,overall_wr=0,overall_pf=1,
 bot_params=jsonb_build_object('paper_strategy','DDDDD','daily_loss_halt_enabled',false,'reset_at',now(),'initial_balance',5000),coin_weights='{}'::jsonb
WHERE id=1;
INSERT INTO public.bot_equity(equity,balance,exposure) VALUES(5000,5000,0);

END $reset$;

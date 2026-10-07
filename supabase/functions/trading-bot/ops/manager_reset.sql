-- P-MANAGER-RESET-20261007. PAPER ONLY. Execute only after independent council review.
-- Administrative reset, not a trading exit: archived OPEN rows retain OPEN status.
BEGIN;
SET LOCAL lock_timeout = '8s';
SELECT pg_advisory_xact_lock(7151591);
DO $reset$
DECLARE
  k constant text := 'MANAGER-RESET-20261007';
  src text;
  mismatch boolean;
  manifest jsonb := '{}'::jsonb;
  cnt bigint;
  old_params jsonb;
BEGIN
  PERFORM id FROM public.bot_state WHERE id=1 FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.bot_state WHERE id=1 AND paper_mode IS TRUE) THEN
    RAISE EXCEPTION 'PAPER account required';
  END IF;
  IF EXISTS (SELECT 1 FROM public.paper_reset_archive WHERE run_key=k AND source='reset_manifest') THEN
    RETURN; -- Already applied: never reset a second time.
  END IF;
  IF EXISTS (SELECT 1 FROM public.paper_reset_archive WHERE run_key=k) THEN
    RAISE EXCEPTION 'Unexpected partial archive';
  END IF;
  LOCK TABLE public.bot_trades,public.bot_trade_snapshots,public.bot_equity IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM public.bot_trades WHERE paper_mode IS NOT TRUE) THEN
    RAISE EXCEPTION 'Non-PAPER trade in reset scope';
  END IF;
  SELECT bot_params INTO old_params FROM public.bot_state WHERE id=1;
  FOREACH src IN ARRAY ARRAY['bot_state','bot_trades','bot_trade_snapshots','bot_equity'] LOOP
    EXECUTE format('INSERT INTO public.paper_reset_archive(run_key,source,payload,archived_at) SELECT $1,$2,to_jsonb(t),now() FROM public.%I t',src) USING k,src;
    EXECUTE format('SELECT count(*) FROM public.%I',src) INTO cnt;
    manifest := manifest || jsonb_build_object(src,cnt);
    EXECUTE format('SELECT EXISTS ((SELECT to_jsonb(t) FROM public.%I t EXCEPT ALL SELECT payload FROM public.paper_reset_archive WHERE run_key=$1 AND source=$2) UNION ALL (SELECT payload FROM public.paper_reset_archive WHERE run_key=$1 AND source=$2 EXCEPT ALL SELECT to_jsonb(t) FROM public.%I t))',src,src)
      INTO mismatch USING k,src;
    IF mismatch THEN RAISE EXCEPTION 'Archive content mismatch for %',src; END IF;
  END LOOP;
  DELETE FROM public.bot_trade_snapshots;
  DELETE FROM public.bot_trades;
  DELETE FROM public.bot_equity;
  UPDATE public.bot_state SET
    balance=5000,peak_balance=5000,day_start_balance=5000,
    day_date=(now() AT TIME ZONE 'UTC')::date,
    active=false,paper_mode=true,lock_until=null,
    hard_halt_reason=null,hard_halt_at=null,
    trade_count=0,streak=0,overall_wr=0,overall_pf=1,coin_weights='{}'::jsonb,
    bot_params=jsonb_build_object('initial_balance',5000,'reset_at',now(),
      'manager_state','RESEARCH_ONLY_PENDING_EVIDENCE','manager_reset_key',k,
      'daily_loss_halt_enabled',true,'previous_paper_strategy',old_params->>'paper_strategy'),
    updated_at=now()
  WHERE id=1;
  INSERT INTO public.bot_equity(equity,balance,exposure) VALUES(5000,5000,0);
  INSERT INTO public.paper_reset_archive(run_key,source,payload,archived_at)
    VALUES(k,'reset_manifest',manifest || jsonb_build_object('reason','Owner requested new PAPER era; no strategy has qualified for promotion','open_positions','Archived as OPEN; administrative reset, no fabricated fills or PnL','post_balance',5000,'post_active',false),now());
  IF NOT EXISTS(SELECT 1 FROM public.bot_state WHERE id=1 AND balance=5000 AND active=false AND paper_mode=true AND lock_until IS NULL)
     OR EXISTS(SELECT 1 FROM public.bot_trades) THEN RAISE EXCEPTION 'Post-reset invariant failed'; END IF;
END $reset$;
COMMIT;

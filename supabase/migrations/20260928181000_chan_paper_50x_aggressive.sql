-- CHAN aggressive paper runtime: fixed 50x isolated leverage, no open-count/daily/streak stop,
-- and up to 2% wallet equity risk at the mandatory stop. PAPER ONLY.
-- Signal gates, exchange-book checks, stops and liquidation handling remain unchanged.

CREATE OR REPLACE FUNCTION public.chan_commit_cycle(p_lease timestamp with time zone, p_closes jsonb, p_entries jsonb, p_marks jsonb, p_updates jsonb, p_note jsonb, p_bar timestamp with time zone DEFAULT NULL::timestamp with time zone, p_halt text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 s public.bot_state%rowtype; t public.bot_trades%rowtype; x jsonb; cfg jsonb; m jsonb;
 cash numeric; eq numeric; mg numeric; ret numeric; lv numeric; px numeric; n numeric; gross numeric; exitfee numeric; funding numeric; v_pnl numeric;
 st numeric; risk numeric; cnt integer; open_notional numeric; opens integer := 0; closes integer := 0; halted boolean;
 wallets jsonb; bucket text; w jsonb; wallet_eq numeric; wallet_notional numeric; wallet_cash numeric;
begin
 select * into strict s from bot_state where id = 1 for update;
 if p_lease is null or s.lock_until is distinct from p_lease or clock_timestamp() > p_lease then raise exception 'stale chan lease'; end if;
 if not s.active or not s.paper_mode then raise exception 'chan requires an active paper account'; end if;
 cash := s.balance; cfg := coalesce(s.bot_params, '{}');
 wallets := cfg->'chan_split'->'wallets';
 if wallets is null then raise exception 'CHAN split wallets not initialized'; end if;
 for x in select value from jsonb_array_elements(coalesce(p_closes, '[]')) loop
  select * into t from bot_trades where id = (x->>'id')::bigint and status = 'OPEN' and strategy = 'CHAN' for update;
  if not found then continue; end if;
  if t.paper_mode is not true then raise exception 'non-paper position'; end if;
  px := (x->>'price')::numeric;
  if (x->>'quote_ts') is null or px is null or px <= 0 or px = 'NaN'::numeric or abs(extract(epoch from clock_timestamp()) * 1000 - (x->>'quote_ts')::numeric) > 20000 then raise exception 'invalid close quote'; end if;
  gross := (px - t.entry_price) * t.size * (case when t.side = 'LONG' then 1 else -1 end); exitfee := px * t.size * 0.0005;
  if jsonb_typeof(x->'funding'->'amount') = 'number' then
   funding := (x->'funding'->>'amount')::numeric;
  else
   funding := t.entry_price * t.size * 0.0001 * greatest(0, extract(epoch from now() - t.opened_at)) / 28800 * (case when t.side = 'LONG' then 1 else -1 end);
  end if;
  mg := t.entry_price * t.size / greatest(t.lev, 1);
  ret := greatest(0, mg + gross - exitfee - funding);
  v_pnl := ret - mg - coalesce(t.fee, 0);
  cash := cash + ret;
  bucket := case when t.scalp_meta->'chan'->>'comp' = 'RG_TREND_PULLBACK' then '2' else '1' end;
  w := wallets->bucket;
  w := w || jsonb_build_object('cash', (w->>'cash')::numeric + ret, 'realised', (w->>'realised')::numeric + v_pnl,
   'fees', (w->>'fees')::numeric + exitfee, 'funding', (w->>'funding')::numeric + funding,
   'closed', (w->>'closed')::int + 1, 'wins', (w->>'wins')::int + case when v_pnl > 0 then 1 else 0 end);
  wallets := jsonb_set(wallets, array[bucket], w);
  update bot_trades set status = case when v_pnl >= 0 then 'TP' else 'SL' end, exit_price = px, pnl = v_pnl, pnl_pct = v_pnl / mg, closed_at = now(),
   scalp_meta = coalesce(scalp_meta, '{}') || jsonb_build_object('exit_reason', x->>'reason', 'fill', coalesce(x->'fill', 'null'::jsonb), 'exit_fee', exitfee,
     'funding_model', funding, 'funding_inferred', jsonb_typeof(x->'funding'->'amount') is distinct from 'number',
     'funding_missing', jsonb_typeof(x->'funding'->'amount') is distinct from 'number' or coalesce((x->'funding'->>'complete')::boolean, false) = false,
     'funding', coalesce(x->'funding', 'null'::jsonb), 'margin', mg, 'lev', t.lev, 'r_multiple', case when coalesce(t.risk_usd, 0) > 0 then v_pnl / t.risk_usd end)
  where id = t.id;
  closes := closes + 1;
 end loop;
 for x in select value from jsonb_array_elements(coalesce(p_updates, '[]')) loop
  update bot_trades set scalp_meta = jsonb_set(scalp_meta, '{chan,chk}', x->'chk')
   where id = (x->>'id')::bigint and status = 'OPEN' and strategy = 'CHAN' and (x->>'chk')::numeric > coalesce((scalp_meta->'chan'->>'chk')::numeric, 0);
 end loop;
 if p_halt is not null and s.hard_halt_at is null then
  update bot_state set hard_halt_at = now() where id = 1;
  s.hard_halt_at := now();
 end if;
 halted := s.hard_halt_at is not null;
 select cash + coalesce(sum(entry_price * size / greatest(lev, 1) + ((case when side = 'LONG' then 1 else -1 end) * (coalesce((p_marks->>sym)::numeric, entry_price) - entry_price) * size)), 0)
  into eq from bot_trades where status = 'OPEN';
 for x in select value from jsonb_array_elements(coalesce(p_entries, '[]')) loop
  if halted then exit; end if;
  if x->>'sym' !~ '^[A-Z0-9]{2,16}$' or x->>'sym' = any(array['USDC','FDUSD','TUSD','BUSD','DAI','USDP','USDE','USD1','PYUSD','XAU','XAG','PAXG','XAUT','BTCDOM','DEFI','TSLA','AAPL','NVDA','MSTR','AMZN','GOOGL','META','MSFT','SPY','QQQ','COIN','HOOD','CRCL'])
     or x->>'side' not in ('LONG','SHORT') then raise exception 'invalid chan instrument'; end if;
  bucket := case when x->'chan'->>'comp' = 'RG_TREND_PULLBACK' then '2' else '1' end;
  if coalesce(x->'chan'->>'comp','') not in ('RG_MR','RG_MOM','RG_TREND_PULLBACK') then raise exception 'unknown CHAN component'; end if;
  if exists (select 1 from bot_trades where status = 'OPEN' and sym = x->>'sym' and
    (case when scalp_meta->'chan'->>'comp' = 'RG_TREND_PULLBACK' then '2' else '1' end) = bucket) then continue; end if;
  select count(*), coalesce(sum(entry_price * size), 0) into cnt, open_notional from bot_trades where status = 'OPEN';
  m := x->'chan';
  w := wallets->bucket; wallet_cash := (w->>'cash')::numeric;
  select wallet_cash + coalesce(sum(entry_price*size/greatest(lev,1) +
    (case when side='LONG' then 1 else -1 end)*(coalesce((p_marks->>sym)::numeric,entry_price)-entry_price)*size),0),
    coalesce(sum(entry_price*size),0) into wallet_eq, wallet_notional
   from bot_trades where status='OPEN' and strategy='CHAN' and
    (case when scalp_meta->'chan'->>'comp'='RG_TREND_PULLBACK' then '2' else '1' end)=bucket;
  px := (x->>'price')::numeric; st := (m->>'stop')::numeric; lv := 50;
  if m is null or st is null or st <= 0 or st = 'NaN'::numeric then raise exception 'chan entry without a stop'; end if;
  if (x->>'quote_ts') is null or px is null or px <= 0 or px = 'NaN'::numeric or abs(extract(epoch from clock_timestamp()) * 1000 - (x->>'quote_ts')::numeric) > 20000 then raise exception 'invalid entry quote'; end if;
  if (x->>'side' = 'LONG' and st >= px) or (x->>'side' = 'SHORT' and st <= px) then raise exception 'chan stop on the wrong side'; end if;
  n := (x->>'notional')::numeric;
  n := least(n, greatest(0, 50 * eq - open_notional), greatest(0, 50 * wallet_eq - wallet_notional));
  risk := n * abs(px - st) / px;
  if risk > 0.0201 * wallet_eq then n := n * (0.02 * wallet_eq / risk); risk := n * abs(px - st) / px; end if;
  mg := n / lv;
  if mg + n * 0.0005 > least(cash, wallet_cash) then n := greatest(0,least(cash, wallet_cash)) / (1 / lv + 0.0005); mg := n / lv; risk := n * abs(px - st) / px; end if;
  if mg < 5 or n is null then continue; end if;
  insert into bot_trades(sym, side, entry_price, size, fee, trail_sl, hi, lo, status, paper_mode, strategy, lev, risk_usd, partial_done, scalp_meta)
  values (x->>'sym', x->>'side', px, n / px, n * 0.0005, st, px, px, 'OPEN', true, 'CHAN', lv, risk, true,
   jsonb_build_object('chan', m || jsonb_build_object('sleeve', bucket, 'risk_usd', risk, 'risk_frac', risk/nullif(wallet_eq,0), 'equity', wallet_eq), 'source', x->>'source', 'entry_fee', n * 0.0005, 'margin', mg, 'experimental', true, 'validated', false));
  cash := cash - mg - n * 0.0005; eq := eq - n * 0.0005; opens := opens + 1;
  wallets := jsonb_set(wallets, array[bucket], w || jsonb_build_object('cash', wallet_cash-mg-n*0.0005, 'fees', (w->>'fees')::numeric+n*0.0005));
 end loop;
 for bucket in select unnest(array['1','2']) loop
  w := wallets->bucket;
  select (w->>'cash')::numeric + coalesce(sum(entry_price*size/greatest(lev,1) +
    (case when side='LONG' then 1 else -1 end)*(coalesce((p_marks->>sym)::numeric,entry_price)-entry_price)*size),0)
   into wallet_eq from bot_trades where status='OPEN' and strategy='CHAN' and
   (case when scalp_meta->'chan'->>'comp'='RG_TREND_PULLBACK' then '2' else '1' end)=bucket;
  w := w || jsonb_build_object('equity',wallet_eq,'peak',greatest((w->>'peak')::numeric,wallet_eq),
    'max_dd',greatest((w->>'max_dd')::numeric,1-wallet_eq/nullif(greatest((w->>'peak')::numeric,wallet_eq),0)));
  wallets := jsonb_set(wallets,array[bucket],w);
 end loop;
 if abs(cash-(wallets->'1'->>'cash')::numeric-(wallets->'2'->>'cash')::numeric)>0.000001 then raise exception 'split cash mismatch'; end if;
 cfg := jsonb_set(cfg,'{chan_split,wallets}',wallets);
 cfg := cfg || jsonb_build_object('chan_cycle', coalesce(p_note, '{}') - 'risk_state' - 'scan' || jsonb_build_object('ts', now(), 'opened', opens, 'closed', closes));
 if p_note ? 'risk_state' then cfg := cfg || jsonb_build_object('chan_risk', p_note->'risk_state'); end if;
 if p_note ? 'scan' then cfg := cfg || jsonb_build_object('chan_scan', p_note->'scan'); end if;
 if p_bar is not null then
  cfg := cfg || jsonb_build_object('chan_bar', (extract(epoch from p_bar) * 1000)::bigint);
  insert into bot_equity(ts, equity, balance, exposure)
   select now(), eq, cash, coalesce(sum(entry_price * size), 0) from bot_trades where status = 'OPEN';
 end if;
 update bot_state set balance = cash, paper_mode = true, updated_at = now(), bot_params = cfg where id = 1;
 return jsonb_build_object('opened', opens, 'closed', closes, 'balance', cash, 'equity', eq, 'halted', halted);
end $function$;

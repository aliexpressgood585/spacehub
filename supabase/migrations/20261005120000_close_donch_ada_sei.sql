-- Owner 2026-10-05: close DONCH4H ADA+SEI paper rows (interfering with Q15@25x book).
-- Flat exit at entry; return isolated margin to cash; fee already deducted at open.

do $close$
declare
  r record;
  cash numeric;
  mg numeric;
begin
  select balance into cash from bot_state where id = 1 for update;
  if cash is null then
    raise exception 'bot_state missing';
  end if;

  for r in
    select id, sym, entry_price, size, lev, fee
    from bot_trades
    where status = 'OPEN'
      and strategy = 'DONCH4H'
      and sym in ('ADA', 'SEI')
      and paper_mode is true
  loop
    mg := r.entry_price * r.size / greatest(r.lev, 1);
    update bot_trades
      set status = 'MANUAL',
          exit_price = r.entry_price,
          pnl = -coalesce(r.fee, 0),
          pnl_pct = case when mg > 0 then -coalesce(r.fee, 0) / mg else 0 end,
          closed_at = now(),
          scalp_meta = coalesce(scalp_meta, '{}'::jsonb) || jsonb_build_object(
            'exit_reason', 'owner_close_interfering_donch',
            'closed_at', now()
          )
    where id = r.id and status = 'OPEN';
    cash := cash + mg;
  end loop;

  update bot_state
    set balance = cash,
        paper_mode = true,
        updated_at = now()
  where id = 1;
end;
$close$;

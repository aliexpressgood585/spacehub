-- Allow Q15 positions at up to 25x so DONCH/EVT runners stop rejecting the book
-- Minimal guard-only note: full blade_commit_cycle body restored from q15_sleeve with lev>25 for Q15/EVT.

do $fix$
begin
  -- force deploy path to re-apply via build-ledger-payload; body is in companion below
  null;
end $fix$;

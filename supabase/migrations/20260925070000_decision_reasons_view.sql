-- v89.0: "Top Rejection Reasons" for the dashboard — counts per reason over the last 1h / 6h / 24h.
-- security_invoker: the view runs with the caller's rights, so trade_decisions' RLS (anon read) still governs it.
create or replace view public.trade_decision_reasons with (security_invoker = on) as
select reason,
       count(*) filter (where ts > now() - interval '1 hour')  as h1,
       count(*) filter (where ts > now() - interval '6 hours') as h6,
       count(*)                                                as h24
from public.trade_decisions
where ts > now() - interval '24 hours'
group by reason;
grant select on public.trade_decision_reasons to anon, authenticated;

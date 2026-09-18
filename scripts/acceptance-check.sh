#!/usr/bin/env bash
# v58.0 acceptance checks — invariants that must hold before any deploy.
# Written to FAIL LOUDLY and to be correct about it: the first draft of this
# script reported two false failures (it grepped a field name that survived only
# in a comment, and piped grep into head so the pipeline exit status came from
# head and was always 0). A check that cries wolf gets ignored, which is worse
# than no check.
set -u
fail=0
ok(){ printf '  PASS  %s\n' "$1"; }
no(){ printf '  FAIL  %s\n' "$1"; fail=1; }
B=supabase/functions

echo "── 1. engines ───────────────────────────────────────────────"
grep -q "LEGACY 5m ENGINE — HARD STOP" $B/trading-bot/index.ts \
  && ok "legacy 5m engine hard-stopped" || no "legacy stop missing"
# every bot_trades insert must name a strategy
ins=$(grep -c "from('bot_trades').insert" $B/trading-bot/index.ts)
tag=$(grep -A8 "from('bot_trades').insert" $B/trading-bot/index.ts | grep -c "strategy:")
[ "$ins" -eq "$tag" ] && ok "all $ins bot_trades inserts tag a strategy" \
  || no "$ins inserts but only $tag tagged"

echo "── 2. single writer for bot_state ───────────────────────────"
w=$(grep -rl "from('bot_state').update" $B/*/index.ts | grep -v reset-account | tr '\n' ' ' | xargs)
[ "$w" = "$B/trading-bot/index.ts" ] && ok "trading-bot is the only writer" || no "extra writers: $w"
# a real write, not the word in a comment
if grep -vE '^\s*(//|\*|/\*)' $B/portfolio-rebalancer/index.ts | grep -q "rebalanced_at"; then
  no "rebalancer still writes rebalanced_at"; else ok "rebalanced_at has one owner"; fi
if grep -vE '^\s*(//|\*|/\*)' $B/market-regime-detector/index.ts | grep -q "bot_state"; then
  no "regime detector still writes bot_state"; else ok "market_regime has one owner"; fi

echo "── 3. paper-only ────────────────────────────────────────────"
grep -q "ALLOW_LIVE_EXECUTION" $B/trading-bot/index.ts && ok "ALLOW_LIVE_EXECUTION gate present" || no "live gate missing"
grep -q "const paperMode = !ALLOW_LIVE" $B/trading-bot/index.ts && ok "paper is the floor, not a fallback" || no "paper not forced"
grep -q "const liveMode = ALLOW_LIVE" $B/trading-bot/index.ts && ok "liveMode gated on the flag" || no "liveMode ungated"

echo "── 7. optimizer ─────────────────────────────────────────────"
grep -q "from('bot_state').update" $B/trading-optimizer/index.ts && no "optimizer writes bot_state" || ok "optimizer is read-only"
grep -q "Number.isFinite(nv)" $B/trading-optimizer/index.ts && ok "limitChange rejects non-finite" || no "limitChange unguarded"
grep -q "1e-6" $B/trading-optimizer/index.ts && ok "limitChange survives current=0" || no "limitChange still ratio-based"

echo "── 10. error surfacing ──────────────────────────────────────"
grep -q "status:500" $B/trading-bot/index.ts && ok "bot returns 500 on a failed cycle" || no "bot still 200s on error"
grep -q "status: 500" $B/trading-optimizer/index.ts && ok "optimizer returns 500 on error" || no "optimizer still 200s"

echo "── secrets ──────────────────────────────────────────────────"
hits=$(grep -rnE "(BYBIT_API_(KEY|SECRET)|SUPABASE_ACCESS_TOKEN|service_role)[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9_.-]{12,}" \
        $B backtest trading-app/src 2>/dev/null | grep -v "Deno.env.get" | wc -l | tr -d ' ')
[ "$hits" = "0" ] && ok "no hardcoded secrets" || { no "$hits possible hardcoded secrets"; \
  grep -rnE "(BYBIT_API_(KEY|SECRET)|SUPABASE_ACCESS_TOKEN|service_role)[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9_.-]{12,}" $B backtest trading-app/src 2>/dev/null | grep -v "Deno.env.get"; }

echo
[ $fail -eq 0 ] && echo "ALL CHECKS PASS" || echo "SOME CHECKS FAILED"
exit $fail

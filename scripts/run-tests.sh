#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# scripts/run-tests.sh — the whole suite, offline, in about a second.
#
# Deliberately dependency-free: plain Node with --experimental-strip-types and an installed
# TypeScript compiler; no Deno, network or fixtures needed to run. A test suite that needs
# a working environment is a test suite that stops being run — and this repo has
# spent two months with its CI credentials dead.
#
#   bash scripts/run-tests.sh
# ════════════════════════════════════════════════════════════════════════════
set -uo pipefail
cd "$(dirname "$0")/.."

# Require an actual compiler before declaring any typecheck successful. The old
# grep pipeline swallowed npm/compiler startup failures and printed zero errors.
TSC_BIN=${TSC_BIN:-./node_modules/.bin/tsc}
if [ ! -x "$TSC_BIN" ]; then
  TSC_BIN=$(command -v tsc || true)
fi
if [ -z "$TSC_BIN" ] || ! "$TSC_BIN" --version >/dev/null 2>&1; then
  echo "FAIL: TypeScript compiler unavailable; install pinned TypeScript 6.0.2"
  exit 1
fi

fail=0
run() {
  echo ""
  echo "── $1 ──────────────────────────────────────────────"
  if ! node --experimental-strip-types "$2"; then fail=1; fi
}

run "scalp runner"          tests/scalp-runner.test.ts
run "scalp execution"       tests/scalp.test.ts
run "team review"           tests/team-meeting.test.ts
run "hedge-fund desk"       tests/desk.test.ts
run "signal agents"         tests/agents.test.ts
run "swarm + learning"      tests/swarm.test.ts
run "info agents"           tests/info.test.ts
run "agent factory"         tests/factory.test.ts
run "rota runner"           tests/rota-runner.test.ts
run "breakout BRKV v93"     tests/breakout.test.ts
run "lab v94 (research grid + LAB sleeve)" tests/lab.test.ts
run "lab runner v94 (paper replay)" tests/lab-runner.test.ts
run "gym"                   tests/gym.test.ts
run "costs + profit gate"   tests/costs.test.ts
run "opportunity v87 (aggressive demo)" tests/opportunity.test.ts
run "universe v88 (dynamic)" tests/universe.test.ts
run "strategy rules"        tests/strategy.test.ts
run "live/backtest parity"  tests/parity.test.ts
run "portfolio simulator"   tests/portfolio.test.ts
run "execution costs + validation" tests/execution-costs.test.ts

# ── typecheck: the shared module and both of its consumers ──────────────────
# The bot and the backtest are Deno programs, so `npm:` specifiers and the Deno
# global are expected to be unresolvable here; everything else must be clean.
# Three pre-existing TS2345 'never' errors in the bot (empty array literals from
# long before this module existed) are allowed and counted, not hidden — if that
# count moves, something new broke.
echo ""
echo "── typecheck ───────────────────────────────────────"
TSC_ARGS=(--ignoreConfig --noEmit --target ES2022 --module ESNext
          --moduleResolution bundler --allowImportingTsExtensions
          --skipLibCheck --noImplicitAny false --lib ES2022,DOM)

tc() {
  local file=$1 output status filtered errors unexpected
  output=$("$TSC_BIN" "${TSC_ARGS[@]}" "$file" 2>&1)
  status=$?
  filtered=$(printf '%s\n' "$output" \
    | grep -vE "error TS2307: Cannot find module 'npm:|error TS2304: Cannot find name 'Deno'" || true)
  errors=$(printf '%s\n' "$filtered" | grep -c "error TS" || true)
  # Empty output is a pass only when the compiler actually succeeded. Exit 2
  # with diagnostic text is tsc's normal type-error status; startup errors aren't.
  if [ "$status" -ne 0 ] && { [ "$status" -ne 2 ] || ! printf '%s\n' "$output" | grep -q 'error TS'; }; then
    echo "  FAIL: compiler did not complete for $file (exit $status)"
    printf '%s\n' "$output"
    fail=1
    return
  fi
  if [ "$file" = "supabase/functions/trading-bot/index.ts" ]; then
    unexpected=$(printf '%s\n' "$filtered" | grep 'error TS' \
      | grep -vE "error TS2345: Argument of type .* is not assignable to parameter of type 'never'\." || true)
    if [ "$errors" -gt 3 ] || [ -n "$unexpected" ]; then fail=1; fi
    echo "  $file: $errors errors (at most 3 known TS2345 diagnostics allowed)"
  else
    [ "$errors" -eq 0 ] || fail=1
    echo "  $file: $errors errors (expected 0)"
  fi
  if [ "$errors" -gt 0 ]; then printf '%s\n' "$filtered"; fi
}

tc shared/strategy.ts
tc shared/lab.ts
tc backtest/backtest.ts
tc backtest/portfolio.ts
tc supabase/functions/trading-bot/index.ts

echo ""
if [ "$fail" -ne 0 ]; then echo "  TESTS FAILED"; exit 1; fi
echo "  ALL TESTS PASSED"

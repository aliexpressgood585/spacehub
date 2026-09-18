#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# scripts/run-tests.sh — the whole suite, offline, in about a second.
#
# Deliberately dependency-free: plain Node with --experimental-strip-types, no
# npm install, no deno, no network, no fixtures on disk. A test suite that needs
# a working environment is a test suite that stops being run — and this repo has
# spent two months with its CI credentials dead.
#
#   bash scripts/run-tests.sh
# ════════════════════════════════════════════════════════════════════════════
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
run() {
  echo ""
  echo "── $1 ──────────────────────────────────────────────"
  if ! node --experimental-strip-types "$2"; then fail=1; fi
}

run "strategy rules"        tests/strategy.test.ts
run "live/backtest parity"  tests/parity.test.ts

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
  npx --no-install tsc "${TSC_ARGS[@]}" "$1" 2>&1 \
    | grep -v "Cannot find module 'npm:" \
    | grep -v "Cannot find name 'Deno'" || true
}

shared_errs=$(tc shared/strategy.ts | grep -c "error TS" || true)
bt_errs=$(tc backtest/backtest.ts | grep -c "error TS" || true)
bot_errs=$(tc supabase/functions/trading-bot/index.ts | grep -c "error TS" || true)

echo "  shared/strategy.ts        $shared_errs errors (expected 0)"
echo "  backtest/backtest.ts      $bt_errs errors (expected 0)"
echo "  trading-bot/index.ts      $bot_errs errors (expected 3 pre-existing)"

[ "$shared_errs" -eq 0 ] || { echo "  FAIL: shared module must typecheck clean"; fail=1; }
[ "$bt_errs" -eq 0 ]     || { echo "  FAIL: backtest must typecheck clean"; fail=1; }
if [ "$bot_errs" -gt 3 ]; then
  echo "  FAIL: the bot gained a type error — run tsc directly to see it"
  tc supabase/functions/trading-bot/index.ts | head -20
  fail=1
fi

echo ""
if [ "$fail" -ne 0 ]; then echo "  TESTS FAILED"; exit 1; fi
echo "  ALL TESTS PASSED"

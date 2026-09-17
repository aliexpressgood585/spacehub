#!/usr/bin/env bash
# Repoint the whole project at a NEW Supabase project (the user-owned one).
#
#   bash migration/switch-project.sh <NEW_PROJECT_REF> <NEW_ANON_KEY>
#
# Touches every place the old ref/key is baked in: 12 workflows, config.toml,
# setup-optimizer.sh and the dashboard fallbacks. Both values are PUBLIC (the
# anon key already ships to every browser that loads the dashboard) — the
# service-role key is never needed here, Supabase injects it into the function.
#
# Run, eyeball `git diff`, then commit+push: the deploy workflow builds the
# schema, ships the 4 functions and recreates the every-minute cron, and
# migrate-restore.yml replays migration/export/*.json.
set -euo pipefail

OLD_REF="mdvheizhciuvqychtwxr"
NEW_REF="${1:-}"
NEW_KEY="${2:-}"

if [ -z "$NEW_REF" ] || [ -z "$NEW_KEY" ]; then
  echo "usage: bash migration/switch-project.sh <NEW_PROJECT_REF> <NEW_ANON_KEY>" >&2
  exit 1
fi
if [ "$NEW_REF" = "$OLD_REF" ]; then
  echo "error: that is the OLD project ref" >&2; exit 1
fi
# refs are 20 lowercase letters; guard against a pasted URL or stray whitespace
if ! printf '%s' "$NEW_REF" | grep -Eq '^[a-z]{20}$'; then
  echo "error: '$NEW_REF' does not look like a project ref (expect 20 lowercase letters)" >&2
  exit 1
fi
case "$NEW_KEY" in
  eyJ*) ;;
  *) echo "error: anon key should start with 'eyJ'" >&2; exit 1 ;;
esac
# the anon key is public; the service-role key must never be committed
if printf '%s' "$NEW_KEY" | base64 -d 2>/dev/null | grep -q 'service_role'; then
  echo "error: that is the SERVICE ROLE key — use the anon/public key" >&2; exit 1
fi

echo "repointing $OLD_REF -> $NEW_REF"

# 1) project ref everywhere it is hardcoded
mapfile -t FILES < <(grep -rl "$OLD_REF" \
  --include="*.yml" --include="*.toml" --include="*.sh" --include="*.tsx" --include="*.ts" \
  . 2>/dev/null | grep -v node_modules | grep -v '^./migration/')
for f in "${FILES[@]}"; do
  sed -i "s/${OLD_REF}/${NEW_REF}/g" "$f"
  echo "  ref  $f"
done

# 2) dashboard anon-key fallback
DASH="trading-app/src/components/CryptoTradingDashboard.tsx"
OLD_KEY=$(grep -o "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9[A-Za-z0-9._-]*" "$DASH" | head -1)
if [ -n "$OLD_KEY" ]; then
  python3 - "$DASH" "$OLD_KEY" "$NEW_KEY" <<'PY'
import sys
p, old, new = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(p).read()
open(p, 'w').write(s.replace(old, new))
PY
  echo "  key  $DASH"
fi

echo
echo "remaining references to the old project (should be docs/migration only):"
grep -rl "$OLD_REF" --exclude-dir=node_modules --exclude-dir=.git . 2>/dev/null || echo "  none"
echo
echo "next: git diff  ->  commit + push  ->  run Deploy Edge Function  ->  run Migrate Restore"

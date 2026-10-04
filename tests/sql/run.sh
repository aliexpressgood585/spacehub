#!/usr/bin/env bash
# Ledger tests against a throw-away local Postgres (skipped when no server binaries are installed).
set -euo pipefail
cd "$(dirname "$0")/../.."
B=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1 || true)
if [ -z "$B" ] || [ ! -x "$B/initdb" ]; then echo "  sql ledger tests: SKIPPED (no local Postgres)"; exit 0; fi
D=$(mktemp -d /var/tmp/agg2pg.XXXX); RUN=""; [ "$(id -u)" = 0 ] && { chown postgres "$D"; RUN="su postgres -c"; }
sh_() { if [ -n "$RUN" ]; then $RUN "$1"; else bash -c "$1"; fi; }
sh_ "$B/initdb -D $D/data -A trust >/dev/null && $B/pg_ctl -D $D/data -o '-p 55433 -k $D' -l $D/log start >/dev/null"
trap 'sh_ "$B/pg_ctl -D $D/data stop -m immediate >/dev/null" || true; rm -rf "$D"' EXIT
sleep 2
P="psql -h $D -p 55433 -U postgres -v ON_ERROR_STOP=1 -q -d postgres"
$P -f tests/sql/schema.sql >/dev/null
$P -f supabase/migrations/20261004090000_blade_sleeve.sql >/dev/null 2>&1
$P -f supabase/migrations/20261004120000_agg2.sql >/dev/null 2>&1
$P -t -f tests/sql/agg2.test.sql 2>&1 | grep -v '^\s*$' | grep -v '^ *$' | tail -12

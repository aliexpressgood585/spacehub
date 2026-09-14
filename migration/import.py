#!/usr/bin/env python3
"""
Replay the migration/export/*.json snapshot into a fresh Supabase project.

Runs INSIDE GitHub Actions so the credential never leaves the secret store:
auth is the existing SUPABASE_ACCESS_TOKEN secret talking to the management
API (/database/query). Nothing here needs the service-role key, and no secret
is ever printed.

Ordering matters: bot_trades before bot_trade_snapshots (FK trade_id).
Original ids are preserved so those FKs stay valid; sequences are bumped past
the max id afterwards so new rows don't collide.

Idempotent: every INSERT carries ON CONFLICT (id) DO NOTHING, so a partial run
can simply be re-run.
"""
import json, os, sys, urllib.request, urllib.error

PROJECT_REF = os.environ["PROJECT_REF"]
TOKEN       = os.environ["SUPABASE_ACCESS_TOKEN"]
EXPORT_DIR  = os.path.join(os.path.dirname(__file__), "export")
API = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"

# insert order = FK order
TABLES = [
    "bot_state", "bot_trades", "bot_trade_snapshots", "bot_equity",
    "bot_errors", "bot_skips", "bot_params_history", "market_regime",
    "rebalance_history", "bot_trades_log", "bot_market_memory",
]
BATCH = 400


def run_sql(sql: str):
    req = urllib.request.Request(
        API,
        data=json.dumps({"query": sql}).encode(),
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read().decode() or "[]")
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:400]
        raise SystemExit(f"management API {e.code}: {body}")


def lit(v):
    """Render a JSON value as a SQL literal."""
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, (dict, list)):
        return "'" + json.dumps(v, ensure_ascii=False).replace("'", "''") + "'::jsonb"
    return "'" + str(v).replace("'", "''") + "'"


def load(table):
    path = os.path.join(EXPORT_DIR, f"{table}.json")
    if not os.path.exists(path):
        return []
    with open(path) as f:
        return json.load(f)


def main():
    total = 0
    for table in TABLES:
        rows = load(table)
        if not rows:
            print(f"{table:<22} skipped (empty)")
            continue
        cols = list(rows[0].keys())
        collist = ", ".join(f'"{c}"' for c in cols)
        sent = 0
        for i in range(0, len(rows), BATCH):
            chunk = rows[i:i + BATCH]
            values = ",\n".join(
                "(" + ", ".join(lit(r.get(c)) for c in cols) + ")" for r in chunk
            )
            conflict = "ON CONFLICT (id) DO NOTHING" if "id" in cols else ""
            run_sql(f'INSERT INTO public."{table}" ({collist}) VALUES\n{values}\n{conflict};')
            sent += len(chunk)
        # keep future inserts off the restored ids
        if "id" in cols:
            run_sql(
                f"SELECT setval(pg_get_serial_sequence('public.{table}','id'), "
                f"COALESCE((SELECT MAX(id) FROM public.{table}), 1), true);"
            )
        print(f"{table:<22} {sent:>6} rows restored")
        total += sent

    print(f"\nTOTAL {total} rows restored into {PROJECT_REF}")
    check = run_sql(
        "SELECT (SELECT count(*) FROM bot_trades) AS trades, "
        "(SELECT count(*) FROM bot_equity) AS equity, "
        "(SELECT round(balance::numeric,2) FROM bot_state WHERE id=1) AS balance;"
    )
    print("verify:", json.dumps(check))


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Build one atomic ledger upgrade; workers must never see intermediate definitions."""
import json
from pathlib import Path

MIGRATIONS = (
    "20261004090000_blade_sleeve.sql",
    "20261004120000_agg2.sql",
    "20261004120001_q15_sleeve.sql",
    "20261005114000_blade_allow_q15_25x.sql",
)

def payload(root=Path(".")):
    sql = ["BEGIN;", "SELECT pg_advisory_xact_lock(7151501);"]
    for name in MIGRATIONS:
        path = root / "supabase/migrations" / name
        if path.exists():
            sql.append(path.read_text())
    sql.append("COMMIT;")
    return {"query": "\n".join(sql)}

if __name__ == "__main__":
    print(json.dumps(payload()))

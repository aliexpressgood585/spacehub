#!/usr/bin/env python3
"""Build one atomic ledger upgrade; workers must never see intermediate definitions."""
import json
from pathlib import Path

MIGRATIONS = (
    "20261004090000_blade_sleeve.sql",
    "20261004120000_agg2.sql",
    "20261004120001_q15_sleeve.sql",
)

def payload(root=Path(".")):
    sql = ["BEGIN;", "SELECT pg_advisory_xact_lock(7151501);"]
    sql.extend((root / "supabase/migrations" / name).read_text() for name in MIGRATIONS)
    sql.append("COMMIT;")
    return {"query": "\n".join(sql)}

if __name__ == "__main__":
    print(json.dumps(payload()))

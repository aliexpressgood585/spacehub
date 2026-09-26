# v95.8 era — FAST ×50, fixed stop / 1.5R target (2026-09-26 19:45 → 21:58 UTC)

Account reset to $5,000 on 2026-09-26 at ~21:58 UTC (owner: "add the data sources and reset the account").
Full copies are kept in the database: `archive_v95_8era_bot_trades` (20 rows) and `archive_v95_8era_bot_equity` (144 rows), with RLS on.

| | |
|---|---|
| Closed trades | 20 (0 open at the reset) |
| Wins / losses | 6 / 14 (WR 30%) |
| Realised | **−$1,771.73** |
| Fees | $466.21 |
| Final balance | $3,228.27 on $5,000 (−35.4%) |
| Exits | TARGET 5, STOP 10, TIMEOUT 5 |

Why it lost: this is dissected in CLAUDE.md (2026-09-26 ~21:45). On 12 months of 1m data, every FAST variant tested
comes out at about −0.17%/trade after costs. Gross is roughly zero, so the round trip is the entire loss.

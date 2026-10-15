// CLV / Brier measurement for the Polymarket paper desks (shared/clv.ts). Observation only.
import fs from 'node:fs'
import { clvMark, clvStudy } from '../shared/clv.ts'
let n = 0, bad = 0
const ok = (c: boolean, m: string) => { n++; if (!c) { bad++; console.log('FAIL', m) } }
const near = (a: number | null, b: number, e = 1e-9) => a != null && Math.abs(a - b) < e
const end = Date.parse('2026-10-16T00:00:00Z')
const t: any = { end_time: '2026-10-16T00:00:00Z', entry_px: 0.9, status: 'OPEN', opened_at: '2026-10-15T20:00:00Z' }
clvMark(t, 0.9, 0.92, end - 60_000)
ok(near(t.meta.close_px, 0.91), 'closing line = mid of best bid and ask')
clvMark(t, 0.95, null, end - 1000)
ok(near(t.meta.close_px, 0.95), 'no ask -> best bid, last mark before the end wins')
clvMark(t, 0.2, 0.3, end + 1000)
ok(near(t.meta.close_px, 0.95), 'marks at or after the scheduled end are ignored')
clvMark(t, 0, 0.5, end - 500)
ok(near(t.meta.close_px, 0.95), 'an empty bid side never overwrites the line')
clvMark(t, 0.93, 0.91, end - 400)
ok(near(t.meta.close_px, 0.93), 'a crossed book uses the bid')
const closed = (entry: number, close: number, exit: number, at = '2026-10-15T20:00:00Z') =>
  ({ status: 'CLOSED', entry_px: entry, exit_px: exit, opened_at: at, meta: { close_px: close } })
const s = clvStudy([closed(0.9, 0.95, 1), closed(0.9, 0.85, 0), closed(0.9, 0.99, 0.995), { ...t }], '')
ok(s.n === 2, 'only trades settled at 0 or 1 count (an early exit is not a resolution)')
ok(near(s.clv_c, 0), 'CLV in cents averages close - entry')
ok(near(s.beat_close, 0.5), 'share of trades bought below the close')
ok(near(s.brier_entry, (0.01 + 0.81) / 2) && near(s.brier_close, (0.0025 + 0.7225) / 2), 'Brier at entry and at the close')
ok(s.open_n === 1 && near(s.open_clv_c, 3), 'open trades give a running CLV only')
ok(clvStudy([closed(0.9, 0.95, 1, '2026-10-14T00:00:00Z')], '2026-10-15').n === 0, 'since filters by opening time')
ok(clvStudy([]).clv_pct === null && clvStudy([]).clv_t === null, 'empty -> nulls, never NaN')
for (const f of ['pm-desk', 'pmc-desk', 'pmn-desk']) {
  const src = fs.readFileSync(new URL(`../scripts/${f}.ts`, import.meta.url), 'utf8')
  ok(/clvMark\(t, /.test(src) && /\.clv = \{/.test(src), `${f} marks the closing line and publishes st.clv`)
}
console.log(`clv: ${n - bad}/${n} passed`)
if (bad) process.exit(1)

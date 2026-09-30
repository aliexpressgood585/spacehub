import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { S1, s1Verdict, s1HasRoom } from '../shared/chan-shadow.ts'
// S1 shadow variant: pure verdict + the runner must only JOURNAL it, never trade on it.
const good = { comp: 'RG_BREADTH_MOMENTUM', side: 1 as const, regime: 'TREND', micro: 70, taker3m: 1.4, mtf: 1, funding: 0.0001, oiDelta: 0.01 }
assert.deepEqual(s1Verdict(good), { take: true, fails: [], missing: [] }, 'all gates agree -> take')
assert.deepEqual(s1Verdict({ ...good, regime: 'MEAN_REVERT' }).fails, ['regime'], 'momentum in MEAN_REVERT rejected')
assert.equal(s1Verdict({ ...good, comp: 'RG_MR', regime: 'MEAN_REVERT' }).take, true, 'MR comp in MEAN_REVERT ok')
assert.deepEqual(s1Verdict({ ...good, comp: 'RG_MR', regime: 'TREND' }).fails, ['regime'], 'MR comp in TREND rejected')
assert.deepEqual(s1Verdict({ ...good, micro: 59 }).fails, ['micro'], 'micro below 60')
assert.deepEqual(s1Verdict({ ...good, taker3m: 0.9 }).fails, ['micro'], 'taker flow against a long')
assert.equal(s1Verdict({ ...good, side: -1, taker3m: 0.8, mtf: -1, funding: -0.0001 }).take, true, 'mirror short')
assert.deepEqual(s1Verdict({ ...good, mtf: 0 }).fails, ['mtf'], 'neutral 15/60m trend is not agreement')
assert.deepEqual(s1Verdict({ ...good, funding: 0.0002 }).fails, ['funding'], 'longs paying > 1bp/8h')
assert.deepEqual(s1Verdict({ ...good, side: -1, taker3m: 0.8, mtf: -1, funding: -0.0002 }).fails, ['funding'], 'shorts paying')
assert.deepEqual(s1Verdict({ ...good, oiDelta: 0 }).fails, ['oi'], 'OI not rising')
const miss = s1Verdict({ ...good, micro: null, taker3m: null, funding: undefined, oiDelta: NaN, mtf: null })
assert.equal(miss.take, true, 'missing inputs abstain')
assert.deepEqual(miss.missing, ['micro', 'mtf', 'funding', 'oi'], 'missing inputs are reported')
assert.equal(S1.maxOpen, 12)
assert.equal(s1HasRoom(8, 3), true); assert.equal(s1HasRoom(8, 4), false); assert.equal(s1HasRoom(12, 0), false)
// Structural: the runner writes chan_shadow and nothing in the ledger or entries reads it.
const runner = readFileSync('supabase/functions/trading-bot/chan-runner.ts', 'utf8')
assert.ok(runner.includes("db.from('chan_shadow').insert(shadowRows)"), 'runner journals S1')
assert.ok(!/entries\.push\([^)]*s1/.test(runner), 'S1 never creates an entry')
assert.equal((runner.match(/AGGRESSIVE_MAX_OPEN = 8/g) || []).length, 1, 'live cap unchanged at 8')
const mig = readFileSync('supabase/migrations/20260930220000_chan_shadow_s1.sql', 'utf8')
assert.ok(/enable row level security/.test(mig) && /for select to anon/.test(mig), 'RLS on, anon read only')
for (const f of readFileSync('supabase/migrations/20260930190000_chan_entry_leverage.sql', 'utf8').match(/chan_shadow/g) ?? []) assert.fail('ledger must not read chan_shadow ' + f)
console.log('chan-shadow: 22 assertions passed')

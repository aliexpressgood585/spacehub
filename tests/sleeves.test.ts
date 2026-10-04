import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { sleeveOff, SLEEVES } from '../shared/sleeves.ts'

// v99.6: the supervisor's per-sleeve brake. Entries only, safe direction only.
assert.equal(sleeveOff({}, 'FAST'), false)
assert.equal(sleeveOff(null, 'FAST'), false)
assert.equal(sleeveOff({ sleeves_off: { FAST: { by: 'guardian' } } }, 'FAST'), true)
assert.equal(sleeveOff({ sleeves_off: { FAST: { by: 'guardian' } } }, 'EVT'), false)
assert.equal(sleeveOff({ sleeves_off: { FAST: null } }, 'FAST'), false, 'a cleared entry means on')
assert.equal(sleeveOff({ sleeves_off: 'FAST' }, 'FAST'), false, 'malformed value never matches')
assert.deepEqual([...SLEEVES], ['LIST', 'FUND', 'FAST', 'EVT', 'BRKV', 'PRO', 'BLADE', 'DONCH4H'])
// shim brake (the guardian's lever): comma list, case-insensitive, entries only
const g = globalThis as any
g.__SLEEVES_OFF = 'fast, EVT'
assert.equal(sleeveOff({}, 'FAST'), true); assert.equal(sleeveOff({}, 'EVT'), true); assert.equal(sleeveOff({}, 'LIST'), false)
g.__SLEEVES_OFF = ''
assert.equal(sleeveOff({}, 'FAST'), false)
delete g.__SLEEVES_OFF
assert.equal(sleeveOff({}, 'FAST'), false)
for (const wf of ['deploy-edge-function.yml', 'enforce-no-loss-trading.yml'])
  assert.ok(readFileSync(`.github/workflows/${wf}`, 'utf8').includes("g.__SLEEVES_OFF = '';"), `${wf} carries the brake line`)

// every runner gates its ENTRY path (not its exits) on the brake
const src = (f: string) => readFileSync(`supabase/functions/trading-bot/${f}`, 'utf8')
assert.ok(src('list-runner.ts').includes("const off=sleeveOff(params,'LIST')") && src('list-runner.ts').includes('if(off||entries.length>=room)break'), 'LIST entries gated')
assert.ok(src('fund-runner.ts').includes("&&!state.hard_halt_at&&!sleeveOff(params,'FUND')"), 'FUND scan gated')
assert.ok(src('fast-runner.ts').includes("&& !state.hard_halt_at && !halted && !sleeveOff(params, 'FAST')"), 'FAST entries gated')
assert.ok(src('evt-runner.ts').includes("&& !state.hard_halt_at && !sleeveOff(params, 'EVT')"), 'EVT polling gated')
assert.ok(src('brkv-runner.ts').includes("&&!state.hard_halt_at&&!sleeveOff(params,'BRKV')"), 'BRKV entries gated (v99.7)')
assert.ok(src('blade-runner.ts').includes("sleeveOff(params, prof.sleeve) ? 'brake'") && src('blade-runner.ts').includes("!state.hard_halt_at && !aggHalted(params, now) && !sleeveOff(params, 'DONCH4H')"), 'BLADE / DONCH4H entries gated')
assert.ok(src('brkv-runner.ts').includes('if(!mine.length&&!entryDue)return'), 'BRKV exits still run while braked')
// the brake can never ENABLE a sleeve: the runner set is still chosen by the deploy-time shim
const idx = src('index.ts')
assert.ok(!idx.includes('sleeves_off'), 'index.ts never reads sleeves_off to start a sleeve')
console.log('sleeves v99.6: brake semantics + entry gating passed')

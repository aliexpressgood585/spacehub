// "ממים חיים" v2: runner exits (half at +100%, trailing rest) and the era reset of scripts/meme-desk.ts.
import fs from 'node:fs'
import os from 'node:os'
import { MEME, runnerExit, buyTokens, sellSol } from '../shared/meme.ts'
let n = 0, bad = 0
const ok = (c: boolean, m: string) => { n++; if (!c) { bad++; console.error('FAIL', m) } }

// before the half is sold
ok(runnerExit(1.0, 1.0, 3, false) === 'HALF', '+100% -> sell half')
ok(runnerExit(0.99, 0.99, 3, false) === null, '+99% -> hold')
ok(runnerExit(-0.3, 0, 3, false) === 'SL', '-30% -> stop')
ok(runnerExit(-0.5, 0, 3, false) === 'SL', 'gap below the stop still stops')
ok(runnerExit(0.2, 0.4, MEME.maxHoldMin, false) === 'TIME', 'no +100% within the hold -> out')
// the riding half: trail from its own peak, no fixed stop, 24h cap
ok(runnerExit(2.0, 2.0, 60, true) === null, 'rising rider holds')
ok(runnerExit(1.0, 2.0, 60, true) === 'TRAIL', '(1+1.0) <= (1+2)*0.7 -> trail out')
ok(runnerExit(1.2, 2.0, 60, true) === null, '(1+1.2) > 2.1 -> hold')
ok(runnerExit(-0.31, 0, 60, true) === 'TRAIL', 'rider falling 30% from the half-sale level -> out')
ok(runnerExit(5, 5, MEME.runnerMaxHoldMin, true) === 'TIME', 'rider closed after 24h')
ok(MEME.stakeFrac === 0.01 && MEME.startCash === 1000 && MEME.era === 2, 'v2 account: $1,000, 1% stake')

// half sale returns roughly the stake when the position doubled (curve maths)
const c = { vS: 30e9, vT: 1073e12, rT: 793e12 }
const tok = buyTokens(c, 0.14)
const c2 = { vS: c.vS * 1.5, vT: c.vS * c.vT / (c.vS * 1.5), rT: 0 }   // price x2.25
const half = sellSol(c2, tok / 2)
ok(half > 0.14 * 0.9 && half < 0.14 * 1.3, `half of a ~x2 position ~ the stake back (${half.toFixed(4)} SOL)`)

// era reset: v1 state is archived once and replaced by a fresh $1,000 account that keeps the research recorder
const dir = fs.mkdtempSync(os.tmpdir() + '/meme-'), file = dir + '/state.json'
fs.writeFileSync(file, JSON.stringify({ cash: 577, start_cash: 1000, trades: [{ id: 1, status: 'OPEN' }], equity: [], decisions: [], snaps: { A: [[1, 2]] }, paths: { M: { m: 'M', c: Date.now(), p: [] } }, next_id: 120 }))
const src = fs.readFileSync(new URL('../scripts/meme-desk.ts', import.meta.url), 'utf8')
ok(/st\.era \?\? 1\) !== MEME\.era/.test(src) && /state-v\$\{st\.era \?\? 1\}\.json/.test(src) && /!fs\.existsSync\(arch\)/.test(src), 'meme-desk archives the old era once')
ok(/paths: st\.paths/.test(src) && /snaps: st\.snaps/.test(src), 'reset keeps paths in progress and snapshots')
const wf = fs.readFileSync(new URL('../.github/workflows/meme-desk.yml', import.meta.url), 'utf8')
ok(/git add meme\//.test(wf), 'workflow commits the whole meme/ dir (archive included)')
fs.rmSync(dir, { recursive: true })

console.log(`meme: ${n - bad}/${n} passed`)
if (bad) process.exit(1)

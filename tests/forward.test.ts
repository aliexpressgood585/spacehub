import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { HYPS, entries, netOf } from '../shared/forward.ts'
// Forward-test lab: pure rules + structural guarantees (never trades).
const T = Date.UTC(2026, 9, 1, 8, 0), uni = new Set(['AAAUSDT', 'BBBUSDT', 'CCCUSDT'])
const prem = [
  { symbol: 'AAAUSDT', markPrice: 10, lastFundingRate: 0.0012, nextFundingTime: T },    // longs pay -> short
  { symbol: 'BBBUSDT', markPrice: 5, lastFundingRate: -0.0015, nextFundingTime: T },    // shorts pay -> long
  { symbol: 'CCCUSDT', markPrice: 1, lastFundingRate: 0.0005, nextFundingTime: T },     // below threshold
  { symbol: 'ZZZUSDT', markPrice: 1, lastFundingRate: 0.01, nextFundingTime: T },       // not in universe
]
const at = T - 60 * 60e3 + 30e3
let e = entries(prem, uni, at, new Set())
assert.equal(e.length, 2 * HYPS.length, 'two symbols x both hypotheses')
assert.ok(e.every(x => (x.symbol === 'AAAUSDT' ? x.side === -1 : x.side === 1)), 'receiving side')
assert.deepEqual(new Set(e.map(x => x.exit_due)), new Set([new Date(T + 15 * 60e3).toISOString(), new Date(T).toISOString()]), 'exit times')
const taken = new Set<string>(); entries(prem, uni, at, taken)
assert.equal(entries(prem, uni, at + 60e3, taken).length, 0, 'one entry per settlement')
assert.equal(entries(prem, uni, T - 61 * 60e3, new Set()).length, 0, 'before the window')
assert.equal(entries(prem, uni, T - 55 * 60e3, new Set()).length, 0, 'after the window')
assert.ok(Math.abs(netOf(-1, 100, 100, 0.0012, 0.0016) - (0.0012 - 0.0016)) < 1e-12, 'short receives positive funding')
assert.ok(Math.abs(netOf(-1, 100, 101, 0.0012, 0.0016) - (-0.01 + 0.0012 - 0.0016)) < 1e-12, 'short loses a rally')
assert.ok(Math.abs(netOf(1, 100, 100, -0.0015, 0.0016) - (0.0015 - 0.0016)) < 1e-12, 'long receives negative funding')
assert.ok(Math.abs(netOf(-1, 100, 100, -0.0005, 0.0016) - (-0.0005 - 0.0016)) < 1e-12, 'sign flip: pays')
const col = readFileSync('supabase/functions/data-collector/index.ts', 'utf8')
assert.ok(!/bot_trades|chan_commit_cycle|bot_state/.test(col), 'collector never touches trading tables')
const mig = readFileSync('supabase/migrations/20260930233000_forward_lab.sql', 'utf8')
assert.ok(/enable row level security/.test(mig) && /unique \(hyp, symbol, settle_at\)/.test(mig), 'RLS + one row per settlement')
console.log('forward lab: 13 assertions passed')

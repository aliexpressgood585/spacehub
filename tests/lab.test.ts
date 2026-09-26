import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { RULES, EXITS, GATES, labInd, labSignal, labGate, labOpen, labBar, labManage, labQuoteExit, labSize, labVerdict, specId, slipFor, LAB_SIZE, LEARN_LAB, type LBar, type Tf } from '../shared/lab.ts'
import { LAB_LIVE } from '../supabase/functions/trading-bot/lab-runner.ts'
// v94.0 LAB — one rule vocabulary for the research grid and the live sleeve
assert.equal(RULES.length, 23); assert.equal(EXITS.length, 36); assert.equal(GATES.length, 5)
const ids = new Set<string>()
for (const tf of ['5m', '15m', '1h', '2h', '4h'] as Tf[]) for (const s of [1, -1] as const) for (const r of RULES) for (const e of EXITS) for (const g of GATES) ids.add(specId(tf, s, r, e, g))
assert.equal(ids.size, 5 * 2 * 23 * 36 * 5, 'every spec id is unique (41,400)')
// indicators: rolling extremes exclude the current bar and match a naive scan
const rnd = (() => { let x = 7; return () => ((x = (x * 16807) % 2147483647) / 2147483647) })()
const B: LBar[] = []; let px = 100
for (let i = 0; i < 400; i++) { const o = px; px *= 1 + (rnd() - 0.5) * 0.02; B.push({ t: i * 3600e3, open: o, high: Math.max(o, px) * (1 + rnd() * 0.004), low: Math.min(o, px) * (1 - rnd() * 0.004), close: px, vol: 100 + rnd() * 50, tb: 50 + rnd() * 30 }) }
const I = labInd(B)
for (const i of [20, 57, 199, 399]) {
  const w = B.slice(i - 20, i); assert.equal(I.hi20[i], Math.max(...w.map((b) => b.high)), 'hi20 = max of the 20 bars BEFORE i'); assert.equal(I.lo20[i], Math.min(...w.map((b) => b.low)))
}
for (const i of [55, 300]) assert.equal(I.hi55[i], Math.max(...B.slice(i - 55, i).map((b) => b.high)))
assert.ok(Number.isNaN(I.hi20[19]) && I.atr[14] > 0 && Number.isNaN(I.atr[13]), 'warm-up values are NaN, never guessed')
const i6 = 300, w6 = B.slice(i6 - 5, i6 + 1), imb = w6.reduce((a, b) => a + 2 * (b.tb as number) - b.vol, 0) / w6.reduce((a, b) => a + b.vol, 0)
assert.ok(Math.abs(I.imb6[i6] - imb) < 1e-9, 'order-flow imbalance = observed taker-buy column over the last 6 bars')
const noTb = labInd(B.map((b) => ({ ...b, tb: NaN })))
assert.ok(RULES.filter((r) => r.fam === 'flow').every((r) => !labSignal(r, 1, B, noTb, 300) && !labSignal(r, -1, B, noTb, 300)), 'no taker data -> flow rules abstain (never inferred)')
// signals: a clean breakout bar fires LONG breakout and not SHORT
const flat: LBar[] = Array.from({ length: 150 }, (_, i) => ({ t: i, open: 100, high: 100.5 + (i % 3) * 0.1, low: 99.5 - (i % 3) * 0.1, close: 100, vol: 10, tb: 5 }))
const brk = [...flat, { t: 150, open: 100, high: 103, low: 100, close: 102.8, vol: 40, tb: 30 }]
const IB = labInd(brk), k = brk.length - 1
assert.ok(labSignal({ fam: 'brk', a: 20, b: 0 }, 1, brk, IB, k) && labSignal({ fam: 'brk', a: 20, b: 2 }, 1, brk, IB, k), 'breakout on 4x volume = LONG')
assert.ok(!labSignal({ fam: 'brk', a: 20, b: 0 }, -1, brk, IB, k), 'and not SHORT')
const sweep = [...flat, { t: 150, open: 100, high: 100.2, low: 98.5, close: 100.1, vol: 20, tb: 10 }]
assert.ok(labSignal({ fam: 'sweep', a: 20, b: 0 }, 1, sweep, labInd(sweep), sweep.length - 1), 'wick below the 20-bar low that closes back inside = LONG sweep')
assert.ok(labGate('all', I, 300, null) && !labGate('btc_up', I, 300, null) && labGate('btc_dn', I, 300, false), 'regime gates need the BTC flag; unknown BTC = no btc-gated trade')
// exits: stop first, gap fills at the open, management applies from the NEXT bar
const e = { sl: 1, tp: 2, mg: 1 as const, hold: 6 }
let p = labOpen(1, 100, 1, e)
assert.equal(p.stop, 99); assert.equal(p.target, 102)
assert.deepEqual(labBar(p, { open: 100, high: 102.5, low: 98.9, close: 101 }), { px: 99, why: 'STOP' }, 'both touched -> the stop wins')
p = labOpen(1, 100, 1, e)
assert.deepEqual(labBar(p, { open: 97, high: 97.5, low: 96, close: 97 }), { px: 97, why: 'STOP' }, 'a bar opening beyond the stop fills at the open (gap paid)')
p = labOpen(1, 100, 1, e)
assert.equal(labBar(p, { open: 100, high: 101.2, low: 99.5, close: 101 }), null); assert.equal(p.stop, 100, 'breakeven after +1R, from the next bar on')
assert.deepEqual(labBar(p, { open: 101, high: 101.1, low: 99.9, close: 100.2 }), { px: 100, why: 'STOP' })
const tr = labOpen(-1, 100, 1, { sl: 1, tp: 3, mg: 2, hold: 24 }); labManage(tr, 98); assert.equal(tr.stop, 99, 'short trail: 1R behind the best price after +1R'); labManage(tr, 98.5); assert.equal(tr.stop, 99, 'trail never loosens')
p = labOpen(1, 100, 1, { sl: 1, tp: 3, mg: 0, hold: 2 }); labBar(p, { open: 100, high: 100.5, low: 99.6, close: 100.1 })
assert.deepEqual(labBar(p, { open: 100.1, high: 100.4, low: 99.8, close: 100.3 }), { px: 100.3, why: 'TIMEOUT' })
assert.equal(labQuoteExit(labOpen(1, 100, 1, e), 98.9, 0, 60e3), 'STOP'); assert.equal(labQuoteExit(labOpen(-1, 100, 1, e), 97.9, 0, 60e3), 'TARGET'); assert.equal(labQuoteExit(labOpen(1, 100, 1, e), 100.5, 6 * 60e3, 60e3), 'TIMEOUT')
assert.equal(slipFor('BTC'), 0.0003); assert.equal(slipFor('SOL'), 0.0005)
// sizing: risk at the stop, capped per trade, by liquidity, by gross and by cash; explore is tiny
const base = { equity: 5000, cash: 2500, stopPct: 0.05, oosT: 2, volReg: 1, depthUsd: null, corrLoad: 0, grossUsed: 0, slots: 8, maxLev: 1 }
const el = labSize({ ...base, tier: 'elite' }), ex = labSize({ ...base, tier: 'explore' })
assert.ok(Math.abs(el.notional - 5000 * LAB_SIZE.riskElite / 0.05) < 1e-6 && el.why === 'risk', 'elite: 0.5% of equity at the stop')
assert.ok(ex.notional <= 5000 * LAB_SIZE.capExplore + 1e-9, 'explore: <= 2% of equity')
assert.equal(labSize({ ...base, tier: 'elite', stopPct: 0.002 }).why, 'per_trade_cap')
assert.equal(labSize({ ...base, tier: 'elite', grossUsed: 4700 }).why, 'gross_cap')
assert.ok(labSize({ ...base, tier: 'elite', corrLoad: 2 }).notional < el.notional, 'correlated same-side load shrinks the ticket')
// controlled learning: rollback on a bad live record, promotion only with evidence
assert.equal(labVerdict([0.1, -0.2], 5000, [1, -2]).action, 'keep', 'too few closes to judge')
assert.equal(labVerdict(Array(14).fill(-0.5).map((x, i) => x + (i % 2) * 0.01), 5000, Array(14).fill(-5)).action, 'demote')
assert.equal(labVerdict(Array.from({ length: 32 }, (_, i) => 0.5 + (i % 2) * 0.1), 5000, Array(32).fill(3)).action, 'promote')
assert.equal(LEARN_LAB.minPromoteN, 30)
// ledger + runner wiring
const sql = readFileSync('supabase/migrations/20260926170000_lab_sleeve.sql', 'utf8')
assert.ok(sql.includes(`cnt>=${LAB_LIVE.maxOpen}`) && sql.includes("then 0.15 else 0.02") && sql.includes('eq*0.95-book') && sql.includes('not s.paper_mode') && sql.includes('t.lev<>1'), 'ledger: <= 8 open, 15%/2% per trade, 95% gross book, paper 1x only')
assert.ok(sql.includes("lab levels on the wrong side") && sql.includes("lab entry without a spec and levels"), 'ledger refuses an entry without a spec or with inverted levels')
assert.ok(sql.includes("t.side='LONG' and st<(m->>'stop')::numeric"), 'stop ratchets only move in the position favour')
const runner = readFileSync('supabase/functions/trading-bot/lab-runner.ts', 'utf8')
assert.ok(runner.includes("if (!paper) throw new Error('LAB is paper-only"), 'runner refuses live execution')
assert.ok(runner.includes("c.p.tier === 'explore' && eliteTaken()"), 'explore trades only when no elite trade was taken')
assert.ok(runner.includes('labState.demoted[p.spec.id]') && runner.includes('ROLLBACK ${id}'), 'demoted specs never enter again (rollback)')
const sr = readFileSync('supabase/functions/trading-bot/scalp-runner.ts', 'utf8')
assert.ok(sr.includes("t.strategy==='LAB'") && sr.includes("['SCALP','ROTA','BRKV','LAB']"), 'SCALP never closes LAB rows')
const idx = readFileSync('supabase/functions/trading-bot/index.ts', 'utf8')
assert.ok(idx.includes('if (LAB_ENABLED) {') && idx.includes('runLab(supabase, scalpState, runLeaseUntil, paperMode && !liveMode)'), 'index gates LAB on the shim and passes paper')
const wf = readFileSync('.github/workflows/backtest.yml', 'utf8')
assert.ok(wf.includes('lab) BT_MONTHS=36 bash backtest/fetch-5m.sh') && wf.includes('status/lab-latest.json'), 'workflow fetches the lab data and commits its result')
console.log('lab (v94.0) tests passed')

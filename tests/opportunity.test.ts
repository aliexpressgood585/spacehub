import assert from 'node:assert/strict'
import { OPP, credit, evidenceEdge, exploreEdge, adjustments, signalAge, sizeFor, portfolioPlan, missingFor, type EdgeBacker } from '../shared/opportunity.ts'
import { COST, profitGate, type Book } from '../shared/costs.ts'
import { SCALP } from '../shared/scalp.ts'
import { readFileSync } from 'node:fs'

const B = (agent: string, netBps: number, tg: number, h = 15, w = 1): EdgeBacker => ({ agent, w, netBps, t: tg, tg, h })
// v89.0 evidence: GROSS t (corrected) > 1, shrunk by James-Stein 1 - 1/tg^2 — the cost is charged ONCE, by the gate
assert.equal(credit(0.9), 0); assert.equal(credit(1), 0); assert.equal(credit(2), 0.75); assert.ok(Math.abs(credit(1.5) - 0.5556) < 1e-3); assert.equal(credit(0.4), 0)
assert.equal(evidenceEdge([B('a', 40, 0.9), B('b', -20, 3)], []).n, 0, 'gross t below 1 or negative gross (net < -16) -> no evidence')
assert.ok(Number.isNaN(evidenceEdge([B('a', 40, 0.9)], []).bps))
{ const e = evidenceEdge([B('a', 40, 2)], []); assert.equal(e.bps, 42, 'gross 56 x (1 - 1/4)'); assert.equal(e.holdMin, 15); assert.equal(e.conf, 0.75) }
{ const e = evidenceEdge([B('a', 40, 2), B('noise', -30, 0.2), B('bad', -50, 3)], []); assert.equal(e.bps, 42, 'unevidenced / negative-gross backers do not dilute an evidenced edge') }
{ const e = evidenceEdge([B('a', 40, 2)], [B('c', 40, 2)]); assert.equal(e.bps, 0, 'equal evidence against cancels it'); assert.equal(e.nCon, 1) }
{ const e = evidenceEdge([B('a', 40, 1.5, 5), B('b', 20, 2.5, 60)], []); assert.equal(e.holdMin, 60, 'weighted median horizon of the evidence'); assert.ok(e.bps > 16) }
// the v87 double count, fixed: an agent whose NET edge is slightly negative but whose GROSS edge is strongly evidenced
// is now priced (gross 14 x 0.89) and left to the profit gate, which rejects it on the real cost — not on a proxy
{ const e = evidenceEdge([B('a', -2, 3)], []); assert.ok(e.n === 1 && e.bps > 12 && e.bps < 14, `gross-evidenced, net-negative -> priced (${e.bps})`)
  const deep: Book = { bid: 100, ask: 100.01, bidDepth10: 5e6, askDepth10: 5e6, ts: 0, source: 't' }
  assert.equal(profitGate({ grossEdgeBps: e.bps, edgeN: 1, book: deep, notional: 1000, side: 1, holdMin: 15, funding: 0.0001 }).reason, 'costs_exceed_edge', '... and the gate, not the evidence test, rejects it') }

// v91.0 exploration tier: overlap-only t >= 1, gross unshrunk, used only when the evidence test passes nobody
{ const X = (agent: string, netBps: number, tg: number, to: number, h = 15): EdgeBacker => ({ agent, w: 1, netBps, t: tg, tg, to, h })
  const r = X('rsi14r', 3.9, 0.49, 1.34)                     // the live case on 2026-09-25: gross 19.9 bps, raw t 5.2
  assert.equal(evidenceEdge([r], []).n, 0, 'fails the full evidence test')
  const e = exploreEdge([r], []); assert.equal(e.n, 1); assert.equal(e.bps, 19.9, 'gross unshrunk'); assert.equal(e.holdMin, 15)
  assert.equal(exploreEdge([X('a', 3, 0.3, 0.9)], []).n, 0, 'overlap t below 1 -> not even exploration')
  assert.equal(exploreEdge([X('a', -20, 2, 3)], []).n, 0, 'negative gross never explores')
  assert.equal(exploreEdge([r], [X('c', 3.9, 0.49, 1.34)]).bps, 0, 'opposition cancels')
  const deep: Book = { bid: 100, ask: 100.01, bidDepth10: 5e6, askDepth10: 5e6, ts: 0, source: 't' }
  assert.equal(profitGate({ grossEdgeBps: 12, edgeN: 1, book: deep, notional: 250, side: 1, holdMin: 15, funding: 0.0001 }).pass, false, 'the profit gate still charges the full cost to exploration')
  assert.equal(OPP.explore.sizeMult, 0.25); assert.equal(OPP.explore.maxOpen, 2)
  const run = readFileSync('supabase/functions/trading-bot/scalp-runner.ts', 'utf8')
  assert.ok(run.includes('if(!ev.n){const ex=exploreEdge(pro,con)'), 'exploration only when the evidence test is empty')
  assert.ok(run.includes("riskMult:risk.mult*xm") && run.includes("exploreOpen>=OPP.explore.maxOpen"), 'quarter size + open cap wired') }

// secondary filters are adjustments, never vetoes
{ const a = adjustments({ weighted: -0.4, side: 1, trend: -1, spreadBps: 12, rangeOk: false, imbalance: -0.3 })
  assert.ok(a.bps < 0 && a.bps > -10, `all secondary filters weak -> a bounded penalty (${a.bps})`)
  assert.equal(a.parts.trend, -1.5); assert.equal(a.parts.spread, -2); assert.equal(a.parts.range, -2) }
assert.ok(adjustments({ weighted: -0.5, side: -1, trend: -1, spreadBps: 2, rangeOk: true, imbalance: -0.2 }).bps > 0, 'everything agreeing -> a bonus')

// the weighted-score idea end to end: a strong edge passes with weak secondary filters, a marginal one does not
const deep: Book = { bid: 100, ask: 100.01, bidDepth10: 5e6, askDepth10: 5e6, ts: 0, source: 't' }
const weak = adjustments({ weighted: -0.4, side: 1, trend: -1, spreadBps: 1, rangeOk: true, imbalance: 0 })
{ const g = profitGate({ grossEdgeBps: 40, edgeN: 1, book: deep, notional: 1000, side: 1, holdMin: 15, funding: 0.0001 })
  assert.ok(g.pass && g.net_bps + weak.bps >= COST.marginBps, 'strong edge + team against + EMA against -> still passes') }
{ const g = profitGate({ grossEdgeBps: 17.5, edgeN: 1, book: deep, notional: 1000, side: 1, holdMin: 15, funding: 0.0001 })
  assert.ok(g.pass, 'soft gate: under a bp of net passes the gate itself'); assert.ok(g.net_bps + weak.bps < COST.marginBps, '... but a marginal edge does not survive weak secondary filters') }

// signal expiry
const now = 1_800_000_000_000
assert.equal(signalAge(now, now - 5000, now - 90_000).fresh, true)
assert.equal(signalAge(now, now - 25_000, now - 90_000).fresh, false, 'quote older than 20 s expires the signal')
assert.equal(signalAge(now, now - 1000, now - 300_000).fresh, false, 'last 1m bar closed 4 min ago expires the signal')
assert.ok(signalAge(now, now - 25_000, now).why.includes('ציטוט'))

// dynamic sizing: volatility (stop), tier, edge, exposure, correlation
const base = { equity: 10_000, stopPct: 0.005, riskMult: 1, netBps: 5, exposure: 0, corrMult: 1, perCoin: SCALP.perCoin, riskPerTrade: SCALP.riskPerTrade }
assert.equal(sizeFor(base).notional, 2500, 'risk $50 at a 0.5% stop = $10k, capped at 25% per coin')
assert.ok(sizeFor({ ...base, stopPct: 0.04 }).notional < sizeFor({ ...base, stopPct: 0.02 }).notional, 'wider (more volatile) stop -> smaller')
assert.ok(sizeFor({ ...base, stopPct: 0.03, riskMult: 0.5 }).notional < sizeFor({ ...base, stopPct: 0.03 }).notional, 'graded risk tier shrinks size')
assert.ok(sizeFor({ ...base, stopPct: 0.03, netBps: 1 }).notional < sizeFor({ ...base, stopPct: 0.03, netBps: 10 }).notional, 'bigger expected edge -> bigger size')
assert.ok(sizeFor({ ...base, stopPct: 0.03, exposure: 8000 }).notional < sizeFor({ ...base, stopPct: 0.03 }).notional, 'more exposure -> smaller')
assert.ok(sizeFor({ ...base, stopPct: 0.03, corrMult: 0.4 }).notional < sizeFor({ ...base, stopPct: 0.03 }).notional, 'correlated -> smaller')
for (const s of [0.003, 0.01, 0.04]) for (const m of [0.1, 1]) assert.ok(sizeFor({ ...base, stopPct: s, riskMult: m, netBps: 50 }).notional <= 2500 + 1e-9)

// portfolio risk manager
{ const c = (k: string, side: 1 | -1, load = 0, n = 1000) => ({ key: k, side, notional: n, corrLoad: load })
  const r = portfolioPlan([c('a', 1), c('b', 1, 1.6), c('c', -1), c('d', 1), c('e', 1)], [], 10_000, 3)
  assert.equal(r.get('a')!.ok, true); assert.equal(r.get('b')!.reason, 'correlated_book'); assert.equal(r.get('c')!.ok, true); assert.equal(r.get('d')!.ok, true)
  assert.equal(r.get('e')!.reason, 'ranked_below_cut', 'Top-N: only `limit` per meeting')
  const full = portfolioPlan([c('x', 1)], Array.from({ length: OPP.maxPositions }, (_, i) => ({ side: i % 2 ? 1 : -1, notional: 100 })), 10_000, 3)
  assert.equal(full.get('x')!.reason, 'book_full')
  const same = portfolioPlan([c('x', 1), c('y', -1)], Array.from({ length: OPP.maxSameSide }, () => ({ side: 1, notional: 100 })), 10_000, 3)
  assert.equal(same.get('x')!.reason, 'same_side_cap'); assert.equal(same.get('y')!.ok, true)
  const expo = portfolioPlan([c('x', 1, 0, 3000)], [{ side: -1, notional: 8990 }], 10_000, 3)
  assert.equal(expo.get('x')!.reason, 'exposure_cap', 'gross exposure capped at 90%')
  const net = portfolioPlan([c('x', 1, 0, 2500)], [{ side: 1, notional: 5990 }], 10_000, 3)
  assert.equal(net.get('x')!.reason, 'exposure_cap', 'net directional exposure capped at 60%')
  const cands = [c('x', 1, 0, 2500)], trim = portfolioPlan(cands, [{ side: 1, notional: 5000 }], 10_000, 3)
  assert.equal(trim.get('x')!.ok, true); assert.equal(cands[0].notional, 1000, 'with room left the size is trimmed to it, not rejected')
  const hedge = [c('h', -1, 0, 2500)]; portfolioPlan(hedge, [{ side: 1, notional: 5990 }], 10_000, 3); assert.equal(hedge[0].notional, 2500, 'a hedging side is not limited by the net cap') }
assert.equal(OPP.maxPositions, 8); assert.ok(OPP.maxPositions >= 6 && OPP.maxPositions <= 8, 'owner: 6-8 parallel positions')
assert.equal(OPP.entriesByTier.full, 3); assert.equal(OPP.entriesByTier.minimal, 1, 'losses slow the rate, never stop it')

// what is missing to pass
assert.ok(missingFor('costs_exceed_edge', { netBps: -3, costBps: 16 }).includes('3.5'))
assert.ok(missingFor('no_edge_estimate', {}).includes('t≥1'))

// no bypass: every entry the runner builds is marked passed, the ledger refuses anything else, no other engine opens trades
{ const r = readFileSync('supabase/functions/trading-bot/scalp-runner.ts', 'utf8'), i = readFileSync('supabase/functions/trading-bot/index.ts', 'utf8')
  assert.equal((r.match(/entries\.push\(/g) ?? []).length, 1, 'exactly one place fills entries'); assert.ok(r.includes("profit_gate:'passed'"))
  assert.ok(i.includes('const LEGACY_ENGINE_ALLOWED = false') && i.includes('if (!LEGACY_ENGINE_ALLOWED) return'), 'legacy ungated engine cannot trade')
  assert.ok(!/await runRota\(/.test(i), 'ROTA (ungated) is never run') }
console.log('Opportunity v91.0 (exploration tier): evidence, weighted score, TTL, dynamic sizing, portfolio manager, no-bypass passed')

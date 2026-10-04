import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseAnnouncementV2, parseAnnouncement, announcementAge, detectLag, median } from '../shared/events.ts'
import { BLADE, bladeCandidates, bladeGate, bladeSize, bladeOpen, bladeStep, fillNet, earnedLevel, effectiveLevel, haltReason, lossStreak, liqClusters, makerFilled, bladeLiq, type BladeEvt } from '../shared/blade.ts'
import { runBlade, runDonch, bladeShimMax, DONCHX, cmsWatch, BLADE_SCAN } from '../supabase/functions/trading-bot/blade-runner.ts'
import * as S from '../shared/strategy.ts'

// ── parsing: Blade's parser is tolerant; the frozen H7 parser is untouched ──
assert.deepEqual(parseAnnouncementV2('Binance Will List Hyperliquid (HYPE) with Seed Tag Applied'), { kind: 'LIST', syms: ['HYPE'] })
assert.deepEqual(parseAnnouncementV2('Binance Will  List Aerodrome (AERO).'), { kind: 'LIST', syms: ['AERO'] }, 'NBSP / double spaces')
assert.deepEqual(parseAnnouncementV2('Binance Will Delist A1, BB, and CC on 2026-10-15'), { kind: 'DELIST', syms: ['A1', 'BB', 'CC'] }, 'Oxford comma')
assert.deepEqual(parseAnnouncementV2('Binance Will Delist ICX, SCRT, STORJ on 2026-09-03'), { kind: 'DELIST', syms: ['ICX', 'SCRT', 'STORJ'] })
assert.equal(parseAnnouncementV2('Binance Futures Will Delist Multiple USDⓈ-M Perpetual Contracts (2026-10-05)'), null, 'perp delisting ignored')
assert.equal(parseAnnouncementV2('Notice of Removal of Spot Trading Pairs - 2026-10-02'), null)
assert.deepEqual(parseAnnouncement('Binance Will Delist ACX, HFT and VIC on 2026-08-17'), { kind: 'DELIST', syms: ['ACX', 'HFT', 'VIC'] }, 'H7 parser unchanged')
const T = Date.UTC(2026, 9, 4, 12, 0)
assert.equal(announcementAge(T, T + 12_000), 12_000); assert.ok(Number.isNaN(announcementAge(T + 60_000, T)), 'future-dated = NaN')
assert.equal(detectLag(T + 7_000, T), 7_000); assert.equal(median([3, 1, 2]), 2); assert.equal(median([1, 2, 3, 4]), 2.5)

// ── candidates: listing needs a perp; delisting needs a perp in the liquid universe ──
const perps = new Set(['HYPEUSDT', 'ICXUSDT', '1000SATSUSDT'])
const pof = (c: string) => [`${c}USDT`, `1000${c}USDT`].find(s => perps.has(s)) ?? null
assert.equal(bladeCandidates('Binance Will List Hyperliquid (HYPE)', T, pof, () => false)[0].id, 'BL1', 'listing long does not need the universe')
assert.deepEqual(bladeCandidates('Binance Will Delist ICX, SATS and FOO on 2026-10-15', T, pof, p => p === 'ICXUSDT').map(c => [c.id, c.perp, c.side]), [['BD1', 'ICXUSDT', -1]], 'illiquid / no-perp coins skipped')

// ── gates in the pre-registered order ──
const ok = { kind: 'LIST' as const, releaseDate: T, now: T + 10_000, quoteTs: T + 9_000, bid: 100, ask: 100.05, walkImpact: 0.001, walkBeyond: false }
assert.equal(bladeGate(ok), null)
assert.equal(bladeGate({ ...ok, now: T + 30_001 }), 'too_old', 'age > 30 s = skip, no chasing')
assert.equal(bladeGate({ ...ok, quoteTs: T + 4_000 }), 'stale_quote', 'quote older than 5 s')
assert.equal(bladeGate({ ...ok, ask: 100.1 }), 'wide_spread', '10 bps > 8')
assert.equal(bladeGate({ ...ok, walkBeyond: true }), 'beyond_book')
assert.equal(bladeGate({ ...ok, walkImpact: 0.017 }), 'impact_too_high', 'listing: 170 bps > 25% of 650')
assert.equal(bladeGate({ ...ok, kind: 'DELIST', walkImpact: 0.017 }), null, 'delisting allows up to 315 bps')

// ── size per level ──
assert.deepEqual(bladeSize('SHADOW', 'BL1', 5000, 5000), { margin: 0, notional: 0 })
assert.deepEqual(bladeSize('HALT', 'BL1', 5000, 5000), { margin: 0, notional: 0 })
assert.equal(bladeSize('PROBE', 'BL1', 5000, 5000).notional, 500, 'PROBE 2% margin x 5')
assert.equal(bladeSize('ATTACK', 'BL1', 5000, 5000).notional, 2000); assert.equal(bladeSize('ATTACK', 'BD1', 5000, 5000).notional, 1250)
assert.ok(bladeSize('ATTACK', 'BL1', 5000, 100).margin < 100, 'margin + fee bounded by cash')
assert.ok(Math.abs(bladeLiq(1, 100) - 100 * (1 - 0.195)) < 1e-9, '5x liquidation 19.5% away, beyond the 4% stop')

// ── exits on the tape ──
const tp = (ps: number[], t0 = T) => ps.map((p, i) => ({ p, T: t0 + 1000 * (i + 1) }))
let p = bladeOpen('BL1', 1, 100, 0.5, T)
assert.ok(Math.abs(p.stop - 96) < 1e-9 && Math.abs(p.scaleAt! - 103) < 1e-9 && p.trail === 0.75)
let r = bladeStep(p, tp([99, 95.9, 104]), T + 5000, null)
assert.deepEqual(r.fills.map(f => [f.why, f.px, f.frac]), [['STOP', 95.9, 1]], 'stop fills at the print that crossed it, before any later rally')
r = bladeStep(p, tp([101, 103.01, 105, 104.2, 104.24]), T + 9000, null)
assert.deepEqual(r.fills.map(f => [f.why, f.px, f.frac]), [['SCALE', 103, 0.5], ['TRAIL', 104.2, 0.5]], 'half off at +3% (at the level), rest trails 1.5 ATR behind 105 (stop 104.25, fills at the crossing print)')
r = bladeStep(p, tp([101, 103.0]), T + 9000, null)
assert.equal(r.fills.length, 0, 'scale needs a print strictly beyond the level')
r = bladeStep(p, tp([101]), T + BLADE.list.maxMs, 101.5)
assert.deepEqual(r.fills.map(f => f.why), ['TIMEOUT'], '15 min time limit at the mark')
assert.equal(bladeStep(p, tp([101]), T + BLADE.list.maxMs, null).done, false, 'no mark, no timeout fill')
const pd = bladeOpen('BD1', -1, 100, 0, T)
assert.deepEqual(bladeStep(pd, tp([98, 92.99]), T + 3000, null).fills.map(f => [f.why, f.px]), [['TARGET', 93]], 'delist target -7%')
assert.deepEqual(bladeStep(pd, tp([125]), T + 3000, null).fills.map(f => f.why), ['LIQUIDATION'], 'liquidation checked before the stop on a gap')
assert.equal(bladeStep(pd, [{ p: 90, T: T - 5 }], T + 3000, null).fills.length, 0, 'prints before the entry are ignored')
assert.ok(Math.abs(fillNet(1, 100, { why: 'SCALE', px: 103, T, frac: 0.5 }) - 0.5 * (0.03 - 0.001)) < 1e-12)
assert.ok(Math.abs(fillNet(-1, 100, { why: 'STOP', px: 104, T, frac: 1 }) - (-(104 * 1.0005 / 100 - 1) - 0.001)) < 1e-12, 'market exit pays slip')

// ── levels ──
const ev = (net: number, paper = false): BladeEvt => ({ net, closedAt: T, paper })
assert.equal(earnedLevel([]), 'SHADOW')
assert.equal(earnedLevel(Array(9).fill(ev(0.01))), 'SHADOW', '9 shadow events are not enough')
assert.equal(earnedLevel(Array(10).fill(ev(0.01))), 'PROBE')
assert.equal(earnedLevel([...Array(10).fill(ev(0.01)), ev(-0.2)]), 'SHADOW', 'shadow net must be > 0')
assert.equal(earnedLevel([...Array(10).fill(ev(0.01)), ...Array(30).fill(0).map((_, i) => ev(i % 3 ? 0.02 : -0.02, true))]), 'ATTACK')
assert.equal(earnedLevel([...Array(10).fill(ev(0.01)), ...Array(30).fill(ev(-0.01, true))]), 'SHADOW', 'a failed paper sample goes back to shadow')
assert.equal(effectiveLevel('ATTACK', undefined, [], null).level, 'SHADOW', 'default deploy cap = SHADOW')
assert.equal(effectiveLevel('ATTACK', 'PROBE', [], null).level, 'PROBE')
assert.equal(effectiveLevel('PROBE', 'ATTACK', [], null).level, 'PROBE', 'the cap never raises a level')
assert.equal(effectiveLevel('ATTACK', 'ATTACK', [20_000, 25_000, 30_000], null).level, 'PROBE', 'median lag > 15 s caps at PROBE')
assert.equal(effectiveLevel('ATTACK', 'ATTACK', [], null).level, 'PROBE', 'unmeasured lag caps at PROBE')
assert.equal(effectiveLevel('ATTACK', 'ATTACK', [3000, 5000, 4000], null).level, 'ATTACK')
assert.equal(effectiveLevel('ATTACK', 'ATTACK', [3000], 'day_loss').level, 'HALT', 'halt overrides everything')
assert.equal(haltReason(-301, 5000, 0), 'day_loss', '-6% of equity in a day'); assert.equal(haltReason(-299, 5000, 4), null); assert.equal(haltReason(0, 5000, 5), 'loss_streak')
assert.equal(lossStreak([1, -1, -2, -3]), 3)
assert.equal(bladeShimMax(), 'SHADOW')

// ── weapon 2 / 3 helpers ──
const cl = liqClusters([{ symbol: 'BTC', side: 'long', usd: 200_000, ts: T + 1000 }, { symbol: 'BTC', side: 'long', usd: 80_000, ts: T + 9000 }, { symbol: 'BTC', side: 'short', usd: 300_000, ts: T + 11_000 },
  { symbol: 'XYZ', side: 'long', usd: 900_000, ts: T }, { symbol: 'ETH', side: 'long', usd: 150_000, ts: T }, { symbol: 'ETH', side: 'short', usd: 150_000, ts: T + 1 }], new Set(['BTC', 'ETH']))
assert.deepEqual(cl.map(c => [c.symbol, c.t, Math.round(c.usd)]), [['BTC', T, 280000], ['BTC', T + 10000, 300000]], '10 s buckets, pinned coins, one-sided >= 70%')
assert.deepEqual(makerFilled(1, 100, tp([100.1, 100, 99.99]), T), { filled: true, T: T + 3000 }, 'buy limit fills on a print strictly below')
assert.equal(makerFilled(1, 100, tp([100.1, 100]), T).filled, false); assert.equal(makerFilled(-1, 100, [{ p: 101, T: T + 91_000 }], T).filled, false, '90 s window')

// ── ledger text: isolation, paper, caps ──
const sql = readFileSync(new URL('../supabase/migrations/20261004090000_blade_sleeve.sql', import.meta.url), 'utf8')
assert.ok(sql.includes("strategy=p_sleeve for update"), 'each call touches only its own sleeve')
assert.ok((sql.match(/strategy=p_sleeve for update/g) ?? []).length === 3, 'legs, closes and ratchets all filtered by sleeve')
assert.ok(sql.includes("not s.paper_mode then raise exception"), 'paper only')
assert.ok(sql.includes("strategy not in ('BLADE','DONCH4H') or paper_mode is not true"), 'foreign / non-paper row refused')
assert.ok(sql.includes("if p_level not in ('PROBE','ATTACK') then exit"), 'SHADOW / HALT never book money')
assert.ok(sql.includes('least(5,greatest(1,') && sql.includes('lv:=1;'), 'Blade <= 5x, DONCH4H 1x')
assert.ok(sql.includes("eq*0.0125*2.0") && sql.includes('eq*0.95-gross_open') && sql.includes('eq*0.70'), 'DONCH4H risk / heat / net caps')
assert.ok(sql.includes("interval '90 seconds'"), 'age gate re-checked in SQL')

// ── live path replay with a mocked exchange and database ──
const g = globalThis as any, realFetch = globalThis.fetch, realNow = Date.now
let now = T, open: any[] = [], events: any[] = [], commits: any[] = [], upserts: any[] = [], arts: Record<string, any[]> = { 48: [], 161: [] }, paperClosed: any[] = []
let klines4h: Record<string, any[]> = {}, tape: Record<string, { p: number; T: number }[]> = {}
const mkq = (table: string) => {
  const f: any = { table, eq: [] as any[], ins: null }
  const q: any = new Proxy({}, { get(_t, k) {
    if (k === 'throwOnError' || k === 'then') {
      const run = async () => {
        if (table === 'bot_trades') return { data: f.eq.some((e: any) => e[0] === 'strategy' && e[1] === 'BLADE') ? paperClosed : open }
        if (table === 'blade_events') return { data: f.eq.some((e: any) => e[0] === 'mode') ? events.filter(e => e.status === 'open' && e.mode === 'shadow') : events.filter(e => e.status === 'closed') }
        if (table === 'market_cache') return { data: [{ data: { pairs: [{ s: 'ICXUSDT' }] } }] }
        return { data: [] }
      }
      return k === 'then' ? (res: any, rej: any) => run().then(res, rej) : run
    }
    if (k === 'eq') return (a: string, b: any) => { f.eq.push([a, b]); return q }
    if (k === 'upsert') return (rows: any[]) => { upserts.push(...rows); return Promise.resolve({}) }
    if (k === 'update') return (row: any) => ({ eq: (_a: string, id: any) => { const e = events.find(x => x.id === id); if (e) Object.assign(e, row); return Promise.resolve({}) } })
    return () => q
  } }); return q
}
const db = { from: mkq, rpc(name: string, args: any) { return { throwOnError: async () => { commits.push({ name, ...args }); return { data: { opened: args.p_level === 'SHADOW' ? 0 : args.p_entries.length } } } } } }
Date.now = () => now
globalThis.fetch = (async (url: string) => {
  const ok = (j: any) => ({ ok: true, status: 200, json: async () => j })
  const cat = /catalogId=(\d+)/.exec(url)?.[1]
  if (cat) return ok({ data: { catalogs: [{ articles: arts[cat] }] } })
  if (url.includes('premiumIndex')) return ok([...perps].map(symbol => ({ symbol, markPrice: 1 })))
  if (url.includes('fundingRate')) return ok([])
  const dep = /depth\?symbol=([A-Z0-9]+)/.exec(url)?.[1]
  if (dep) return ok({ bids: [['99.99', '1000'], ['99.9', '1000']], asks: [['100.01', '1000'], ['100.1', '1000']], E: now })
  const kl = /klines\?symbol=([A-Z0-9]+)&interval=(\w+)/.exec(url)
  if (kl && kl[2] === '1m') return ok(Array.from({ length: 16 }, (_, i) => [now - (16 - i) * 60e3, '100', '100.4', '99.6', '100', '1', now - (15 - i) * 60e3 - 1]))
  if (kl && kl[2] === '4h') return ok(klines4h[kl[1]] ?? [])
  const ag = /aggTrades\?symbol=([A-Z0-9]+)/.exec(url)?.[1]
  if (ag) return ok((tape[ag] ?? []).map((x, i) => ({ a: i, p: String(x.p), T: x.T })))
  return { ok: false, status: 404, json: async () => ({}) }
}) as any
const st = (params: any = {}, bal = 5000) => ({ balance: bal, bot_params: params, hard_halt_at: null })
try {
  await assert.rejects(runBlade(db, st(), 'L', false), /paper-only/, 'paper lock')
  await assert.rejects(runDonch(db, st(), 'L', false), /paper-only/, 'paper lock')
  open = [{ strategy: 'PRO', paper_mode: true, lev: 10 }]
  await assert.rejects(runBlade(db, st(), 'L', true), /BLADE and DONCH4H/, 'refuses a mixed book'); await assert.rejects(runDonch(db, st(), 'L', true), /BLADE and DONCH4H/)
  open = []
  // first run seeds what is already published: nothing is "fresh", nothing decided
  arts = { 48: [{ releaseDate: T - 3600e3, title: 'Binance Will List Old (OLD)', code: 'a' }], 161: [] }
  const r0: any = await runBlade(db, st(), 'L', true)
  assert.equal(upserts.length, 0, 'seed run decides nothing'); const seen = commits.at(-1).p_note.seen; assert.equal(Object.keys(seen).length, 1); assert.equal(r0.level, 'SHADOW')
  // a listing published 8 s ago -> passes the gates -> SHADOW journal (virtual entry), no money even with a PROBE cap
  g.__BLADE_MAX_LEVEL = 'PROBE'
  now = T + 8_000; arts[48].unshift({ releaseDate: T, title: 'Binance Will List Hyperliquid (HYPE)', code: 'b' })
  await runBlade(db, st({ blade_cycle: { seen, poll_ts: 0 } }), 'L', true)
  const d = upserts.at(-1), c = commits.at(-1)
  assert.equal(d.rule, 'BL1'); assert.equal(d.mode, 'shadow'); assert.equal(d.gate, null); assert.equal(d.detect_lag_ms, 8000, 'detect lag journalled'); assert.equal(d.level, 'SHADOW', 'no record = SHADOW whatever the cap')
  assert.equal(c.p_entries.length, 0, 'shadow books nothing'); assert.equal(c.p_level, 'SHADOW'); assert.deepEqual(c.p_note.list_lags, [8000])
  assert.ok(d.entry_px >= 100.01 && d.entry_px < 100.1, 'virtual entry at the walked ask')
  // a listing first seen 40 s late -> skipped as too old, never chased
  now = T + 40_000; arts[48].unshift({ releaseDate: T, title: 'Binance Will List Late Coin (ICX)', code: 'c' })
  await runBlade(db, st({ blade_cycle: { ...commits.at(-1).p_note } }), 'L', true)
  assert.equal(upserts.at(-1).gate, 'too_old'); assert.equal(upserts.at(-1).mode, 'skipped')
  // the shadow row resolves on the tape: +3% scale then trailing stop -> net journalled, no bot_trades touched
  events = [{ id: 1, ...d, status: 'open', chk: d.pos.openedAt }]
  tape = { HYPEUSDT: [{ p: d.entry_px * 1.031, T: T + 20_000 }, { p: d.entry_px * 1.06, T: T + 21_000 }, { p: d.entry_px * 1.0, T: T + 22_000 }] }
  now = T + 60_000; await runBlade(db, st({ blade_cycle: { ...commits.at(-1).p_note } }), 'L', true)
  assert.equal(events[0].status, 'closed'); assert.deepEqual(events[0].fills.map((f: any) => f.why), ['SCALE', 'TRAIL']); assert.ok(events[0].net > 0)
  // PROBE: 10 positive shadow events + PROBE cap -> a fresh delisting books a paper short at 2% margin x 5
  events = Array.from({ length: 10 }, (_, i) => ({ id: 100 + i, mode: 'shadow', status: 'closed', net: 0.01, closed_at: new Date(T).toISOString() }))
  now = T + 100_000; arts[161].unshift({ releaseDate: now - 5_000, title: 'Binance Will Delist ICX on 2026-10-20', code: 'd' })
  await runBlade(db, st({ blade_cycle: { ...commits.at(-1).p_note } }), 'L', true)
  const cp = commits.at(-1)
  assert.equal(cp.p_level, 'PROBE'); assert.equal(cp.p_max_open, 1); assert.equal(cp.p_entries.length, 1)
  const e = cp.p_entries[0]
  assert.equal(e.side, 'SHORT'); assert.equal(e.lev, 5); assert.ok(Math.abs(e.notional - 5000 * 0.02 * 5) < 1e-6); assert.ok(Math.abs(e.stop / e.price - 1.04) < 1e-9, 'stop +4% for the short')
  assert.equal(e.meta.blade.rule, 'BD1'); assert.equal(upserts.at(-1).mode, 'paper')
  // P-AGG2 EVT2: the same engine as sleeve EVT — no levels, no profit gate, 8% margin x isolated 10x, <= 3 open
  const { evt2Profile } = await import('../supabase/functions/trading-bot/evt-runner.ts')
  const seenE = { ...commits.at(-1).p_note.seen }
  now = T + 130_000; arts[48].unshift({ releaseDate: now - 4_000, title: 'Binance Will List Hyper Two (HYPE)', code: 'e' })
  const evDay = new Date(now).toISOString().slice(0, 10)
  await runBlade(db, st({ evt2_cycle: { seen: seenE, poll_ts: 0 }, agg_day: { day: evDay, halted: true } }), 'L', true, evt2Profile())
  assert.equal(upserts.at(-1).gate, 'day_halt', 'the account day halt blocks EVT entries'); assert.equal(commits.at(-1).p_entries.length, 0)
  now = T + 131_000; arts[48].unshift({ releaseDate: now - 3_000, title: 'Binance Will List Hyper Three (HYPE)', code: 'f' })
  await runBlade(db, st({ evt2_cycle: { seen: { ...commits.at(-1).p_note.seen }, poll_ts: 0 } }), 'L', true, evt2Profile())
  const ce2 = commits.at(-1), e2 = ce2.p_entries[0]
  assert.equal(ce2.p_sleeve, 'EVT'); assert.equal(ce2.p_level, 'EVT'); assert.equal(ce2.p_max_open, 3); assert.equal(ce2.p_entries.length, 1, 'EVT enters with no record and no profit gate')
  assert.equal(e2.lev, 10); assert.ok(Math.abs(e2.notional - 5000 * 0.08 * 10) < 1e-6, '8% margin x 10'); assert.ok(Math.abs(e2.stop / e2.price - 0.96) < 1e-9, 'stop -4% long')
  assert.equal(upserts.at(-1).mode, 'paper'); assert.ok(upserts.at(-1).detect_lag_ms === 3000, 'lag journalled'); assert.ok(e2.meta.blade.pos.liq < e2.stop, 'liquidation (10x) beyond the 4% stop')
  g.__EVT_PER_TRADE = '0.5'; g.__EVT_MAX_OPEN = '9'
  assert.deepEqual([evt2Profile().marginFrac, evt2Profile().maxOpen, evt2Profile().lev], [0.08, 3, 10], 'shim cannot raise EVT above 8% / 3 / 10x')
  delete g.__EVT_PER_TRADE; delete g.__EVT_MAX_OPEN
  // isolation: a Blade cycle with a DONCH4H row open never closes it; a DONCH4H cycle never closes a BLADE row
  g.__BLADE_MAX_LEVEL = undefined
  open = [{ id: 7, strategy: 'DONCH4H', sym: 'BTC', side: 'LONG', entry_price: 100, size: 5, lev: 1, paper_mode: true, opened_at: new Date(T).toISOString(), scalp_meta: { ladder: { stage: 0, stopPx: 98, sizeOrig: 5, sizeLeft: 5, origSlDist: 2, chk: T } } },
    { id: 8, strategy: 'BLADE', sym: 'HYPE', side: 'LONG', entry_price: 100, size: 5, lev: 5, paper_mode: true, opened_at: new Date(T).toISOString(), scalp_meta: { notional0: 500, blade: { perp: 'HYPEUSDT', pos: bladeOpen('BL1', 1, 100, 0.5, T), chk: T } } }]
  tape = { HYPEUSDT: [{ p: 95, T: T + 1000 }], BTCUSDT: [{ p: 97, T: T + 1000 }] }
  now = T + 5_000; commits = []
  await runBlade(db, st({ blade_cycle: { seen: { x: { rel: 1 } }, ts_ms: 0 } }), 'L', true)
  const cb = commits.at(-1); assert.equal(cb.p_sleeve, 'BLADE'); assert.deepEqual(cb.p_closes.map((x: any) => x.id), [8], 'Blade closes only its own row')
  assert.equal(cb.p_closes[0].reason, 'STOP')
  await runDonch(db, st(), 'L', true)
  const cd = commits.at(-1); assert.equal(cd.p_sleeve, 'DONCH4H'); assert.deepEqual(cd.p_closes.map((x: any) => x.id), [7], 'DONCH4H closes only its own row'); assert.equal(cd.p_closes[0].reason, 'SL')
  // DONCH4H ladder: 0.6R leg banks a third at the level, stop to breakeven, row stays open
  open = [open[0]]; tape = { BTCUSDT: [{ p: 101.21, T: T + 1000 }] }; commits = []
  await runDonch(db, st(), 'L', true)
  const cl1 = commits.at(-1); assert.equal(cl1.p_legs.length, 1); assert.ok(Math.abs(cl1.p_legs[0].qty - 5 / 3) < 1e-9); assert.equal(cl1.p_legs[0].stop_after, 100); assert.equal(cl1.p_closes.length, 0)
  // DONCH4H entry: a 4h close above the 15-bar high with ADX > 22, first 15 minutes after the close
  open = []; commits = []
  const bar = Math.floor(T / DONCHX.barMs) * DONCHX.barMs; now = bar + 60_000
  const kb = Array.from({ length: 80 }, (_, i) => { const t0 = bar - (80 - i) * DONCHX.barMs, c0 = 50 + i * 0.6 + (i === 79 ? 6 : 0); return [t0, String(c0 - 0.3), String(c0 + 0.5), String(c0 - 0.8), String(c0), '100', t0 + DONCHX.barMs - 1] })
  kb.push([bar, '98', '99', '97', '98', '1', bar + DONCHX.barMs - 1])   // the bar still forming is ignored
  klines4h = { ETHUSDT: kb }
  await runDonch(db, st(), 'L', true)
  const ce = commits.at(-1); assert.equal(ce.p_entries.length, 1, 'one breakout'); const en = ce.p_entries[0]
  assert.equal(en.sym, 'ETH'); assert.equal(en.side, 'LONG'); assert.ok(en.price >= 100.01 * (1 + S.SLIP) - 1e-9, 'taker, never better than touch + slip')
  assert.ok(en.notional >= S.MIN_NOTIONAL && en.notional <= 5000 * S.PER_POSITION_CAP + 1e-6, 'sizeBreakout chain')
  assert.equal(en.meta.maker.filled, null); assert.equal(en.meta.maker.limit, 99.99, 'virtual post-only at the bid')
  assert.equal(ce.p_note.bar, bar)
  await runDonch(db, st({ donch_cycle: { bar } }), 'L', true)
  assert.equal(commits.at(-1).p_entries?.length ?? 0, 0, 'one scan per bar')
} finally { globalThis.fetch = realFetch; Date.now = realNow; delete g.__BLADE_MAX_LEVEL }

// ── v101.1: CMS watch polls about once a second until the deadline, stops on an unseen key, no DB involved ──
{
  const realNow2 = Date.now; let clock = 1_000_000; Date.now = () => clock
  const sleep = async (ms: number) => { clock += ms }
  try {
    let calls = 0
    const quiet = await cmsWatch(new Set(['a']), clock + BLADE_SCAN.watchUntilMs, async () => { calls++; return [{ rel: 1, key: 'a', title: 'x' }] }, sleep)
    assert.equal(quiet.hit, false); assert.equal(quiet.polls, 4, '4 polls ~1 s apart inside a 4.3 s window'); assert.equal(calls, 4)
    let n = 0
    const hit = await cmsWatch(new Set(['a']), clock + BLADE_SCAN.watchUntilMs, async () => (++n === 2 ? [{ rel: 2, key: 'b', title: 'Binance Will List X (X)' }] : [{ rel: 1, key: 'a', title: 'x' }]), sleep)
    assert.equal(hit.hit, true, 'a new article ends the watch'); assert.equal(hit.polls, 2)
    const bad = await cmsWatch(new Set(['a']), clock + 2_500, async () => { throw new Error('cms 48 HTTP 429') }, sleep)
    assert.equal(bad.hit, false); assert.equal(bad.errors, 2); assert.match(String(bad.err), /429/, 'errors are reported, never thrown')
    assert.ok(BLADE_SCAN.pollGapMs < 1000 && BLADE_SCAN.watchGapMs === 1000, 'scan about once a second')
  } finally { Date.now = realNow2 }
  const idx = readFileSync(new URL('../supabase/functions/trading-bot/index.ts', import.meta.url), 'utf8')
  assert.match(idx, /cmsWatch\(seenKeys, cycleStart \+ BLADE_SCAN\.watchUntilMs\)/, 'index.ts runs the watch inside the BLADE branch')
}
console.log('blade: all assertions passed')

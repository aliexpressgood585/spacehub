import assert from 'node:assert/strict'
import { parseAnnouncement, perpOf, eventEntries, eventNet, EV_HYPS } from '../shared/events.ts'

// parsing (titles as Binance publishes them)
assert.deepEqual(parseAnnouncement('Binance Will List Hyperliquid (HYPE) with Seed Tag Applied'), { kind: 'LIST', syms: ['HYPE'] })
assert.deepEqual(parseAnnouncement('Binance Will List Aerodrome (AERO)'), { kind: 'LIST', syms: ['AERO'] })
assert.deepEqual(parseAnnouncement('Binance Will Delist ICX, SCRT, STORJ on 2026-09-03'), { kind: 'DELIST', syms: ['ICX', 'SCRT', 'STORJ'] })
assert.deepEqual(parseAnnouncement('Binance Will Delist ACX, HFT and VIC on 2026-08-17'), { kind: 'DELIST', syms: ['ACX', 'HFT', 'VIC'] })
assert.equal(parseAnnouncement('Binance Futures Will Launch USDⓈ-Margined CTUSDT Perpetual Contract (2026-10-01)'), null, 'futures launches are not H7 events')
assert.equal(parseAnnouncement('Notice of Removal of Spot Trading Pairs - 2026-10-02'), null, 'pair removals are not delistings')
assert.equal(parseAnnouncement('Binance Will Close UAH Deposits and Withdrawals via Fiat Trade UAH and Delist USDT/UAH Spot Trading Pair'), null)

// perp mapping
const perps = new Set(['HYPEUSDT', '1000PEPEUSDT', 'ICXUSDT'])
assert.equal(perpOf('HYPE', perps), 'HYPEUSDT'); assert.equal(perpOf('PEPE', perps), '1000PEPEUSDT'); assert.equal(perpOf('SCRT', perps), null)

// entries: fresh announcement -> both holds; stale (> 10 min) -> nothing; no perp -> nothing; never twice
const T = Date.UTC(2026, 9, 1, 12, 0), marks = new Map([['HYPEUSDT', 40], ['ICXUSDT', 0.1]])
const arts = [{ releaseDate: T, title: 'Binance Will List Hyperliquid (HYPE)' }, { releaseDate: T, title: 'Binance Will Delist ICX, SCRT on 2026-10-15' }]
const taken = new Set<string>()
const e1 = eventEntries(arts, marks, T + 45e3, taken)
assert.deepEqual(e1.map(e => e.hyp).sort(), ['H7D240', 'H7D60', 'H7L240', 'H7L60'], 'one row per hypothesis, SCRT has no perp')
const l60 = e1.find(e => e.hyp === 'H7L60')!
assert.equal(l60.side, 1); assert.equal(l60.entry_px, 40); assert.equal(Date.parse(l60.exit_due), T + 45e3 + 60 * 60e3); assert.ok(l60.note.startsWith('lag 45s'))
assert.equal(e1.find(e => e.hyp === 'H7D60')!.side, -1, 'delisting = short')
assert.equal(eventEntries(arts, marks, T + 60e3, taken).length, 0, 'never entered twice')
assert.equal(eventEntries(arts, marks, T + 11 * 60e3, new Set()).length, 0, 'first seen > 10 min late = skipped')
assert.equal(eventEntries(arts, marks, T - 1, new Set()).length, 0, 'future-dated article ignored')
assert.ok(EV_HYPS.every(h => h.costRt === 0.004), '40 bps round trip')

// net: long +5% with 0.1% funding paid and 40 bps cost; short mirror receives positive funding
assert.ok(Math.abs(eventNet(1, 100, 105, 0.001, 0.004) - (0.05 - 0.001 - 0.004)) < 1e-12)
assert.ok(Math.abs(eventNet(-1, 100, 95, 0.001, 0.004) - (0.05 + 0.001 - 0.004)) < 1e-12)
console.log('events H7: all assertions passed')

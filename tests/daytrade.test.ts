// Day-trading coach paper desk rules (shared/daytrade.ts).
import fs from 'node:fs'
import { DT, dtPrep, dtSetups, dtCheck, dtSize, dtGate, dtManage, type Bar } from '../shared/daytrade.ts'
let n = 0, bad = 0
const ok = (c: boolean, m: string) => { n++; if (!c) { bad++; console.log('FAIL', m) } }
// sizing: 0.5% risk, <= 5x, liquidation >= 2x the stop
const z = dtSize(5000, 5000, 100, 99, DT.riskFrac)
ok(Math.abs(z.riskUsd - 25) < 1e-6 && Math.abs(z.notional - 2500) < 1e-6 && z.lev === 1 && z.ok, '0.5% risk at a 1% stop = $2,500 at 1x')
const tz = dtSize(5000, 1000, 100, 99.2, DT.riskFrac)
ok(tz.lev <= DT.maxLev && (1 / tz.lev - DT.mm) >= 2 * 0.008, 'leverage capped so liquidation sits >= 2x the stop away')
ok(tz.notional <= 1000 * tz.lev + 1e-9, 'never more notional than cash x leverage')
// day gates
const g = { equity: 5000, dayStart: 5000, dayEntries: 0, dayLosses: 0, streak: 0, lastLossAt: null }
ok(dtGate(g, 0) === null, 'clean day: allowed')
ok(dtGate({ ...g, equity: 4899 }, 0) !== null, '-2% day stops entries')
ok(dtGate({ ...g, dayLosses: 3 }, 0) !== null, '3 losses ends the day')
ok(dtGate({ ...g, dayEntries: 4 }, 0) !== null, 'max 4 entries a day')
ok(dtGate({ ...g, streak: 2, lastLossAt: 0 }, 3600_000) !== null && dtGate({ ...g, streak: 2, lastLossAt: 0 }, 3 * 3600_000) === null, '2 losses -> 2h pause, then back')
// management: stop first, gap at the open, BE at 1R, no-move after 8 bars, target
const bar = (o: number, h: number, l: number, c: number): Bar => ({ t: 0, o, h, l, c, v: 1 })
const P = () => ({ side: 'LONG' as const, entry: 100, stop: 99, target: 102, r0: 1, bars: 0, hit1R: false })
ok(dtManage(P(), bar(100, 103, 98.5, 101))!.why === 'STOP', 'stop first when both touched')
ok(dtManage(P(), bar(98, 98.5, 97.5, 98))!.px === 98, 'gap through the stop fills at the open')
ok(dtManage(P(), bar(100, 102.2, 99.5, 102))!.why === 'TARGET', 'target hit')
const p = P(); dtManage(p, bar(100, 101.2, 99.6, 101))
ok(p.hit1R && p.stop === 100, 'at +1R the stop moves to the entry')
ok(dtManage(p, bar(100.5, 100.6, 99.9, 100))!.why === 'BE', 'then a pullback exits at break-even')
const q = P(); let w: any = null; for (let k = 0; k < 8 && !w; k++) w = dtManage(q, bar(100, 100.3, 99.7, 100))
ok(w?.why === 'NO_MOVE' && q.bars === 8, 'no move for 8 bars -> exit')
// checklist: a stop tighter than 0.8% is widened; outside the trading hours F1 fails
const mk = (k: number, t0: number): Bar[] => Array.from({ length: k }, (_, i) => { const c = 100 + i * 0.05 + Math.sin(i / 3) * 0.4; return { t: t0 + i * 900_000, o: c - 0.05, h: c + 0.3, l: c - 0.3, c, v: 100 + (i % 7) } })
const b = mk(400, Date.UTC(2026, 9, 12, 0) - 300 * 900_000), pr = dtPrep(b)
const i = b.findIndex((x) => x.t + 900_000 === Date.UTC(2026, 9, 12, 8))
const c = { setup: 'S3', side: 'LONG' as const, stop: b[i].c * 0.998, target: null, note: 't' }
const r = dtCheck(pr, i, c, b[i].c, { btcDir: 1, funding: 0.0001, vol24Usd: null })
ok(Math.abs(r.stopPct - DT.minStop) < 1e-12 && Math.abs(r.costR! - DT.rt / DT.minStop) < 1e-12, 'tight stop widened to 0.8% (cost 0.2R)')
ok(r.checks.find((x) => x.k.startsWith('F1'))!.ok, '08:00 UTC Monday is London hours')
const j = b.findIndex((x) => x.t + 900_000 === Date.UTC(2026, 9, 12, 20))
ok(!dtCheck(pr, j, c, b[j].c, { btcDir: 1, funding: 0, vol24Usd: null }).checks.find((x) => x.k.startsWith('F1'))!.ok, '20:00 UTC fails F1')
ok(!dtCheck(pr, i, c, b[i].c, { btcDir: -1, funding: 0, vol24Usd: null }).checks.find((x) => x.k.startsWith('F3'))!.ok, 'BTC against the side fails F3')
ok(!dtCheck(pr, i, c, b[i].c, { btcDir: 1, funding: 0.001, vol24Usd: null }).checks.find((x) => x.k.startsWith('F6'))!.ok, 'crowded funding fails F6')
ok(Array.isArray(dtSetups(pr, i)), 'setups scan runs on prepared bars')
// desk wiring: paper only, shared rules, no keys, no order endpoints
const src = fs.readFileSync(new URL('../scripts/daytrade-desk.ts', import.meta.url), 'utf8')
ok(/from '\.\.\/shared\/daytrade\.ts'/.test(src) && !/(apiKey|secret|signature|privateKey)/i.test(src), 'desk imports the shared rules and holds no keys')
ok(!/\/trade\/order|\/api\/v5\/trade/.test(src), 'desk never calls an order endpoint')
console.log(`daytrade desk: ${n - bad}/${n} passed`)
if (bad) process.exit(1)

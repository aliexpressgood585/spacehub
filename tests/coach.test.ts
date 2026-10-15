// Quant-coach futures paper desk rules (shared/coach.ts).
import fs from 'node:fs'
import { COACH, coachSignal, coachSize, coachRisk, coachExit, ema, type Bar } from '../shared/coach.ts'
let n = 0, bad = 0
const ok = (c: boolean, m: string) => { n++; if (!c) { bad++; console.log('FAIL', m) } }
// sizing: 1% risk, leverage capped at 5x, liquidation >= 2x the stop
const z = coachSize(5000, 5000, 100, 98, 0.01)
ok(Math.abs(z.riskUsd - 50) < 1e-6 && Math.abs(z.notional - 2500) < 1e-6, '1% risk at a 2% stop = $2,500 notional on $5,000')
ok(z.lev === 1 && z.ok, 'enough cash -> 1x')
const t = coachSize(5000, 5000, 100, 99.5, 0.01)
ok(t.notional === 10000 && t.lev === 2 && t.ok, 'tight stop: $10,000 needs 2x isolated')
ok((1 / t.lev - COACH.mm) >= 2 * 0.005, 'liquidation distance >= 2 x stop distance')
const big = coachSize(5000, 5000, 100, 99.9, 0.01)
ok(big.notional <= 5000 * COACH.maxLev && big.lev <= COACH.maxLev, 'never above 5x equity / 5x leverage')
// account gates
const base = { equity: 5000, peak: 5000, dayStart: 5000, weekStart: 5000, streak: 0, lastLossAt: null }
ok(coachRisk(base, 0).mult === 1, 'clean account: full size')
ok(coachRisk({ ...base, equity: 4849 }, 0).mult === 0, 'day -3% stops entries')
ok(coachRisk({ ...base, equity: 4690, dayStart: 4700 }, 0).mult === 0, 'week -6% stops entries')
ok(coachRisk({ ...base, streak: 2, lastLossAt: 0 }, 3600_000).mult === 0 && coachRisk({ ...base, streak: 2, lastLossAt: 0 }, 3 * 3600_000).mult === 1, 'two losses -> 2h pause, then back')
ok(coachRisk({ ...base, equity: 4200, dayStart: 4200, weekStart: 4200 }, 0).mult === 0.5, 'DD 15% -> half size')
ok(coachRisk({ ...base, equity: 5200 }, 0).mult === 0.5, 'day up 3% -> half size (P5)')
// exits: stop first when both touched; gap through the stop fills at the open
const p = { side: 'LONG' as const, entry: 100, stop: 98, target: 104, bars: 1 }
ok(coachExit(p, { t: 0, o: 100, h: 105, l: 97, c: 101, v: 0 })!.why === 'STOP', 'stop first inside a bar')
ok(coachExit(p, { t: 0, o: 96, h: 97, l: 95, c: 96, v: 0 })!.px === 96, 'gap through the stop fills at the open')
ok(coachExit(p, { t: 0, o: 101, h: 104.5, l: 100, c: 104, v: 0 })!.why === 'TARGET', 'target 2R')
ok(coachExit({ ...p, bars: 30 }, { t: 0, o: 101, h: 102, l: 100, c: 101, v: 0 })!.why === 'TIME', '30-bar time stop')
// signal: an uptrend above the daily EMA200 breaking out with ADX > 25 -> LONG; inside the range -> none
const mk = (k: number, f: (i: number) => number, step: number): Bar[] => Array.from({ length: k }, (_, i) => { const c = f(i); return { t: i * step, o: c * 0.999, h: c * 1.004, l: c * 0.996, c, v: 1 } })
const daily = mk(260, (i) => 50 + i * 0.2, 86400_000)
const b4 = mk(61, (i) => 90 + i * 0.25, 14400_000)
b4[60] = { ...b4[60], c: b4[59].h * 1.01, h: b4[59].h * 1.012 }
const s = coachSignal({ bars: b4, daily, funding: 0.0001, vol24Usd: 2e8, nowMs: Date.UTC(2026, 9, 15, 8) })
ok(s.side === 'LONG' && s.stop < s.entry, 'trend breakout above EMA200 with ADX > 25 -> LONG with the stop below')
ok(coachSignal({ bars: b4, daily, funding: 0.001, vol24Usd: 2e8, nowMs: Date.UTC(2026, 9, 15, 8) }).side === null, 'crowded funding blocks the long (F5)')
ok(coachSignal({ bars: b4, daily, funding: 0.0001, vol24Usd: 5e7, nowMs: Date.UTC(2026, 9, 15, 8) }).side === null, 'thin volume blocks (F4)')
ok(coachSignal({ bars: b4, daily, funding: 0.0001, vol24Usd: 2e8, nowMs: Date.UTC(2026, 9, 15, 13, 30) }).side === null, 'US-open window blocks (F7)')
ok(coachSignal({ bars: b4, daily: mk(260, (i) => 150 - i * 0.2, 86400_000), funding: 0, vol24Usd: 2e8, nowMs: Date.UTC(2026, 9, 15, 8) }).side === null, 'long breakout below the daily EMA200 is not taken (F1)')
ok(Math.abs(ema([1, 2, 3, 4], 2)[3] - 3.5) < 1e-9, 'ema seeds with the SMA')
// desk wiring: paper only, one rule module
const src = fs.readFileSync(new URL('../scripts/coach-desk.ts', import.meta.url), 'utf8')
ok(/from '\.\.\/shared\/coach\.ts'/.test(src) && !/(apiKey|secret|signature|privateKey)/i.test(src), 'desk imports the shared rules and holds no keys')
ok(!/\/trade\/order|\/api\/v5\/trade/.test(src), 'desk never calls an order endpoint')
console.log(`coach desk: ${n - bad}/${n} passed`)
if (bad) process.exit(1)

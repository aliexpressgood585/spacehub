// "ערכת הדיי טריידר" rules (shared/dtk.ts): setups, the exit walk with costs, the replay, the Monte Carlo, budget and risk checks.
import fs from 'node:fs'
import { DTK, PAPER, tmGate, walkBook, exitTrigger, setupsAt, walk, replay, monteCarlo, budget, riskChecks, coinsIn, parseRss, mulberry32, type Bar } from '../shared/dtk.ts'
let n = 0, bad = 0
const ok = (c: boolean, m: string) => { n++; if (!c) { bad++; console.log('FAIL', m) } }
const D0 = Date.UTC(2026, 9, 20), B = DTK.bar
const flat = (k: number, px = 100, t0 = D0 - 40 * B): Bar[] => Array.from({ length: k }, (_, i) => ({ t: t0 + i * B, o: px, h: px + 0.2, l: px - 0.2, c: px, v: 10 }))

// ORB: 40 bars of yesterday, the 3 opening bars set 99.5..100.5, then a close at 101 is the first break
const orb = flat(40).concat([{ t: D0, o: 100, h: 100.5, l: 99.5, c: 100, v: 10 }, { t: D0 + B, o: 100, h: 100.4, l: 99.6, c: 100, v: 10 }, { t: D0 + 2 * B, o: 100, h: 100.3, l: 99.7, c: 100, v: 10 }, { t: D0 + 3 * B, o: 100, h: 101.1, l: 100, c: 101, v: 10 }])
const s1 = setupsAt(orb, orb.length - 1).find((s) => s.kind === 'ORB')
ok(!!s1 && s1.side === 'LONG' && s1.stop === 100 && s1.target === 102, 'ORB long: stop at the range midpoint, target 1R')
orb.push({ t: D0 + 4 * B, o: 101, h: 101.6, l: 101, c: 101.5, v: 10 })
ok(!setupsAt(orb, orb.length - 1).some((s) => s.kind === 'ORB'), 'ORB fires only on the first close beyond the range')
const mid = flat(60, 100, D0 + 10 * B)                     // window starts mid-day: no opening range known -> no ORB
ok(!setupsAt(mid, mid.length - 1).some((s) => s.kind === 'ORB'), 'no ORB without the day opening bars')

// walk: stop first when both levels are in one bar; costs included; unfinished = null
const s = { side: 'LONG' as const, entry: 100, stop: 99, target: 101 }
const both = [...flat(5), { t: D0, o: 100, h: 101.5, l: 98.5, c: 100, v: 1 }]
ok(walk(both, 4, s)?.res === 'STOP', 'stop first when one bar touches both')
const up = [...flat(5), { t: D0, o: 100, h: 101.2, l: 99.8, c: 101, v: 1 }], w1 = walk(up, 4, s)!
ok(w1.res === 'TARGET' && Math.abs(w1.R - (1 - 0.0016 * 100)) < 1e-9, 'target R net of the 16 bps round trip (0.16R on a 1% stop)')
ok(walk(flat(10), 5, s) === null, 'a trade that has not finished is not counted')
ok(walk(flat(60), 5, s)?.res === 'TIME', 'flat after the hold limit')

// replay + Monte Carlo on a random walk: no edge before costs -> negative after costs; deterministic with a seed
const rnd = mulberry32(7), rw: Bar[] = []; let px = 100
for (let i = 0; i < 3000; i++) { const o = px; px *= 1 + (rnd() - 0.5) * 0.008; rw.push({ t: D0 - 3000 * B + i * B, o, h: Math.max(o, px) * (1 + rnd() * 0.002), l: Math.min(o, px) * (1 - rnd() * 0.002), c: px, v: 5 + rnd() * 10 }) }
let fired = 0; for (const k of ['ORB', 'FLAG', 'BOUNCE', 'BURST'] as const) for (const sd of ['LONG', 'SHORT'] as const) { const r = replay(rw, k, sd); fired += r.n; ok(r.n === 0 || r.target + r.stop + r.time === r.n, `replay counts add up ${k} ${sd}`) }
ok(fired > 20, `setups fire on a random walk (${fired})`)
const all = (['ORB', 'FLAG', 'BOUNCE', 'BURST'] as const).flatMap((k) => (['LONG', 'SHORT'] as const).map((sd) => replay(rw, k, sd)))
const R = all.reduce((a, r) => a + r.sumR, 0) / Math.max(1, all.reduce((a, r) => a + r.n, 0))
ok(R < 0, `random walk loses after costs (${R.toFixed(3)}R)`)
const sig = { side: 'LONG' as const, entry: px, stop: px * 0.99, target: px * 1.01, t: rw[rw.length - 1].t }
const m1 = monteCarlo(rw, sig, 3000, 5), m2 = monteCarlo(rw, sig, 3000, 5)
ok(m1.target === m2.target && Math.abs(m1.target + m1.stop + m1.time - 1) < 1e-9, 'Monte Carlo is seeded and its shares add up to 1')
ok(Math.abs(m1.target - m1.stop) < 0.08, `symmetric 1R bracket on a random walk is ~a coin flip (${m1.target.toFixed(2)} vs ${m1.stop.toFixed(2)})`)
ok(m1.evR < 0, 'and its expectancy is negative after costs')

// budget + risk
const bu = budget({ side: 'LONG', entry: 100, stop: 99, target: 102 }, 50, 5000, 5)
ok(Math.abs(bu.lossAtStop - 50) < 1e-6 && bu.notional < 5000 * 5, 'size so a stop-out (fees included) loses exactly the max loss')
ok(Math.abs(bu.liq - 100 * (1 - 0.195)) < 1e-9, 'isolated liquidation price at 5x')
const big = budget({ side: 'LONG', entry: 100, stop: 99.9, target: 100.2 }, 50, 1000, 2)
ok(big.notional <= 2000 + 1e-6, 'notional capped by account x leverage')
const rc = riskChecks({ side: 'LONG', entry: 100, stop: 99, target: 102 }, bu, { spreadBps: 2, volUsd: 50e6, funding: 0.0001, dayPnl: 0, tradesToday: 0 })
ok(rc.pass, 'a clean trade passes every check')
const tight = budget({ side: 'LONG', entry: 100, stop: 99.7, target: 100.3 }, 50, 5000, 5)
const rc2 = riskChecks({ side: 'LONG', entry: 100, stop: 99.7, target: 100.3 }, tight, { spreadBps: 2, volUsd: 50e6, funding: null, dayPnl: -120, tradesToday: 4 })
ok(!rc2.pass && rc2.checks.filter((c) => c.ok === false).length >= 3 && rc2.checks.some((c) => c.ok === null), 'tight stop / day loss / trade count block; unknown funding is not a pass')

// news
ok(coinsIn('Bitcoin slides below $80,000 as SOL and $PEPE fall', ['BTC', 'SOL', 'PEPE', 'ONE']).sort().join() === 'BTC,PEPE,SOL', 'coins named in a headline')
ok(coinsIn('One more thing about the market', ['ONE']).length === 0, 'common words are not coins')
const rss = parseRss('<rss><item><title><![CDATA[ETH &amp; BTC rally]]></title><link>https://x/1</link><pubDate>Sat, 24 Oct 2026 18:00:00 GMT</pubDate></item></rss>')
ok(rss.length === 1 && rss[0].title === 'ETH & BTC rally' && rss[0].at === Date.UTC(2026, 9, 24, 18), 'RSS parse')

// demo account helpers
const wb = walkBook([[100, 1], [100.5, 2], [101, 10]], 2)
ok(Math.abs(wb.vwap - 100.25) < 1e-9 && wb.filled === 2, 'market order walks the book (VWAP)')
ok(walkBook([[100, 1]], 3).filled === 1, 'a thin book fills only what it shows')
const m1b = (t: number, o: number, h: number, l: number): Bar => ({ t, o, h, l, c: o, v: 1 })
ok(exitTrigger([m1b(0, 100, 101.5, 98.5)], 'LONG', 99, 101, 0)?.why === 'STOP', 'one minute touching both = stop')
ok(exitTrigger([m1b(0, 98, 98.5, 97)], 'LONG', 99, 101, 0)?.px === 98, 'a gap through the stop fills at the open')
ok(exitTrigger([m1b(0, 100, 100.4, 99.5), m1b(60000, 100.3, 101.2, 100.1)], 'LONG', 99, 101, 0)?.px === 101, 'take-profit at the level')
ok(exitTrigger([m1b(0, 100, 100.4, 98)], 'LONG', 99, 101, 120000) === null, 'minutes before the last check are ignored')
ok(exitTrigger([m1b(0, 100, 101.5, 99.5)], 'SHORT', 101, 99, 0)?.why === 'STOP', 'short stop above')
ok(!tmGate(null).ok && !tmGate({ n: 29, avgR: 0.5 }).ok && !tmGate({ n: 40, avgR: -0.01 }).ok && !tmGate({ n: 40, avgR: 0 }).ok && tmGate({ n: 30, avgR: 0.01 }).ok, 'time-machine gate: >= 30 firings and positive average R, unknown is not a pass')
{ const src = fs.readFileSync('scripts/dtk-scan.ts', 'utf8'), a = src.indexOf('tmGate(s.replay)\n    if (!tg.ok)'), b = src.indexOf('riskChecks(plan')
  ok(a > 0 && a < b, 'demo entries pass the time-machine gate before the risk manager') }
ok(PAPER.start === 1000 && PAPER.riskPct === 0.01, '$1,000 demo account, 1% risk per trade')

const src = fs.readFileSync(new URL('../scripts/dtk-scan.ts', import.meta.url), 'utf8'), wf = fs.readFileSync(new URL('../.github/workflows/dtk-scan.yml', import.meta.url), 'utf8')
ok(!/\/trade\/order|privateKey|apiKey|OK-ACCESS/i.test(src), 'scanner is read-only: no order endpoint, no keys')
// every shared module reachable from the scanner (transitively) must be copied by the workflow (the first run died on universe.ts)
const need = new Set<string>(), todo = [...src.matchAll(/from '\.\.\/shared\/([\w-]+\.ts)'/g)].map((m) => m[1])
while (todo.length) { const m = todo.pop()!; if (need.has(m)) continue; need.add(m); const t = fs.readFileSync(new URL(`../shared/${m}`, import.meta.url), 'utf8'); for (const x of t.matchAll(/from '\.\/([\w-]+\.ts)'/g)) todo.push(x[1]) }
ok(need.size >= 4 && [...need].every((m) => wf.includes(`shared/${m}`)), `workflow copies every shared module the scanner imports (${[...need].join(', ')})`)
console.log(`dtk: ${n - bad}/${n} passed`)
if (bad) process.exit(1)

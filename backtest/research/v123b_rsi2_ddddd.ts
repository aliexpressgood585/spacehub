// v123b — the two newest strategies, on all the history there is (owner 2026-10-08, same request as v123):
//  A. RSI2 (the CURRENT live paper strategy, shared/rsi2-forward.ts, frozen 2026-10-08): run with the shared module's
//     OWN indicator / signal / entry / exit / result functions on the full Binance USDT-M archive of its two contracts.
//     TRADOORUSDT trades since 2025-09 and MYXUSDT since 2025-06, so "3 years" does not exist for them; every month
//     there is was used. Costs are the module's own: 0.12% round trip (stress 0.16%) + settled funding.
//  B. The same RSI2 rule WITHOUT the per-coin extra filter (TRADOOR ADX<25 / MYX volume), on the 10 majors' 5m archive,
//     2023-09-01 .. 2026-08-31 — the rule on coins nobody picked it for, over 3 years. 15m bars are built from the 5m.
//  C. DDDDD (shared/ddddd.ts d5Signal: five red 5m candles -> LONG at the next open; +1% / -1% bracket as in
//     scripts/backtest-3year-all-active.py) on the same 10 majors, 3 years, taker 5 + slip 3 bps per side + funding.
//     The live DDDDD ran on a top-10 list chosen from a 90-day scan; these 10 coins were not chosen by it.
// Run: node --experimental-strip-types backtest/research/v123b_rsi2_ddddd.ts <dir with TRADOOR/MYX archive csv>
//      > status/rsi2-ddddd-v123b.txt
import fs from 'node:fs'
import { SPEC, indicators, update, signal, enter, exit, result, type Bar, type Funding, type Position } from '../../shared/rsi2-forward.ts'
import { d5Signal } from '../../shared/ddddd.ts'

const ARCH = process.argv[2] ?? ''
const DATA = new URL('../data/', import.meta.url).pathname
const T0 = Date.UTC(2023, 8, 1), T1 = Date.UTC(2026, 8, 1), M5 = 300_000, M15 = 900_000
const num = (l: string) => l && l[0] >= '0' && l[0] <= '9'
const toBar = (f: string[], ms: number): Bar => ({ t: +f[0], end: +f[0] + ms, o: +f[1], h: +f[2], l: +f[3], c: +f[4], v: +f[5] })
function archive(sym: string, kind: string): string[][] {
  if (!ARCH) return []
  return fs.readdirSync(ARCH).filter((n) => n.startsWith(`${sym}-${kind}-`) && n.endsWith('.csv')).sort()
    .flatMap((n) => fs.readFileSync(`${ARCH}/${n}`, 'utf8').split('\n').filter(num).map((l) => l.split(',')))
}
const local = (c: string) => fs.readFileSync(`${DATA}${c}-5m.csv`, 'utf8').split('\n').filter(num).map((l) => toBar(l.split(','), M5))
const localFunding = (c: string) => { const p = `${DATA}${c}-funding.csv`; return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split('\n').filter(num).map((l) => l.split(',')).map((f) => ({ t: +f[0], rate: +f[2] })) : [] }
// 15m from 5m, complete UTC buckets only
function to15(b5: Bar[]): Bar[] {
  const out: Bar[] = []
  for (let i = 0; i + 2 < b5.length; i++) {
    const a = b5[i]; if (a.t % M15 !== 0) continue
    const x = b5[i + 1], y = b5[i + 2]
    if (x.t !== a.t + M5 || y.t !== a.t + 2 * M5) continue
    out.push({ t: a.t, end: a.t + M15, o: a.o, h: Math.max(a.h, x.h, y.h), l: Math.min(a.l, x.l, y.l), c: y.c, v: a.v + x.v + y.v })
  }
  return out
}
// funding mark = the 5m close of the bar the settlement falls in (the archive has no mark column)
function withMark(f: { t: number; rate: number }[], b5: Bar[]): Funding[] {
  const m = new Map<number, number>(); for (const b of b5) m.set(b.t, b.c)
  return f.map((x) => ({ t: x.t, rate: x.rate, mark: m.get(Math.floor(x.t / M5) * M5) ?? NaN })).filter((x) => Number.isFinite(x.mark)).sort((a, b) => a.t - b.t)
}

type R = ReturnType<typeof result> & { sym: string }
// The frozen engine's loop (shared/rsi2-forward.ts advance), on history: same order of operations, with a gap in the
// archive resetting the indicator state instead of throwing (live refuses to advance over a gap; history must go on).
function rsi2(sym: string, b5: Bar[], b15: Bar[], fund: Funding[], sig: (f: ReturnType<typeof indicators>, q: ReturnType<typeof indicators>) => number, from: number, to: number): R[] {
  const out: R[] = []
  let five = indicators(), fifteen = indicators(), pending: { side: number; atr: number; signalTs: number } | null = null, pos: Position | null = null, j = 0
  for (let i = 0; i < b5.length; i++) {
    const b = b5[i]
    if (i && b.t !== b5[i - 1].t + M5) {   // gap: close what is open at this open, restart the indicators
      if (pos) { out.push({ ...result(pos, { px: b.o, ts: b.t, reason: 'GAP' }, fund), sym }); pos = null }
      five = indicators(); fifteen = indicators(); pending = null
      while (j < b15.length && b15[j].end <= b.t) j++
    }
    while (j < b15.length && b15[j].end <= b.end) {
      try { if (!fifteen.last || b15[j].t > fifteen.last.t) update(fifteen, b15[j]) } catch { fifteen = indicators(); update(fifteen, b15[j]) }
      j++
    }
    if (pending && !pos) { pos = enter(pending.side, pending.atr, pending.signalTs, b); pending = null }
    if (pos) { const x = exit(pos, b, true); if (x) { out.push({ ...result(pos, x, fund), sym }); pos = null } }
    update(five, b)
    if (b.end >= from && b.end < to && !pos && !pending && five.count >= SPEC.warmupBars) {
      const side = sig(five, fifteen)
      if (side) pending = { side, atr: five.atr!, signalTs: b.end }
    }
  }
  return out
}
// shared signal() without the symbol whitelist and the per-coin extra filter: the core RSI2 rule
function core(five: ReturnType<typeof indicators>, fifteen: ReturnType<typeof indicators>): number {
  const b = five.last, t = fifteen.last
  if (!b || !t || five.count < 200 || fifteen.count < 200 || t.end > b.end || t.end !== Math.floor(b.end / M15) * M15 ||
    five.rsi === null || !(five.atr! > 0) || five.ema200 === null || fifteen.ema200 === null || fifteen.ema50 === null) return 0
  if (five.rsi <= SPEC.rsiLong && b.c > five.ema200 && t.c > fifteen.ema200 && fifteen.ema50 > fifteen.ema200) return 1
  if (five.rsi >= SPEC.rsiShort && b.c < five.ema200 && t.c < fifteen.ema200 && fifteen.ema50 < fifteen.ema200) return -1
  return 0
}

const pct = (x: number, d = 1) => (x * 100).toFixed(d) + '%'
function line(label: string, rs: { net: number; stressNet?: number; side: number; reason?: string }[]) {
  const n = rs.length, w = rs.filter((r) => r.net > 0).length, ws = rs.filter((r) => (r.stressNet ?? r.net) > 0).length
  const win = rs.filter((r) => r.net > 0).reduce((s, r) => s + r.net, 0), loss = -rs.filter((r) => r.net <= 0).reduce((s, r) => s + r.net, 0)
  const sum = rs.reduce((s, r) => s + r.net, 0)
  const L = rs.filter((r) => r.side > 0), S = rs.filter((r) => r.side < 0)
  const wr = (a: typeof rs) => (a.length ? pct(a.filter((r) => r.net > 0).length / a.length, 0) : '-')
  return `${label.padEnd(30)} n ${String(n).padStart(5)}  WR ${pct(n ? w / n : 0).padStart(6)} (stress ${pct(n ? ws / n : 0)})  avgWin ${pct(w ? win / w : 0, 2)}  avgLoss ${pct(n - w ? -loss / (n - w) : 0, 2)}  net ${(n ? sum / n * 1e4 : 0).toFixed(1).padStart(6)} bps/trade (stress ${(n ? rs.reduce((s, r) => s + (r.stressNet ?? r.net), 0) / n * 1e4 : 0).toFixed(1)})  PF ${(loss > 0 ? win / loss : 0).toFixed(2)}  sum ${pct(sum, 0).padStart(6)}  | L ${L.length} WR ${wr(L)}  S ${S.length} WR ${wr(S)}`
}
const out: string[] = []
out.push('v123b — RSI2 (the current paper strategy) and DDDDD, on all available history; trade level, equal notional per trade')
out.push('WR = share of trades with net P&L > 0 after costs. sum = sum of net % per trade (x $10 = what $1,000 a trade made).')
out.push('')

// A. RSI2 exact, its two contracts
out.push(`A. RSI2 exact (shared/rsi2-forward.ts signal incl. the per-coin filter), full Binance archive, costs ${SPEC.costRt * 100}% RT (stress ${SPEC.stressRt * 100}%) + settled funding`)
const allA: R[] = []
for (const sym of SPEC.symbols) {
  const b5 = archive(sym, '5m').map((f) => toBar(f, M5)), b15 = archive(sym, '15m').map((f) => toBar(f, M15))
  if (!b5.length) { out.push(`${sym}: no archive given`); continue }
  const fund = withMark(archive(sym, 'fundingRate').map((f) => ({ t: +f[0], rate: +f[2] })), b5)
  const rs = rsi2(sym, b5, b15, fund, (f, q) => signal(sym, f, q), 0, Infinity)
  allA.push(...rs)
  out.push(line(`${sym} ${new Date(b5[0].t).toISOString().slice(0, 7)}..${new Date(b5[b5.length - 1].t).toISOString().slice(0, 7)}`, rs))
  const by = new Map<string, number[]>(); for (const r of rs) { if (!by.has(r.reason)) by.set(r.reason, []); by.get(r.reason)!.push(r.net) }
  out.push('   exits: ' + [...by].map(([k, a]) => `${k} ${a.length} (${pct(a.filter((x) => x > 0).length / a.length, 0)} win, ${(a.reduce((s, x) => s + x, 0) / a.length * 1e4).toFixed(0)} bps)`).join(' | '))
}
out.push(line('both contracts', allA))
out.push('   target 1 ATR vs stop 2 ATR: before costs the break-even WR is 66.7%, after costs higher (by cost / 3 ATR)')
out.push('')

// B + C on the 10 majors, 3 years
const C10 = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'DOT']
type D = { sym: string; net: number; side: number; gross: number; reason: string; t0: number }
const COST = 2 * (0.0005 + 0.0003)
// DDDDD: five red closed 5m bars -> long at the next open, +1% / -1% from the fill, stop first, no timeout;
// one position at a time. Funding: settled rates over the hold.
function ddddd(sym: string, b5: Bar[], fund: Funding[], from: number, to: number): D[] {
  const out: D[] = []
  let busy = 0, fi = 0
  for (let i = 5; i < b5.length - 1; i++) {
    const b = b5[i]
    if (b.end < from || b.end >= to || b.t < busy) continue
    const lb = b5.slice(i - 4, i + 1).map((x) => ({ t: x.t, open: x.o, high: x.h, low: x.l, close: x.c, vol: x.v }))
    if (!d5Signal(lb, b.end).sig) continue
    const e0 = b5[i + 1].o, E = e0 * 1.0003, tp = E * 1.01, sl = E * 0.99
    let k = i + 1, px = 0, why = ''
    for (; k < b5.length; k++) {
      const x = b5[k]
      if (x.o <= sl) { px = x.o * 0.9997; why = 'STOP'; break }
      if (x.l <= sl) { px = sl * 0.9997; why = 'STOP'; break }
      if (x.h >= tp) { px = tp; why = 'TARGET'; break }
    }
    if (!why) break
    while (fi < fund.length && fund[fi].t < b5[i + 1].t) fi++
    let fsum = 0; for (let q = fi; q < fund.length && fund[q].t < b5[k].end; q++) fsum += fund[q].rate
    out.push({ sym, net: px / E - 1 - COST - fsum, gross: (why === 'TARGET' ? px : px / 0.9997) / e0 - 1, side: 1, reason: why, t0: b5[i + 1].t })
    busy = b5[k].end
  }
  return out
}
const allB: R[] = [], allC: D[] = []
for (const c of C10) {
  const b5 = local(c), b15 = to15(b5), fund = withMark(localFunding(c), b5)
  allB.push(...rsi2(c, b5, b15, fund, core, T0, T1))
  allC.push(...ddddd(c, b5, fund, T0, T1))
}
out.push(`B. RSI2 core rule (no per-coin filter) on the 10 majors, 5m, ${new Date(T0).toISOString().slice(0, 10)}..${new Date(T1 - 1).toISOString().slice(0, 10)}, same costs`)
out.push(line('10 majors, 3 years', allB))
for (const c of C10) out.push(line(`   ${c}`, allB.filter((r) => r.sym === c)))
out.push('')
out.push(`C. DDDDD (five red 5m candles -> long, +1% / -1%), 10 majors, 3 years, taker 5 + slip 3 bps per side + funding`)
out.push(line('10 majors, 3 years', allC))
for (const c of C10) out.push(line(`   ${c}`, allC.filter((r) => r.sym === c)))
out.push(`   the bracket is symmetric: before costs it needs 50% to break even, after ${(COST * 100).toFixed(2)}% round trip about ${pct(0.5 + COST / 0.02, 0)}`)
out.push('')
// D. DDDDD on the top-10 list the live paper cohort traded (commit a2f994e, chosen from a 90-day scan), every month of
// Binance archive each contract has since 2023-09. NB the list was picked on recent data, so the last months are in-sample.
const TOP10 = ['ANKRUSDT', 'ARKUSDT', '1000000MOGUSDT', 'AGTUSDT', 'SUSHIUSDT', 'LQTYUSDT', 'HYPERUSDT', 'KAVAUSDT', 'LUMIAUSDT', 'ALPINEUSDT']
const allD: D[] = []
const spanD: Record<string, string> = {}
for (const sym of TOP10) {
  const b5 = archive(sym, '5m').map((f) => toBar(f, M5)); if (!b5.length) continue
  const fund = withMark(archive(sym, 'fundingRate').map((f) => ({ t: +f[0], rate: +f[2] })), b5)
  spanD[sym] = `${new Date(b5[0].t).toISOString().slice(0, 7)}..${new Date(b5[b5.length - 1].t).toISOString().slice(0, 7)}`
  allD.push(...ddddd(sym, b5, fund, T0, Infinity))
}
out.push(`D. DDDDD on its own live top-10 list, all archive since 2023-09 (young contracts cover less), same costs`)
out.push(line('top-10 list', allD))
for (const sym of TOP10) out.push(line(`   ${sym} ${spanD[sym] ?? 'no archive'}`, allD.filter((r) => r.sym === sym)))
console.log(out.join('\n'))

// per-coin table for the summary page (status/rsi2-ddddd-v123b.json)
const agg = (rs: { sym: string; net: number }[]) => {
  const one = (a: { net: number }[]) => {
    const w = a.filter((x) => x.net > 0), l = a.filter((x) => x.net <= 0), avg = (b: { net: number }[]) => (b.length ? b.reduce((s, x) => s + x.net, 0) / b.length * 1e4 : 0)
    return { n: a.length, wr: a.length ? w.length / a.length : 0, net_bps: avg(a), win_bps: avg(w), loss_bps: avg(l) }
  }
  const coins: Record<string, ReturnType<typeof one>> = {}
  for (const c of [...new Set(rs.map((r) => r.sym))]) coins[c.replace(/USDT$/, '')] = one(rs.filter((r) => r.sym === c))
  return { all: one(rs), coins }
}
fs.writeFileSync(new URL('../../status/rsi2-ddddd-v123b.json', import.meta.url), JSON.stringify({
  'RSI2 exact (TRADOOR, MYX)': { span: 'all history', ...agg(allA) },
  'RSI2 core, 10 majors': { span: '3y', ...agg(allB) },
  'DDDDD, 10 majors': { span: '3y', ...agg(allC) },
  'DDDDD, its live top-10': { span: 'since 2023-09 or listing', spans: spanD, ...agg(allD) },
}, null, 1))

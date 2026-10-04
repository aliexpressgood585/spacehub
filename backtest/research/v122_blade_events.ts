// v122 — BLADE Weapon 1 historical check, exactly as pre-registered in quant/PREREGISTRATION_BLADE.md (committed before
// this file was run). Rules come from shared/blade.ts (the same functions the live runner uses).
// Data: Binance CMS announcements (catalogs 48 / 161) 2024-06-01 .. 2026-10-02; USDT-M perp 1m klines from
// data.binance.vision daily archives (downloaded to backtest/data/blade/, gitignored).
// The 30 s live entry cannot be priced on 1m bars: entry E1 = open of minute m0+1 (<= 60 s after the announcement, best
// measurable), E2 = open of minute m0+2 (v114's conservative entry). Inside a bar the adverse extreme is visited first.
// Costs: 20 bps round trip base (taker 5+5, slip 5 in + 5 out), 40 bps stress. Split by announcement time 70 / 30.
// Not measurable on history: the spread / book-walk gates (no historical order book) and the "liquid universe" filter for
// delistings (every coin with a perp counts). Both make the history look BETTER than a live run, not worse.
// Run: node --experimental-strip-types backtest/research/v122_blade_events.ts > status/blade-events-v122.txt
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { bladeCandidates, bladeOpen, bladeStep, fillNet, BLADE, pf, maxDd, type BladeCand } from '../../shared/blade.ts'
import type { AggTrade } from '../../shared/fast.ts'

const DIR = new URL('../data/blade/', import.meta.url).pathname, START = Date.UTC(2024, 5, 1), END = Date.UTC(2026, 9, 2, 23, 59)
fs.mkdirSync(DIR, { recursive: true })
const sh = (cmd: string, args: string[]) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28 })

// 1. announcements (cached)
const annFile = `${DIR}ann.json`
let ann: { releaseDate: number; title: string }[] = []
if (fs.existsSync(annFile)) ann = JSON.parse(fs.readFileSync(annFile, 'utf8'))
else {
  for (const cat of [48, 161]) for (let page = 1; page < 80; page++) {
    const raw = sh('curl', ['-s', '-m', '20', '-A', 'Mozilla/5.0', `https://www.binance.com/bapi/composite/v1/public/cms/article/list/query?type=1&catalogId=${cat}&pageNo=${page}&pageSize=50`])
    const arts = (JSON.parse(raw)?.data?.catalogs ?? []).flatMap((c: any) => c.articles ?? [])
    if (!arts.length) break
    for (const a of arts) ann.push({ releaseDate: Number(a.releaseDate), title: String(a.title) })
    if (Number(arts[arts.length - 1].releaseDate) < START) break
  }
  fs.writeFileSync(annFile, JSON.stringify(ann))
}
ann = ann.filter(a => a.releaseDate >= START && a.releaseDate <= END)
// 2. 1m bars of a perp around an event (cached daily archive files)
interface B { t: number; o: number; h: number; l: number; c: number }
const day = (t: number) => new Date(t).toISOString().slice(0, 10)
function dayBars(sym: string, d: string): B[] | null {
  const zip = `${DIR}${sym}-${d}.zip`, miss = `${zip}.missing`
  if (fs.existsSync(miss)) return null
  if (!fs.existsSync(zip)) {
    const code = sh('curl', ['-s', '-o', zip, '-w', '%{http_code}', `https://data.binance.vision/data/futures/um/daily/klines/${sym}/1m/${sym}-1m-${d}.zip`])
    if (code !== '200') { try { fs.unlinkSync(zip) } catch { /* none */ } fs.writeFileSync(miss, ''); return null }
  }
  const csv = sh('unzip', ['-p', zip])
  return csv.split('\n').filter(l => l && l[0] >= '0' && l[0] <= '9').map(l => { const f = l.split(','); return { t: +f[0], o: +f[1], h: +f[2], l: +f[3], c: +f[4] } })
}
function barsAround(sym: string, T: number): B[] | null {
  const a = dayBars(sym, day(T)); if (!a) return null
  const b = dayBars(sym, day(T + 86400e3)) ?? []
  return [...a, ...b]
}
const perpCache = new Map<string, string | null>()
function perpAt(coin: string, T: number): string | null {
  const k = `${coin}:${day(T)}`
  if (perpCache.has(k)) return perpCache.get(k)!
  let r: string | null = null
  for (const s of [`${coin}USDT`, `1000${coin}USDT`]) { const b = dayBars(s, day(T)); if (b && b.length && b[0].t <= T) { r = s; break } }
  perpCache.set(k, r); return r
}
// pseudo-prints from 1m bars, adverse extreme first (stop-first convention)
function prints(bars: B[], side: 1 | -1, from: number): AggTrade[] {
  const out: AggTrade[] = []
  for (const b of bars) {
    if (b.t < from) continue
    const adv = side > 0 ? b.l : b.h, fav = side > 0 ? b.h : b.l
    out.push({ p: b.o, T: b.t + 1 }, { p: adv, T: b.t + 20_000 }, { p: fav, T: b.t + 40_000 }, { p: b.c, T: b.t + 59_999 })
  }
  return out
}
function atr14(bars: B[], endIdx: number): number {
  let s = 0, n = 0
  for (let i = Math.max(1, endIdx - 14); i < endIdx; i++) { const b = bars[i], p = bars[i - 1].c; s += Math.max(b.h - b.l, Math.abs(b.h - p), Math.abs(b.l - p)); n++ }
  return n ? s / n : NaN
}
// 3. simulate one candidate for an entry offset (minutes after the announcement minute) and an extra round-trip cost
interface Res { id: string; T: number; coin: string; net: number; why: string; react1m: number }
function sim(c: BladeCand, off: 1 | 2, extraRt: number): Res | null {
  const bars = barsAround(c.perp, c.releaseDate); if (!bars) return null
  const m0 = Math.floor(c.releaseDate / 60000) * 60000, iE = bars.findIndex(b => b.t === m0 + off * 60000), i0 = bars.findIndex(b => b.t === m0)
  if (iE < 16 || i0 < 1) return null
  const pre = bars[i0 - 1].c, e0 = bars[iE].o, side = c.side
  const entry = e0 * (1 + side * BLADE.slip)
  const atr = atr14(bars, i0)
  const pos = bladeOpen(c.id, side, entry, atr, bars[iE].t)
  const tape = prints(bars.slice(iE), side, bars[iE].t)
  const endT = bars[iE].t + pos.maxMs
  const markAt = (t: number) => { const b = bars.find(x => x.t <= t && t < x.t + 60000); return b ? b.c : null }
  const r = bladeStep(pos, tape.filter(x => x.T <= endT), endT, markAt(endT - 1))
  if (!r.fills.length) return null
  const net = r.fills.reduce((s, f) => s + fillNet(side, entry, f), 0) - extraRt
  return { id: c.id, T: c.releaseDate, coin: c.coin, net, why: r.fills.map(f => f.why).join('+'), react1m: side * (bars[i0 + 1]?.o / pre - 1) }
}
// 4. candidates
const cands: BladeCand[] = []
for (const a of ann) cands.push(...bladeCandidates(a.title, a.releaseDate, coin => perpAt(coin, a.releaseDate), () => true))
const out: string[] = []
const f = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : 'nan')
out.push(`v122 — BLADE Weapon 1 historical check (pre-registered: quant/PREREGISTRATION_BLADE.md). Announcements ${day(START)} .. ${day(END)}: ${ann.length} articles, ${cands.length} candidates with a perp`)
out.push(`by id: ${['BL1', 'BD1'].map(id => `${id} ${cands.filter(c => c.id === id).length}`).join(' | ')}; announcements: ${new Set(cands.map(c => c.releaseDate)).size}`)
out.push('NOT measurable on history: spread / book-walk gates, liquid-universe filter for delistings (both flatter the history).')
for (const off of [1, 2] as const) for (const extra of [0, 0.002]) {
  const res = cands.map(c => sim(c, off, extra)).filter((r): r is Res => !!r)
  out.push(''); out.push(`== entry E${off} (open of minute m0+${off}), cost ${extra ? '40' : '20'} bps round trip ==`)
  for (const id of ['BL1', 'BD1']) {
    const rs = res.filter(r => r.id === id)
    const byAnn = new Map<number, number[]>(); for (const r of rs) { if (!byAnn.has(r.T)) byAnn.set(r.T, []); byAnn.get(r.T)!.push(r.net) }
    const ev = [...byAnn.entries()].sort((a, b) => a[0] - b[0]).map(([T, xs]) => ({ T, net: xs.reduce((s, x) => s + x, 0) / xs.length }))
    const cut = ev.length ? ev[Math.floor(ev.length * 0.7)]?.T ?? Infinity : Infinity
    const stat = (xs: number[]) => { const n = xs.length, m = n ? xs.reduce((s, x) => s + x, 0) / n : NaN, sd = n > 1 ? Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1)) : NaN
      return `n ${String(n).padStart(3)}  mean ${f(m * 1e4, 0).padStart(6)} bps  WR ${f(n ? 100 * xs.filter(x => x > 0).length / n : NaN, 0).padStart(3)}%  t ${f(sd > 0 ? m / sd * Math.sqrt(n) : NaN).padStart(5)}  PF ${f(pf(xs)).padStart(5)}  worst ${f(n ? Math.min(...xs) * 100 : NaN, 1)}%  sum ${f(xs.reduce((s, x) => s + x, 0) * 100, 1)}%` }
    out.push(`${id} ALL      ${stat(ev.map(e => e.net))}`)
    out.push(`${id} IS 70%   ${stat(ev.filter(e => e.T < cut).map(e => e.net))}`)
    out.push(`${id} HOLDOUT  ${stat(ev.filter(e => e.T >= cut).map(e => e.net))}   (from ${Number.isFinite(cut) ? day(cut) : '-'})`)
    const q = new Map<string, number[]>(); for (const e of ev) { const d = new Date(e.T), k = `${d.getUTCFullYear()}Q${Math.floor(d.getUTCMonth() / 3) + 1}`; if (!q.has(k)) q.set(k, []); q.get(k)!.push(e.net) }
    out.push(`${id} windows  ` + [...q.entries()].map(([k, xs]) => `${k} n${xs.length} ${f(xs.reduce((s, x) => s + x, 0) * 100, 1)}%`).join(' | '))
    const worstWin = Math.min(...[...q.values()].filter(xs => xs.length >= 5).map(xs => xs.reduce((s, x) => s + x, 0)), Infinity)
    out.push(`${id} worst window with >= 5 events: ${Number.isFinite(worstWin) ? f(worstWin * 100, 1) + '%' : 'none has 5'}   maxDD at 1x/event ${f(maxDd(ev.map(e => e.net)) * 100, 1)}%`)
    const why = new Map<string, number>(); for (const r of rs) why.set(r.why, (why.get(r.why) ?? 0) + 1)
    out.push(`${id} exits    ` + [...why.entries()].map(([k, n]) => `${k} ${n}`).join(' | ') + `   median first-minute move ${f(median(rs.map(r => r.react1m)) * 1e4, 0)} bps`)
  }
}
function median(xs: number[]) { const a = xs.filter(Number.isFinite).sort((p, q) => p - q); return a.length ? a[Math.floor(a.length / 2)] : NaN }
console.log(out.join('\n'))

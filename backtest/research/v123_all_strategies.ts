// v123 — every codeable strategy the bot has run, on ONE 3-year window with ONE cost model (owner 2026-10-08:
// "scan the whole history of the strategies, including the current one, test it over three years, and report the
// success rates"). Research only; no bot change. Each rule is imported from the same shared module the live bot uses.
//
// Window: entries 2023-09-01 .. 2026-08-31 (the 5m / 15m archives start 2023-09-01; 1h warm-up from 2020-09).
// Costs, the same for every strategy: taker 5 bps per side on every fill, slippage 3 bps per side on market fills
// (entries, stops, timeouts; ladder legs rest as maker 2 bps with no slippage, as in shared/strategy.ts), real Binance
// funding from backtest/data/*-funding.csv over the hold. Entry at the NEXT bar's open; inside a bar the stop is checked
// before the target; a bar that opens beyond the stop fills at its open.
// Trade level: one position per coin per strategy at a time, equal notional per trade, no portfolio caps. So this
// answers "how often does a trade of this rule win and what does it net", not "what would the account have made".
// WIN = net P&L after all costs > 0.
// Run: node --max-old-space-size=8192 --experimental-strip-types backtest/research/v123_all_strategies.ts > status/all-strategies-v123.txt
import fs from 'node:fs'
import * as S from '../../shared/strategy.ts'
import { brkvSignal, BRKV } from '../../shared/breakout.ts'
import { PRO, PRO_LIVE, TF, aggregate, features, proCheck, openPos, stepBar, type Bar } from '../../shared/pro.ts'
import { fastSignal, fastLevels, FAST, wyckoffSignal, WYCKOFF } from '../../shared/fast.ts'
import { q15Signal, q15Levels, Q15 } from './q15_v103_frozen.ts'
import type { LBar } from '../../shared/lab.ts'

const DATA = new URL('../data/', import.meta.url).pathname
const T0 = Date.UTC(2023, 8, 1), T1 = Date.UTC(2026, 8, 1)
const FEE = S.FEE_TAKER, SLIP = S.SLIP, H1 = 3_600_000, H4 = 4 * H1
const file = (c: string) => (c === 'PEPE' ? '1000PEPE' : c)
const rows = (p: string) => fs.readFileSync(p, 'utf8').split('\n').filter((l) => l && l[0] >= '0' && l[0] <= '9').map((l) => l.split(','))
const loadBars = (c: string, tf: string): LBar[] => rows(`${DATA}${file(c)}-${tf}.csv`).map((f) => ({ t: +f[0], open: +f[1], high: +f[2], low: +f[3], close: +f[4], vol: +f[5], tb: f[9] === undefined ? NaN : +f[9] }))
type F = { t: number; r: number }
const loadF = (c: string): F[] => { const p = `${DATA}${file(c)}-funding.csv`; return fs.existsSync(p) ? rows(p).map((f) => ({ t: +f[0], r: +f[2] })).sort((a, b) => a.t - b.t) : [] }
// sum of settled funding rates in (a, b]; binary search for the start
function fsum(Fs: F[], a: number, b: number): number {
  let lo = 0, hi = Fs.length
  while (lo < hi) { const m = (lo + hi) >> 1; if (Fs[m].t <= a) lo = m + 1; else hi = m }
  let s = 0
  for (let k = lo; k < Fs.length && Fs[k].t <= b; k++) s += Fs[k].r
  return s
}

interface Tr { coin: string; dir: 1 | -1; t0: number; t1: number; net: number; gross: number; fund: number; why: string }
const book = new Map<string, Tr[]>()
const add = (k: string, t: Tr) => { if (!book.has(k)) book.set(k, []); book.get(k)!.push(t) }

// ── a fixed stop / target / timeout position on bars (FAST, Wyckoff, Q15, BRKV) ────────────────────────────────
// entry e0 = the next bar's open (raw), fill = e0 x (1 + dir x slip). stop / target are price levels from the FILL.
// Returns the exit index, raw exit price, reason. Stop fills at its level x (1 - dir x slip), or at the open on a gap;
// the target fills at its level (a take-profit), a timeout at the close x (1 - dir x slip).
function runBracket(b: LBar[], j0: number, dir: 1 | -1, stop: number, target: number, maxBars: number) {
  for (let j = j0; j < b.length && j < j0 + maxBars; j++) {
    const x = b[j]
    if (dir * (x.open - stop) <= 0) return { j, px: x.open * (1 - dir * SLIP), why: 'STOP' }
    if (dir > 0 ? x.low <= stop : x.high >= stop) return { j, px: stop * (1 - dir * SLIP), why: 'STOP' }
    if (dir * (x.open - target) >= 0) return { j, px: x.open, why: 'TARGET' }
    if (dir > 0 ? x.high >= target : x.low <= target) return { j, px: target, why: 'TARGET' }
  }
  const j = Math.min(b.length - 1, j0 + maxBars - 1)
  return { j, px: b[j].close * (1 - dir * SLIP), why: 'TIMEOUT' }
}
function bookBracket(k: string, coin: string, b: LBar[], barMs: number, i: number, dir: 1 | -1, fill: number, e0: number, stop: number, target: number, maxBars: number, Fs: F[]) {
  const ex = runBracket(b, i + 1, dir, stop, target, maxBars)
  const t0 = b[i + 1].t, t1 = b[ex.j].t + barMs, fund = dir * fsum(Fs, t0, t1)
  const rawPx = ex.why === 'TARGET' ? ex.px : ex.px / (1 - dir * SLIP)
  add(k, { coin, dir, t0, t1, net: dir * (ex.px / fill - 1) - 2 * FEE - fund, gross: dir * (rawPx / e0 - 1), fund, why: ex.why })
  return ex.j
}

// ── 1h -> 4h, 40 coins: DONCH4H, ROTA, BRKV, PRO-4h ───────────────────────────────────────────────────────────
const C40 = [...S.CRYPTO_40]
const h1: Record<string, LBar[]> = {}, b4: Record<string, LBar[]> = {}, fund: Record<string, F[]> = {}
for (const c of C40) { h1[c] = loadBars(c, '1h'); b4[c] = aggregate(h1[c] as Bar[], 240, 60) as LBar[]; fund[c] = loadF(c) }
console.error('loaded 1h/4h', C40.length)

// DONCH4H — the validated 4h breakout with the live ladder (shared/strategy.ts ladderStep), managed on 1h bars the
// way backtest/portfolio.ts does it: the stop at its pre-bar level against the bar's ADVERSE extreme first, then the
// rungs the FAVOURABLE extreme reached. One position per coin, 8h cooldown after a close, no pyramid units.
for (const c of C40) {
  const B = b4[c], H = h1[c], Fs = fund[c]
  const hIdx = new Map<number, number>(); H.forEach((x, k) => hIdx.set(x.t, k))
  let busyUntil = 0
  for (let i = 70; i < B.length - 1; i++) {
    const tClose = B[i].t + H4
    if (tClose < T0 || tClose >= T1 || tClose < busyUntil) continue
    const completed = B.slice(i - 70, i + 1) as S.Bar[]
    const sig = S.donchSignal(completed); if (!sig) continue
    if (!(S.gateAdx(completed) > S.ADX_GATE)) continue
    const atr = S.entryAtr(completed); if (!atr) continue
    const price = completed[completed.length - 1].close, slDist = S.stopDistance(atr, price)
    if (slDist / price > S.SL_MAX_PCT) continue
    const dir: 1 | -1 = sig.side === 'LONG' ? 1 : -1, e0 = B[i + 1].open, E = e0 * (1 + dir * SLIP)
    let k = hIdx.get(B[i + 1].t); if (k === undefined) continue
    const pos: S.LadderPos = { side: sig.side, entry: E, origSlDist: slDist, stage: 0, stopPx: E - dir * slDist, sizeLeft: 1, sizeOrig: 1 }
    let pnl = -E * FEE, f = 0, why = '', tEnd = 0, grossPx = 0
    for (; k < H.length; k++) {
      const x = H[k], age = x.t + H1 - B[i + 1].t
      f += dir * fsum(Fs, x.t, x.t + H1) * pos.sizeLeft * x.close
      const adverse = dir > 0 ? x.low : x.high, favour = dir > 0 ? x.high : x.low
      let act = S.ladderStep({ ...pos }, adverse, adverse, age, true, SLIP)
      if (act.kind === 'close') { pnl += (act.px - E) * pos.sizeLeft * dir - act.fee; grossPx += ((act.px / (1 - dir * SLIP)) - e0) * pos.sizeLeft * dir; why = act.reason; tEnd = x.t + H1; break }
      let done = false
      for (let g = 0; g < 4; g++) {
        act = S.ladderStep({ ...pos }, favour, favour, age, true, SLIP)
        if (act.kind === 'leg') { pnl += (act.px - E) * act.qty * dir - act.fee; grossPx += (act.px - e0) * act.qty * dir; pos.sizeLeft -= act.qty; pos.stage = act.stage; pos.stopPx = act.stopPx; continue }
        if (act.kind === 'close') { pnl += (act.px - E) * pos.sizeLeft * dir - act.fee; grossPx += ((act.px / (1 - dir * SLIP)) - e0) * pos.sizeLeft * dir; why = act.reason; tEnd = x.t + H1; done = true; break }
        pos.stopPx = act.stopPx; break
      }
      if (done) break
    }
    if (!why) continue   // still open at the end of the archive
    pnl -= f
    add('DONCH4H', { coin: c, dir, t0: B[i + 1].t, t1: tEnd, net: pnl / E, gross: grossPx / e0, fund: f / E, why })
    busyUntil = tEnd + 8 * H1
  }
}
console.error('DONCH4H', book.get('DONCH4H')?.length)

// ROTA — long the top K / short the bottom K by momentum, rebalanced every `every` 4h bars; a coin kept on the same
// side across a rebalance is ONE trade (the live drift band keeps it); fills at the next 4h open.
function rota(k: string, K: number, every: number, momOf: (c: number[]) => number | null) {
  const grid = b4['BTC'].map((x) => x.t).filter((t) => t + H4 >= T0 && t + H4 < T1)
  const idx: Record<string, Map<number, number>> = {}
  for (const c of C40) { idx[c] = new Map(); b4[c].forEach((x, i) => idx[c].set(x.t, i)) }
  const open = new Map<string, { dir: 1 | -1; t0: number; e0: number; E: number }>()
  const close = (c: string, t: number, px0: number) => {
    const o = open.get(c)!, px = px0 * (1 - o.dir * SLIP), fu = o.dir * fsum(fund[c], o.t0, t)
    add(k, { coin: c, dir: o.dir, t0: o.t0, t1: t, net: o.dir * (px / o.E - 1) - 2 * FEE - fu, gross: o.dir * (px0 / o.e0 - 1), fund: fu, why: 'ROTATE' })
    open.delete(c)
  }
  for (let g = 0; g < grid.length; g += every) {
    const t = grid[g], rws: S.RotaRow[] = []
    for (const c of C40) {
      const i = idx[c].get(t); if (i === undefined || i + 1 >= b4[c].length) continue
      const closes = b4[c].slice(Math.max(0, i - 200), i + 1).map((x) => x.close)
      const st = S.rotaStats(c, b4[c].slice(Math.max(0, i - S.ROTA_LB - 1), i + 1) as S.Bar[]); if (!st) continue
      const m = momOf(closes); if (m === null) continue
      rws.push({ ...st, mom: m })
    }
    const tg = S.rotaTargets(rws, K)
    if (!tg.length) continue
    const want = new Map(tg.map((x) => [x.sym, x.dir]))
    const tn = t + H4
    for (const c of [...open.keys()]) if (want.get(c) !== open.get(c)!.dir) { const i = idx[c].get(tn); if (i !== undefined) close(c, tn, b4[c][i].open) }
    for (const [c, dir] of want) if (!open.has(c)) { const i = idx[c].get(tn); if (i === undefined) continue; const e0 = b4[c][i].open; open.set(c, { dir, t0: tn, e0, E: e0 * (1 + dir * SLIP) }) }
  }
  // the window ends: close what is left at the last 4h close inside it
  for (const c of [...open.keys()]) { const B = b4[c]; let i = B.length - 1; while (i > 0 && B[i].t + H4 > T1) i--; close(c, B[i].t + H4, B[i].close) }
}
rota('ROTA K8 48h 14d', 8, 12, (c) => (c.length > S.ROTA_LB ? c[c.length - 1] / c[c.length - 1 - S.ROTA_LB] - 1 : null))
rota('ROTA K2 12h 7/14/28d', 2, 3, (c) => (c.length > 168 ? [42, 84, 168].reduce((s, l) => s + c[c.length - 1] / c[c.length - 1 - l] - 1, 0) / 3 : null))
console.error('ROTA done')

// BRKV — close beyond the prior-20 4h range on >= 3x volume, +7% / -4% / 14 days, managed on 1h bars.
for (const side of ['both', 'short'] as const) for (const c of C40) {
  const B = b4[c], H = h1[c], Fs = fund[c], hIdx = new Map<number, number>(); H.forEach((x, k) => hIdx.set(x.t, k))
  let busyUntil = 0
  for (let i = BRKV.N + 1; i < B.length - 1; i++) {
    const tClose = B[i].t + H4
    if (tClose < T0 || tClose >= T1 || tClose < busyUntil) continue
    const d = brkvSignal(B.slice(i - BRKV.N, i + 1)); if (!d || (side === 'short' && d > 0)) continue
    const k = hIdx.get(B[i + 1].t); if (k === undefined) continue
    const dir = d as 1 | -1, e0 = B[i + 1].open, E = e0 * (1 + dir * SLIP)
    const j = bookBracket(side === 'both' ? 'BRKV L+S' : 'BRKV short-only', c, H, H1, k - 1, dir, E, e0, E * (1 - dir * BRKV.stop), E * (1 + dir * BRKV.target), BRKV.timeoutMs / H1, Fs)
    busyUntil = H[j].t + H1
  }
}
console.error('BRKV done')

// PRO on the 4h ladder (PRO_LIVE, v100.5): shared/pro.ts features / proCheck / openPos / stepBar.
for (const c of C40) {
  const B = b4[c] as Bar[], d1 = aggregate(h1[c] as Bar[], 1440, 60), Fe = features(B, d1, d1, TF['4h']), Fs = fund[c], p = PRO_LIVE
  let busyUntil = 0
  for (let i = 60; i < B.length - 2; i++) {
    const tClose = B[i].t + H4
    if (tClose < T0 || tClose >= T1 || tClose < busyUntil) continue
    const sg = proCheck(B, Fe, i, p.breakoutN, TF['4h']); if (!sg.dir) continue
    const dir = sg.dir as 1 | -1, e0 = B[i + 1].open, E = e0 * (1 + dir * SLIP)
    const s = openPos(dir, E, Fe.atr1[i], p); let ex = null, j = i + 1
    for (; j < B.length && !ex; j++) ex = stepBar(s, B[j], p)
    if (!ex) continue
    const t0 = B[i + 1].t, t1 = B[j - 1].t + H4, xp = ex.px * (1 - dir * SLIP), fu = dir * fsum(Fs, t0, t1)
    add('PRO 4h (v100.5)', { coin: c, dir, t0, t1, net: dir * (xp / E - 1) - 2 * FEE - fu, gross: dir * (ex.px / e0 - 1), fund: fu, why: ex.why })
    busyUntil = t1
  }
}
console.error('PRO4h done')
for (const c of C40) { delete h1[c] }

// ── 15m, 40 coins: Q15 as registered for v103 (frozen snapshot; shared/q15.ts is now the 1m variant) ──────────────────────────────────────────────────────
const ema20 = (b: LBar[]) => { const o = new Float64Array(b.length); let e = NaN; const k = 2 / 21; b.forEach((x, i) => { e = i ? x.close * k + e * (1 - k) : x.close; o[i] = i >= 20 ? e : NaN }); return o }
const btcSide = (b: LBar[]) => { const e = ema20(b), m = new Map<number, boolean | null>(); b.forEach((x, i) => m.set(x.t, Number.isFinite(e[i]) ? x.close > e[i] : null)); return m }
// cheap pre-screen on the conditions every burst rule shares (|3-bar move| and volume vs its 20-bar mean), so the
// full shared signal function only runs where it can possibly fire; the shared function still decides.
function prescreen(b: LBar[], i: number, volMult: number) {
  let vs = 0; for (let k = i - 20; k < i; k++) vs += b[k].vol
  return b[i].vol >= volMult * vs / 20 * 0.95
}
{
  const btc15 = loadBars('BTC', '15m'), btcUp = btcSide(btc15)
  for (const c of C40) {
    const b = c === 'BTC' ? btc15 : loadBars(c, '15m'), Fs = fund[c]
    let busyUntil = 0
    for (let i = 80; i < b.length - 1; i++) {
      const tClose = b[i].t + Q15.barMs
      if (tClose < T0 || tClose >= T1 || tClose < busyUntil || !prescreen(b, i, Q15.volMult)) continue
      const sg = q15Signal(b.slice(i - 79, i + 1), btcUp.get(b[i].t) ?? null, c === 'BTC').sig; if (!sg) continue
      const e0 = b[i + 1].open, E = e0 * (1 + sg.dir * SLIP), lv = q15Levels(sg.dir, E, sg.atr)
      const j = bookBracket('Q15 15m (v103)', c, b, Q15.barMs, i, sg.dir, E, e0, lv.stop, lv.target, Q15.holdMs / Q15.barMs, Fs)
      busyUntil = b[j].t + Q15.barMs
    }
    console.error('Q15', c, book.get('Q15 15m (v103)')?.length)
  }
}

// ── 5m, 10 coins: FAST bar (v95.0) and Wyckoff (v96.1) ─────────────────────────────────────────────────────────
{
  const C10 = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'DOT']
  const btc5 = loadBars('BTC', '5m'), btcUp = btcSide(btc5)
  for (const c of C10) {
    const b = c === 'BTC' ? btc5 : loadBars(c, '5m'), Fs = fund[c]
    let busyF = 0, busyW = 0
    for (let i = 80; i < b.length - 1; i++) {
      const tClose = b[i].t + FAST.barMs
      if (tClose < T0 || tClose >= T1) continue
      if (tClose >= busyF && prescreen(b, i, FAST.volMult)) {
        const sg = fastSignal(b.slice(i - 79, i + 1), btcUp.get(b[i].t) ?? null, c === 'BTC')
        if (sg) { const e0 = b[i + 1].open, E = e0 * (1 + sg.dir * SLIP), lv = fastLevels(sg.dir, E, sg.atr)
          const j = bookBracket('FAST 5m burst (v95.0)', c, b, FAST.barMs, i, sg.dir, E, e0, lv.stop, lv.target, FAST.holdBars, Fs); busyF = b[j].t + FAST.barMs }
      }
      if (tClose >= busyW) {
        // pre-screen: the bar pierces the prior 48-bar range and closes back inside
        let hi = -Infinity, lo = Infinity
        for (let k = i - WYCKOFF.rangeBars; k < i; k++) { if (b[k].high > hi) hi = b[k].high; if (b[k].low < lo) lo = b[k].low }
        const x = b[i]
        if (!((x.low < lo && x.close > lo) || (x.high > hi && x.close < hi))) continue
        const sg = wyckoffSignal(b.slice(i - 79, i + 1))
        if (sg) { const e0 = b[i + 1].open, E = e0 * (1 + sg.dir * SLIP), lv = fastLevels(sg.dir, E, Math.max(sg.dir * (E - sg.stopPx), 0))
          const j = bookBracket('Wyckoff 5m (v96.1)', c, b, FAST.barMs, i, sg.dir, E, e0, lv.stop, lv.target, WYCKOFF.holdMin / 5, Fs); busyW = b[j].t + FAST.barMs }
      }
    }
    console.error('5m', c)
  }
}

// ── report ──────────────────────────────────────────────────────────────────────────────────────────────────────
const pct = (x: number, d = 1) => (x * 100).toFixed(d) + '%'
const bps = (x: number) => (x * 1e4).toFixed(1)
function stats(ts: Tr[]) {
  const n = ts.length, w = ts.filter((t) => t.net > 0), l = ts.filter((t) => t.net <= 0)
  const sw = w.reduce((s, t) => s + t.net, 0), sl = -l.reduce((s, t) => s + t.net, 0)
  const days = new Map<number, number>(); for (const t of ts) { const d = Math.floor(t.t1 / 864e5); days.set(d, (days.get(d) ?? 0) + t.net) }
  const dv = [...days.values()], m = dv.reduce((s, x) => s + x, 0) / Math.max(1, dv.length), sd = Math.sqrt(dv.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, dv.length - 1))
  return { n, wr: n ? w.length / n : 0, net: n ? ts.reduce((s, t) => s + t.net, 0) / n : 0, gross: n ? ts.reduce((s, t) => s + t.gross, 0) / n : 0,
    pf: sl > 0 ? sw / sl : Infinity, sum: ts.reduce((s, t) => s + t.net, 0), avgW: w.length ? sw / w.length : 0, avgL: l.length ? -sl / l.length : 0,
    hold: n ? ts.reduce((s, t) => s + (t.t1 - t.t0), 0) / n / H1 : 0, t: sd > 0 ? m / sd * Math.sqrt(dv.length) : 0 }
}
const out: string[] = []
out.push(`v123 — every codeable strategy the bot has run, ONE window and ONE cost model`)
out.push(`entries ${new Date(T0).toISOString().slice(0, 10)} .. ${new Date(T1 - 1).toISOString().slice(0, 10)} (3 years); taker ${FEE * 1e4} bps/side + slippage ${(SLIP * 1e4).toFixed(0)} bps/side on market fills + real funding; entry at the next bar open; stop before target`)
out.push(`trade level: one position per coin per strategy, equal notional per trade, no portfolio caps. WIN = net after all costs > 0.`)
out.push(`sum% = sum of net % per trade (what $1,000 on every trade would have made, in units of $10). t = daily-clustered t of net P&L.`)
out.push('')
const H = `${'strategy'.padEnd(24)} ${'coins'.padStart(5)} ${'n'.padStart(6)} ${'WR'.padStart(6)} ${'avgWin'.padStart(7)} ${'avgLoss'.padStart(7)} ${'gross bps'.padStart(9)} ${'net bps'.padStart(8)} ${'PF'.padStart(5)} ${'sum%'.padStart(8)} ${'hold h'.padStart(7)} ${'t'.padStart(6)}`
out.push(H)
const order = ['Q15 15m (v103)', 'DONCH4H', 'ROTA K8 48h 14d', 'ROTA K2 12h 7/14/28d', 'BRKV L+S', 'BRKV short-only', 'PRO 4h (v100.5)', 'FAST 5m burst (v95.0)', 'Wyckoff 5m (v96.1)']
const coinsOf: Record<string, number> = { 'FAST 5m burst (v95.0)': 10, 'Wyckoff 5m (v96.1)': 10 }
for (const k of order) {
  const ts = book.get(k) ?? [], s = stats(ts)
  out.push(`${k.padEnd(24)} ${String(coinsOf[k] ?? 40).padStart(5)} ${String(s.n).padStart(6)} ${pct(s.wr).padStart(6)} ${pct(s.avgW, 2).padStart(7)} ${pct(s.avgL, 2).padStart(7)} ${bps(s.gross).padStart(9)} ${bps(s.net).padStart(8)} ${s.pf.toFixed(2).padStart(5)} ${(s.sum * 100).toFixed(0).padStart(8)} ${s.hold.toFixed(1).padStart(7)} ${s.t.toFixed(2).padStart(6)}`)
}
out.push('')
out.push('by period (n / WR / net bps per trade)')
const periods: [string, number, number][] = [['2023-09..12', T0, Date.UTC(2024, 0, 1)], ['2024', Date.UTC(2024, 0, 1), Date.UTC(2025, 0, 1)], ['2025', Date.UTC(2025, 0, 1), Date.UTC(2026, 0, 1)], ['2026-01..08', Date.UTC(2026, 0, 1), T1]]
out.push(`${'strategy'.padEnd(24)} ` + periods.map((p) => p[0].padStart(22)).join(''))
for (const k of order) {
  const ts = book.get(k) ?? []
  out.push(`${k.padEnd(24)} ` + periods.map(([, a, b]) => { const s = stats(ts.filter((t) => t.t0 >= a && t.t0 < b)); return `${s.n} / ${pct(s.wr, 0)} / ${bps(s.net)}`.padStart(22) }).join(''))
}
out.push('')
out.push('by side (n / WR / net bps per trade)')
for (const k of order) {
  const ts = book.get(k) ?? [], L = stats(ts.filter((t) => t.dir > 0)), Sh = stats(ts.filter((t) => t.dir < 0))
  out.push(`${k.padEnd(24)} LONG ${String(L.n).padStart(6)} ${pct(L.wr).padStart(6)} ${bps(L.net).padStart(7)}   SHORT ${String(Sh.n).padStart(6)} ${pct(Sh.wr).padStart(6)} ${bps(Sh.net).padStart(7)}`)
}
out.push('')
out.push('exits (n / WR / net bps)')
for (const k of order) {
  const ts = book.get(k) ?? [], by = new Map<string, Tr[]>()
  for (const t of ts) { if (!by.has(t.why)) by.set(t.why, []); by.get(t.why)!.push(t) }
  out.push(`${k.padEnd(24)} ` + [...by].map(([w, a]) => { const s = stats(a); return `${w} ${s.n} / ${pct(s.wr, 0)} / ${bps(s.net)}` }).join(' | '))
}
console.log(out.join('\n'))

// per-coin table for the summary page (status/all-strategies-v123.json)
{
  const one = (a: Tr[]) => {
    const w = a.filter((x) => x.net > 0), l = a.filter((x) => x.net <= 0), avg = (b: Tr[]) => (b.length ? b.reduce((s, x) => s + x.net, 0) / b.length * 1e4 : 0)
    return { n: a.length, wr: a.length ? w.length / a.length : 0, net_bps: avg(a), win_bps: avg(w), loss_bps: avg(l) }
  }
  const js: Record<string, unknown> = {}
  for (const k of order) {
    const ts = book.get(k) ?? [], coins: Record<string, ReturnType<typeof one>> = {}
    for (const c of [...new Set(ts.map((t) => t.coin))].sort()) coins[c] = one(ts.filter((t) => t.coin === c))
    js[k] = { span: '3y', all: one(ts), coins }
  }
  fs.writeFileSync(new URL('../../status/all-strategies-v123.json', import.meta.url), JSON.stringify(js, null, 1))
}

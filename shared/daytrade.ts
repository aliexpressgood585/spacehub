// "מאמן הדיי טריידינג" (owner's prompt, 2026-10-15): intraday crypto futures PAPER desk, setups S1-S6 on 15m bars.
// Written ONCE here; imported by backtest/research/daytrade_bt.ts and scripts/daytrade-desk.ts. Pure functions only.
//
// Prompt -> code (said plainly, including what is approximated):
//   Top-down: 1h direction = last CLOSED 1h close vs 1h EMA50 (1h bars aggregated from the 15m bars); setups on 15m; the
//             5m confirmation and 1m timing are NOT modelled (entry = next 15m open, taker — the prompt's maker entry is not
//             assumed: the live shadow-maker study here showed adverse selection).
//   F1 hours  : weekdays only, 07:00-10:00 UTC (London ~10:00 Israel) and 13:30-17:00 UTC (NY ~16:30 Israel).
//   F2 news   : fixed blackout 12:00-13:00 UTC (08:30 ET US releases). No event calendar (FOMC not covered).
//   F3 BTC    : BTC's 15m close on the same side of its 15m EMA50 as the trade (BTC itself: skipped).
//   F4        : fixed liquid list (BTC ETH SOL XRP DOGE BNB SUI) + 24h volume >= $200M live.
//   F5        : ATR(14) 15m >= its 100-bar average.   F6: funding not crowded (|f| > 0.05% on our side blocks).
//   F7 / day  : 2 losses in a row -> 2h pause; 3 losses or -2% in a UTC day -> done for the day; <= 4 entries a day.
//   Cost rule : round trip 0.16%; stop narrower than 0.8% (cost > 0.2R) is WIDENED to 0.8% (the prompt's option) and the
//               size shrinks with it; the target must still be >= 1.5R after costs, else no trade.
//   Manage    : at +1R the stop goes to entry; no 1R within 8 bars -> exit; hard cap 32 bars (8h).
//   Setups    : S1 Holy Grail, S2 Turtle Soup, S3 second entry (H2/L2), S4 VWAP reclaim, S5 80% rule (value area from a
//               volume-by-price profile of the previous UTC day's 15m bars), S6 opening-range breakout (13:30-14:30 UTC).
import { ema, atr, type Bar } from './coach.ts'
export type { Bar }
export type Side = 'LONG' | 'SHORT'

export const DT = {
  start: 5000, riskFrac: 0.005, maxLev: 5, mm: 0.005, liqMult: 2,
  rt: 0.0016, taker: 0.0005, slip: 0.0003, minStop: 0.008, minR: 1.5, defR: 2,
  beAtR: 1, noMoveBars: 8, maxBars: 32,
  maxOpen: 2, maxDay: 4, dayLosses: 3, dayStop: 0.02, lossPauseMs: 2 * 3600_000,
  fundMax: 0.0005, minVolUsd: 200e6,
  coins: ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'BNB', 'SUI'],
} as const
const M15 = 15 * 60_000, H1 = 3600_000, D1 = 86400_000

export type Prep = {
  b: Bar[]; e20: number[]; e50: number[]; at: number[]; atAvg: number[]; adx: number[]; pdi: number[]; mdi: number[]
  vwap: number[]; h1Dir: number[]; va: ({ vah: number; val: number; poc: number } | null)[]
}
function dmi(b: Bar[], n: number) {
  const adx = new Array(b.length).fill(NaN), pdi = new Array(b.length).fill(NaN), mdi = new Array(b.length).fill(NaN)
  let tr = 0, pd = 0, md = 0, a = NaN; const dx: number[] = []
  for (let i = 1; i < b.length; i++) {
    const up = b[i].h - b[i - 1].h, dn = b[i - 1].l - b[i].l
    const p = up > dn && up > 0 ? up : 0, m = dn > up && dn > 0 ? dn : 0
    const t = Math.max(b[i].h - b[i].l, Math.abs(b[i].h - b[i - 1].c), Math.abs(b[i].l - b[i - 1].c))
    if (i <= n) { tr += t; pd += p; md += m } else { tr = tr - tr / n + t; pd = pd - pd / n + p; md = md - md / n + m }
    if (i >= n) {
      const P = tr ? 100 * pd / tr : 0, Mi = tr ? 100 * md / tr : 0; pdi[i] = P; mdi[i] = Mi
      const d = P + Mi ? 100 * Math.abs(P - Mi) / (P + Mi) : 0; dx.push(d)
      if (dx.length === n) a = dx.reduce((s, x) => s + x, 0) / n; else if (dx.length > n) a = (a * (n - 1) + d) / n
      adx[i] = a
    }
  }
  return { adx, pdi, mdi }
}
function valueArea(day: Bar[]) {
  if (day.length < 20) return null
  const lo = Math.min(...day.map((x) => x.l)), hi = Math.max(...day.map((x) => x.h)), N = 50, w = (hi - lo) / N || 1e-12
  const v = new Array(N).fill(0)
  for (const x of day) { const a = Math.max(0, Math.floor((x.l - lo) / w)), z = Math.min(N - 1, Math.floor((x.h - lo) / w)); for (let k = a; k <= z; k++) v[k] += x.v / (z - a + 1) }
  let poc = 0; for (let k = 1; k < N; k++) if (v[k] > v[poc]) poc = k
  const tot = v.reduce((s, x) => s + x, 0); let a = poc, z = poc, acc = v[poc]
  while (acc < 0.7 * tot && (a > 0 || z < N - 1)) {
    const up = z < N - 1 ? v[z + 1] : -1, dn = a > 0 ? v[a - 1] : -1
    if (up >= dn) { z++; acc += v[z] } else { a--; acc += v[a] }
  }
  return { val: lo + a * w, vah: lo + (z + 1) * w, poc: lo + (poc + 0.5) * w }
}
export function dtPrep(b: Bar[]): Prep {
  const c = b.map((x) => x.c), e20 = ema(c, 20), e50 = ema(c, 50), at = atr(b, 14)
  const atAvg = at.map((_, i) => { if (i < 113) return NaN; let s = 0; for (let k = i - 99; k <= i; k++) s += at[k]; return s / 100 })
  const { adx, pdi, mdi } = dmi(b, 14)
  const vwap: number[] = []; let pv = 0, vv = 0, day = -1
  for (const x of b) { const d = Math.floor(x.t / D1); if (d !== day) { day = d; pv = 0; vv = 0 } pv += ((x.h + x.l + x.c) / 3) * x.v; vv += x.v; vwap.push(vv ? pv / vv : x.c) }
  // 1h closes from complete 15m groups; h1Dir[i] = direction of the last 1h bar CLOSED at or before bar i's close
  const hc: { t: number; c: number }[] = []
  for (let i = 0; i < b.length; i++) if ((b[i].t + M15) % H1 === 0 && i >= 3 && b[i].t - b[i - 3].t === 3 * M15) hc.push({ t: b[i].t + M15, c: b[i].c })
  const he = ema(hc.map((x) => x.c), 50); const h1Dir: number[] = []; let k = -1
  for (let i = 0; i < b.length; i++) { while (k + 1 < hc.length && hc[k + 1].t <= b[i].t + M15) k++; h1Dir.push(k >= 0 && Number.isFinite(he[k]) ? (hc[k].c > he[k] ? 1 : -1) : 0) }
  const va: Prep['va'] = []; const days = new Map<number, Bar[]>()
  for (const x of b) { const d = Math.floor(x.t / D1); (days.get(d) ?? days.set(d, []).get(d)!).push(x) }
  const vaOf = new Map<number, ReturnType<typeof valueArea>>()
  for (const x of b) { const d = Math.floor(x.t / D1); if (!vaOf.has(d)) vaOf.set(d, days.has(d - 1) ? valueArea(days.get(d - 1)!) : null); va.push(vaOf.get(d) ?? null) }
  return { b, e20, e50, at, atAvg, adx, pdi, mdi, vwap, h1Dir, va }
}

export type Cand = { setup: string; side: Side; stop: number; target: number | null; note: string }
// Setups on the bar i that just CLOSED. Entry would be the next bar's open.
export function dtSetups(p: Prep, i: number): Cand[] {
  const b = p.b, x = b[i], out: Cand[] = []
  if (i < 120) return out
  const lo = (a: number, z: number) => { let m = Infinity; for (let k = a; k <= z; k++) m = Math.min(m, b[k].l); return m }
  const hi = (a: number, z: number) => { let m = -Infinity; for (let k = a; k <= z; k++) m = Math.max(m, b[k].h); return m }
  // S1 Holy Grail: ADX > 30, pullback touches EMA20, bar closes back with the trend
  if (p.adx[i] > 30) {
    if (p.pdi[i] > p.mdi[i] && x.l <= p.e20[i] && x.c > p.e20[i] && x.c > x.o) out.push({ setup: 'S1', side: 'LONG', stop: lo(i - 4, i), target: hi(i - 20, i - 1), note: 'Holy Grail' })
    if (p.mdi[i] > p.pdi[i] && x.h >= p.e20[i] && x.c < p.e20[i] && x.c < x.o) out.push({ setup: 'S1', side: 'SHORT', stop: hi(i - 4, i), target: lo(i - 20, i - 1), note: 'Holy Grail' })
  }
  // S2 Turtle Soup: previous bar broke the prior 20-bar extreme, this bar closes back inside
  { const L = lo(i - 21, i - 2), Hh = hi(i - 21, i - 2), mid = (L + Hh) / 2
    if (b[i - 1].l < L && x.c > L) out.push({ setup: 'S2', side: 'LONG', stop: Math.min(b[i - 1].l, x.l), target: mid, note: 'Turtle Soup' })
    if (b[i - 1].h > Hh && x.c < Hh) out.push({ setup: 'S2', side: 'SHORT', stop: Math.max(b[i - 1].h, x.h), target: mid, note: 'Turtle Soup' }) }
  // S3 second entry: trend (close vs EMA20, EMA20 sloping), pullback from the 10-bar extreme, this bar is the 2nd attempt
  { const up = x.c > p.e20[i] && p.e20[i] > p.e20[i - 5], dn = x.c < p.e20[i] && p.e20[i] < p.e20[i - 5]
    let ph = i - 10; for (let k = i - 10; k < i; k++) if (b[k].h >= b[ph].h) ph = k
    let pl = i - 10; for (let k = i - 10; k < i; k++) if (b[k].l <= b[pl].l) pl = k
    if (up && ph < i - 1) { let c = 0, last = -1; for (let k = ph + 1; k <= i; k++) if (b[k].h > b[k - 1].h) { c++; last = k }
      if (c === 2 && last === i) out.push({ setup: 'S3', side: 'LONG', stop: lo(ph, i), target: null, note: 'כניסה שנייה (H2)' }) }
    if (dn && pl < i - 1) { let c = 0, last = -1; for (let k = pl + 1; k <= i; k++) if (b[k].l < b[k - 1].l) { c++; last = k }
      if (c === 2 && last === i) out.push({ setup: 'S3', side: 'SHORT', stop: hi(pl, i), target: null, note: 'כניסה שנייה (L2)' }) } }
  // S4 VWAP reclaim: closed back above VWAP within the last 4 bars after being below, this bar tests it and holds
  { const v = p.vwap[i]
    for (let j = i - 4; j < i; j++) {
      if (Math.floor(b[j].t / D1) !== Math.floor(x.t / D1)) continue
      if (b[j - 1].c < p.vwap[j - 1] && b[j].c > p.vwap[j] && x.l <= v * 1.001 && x.c > v && x.c > x.o) { out.push({ setup: 'S4', side: 'LONG', stop: lo(j, i), target: null, note: 'VWAP reclaim' }); break }
      if (b[j - 1].c > p.vwap[j - 1] && b[j].c < p.vwap[j] && x.h >= v * 0.999 && x.c < v && x.c < x.o) { out.push({ setup: 'S4', side: 'SHORT', stop: hi(j, i), target: null, note: 'VWAP reclaim' }); break }
    } }
  // S5 80% rule: opened outside yesterday's value area, now four 15m closes (= two 30m) back inside, first time today
  { const va = p.va[i], d0 = Math.floor(x.t / D1)
    if (va) { let s = i; while (s > 0 && Math.floor(b[s - 1].t / D1) === d0) s--
      const open = b[s].o, inside = (k: number) => b[k].c < va.vah && b[k].c > va.val
      if (i - s >= 4 && inside(i) && inside(i - 1) && inside(i - 2) && inside(i - 3) && !(i - s >= 5 && inside(i - 4) && inside(i - 5) && inside(i - 6) && inside(i - 7))) {
        if (open > va.vah) out.push({ setup: 'S5', side: 'SHORT', stop: hi(s, i), target: va.val, note: 'חוק 80% (פתיחה מעל אזור הערך)' })
        if (open < va.val) out.push({ setup: 'S5', side: 'LONG', stop: lo(s, i), target: va.vah, note: 'חוק 80% (פתיחה מתחת לאזור הערך)' })
      } } }
  // S6 opening range breakout: range = 13:30-14:30 UTC, first 15m close outside it before 17:00 UTC
  { const d = new Date(x.t + M15), mins = d.getUTCHours() * 60 + d.getUTCMinutes()
    if (mins > 14 * 60 + 30 && mins <= 17 * 60) {
      const day0 = Math.floor(x.t / D1) * D1, a = day0 + (13 * 60 + 30) * 60_000, z = day0 + (14 * 60 + 30) * 60_000
      const rng = []; let first = true
      for (let k = i - 16; k < i; k++) { if (b[k].t >= a && b[k].t < z) rng.push(b[k]) }
      if (rng.length === 4) {
        const H = Math.max(...rng.map((r) => r.h)), L = Math.min(...rng.map((r) => r.l)), mid = (H + L) / 2
        for (let k = i - 16; k < i; k++) if (b[k].t >= z && (b[k].c > H || b[k].c < L)) first = false
        if (first && x.c > H) out.push({ setup: 'S6', side: 'LONG', stop: mid, target: null, note: 'פריצת טווח פתיחה NY' })
        if (first && x.c < L) out.push({ setup: 'S6', side: 'SHORT', stop: mid, target: null, note: 'פריצת טווח פתיחה NY' })
      } } }
  return out
}

export type Check = { k: string; ok: boolean; v?: string }
// The checklist (prompt part ז) + the cost rule for one candidate. entry = expected fill (next open / live touch).
export function dtCheck(p: Prep, i: number, c: Cand, entry: number, o: { btcDir: number | null; funding: number | null; vol24Usd: number | null }) {
  const tClose = p.b[i].t + M15, d = new Date(tClose), wd = d.getUTCDay(), mins = d.getUTCHours() * 60 + d.getUTCMinutes()
  const hours = wd >= 1 && wd <= 5 && ((mins >= 7 * 60 && mins < 10 * 60) || (mins >= 13 * 60 + 30 && mins < 17 * 60))
  const news = mins >= 12 * 60 && mins < 13 * 60
  const s = c.side === 'LONG' ? 1 : -1
  let stop = c.stop, raw = Math.abs(entry - stop) / entry
  if (s * (entry - stop) <= 0) raw = 0
  if (raw > 0 && raw < DT.minStop) { stop = entry * (1 - s * DT.minStop); raw = DT.minStop }
  const dist = raw * entry, target = c.target ?? entry + s * DT.defR * dist
  const rNet = dist > 0 ? (s * (target - entry) - DT.rt * entry) / dist : -1
  const f = o.funding
  const checks: Check[] = [
    { k: 'F1 שעת נזילות (לונדון / ניו יורק, ימי חול)', ok: hours, v: `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC` },
    { k: 'F2 לא בחלון נתוני ארה״ב 12:00-13:00 UTC', ok: !news },
    { k: 'כיוון 1h (EMA50) תואם', ok: p.h1Dir[i] === s, v: p.h1Dir[i] > 0 ? 'למעלה' : p.h1Dir[i] < 0 ? 'למטה' : 'אין נתון' },
    { k: 'F3 BTC ב-15m תואם', ok: o.btcDir == null || o.btcDir === s, v: o.btcDir == null ? 'זה BTC' : o.btcDir > 0 ? 'למעלה' : 'למטה' },
    { k: 'F4 מחזור ≥ $200M', ok: o.vol24Usd == null || o.vol24Usd >= DT.minVolUsd, v: o.vol24Usd == null ? 'רשימה קבועה' : '$' + (o.vol24Usd / 1e6).toFixed(0) + 'M' },
    { k: 'F5 ATR 15m ≥ הממוצע', ok: p.at[i] >= p.atAvg[i] },
    { k: 'F6 Funding לא צפוף לצד שלנו', ok: f == null || (s > 0 ? f <= DT.fundMax : f >= -DT.fundMax), v: f == null ? 'אין נתון' : (100 * f).toFixed(4) + '%' },
    { k: 'סטופ בצד הנכון', ok: raw > 0 },
    { k: `יעד ≥ ${DT.minR}R אחרי עלויות`, ok: rNet >= DT.minR, v: rNet.toFixed(2) + 'R' },
  ]
  return { ok: checks.every((x) => x.ok), checks, stop, target, stopPct: raw, rNet, costR: raw ? DT.rt / raw : null }
}

export function dtSize(equity: number, cash: number, entry: number, stop: number, riskFrac: number) {
  const stopPct = Math.abs(entry - stop) / entry, notional0 = equity * riskFrac / stopPct
  const levCap = Math.max(1, Math.min(DT.maxLev, Math.floor(1 / (DT.liqMult * stopPct + DT.mm))))
  const lev = Math.max(1, Math.min(levCap, Math.ceil(notional0 / Math.max(cash, 1e-9))))
  const notional = Math.min(notional0, cash * lev, equity * DT.maxLev), liqDist = 1 / lev - DT.mm
  return { notional, qty: notional / entry, lev, margin: notional / lev, riskUsd: notional * stopPct,
    liq: entry > stop ? entry * (1 - liqDist) : entry * (1 + liqDist), ok: notional > 10 && liqDist >= DT.liqMult * stopPct }
}

// Day gates (prompt part ה + F7). dayLosses / dayStartEq reset at 00:00 UTC.
export function dtGate(s: { equity: number; dayStart: number; dayEntries: number; dayLosses: number; streak: number; lastLossAt: number | null }, nowMs: number) {
  if (s.equity <= s.dayStart * (1 - DT.dayStop)) return 'מינוס 2% היום — סיום יום'
  if (s.dayLosses >= DT.dayLosses) return '3 הפסדים היום — סיום יום'
  if (s.dayEntries >= DT.maxDay) return '4 עסקאות היום — מקסימום'
  if (s.streak >= 2 && s.lastLossAt != null && nowMs - s.lastLossAt < DT.lossPauseMs) return '2 הפסדים ברצף — הפסקה של שעתיים'
  return null
}

// One management step on a closed 15m bar: stop first (gap -> open), target, break-even at +1R, no-move and hard time exits.
export function dtManage(p: { side: Side; entry: number; stop: number; target: number; r0: number; bars: number; hit1R: boolean }, x: Bar) {
  const s = p.side === 'LONG' ? 1 : -1
  if (s > 0 ? x.l <= p.stop : x.h >= p.stop) return { px: s > 0 ? Math.min(p.stop, x.o) : Math.max(p.stop, x.o), why: p.hit1R ? 'BE' : 'STOP' }
  if (s > 0 ? x.h >= p.target : x.l <= p.target) return { px: s > 0 ? Math.max(p.target, x.o) : Math.min(p.target, x.o), why: 'TARGET' }
  if (!p.hit1R && (s > 0 ? x.h >= p.entry + p.r0 : x.l <= p.entry - p.r0)) { p.hit1R = true; p.stop = p.entry }
  p.bars++
  if (!p.hit1R && p.bars >= DT.noMoveBars) return { px: x.c, why: 'NO_MOVE' }
  if (p.bars >= DT.maxBars) return { px: x.c, why: 'TIME' }
  return null
}

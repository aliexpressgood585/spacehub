// "מאמן המסחר הכמותי" (owner's prompt, 2026-10-15): Binance USDⓈ-M futures PAPER desk. The prompt's rules, written ONCE
// here and imported by both the backtest (backtest/research/coach_bt.ts) and the live desk (scripts/coach-desk.ts).
// Pure functions only: no network, no clock reads.
//
// Mapping of the prompt to code (what is implemented, what is not, said plainly):
//   Risk  1-8 : 1% risk at the stop, size = equity x risk / stop%, leverage derived and capped at 5x, isolated margin,
//               liquidation >= 2x the stop distance, day -3% / week -6% stop entries, DD 15% -> half risk, max 3 open
//               (max 2 per side: correlated alts = one bet), stop never moved against us, every result in R, target 2R.
//   F1 regime : daily close vs daily EMA200 = direction; 4h ADX(14) > 25 = trend -> trade; ADX < 25 = no trade
//               (the prompt allows "range strategy or no trade": no trade, the range family failed here, v112bt).
//   F2 BTC    : alt longs only while BTC's daily close is above its EMA200, alt shorts only while below.
//   F3 ATR    : stop = 1.5 x ATR(14) 4h; skip when ATR is below 0.5% or above 8% of price.
//   F4 liq.   : 24h quote volume >= $100M (live); the backtest uses a fixed list of 30 large coins (survivorship).
//   F5 funding: no long when the last funding > +0.05%, no short when < -0.05%.
//   F6 OI     : NOT implemented (no OI history in the archive; live OI feed not wired) -> stated on the page.
//   F7 events : no entries 13:00-14:30 UTC on weekdays (US open / CPI / FOMC hours; no event calendar is wired).
//   F8 / P4   : two losses in a row -> no entries for 2 hours. P5: a day already up >= 3% -> half risk.
//   L1-L8     : liquidity / SMC / order-flow concepts are NOT rules here — the prompt itself says they are unproven;
//               the entry is a Donchian-20 breakout of the 4h close (the trend family of A2).
export type Bar = { t: number; o: number; h: number; l: number; c: number; v: number }
export type Side = 'LONG' | 'SHORT'

export const COACH = {
  start: 5000,
  riskFrac: 0.01,          // 1% of equity at the stop
  maxLev: 5,
  mm: 0.005,               // maintenance margin used for the liquidation estimate
  liqMult: 2,              // liquidation distance >= 2 x stop distance
  maxOpen: 3,
  maxPerSide: 2,
  dayStop: 0.03,
  weekStop: 0.06,
  ddHalf: 0.15,
  dayUpHalf: 0.03,
  lossPauseMs: 2 * 3600_000,
  ema: 200, adxN: 14, adxMin: 25, atrN: 14, don: 20,
  stopAtr: 1.5, targetR: 2, maxBars: 30,   // 30 x 4h = 5 days
  atrMin: 0.005, atrMax: 0.08,
  fundMax: 0.0005,
  minVolUsd: 100e6,
  taker: 0.0005, slip: 0.0003,
} as const

export function ema(xs: number[], n: number): number[] {
  const k = 2 / (n + 1), out: number[] = []
  let e = NaN
  for (let i = 0; i < xs.length; i++) {
    if (i === n - 1) { let s = 0; for (let j = 0; j < n; j++) s += xs[j]; e = s / n }
    else if (i >= n) e = xs[i] * k + e * (1 - k)
    out.push(i >= n - 1 ? e : NaN)
  }
  return out
}
export function atr(b: Bar[], n: number): number[] {
  const out: number[] = []; let a = NaN
  for (let i = 0; i < b.length; i++) {
    const tr = i ? Math.max(b[i].h - b[i].l, Math.abs(b[i].h - b[i - 1].c), Math.abs(b[i].l - b[i - 1].c)) : b[i].h - b[i].l
    if (i < n) { a = i === 0 ? tr : (a * i + tr) / (i + 1) } else a = (a * (n - 1) + tr) / n
    out.push(i >= n - 1 ? a : NaN)
  }
  return out
}
export function adx(b: Bar[], n: number): number[] {
  const out: number[] = new Array(b.length).fill(NaN)
  let tr = 0, pd = 0, md = 0, dx: number[] = [], a = NaN
  for (let i = 1; i < b.length; i++) {
    const up = b[i].h - b[i - 1].h, dn = b[i - 1].l - b[i].l
    const p = up > dn && up > 0 ? up : 0, m = dn > up && dn > 0 ? dn : 0
    const t = Math.max(b[i].h - b[i].l, Math.abs(b[i].h - b[i - 1].c), Math.abs(b[i].l - b[i - 1].c))
    if (i <= n) { tr += t; pd += p; md += m } else { tr = tr - tr / n + t; pd = pd - pd / n + p; md = md - md / n + m }
    if (i >= n) {
      const pdi = tr ? 100 * pd / tr : 0, mdi = tr ? 100 * md / tr : 0
      const d = pdi + mdi ? 100 * Math.abs(pdi - mdi) / (pdi + mdi) : 0
      dx.push(d)
      if (dx.length === n) a = dx.reduce((s, x) => s + x, 0) / n
      else if (dx.length > n) a = (a * (n - 1) + d) / n
      out[i] = a
    }
  }
  return out
}

export type Check = { k: string; ok: boolean; v?: string }
export type Ctx = {
  bars: Bar[]             // closed 4h bars, oldest first (last = the bar that just closed)
  daily: Bar[]            // closed daily bars
  btcDaily?: Bar[]        // closed BTC daily bars (omit for BTC itself)
  funding?: number | null // last funding rate (fraction per 8h)
  vol24Usd?: number | null
  nowMs: number
}
// The checklist (prompt part ו) for one coin. side = the side every check agreed on, or null.
export function coachSignal(x: Ctx): { side: Side | null; checks: Check[]; entry: number; stop: number; atrPct: number; adx: number } {
  const b = x.bars, n = b.length, last = b[n - 1]
  const dE = ema(x.daily.map((d) => d.c), COACH.ema), dLast = x.daily[x.daily.length - 1]
  const dir = dLast && Number.isFinite(dE[dE.length - 1]) ? (dLast.c > dE[dE.length - 1] ? 1 : -1) : 0
  const ad = adx(b, COACH.adxN)[n - 1], at = atr(b, COACH.atrN)[n - 1], atrPct = at / last.c
  const prev = b.slice(n - 1 - COACH.don, n - 1)
  const hi = Math.max(...prev.map((p) => p.h)), lo = Math.min(...prev.map((p) => p.l))
  const brk = last.c > hi ? 1 : last.c < lo ? -1 : 0
  let btc = 0
  if (x.btcDaily && x.btcDaily.length > COACH.ema) {
    const be = ema(x.btcDaily.map((d) => d.c), COACH.ema)
    btc = x.btcDaily[x.btcDaily.length - 1].c > be[be.length - 1] ? 1 : -1
  }
  const side = brk !== 0 && brk === dir ? brk : 0
  const d = new Date(x.nowMs), wd = d.getUTCDay(), mins = d.getUTCHours() * 60 + d.getUTCMinutes()
  const blackout = wd >= 1 && wd <= 5 && mins >= 13 * 60 && mins < 14 * 60 + 30
  const f = x.funding
  const checks: Check[] = [
    { k: 'F1 משטר: מעל/מתחת EMA200 יומי', ok: dir !== 0, v: dir > 0 ? 'מעל' : dir < 0 ? 'מתחת' : 'אין נתון' },
    { k: 'F1 מגמה: ADX(14) 4h > 25', ok: ad > COACH.adxMin, v: ad.toFixed(1) },
    { k: 'כניסה: פריצת Donchian-20 בכיוון המגמה', ok: side !== 0, v: brk > 0 ? 'פריצה למעלה' : brk < 0 ? 'פריצה למטה' : 'בתוך הטווח' },
    { k: 'F2 BTC מסונכרן', ok: !x.btcDaily || side === 0 || btc === side, v: x.btcDaily ? (btc > 0 ? 'BTC מעל EMA200' : 'BTC מתחת') : 'זה BTC' },
    { k: 'F3 ATR בטווח 0.5%-8%', ok: atrPct >= COACH.atrMin && atrPct <= COACH.atrMax, v: (100 * atrPct).toFixed(2) + '%' },
    { k: 'F4 מחזור יומי ≥ $100M', ok: x.vol24Usd == null || x.vol24Usd >= COACH.minVolUsd, v: x.vol24Usd == null ? 'רשימה קבועה' : '$' + (x.vol24Usd / 1e6).toFixed(0) + 'M' },
    { k: 'F5 Funding לא נגדי', ok: f == null || side === 0 || (side > 0 ? f <= COACH.fundMax : f >= -COACH.fundMax), v: f == null ? 'אין נתון' : (100 * f).toFixed(4) + '%' },
    { k: 'F7 לא בחלון אירועים (13:00-14:30 UTC)', ok: !blackout },
  ]
  const all = checks.every((c) => c.ok)
  const s = side > 0 ? 'LONG' : side < 0 ? 'SHORT' : null
  const stop = s === 'LONG' ? last.c - COACH.stopAtr * at : last.c + COACH.stopAtr * at
  return { side: all ? s : null, checks, entry: last.c, stop, atrPct, adx: ad }
}

// Position size from the stop (prompt part א 2-4). Isolated margin, leverage = the lowest integer that fits the notional
// into the free cash, capped at 5x and at the level that keeps liquidation >= 2x the stop distance.
export function coachSize(equity: number, cash: number, entry: number, stop: number, riskFrac: number) {
  const stopPct = Math.abs(entry - stop) / entry
  const notional = equity * riskFrac / stopPct
  const levLiq = 1 / (COACH.liqMult * stopPct + COACH.mm)       // liq distance ~ 1/L - mm must be >= 2 x stop
  const levCap = Math.max(1, Math.min(COACH.maxLev, Math.floor(levLiq)))
  const lev = Math.max(1, Math.min(levCap, Math.ceil(notional / Math.max(cash, 1e-9))))
  const n2 = Math.min(notional, cash * lev, equity * COACH.maxLev)
  const liqDist = 1 / lev - COACH.mm
  return { notional: n2, qty: n2 / entry, lev, margin: n2 / lev, stopPct, riskUsd: n2 * stopPct,
    liq: entry > stop ? entry * (1 - liqDist) : entry * (1 + liqDist), ok: n2 > 10 && liqDist >= COACH.liqMult * stopPct }
}

// Account-level gates (prompt part א 5, F8/P4, P5). Returns the risk multiplier (0 = no entries) and why.
export type RiskState = { equity: number; peak: number; dayStart: number; weekStart: number; streak: number; lastLossAt: number | null }
export function coachRisk(s: RiskState, nowMs: number): { mult: number; why: string | null } {
  if (s.equity <= s.dayStart * (1 - COACH.dayStop)) return { mult: 0, why: 'הפסד יומי 3% — אין כניסות עד מחר' }
  if (s.equity <= s.weekStart * (1 - COACH.weekStop)) return { mult: 0, why: 'הפסד שבועי 6% — אין כניסות עד יום שני' }
  if (s.streak >= 2 && s.lastLossAt != null && nowMs - s.lastLossAt < COACH.lossPauseMs) return { mult: 0, why: '2 הפסדים ברצף — הפסקה של שעתיים' }
  let m = 1, why: string | null = null
  if (s.equity <= s.peak * (1 - COACH.ddHalf)) { m = 0.5; why = 'Drawdown 15% — חצי גודל' }
  if (s.equity >= s.dayStart * (1 + COACH.dayUpHalf)) { m = Math.min(m, 0.5); why = 'יום ברווח 3%+ — חצי גודל (P5)' }
  return { mult: m, why }
}

// Exit on one bar (stop first when both are touched — the conservative convention).
export function coachExit(p: { side: Side; entry: number; stop: number; target: number; bars: number }, b: Bar) {
  if (p.side === 'LONG') {
    if (b.l <= p.stop) return { px: Math.min(p.stop, b.o), why: 'STOP' }
    if (b.h >= p.target) return { px: Math.max(p.target, b.o), why: 'TARGET' }
  } else {
    if (b.h >= p.stop) return { px: Math.max(p.stop, b.o), why: 'STOP' }
    if (b.l <= p.target) return { px: Math.min(p.target, b.o), why: 'TARGET' }
  }
  if (p.bars >= COACH.maxBars) return { px: b.c, why: 'TIME' }
  return null
}

// v94.0 — THE LAB: one written-down rule vocabulary for the research grid (backtest/lab.ts) AND the live
// LAB sleeve (supabase/functions/trading-bot/lab-runner.ts). Pure functions only — no Deno, no network.
//
// A strategy SPEC = timeframe x side x rule (family + 2 parameters) x exit (stop, target, management, hold)
// x regime gate. The grid enumerates every spec below over years of Binance USDT-M bars, walk-forward
// (4 IS windows -> VAL -> OOS read once), net of taker fees, slippage and the REAL funding archive.
// Only specs that clear the OOS bar enter the ELITE pool the live sleeve trades; the rest never trade,
// except a handful of OOS-positive-but-unproven specs at exploration size (tier 'explore').
//
// Honesty rules baked in here:
//  - signals use COMPLETED bars only; entries fill at the NEXT bar's open (backtest) / the live touch (bot);
//  - within a bar the STOP is checked before the target, and stop/breakeven/trail updates learned from a bar
//    apply from the NEXT bar (the v61.1 intra-bar double-count lesson);
//  - a bar that OPENS beyond the stop fills at that open, not at the stop level (gap risk is paid);
//  - order flow = the klines' own taker-buy column (observed). A 'sweep' is a wick beyond the N-bar extreme
//    that closes back inside: the stop cluster it assumes is INFERRED, never observed (Binance publishes no
//    stop or liquidation map).

export type Tf = '5m' | '15m' | '1h' | '2h' | '4h'
export const TF_MIN: Record<Tf, number> = { '5m': 5, '15m': 15, '1h': 60, '2h': 120, '4h': 240 }
export type Fam = 'mom' | 'brk' | 'rev' | 'trend' | 'sweep' | 'mr' | 'rsi' | 'flow'
export interface Rule { fam: Fam; a: number; b: number }
export interface Exit { sl: number; tp: number; mg: 0 | 1 | 2; hold: number }   // sl in ATR, tp in R, mg: 0 plain / 1 breakeven at 1R / 2 trail 1R behind the best price after 1R
export type Gate = 'all' | 'btc_up' | 'btc_dn' | 'hi_vol' | 'lo_vol'
export interface Spec { id: string; version: string; tf: Tf; side: 1 | -1; rule: Rule; exit: Exit; gate: Gate }

export const FAMILY_TEXT: Record<Fam, string> = {
  mom: 'momentum (follow an L-bar move of k ATR)', brk: 'breakout of the N-bar range (optional volume x)',
  rev: 'reversal (fade an L-bar move of k ATR)', trend: 'trend continuation (EMA20/50 pullback bounce)',
  sweep: 'liquidity sweep (wick beyond the N-bar extreme, close back inside; stops INFERRED)',
  mr: 'mean reversion (z-score vs SMA20)', rsi: 'RSI-14 extreme fade', flow: 'taker order-flow imbalance (observed)',
}
export const RULES: readonly Rule[] = [
  { fam: 'mom', a: 6, b: 1 }, { fam: 'mom', a: 6, b: 2 }, { fam: 'mom', a: 24, b: 1 }, { fam: 'mom', a: 24, b: 2 },
  { fam: 'brk', a: 20, b: 0 }, { fam: 'brk', a: 20, b: 2 }, { fam: 'brk', a: 55, b: 0 }, { fam: 'brk', a: 55, b: 2 },
  { fam: 'rev', a: 6, b: 2 }, { fam: 'rev', a: 6, b: 3 }, { fam: 'rev', a: 24, b: 2 }, { fam: 'rev', a: 24, b: 3 },
  { fam: 'trend', a: 0, b: 0 }, { fam: 'trend', a: 1, b: 0 },
  { fam: 'sweep', a: 20, b: 0 }, { fam: 'sweep', a: 55, b: 0 },
  { fam: 'mr', a: 20, b: 2 }, { fam: 'mr', a: 20, b: 2.5 }, { fam: 'rsi', a: 14, b: 25 },
  { fam: 'flow', a: 6, b: 1 }, { fam: 'flow', a: 6, b: -1 }, { fam: 'flow', a: 24, b: 1 }, { fam: 'flow', a: 24, b: -1 },
]
export const EXITS: readonly Exit[] = (() => {
  const out: Exit[] = []
  for (const sl of [1, 2]) for (const tp of [1, 2, 3]) for (const mg of [0, 1, 2] as const) for (const hold of [6, 24]) out.push({ sl, tp, mg, hold })
  return out
})()
export const GATES: readonly Gate[] = ['all', 'btc_up', 'btc_dn', 'hi_vol', 'lo_vol']
export const LAB_VERSION = 'lab1'
export const ruleId = (r: Rule) => `${r.fam}${r.a}${r.b < 0 ? 'n' + -r.b : r.b}`.replace('.', 'p')
export const exitId = (e: Exit) => `s${e.sl}t${e.tp}m${e.mg}h${e.hold}`
export const specId = (tf: Tf, side: 1 | -1, r: Rule, e: Exit, g: Gate) => `${tf}_${side > 0 ? 'L' : 'S'}_${ruleId(r)}_${exitId(e)}_${g}`
export function specText(s: Spec): string {
  const mg = ['plain exit', 'stop to breakeven at +1R', 'trail 1R behind the best price after +1R'][s.exit.mg]
  return `${s.tf} ${s.side > 0 ? 'LONG' : 'SHORT'} · ${FAMILY_TEXT[s.rule.fam]} [${s.rule.a},${s.rule.b}] · stop ${s.exit.sl} ATR, target ${s.exit.tp}R, ${mg}, max ${s.exit.hold} bars · regime ${s.gate}`
}

// ── costs (one model, both consumers) ───────────────────────────────────────────────────────────────
// Taker 5 bps per side (paper never assumes a maker fill); slippage per side 3 bps on BTC/ETH, 5 bps on the
// rest (live measured 2026-09-24..26: spread + impact ~3.3 bps/side on the pinned 40, floor 3). Funding from
// the Binance archive in the backtest, from the published rate live; 0.01%/8h is used ONLY when a coin has no
// funding data, and such trades are counted as INFERRED.
export const LAB_COST = { fee: 0.0005, slipMajor: 0.0003, slipAlt: 0.0005, fundingDefault8h: 0.0001 }
export const slipFor = (sym: string) => (sym === 'BTC' || sym === 'ETH' ? LAB_COST.slipMajor : LAB_COST.slipAlt)

// ── indicators over a bar array (O(n)), identical in both consumers ─────────────────────────────────
export interface LBar { t: number; open: number; high: number; low: number; close: number; vol: number; tb?: number }   // tb = taker-buy base volume (NaN/undefined when the source has none)
export interface Ind {
  n: number; atr: Float64Array; atrPct: Float64Array; ema20: Float64Array; ema50: Float64Array; sma20: Float64Array; sd20: Float64Array
  rsi: Float64Array; hi20: Float64Array; lo20: Float64Array; hi55: Float64Array; lo55: Float64Array; av20: Float64Array
  imb6: Float64Array; imb24: Float64Array; volReg: Float64Array
}
function rollExt(b: LBar[], N: number, hi: boolean): Float64Array {
  // extreme of the N bars BEFORE i (excludes i); monotonic deque
  const n = b.length, out = new Float64Array(n).fill(NaN), dq: number[] = []
  let head = 0
  for (let i = 0; i < n; i++) {
    while (head < dq.length && dq[head] < i - N) head++
    if (i >= N) out[i] = hi ? b[dq[head]].high : b[dq[head]].low
    const v = hi ? b[i].high : b[i].low
    while (dq.length > head && (hi ? b[dq[dq.length - 1]].high <= v : b[dq[dq.length - 1]].low >= v)) dq.pop()
    dq.push(i)
  }
  return out
}
export function labInd(b: LBar[]): Ind {
  const n = b.length, f = () => new Float64Array(n).fill(NaN)
  const atr = f(), atrPct = f(), ema20 = f(), ema50 = f(), sma20 = f(), sd20 = f(), rsi = f(), av20 = f(), imb6 = f(), imb24 = f(), volReg = f()
  let a = NaN, e20 = NaN, e50 = NaN, g = 0, l = 0, s = 0, s2 = 0, vs = 0, ap = 0
  const k20 = 2 / 21, k50 = 2 / 51
  let fb6 = 0, fv6 = 0, fb24 = 0, fv24 = 0, bad6 = 0, bad24 = 0
  for (let i = 0; i < n; i++) {
    const x = b[i], c = x.close
    const tr = i ? Math.max(x.high - x.low, Math.abs(x.high - b[i - 1].close), Math.abs(x.low - b[i - 1].close)) : x.high - x.low
    a = i < 14 ? (i ? (a * i + tr) / (i + 1) : tr) : (a * 13 + tr) / 14
    if (i >= 14) { atr[i] = a; atrPct[i] = a / c }
    e20 = i ? c * k20 + e20 * (1 - k20) : c; e50 = i ? c * k50 + e50 * (1 - k50) : c
    if (i >= 20) ema20[i] = e20
    if (i >= 50) ema50[i] = e50
    s += c; s2 += c * c; if (i >= 20) { s -= b[i - 20].close; s2 -= b[i - 20].close ** 2 }
    if (i >= 19) { const m = s / 20; sma20[i] = m; sd20[i] = Math.sqrt(Math.max(0, s2 / 20 - m * m)) }
    if (i) { const d = c - b[i - 1].close; const up = d > 0 ? d : 0, dn = d < 0 ? -d : 0
      if (i <= 14) { g += up / 14; l += dn / 14 } else { g = (g * 13 + up) / 14; l = (l * 13 + dn) / 14 }
      if (i >= 14) rsi[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l) }
    if (i >= 20) av20[i] = vs / 20
    vs += x.vol; if (i >= 20) vs -= b[i - 20].vol
    const tb = x.tb, ok = tb !== undefined && Number.isFinite(tb)
    fb6 += ok ? 2 * (tb as number) - x.vol : 0; fv6 += x.vol; bad6 += ok ? 0 : 1
    fb24 += ok ? 2 * (tb as number) - x.vol : 0; fv24 += x.vol; bad24 += ok ? 0 : 1
    if (i >= 6) { const o = b[i - 6], ook = o.tb !== undefined && Number.isFinite(o.tb); fb6 -= ook ? 2 * (o.tb as number) - o.vol : 0; fv6 -= o.vol; bad6 -= ook ? 0 : 1 }
    if (i >= 24) { const o = b[i - 24], ook = o.tb !== undefined && Number.isFinite(o.tb); fb24 -= ook ? 2 * (o.tb as number) - o.vol : 0; fv24 -= o.vol; bad24 -= ook ? 0 : 1 }
    if (i >= 5 && bad6 === 0 && fv6 > 0) imb6[i] = fb6 / fv6
    if (i >= 23 && bad24 === 0 && fv24 > 0) imb24[i] = fb24 / fv24
    if (i >= 114) volReg[i] = atrPct[i] / (ap / 100)
    if (i >= 14) { ap += atrPct[i]; if (i >= 114) ap -= atrPct[i - 100] }
  }
  return { n, atr, atrPct, ema20, ema50, sma20, sd20, rsi, hi20: rollExt(b, 20, true), lo20: rollExt(b, 20, false), hi55: rollExt(b, 55, true), lo55: rollExt(b, 55, false), av20, imb6, imb24, volReg }
}

// does `rule` fire for `side` on COMPLETED bar i?
export function labSignal(r: Rule, side: 1 | -1, b: LBar[], I: Ind, i: number): boolean {
  const c = b[i].close, ap = I.atrPct[i]
  if (!(ap > 0)) return false
  switch (r.fam) {
    case 'mom': case 'rev': {
      if (i < r.a) return false
      const z = (c / b[i - r.a].close - 1) / (ap * Math.sqrt(r.a))
      return r.fam === 'mom' ? side * z > r.b : side * z < -r.b
    }
    case 'brk': {
      const hi = r.a === 20 ? I.hi20[i] : I.hi55[i], lo = r.a === 20 ? I.lo20[i] : I.lo55[i]
      if (!(hi > 0 && lo > 0)) return false
      if (r.b > 0 && !(b[i].vol >= r.b * I.av20[i])) return false
      return side > 0 ? c > hi : c < lo
    }
    case 'trend': {
      const e1 = I.ema20[i], e2 = I.ema50[i]
      if (!(e1 > 0 && e2 > 0) || i < 5) return false
      const slopeOk = r.a === 0 || (side > 0 ? e2 > I.ema50[i - 5] : e2 < I.ema50[i - 5])
      return slopeOk && (side > 0 ? e1 > e2 && b[i].low <= e1 && c > e1 : e1 < e2 && b[i].high >= e1 && c < e1)
    }
    case 'sweep': {
      const hi = r.a === 20 ? I.hi20[i] : I.hi55[i], lo = r.a === 20 ? I.lo20[i] : I.lo55[i]
      if (!(hi > 0 && lo > 0)) return false
      return side > 0 ? b[i].low < lo && c > lo : b[i].high > hi && c < hi
    }
    case 'mr': { const sd = I.sd20[i]; if (!(sd > 0)) return false; return side * (c - I.sma20[i]) / sd < -r.b }
    case 'rsi': { const v = I.rsi[i]; if (!Number.isFinite(v)) return false; return side > 0 ? v < r.b : v > 100 - r.b }
    case 'flow': {
      const m = r.a === 6 ? I.imb6[i] : I.imb24[i], thr = r.a === 6 ? 0.12 : 0.06
      if (!Number.isFinite(m)) return false
      return side * r.b * m > thr
    }
  }
}
// regime gate at bar i; btcUp = BTC close above its EMA50 on the same timeframe at the same bar time
export function labGate(g: Gate, I: Ind, i: number, btcUp: boolean | null): boolean {
  switch (g) {
    case 'all': return true
    case 'btc_up': return btcUp === true
    case 'btc_dn': return btcUp === false
    case 'hi_vol': return I.volReg[i] > 1
    case 'lo_vol': return I.volReg[i] > 0 && I.volReg[i] <= 1
  }
}

// ── exits: one state machine, bar-level in the backtest, quote-level live ──────────────────────────
export interface Pos { side: 1 | -1; entry: number; stop: number; target: number; r: number; best: number; mg: 0 | 1 | 2; bars: number; hold: number }
export function labOpen(side: 1 | -1, entry: number, atr: number, e: Exit): Pos {
  const r = e.sl * atr
  return { side, entry, stop: entry - side * r, target: entry + side * e.tp * r, r, best: entry, mg: e.mg, bars: 0, hold: e.hold }
}
// management update AFTER a bar / quote has been processed: breakeven or trail from the best price seen
export function labManage(p: Pos, best: number): void {
  const s = p.side
  if (s * (best - p.best) > 0) p.best = best
  if (p.mg === 0 || s * (p.best - p.entry) < p.r) return
  const ns = p.mg === 1 ? p.entry : p.best - s * p.r
  if (s * (ns - p.stop) > 0) p.stop = ns
}
// one bar: returns the fill price or NaN (stop first; a bar opening beyond the stop fills at the open)
export function labBar(p: Pos, bar: { open: number; high: number; low: number; close: number }): { px: number; why: 'STOP' | 'TARGET' | 'TIMEOUT' } | null {
  const s = p.side
  p.bars++
  if (s > 0 ? bar.open <= p.stop : bar.open >= p.stop) return { px: bar.open, why: 'STOP' }
  if (s > 0 ? bar.low <= p.stop : bar.high >= p.stop) return { px: p.stop, why: 'STOP' }
  if (s > 0 ? bar.open >= p.target : bar.open <= p.target) return { px: bar.open, why: 'TARGET' }
  if (s > 0 ? bar.high >= p.target : bar.low <= p.target) return { px: p.target, why: 'TARGET' }
  if (p.bars >= p.hold) return { px: bar.close, why: 'TIMEOUT' }
  labManage(p, s > 0 ? bar.high : bar.low)
  return null
}
// live: executable mark (bid for a long, ask for a short) against the stored levels
export function labQuoteExit(p: Pos, mark: number, heldMs: number, barMs: number): 'STOP' | 'TARGET' | 'TIMEOUT' | null {
  const s = p.side
  if (s * (mark - p.stop) <= 0) return 'STOP'
  if (s * (mark - p.target) >= 0) return 'TARGET'
  if (heldMs >= p.hold * barMs) return 'TIMEOUT'
  return null
}

// ── sizing: risk at the stop, scaled by evidence, volatility, liquidity, correlation and exposure ──
// Returns the notional and the effective leverage it implies against an equal share of the book.
// The paper ledger is 1x-margined (notional is posted in full), so `lev` is the book leverage this sizing
// WOULD need on margin; the live cap is `maxLev` and the ledger refuses a book above 100% gross.
export interface SizeIn { equity: number; cash: number; tier: 'elite' | 'explore'; stopPct: number; oosT: number; volReg: number; depthUsd: number | null; corrLoad: number; grossUsed: number; slots: number; maxLev: number }
export const LAB_SIZE = { riskElite: 0.005, riskExplore: 0.001, capElite: 0.15, capExplore: 0.02, maxGross: 0.95, depthShare: 0.02 }
export function labSize(x: SizeIn): { notional: number; risk: number; lev: number; why: string } {
  if (!(x.stopPct > 0) || !(x.equity > 0)) return { notional: 0, risk: 0, lev: 0, why: 'bad_input' }
  const base = x.tier === 'elite' ? LAB_SIZE.riskElite : LAB_SIZE.riskExplore
  const edge = x.tier === 'elite' ? Math.min(1.5, Math.max(0.5, x.oosT / 2)) : 1
  const vol = x.volReg > 1.5 ? 0.6 : x.volReg > 1 ? 0.8 : 1
  const corr = Math.max(0.3, 1 - 0.35 * Math.max(0, x.corrLoad))
  const risk = x.equity * base * edge * vol * corr
  let notional = risk / x.stopPct
  const cap = x.equity * (x.tier === 'elite' ? LAB_SIZE.capElite : LAB_SIZE.capExplore) * Math.max(1, Math.min(x.maxLev, 3))
  let why = 'risk'
  if (notional > cap) { notional = cap; why = 'per_trade_cap' }
  if (x.depthUsd !== null && x.depthUsd > 0 && notional > x.depthUsd * LAB_SIZE.depthShare * 50) { notional = x.depthUsd * LAB_SIZE.depthShare * 50; why = 'liquidity' }
  const room = x.equity * LAB_SIZE.maxGross - x.grossUsed
  if (notional > room) { notional = Math.max(0, room); why = 'gross_cap' }
  if (notional > x.cash * 0.98) { notional = Math.max(0, x.cash * 0.98); why = 'cash' }
  const lev = notional / (x.equity / Math.max(1, x.slots))
  return { notional, risk: notional * x.stopPct, lev, why }
}

// ── controlled learning: promotion / rollback decisions on LIVE closes of one spec ─────────────────
// A spec is versioned (id + LAB_VERSION). Offline the lab may only promote on OOS evidence; live it can
// DEMOTE (rollback) any spec whose own closed trades turn bad, and promote an explore spec to elite only
// after it proves itself on trades nobody selected it on.
export const LEARN_LAB = { minDemoteN: 12, demoteT: -1, demoteDd: 0.04, minPromoteN: 30, promoteT: 2 }
export function labVerdict(netPct: number[], equity: number, usd: number[]): { action: 'keep' | 'demote' | 'promote'; t: number; why: string } {
  const n = netPct.length
  if (n < LEARN_LAB.minDemoteN) return { action: 'keep', t: 0, why: `n ${n} < ${LEARN_LAB.minDemoteN}` }
  const m = netPct.reduce((a, b) => a + b, 0) / n
  const sd = Math.sqrt(netPct.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, n - 1))
  const t = sd > 0 ? m / (sd / Math.sqrt(n)) : 0
  let pk = 0, cur = 0, dd = 0
  for (const u of usd) { cur += u; pk = Math.max(pk, cur); dd = Math.max(dd, pk - cur) }
  if (t <= LEARN_LAB.demoteT) return { action: 'demote', t, why: `live t ${t.toFixed(2)} <= ${LEARN_LAB.demoteT}` }
  if (equity > 0 && dd / equity >= LEARN_LAB.demoteDd) return { action: 'demote', t, why: `spec drawdown ${(dd / equity * 100).toFixed(1)}% of equity` }
  if (n >= LEARN_LAB.minPromoteN && t >= LEARN_LAB.promoteT && m > 0) return { action: 'promote', t, why: `live t ${t.toFixed(2)} on ${n} closes` }
  return { action: 'keep', t, why: `live t ${t.toFixed(2)} on ${n}` }
}

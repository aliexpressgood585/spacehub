// v100.0 — PRO: the owner's 1m scalping specification (2026-10-02), as written in their research prompt. Pure rules only,
// imported by BOTH the backtest (backtest/research/v100_pro_scalp.ts) and the live paper runner
// (supabase/functions/trading-bot/pro-runner.ts), so the rule that was measured is the rule that trades.
//
// LONG (SHORT is the strict mirror), evaluated on a CLOSED 1m bar only:
//   HTF   15m: price above EMA200 of the last CLOSED 15m bar · 5m: EMA20 > EMA50 of the last CLOSED 5m bar
//         ADX(14) on 5m > 20 · price above the daily-anchored VWAP (resets 00:00 UTC)
//   REGIME trending = ADX(5m) > 20 AND 5m realised-vol percentile (1h window vs the previous 24h) >= 30%;
//         funding windows (±5 min around 00/08/16 UTC) are skipped. Otherwise flat.
//   ENTRY close above the high of the previous N 1m bars, volume > 1.5x its 20-bar average, RSI(9) > 50
//   Open interest / order flow: DISABLED (not used in the backtest, so not used live).
// RISK  0.5% of equity at the stop; stop = k x ATR(14) on 1m; size = risk / stop distance; <= 3 open, one per coin;
//       daily stop at -3R realised; 3 losses in a row -> 60 min cooldown.
// EXITS target >= 1.5R; at +1R the stop goes to breakeven and then trails 1R behind the best price; time stop: out if
//       +1R was not reached within T bars; hard cap 120 bars.
// COSTS taker 5 bps per side on every fill (no maker assumed), slippage 3 bps (BTC/ETH) / 5 bps (others) per side,
//       funding at the real settled rates over the hold.
// Free parameters (walk-forward selected, nothing else is tuned): N, k, target R, T.

export const PRO = {
  coins: ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'DOT'] as string[],
  ema15: 200, emaFast5: 20, emaSlow5: 50, adxLen: 14, adxMin: 20,
  rsiLen: 9, rsiMid: 50, volLen: 20, volMult: 1.5, atrLen: 14,
  rvLen: 12, rvLookback: 288, rvPctMin: 0.3, fundingSkipMin: 5,
  grid: { breakoutN: [5, 10, 15], stopAtr: [0.8, 1.0, 1.2], targetR: [1.5, 3], timeStopBars: [15, 30] },
  defaults: { breakoutN: 10, stopAtr: 1.0, targetR: 1.5, timeStopBars: 30 } as Params,
  beAtR: 1, trailR: 1, maxHoldBars: 120,
  riskPct: 0.005, maxOpen: 3, dayLossR: 3, lossStreak: 3, cooldownMin: 60,
  lev: 10, maxNotionalEq: 5,
  fee: 0.0005, slipMajor: 0.0003, slipAlt: 0.0005,
}
// the parameters the live paper runner trades: the walk-forward's choice on the whole development span (v100bt part C).
// v100bt REJECTED this rule (holdout net -1.39R/trade); it runs on paper on the owner's explicit instruction only.
// v100.3 (owner 2026-10-02: "cancel the trading limit", after the -3R day stop halted entries at -5.71R): the live
// runner no longer stops for the day at -3R nor pauses 60 min after 3 losses. Sizing is unchanged (0.5% risk at the
// stop, <= 3 open, one per coin, <= 5x notional). The backtest (v100bt) keeps both limits, as it was run.
export const PRO_LIVE_LIMITS = { dayStop: false, lossCooldown: false }
// v100.4 (owner 2026-10-02: "review every trade and improve, same intraday format, do not limit openings"): the first
// 59 live PRO trades lost -0.62R each; the stop median was 0.42% of price and trades with a stop < 0.3% paid 0.53R in fees
// alone. v100b (backtest/research/v100b_pro_exits.ts, ENTRIES UNCHANGED) floors the stop at 2% of price and moves the
// breakeven/trail to 1.5R: development net -0.095R/trade vs -1.302R, holdout (read once) -0.090R vs -1.481R. Still
// negative: the signal has no gross edge; the floor only shrinks the notional (risk 0.5% / 2% stop = 0.25x equity) so
// costs are a small share of each trade.
export const PRO_LIVE: Params = { breakoutN: 15, stopAtr: 3, targetR: 3, timeStopBars: 15, minStopPct: 0.02, beR: 1.5 }
export const PRO_V100: Params = { breakoutN: 15, stopAtr: 1.2, targetR: 3, timeStopBars: 15 }
// minStopPct: the stop is never closer than this share of the entry price; beR: breakeven trigger AND trail distance in R
export interface Params { breakoutN: number; stopAtr: number; targetR: number; timeStopBars: number; minStopPct?: number; beR?: number }
export interface Bar { t: number; open: number; high: number; low: number; close: number; vol: number }
export const proSlip = (sym: string) => (sym === 'BTC' || sym === 'ETH' ? PRO.slipMajor : PRO.slipAlt)

// ── indicators (Wilder where the standard is Wilder) ─────────────────────────────────────────────────
export function ema(x: ArrayLike<number>, n: number): Float64Array {
  const o = new Float64Array(x.length).fill(NaN), k = 2 / (n + 1); let e = NaN
  for (let i = 0; i < x.length; i++) { e = i ? x[i] * k + e * (1 - k) : x[i]; if (i >= n - 1) o[i] = e }
  return o
}
export function rsi(c: ArrayLike<number>, n: number): Float64Array {
  const o = new Float64Array(c.length).fill(NaN); let g = 0, l = 0
  for (let i = 1; i < c.length; i++) {
    const d = c[i] - c[i - 1], up = d > 0 ? d : 0, dn = d < 0 ? -d : 0
    if (i <= n) { g += up / n; l += dn / n } else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n }
    if (i >= n) o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l)
  }
  return o
}
export function atr(b: Bar[], n: number): Float64Array {
  const o = new Float64Array(b.length).fill(NaN); let a = 0
  for (let i = 0; i < b.length; i++) {
    const x = b[i], tr = i ? Math.max(x.high - x.low, Math.abs(x.high - b[i - 1].close), Math.abs(x.low - b[i - 1].close)) : x.high - x.low
    a = i < n ? (a * i + tr) / (i + 1) : (a * (n - 1) + tr) / n
    if (i >= n) o[i] = a
  }
  return o
}
export function adx(b: Bar[], n: number): Float64Array {
  const o = new Float64Array(b.length).fill(NaN); let tr = 0, pd = 0, md = 0, ax = 0, cnt = 0
  for (let i = 1; i < b.length; i++) {
    const x = b[i], p = b[i - 1], up = x.high - p.high, dn = p.low - x.low
    const t = Math.max(x.high - x.low, Math.abs(x.high - p.close), Math.abs(x.low - p.close))
    const pdm = up > dn && up > 0 ? up : 0, mdm = dn > up && dn > 0 ? dn : 0
    if (i <= n) { tr += t; pd += pdm; md += mdm } else { tr = tr - tr / n + t; pd = pd - pd / n + pdm; md = md - md / n + mdm }
    if (i < n) continue
    const pdi = tr > 0 ? 100 * pd / tr : 0, mdi = tr > 0 ? 100 * md / tr : 0, dx = pdi + mdi > 0 ? 100 * Math.abs(pdi - mdi) / (pdi + mdi) : 0
    cnt++; ax = cnt <= n ? ax + dx / n : (ax * (n - 1) + dx) / n
    if (cnt >= n) o[i] = ax
  }
  return o
}
// 5m realised-vol percentile: stdev of the last rvLen log returns, ranked within the previous rvLookback values
export function rvPct(b: Bar[]): Float64Array {
  const n = b.length, rv = new Float64Array(n).fill(NaN), o = new Float64Array(n).fill(NaN), L = PRO.rvLen
  for (let i = L; i < n; i++) { let s = 0, s2 = 0; for (let j = i - L + 1; j <= i; j++) { const r = Math.log(b[j].close / b[j - 1].close); s += r; s2 += r * r }
    rv[i] = Math.sqrt(Math.max(0, s2 / L - (s / L) ** 2)) }
  for (let i = L + PRO.rvLookback; i < n; i++) { let c = 0; for (let j = i - PRO.rvLookback; j < i; j++) if (rv[j] <= rv[i]) c++; o[i] = c / PRO.rvLookback }
  return o
}
// complete UTC-aligned buckets of `min` minutes from 1m bars (exactly Binance's own 5m / 15m bars)
export function aggregate(m1: Bar[], min: number): Bar[] {
  const ms = min * 60_000, out: Bar[] = []; let cur: Bar | null = null, cnt = 0
  for (const x of m1) {
    const t = Math.floor(x.t / ms) * ms
    if (!cur || cur.t !== t) { if (cur && cnt === min) out.push(cur); cur = { t, open: x.open, high: x.high, low: x.low, close: x.close, vol: x.vol }; cnt = 1 }
    else { cur.high = Math.max(cur.high, x.high); cur.low = Math.min(cur.low, x.low); cur.close = x.close; cur.vol += x.vol; cnt++ }
  }
  if (cur && cnt === min) out.push(cur)
  return out
}

// ── per-1m-bar features, aligned to the last CLOSED 5m / 15m bar ───────────────────────────────────
export interface Feat {
  n: number; atr1: Float64Array; rsi9: Float64Array; vAvg: Float64Array; vwap: Float64Array
  up15: Int8Array; trend5: Int8Array; adx5: Float64Array; rv5: Float64Array; ema200: Float64Array
}
export function features(m1: Bar[], m5: Bar[], m15: Bar[]): Feat {
  const n = m1.length, c1 = m1.map((x) => x.close)
  const atr1 = atr(m1, PRO.atrLen), rsi9 = rsi(c1, PRO.rsiLen), vAvg = new Float64Array(n).fill(NaN), vwap = new Float64Array(n).fill(NaN)
  let vs = 0
  for (let i = 0; i < n; i++) { if (i >= PRO.volLen) vAvg[i] = vs / PRO.volLen; vs += m1[i].vol; if (i >= PRO.volLen) vs -= m1[i - PRO.volLen].vol }
  let day = -1, pv = 0, vv = 0
  for (let i = 0; i < n; i++) { const d = Math.floor(m1[i].t / 86_400_000); if (d !== day) { day = d; pv = 0; vv = 0 }
    const x = m1[i]; pv += (x.high + x.low + x.close) / 3 * x.vol; vv += x.vol; vwap[i] = vv > 0 ? pv / vv : x.close }
  const e200 = ema(m15.map((x) => x.close), PRO.ema15)
  const c5 = m5.map((x) => x.close), e20 = ema(c5, PRO.emaFast5), e50 = ema(c5, PRO.emaSlow5), a5 = adx(m5, PRO.adxLen), r5 = rvPct(m5)
  const up15 = new Int8Array(n), trend5 = new Int8Array(n), adx5 = new Float64Array(n).fill(NaN), rv5 = new Float64Array(n).fill(NaN), ema200 = new Float64Array(n).fill(NaN)
  let j5 = -1, j15 = -1
  for (let i = 0; i < n; i++) {
    const T = m1[i].t + 60_000   // the moment bar i closes
    while (j5 + 1 < m5.length && m5[j5 + 1].t + 300_000 <= T) j5++
    while (j15 + 1 < m15.length && m15[j15 + 1].t + 900_000 <= T) j15++
    if (j15 >= 0 && e200[j15] > 0) { ema200[i] = e200[j15]; up15[i] = m1[i].close > e200[j15] ? 1 : -1 }
    if (j5 >= 0 && e50[j5] > 0) { trend5[i] = e20[j5] > e50[j5] ? 1 : -1; adx5[i] = a5[j5]; rv5[i] = r5[j5] }
  }
  return { n, atr1, rsi9, vAvg, vwap, up15, trend5, adx5, rv5, ema200 }
}
export const inFundingWindow = (T: number) => { const m = (T / 60_000) % 480; return m < PRO.fundingSkipMin || m > 480 - PRO.fundingSkipMin }
export const regimeOk = (f: Feat, i: number) => f.adx5[i] > PRO.adxMin && f.rv5[i] >= PRO.rvPctMin
// why the bar at i is not a trade (null = signal); same order the dashboard prints
export function proCheck(m1: Bar[], f: Feat, i: number, N: number): { dir: 1 | -1 | 0; checks: { k: string; v: number; ok: boolean }[] } {
  const x = m1[i]
  if (i < Math.max(N, PRO.volLen) + 1 || !(f.atr1[i] > 0)) return { dir: 0, checks: [] }
  let hi = -Infinity, lo = Infinity; for (let j = i - N; j < i; j++) { if (m1[j].high > hi) hi = m1[j].high; if (m1[j].low < lo) lo = m1[j].low }
  const dir: 1 | -1 = x.close > hi ? 1 : x.close < lo ? -1 : (f.up15[i] || 1) as 1 | -1
  const checks = [
    { k: 'htf15_ema200', v: f.ema200[i], ok: f.up15[i] === dir },
    { k: 'ema20_50_5m', v: f.trend5[i], ok: f.trend5[i] === dir },
    { k: 'adx5', v: f.adx5[i], ok: f.adx5[i] > PRO.adxMin },
    { k: 'vwap', v: f.vwap[i], ok: dir * (x.close - f.vwap[i]) > 0 },
    { k: 'regime_rv', v: f.rv5[i], ok: f.rv5[i] >= PRO.rvPctMin },
    { k: 'no_funding_window', v: 0, ok: !inFundingWindow(x.t + 60_000) },
    { k: 'breakout', v: dir > 0 ? hi : lo, ok: dir > 0 ? x.close > hi : x.close < lo },
    { k: 'volume', v: f.vAvg[i] > 0 ? x.vol / f.vAvg[i] : 0, ok: x.vol > PRO.volMult * f.vAvg[i] },
    { k: 'rsi9', v: f.rsi9[i], ok: dir * (f.rsi9[i] - PRO.rsiMid) > 0 },
  ]
  return { dir: checks.every((c) => c.ok) ? dir : 0, checks }
}

// ── exits: one state machine for both consumers ──────────────────────────────────────────────────
export interface Pos { dir: 1 | -1; entry: number; r: number; stop: number; target: number; best: number; bars: number; reached1R: boolean }
export function openPos(dir: 1 | -1, entry: number, atr1: number, p: Params): Pos {
  const r = Math.max(p.stopAtr * atr1, (p.minStopPct ?? 0) * entry)
  return { dir, entry, r, stop: entry - dir * r, target: entry + dir * p.targetR * r, best: entry, bars: 0, reached1R: false }
}
// one completed 1m bar after entry: stop first (if both touch), then target; then ratchet; then time stops.
// Returns the exit price BEFORE slippage (gaps fill at the open), or null.
export function stepBar(s: Pos, b: Bar, p: Params): { px: number; why: string } | null {
  const d = s.dir
  s.bars++
  if (d * (b.open - s.stop) <= 0) return { px: b.open, why: 'STOP' }
  if ((d > 0 ? b.low : b.high) * d <= s.stop * d) return { px: s.stop, why: s.reached1R ? 'TRAIL' : 'STOP' }
  if (d * (b.open - s.target) >= 0) return { px: b.open, why: 'TARGET' }
  if ((d > 0 ? b.high : b.low) * d >= s.target * d) return { px: s.target, why: 'TARGET' }
  ratchet(s, d > 0 ? b.high : b.low, p)
  if (!s.reached1R && s.bars >= p.timeStopBars) return { px: b.close, why: 'TIME' }
  if (s.bars >= PRO.maxHoldBars) return { px: b.close, why: 'MAXHOLD' }
  return null
}
// at +1R the stop moves to breakeven, then trails trailR behind the best price; never loosens
// (v100.4: p.beR replaces both 1R distances when set; reached1R then means "reached the breakeven trigger")
export function ratchet(s: Pos, px: number, p?: Params) {
  const d = s.dir, be = p?.beR ?? PRO.beAtR, tr = p?.beR ?? PRO.trailR
  if (d * (px - s.best) > 0) s.best = px
  if (d * (s.best - s.entry) >= be * s.r) {
    s.reached1R = true
    const ns = s.best - d * tr * s.r
    if (d * (ns - s.stop) > 0) s.stop = ns
  }
}
// position size: risk at the stop, capped by notional <= maxNotionalEq x equity and by the margin cash can post
export function proSize(equity: number, cash: number, entry: number, r: number): number {
  const byRisk = equity * PRO.riskPct / (r / entry), cap = equity * PRO.maxNotionalEq, byCash = Math.max(0, cash) * PRO.lev / (1 + PRO.lev * PRO.fee)
  return Math.max(0, Math.min(byRisk, cap, byCash))
}

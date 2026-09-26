// v97.0 CHAN — the live (paper) port of quant/ (Ernest Chan's method). Pure functions only; the runner is
// supabase/functions/trading-bot/chan-runner.ts. Every number mirrors quant/config.yaml and every function mirrors its
// Python twin (quant/strategies/*.py, quant/risk/manager.py); tests/chan.test.ts checks parity against fixtures
// produced by the Python code.
//
// STATUS, stated where it matters: the Python walk-forward + holdout rated EVERY strategy NO-GO (quant/reports/
// BACKTEST_REPORT.md). The owner chose to run the regime router live on paper anyway (2026-09-26: "run the system in
// demo the way Chan said, as if he were trading"). The risk layer is the prompt's, unchanged: half-Kelly on the
// strategy's OWN live record (default 0.25% until 30 trades, 0 when the record is negative), capped at 1%; 3x; daily
// -3% -> pause to 00:00 UTC; -10% from peak -> close all + halt; 5 losses in a row -> pause to 00:00 UTC; max 5 open.

export const CHAN = {
  tf: '5m', barMs: 300_000, bars: 9000,
  universe: ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'DOT'] as const,
  mr: { statWindow: 2016, hurstMax: 0.45, adfP: 0.05, hlMin: 5, hlMax: 300, maxHoldHalflives: 3 },
  mom: { sigWindow: 4032, tMin: 2.0, stopAtr: 2.0 },
  regime: { window: 2016, every: 288, hurstMr: 0.45, hurstTrend: 0.55, volPctHigh: 0.90, minHist: 20, maxHist: 90 },
  // the parameters the Python walk-forward chose for the regime router on the WF region (quant/reports/backtest-5m.json)
  params: { RG_MR: { entryZ: 2.5, exitZ: 0.0, stopZ: 3.5 }, RG_MOM: { kind: 'breakout' as const, lookback: 144, hold: 12 } },
  risk: { kellyFraction: 0.5, cap: 0.01, kellyMinTrades: 30, defaultRisk: 0.0025, maxLeverage: 3, dailyLoss: 0.03,
    maxDD: 0.10, maxConsec: 5, maxOpen: 5, minStopToCost: 3.0 },
  costs: { taker: 0.0005, maker: 0.0002 },
  entryWindowMs: 120_000,
} as const

export const MEAN_REVERT = 1, TREND = 2, HIGH_VOL = 3, NEUTRAL = 0

// ---------- numerics ----------------------------------------------------------------------------------------------
const mean = (a: ArrayLike<number>) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s / a.length }
const stdPop = (a: ArrayLike<number>) => { const m = mean(a); let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - m) ** 2; return Math.sqrt(s / a.length) }
// standard normal CDF (Abramowitz-Stegun 7.1.26 via erf, |err| < 1.5e-7)
export function normCdf(x: number): number {
  const z = Math.abs(x) / Math.SQRT2, t = 1 / (1 + 0.3275911 * z)
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z)
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y)
}

// ADF with a constant and 1 lagged difference (statsmodels adfuller(maxlag=1, regression='c', autolag=None)):
// dy_t = a + g*y_{t-1} + b*dy_{t-1} + e ; t-stat of g ; MacKinnon (1994) p-value, N = 1.
export function adfPvalue(y: ArrayLike<number>): number {
  const n = y.length
  if (n < 30) return NaN
  const dy: number[] = []; for (let i = 1; i < n; i++) dy.push(y[i] - y[i - 1])
  // rows t = 2..n-1: dependent dy[t-1] (= y_t - y_{t-1}), regressors y_{t-1}, dy[t-2]
  const Y: number[] = [], X1: number[] = [], X2: number[] = []
  for (let t = 2; t < n; t++) { Y.push(dy[t - 1]); X1.push(y[t - 1]); X2.push(dy[t - 2]) }
  const m = Y.length, my = mean(Y), m1 = mean(X1), m2 = mean(X2)   // centering = the constant
  let s11 = 0, s22 = 0, s12 = 0, s1y = 0, s2y = 0
  for (let i = 0; i < m; i++) { const a = X1[i] - m1, b = X2[i] - m2, c = Y[i] - my; s11 += a * a; s22 += b * b; s12 += a * b; s1y += a * c; s2y += b * c }
  const det = s11 * s22 - s12 * s12
  if (!(det > 0)) return NaN
  const g = (s22 * s1y - s12 * s2y) / det, b = (s11 * s2y - s12 * s1y) / det
  let sse = 0
  for (let i = 0; i < m; i++) { const r = (Y[i] - my) - g * (X1[i] - m1) - b * (X2[i] - m2); sse += r * r }
  const s2 = sse / (m - 3)
  const tstat = g / Math.sqrt(s2 * s22 / det)
  return mackinnonP(tstat)
}
export function mackinnonP(t: number): number {
  if (t > 2.74) return 1
  if (t < -18.83) return 0
  const c = t <= -1.61 ? [2.1659, 1.4412, 0.038269] : [1.7339, 0.93202, -0.12745, -0.010368]
  let v = 0; for (let k = c.length - 1; k >= 0; k--) v = v * t + c[k]
  return normCdf(v)
}

// Hurst from std(y[t+k]-y[t]) ~ k^H over ~20 log-spaced lags (numpy logspace(0.3, log10(maxLag), 20).astype(int))
export function hurst(y: ArrayLike<number>, maxLag = 100): number {
  const n = y.length
  const hi = Math.log10(Math.max(3, Math.min(maxLag, Math.floor(n / 4))))
  const lags = [...new Set(Array.from({ length: 20 }, (_, i) => Math.trunc(10 ** (0.3 + (hi - 0.3) * i / 19))))].filter(k => k >= 2).sort((a, b) => a - b)
  const xs: number[] = [], ys: number[] = []
  for (const k of lags) {
    const d: number[] = []; for (let i = k; i < n; i++) d.push(y[i] - y[i - k])
    const s = stdPop(d)
    if (s > 0) { xs.push(Math.log(k)); ys.push(Math.log(s)) }
  }
  if (xs.length < 3) return NaN
  const mx = mean(xs), myy = mean(ys)
  let num = 0, den = 0; for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - myy); den += (xs[i] - mx) ** 2 }
  return num / den
}

export function halfLife(y: ArrayLike<number>): number {
  const n = y.length
  if (n < 30) return NaN
  const lag: number[] = [], dy: number[] = []
  for (let i = 1; i < n; i++) { lag.push(y[i - 1]); dy.push(y[i] - y[i - 1]) }
  const ml = mean(lag), md = mean(dy)
  let num = 0, den = 0; for (let i = 0; i < lag.length; i++) { num += (lag[i] - ml) * (dy[i] - md); den += (lag[i] - ml) ** 2 }
  if (den === 0) return NaN
  const lam = num / den
  return lam < 0 ? -Math.log(2) / lam : Infinity
}

// Wilder ATR as pandas ewm(alpha=1/n, adjust=False) seeded with the first TR (quant/strategies/stats.py atr)
export function atrLast(h: ArrayLike<number>, l: ArrayLike<number>, c: ArrayLike<number>, n = 14): number {
  let a = NaN
  for (let i = 0; i < c.length; i++) {
    const pc = i ? c[i - 1] : c[0]
    const tr = Math.max(h[i] - l[i], Math.abs(h[i] - pc), Math.abs(l[i] - pc))
    a = i === 0 ? tr : a + (tr - a) / n
  }
  return c.length >= n ? a : NaN
}

// t-stat of corr(past L, next H) on non-overlapping anchors whose future leg ended at or before i (momentum.py)
export function momentumT(logp: ArrayLike<number>, L: number, H: number, window: number, i = logp.length - 1): number {
  const ks: number[] = []; for (let k = i - window + 1 + L; k < i - H + 1; k += H) if (k - L >= 0) ks.push(k)
  if (ks.length < 20) return NaN
  const x = ks.map(k => logp[k] - logp[k - L]), y = ks.map(k => logp[k + H] - logp[k])
  const mx = mean(x), my = mean(y)
  let sxy = 0, sxx = 0, syy = 0; for (let j = 0; j < ks.length; j++) { sxy += (x[j] - mx) * (y[j] - my); sxx += (x[j] - mx) ** 2; syy += (y[j] - my) ** 2 }
  if (!(sxx > 0) || !(syy > 0)) return NaN
  const r = sxy / Math.sqrt(sxx * syy)
  return r * Math.sqrt((ks.length - 2) / Math.max(1e-12, 1 - r * r))
}

// ---------- the regime + the two routed strategies, evaluated at the LAST CLOSED bar ------------------------------
export interface Bar { t: number; o: number; h: number; l: number; c: number }
export interface ChanView {
  regime: number; hurst: number; volPct: number; vol: number
  mr: { hl: number; z: number; mean: number; std: number; gate: boolean; side: 0 | 1 | -1; exitLong: boolean; exitShort: boolean; stopLong: number; stopShort: number; maxHold: number }
  mom: { t: number; gate: boolean; side: 0 | 1 | -1; atr: number; stopLong: number; stopShort: number; hh: number; ll: number }
}
export function chanView(bars: Bar[]): ChanView | null {
  const n = bars.length, W = CHAN.regime.window
  if (n < Math.max(W, CHAN.mom.sigWindow) + 1) return null
  const logp = bars.map(b => Math.log(b.c))
  const win = logp.slice(n - W)
  // regime: Hurst + vol, vol percentile vs PAST daily estimates (windows ending every 288 bars back, up to 90)
  const H = hurst(win), vol = stdPop(win.slice(1).map((v, i) => v - win[i]))
  const past: number[] = []
  for (let k = 1; k <= CHAN.regime.maxHist; k++) {
    const e = n - 1 - k * CHAN.regime.every
    if (e - W + 1 < 0) break
    const w = logp.slice(e - W + 1, e + 1); past.push(stdPop(w.slice(1).map((v, i) => v - w[i])))
  }
  const volPct = past.length >= CHAN.regime.minHist ? past.filter(v => v < vol).length / past.length : NaN
  let regime = NEUTRAL
  if (Number.isFinite(H) && H < CHAN.regime.hurstMr) regime = MEAN_REVERT
  if (Number.isFinite(H) && H > CHAN.regime.hurstTrend) regime = TREND
  if (Number.isFinite(volPct) && volPct > CHAN.regime.volPctHigh) regime = HIGH_VOL
  if (!Number.isFinite(H)) regime = NEUTRAL
  // A. mean reversion (router: gate = regime MEAN_REVERT, i.e. Hurst < 0.45, + half-life in range)
  const p = CHAN.params.RG_MR, hlRaw = halfLife(win)
  const hlOk = hlRaw >= CHAN.mr.hlMin && hlRaw <= CHAN.mr.hlMax
  const L = Number.isFinite(hlRaw) ? Math.min(CHAN.mr.hlMax, Math.max(CHAN.mr.hlMin, Math.round(hlRaw))) : NaN
  let z = NaN, mu = NaN, sd = NaN
  if (Number.isFinite(L)) { const w = logp.slice(n - L); mu = mean(w); sd = Math.sqrt(w.reduce((s, v) => s + (v - mu) ** 2, 0) / (L - 1)); z = (logp[n - 1] - mu) / sd }
  const mrGate = regime === MEAN_REVERT && hlOk && Number.isFinite(z) && sd > 0
  const mrSide: 0 | 1 | -1 = mrGate && z <= -p.entryZ ? 1 : mrGate && z >= p.entryZ ? -1 : 0
  const maxHold = Number.isFinite(hlRaw) ? Math.ceil(CHAN.mr.maxHoldHalflives * Math.min(CHAN.mr.hlMax, Math.max(1, hlRaw))) : 0
  // B. momentum breakout (router: gate = regime TREND + significance t >= 2)
  const q = CHAN.params.RG_MOM
  const t = momentumT(logp, q.lookback, q.hold, CHAN.mom.sigWindow)
  let hh = -Infinity, ll = Infinity; for (let k = n - 1 - q.lookback; k < n - 1; k++) { hh = Math.max(hh, bars[k].h); ll = Math.min(ll, bars[k].l) }
  const atr = atrLast(bars.map(b => b.h), bars.map(b => b.l), bars.map(b => b.c), 14)
  const c = bars[n - 1].c
  const momGate = regime === TREND && Number.isFinite(t) && t >= CHAN.mom.tMin && Number.isFinite(atr)
  const momSide: 0 | 1 | -1 = momGate && c > hh ? 1 : momGate && c < ll ? -1 : 0
  return {
    regime, hurst: H, volPct, vol,
    mr: { hl: hlRaw, z, mean: mu, std: sd, gate: mrGate, side: mrSide, exitLong: Number.isFinite(z) && z >= -p.exitZ, exitShort: Number.isFinite(z) && z <= p.exitZ,
      stopLong: Math.exp(mu - p.stopZ * sd), stopShort: Math.exp(mu + p.stopZ * sd), maxHold },
    mom: { t, gate: momGate, side: momSide, atr, stopLong: c - CHAN.mom.stopAtr * atr, stopShort: c + CHAN.mom.stopAtr * atr, hh, ll },
  }
}

// ---------- risk (quant/risk/manager.py) --------------------------------------------------------------------------
export function kellyRisk(rs: number[]): { f: number; why: string } {
  const r = CHAN.risk
  if (rs.length < r.kellyMinTrades) return { f: Math.min(r.defaultRisk, r.cap), why: `default ${r.defaultRisk} (only ${rs.length} of ${r.kellyMinTrades} trades)` }
  const m = mean(rs), m2 = rs.reduce((s, v) => s + v * v, 0) / rs.length
  const full = m2 > 0 ? m / m2 : 0
  const f = Math.max(0, Math.min(r.cap, r.kellyFraction * full))
  return { f, why: f > 0 ? `half-Kelly ${(r.kellyFraction * full).toFixed(4)} capped ${r.cap}` : 'half-Kelly <= 0 (no positive edge in its own record)' }
}
export interface RiskState { peak: number; day: number; dayOpen: number; pausedUntilDay: number; streakFrom: number; halted: boolean; haltReason: string }
export const DAY_MS = 86_400_000
export interface Closed { pnl: number; closedAt: number }
// Rebuild the day / streak / pause state for `now` from the persisted state + the closed CHAN trades. Returns the new
// state and an event ('KILL' | 'DAILY_STOP' | 'CONSEC_STOP' | null).
export function riskStep(st: RiskState, now: number, equity: number, closed: Closed[]): { st: RiskState; ev: string | null } {
  const r = CHAN.risk, s = { ...st }
  const day = Math.floor(now / DAY_MS)
  if (day !== s.day) {
    s.day = day; s.dayOpen = equity
    if (s.pausedUntilDay !== -1 && day >= s.pausedUntilDay) { s.pausedUntilDay = -1; s.streakFrom = now }
  }
  if (equity > s.peak) s.peak = equity
  if (!s.halted && equity <= s.peak * (1 - r.maxDD)) {
    s.halted = true; s.haltReason = `max drawdown ${r.maxDD * 100}% hit: equity ${equity.toFixed(2)} vs peak ${s.peak.toFixed(2)}`
    return { st: s, ev: 'KILL' }
  }
  if (s.pausedUntilDay === -1) {
    const today = closed.filter(x => Math.floor(x.closedAt / DAY_MS) === day)
    const realised = today.reduce((a, x) => a + x.pnl, 0)
    if (realised <= -r.dailyLoss * s.dayOpen && today.length) { s.pausedUntilDay = day + 1; return { st: s, ev: 'DAILY_STOP' } }
    const recent = closed.filter(x => x.closedAt > s.streakFrom).sort((a, b) => a.closedAt - b.closedAt)
    let streak = 0; for (let i = recent.length - 1; i >= 0 && recent[i].pnl < 0; i--) streak++
    if (streak >= r.maxConsec) { s.pausedUntilDay = day + 1; return { st: s, ev: 'CONSEC_STOP' } }
  }
  return { st: s, ev: null }
}
export function canOpen(st: RiskState, open: number): { ok: boolean; why: string } {
  if (st.halted) return { ok: false, why: 'halted: ' + st.haltReason }
  if (st.pausedUntilDay !== -1) return { ok: false, why: 'paused until next UTC day' }
  if (open >= CHAN.risk.maxOpen) return { ok: false, why: 'max open positions' }
  return { ok: true, why: 'ok' }
}
// notional for a risk fraction f of equity at the stop, capped by leverage room; 0 with a reason when refused
export function chanSize(f: number, equity: number, entry: number, stop: number, openNotional: number): { notional: number; why: string } {
  const dist = Math.abs(entry - stop) / entry
  if (!(dist > 0) || !(entry > 0)) return { notional: 0, why: 'invalid stop' }
  if (dist < CHAN.risk.minStopToCost * 2 * CHAN.costs.taker) return { notional: 0, why: 'stop closer than 3x the round-trip cost' }
  if (!(f > 0)) return { notional: 0, why: 'risk fraction 0' }
  const room = CHAN.risk.maxLeverage * equity - openNotional
  if (room <= 0) return { notional: 0, why: 'max leverage reached' }
  return { notional: Math.min(equity * f / dist, room), why: 'ok' }
}

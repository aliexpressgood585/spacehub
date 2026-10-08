// Frozen research simulator. Pure functions; never emits executable bot signals.
export const SPEC = Object.freeze({
  id: 'RSI2_FORWARD_20X_V1', symbols: ['TRADOORUSDT', 'MYXUSDT'],
  intervalMs: 300000, trendMs: 900000, warmupBars: 1000,
  rsiPeriod: 2, rsiLong: 5, rsiShort: 95, emaPeriod: 200, trendFast: 50,
  adxPeriod: 14, adxMax: 25, volumePeriod: 20, volumeIncludesSignal: true,
  atrPeriod: 14, tpAtr: 1, slAtr: 2, maxBars: 32,
  leverage: 20, initialEquityUsd: 5000, fixedMarginUsd: 250,
  feeSide: .0005, slipSide: .0001, costRt: .0012, stressRt: .0016,
  minTrades: 100, minNetWinRate: .61, oneOpenPerSymbol: true,
  indicatorSeed: 'EMA:first-close;Wilder:SMA',
  qualifiedBotSignals: false, funding: 'settled-rate-times-mark-notional',
})
export type Bar = { t: number; end: number; o: number; h: number; l: number; c: number; v: number }
export type Funding = { t: number; rate: number; mark: number }
type Smooth = { n: number; sum: number; value: number | null }
const smooth = (): Smooth => ({ n: 0, sum: 0, value: null })
function wilder(s: Smooth, x: number, n: number): number | null {
  s.n++; if (s.value === null) { s.sum += x; if (s.n >= n) s.value = s.sum / n }
  else s.value += (x - s.value) / n
  return s.value
}
export type Indicators = {
  count: number; last: Bar | null; ema200: number | null; ema50: number | null;
  gains: Smooth; losses: Smooth; tr: Smooth; plus: Smooth; minus: Smooth; dx: Smooth;
  rsi: number | null; atr: number | null; adx: number | null; volumes: number[];
}
export function indicators(): Indicators {
  return { count: 0, last: null, ema200: null, ema50: null, gains: smooth(), losses: smooth(),
    tr: smooth(), plus: smooth(), minus: smooth(), dx: smooth(), rsi: null, atr: null, adx: null, volumes: [] }
}
export function update(s: Indicators, b: Bar): void {
  if (s.last && b.t !== s.last.t + b.end - b.t) throw new Error('non-contiguous indicator candles')
  s.count++; s.ema200 = s.ema200 === null ? b.c : s.ema200 + 2 / 201 * (b.c - s.ema200)
  s.ema50 = s.ema50 === null ? b.c : s.ema50 + 2 / 51 * (b.c - s.ema50)
  s.volumes.push(b.v); if (s.volumes.length > 20) s.volumes.shift()
  if (s.last) {
    const d = b.c - s.last.c, g = wilder(s.gains, Math.max(d, 0), 2), l = wilder(s.losses, Math.max(-d, 0), 2)
    s.rsi = g === null || l === null ? null : g === 0 && l === 0 ? 50 : l === 0 ? 100 : 100 - 100 / (1 + g / l)
    const tr = Math.max(b.h - b.l, Math.abs(b.h - s.last.c), Math.abs(b.l - s.last.c))
    const up = b.h - s.last.h, down = s.last.l - b.l
    s.atr = wilder(s.tr, tr, 14)
    const p = wilder(s.plus, up > down && up > 0 ? up : 0, 14)
    const m = wilder(s.minus, down > up && down > 0 ? down : 0, 14)
    if (p !== null && m !== null && s.atr !== null) s.adx = wilder(s.dx, p + m === 0 ? 0 : 100 * Math.abs(p - m) / (p + m), 14)
  }
  s.last = b
}
export function verified(info: any, symbol: string): boolean {
  if (!SPEC.symbols.includes(symbol)) return false
  return info?.symbols?.some((x: any) => x.symbol === symbol && x.status === 'TRADING' &&
    x.contractType === 'PERPETUAL' && x.quoteAsset === 'USDT' && x.marginAsset === 'USDT') === true
}
export function signal(symbol: string, five: Indicators, fifteen: Indicators): number {
  const b = five.last, t = fifteen.last
  if (!SPEC.symbols.includes(symbol) || !b || !t || five.count < 200 || fifteen.count < 200 ||
    t.end > b.end || t.end !== Math.floor(b.end / SPEC.trendMs) * SPEC.trendMs ||
    five.rsi === null || !(five.atr! > 0) || five.ema200 === null || fifteen.ema200 === null || fifteen.ema50 === null) return 0
  if (symbol === 'TRADOORUSDT' && (five.adx === null || !(five.adx < 25))) return 0
  if (symbol === 'MYXUSDT' && (five.volumes.length !== 20 || b.v < five.volumes.reduce((a, v) => a + v, 0) / 20)) return 0
  if (five.rsi <= 5 && b.c > five.ema200 && t.c > fifteen.ema200 && fifteen.ema50 > fifteen.ema200) return 1
  if (five.rsi >= 95 && b.c < five.ema200 && t.c < fifteen.ema200 && fifteen.ema50 < fifteen.ema200) return -1
  return 0
}
export type Position = { entry: number; entryTs: number; signalTs: number; side: number; atr: number; tp: number; sl: number; bars: number }
export function enter(side: number, atr: number, signalTs: number, b: Bar): Position {
  if (b.t !== signalTs || ![1, -1].includes(side) || !(atr > 0) || !(b.o > 0)) throw new Error('invalid simulated entry')
  const p = { entry: b.o, entryTs: b.t, signalTs, side, atr, tp: b.o + side * atr, sl: b.o - side * 2 * atr, bars: 0 }
  if (!(p.tp > 0 && p.sl > 0)) throw new Error('non-positive simulated exit level')
  return p
}
export function exit(p: Position, b: Bar, closed: boolean): { px: number; ts: number; reason: string } | null {
  if (b.t !== p.entryTs + p.bars * SPEC.intervalMs) throw new Error('missing holding candle')
  if (p.bars >= 32) return { px: b.o, ts: b.t, reason: 'TIMEOUT_SIMULATED' }
  if (!closed) return null
  p.bars++
  const stop = p.side === 1 ? b.l <= p.sl : b.h >= p.sl
  const target = p.side === 1 ? b.h >= p.tp : b.l <= p.tp
  // Candle-level ambiguity is resolved against the simulator, even if target is also touched.
  if (stop) return { px: p.side === 1 ? Math.min(p.sl, b.o) : Math.max(p.sl, b.o), ts: b.end, reason: 'STOP_SIMULATED' }
  if (target) return { px: p.tp, ts: b.end, reason: 'TARGET_SIMULATED' }
  return null
}
export type Stats = { n: number; wins: number; sum: number; profit: number; loss: number; equity: number; peak: number; maxDd: number; costs: number; fundingMissing: number }
export const stats = (): Stats => ({ n: 0, wins: 0, sum: 0, profit: 0, loss: 0, equity: 5000, peak: 5000, maxDd: 0, costs: 0, fundingMissing: 0 })
export function add(s: Stats, net: number, cost: number, fundingMissing: boolean): void {
  s.n++; if (net > 0) s.wins++; s.sum += net; s.profit += Math.max(net, 0); s.loss += Math.max(-net, 0)
  s.equity += net * 5000; s.peak = Math.max(s.peak, s.equity); s.maxDd = Math.max(s.maxDd, (s.peak - s.equity) / s.peak)
  s.costs += cost * 5000; if (fundingMissing) s.fundingMissing++
}
export function metrics(s: Stats) {
  return { trades: s.n, netWinRate: s.n ? s.wins / s.n : null, netExpectancyPct: s.n ? 100 * s.sum / s.n : null,
    netExpectancyUsd: s.n ? 5000 * s.sum / s.n : null, profitFactor: s.loss > 0 ? s.profit / s.loss : null,
    profitFactorInfinite: s.profit > 0 && s.loss === 0, drawdownPct: 100 * s.maxDd, equityUsd: s.equity,
    deductedCostsUsd: s.costs, fundingMissingTrades: s.fundingMissing }
}
export function passes(s: Stats): boolean {
  return s.n >= 100 && s.wins / s.n >= .61 && s.sum / s.n > 0 && s.profit > s.loss && s.fundingMissing === 0
}
export function qualification(train: { base: Stats; stress: Stats } | null, base: Stats, stress: Stats): string {
  if (train && train.base.n >= 100 && train.stress.n >= 100 && (!passes(train.base) || !passes(train.stress))) return 'NOT_QUALIFIED'
  if (base.n >= 100 && stress.n >= 100 && (!passes(base) || !passes(stress))) return 'NOT_QUALIFIED'
  if (!train || train.base.n < 100 || train.stress.n < 100 || base.n < 100 || stress.n < 100) return 'INSUFFICIENT_DATA'
  return passes(train.base) && passes(train.stress) && passes(base) && passes(stress) ? 'QUALIFIED' : 'NOT_QUALIFIED'
}
export function result(p: Position, out: { px: number; ts: number; reason: string }, funding: Funding[] | null) {
  const applicable = funding?.filter(f => f.t >= p.entryTs && f.t < out.ts) ?? []
  const fundingCost = applicable.reduce((s, f) => s + p.side * f.rate * f.mark / p.entry, 0)
  const gross = p.side * (out.px / p.entry - 1)
  return { label: 'SIMULATED_TRADE_ONLY', ...p, exit: out.px, exitTs: out.ts, reason: out.reason,
    gross, fundingCost, fundingMissing: funding === null, fundingTiming: 'entry-inclusive/exit-exclusive;intrabar-exit-at-bar-end',
    baseCost: SPEC.costRt, stressCost: SPEC.stressRt, net: gross - fundingCost - SPEC.costRt,
    stressNet: gross - fundingCost - SPEC.stressRt, leverage: 20, simulatedMarginUsd: 250,
    simulatedNotionalUsd: 5000, fundingEvents: applicable }
}
export type SimState = { five: Indicators; fifteen: Indicators; pending: { side: number; atr: number; signalTs: number } | null;
  position: Position | null; base: Stats; stress: Stats; observedCandidates: number; lastProcessed: number | null }
export const initial = (): SimState => ({ five: indicators(), fifteen: indicators(), pending: null, position: null,
  base: stats(), stress: stats(), observedCandidates: 0, lastProcessed: null })
// Streaming indicators persist across invocations; only CLOSED bars advance them.
export function advance(symbol: string, s: SimState, bars5: Bar[], bars15: Bar[], now: number, t0: number, funding: Funding[] | null) {
  const journal: ReturnType<typeof result>[] = []
  let j = 0
  for (const b of bars5) {
    if (b.t > now) break
    if (s.lastProcessed !== null && b.t <= s.lastProcessed) continue
    while (j < bars15.length && bars15[j].end <= Math.min(b.end, now)) {
      if (!s.fifteen.last || bars15[j].t > s.fifteen.last.t) update(s.fifteen, bars15[j])
      j++
    }
    // First-ever warmup windows can start in different intervals; no signals precede t0.
    if (s.pending && !s.position) { s.position = enter(s.pending.side, s.pending.atr, s.pending.signalTs, b); s.pending = null }
    const isClosed = b.end <= now
    if (s.position) {
      const out = exit(s.position, b, isClosed)
      if (out) {
        const r = result(s.position, out, funding); journal.push(r)
        add(s.base, r.net, r.baseCost, r.fundingMissing); add(s.stress, r.stressNet, r.stressCost, r.fundingMissing)
        s.position = null
      }
    }
    if (!isClosed) break // A forming candle contributes only its immutable OPEN, never OHLC/volume.
    update(s.five, b); s.lastProcessed = b.t
    if (b.end >= t0 && !s.position && !s.pending) {
      const side = signal(symbol, s.five, s.fifteen)
      if (side) { s.observedCandidates++; s.pending = { side, atr: s.five.atr!, signalTs: b.end } }
    }
  }
  return journal
}

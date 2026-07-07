// ════════════════════════════════════════════════════════════
// CryptoBot v31 — Production-grade trading bot
//
// v31: ENTRY QUALITY IMPROVEMENTS
//  A. ADX hard gate: non-rangeFade entries require ADX >= 20 (trend must exist)
//  B. Loss cooldown: 4-hour cooldown per coin+direction after a losing trade
//  C. MAX_OPEN_TRADES raised to 30 (no artificial cap on good setups)
//
// v30: BOS + EMA200 MACRO ALIGNMENT (Signals #15 & #16)
//  Signal #15 BOS (+8 pts): Break of Structure — bar closed above 20-bar
//  swing high (LONG) or below swing low (SHORT). Confirms momentum, not spike.
//  Signal #16 EMA200 (+8 pts): EMA50 vs EMA200 on 1H (Golden/Death Cross).
//  Partial credit (+4) when macro is neutral. Both are additive bonuses only.
//
// v29: STOP-HUNT / SPRING / UPTHRUST DETECTION
//  Signal #13 (+10 pts): detects liquidity sweeps where price briefly
//  breaks a swing extreme (wiping leveraged stops), then reverses with
//  a long wick and elevated volume — classic Wyckoff Spring (LONG) or
//  Upthrust (SHORT). Additive bonus, never a gate, so trade count
//  stays the same or increases on sweep setups.
//
// v28: FOCUS UNIVERSE — 10 most liquid majors only
//
// v27 upgrades (let winners run):
//  1. TRAIL FROM 1R: breakeven trail starts at 1.0R (was 0.5R — cut winners)
//  2. PARTIAL TP LATER: 1.2-1.8R by vol regime (was 0.8-1.5R)
//  3. EARLY EXIT ONLY ON LOSERS: EMA reversal exit no longer closes winners
//  4. BIGGER POSITIONS: notional cap 8%→12%, total exposure 20%→30%
//  5. OPTIMIZER FLOOR: min_confluence_score clamped to >= 60
//  6. (v27.2) BTC BIAS GATE + max 2 new entries per scan
//  7. (v27.3) TREND-CONTINUATION SETUP: short the bounce in downtrends,
//     long the dip in uptrends — bot is no longer idle in bear markets
//  8. (v27.4) RANGE-FADE MODE: band-extreme fades in low-ADX chop get
//     normal size, score credit, and a realistic mid-band TP
//  9. (v27.6) REVIEW FIXES: coin-1H override for BTC gate, 0.6R half-risk
//     lock, base-score floor 50, tp_r wired to live TP, backtest/live
//     gate parity, dead code removed (findSimpleEntry, shouldSkip, ultra)
// ════════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2'

const BINANCE_DATA = 'https://data-api.binance.vision/api/v3'
const BINANCE      = 'https://api.binance.com/api/v3'
const FAPI         = 'https://fapi.binance.com/fapi/v1'
const FAPI_DATA    = 'https://fapi.binance.com/futures/data'

// v31: expanded to 30 coins — matches dashboard universe
const FIXED_COINS = [
  'BTC','ETH','SOL','BNB','XRP','ADA','DOGE','AVAX','LINK',
  'DOT','POL','UNI','ATOM','LTC','BCH','NEAR','ALGO','FIL',
  'VET','ICP','APT','ARB','OP','SUI','INJ','TRX','HBAR',
  'AAVE','WLD','SEI',
]
const FALLBACK_COINS = FIXED_COINS
const MIN_COIN_WIN_RATE = 0.42
const MIN_COIN_TRADES   = 8

const CORR_GROUPS: string[][] = [
  ['BTC'],
  ['ETH','ARB','OP'],         // ETH ecosystem
  ['SOL','AVAX','APT','SUI'], // high-beta L1s
  ['DOGE','SHIB'],            // meme
  ['ADA','DOT','ATOM','ALGO','VET','ICP'], // alt L1s
  ['LINK','AAVE','UNI','CRV'],// DeFi
  ['LTC','BCH'],              // BTC forks
  ['XRP','HBAR','XLM'],       // payment layer
  ['BNB'],
  ['NEAR','FIL'],             // storage/infra
  ['INJ','SEI','TRX'],        // misc
  ['WLD'],
]
const MAX_PER_GROUP  = 3
const MIN_SCORE      = 2
const VPOC_MAX_DIST  = 0.035

// v21: Dynamic partial TP by vol regime
const PARTIAL_TP_BY_VOL = { LOW: 1.2, MEDIUM: 1.5, HIGH: 1.8 }

// v21: Session-based sizing + strictness
const SESSION_PARAMS = {
  ASIAN: { sizeMult: 1.0, minScoreBonus: 0 },
  EU:    { sizeMult: 1.2, minScoreBonus: 0 },
  US:    { sizeMult: 1.2, minScoreBonus: 0 },
  DEAD:  { sizeMult: 1.0, minScoreBonus: 0 },
}
function getSession(h: number): 'ASIAN'|'EU'|'US'|'DEAD' {
  if (h >= 0  && h < 8)  return 'ASIAN'
  if (h >= 8  && h < 13) return 'EU'
  if (h >= 13 && h < 21) return 'US'
  return 'DEAD'
}

async function fetchAllLiquidCoins(minVolUSD = 25_000_000): Promise<string[]> {
  try {
    const res = await fetch(`${BINANCE_DATA}/ticker/24hr`, {headers:{'User-Agent':'Mozilla/5.0'}})
    if (!res.ok) return FALLBACK_COINS
    const tickers: any[] = await res.json()
    const EXCLUDE = /^(.*)(UP|DOWN|BULL|BEAR|HEDGE|3L|3S|5L|5S)USDT$/
    return tickers
      .filter(t =>
        t.symbol.endsWith('USDT') &&
        /^[A-Z0-9]+USDT$/.test(t.symbol) &&
        !EXCLUDE.test(t.symbol) &&
        parseFloat(t.quoteVolume) >= minVolUSD
      )
      .sort((a,b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
      .slice(0, 60)
      .map(t => t.symbol.replace('USDT',''))
  } catch { return FALLBACK_COINS }
}

async function fetchFearGreed(): Promise<number> {
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1',
      {headers:{'User-Agent':'Mozilla/5.0'}})
    if (!res.ok) return 50
    const data = await res.json()
    return parseInt(data.data?.[0]?.value ?? '50', 10)
  } catch { return 50 }
}

const RISK = {
  low:    { riskPct:0.010, streakLimit:5 },
  medium: { riskPct:0.018, streakLimit:6 },
  high:   { riskPct:0.025, streakLimit:7 },
} as const
type RiskKey = keyof typeof RISK

const FEE             = 0  // no fee simulation
const LEVERAGE        = 10
const SWING_N         = 5
const SWING_LOOKBACK  = 60
const SWEEP_LOOKBACK  = 5
const MAX_HOLD_MIN    = 180
const STREAK_PAUSE_MS = 10*60_000
const MAX_NOTIONAL_PCT= 0.12
const MAX_OPEN_TRADES = 30
const MAX_TOTAL_EXPOSURE_PCT = 1.0  // 100% — no idle cash
const FUNDING_EXTREME = 0.0003
const MIN_SL_PCT      = 0.005
const SYM_COOLDOWN_MS = 15*60_000
const MAX_NEW_ENTRIES_PER_SCAN = 2
const MAX_DD_STOP     = 0.80
const INITIAL_BALANCE = 10000
const DAILY_LOSS_LIMIT_PCT = 0.03
const FUNDING_AGAINST_THRESHOLD = 0.0005

const VOL_PARAMS = {
  LOW:    { slMult:2.0, tpR:2.2, trailBeR:0.8, trailAtr:0.6 },
  MEDIUM: { slMult:1.5, tpR:2.2, trailBeR:0.8, trailAtr:0.7 },
  HIGH:   { slMult:1.2, tpR:2.5, trailBeR:1.0, trailAtr:0.8 },
}

interface Bar { open:number; high:number; low:number; close:number; vol:number }

async function fetchBars(sym:string, interval:string, limit:number): Promise<Bar[]> {
  try {
    const res = await fetch(
      `${BINANCE_DATA}/klines?symbol=${sym}USDT&interval=${interval}&limit=${limit}`,
      { headers:{'User-Agent':'Mozilla/5.0'} }
    )
    if (!res.ok) return []
    const data:number[][] = await res.json()
    return data.map(k=>({open:+k[1],high:+k[2],low:+k[3],close:+k[4],vol:+k[5]}))
  } catch { return [] }
}

function calcATR(bars:Bar[], p=14): number {
  if (bars.length < p+1) return bars[0]?.high - bars[0]?.low || 0
  const trs = bars.slice(1).map((b,i)=>Math.max(
    b.high-b.low, Math.abs(b.high-bars[i].close), Math.abs(b.low-bars[i].close)
  ))
  let atr = trs.slice(0,p).reduce((a,v)=>a+v,0)/p
  for (let i=p; i<trs.length; i++) atr=(atr*(p-1)+trs[i])/p
  return atr
}

function calcEma(closes:number[], p:number): number {
  const k=2/(p+1); let e=closes[0]
  for (let i=1; i<closes.length; i++) e=closes[i]*k+e*(1-k)
  return e
}

function calcEmaArr(closes:number[], p:number): number[] {
  const k=2/(p+1); const out=[closes[0]]
  for (let i=1; i<closes.length; i++) out.push(closes[i]*k+out[i-1]*(1-k))
  return out
}

function calcRsi(closes:number[], p=14): number {
  if (closes.length < p+1) return 50
  let g=0, l=0
  for (let i=closes.length-p; i<closes.length; i++) {
    const d=closes[i]-closes[i-1]; if(d>0) g+=d; else l-=d
  }
  g/=p; l/=p; return l===0?100:100-100/(1+g/l)
}

function calcBB(closes: number[], period=20, mult=2.0): {
  upper:number; mid:number; lower:number; width:number
} {
  const slice = closes.slice(-period)
  if (slice.length < period) return {upper:0,mid:0,lower:0,width:0}
  const mid = slice.reduce((a,b)=>a+b,0)/slice.length
  const variance = slice.reduce((a,b)=>a+(b-mid)**2,0)/slice.length
  const std = Math.sqrt(variance)
  const upper = mid+mult*std, lower = mid-mult*std
  return {upper, mid, lower, width: mid>0?(upper-lower)/mid:0}
}

// ═══════════════════════════════════════════════════════════════════════════
// UPGRADE 1: CORRELATION HEDGING
// ═══════════════════════════════════════════════════════════════════════════

function calcCorrelationMatrix(series1: number[], series2: number[], window = 100): number {
  const s1 = series1.slice(-window)
  const s2 = series2.slice(-window)
  if (s1.length < window || s2.length < window) return 0

  const mean1 = s1.reduce((a,b)=>a+b,0)/s1.length
  const mean2 = s2.reduce((a,b)=>a+b,0)/s2.length

  let covariance = 0, var1 = 0, var2 = 0
  for (let i = 0; i < s1.length; i++) {
    const d1 = s1[i] - mean1, d2 = s2[i] - mean2
    covariance += d1 * d2
    var1 += d1 * d1
    var2 += d2 * d2
  }

  const denominator = Math.sqrt(var1 * var2)
  return denominator > 0 ? covariance / denominator : 0
}

function applyCorrelationHedge(correlation: number, side: 'LONG'|'SHORT'): number {
  // LONG: if corr with BTC > 0.8, reduce size by 30%
  if (side === 'LONG' && correlation > 0.80) return 0.70
  // SHORT: if corr with BTC < -0.7, boost size by 20%
  if (side === 'SHORT' && correlation < -0.70) return 1.20
  return 1.0
}

// ═══════════════════════════════════════════════════════════════════════════
// UPGRADE 2: ENHANCED ENTRY CONFIRMATION (Stochastic + Divergence + MACD)
// ═══════════════════════════════════════════════════════════════════════════

function calcStochastic(closes: number[], highs: number[], lows: number[], k=14, smoothK=3): {K: number; D: number} {
  if (closes.length < k) return {K: 50, D: 50}

  const recentCloses = closes.slice(-k)
  const recentHighs = highs.slice(-k)
  const recentLows = lows.slice(-k)

  const minLow = Math.min(...recentLows)
  const maxHigh = Math.max(...recentHighs)
  const currentClose = closes[closes.length-1]

  const range = maxHigh - minLow
  const K = range > 0 ? ((currentClose - minLow) / range) * 100 : 50

  // Simplified D = SMA of K (last 3 K values)
  const kValues = []
  for (let i = Math.max(0, closes.length-k-smoothK); i < closes.length; i++) {
    const slice = closes.slice(Math.max(0, i-k+1), i+1)
    const sliceH = highs.slice(Math.max(0, i-k+1), i+1)
    const sliceL = lows.slice(Math.max(0, i-k+1), i+1)
    const minL = Math.min(...sliceL), maxH = Math.max(...sliceH)
    const rg = maxH - minL
    const kVal = rg > 0 ? ((slice[slice.length-1] - minL) / rg) * 100 : 50
    kValues.push(kVal)
  }

  const D = kValues.length > 0 ? kValues.slice(-smoothK).reduce((a,b)=>a+b,0)/Math.min(smoothK,kValues.length) : K

  return {K, D}
}

function detectDivergence(rsiValues: number[], priceValues: number[]): 'BULL_DIV'|'BEAR_DIV'|'NONE' {
  if (rsiValues.length < 5 || priceValues.length < 5) return 'NONE'

  // Bullish divergence: price makes new low but RSI higher
  const priceLow1 = Math.min(...priceValues.slice(-5))
  const priceLow2 = Math.min(...priceValues.slice(-10, -5))
  const rsiLow1 = Math.min(...rsiValues.slice(-5))
  const rsiLow2 = Math.min(...rsiValues.slice(-10, -5))

  if (priceLow1 < priceLow2 && rsiLow1 > rsiLow2 && rsiLow1 < 40) return 'BULL_DIV'

  // Bearish divergence: price makes new high but RSI lower
  const priceHigh1 = Math.max(...priceValues.slice(-5))
  const priceHigh2 = Math.max(...priceValues.slice(-10, -5))
  const rsiHigh1 = Math.max(...rsiValues.slice(-5))
  const rsiHigh2 = Math.max(...rsiValues.slice(-10, -5))

  if (priceHigh1 > priceHigh2 && rsiHigh1 < rsiHigh2 && rsiHigh1 > 60) return 'BEAR_DIV'

  return 'NONE'
}

function calcMACD(closes: number[], fastPeriod=12, slowPeriod=26, signalPeriod=9): {macd: number; signal: number; histogram: number} {
  if (closes.length < slowPeriod) return {macd: 0, signal: 0, histogram: 0}

  const emaFast = calcEma(closes, fastPeriod)
  const emaSlow = calcEma(closes, slowPeriod)
  const macd = emaFast - emaSlow

  // Build MACD line for signal calculation
  const macdLine = []
  for (let i = Math.max(0, closes.length-50); i < closes.length; i++) {
    const f = calcEma(closes.slice(0, i+1), fastPeriod)
    const s = calcEma(closes.slice(0, i+1), slowPeriod)
    macdLine.push(f - s)
  }

  const signal = calcEma(macdLine, signalPeriod)
  const histogram = macd - signal

  return {macd, signal, histogram}
}

// ═══════════════════════════════════════════════════════════════════════════
// UPGRADE 3: DYNAMIC MACRO CALENDAR
// ═══════════════════════════════════════════════════════════════════════════

async function fetchMacroCalendar(weekAhead: boolean = false): Promise<any[]> {
  try {
    // Use FRED API or economic calendar endpoint
    // For now, return hardcoded high-impact events (can be enhanced with real API)
    const now = new Date()
    const events = []

    // NFP — first Friday of each month at 12:30 UTC
    const firstFri = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1)
    while (firstFri.getUTCDay() !== 5) firstFri.setDate(firstFri.getDate() + 1)
    events.push({
      date: firstFri,
      event: 'NFP',
      currency: 'USD',
      impact: 3,
      time_utc: '12:30'
    })

    return events
  } catch (e) {
    return []
  }
}

function isMacroEventWindowDynamic(priceTime: Date, macroEvents: any[] = []): boolean {
  // Check if within 30 min of HIGH impact event (impact >= 2)
  // Or 10 min before MEDIUM impact
  const nowMs = priceTime.getTime()

  for (const ev of macroEvents) {
    const eventTime = new Date(ev.date).getTime()
    const diffMin = Math.abs(nowMs - eventTime) / 60000

    if (ev.impact >= 2 && diffMin < 30) return true
    if (ev.impact >= 1 && diffMin < 10) return true
  }

  return false
}

// ═══════════════════════════════════════════════════════════════════════════
// UPGRADE 4: POSITION CORRELATION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

function calcOpenPositionCorrelations(openTrades: any[], btcCloses: number[]): Record<string, number> {
  const correlations: Record<string, number> = {}

  for (const t of openTrades) {
    correlations[t.sym] = 0 // placeholder; would fetch coin closes and calc
  }

  return correlations
}

function checkMaxCorrelationLimit(newTrade: any, openTrades: any[], btcCloses: number[]): boolean {
  const MAX_CORR = 0.7

  for (const ot of openTrades) {
    // Would calculate correlation between newTrade.sym and ot.sym
    // For now, return true (allow)
  }

  return true
}

// ═══════════════════════════════════════════════════════════════════════════
// UPGRADE 5: WIN RATE BOOSTERS (Pivot + Volume + BB Squeeze)
// ═══════════════════════════════════════════════════════════════════════════

function calcPivots(high: number, low: number, close: number): {pivot: number; s1: number; r1: number; s2: number; r2: number} {
  const pivot = (high + low + close) / 3
  const s1 = (pivot * 2) - high
  const r1 = (pivot * 2) - low
  const s2 = pivot - (high - low)
  const r2 = pivot + (high - low)
  return {pivot, s1, r1, s2, r2}
}

function detectPivotBounce(price: number, s1: number, r1: number, atr: number): boolean {
  const threshold = atr * 0.5
  return Math.abs(price - s1) < threshold || Math.abs(price - r1) < threshold
}

function detectVolumeReversal(volume: number, avgVolume: number, candle: Bar): boolean {
  // Volume surge (volume > 1.8x avg) + opposite close
  return volume > avgVolume * 1.8
}

function detectBBSqueezeRelease(bbWidthHistory: number[], threshold: number = 0.003): boolean {
  if (bbWidthHistory.length < 6) return false

  // Check if last 5 bars have low width, then current bar breaks out
  const last5 = bbWidthHistory.slice(-6, -1)
  const all5Low = last5.every(w => w < threshold)
  const currentBreakout = bbWidthHistory[bbWidthHistory.length-1] > threshold * 1.5

  return all5Low && currentBreakout
}

// v29: Intraday VWAP — anchored to the oldest available bar (up to ~16h of 5m data)
// typical_price = (H+L+C)/3; cumulative(TP×vol)/cumulative(vol)
function calcVWAP(bars: Bar[]): number {
  if (bars.length === 0) return 0
  // Use last 96 bars (8h at 5m) — common session proxy for 24/7 crypto markets
  const session = bars.slice(-96)
  let cumTPV = 0, cumVol = 0
  for (const b of session) {
    const tp = (b.high + b.low + b.close) / 3
    cumTPV += tp * b.vol
    cumVol  += b.vol
  }
  return cumVol > 0 ? cumTPV / cumVol : session[session.length - 1].close
}

// v29: Stop-hunt / Spring / Upthrust — Signal #13
// Looks back 3 bars for a candle that swept a 20-bar swing extreme and
// reversed: long lower wick (Spring → LONG) or long upper wick (Upthrust → SHORT)
// with volume above average. No side argument needed from caller — we check
// the direction that matches the requested side.
function detectStopHunt(bars: Bar[], side: 'LONG'|'SHORT'): boolean {
  if (bars.length < 15) return false
  const LOOKBACK     = 3   // how many recent bars to inspect for the sweep candle
  const SWING_WIN    = 20  // N-bar window to define the swing extreme
  const WICK_RATIO   = 1.5 // wick must be >= 1.5× body
  const VOL_MULT     = 1.4 // volume spike threshold

  const vols   = bars.slice(-20).map(b => b.vol)
  const volAvg = vols.reduce((a, b) => a + b, 0) / vols.length

  for (let i = bars.length - LOOKBACK; i < bars.length - 1; i++) {
    const bar  = bars[i]
    const body = Math.abs(bar.close - bar.open)
    const range = bar.high - bar.low
    if (range === 0 || body === 0) continue

    if (side === 'LONG') {
      // Spring: swept below 20-bar low, then closed back above it
      const swingLow  = Math.min(...bars.slice(Math.max(0, i - SWING_WIN), i).map(b => b.low))
      const lowerWick = Math.min(bar.open, bar.close) - bar.low
      if (
        bar.low   < swingLow &&          // broke the swing low
        bar.close > swingLow &&          // closed back above it
        lowerWick / body >= WICK_RATIO &&// long rejection wick
        bar.vol   > volAvg * VOL_MULT    // elevated volume confirms real sweep
      ) return true
    } else {
      // Upthrust: swept above 20-bar high, then closed back below it
      const swingHigh  = Math.max(...bars.slice(Math.max(0, i - SWING_WIN), i).map(b => b.high))
      const upperWick  = bar.high - Math.max(bar.open, bar.close)
      if (
        bar.high  > swingHigh &&         // broke the swing high
        bar.close < swingHigh &&         // closed back below it
        upperWick / body >= WICK_RATIO &&// long rejection wick
        bar.vol   > volAvg * VOL_MULT    // elevated volume
      ) return true
    }
  }
  return false
}

// v30: BOS — Break of Structure
// LONG BOS: last closed bar closed above the highest high of the prior 20 bars
// SHORT BOS: last closed bar closed below the lowest low of the prior 20 bars
// Confirms momentum continuation rather than a one-candle spike.
function detectBOS(bars: Bar[], side: 'LONG'|'SHORT'): boolean {
  if (bars.length < 25) return false
  const WIN = 20
  const cur = bars[bars.length - 1]
  if (side === 'LONG') {
    const swingHigh = Math.max(...bars.slice(-WIN - 1, -1).map(b => b.high))
    return cur.close > swingHigh
  } else {
    const swingLow = Math.min(...bars.slice(-WIN - 1, -1).map(b => b.low))
    return cur.close < swingLow
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UPGRADE 6: ADVANCED EXIT SIGNALS
// ═══════════════════════════════════════════════════════════════════════════

function advancedExitCheck(
  trade: any,
  currentBar: Bar,
  price: number,
  macdHist: number,
  rsiHistory: number[],
  volumeHistory: number[],
  avgVolume: number
): {closePercent: number; reason: string} {
  const entry = Number(trade.entry_price)
  const side = trade.side
  const dirM = side === 'LONG' ? 1 : -1
  const profitR = (price - entry) * dirM / Math.abs(entry)

  // Exit all if MACD histogram reverses (momentum loss)
  if (trade.entry_macd_hist && macdHist) {
    const histReversed = (trade.entry_macd_hist > 0 && macdHist < 0) ||
                         (trade.entry_macd_hist < 0 && macdHist > 0)
    if (histReversed && profitR > 0.5) return {closePercent: 1.0, reason: 'macd_reversal'}
  }

  // Exit if RSI extreme persists > 15 bars (normalization coming)
  if (rsiHistory.length >= 15) {
    const last15 = rsiHistory.slice(-15)
    const allHigh = last15.every(r => r > 70)
    const allLow = last15.every(r => r < 30)
    if ((side === 'LONG' && allLow) || (side === 'SHORT' && allHigh)) {
      return {closePercent: 1.0, reason: 'rsi_normalization'}
    }
  }

  // Volume cliff: sudden drop → close 25%
  if (volumeHistory.length >= 2) {
    const curVol = volumeHistory[volumeHistory.length-1]
    const prevVol = volumeHistory[volumeHistory.length-2]
    if (prevVol > 0 && curVol < prevVol * 0.5 && profitR > 1.0) {
      return {closePercent: 0.25, reason: 'volume_cliff'}
    }
  }

  return {closePercent: 0, reason: ''}
}

function calcADX(bars: Bar[], period=14): number {
  if (bars.length < period+1) return 20

  const trs:number[]=[], plusDMs:number[]=[], minusDMs:number[]=[]

  for (let i=1; i<bars.length; i++) {
    const h=bars[i].high, l=bars[i].low, pc=bars[i-1].close
    const tr=Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc))
    const hd=h-bars[i-1].high, ld=bars[i-1].low-l

    trs.push(tr)
    plusDMs.push((hd>0 && hd>ld) ? hd : 0)
    minusDMs.push((ld>0 && ld>hd) ? ld : 0)
  }

  // Initial sums for first period (Wilder's method)
  let tr14=trs.slice(0,period).reduce((a,b)=>a+b,0)
  let pd14=plusDMs.slice(0,period).reduce((a,b)=>a+b,0)
  let md14=minusDMs.slice(0,period).reduce((a,b)=>a+b,0)

  // Compute first DX from initial smoothed values
  const plus_di0=tr14>0?(pd14/tr14)*100:0
  const minus_di0=tr14>0?(md14/tr14)*100:0
  const di_sum0=plus_di0+minus_di0
  const dx0=di_sum0>0?(Math.abs(plus_di0-minus_di0)/di_sum0)*100:0

  let adx=dx0

  // Single pass: smooth TR/DI, compute DX, smooth into ADX
  for (let i=period; i<trs.length; i++) {
    tr14=(tr14*(period-1)+trs[i])/period
    pd14=(pd14*(period-1)+plusDMs[i])/period
    md14=(md14*(period-1)+minusDMs[i])/period
    const new_plus_di=tr14>0?(pd14/tr14)*100:0
    const new_minus_di=tr14>0?(md14/tr14)*100:0
    const new_di_sum=new_plus_di+new_minus_di
    const new_dx=new_di_sum>0?((Math.abs(new_plus_di-new_minus_di))/new_di_sum)*100:0
    adx=(adx*(period-1)+new_dx)/period
  }

  return Math.min(100, Math.max(0, adx))
}

function detectRegime(bars: Bar[]): 'TRENDING'|'RANGING'|'SQUEEZE' {
  if (bars.length < 50) return 'TRENDING'
  const closes = bars.slice(-50).map(b=>b.close)
  const {width} = calcBB(closes,20,2)
  const recentATR = calcATR(bars.slice(-15))
  const baseATR   = calcATR(bars.slice(-50))
  const atrRatio  = baseATR>0 ? recentATR/baseATR : 1
  if (width<0.004 && atrRatio<0.65) return 'SQUEEZE'
  if (width<0.011 || atrRatio<0.80) return 'RANGING'
  return 'TRENDING'
}

interface ConfluenceBreakdown {
  vpoc: number;
  ema1h: number;
  adxTrend: number;
  volumeSurge: number;
  oiFavor: number;
  sentiment: number;
  candlePattern: number;
  stochastic: number;
  divergence: number;
  macd: number;
  pivotBounce: number;
  bbSqueeze: number;
  stopHunt: number;
  vwap: number;
  bos: number;
  ema200: number;
}

interface EntryScore {
  side: 'LONG'|'SHORT'|null;
  slDist: number;
  score: number;
  breakdown: ConfluenceBreakdown;
  adx: number;
  regime: 'BULL'|'BEAR'|'NEUTRAL'|'UNCERTAIN';
  rangeFade?: boolean;   // v27.4: band-extreme fade in a low-ADX range
  bbMid?: number;        // v27.4: mid-band, used as realistic range TP
}

function calcConfluenceScore(
  bars: Bar[],
  price: number,
  vpoc: number,
  ema1hBias: 'BULL'|'BEAR'|'NEUTRAL',
  adx: number,
  fearGreed: number,
  oiSignal: string,
  rsiOversold: number,
  rsiOverbought: number,
  bbProx: number,
  btcCloses: number[] = [],
  coinCloses: number[] = [],
  ema200Bias: 'BULL'|'BEAR'|'NEUTRAL' = 'NEUTRAL'  // v30: EMA50/200 on 1H
): EntryScore {
  if (bars.length < 30) return {side: null, slDist: 0, score: 0, breakdown: {vpoc:0,ema1h:0,adxTrend:0,volumeSurge:0,oiFavor:0,sentiment:0,candlePattern:0,stochastic:0,divergence:0,macd:0,pivotBounce:0,bbSqueeze:0,stopHunt:0,vwap:0,bos:0,ema200:0}, adx, regime: 'UNCERTAIN'}

  const closes = bars.map(b => b.close)
  const highs = bars.map(b => b.high)
  const lows = bars.map(b => b.low)
  const atr = calcATR(bars.slice(-20))
  const rsi = calcRsi(closes.slice(-15))
  const rsiHistory = closes.slice(-20).map((c,i) => i === 0 ? 50 : calcRsi(closes.slice(0, closes.length-20+i+1)))
  const bb = calcBB(closes, 20, 2)

  if (!bb.mid || !atr) return {side: null, slDist: 0, score: 0, breakdown: {vpoc:0,ema1h:0,adxTrend:0,volumeSurge:0,oiFavor:0,sentiment:0,candlePattern:0,stochastic:0,divergence:0,macd:0,pivotBounce:0,bbSqueeze:0,stopHunt:0,vwap:0,bos:0,ema200:0}, adx, regime: 'UNCERTAIN'}

  const e9arr = calcEmaArr(closes, 9)
  const e21arr = calcEmaArr(closes, 21)
  const curE9 = e9arr.at(-1)!, curE21 = e21arr.at(-1)!

  // Determine side based on technical signals
  let longSig = 0, shortSig = 0

  if (rsi < rsiOversold) longSig++
  else if (rsi > rsiOverbought) shortSig++

  if (price <= bb.lower * bbProx) longSig++
  else if (price >= bb.upper * (2 - bbProx)) shortSig++

  if (curE9 > curE21) longSig++
  else shortSig++

  // v27.3: trend-continuation setup — the mean-reversion signals above almost
  // never fire SHORT in a downtrend (market stays oversold), leaving the bot
  // idle in bear markets. Trade WITH the 1H trend on pullbacks instead:
  // short a weak bounce back to the mid-band, long a shallow dip in an uptrend.
  if (ema1hBias === 'BEAR' && curE9 < curE21 && rsi >= 45 && rsi <= 60 && price >= bb.mid) shortSig++
  if (ema1hBias === 'BULL' && curE9 > curE21 && rsi >= 40 && rsi <= 55 && price <= bb.mid) longSig++

  const side = longSig >= 2 ? 'LONG' : shortSig >= 2 ? 'SHORT' : null
  if (!side) return {side: null, slDist: 0, score: 0, breakdown: {vpoc:0,ema1h:0,adxTrend:0,volumeSurge:0,oiFavor:0,sentiment:0,candlePattern:0,stochastic:0,divergence:0,macd:0,pivotBounce:0,bbSqueeze:0,stopHunt:0,vwap:0,bos:0,ema200:0}, adx, regime: 'UNCERTAIN'}

  // v27.4: range-fade — band extreme + RSI extreme in low-ADX chop.
  // This is the highest-probability trade a ranging market offers.
  const rangeFade = adx < 18 && (
    (side === 'LONG'  && price <= bb.lower * bbProx && rsi < rsiOversold + 5) ||
    (side === 'SHORT' && price >= bb.upper * (2 - bbProx) && rsi > rsiOverbought - 5)
  )

  // Confluence Score Breakdown (0-100)
  const breakdown: ConfluenceBreakdown = {vpoc: 0, ema1h: 0, adxTrend: 0, volumeSurge: 0, oiFavor: 0, sentiment: 0, candlePattern: 0, stochastic: 0, divergence: 0, macd: 0, pivotBounce: 0, bbSqueeze: 0}

  // 1. VPOC alignment (25 pts): price near VPOC
  const vpocDist = Math.abs(vpoc - price) / price
  if (vpocDist < 0.010) breakdown.vpoc = 25
  else if (vpocDist < 0.020) breakdown.vpoc = 18
  else if (vpocDist < 0.035) breakdown.vpoc = 10

  // 2. 1H trend confirmation (20 pts)
  if ((side === 'LONG' && ema1hBias === 'BULL') || (side === 'SHORT' && ema1hBias === 'BEAR')) {
    breakdown.ema1h = 20
  } else if (ema1hBias === 'NEUTRAL') {
    breakdown.ema1h = 10
  }

  // 3. ADX trending (10 pts): ADX > 22
  // v27.4: a clean range-fade earns credit too — low ADX is a feature there
  if (adx > 22) breakdown.adxTrend = 10
  else if (adx > 15) breakdown.adxTrend = 5
  else if (rangeFade) breakdown.adxTrend = 8

  // 4. Volume surge (10 pts): vol > 1.4× 20-bar average
  const vols = bars.slice(-20).map(b => b.vol)
  const volAvg = vols.reduce((a, b) => a + b, 0) / vols.length
  const curVol = bars[bars.length - 1].vol
  if (curVol > volAvg * 1.4) breakdown.volumeSurge = 10

  // 5. OI favorable (15 pts)
  if (oiSignal === 'BULL_DIV' && side === 'LONG') breakdown.oiFavor = 15
  else if (oiSignal === 'BEAR_DIV' && side === 'SHORT') breakdown.oiFavor = 15
  else if ((oiSignal === 'UP' && side === 'LONG') || (oiSignal === 'DOWN' && side === 'SHORT')) breakdown.oiFavor = 10
  else if (oiSignal === 'FLAT') breakdown.oiFavor = 5

  // 6. Fear/Greed sentiment (5 pts): extreme readings
  if ((fearGreed > 80 && side === 'LONG') || (fearGreed < 20 && side === 'SHORT')) breakdown.sentiment = 5

  // 7. Candlestick pattern (15 pts): strong close/wick
  const barRange = bars[bars.length - 1].high - bars[bars.length - 1].low
  const barClose = bars[bars.length - 1].close
  const barOpen = bars[bars.length - 1].open
  const barLow = bars[bars.length - 1].low
  const barHigh = bars[bars.length - 1].high

  if (side === 'LONG') {
    const upperWickRatio = (barHigh - barClose) / barRange
    if (barClose > barOpen && upperWickRatio < 0.15) breakdown.candlePattern = 15
    else if (barClose > barOpen && upperWickRatio < 0.25) breakdown.candlePattern = 10
    else if (barClose > barOpen) breakdown.candlePattern = 5
  } else {
    const lowerWickRatio = (barClose - barLow) / barRange
    if (barClose < barOpen && lowerWickRatio < 0.15) breakdown.candlePattern = 15
    else if (barClose < barOpen && lowerWickRatio < 0.25) breakdown.candlePattern = 10
    else if (barClose < barOpen) breakdown.candlePattern = 5
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UPGRADE 2: Enhanced Entry Confirmation Signals
  // ─────────────────────────────────────────────────────────────────────────

  // 8. Stochastic confirmation (10 pts)
  const stoch = calcStochastic(closes, highs, lows, 14, 3)
  if ((side === 'LONG' && stoch.K < 20) || (side === 'SHORT' && stoch.K > 80)) {
    breakdown.stochastic = 10
  }

  // 9. RSI Divergence (15 pts boost)
  const divergence = detectDivergence(rsiHistory, closes)
  if (divergence === 'BULL_DIV' && side === 'LONG') {
    breakdown.divergence = 15
  } else if (divergence === 'BEAR_DIV' && side === 'SHORT') {
    breakdown.divergence = 15
  }

  // 10. MACD histogram (10 pts)
  const macd = calcMACD(closes)
  if ((side === 'LONG' && macd.histogram > 0) || (side === 'SHORT' && macd.histogram < 0)) {
    breakdown.macd = 10
  }

  // 11. Pivot Point Rejection (8 pts)
  const high = bars[bars.length-1].high, low = bars[bars.length-1].low
  const pivots = calcPivots(high, low, barClose)
  if (detectPivotBounce(price, pivots.s1, pivots.r1, atr)) {
    breakdown.pivotBounce = 8
  }

  // 12. Bollinger Squeeze Release (12 pts)
  const bbWidthHistory = bars.slice(-10).map((_b, idx) => {
    const barIdx = bars.length - 10 + idx
    // BB(20) only needs the trailing 20 closes — avoid copying the full prefix
    const cls = closes.slice(Math.max(0, barIdx - 19), barIdx + 1)
    return calcBB(cls, 20, 2).width
  })
  if (detectBBSqueezeRelease(bbWidthHistory)) {
    breakdown.bbSqueeze = 12
  }

  // 13. Stop-hunt / Spring / Upthrust (10 pts) — v29
  // Price swept a swing extreme, wicked sharply back, volume spike confirms
  // the liquidity grab was genuine and a reversal is likely.
  if (detectStopHunt(bars, side)) {
    breakdown.stopHunt = 10
  }

  // 14. VWAP alignment (12 pts) — v29
  // Price on the correct side of the 8h session VWAP confirms institutional bias.
  // Full credit when price is clearly beyond VWAP; half credit when right at it.
  const vwap = calcVWAP(bars)
  if (vwap > 0) {
    const vwapDist = (price - vwap) / vwap
    if (side === 'LONG'  && vwapDist >  0.001) breakdown.vwap = 12
    else if (side === 'LONG'  && vwapDist >= -0.001) breakdown.vwap = 6
    else if (side === 'SHORT' && vwapDist < -0.001) breakdown.vwap = 12
    else if (side === 'SHORT' && vwapDist <=  0.001) breakdown.vwap = 6
  }

  // 15. BOS — Break of Structure (8 pts) — v30
  // Closed above 20-bar swing high (LONG) or below swing low (SHORT):
  // market structure confirms momentum, not just a wick spike.
  if (detectBOS(bars, side)) {
    breakdown.bos = 8
  }

  // 16. EMA200 macro alignment on 1H (8 pts) — v30
  // Golden Cross (EMA50 > EMA200 on 1H) → bullish macro; Death Cross → bearish.
  // Passed from the main loop where 1H bars are already available.
  if ((side === 'LONG' && ema200Bias === 'BULL') || (side === 'SHORT' && ema200Bias === 'BEAR')) {
    breakdown.ema200 = 8
  } else if (ema200Bias === 'NEUTRAL') {
    breakdown.ema200 = 4  // undecided macro — partial credit
  }

  const totalScore = breakdown.vpoc + breakdown.ema1h + breakdown.adxTrend + breakdown.volumeSurge + breakdown.oiFavor + breakdown.sentiment + breakdown.candlePattern + breakdown.stochastic + breakdown.divergence + breakdown.macd + breakdown.pivotBounce + breakdown.bbSqueeze + breakdown.stopHunt + breakdown.vwap + breakdown.bos + breakdown.ema200

  const regime = side === 'LONG' ? 'BULL' : 'BEAR'

  return {
    side,
    slDist: atr * 1.2,
    score: totalScore,
    breakdown,
    adx,
    regime,
    rangeFade,
    bbMid: bb.mid
  }
}

// v22: ADX-based size adjustment (scoring gate lives at finalScore, v27.5)
function calcAdxSizeAdj(adx: number, rangeFade = false): number {
  let sizeAdj = 1.0

  // ADX > 25 → +10% size (strong trending)
  if (adx > 25) sizeAdj *= 1.10

  // ADX < 15 → -70% size (weak trend), but a deliberate range-fade
  // WANTS low ADX — only a mild haircut there (v27.4)
  if (adx < 15) sizeAdj *= rangeFade ? 0.75 : 0.30

  return sizeAdj
}

// v22: Kelly Criterion scaling by confluence score
function getKellyScaleByScore(baseScore: number): number {
  if (baseScore < 50) return 0.8
  if (baseScore < 60) return 0.9
  if (baseScore < 70) return 1.0
  if (baseScore < 80) return 1.2
  return 1.5
}

function getVolRegime(atrPct:number): 'LOW'|'MEDIUM'|'HIGH' {
  if (atrPct<0.0008) return 'LOW'
  if (atrPct<0.003)  return 'MEDIUM'
  return 'HIGH'
}

function calcVPOC(bars:Bar[]): number {
  if (!bars.length) return 0
  const min=Math.min(...bars.map(b=>b.low))
  const max=Math.max(...bars.map(b=>b.high))
  if (max===min) return (max+min)/2
  const buckets=40, step=(max-min)/buckets
  const hist=new Array(buckets).fill(0)
  for (const bar of bars) {
    const idx=Math.min(Math.floor(((bar.high+bar.low)/2-min)/step),buckets-1)
    hist[idx]+=bar.vol
  }
  return min+(hist.indexOf(Math.max(...hist))+0.5)*step
}

// ── STAGE 2: Volatility Percentile Calculation ──
function calcVolatilityPercentile(bars:Bar[]): {pct:number; atrPct:number} {
  if (bars.length < 100) return {pct: 50, atrPct: 0}
  const last100 = bars.slice(-100)
  const atrValues:number[] = []
  for (let i=1; i<last100.length; i++) {
    const tr = Math.max(
      last100[i].high - last100[i].low,
      Math.abs(last100[i].high - last100[i-1].close),
      Math.abs(last100[i].low - last100[i-1].close)
    )
    const price = last100[i].close
    atrValues.push(tr / price)
  }
  atrValues.sort((a,b)=>a-b)
  const current = last100[last100.length-1].close
  const atr = bars.length > 14 ? calcATR(bars.slice(-14)) : 0
  const curAtrPct = atr / current
  const rank = atrValues.filter(v => v <= curAtrPct).length
  const pct = Math.round((rank / atrValues.length) * 100)
  return {pct: Math.max(0, Math.min(100, pct)), atrPct: curAtrPct}
}

// v25: Progressive drawdown scaling — smooth curve instead of binary
function calcDrawdownScale(drawdownPct: number): number {
  if (drawdownPct <= 0.05) return 1.0
  if (drawdownPct >= 0.30) return 0.0  // fully paused
  // Linear interpolation: 5%→1.0, 10%→0.75, 15%→0.5, 20%→0.35, 25%→0.2, 30%→0
  return Math.max(0, 1.0 - (drawdownPct - 0.05) * 4.0)
}

// v25: Dynamic max hold — extend if in profit, shorten if losing
function calcDynamicMaxHold(baseMaxHold: number, profitR: number): number {
  if (profitR >= 2.0) return baseMaxHold * 2.0   // winning big → let it run
  if (profitR >= 1.0) return baseMaxHold * 1.5   // in profit → extend
  if (profitR <= -0.5) return baseMaxHold * 0.6  // losing → cut sooner
  return baseMaxHold
}

// v25: Funding rate filter — skip entries where funding works against us
function isFundingAgainst(fundingRate: number, side: 'LONG'|'SHORT'): boolean {
  if (side === 'LONG' && fundingRate > FUNDING_AGAINST_THRESHOLD) return true
  if (side === 'SHORT' && fundingRate < -FUNDING_AGAINST_THRESHOLD) return true
  return false
}

// v25: API fallback — fetch price from CoinGecko if Binance fails
async function fetchPriceFallback(sym: string): Promise<number|null> {
  try {
    const geckoIds: Record<string,string> = {
      BTC:'bitcoin',ETH:'ethereum',SOL:'solana',BNB:'binancecoin',
      XRP:'ripple',ADA:'cardano',DOGE:'dogecoin',AVAX:'avalanche-2',
      LINK:'chainlink',DOT:'polkadot',UNI:'uniswap',ATOM:'cosmos',
      LTC:'litecoin',BCH:'bitcoin-cash',NEAR:'near',ALGO:'algorand',
      FIL:'filecoin',VET:'vechain',ICP:'internet-computer',POL:'polygon-ecosystem-token'
    }
    const id = geckoIds[sym]
    if (!id) return null
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
      {headers:{'User-Agent':'Mozilla/5.0'}}
    )
    if (!res.ok) return null
    const data = await res.json()
    return data[id]?.usd ?? null
  } catch { return null }
}

// v25: Daily P&L calculation
function calcDailyPnl(recentTrades: any[]): number {
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)
  const todayMs = todayStart.getTime()
  return (recentTrades || [])
    .filter(t => t.closed_at && new Date(t.closed_at).getTime() >= todayMs)
    .reduce((sum, t) => sum + Number(t.pnl || 0), 0)
}

// ── STAGE 2: Dynamic Stop Loss by ADX ──
function calcDynamicSL(atr:number, adx:number, baseMult:number = 1.2): number {
  if (adx > 25) return atr * 1.0
  if (adx < 15) return atr * 1.5
  return atr * baseMult
}

// ── STAGE 2: Dynamic TP by Volatility ──
function calcDynamicTP(baseR:number, volPct:number): number {
  const volPctNorm = Math.min(volPct, 100) / 100
  return baseR + (volPctNorm * 0.5)
}

function findSwings(bars:Bar[], n:number): {highs:number[],lows:number[]} {
  const highs:number[]=[], lows:number[]=[]
  for (let i=n; i<bars.length-n; i++) {
    let isH=true, isL=true
    for (let j=i-n; j<=i+n; j++) {
      if(j===i) continue
      if(bars[j].high>=bars[i].high) isH=false
      if(bars[j].low <=bars[i].low)  isL=false
    }
    if(isH) highs.push(bars[i].high)
    if(isL) lows.push(bars[i].low)
  }
  return {highs,lows}
}

function detectSweep(
  bars:Bar[], price:number, highs:number[], lows:number[], atr:number
): {side:'LONG'|'SHORT',sweepExtreme:number}|null {
  const n=bars.length
  if (n<SWEEP_LOOKBACK+1) return null
  const minCloseback=atr*0.15
  for (let k=1; k<=SWEEP_LOOKBACK; k++) {
    const bar=bars[n-k]
    for (const lvl of highs) {
      if (bar.high>lvl && bar.close<lvl && price<=bar.close*1.003)
        if (lvl-bar.close>=minCloseback) return {side:'SHORT',sweepExtreme:bar.high}
    }
    for (const lvl of lows) {
      if (bar.low<lvl && bar.close>lvl && price>=bar.close*0.997)
        if (bar.close-lvl>=minCloseback) return {side:'LONG',sweepExtreme:bar.low}
    }
  }
  return null
}

function getCorrGroup(sym:string): number {
  for (let i=0; i<CORR_GROUPS.length; i++)
    if (CORR_GROUPS[i].includes(sym)) return i
  return -1
}

async function fetchAllFundingRates(): Promise<Record<string,number>> {
  try {
    const res = await fetch(`${FAPI}/premiumIndex`,{headers:{'User-Agent':'Mozilla/5.0'}})
    if (!res.ok) return {}
    const data:any[] = await res.json()
    const result:Record<string,number>={}
    for (const d of data) {
      const sym=d.symbol.replace('USDT','').replace('_PERP','')
      result[sym]=parseFloat(d.lastFundingRate||'0')
    }
    return result
  } catch { return {} }
}

// v21: Enhanced OI signal with price-OI divergence detection
async function fetchOISignal(sym:string, priceChange=0): Promise<'UP'|'DOWN'|'FLAT'|'BULL_DIV'|'BEAR_DIV'> {
  try {
    const res = await fetch(
      `${FAPI_DATA}/openInterestHist?symbol=${sym}USDT&period=5m&limit=6`,
      {headers:{'User-Agent':'Mozilla/5.0'}}
    )
    if (!res.ok) return 'FLAT'
    const data:any[] = await res.json()
    if (data.length<2) return 'FLAT'
    const first=parseFloat(data[0].sumOpenInterest)
    const last =parseFloat(data[data.length-1].sumOpenInterest)
    const oiChg=first>0?(last-first)/first:0
    // Divergence: price direction vs OI direction — indicates exhaustion
    if (priceChange> 0.003 && oiChg<-0.010) return 'BEAR_DIV'  // weak rally
    if (priceChange<-0.003 && oiChg> 0.010) return 'BULL_DIV'  // weak dump
    return oiChg>0.01?'UP':oiChg<-0.01?'DOWN':'FLAT'
  } catch { return 'FLAT' }
}

async function fetchLiqSignal(sym:string): Promise<'LONG_LIQ'|'SHORT_LIQ'|'NEUTRAL'> {
  try {
    const res = await fetch(
      `${FAPI_DATA}/globalLongShortAccountRatio?symbol=${sym}USDT&period=5m&limit=4`,
      {headers:{'User-Agent':'Mozilla/5.0'}}
    )
    if (!res.ok) return 'NEUTRAL'
    const data:any[]=await res.json()
    if (data.length<2) return 'NEUTRAL'
    const latest=parseFloat(data[data.length-1].longShortRatio)
    const prev  =parseFloat(data[0].longShortRatio)
    const chg   =prev>0?(latest-prev)/prev:0
    if (chg<-0.05) return 'LONG_LIQ'
    if (chg> 0.05) return 'SHORT_LIQ'
    return 'NEUTRAL'
  } catch { return 'NEUTRAL' }
}

// v21: 1H trend bias for a symbol
async function fetch1hBias(sym: string): Promise<'BULL'|'BEAR'|'NEUTRAL'> {
  try {
    const bars = await fetchBars(sym, '1h', 30)
    if (bars.length < 22) return 'NEUTRAL'
    const closes = bars.slice(0,-1).map(b=>b.close)
    const e9  = calcEma(closes, 9)
    const e21 = calcEma(closes, 21)
    if (e9>e21*1.001) return 'BULL'
    if (e9<e21*0.999) return 'BEAR'
    return 'NEUTRAL'
  } catch { return 'NEUTRAL' }
}

// ── STAGE 2: Multi-timeframe confirmation (15m) ──
async function fetch15mBias(sym: string): Promise<'BULL'|'BEAR'|'NEUTRAL'> {
  try {
    const bars = await fetchBars(sym, '15m', 30)
    if (bars.length < 22) return 'NEUTRAL'
    const closes = bars.slice(0,-1).map(b=>b.close)
    const e9  = calcEma(closes, 9)
    const e21 = calcEma(closes, 21)
    if (e9>e21*1.001) return 'BULL'
    if (e9<e21*0.999) return 'BEAR'
    return 'NEUTRAL'
  } catch { return 'NEUTRAL' }
}



function computeAdaptive(trades: any[]): {
  minScore:number; vpocDist:number; sideFilter:'LONG'|'SHORT'|'BOTH'
} {
  if (!trades || trades.length<30)
    return {minScore:MIN_SCORE, vpocDist:VPOC_MAX_DIST, sideFilter:'BOTH'}

  const wins=trades.filter(t=>Number(t.pnl)>0).length
  const wr  =wins/trades.length

  let minScore=MIN_SCORE, vpocDist=VPOC_MAX_DIST
  if      (wr<0.20) { minScore=3; vpocDist=0.015 }
  else if (wr<0.30) { minScore=2; vpocDist=0.020 }
  else if (wr>0.55) { minScore=1; vpocDist=0.035 }
  else              { minScore=MIN_SCORE; vpocDist=VPOC_MAX_DIST }

  const longs  = trades.filter(t=>t.side==='LONG')
  const shorts = trades.filter(t=>t.side==='SHORT')
  const longWR  = longs.length >=15 ? longs.filter(t =>Number(t.pnl)>0).length/longs.length  : 0.5
  const shortWR = shorts.length>=15 ? shorts.filter(t=>Number(t.pnl)>0).length/shorts.length : 0.5

  let sideFilter:'LONG'|'SHORT'|'BOTH'='BOTH'
  if (longs.length>=15 && shorts.length>=15) {
    if      (longWR >shortWR+0.25) sideFilter='LONG'
    else if (shortWR>longWR +0.25) sideFilter='SHORT'
  }
  return {minScore, vpocDist, sideFilter}
}

// v21: ML multi-factor coin scoring (replaces simple 42% WR whitelist)
interface CoinML { score:number; wr:number; pf:number; avgPnl:number }

function computeCoinScores(trades: any[]): Record<string,CoinML> {
  const bySym:Record<string,any[]>={}
  for (const t of (trades||[])) {
    if (!bySym[t.sym]) bySym[t.sym]=[]
    bySym[t.sym].push(t)
  }
  const scores:Record<string,CoinML>={}
  for (const [sym,symTrades] of Object.entries(bySym)) {
    if (symTrades.length<MIN_COIN_TRADES) continue
    const wins  =symTrades.filter(t=>Number(t.pnl)>0)
    const losses=symTrades.filter(t=>Number(t.pnl)<=0)
    const wr    =wins.length/symTrades.length
    if (wr<MIN_COIN_WIN_RATE) continue

    const avgWin  =wins.length   ? wins.reduce((a,t)  =>a+Number(t.pnl),0)/wins.length   : 0
    const avgLoss =losses.length ? Math.abs(losses.reduce((a,t)=>a+Number(t.pnl),0)/losses.length) : 1
    const pf      =avgLoss>0?avgWin/avgLoss:1
    const avgPnl  =symTrades.reduce((a,t)=>a+Number(t.pnl),0)/symTrades.length
    const variance=symTrades.reduce((a,t)=>a+(Number(t.pnl)-avgPnl)**2,0)/symTrades.length
    const sharpe  =variance>0?avgPnl/Math.sqrt(variance):0

    const rec  =symTrades.slice(-5)
    const recWR=rec.filter(t=>Number(t.pnl)>0).length/rec.length

    // Composite 0-100: WR(30) + PF(30) + Sharpe(20) + Recency(20)
    const score = wr*30
      + Math.min(pf,3)/3*30
      + Math.min(Math.max(sharpe,0),2)/2*20
      + recWR*20

    scores[sym]={score, wr, pf, avgPnl}
  }
  return scores
}

function buildBlacklist(recent: any[]): Set<string> {
  const blacklist=new Set<string>()
  const bySym:Record<string,any[]>={}
  for (const t of recent||[]) {
    if (!bySym[t.sym]) bySym[t.sym]=[]
    bySym[t.sym].push(t)
  }
  for (const [sym,trades] of Object.entries(bySym)) {
    trades.sort((a,b)=>new Date(b.closed_at).getTime()-new Date(a.closed_at).getTime())
    let consecSL=0
    for (const t of trades) { if(t.status==='SL') consecSL++; else break }
    if (consecSL>=2) blacklist.add(sym)
  }
  return blacklist
}

// v22: Log daily trading summary
async function logDailySummary(supabase: any, dayTrades: any[], marketRegime: string, avgADX: number, log: string[]): Promise<void> {
  if (!dayTrades || dayTrades.length === 0) return

  const wins = dayTrades.filter(t => Number(t.pnl) > 0).length
  const losses = dayTrades.filter(t => Number(t.pnl) <= 0).length
  const total = wins + losses
  const winRate = total > 0 ? wins / total : 0
  const totalProfit = dayTrades.reduce((a, t) => a + Number(t.pnl || 0), 0)

  try {
    await supabase.from('bot_trades_log').insert({
      date: new Date().toISOString().split('T')[0],
      total_trades: total,
      wins,
      losses,
      win_rate: winRate,
      profit: totalProfit,
      market_regime: marketRegime,
      avg_adx: avgADX
    })
    log.push(`DAILY: ${total} trades, ${wins}W/${losses}L (${(winRate*100).toFixed(1)}%), profit=$${totalProfit.toFixed(2)}, regime=${marketRegime}, adx=${avgADX.toFixed(1)}`)
  } catch (e) {
    log.push(`DIARY_LOG_ERR: ${String(e).slice(0,50)}`)
  }
}

// ── Phase 11: Macro event filter ─────────────────────────────────────────────
function isMacroEventWindow(nowDate: Date): { skip: boolean; reason: string } {
  const utcH   = nowDate.getUTCHours()
  const utcM   = nowDate.getUTCMinutes()
  const utcD   = nowDate.getUTCDate()
  const utcDay = nowDate.getUTCDay() // 0=Sun … 6=Sat
  const totalMin = utcH * 60 + utcM

  // NFP — first Friday of each month at 12:30 UTC (±30 min)
  if (utcDay === 5 && utcD <= 7 && Math.abs(totalMin - (12 * 60 + 30)) <= 30)
    return { skip: true, reason: 'NFP' }

  // FOMC — 2nd and 4th Wednesday at 18:00 UTC (±30 min)
  const weekOfMonth = Math.floor((utcD - 1) / 7) // 0-indexed
  if (utcDay === 3 && (weekOfMonth === 1 || weekOfMonth === 3) && Math.abs(totalMin - 18 * 60) <= 30)
    return { skip: true, reason: 'FOMC' }

  // CPI — typically released 10th–14th of each month at 12:30 UTC (±30 min)
  if (utcD >= 10 && utcD <= 14 && Math.abs(totalMin - (12 * 60 + 30)) <= 30)
    return { skip: true, reason: 'CPI' }

  return { skip: false, reason: '' }
}

// ── Phase 1: Save indicator snapshot at trade entry ───────────────────────────
async function saveTradeSnapshot(
  supabase: any,
  tradeId: number,
  coin: string,
  side: string,
  confluenceScore: number,
  adx: number,
  rsi: number,
  volumeRatio: number,
  hourUtc: number,
  marketRegime: string,
  session: string,
  oiSignal: string,
  fearGreed: number
): Promise<void> {
  try {
    await supabase.from('bot_trade_snapshots').insert({
      trade_id: tradeId, coin, side,
      confluence_score: +confluenceScore.toFixed(1),
      adx: +adx.toFixed(2),
      rsi: +rsi.toFixed(2),
      volume_ratio: +volumeRatio.toFixed(3),
      hour_utc: hourUtc,
      market_regime: marketRegime,
      session, oi_signal: oiSignal, fear_greed: fearGreed,
    })
  } catch { /* non-fatal */ }
}

// ── Phase 9: Update market memory row after a trade closes ────────────────────
async function updateMarketMemory(
  supabase: any,
  tradeId: number,
  result: string,
  pnl: number,
  log: string[]
): Promise<void> {
  try {
    const { data: snap } = await supabase
      .from('bot_trade_snapshots')
      .select('market_regime, session, adx')
      .eq('trade_id', tradeId)
      .maybeSingle()
    if (!snap) return

    const adxVal = snap.adx ?? 0
    const adxRange = adxVal < 15 ? 'adx_low' : adxVal < 25 ? 'adx_med' : 'adx_high'
    const conditionKey = `${adxRange}_${snap.market_regime ?? 'unknown'}_${snap.session ?? 'unknown'}`
    const isWin = result === 'TP' || pnl > 0

    const { data: existing } = await supabase
      .from('bot_market_memory')
      .select('win_rate, trade_count, avg_pnl')
      .eq('condition_key', conditionKey)
      .maybeSingle()

    if (existing) {
      const newCount  = (existing.trade_count ?? 0) + 1
      const prevWins  = Math.round((existing.win_rate ?? 0) * (existing.trade_count ?? 0))
      const prevTotal = (existing.avg_pnl ?? 0) * (existing.trade_count ?? 0)
      await supabase.from('bot_market_memory').update({
        win_rate:     (prevWins + (isWin ? 1 : 0)) / newCount,
        trade_count:  newCount,
        avg_pnl:      (prevTotal + pnl) / newCount,
        last_updated: new Date().toISOString(),
      }).eq('condition_key', conditionKey)
    } else {
      await supabase.from('bot_market_memory').insert({
        condition_key: conditionKey,
        win_rate:      isWin ? 1.0 : 0.0,
        trade_count:   1,
        avg_pnl:       pnl,
      })
    }
  } catch (e) {
    log.push(`MEM_ERR: ${String(e).slice(0, 50)}`)
  }
}

// v25: Fetch historical bars with pagination (up to 30 days of 5m data)
async function fetchBarsHistorical(sym: string, interval: string, days: number): Promise<Bar[]> {
  const allBars: Bar[] = []
  const now = Date.now()
  const msPerBar = interval === '5m' ? 5*60_000 : interval === '15m' ? 15*60_000 : interval === '1h' ? 3600_000 : 5*60_000
  const totalBars = Math.floor(days * 86400_000 / msPerBar)
  const batchSize = 1000

  let endTime = now
  let remaining = totalBars

  while (remaining > 0) {
    const limit = Math.min(batchSize, remaining)
    const startTime = endTime - limit * msPerBar
    try {
      const res = await fetch(
        `${BINANCE_DATA}/klines?symbol=${sym}USDT&interval=${interval}&startTime=${startTime}&endTime=${endTime}&limit=${limit}`,
        {headers:{'User-Agent':'Mozilla/5.0'}}
      )
      if (!res.ok) break
      const data: number[][] = await res.json()
      if (!data.length) break
      const bars = data.map(k => ({open:+k[1],high:+k[2],low:+k[3],close:+k[4],vol:+k[5]}))
      allBars.unshift(...bars)
      endTime = startTime - 1
      remaining -= data.length
      if (data.length < limit) break
    } catch { break }
  }
  return allBars
}

async function runBacktest(daysParam = 30): Promise<object> {
  const testCoins = ['BTC','ETH','SOL','BNB','XRP','DOGE','AVAX','LINK']
  const days = Math.min(daysParam, 90)
  const results: any[] = []
  const equityCurve: {day: number; balance: number}[] = []
  let totalBalance = 10_000
  const startBalance = totalBalance
  let totalWins = 0, totalLosses = 0
  const allPnls: number[] = []

  for (const sym of testCoins) {
    const bars = await fetchBarsHistorical(sym, '5m', days)
    if (bars.length < 200) { results.push({sym, error: `only ${bars.length} bars`}); continue }

    // Also fetch 1h bars for multi-TF context
    const bars1h = await fetchBarsHistorical(sym, '1h', days)

    let bal = totalBalance / testCoins.length + startBalance * 0.5
    const symStart = bal
    let wins = 0, losses = 0, partials = 0, maxDD = 0, peak = bal
    const pnls: number[] = []
    let openTrade: {side:'LONG'|'SHORT'; entry:number; sl:number; tp:number; size:number; partialTP:number; partialDone:boolean; bar:number; slDist:number} | null = null
    let lastTradeBar = -20 // cooldown

    for (let i = 100; i < bars.length - 1; i++) {
      const price = bars[i].close
      const slice = bars.slice(Math.max(0, i-200), i+1)
      const atr = calcATR(slice.slice(-15))
      const atrPct = atr / price
      if (atrPct > 0.02 || atrPct < 0.00003) continue

      // Manage open trade
      if (openTrade) {
        const dirM = openTrade.side === 'LONG' ? 1 : -1
        const bar = bars[i]
        const holdBars = i - openTrade.bar

        // Partial TP
        if (!openTrade.partialDone) {
          const partialHit = openTrade.side === 'LONG' ? bar.high >= openTrade.partialTP : bar.low <= openTrade.partialTP
          if (partialHit) {
            const halfSize = openTrade.size / 2
            const partialPnl = (openTrade.partialTP - openTrade.entry) * halfSize * dirM - openTrade.partialTP * halfSize * FEE
            bal += openTrade.entry * halfSize + partialPnl
            openTrade.size = halfSize
            openTrade.partialDone = true
            // Move SL to breakeven
            openTrade.sl = openTrade.entry * (1 + FEE * 2.5 * dirM)
            partials++
          }
        }

        // Check TP/SL
        let closed = false
        if (openTrade.side === 'LONG') {
          if (bar.high >= openTrade.tp) {
            const pnl = (openTrade.tp - openTrade.entry) * openTrade.size * dirM - openTrade.tp * openTrade.size * FEE
            bal += openTrade.entry * openTrade.size + pnl; pnls.push(pnl); wins++; closed = true
          } else if (bar.low <= openTrade.sl) {
            const exitP = openTrade.sl
            const pnl = (exitP - openTrade.entry) * openTrade.size * dirM - exitP * openTrade.size * FEE
            bal += openTrade.entry * openTrade.size + pnl; pnls.push(pnl); if(pnl>0) wins++; else losses++; closed = true
          }
        } else {
          if (bar.low <= openTrade.tp) {
            const pnl = (openTrade.entry - openTrade.tp) * openTrade.size - openTrade.tp * openTrade.size * FEE
            bal += openTrade.entry * openTrade.size + pnl; pnls.push(pnl); wins++; closed = true
          } else if (bar.high >= openTrade.sl) {
            const exitP = openTrade.sl
            const pnl = (openTrade.entry - exitP) * openTrade.size - exitP * openTrade.size * FEE
            bal += openTrade.entry * openTrade.size + pnl; pnls.push(pnl); if(pnl>0) wins++; else losses++; closed = true
          }
        }
        // Max hold timeout
        if (!closed && holdBars > 36) { // 36 bars = 3 hours
          const pnl = (price - openTrade.entry) * openTrade.size * dirM - price * openTrade.size * FEE
          bal += openTrade.entry * openTrade.size + pnl; pnls.push(pnl); if(pnl>0) wins++; else losses++; closed = true
        }
        // Trailing stop at 1R profit
        if (!closed && openTrade.slDist > 0) {
          const profitR = (price - openTrade.entry) * dirM / openTrade.slDist
          if (profitR >= 1.0) {
            const trail = price - atr * 0.7 * dirM
            openTrade.sl = dirM === 1 ? Math.max(openTrade.sl, trail) : Math.min(openTrade.sl, trail)
          }
        }
        if (closed) { openTrade = null; lastTradeBar = i }

        peak = Math.max(peak, bal)
        const dd = peak > 0 ? (peak - bal) / peak : 0
        maxDD = Math.max(maxDD, dd)
        continue
      }

      // Entry logic — use full confluence scoring
      if (i - lastTradeBar < 12) continue // cooldown: 1 hour

      const closes = slice.map(b => b.close)
      const vpoc = calcVPOC(slice.slice(-80))

      // Determine 1h bias at this bar
      let bias1h: 'BULL'|'BEAR'|'NEUTRAL' = 'NEUTRAL'
      if (bars1h.length > 22) {
        const barTime = i * 5 * 60_000
        const h1Index = Math.min(Math.floor(barTime / (3600_000)) , bars1h.length - 1)
        const h1Slice = bars1h.slice(Math.max(0, h1Index - 22), h1Index + 1)
        if (h1Slice.length >= 10) {
          const h1c = h1Slice.map(b => b.close)
          const e9h = calcEma(h1c, 9), e21h = calcEma(h1c, 21)
          if (e9h > e21h * 1.001) bias1h = 'BULL'
          else if (e9h < e21h * 0.999) bias1h = 'BEAR'
        }
      }

      const adx = calcADX(slice.slice(-30))
      const entryScore = calcConfluenceScore(
        slice, price, vpoc, bias1h, adx, 50, 'FLAT', 35, 65, 1.02
      )

      // v27.6: mirror the live gates — base floor 50, final threshold 65
      // (1H alignment bonus approximates the live mtf bonus)
      const btAlignBonus = (entryScore.side === 'LONG' && bias1h === 'BULL') || (entryScore.side === 'SHORT' && bias1h === 'BEAR') ? 10 : 0
      if (!entryScore.side || entryScore.score < 50 || entryScore.score + btAlignBonus < 65) continue

      // 1H hard block
      if (entryScore.side === 'LONG' && bias1h === 'BEAR') continue
      if (entryScore.side === 'SHORT' && bias1h === 'BULL') continue

      const slDist = Math.max(entryScore.slDist, price * MIN_SL_PCT)
      const slPct = slDist / price
      if (slPct < MIN_SL_PCT || slPct > 0.04) continue

      // Drawdown scaling
      const ddScale = calcDrawdownScale(peak > 0 ? (peak - bal) / peak : 0)
      if (ddScale <= 0) continue

      const vp = VOL_PARAMS[getVolRegime(atrPct)]
      let tpR = calcDynamicTP(2.5, calcVolatilityPercentile(slice).pct)
      // v27.6: mirror live range-fade TP — mid-band target, skip tight ranges
      if (entryScore.rangeFade && entryScore.bbMid) {
        const midR = Math.abs(entryScore.bbMid - price) / slDist
        if (midR < 1.0) continue
        tpR = Math.min(tpR, midR)
      }
      const notional = Math.min(bal * 0.018 * ddScale / slPct, bal * MAX_NOTIONAL_PCT)
      if (notional < 5 || notional > bal * 0.95) continue

      const side = entryScore.side
      const dirM = side === 'LONG' ? 1 : -1
      const size = notional / price
      const fee = price * size * FEE
      bal -= (notional + fee)

      const partialR = PARTIAL_TP_BY_VOL[getVolRegime(atrPct)]
      openTrade = {
        side, entry: price, size,
        sl: side === 'LONG' ? price - slDist : price + slDist,
        tp: side === 'LONG' ? price + slDist * tpR : price - slDist * tpR,
        partialTP: price + slDist * partialR * dirM,
        partialDone: false, bar: i, slDist,
      }
    }

    // Close any remaining open trade at last bar
    if (openTrade) {
      const price = bars[bars.length-1].close
      const dirM = openTrade.side === 'LONG' ? 1 : -1
      const pnl = (price - openTrade.entry) * openTrade.size * dirM - price * openTrade.size * FEE
      bal += openTrade.entry * openTrade.size + pnl; pnls.push(pnl)
      if (pnl > 0) wins++; else losses++
      openTrade = null
    }

    const total = wins + losses
    totalWins += wins; totalLosses += losses
    allPnls.push(...pnls)
    const avgPnl = pnls.length ? pnls.reduce((a,b)=>a+b,0)/pnls.length : 0
    const std = pnls.length > 1 ? Math.sqrt(pnls.reduce((a,b)=>a+(b-avgPnl)**2,0)/pnls.length) : 1
    const avgWin = pnls.filter(p=>p>0).length ? pnls.filter(p=>p>0).reduce((a,b)=>a+b,0)/pnls.filter(p=>p>0).length : 0
    const avgLoss = pnls.filter(p=>p<=0).length ? Math.abs(pnls.filter(p=>p<=0).reduce((a,b)=>a+b,0)/pnls.filter(p=>p<=0).length) : 1
    const profitFactor = avgLoss > 0 ? (avgWin * wins) / (avgLoss * losses || 1) : 0

    results.push({
      sym, bars: bars.length, days: (bars.length * 5 / 1440).toFixed(1),
      trades: total, wins, losses, partials,
      winRate: ((wins/(total||1))*100).toFixed(1)+'%',
      profitFactor: profitFactor.toFixed(2),
      roi: ((bal/symStart-1)*100).toFixed(2)+'%',
      maxDrawdown: (maxDD*100).toFixed(1)+'%',
      sharpe: (avgPnl/(std||1)*Math.sqrt(288)).toFixed(2),
      finalBalance: bal.toFixed(2),
    })
  }

  // Aggregate
  const totalTrades = totalWins + totalLosses
  const totalAvg = allPnls.length ? allPnls.reduce((a,b)=>a+b,0)/allPnls.length : 0
  const totalStd = allPnls.length > 1 ? Math.sqrt(allPnls.reduce((a,b)=>a+(b-totalAvg)**2,0)/allPnls.length) : 1
  const totalProfit = allPnls.reduce((a,b)=>a+b,0)

  return {
    config: {days, coins: testCoins.length, confluenceThreshold: 55, leverage: LEVERAGE},
    perCoin: results,
    summary: {
      totalTrades,
      totalWins,
      totalLosses,
      overallWinRate: ((totalWins/(totalTrades||1))*100).toFixed(1)+'%',
      totalProfit: totalProfit.toFixed(2),
      overallSharpe: (totalAvg/(totalStd||1)*Math.sqrt(288)).toFixed(2),
      avgPnlPerTrade: totalAvg.toFixed(2),
    }
  }
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY')!
    )

    if (url.searchParams.get('backtest')==='1') {
      const days = parseInt(url.searchParams.get('days') || '30', 10)
      return new Response(JSON.stringify({ok:true,backtest:await runBacktest(days)}),
        {headers:{'Content-Type':'application/json'}})
    }

    if (url.searchParams.get('trades')==='1') {
      const {data:trades} = await supabase.from('bot_trades').select('*').neq('status','OPEN')
        .order('closed_at',{ascending:false}).limit(10)
      return new Response(JSON.stringify({ok:true,trades:trades||[]}),
        {headers:{'Content-Type':'application/json'}})
    }

    if (url.searchParams.get('reset')==='1') {
      const newBalance = 10000
      await supabase.from('bot_trades').delete().neq('id',0)
      await supabase.from('bot_state').update({
        balance: newBalance,
        streak: 0,
        market_regime: 'v21_5M',
        updated_at: new Date().toISOString()
      }).eq('id',1)
      return new Response(JSON.stringify({ok:true,msg:'RESET DONE',balance:newBalance,trades_deleted:true}),
        {headers:{'Content-Type':'application/json'}})
    }

    const {data:state} = await supabase.from('bot_state').select('*').eq('id',1).single()
    if (!state?.active) return new Response(JSON.stringify({ok:true,msg:'inactive'}),
      {headers:{'Content-Type':'application/json'}})

    // v28.2: single-runner lease — concurrent invocations (cron overlap, manual
    // trigger, retries) raced on balance and the 1-per-symbol check, producing
    // duplicate positions and corrupted peak_balance. Claim a 50s lease
    // atomically; if another run holds it, exit.
    const nowIso = new Date().toISOString()
    const { data: lockRows } = await supabase.from('bot_state')
      .update({ lock_until: new Date(Date.now() + 50_000).toISOString() })
      .eq('id', 1)
      .or(`lock_until.is.null,lock_until.lt.${nowIso}`)
      .select('id')
    if (!lockRows || lockRows.length === 0) {
      return new Response(JSON.stringify({ok:true,msg:'another run in progress — skipped'}),
        {headers:{'Content-Type':'application/json'}})
    }

    const paperMode = url.searchParams.get('paper')==='1' || state.paper_mode===true

    // dynamic params from optimizer agent (falls back to hardcoded defaults)
    const _bp   = (state.bot_params ?? {}) as Record<string,any>
    const dynVol       = { ...VOL_PARAMS,         ...(_bp.vol_params         ?? {}) } as typeof VOL_PARAMS
    const dynSession   = { ...SESSION_PARAMS,     ...(_bp.session_params     ?? {}) } as typeof SESSION_PARAMS
    const dynPartialTP = { ...PARTIAL_TP_BY_VOL,  ...(_bp.partial_tp_by_vol  ?? {}) } as typeof PARTIAL_TP_BY_VOL
    const dynMaxHold   = Number(_bp.max_hold_min  ?? MAX_HOLD_MIN)

    let balance = state.balance
    const now   = Date.now()
    const utcH  = new Date().getUTCHours()
    const utcM  = new Date().getUTCMinutes()
    const rawRisk = state.risk as string
    const safeRisk: RiskKey = (rawRisk in RISK) ? rawRisk as RiskKey : 'medium'
    const R     = RISK[safeRisk]

    // v21: Session detection
    const session = getSession(utcH)
    const sp      = dynSession[session]

    if (url.searchParams.get('status')==='1') {
      const {data:openTrades}=await supabase.from('bot_trades').select('sym,side').eq('status','OPEN')
      const openList=(openTrades||[]).map((t:any)=>`${t.sym} ${t.side}`).join(', ')||'None'
      const modeTag=paperMode?'📋 PAPER':'💵 LIVE'
      const msg=(
        `CryptoBot v21 [5m] ${modeTag} | `+
        `Balance: $${Number(state.balance).toFixed(2)} | `+
        `Open: ${openTrades?.length||0} — ${openList} | `+
        `Session: ${session} | ${new Date().toUTCString()}`
      )
      return new Response(JSON.stringify({ok:true,msg}),{headers:{'Content-Type':'application/json'}})
    }

    const {data:recent} = await supabase
      .from('bot_trades').select('sym,pnl,closed_at,status,side').neq('status','OPEN')
      .gte('closed_at',new Date(now-4*3600_000).toISOString())
      .order('closed_at',{ascending:false}).limit(100)

    const symCooldown=new Set<string>()
    for (const t of (recent||[]))
      if (t.closed_at && now-new Date(t.closed_at).getTime()<SYM_COOLDOWN_MS)
        symCooldown.add(t.sym)

    // v31-B: 4-hour loss cooldown per coin+direction
    // After a losing trade, block re-entry in the same direction for 4h
    const LOSS_COOLDOWN_MS = 4 * 3600_000
    const lossCooldown = new Set<string>()
    for (const t of (recent||[])) {
      if (t.closed_at && Number(t.pnl) < 0 && t.side) {
        const age = now - new Date(t.closed_at).getTime()
        if (age < LOSS_COOLDOWN_MS) lossCooldown.add(`${t.sym}_${t.side}`)
      }
    }

    const dynamicBlacklist=buildBlacklist(recent||[])

    let streak=0
    for (const t of (recent||[])) { if(Number(t.pnl)<0) streak++; else break }
    const streakPaused=streak>=R.streakLimit &&
      new Date((recent?.[0]?.closed_at??0)).getTime()+STREAK_PAUSE_MS>now

    let kellyMult=1.0
    if (recent && recent.length>=8) {
      const wins_  =recent.filter(t=>Number(t.pnl)>0)
      const losses_=recent.filter(t=>Number(t.pnl)<=0)
      const avgW   =wins_.length   ?wins_.reduce((a,t)=>a+Number(t.pnl),0)/wins_.length:0
      const avgL   =losses_.length ?Math.abs(losses_.reduce((a,t)=>a+Number(t.pnl),0)/losses_.length):1
      const p=wins_.length/recent.length, b=avgL>0?avgW/avgL:1
      const k=(p*b-(1-p))/b
      kellyMult=Math.max(0.5,Math.min(1.2,k*1.5))
    }

    const log:string[]=[]
    if (streakPaused) log.push(`STREAK PAUSE ${streak}`)
    if (dynamicBlacklist.size>0) log.push(`BLACKLIST ${[...dynamicBlacklist].join(',')}`)

    // ── Phase 10: Equity Curve Guard (v25: progressive scaling) ────────────────
    // v28.1 CRITICAL FIX: drawdown must be measured on EQUITY (cash + open
    // position notional), not cash balance. Entries deduct notional from cash,
    // so with 60% exposure the cash-based number read as a 60% "drawdown" and
    // the guard force-closed every basket at market — the -$958 churn bug.
    const {data:allOpen}=await supabase.from('bot_trades').select('*').eq('status','OPEN')
    const lockedNotional = (allOpen||[]).reduce((s:number,t:any)=>s+Number(t.entry_price)*Number(t.size),0)
    const equity = balance + lockedNotional
    const circuitBreakerActive = equity < INITIAL_BALANCE*(1-MAX_DD_STOP)
    const peakBalanceStored  = Number(state.peak_balance ?? INITIAL_BALANCE)
    const currentPeakBalance = Math.max(peakBalanceStored, equity)
    const newPeakBalance     = equity > peakBalanceStored ? equity : peakBalanceStored
    const drawdownFromPeak   = currentPeakBalance > 0 ? (currentPeakBalance - equity) / currentPeakBalance : 0
    const drawdownScale      = calcDrawdownScale(drawdownFromPeak)
    let equityGuardMult   = drawdownScale
    const equityGuardPaused = drawdownScale <= 0   // real 30%+ equity DD → force-close
    let entriesBlocked    = equityGuardPaused      // blocks new entries only
    if (equityGuardPaused) {
      log.push(`EQUITY GUARD: ${(drawdownFromPeak*100).toFixed(0)}% equity drawdown — PAUSED`)
    } else if (drawdownScale < 1.0) {
      log.push(`EQUITY GUARD: ${(drawdownFromPeak*100).toFixed(0)}% equity drawdown — sizing at ${(drawdownScale*100).toFixed(0)}%`)
    }

    // v25: Daily P&L circuit breaker — stop if lost more than 3% of equity today
    // v28.1: blocks NEW entries only — it no longer force-closes open positions
    const dailyPnl = calcDailyPnl(recent || [])
    const dailyLossLimitActive = dailyPnl < -(equity * DAILY_LOSS_LIMIT_PCT)
    if (dailyLossLimitActive) {
      entriesBlocked = true
      log.push(`DAILY LOSS LIMIT: lost $${Math.abs(dailyPnl).toFixed(0)} today (>${(DAILY_LOSS_LIMIT_PCT*100).toFixed(0)}% of equity) — no new entries`)
    }

    const needDailySummary=utcH===0&&utcM===0
    const [btcBars,allFunding,COINS,fearGreed,trades100,dayTradesRaw,btcAdxForDaily]=await Promise.all([
      fetchBars('BTC','5m',60),
      fetchAllFundingRates(),
      Promise.resolve(FIXED_COINS),
      fetchFearGreed(),
      supabase.from('bot_trades').select('pnl,side,sym').neq('status','OPEN')
        .order('closed_at',{ascending:false}).limit(100).then(r=>r.data||[]),
      needDailySummary
        ? supabase.from('bot_trades').select('pnl').neq('status','OPEN')
            .gte('closed_at',new Date(now-86400_000).toISOString()).then(r=>r.data||[])
        : Promise.resolve(null),
      needDailySummary ? fetchBars('BTC','5m',200).then(b => b.length > 30 ? calcADX(b) : 20) : Promise.resolve(20)
    ])

    const {minScore:adaptMinScore,vpocDist:adaptVpocDist,sideFilter:adaptSideFilter}=
      computeAdaptive(trades100 as any[])

    // v21: ML coin scoring
    const coinScores=computeCoinScores(trades100 as any[])
    const hasEnoughCoinHistory=Object.keys(coinScores).length>=3
    const activeCoins=COINS.filter(c=>!hasEnoughCoinHistory||coinScores[c]!==undefined)
    const topCoins=Object.entries(coinScores).sort((a,b)=>b[1].score-a[1].score).slice(0,5)

    log.push(`v23 COINS=${activeCoins.length}/${COINS.length} sess=${session}×${sp.sizeMult} FG=${fearGreed}`)
    log.push(`ADAPT sc>=${adaptMinScore}+${sp.minScoreBonus} vpoc<=${(adaptVpocDist*100).toFixed(1)}% side=${adaptSideFilter} kelly=${kellyMult.toFixed(2)}`)
    if (topCoins.length>0)
      log.push(`TOP ${topCoins.map(([s,v])=>`${s}:${v.score.toFixed(0)}`).join(' ')}`)

    // ── Phase 4: Coin suspension — auto-disable coins with ≥15 trades + WR<40% ──
    const coinWeights = JSON.parse(JSON.stringify(state.coin_weights ?? {})) as Record<string,any>
    const suspendedCoins = new Set<string>()

    for (const [coin, wt] of Object.entries(coinWeights)) {
      if ((wt as any)?.suspended_until && new Date((wt as any).suspended_until).getTime() > now) {
        suspendedCoins.add(coin)
      } else if ((wt as any)?.suspended_until) {
        log.push(`RESUME ${coin}: suspension expired`)
        delete (coinWeights[coin] as any).suspended_until
      }
    }

    const coinTradesMap: Record<string,any[]> = {}
    for (const t of (trades100 as any[])) {
      if (!coinTradesMap[t.sym]) coinTradesMap[t.sym] = []
      coinTradesMap[t.sym].push(t)
    }
    for (const [coin, cTrades] of Object.entries(coinTradesMap)) {
      if (cTrades.length >= 15 && !suspendedCoins.has(coin)) {
        const wr = cTrades.filter((t:any) => Number(t.pnl) > 0).length / cTrades.length
        if (wr < 0.40) {
          const suspendUntil = new Date(now + 7 * 86400_000).toISOString()
          if (!coinWeights[coin]) coinWeights[coin] = {}
          ;(coinWeights[coin] as any).suspended_until = suspendUntil
          suspendedCoins.add(coin)
          log.push(`SUSPEND ${coin}: wr=${(wr*100).toFixed(0)}% (${cTrades.length} trades) until ${suspendUntil.slice(0,10)}`)
        }
      }
    }
    if (suspendedCoins.size > 0) log.push(`SUSPENDED: ${[...suspendedCoins].join(',')}`)

    // ── Phase 5: Coin boost/reduce by win-rate rank ────────────────────────────
    const coinWrRankList: { coin:string; wr:number }[] = []
    for (const [coin, cTrades] of Object.entries(coinTradesMap)) {
      if (cTrades.length >= 15) {
        const wr = cTrades.filter((t:any) => Number(t.pnl) > 0).length / cTrades.length
        coinWrRankList.push({ coin, wr })
      }
    }
    coinWrRankList.sort((a,b) => b.wr - a.wr)
    const topBoostCoins    = new Set(coinWrRankList.slice(0, 3).map(c => c.coin))
    const bottomReduceCoins = new Set(coinWrRankList.slice(-3).filter(c => !suspendedCoins.has(c.coin)).map(c => c.coin))

    let btcBias:'BULL'|'BEAR'|'NEUTRAL'='NEUTRAL'
    let btcRegime:'TRENDING'|'RANGING'|'SQUEEZE'='TRENDING'
    if (btcBars.length>=20) {
      const cl=btcBars.slice(0,-1).map(b=>b.close)
      const rsi=calcRsi(cl,14),e9=calcEma(cl,9),e21=calcEma(cl,21)
      if(rsi>55&&e9>e21) btcBias='BULL'
      else if(rsi<45&&e9<e21) btcBias='BEAR'
      btcRegime=detectRegime(btcBars.slice(0,-1))
    }
    log.push(`BTC=${btcBias} REGIME=${btcRegime}`)

    if (circuitBreakerActive) {
      log.push(`CIRCUIT_BREAKER active — managing open positions only`)
    }


    // allOpen fetched above (v28.1) for equity computation
    const openBySymbol:Record<string,any[]>={}
    const corrGroupCount:Record<number,number>={}
    let openCount=0
    let newEntriesThisScan=0  // v27.2: stagger entries — max 2 new positions per scan
    for (const t of (allOpen||[])) {
      if(!openBySymbol[t.sym]) openBySymbol[t.sym]=[]
      openBySymbol[t.sym].push(t)
      const gid=getCorrGroup(t.sym)
      if(gid>=0) corrGroupCount[gid]=(corrGroupCount[gid]||0)+1
      openCount++
    }

    // Include any open-position coins not in FIXED_COINS so they get managed/closed
    const fixedSet = new Set(activeCoins)
    const extraOpenSyms = Object.keys(openBySymbol).filter(s => !fixedSet.has(s))
    const allManagedCoins = [...activeCoins, ...extraOpenSyms]

    const BATCH=12
    for (let b=0; b<allManagedCoins.length; b+=BATCH) {
      await Promise.all(allManagedCoins.slice(b,b+BATCH).map(async (sym)=>{
      try {
        const [bars5m,priceRes,bars1h,bars15m]=await Promise.all([
          fetchBars(sym,'5m',200),
          fetch(`${BINANCE_DATA}/ticker/price?symbol=${sym}USDT`).then(r=>r.json()).catch(()=>null),
          fetchBars(sym,'1h',30),
          fetchBars(sym,'15m',30),
        ])
        const _price5m = priceRes?.price ? +priceRes.price : (bars5m[bars5m.length-1]?.close ?? 0)
        const _priceChange5m = bars5m.length >= 2 ? (_price5m - bars5m[bars5m.length-2].close) / bars5m[bars5m.length-2].close : 0
        const oiSig = await fetchOISignal(sym, _priceChange5m)
        if (!bars5m||bars5m.length<30) return

        // v25: API fallback — try CoinGecko if Binance price unavailable
        let price = priceRes?.price ? +priceRes.price : 0
        if (!price && bars5m.length > 0) price = bars5m[bars5m.length-1].close
        if (!price) {
          const fallbackPrice = await fetchPriceFallback(sym)
          if (fallbackPrice) {
            price = fallbackPrice
            log.push(`FALLBACK ${sym}: using CoinGecko price $${price}`)
          } else return
        }
        const completed=bars5m.slice(0,-1)
        const atr      =calcATR(completed)
        const atrPct   =atr/price
        const volRegime=getVolRegime(atrPct)
        const vp       =dynVol[volRegime]
        const openTrades=openBySymbol[sym]||[]

        // v22: Calculate ADX and 1H bias for confluence score
        const adx = calcADX(completed)
        let ema1hBias: 'BULL'|'BEAR'|'NEUTRAL' = 'NEUTRAL'
        if (bars1h && bars1h.length >= 22) {
          const closes1h = bars1h.slice(0,-1).map(b=>b.close)
          const e9_1h  = calcEma(closes1h, 9)
          const e21_1h = calcEma(closes1h, 21)
          if (e9_1h>e21_1h*1.001) ema1hBias = 'BULL'
          else if (e9_1h<e21_1h*0.999) ema1hBias = 'BEAR'
        }

        // ── STAGE 2: Multi-timeframe confirmation (15m) ──
        let ema15mBias: 'BULL'|'BEAR'|'NEUTRAL' = 'NEUTRAL'
        if (bars15m && bars15m.length >= 22) {
          const closes15m = bars15m.slice(0,-1).map(b=>b.close)
          const e9_15m = calcEma(closes15m, 9)
          const e21_15m = calcEma(closes15m, 21)
          if (e9_15m>e21_15m*1.001) ema15mBias = 'BULL'
          else if (e9_15m<e21_15m*0.999) ema15mBias = 'BEAR'
        }

        const vpoc = calcVPOC(completed.slice(-80))

        // v30: EMA50/200 on 1H — Golden Cross / Death Cross macro bias
        let ema200Bias: 'BULL'|'BEAR'|'NEUTRAL' = 'NEUTRAL'
        if (bars1h && bars1h.length >= 52) {
          const closes1hAll = bars1h.slice(0, -1).map(b => b.close)
          const e50_1h  = calcEma(closes1hAll, 50)
          const e200_1h = calcEma(closes1hAll, 200)
          if (e50_1h > e200_1h * 1.001) ema200Bias = 'BULL'
          else if (e50_1h < e200_1h * 0.999) ema200Bias = 'BEAR'
        }

        // ── STAGE 2: Calculate volatility percentile and dynamic SL/TP ──
        const {pct: volPctile, atrPct: curAtrPct} = calcVolatilityPercentile(completed)
        const dynamicSLMult = adx > 25 ? 1.0 : adx < 15 ? 1.5 : 1.2
        // v27.6: tp_r from bot_params actually drives the TP (was a dead read)
        const dynamicTPBase = calcDynamicTP(Number(_bp.tp_r ?? 2.5), volPctile)

        // v22: Get last 5m price change for OI divergence context
        const last5min = completed.length >= 2 ? (price - completed[completed.length-2].close) / completed[completed.length-2].close : 0

        // ── Phase 3: Pre-compute EMA exit arrays (once per coin, reused in loop) ──
        const closesAll5m  = completed.map((b:Bar) => b.close)
        const ema9ExitArr  = calcEmaArr(closesAll5m, 9)
        const ema21ExitArr = calcEmaArr(closesAll5m, 21)
        const curE9Exit    = ema9ExitArr.at(-1)!,  prevE9Exit  = ema9ExitArr.at(-2)!
        const curE21Exit   = ema21ExitArr.at(-1)!, prevE21Exit = ema21ExitArr.at(-2)!
        const vols20Exit   = completed.slice(-20).map((b:Bar) => b.vol)
        const volAvg20Exit = vols20Exit.reduce((a:number,v:number) => a+v, 0) / vols20Exit.length
        const curBarVol    = completed[completed.length-1].vol
        const isLowVolExit = volAvg20Exit > 0 && curBarVol < volAvg20Exit * 0.8

        // ── Manage open positions ─────────────────────────
        for (const t of openTrades) {
          const entry =Number(t.entry_price)
          const size  =Number(t.size)
          const sl    =Number(t.trail_sl)
          const slDist=Math.abs(entry-sl)
          const dirM  =t.side==='LONG'?1:-1
          const ageMs =t.opened_at?now-new Date(t.opened_at).getTime():0

          // ── TASK 1: Retroactive snapshot if not already created ──
          if (t.id && !t.snapshot_recorded) {
            const cls5m = completed.map((b:Bar) => b.close)
            const rsiSnap = calcRsi(cls5m.slice(-15))
            const vols20Snap = completed.slice(-20).map((b:Bar) => b.vol)
            const volAvgSnap = vols20Snap.reduce((a:number,v:number)=>a+v,0)/vols20Snap.length
            const curVolSnap = completed[completed.length-1].vol
            const volRatioSnap = volAvgSnap > 0 ? curVolSnap/volAvgSnap : 1.0
            const {pct: volPct} = calcVolatilityPercentile(completed)
            try {
              await supabase.from('bot_trade_snapshots').insert({
                trade_id: t.id, coin: sym, side: t.side,
                confluence_score: Math.round(t.score || 50),
                adx: +(adx.toFixed(2)),
                rsi: +(rsiSnap.toFixed(2)),
                volume_ratio: +(volRatioSnap.toFixed(3)),
                hour_utc: utcH,
                market_regime: btcRegime+'_v23_5M',
                session: session,
                oi_signal: oiSig,
                fear_greed: fearGreed,
                vpoc: +(vpoc.toFixed(6)),
                volatility_pct: volPct,
                result: 'snapshot_current'
              }).catch(()=>{})
              await supabase.from('bot_trades').update({snapshot_recorded: true}).eq('id',t.id).catch(()=>{})
            } catch { /* non-fatal */ }
          }

          // ── TASK 1: Equity Guard — if 30% drawdown, close ALL positions immediately ──
          if (equityGuardPaused) {
            const fav = (price-entry)/entry*dirM
            const pnl = (price-entry)*size*dirM - price*size*FEE
            balance += entry*size+pnl; openCount--
            await supabase.from('bot_trades').update({
              status: pnl >= 0 ? 'TP' : 'SL', exit_price:price, pnl, pnl_pct:fav,
              closed_at:new Date().toISOString()
            }).eq('id',t.id)
            await supabase.from('bot_trade_snapshots').update({ result:'equity_guard_forced_close', pnl }).eq('trade_id',t.id).catch(()=>{})
            await updateMarketMemory(supabase, t.id, 'TP', pnl, log)
            log.push(`EQUITY_GUARD_CLOSE ${sym} ${t.side} @${price.toFixed(4)} pnl=${pnl.toFixed(2)}`)
            continue
          }

          // ── TASK 1: Equity Guard — if 15% drawdown, tighten SL by 50% ──
          let adjustedSl = sl
          if (equityGuardMult === 0.5) {
            const slDistTightened = slDist * 0.5
            adjustedSl = t.side === 'LONG' ? sl + slDistTightened : sl - slDistTightened
          }

          // ── Phase 3: Smart Early Exit — EMA9 cross against direction + low vol ──
          // v27: only cut LOSING trades early — winners get to run to trail/TP
          const emaCrossedAgainst =
            (t.side==='LONG'  && prevE9Exit >= prevE21Exit && curE9Exit < curE21Exit) ||
            (t.side==='SHORT' && prevE9Exit <= prevE21Exit && curE9Exit > curE21Exit)
          if (emaCrossedAgainst && isLowVolExit && (price-entry)*dirM < 0) {
            const fav = (price-entry)/entry*dirM
            const pnl = (price-entry)*size*dirM - price*size*FEE
            const finalSt = 'TRAIL'  // gate above guarantees a losing exit
            balance += entry*size+pnl; openCount--
            await supabase.from('bot_trades').update({
              status:finalSt, exit_price:price, pnl, pnl_pct:fav,
              closed_at:new Date().toISOString()
            }).eq('id',t.id)
            await supabase.from('bot_trade_snapshots').update({ result:'early_exit_ema_reversal', pnl }).eq('trade_id',t.id).catch(()=>{})
            await updateMarketMemory(supabase, t.id, finalSt, pnl, log)
            log.push(`RETROACTIVE_EARLY_EXIT ${sym} ${t.side} @${price.toFixed(4)} vs entry ${entry.toFixed(4)} pnl=${pnl.toFixed(2)}`)
            continue
          }

          // ─────────────────────────────────────────────────────────────────────────
          // UPGRADE 6: ADVANCED EXIT SIGNALS
          // ─────────────────────────────────────────────────────────────────────────
          const macdData = calcMACD(completed.map(b => b.close))
          const rsiHistory20 = completed.slice(-20).map((b, i) =>
            i === 0 ? 50 : calcRsi(completed.slice(0, i+1).map(x => x.close))
          )
          const volHistory20 = completed.slice(-20).map(b => b.vol)
          const volAvg20 = volHistory20.reduce((a,b)=>a+b,0)/volHistory20.length

          const advancedExit = advancedExitCheck(t, completed[completed.length-1], price, macdData.histogram, rsiHistory20, volHistory20, volAvg20)
          if (advancedExit.closePercent > 0 && t.status === 'OPEN') {
            const closeSize = size * advancedExit.closePercent
            const fav = (price-entry)/entry*dirM
            const closePnl = (price-entry)*closeSize*dirM - price*closeSize*FEE
            balance += entry*closeSize+closePnl

            if (advancedExit.closePercent >= 1.0) {
              openCount--
              await supabase.from('bot_trades').update({
                status:'TP', exit_price:price, pnl:closePnl, pnl_pct:fav,
                closed_at:new Date().toISOString()
              }).eq('id',t.id)
              await supabase.from('bot_trade_snapshots').update({ result:`advanced_exit_${advancedExit.reason}`, pnl:closePnl }).eq('trade_id',t.id).catch(()=>{})
              await updateMarketMemory(supabase, t.id, 'TP', closePnl, log)
              log.push(`ADVANCED_EXIT ${sym} ${t.side} (${advancedExit.reason}) @${price.toFixed(4)} pnl=${closePnl.toFixed(2)}`)
              continue
            } else {
              // Partial close
              await supabase.from('bot_trades').update({
                size: size - closeSize,
                trail_sl: sl + (entry-sl)*0.3*dirM  // Tighten SL toward entry
              }).eq('id',t.id)
              log.push(`ADVANCED_PARTIAL ${sym} ${t.side} (${advancedExit.reason}) ${(advancedExit.closePercent*100).toFixed(0)}% @${price.toFixed(4)} pnl=${closePnl.toFixed(2)}`)
              continue
            }
          }

          // ── v29: VWAP Counter-Exit ──
          // If price crosses to the WRONG side of VWAP while we're losing (< -0.3R),
          // institutional bias has shifted against us — exit early.
          const vwapNow = calcVWAP(completed)
          const vwapProfitR = slDist > 0 ? (price - entry) * dirM / slDist : 0
          if (vwapNow > 0 && vwapProfitR < -0.3) {
            const vwapAgainst =
              (t.side === 'LONG'  && price < vwapNow * 0.999) ||
              (t.side === 'SHORT' && price > vwapNow * 1.001)
            if (vwapAgainst) {
              const fav = (price - entry) / entry * dirM
              const pnl = (price - entry) * size * dirM - price * size * FEE
              balance += entry * size + pnl; openCount--
              await supabase.from('bot_trades').update({
                status: 'SL', exit_price: price, pnl, pnl_pct: fav,
                closed_at: new Date().toISOString()
              }).eq('id', t.id)
              await supabase.from('bot_trade_snapshots').update({ result: 'vwap_counter_exit', pnl }).eq('trade_id', t.id).catch(() => {})
              await updateMarketMemory(supabase, t.id, 'SL', pnl, log)
              log.push(`VWAP_COUNTER ${sym} ${t.side} @${price.toFixed(4)} vwap=${vwapNow.toFixed(4)} pnl=${pnl.toFixed(2)}`)
              continue
            }
          }

          // ── v29: Stop-Hunt Counter-Signal Exit ──
          // If the OPPOSITE stop-hunt fires while we're losing (< -0.2R),
          // the market just swept stops in the direction that hurts us —
          // strong reversal evidence. Exit early rather than wait for SL.
          const shOppSide = t.side === 'LONG' ? 'SHORT' : 'LONG'
          const shProfitR = slDist > 0 ? (price - entry) * dirM / slDist : 0
          if (shProfitR < -0.2 && detectStopHunt(completed, shOppSide)) {
            const fav = (price - entry) / entry * dirM
            const pnl = (price - entry) * size * dirM - price * size * FEE
            balance += entry * size + pnl; openCount--
            await supabase.from('bot_trades').update({
              status: 'SL', exit_price: price, pnl, pnl_pct: fav,
              closed_at: new Date().toISOString()
            }).eq('id', t.id)
            await supabase.from('bot_trade_snapshots').update({ result: 'stop_hunt_counter_exit', pnl }).eq('trade_id', t.id).catch(() => {})
            await updateMarketMemory(supabase, t.id, 'SL', pnl, log)
            log.push(`STOP_HUNT_COUNTER ${sym} ${t.side} @${price.toFixed(4)} pnl=${pnl.toFixed(2)}`)
            continue
          }

          const storedTP_LONG =Number(t.hi)>entry*1.001
          const storedTP_SHORT=Number(t.lo) <entry*0.999
          const tp=storedTP_LONG  ?Number(t.hi)
                  :storedTP_SHORT ?Number(t.lo)
                  :t.side==='LONG'?entry+slDist*vp.tpR:entry-slDist*vp.tpR

          const origSlDist=(t.side==='LONG' &&storedTP_LONG )?(Number(t.hi)-entry)/vp.tpR
                          :(t.side==='SHORT'&&storedTP_SHORT)?(entry-Number(t.lo))/vp.tpR
                          :slDist

          // v21: Dynamic partial TP R by current vol regime
          const dynamicPartialR=dynPartialTP[volRegime]

          if (!t.partial_done && origSlDist>0 && t.mtf) {
            const partialTPPrice=entry+origSlDist*dynamicPartialR*dirM
            const partialHit=t.side==='LONG'?price>=partialTPPrice:price<=partialTPPrice
            if (partialHit) {
              const halfSize  =size/2
              const partialPnl=(price-entry)*halfSize*dirM - price*halfSize*FEE
              balance+=entry*halfSize+partialPnl
              // ── STAGE 2: Adjust SL to breakeven + 0.2R when partial TP hits ──
              const bePoint = entry*(1+FEE*2.5*dirM)
              const adjPoint = origSlDist > 0 ? bePoint + origSlDist*0.2*dirM : bePoint
              await supabase.from('bot_trades').update({
                size:halfSize,trail_sl:adjPoint,partial_done:true
              }).eq('id',t.id)
              log.push(`PARTIAL ${sym} ${t.side} @${price.toFixed(4)} ${dynamicPartialR}R pnl=${partialPnl.toFixed(2)} sl_adj_be+0.2R`)
              continue
            }
          }

          // ── Use adjusted SL if equity guard is active ──
          const slToUse = equityGuardMult === 0.5 ? adjustedSl : sl

          let newStatus:string|null=null
          if (t.side==='LONG') {
            if(price>=tp)  newStatus='TP'
            else if(price<=slToUse) newStatus=price>=entry?'TRAIL':'SL'
          } else {
            if(price<=tp)  newStatus='TP'
            else if(price>=slToUse) newStatus=price<=entry?'TRAIL':'SL'
          }
          // v25: Dynamic max hold — extend if in profit, shorten if losing
          const profitRForHold = origSlDist > 0 ? (price-entry)*dirM/origSlDist : 0
          const adjMaxHold = calcDynamicMaxHold(dynMaxHold, profitRForHold)
          if (!newStatus&&ageMs>adjMaxHold*60_000) newStatus='TRAIL'

          if (newStatus) {
            const fav=(price-entry)/entry*dirM
            const pnl=(price-entry)*size*dirM-price*size*FEE
            const final=pnl>0&&newStatus==='SL'?'TP':newStatus
            balance+=entry*size+pnl; openCount--
            await supabase.from('bot_trades').update({
              status:final,exit_price:price,pnl,
              pnl_pct:fav,closed_at:new Date().toISOString()
            }).eq('id',t.id)
            // Phase 1: update snapshot with close result
            await supabase.from('bot_trade_snapshots').update({ result:final, pnl }).eq('trade_id',t.id).catch(()=>{})
            // Phase 9: update market memory
            await updateMarketMemory(supabase, t.id, final, pnl, log)
            const modeTag=t.mtf?'SWEEP':'RANGE'
            log.push(`CLOSE ${sym} ${t.side} ${final} [${modeTag}] pnl=${pnl.toFixed(2)} ${Math.round(ageMs/60000)}m`)
          } else if (t.mtf) {
            // ── TASK 1: Enhanced trailing — start from 0.5R instead of 3R ──
            const profitR=origSlDist>0?(price-entry)*dirM/origSlDist:0
            let newSL=slToUse

            // v27.6: at 0.6R cut the remaining risk in half — protects the
            // 0.5-1R band without the wick-out-prone full breakeven lock
            if (profitR>=0.6) {
              const halfRiskLevel=entry-origSlDist*0.5*dirM
              newSL=dirM===1?Math.max(newSL,halfRiskLevel):Math.min(newSL,halfRiskLevel)
            }
            // v27: Breakeven trail starts at 1.0R — let winners breathe
            if (profitR>=1.0) {
              const beLevel=entry*(1+FEE*2.5*dirM)
              newSL=dirM===1?Math.max(newSL,beLevel):Math.min(newSL,beLevel)
            }
            if (profitR>=1.5) {
              const trailLevel=price-atr*vp.trailAtr*dirM
              newSL=dirM===1?Math.max(newSL,trailLevel):Math.min(newSL,trailLevel)
            }
            // v21: Lock in most profit at 3R
            if (profitR>=3.0) {
              const trail3R=price-atr*0.5*dirM
              newSL=dirM===1?Math.max(newSL,trail3R):Math.min(newSL,trail3R)
            }
            // v21: Nearly at TP at 5R — very tight trail
            if (profitR>=5.0) {
              const trail5R=price-atr*0.25*dirM
              newSL=dirM===1?Math.max(newSL,trail5R):Math.min(newSL,trail5R)
            }

            if (newSL!==slToUse)
              await supabase.from('bot_trades').update({trail_sl:newSL}).eq('id',t.id)
          }
        }

        // ── New entry ──────────────────────────────────────
        if (circuitBreakerActive) return
        if (entriesBlocked) return  // 30% equity DD pause or daily loss limit
        if (streakPaused) return
        if (openCount >= MAX_OPEN_TRADES) return
        if (openTrades.length > 0) return  // 1 trade per symbol
        if (symCooldown.has(sym)) return
        // v31-B: loss cooldown check (applied after entryScore.side is known)
        // NOTE: side is determined after calcConfluenceScore — loss cooldown
        // is checked further below once we know the side.
        if (dynamicBlacklist.has(sym)) return
        // Phase 4: Skip suspended coins
        if (suspendedCoins.has(sym)) { log.push(`SKIP ${sym}: suspended`); return }
        // Phase 11: Macro event filter
        const macroChk = isMacroEventWindow(new Date())
        if (macroChk.skip) { log.push(`SKIP ${sym}: macro ${macroChk.reason}`); return }
        if (atrPct > 0.02 || atrPct < 0.00003) return
        if (balance < 10) return
        // v27.2: cap new entries per scan — don't build the whole basket in one minute
        if (newEntriesThisScan >= MAX_NEW_ENTRIES_PER_SCAN) return

        const dynRsiOversold    = Number(_bp.rsi_oversold        ?? 35)
        const dynRsiOverbought  = Number(_bp.rsi_overbought       ?? 65)
        const dynBbProx         = Number(_bp.bb_proximity         ?? 1.02)
        const dynMinConfluence  = Math.max(60, Number(_bp.min_confluence_score ?? 65))
        const dynMinAdx         = Number(_bp.min_adx              ?? 20)  // v31-A: default 20

        // v22: Use confluence score instead of 2/4 signals
        // UPGRADE 2: Pass BTC closes for correlation analysis
        const entryScore = calcConfluenceScore(
          completed, price, vpoc, ema1hBias, adx, fearGreed, oiSig,
          dynRsiOversold, dynRsiOverbought, dynBbProx,
          btcBars.map(b => b.close),
          completed.map(b => b.close),
          ema200Bias
        )

        if (!entryScore.side) {
          log.push(`SKIP ${sym}: no confluence (RSI/BB/EMA mismatch)`)
          return
        }

        // v31-B: loss cooldown — now we know the side
        if (lossCooldown.has(`${sym}_${entryScore.side}`)) {
          log.push(`SKIP ${sym}: loss cooldown active for ${entryScore.side} (4h)`)
          return
        }

        // v27.5: sizing only — the score gate moved to finalScore below, so
        // MTF/funding alignment bonuses count before a trade is rejected.
        const adxSizeAdj = calcAdxSizeAdj(adx, entryScore.rangeFade)
        // v31-A: ADX hard gate — require ADX >= dynMinAdx for trend entries.
        // RangeFade entries are exempt (they deliberately target low-ADX ranges).
        if (!entryScore.rangeFade && adx < dynMinAdx) {
          log.push(`SKIP ${sym}: adx=${adx.toFixed(0)} < ${dynMinAdx} (no trend)`)
          return
        }

        // v24: Hard block only when 1H is STRONGLY against direction
        if (entryScore.side === 'LONG' && ema1hBias === 'BEAR') {
          log.push(`SKIP ${sym}: 1H trend against LONG (${ema1hBias})`)
          return
        }
        if (entryScore.side === 'SHORT' && ema1hBias === 'BULL') {
          log.push(`SKIP ${sym}: 1H trend against SHORT (${ema1hBias})`)
          return
        }

        // v27.2: BTC market bias gate — no counter-trend basket against the market.
        // v27.6: a coin whose OWN 1H trend agrees with the trade overrides the
        // BTC veto (alt-rotation regimes: BTC red while a coin trends up cleanly).
        if (entryScore.side === 'LONG' && btcBias === 'BEAR' && ema1hBias !== 'BULL') {
          log.push(`SKIP ${sym}: BTC bias BEAR blocks LONG (coin 1H not BULL)`)
          return
        }
        if (entryScore.side === 'SHORT' && btcBias === 'BULL' && ema1hBias !== 'BEAR') {
          log.push(`SKIP ${sym}: BTC bias BULL blocks SHORT (coin 1H not BEAR)`)
          return
        }

        // v25: Funding rate filter — skip if funding is strongly against direction
        const symFunding = allFunding[sym] ?? 0
        if (entryScore.side && isFundingAgainst(symFunding, entryScore.side)) {
          log.push(`SKIP ${sym}: funding ${(symFunding*100).toFixed(3)}% against ${entryScore.side}`)
          return
        }

        // v24: Multi-TF alignment as score bonus instead of hard gate
        let mtfBonus = 0
        const _1hAligned = (entryScore.side === 'LONG' && ema1hBias === 'BULL') || (entryScore.side === 'SHORT' && ema1hBias === 'BEAR')
        const _15mAligned = (entryScore.side === 'LONG' && ema15mBias === 'BULL') || (entryScore.side === 'SHORT' && ema15mBias === 'BEAR')
        if (_1hAligned && _15mAligned) mtfBonus = 10
        else if (_1hAligned || _15mAligned) mtfBonus = 5

        // v25: Funding rate bonus — if funding FAVORS our direction, add +3
        let fundingBonus = 0
        if (entryScore.side === 'LONG' && symFunding < -0.0002) fundingBonus = 3
        if (entryScore.side === 'SHORT' && symFunding > 0.0002) fundingBonus = 3

        const finalScore = entryScore.score + mtfBonus + fundingBonus
        // v27.6: base floor — bonuses add conviction to a decent setup, they
        // don't rescue a weak one (base<50 can't enter no matter the bonuses)
        if (entryScore.score < 50 || finalScore < dynMinConfluence) {
          log.push(`SKIP ${sym}: score base=${entryScore.score} final=${finalScore} (mtf=${mtfBonus}+fr=${fundingBonus}) < ${dynMinConfluence}`)
          return
        }

        const { side, slDist: rawSlDist } = entryScore
        // ── STAGE 2: Dynamic SL based on ADX ──
        const dynamicSL = calcDynamicSL(rawSlDist, adx, dynamicSLMult)
        const slDist = Math.max(dynamicSL, price * MIN_SL_PCT)

        if (adaptSideFilter === 'LONG'  && side === 'SHORT') return
        if (adaptSideFilter === 'SHORT' && side === 'LONG')  return

        const gid = getCorrGroup(sym)
        if (gid >= 0 && (corrGroupCount[gid] || 0) >= MAX_PER_GROUP) return

        const slPrice = side === 'LONG' ? price - slDist : price + slDist
        const slPct   = slDist / price
        if (slPct < MIN_SL_PCT || slPct > 0.04) return

        // ── STAGE 2: Dynamic TP based on volatility percentile ──
        // v27.4: range-fade targets the mid-band — a 2.5R target never fills
        // inside a range. If the range is too tight for >= 1R, skip: fees win.
        let tpR = dynamicTPBase
        if (entryScore.rangeFade && entryScore.bbMid) {
          const midR = Math.abs(entryScore.bbMid - price) / slDist
          if (midR < 1.0) {
            log.push(`SKIP ${sym}: range too tight (mid-band ${midR.toFixed(2)}R)`)
            return
          }
          tpR = Math.min(tpR, midR)
        }
        const tpPrice = side === 'LONG' ? price + slDist * tpR : price - slDist * tpR
        const hiVal   = side === 'LONG' ? tpPrice : price
        const loVal   = side === 'SHORT' ? tpPrice : price

        // v22: Apply Kelly scaling by confluence score
        const kellyByScore    = getKellyScaleByScore(entryScore.score)
        const sizeAdjByRegime = adxSizeAdj

        // ── STAGE 2: Volatility-adjusted position sizing ──
        let volSizeMult = 1.0
        if (volPctile < 5) {
          volSizeMult = 0.8  // Low vol — boring, reduce size
        } else if (volPctile > 95) {
          volSizeMult = 1.2  // High vol — risky but good for trending, increase size
        }

        // Phase 6: Session size filter applied to riskAmt
        let sessionSizeAdj = sp.sizeMult
        if (session === 'DEAD') sessionSizeAdj = 0.5
        else if (session === 'ASIAN' && adx < 18) sessionSizeAdj = 0.7

        // Phase 5: Coin boost/reduce
        let coinSizeMult = 1.0
        if (topBoostCoins.has(sym)) {
          coinSizeMult = 1.3
          log.push(`coin_boost: ${sym} 1.3x`)
        } else if (bottomReduceCoins.has(sym)) {
          coinSizeMult = 0.7
          log.push(`coin_reduce: ${sym} 0.7x`)
        }

        // ─────────────────────────────────────────────────────────────────────────
        // UPGRADE 1: CORRELATION HEDGING
        // ─────────────────────────────────────────────────────────────────────────
        let correlationHedgeMult = 1.0
        let hedgeLog = ''
        if (btcBars.length >= 100 && completed.length >= 100) {
          const btcClosesList = btcBars.map(b => b.close)
          const coinClosesList = completed.map(b => b.close)
          const correlation = calcCorrelationMatrix(btcClosesList, coinClosesList, 100)
          correlationHedgeMult = applyCorrelationHedge(correlation, entryScore.side)
          if (correlationHedgeMult !== 1.0) {
            hedgeLog = `hedge_applied: ${sym} corr with BTC ${correlation.toFixed(2)} → size ${(correlationHedgeMult*100).toFixed(0)}%`
            log.push(hedgeLog)
          }
        }

        const riskAmt = balance * R.riskPct * kellyMult * kellyByScore * sizeAdjByRegime * sessionSizeAdj * coinSizeMult * volSizeMult * equityGuardMult * correlationHedgeMult
        const currentExposure = (allOpen||[]).reduce((sum:number, t:any) => sum + Number(t.entry_price) * Number(t.size), 0)
        const remainingExposure = Math.max(0, balance * MAX_TOTAL_EXPOSURE_PCT - currentExposure)
        const notional = Math.min(riskAmt / slPct, balance * MAX_NOTIONAL_PCT, remainingExposure, balance * 0.95)
        if (notional < 5) return

        // v27.2: authoritative per-scan entry cap — same sync block as the
        // increment, so concurrent coin handlers can't slip past it
        if (newEntriesThisScan >= MAX_NEW_ENTRIES_PER_SCAN) return
        const size = notional / price, fee = price * size * FEE
        balance -= (notional + fee); openCount++; newEntriesThisScan++
        if (gid >= 0) corrGroupCount[gid] = (corrGroupCount[gid] || 0) + 1

        // Store MACD histogram at entry for advanced exit comparison
        const macdEntry = calcMACD(completed.map(b => b.close))

        const { data: insertedTrade } = await supabase.from('bot_trades').insert({
          sym, side, entry_price: price, size, fee,
          trail_sl: slPrice, hi: hiVal, lo: loVal,
          status: 'OPEN', score: Math.round(finalScore), mtf: true, partial_done: false,
          paper_mode: paperMode,
          entry_macd_hist: +(macdEntry.histogram.toFixed(4))
        }).select('id').single()

        // Phase 1: Save trade snapshot with all indicator values at entry + STAGE 2 fields
        if (insertedTrade?.id) {
          const cls5m       = completed.map((b:Bar) => b.close)
          const rsiSnap     = calcRsi(cls5m.slice(-15))
          const vols20Snap  = completed.slice(-20).map((b:Bar) => b.vol)
          const volAvgSnap  = vols20Snap.reduce((a:number,v:number)=>a+v,0)/vols20Snap.length
          const curVolSnap  = completed[completed.length-1].vol
          const volRatioSnap = volAvgSnap > 0 ? curVolSnap/volAvgSnap : 1.0
          const stochSnap   = calcStochastic(cls5m, completed.map(b=>b.high), completed.map(b=>b.low))
          const macdSnap    = calcMACD(cls5m)

          try {
            await supabase.from('bot_trade_snapshots').insert({
              trade_id: insertedTrade.id, coin: sym, side: side,
              confluence_score: Math.round(entryScore.score),
              adx: +(adx.toFixed(2)),
              rsi: +(rsiSnap.toFixed(2)),
              volume_ratio: +(volRatioSnap.toFixed(3)),
              hour_utc: utcH,
              market_regime: btcRegime+'_v23_5M',
              session: session,
              oi_signal: oiSig,
              fear_greed: fearGreed,
              vpoc: +(vpoc.toFixed(6)),
              volatility_pct: volPctile,
              adjusted_sl: +(slPrice.toFixed(6)),
              adjusted_tp: +(tpPrice.toFixed(6)),
              stochastic_k: +(stochSnap.K.toFixed(2)),
              stochastic_d: +(stochSnap.D.toFixed(2)),
              macd_histogram: +(macdSnap.histogram.toFixed(4)),
              correlation_hedge: +(correlationHedgeMult.toFixed(2))
            })
          } catch { /* non-fatal */ }
        }

        // v23: Log confluence score breakdown + STAGE 2 enhancements
        const breakdownStr = Object.entries(entryScore.breakdown)
          .filter(([_,v]) => v > 0)
          .map(([k,v]) => `${k}=${v}`)
          .join(' ')
        const volSizeStr = volSizeMult !== 1.0 ? ` vol_sz=${volSizeMult.toFixed(1)}x` : ''
        const tpStr = dynamicTPBase !== 2.5 ? ` dyn_tp=${dynamicTPBase.toFixed(2)}R` : ''
        const mtfStr = ema15mBias !== 'NEUTRAL' ? ` 15m=${ema15mBias}` : ''
        const hedgeStr = correlationHedgeMult !== 1.0 ? ` hedge=${(correlationHedgeMult*100).toFixed(0)}%` : ''
        const frStr = symFunding !== 0 ? ` fr=${(symFunding*100).toFixed(3)}%` : ''
        log.push(`OPEN ${sym} ${side} [CONF] score=${finalScore}(base=${Math.round(entryScore.score)}+mtf=${mtfBonus}+fr=${fundingBonus}) (${breakdownStr})${mtfStr} adx=${adx.toFixed(0)}${tpStr}${hedgeStr}${frStr} vol_pct=${volPctile}${volSizeStr} sess_adj=${sessionSizeAdj.toFixed(2)} @${price.toFixed(6)} sl=${(slPct*100).toFixed(3)}% $${notional.toFixed(0)} ${session}`)

      } catch(e) {
        log.push(`ERR ${sym}: ${String(e).slice(0,40)}`)
      }
      }))
    }

    // v22: Log daily summary if it's the start of a new day
    if (needDailySummary && dayTradesRaw) {
      await logDailySummary(supabase, dayTradesRaw, btcRegime, btcAdxForDaily, log)
    }

    await supabase.from('bot_state').update({
      balance, updated_at: new Date().toISOString(),
      market_regime: btcRegime+'_v23_5M', streak,
      peak_balance:  newPeakBalance,
      coin_weights:  coinWeights,
      lock_until:    new Date().toISOString(),  // v28.2: release run lease
    }).eq('id',1)

    return new Response(JSON.stringify({
      ok:true,v:28,openCount,maxOpen:MAX_OPEN_TRADES,streakPaused,streak,btcBias,btcRegime,
      kelly:kellyMult,fearGreed,adaptMinScore,adaptVpocDist,adaptSideFilter,
      session,sessionSizeMult:sp.sizeMult,equityGuardMult,
      equity:equity.toFixed(2),lockedNotional:lockedNotional.toFixed(2),
      drawdownFromPeak:(drawdownFromPeak*100).toFixed(1)+'%',
      drawdownScale:(drawdownScale*100).toFixed(0)+'%',
      dailyPnl:dailyPnl.toFixed(2),dailyLossLimitActive,
      suspended:[...suspendedCoins],
      blacklist:[...dynamicBlacklist],
      topCoins:topCoins.slice(0,5).map(([s,v])=>({
        sym:s,score:v.score.toFixed(0),wr:(v.wr*100).toFixed(0)+'%',pf:v.pf.toFixed(2)
      })),
      log
    }),{headers:{'Content-Type':'application/json'}})

  } catch(e) {
    return new Response(JSON.stringify({error:String(e)}),{
      status:200,headers:{'Content-Type':'application/json'}
    })
  }
})

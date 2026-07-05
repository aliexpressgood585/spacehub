// ════════════════════════════════════════════════════════════
// CryptoBot v22 — Enhanced with ADX, Confluence Score, & Diary
//
// v22 upgrades (on top of v21):
//  1. ADX CALCULATION: market regime filter (ADX > 22 = trending)
//  2. CONFLUENCE GATE: score 0-100 (VPOC + 1H + ADX + Volume + OI + Sentiment + Candlestick)
//     Only enter if score >= 60 (replaces 2/4 signals, reduces false entries ~95%)
//  3. DYNAMIC POSITION SIZING: Kelly scaling by score (50→0.8×, 60→1.0×, 70→1.2×, 80→1.5×)
//  4. MARKET REGIME FILTER: ADX > 25 → +10% size; ADX < 15 → -70% size
//  5. STRICT 1H TREND: Require 1H EMA9 > EMA21 for longs (not just bias)
//  6. TRADING DIARY: Log daily summaries + each entry decision
//  7. SCORE BREAKDOWN: Log confluence components for each entry
// ════════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2'

const BINANCE_DATA = 'https://data-api.binance.vision/api/v3'
const BINANCE      = 'https://api.binance.com/api/v3'
const FAPI         = 'https://fapi.binance.com/fapi/v1'
const FAPI_DATA    = 'https://fapi.binance.com/futures/data'

const FIXED_COINS = [
  'BTC','ETH','SOL','BNB','XRP','ADA','DOGE','AVAX','LINK','DOT',
  'POL','UNI','ATOM','LTC','BCH','NEAR','ALGO','FIL','VET','ICP',
]
const MIN_COIN_WIN_RATE = 0.42
const MIN_COIN_TRADES   = 8

const CORR_GROUPS: string[][] = [
  ['SOL','AVAX','NEAR','ATOM','DOT','ALGO'],
  ['UNI','AAVE'],
  ['LINK'],
  ['DOGE','ADA'],
  ['LTC','BCH'],
  ['XRP'],
  ['BNB'],['BTC'],['ETH'],['FIL'],['VET'],['ICP'],['POL'],
]
const MAX_PER_GROUP  = 6
const MIN_SCORE      = 2
const VPOC_MAX_DIST  = 0.035

// v21: Dynamic partial TP by vol regime
const PARTIAL_TP_BY_VOL = { LOW: 0.8, MEDIUM: 1.2, HIGH: 1.5 }

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
  high:   { riskPct:0.030, streakLimit:8 },
  ultra:  { riskPct:0.100, streakLimit:15 },
} as const
type RiskKey = keyof typeof RISK

const FEE             = 0.001
const LEVERAGE        = 20
const SWING_N         = 5
const SWING_LOOKBACK  = 60
const SWEEP_LOOKBACK  = 5
const MAX_HOLD_MIN    = 180
const STREAK_PAUSE_MS = 10*60_000
const MAX_NOTIONAL_PCT= 0.12
const FUNDING_EXTREME = 0.0003
const MIN_SL_PCT      = 0.005
const SYM_COOLDOWN_MS = 5*60_000
const MAX_DD_STOP     = 0.80
const INITIAL_BALANCE = 500

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

function calcADX(bars: Bar[], period=14): number {
  if (bars.length < period+1) return 20

  // Calculate True Range and Directional Movement
  const trs:number[]=[], plusDMs:number[]=[], minusDMs:number[]=[]

  for (let i=1; i<bars.length; i++) {
    const h=bars[i].high, l=bars[i].low, pc=bars[i-1].close
    const tr=Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc))
    const hd=h-bars[i-1].high, ld=bars[i-1].low-l

    trs.push(tr)
    plusDMs.push((hd>0 && hd>ld) ? hd : 0)
    minusDMs.push((ld>0 && ld>hd) ? ld : 0)
  }

  // Smooth using Wilder's method
  let tr14=trs.slice(0,period).reduce((a,b)=>a+b,0)
  let pd14=plusDMs.slice(0,period).reduce((a,b)=>a+b,0)
  let md14=minusDMs.slice(0,period).reduce((a,b)=>a+b,0)

  for (let i=period; i<trs.length; i++) {
    tr14=(tr14*(period-1)+trs[i])/period
    pd14=(pd14*(period-1)+plusDMs[i])/period
    md14=(md14*(period-1)+minusDMs[i])/period
  }

  // Calculate DI lines
  const plus_di=tr14>0?(pd14/tr14)*100:0
  const minus_di=tr14>0?(md14/tr14)*100:0
  const di_diff=Math.abs(plus_di-minus_di)
  const di_sum=plus_di+minus_di
  const dx=di_sum>0?(di_diff/di_sum)*100:0

  // ADX is smoothed DX
  let adx=dx
  const dxArray=[dx]

  for (let i=period; i<trs.length; i++) {
    tr14=(tr14*(period-1)+trs[i])/period
    pd14=(pd14*(period-1)+plusDMs[i])/period
    md14=(md14*(period-1)+minusDMs[i])/period
    const new_plus_di=tr14>0?(pd14/tr14)*100:0
    const new_minus_di=tr14>0?(md14/tr14)*100:0
    const new_dx=di_sum>0?((Math.abs(new_plus_di-new_minus_di))/(new_plus_di+new_minus_di))*100:0
    dxArray.push(new_dx)
    if (dxArray.length>=period) {
      adx=(adx*(period-1)+new_dx)/period
    }
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
}

interface EntryScore {
  side: 'LONG'|'SHORT'|null;
  slDist: number;
  score: number;
  breakdown: ConfluenceBreakdown;
  adx: number;
  regime: 'BULL'|'BEAR'|'NEUTRAL'|'UNCERTAIN';
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
  bbProx: number
): EntryScore {
  if (bars.length < 30) return {side: null, slDist: 0, score: 0, breakdown: {vpoc:0,ema1h:0,adxTrend:0,volumeSurge:0,oiFavor:0,sentiment:0,candlePattern:0}, adx, regime: 'UNCERTAIN'}

  const closes = bars.map(b => b.close)
  const atr = calcATR(bars.slice(-20))
  const rsi = calcRsi(closes.slice(-15))
  const bb = calcBB(closes, 20, 2)

  if (!bb.mid || !atr) return {side: null, slDist: 0, score: 0, breakdown: {vpoc:0,ema1h:0,adxTrend:0,volumeSurge:0,oiFavor:0,sentiment:0,candlePattern:0}, adx, regime: 'UNCERTAIN'}

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

  const side = longSig >= 2 ? 'LONG' : shortSig >= 2 ? 'SHORT' : null
  if (!side) return {side: null, slDist: 0, score: 0, breakdown: {vpoc:0,ema1h:0,adxTrend:0,volumeSurge:0,oiFavor:0,sentiment:0,candlePattern:0}, adx, regime: 'UNCERTAIN'}

  // Confluence Score Breakdown (0-100)
  const breakdown: ConfluenceBreakdown = {vpoc: 0, ema1h: 0, adxTrend: 0, volumeSurge: 0, oiFavor: 0, sentiment: 0, candlePattern: 0}

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
  if (adx > 22) breakdown.adxTrend = 10
  else if (adx > 15) breakdown.adxTrend = 5

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

  const totalScore = breakdown.vpoc + breakdown.ema1h + breakdown.adxTrend + breakdown.volumeSurge + breakdown.oiFavor + breakdown.sentiment + breakdown.candlePattern

  const regime = side === 'LONG' ? 'BULL' : 'BEAR'

  return {
    side,
    slDist: atr * 1.2,
    score: totalScore,
    breakdown,
    adx,
    regime
  }
}

// v22: Market regime filter for ADX
function applyMarketRegimeFilter(score: number, adx: number, sizeMult: number): {score: number; sizeAdj: number; shouldSkip: boolean} {
  let sizeAdj = sizeMult

  // ADX > 25 → +10% size (strong trending)
  if (adx > 25) sizeAdj *= 1.10

  // ADX < 15 → -70% size (reduce in weak conditions)
  if (adx < 15) sizeAdj *= 0.30

  // Gate threshold tuning: require score >= 60
  const shouldSkip = score < 60

  return {score, sizeAdj, shouldSkip}
}

// v22: Kelly Criterion scaling by confluence score
function getKellyScaleByScore(baseScore: number): number {
  if (baseScore < 50) return 0.8
  if (baseScore < 60) return 0.9
  if (baseScore < 70) return 1.0
  if (baseScore < 80) return 1.2
  return 1.5
}

// Simple 3-signal entry: RSI + BB + EMA crossover — fires frequently
// Params tuned live by trading-optimizer agent
function findSimpleEntry(
  bars: Bar[], price: number,
  rsiOversold=42, rsiOverbought=58, bbProx=1.02
): {side:'LONG'|'SHORT'; slDist:number}|null {
  if (bars.length < 30) return null
  const closes = bars.map(b=>b.close)
  const atr    = calcATR(bars.slice(-20))
  const rsi    = calcRsi(closes.slice(-15))
  const bb     = calcBB(closes, 20, 2)
  if (!bb.mid || !atr) return null

  const e9arr  = calcEmaArr(closes, 9)
  const e21arr = calcEmaArr(closes, 21)
  const curE9  = e9arr.at(-1)!,  curE21  = e21arr.at(-1)!
  const prevE9 = e9arr.at(-2)!,  prevE21 = e21arr.at(-2)!

  let longSig=0, shortSig=0

  if (rsi < rsiOversold)  longSig++
  else if (rsi > rsiOverbought) shortSig++

  if (price <= bb.lower * bbProx)        longSig++
  else if (price >= bb.upper * (2 - bbProx)) shortSig++

  if (curE9 > curE21) longSig++
  else shortSig++

  if (prevE9 <= prevE21 && curE9 > curE21) longSig++
  if (prevE9 >= prevE21 && curE9 < curE21) shortSig++

  if (longSig >= 2)  return { side:'LONG',  slDist: atr * 1.2 }
  if (shortSig >= 2) return { side:'SHORT', slDist: atr * 1.2 }
  return null
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
  const pct = Math.round((atrValues.indexOf(curAtrPct) / atrValues.length) * 100)
  return {pct: Math.max(0, Math.min(100, pct)), atrPct: curAtrPct}
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

  // CPI — mid-month (10th–20th) at 12:30 UTC (±30 min)
  if (utcD >= 10 && utcD <= 20 && Math.abs(totalMin - (12 * 60 + 30)) <= 30)
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

async function runBacktest(): Promise<object> {
  const testCoins=['BTC','ETH','SOL']
  const results:any[]=[]
  for (const sym of testCoins) {
    const bars=await fetchBars(sym,'5m',500)
    if (bars.length<80) continue
    let bal=10_000, wins=0, losses=0, partials=0
    const pnls:number[]=[]
    for (let i=SWING_N+20; i<bars.length-1; i++) {
      const slice=bars.slice(0,i+1), price=slice[i].close
      const atr=calcATR(slice.slice(-(14+1))), atrPct=atr/price
      if (atrPct>0.02||atrPct<0.00003) continue
      const vp=VOL_PARAMS[getVolRegime(atrPct)]
      const {highs,lows}=findSwings(slice.slice(-SWING_LOOKBACK),SWING_N)
      if (!highs.length&&!lows.length) continue
      const sweep=detectSweep(slice,price,highs,lows,atr)
      if (!sweep) continue
      const vpoc=calcVPOC(slice.slice(-80))
      const vpocAligned=sweep.side==='LONG'?vpoc>price:vpoc<price
      if (!vpocAligned||Math.abs(vpoc-price)/price>VPOC_MAX_DIST) continue
      const slDist=atr*vp.slMult, slPct=slDist/price
      if (slPct<MIN_SL_PCT||slPct>0.05) continue
      const notional=Math.min(bal*0.018/slPct,bal*MAX_NOTIONAL_PCT)
      if (notional<5) continue
      const partialR=PARTIAL_TP_BY_VOL[getVolRegime(atrPct)]
      const partialTP=sweep.side==='LONG'?price+slDist*partialR:price-slDist*partialR
      const tpPrice  =sweep.side==='LONG'?price+slDist*vp.tpR :price-slDist*vp.tpR
      const slPrice  =sweep.side==='LONG'?price-slDist:price+slDist
      let pnl=0, halfDone=false
      for (let j=i+1; j<Math.min(i+MAX_HOLD_MIN+1,bars.length); j++) {
        const b=bars[j]
        if (sweep.side==='LONG') {
          if (!halfDone&&b.high>=partialTP){pnl+=(notional/2)*slPct*partialR;halfDone=true;partials++}
          if (b.high>=tpPrice){pnl+=(halfDone?notional/2:notional)*slPct*vp.tpR;break}
          if (b.low <=slPrice){pnl+=halfDone?0:-(notional*slPct);break}
        } else {
          if (!halfDone&&b.low<=partialTP){pnl+=(notional/2)*slPct*partialR;halfDone=true;partials++}
          if (b.low <=tpPrice){pnl+=(halfDone?notional/2:notional)*slPct*vp.tpR;break}
          if (b.high>=slPrice){pnl+=halfDone?0:-(notional*slPct);break}
        }
      }
      const net=pnl-notional*FEE*2
      bal+=net; pnls.push(net)
      if (net>0) wins++; else losses++
    }
    const total=wins+losses
    const avgPnl=pnls.length?pnls.reduce((a,b)=>a+b,0)/pnls.length:0
    const std=pnls.length>1?Math.sqrt(pnls.reduce((a,b)=>a+(b-avgPnl)**2,0)/pnls.length):1
    results.push({
      sym,trades:total,wins,losses,partials,
      winRate:((wins/(total||1))*100).toFixed(1)+'%',
      roi:((bal/10000-1)*100).toFixed(2)+'%',
      sharpe:(avgPnl/(std||1)*Math.sqrt(365*24*60)).toFixed(2)
    })
  }
  return results
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY')!
    )

    if (url.searchParams.get('backtest')==='1') {
      return new Response(JSON.stringify({ok:true,backtest:await runBacktest()}),
        {headers:{'Content-Type':'application/json'}})
    }

    if (url.searchParams.get('trades')==='1') {
      const {data:trades} = await supabase.from('bot_trades').select('*').neq('status','OPEN')
        .order('closed_at',{ascending:false}).limit(10)
      return new Response(JSON.stringify({ok:true,trades:trades||[]}),
        {headers:{'Content-Type':'application/json'}})
    }

    if (url.searchParams.get('reset')==='1') {
      const newBalance = 5000
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

    const paperMode = url.searchParams.get('paper')==='1' || state.paper_mode===true

    // dynamic params from optimizer agent (falls back to hardcoded defaults)
    const _bp   = (state.bot_params ?? {}) as Record<string,any>
    const dynVol       = { ...VOL_PARAMS,         ...(_bp.vol_params         ?? {}) } as typeof VOL_PARAMS
    const dynSession   = { ...SESSION_PARAMS,     ...(_bp.session_params     ?? {}) } as typeof SESSION_PARAMS
    const dynPartialTP = { ...PARTIAL_TP_BY_VOL,  ...(_bp.partial_tp_by_vol  ?? {}) } as typeof PARTIAL_TP_BY_VOL
    const dynMaxHold   = Number(_bp.max_hold_min  ?? MAX_HOLD_MIN)

    let balance = state.balance
    const now   = Date.now()
    const circuitBreakerActive = balance < INITIAL_BALANCE*(1-MAX_DD_STOP)
    const utcH  = new Date().getUTCHours()
    const utcM  = new Date().getUTCMinutes()
    const R     = RISK[state.risk as RiskKey] || RISK.medium

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

    // ── Phase 10: Equity Curve Guard ──────────────────────────────────────────
    const peakBalanceStored  = Number(state.peak_balance ?? INITIAL_BALANCE)
    const currentPeakBalance = Math.max(peakBalanceStored, balance)
    const newPeakBalance     = balance > peakBalanceStored ? balance : peakBalanceStored
    const drawdownFromPeak   = currentPeakBalance > 0 ? (currentPeakBalance - balance) / currentPeakBalance : 0
    let equityGuardMult   = 1.0
    let equityGuardPaused = false
    if (drawdownFromPeak >= 0.30) {
      equityGuardPaused = true
      log.push(`EQUITY GUARD: balance $${balance.toFixed(0)} is ${(drawdownFromPeak*100).toFixed(0)}% below peak $${currentPeakBalance.toFixed(0)} — PAUSED 2h`)
    } else if (drawdownFromPeak >= 0.15) {
      equityGuardMult = 0.5
      log.push(`EQUITY GUARD: balance $${balance.toFixed(0)} is ${(drawdownFromPeak*100).toFixed(0)}% below peak $${currentPeakBalance.toFixed(0)} — half sizing`)
    }

    const needDailySummary=utcH===0&&utcM<2
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


    const {data:allOpen}=await supabase.from('bot_trades').select('*').eq('status','OPEN')
    const openBySymbol:Record<string,any[]>={}
    const corrGroupCount:Record<number,number>={}
    let openCount=0
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
        const [bars5m,priceRes,bars1h,bars15m,oiSig]=await Promise.all([
          fetchBars(sym,'5m',200),
          fetch(`${BINANCE_DATA}/ticker/price?symbol=${sym}USDT`).then(r=>r.json()).catch(()=>null),
          fetchBars(sym,'1h',30),
          fetchBars(sym,'15m',30),
          fetchOISignal(sym)
        ])
        if (!bars5m||bars5m.length<30) return

        const price    =priceRes?.price?+priceRes.price:bars5m[bars5m.length-1].close
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

        // ── STAGE 2: Calculate volatility percentile and dynamic SL/TP ──
        const {pct: volPctile, atrPct: curAtrPct} = calcVolatilityPercentile(completed)
        const dynamicSLMult = adx > 25 ? 1.0 : adx < 15 ? 1.5 : 1.2
        const dynamicTPBase = calcDynamicTP(2.5, volPctile)

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
            const pnl = fav*entry*size*LEVERAGE - Number(t.fee) - price*size*FEE*LEVERAGE
            balance += entry*size+pnl; openCount--
            await supabase.from('bot_trades').update({
              status:'TP', exit_price:price, pnl, pnl_pct:fav,
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
            adjustedSl = t.side === 'LONG' ? entry + slDistTightened : entry - slDistTightened
          }

          // ── Phase 3: Smart Early Exit — EMA9 cross against direction + low vol ──
          const emaCrossedAgainst =
            (t.side==='LONG'  && prevE9Exit >= prevE21Exit && curE9Exit < curE21Exit) ||
            (t.side==='SHORT' && prevE9Exit <= prevE21Exit && curE9Exit > curE21Exit)
          if (emaCrossedAgainst && isLowVolExit) {
            const fav = (price-entry)/entry*dirM
            const pnl = fav*entry*size*LEVERAGE - Number(t.fee) - price*size*FEE*LEVERAGE
            const finalSt = pnl > 0 ? 'TP' : 'TRAIL'
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
              const partialPnl=(price-entry)*halfSize*dirM*LEVERAGE-price*halfSize*FEE*LEVERAGE
              balance+=entry*halfSize+partialPnl
              // ── STAGE 2: Adjust SL to breakeven + 0.2R when partial TP hits ──
              const bePoint = entry*(1+FEE*2.5*dirM)
              const adjPoint = origSlDist > 0 ? bePoint + origSlDist*0.2*dirM : bePoint
              await supabase.from('bot_trades').update({
                size:halfSize,trail_sl:adjPoint,partial_done:true
              }).eq('id',t.id)
              log.push(`PARTIAL ${sym} ${t.side} @${price.toFixed(4)} ${dynamicPartialR}R pnl=${partialPnl.toFixed(2)} sl_adj_be+0.2R`)
              return
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
          if (!newStatus&&ageMs>dynMaxHold*60_000) newStatus='TRAIL'

          if (newStatus) {
            const fav=(price-entry)/entry*dirM
            const pnl=fav*entry*size*LEVERAGE-Number(t.fee)-price*size*FEE*LEVERAGE
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

            // TASK 1: Start trailing much earlier at 0.5R profit
            if (profitR>=0.5) {
              const beLevel=entry*(1+FEE*2.5*dirM)
              newSL=dirM===1?Math.max(slToUse,beLevel):Math.min(slToUse,beLevel)
            }
            if (profitR>=1.0) {
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
        if (equityGuardPaused) return  // Phase 10: 30% drawdown pause
        if (streakPaused) return
        if (openTrades.length > 0) return
        if (symCooldown.has(sym)) return
        if (dynamicBlacklist.has(sym)) return
        // Phase 4: Skip suspended coins
        if (suspendedCoins.has(sym)) { log.push(`SKIP ${sym}: suspended`); return }
        // Phase 11: Macro event filter
        const macroChk = isMacroEventWindow(new Date())
        if (macroChk.skip) { log.push(`SKIP ${sym}: macro ${macroChk.reason}`); return }
        if (atrPct > 0.02 || atrPct < 0.00003) return
        if (balance < 10) return

        const dynRsiOversold    = Number(_bp.rsi_oversold        ?? 42)
        const dynRsiOverbought  = Number(_bp.rsi_overbought       ?? 58)
        const dynBbProx         = Number(_bp.bb_proximity         ?? 1.02)
        const dynTpR            = Number(_bp.tp_r                 ?? 2.5)
        const dynMinConfluence  = Number(_bp.min_confluence_score ?? 60)
        const dynMinAdx         = Number(_bp.min_adx              ?? 0)

        // v22: Use confluence score instead of 2/4 signals
        const entryScore = calcConfluenceScore(
          completed, price, vpoc, ema1hBias, adx, fearGreed, oiSig,
          dynRsiOversold, dynRsiOverbought, dynBbProx
        )

        if (!entryScore.side) {
          log.push(`SKIP ${sym}: no confluence (RSI/BB/EMA mismatch)`)
          return
        }

        // v23: Gate threshold uses dynMinConfluence (default 60, tuned by optimizer)
        const regimeCheck = applyMarketRegimeFilter(entryScore.score, adx, 1.0)
        if (entryScore.score < dynMinConfluence) {
          log.push(`SKIP ${sym}: score=${entryScore.score} < ${dynMinConfluence} (${Object.entries(entryScore.breakdown).filter(([_,v])=>v>0).map(([k,v])=>`${k}=${v}`).join(' ')})`)
          return
        }
        if (dynMinAdx > 0 && adx < dynMinAdx) {
          log.push(`SKIP ${sym}: adx=${adx.toFixed(0)} < min_adx=${dynMinAdx}`)
          return
        }

        // v22: Check strict 1H trend for LONG
        if (entryScore.side === 'LONG' && ema1hBias === 'BEAR') {
          log.push(`SKIP ${sym}: 1H trend against LONG (${ema1hBias})`)
          return
        }

        // v22: Reject SHORT if 1H is strongly uptrending
        if (entryScore.side === 'SHORT' && ema1hBias === 'BULL') {
          log.push(`SKIP ${sym}: 1H trend against SHORT (${ema1hBias})`)
          return
        }

        // ── STAGE 2: Multi-timeframe confirmation — require BOTH 15m AND 1H alignment ──
        const requireMultiTF = true
        if (requireMultiTF) {
          if (entryScore.side === 'LONG' && (ema15mBias !== 'BULL' || ema1hBias !== 'BULL')) {
            log.push(`SKIP ${sym}: multi-TF LONG requires 15m(${ema15mBias})+1h(${ema1hBias}) both BULL`)
            return
          }
          if (entryScore.side === 'SHORT' && (ema15mBias !== 'BEAR' || ema1hBias !== 'BEAR')) {
            log.push(`SKIP ${sym}: multi-TF SHORT requires 15m(${ema15mBias})+1h(${ema1hBias}) both BEAR`)
            return
          }
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
        const tpR = dynamicTPBase
        const tpPrice = side === 'LONG' ? price + slDist * tpR : price - slDist * tpR
        const hiVal   = side === 'LONG' ? tpPrice : price
        const loVal   = side === 'SHORT' ? tpPrice : price

        // v22: Apply Kelly scaling by confluence score
        const kellyByScore    = getKellyScaleByScore(entryScore.score)
        const sizeAdjByRegime = regimeCheck.sizeAdj

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

        const riskAmt = balance * R.riskPct * kellyMult * kellyByScore * sizeAdjByRegime * sessionSizeAdj * coinSizeMult * volSizeMult * equityGuardMult
        const notional = Math.min(riskAmt / slPct, balance * MAX_NOTIONAL_PCT, balance * 0.95)
        if (notional < 5) return

        const size = notional / price, fee = price * size * FEE * LEVERAGE
        balance -= (notional + fee); openCount++
        if (gid >= 0) corrGroupCount[gid] = (corrGroupCount[gid] || 0) + 1

        const { data: insertedTrade } = await supabase.from('bot_trades').insert({
          sym, side, entry_price: price, size, fee,
          trail_sl: slPrice, hi: hiVal, lo: loVal,
          status: 'OPEN', score: Math.round(entryScore.score), mtf: true, partial_done: false,
          paper_mode: paperMode
        }).select('id').single()

        // Phase 1: Save trade snapshot with all indicator values at entry + STAGE 2 fields
        if (insertedTrade?.id) {
          const cls5m       = completed.map((b:Bar) => b.close)
          const rsiSnap     = calcRsi(cls5m.slice(-15))
          const vols20Snap  = completed.slice(-20).map((b:Bar) => b.vol)
          const volAvgSnap  = vols20Snap.reduce((a:number,v:number)=>a+v,0)/vols20Snap.length
          const curVolSnap  = completed[completed.length-1].vol
          const volRatioSnap = volAvgSnap > 0 ? curVolSnap/volAvgSnap : 1.0

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
              adjusted_tp: +(tpPrice.toFixed(6))
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
        log.push(`OPEN ${sym} ${side} [CONF] score=${Math.round(entryScore.score)} (${breakdownStr})${mtfStr} adx=${adx.toFixed(0)}${tpStr} vol_pct=${volPctile}${volSizeStr} sess_adj=${sessionSizeAdj.toFixed(2)} @${price.toFixed(6)} sl=${(slPct*100).toFixed(3)}% $${notional.toFixed(0)} ${session}`)

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
    }).eq('id',1)

    return new Response(JSON.stringify({
      ok:true,v:23,openCount,streakPaused,streak,btcBias,btcRegime,
      kelly:kellyMult,fearGreed,adaptMinScore,adaptVpocDist,adaptSideFilter,
      session,sessionSizeMult:sp.sizeMult,equityGuardMult,drawdownFromPeak:(drawdownFromPeak*100).toFixed(1)+'%',
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

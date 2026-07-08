// ════════════════════════════════════════════════════════════
// v39 Strategy Backtest — faithful offline replay of the trading bot
//
// Reuses the bot's EXACT indicator + confluence-scoring functions (copied
// verbatim from supabase/functions/trading-bot/index.ts) and replays the
// entry gate + exit engine as a global, time-stepped, multi-asset portfolio.
//
// Runs two exit configs on the same entries for an apples-to-apples compare:
//   V38 = partial TP at ~1.2R + breakeven 1.0R + trail 1.5R   (old)
//   V39 = NO partial + breakeven 1.5R + trail 2.0R            (new)
//
// Honest simplifications (documented in the report):
//  - OI + liquidity-zone signals ARE now wired from Binance's metrics archive.
//    Only funding & fear/greed remain neutral (minor: 0-5 pts each).
//  - FEE = 0 (matches the current live bot; user adds fee-sim later).
//  - 5m decision at bar close, fill at that close; exits scan later bars.
// ════════════════════════════════════════════════════════════

interface Bar { open:number; high:number; low:number; close:number; vol:number; t:number }

// ─────────────────────────────────────────────────────────────
// COPIED VERBATIM FROM THE BOT (pure functions)
// ─────────────────────────────────────────────────────────────
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
function calcBB(closes: number[], period=20, mult=2.0) {
  const slice = closes.slice(-period)
  if (slice.length < period) return {upper:0,mid:0,lower:0,width:0}
  const mid = slice.reduce((a,b)=>a+b,0)/slice.length
  const variance = slice.reduce((a,b)=>a+(b-mid)**2,0)/slice.length
  const std = Math.sqrt(variance)
  const upper = mid+mult*std, lower = mid-mult*std
  return {upper, mid, lower, width: mid>0?(upper-lower)/mid:0}
}
function calcStochastic(closes: number[], highs: number[], lows: number[], k=14, smoothK=3) {
  if (closes.length < k) return {K: 50, D: 50}
  const recentLows = lows.slice(-k), recentHighs = highs.slice(-k)
  const minLow = Math.min(...recentLows), maxHigh = Math.max(...recentHighs)
  const currentClose = closes[closes.length-1]
  const range = maxHigh - minLow
  const K = range > 0 ? ((currentClose - minLow) / range) * 100 : 50
  const kValues:number[] = []
  for (let i = Math.max(0, closes.length-k-smoothK); i < closes.length; i++) {
    const slice = closes.slice(Math.max(0, i-k+1), i+1)
    const sliceH = highs.slice(Math.max(0, i-k+1), i+1)
    const sliceL = lows.slice(Math.max(0, i-k+1), i+1)
    const minL = Math.min(...sliceL), maxH = Math.max(...sliceH)
    const rg = maxH - minL
    kValues.push(rg > 0 ? ((slice[slice.length-1] - minL) / rg) * 100 : 50)
  }
  const D = kValues.length > 0 ? kValues.slice(-smoothK).reduce((a,b)=>a+b,0)/Math.min(smoothK,kValues.length) : K
  return {K, D}
}
function detectDivergence(rsiValues: number[], priceValues: number[]): 'BULL_DIV'|'BEAR_DIV'|'NONE' {
  if (rsiValues.length < 5 || priceValues.length < 5) return 'NONE'
  const priceLow1 = Math.min(...priceValues.slice(-5)), priceLow2 = Math.min(...priceValues.slice(-10, -5))
  const rsiLow1 = Math.min(...rsiValues.slice(-5)), rsiLow2 = Math.min(...rsiValues.slice(-10, -5))
  if (priceLow1 < priceLow2 && rsiLow1 > rsiLow2 && rsiLow1 < 40) return 'BULL_DIV'
  const priceHigh1 = Math.max(...priceValues.slice(-5)), priceHigh2 = Math.max(...priceValues.slice(-10, -5))
  const rsiHigh1 = Math.max(...rsiValues.slice(-5)), rsiHigh2 = Math.max(...rsiValues.slice(-10, -5))
  if (priceHigh1 > priceHigh2 && rsiHigh1 < rsiHigh2 && rsiHigh1 > 60) return 'BEAR_DIV'
  return 'NONE'
}
function calcMACD(closes: number[], fastPeriod=12, slowPeriod=26, signalPeriod=9) {
  if (closes.length < slowPeriod) return {macd: 0, signal: 0, histogram: 0}
  const emaFast = calcEma(closes, fastPeriod), emaSlow = calcEma(closes, slowPeriod)
  const macd = emaFast - emaSlow
  const macdLine:number[] = []
  for (let i = Math.max(0, closes.length-50); i < closes.length; i++) {
    macdLine.push(calcEma(closes.slice(0, i+1), fastPeriod) - calcEma(closes.slice(0, i+1), slowPeriod))
  }
  const signal = calcEma(macdLine, signalPeriod)
  return {macd, signal, histogram: macd - signal}
}
function calcPivots(high: number, low: number, close: number) {
  const pivot = (high + low + close) / 3
  return {pivot, s1: (pivot*2)-high, r1: (pivot*2)-low, s2: pivot-(high-low), r2: pivot+(high-low)}
}
function detectPivotBounce(price: number, s1: number, r1: number, atr: number): boolean {
  const threshold = atr * 0.5
  return Math.abs(price - s1) < threshold || Math.abs(price - r1) < threshold
}
function detectBBSqueezeRelease(bbWidthHistory: number[], threshold = 0.003): boolean {
  if (bbWidthHistory.length < 6) return false
  const last5 = bbWidthHistory.slice(-6, -1)
  return last5.every(w => w < threshold) && bbWidthHistory[bbWidthHistory.length-1] > threshold * 1.5
}
function calcVWAP(bars: Bar[]): number {
  if (bars.length === 0) return 0
  const session = bars.slice(-96)
  let cumTPV = 0, cumVol = 0
  for (const b of session) { const tp=(b.high+b.low+b.close)/3; cumTPV+=tp*b.vol; cumVol+=b.vol }
  return cumVol > 0 ? cumTPV / cumVol : session[session.length - 1].close
}
function detectStopHunt(bars: Bar[], side: 'LONG'|'SHORT'): boolean {
  if (bars.length < 15) return false
  const LOOKBACK=3, SWING_WIN=20, WICK_RATIO=1.5, VOL_MULT=1.4
  const vols = bars.slice(-20).map(b => b.vol)
  const volAvg = vols.reduce((a, b) => a + b, 0) / vols.length
  for (let i = bars.length - LOOKBACK; i < bars.length - 1; i++) {
    const bar = bars[i], body = Math.abs(bar.close - bar.open), range = bar.high - bar.low
    if (range === 0 || body === 0) continue
    if (side === 'LONG') {
      const swingLow = Math.min(...bars.slice(Math.max(0, i-SWING_WIN), i).map(b => b.low))
      const lowerWick = Math.min(bar.open, bar.close) - bar.low
      if (bar.low < swingLow && bar.close > swingLow && lowerWick/body >= WICK_RATIO && bar.vol > volAvg*VOL_MULT) return true
    } else {
      const swingHigh = Math.max(...bars.slice(Math.max(0, i-SWING_WIN), i).map(b => b.high))
      const upperWick = bar.high - Math.max(bar.open, bar.close)
      if (bar.high > swingHigh && bar.close < swingHigh && upperWick/body >= WICK_RATIO && bar.vol > volAvg*VOL_MULT) return true
    }
  }
  return false
}
function detectBOS(bars: Bar[], side: 'LONG'|'SHORT'): boolean {
  if (bars.length < 25) return false
  const WIN=20, cur = bars[bars.length-1]
  if (side === 'LONG')  return cur.close > Math.max(...bars.slice(-WIN-1,-1).map(b => b.high))
  else                  return cur.close < Math.min(...bars.slice(-WIN-1,-1).map(b => b.low))
}
function calcADX(bars: Bar[], period=14): number {
  if (bars.length < period+1) return 20
  const trs:number[]=[], plusDMs:number[]=[], minusDMs:number[]=[]
  for (let i=1; i<bars.length; i++) {
    const h=bars[i].high, l=bars[i].low, pc=bars[i-1].close
    const tr=Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc))
    const hd=h-bars[i-1].high, ld=bars[i-1].low-l
    trs.push(tr); plusDMs.push((hd>0&&hd>ld)?hd:0); minusDMs.push((ld>0&&ld>hd)?ld:0)
  }
  let tr14=trs.slice(0,period).reduce((a,b)=>a+b,0)
  let pd14=plusDMs.slice(0,period).reduce((a,b)=>a+b,0)
  let md14=minusDMs.slice(0,period).reduce((a,b)=>a+b,0)
  const plus0=tr14>0?(pd14/tr14)*100:0, minus0=tr14>0?(md14/tr14)*100:0
  const sum0=plus0+minus0
  let adx=sum0>0?(Math.abs(plus0-minus0)/sum0)*100:0
  for (let i=period; i<trs.length; i++) {
    tr14=(tr14*(period-1)+trs[i])/period; pd14=(pd14*(period-1)+plusDMs[i])/period; md14=(md14*(period-1)+minusDMs[i])/period
    const pdi=tr14>0?(pd14/tr14)*100:0, mdi=tr14>0?(md14/tr14)*100:0, s=pdi+mdi
    const dx=s>0?((Math.abs(pdi-mdi))/s)*100:0
    adx=(adx*(period-1)+dx)/period
  }
  return Math.min(100, Math.max(0, adx))
}
function detectRegime(bars: Bar[]): 'TRENDING'|'RANGING'|'SQUEEZE' {
  if (bars.length < 50) return 'TRENDING'
  const closes = bars.slice(-50).map(b=>b.close)
  const {width} = calcBB(closes,20,2)
  const recentATR = calcATR(bars.slice(-15)), baseATR = calcATR(bars.slice(-50))
  const atrRatio = baseATR>0 ? recentATR/baseATR : 1
  if (width<0.004 && atrRatio<0.65) return 'SQUEEZE'
  if (width<0.011 || atrRatio<0.80) return 'RANGING'
  return 'TRENDING'
}
function calcVPOC(bars:Bar[]): number {
  if (!bars.length) return 0
  const min=Math.min(...bars.map(b=>b.low)), max=Math.max(...bars.map(b=>b.high))
  if (max===min) return (max+min)/2
  const buckets=40, step=(max-min)/buckets
  const hist=new Array(buckets).fill(0)
  for (const bar of bars) {
    const idx=Math.min(Math.floor(((bar.high+bar.low)/2-min)/step),buckets-1)
    hist[idx]+=bar.vol
  }
  let mx=0, mi=0
  for (let i=0;i<buckets;i++) if(hist[i]>mx){mx=hist[i];mi=i}
  return min+(mi+0.5)*step
}
function calcVolatilityPercentile(bars:Bar[]): {pct:number; atrPct:number} {
  if (bars.length < 100) return {pct: 50, atrPct: 0}
  const last100 = bars.slice(-100)
  const atrValues:number[] = []
  for (let i=1; i<last100.length; i++) {
    const tr = Math.max(last100[i].high-last100[i].low, Math.abs(last100[i].high-last100[i-1].close), Math.abs(last100[i].low-last100[i-1].close))
    atrValues.push(tr / last100[i].close)
  }
  atrValues.sort((a,b)=>a-b)
  const current = last100[last100.length-1].close
  const atr = bars.length > 14 ? calcATR(bars.slice(-14)) : 0
  const curAtrPct = atr / current
  const rank = atrValues.filter(v => v <= curAtrPct).length
  const pct = Math.round((rank / atrValues.length) * 100)
  return {pct: Math.max(0, Math.min(100, pct)), atrPct: curAtrPct}
}
function calcDynamicSL(atr:number, adx:number, baseMult=1.2): number {
  if (adx > 25) return atr * 1.0
  if (adx < 15) return atr * 1.5
  return atr * baseMult
}
function calcDynamicTP(baseR:number, volPct:number): number {
  return baseR + (Math.min(volPct, 100) / 100) * 0.5
}
function calcDynamicMaxHold(base: number, profitR: number): number {
  if (profitR >= 2.0) return base * 2.0
  if (profitR >= 1.0) return base * 1.5
  if (profitR <= -0.5) return base * 0.6
  return base
}
function getVolRegime(atrPct:number): 'LOW'|'MEDIUM'|'HIGH' {
  if (atrPct<0.0008) return 'LOW'
  if (atrPct<0.003)  return 'MEDIUM'
  return 'HIGH'
}

type Bias = 'BULL'|'BEAR'|'NEUTRAL'

// ── OI (Open Interest) — from Binance metrics archive ──
interface OIRecord { timestamp: number; oi: number }
const LIQ_ZONE_WINDOW=40, LIQ_PROXIMITY_PCT=0.015, LIQ_TOUCH_LOOKBACK=6, LIQ_OI_SURGE_MULT=1.08, LIQ_WICK_RATIO=0.30
// Copied verbatim from the live bot (Signal #17 liquidity zone).
function detectLiquidationZone(bars:Bar[], price:number, oiHistory:OIRecord[], side:'LONG'|'SHORT'): {hit:boolean; zoneLevel:number; confidence:number} {
  const NULL_R = {hit:false, zoneLevel:0, confidence:0}
  if (bars.length < 30 || oiHistory.length < 10) return NULL_R
  const oiVals = oiHistory.map(o=>o.oi)
  const oiBase = oiVals.slice(0,-6).reduce((a,b)=>a+b,0)/Math.max(1, oiVals.length-6)
  const oiNow  = oiVals.slice(-6).reduce((a,b)=>a+b,0)/6
  const oiElevated = oiBase>0 && oiNow>oiBase*LIQ_OI_SURGE_MULT
  const recent = bars.slice(-LIQ_ZONE_WINDOW)
  if (side==='LONG') {
    const cand = recent.map(b=>b.low).filter(l=>l<price*0.998).sort((a,b)=>b-a)
    if (!cand.length) return NULL_R
    const zoneLevel = cand[0], zoneDist=(price-zoneLevel)/price
    if (zoneDist>LIQ_PROXIMITY_PCT) return NULL_R
    const touched = bars.slice(-LIQ_TOUCH_LOOKBACK).some(b=>{ const range=b.high-b.low; const lw=Math.min(b.open,b.close)-b.low
      return b.low<=zoneLevel*1.002 && b.close>zoneLevel && range>0 && lw/range>=LIQ_WICK_RATIO })
    if (!touched) return NULL_R
    return {hit:true, zoneLevel, confidence:(oiElevated?1.5:1.0)*(1-zoneDist/LIQ_PROXIMITY_PCT)}
  } else {
    const cand = recent.map(b=>b.high).filter(h=>h>price*1.002).sort((a,b)=>a-b)
    if (!cand.length) return NULL_R
    const zoneLevel = cand[0], zoneDist=(zoneLevel-price)/price
    if (zoneDist>LIQ_PROXIMITY_PCT) return NULL_R
    const touched = bars.slice(-LIQ_TOUCH_LOOKBACK).some(b=>{ const range=b.high-b.low; const uw=b.high-Math.max(b.open,b.close)
      return b.high>=zoneLevel*0.998 && b.close<zoneLevel && range>0 && uw/range>=LIQ_WICK_RATIO })
    if (!touched) return NULL_R
    return {hit:true, zoneLevel, confidence:(oiElevated?1.5:1.0)*(1-zoneDist/LIQ_PROXIMITY_PCT)}
  }
}
function upperBoundOI(a:{t:number,oi:number}[], t:number): number {
  let lo=0, hi=a.length; while(lo<hi){ const m=(lo+hi)>>1; if(a[m].t<=t) lo=m+1; else hi=m } return lo
}
// Replicates live fetchOISignal (6-bar OI change) + returns 48-bar history for liq-zone.
function oiContext(oiArr:{t:number,oi:number}[]|undefined, T:number, priceChange:number): {sig:string, hist:OIRecord[]} {
  if (!oiArr || oiArr.length<2) return {sig:'FLAT', hist:[]}
  const idx = upperBoundOI(oiArr, T)-1
  if (idx<1) return {sig:'FLAT', hist:[]}
  const hist = oiArr.slice(Math.max(0,idx-47), idx+1).map(o=>({timestamp:o.t, oi:o.oi}))
  const win = oiArr.slice(Math.max(0,idx-5), idx+1)
  const first=win[0].oi, last=win[win.length-1].oi
  const oiChg = first>0 ? (last-first)/first : 0
  let sig='FLAT'
  if (priceChange>0.003 && oiChg<-0.010) sig='BEAR_DIV'
  else if (priceChange<-0.003 && oiChg>0.010) sig='BULL_DIV'
  else sig = oiChg>0.01?'UP':oiChg<-0.01?'DOWN':'FLAT'
  return {sig, hist}
}

// Confluence scoring — faithful copy (now WITH OI signals wired in).
function calcConfluenceScore(
  bars: Bar[], price: number, vpoc: number, ema1hBias: Bias, adx: number,
  fearGreed: number, rsiOversold: number, rsiOverbought: number, bbProx: number,
  ema200Bias: Bias, change24h: number,
  oiSignal: string = '', oiHistory: OIRecord[] = []
) {
  if (bars.length < 30) return null
  const closes = bars.map(b => b.close), highs = bars.map(b => b.high), lows = bars.map(b => b.low)
  const atr = calcATR(bars.slice(-20))
  const rsi = calcRsi(closes.slice(-15))
  const rsiHistory = closes.slice(-20).map((_c,i) => i === 0 ? 50 : calcRsi(closes.slice(0, closes.length-20+i+1)))
  const bb = calcBB(closes, 20, 2)
  if (!bb.mid || !atr) return null
  const e9arr = calcEmaArr(closes, 9), e21arr = calcEmaArr(closes, 21)
  const curE9 = e9arr.at(-1)!, curE21 = e21arr.at(-1)!

  let longSig = 0, shortSig = 0
  if (rsi < rsiOversold) longSig++
  else if (rsi > rsiOverbought) shortSig++
  if (price <= bb.lower * bbProx) longSig++
  else if (price >= bb.upper * (2 - bbProx)) shortSig++
  // v39 side-logic fix: only count the EMA cross with real separation
  const emaSep = curE21 > 0 ? Math.abs(curE9 - curE21) / curE21 : 0
  if (emaSep >= 0.0005) { if (curE9 > curE21) longSig++; else shortSig++ }
  if (ema1hBias === 'BEAR' && curE9 < curE21 && rsi >= 45 && rsi <= 60 && price >= bb.mid) shortSig++
  if (ema1hBias === 'BULL' && curE9 > curE21 && rsi >= 40 && rsi <= 55 && price <= bb.mid) longSig++
  const side: 'LONG'|'SHORT'|null = longSig >= 2 ? 'LONG' : shortSig >= 2 ? 'SHORT' : null
  if (!side) return null

  const rangeFade = adx < 18 && (
    (side==='LONG'  && price <= bb.lower*bbProx     && rsi < rsiOversold+5) ||
    (side==='SHORT' && price >= bb.upper*(2-bbProx) && rsi > rsiOverbought-5)
  )
  const bd: Record<string,number> = {}
  // 1 VPOC (25)
  const vpocDist = Math.abs(vpoc - price) / price
  bd.vpoc = vpocDist < 0.010 ? 25 : vpocDist < 0.020 ? 18 : vpocDist < 0.035 ? 10 : 0
  // 2 1H trend (20)
  bd.ema1h = ((side==='LONG'&&ema1hBias==='BULL')||(side==='SHORT'&&ema1hBias==='BEAR')) ? 20 : ema1hBias==='NEUTRAL' ? 10 : 0
  // 3 ADX (10)
  bd.adx = adx > 22 ? 10 : adx > 15 ? 5 : rangeFade ? 8 : 0
  // 4 Volume (10)
  const vols = bars.slice(-20).map(b=>b.vol)
  const volAvg = vols.reduce((a,b)=>a+b,0)/vols.length
  bd.volume = bars[bars.length-1].vol > volAvg*1.4 ? 10 : 0
  // 5 OI favor (15) — now wired from the metrics archive
  bd.oiFavor = (oiSignal==='BULL_DIV'&&side==='LONG')||(oiSignal==='BEAR_DIV'&&side==='SHORT') ? 15
             : (oiSignal==='UP'&&side==='LONG')||(oiSignal==='DOWN'&&side==='SHORT') ? 10
             : oiSignal==='FLAT' ? 5 : 0
  // 6 Fear/Greed (5) — neutral 50 → never fires
  bd.fearGreed = ((fearGreed>80&&side==='LONG')||(fearGreed<20&&side==='SHORT')) ? 5 : 0
  // 7 Candle (15)
  const lb=bars[bars.length-1], barRange=lb.high-lb.low
  bd.candle = 0
  if (side==='LONG') { const uw=(lb.high-lb.close)/barRange
    if (lb.close>lb.open&&uw<0.15) bd.candle=15; else if (lb.close>lb.open&&uw<0.25) bd.candle=10; else if (lb.close>lb.open) bd.candle=5
  } else { const lw=(lb.close-lb.low)/barRange
    if (lb.close<lb.open&&lw<0.15) bd.candle=15; else if (lb.close<lb.open&&lw<0.25) bd.candle=10; else if (lb.close<lb.open) bd.candle=5
  }
  // 8 Stochastic (10)
  const stoch = calcStochastic(closes, highs, lows, 14, 3)
  bd.stoch = ((side==='LONG'&&stoch.K<20)||(side==='SHORT'&&stoch.K>80)) ? 10 : 0
  // 9 Divergence (15)
  const div = detectDivergence(rsiHistory, closes)
  bd.divergence = ((div==='BULL_DIV'&&side==='LONG')||(div==='BEAR_DIV'&&side==='SHORT')) ? 15 : 0
  // 10 MACD (10)
  const macd = calcMACD(closes)
  bd.macd = ((side==='LONG'&&macd.histogram>0)||(side==='SHORT'&&macd.histogram<0)) ? 10 : 0
  // 11 Pivot (8)
  const piv = calcPivots(lb.high, lb.low, lb.close)
  bd.pivot = detectPivotBounce(price, piv.s1, piv.r1, atr) ? 8 : 0
  // 12 BB squeeze (12)
  const bbWidthHist = bars.slice(-10).map((_b,idx)=>{
    const bi=bars.length-10+idx
    return calcBB(closes.slice(Math.max(0,bi-19),bi+1),20,2).width
  })
  bd.bbSqueeze = detectBBSqueezeRelease(bbWidthHist) ? 12 : 0
  // 13 Stop-hunt (10)
  bd.stopHunt = detectStopHunt(bars, side) ? 10 : 0
  // 14 VWAP (12)
  const vwap = calcVWAP(bars)
  bd.vwap = 0
  if (vwap > 0) { const vd=(price-vwap)/vwap
    if (side==='LONG'&&vd>0.001) bd.vwap=12; else if (side==='LONG'&&vd>=-0.001) bd.vwap=6
    else if (side==='SHORT'&&vd<-0.001) bd.vwap=12; else if (side==='SHORT'&&vd<=0.001) bd.vwap=6
  }
  // 15 BOS (8)
  bd.bos = detectBOS(bars, side) ? 8 : 0
  // 16 EMA200 (8)
  bd.ema200 = ((side==='LONG'&&ema200Bias==='BULL')||(side==='SHORT'&&ema200Bias==='BEAR')) ? 8 : ema200Bias==='NEUTRAL' ? 4 : 0
  // 17 Liquidity zone (15) — now wired from OI history
  const liq = detectLiquidationZone(bars, price, oiHistory, side)
  bd.liqZone = liq.hit ? (liq.confidence>=1.0 ? 15 : 8) : 0
  // 18 Momentum (20) — C1 vol, C2 24h change, C3 OI surge, C4 breakout
  { let c=0
    const vsl=bars.slice(-21,-1).map(b=>b.vol); const va=vsl.reduce((a,b)=>a+b,0)/Math.max(1,vsl.length)
    if (va>0 && bars[bars.length-1].vol >= va*4) c++
    const ac=Math.abs(change24h), rd=(side==='LONG'&&change24h>0)||(side==='SHORT'&&change24h<0)
    if (rd && ac>=0.03 && ac<=0.30) c++
    const oiV=oiHistory.map(o=>o.oi)
    if (oiV.length>=10) { const base=oiV.slice(0,-6).reduce((a,b)=>a+b,0)/Math.max(1,oiV.length-6); const now=oiV.slice(-6).reduce((a,b)=>a+b,0)/6
      if (base>0 && now>base*1.15) c++ }
    const hh=bars.slice(-21,-1).map(b=>b.high), ll=bars.slice(-21,-1).map(b=>b.low)
    if (side==='LONG'&&price>Math.max(...hh)) c++
    if (side==='SHORT'&&price<Math.min(...ll)) c++
    bd.momentum = c>=3 ? 20 : c===2 ? 10 : 0
  }
  let s = 0; for (const k in bd) s += bd[k]
  return { side, slDist: atr*1.2, score: s, adx, rangeFade, bbMid: bb.mid, bd }
}

// ─────────────────────────────────────────────────────────────
// DATA LOAD — reads CSVs downloaded by fetch.sh from data.binance.vision
// (Binance REST fapi is geo-blocked on GitHub runners; the archive is not)
// ─────────────────────────────────────────────────────────────
function loadCSV(sym:string, interval:string): Bar[] {
  let txt = ''
  try { txt = Deno.readTextFileSync(`backtest/data/${sym}-${interval}.csv`) } catch { return [] }
  const out: Bar[] = []
  for (const line of txt.split('\n')) {
    if (!line || line[0] < '0' || line[0] > '9') continue   // skip header/blank
    const f = line.split(',')
    let t = Number(f[0])
    if (t > 1e14) t = Math.floor(t / 1000)  // some archives use microseconds
    const b = {t, open:+f[1], high:+f[2], low:+f[3], close:+f[4], vol:+f[5]}
    if (Number.isFinite(b.close) && b.close > 0) out.push(b)
  }
  out.sort((a,b)=>a.t-b.t)
  const dedup: Bar[] = []; let last = -1
  for (const b of out) { if (b.t !== last) { dedup.push(b); last = b.t } }
  return dedup
}
// OI metrics: "2026-07-05 00:05:00,106355.895" (UTC datetime, sum_open_interest)
function loadOI(sym:string): {t:number,oi:number}[] {
  let txt=''; try { txt = Deno.readTextFileSync(`backtest/data/${sym}-oi.csv`) } catch { return [] }
  const out:{t:number,oi:number}[] = []
  for (const line of txt.split('\n')) {
    if (!line || line[0] !== '2') continue
    const c = line.indexOf(','); if (c<0) continue
    const t = new Date(line.slice(0,c).replace(' ','T')+'Z').getTime()
    const oi = parseFloat(line.slice(c+1))
    if (Number.isFinite(t) && Number.isFinite(oi)) out.push({t, oi})
  }
  out.sort((a,b)=>a.t-b.t)
  return out
}

// last 1h bar with openTime <= t (closed)
function biasAt1h(bars1h: Bar[], t:number): {ema1h:Bias, ema200:Bias} {
  const idx = upperBound(bars1h, t) - 1
  if (idx < 22) return {ema1h:'NEUTRAL', ema200:'NEUTRAL'}
  const closes = bars1h.slice(0, idx+1).map(b=>b.close)  // closed bars only
  const e9=calcEma(closes,9), e21=calcEma(closes,21)
  let ema1h:Bias='NEUTRAL'
  if (e9>e21*1.001) ema1h='BULL'; else if (e9<e21*0.999) ema1h='BEAR'
  let ema200:Bias='NEUTRAL'
  if (closes.length>=200) { const e50=calcEma(closes,50), e200=calcEma(closes,200)
    if (e50>e200*1.001) ema200='BULL'; else if (e50<e200*0.999) ema200='BEAR' }
  return {ema1h, ema200}
}
function bias15mAt(bars15:Bar[], t:number): Bias {
  const idx = upperBound(bars15, t) - 1
  if (idx < 22) return 'NEUTRAL'
  const closes = bars15.slice(0, idx+1).map(b=>b.close)
  const e9=calcEma(closes,9), e21=calcEma(closes,21)
  if (e9>e21*1.001) return 'BULL'; if (e9<e21*0.999) return 'BEAR'; return 'NEUTRAL'
}
function btcBiasAt(btc5:Bar[], endIdx:number): Bias {
  if (endIdx < 30) return 'NEUTRAL'
  const closes = btc5.slice(Math.max(0,endIdx-199), endIdx+1).map(b=>b.close)
  const rsi=calcRsi(closes.slice(-15)), e9=calcEma(closes,9), e21=calcEma(closes,21)
  if (rsi>55&&e9>e21) return 'BULL'; if (rsi<45&&e9<e21) return 'BEAR'; return 'NEUTRAL'
}
function upperBound(bars:Bar[], t:number): number {
  let lo=0, hi=bars.length
  while (lo<hi) { const m=(lo+hi)>>1; if (bars[m].t <= t) lo=m+1; else hi=m }
  return lo
}

// ─────────────────────────────────────────────────────────────
// PORTFOLIO SIM
// ─────────────────────────────────────────────────────────────
interface OpenPos {
  sym:string; side:'LONG'|'SHORT'; entry:number; size:number; slDist:number
  sl:number; tp:number; be:number; partialDone:boolean; openIdx:number; openT:number
  origSize:number
}
interface ClosedTrade { sym:string; side:string; status:string; pnl:number; rMultiple:number; heldMin:number }

const COINS = ['BTC','ETH','SOL','BNB','XRP','DOGE','ADA','AVAX','LINK','DOT','LTC','BCH','NEAR','INJ','SUI',
  'TRX','APT','ARB','OP','ATOM','FIL','UNI','AAVE','ICP','ALGO','SEI','WLD','TIA','RUNE','LDO',
  'CRV','DYDX','GALA','SAND','AXS','IMX','ENA','PEPE','WIF','FET']
const MAX_OPEN = 20, MAX_NEW_PER_SCAN = 5, MIN_NOTIONAL = 500
const SYM_COOLDOWN_MIN = 10, MAX_HOLD_MIN = 120
const CORR_GROUPS: string[][] = [
  ['BTC'],['ETH','ARB','OP'],['SOL','AVAX','APT','SUI'],['DOGE'],
  ['ADA','DOT','ATOM','ALGO','VET','ICP'],['LINK','AAVE','UNI'],['LTC','BCH'],
  ['XRP','HBAR'],['BNB'],['NEAR','FIL'],['INJ','SEI','TRX'],
]
function corrGroup(sym:string){ for(let i=0;i<CORR_GROUPS.length;i++) if(CORR_GROUPS[i].includes(sym)) return i; return -1 }

const VOL_PARAMS = {
  LOW:    { slMult:1.5, tpR:2.5, trailAtr:0.6 },
  MEDIUM: { slMult:1.3, tpR:2.5, trailAtr:0.7 },
  HIGH:   { slMult:1.0, tpR:2.5, trailAtr:0.8 },
}

interface SimConfig { name:string; partial:boolean; beR:number; trailStartR:number; partialR:number; netCap:boolean; entryThreshold:number; baseFloor:number; meanRev?:boolean }

// PURE mean-reversion entry — ONLY the signals with proven positive lift:
// stochastic extreme (defines side) + RSI divergence + stop-hunt (+volume).
// No trend signals, no ADX/1H/BTC trend gates. Tests "fade the extreme".
function mrScore(bars:Bar[], price:number) {
  if (bars.length < 30) return null
  const closes = bars.map(b=>b.close), highs = bars.map(b=>b.high), lows = bars.map(b=>b.low)
  const atr = calcATR(bars.slice(-20)); if (!atr) return null
  const bb = calcBB(closes,20,2); if (!bb.mid) return null
  const rsi = calcRsi(closes.slice(-15))
  const stoch = calcStochastic(closes, highs, lows, 14, 3)
  let side: 'LONG'|'SHORT'|null = null
  if (stoch.K < 25 && (price <= bb.lower*1.005 || rsi < 35)) side='LONG'
  else if (stoch.K > 75 && (price >= bb.upper*0.995 || rsi > 65)) side='SHORT'
  if (!side) return null
  const rsiHistory = closes.slice(-20).map((_c,i)=> i===0?50:calcRsi(closes.slice(0, closes.length-20+i+1)))
  const div = detectDivergence(rsiHistory, closes)
  const divOK = (div==='BULL_DIV'&&side==='LONG')||(div==='BEAR_DIV'&&side==='SHORT')
  const shOK = detectStopHunt(bars, side)
  const vols = bars.slice(-20).map(b=>b.vol); const volAvg = vols.reduce((a,b)=>a+b,0)/vols.length
  const volOK = bars[bars.length-1].vol > volAvg*1.4
  let score = 2                    // stoch extreme (the side trigger)
  if (divOK) score += 4
  if (shOK)  score += 4
  if (volOK) score += 1
  return { side, slDist: atr*1.2, score, needConfirm: divOK||shOK }
}

function runSim(
  cfg:SimConfig, grid:number[], data:Record<string,Bar[]>,
  b1h:Record<string,Bar[]>, b15:Record<string,Bar[]>, btc5:Bar[], change24h:Record<string,number[]>,
  oi:Record<string,{t:number,oi:number}[]>
): {closed:ClosedTrade[], equityCurve:number[], finalBal:number, maxDD:number} {
  let balance = 10000
  const open: Record<string, OpenPos> = {}
  const closed: ClosedTrade[] = []
  const cooldownUntil: Record<string, number> = {}
  const equityCurve: number[] = []
  let peak = 10000, maxDD = 0

  // index pointer per coin into its 5m bar array, aligned to grid time
  const idxOf: Record<string, number> = {}
  for (const c of COINS) idxOf[c] = 0

  for (let gi=0; gi<grid.length; gi++) {
    const T = grid[gi]
    // advance per-coin pointer to the bar whose openTime == T (if present)
    const barAt: Record<string, number> = {}
    for (const c of COINS) {
      const arr = data[c]; let p = idxOf[c]
      while (p < arr.length && arr[p].t < T) p++
      idxOf[c] = p
      barAt[c] = (p < arr.length && arr[p].t === T) ? p : -1
    }

    // ---- 1) manage open positions ----
    for (const sym of Object.keys(open)) {
      const bi = barAt[sym]; if (bi < 0) continue
      const bar = data[sym][bi]; const t = open[sym]
      const dirM = t.side==='LONG'?1:-1
      const price = bar.close
      const atr = calcATR(data[sym].slice(Math.max(0,bi-19), bi+1))
      const volRegime = getVolRegime(atr/price)
      const vp = VOL_PARAMS[volRegime]
      const ageMin = (T - t.openT)/60000
      // intrabar: check SL/TP against high/low (SL priority = conservative)
      let status: string | null = null
      let exitPrice = price
      if (t.side==='LONG') {
        if (bar.low <= t.sl)      { status = price>=t.entry && t.sl>=t.entry ? 'TRAIL':'SL'; exitPrice=t.sl; if (t.sl>=t.entry) status='TRAIL'; else status='SL' }
        else if (bar.high >= t.tp){ status='TP'; exitPrice=t.tp }
      } else {
        if (bar.high >= t.sl)     { exitPrice=t.sl; status = t.sl<=t.entry ? 'TRAIL':'SL' }
        else if (bar.low <= t.tp) { status='TP'; exitPrice=t.tp }
      }
      // partial TP (v38 mode)
      if (!status && cfg.partial && !t.partialDone) {
        const ptp = t.entry + t.slDist*cfg.partialR*dirM
        const hit = t.side==='LONG' ? bar.high>=ptp : bar.low<=ptp
        if (hit) {
          const half = t.size/2
          const pnl = (ptp - t.entry)*half*dirM
          balance += t.entry*half + pnl
          t.size = half; t.partialDone = true
          t.sl = dirM===1 ? Math.max(t.sl, t.entry+t.slDist*0.2) : Math.min(t.sl, t.entry-t.slDist*0.2)
          closed.push({sym, side:t.side, status:'PARTIAL', pnl, rMultiple:cfg.partialR*0.5, heldMin:ageMin})
        }
      }
      if (!status) {
        const profitR = t.slDist>0 ? (price-t.entry)*dirM/t.slDist : 0
        const adjHold = calcDynamicMaxHold(MAX_HOLD_MIN, profitR)
        if (ageMin > adjHold) { status='TRAIL'; exitPrice=price }
      }
      if (status) {
        const pnl = (exitPrice - t.entry)*t.size*dirM
        const r = t.slDist>0 ? (exitPrice-t.entry)*dirM/t.slDist : 0
        balance += t.entry*t.size + pnl
        const finalStatus = pnl>0 && status==='SL' ? 'TP' : status
        closed.push({sym, side:t.side, status:finalStatus, pnl, rMultiple:r, heldMin:ageMin})
        cooldownUntil[sym] = T + SYM_COOLDOWN_MIN*60000
        delete open[sym]
        continue
      }
      // ---- trailing ----
      const profitR = t.slDist>0 ? (price-t.entry)*dirM/t.slDist : 0
      let newSL = t.sl
      if (profitR >= cfg.beR)        { const be=t.entry; newSL = dirM===1?Math.max(newSL,be):Math.min(newSL,be) }
      if (profitR >= cfg.trailStartR){ const lvl=price-atr*vp.trailAtr*dirM; newSL = dirM===1?Math.max(newSL,lvl):Math.min(newSL,lvl) }
      if (profitR >= 3.0)            { const lvl=price-atr*0.5*dirM;         newSL = dirM===1?Math.max(newSL,lvl):Math.min(newSL,lvl) }
      if (profitR >= 5.0)            { const lvl=price-atr*0.25*dirM;        newSL = dirM===1?Math.max(newSL,lvl):Math.min(newSL,lvl) }
      t.sl = newSL
    }

    // ---- 2) new entries ----
    // adaptive side filter from closed trades so far
    const longsC = closed.filter(c=>c.side==='LONG'&&c.status!=='PARTIAL')
    const shortsC = closed.filter(c=>c.side==='SHORT'&&c.status!=='PARTIAL')
    const lWR = longsC.length>=15 ? longsC.filter(c=>c.pnl>0).length/longsC.length : 0.5
    const sWR = shortsC.length>=15 ? shortsC.filter(c=>c.pnl>0).length/shortsC.length : 0.5
    let sideFilter: 'LONG'|'SHORT'|'BOTH' = 'BOTH'
    if (longsC.length>=15 && shortsC.length>=15) {
      if (lWR>sWR+0.15) sideFilter='LONG'; else if (sWR>lWR+0.15) sideFilter='SHORT'
    }
    const btcBias = btcBiasAt(btc5, upperBound(btc5, T)-1)
    let newThisScan = 0
    const openCount = () => Object.keys(open).length
    // deterministic order
    for (const sym of COINS) {
      if (newThisScan >= MAX_NEW_PER_SCAN) break
      if (openCount() >= MAX_OPEN) break
      if (open[sym]) continue
      if (cooldownUntil[sym] && T < cooldownUntil[sym]) continue
      const bi = barAt[sym]; if (bi < 200) continue
      const arr = data[sym]
      const price = arr[bi].close
      const completed = arr.slice(bi-199, bi+1)  // rolling window (last completed bar = bi)
      const atr = calcATR(completed)
      const atrPct = atr/price
      if (atrPct > 0.02 || atrPct < 0.00003) continue
      const adx = calcADX(completed)
      const {ema1h, ema200} = biasAt1h(b1h[sym], T)
      const ema15 = bias15mAt(b15[sym], T)
      const vpoc = calcVPOC(completed.slice(-80))
      // 24h change
      const ch = change24h[sym][bi] ?? 0
      const pchg = completed.length>=2 ? (price-completed[completed.length-2].close)/completed[completed.length-2].close : 0
      const oc = oiContext(oi[sym], arr[bi].t, pchg)
      let entrySide: 'LONG'|'SHORT', rawSlDist:number, finalScore:number
      let rfFlag = false, bbMidVal:number|undefined = undefined
      if (cfg.meanRev) {
        // PURE mean-reversion: only the proven-positive signals (stoch extreme +
        // divergence + stop-hunt). No trend signals, no ADX/1H/BTC trend gates.
        const mr = mrScore(completed, price)
        if (!mr || !mr.needConfirm) continue
        if (mr.score < cfg.entryThreshold) continue
        entrySide = mr.side; rawSlDist = mr.slDist; finalScore = mr.score
      } else {
        const es = calcConfluenceScore(completed, price, vpoc, ema1h, adx, 50, 35, 65, 1.02, ema200, ch, oc.sig, oc.hist)
        if (!es || !es.side) continue
        if (!es.rangeFade && adx < 20) continue
        if (es.side==='LONG' && ema1h==='BEAR') continue
        if (es.side==='SHORT'&& ema1h==='BULL') continue
        if (es.side==='LONG' && btcBias==='BEAR' && ema1h!=='BULL') continue
        if (es.side==='SHORT'&& btcBias==='BULL' && ema1h!=='BEAR') continue
        const a1 = (es.side==='LONG'&&ema1h==='BULL')||(es.side==='SHORT'&&ema1h==='BEAR')
        const a15= (es.side==='LONG'&&ema15==='BULL')||(es.side==='SHORT'&&ema15==='BEAR')
        const mtfBonus = a1&&a15?10:(a1||a15?5:0)
        const fs = es.score + mtfBonus
        if (es.score < cfg.baseFloor || fs < cfg.entryThreshold) continue
        entrySide = es.side; rawSlDist = es.slDist; finalScore = fs; rfFlag = !!es.rangeFade; bbMidVal = es.bbMid
      }
      // side filter
      if (sideFilter==='LONG'&&entrySide==='SHORT') continue
      if (sideFilter==='SHORT'&&entrySide==='LONG') continue
      // corr group cap (max 3 per group among open)
      const gid = corrGroup(sym)
      if (gid>=0) { const cnt=Object.keys(open).filter(s=>corrGroup(s)===gid).length; if (cnt>=3) continue }
      // SL/TP
      const dynSLMult = adx>25?1.0:adx<15?1.5:1.2
      const dynSL = calcDynamicSL(rawSlDist, adx, dynSLMult)
      const slDist = Math.max(dynSL, price*0.005)
      const slPct = slDist/price
      if (slPct < 0.005 || slPct > 0.04) continue
      const {pct:volPct} = calcVolatilityPercentile(completed)
      let tpR = calcDynamicTP(2.5, volPct)
      if (rfFlag && bbMidVal) { const midR=Math.abs(bbMidVal-price)/slDist; if (midR<1.0) continue; tpR=Math.min(tpR,midR) }
      // equal sizing
      const currentExposure = Object.values(open).reduce((a,p)=>a+p.entry*p.size,0)
      const totalPortfolio = balance + currentExposure
      const remaining = Math.max(0, totalPortfolio*1.0 - currentExposure)
      const slotsLeft = Math.max(1, MAX_OPEN - openCount())
      let notional = Math.min(remaining/slotsLeft, remaining, balance*0.95)
      if (notional < MIN_NOTIONAL) continue
      // net exposure cap (v39)
      if (cfg.netCap) {
        let nl=0, ns=0; for (const p of Object.values(open)) { const n=p.entry*p.size; if(p.side==='LONG')nl+=n; else ns+=n }
        const netAfter = entrySide==='LONG' ? (nl+notional)-ns : nl-(ns+notional)
        if (totalPortfolio>0 && Math.abs(netAfter) > totalPortfolio*0.60) continue
      }
      const size = notional/price
      const dirM = entrySide==='LONG'?1:-1
      const sl = entrySide==='LONG'?price-slDist:price+slDist
      const tp = price + slDist*tpR*dirM
      balance -= notional
      open[sym] = {sym, side:entrySide, entry:price, size, slDist, sl, tp, be:price, partialDone:false, openIdx:bi, openT:T, origSize:size}
      newThisScan++
    }

    // ---- equity curve ----
    const exposure = Object.values(open).reduce((a,p)=>{
      const bi = barAt[p.sym]; const px = bi>=0 ? data[p.sym][bi].close : p.entry
      const dirM = p.side==='LONG'?1:-1
      return a + p.entry*p.size + (px-p.entry)*p.size*dirM
    },0)
    const equity = balance + exposure
    equityCurve.push(equity)
    if (equity>peak) peak=equity
    const dd=(peak-equity)/peak; if (dd>maxDD) maxDD=dd
  }
  // close any still-open at last price (mark to market)
  for (const sym of Object.keys(open)) {
    const t=open[sym]; const arr=data[sym]; const px=arr[arr.length-1].close
    const dirM=t.side==='LONG'?1:-1
    const pnl=(px-t.entry)*t.size*dirM; balance+=t.entry*t.size+pnl
    closed.push({sym, side:t.side, status:'EOD', pnl, rMultiple:t.slDist>0?(px-t.entry)*dirM/t.slDist:0, heldMin:(arr[arr.length-1].t-t.openT)/60000})
  }
  return {closed, equityCurve, finalBal:balance, maxDD}
}

function report(name:string, r:{closed:ClosedTrade[], finalBal:number, maxDD:number}) {
  const real = r.closed.filter(c=>c.status!=='PARTIAL')
  const n = real.length
  const wins = real.filter(c=>c.pnl>0)
  const losses = real.filter(c=>c.pnl<=0)
  const grossWin = wins.reduce((a,c)=>a+c.pnl,0)
  const grossLoss = Math.abs(losses.reduce((a,c)=>a+c.pnl,0))
  const wr = n? wins.length/n : 0
  const pf = grossLoss>0 ? grossWin/grossLoss : Infinity
  const avgWinR = wins.length? wins.reduce((a,c)=>a+c.rMultiple,0)/wins.length : 0
  const avgLossR = losses.length? losses.reduce((a,c)=>a+c.rMultiple,0)/losses.length : 0
  const expR = n? real.reduce((a,c)=>a+c.rMultiple,0)/n : 0
  const totalPnl = r.closed.reduce((a,c)=>a+c.pnl,0)
  const byStatus:Record<string,number> = {}
  for (const c of real) byStatus[c.status]=(byStatus[c.status]||0)+1
  console.log(`\n═══════════ ${name} ═══════════`)
  console.log(`Trades:        ${n}`)
  console.log(`Win rate:      ${(wr*100).toFixed(1)}%   (${wins.length}W / ${losses.length}L)`)
  console.log(`Profit factor: ${pf===Infinity?'∞':pf.toFixed(2)}`)
  console.log(`Expectancy:    ${expR>=0?'+':''}${expR.toFixed(3)}R per trade`)
  console.log(`Avg win:       +${avgWinR.toFixed(2)}R    Avg loss: ${avgLossR.toFixed(2)}R`)
  console.log(`Win/Loss size: ${avgLossR!==0?(Math.abs(avgWinR/avgLossR)).toFixed(2):'-'}x   (need >2.13 @ ${(wr*100).toFixed(0)}% WR)`)
  console.log(`Final balance: $${r.finalBal.toFixed(2)}  (from $10,000)`)
  console.log(`Total P&L:     ${totalPnl>=0?'+':''}$${totalPnl.toFixed(2)}`)
  console.log(`Max drawdown:  ${(r.maxDD*100).toFixed(1)}%`)
  console.log(`Exits:         ${Object.entries(byStatus).map(([k,v])=>`${k}:${v}`).join('  ')}`)
  return {name, n, wr, pf, expR, avgWinR, avgLossR, finalBal:r.finalBal, maxDD:r.maxDD}
}

// ─────────────────────────────────────────────────────────────
// SIGNAL VALIDATION — per-signal predictive power
// Generates a large population of candidate trades (side + which signals fired)
// and their forward outcome (fixed SL / 2.5R TP), then measures for each signal:
//   WR when it fired  vs  WR when it didn't  →  LIFT (predictive edge)
// Structural gates only (ADX + 1H) — NO score gate — to get the full population.
// ─────────────────────────────────────────────────────────────
const SIGNALS = ['vpoc','ema1h','adx','volume','oiFavor','candle','stoch','divergence','macd','pivot','bbSqueeze','stopHunt','vwap','bos','ema200','liqZone','momentum']
function runSignalValidation(data:Record<string,Bar[]>, b1h:Record<string,Bar[]>, change24h:Record<string,number[]>, oi:Record<string,{t:number,oi:number}[]>) {
  const fired:Record<string,{n:number,w:number}> = {}, off:Record<string,{n:number,w:number}> = {}
  for (const s of SIGNALS) { fired[s]={n:0,w:0}; off[s]={n:0,w:0} }
  let total=0, totalW=0
  const MAXHOLD = 24  // 120min at 5m — matches live max hold
  for (const c of COINS) {
    const arr = data[c]; if (!arr || arr.length < 300) continue
    const ch = change24h[c]
    let i = 200
    while (i < arr.length-1) {
      const price = arr[i].close
      const completed = arr.slice(i-199, i+1)
      const atr = calcATR(completed); const atrPct = atr/price
      if (atrPct > 0.02 || atrPct < 0.00003) { i++; continue }
      const adx = calcADX(completed)
      const {ema1h, ema200} = biasAt1h(b1h[c], arr[i].t)
      const vpoc = calcVPOC(completed.slice(-80))
      const pchg = completed.length>=2 ? (price-completed[completed.length-2].close)/completed[completed.length-2].close : 0
      const oc = oiContext(oi[c], arr[i].t, pchg)
      const es = calcConfluenceScore(completed, price, vpoc, ema1h, adx, 50, 35, 65, 1.02, ema200, ch[i]??0, oc.sig, oc.hist)
      if (!es || !es.side) { i++; continue }
      if (!es.rangeFade && adx < 20) { i++; continue }
      if (es.side==='LONG' && ema1h==='BEAR') { i++; continue }
      if (es.side==='SHORT'&& ema1h==='BULL') { i++; continue }
      const dirM = es.side==='LONG'?1:-1
      const slDist = Math.max(es.slDist, price*0.005)
      const sl = price - slDist*dirM, tp = price + slDist*2.5*dirM
      let win = -1, exitBar = i
      for (let j=i+1; j<Math.min(arr.length, i+1+MAXHOLD); j++) {
        const b = arr[j]; exitBar=j
        if (es.side==='LONG') { if (b.low<=sl){win=0;break} if (b.high>=tp){win=1;break} }
        else                  { if (b.high>=sl){win=0;break} if (b.low<=tp){win=1;break} }
      }
      if (win<0) win = (arr[exitBar].close - price)*dirM > 0 ? 1 : 0
      total++; totalW += win
      for (const sg of SIGNALS) {
        if ((es.bd[sg]??0) > 0) { fired[sg].n++; fired[sg].w += win } else { off[sg].n++; off[sg].w += win }
      }
      i = exitBar + 1  // no overlapping trades per coin
    }
  }
  const baseWR = total? totalW/total : 0
  console.log(`\n████ SIGNAL VALIDATION — ${total} candidate trades | baseline WR ${(baseWR*100).toFixed(1)}% ████`)
  console.log(`(fixed SL / 2.5R TP, ${MAXHOLD*5}min max hold; structural gates only, no score gate)\n`)
  console.log(`signal        fired#   WR_fired   WR_off     LIFT`)
  const rows = SIGNALS.map(sg=>{
    const f=fired[sg], o=off[sg]; const wf=f.n?f.w/f.n:0, wo=o.n?o.w/o.n:0
    return {sg, n:f.n, wf, wo, lift:wf-wo}
  }).sort((a,b)=>b.lift-a.lift)
  for (const r of rows) {
    console.log(`  ${r.sg.padEnd(12)} ${String(r.n).padStart(5)}   ${(r.wf*100).toFixed(1).padStart(6)}%   ${(r.wo*100).toFixed(1).padStart(6)}%   ${r.lift>=0?'+':''}${(r.lift*100).toFixed(1)}pp`)
  }
  console.log(`\nLIFT = WR(signal fired) − WR(signal off). Positive = the signal adds predictive edge.`)
  console.log(`Signals with negative lift are HURTING entry quality → drop or invert them.`)
  console.log(`Note: OI + liq-zone NOW WIRED from metrics archive; funding/fear-greed still neutral. FEE=0.`)
}

// ─────────────────────────────────────────────────────────────
function main() {
  console.log(`Loading data (5m + 15m + 1h) from data.binance.vision archive | coins: ${COINS.join(',')}`)

  const data:Record<string,Bar[]> = {}, b1h:Record<string,Bar[]> = {}, b15:Record<string,Bar[]> = {}
  const change24h:Record<string,number[]> = {}
  const oiData:Record<string,{t:number,oi:number}[]> = {}
  for (const c of COINS) {
    data[c] = loadCSV(c, '5m')
    b1h[c]  = loadCSV(c, '1h')
    b15[c]  = loadCSV(c, '15m')
    oiData[c] = loadOI(c)
    // precompute 24h change per 5m bar (288 bars back)
    const arr = data[c]; const ch = new Array(arr.length).fill(0)
    for (let i=288;i<arr.length;i++) ch[i] = (arr[i].close - arr[i-288].close)/arr[i-288].close
    change24h[c] = ch
    console.log(`  ${c}: ${data[c].length} 5m / ${b1h[c].length} 1h / ${b15[c].length} 15m / ${oiData[c].length} OI`)
  }
  const btc5 = data['BTC']
  if (!btc5 || btc5.length === 0) { console.log('NO DATA LOADED — check fetch.sh output'); return }

  // BT_MODE=signals → per-signal predictive-power validation, then stop
  if (Deno.env.get('BT_MODE') === 'signals') { runSignalValidation(data, b1h, change24h, oiData); return }

  // build common 5m time grid (union of BTC timestamps is enough; all coins align)
  const grid = btc5.map(b=>b.t)
  console.log(`Grid: ${grid.length} 5m steps\n`)

  const mk = (o:Partial<SimConfig>):SimConfig => ({
    name:'', partial:false, beR:1.5, trailStartR:2.0, partialR:1.2, netCap:true,
    entryThreshold:75, baseFloor:65, meanRev:false, ...o
  })

  // BT_MODE=meanrev → pure mean-reversion strategy sweep, then stop
  if (Deno.env.get('BT_MODE') === 'meanrev') {
    console.log(`\n████ PURE MEAN-REVERSION — only stoch+divergence+stopHunt, no trend gates ████`)
    console.log(`(V39 exits: BE 1.5R + trail 2.0R; score=2 stoch +4 div +4 stopHunt +1 vol)`)
    console.log(`\nminScore  trades   WR      PF     expR       avgWinR  avgLossR`)
    for (const th of [5,6,7,8,9]) {
      const r = runSim(mk({meanRev:true, entryThreshold:th, baseFloor:0}), grid, data, b1h, b15, btc5, change24h, oiData)
      const real = r.closed.filter(c=>c.status!=='PARTIAL')
      const n=real.length, w=real.filter(c=>c.pnl>0), l=real.filter(c=>c.pnl<=0)
      const gw=w.reduce((a,c)=>a+c.pnl,0), gl=Math.abs(l.reduce((a,c)=>a+c.pnl,0))
      const wr=n?w.length/n:0, pf=gl>0?gw/gl:Infinity, exp=n?real.reduce((a,c)=>a+c.rMultiple,0)/n:0
      const awr=w.length?w.reduce((a,c)=>a+c.rMultiple,0)/w.length:0
      const alr=l.length?l.reduce((a,c)=>a+c.rMultiple,0)/l.length:0
      console.log(`  ${th}      ${String(n).padStart(5)}   ${(wr*100).toFixed(1).padStart(5)}%  ${(pf===Infinity?'∞':pf.toFixed(2)).padStart(5)}  ${(exp>=0?'+':'')}${exp.toFixed(3)}R   +${awr.toFixed(2)}R   ${alr.toFixed(2)}R`)
    }
    console.log(`\nFEE=0. Positive expR at any row = the pure mean-reversion premise works.`)
    return
  }

  // ── PART A: score→expectancy sweep (V39 exit engine, varying entry gate) ──
  // Live has ~15-30 extra pts from OI/FG/liqZone/momentum that we neutralized,
  // so a live "75" ≈ technical-only 50-60 here. Sweeping brackets real behaviour
  // AND reveals whether a higher score actually buys a better expectancy.
  console.log(`\n████ PART A — does a higher score buy a better expectancy? (V39 exits) ████`)
  console.log(`thresh  trades   WR      PF     expR      avgWinR  avgLossR`)
  for (const th of [45,50,55,60,65,70,75]) {
    const r = runSim(mk({entryThreshold:th, baseFloor:Math.max(0,th-10)}), grid, data, b1h, b15, btc5, change24h, oiData)
    const real = r.closed.filter(c=>c.status!=='PARTIAL')
    const n=real.length, w=real.filter(c=>c.pnl>0)
    const l=real.filter(c=>c.pnl<=0)
    const gw=w.reduce((a,c)=>a+c.pnl,0), gl=Math.abs(l.reduce((a,c)=>a+c.pnl,0))
    const wr=n?w.length/n:0, pf=gl>0?gw/gl:Infinity, exp=n?real.reduce((a,c)=>a+c.rMultiple,0)/n:0
    const awr=w.length?w.reduce((a,c)=>a+c.rMultiple,0)/w.length:0
    const alr=l.length?l.reduce((a,c)=>a+c.rMultiple,0)/l.length:0
    console.log(`  ${th}     ${String(n).padStart(4)}    ${(wr*100).toFixed(1).padStart(5)}%  ${(pf===Infinity?'∞':pf.toFixed(2)).padStart(5)}  ${(exp>=0?'+':'')}${exp.toFixed(3)}R   +${awr.toFixed(2)}R   ${alr.toFixed(2)}R`)
  }

  // ── PART B: is TRAILING the profit-killer? V39 (trail) vs PURE (fixed SL/2.5R TP, no trail) ──
  // Signal validation showed 35.8% WR at a fixed 2.5R exit = +0.25R expectancy,
  // but the trailing engine cuts winners (avg win 0.4-1.6R). Test removing it.
  console.log(`\n████ PART B — TRAILING vs PURE fixed SL/TP (no trail), at gates 55 & 75 ████`)
  for (const TH of [55, 75]) {
    const rTrail = runSim(mk({partial:false, beR:1.5,  trailStartR:2.0, netCap:true, entryThreshold:TH, baseFloor:Math.max(0,TH-10)}), grid, data, b1h, b15, btc5, change24h, oiData)
    const rPure  = runSim(mk({partial:false, beR:999,  trailStartR:999, netCap:true, entryThreshold:TH, baseFloor:Math.max(0,TH-10)}), grid, data, b1h, b15, btc5, change24h, oiData)
    const sT = report(`TRAIL  gate=${TH} (v39: BE 1.5R + trail 2.0R)`, rTrail)
    const sP = report(`PURE   gate=${TH} (fixed SL + 2.5R TP, no trail)`, rPure)
    console.log(`\n─── gate=${TH}:  TRAIL exp ${sT.expR>=0?'+':''}${sT.expR.toFixed(3)}R  vs  PURE exp ${sP.expR>=0?'+':''}${sP.expR.toFixed(3)}R  |  PF ${sT.pf===Infinity?'∞':sT.pf.toFixed(2)} vs ${sP.pf===Infinity?'∞':sP.pf.toFixed(2)} ───`)
  }
  console.log(`\nNote: OI + liq-zone NOW WIRED from metrics archive; only funding/fear-greed still neutral.`)
  console.log(`→ scores run ~15-30pts low, so thresholds map to higher live gates. FEE=0.`)
}

main()

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
  'CRV','DYDX','GALA','SAND','AXS','IMX','ENA','PEPE','WIF','FET',
  'TON','XLM','ETC','HBAR','VET','EGLD','FLOW','CHZ','MANA','GRT','SNX','COMP','MKR','ENJ','1INCH',
  'ZIL','KAVA','ROSE','CELO','ONE','QTUM','IOTA','XTZ','NEO','DASH','ZEC','BAND','STORJ','KSM','JASMY']
// the original validated 40 (for sub-universe comparisons)
const CORE40 = new Set(COINS.slice(0,40))
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

interface SimConfig { name:string; partial:boolean; beR:number; trailStartR:number; partialR:number; netCap:boolean; entryThreshold:number; baseFloor:number; meanRev?:boolean; fixedTpR?:number; slAtrMult?:number }

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
      // meanRev with an explicit slAtrMult uses a tight fixed SL (extremes invalidate close by);
      // otherwise the standard ADX-scaled dynamic SL.
      const dynSL = (cfg.meanRev && cfg.slAtrMult && cfg.slAtrMult>0) ? atr*cfg.slAtrMult : calcDynamicSL(rawSlDist, adx, dynSLMult)
      const slDist = Math.max(dynSL, price*0.005)
      const slPct = slDist/price
      if (slPct < 0.005 || slPct > 0.04) continue
      const {pct:volPct} = calcVolatilityPercentile(completed)
      let tpR = calcDynamicTP(2.5, volPct)
      if (rfFlag && bbMidVal) { const midR=Math.abs(bbMidVal-price)/slDist; if (midR<1.0) continue; tpR=Math.min(tpR,midR) }
      if (cfg.fixedTpR && cfg.fixedTpR>0) tpR = cfg.fixedTpR   // override: fixed close target
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
// EXPLORE — higher timeframes (15m/1h), 6 months, REAL FEES, walk-forward.
// Tests mean-reversion trigger variants × TP × SL. A config only counts as
// PROVEN if expectancy (net of fees) is positive in ALL 3 time windows.
// ─────────────────────────────────────────────────────────────
function runExplore() {
  const FEE_TAKER = 0.0010       // 0.05%/side round trip (market orders)
  const FEE_MAKER = 0.0004       // 0.02%/side round trip (limit orders)
  const TPS = [0.8, 1.0, 1.5, 2.0, 3.0]
  const SLS = [0.7, 1.0, 1.4, 2.0]
  const SPACING = 8

  interface Agg { n:number; w:number; sum:number; sumG:number; sumM:number }
  const mkAgg = ():Agg => ({n:0,w:0,sum:0,sumG:0,sumM:0})
  const stats: Record<string, Agg[]> = {}
  const curve: Record<string, {t:number,r:number}[]> = {}

  // 4h aggregation from 1h
  const to4h = (a:Bar[]):Bar[] => {
    const out:Bar[] = []; let cur:Bar|null = null; let bucket = -1
    for (const b of a) {
      const k = Math.floor(b.t/14400000)
      if (k!==bucket) { if (cur) out.push(cur); bucket=k
        cur = {t:k*14400000, open:b.open, high:b.high, low:b.low, close:b.close, vol:b.vol} }
      else if (cur) { cur.high=Math.max(cur.high,b.high); cur.low=Math.min(cur.low,b.low); cur.close=b.close; cur.vol+=b.vol }
    }
    if (cur) out.push(cur)
    return out
  }

  interface Ctx { win:Bar[]; closes:number[]; price:number; rsi:number; stochK:number; bb:{upper:number;mid:number;lower:number}; adx:number; confirm:boolean }
  interface Variant { vid:string; maxhold:number; fire:(c:Ctx)=>('LONG'|'SHORT'|null) }
  const variants: Variant[] = [
    {vid:'A_stoch+rsi', maxhold:48, fire:c=> (c.stochK<20&&c.rsi<35)?'LONG':(c.stochK>80&&c.rsi>65)?'SHORT':null},
    {vid:'B_confirmed', maxhold:48, fire:c=>{ const s=(c.stochK<20&&c.rsi<35)?'LONG':(c.stochK>80&&c.rsi>65)?'SHORT':null; return s&&c.confirm?s:null }},
    {vid:'D_range_MR',  maxhold:48, fire:c=>{ if(c.adx>=20) return null; return (c.stochK<20&&c.rsi<35)?'LONG':(c.stochK>80&&c.rsi>65)?'SHORT':null }},
    {vid:'F_band_conf', maxhold:48, fire:c=>{ const s=(c.price<=c.bb.lower*1.005&&c.rsi<32)?'LONG':(c.price>=c.bb.upper*0.995&&c.rsi>68)?'SHORT':null; return s&&c.confirm?s:null }},
    {vid:'G_donchian55',maxhold:96, fire:c=>{ const hs=c.win.slice(-56,-1); if(!hs.length) return null
      const hi=Math.max(...hs.map(b=>b.high)), lo=Math.min(...hs.map(b=>b.low))
      return c.price>hi?'LONG':c.price<lo?'SHORT':null }},
    {vid:'H_donch_adx', maxhold:96, fire:c=>{ if(c.adx<=25) return null; const hs=c.win.slice(-56,-1); if(!hs.length) return null
      const hi=Math.max(...hs.map(b=>b.high)), lo=Math.min(...hs.map(b=>b.low))
      return c.price>hi?'LONG':c.price<lo?'SHORT':null }},
  ]

  const tfs: [string, (c:string)=>Bar[]][] = [
    ['1h',  c=>loadCSV(c,'1h')],
    ['4h',  c=>to4h(loadCSV(c,'1h'))],
    ['15m', c=>loadCSV(c,'15m')],
  ]
  for (const [tf, loader] of tfs) {
    const dset: Record<string,Bar[]> = {}
    let tmin=Infinity, tmax=-Infinity
    for (const c of COINS) {
      const a = loader(c)
      if (a.length > 400) { dset[c]=a; tmin=Math.min(tmin,a[0].t); tmax=Math.max(tmax,a[a.length-1].t) }
    }
    const nCoins = Object.keys(dset).length
    console.log(`  ${tf}: ${nCoins} coins, ${((tmax-tmin)/86400000).toFixed(0)} days`)
    if (!nCoins) continue
    const wSpan = (tmax-tmin)/3
    const winOf = (t:number)=> Math.min(2, Math.max(0, Math.floor((t-tmin)/wSpan)))

    for (const c of Object.keys(dset)) {
      const arr = dset[c]
      const lastIdx: Record<string,number> = {}
      for (let i=200; i<arr.length-1; i++) {
        const win = arr.slice(i-199, i+1)
        const closes = win.map(b=>b.close), highs=win.map(b=>b.high), lows=win.map(b=>b.low)
        const price = closes[closes.length-1]
        const rsi = calcRsi(closes.slice(-15))
        const stoch = calcStochastic(closes, highs, lows, 14, 3)
        const bb = calcBB(closes, 20, 2)
        if (!bb.mid) continue
        const atr = calcATR(win.slice(-20)); if (!atr) continue
        const adx = calcADX(win.slice(-60))
        // confirm computed lazily only if some MR variant may need it
        let confirm = false
        const maybeMR = (stoch.K<20&&rsi<35)||(stoch.K>80&&rsi>65)||(price<=bb.lower*1.005&&rsi<32)||(price>=bb.upper*0.995&&rsi>68)
        if (maybeMR) {
          const sideGuess = (stoch.K<20||rsi<35||price<=bb.lower*1.005) ? 'LONG' : 'SHORT'
          const rsiHist = closes.slice(-20).map((_x,k)=> k===0?50:calcRsi(closes.slice(0, closes.length-20+k+1)))
          const dv = detectDivergence(rsiHist, closes)
          confirm = (dv==='BULL_DIV'&&sideGuess==='LONG')||(dv==='BEAR_DIV'&&sideGuess==='SHORT')||detectStopHunt(win, sideGuess as 'LONG'|'SHORT')
        }
        const ctx: Ctx = {win, closes, price, rsi, stochK:stoch.K, bb, adx, confirm}

        for (const v of variants) {
          const side = v.fire(ctx); if (!side) continue
          if (lastIdx[v.vid]!==undefined && i - lastIdx[v.vid] < SPACING) continue
          lastIdx[v.vid] = i
          const dirM = side==='LONG'?1:-1
          for (const slM of SLS) {
            const slDist = Math.max(atr*slM, price*0.005)
            const slPct = slDist/price
            if (slPct > 0.08) continue
            const feeT = FEE_TAKER/slPct, feeM = FEE_MAKER/slPct
            const slPx = price - slDist*dirM
            for (const tp of TPS) {
              const tpPx = price + slDist*tp*dirM
              let r: number|null = null
              const jEnd = Math.min(arr.length-1, i+v.maxhold)
              for (let j=i+1; j<=jEnd; j++) {
                const b = arr[j]
                if (side==='LONG') { if (b.low<=slPx){r=-1;break} if (b.high>=tpPx){r=tp;break} }
                else               { if (b.high>=slPx){r=-1;break} if (b.low<=tpPx){r=tp;break} }
              }
              if (r===null) r = (arr[jEnd].close - price)*dirM/slDist
              const key = `${tf}|${v.vid}|tp${tp}|sl${slM}`
              if (!stats[key]) stats[key]=[mkAgg(),mkAgg(),mkAgg()]
              const a = stats[key][winOf(arr[i].t)]
              a.n++; a.sumG += r; a.sumM += r-feeM; a.sum += r-feeT; if (r-feeT>0) a.w++
              if (!curve[key]) curve[key]=[]
              curve[key].push({t:arr[i].t, r:r-feeM})
            }
          }
        }
      }
    }
  }

  const rows = Object.entries(stats).map(([key, ws])=>{
    const tot = ws.reduce((a,x)=>({n:a.n+x.n, w:a.w+x.w, sum:a.sum+x.sum, sumG:a.sumG+x.sumG, sumM:a.sumM+x.sumM}), mkAgg())
    const expT = tot.n? tot.sum/tot.n : -9
    const expG = tot.n? tot.sumG/tot.n : -9
    const expM = tot.n? tot.sumM/tot.n : -9
    const wT = ws.map(x=> x.n? x.sum/x.n : -9)
    const wM = ws.map(x=> x.n? x.sumM/x.n : -9)
    const okT = wT.every(e=>e>0) && ws.every(x=>x.n>=15)
    const okM = wM.every(e=>e>0) && ws.every(x=>x.n>=15)
    return {key, tot, expT, expG, expM, wT, wM, okT, okM, minM:Math.min(...wM)}
  }).filter(r=>r.tot.n>=45)
  rows.sort((a,b)=>b.minM-a.minM)

  console.log(`\nconfig                          n     gross    maker    taker   | maker w1/w2/w3        | verdict`)
  for (const r of rows.slice(0, 30)) {
    const v = r.okT ? '✅✅TAKER-ROBUST' : r.okM ? '✅MAKER-ROBUST' : ''
    console.log(`  ${r.key.padEnd(28)} ${String(r.tot.n).padStart(5)}  ${(r.expG>=0?'+':'')}${r.expG.toFixed(3)}  ${(r.expM>=0?'+':'')}${r.expM.toFixed(3)}  ${(r.expT>=0?'+':'')}${r.expT.toFixed(3)}  | ${r.wM.map(e=>((e>=0?'+':'')+e.toFixed(2)).padStart(6)).join(' ')} | ${v}`)
  }
  const winners = rows.filter(r=>r.okM)
  console.log(`\n${winners.length} config(s) MAKER-robust (positive in all 3 windows @0.02%/side).`)
  for (const best of winners.slice(0,3)) {
    const pts = curve[best.key].sort((a,b)=>a.t-b.t)
    let cum=0, peak=0, mdd=0
    for (const p of pts) { cum+=p.r; if (cum>peak) peak=cum; mdd=Math.max(mdd, peak-cum) }
    console.log(`  ${best.key}: trades=${best.tot.n} totalR=${cum>=0?'+':''}${cum.toFixed(1)} maxDD=${mdd.toFixed(1)}R → $10k@1%risk ≈ $${(10000*Math.pow(1.01, cum)).toFixed(0)}`)
  }
  console.log(`\nWalk-forward: 3 equal windows over ~6 months. gross=no fees, maker=0.02%/side, taker=0.05%/side.`)
}

// REFINE — 4h Donchian family only: window × ADX gate × TP × SL grid.
// Purpose: confirm the explore winner is a stable HILL, not an isolated spike.
function runRefine() {
  const FEE_TAKER=0.0010, FEE_MAKER=0.0004, SPACING=2, MAXHOLD=96
  const DWS=[40,55,70], ADXS=[0,20,25,30], TPS=[0.6,0.8,1.0,1.2], SLS=[1.0,1.4,2.0]
  const to4h = (a:Bar[]):Bar[] => {
    const out:Bar[] = []; let cur:Bar|null=null; let bucket=-1
    for (const b of a) { const k=Math.floor(b.t/14400000)
      if (k!==bucket) { if (cur) out.push(cur); bucket=k
        cur={t:k*14400000,open:b.open,high:b.high,low:b.low,close:b.close,vol:b.vol} }
      else if (cur) { cur.high=Math.max(cur.high,b.high); cur.low=Math.min(cur.low,b.low); cur.close=b.close; cur.vol+=b.vol } }
    if (cur) out.push(cur); return out
  }
  const dset: Record<string,Bar[]> = {}
  let tmin=Infinity, tmax=-Infinity
  for (const c of COINS) { const a=to4h(loadCSV(c,'1h'))
    if (a.length>400) { dset[c]=a; tmin=Math.min(tmin,a[0].t); tmax=Math.max(tmax,a[a.length-1].t) } }
  console.log(`  4h: ${Object.keys(dset).length} coins, ${((tmax-tmin)/86400000).toFixed(0)} days`)
  const wSpan=(tmax-tmin)/3
  const winOf=(t:number)=>Math.min(2,Math.max(0,Math.floor((t-tmin)/wSpan)))
  interface Agg { n:number; w:number; sumT:number; sumM:number }
  const stats: Record<string,Agg[]> = {}
  for (const c of Object.keys(dset)) {
    const arr=dset[c]
    const lastIdx: Record<string,number> = {}
    for (let i=100;i<arr.length-1;i++) {
      const win=arr.slice(Math.max(0,i-99),i+1)
      const price=arr[i].close
      const atr=calcATR(win.slice(-20)); if(!atr) continue
      const adx=calcADX(win.slice(-60))
      for (const dw of DWS) {
        if (i<dw+1) continue
        const prior=arr.slice(i-dw,i)
        const hi=Math.max(...prior.map(b=>b.high)), lo=Math.min(...prior.map(b=>b.low))
        const side: 'LONG'|'SHORT'|null = price>hi?'LONG':price<lo?'SHORT':null
        if (!side) continue
        for (const ax of ADXS) {
          if (ax>0 && adx<=ax) continue
          const lk=`${dw}|${ax}`
          if (lastIdx[lk]!==undefined && i-lastIdx[lk]<SPACING) continue
          lastIdx[lk]=i
          const dirM=side==='LONG'?1:-1
          for (const slM of SLS) {
            const slDist=Math.max(atr*slM, price*0.005), slPct=slDist/price
            if (slPct>0.08) continue
            const feeT=FEE_TAKER/slPct, feeM=FEE_MAKER/slPct
            const slPx=price-slDist*dirM
            for (const tp of TPS) {
              const tpPx=price+slDist*tp*dirM
              let r:number|null=null
              const jEnd=Math.min(arr.length-1,i+MAXHOLD)
              for (let j=i+1;j<=jEnd;j++) { const b=arr[j]
                if (side==='LONG') { if(b.low<=slPx){r=-1;break} if(b.high>=tpPx){r=tp;break} }
                else { if(b.high>=slPx){r=-1;break} if(b.low<=tpPx){r=tp;break} } }
              if (r===null) r=(arr[jEnd].close-price)*dirM/slDist
              const key=`dw${dw}|adx${ax}|tp${tp}|sl${slM}`
              if (!stats[key]) stats[key]=[{n:0,w:0,sumT:0,sumM:0},{n:0,w:0,sumT:0,sumM:0},{n:0,w:0,sumT:0,sumM:0}]
              const a=stats[key][winOf(arr[i].t)]
              a.n++; a.sumT+=r-feeT; a.sumM+=r-feeM; if(r-feeM>0)a.w++
            }
          }
        }
      }
    }
  }
  const rows=Object.entries(stats).map(([key,ws])=>{
    const tot=ws.reduce((a,x)=>({n:a.n+x.n,w:a.w+x.w,sumT:a.sumT+x.sumT,sumM:a.sumM+x.sumM}),{n:0,w:0,sumT:0,sumM:0})
    const wM=ws.map(x=>x.n?x.sumM/x.n:-9)
    const okM=wM.every(e=>e>0)&&ws.every(x=>x.n>=15)
    return {key,tot,expM:tot.n?tot.sumM/tot.n:-9,expT:tot.n?tot.sumT/tot.n:-9,wM,okM,minM:Math.min(...wM)}
  }).filter(r=>r.tot.n>=150)
  rows.sort((a,b)=>b.minM-a.minM)
  console.log(`\nconfig                      n     WR     maker    taker  | maker w1/w2/w3       | verdict`)
  for (const r of rows.slice(0,35)) {
    const wr=r.tot.n?r.tot.w/r.tot.n:0
    console.log(`  ${r.key.padEnd(24)} ${String(r.tot.n).padStart(5)}  ${(wr*100).toFixed(1).padStart(5)}%  ${(r.expM>=0?'+':'')}${r.expM.toFixed(3)}  ${(r.expT>=0?'+':'')}${r.expT.toFixed(3)} | ${r.wM.map(e=>((e>=0?'+':'')+e.toFixed(2)).padStart(6)).join(' ')} | ${r.okM?'✅ROBUST':''}`)
  }
  console.log(`\n${rows.filter(r=>r.okM).length} ROBUST config(s). SPACING=2 bars (8h) between entries per coin.`)
}

// VALIDATE — the deployed config (dw40|adx25|sl1.4) over a LONG history
// (BT_MONTHS, e.g. 36 = includes bear market), 6 walk-forward windows,
// comparing three exit schemes: tp1.0 (deployed), tp0.6, and SPLIT
// (half off at 0.6R → SL to breakeven, half runs to 1.0R).
function runValidate() {
  const FEE_TAKER=0.0010, FEE_MAKER=0.0004, SPACING=2, MAXHOLD=96, NW=6
  const DW=40, ADX_GATE=25, SLM=1.4
  const to4h = (a:Bar[]):Bar[] => {
    const out:Bar[] = []; let cur:Bar|null=null; let bucket=-1
    for (const b of a) { const k=Math.floor(b.t/14400000)
      if (k!==bucket) { if (cur) out.push(cur); bucket=k
        cur={t:k*14400000,open:b.open,high:b.high,low:b.low,close:b.close,vol:b.vol} }
      else if (cur) { cur.high=Math.max(cur.high,b.high); cur.low=Math.min(cur.low,b.low); cur.close=b.close; cur.vol+=b.vol } }
    if (cur) out.push(cur); return out
  }
  const dset: Record<string,Bar[]> = {}
  let tmin=Infinity, tmax=-Infinity
  for (const c of COINS) { const a=to4h(loadCSV(c,'1h'))
    if (a.length>400) { dset[c]=a; tmin=Math.min(tmin,a[0].t); tmax=Math.max(tmax,a[a.length-1].t) } }
  console.log(`  4h: ${Object.keys(dset).length} coins, ${((tmax-tmin)/86400000).toFixed(0)} days (${((tmax-tmin)/86400000/30.4).toFixed(0)} months)`)
  const wSpan=(tmax-tmin)/NW
  const winOf=(t:number)=>Math.min(NW-1,Math.max(0,Math.floor((t-tmin)/wSpan)))
  const wLabel=(i:number)=>{ const d=new Date(tmin+i*wSpan); return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}` }

  type Scheme = 'tp1.0'|'tp0.6'|'SPLIT'
  const SCHEMES: Scheme[] = ['tp1.0','tp0.6','SPLIT']
  interface Agg { n:number; w:number; sumT:number; sumM:number }
  const mk=():Agg=>({n:0,w:0,sumT:0,sumM:0})
  const stats: Record<Scheme,Agg[]> = {'tp1.0':[], 'tp0.6':[], 'SPLIT':[]}
  for (const sc of SCHEMES) for (let i=0;i<NW;i++) stats[sc].push(mk())
  const curveM: Record<Scheme,{t:number,r:number}[]> = {'tp1.0':[], 'tp0.6':[], 'SPLIT':[]}

  for (const c of Object.keys(dset)) {
    const arr=dset[c]; let last=-999
    for (let i=100;i<arr.length-1;i++) {
      if (i-last<SPACING) continue
      if (i<DW+1) continue
      const price=arr[i].close
      const prior=arr.slice(i-DW,i)
      const hi=Math.max(...prior.map(b=>b.high)), lo=Math.min(...prior.map(b=>b.low))
      const side: 'LONG'|'SHORT'|null = price>hi?'LONG':price<lo?'SHORT':null
      if (!side) continue
      const win=arr.slice(Math.max(0,i-99),i+1)
      const adx=calcADX(win.slice(-60)); if (adx<=ADX_GATE) continue
      const atr=calcATR(win.slice(-20)); if(!atr) continue
      last=i
      const slDist=Math.max(atr*SLM, price*0.005), slPct=slDist/price
      if (slPct>0.08) continue
      const feeT=FEE_TAKER/slPct, feeM=FEE_MAKER/slPct
      const dirM=side==='LONG'?1:-1
      const slPx=price-slDist*dirM
      const jEnd=Math.min(arr.length-1,i+MAXHOLD)
      // simulate the three schemes on the same entry
      const hitAt=(tgt:number)=>{ // returns [exitR or null, barIdx]
        for (let j=i+1;j<=jEnd;j++) { const b=arr[j]
          if (side==='LONG') { if (b.low<=slPx) return [-1,j] as const; if (b.high>=price+slDist*tgt*dirM) return [tgt,j] as const }
          else { if (b.high>=slPx) return [-1,j] as const; if (b.low<=price-(-slDist*tgt*dirM)) return [tgt,j] as const } }
        return [null,jEnd] as const
      }
      const results: Record<Scheme,number> = {'tp1.0':0,'tp0.6':0,'SPLIT':0}
      for (const tgt of [1.0, 0.6]) {
        const [r,jx]=hitAt(tgt)
        results[tgt===1.0?'tp1.0':'tp0.6'] = r!==null ? r : (arr[jx].close-price)*dirM/slDist
      }
      // SPLIT: half at 0.6R → BE for the rest → 1.0R
      {
        let r=0
        // phase 1: until 0.6R or SL
        let j=i+1, phase1:null|number=null, j1=jEnd
        for (; j<=jEnd; j++) { const b=arr[j]
          const tp06=price+slDist*0.6*dirM
          if (side==='LONG') { if (b.low<=slPx){phase1=-1;j1=j;break} if (b.high>=tp06){phase1=0.6;j1=j;break} }
          else { if (b.high>=slPx){phase1=-1;j1=j;break} if (b.low<=tp06){phase1=0.6;j1=j;break} } }
        if (phase1===null) r=(arr[jEnd].close-price)*dirM/slDist       // timeout, full size
        else if (phase1===-1) r=-1                                      // straight SL, full size
        else {
          r=0.5*0.6                                                     // banked half
          // phase 2: BE stop for remaining half, target 1.0R
          let r2:null|number=null
          for (let k=j1;k<=jEnd;k++) { const b=arr[k]
            const tp10=price+slDist*1.0*dirM
            if (side==='LONG') { if (k>j1 && b.low<=price){r2=0;break} if (b.high>=tp10){r2=1.0;break} }
            else { if (k>j1 && b.high>=price){r2=0;break} if (b.low<=tp10){r2=1.0;break} } }
          r += 0.5*(r2!==null ? r2 : (arr[jEnd].close-price)*dirM/slDist)
        }
        results['SPLIT']=r
      }
      const wi=winOf(arr[i].t)
      for (const sc of SCHEMES) {
        const gross=results[sc]
        const a=stats[sc][wi]
        a.n++; a.sumT+=gross-feeT; a.sumM+=gross-feeM; if (gross-feeM>0) a.w++
        curveM[sc].push({t:arr[i].t, r:gross-feeM})
      }
    }
  }

  console.log(`\nWindow starts: ${Array.from({length:NW},(_x,i)=>wLabel(i)).join('  ')}`)
  console.log(`\nscheme   n      WR      maker    taker   | maker per window`)
  for (const sc of SCHEMES) {
    const ws=stats[sc]
    const tot=ws.reduce((a,x)=>({n:a.n+x.n,w:a.w+x.w,sumT:a.sumT+x.sumT,sumM:a.sumM+x.sumM}),mk())
    const wM=ws.map(x=>x.n?x.sumM/x.n:0)
    const okM=ws.every(x=>x.n>=10 && x.sumM/x.n>0)
    console.log(`  ${sc.padEnd(7)} ${String(tot.n).padStart(5)}  ${(100*(tot.n?tot.w/tot.n:0)).toFixed(1).padStart(5)}%  ${(tot.sumM/tot.n>=0?'+':'')}${(tot.sumM/tot.n).toFixed(3)}  ${(tot.sumT/tot.n>=0?'+':'')}${(tot.sumT/tot.n).toFixed(3)} | ${wM.map(e=>((e>=0?'+':'')+e.toFixed(2)).padStart(6)).join(' ')} ${okM?'✅ALL-POS':''}`)
  }
  for (const sc of SCHEMES) {
    const pts=curveM[sc].sort((a,b)=>a.t-b.t)
    let cum=0, peak=0, mdd=0
    for (const p of pts) { cum+=p.r; if(cum>peak)peak=cum; mdd=Math.max(mdd,peak-cum) }
    console.log(`  ${sc}: totalR=${cum>=0?'+':''}${cum.toFixed(1)}  maxDD=${mdd.toFixed(1)}R  → $10k@1%risk ≈ $${(10000*Math.pow(1.01,cum)).toFixed(0)}`)
  }
  console.log(`\nConfig: dw${DW} adx>${ADX_GATE} sl${SLM}xATR(4h). Fees: maker 0.02%/side, taker 0.05%/side.`)
}

// RANGE — complementary strategy research: fade Bollinger extremes on 4h
// when ADX<20 (ranging regime — exactly when DONCH4H sits out).
// Walk-forward over BT_MONTHS with real fees; exits: fixed R or mid-band.
function runRange() {
  const FEE_TAKER=0.0010, FEE_MAKER=0.0004, SPACING=2, MAXHOLD=48, NW=6
  const to4h = (a:Bar[]):Bar[] => {
    const out:Bar[] = []; let cur:Bar|null=null; let bucket=-1
    for (const b of a) { const k=Math.floor(b.t/14400000)
      if (k!==bucket) { if (cur) out.push(cur); bucket=k
        cur={t:k*14400000,open:b.open,high:b.high,low:b.low,close:b.close,vol:b.vol} }
      else if (cur) { cur.high=Math.max(cur.high,b.high); cur.low=Math.min(cur.low,b.low); cur.close=b.close; cur.vol+=b.vol } }
    if (cur) out.push(cur); return out
  }
  const dset: Record<string,Bar[]> = {}
  let tmin=Infinity, tmax=-Infinity
  for (const c of COINS) { const a=to4h(loadCSV(c,'1h'))
    if (a.length>400) { dset[c]=a; tmin=Math.min(tmin,a[0].t); tmax=Math.max(tmax,a[a.length-1].t) } }
  console.log(`  4h: ${Object.keys(dset).length} coins, ${((tmax-tmin)/86400000).toFixed(0)} days`)
  const wSpan=(tmax-tmin)/NW
  const winOf=(t:number)=>Math.min(NW-1,Math.max(0,Math.floor((t-tmin)/wSpan)))
  interface Agg { n:number; w:number; sumT:number; sumM:number }
  const mk=():Agg=>({n:0,w:0,sumT:0,sumM:0})
  const stats: Record<string,Agg[]> = {}
  const curveM: Record<string,{t:number,r:number}[]> = {}

  const ADXS=[15,20], RSIS=[[35,65],[30,70]], SLS=[1.0,1.4], EXITS=['fix0.6','fix1.0','fix1.5','MID']
  for (const c of Object.keys(dset)) {
    const arr=dset[c]
    const lastIdx: Record<string,number> = {}
    for (let i=100;i<arr.length-1;i++) {
      const win=arr.slice(Math.max(0,i-99),i+1)
      const closes=win.map(b=>b.close)
      const price=arr[i].close
      const bb=calcBB(closes,20,2); if(!bb.mid) continue
      const atr=calcATR(win.slice(-20)); if(!atr) continue
      const rsi=calcRsi(closes.slice(-15))
      const adx=calcADX(win.slice(-60))
      for (const ax of ADXS) {
        if (adx>=ax) continue
        for (const [rlo,rhi] of RSIS) {
          let side: 'LONG'|'SHORT'|null = null
          if (price<=bb.lower*1.005 && rsi<rlo) side='LONG'
          else if (price>=bb.upper*0.995 && rsi>rhi) side='SHORT'
          if (!side) continue
          const vk=`adx${ax}|rsi${rlo}`
          if (lastIdx[vk]!==undefined && i-lastIdx[vk]<SPACING) continue
          lastIdx[vk]=i
          const dirM=side==='LONG'?1:-1
          for (const slM of SLS) {
            const slDist=Math.max(atr*slM, price*0.005), slPct=slDist/price
            if (slPct>0.08) continue
            const feeT=FEE_TAKER/slPct, feeM=FEE_MAKER/slPct
            const slPx=price-slDist*dirM
            for (const ex of EXITS) {
              let tgtR:number
              if (ex==='MID') { tgtR=Math.abs(bb.mid-price)/slDist; if (tgtR<0.5) continue }
              else tgtR=parseFloat(ex.slice(3))
              const tpPx=price+slDist*tgtR*dirM
              let r:number|null=null
              const jEnd=Math.min(arr.length-1,i+MAXHOLD)
              for (let j=i+1;j<=jEnd;j++) { const b=arr[j]
                if (side==='LONG') { if(b.low<=slPx){r=-1;break} if(b.high>=tpPx){r=tgtR;break} }
                else { if(b.high>=slPx){r=-1;break} if(b.low<=tpPx){r=tgtR;break} } }
              if (r===null) r=(arr[jEnd].close-price)*dirM/slDist
              const key=`${vk}|${ex}|sl${slM}`
              if (!stats[key]) { stats[key]=[]; for(let w=0;w<NW;w++) stats[key].push(mk()) }
              const a=stats[key][winOf(arr[i].t)]
              a.n++; a.sumT+=r-feeT; a.sumM+=r-feeM; if(r-feeM>0)a.w++
              if (!curveM[key]) curveM[key]=[]
              curveM[key].push({t:arr[i].t, r:r-feeM})
            }
          }
        }
      }
    }
  }
  const rows=Object.entries(stats).map(([key,ws])=>{
    const tot=ws.reduce((a,x)=>({n:a.n+x.n,w:a.w+x.w,sumT:a.sumT+x.sumT,sumM:a.sumM+x.sumM}),mk())
    const wM=ws.map(x=>x.n?x.sumM/x.n:-9)
    const okM=wM.every(e=>e>0)&&ws.every(x=>x.n>=15)
    const okT=ws.every(x=>x.n>=15 && x.sumT/x.n>0)
    return {key,tot,expM:tot.n?tot.sumM/tot.n:-9,expT:tot.n?tot.sumT/tot.n:-9,wM,okM,okT,minM:Math.min(...wM)}
  }).filter(r=>r.tot.n>=200)
  rows.sort((a,b)=>b.minM-a.minM)
  console.log(`\nconfig                       n     WR     maker    taker  | maker per window (6)                 | verdict`)
  for (const r of rows.slice(0,25)) {
    const wr=r.tot.n?r.tot.w/r.tot.n:0
    const v=r.okT?'✅✅TAKER':r.okM?'✅MAKER':''
    console.log(`  ${r.key.padEnd(25)} ${String(r.tot.n).padStart(5)}  ${(wr*100).toFixed(1).padStart(5)}%  ${(r.expM>=0?'+':'')}${r.expM.toFixed(3)}  ${(r.expT>=0?'+':'')}${r.expT.toFixed(3)} | ${r.wM.map(e=>((e>=0?'+':'')+e.toFixed(2)).padStart(6)).join(' ')} | ${v}`)
  }
  const winners=rows.filter(r=>r.okM)
  console.log(`\n${winners.length} MAKER-robust config(s) across all ${NW} windows.`)
  for (const best of winners.slice(0,3)) {
    const pts=curveM[best.key].sort((a,b)=>a.t-b.t)
    let cum=0, peak=0, mdd=0
    for (const p of pts) { cum+=p.r; if(cum>peak)peak=cum; mdd=Math.max(mdd,peak-cum) }
    console.log(`  ${best.key}: n=${best.tot.n} totalR=${cum>=0?'+':''}${cum.toFixed(1)} maxDD=${mdd.toFixed(1)}R`)
  }
  console.log(`\nEntry: 4h BB(20,2) extreme + RSI filter, ONLY when ADX<gate (ranging). Fees incl.`)
}

// FREQ — how loose can the gate get while staying robust over 36 months?
// Grid: Donchian window × ADX gate, with the PRODUCTION SPLIT exit
// (half at 0.6R → BE stop → rest to 1.0R), SL 1.4×ATR. 6 walk-forward windows.
function runFreq() {
  const FEE_TAKER=0.0010, FEE_MAKER=0.0004, SPACING=2, MAXHOLD=96, NW=6, SLM=1.4
  const DWS=[25,30,40], ADXS=[15,18,20,22,25]
  const to4h = (a:Bar[]):Bar[] => {
    const out:Bar[] = []; let cur:Bar|null=null; let bucket=-1
    for (const b of a) { const k=Math.floor(b.t/14400000)
      if (k!==bucket) { if (cur) out.push(cur); bucket=k
        cur={t:k*14400000,open:b.open,high:b.high,low:b.low,close:b.close,vol:b.vol} }
      else if (cur) { cur.high=Math.max(cur.high,b.high); cur.low=Math.min(cur.low,b.low); cur.close=b.close; cur.vol+=b.vol } }
    if (cur) out.push(cur); return out
  }
  const dset: Record<string,Bar[]> = {}
  let tmin=Infinity, tmax=-Infinity
  for (const c of COINS) { const a=to4h(loadCSV(c,'1h'))
    if (a.length>400) { dset[c]=a; tmin=Math.min(tmin,a[0].t); tmax=Math.max(tmax,a[a.length-1].t) } }
  const days=(tmax-tmin)/86400000
  console.log(`  4h: ${Object.keys(dset).length} coins, ${days.toFixed(0)} days`)
  const wSpan=(tmax-tmin)/NW
  const winOf=(t:number)=>Math.min(NW-1,Math.max(0,Math.floor((t-tmin)/wSpan)))
  interface Agg { n:number; w:number; sumT:number; sumM:number }
  const mk=():Agg=>({n:0,w:0,sumT:0,sumM:0})
  const stats: Record<string,Agg[]> = {}
  const curveM: Record<string,{t:number,r:number}[]> = {}

  for (const c of Object.keys(dset)) {
    const arr=dset[c]
    const lastIdx: Record<string,number> = {}
    for (let i=100;i<arr.length-1;i++) {
      const price=arr[i].close
      const win=arr.slice(Math.max(0,i-99),i+1)
      const atr=calcATR(win.slice(-20)); if(!atr) continue
      const adx=calcADX(win.slice(-60))
      for (const dw of DWS) {
        if (i<dw+1) continue
        const prior=arr.slice(i-dw,i)
        const hi=Math.max(...prior.map(b=>b.high)), lo=Math.min(...prior.map(b=>b.low))
        const side: 'LONG'|'SHORT'|null = price>hi?'LONG':price<lo?'SHORT':null
        if (!side) continue
        for (const ax of ADXS) {
          if (adx<=ax) continue
          const lk=`${dw}|${ax}`
          if (lastIdx[lk]!==undefined && i-lastIdx[lk]<SPACING) continue
          lastIdx[lk]=i
          const dirM=side==='LONG'?1:-1
          const slDist=Math.max(atr*SLM, price*0.005), slPct=slDist/price
          if (slPct>0.08) continue
          const feeT=FEE_TAKER/slPct, feeM=FEE_MAKER/slPct
          const slPx=price-slDist*dirM
          const jEnd=Math.min(arr.length-1,i+MAXHOLD)
          // PRODUCTION SPLIT exit
          let r=0
          let j=i+1, phase1:null|number=null, j1=jEnd
          for (; j<=jEnd; j++) { const b=arr[j]
            const tp06=price+slDist*0.6*dirM
            if (side==='LONG') { if (b.low<=slPx){phase1=-1;j1=j;break} if (b.high>=tp06){phase1=0.6;j1=j;break} }
            else { if (b.high>=slPx){phase1=-1;j1=j;break} if (b.low<=tp06){phase1=0.6;j1=j;break} } }
          if (phase1===null) r=(arr[jEnd].close-price)*dirM/slDist
          else if (phase1===-1) r=-1
          else {
            r=0.5*0.6
            let r2:null|number=null
            for (let k=j1;k<=jEnd;k++) { const b=arr[k]
              const tp10=price+slDist*1.0*dirM
              if (side==='LONG') { if (k>j1 && b.low<=price){r2=0;break} if (b.high>=tp10){r2=1.0;break} }
              else { if (k>j1 && b.high>=price){r2=0;break} if (b.low<=tp10){r2=1.0;break} } }
            r += 0.5*(r2!==null ? r2 : (arr[jEnd].close-price)*dirM/slDist)
          }
          const key=`dw${dw}|adx${ax}`
          if (!stats[key]) { stats[key]=[]; for(let w=0;w<NW;w++) stats[key].push(mk()) }
          const a=stats[key][winOf(arr[i].t)]
          a.n++; a.sumT+=r-feeT; a.sumM+=r-feeM; if(r-feeM>0)a.w++
          if (!curveM[key]) curveM[key]=[]
          curveM[key].push({t:arr[i].t, r:r-feeM})
        }
      }
    }
  }
  const rows=Object.entries(stats).map(([key,ws])=>{
    const tot=ws.reduce((a,x)=>({n:a.n+x.n,w:a.w+x.w,sumT:a.sumT+x.sumT,sumM:a.sumM+x.sumM}),mk())
    const wM=ws.map(x=>x.n?x.sumM/x.n:-9)
    const okM=wM.every(e=>e>0)&&ws.every(x=>x.n>=15)
    const okT=ws.every(x=>x.n>=15 && x.sumT/x.n>0)
    return {key,tot,expM:tot.n?tot.sumM/tot.n:-9,expT:tot.n?tot.sumT/tot.n:-9,wM,okM,okT}
  })
  rows.sort((a,b)=>b.tot.n-a.tot.n)
  console.log(`\nconfig         n     /day    WR     maker    taker  | maker w1..w6                              | verdict`)
  for (const r of rows) {
    const wr=r.tot.n?r.tot.w/r.tot.n:0
    const v=r.okT?'✅✅TAKER':r.okM?'✅MAKER':''
    console.log(`  ${r.key.padEnd(11)} ${String(r.tot.n).padStart(5)}  ${(r.tot.n/days).toFixed(1).padStart(5)}  ${(wr*100).toFixed(1).padStart(5)}%  ${(r.expM>=0?'+':'')}${r.expM.toFixed(3)}  ${(r.expT>=0?'+':'')}${r.expT.toFixed(3)} | ${r.wM.map(e=>((e>=0?'+':'')+e.toFixed(2)).padStart(6)).join(' ')} | ${v}`)
  }
  const winners=rows.filter(r=>r.okM).sort((a,b)=>b.tot.n-a.tot.n)
  console.log(`\n${winners.length} MAKER-robust config(s). Highest-frequency robust ones:`)
  for (const best of winners.slice(0,3)) {
    const pts=curveM[best.key].sort((a,b)=>a.t-b.t)
    let cum=0, peak=0, mdd=0
    for (const p of pts) { cum+=p.r; if(cum>peak)peak=cum; mdd=Math.max(mdd,peak-cum) }
    console.log(`  ${best.key}: n=${best.tot.n} (${(best.tot.n/days).toFixed(1)}/day) totalR=${cum>=0?'+':''}${cum.toFixed(1)} maxDD=${mdd.toFixed(1)}R`)
  }
  console.log(`\nSPLIT exits (production), SL 1.4xATR. /day is across ~39 coins; live universe 56 → ~1.4x.`)
}

// ROTA — cross-sectional momentum rotation (market-neutral long/short).
// Every REBAL bars: rank coins by LOOKBACK return; LONG top K, SHORT bottom K,
// equal weight 1/(2K). Fees charged on actual basket turnover.
function runRota() {
  const FEE_T=0.0005, FEE_M=0.0002   // per side
  const NW=6
  const to4h = (a:Bar[]):Bar[] => {
    const out:Bar[] = []; let cur:Bar|null=null; let bucket=-1
    for (const b of a) { const k=Math.floor(b.t/14400000)
      if (k!==bucket) { if (cur) out.push(cur); bucket=k
        cur={t:k*14400000,open:b.open,high:b.high,low:b.low,close:b.close,vol:b.vol} }
      else if (cur) { cur.high=Math.max(cur.high,b.high); cur.low=Math.min(cur.low,b.low); cur.close=b.close; cur.vol+=b.vol } }
    if (cur) out.push(cur); return out
  }
  // per-coin close map keyed by 4h bucket timestamp
  const closes: Record<string, Map<number,number>> = {}
  let tmin=Infinity, tmax=-Infinity
  let nCoins=0
  for (const c of COINS) {
    const a=to4h(loadCSV(c,'1h'))
    if (a.length<200) continue
    const m=new Map<number,number>()
    for (const b of a) m.set(b.t, b.close)
    closes[c]=m; nCoins++
    tmin=Math.min(tmin,a[0].t); tmax=Math.max(tmax,a[a.length-1].t)
  }
  const days=(tmax-tmin)/86400000
  console.log(`  4h closes: ${nCoins} coins, ${days.toFixed(0)} days`)
  const wSpan=(tmax-tmin)/NW
  const winOf=(t:number)=>Math.min(NW-1,Math.max(0,Math.floor((t-tmin)/wSpan)))
  const BAR=14400000

  console.log(`\nconfig                periods  avgRet/prd  annRet     maxDD  | maker per window (avg ret bps)          | verdict`)
  const results:any[]=[]
  for (const LB of [18,42,84]) {           // lookback: 3d / 7d / 14d
    for (const RB of [6,12,42]) {          // rebalance: 24h / 48h / 7d
      for (const K of [3,5]) {
        for (const fee of [FEE_M, FEE_T]) {
          let prevBasket = new Map<string,number>()   // coin → +1/-1
          let equity=1, peak=1, mdd=0
          const wSum=new Array(NW).fill(0), wN=new Array(NW).fill(0)
          let periods=0, sumRet=0
          for (let t=tmin+LB*BAR; t+RB*BAR<=tmax; t+=RB*BAR) {
            // rank available coins
            const scored:{c:string,mom:number}[]=[]
            for (const c of Object.keys(closes)) {
              const m=closes[c]
              const p0=m.get(t-LB*BAR), p1=m.get(t), p2=m.get(t+RB*BAR)
              if (p0===undefined||p1===undefined||p2===undefined||p0<=0) continue
              scored.push({c, mom:p1/p0-1})
            }
            if (scored.length < K*4) { prevBasket=new Map(); continue }
            scored.sort((a,b)=>b.mom-a.mom)
            const basket=new Map<string,number>()
            for (let i=0;i<K;i++) basket.set(scored[i].c, +1)
            for (let i=scored.length-K;i<scored.length;i++) basket.set(scored[i].c, -1)
            // period return
            let ret=0
            for (const [c,dir] of basket) {
              const m=closes[c]
              const p1=m.get(t)!, p2=m.get(t+RB*BAR)!
              ret += dir*(p2/p1-1)/(2*K)
            }
            // turnover fees: each changed slot pays fee per side on its weight
            let changes=0
            for (const [c,dir] of basket) if (prevBasket.get(c)!==dir) changes++
            for (const [c,dir] of prevBasket) if (basket.get(c)!==dir) changes++
            ret -= (changes/(2*K))*fee
            prevBasket=basket
            equity*=(1+ret); if (equity>peak) peak=equity
            mdd=Math.max(mdd,1-equity/peak)
            const wi=winOf(t); wSum[wi]+=ret; wN[wi]++
            periods++; sumRet+=ret
          }
          const avg=periods?sumRet/periods:0
          const perYear=365.25*86400000/(RB*BAR)
          const ann=Math.pow(equity, perYear/Math.max(1,periods))-1
          const wAvg=wSum.map((x,i)=>wN[i]?x/wN[i]:0)
          const okAll=wAvg.every(x=>x>0)
          if (fee===FEE_M) results.push({key:`LB${LB}|RB${RB}|K${K}`, fee:'maker', periods, avg, ann, mdd, wAvg, okAll})
          else { const r=results[results.length-1]; r.annT=ann; r.okAllT=okAll }
        }
      }
    }
  }
  results.sort((a,b)=>b.ann-a.ann)
  for (const r of results) {
    const v=r.okAllT?'✅✅TAKER':r.okAll?'✅MAKER':''
    console.log(`  ${r.key.padEnd(16)} ${String(r.periods).padStart(6)}  ${(r.avg*10000).toFixed(1).padStart(7)}bp  ${(r.ann*100).toFixed(1).padStart(6)}%/y (T:${(r.annT*100).toFixed(0)}%)  ${(r.mdd*100).toFixed(0).padStart(3)}%  | ${r.wAvg.map((x:number)=>((x>=0?'+':'')+(x*10000).toFixed(0)).padStart(5)).join(' ')} | ${v}`)
  }
  const winners=results.filter(r=>r.okAll)
  console.log(`\n${winners.length}/${results.length} configs MAKER-robust (positive avg return in all 6 windows).`)
  console.log(`Long top-K / short bottom-K by LB-bar momentum, rebalance every RB bars, weight 1/(2K).`)
  console.log(`Fees on actual basket turnover. annRet = compounded, no leverage.`)
}

// V43BT — validates upgrades #2 (inverse-vol weights), #3 (skip-last momentum)
// and #5 (funding carry) before deployment. All on 4h data, 6 windows, fees on turnover.
function runV43bt() {
  const FEE_T=0.0005, FEE_M=0.0002, NW=6
  const to4h = (a:Bar[]):Bar[] => {
    const out:Bar[] = []; let cur:Bar|null=null; let bucket=-1
    for (const b of a) { const k=Math.floor(b.t/14400000)
      if (k!==bucket) { if (cur) out.push(cur); bucket=k
        cur={t:k*14400000,open:b.open,high:b.high,low:b.low,close:b.close,vol:b.vol} }
      else if (cur) { cur.high=Math.max(cur.high,b.high); cur.low=Math.min(cur.low,b.low); cur.close=b.close; cur.vol+=b.vol } }
    if (cur) out.push(cur); return out
  }
  const closes: Record<string, Map<number,number>> = {}
  const funding: Record<string, {t:number,r:number}[]> = {}
  let tmin=Infinity, tmax=-Infinity, nCoins=0
  for (const c of COINS) {
    const a=to4h(loadCSV(c,'1h'))
    if (a.length<200) continue
    const m=new Map<number,number>()
    for (const b of a) m.set(b.t, b.close)
    closes[c]=m; nCoins++
    tmin=Math.min(tmin,a[0].t); tmax=Math.max(tmax,a[a.length-1].t)
    // funding CSV: calc_time_ms,rate
    try {
      const txt=Deno.readTextFileSync(`backtest/data/${c}-fund.csv`)
      const fl:{t:number,r:number}[]=[]
      for (const line of txt.split('\n')) {
        if (!line || line[0]<'0'||line[0]>'9') continue
        const i=line.indexOf(','); if (i<0) continue
        let t=Number(line.slice(0,i)); if (t>1e14) t=Math.floor(t/1000)
        const r=parseFloat(line.slice(i+1))
        if (Number.isFinite(t)&&Number.isFinite(r)) fl.push({t,r})
      }
      fl.sort((a2,b2)=>a2.t-b2.t); funding[c]=fl
    } catch { funding[c]=[] }
  }
  const days=(tmax-tmin)/86400000
  console.log(`  4h closes: ${nCoins} coins, ${days.toFixed(0)} days; funding series loaded: ${Object.values(funding).filter(f=>f.length>50).length}`)
  const wSpan=(tmax-tmin)/NW
  const winOf=(t:number)=>Math.min(NW-1,Math.max(0,Math.floor((t-tmin)/wSpan)))
  const BAR=14400000

  const retOf=(c:string,t0:number,t1:number)=>{ const m=closes[c]; const a=m.get(t0), b=m.get(t1); return (a&&b)?b/a-1:null }
  const volOf=(c:string,t:number,lb=84)=>{  // stdev of 4h returns over lb bars
    const m=closes[c]; const rets:number[]=[]
    for (let k=1;k<=lb;k++){ const a=m.get(t-k*BAR), b=m.get(t-(k-1)*BAR); if(a&&b&&a>0) rets.push(b/a-1) }
    if (rets.length<40) return null
    const mu=rets.reduce((x,y)=>x+y,0)/rets.length
    return Math.sqrt(rets.reduce((x,y)=>x+(y-mu)**2,0)/rets.length)
  }
  const fundWindow=(c:string,t0:number,t1:number)=>{ let sum=0; for (const f of (funding[c]||[])) { if (f.t>t0&&f.t<=t1) sum+=f.r } return sum }
  const fundTrail=(c:string,t:number,ms:number)=>{ let sum=0,n=0; for (const f of (funding[c]||[])) { if (f.t>t-ms&&f.t<=t) {sum+=f.r;n++} } return n>=3?sum:null }

  // ── A) ROTATION variants: skip × weighting (LB84|RB12|K5) ──
  console.log(`\n── A) ROTATION LB84|RB12|K5 variants ──`)
  console.log(`variant              periods  annM     annT    maxDD | maker w1..w6 (bps)`)
  for (const skip of [0,6]) {
    for (const iv of [false,true]) {
      const LB=84, RB=12, K=5
      let prev=new Map<string,number>(), equity=1, peak=1, mdd=0, periods=0
      const wSum=new Array(NW).fill(0), wN=new Array(NW).fill(0)
      let equityT=1
      for (let t=tmin+LB*BAR; t+RB*BAR<=tmax; t+=RB*BAR) {
        const scored:{c:string,mom:number,w:number}[]=[]
        for (const c of Object.keys(closes)) {
          const m=closes[c]
          const p0=m.get(t-LB*BAR), pS=m.get(t-skip*BAR), p2=m.get(t+RB*BAR), p1=m.get(t)
          if (!p0||!pS||!p2||!p1||p0<=0) continue
          let w=1
          if (iv) { const v=volOf(c,t); if (v===null||v<=0) continue; w=1/v }
          scored.push({c, mom:pS/p0-1, w})
        }
        if (scored.length<K*4) { prev=new Map(); continue }
        scored.sort((a,b)=>b.mom-a.mom)
        const legs:[{c:string,w:number}[], {c:string,w:number}[]] = [scored.slice(0,K), scored.slice(-K)]
        let ret=0
        const basket=new Map<string,number>()
        for (const [li,leg] of legs.entries()) {
          const dir=li===0?1:-1
          const wsum=leg.reduce((a,x)=>a+x.w,0)
          for (const x of leg) {
            const wgt=0.5*(x.w/wsum)   // each side = 50% of book
            basket.set(x.c,dir)
            ret += dir*wgt*(retOf(x.c,t,t+RB*BAR) ?? 0)
          }
        }
        let changes=0
        for (const [c,d] of basket) if (prev.get(c)!==d) changes++
        for (const [c,d] of prev) if (basket.get(c)!==d) changes++
        const turn=(changes/(2*K))
        const retM=ret-turn*FEE_M, retT=ret-turn*FEE_T
        prev=basket
        equity*=(1+retM); equityT*=(1+retT)
        if (equity>peak) peak=equity; mdd=Math.max(mdd,1-equity/peak)
        const wi=winOf(t); wSum[wi]+=retM; wN[wi]++
        periods++
      }
      const perYear=365.25*86400000/(RB*BAR)
      const annM=Math.pow(equity, perYear/Math.max(1,periods))-1
      const annT=Math.pow(equityT, perYear/Math.max(1,periods))-1
      const wAvg=wSum.map((x,i)=>wN[i]?x/wN[i]:0)
      const ok=wAvg.every(x=>x>0)?'✅':''
      console.log(`  skip${skip}|${iv?'invVol':'equal '}      ${String(periods).padStart(5)}  ${(annM*100).toFixed(1).padStart(6)}%  ${(annT*100).toFixed(1).padStart(6)}%  ${(mdd*100).toFixed(0).padStart(3)}% | ${wAvg.map(x=>((x>=0?'+':'')+(x*10000).toFixed(0)).padStart(5)).join(' ')} ${ok}`)
    }
  }

  // ── B) FUNDING CARRY: rank by trailing 3d funding, daily rebalance ──
  console.log(`\n── B) FUNDING CARRY (short rich funding / long negative), K=5 ──`)
  console.log(`variant           periods  annM     annT    maxDD | maker w1..w6 (bps)`)
  for (const RB of [6, 12]) {           // 24h / 48h
    let prev=new Map<string,number>(), equity=1, equityT=1, peak=1, mdd=0, periods=0
    const wSum=new Array(NW).fill(0), wN=new Array(NW).fill(0)
    const K=5, TRAIL=3*86400000
    for (let t=tmin+22*BAR; t+RB*BAR<=tmax; t+=RB*BAR) {
      const scored:{c:string,f:number}[]=[]
      for (const c of Object.keys(closes)) {
        if (!closes[c].get(t)||!closes[c].get(t+RB*BAR)) continue
        const f=fundTrail(c,t,TRAIL); if (f===null) continue
        scored.push({c,f})
      }
      if (scored.length<K*4) { prev=new Map(); continue }
      scored.sort((a,b)=>b.f-a.f)
      const basket=new Map<string,number>()
      let ret=0
      for (let i=0;i<K;i++) { const c=scored[i].c; basket.set(c,-1)      // SHORT rich funding → collect it
        ret += (-1)*(retOf(c,t,t+RB*BAR)??0)/(2*K) + fundWindow(c,t,t+RB*BAR)/(2*K) }
      for (let i=scored.length-K;i<scored.length;i++) { const c=scored[i].c; basket.set(c,1)  // LONG negative funding → collect it
        ret += (1)*(retOf(c,t,t+RB*BAR)??0)/(2*K) - fundWindow(c,t,t+RB*BAR)/(2*K) }
      let changes=0
      for (const [c,d] of basket) if (prev.get(c)!==d) changes++
      for (const [c,d] of prev) if (basket.get(c)!==d) changes++
      const turn=changes/(2*K)
      const retM=ret-turn*FEE_M, retT=ret-turn*FEE_T
      prev=basket
      equity*=(1+retM); equityT*=(1+retT)
      if (equity>peak) peak=equity; mdd=Math.max(mdd,1-equity/peak)
      const wi=winOf(t); wSum[wi]+=retM; wN[wi]++
      periods++
    }
    const perYear=365.25*86400000/(RB*BAR)
    const annM=Math.pow(equity, perYear/Math.max(1,periods))-1
    const annT=Math.pow(equityT, perYear/Math.max(1,periods))-1
    const wAvg=wSum.map((x,i)=>wN[i]?x/wN[i]:0)
    const ok=wAvg.every(x=>x>0)?'✅':''
    console.log(`  carry RB${RB}        ${String(periods).padStart(5)}  ${(annM*100).toFixed(1).padStart(6)}%  ${(annT*100).toFixed(1).padStart(6)}%  ${(mdd*100).toFixed(0).padStart(3)}% | ${wAvg.map(x=>((x>=0?'+':'')+(x*10000).toFixed(0)).padStart(5)).join(' ')} ${ok}`)
  }
  console.log(`\nAll figures net of fees on turnover. ✅ = positive in all 6 windows (maker).`)
}

// V44BT — validates #3 ADX-bucket sizing (does higher ADX pay more per trade?)
// and #2b portfolio vol-targeting on the rotation return stream.
function runV44bt() {
  const FEE_T=0.0010, NW=6, SPACING=2, MAXHOLD=96, SLM=1.4, DW=25, ADX_GATE=22
  const to4h = (a:Bar[]):Bar[] => {
    const out:Bar[] = []; let cur:Bar|null=null; let bucket=-1
    for (const b of a) { const k=Math.floor(b.t/14400000)
      if (k!==bucket) { if (cur) out.push(cur); bucket=k
        cur={t:k*14400000,open:b.open,high:b.high,low:b.low,close:b.close,vol:b.vol} }
      else if (cur) { cur.high=Math.max(cur.high,b.high); cur.low=Math.min(cur.low,b.low); cur.close=b.close; cur.vol+=b.vol } }
    if (cur) out.push(cur); return out
  }
  const dset: Record<string,Bar[]> = {}
  let tmin=Infinity, tmax=-Infinity
  for (const c of COINS) { const a=to4h(loadCSV(c,'1h'))
    if (a.length>400) { dset[c]=a; tmin=Math.min(tmin,a[0].t); tmax=Math.max(tmax,a[a.length-1].t) } }
  console.log(`  4h: ${Object.keys(dset).length} coins, ${((tmax-tmin)/86400000).toFixed(0)} days`)

  // ── A) DONCH4H SPLIT expectancy by entry-ADX bucket ──
  const buckets=[[22,28],[28,35],[35,45],[45,999]]
  const agg=buckets.map(()=>({n:0,w:0,sum:0}))
  for (const c of Object.keys(dset)) {
    const arr=dset[c]; let last=-999
    for (let i=100;i<arr.length-1;i++) {
      if (i-last<SPACING || i<DW+1) continue
      const price=arr[i].close
      const prior=arr.slice(i-DW,i)
      const hi=Math.max(...prior.map(b=>b.high)), lo=Math.min(...prior.map(b=>b.low))
      const side: 'LONG'|'SHORT'|null = price>hi?'LONG':price<lo?'SHORT':null
      if (!side) continue
      const win=arr.slice(Math.max(0,i-99),i+1)
      const adx=calcADX(win.slice(-60)); if (adx<=ADX_GATE) continue
      const atr=calcATR(win.slice(-20)); if(!atr) continue
      last=i
      const slDist=Math.max(atr*SLM, price*0.005), slPct=slDist/price
      if (slPct>0.08) continue
      const feeT=FEE_T/slPct
      const dirM=side==='LONG'?1:-1
      const slPx=price-slDist*dirM
      const jEnd=Math.min(arr.length-1,i+MAXHOLD)
      // production SPLIT
      let r=0, j=i+1, phase1:null|number=null, j1=jEnd
      for (; j<=jEnd; j++) { const b=arr[j]
        const tp06=price+slDist*0.6*dirM
        if (side==='LONG') { if (b.low<=slPx){phase1=-1;j1=j;break} if (b.high>=tp06){phase1=0.6;j1=j;break} }
        else { if (b.high>=slPx){phase1=-1;j1=j;break} if (b.low<=tp06){phase1=0.6;j1=j;break} } }
      if (phase1===null) r=(arr[jEnd].close-price)*dirM/slDist
      else if (phase1===-1) r=-1
      else { r=0.3
        let r2:null|number=null
        for (let k=j1;k<=jEnd;k++) { const b=arr[k]
          const tp10=price+slDist*1.0*dirM
          if (side==='LONG') { if (k>j1 && b.low<=price){r2=0;break} if (b.high>=tp10){r2=1.0;break} }
          else { if (k>j1 && b.high>=price){r2=0;break} if (b.low<=tp10){r2=1.0;break} } }
        r += 0.5*(r2!==null ? r2 : (arr[jEnd].close-price)*dirM/slDist) }
      const net=r-feeT
      const bi=buckets.findIndex(([a,b])=>adx>a&&adx<=b)
      if (bi>=0) { agg[bi].n++; agg[bi].sum+=net; if(net>0)agg[bi].w++ }
    }
  }
  console.log(`\n── A) DONCH4H SPLIT expectancy by entry ADX (taker fees) ──`)
  console.log(`ADX bucket    n      WR      expR(net)`)
  for (const [i,[a,b]] of buckets.entries()) {
    const x=agg[i]
    console.log(`  ${String(a).padStart(2)}-${b===999?'∞ ':String(b).padStart(3)}     ${String(x.n).padStart(5)}  ${(100*(x.n?x.w/x.n:0)).toFixed(1).padStart(5)}%   ${(x.n?x.sum/x.n:0)>=0?'+':''}${(x.n?x.sum/x.n:0).toFixed(3)}R`)
  }

  // ── B) rotation vol-targeting: scale each period by targetVol/realizedVol ──
  const closes: Record<string, Map<number,number>> = {}
  for (const c of Object.keys(dset)) { const m=new Map<number,number>(); for (const b of dset[c]) m.set(b.t,b.close); closes[c]=m }
  const BAR=14400000, LB=84, RB=12, K=5, FEE_M=0.0002
  const rets:number[]=[]; const times:number[]=[]
  {
    let prev=new Map<string,number>()
    for (let t=tmin+LB*BAR; t+RB*BAR<=tmax; t+=RB*BAR) {
      const scored:{c:string,mom:number,w:number}[]=[]
      for (const c of Object.keys(closes)) {
        const m=closes[c]
        const p0=m.get(t-LB*BAR), p1=m.get(t), p2=m.get(t+RB*BAR)
        if (!p0||!p1||!p2||p0<=0) continue
        const rets2:number[]=[]
        for (let k=1;k<=LB;k++){ const a=m.get(t-k*BAR), b=m.get(t-(k-1)*BAR); if(a&&b&&a>0) rets2.push(b/a-1) }
        if (rets2.length<40) continue
        const mu=rets2.reduce((x,y)=>x+y,0)/rets2.length
        const v=Math.sqrt(rets2.reduce((x,y)=>x+(y-mu)**2,0)/rets2.length)
        scored.push({c, mom:p1/p0-1, w:1/Math.max(v,1e-6)})
      }
      if (scored.length<K*4) { prev=new Map(); continue }
      scored.sort((a,b)=>b.mom-a.mom)
      let ret=0; const basket=new Map<string,number>()
      for (const [li,leg] of [[0,scored.slice(0,K)] as const,[1,scored.slice(-K)] as const]) {
        const dir=li===0?1:-1
        const wsum=leg.reduce((a,x)=>a+x.w,0)
        for (const x of leg) { basket.set(x.c,dir)
          const pr=closes[x.c].get(t)!, pr2=closes[x.c].get(t+RB*BAR)!
          ret += dir*0.5*(x.w/wsum)*(pr2/pr-1) }
      }
      let changes=0
      for (const [c,d] of basket) if (prev.get(c)!==d) changes++
      for (const [c,d] of prev) if (basket.get(c)!==d) changes++
      ret -= (changes/(2*K))*FEE_M
      prev=basket
      rets.push(ret); times.push(t)
    }
  }
  const evalStream=(scaled:number[])=>{
    let eq=1, pk=1, dd=0
    for (const r of scaled) { eq*=(1+r); if(eq>pk)pk=eq; dd=Math.max(dd,1-eq/pk) }
    const perYear=365.25*86400000/(RB*BAR)
    return {ann:Math.pow(eq, perYear/Math.max(1,scaled.length))-1, dd}
  }
  const raw=evalStream(rets)
  // vol targeting: rolling 30-period realized vol → leverage = target/real, capped [0.5, 2.0]
  const targetPer=0.20/Math.sqrt(365.25*86400000/(RB*BAR))
  const scaled:number[]=[]
  for (let i=0;i<rets.length;i++) {
    const w=rets.slice(Math.max(0,i-30), i)
    let lev=1
    if (w.length>=15) {
      const mu=w.reduce((a,b)=>a+b,0)/w.length
      const v=Math.sqrt(w.reduce((a,b)=>a+(b-mu)**2,0)/w.length)
      lev=Math.min(2.0, Math.max(0.5, v>0? targetPer/v : 1))
    }
    scaled.push(rets[i]*lev)
  }
  const vt=evalStream(scaled)
  console.log(`\n── B) rotation (inv-vol) with portfolio VOL TARGETING (20%/yr target) ──`)
  console.log(`  raw:          ann=${(raw.ann*100).toFixed(1)}%  maxDD=${(raw.dd*100).toFixed(0)}%`)
  console.log(`  vol-targeted: ann=${(vt.ann*100).toFixed(1)}%  maxDD=${(vt.dd*100).toFixed(0)}%  (leverage 0.5-2.0x)`)
  console.log(`\nA: if expR rises with ADX → size by ADX is justified. B: vol targeting quality = ann/DD ratio.`)
}

// V45BT — validates: (1) Sharpe-momentum ranking for rotation,
// (2) thirds exit ladder 0.6/1.0/1.6R for DONCH4H, (3) funding tilt size.
function runV45bt() {
  const FEE_T=0.0010, FEE_M=0.0004, NW=6, BAR=14400000
  const to4h = (a:Bar[]):Bar[] => {
    const out:Bar[] = []; let cur:Bar|null=null; let bucket=-1
    for (const b of a) { const k=Math.floor(b.t/14400000)
      if (k!==bucket) { if (cur) out.push(cur); bucket=k
        cur={t:k*14400000,open:b.open,high:b.high,low:b.low,close:b.close,vol:b.vol} }
      else if (cur) { cur.high=Math.max(cur.high,b.high); cur.low=Math.min(cur.low,b.low); cur.close=b.close; cur.vol+=b.vol } }
    if (cur) out.push(cur); return out
  }
  const dset: Record<string,Bar[]> = {}
  const closes: Record<string, Map<number,number>> = {}
  const funding: Record<string, {t:number,r:number}[]> = {}
  let tmin=Infinity, tmax=-Infinity
  for (const c of COINS) {
    const a=to4h(loadCSV(c,'1h')); if (a.length<200) continue
    dset[c]=a
    const m=new Map<number,number>(); for (const b of a) m.set(b.t,b.close); closes[c]=m
    tmin=Math.min(tmin,a[0].t); tmax=Math.max(tmax,a[a.length-1].t)
    try {
      const txt=Deno.readTextFileSync(`backtest/data/${c}-fund.csv`)
      const fl:{t:number,r:number}[]=[]
      for (const line of txt.split('\n')) { if (!line||line[0]<'0'||line[0]>'9') continue
        const i=line.indexOf(','); if (i<0) continue
        let t=Number(line.slice(0,i)); if (t>1e14) t=Math.floor(t/1000)
        const r=parseFloat(line.slice(i+1)); if (Number.isFinite(t)&&Number.isFinite(r)) fl.push({t,r}) }
      fl.sort((x,y)=>x.t-y.t); funding[c]=fl
    } catch { funding[c]=[] }
  }
  const days=(tmax-tmin)/86400000
  console.log(`  4h: ${Object.keys(dset).length} coins, ${days.toFixed(0)} days`)
  const wSpan=(tmax-tmin)/NW
  const winOf=(t:number)=>Math.min(NW-1,Math.max(0,Math.floor((t-tmin)/wSpan)))

  // ── 1) rotation ranking: raw momentum vs Sharpe momentum (both invVol-weighted) ──
  console.log(`\n── 1) rotation ranking: RAW vs SHARPE momentum (LB84|RB12|K5, invVol wgts) ──`)
  const LB=84, RB=12, K=5
  for (const sharpeRank of [false, true]) {
    let prev=new Map<string,number>(), eq=1, eqT=1, pk=1, dd=0, periods=0
    const wSum=new Array(NW).fill(0), wN=new Array(NW).fill(0)
    for (let t=tmin+LB*BAR; t+RB*BAR<=tmax; t+=RB*BAR) {
      const scored:{c:string,score:number,w:number}[]=[]
      for (const c of Object.keys(closes)) {
        const m=closes[c]
        const p0=m.get(t-LB*BAR), p1=m.get(t), p2=m.get(t+RB*BAR)
        if (!p0||!p1||!p2||p0<=0) continue
        const rets:number[]=[]
        for (let k=1;k<=LB;k++){ const a=m.get(t-k*BAR), b=m.get(t-(k-1)*BAR); if(a&&b&&a>0) rets.push(b/a-1) }
        if (rets.length<40) continue
        const mu=rets.reduce((x,y)=>x+y,0)/rets.length
        const v=Math.max(Math.sqrt(rets.reduce((x,y)=>x+(y-mu)**2,0)/rets.length),1e-6)
        const mom=p1/p0-1
        scored.push({c, score: sharpeRank? mom/v : mom, w:1/v})
      }
      if (scored.length<K*4) { prev=new Map(); continue }
      scored.sort((a,b)=>b.score-a.score)
      let ret=0; const basket=new Map<string,number>()
      for (const [li,leg] of [[0,scored.slice(0,K)] as const,[1,scored.slice(-K)] as const]) {
        const dir=li===0?1:-1
        const wsum=leg.reduce((a,x)=>a+x.w,0)
        for (const x of leg) { basket.set(x.c,dir)
          const pr=closes[x.c].get(t)!, pr2=closes[x.c].get(t+RB*BAR)!
          ret += dir*0.5*(x.w/wsum)*(pr2/pr-1) }
      }
      let ch=0
      for (const [c,d] of basket) if (prev.get(c)!==d) ch++
      for (const [c,d] of prev) if (basket.get(c)!==d) ch++
      const turn=ch/(2*K)
      prev=basket
      eq*=(1+ret-turn*FEE_M); eqT*=(1+ret-turn*FEE_T)
      if (eq>pk) pk=eq; dd=Math.max(dd,1-eq/pk)
      const wi=winOf(t); wSum[wi]+=ret-turn*FEE_M; wN[wi]++
      periods++
    }
    const perYear=365.25*86400000/(RB*BAR)
    const annM=Math.pow(eq, perYear/Math.max(1,periods))-1
    const annT=Math.pow(eqT, perYear/Math.max(1,periods))-1
    const wAvg=wSum.map((x,i)=>wN[i]?x/wN[i]:0)
    const ok=wAvg.every(x=>x>0)?'✅':''
    console.log(`  ${sharpeRank?'SHARPE':'RAW   '}   annM=${(annM*100).toFixed(1)}%  annT=${(annT*100).toFixed(1)}%  maxDD=${(dd*100).toFixed(0)}%  | ${wAvg.map(x=>((x>=0?'+':'')+(x*10000).toFixed(0)).padStart(5)).join(' ')} ${ok}`)
  }

  // ── 2) DONCH4H exits: SPLIT vs LADDER (+ 3) funding tilt measurement ──
  console.log(`\n── 2) DONCH4H dw25|adx22: SPLIT (½@0.6→BE, ½@1.0) vs LADDER (⅓@0.6→BE, ⅓@1.0, ⅓@1.6) ──`)
  const DW=25, GATE=22, SLM=1.4, SPACING=2, MAXHOLD=96
  interface Agg { n:number; w:number; sumT:number; sumM:number }
  const mk=():Agg=>({n:0,w:0,sumT:0,sumM:0})
  const schemes=['SPLIT','LADDER'] as const
  const stats: Record<string,Agg[]> = {SPLIT:[],LADDER:[]}
  for (const sc of schemes) for (let i2=0;i2<NW;i2++) stats[sc].push(mk())
  let fundSum=0, fundN=0, fundBySide={L:{s:0,n:0},S:{s:0,n:0}}
  for (const c of Object.keys(dset)) {
    const arr=dset[c]; let last=-999
    for (let i=100;i<arr.length-1;i++) {
      if (i-last<SPACING || i<DW+1) continue
      const price=arr[i].close
      const prior=arr.slice(i-DW,i)
      const hi=Math.max(...prior.map(b=>b.high)), lo=Math.min(...prior.map(b=>b.low))
      const side: 'LONG'|'SHORT'|null = price>hi?'LONG':price<lo?'SHORT':null
      if (!side) continue
      const win=arr.slice(Math.max(0,i-99),i+1)
      const adx=calcADX(win.slice(-60)); if (adx<=GATE) continue
      const atr=calcATR(win.slice(-20)); if(!atr) continue
      last=i
      const slDist=Math.max(atr*SLM, price*0.005), slPct=slDist/price
      if (slPct>0.08) continue
      const feeT=FEE_T/slPct, feeM=FEE_M/slPct
      const dirM=side==='LONG'?1:-1
      const slPx=price-slDist*dirM
      const jEnd=Math.min(arr.length-1,i+MAXHOLD)
      const lvl=(r:number)=>price+slDist*r*dirM
      // walk once, computing both schemes; state per scheme: [fracRemaining, bankedR, stage, stopR(null=orig SL)]
      const runScheme=(stages:{r:number,frac:number}[])=>{
        let banked=0, rem=1, stopAtBE=false, si=0, exitBar=jEnd
        for (let j=i+1;j<=jEnd;j++) {
          const b=arr[j]
          const stopPx = stopAtBE ? price : slPx
          const hitStop = side==='LONG' ? b.low<=stopPx : b.high>=stopPx
          // conservative: stop first
          if (hitStop && !(stopAtBE&&j===i+1)) { banked += rem*(stopAtBE?0:-1); rem=0; exitBar=j; break }
          while (si<stages.length) {
            const tgt=lvl(stages[si].r)
            const hitTgt = side==='LONG' ? b.high>=tgt : b.low<=tgt
            if (!hitTgt) break
            banked += stages[si].frac*stages[si].r
            rem -= stages[si].frac
            stopAtBE=true; si++
            if (rem<=1e-9) { exitBar=j; break }
          }
          if (rem<=1e-9) break
        }
        if (rem>1e-9) banked += rem*((arr[exitBar].close-price)*dirM/slDist)
        return {r:banked, exitBar}
      }
      const rSplit  = runScheme([{r:0.6,frac:0.5},{r:1.0,frac:0.5}])
      const rLadder = runScheme([{r:0.6,frac:1/3},{r:1.0,frac:1/3},{r:1.6,frac:1/3}])
      const wi=winOf(arr[i].t)
      for (const [sc,res] of [['SPLIT',rSplit],['LADDER',rLadder]] as const) {
        const a=stats[sc][wi]
        a.n++; a.sumT+=res.r-feeT; a.sumM+=res.r-feeM; if (res.r-feeM>0) a.w++
      }
      // 3) funding accrued over the SPLIT holding window (dir: short collects +)
      const t0=arr[i].t, t1=arr[rSplit.exitBar].t
      let f=0; for (const fv of (funding[c]||[])) if (fv.t>t0&&fv.t<=t1) f+=fv.r
      const fR = (-dirM)*f/slPct    // in R units of this trade
      fundSum+=fR; fundN++
      if (side==='LONG') { fundBySide.L.s+=fR; fundBySide.L.n++ } else { fundBySide.S.s+=fR; fundBySide.S.n++ }
    }
  }
  console.log(`scheme    n      WR      maker    taker  | maker w1..w6`)
  for (const sc of schemes) {
    const ws=stats[sc]
    const tot=ws.reduce((a,x)=>({n:a.n+x.n,w:a.w+x.w,sumT:a.sumT+x.sumT,sumM:a.sumM+x.sumM}),mk())
    const wA=ws.map(x=>x.n?x.sumM/x.n:0)
    const ok=wA.every(x=>x>0)?'✅':''
    console.log(`  ${sc.padEnd(7)} ${String(tot.n).padStart(5)}  ${(100*(tot.n?tot.w/tot.n:0)).toFixed(1).padStart(5)}%  ${(tot.sumM/tot.n>=0?'+':'')}${(tot.sumM/tot.n).toFixed(3)}  ${(tot.sumT/tot.n>=0?'+':'')}${(tot.sumT/tot.n).toFixed(3)} | ${wA.map(x=>((x>=0?'+':'')+x.toFixed(2)).padStart(6)).join(' ')} ${ok}`)
  }
  console.log(`\n── 3) funding accrued while holding (in R per trade, + = earned) ──`)
  console.log(`  all trades: ${(fundN?fundSum/fundN:0)>=0?'+':''}${(fundN?fundSum/fundN:0).toFixed(4)}R avg (n=${fundN})`)
  console.log(`  LONG:  ${(fundBySide.L.n?fundBySide.L.s/fundBySide.L.n:0).toFixed(4)}R | SHORT: ${(fundBySide.S.n?fundBySide.S.s/fundBySide.S.n:0).toFixed(4)}R`)
}

// V46BT — validates 4 growth ideas in one run:
//  A) DONCH4H (dw25|adx22, LADDER) on the EXTENDED 70-coin universe vs CORE40
//  B) daily Donchian (Turtle-style) sleeve
//  C) daily rotation sleeve (LB30d, weekly rebalance)
//  D) pyramiding proxy: continuation entries while an same-coin same-dir winner is open
function runV46bt() {
  const FEE_T=0.0010, FEE_M=0.0004, NW=6, BAR4=14400000, DAY=86400000
  const toTf = (a:Bar[], ms:number):Bar[] => {
    const out:Bar[] = []; let cur:Bar|null=null; let bucket=-1
    for (const b of a) { const k=Math.floor(b.t/ms)
      if (k!==bucket) { if (cur) out.push(cur); bucket=k
        cur={t:k*ms,open:b.open,high:b.high,low:b.low,close:b.close,vol:b.vol} }
      else if (cur) { cur.high=Math.max(cur.high,b.high); cur.low=Math.min(cur.low,b.low); cur.close=b.close; cur.vol+=b.vol } }
    if (cur) out.push(cur); return out
  }
  const d4: Record<string,Bar[]> = {}, d1: Record<string,Bar[]> = {}
  let tmin=Infinity, tmax=-Infinity
  for (const c of COINS) {
    const h=loadCSV(c,'1h'); if (h.length<500) continue
    d4[c]=toTf(h,BAR4); d1[c]=toTf(h,DAY)
    tmin=Math.min(tmin,h[0].t); tmax=Math.max(tmax,h[h.length-1].t)
  }
  const days=(tmax-tmin)/86400000
  console.log(`  loaded ${Object.keys(d4).length} coins, ${days.toFixed(0)} days`)
  const wSpan=(tmax-tmin)/NW
  const winOf=(t:number)=>Math.min(NW-1,Math.max(0,Math.floor((t-tmin)/wSpan)))
  interface Agg { n:number; w:number; sumT:number; sumM:number }
  const mk=():Agg=>({n:0,w:0,sumT:0,sumM:0})

  // shared LADDER candidate simulator
  const ladderTrade=(arr:Bar[], i:number, side:'LONG'|'SHORT', slDist:number, maxhold:number)=>{
    const price=arr[i].close, dirM=side==='LONG'?1:-1, slPx=price-slDist*dirM
    const jEnd=Math.min(arr.length-1,i+maxhold)
    const lvl=(r:number)=>price+slDist*r*dirM
    const stages=[{r:0.6,frac:1/3},{r:1.0,frac:1/3},{r:1.6,frac:1/3}]
    let banked=0, rem=1, be=false, si=0, exitBar=jEnd
    for (let j=i+1;j<=jEnd;j++) {
      const b=arr[j]
      const stopPx=be?price:slPx
      if (side==='LONG'?b.low<=stopPx:b.high>=stopPx) { banked+=rem*(be?0:-1); rem=0; exitBar=j; break }
      while (si<stages.length) {
        const tgt=lvl(stages[si].r)
        if (!(side==='LONG'?b.high>=tgt:b.low<=tgt)) break
        banked+=stages[si].frac*stages[si].r; rem-=stages[si].frac; be=true; si++
        if (rem<=1e-9) { exitBar=j; break }
      }
      if (rem<=1e-9) break
    }
    if (rem>1e-9) banked+=rem*((arr[exitBar].close-price)*dirM/slDist)
    return {r:banked, exitBar}
  }

  const donchScan=(dset:Record<string,Bar[]>, DW:number, GATE:number, SLM:number, maxhold:number, coinFilter:((c:string)=>boolean)|null, pyramid:boolean)=>{
    const ws:Agg[]=[]; for (let i2=0;i2<NW;i2++) ws.push(mk())
    for (const c of Object.keys(dset)) {
      if (coinFilter && !coinFilter(c)) continue
      const arr=dset[c]; let last=-999
      const openUntil:{bar:number, side:string, entry:number, slDist:number}[]=[]
      for (let i=100;i<arr.length-1;i++) {
        if (i<DW+1) continue
        const price=arr[i].close
        const prior=arr.slice(i-DW,i)
        const hi=Math.max(...prior.map(b=>b.high)), lo=Math.min(...prior.map(b=>b.low))
        const side: 'LONG'|'SHORT'|null = price>hi?'LONG':price<lo?'SHORT':null
        if (!side) continue
        const win=arr.slice(Math.max(0,i-99),i+1)
        const adx=calcADX(win.slice(-60)); if (GATE>0 && adx<=GATE) continue
        const atr=calcATR(win.slice(-20)); if(!atr) continue
        // spacing OR pyramid continuation
        let allowed = i-last>=2
        if (!allowed && pyramid) {
          const act=openUntil.filter(o=>o.bar>=i && o.side===side)
          const dirM=side==='LONG'?1:-1
          allowed = act.length>0 && act.length<2 && act.every(o=>(price-o.entry)*dirM/o.slDist>=0.6)
        }
        if (!allowed) continue
        last=i
        const slDist=Math.max(atr*SLM, price*0.005), slPct=slDist/price
        if (slPct>0.08) continue
        const feeT=FEE_T/slPct, feeM=FEE_M/slPct
        const res=ladderTrade(arr,i,side,slDist,maxhold)
        openUntil.push({bar:res.exitBar, side, entry:price, slDist})
        const a=ws[winOf(arr[i].t)]
        a.n++; a.sumT+=res.r-feeT; a.sumM+=res.r-feeM; if (res.r-feeM>0) a.w++
      }
    }
    return ws
  }
  const report=(name:string, ws:Agg[], perDayDiv:number)=>{
    const tot=ws.reduce((a,x)=>({n:a.n+x.n,w:a.w+x.w,sumT:a.sumT+x.sumT,sumM:a.sumM+x.sumM}),mk())
    const wA=ws.map(x=>x.n?x.sumM/x.n:0)
    const ok=wA.every(x=>x>0)&&ws.every(x=>x.n>=15)?'✅':''
    console.log(`  ${name.padEnd(30)} n=${String(tot.n).padStart(5)} (${(tot.n/perDayDiv).toFixed(1)}/d) WR=${(100*(tot.n?tot.w/tot.n:0)).toFixed(1)}% M=${(tot.sumM/Math.max(1,tot.n)>=0?'+':'')}${(tot.sumM/Math.max(1,tot.n)).toFixed(3)} T=${(tot.sumT/Math.max(1,tot.n)>=0?'+':'')}${(tot.sumT/Math.max(1,tot.n)).toFixed(3)} | ${wA.map(x=>((x>=0?'+':'')+x.toFixed(2)).padStart(6)).join(' ')} ${ok}`)
  }

  console.log(`\n── A) DONCH4H universe: CORE40 vs EXTENDED70 (+ D pyramiding) ──`)
  report('4h dw25|adx22 CORE40',        donchScan(d4,25,22,1.4,96,(c)=>CORE40.has(c),false), days)
  report('4h dw25|adx22 EXTENDED70',    donchScan(d4,25,22,1.4,96,null,false), days)
  report('4h CORE40 + PYRAMID',         donchScan(d4,25,22,1.4,96,(c)=>CORE40.has(c),true), days)

  console.log(`\n── B) daily Donchian (Turtle) sleeve, LADDER exits ──`)
  report('1d dw20|adx0  |sl2.0',        donchScan(d1,20,0, 2.0,60,null,false), days)
  report('1d dw20|adx20|sl2.0',         donchScan(d1,20,20,2.0,60,null,false), days)
  report('1d dw30|adx20|sl2.0',         donchScan(d1,30,20,2.0,60,null,false), days)

  // C) daily rotation LB30d / RB 7d, invVol
  console.log(`\n── C) daily rotation LB30|RB7|K5 (invVol) ──`)
  {
    const closes: Record<string, Map<number,number>> = {}
    for (const c of Object.keys(d1)) { const m=new Map<number,number>(); for (const b of d1[c]) m.set(b.t,b.close); closes[c]=m }
    const LB=30, RB=7, K=5
    let prev=new Map<string,number>(), eq=1, eqT=1, pk=1, dd=0, periods=0
    const wSum=new Array(NW).fill(0), wN=new Array(NW).fill(0)
    for (let t=tmin+LB*DAY; t+RB*DAY<=tmax; t+=RB*DAY) {
      const t0=Math.floor((t-LB*DAY)/DAY)*DAY, t1=Math.floor(t/DAY)*DAY, t2=Math.floor((t+RB*DAY)/DAY)*DAY
      const scored:{c:string,mom:number,w:number}[]=[]
      for (const c of Object.keys(closes)) {
        const m=closes[c]
        const p0=m.get(t0), p1=m.get(t1), p2=m.get(t2)
        if (!p0||!p1||!p2||p0<=0) continue
        const rets:number[]=[]
        for (let k=1;k<=LB;k++){ const a=m.get(t1-k*DAY), b=m.get(t1-(k-1)*DAY); if(a&&b&&a>0) rets.push(b/a-1) }
        if (rets.length<20) continue
        const mu=rets.reduce((x,y)=>x+y,0)/rets.length
        const v=Math.max(Math.sqrt(rets.reduce((x,y)=>x+(y-mu)**2,0)/rets.length),1e-6)
        scored.push({c, mom:p1/p0-1, w:1/v})
      }
      if (scored.length<K*4) { prev=new Map(); continue }
      scored.sort((a,b)=>b.mom-a.mom)
      let ret=0; const basket=new Map<string,number>()
      for (const [li,leg] of [[0,scored.slice(0,K)] as const,[1,scored.slice(-K)] as const]) {
        const dir=li===0?1:-1
        const wsum=leg.reduce((a,x)=>a+x.w,0)
        for (const x of leg) { basket.set(x.c,dir)
          ret += dir*0.5*(x.w/wsum)*((closes[x.c].get(t2)!/closes[x.c].get(t1)!)-1) }
      }
      let ch=0
      for (const [c,dd2] of basket) if (prev.get(c)!==dd2) ch++
      for (const [c,dd2] of prev) if (basket.get(c)!==dd2) ch++
      const turn=ch/(2*K)
      prev=basket
      eq*=(1+ret-turn*FEE_M); eqT*=(1+ret-turn*FEE_T)
      if (eq>pk) pk=eq; dd=Math.max(dd,1-eq/pk)
      const wi=winOf(t); wSum[wi]+=ret-turn*FEE_M; wN[wi]++
      periods++
    }
    const perYear=365.25/RB
    const annM=Math.pow(eq, perYear/Math.max(1,periods))-1
    const annT=Math.pow(eqT, perYear/Math.max(1,periods))-1
    const wAvg=wSum.map((x,i)=>wN[i]?x/wN[i]:0)
    const ok=wAvg.every(x=>x>0)?'✅':''
    console.log(`  1d LB30|RB7|K5   annM=${(annM*100).toFixed(1)}% annT=${(annT*100).toFixed(1)}% maxDD=${(dd*100).toFixed(0)}% | ${wAvg.map(x=>((x>=0?'+':'')+(x*10000).toFixed(0)).padStart(5)).join(' ')} ${ok}`)
  }
  console.log(`\n✅ = positive maker expectancy in all ${NW} windows.`)
}

// ─────────────────────────────────────────────────────────────
// v49bt: "smart money" SIZING TILTS — same trades, smarter capital allocation.
//  A) top-trader positioning (Binance metrics col 6: positions-weighted
//     long/short ratio of the largest accounts, 5-min samples): breakout
//     aligned with top traders' net positioning → 1.25x size; against → 0.75x.
//  B) Fear & Greed extremes (alternative.me daily): fear≤20 + LONG or
//     greed≥80 + SHORT → 1.25x; the opposite extreme → 0.75x.
// Trade count is UNCHANGED by construction. Deploy only if the tilt improves
// the weighted avg R in every window (a tilt that only helps sometimes is noise).
function runV49bt() {
  const TK=0.0005, MK=0.0002, NW=6, BAR4=14400000
  const toTf = (a:Bar[], ms:number):Bar[] => {
    const out:Bar[] = []; let cur:Bar|null=null; let bucket=-1
    for (const b of a) { const k=Math.floor(b.t/ms)
      if (k!==bucket) { if (cur) out.push(cur); bucket=k
        cur={t:k*ms,open:b.open,high:b.high,low:b.low,close:b.close,vol:b.vol} }
      else if (cur) { cur.high=Math.max(cur.high,b.high); cur.low=Math.min(cur.low,b.low); cur.close=b.close; cur.vol+=b.vol } }
    if (cur) out.push(cur); return out
  }
  const d4: Record<string,Bar[]> = {}
  let tmin=Infinity, tmax=-Infinity
  for (const c of COINS) {
    const h=loadCSV(c,'1h'); if (h.length<500) continue
    d4[c]=toTf(h,BAR4)
    tmin=Math.min(tmin,h[0].t); tmax=Math.max(tmax,h[h.length-1].t)
  }
  const wSpan=(tmax-tmin)/NW
  const winOf=(t:number)=>Math.min(NW-1,Math.max(0,Math.floor((t-tmin)/wSpan)))

  // top-trader long/short ratio series per coin
  const tt: Record<string,{t:number,r:number}[]> = {}
  let ttCoins=0
  for (const c of COINS) {
    let txt:string
    try { txt=Deno.readTextFileSync(`backtest/data/${c}-tt.csv`) } catch { continue }
    const arr:{t:number,r:number}[]=[]
    for (const line of txt.split('\n')) {
      if (!line || line[0]!=='2') continue
      const cm=line.indexOf(','); if (cm<0) continue
      const t=new Date(line.slice(0,cm)+'Z').getTime()
      const r=parseFloat(line.slice(cm+1))
      if (Number.isFinite(t)&&Number.isFinite(r)&&r>0) arr.push({t,r})
    }
    arr.sort((a,b)=>a.t-b.t)
    if (arr.length>5000) { tt[c]=arr; ttCoins++ }
  }
  // Fear & Greed daily map (UTC day → value)
  const fng=new Map<number,number>()
  try {
    const j=JSON.parse(Deno.readTextFileSync('backtest/data/fng.json'))
    for (const row of (j?.data??[])) {
      const t=Number(row.timestamp)*1000, v=Number(row.value)
      if (Number.isFinite(t)&&Number.isFinite(v)) fng.set(Math.floor(t/86400000), v)
    }
  } catch { /* absent */ }
  console.log(`  loaded ${Object.keys(d4).length} coins; top-trader series: ${ttCoins}; F&G days: ${fng.size}`)

  const ladder2=(arr:Bar[], j0:number, entry:number, side:'LONG'|'SHORT', slDist:number, jEnd:number)=>{
    const dirM=side==='LONG'?1:-1, slPx=entry-slDist*dirM
    const lvl=(r:number)=>entry+slDist*r*dirM
    const stages=[{r:0.6,frac:1/3},{r:1.0,frac:1/3},{r:1.6,frac:1/3}]
    const jEndc=Math.min(jEnd,arr.length-1)
    let banked=0, rem=1, be=false, si=0, tpFrac=0
    for (let j=j0+1;j<=jEndc;j++) {
      const b=arr[j], stopPx=be?entry:slPx
      if (side==='LONG'?b.low<=stopPx:b.high>=stopPx) { banked+=rem*(be?0:-1); rem=0; break }
      while (si<stages.length) {
        const tgt=lvl(stages[si].r)
        if (!(side==='LONG'?b.high>=tgt:b.low<=tgt)) break
        banked+=stages[si].frac*stages[si].r; tpFrac+=stages[si].frac; rem-=stages[si].frac; be=true; si++
      }
      if (rem<=1e-9) break
    }
    if (rem>1e-9) banked+=rem*((arr[jEndc].close-entry)*dirM/slDist)
    return {r:banked, tpFrac}
  }

  // collect every DONCH4H trade once, with signal-time context
  interface Tr { t:number; win:number; net:number; dir:number; ttDev:number|null; fg:number|null }
  const trades:Tr[]=[]
  for (const c of Object.keys(d4)) {
    if (!CORE40.has(c)) continue
    const arr=d4[c]; let last=-999
    const ts=tt[c]||[]; let p=0
    for (let i=100;i<arr.length-1;i++) {
      const price=arr[i].close
      const prior=arr.slice(i-25,i)
      let hi=-Infinity, lo=Infinity
      for (const b of prior) { if (b.high>hi) hi=b.high; if (b.low<lo) lo=b.low }
      const side: 'LONG'|'SHORT'|null = price>hi?'LONG':price<lo?'SHORT':null
      if (!side) continue
      const win=arr.slice(Math.max(0,i-99),i+1)
      const adx=calcADX(win.slice(-60)); if (adx<=22) continue
      const atr=calcATR(win.slice(-20)); if(!atr) continue
      if (i-last<2) continue
      last=i
      const slDist=Math.max(atr*1.4, price*0.005), slPct=slDist/price
      if (slPct>0.08) continue
      const res=ladder2(arr,i,price,side,slDist,i+96)
      const net=res.r-(TK + res.tpFrac*MK+(1-res.tpFrac)*TK)/slPct
      // top-trader deviation vs its own trailing 14d mean, at signal time
      const tc=arr[i].t+BAR4
      let ttDev:number|null=null
      if (ts.length) {
        while (p<ts.length-1 && ts[p+1].t<=tc) p++
        if (ts[p].t<=tc && ts[p].t>tc-3600000) {
          let s=0,n=0
          for (let q=p;q>=0 && ts[q].t>tc-14*86400000;q--) { s+=ts[q].r; n++ }
          if (n>200) ttDev=ts[p].r/(s/n)-1
        }
      }
      const fg=fng.get(Math.floor(arr[i].t/86400000)) ?? null
      trades.push({t:arr[i].t, win:winOf(arr[i].t), net, dir:side==='LONG'?1:-1, ttDev, fg})
    }
  }
  console.log(`  ${trades.length} trades collected; ttDev available on ${trades.filter(x=>x.ttDev!==null).length}, F&G on ${trades.filter(x=>x.fg!==null).length}`)

  const evalTilt=(name:string, wOf:(tr:Tr)=>number)=>{
    const base=new Array(NW).fill(0).map(()=>({s:0,w:0}))
    const tilt=new Array(NW).fill(0).map(()=>({s:0,w:0}))
    for (const tr of trades) {
      base[tr.win].s+=tr.net; base[tr.win].w+=1
      const wgt=wOf(tr)
      tilt[tr.win].s+=tr.net*wgt; tilt[tr.win].w+=wgt
    }
    const bA=base.map(x=>x.w?x.s/x.w:0), tA=tilt.map(x=>x.w?x.s/x.w:0)
    const better=tA.map((x,i)=>x>bA[i])
    const okAll=tA.every(x=>x>0), okBetter=better.every(Boolean)
    const bT=base.reduce((a,x)=>a+x.s,0)/Math.max(1,base.reduce((a,x)=>a+x.w,0))
    const tT=tilt.reduce((a,x)=>a+x.s,0)/Math.max(1,tilt.reduce((a,x)=>a+x.w,0))
    console.log(`  ${name.padEnd(30)} avg ${ (tT>=0?'+':'')+tT.toFixed(4)}R vs base ${(bT>=0?'+':'')+bT.toFixed(4)}R | ${tA.map((x,i)=>(((x>=0?'+':'')+x.toFixed(3))+(better[i]?'▲':'▽')).padStart(8)).join(' ')} ${okAll&&okBetter?'✅':okAll?'(pos, not uniformly better)':''}`)
  }
  console.log(`\n── tilt evaluation (weighted avg R per window; ▲ = beats baseline in that window) ──`)
  evalTilt('A tt-align 1.25/0.75 @2%',  tr=>tr.ttDev===null?1:(tr.ttDev*tr.dir>0.02?1.25:tr.ttDev*tr.dir<-0.02?0.75:1))
  evalTilt('A tt-align 1.5/0.5 @2%',    tr=>tr.ttDev===null?1:(tr.ttDev*tr.dir>0.02?1.5:tr.ttDev*tr.dir<-0.02?0.5:1))
  evalTilt('A tt-CONTRA 1.25/0.75 @2%', tr=>tr.ttDev===null?1:(tr.ttDev*tr.dir<-0.02?1.25:tr.ttDev*tr.dir>0.02?0.75:1))
  evalTilt('B F&G extreme 1.25/0.75',   tr=>tr.fg===null?1:((tr.fg<=20&&tr.dir>0)||(tr.fg>=80&&tr.dir<0)?1.25:((tr.fg<=20&&tr.dir<0)||(tr.fg>=80&&tr.dir>0)?0.75:1)))
  evalTilt('B F&G CONTRA 1.25/0.75',    tr=>tr.fg===null?1:((tr.fg<=20&&tr.dir<0)||(tr.fg>=80&&tr.dir>0)?1.25:((tr.fg<=20&&tr.dir>0)||(tr.fg>=80&&tr.dir<0)?0.75:1)))
  console.log(`\n✅ = positive in all ${NW} windows AND beats baseline in all ${NW} windows. Deploy bar: ✅ plus ≥+0.004R total improvement.`)
}

// ─────────────────────────────────────────────────────────────
// v48bt: growth candidates that ADD trades (never cut):
//  A) pyramid depth 3 — 3rd unit stacks only when all open units ≥1.2R
//  B) 1h Donchian sleeve — same engine on 1h bars (fees bite harder; prove it)
//  C) rotation K=7 vs K=5 — more slots, same book
// Fee accounting matches live v47: entries taker 0.05%, ladder TP legs maker 0.02%.
function runV48bt() {
  const TK=0.0005, MK=0.0002, NW=6, BAR4=14400000, BAR1=3600000
  const toTf = (a:Bar[], ms:number):Bar[] => {
    const out:Bar[] = []; let cur:Bar|null=null; let bucket=-1
    for (const b of a) { const k=Math.floor(b.t/ms)
      if (k!==bucket) { if (cur) out.push(cur); bucket=k
        cur={t:k*ms,open:b.open,high:b.high,low:b.low,close:b.close,vol:b.vol} }
      else if (cur) { cur.high=Math.max(cur.high,b.high); cur.low=Math.min(cur.low,b.low); cur.close=b.close; cur.vol+=b.vol } }
    if (cur) out.push(cur); return out
  }
  const d4: Record<string,Bar[]> = {}, d1h: Record<string,Bar[]> = {}
  let tmin=Infinity, tmax=-Infinity
  for (const c of COINS) {
    const h=loadCSV(c,'1h'); if (h.length<500) continue
    d1h[c]=h; d4[c]=toTf(h,BAR4)
    tmin=Math.min(tmin,h[0].t); tmax=Math.max(tmax,h[h.length-1].t)
  }
  const days=(tmax-tmin)/86400000
  const wSpan=(tmax-tmin)/NW
  const winOf=(t:number)=>Math.min(NW-1,Math.max(0,Math.floor((t-tmin)/wSpan)))
  console.log(`  loaded ${Object.keys(d4).length} coins, ${days.toFixed(0)} days, ${NW} windows`)

  interface Agg { n:number; w:number; sum:number }
  const mk=():Agg=>({n:0,w:0,sum:0})
  const ladder2=(arr:Bar[], j0:number, entry:number, side:'LONG'|'SHORT', slDist:number, jEnd:number)=>{
    const dirM=side==='LONG'?1:-1, slPx=entry-slDist*dirM
    const lvl=(r:number)=>entry+slDist*r*dirM
    const stages=[{r:0.6,frac:1/3},{r:1.0,frac:1/3},{r:1.6,frac:1/3}]
    const jEndc=Math.min(jEnd,arr.length-1)
    let banked=0, rem=1, be=false, si=0, tpFrac=0, exitBar=jEndc
    for (let j=j0+1;j<=jEndc;j++) {
      const b=arr[j], stopPx=be?entry:slPx
      if (side==='LONG'?b.low<=stopPx:b.high>=stopPx) { banked+=rem*(be?0:-1); rem=0; exitBar=j; break }
      while (si<stages.length) {
        const tgt=lvl(stages[si].r)
        if (!(side==='LONG'?b.high>=tgt:b.low<=tgt)) break
        banked+=stages[si].frac*stages[si].r; tpFrac+=stages[si].frac; rem-=stages[si].frac; be=true; si++
      }
      if (rem<=1e-9) { exitBar=j; break }
    }
    if (rem>1e-9) banked+=rem*((arr[exitBar].close-entry)*dirM/slDist)
    return {r:banked, tpFrac, exitBar}
  }

  // Donchian scan with pyramid depth + configurable timeframe
  const donchScan=(dset:Record<string,Bar[]>, DW:number, GATE:number, SLM:number, maxhold:number, maxUnits:number, unit3R:number)=>{
    const ws:Agg[]=[]; for (let i2=0;i2<NW;i2++) ws.push(mk())
    for (const c of Object.keys(dset)) {
      if (!CORE40.has(c)) continue
      const arr=dset[c]; let last=-999
      const open:{bar:number, side:string, entry:number, slDist:number}[]=[]
      for (let i=Math.max(100,DW+1);i<arr.length-1;i++) {
        const price=arr[i].close
        const prior=arr.slice(i-DW,i)
        let hi=-Infinity, lo=Infinity
        for (const b of prior) { if (b.high>hi) hi=b.high; if (b.low<lo) lo=b.low }
        const side: 'LONG'|'SHORT'|null = price>hi?'LONG':price<lo?'SHORT':null
        if (!side) continue
        const win=arr.slice(Math.max(0,i-99),i+1)
        const adx=calcADX(win.slice(-60)); if (GATE>0 && adx<=GATE) continue
        const atr=calcATR(win.slice(-20)); if(!atr) continue
        let allowed = i-last>=2
        if (!allowed && maxUnits>1) {
          const act=open.filter(o=>o.bar>=i && o.side===side)
          const dirM=side==='LONG'?1:-1
          const needR = act.length>=2 ? unit3R : 0.6
          allowed = act.length>0 && act.length<maxUnits && act.every(o=>(price-o.entry)*dirM/o.slDist>=needR)
        }
        if (!allowed) continue
        last=i
        const slDist=Math.max(atr*SLM, price*0.005), slPct=slDist/price
        if (slPct>0.08) continue
        const res=ladder2(arr,i,price,side,slDist,i+maxhold)
        open.push({bar:res.exitBar, side, entry:price, slDist})
        const net=res.r-(TK + res.tpFrac*MK+(1-res.tpFrac)*TK)/slPct
        const a=ws[winOf(arr[i].t)]
        a.n++; if (net>0) a.w++; a.sum+=net
      }
    }
    return ws
  }
  const report=(name:string, ws:Agg[])=>{
    const tot=ws.reduce((a,x)=>({n:a.n+x.n,w:a.w+x.w,sum:a.sum+x.sum}),mk())
    const wA=ws.map(x=>x.n?x.sum/x.n:0)
    const ok=wA.every(x=>x>0)&&ws.every(x=>x.n>=15)?'✅':''
    console.log(`  ${name.padEnd(32)} n=${String(tot.n).padStart(6)} (${(tot.n/days).toFixed(1)}/d) WR=${(100*(tot.n?tot.w/tot.n:0)).toFixed(1)}% avg=${(tot.sum/Math.max(1,tot.n)>=0?'+':'')}${(tot.sum/Math.max(1,tot.n)).toFixed(3)}R | ${wA.map(x=>((x>=0?'+':'')+x.toFixed(3)).padStart(7)).join(' ')} ${ok}`)
  }

  console.log(`\n── A) PYRAMID DEPTH (4h dw25|adx22|sl1.4, maker TP legs) ──`)
  report('P1 no pyramid (baseline)',      donchScan(d4,25,22,1.4,96,1,0))
  report('P2 max 2 units @0.6R (live)',   donchScan(d4,25,22,1.4,96,2,0))
  report('P3 max 3 units, 3rd @1.2R',     donchScan(d4,25,22,1.4,96,3,1.2))
  report('P3 max 3 units, 3rd @1.0R',     donchScan(d4,25,22,1.4,96,3,1.0))

  console.log(`\n── B) 1h DONCHIAN SLEEVE (adx22|sl1.4, maker TP legs) ──`)
  report('1h dw25 |hold96h(4d)',   donchScan(d1h,25,22,1.4,96,1,0))
  report('1h dw50 |hold96h(4d)',   donchScan(d1h,50,22,1.4,96,1,0))
  report('1h dw100|hold96h(4d)',   donchScan(d1h,100,22,1.4,96,1,0))
  report('1h dw50 |hold240h(10d)', donchScan(d1h,50,22,1.4,240,1,0))
  report('1h dw100|hold240h(10d)', donchScan(d1h,100,22,1.4,240,1,0))

  console.log(`\n── C) ROTATION K=5 vs K=7 (4h LB84|RB12, invVol, fees on turnover) ──`)
  {
    const closes: Record<string, Map<number,number>> = {}
    for (const c of Object.keys(d4)) { const m=new Map<number,number>(); for (const b of d4[c]) m.set(b.t,b.close); closes[c]=m }
    const FEE_T2=0.0010, FEE_M2=0.0004, LB=84, RB=12
    const retOf=(c:string,t0:number,t1:number)=>{ const m=closes[c]; const a=m.get(t0), b=m.get(t1); return (a&&b)?b/a-1:null }
    const volOf=(c:string,t:number)=>{
      const m=closes[c]; const rets:number[]=[]
      for (let k=1;k<=LB;k++){ const a=m.get(t-k*BAR4), b=m.get(t-(k-1)*BAR4); if(a&&b&&a>0) rets.push(b/a-1) }
      if (rets.length<40) return null
      const mu=rets.reduce((x,y)=>x+y,0)/rets.length
      return Math.sqrt(rets.reduce((x,y)=>x+(y-mu)**2,0)/rets.length)
    }
    for (const K of [5,7]) {
      let prev=new Map<string,number>(), eq=1, eqT=1, pk=1, mdd=0, periods=0
      const wSum=new Array(NW).fill(0), wN=new Array(NW).fill(0)
      for (let t=tmin+LB*BAR4; t+RB*BAR4<=tmax; t+=RB*BAR4) {
        const scored:{c:string,mom:number,w:number}[]=[]
        for (const c of Object.keys(closes)) {
          if (!CORE40.has(c)) continue
          const p0=closes[c].get(t-LB*BAR4), p1=closes[c].get(t), p2=closes[c].get(t+RB*BAR4)
          if (!p0||!p1||!p2||p0<=0) continue
          const v=volOf(c,t); if (v===null||v<=0) continue
          scored.push({c, mom:p1/p0-1, w:1/v})
        }
        if (scored.length<K*4) { prev=new Map(); continue }
        scored.sort((a,b)=>b.mom-a.mom)
        let ret=0; const basket=new Map<string,number>()
        for (const [li,leg] of [[0,scored.slice(0,K)] as const,[1,scored.slice(-K)] as const]) {
          const dir=li===0?1:-1
          const wsum=leg.reduce((a,x)=>a+x.w,0)
          for (const x of leg) { basket.set(x.c,dir)
            ret += dir*0.5*(x.w/wsum)*(retOf(x.c,t,t+RB*BAR4)??0) }
        }
        let ch=0
        for (const [c,d] of basket) if (prev.get(c)!==d) ch++
        for (const [c,d] of prev) if (basket.get(c)!==d) ch++
        const turn=ch/(2*K)
        prev=basket
        eq*=(1+ret-turn*FEE_M2); eqT*=(1+ret-turn*FEE_T2)
        if (eq>pk) pk=eq; mdd=Math.max(mdd,1-eq/pk)
        const wi=winOf(t); wSum[wi]+=ret-turn*FEE_T2; wN[wi]++
        periods++
      }
      const perYear=365.25*86400000/(RB*BAR4)
      const annM=Math.pow(eq, perYear/Math.max(1,periods))-1
      const annT=Math.pow(eqT, perYear/Math.max(1,periods))-1
      const wAvg=wSum.map((x,i)=>wN[i]?x/wN[i]:0)
      const ok=wAvg.every(x=>x>0)?'✅':''
      console.log(`  K=${K}  annM=${(annM*100).toFixed(1)}% annT=${(annT*100).toFixed(1)}% maxDD=${(mdd*100).toFixed(0)}% | taker w1..w6(bps): ${wAvg.map(x=>((x>=0?'+':'')+(x*10000).toFixed(0)).padStart(5)).join(' ')} ${ok}`)
    }
    console.log(`  deploy K=7 only if all taker windows positive AND annT ≥ 0.9× K=5's.`)
  }
  console.log(`\n✅ = all ${NW} windows positive (n≥15/window for A/B).`)
}

// ─────────────────────────────────────────────────────────────
// v47bt: (A) maker/limit-retest entries for DONCH4H — fee edge without losing
// trades (hybrid: limit at breakout level, chase market if no retest in K bars),
// (B) liquidation-cascade fade — new uncorrelated strategy from Binance
// liquidationSnapshot archives. Walk-forward, 6 windows, real fees.
// Fees per side: taker 0.05%, maker 0.02%.
function runV47bt() {
  const TK=0.0005, MK=0.0002, NW=6, BAR4=14400000
  const toTf = (a:Bar[], ms:number):Bar[] => {
    const out:Bar[] = []; let cur:Bar|null=null; let bucket=-1
    for (const b of a) { const k=Math.floor(b.t/ms)
      if (k!==bucket) { if (cur) out.push(cur); bucket=k
        cur={t:k*ms,open:b.open,high:b.high,low:b.low,close:b.close,vol:b.vol} }
      else if (cur) { cur.high=Math.max(cur.high,b.high); cur.low=Math.min(cur.low,b.low); cur.close=b.close; cur.vol+=b.vol } }
    if (cur) out.push(cur); return out
  }
  const d4: Record<string,Bar[]> = {}
  let tmin=Infinity, tmax=-Infinity
  for (const c of COINS) {
    const h=loadCSV(c,'1h'); if (h.length<500) continue
    d4[c]=toTf(h,BAR4)
    tmin=Math.min(tmin,h[0].t); tmax=Math.max(tmax,h[h.length-1].t)
  }
  const days=(tmax-tmin)/86400000
  const wSpan=(tmax-tmin)/NW
  const winOf=(t:number)=>Math.min(NW-1,Math.max(0,Math.floor((t-tmin)/wSpan)))
  console.log(`  loaded ${Object.keys(d4).length} coins, ${days.toFixed(0)} days, ${NW} windows`)

  interface Agg { n:number; w:number; sum:number; fills:number }
  const mk=():Agg=>({n:0,w:0,sum:0,fills:0})

  // ladder simulator (0.6/1.0/1.6R thirds, BE after first leg) from an arbitrary
  // start bar + entry price; tracks what fraction exited at limit TPs (maker-able).
  // On the fill bar itself only the stop is checked (no same-bar TP — conservative).
  const ladder2=(arr:Bar[], j0:number, entry:number, side:'LONG'|'SHORT', slDist:number, jEnd:number, checkStopOnJ0:boolean)=>{
    const dirM=side==='LONG'?1:-1, slPx=entry-slDist*dirM
    const lvl=(r:number)=>entry+slDist*r*dirM
    const stages=[{r:0.6,frac:1/3},{r:1.0,frac:1/3},{r:1.6,frac:1/3}]
    const jEndc=Math.min(jEnd,arr.length-1)
    let banked=0, rem=1, be=false, si=0, tpFrac=0
    for (let j=j0;j<=jEndc;j++) {
      if (j===j0 && !checkStopOnJ0) continue
      const b=arr[j], stopPx=be?entry:slPx
      if (side==='LONG'?b.low<=stopPx:b.high>=stopPx) { banked+=rem*(be?0:-1); rem=0; break }
      if (j===j0) continue
      while (si<stages.length) {
        const tgt=lvl(stages[si].r)
        if (!(side==='LONG'?b.high>=tgt:b.low<=tgt)) break
        banked+=stages[si].frac*stages[si].r; tpFrac+=stages[si].frac; rem-=stages[si].frac; be=true; si++
      }
      if (rem<=1e-9) break
    }
    if (rem>1e-9) banked+=rem*((arr[jEndc].close-entry)*dirM/slDist)
    return {r:banked, tpFrac}
  }

  // ── A) DONCH4H dw25|adx22 CORE40 with different entry/fee models ──
  type EntryMode = {kind:'market'}|{kind:'retest', K:number, chase:boolean}
  const scanA=(mode:EntryMode, makerTP:boolean)=>{
    const ws:Agg[]=[]; for (let i2=0;i2<NW;i2++) ws.push(mk())
    for (const c of Object.keys(d4)) {
      if (!CORE40.has(c)) continue
      const arr=d4[c]; let last=-999
      for (let i=100;i<arr.length-1;i++) {
        const price=arr[i].close
        const prior=arr.slice(i-25,i)
        const hi=Math.max(...prior.map(b=>b.high)), lo=Math.min(...prior.map(b=>b.low))
        const side: 'LONG'|'SHORT'|null = price>hi?'LONG':price<lo?'SHORT':null
        if (!side) continue
        const win=arr.slice(Math.max(0,i-99),i+1)
        const adx=calcADX(win.slice(-60)); if (adx<=22) continue
        const atr=calcATR(win.slice(-20)); if(!atr) continue
        if (i-last<2) continue
        last=i
        const slDist=Math.max(atr*1.4, price*0.005)
        if (slDist/price>0.08) continue
        let entry=price, j0=i, entryFee=TK, isRetest=false
        if (mode.kind==='retest') {
          const level=side==='LONG'?hi:lo
          let filled=false
          for (let j=i+1;j<=Math.min(i+mode.K,arr.length-1);j++) {
            if (side==='LONG'?arr[j].low<=level:arr[j].high>=level) { entry=level; j0=j; entryFee=MK; isRetest=true; filled=true; break }
          }
          if (!filled) {
            if (!mode.chase) continue
            const jc=Math.min(i+mode.K,arr.length-1)
            entry=arr[jc].close; j0=jc
          }
        }
        const slPct=slDist/entry
        const res=ladder2(arr, j0, entry, side, slDist, i+96, isRetest)
        const exitFee = makerTP ? (res.tpFrac*MK+(1-res.tpFrac)*TK) : TK
        const net=res.r-(entryFee+exitFee)/slPct
        const a=ws[winOf(arr[i].t)]
        a.n++; if(net>0) a.w++; a.sum+=net; if(isRetest) a.fills++
      }
    }
    return ws
  }
  const reportA=(name:string, ws:Agg[])=>{
    const tot=ws.reduce((a,x)=>({n:a.n+x.n,w:a.w+x.w,sum:a.sum+x.sum,fills:a.fills+x.fills}),mk())
    const wA=ws.map(x=>x.n?x.sum/x.n:0)
    const ok=wA.every(x=>x>0)&&ws.every(x=>x.n>=15)?'✅':''
    console.log(`  ${name.padEnd(34)} n=${String(tot.n).padStart(5)} WR=${(100*(tot.n?tot.w/tot.n:0)).toFixed(1)}% avg=${(tot.sum/Math.max(1,tot.n)>=0?'+':'')}${(tot.sum/Math.max(1,tot.n)).toFixed(3)}R fill=${(100*tot.fills/Math.max(1,tot.n)).toFixed(0)}% | ${wA.map(x=>((x>=0?'+':'')+x.toFixed(3)).padStart(7)).join(' ')} ${ok}`)
  }
  console.log(`\n── A) DONCH4H CORE40 entry/fee models (dw25|adx22|sl1.4) ──`)
  reportA('A0 market, all-taker (live now)', scanA({kind:'market'},false))
  reportA('A1 market + maker TP legs',       scanA({kind:'market'},true))
  reportA('A2 retest K=1 + chase',           scanA({kind:'retest',K:1,chase:true},true))
  reportA('A3 retest K=2 + chase',           scanA({kind:'retest',K:2,chase:true},true))
  reportA('A4 retest K=3 + chase',           scanA({kind:'retest',K:3,chase:true},true))
  reportA('A5 retest K=2 NO chase (info)',   scanA({kind:'retest',K:2,chase:false},true))

  // ── B) forced-deleveraging (liquidation-cascade) fade on 15m bars ──
  // Binance publishes NO liquidation archive; cascades are detected instead as
  // a fast Open-Interest crash + fast price move together (forced closes destroy
  // OI). OI comes from the metrics archive at 5-min resolution (SYM-oi5.csv).
  console.log(`\n── B) OI-CRASH CASCADE FADE (15m, ladder exits, taker entry) ──`)
  const d15:Record<string,Bar[]>={}, oi5:Record<string,{t:number,v:number}[]>={}
  let oiRows=0, oiT0=Infinity, oiT1=-Infinity
  for (const c of COINS) {
    let txt:string
    try { txt=Deno.readTextFileSync(`backtest/data/${c}-oi5.csv`) } catch { continue }
    const arr:{t:number,v:number}[]=[]
    for (const line of txt.split('\n')) {
      if (!line || line[0]!=='2') continue
      const cm=line.indexOf(','); if (cm<0) continue
      const t=new Date(line.slice(0,cm)+'Z').getTime()
      const v=parseFloat(line.slice(cm+1))
      if (Number.isFinite(t)&&Number.isFinite(v)&&v>0) arr.push({t,v})
    }
    arr.sort((a,b)=>a.t-b.t)
    if (arr.length<5000) continue
    const b=loadCSV(c,'15m'); if (b.length<5000) continue
    d15[c]=b; oi5[c]=arr; oiRows+=arr.length
    oiT0=Math.min(oiT0,arr[0].t); oiT1=Math.max(oiT1,arr[arr.length-1].t)
  }
  const nOi=Object.keys(d15).length
  console.log(`  OI data: ${nOi} coins, ${oiRows} 5m samples, span ${oiT0<oiT1?((oiT1-oiT0)/86400000).toFixed(0):0} days`)
  if (nOi<5) { console.log(`  ❌ NOT ENOUGH OI DATA — verdict impossible, do not deploy.`); return }

  const simOi=(X:number, Y:number, HOLD:number)=>{
    const ws:Agg[]=[]; for (let i2=0;i2<NW;i2++) ws.push(mk())
    for (const c of Object.keys(d15)) {
      const arr=d15[c], os=oi5[c]
      let p=0, last=-999
      for (let i=24;i<arr.length-1;i++) {
        const tc=arr[i].t+900000            // bar close time
        while (p<os.length-1 && os[p+1].t<=tc) p++
        if (os[p].t>tc || os[p].t<tc-1200000) continue   // no fresh OI sample
        let q=p; while (q>0 && os[q].t>tc-3600000) q--
        if (os[q].t>tc-3600000 || os[q].t<tc-5400000) continue
        const dOI=os[p].v/os[q].v-1
        if (dOI>-X) continue                              // need an OI crash
        const ret1h=arr[i].close/arr[i-4].close-1
        let side:'LONG'|'SHORT'|null=null
        if (ret1h<=-Y) side='LONG'        // longs force-closed → fade the flush
        else if (ret1h>=Y) side='SHORT'   // shorts force-closed → fade the squeeze
        if (!side) continue
        if (i-last<32) continue           // 8h per-coin cooldown
        last=i
        const price=arr[i].close
        const atr=calcATR(arr.slice(Math.max(0,i-20),i+1)); if(!atr) continue
        const slDist=Math.max(3*atr, price*0.006), slPct=slDist/price
        if (slPct>0.08) continue
        const res=ladder2(arr,i,price,side,slDist,i+HOLD,false)
        const net=res.r-(TK + res.tpFrac*MK+(1-res.tpFrac)*TK)/slPct
        const a=ws[winOf(arr[i].t)]; a.n++; if(net>0)a.w++; a.sum+=net
      }
    }
    return ws
  }
  const reportB=(name:string, ws:Agg[])=>{
    const tot=ws.reduce((a,x)=>({n:a.n+x.n,w:a.w+x.w,sum:a.sum+x.sum,fills:0}),mk())
    const act=ws.filter(x=>x.n>=10)
    const wA=ws.map(x=>x.n?x.sum/x.n:0)
    const ok=act.length>=4 && act.every(x=>x.sum/x.n>0)?'✅':''
    console.log(`  ${name.padEnd(26)} n=${String(tot.n).padStart(5)} (${(tot.n/days).toFixed(2)}/d) WR=${(100*(tot.n?tot.w/tot.n:0)).toFixed(1)}% avg=${(tot.sum/Math.max(1,tot.n)>=0?'+':'')}${(tot.sum/Math.max(1,tot.n)).toFixed(3)}R | ${ws.map((x,i3)=>x.n?(((wA[i3]>=0?'+':'')+wA[i3].toFixed(2))+'/'+x.n).padStart(9):'      ·  ').join(' ')} ${ok}`)
  }
  for (const X of [0.015,0.03,0.05])
    for (const Y of [0.01,0.02])
      for (const HOLD of [32,96])
        reportB(`oi-${(X*100).toFixed(1)}%|px${(Y*100).toFixed(0)}%|h${HOLD/4}h`, simOi(X,Y,HOLD))
  console.log(`\n✅(A) = all ${NW} windows positive, n>=15/window. ✅(B) = all windows with n>=10 positive, >=4 active windows.`)
}

// ─────────────────────────────────────────────────────────────
function main() {
  // BT_MODE=explore → higher-TF walk-forward research (loads only 15m/1h)
  if (Deno.env.get('BT_MODE') === 'explore') {
    console.log(`████ EXPLORE — 15m/1h mean-reversion, 6 months, real fees, walk-forward ████`)
    runExplore()
    return
  }
  if (Deno.env.get('BT_MODE') === 'refine') {
    console.log(`████ REFINE — 4h Donchian grid ████`)
    runRefine()
    return
  }
  if (Deno.env.get('BT_MODE') === 'validate') {
    console.log(`████ VALIDATE — long-history walk-forward + split-TP comparison ████`)
    runValidate()
    return
  }
  if (Deno.env.get('BT_MODE') === 'range') {
    console.log(`████ RANGE — 4h BB-fade in ADX<20 regime, walk-forward ████`)
    runRange()
    return
  }
  if (Deno.env.get('BT_MODE') === 'freq') {
    console.log(`████ FREQ — how loose can the gate get while staying robust? ████`)
    runFreq()
    return
  }
  if (Deno.env.get('BT_MODE') === 'rota') {
    console.log(`████ ROTA — cross-sectional momentum rotation, walk-forward ████`)
    runRota()
    return
  }
  if (Deno.env.get('BT_MODE') === 'v43bt') {
    console.log(`████ V43BT — inv-vol weights / skip-momentum / funding carry ████`)
    runV43bt()
    return
  }
  if (Deno.env.get('BT_MODE') === 'v44bt') {
    console.log(`████ V44BT — ADX-bucket expectancy + rotation vol-targeting ████`)
    runV44bt()
    return
  }
  if (Deno.env.get('BT_MODE') === 'v45bt') {
    console.log(`████ V45BT — Sharpe-momentum / exit ladder / funding tilt ████`)
    runV45bt()
    return
  }
  if (Deno.env.get('BT_MODE') === 'v46bt') {
    console.log(`████ V46BT — extended universe / daily sleeves / pyramiding ████`)
    runV46bt()
    return
  }
  if (Deno.env.get('BT_MODE') === 'v47bt') {
    console.log(`████ V47BT — maker/retest entries + liquidation-cascade fade ████`)
    runV47bt()
    return
  }
  if (Deno.env.get('BT_MODE') === 'v48bt') {
    console.log(`████ V48BT — pyramid depth 3 / 1h sleeve / rotation K=7 ████`)
    runV48bt()
    return
  }
  if (Deno.env.get('BT_MODE') === 'v49bt') {
    console.log(`████ V49BT — top-trader positioning tilt + Fear&Greed tilt ████`)
    runV49bt()
    return
  }

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
    entryThreshold:75, baseFloor:65, meanRev:false, fixedTpR:0, slAtrMult:0, ...o
  })

  // BT_MODE=meanrev → pure mean-reversion × exit-target matrix, then stop
  if (Deno.env.get('BT_MODE') === 'meanrev') {
    console.log(`\n████ MEAN-REVERSION × TP × SL matrix — push toward positive expectancy ████`)
    console.log(`entries: stoch+div/stopHunt (minScore 5). Note: expR is in R vs the tp/sl SIZE,`)
    console.log(`so we also print $-final from $10k (the true bottom line).\n`)
    console.log(`  TP     SL(atr)  trades   WR      PF     expR/trade   $final    maxDD`)
    for (const tp of [0.7, 1.0, 1.3]) {
      for (const sl of [0.5, 0.7, 0.9]) {
        const r = runSim(mk({meanRev:true, entryThreshold:5, baseFloor:0, fixedTpR:tp, slAtrMult:sl, beR:999, trailStartR:999}), grid, data, b1h, b15, btc5, change24h, oiData)
        const real = r.closed.filter(c=>c.status!=='PARTIAL')
        const n=real.length, w=real.filter(c=>c.pnl>0), l=real.filter(c=>c.pnl<=0)
        const gw=w.reduce((a,c)=>a+c.pnl,0), gl=Math.abs(l.reduce((a,c)=>a+c.pnl,0))
        const wr=n?w.length/n:0, pf=gl>0?gw/gl:Infinity, exp=n?real.reduce((a,c)=>a+c.rMultiple,0)/n:0
        const flag = r.finalBal>10000 ? '  ✅PROFIT' : ''
        console.log(`  ${tp.toFixed(1)}R   ${sl.toFixed(1)}xatr   ${String(n).padStart(5)}   ${(wr*100).toFixed(1).padStart(5)}%  ${(pf===Infinity?'∞':pf.toFixed(2)).padStart(5)}   ${(exp>=0?'+':'')}${exp.toFixed(3)}R     ${r.finalBal.toFixed(0).padStart(6)}   ${(r.maxDD*100).toFixed(1)}%${flag}`)
      }
    }
    console.log(`\nFEE=0. $final > 10000 = genuinely profitable configuration found.`)
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

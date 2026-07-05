// ════════════════════════════════════════════════════════════
// CryptoBot v20 — 5m Timeframe + Fee-Aware Profitability
//
// v20 upgrades:
//  1. PRIMARY TF: 1m → 5m  (signal quality up, fee drag ↓40%)
//  2. MTF CONFIRM: 5m → 15m (stronger structural confirmation)
//  3. MIN_SL: 0.3% → 0.6%  (fees now <25% of risk vs 66%)
//  4. MAX_HOLD: 90m → 360m  (lets winners run on 5m swings)
//  5. STREAK_PAUSE: 20m → 60m (proper cooldown)
//  6. SCORING: removed OB imbalance + whale pressure (noise)
//     funding rate weight doubled, F&G weight doubled
//  7. KELLY: k×2 → k×1.5  (less aggressive sizing)
//  8. CIRCUIT BREAKER: halt at 25% drawdown from 10k
// ════════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2'

const BINANCE_DATA = 'https://data-api.binance.vision/api/v3'
const BINANCE      = 'https://api.binance.com/api/v3'
const FAPI         = 'https://fapi.binance.com/fapi/v1'
const FAPI_DATA    = 'https://fapi.binance.com/futures/data'

// v20: Whitelist starts with all liquid coins, gets pruned dynamically
// Only symbols with >42% win rate in last 100 trades are kept
const FALLBACK_COINS = [
  'BTC','ETH','SOL','BNB','XRP','DOGE','ADA','AVAX','LINK','DOT',
  'NEAR','UNI','ATOM','LTC','BCH','ARB','OP','INJ','SUI','TON',
  'PEPE','WIF','APT','FET','RNDR','TRX','HBAR','ICP','AAVE','GRT',
]
const MIN_COIN_WIN_RATE = 0.42  // Minimum 42% to stay on whitelist

const CORR_GROUPS: string[][] = [
  ['SOL','AVAX','NEAR','ATOM','APT','SUI','DOT','ONE','EGLD','FTM','KAVA','ALGO'],
  ['ARB','OP','MATIC','METIS','MANTA','SCROLL','ZK','STRK'],
  ['UNI','AAVE','CRV','SNX','COMP','BAL','YFI','1INCH','PENDLE','MKR'],
  ['LINK','BAND','API3'],
  ['FET','RNDR','WLD','AGIX','GRT','THETA','TAO','OCEAN'],
  ['DOGE','PEPE','WIF','SHIB','FLOKI','BONK','MEME','BRETT','NEIRO'],
  ['INJ','SEI','TIA','OSMO'],
  ['LTC','BCH','ZEC','DASH'],
  ['XRP','XLM','HBAR'],
  ['BNB'],['BTC'],['ETH'],
]
const MAX_PER_GROUP  = 3
const MIN_SCORE      = 3   // raised from 2
const PARTIAL_TP_R   = 1.2
const VPOC_MAX_DIST  = 0.018  // tightened from 0.020

async function fetchAllLiquidCoins(minVolUSD = 5_000_000): Promise<string[]> {
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
} as const
type RiskKey = keyof typeof RISK

const FEE             = 0.001
const SWING_N         = 5
const SWING_LOOKBACK  = 60
const SWEEP_LOOKBACK  = 5
const MAX_HOLD_MIN    = 360   // was 90 — lets 5m trades breathe
const STREAK_PAUSE_MS = 60*60_000  // was 20m — proper cooldown
const MAX_NOTIONAL_PCT= 0.25
const FUNDING_EXTREME = 0.0003
const MIN_SL_PCT      = 0.006  // was 0.003 — fees now <25% of risk
const SYM_COOLDOWN_MS = 30*60_000  // was 15m — more space on 5m TF
const MAX_DD_STOP     = 0.25   // halt all trading at 25% drawdown
const INITIAL_BALANCE = 10_000 // reference for drawdown circuit breaker

// v19: tighter slMult so SL is narrower → losses smaller, R:R improves
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

function calcRsi(closes:number[], p=14): number {
  if (closes.length < p+1) return 50
  let g=0, l=0
  for (let i=closes.length-p; i<closes.length; i++) {
    const d=closes[i]-closes[i-1]; if(d>0) g+=d; else l-=d
  }
  g/=p; l/=p; return l===0?100:100-100/(1+g/l)
}

function calcBB(closes: number[], period = 20, mult = 2.0): {
  upper: number; mid: number; lower: number; width: number
} {
  const slice = closes.slice(-period)
  if (slice.length < period) return { upper: 0, mid: 0, lower: 0, width: 0 }
  const mid = slice.reduce((a, b) => a + b, 0) / slice.length
  const variance = slice.reduce((a, b) => a + (b - mid) ** 2, 0) / slice.length
  const std = Math.sqrt(variance)
  const upper = mid + mult * std
  const lower = mid - mult * std
  return { upper, mid, lower, width: mid > 0 ? (upper - lower) / mid : 0 }
}

// Market regime: TRENDING = sweep mode, RANGING = mean-reversion mode, SQUEEZE = skip
function detectRegime(bars: Bar[]): 'TRENDING' | 'RANGING' | 'SQUEEZE' {
  if (bars.length < 50) return 'TRENDING'
  const closes  = bars.slice(-50).map(b => b.close)
  const { width } = calcBB(closes, 20, 2)
  const recentATR = calcATR(bars.slice(-15))
  const baseATR   = calcATR(bars.slice(-50))
  const atrRatio  = baseATR > 0 ? recentATR / baseATR : 1
  if (width < 0.004 && atrRatio < 0.65) return 'SQUEEZE'
  if (width < 0.011 || atrRatio < 0.80) return 'RANGING'
  return 'TRENDING'
}

// v19: stricter RSI + bb.width filters on range entry to reduce false signals
function findRangeEntry(
  bars: Bar[], price: number, vpoc: number
): { side: 'LONG'|'SHORT'; tpPrice: number; slDist: number } | null {
  if (bars.length < 30) return null
  const closes = bars.slice(-30).map(b => b.close)
  const bb  = calcBB(closes, 20, 2)
  const rsi = calcRsi(closes)
  if (!bb.mid || bb.width > 0.010) return null  // tightened from 0.013

  const atr = calcATR(bars.slice(-20))

  // LONG at lower band: require deeper oversold (rsi<38 vs old rsi<42)
  if (price <= bb.lower * 1.003 && rsi < 38 && vpoc > price * 1.001) {
    const tpPrice = Math.min(vpoc, bb.mid)
    const slDist  = atr * 1.2
    const rr = slDist > 0 ? (tpPrice - price) / slDist : 0
    if (rr >= 1.6 && tpPrice > price) return { side: 'LONG', tpPrice, slDist }  // rr min 1.6 vs 1.4
  }
  // SHORT at upper band: require deeper overbought (rsi>62 vs old rsi>58)
  if (price >= bb.upper * 0.997 && rsi > 62 && vpoc < price * 0.999) {
    const tpPrice = Math.max(vpoc, bb.mid)
    const slDist  = atr * 1.2
    const rr = slDist > 0 ? (price - tpPrice) / slDist : 0
    if (rr >= 1.6 && tpPrice < price) return { side: 'SHORT', tpPrice, slDist }  // rr min 1.6 vs 1.4
  }
  return null
}

function getVolRegime(atrPct:number): 'LOW'|'MEDIUM'|'HIGH' {
  if (atrPct < 0.0008) return 'LOW'
  if (atrPct < 0.003)  return 'MEDIUM'
  return 'HIGH'
}

function calcVPOC(bars:Bar[]): number {
  if (!bars.length) return 0
  const min = Math.min(...bars.map(b=>b.low))
  const max = Math.max(...bars.map(b=>b.high))
  if (max === min) return (max+min)/2
  const buckets = 40, step = (max-min)/buckets
  const hist = new Array(buckets).fill(0)
  for (const bar of bars) {
    const idx = Math.min(Math.floor(((bar.high+bar.low)/2 - min)/step), buckets-1)
    hist[idx] += bar.vol
  }
  return min + (hist.indexOf(Math.max(...hist))+0.5)*step
}

function findSwings(bars:Bar[], n:number): {highs:number[], lows:number[]} {
  const highs:number[]=[], lows:number[]=[]
  for (let i=n; i<bars.length-n; i++) {
    let isH=true, isL=true
    for (let j=i-n; j<=i+n; j++) {
      if(j===i) continue
      if(bars[j].high >= bars[i].high) isH=false
      if(bars[j].low  <= bars[i].low)  isL=false
    }
    if(isH) highs.push(bars[i].high)
    if(isL) lows.push(bars[i].low)
  }
  return {highs, lows}
}

function detectSweep(
  bars:Bar[], price:number,
  highs:number[], lows:number[],
  atr:number
): {side:'LONG'|'SHORT', sweepExtreme:number} | null {
  const n=bars.length
  if (n < SWEEP_LOOKBACK+1) return null
  const minCloseback = atr * 0.15
  for (let k=1; k<=SWEEP_LOOKBACK; k++) {
    const bar=bars[n-k]
    for (const lvl of highs) {
      if (bar.high>lvl && bar.close<lvl && price<=bar.close*1.003) {
        if (lvl - bar.close >= minCloseback)
          return {side:'SHORT', sweepExtreme:bar.high}
      }
    }
    for (const lvl of lows) {
      if (bar.low<lvl && bar.close>lvl && price>=bar.close*0.997) {
        if (bar.close - lvl >= minCloseback)
          return {side:'LONG', sweepExtreme:bar.low}
      }
    }
  }
  return null
}

function getCorrGroup(sym:string): number {
  for (let i=0; i<CORR_GROUPS.length; i++) {
    if (CORR_GROUPS[i].includes(sym)) return i
  }
  return -1
}

async function fetchAllFundingRates(): Promise<Record<string,number>> {
  try {
    const res = await fetch(`${FAPI}/premiumIndex`, {headers:{'User-Agent':'Mozilla/5.0'}})
    if (!res.ok) return {}
    const data:any[] = await res.json()
    const result:Record<string,number> = {}
    for (const d of data) {
      const sym = d.symbol.replace('USDT','').replace('_PERP','')
      result[sym] = parseFloat(d.lastFundingRate||'0')
    }
    return result
  } catch { return {} }
}

async function fetchOISignal(sym:string): Promise<'UP'|'DOWN'|'FLAT'> {
  try {
    const res = await fetch(
      `${FAPI_DATA}/openInterestHist?symbol=${sym}USDT&period=5m&limit=6`,
      {headers:{'User-Agent':'Mozilla/5.0'}}
    )
    if (!res.ok) return 'FLAT'
    const data:any[] = await res.json()
    if (data.length<2) return 'FLAT'
    const first = parseFloat(data[0].sumOpenInterest)
    const last  = parseFloat(data[data.length-1].sumOpenInterest)
    const chg   = first>0 ? (last-first)/first : 0
    return chg > 0.01 ? 'UP' : chg < -0.01 ? 'DOWN' : 'FLAT'
  } catch { return 'FLAT' }
}

async function fetchLiqSignal(sym:string): Promise<'LONG_LIQ'|'SHORT_LIQ'|'NEUTRAL'> {
  try {
    const res = await fetch(
      `${FAPI_DATA}/globalLongShortAccountRatio?symbol=${sym}USDT&period=5m&limit=4`,
      {headers:{'User-Agent':'Mozilla/5.0'}}
    )
    if (!res.ok) return 'NEUTRAL'
    const data:any[] = await res.json()
    if (data.length<2) return 'NEUTRAL'
    const latest = parseFloat(data[data.length-1].longShortRatio)
    const prev   = parseFloat(data[0].longShortRatio)
    const chg    = prev>0 ? (latest-prev)/prev : 0
    if (chg < -0.05) return 'LONG_LIQ'
    if (chg > 0.05)  return 'SHORT_LIQ'
    return 'NEUTRAL'
  } catch { return 'NEUTRAL' }
}

async function fetchOBImbalance(sym:string): Promise<number> {
  try {
    const res = await fetch(`${BINANCE_DATA}/depth?symbol=${sym}USDT&limit=20`)
    if (!res.ok) return 0
    const d = await res.json()
    const bidVol = (d.bids as string[][]).reduce((a,b)=>a+parseFloat(b[0])*parseFloat(b[1]),0)
    const askVol = (d.asks as string[][]).reduce((a,b)=>a+parseFloat(b[0])*parseFloat(b[1]),0)
    return (bidVol-askVol)/((bidVol+askVol)||1)
  } catch { return 0 }
}

async function fetchWhalePressure(sym:string): Promise<number> {
  try {
    const res = await fetch(`${BINANCE_DATA}/aggTrades?symbol=${sym}USDT&limit=200`)
    if (!res.ok) return 0
    const trades:any[] = await res.json()
    if (!trades.length) return 0
    const avgQty = trades.reduce((a,t)=>a+parseFloat(t.q),0)/trades.length
    const thresh = avgQty*6
    let buy=0, sell=0
    for (const t of trades) {
      const qty=parseFloat(t.q)
      if (qty>=thresh) { if(!t.m) buy+=qty; else sell+=qty }
    }
    return (buy+sell)>0 ? (buy-sell)/(buy+sell) : 0
  } catch { return 0 }
}

// ── Telegram ───────────────────────────────────────────────
async function sendTelegram(msg: string): Promise<void> {
  const token  = Deno.env.get('TELEGRAM_BOT_TOKEN')
  const chatId = Deno.env.get('TELEGRAM_CHAT_ID')
  if (!token || !chatId) return
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML' })
    })
  } catch {}
}

// ── Self-optimization: adapt thresholds + side filter from last 100 trades ──
function computeAdaptive(trades: any[]): {
  minScore: number; vpocDist: number; sideFilter: 'LONG' | 'SHORT' | 'BOTH'
} {
  if (!trades || trades.length < 30) {
    return { minScore: MIN_SCORE, vpocDist: VPOC_MAX_DIST, sideFilter: 'BOTH' }
  }

  const wins = trades.filter(t => Number(t.pnl) > 0).length
  const wr   = wins / trades.length

  // v19: more conservative adaptive thresholds
  let minScore = MIN_SCORE, vpocDist = VPOC_MAX_DIST
  if (wr < 0.20) { minScore = 5; vpocDist = 0.008 }
  else if (wr < 0.30) { minScore = 4; vpocDist = 0.012 }
  else if (wr < 0.40) { minScore = 3; vpocDist = 0.015 }
  else if (wr > 0.60) { minScore = 2; vpocDist = 0.022 }
  else                { minScore = 3; vpocDist = VPOC_MAX_DIST }

  const longs  = trades.filter(t => t.side === 'LONG')
  const shorts = trades.filter(t => t.side === 'SHORT')
  const longWR  = longs.length  >= 15 ? longs.filter(t  => Number(t.pnl) > 0).length / longs.length  : 0.5
  const shortWR = shorts.length >= 15 ? shorts.filter(t => Number(t.pnl) > 0).length / shorts.length : 0.5

  let sideFilter: 'LONG' | 'SHORT' | 'BOTH' = 'BOTH'
  if (longs.length >= 15 && shorts.length >= 15) {
    if (longWR  > shortWR + 0.25) sideFilter = 'LONG'
    else if (shortWR > longWR  + 0.25) sideFilter = 'SHORT'
  }

  return { minScore, vpocDist, sideFilter }
}

// v20: Compute coin whitelist — only symbols with >42% win rate stay active
function computeCoinWhitelist(trades: any[]): Set<string> {
  const whitelist = new Set<string>()
  const bySym: Record<string, any[]> = {}

  // Group by symbol
  for (const t of (trades || [])) {
    if (!bySym[t.sym]) bySym[t.sym] = []
    bySym[t.sym].push(t)
  }

  // Keep symbols with ≥42% win rate
  for (const [sym, symTrades] of Object.entries(bySym)) {
    if (symTrades.length >= 10) {
      const wins = symTrades.filter(t => Number(t.pnl) > 0).length
      const wr = wins / symTrades.length
      if (wr >= MIN_COIN_WIN_RATE) {
        whitelist.add(sym)
      }
    }
  }

  // Fallback: if whitelist is empty, use all symbols
  return whitelist.size > 0 ? whitelist : new Set(FALLBACK_COINS)
}

// ── Dynamic blacklist: block symbols with 2+ consecutive SL in recent window ──
function buildBlacklist(recent: any[]): Set<string> {
  const blacklist = new Set<string>()
  const bySym: Record<string, any[]> = {}
  for (const t of recent || []) {
    if (!bySym[t.sym]) bySym[t.sym] = []
    bySym[t.sym].push(t)
  }
  for (const [sym, trades] of Object.entries(bySym)) {
    trades.sort((a, b) => new Date(b.closed_at).getTime() - new Date(a.closed_at).getTime())
    let consecSL = 0
    for (const t of trades) {
      if (t.status === 'SL') consecSL++
      else break
    }
    if (consecSL >= 2) blacklist.add(sym)
  }
  return blacklist
}

async function runBacktest(): Promise<object> {
  const testCoins = ['BTC','ETH','SOL']
  const results:any[] = []
  for (const sym of testCoins) {
    const bars = await fetchBars(sym,'1m',500)
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
      const vpocAligned = sweep.side==='LONG' ? vpoc>price : vpoc<price
      const vpocDist = Math.abs(vpoc-price)/price
      if (!vpocAligned||vpocDist>VPOC_MAX_DIST) continue
      const slDist=atr*vp.slMult, slPct=slDist/price
      if (slPct<MIN_SL_PCT||slPct>0.05) continue
      const notional=Math.min(bal*0.018/slPct, bal*MAX_NOTIONAL_PCT)
      if (notional<5) continue
      const partialTP=sweep.side==='LONG'?price+slDist*PARTIAL_TP_R:price-slDist*PARTIAL_TP_R
      const tpPrice=sweep.side==='LONG'?price+slDist*vp.tpR:price-slDist*vp.tpR
      const slPrice=sweep.side==='LONG'?price-slDist:price+slDist
      let pnl=0, halfDone=false
      for (let j=i+1; j<Math.min(i+MAX_HOLD_MIN+1,bars.length); j++) {
        const b=bars[j]
        if (sweep.side==='LONG') {
          if (!halfDone&&b.high>=partialTP){pnl+=(notional/2)*slPct*PARTIAL_TP_R;halfDone=true;partials++}
          if (b.high>=tpPrice){pnl+=(halfDone?notional/2:notional)*slPct*vp.tpR;break}
          if (b.low<=slPrice){pnl+=halfDone?0:-(notional*slPct);break}
        } else {
          if (!halfDone&&b.low<=partialTP){pnl+=(notional/2)*slPct*PARTIAL_TP_R;halfDone=true;partials++}
          if (b.low<=tpPrice){pnl+=(halfDone?notional/2:notional)*slPct*vp.tpR;break}
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
      sym, trades:total, wins, losses, partials,
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
      return new Response(JSON.stringify({ok:true, backtest: await runBacktest()}),
        {headers:{'Content-Type':'application/json'}})
    }

    const {data:state} = await supabase.from('bot_state').select('*').eq('id',1).single()
    if (!state?.active) return new Response(JSON.stringify({ok:true,msg:'inactive'}),
      {headers:{'Content-Type':'application/json'}})

    // Paper mode flag: if true, trades are simulated (not live money)
    const paperMode = url.searchParams.get('paper') === '1' || state.paper_mode === true

    let balance = state.balance
    const now  = Date.now()

    // Circuit breaker flag — checked before new entries only, NOT before position management
    const circuitBreakerActive = balance < INITIAL_BALANCE * (1 - MAX_DD_STOP)
    const utcH = new Date().getUTCHours()
    const utcM = new Date().getUTCMinutes()
    const R    = RISK[state.risk as RiskKey] || RISK.medium

    if (url.searchParams.get('status') === '1') {
      const {data:openTrades} = await supabase.from('bot_trades').select('sym,side').eq('status','OPEN')
      const openList = (openTrades||[]).map((t:any)=>`${t.sym} ${t.side}`).join(', ')||'None'
      const modeTag = paperMode ? '📋 PAPER' : '💵 LIVE'
      const msg = (
        `📡 <b>CryptoBot v20 [5m] ${modeTag}</b>\n` +
        `💰 Balance: $${Number(state.balance).toFixed(2)}\n` +
        `📂 Open: ${openTrades?.length||0} — ${openList}\n` +
        `⚡ Active: ${state.active ? '✅' : '❌'}\n` +
        `📈 Streak: ${state.streak||0}\n` +
        `⏱ ${new Date().toUTCString()}`
      )
      await sendTelegram(msg)
      return new Response(JSON.stringify({ok:true,msg}),{headers:{'Content-Type':'application/json'}})
    }

    // v19: extended window to 4h for better blacklist memory
    const {data:recent} = await supabase
      .from('bot_trades').select('sym,pnl,closed_at,status').neq('status','OPEN')
      .gte('closed_at',new Date(now-4*3600_000).toISOString())
      .order('closed_at',{ascending:false}).limit(100)

    const symCooldown = new Set<string>()
    for (const t of (recent||[])) {
      if (t.closed_at && now - new Date(t.closed_at).getTime() < SYM_COOLDOWN_MS)
        symCooldown.add(t.sym)
    }

    const dynamicBlacklist = buildBlacklist(recent || [])

    let streak=0
    for (const t of (recent||[])) { if(Number(t.pnl)<0) streak++; else break }
    const streakPaused = streak>=R.streakLimit &&
      new Date((recent?.[0]?.closed_at??0)).getTime()+STREAK_PAUSE_MS > now

    let kellyMult = 1.0
    if (recent && recent.length >= 8) {
      const wins_   = recent.filter(t=>Number(t.pnl)>0)
      const losses_ = recent.filter(t=>Number(t.pnl)<=0)
      const avgW    = wins_.length   ? wins_.reduce((a,t)=>a+Number(t.pnl),0)/wins_.length : 0
      const avgL    = losses_.length ? Math.abs(losses_.reduce((a,t)=>a+Number(t.pnl),0)/losses_.length) : 1
      const p  = wins_.length/recent.length
      const b  = avgL>0 ? avgW/avgL : 1
      const k  = (p*b-(1-p))/b
      kellyMult = Math.max(0.5, Math.min(1.2, k*1.5))
    }

    const log:string[] = []
    if (streakPaused) log.push(`STREAK PAUSE ${streak}`)
    if (dynamicBlacklist.size > 0) log.push(`BLACKLIST ${[...dynamicBlacklist].join(',')}`)

    const needDailySummary = utcH === 0 && utcM < 2
    const [btcBars, allFunding, COINS, fearGreed, trades100, dayTradesRaw] = await Promise.all([
      fetchBars('BTC','5m',60),
      fetchAllFundingRates(),
      fetchAllLiquidCoins(),
      fetchFearGreed(),
      supabase.from('bot_trades').select('pnl,side').neq('status','OPEN')
        .order('closed_at',{ascending:false}).limit(100)
        .then(r => r.data || []),
      needDailySummary
        ? supabase.from('bot_trades').select('pnl').neq('status','OPEN')
            .gte('closed_at', new Date(now - 86400_000).toISOString())
            .then(r => r.data || [])
        : Promise.resolve(null)
    ])

    const { minScore: adaptMinScore, vpocDist: adaptVpocDist, sideFilter: adaptSideFilter } =
      computeAdaptive(trades100 as any[])

    // v20: Filter coins to whitelist (only those with >42% WR)
    const coinWhitelist = computeCoinWhitelist(recent || [])
    const activeCoins = COINS.filter(c => coinWhitelist.has(c))

    log.push(`COINS=${activeCoins.length}/${COINS.length} (whitelist) FG=${fearGreed} v20`)
    if (coinWhitelist.size > 0 && coinWhitelist.size < COINS.length) {
      log.push(`WHITELIST ${[...coinWhitelist].slice(0,10).join(',')}${coinWhitelist.size > 10 ? '...' : ''}`)
    }
    log.push(`ADAPT sc>=${adaptMinScore} vpoc<=${(adaptVpocDist*100).toFixed(1)}% side=${adaptSideFilter} kelly=${kellyMult.toFixed(2)}`)

    let btcBias:'BULL'|'BEAR'|'NEUTRAL'='NEUTRAL'
    let btcRegime: 'TRENDING'|'RANGING'|'SQUEEZE' = 'TRENDING'
    if (btcBars.length>=20) {
      const cl=btcBars.slice(0,-1).map(b=>b.close)
      const rsi=calcRsi(cl,14), e9=calcEma(cl,9), e21=calcEma(cl,21)
      if(rsi>55&&e9>e21) btcBias='BULL'
      else if(rsi<45&&e9<e21) btcBias='BEAR'
      btcRegime = detectRegime(btcBars.slice(0,-1))
    }
    log.push(`BTC=${btcBias} REGIME=${btcRegime}`)

    if (circuitBreakerActive) {
      log.push(`CIRCUIT_BREAKER active — no new entries, managing open positions only`)
      await sendTelegram(
        `🚨 <b>CIRCUIT BREAKER</b>\n` +
        `יתרה: $${balance.toFixed(2)} (${(((INITIAL_BALANCE-balance)/INITIAL_BALANCE)*100).toFixed(1)}% drawdown)\n` +
        `כניסות חדשות חסומות — ניהול פוזיציות פתוחות ממשיך`
      )
    }

    if (streak === R.streakLimit) {
      await sendTelegram(
        `⚠️ <b>STREAK PAUSE</b>\n` +
        `${streak} הפסדים ברצף (מגבלה: ${R.streakLimit})\n` +
        `מחכה ${STREAK_PAUSE_MS/60000} דקות לפני כניסות חדשות\n` +
        `💰 יתרה: $${balance.toFixed(2)}`
      )
    }

    if (needDailySummary && dayTradesRaw && (dayTradesRaw as any[]).length > 0) {
      const dt   = dayTradesRaw as any[]
      const dWins = dt.filter(t => Number(t.pnl) > 0).length
      const dPnl  = dt.reduce((a,t) => a + Number(t.pnl), 0)
      await sendTelegram(
        `📊 <b>סיכום יומי — CryptoBot v19</b>\n` +
        `עסקאות: ${dt.length} | ✅ ${dWins} ❌ ${dt.length - dWins}\n` +
        `WIN rate: ${((dWins/dt.length)*100).toFixed(0)}%\n` +
        `P&L: ${dPnl>=0?'+':''}$${dPnl.toFixed(2)}\n` +
        `💰 יתרה: $${balance.toFixed(2)}\n` +
        `BTC: ${btcBias} (${btcRegime}) | F&G: ${fearGreed}\n` +
        `ADAPT sc>=${adaptMinScore} vpoc<=${(adaptVpocDist*100).toFixed(1)}% side=${adaptSideFilter}\n` +
        `🚫 Blacklist: ${dynamicBlacklist.size > 0 ? [...dynamicBlacklist].join(', ') : 'none'}`
      )
    }

    const {data:allOpen} = await supabase.from('bot_trades').select('*').eq('status','OPEN')
    const openBySymbol:Record<string,any[]>={}
    const corrGroupCount: Record<number,number> = {}
    let openCount = 0
    for (const t of (allOpen||[])) {
      if(!openBySymbol[t.sym]) openBySymbol[t.sym]=[]
      openBySymbol[t.sym].push(t)
      const gid = getCorrGroup(t.sym)
      if (gid >= 0) corrGroupCount[gid] = (corrGroupCount[gid]||0)+1
      openCount++
    }

    const BATCH = 12
    for (let b=0; b<activeCoins.length; b+=BATCH) {
      await Promise.all(activeCoins.slice(b,b+BATCH).map(async (sym)=>{
    try {
        const [bars5m, bars15m, priceRes] = await Promise.all([
          fetchBars(sym,'5m',200),
          fetchBars(sym,'15m',60),
          fetch(`${BINANCE_DATA}/ticker/price?symbol=${sym}USDT`).then(r=>r.json()).catch(()=>null)
        ])
        if (!bars5m||bars5m.length<30) return

        const price     = priceRes?.price ? +priceRes.price : bars5m[bars5m.length-1].close
        const completed = bars5m.slice(0,-1)
        const atr       = calcATR(completed)
        const atrPct    = atr/price
        const volRegime = getVolRegime(atrPct)
        const vp        = VOL_PARAMS[volRegime]
        const openTrades= openBySymbol[sym]||[]

        // ── Manage open positions ──────────────────────────
        for (const t of openTrades) {
          const entry  = Number(t.entry_price)
          const size   = Number(t.size)
          const sl     = Number(t.trail_sl)
          const slDist = Math.abs(entry-sl)
          const dirM   = t.side==='LONG' ? 1 : -1
          const ageMs  = t.opened_at ? now - new Date(t.opened_at).getTime() : 0

          // v19: fixed TP — use stored hi/lo for BOTH range and sweep trades.
          // This prevents the TP from moving when trail_sl is updated to BE.
          const storedTP_LONG  = Number(t.hi) > entry * 1.001
          const storedTP_SHORT = Number(t.lo)  < entry * 0.999
          const tp = storedTP_LONG  ? Number(t.hi)
                   : storedTP_SHORT ? Number(t.lo)
                   : t.side==='LONG' ? entry+slDist*vp.tpR : entry-slDist*vp.tpR

          // v19: derive original SL distance from stored TP for partial calc
          // (trail_sl may have been moved to BE, making slDist=0 unreliable)
          const origSlDist = (t.side==='LONG'  && storedTP_LONG)  ? (Number(t.hi) - entry) / vp.tpR
                           : (t.side==='SHORT' && storedTP_SHORT) ? (entry - Number(t.lo)) / vp.tpR
                           : slDist

          // Partial TP only for sweep trades (mtf=true)
          if (!t.partial_done && origSlDist > 0 && t.mtf) {
            const partialTPPrice = entry + origSlDist * PARTIAL_TP_R * dirM
            const partialHit = t.side==='LONG' ? price>=partialTPPrice : price<=partialTPPrice
            if (partialHit) {
              const halfSize   = size/2
              const partialPnl = (price-entry)*halfSize*dirM - price*halfSize*FEE
              balance += entry*halfSize + partialPnl
              await supabase.from('bot_trades').update({
                size:halfSize, trail_sl:entry, partial_done:true
              }).eq('id',t.id)
              log.push(`PARTIAL ${sym} ${t.side} @${price.toFixed(4)} pnl=${partialPnl.toFixed(2)}`)
              await sendTelegram(
                `🎯 <b>PARTIAL TP ${sym} ${t.side}</b>\n` +
                `@$${price.toFixed(4)}\n` +
                `+$${partialPnl.toFixed(2)}`
              )
              return
            }
          }

          let newStatus:string|null=null
          if (t.side==='LONG') {
            if(price>=tp)   newStatus='TP'
            else if(price<=sl) newStatus=price>=entry?'TRAIL':'SL'
          } else {
            if(price<=tp)   newStatus='TP'
            else if(price>=sl) newStatus=price<=entry?'TRAIL':'SL'
          }
          if (!newStatus && ageMs > MAX_HOLD_MIN*60_000) newStatus='TRAIL'

          if (newStatus) {
            const fav=(price-entry)/entry*dirM
            const pnl=fav*entry*size-Number(t.fee)-price*size*FEE
            const final=pnl>0&&newStatus==='SL'?'TP':newStatus
            balance+=entry*size+pnl; openCount--
            await supabase.from('bot_trades').update({
              status:final, exit_price:price, pnl,
              pnl_pct:fav, closed_at:new Date().toISOString()
            }).eq('id',t.id)
            const modeTag = t.mtf ? 'SWEEP' : 'RANGE'
            log.push(`CLOSE ${sym} ${t.side} ${final} [${modeTag}] pnl=${pnl.toFixed(2)} ${Math.round(ageMs/60000)}m`)
            await sendTelegram(
              `${pnl>0?'✅':'❌'} <b>CLOSE ${sym} ${t.side} ${final}</b>\n` +
              `@$${price.toFixed(4)} | ${Math.round(ageMs/60000)}m | ${modeTag}\n` +
              `P&L: ${pnl>=0?'+':''}$${pnl.toFixed(2)}\n` +
              `💰 יתרה: $${balance.toFixed(2)}`
            )
          } else {
            // Trail stop logic (sweep trades only)
            if (t.mtf) {
              const profitR = origSlDist>0 ? (price-entry)*dirM/origSlDist : 0
              let newSL = sl
              if (profitR >= vp.trailBeR) {
                const beLevel = entry*(1 + FEE*2.5*dirM)
                newSL = dirM===1 ? Math.max(sl,beLevel) : Math.min(sl,beLevel)
              }
              if (profitR >= vp.trailBeR+0.5) {
                const trailLevel = price - atr*vp.trailAtr*dirM
                newSL = dirM===1 ? Math.max(newSL,trailLevel) : Math.min(newSL,trailLevel)
              }
              if (newSL !== sl) {
                await supabase.from('bot_trades').update({trail_sl:newSL}).eq('id',t.id)
              }
            }
          }
        }

        // ── New entry ──────────────────────────────────────
        if (circuitBreakerActive) return  // halt new entries only; position mgmt ran above
        if (streakPaused) return
        if (openTrades.length>0) return
        if (symCooldown.has(sym)) return
        if (dynamicBlacklist.has(sym)) return
        if (atrPct>0.02||atrPct<0.00003) return
        if (balance < 10) return

        const regime = detectRegime(completed)
        if (regime === 'SQUEEZE') return

        const vpoc = calcVPOC(completed.slice(-80))

        type EntryResult =
          | { mode: 'SWEEP'; side: 'LONG'|'SHORT'; sweepExtreme: number }
          | { mode: 'RANGE'; side: 'LONG'|'SHORT'; tpPrice: number; slDist: number }

        let entry: EntryResult | null = null

        if (regime === 'TRENDING') {
          const lookback = completed.slice(-SWING_LOOKBACK)
          const {highs,lows} = findSwings(lookback, SWING_N)
          if (!highs.length && !lows.length) return
          const sweep = detectSweep(completed, price, highs, lows, atr)
          if (sweep) entry = { mode: 'SWEEP', ...sweep }
        } else {
          const rangeEntry = findRangeEntry(completed, price, vpoc)
          if (rangeEntry) entry = { mode: 'RANGE', ...rangeEntry }
        }

        if (!entry) return

        if (adaptSideFilter === 'LONG'  && entry.side === 'SHORT') return
        if (adaptSideFilter === 'SHORT' && entry.side === 'LONG')  return

        if (entry.mode === 'SWEEP' && sym !== 'BTC' && sym !== 'ETH') {
          if (entry.side === 'LONG'  && btcBias === 'BEAR') return
          if (entry.side === 'SHORT' && btcBias === 'BULL') return
        }

        let smScore = 0
        let isMtf = false

        if (entry.mode === 'SWEEP') {
          const vpocDist = Math.abs(vpoc-price)/price
          const vpocAligned = entry.side==='LONG' ? vpoc>price : vpoc<price
          if (!vpocAligned || vpocDist > adaptVpocDist) return

          const funding = allFunding[sym]||0
          const fundingOk =
            (entry.side==='SHORT'&&funding> FUNDING_EXTREME) ||
            (entry.side==='LONG' &&funding<-FUNDING_EXTREME) ||
            Math.abs(funding)<=FUNDING_EXTREME
          if (!fundingOk) return

          if (bars15m&&bars15m.length>=20) {
            const comp15m=bars15m.slice(0,-1)
            const {highs:h15,lows:l15}=findSwings(comp15m.slice(-40),SWING_N)
            const sweep15m=detectSweep(comp15m,price,h15,l15,calcATR(comp15m))
            if (sweep15m?.side===entry.side) smScore+=2
            else if (sweep15m&&sweep15m.side!==entry.side) return
          }

          if (Math.abs(vpoc-price)/price < 0.008)  smScore+=2
          else if (Math.abs(vpoc-price)/price < 0.015) smScore++

          // v20: removed OB imbalance + whale pressure (too noisy on spot)
          // kept only high-quality signals with doubled weights
          const [liqSignal, oiTrend] = await Promise.all([
            fetchLiqSignal(sym),
            fetchOISignal(sym)
          ])

          if (Math.abs(allFunding[sym]||0)>FUNDING_EXTREME) smScore+=2  // doubled — strongest signal
          if (liqSignal==='LONG_LIQ' &&entry.side==='SHORT') smScore+=2
          if (liqSignal==='SHORT_LIQ'&&entry.side==='LONG')  smScore+=2
          if (oiTrend==='UP')   smScore++
          if (oiTrend==='DOWN') smScore=Math.max(0,smScore-1)
          if (fearGreed<20&&entry.side==='LONG')  smScore+=2  // extreme F&G = high conviction
          if (fearGreed>80&&entry.side==='SHORT') smScore+=2
          if (fearGreed>80&&entry.side==='LONG')  smScore=Math.max(0,smScore-1)
          if (fearGreed<20&&entry.side==='SHORT') smScore=Math.max(0,smScore-1)

          if (smScore < adaptMinScore) {
            log.push(`SKIP ${sym} sc=${smScore}<${adaptMinScore}`)
            return
          }

          isMtf = true
        }

        const gid = getCorrGroup(sym)
        if (gid >= 0 && (corrGroupCount[gid]||0) >= MAX_PER_GROUP) return

        // ── Calculate position size ────────────────────────
        let slPrice: number, slPct: number
        let hiVal = price, loVal = price

        if (entry.mode === 'SWEEP') {
          const slDist = atr * vp.slMult
          slPrice = entry.side==='LONG'
            ? Math.min(entry.sweepExtreme, price) - slDist
            : Math.max(entry.sweepExtreme, price) + slDist
          slPct = Math.abs(price - slPrice) / price
          if (slPct < MIN_SL_PCT || slPct > 0.05) return
          // v19: store fixed TP in hi/lo so management never recalculates from trail_sl
          const actualSlDist = Math.abs(price - slPrice)
          if (entry.side === 'LONG') hiVal = price + actualSlDist * vp.tpR
          else                       loVal = price - actualSlDist * vp.tpR
        } else {
          slPrice = entry.side === 'LONG'
            ? price - entry.slDist
            : price + entry.slDist
          slPct = entry.slDist / price
          if (slPct < 0.002 || slPct > 0.03) return
          if (entry.side === 'LONG') hiVal = entry.tpPrice
          else                       loVal = entry.tpPrice
        }

        const riskAmt  = balance * R.riskPct * kellyMult
        let notional   = Math.min(riskAmt / slPct, balance * MAX_NOTIONAL_PCT, balance * 0.95)
        if (notional < 5) return

        const size = notional / price, fee = price * size * FEE
        balance -= (notional + fee); openCount++
        if (gid >= 0) corrGroupCount[gid] = (corrGroupCount[gid]||0) + 1

        await supabase.from('bot_trades').insert({
          sym, side: entry.side, entry_price: price, size, fee,
          trail_sl: slPrice, hi: hiVal, lo: loVal,
          status: 'OPEN', score: smScore, mtf: isMtf, partial_done: false,
          paper_mode: paperMode
        })

        const modeLabel = entry.mode === 'SWEEP' ? '📊 SWEEP' : '🔄 RANGE'
        log.push(`OPEN ${sym} ${entry.side} [${entry.mode}] @${price.toFixed(6)} sl=${(slPct*100).toFixed(3)}% $${notional.toFixed(0)} SC=${smScore} vol=${volRegime}`)
        await sendTelegram(
          `🟢 <b>OPEN ${sym} ${entry.side} ${modeLabel}</b>\n` +
          `@$${price.toFixed(6)} | SL ${(slPct*100).toFixed(3)}%\n` +
          `$${notional.toFixed(0)} | Score: ${smScore} | ${volRegime}\n` +
          `💰 יתרה: $${balance.toFixed(2)}`
        )

      } catch(e) {
        log.push(`ERR ${sym}: ${String(e).slice(0,40)}`)
      }
    }))
    }

    await supabase.from('bot_state').update({
      balance, updated_at: new Date().toISOString(),
      market_regime: 'v20_5M', streak
    }).eq('id',1)

    return new Response(JSON.stringify({
      ok: true, v: 20, openCount, streakPaused, streak, btcBias, btcRegime,
      kelly: kellyMult, fearGreed, adaptMinScore, adaptVpocDist, adaptSideFilter,
      blacklist: [...dynamicBlacklist],
      log
    }), {headers:{'Content-Type':'application/json'}})

  } catch(e) {
    return new Response(JSON.stringify({error:String(e)}),{
      status:200, headers:{'Content-Type':'application/json'}
    })
  }
})

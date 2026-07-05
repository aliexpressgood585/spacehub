// ════════════════════════════════════════════════════════
// CryptoBot v14 — Profitable Focus
// Min Score 4 + Partial TP + Correlation Filter + Fear & Greed
// ════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2'

const BINANCE_DATA = 'https://data-api.binance.vision/api/v3'
const BINANCE      = 'https://api.binance.com/api/v3'
const FAPI         = 'https://fapi.binance.com/fapi/v1'
const FAPI_DATA    = 'https://fapi.binance.com/futures/data'

const FALLBACK_COINS = [
  'BTC','ETH','SOL','BNB','XRP','DOGE','ADA','AVAX','LINK','DOT',
  'NEAR','UNI','ATOM','LTC','BCH','ARB','OP','INJ','SUI','TON',
  'PEPE','WIF','APT','FET','RNDR','TRX','HBAR','ICP','AAVE','GRT',
]

// Correlation groups — max MAX_PER_GROUP open simultaneously per group
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
  ['BNB'],
  ['BTC'],
  ['ETH'],
]
const MAX_PER_GROUP  = 2
const MIN_SCORE      = 4    // requires real confluence — was effectively 1
const PARTIAL_TP_R   = 1.2  // close 50% at 1.2×R, move SL to entry
const VPOC_MAX_DIST  = 0.035 // VPOC must be within 3.5% of price to count

async function fetchAllLiquidCoins(minVolUSD = 3_000_000): Promise<string[]> {
  try {
    const res = await fetch(`${BINANCE}/ticker/24hr`, {headers:{'User-Agent':'Mozilla/5.0'}})
    if (!res.ok) return FALLBACK_COINS
    const tickers: any[] = await res.json()
    const EXCLUDE = /^(.*)(UP|DOWN|BULL|BEAR|HEDGE|3L|3S|5L|5S)USDT$/
    return tickers
      .filter(t =>
        t.symbol.endsWith('USDT') &&
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
  low:    { riskPct:0.015, streakLimit:4 },
  medium: { riskPct:0.025, streakLimit:5 },
  high:   { riskPct:0.040, streakLimit:6 },
} as const
type RiskKey = keyof typeof RISK

const FEE             = 0.001
const SWING_N         = 3
const SWING_LOOKBACK  = 50
const SWEEP_LOOKBACK  = 3
const MAX_HOLD_H      = 6
const STREAK_PAUSE_MS = 45*60_000
const MAX_NOTIONAL_PCT= 0.15
const FUNDING_EXTREME = 0.0002

const VOL_PARAMS = {
  LOW:    { slMult:1.1, tpR:2.2, trailBeR:0.8, trailAtr:0.4 },
  MEDIUM: { slMult:0.8, tpR:2.5, trailBeR:1.0, trailAtr:0.5 },
  HIGH:   { slMult:0.6, tpR:3.0, trailBeR:1.2, trailAtr:0.6 },
}

interface Bar { open:number; high:number; low:number; close:number; vol:number }

// ── Utils ──────────────────────────────────────────────────────────────────────

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

function getVolRegime(atrPct:number): 'LOW'|'MEDIUM'|'HIGH' {
  if (atrPct < 0.007) return 'LOW'
  if (atrPct < 0.022) return 'MEDIUM'
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
  const maxIdx = hist.indexOf(Math.max(...hist))
  return min + (maxIdx+0.5)*step
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
  // Quality check: close-back must be > 0.2×ATR from swept level (decisive rejection)
  const minCloseback = atr * 0.2
  for (let k=1; k<=SWEEP_LOOKBACK; k++) {
    const bar=bars[n-k]
    for (const lvl of highs) {
      if (bar.high>lvl && bar.close<lvl && price<=bar.close*1.002) {
        if (lvl - bar.close >= minCloseback)
          return {side:'SHORT', sweepExtreme:bar.high}
      }
    }
    for (const lvl of lows) {
      if (bar.low<lvl && bar.close>lvl && price>=bar.close*0.998) {
        if (bar.close - lvl >= minCloseback)
          return {side:'LONG', sweepExtreme:bar.low}
      }
    }
  }
  return null
}

function isActiveSession(): boolean {
  const h = new Date().getUTCHours()
  return !(h >= 1 && h < 7)
}

function getCorrGroup(sym:string): number {
  for (let i=0; i<CORR_GROUPS.length; i++) {
    if (CORR_GROUPS[i].includes(sym)) return i
  }
  return -1 // no group = uncorrelated, always allowed
}

// ── Smart Money Signals ────────────────────────────────────────────────────────

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
      `${FAPI_DATA}/openInterestHist?symbol=${sym}USDT&period=1h&limit=5`,
      {headers:{'User-Agent':'Mozilla/5.0'}}
    )
    if (!res.ok) return 'FLAT'
    const data:any[] = await res.json()
    if (data.length<2) return 'FLAT'
    const first = parseFloat(data[0].sumOpenInterest)
    const last  = parseFloat(data[data.length-1].sumOpenInterest)
    const chg   = first>0 ? (last-first)/first : 0
    return chg > 0.015 ? 'UP' : chg < -0.015 ? 'DOWN' : 'FLAT'
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
    if (chg < -0.06) return 'LONG_LIQ'
    if (chg > 0.06)  return 'SHORT_LIQ'
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
    const thresh = avgQty*8
    let buy=0, sell=0
    for (const t of trades) {
      const qty=parseFloat(t.q)
      if (qty>=thresh) { if(!t.m) buy+=qty; else sell+=qty }
    }
    return (buy+sell)>0 ? (buy-sell)/(buy+sell) : 0
  } catch { return 0 }
}

// ── Backtesting ────────────────────────────────────────────────────────────────

async function runBacktest(): Promise<object> {
  const testCoins = ['BTC','ETH','SOL','BNB','LINK']
  const results:any[] = []
  for (const sym of testCoins) {
    const bars = await fetchBars(sym,'1h',500)
    if (bars.length<100) continue
    let bal=10_000, wins=0, losses=0, partials=0
    const pnls:number[]=[]
    for (let i=55; i<bars.length-1; i++) {
      const slice=bars.slice(0,i+1), price=slice[i].close
      const atr=calcATR(slice.slice(-(14+1))), atrPct=atr/price
      if (atrPct>0.05||atrPct<0.0003) continue
      const vp=VOL_PARAMS[getVolRegime(atrPct)]
      const {highs,lows}=findSwings(slice.slice(-SWING_LOOKBACK),SWING_N)
      if (!highs.length&&!lows.length) continue
      const sweep=detectSweep(slice,price,highs,lows,atr)
      if (!sweep) continue
      const vpoc=calcVPOC(slice.slice(-60))
      const vpocAligned = sweep.side==='LONG' ? vpoc>price : vpoc<price
      const vpocDist = Math.abs(vpoc-price)/price
      if (!vpocAligned||vpocDist>VPOC_MAX_DIST) continue
      const slDist=atr*vp.slMult, slPct=slDist/price
      if (slPct<=0||slPct>0.10) continue
      const notional=Math.min(bal*0.025/slPct, bal*MAX_NOTIONAL_PCT)
      if (notional<5) continue
      const partialTP = sweep.side==='LONG' ? price+slDist*PARTIAL_TP_R : price-slDist*PARTIAL_TP_R
      const tpPrice   = sweep.side==='LONG' ? price+slDist*vp.tpR       : price-slDist*vp.tpR
      const slPrice   = sweep.side==='LONG' ? price-slDist               : price+slDist
      let pnl=0, halfDone=false
      for (let j=i+1; j<Math.min(i+MAX_HOLD_H+1,bars.length); j++) {
        const b=bars[j]
        if (sweep.side==='LONG') {
          if (!halfDone && b.high>=partialTP) {
            pnl += (notional/2)*slPct*PARTIAL_TP_R
            halfDone=true; partials++
          }
          if (b.high>=tpPrice){pnl+=(halfDone?notional/2:notional)*slPct*vp.tpR;break}
          if (b.low<=slPrice){pnl+=halfDone?0:-(notional*slPct);break}
        } else {
          if (!halfDone && b.low<=partialTP) {
            pnl += (notional/2)*slPct*PARTIAL_TP_R
            halfDone=true; partials++
          }
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
      sharpe:(avgPnl/(std||1)*Math.sqrt(365*24)).toFixed(2)
    })
  }
  return results
}

// ── Main ───────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY')!
    )

    if (url.searchParams.get('backtest')==='1') {
      const results = await runBacktest()
      return new Response(JSON.stringify({ok:true,backtest:results}),
        {headers:{'Content-Type':'application/json'}})
    }

    const {data:state} = await supabase.from('bot_state').select('*').eq('id',1).single()
    if (!state?.active) return new Response(JSON.stringify({ok:true,msg:'inactive'}),
      {headers:{'Content-Type':'application/json'}})

    let balance = state.balance
    const now = Date.now()
    const R = RISK[state.risk as RiskKey] || RISK.medium

    if (!isActiveSession()) {
      return new Response(JSON.stringify({ok:true,msg:'off-session 01-07 UTC'}),
        {headers:{'Content-Type':'application/json'}})
    }

    const {data:recent} = await supabase
      .from('bot_trades').select('pnl,closed_at,status').neq('status','OPEN')
      .gte('closed_at',new Date(now-3*3600_000).toISOString())
      .order('closed_at',{ascending:false}).limit(30)
    let streak=0
    for (const t of (recent||[])) { if(Number(t.pnl)<0) streak++; else break }
    const streakPaused = streak>=R.streakLimit &&
      new Date((recent?.[0]?.closed_at??0)).getTime()+STREAK_PAUSE_MS > now

    // Kelly sizing from last 30 trades
    let kellyMult = 1.0
    if (recent && recent.length >= 10) {
      const wins_   = recent.filter(t=>Number(t.pnl)>0)
      const losses_ = recent.filter(t=>Number(t.pnl)<=0)
      const avgW    = wins_.length   ? wins_.reduce((a,t)=>a+Number(t.pnl),0)/wins_.length : 0
      const avgL    = losses_.length ? Math.abs(losses_.reduce((a,t)=>a+Number(t.pnl),0)/losses_.length) : 1
      const p  = wins_.length/recent.length
      const b  = avgL>0 ? avgW/avgL : 1
      const k  = (p*b-(1-p))/b
      kellyMult = Math.max(0.4, Math.min(1.5, k*2))
    }

    const {count} = await supabase.from('bot_trades')
      .select('*',{count:'exact',head:true}).eq('status','OPEN')
    let openCount = count||0
    const log:string[] = []
    if (streakPaused) log.push(`STREAK PAUSE ${streak}`)

    const [btcBars, allFunding, COINS, fearGreed] = await Promise.all([
      fetchBars('BTC','1h',30),
      fetchAllFundingRates(),
      fetchAllLiquidCoins(),
      fetchFearGreed()
    ])
    log.push(`COINS=${COINS.length} FG=${fearGreed}`)

    let btcBias:'BULL'|'BEAR'|'NEUTRAL'='NEUTRAL'
    if (btcBars.length>=20) {
      const cl=btcBars.slice(0,-1).map(b=>b.close)
      const rsi=calcRsi(cl,14), e9=calcEma(cl,9), e21=calcEma(cl,21)
      if(rsi>55&&e9>e21) btcBias='BULL'
      else if(rsi<45&&e9<e21) btcBias='BEAR'
    }
    log.push(`BTC=${btcBias} v14 kelly=${kellyMult.toFixed(2)} FG=${fearGreed}`)

    const {data:allOpen} = await supabase.from('bot_trades').select('*').eq('status','OPEN')
    const openBySymbol:Record<string,any[]>={}
    // Build correlation group counts from open positions
    const corrGroupCount: Record<number,number> = {}
    for (const t of (allOpen||[])) {
      if(!openBySymbol[t.sym]) openBySymbol[t.sym]=[]
      openBySymbol[t.sym].push(t)
      const gid = getCorrGroup(t.sym)
      if (gid >= 0) corrGroupCount[gid] = (corrGroupCount[gid]||0)+1
    }

    const BATCH = 15
    for (let b=0; b<COINS.length; b+=BATCH) {
      await Promise.all(COINS.slice(b,b+BATCH).map(async (sym)=>{
    try {
        const [bars1h, bars4h, priceRes] = await Promise.all([
          fetchBars(sym,'1h',65),
          fetchBars(sym,'4h',55),
          fetch(`${BINANCE}/ticker/price?symbol=${sym}USDT`).then(r=>r.json()).catch(()=>null)
        ])
        if (!bars1h||bars1h.length<25) return

        const price     = priceRes?.price ? +priceRes.price : bars1h[bars1h.length-1].close
        const completed = bars1h.slice(0,-1)
        const atr       = calcATR(completed)
        const atrPct    = atr/price
        const volRegime = getVolRegime(atrPct)
        const vp        = VOL_PARAMS[volRegime]
        const openTrades = openBySymbol[sym]||[]

        // ── Position management + Partial TP ───────────────
        for (const t of openTrades) {
          const entry  = Number(t.entry_price)
          const size   = Number(t.size)
          const sl     = Number(t.trail_sl)
          const slDist = Math.abs(entry-sl)
          const tp     = t.side==='LONG' ? entry+slDist*vp.tpR : entry-slDist*vp.tpR
          const dirM   = t.side==='LONG' ? 1 : -1
          const partialDone = !!t.partial_done

          // Partial TP — close 50% at 1.2×R, move SL to entry
          if (!partialDone && slDist > 0) {
            const partialTPPrice = entry + slDist*PARTIAL_TP_R*dirM
            const partialHit = t.side==='LONG' ? price>=partialTPPrice : price<=partialTPPrice
            if (partialHit) {
              const halfSize  = size/2
              const partialPnl = (price-entry)*halfSize*dirM - price*halfSize*FEE
              balance += entry*halfSize + partialPnl
              await supabase.from('bot_trades').update({
                size: halfSize,
                trail_sl: entry,      // SL to breakeven after partial TP
                partial_done: true
              }).eq('id', t.id)
              log.push(`PARTIAL ${sym} ${t.side} @${price.toFixed(4)} pnl=${partialPnl.toFixed(2)}`)
              continue // skip further management this cycle
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
          if (!newStatus && t.opened_at && now-new Date(t.opened_at).getTime()>MAX_HOLD_H*3600_000)
            newStatus='TRAIL'

          if (newStatus) {
            const fav=(price-entry)/entry*dirM
            const pnl=fav*entry*size-Number(t.fee)-price*size*FEE
            const final=pnl>0&&newStatus==='SL'?'TP':newStatus
            balance+=entry*size+pnl; openCount--
            await supabase.from('bot_trades').update({
              status:final, exit_price:price, pnl,
              pnl_pct:fav, closed_at:new Date().toISOString()
            }).eq('id',t.id)
            log.push(`CLOSE ${sym} ${t.side} ${final} pnl=${pnl.toFixed(2)}`)
          } else {
            // Adaptive trailing stop
            const profitR = slDist>0 ? (price-entry)*dirM/slDist : 0
            let newSL = sl
            if (profitR >= vp.trailBeR) {
              const beLevel = entry + slDist*0.05*dirM
              newSL = dirM===1 ? Math.max(sl,beLevel) : Math.min(sl,beLevel)
            }
            if (profitR >= vp.trailBeR+0.5) {
              const trailLevel = price - atr*vp.trailAtr*dirM
              newSL = dirM===1 ? Math.max(newSL,trailLevel) : Math.min(newSL,trailLevel)
            }
            if (newSL !== sl) {
              await supabase.from('bot_trades').update({trail_sl:newSL}).eq('id',t.id)
              log.push(`TRAIL ${sym} ${t.side} R=${profitR.toFixed(1)} vol=${volRegime} sl→${newSL.toFixed(4)}`)
            }
          }
        }

        // ── New entry ──────────────────────────────────────
        if (streakPaused) return
        if (openTrades.length>0) return
        if (atrPct>0.05||atrPct<0.0003) return
        if (balance < 10) return

        const lookback = completed.slice(-SWING_LOOKBACK)
        const {highs,lows} = findSwings(lookback,SWING_N)
        if (!highs.length&&!lows.length) return

        const sweep = detectSweep(completed,price,highs,lows,atr)
        if (!sweep) return

        // BTC bias filter
        if (sym!=='BTC'&&sym!=='ETH') {
          if (sweep.side==='LONG' &&btcBias==='BEAR') return
          if (sweep.side==='SHORT'&&btcBias==='BULL') return
        }

        // VPOC — directional AND within proximity
        const vpoc     = calcVPOC(completed.slice(-60))
        const vpocDist = Math.abs(vpoc-price)/price
        const vpocAligned = sweep.side==='LONG' ? vpoc>price : vpoc<price
        if (!vpocAligned || vpocDist > VPOC_MAX_DIST) {
          log.push(`SKIP ${sym} VPOC dist=${(vpocDist*100).toFixed(1)}% aligned=${vpocAligned}`)
          return
        }

        // Funding filter
        const funding = allFunding[sym]||0
        const fundingAligned =
          (sweep.side==='SHORT'&&funding> FUNDING_EXTREME) ||
          (sweep.side==='LONG' &&funding<-FUNDING_EXTREME) ||
          Math.abs(funding)<=FUNDING_EXTREME
        if (!fundingAligned) {
          log.push(`SKIP ${sym} funding-contra ${(funding*100).toFixed(4)}%`)
          return
        }

        // MTF 4H
        let smScore = 0
        if (bars4h&&bars4h.length>=25) {
          const comp4h=bars4h.slice(0,-1)
          const {highs:h4,lows:l4}=findSwings(comp4h.slice(-SWING_LOOKBACK),SWING_N)
          const sweep4h=detectSweep(comp4h,price,h4,l4,calcATR(comp4h))
          if (sweep4h?.side===sweep.side) {
            smScore+=2
            log.push(`MTF4H ${sym} ✓`)
          } else if (sweep4h&&sweep4h.side!==sweep.side) {
            log.push(`SKIP ${sym} MTF4H contra`)
            return
          }
        }

        // SM signals
        const [obImbalance, whalePressure, liqSignal, oiTrend] = await Promise.all([
          fetchOBImbalance(sym),
          fetchWhalePressure(sym),
          fetchLiqSignal(sym),
          fetchOISignal(sym)
        ])

        if (Math.abs(funding)>FUNDING_EXTREME) smScore++
        if (sweep.side==='LONG' &&obImbalance> 0.10) smScore++
        if (sweep.side==='SHORT'&&obImbalance<-0.10) smScore++
        if (sweep.side==='LONG' &&whalePressure> 0.20) smScore++
        if (sweep.side==='SHORT'&&whalePressure<-0.20) smScore++
        if (liqSignal==='LONG_LIQ' &&sweep.side==='SHORT') smScore+=2
        if (liqSignal==='SHORT_LIQ'&&sweep.side==='LONG')  smScore+=2
        if (oiTrend==='UP')   smScore++
        if (oiTrend==='DOWN') smScore = Math.max(0, smScore-1)

        // VPOC proximity bonus
        if (vpocDist < 0.015) smScore += 2
        else if (vpocDist < VPOC_MAX_DIST) smScore++

        // Fear & Greed macro filter
        if (fearGreed < 20) {
          // Extreme fear: bonus for LONG, penalty for SHORT
          if (sweep.side==='LONG') smScore++
          else smScore = Math.max(0, smScore-2)
        } else if (fearGreed > 80) {
          // Extreme greed: bonus for SHORT, penalty for LONG
          if (sweep.side==='SHORT') smScore++
          else smScore = Math.max(0, smScore-2)
        }

        // Strong contradiction = hard skip
        const hasContradiction =
          (sweep.side==='LONG' &&(obImbalance<-0.25||whalePressure<-0.35)) ||
          (sweep.side==='SHORT'&&(obImbalance> 0.25||whalePressure> 0.35))
        if (hasContradiction) {
          log.push(`SKIP ${sym} SM-contra sc=${smScore}`)
          return
        }

        // Minimum score gate — the key filter
        if (smScore < MIN_SCORE) {
          log.push(`SKIP ${sym} low-score sc=${smScore}<${MIN_SCORE}`)
          return
        }

        // Correlation filter — max MAX_PER_GROUP open per group
        const gid = getCorrGroup(sym)
        if (gid >= 0 && (corrGroupCount[gid]||0) >= MAX_PER_GROUP) {
          log.push(`SKIP ${sym} corr-group ${gid} full (${corrGroupCount[gid]})`)
          return
        }

        log.push(`SM ${sym} f=${(funding*100).toFixed(3)}% ob=${obImbalance.toFixed(2)} wh=${whalePressure.toFixed(2)} liq=${liqSignal} oi=${oiTrend} sc=${smScore} vol=${volRegime} FG=${fearGreed}`)

        // SL / TP (Adaptive + Kelly)
        const slDist  = atr*vp.slMult
        const slPrice = sweep.side==='LONG'
          ? Math.min(sweep.sweepExtreme,price)-slDist
          : Math.max(sweep.sweepExtreme,price)+slDist
        const slPct = Math.abs(price-slPrice)/price
        if (slPct<=0||slPct>0.10) return

        const riskAmt = balance*R.riskPct*kellyMult
        let notional  = riskAmt/slPct
        notional = Math.min(notional, balance*MAX_NOTIONAL_PCT, balance*0.95)
        if (notional<5) return

        const size=notional/price, fee=price*size*FEE
        balance-=(notional+fee); openCount++
        if (gid >= 0) corrGroupCount[gid] = (corrGroupCount[gid]||0)+1

        await supabase.from('bot_trades').insert({
          sym, side:sweep.side, entry_price:price, size, fee,
          trail_sl:slPrice, hi:price, lo:price,
          status:'OPEN', score:smScore, mtf:true, partial_done:false
        })
        log.push(`OPEN ${sym} ${sweep.side} @${price.toFixed(4)} sl=${(slPct*100).toFixed(2)}% $${notional.toFixed(0)} SC=${smScore} K=${kellyMult.toFixed(2)} vol=${volRegime}`)

      } catch(e) {
        log.push(`ERR ${sym}: ${String(e).slice(0,50)}`)
      }
    })) // end Promise.all batch
    } // end for batches

    await supabase.from('bot_state').update({
      balance, updated_at:new Date().toISOString(),
      market_regime:'v14_PROFIT', streak
    }).eq('id',1)

    return new Response(JSON.stringify({
      ok:true, v:14, openCount, streakPaused, streak, btcBias,
      kelly:kellyMult, fearGreed, log
    }), {headers:{'Content-Type':'application/json'}})

  } catch(e) {
    return new Response(JSON.stringify({error:String(e)}),{
      status:200, headers:{'Content-Type':'application/json'}
    })
  }
})

// ════════════════════════════════════════════════════════
// CryptoBot v13 — Maximum Edge
// VPOC + OI Divergence + Adaptive Vol + Kelly Sizing + Session Filter
// כל השינויים מוחלים מיד על פוזיציות קיימות
// ════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2'

const BINANCE_DATA = 'https://data-api.binance.vision/api/v3'
const BINANCE      = 'https://api.binance.com/api/v3'
const FAPI         = 'https://fapi.binance.com/fapi/v1'
const FAPI_DATA    = 'https://fapi.binance.com/futures/data'

const COINS = [
  'BTC','ETH','SOL','BNB','XRP','DOGE','ADA','AVAX','LINK','DOT',
  'NEAR','UNI','ATOM','LTC','BCH','ARB','OP','INJ','SUI','TON',
  'PEPE','WIF','APT','FET','RNDR'
]

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

// Adaptive volatility params per regime
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

// VPOC — מחיר עם הנפח הגבוה ביותר = מגנט נזילות
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
  highs:number[], lows:number[]
): {side:'LONG'|'SHORT', sweepExtreme:number} | null {
  const n=bars.length
  if (n < SWEEP_LOOKBACK+1) return null
  for (let k=1; k<=SWEEP_LOOKBACK; k++) {
    const bar=bars[n-k]
    for (const lvl of highs)
      if (bar.high>lvl && bar.close<lvl && price<=bar.close*1.002)
        return {side:'SHORT', sweepExtreme:bar.high}
    for (const lvl of lows)
      if (bar.low<lvl && bar.close>lvl && price>=bar.close*0.998)
        return {side:'LONG', sweepExtreme:bar.low}
  }
  return null
}

// Session filter: הימנע מ-01:00-07:00 UTC (נזילות נמוכה)
function isActiveSession(): boolean {
  const h = new Date().getUTCHours()
  return !(h >= 1 && h < 7)
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

// Open Interest: כיוון OI מול מחיר = מי בונה פוזיציה
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

// פירוקים: שינוי יחס Long/Short
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
    let bal=10_000, wins=0, losses=0
    const pnls:number[]=[]
    for (let i=55; i<bars.length-1; i++) {
      const slice=bars.slice(0,i+1), price=slice[i].close
      const atr=calcATR(slice.slice(-(14+1))), atrPct=atr/price
      if (atrPct>0.05||atrPct<0.0003) continue
      const vp=VOL_PARAMS[getVolRegime(atrPct)]
      const {highs,lows}=findSwings(slice.slice(-SWING_LOOKBACK),SWING_N)
      if (!highs.length&&!lows.length) continue
      const sweep=detectSweep(slice,price,highs,lows)
      if (!sweep) continue
      const vpoc=calcVPOC(slice.slice(-60))
      // VPOC must be in trade direction
      const vpocOk = sweep.side==='LONG' ? vpoc>price : vpoc<price
      if (!vpocOk) continue
      const slDist=atr*vp.slMult, slPct=slDist/price
      if (slPct<=0||slPct>0.10) continue
      const notional=Math.min(bal*0.025/slPct, bal*MAX_NOTIONAL_PCT)
      if (notional<5) continue
      const tpPrice=sweep.side==='LONG'?price+slDist*vp.tpR:price-slDist*vp.tpR
      const slPrice=sweep.side==='LONG'?price-slDist:price+slDist
      let pnl=0
      for (let j=i+1; j<Math.min(i+MAX_HOLD_H+1,bars.length); j++) {
        const b=bars[j]
        if (sweep.side==='LONG') {
          if (b.high>=tpPrice){pnl=notional*slPct*vp.tpR;break}
          if (b.low<=slPrice){pnl=-notional*slPct;break}
        } else {
          if (b.low<=tpPrice){pnl=notional*slPct*vp.tpR;break}
          if (b.high>=slPrice){pnl=-notional*slPct;break}
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
      sym, trades:total, wins, losses,
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

    // Session filter
    if (!isActiveSession()) {
      return new Response(JSON.stringify({ok:true,msg:'off-session 01-07 UTC'}),
        {headers:{'Content-Type':'application/json'}})
    }

    // רצף הפסדים
    const {data:recent} = await supabase
      .from('bot_trades').select('pnl,closed_at,status').neq('status','OPEN')
      .gte('closed_at',new Date(now-3*3600_000).toISOString())
      .order('closed_at',{ascending:false}).limit(30)
    let streak=0
    for (const t of (recent||[])) { if(Number(t.pnl)<0) streak++; else break }
    const streakPaused = streak>=R.streakLimit &&
      new Date((recent?.[0]?.closed_at??0)).getTime()+STREAK_PAUSE_MS > now

    // Kelly sizing — מבוסס 30 עסקאות אחרונות
    let kellyMult = 1.0
    if (recent && recent.length >= 10) {
      const wins   = recent.filter(t=>Number(t.pnl)>0)
      const losses_ = recent.filter(t=>Number(t.pnl)<=0)
      const avgW   = wins.length   ? wins.reduce((a,t)=>a+Number(t.pnl),0)/wins.length : 0
      const avgL   = losses_.length ? Math.abs(losses_.reduce((a,t)=>a+Number(t.pnl),0)/losses_.length) : 1
      const p  = wins.length/recent.length
      const b  = avgL>0 ? avgW/avgL : 1
      const k  = (p*b-(1-p))/b
      kellyMult = Math.max(0.4, Math.min(1.5, k*2))
    }

    const {count} = await supabase.from('bot_trades')
      .select('*',{count:'exact',head:true}).eq('status','OPEN')
    let openCount = count||0
    const log:string[] = []
    if (streakPaused) log.push(`STREAK PAUSE ${streak}`)

    const [btcBars, allFunding] = await Promise.all([
      fetchBars('BTC','1h',30),
      fetchAllFundingRates()
    ])

    let btcBias:'BULL'|'BEAR'|'NEUTRAL'='NEUTRAL'
    if (btcBars.length>=20) {
      const cl=btcBars.slice(0,-1).map(b=>b.close)
      const rsi=calcRsi(cl,14), e9=calcEma(cl,9), e21=calcEma(cl,21)
      if(rsi>55&&e9>e21) btcBias='BULL'
      else if(rsi<45&&e9<e21) btcBias='BEAR'
    }
    log.push(`BTC=${btcBias} v13 kelly=${kellyMult.toFixed(2)}`)

    const {data:allOpen} = await supabase.from('bot_trades').select('*').eq('status','OPEN')
    const openBySymbol:Record<string,any[]>={}
    for (const t of (allOpen||[])) {
      if(!openBySymbol[t.sym]) openBySymbol[t.sym]=[]
      openBySymbol[t.sym].push(t)
    }

    for (const sym of COINS) {
      try {
        const [bars1h, bars4h, priceRes] = await Promise.all([
          fetchBars(sym,'1h',65),
          fetchBars(sym,'4h',55),
          fetch(`${BINANCE}/ticker/price?symbol=${sym}USDT`).then(r=>r.json()).catch(()=>null)
        ])
        if (!bars1h||bars1h.length<25) continue

        const price     = priceRes?.price ? +priceRes.price : bars1h[bars1h.length-1].close
        const completed = bars1h.slice(0,-1)
        const atr       = calcATR(completed)
        const atrPct    = atr/price
        const volRegime = getVolRegime(atrPct)
        const vp        = VOL_PARAMS[volRegime]
        const openTrades = openBySymbol[sym]||[]

        // ── ניהול פוזיציות קיימות + Trailing דינמי ─────────
        // מוחל מיד על כל הפוזיציות הפתוחות עם הפרמטרים החדשים
        for (const t of openTrades) {
          const entry  = Number(t.entry_price)
          const size   = Number(t.size)
          const sl     = Number(t.trail_sl)
          const slDist = Math.abs(entry-sl)
          const tp     = t.side==='LONG' ? entry+slDist*vp.tpR : entry-slDist*vp.tpR
          const dirM   = t.side==='LONG' ? 1 : -1

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
            // Adaptive trailing stop — מחיל את הפרמטרים לפי תנודתיות נוכחית
            const profitR = slDist>0 ? (price-entry)*dirM/slDist : 0
            let newSL = sl

            if (profitR >= vp.trailBeR) {
              // שלב 1: breakeven
              const beLevel = entry + slDist*0.05*dirM
              newSL = dirM===1 ? Math.max(sl,beLevel) : Math.min(sl,beLevel)
            }
            if (profitR >= vp.trailBeR+0.5) {
              // שלב 2: trailing דינמי לפי volatility regime
              const trailLevel = price - atr*vp.trailAtr*dirM
              newSL = dirM===1 ? Math.max(newSL,trailLevel) : Math.min(newSL,trailLevel)
            }

            if (newSL !== sl) {
              await supabase.from('bot_trades').update({trail_sl:newSL}).eq('id',t.id)
              log.push(`TRAIL ${sym} ${t.side} R=${profitR.toFixed(1)} vol=${volRegime} sl→${newSL.toFixed(4)}`)
            }
          }
        }

        // ── כניסה חדשה ─────────────────────────────────────
        if (streakPaused) continue
        if (openTrades.length>0) continue
        if (atrPct>0.05||atrPct<0.0003) continue
        if (balance < 10) continue   // גבול יחיד: כסף בחשבון

        const lookback = completed.slice(-SWING_LOOKBACK)
        const {highs,lows} = findSwings(lookback,SWING_N)
        if (!highs.length&&!lows.length) continue

        const sweep = detectSweep(completed,price,highs,lows)
        if (!sweep) continue

        // פילטר BTC
        if (sym!=='BTC'&&sym!=='ETH') {
          if (sweep.side==='LONG' &&btcBias==='BEAR') continue
          if (sweep.side==='SHORT'&&btcBias==='BULL') continue
        }

        // VPOC — המגנט חייב להיות בכיוון הסחר
        const vpoc = calcVPOC(completed.slice(-60))
        const vpocAligned = sweep.side==='LONG' ? vpoc>price : vpoc<price
        if (!vpocAligned) {
          log.push(`SKIP ${sym} VPOC=${vpoc.toFixed(4)} contra`)
          continue
        }

        // Funding Rate
        const funding = allFunding[sym]||0
        const fundingAligned =
          (sweep.side==='SHORT'&&funding> FUNDING_EXTREME) ||
          (sweep.side==='LONG' &&funding<-FUNDING_EXTREME) ||
          Math.abs(funding)<=FUNDING_EXTREME
        if (!fundingAligned) {
          log.push(`SKIP ${sym} funding-contra ${(funding*100).toFixed(4)}%`)
          continue
        }

        // MTF 4H
        let smScore = 0
        if (bars4h&&bars4h.length>=25) {
          const comp4h=bars4h.slice(0,-1)
          const {highs:h4,lows:l4}=findSwings(comp4h.slice(-SWING_LOOKBACK),SWING_N)
          const sweep4h=detectSweep(comp4h,price,h4,l4)
          if (sweep4h?.side===sweep.side) {
            smScore+=2
            log.push(`MTF4H ${sym} ✓`)
          } else if (sweep4h&&sweep4h.side!==sweep.side) {
            log.push(`SKIP ${sym} MTF4H contra`)
            continue
          }
        }

        // SM signals בקריאה מקבילה
        const [obImbalance, whalePressure, liqSignal, oiTrend] = await Promise.all([
          fetchOBImbalance(sym),
          fetchWhalePressure(sym),
          fetchLiqSignal(sym),
          fetchOISignal(sym)
        ])

        // Funding aligned bonus
        if (Math.abs(funding)>FUNDING_EXTREME) smScore++

        // Order Book
        if (sweep.side==='LONG' &&obImbalance> 0.10) smScore++
        if (sweep.side==='SHORT'&&obImbalance<-0.10) smScore++

        // Whale
        if (sweep.side==='LONG' &&whalePressure> 0.20) smScore++
        if (sweep.side==='SHORT'&&whalePressure<-0.20) smScore++

        // Liquidations (strongest signal)
        if (liqSignal==='LONG_LIQ' &&sweep.side==='SHORT') smScore+=2
        if (liqSignal==='SHORT_LIQ'&&sweep.side==='LONG')  smScore+=2

        // Open Interest — OI עולה = צד מסוים בונה → sweep אמיתי יותר
        if (oiTrend==='UP')   smScore++
        if (oiTrend==='DOWN') smScore = Math.max(0, smScore-1)

        // VPOC מיושר = bonus נוסף
        smScore++

        // סתירה חזקה = דלג
        const hasContradiction =
          (sweep.side==='LONG' &&(obImbalance<-0.25||whalePressure<-0.35)) ||
          (sweep.side==='SHORT'&&(obImbalance> 0.25||whalePressure> 0.35))
        if (smScore<=1&&hasContradiction) {
          log.push(`SKIP ${sym} SM-contra sc=${smScore}`)
          continue
        }

        log.push(`SM ${sym} f=${(funding*100).toFixed(3)}% ob=${obImbalance.toFixed(2)} wh=${whalePressure.toFixed(2)} liq=${liqSignal} oi=${oiTrend} sc=${smScore} vol=${volRegime}`)

        // ── SL / TP / כניסה (Adaptive + Kelly) ─────────────
        const slDist  = atr*vp.slMult
        const slPrice = sweep.side==='LONG'
          ? Math.min(sweep.sweepExtreme,price)-slDist
          : Math.max(sweep.sweepExtreme,price)+slDist
        const slPct = Math.abs(price-slPrice)/price
        if (slPct<=0||slPct>0.10) continue

        const riskAmt = balance*R.riskPct*kellyMult
        let notional  = riskAmt/slPct
        notional = Math.min(notional, balance*MAX_NOTIONAL_PCT, balance*0.95)
        if (notional<5) continue

        const size=notional/price, fee=price*size*FEE
        balance-=(notional+fee); openCount++

        await supabase.from('bot_trades').insert({
          sym, side:sweep.side, entry_price:price, size, fee,
          trail_sl:slPrice, hi:price, lo:price,
          status:'OPEN', score:smScore, mtf:true
        })
        log.push(`OPEN ${sym} ${sweep.side} @${price.toFixed(4)} sl=${(slPct*100).toFixed(2)}% $${notional.toFixed(0)} SM=${smScore} K=${kellyMult.toFixed(2)} vol=${volRegime}`)

        await new Promise(r=>setTimeout(r,30))
      } catch(e) {
        log.push(`ERR ${sym}: ${String(e).slice(0,50)}`)
      }
    }

    await supabase.from('bot_state').update({
      balance, updated_at:new Date().toISOString(),
      market_regime:'v13_MAX', streak
    }).eq('id',1)

    return new Response(JSON.stringify({
      ok:true, v:13, openCount, streakPaused, streak, btcBias,
      kelly:kellyMult, log
    }), {headers:{'Content-Type':'application/json'}})

  } catch(e) {
    return new Response(JSON.stringify({error:String(e)}),{
      status:200, headers:{'Content-Type':'application/json'}
    })
  }
})

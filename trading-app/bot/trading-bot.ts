// ════════════════════════════════════════════════════════
// CryptoBot v12 — Full Smart Money Suite
// Liquidations + Dynamic Trailing + Multi-TF + Backtesting
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
  low:    { riskPct:0.015, maxPos:8,  maxDayLoss:0.04, streakLimit:4 },
  medium: { riskPct:0.025, maxPos:20, maxDayLoss:0.06, streakLimit:5 },
  high:   { riskPct:0.040, maxPos:30, maxDayLoss:0.10, streakLimit:6 },
} as const
type RiskKey = keyof typeof RISK

const FEE             = 0.001
const SWING_N         = 3
const SWING_LOOKBACK  = 50
const SWEEP_LOOKBACK  = 3
const TP_R            = 2.5
const SL_ATR_MULT     = 0.8
const MAX_HOLD_H      = 6
const STREAK_PAUSE_MS = 45*60_000
const MAX_NOTIONAL_PCT= 0.15
const FUNDING_EXTREME = 0.0002

// Trailing stop thresholds
const TRAIL_BE_R    = 1.0   // move SL to breakeven at 1× R profit
const TRAIL_START_R = 1.5   // start trailing at 1.5× R
const TRAIL_ATR_M   = 0.5   // trail at 0.5× ATR behind price

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
    for (const lvl of highs) {
      if (bar.high > lvl && bar.close < lvl && price <= bar.close * 1.002)
        return {side:'SHORT', sweepExtreme: bar.high}
    }
    for (const lvl of lows) {
      if (bar.low < lvl && bar.close > lvl && price >= bar.close * 0.998)
        return {side:'LONG', sweepExtreme: bar.low}
    }
  }
  return null
}

// ── Smart Money Signals ────────────────────────────────────────────────────────

async function fetchAllFundingRates(): Promise<Record<string, number>> {
  try {
    const res = await fetch(`${FAPI}/premiumIndex`, { headers:{'User-Agent':'Mozilla/5.0'} })
    if (!res.ok) return {}
    const data: any[] = await res.json()
    const result: Record<string, number> = {}
    for (const d of data) {
      const sym = d.symbol.replace('USDT','').replace('_PERP','')
      result[sym] = parseFloat(d.lastFundingRate || '0')
    }
    return result
  } catch { return {} }
}

// פירוקים: יחס Long/Short — שינוי מהיר = ציד סטופים בכיוון הצד שמופחת
async function fetchLiqSignal(sym: string): Promise<'LONG_LIQ'|'SHORT_LIQ'|'NEUTRAL'> {
  try {
    const res = await fetch(
      `${FAPI_DATA}/globalLongShortAccountRatio?symbol=${sym}USDT&period=5m&limit=4`,
      { headers:{'User-Agent':'Mozilla/5.0'} }
    )
    if (!res.ok) return 'NEUTRAL'
    const data: any[] = await res.json()
    if (data.length < 2) return 'NEUTRAL'
    const latest = parseFloat(data[data.length-1].longShortRatio)
    const prev   = parseFloat(data[0].longShortRatio)
    const change = prev > 0 ? (latest - prev) / prev : 0
    if (change < -0.06) return 'LONG_LIQ'   // לונגים מתפרקים → SHORT מוטה
    if (change > 0.06)  return 'SHORT_LIQ'   // שורטים מתפרקים → LONG מוטה
    return 'NEUTRAL'
  } catch { return 'NEUTRAL' }
}

async function fetchOBImbalance(sym: string): Promise<number> {
  try {
    const res = await fetch(`${BINANCE_DATA}/depth?symbol=${sym}USDT&limit=20`)
    if (!res.ok) return 0
    const d = await res.json()
    const bidVol = (d.bids as string[][]).reduce((a,b) => a + parseFloat(b[0])*parseFloat(b[1]), 0)
    const askVol = (d.asks as string[][]).reduce((a,b) => a + parseFloat(b[0])*parseFloat(b[1]), 0)
    return (bidVol - askVol) / ((bidVol + askVol) || 1)
  } catch { return 0 }
}

async function fetchWhalePressure(sym: string): Promise<number> {
  try {
    const res = await fetch(`${BINANCE_DATA}/aggTrades?symbol=${sym}USDT&limit=200`)
    if (!res.ok) return 0
    const trades: any[] = await res.json()
    if (!trades.length) return 0
    const avgQty = trades.reduce((a,t) => a + parseFloat(t.q), 0) / trades.length
    const thresh = avgQty * 8
    let buy=0, sell=0
    for (const t of trades) {
      const qty = parseFloat(t.q)
      if (qty >= thresh) { if (!t.m) buy+=qty; else sell+=qty }
    }
    const total = buy + sell
    return total > 0 ? (buy - sell) / total : 0
  } catch { return 0 }
}

// ── Backtesting ────────────────────────────────────────────────────────────────

async function runBacktest(): Promise<object> {
  const testCoins = ['BTC','ETH','SOL','BNB','LINK']
  const allResults: any[] = []

  for (const sym of testCoins) {
    const bars = await fetchBars(sym, '1h', 500)
    if (bars.length < 100) continue

    let bal = 10_000
    let wins=0, losses=0, totalPnl=0
    const pnls: number[] = []

    for (let i = 55; i < bars.length - 1; i++) {
      const slice  = bars.slice(0, i+1)
      const price  = slice[i].close
      const atr    = calcATR(slice.slice(-(14+1)))
      const atrPct = atr / price
      if (atrPct > 0.05 || atrPct < 0.0003) continue

      const lookback = slice.slice(-SWING_LOOKBACK)
      const {highs, lows} = findSwings(lookback, SWING_N)
      if (!highs.length && !lows.length) continue

      const sweep = detectSweep(slice, price, highs, lows)
      if (!sweep) continue

      const slDist = atr * SL_ATR_MULT
      const slPct  = slDist / price
      if (slPct <= 0 || slPct > 0.10) continue

      const notional = Math.min(bal * 0.025 / slPct, bal * MAX_NOTIONAL_PCT)
      if (notional < 5) continue

      const tpPrice = sweep.side==='LONG' ? price + slDist*TP_R : price - slDist*TP_R
      const slPrice = sweep.side==='LONG' ? price - slDist       : price + slDist

      // סימולציה על הנרות הבאים
      let pnl = 0
      const maxJ = Math.min(i + MAX_HOLD_H + 1, bars.length)
      for (let j = i+1; j < maxJ; j++) {
        const b = bars[j]
        if (sweep.side==='LONG') {
          if (b.high >= tpPrice) { pnl = notional * slPct * TP_R; break }
          if (b.low  <= slPrice) { pnl = -notional * slPct; break }
        } else {
          if (b.low  <= tpPrice) { pnl = notional * slPct * TP_R; break }
          if (b.high >= slPrice) { pnl = -notional * slPct; break }
        }
      }

      const net = pnl - notional * FEE * 2
      bal += net; totalPnl += net
      pnls.push(net)
      if (net > 0) wins++; else losses++
    }

    const total = wins + losses
    const winRate = total > 0 ? wins/total : 0
    const avgPnl  = pnls.length ? pnls.reduce((a,b)=>a+b,0)/pnls.length : 0
    const std     = pnls.length > 1
      ? Math.sqrt(pnls.reduce((a,b)=>a+(b-avgPnl)**2,0)/pnls.length) : 1
    const sharpe  = std > 0 ? (avgPnl / std) * Math.sqrt(365*24) : 0

    allResults.push({
      sym,
      trades: total,
      wins, losses,
      winRate: (winRate*100).toFixed(1)+'%',
      totalPnl: totalPnl.toFixed(2),
      finalBal: bal.toFixed(2),
      roi: ((bal/10000-1)*100).toFixed(2)+'%',
      sharpe: sharpe.toFixed(2),
    })
  }
  return allResults
}

// ── Main Bot Loop ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY')!
    )

    // נקודת קצה לבקטסטינג
    if (url.searchParams.get('backtest') === '1') {
      const results = await runBacktest()
      return new Response(JSON.stringify({ok:true, backtest:results}),
        {headers:{'Content-Type':'application/json'}})
    }

    const {data:state} = await supabase.from('bot_state').select('*').eq('id',1).single()
    if (!state?.active) return new Response(JSON.stringify({ok:true,msg:'inactive'}),
      {headers:{'Content-Type':'application/json'}})

    let balance = state.balance
    const now = Date.now()
    const R = RISK[state.risk as RiskKey] || RISK.medium
    const breakerOn = false

    const {data:recent} = await supabase
      .from('bot_trades').select('pnl,closed_at').neq('status','OPEN')
      .gte('closed_at', new Date(now-3*3600_000).toISOString())
      .order('closed_at',{ascending:false}).limit(15)
    let streak=0
    for (const t of (recent||[])) { if(Number(t.pnl)<0) streak++; else break }
    const streakPaused = streak>=R.streakLimit &&
      new Date((recent?.[0]?.closed_at??0)).getTime()+STREAK_PAUSE_MS > now

    const {count} = await supabase.from('bot_trades')
      .select('*',{count:'exact',head:true}).eq('status','OPEN')
    let openCount = count||0

    const log:string[] = []
    if(breakerOn)    log.push('DAILY BREAKER ON')
    if(streakPaused) log.push(`STREAK PAUSE ${streak}`)

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
    log.push(`BTC=${btcBias} v12-FULL`)

    const {data:allOpen} = await supabase.from('bot_trades').select('*').eq('status','OPEN')
    const openBySymbol:Record<string,any[]>={}
    for (const t of (allOpen||[])) {
      if(!openBySymbol[t.sym]) openBySymbol[t.sym]=[]
      openBySymbol[t.sym].push(t)
    }

    for (const sym of COINS) {
      try {
        // טעינת 1h + 4h + מחיר בו-זמנית
        const [bars1h, bars4h, priceRes] = await Promise.all([
          fetchBars(sym,'1h',65),
          fetchBars(sym,'4h',55),
          fetch(`${BINANCE}/ticker/price?symbol=${sym}USDT`).then(r=>r.json()).catch(()=>null)
        ])
        if (!bars1h || bars1h.length < 25) continue

        const price     = priceRes?.price ? +priceRes.price : bars1h[bars1h.length-1].close
        const completed = bars1h.slice(0,-1)
        const atr       = calcATR(completed)
        const atrPct    = atr/price
        const openTrades = openBySymbol[sym]||[]

        // ── ניהול פוזיציות + Trailing Stop דינמי ──────────
        for (const t of openTrades) {
          const entry  = Number(t.entry_price)
          const size   = Number(t.size)
          const sl     = Number(t.trail_sl)
          const slDist = Math.abs(entry - sl)
          const tp     = t.side==='LONG' ? entry+slDist*TP_R : entry-slDist*TP_R
          const dirM   = t.side==='LONG' ? 1 : -1

          let newStatus:string|null=null
          if(t.side==='LONG'){
            if(price>=tp)  newStatus='TP'
            else if(price<=sl) newStatus=price>=entry?'TRAIL':'SL'
          } else {
            if(price<=tp)  newStatus='TP'
            else if(price>=sl) newStatus=price<=entry?'TRAIL':'SL'
          }
          if(!newStatus && t.opened_at && now-new Date(t.opened_at).getTime()>MAX_HOLD_H*3600_000)
            newStatus='TRAIL'

          if(newStatus){
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
            // ── Trailing Stop דינמי ──────────────────────
            const profitR = slDist > 0 ? (price - entry) * dirM / slDist : 0
            let newSL = sl

            if (profitR >= TRAIL_BE_R) {
              // שלב 1: הזזה לנקודת איזון
              const beLevel = entry + slDist * 0.05 * dirM
              newSL = dirM===1 ? Math.max(sl, beLevel) : Math.min(sl, beLevel)
            }
            if (profitR >= TRAIL_START_R) {
              // שלב 2: trailing דינמי 0.5× ATR מאחורי המחיר
              const trailLevel = price - atr * TRAIL_ATR_M * dirM
              newSL = dirM===1 ? Math.max(newSL, trailLevel) : Math.min(newSL, trailLevel)
            }

            if (newSL !== sl) {
              await supabase.from('bot_trades').update({trail_sl:newSL}).eq('id',t.id)
              log.push(`TRAIL ${sym} ${t.side} R=${profitR.toFixed(1)} sl→${newSL.toFixed(4)}`)
            }
          }
        }

        // ── כניסה חדשה ─────────────────────────────────────
        if(breakerOn||streakPaused) continue
        if(openTrades.length>0) continue
        if(openCount>=R.maxPos) continue
        if(atrPct>0.05||atrPct<0.0003) continue

        const lookback=completed.slice(-SWING_LOOKBACK)
        const {highs,lows}=findSwings(lookback, SWING_N)
        if(!highs.length&&!lows.length) continue

        const sweep=detectSweep(completed, price, highs, lows)
        if(!sweep) continue

        // פילטר BTC
        if(sym!=='BTC'&&sym!=='ETH'){
          if(sweep.side==='LONG'&&btcBias==='BEAR') continue
          if(sweep.side==='SHORT'&&btcBias==='BULL') continue
        }

        // ── Multi-Timeframe 4H אימות ────────────────────────
        let smScore = 0
        if (bars4h && bars4h.length >= 25) {
          const comp4h = bars4h.slice(0,-1)
          const {highs:h4, lows:l4} = findSwings(comp4h.slice(-SWING_LOOKBACK), SWING_N)
          const sweep4h = detectSweep(comp4h, price, h4, l4)
          if (sweep4h?.side === sweep.side) {
            smScore += 2  // אישור חזק מ-4H
            log.push(`MTF4H ${sym} ✓ ${sweep.side}`)
          } else if (sweep4h && sweep4h.side !== sweep.side) {
            log.push(`SKIP ${sym} MTF4H contra`)
            continue   // 4H מנוגד = דלג
          }
        }

        // ── Funding Rate ─────────────────────────────────────
        const funding = allFunding[sym] || 0
        const fundingAligned =
          (sweep.side==='SHORT' && funding > FUNDING_EXTREME) ||
          (sweep.side==='LONG'  && funding < -FUNDING_EXTREME) ||
          Math.abs(funding) <= FUNDING_EXTREME
        if (!fundingAligned) {
          log.push(`SKIP ${sym} funding-contra ${(funding*100).toFixed(4)}%`)
          continue
        }
        if (Math.abs(funding) > FUNDING_EXTREME) smScore++

        // ── Order Book + Whale + Liquidations (מקבילה) ───────
        const [obImbalance, whalePressure, liqSignal] = await Promise.all([
          fetchOBImbalance(sym),
          fetchWhalePressure(sym),
          fetchLiqSignal(sym)
        ])

        if (sweep.side==='LONG'  && obImbalance > 0.10) smScore++
        if (sweep.side==='SHORT' && obImbalance < -0.10) smScore++
        if (sweep.side==='LONG'  && whalePressure > 0.20) smScore++
        if (sweep.side==='SHORT' && whalePressure < -0.20) smScore++

        // פירוקים: אימות חזק ביותר
        if (liqSignal==='LONG_LIQ'  && sweep.side==='SHORT') smScore += 2
        if (liqSignal==='SHORT_LIQ' && sweep.side==='LONG')  smScore += 2

        // בדיקת סתירה כוללת
        const hasContradiction =
          (sweep.side==='LONG'  && (obImbalance < -0.20 || whalePressure < -0.30)) ||
          (sweep.side==='SHORT' && (obImbalance > 0.20  || whalePressure > 0.30))
        if (smScore===0 && hasContradiction) {
          log.push(`SKIP ${sym} SM-contra ob=${obImbalance.toFixed(2)} wh=${whalePressure.toFixed(2)}`)
          continue
        }

        log.push(`SM ${sym} f=${(funding*100).toFixed(4)}% ob=${obImbalance.toFixed(2)} wh=${whalePressure.toFixed(2)} liq=${liqSignal} sc=${smScore}`)

        // ── SL / TP / כניסה ─────────────────────────────────
        const slDist=atr*SL_ATR_MULT
        const slPrice=sweep.side==='LONG'
          ? Math.min(sweep.sweepExtreme, price)-slDist
          : Math.max(sweep.sweepExtreme, price)+slDist
        const slPct=Math.abs(price-slPrice)/price
        if(slPct<=0||slPct>0.10) continue

        const riskAmt=balance*R.riskPct
        let notional=riskAmt/slPct
        notional=Math.min(notional, balance*MAX_NOTIONAL_PCT, balance*0.95)
        if(notional<5) continue

        const size=notional/price
        const fee=price*size*FEE
        balance-=(notional+fee); openCount++

        await supabase.from('bot_trades').insert({
          sym, side:sweep.side, entry_price:price, size, fee,
          trail_sl:slPrice, hi:price, lo:price,
          status:'OPEN', score:smScore, mtf:true
        })
        log.push(`OPEN ${sym} ${sweep.side} @${price.toFixed(4)} sl=${(slPct*100).toFixed(2)}% $${notional.toFixed(0)} SM=${smScore}`)

        await new Promise(r=>setTimeout(r,30))
      } catch(e) {
        log.push(`ERR ${sym}: ${String(e).slice(0,50)}`)
      }
    }

    await supabase.from('bot_state').update({
      balance, updated_at:new Date().toISOString(),
      market_regime:'v12_FULL', streak
    }).eq('id',1)

    return new Response(JSON.stringify({
      ok:true, v:12, openCount, streakPaused, streak, btcBias, log
    }), {headers:{'Content-Type':'application/json'}})

  } catch(e) {
    return new Response(JSON.stringify({error:String(e)}),{
      status:200, headers:{'Content-Type':'application/json'}
    })
  }
})

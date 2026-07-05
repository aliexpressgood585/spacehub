// ════════════════════════════════════════════════════════
// CryptoBot v11 — Liquidity Hunter + Smart Money Confirmation
// Sweep זיהוי + Order Book walls + Funding Rate + Whale detection
// ════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2'

const BINANCE_DATA = 'https://data-api.binance.vision/api/v3'
const BINANCE      = 'https://api.binance.com/api/v3'
const FAPI         = 'https://fapi.binance.com/fapi/v1'

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
const FUNDING_EXTREME = 0.0002   // 0.02% per funding = overleveraged

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

// מציא swing highs ו-lows — נקודות שבהן הנזילות מצטברת
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

// מזהה sweep: נר שפרץ מעבר ל-swing ונסגר חזרה בתוכו
function detectSweep(
  bars:Bar[], price:number,
  highs:number[], lows:number[]
): {side:'LONG'|'SHORT', sweepExtreme:number} | null {
  const n=bars.length
  if (n < SWEEP_LOOKBACK+1) return null

  for (let k=1; k<=SWEEP_LOOKBACK; k++) {
    const bar=bars[n-k]

    // Sweep של HIGH → Big Money בלע סטופים של לונגים → SHORT
    for (const lvl of highs) {
      if (bar.high > lvl && bar.close < lvl) {
        if (price <= bar.close * 1.002) {
          return {side:'SHORT', sweepExtreme: bar.high}
        }
      }
    }

    // Sweep של LOW → Big Money בלע סטופים של שורטים → LONG
    for (const lvl of lows) {
      if (bar.low < lvl && bar.close > lvl) {
        if (price >= bar.close * 0.998) {
          return {side:'LONG', sweepExtreme: bar.low}
        }
      }
    }
  }
  return null
}

// ── Smart Money Signals ────────────────────────────────────────────────────────

// Funding rates של כל המטבעות בקריאה אחת
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

// יחס bid/ask בספר הפקודות — חיובי = לחץ קנייה, שלילי = לחץ מכירה
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

// לחץ לווייתנים — חיובי = לווייתנים קונים, שלילי = מוכרים
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
      if (qty >= thresh) {
        if (!t.m) buy += qty
        else sell += qty
      }
    }
    const total = buy + sell
    return total > 0 ? (buy - sell) / total : 0
  } catch { return 0 }
}

Deno.serve(async () => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY')!
    )

    const {data:state} = await supabase.from('bot_state').select('*').eq('id',1).single()
    if (!state?.active) return new Response(JSON.stringify({ok:true,msg:'inactive'}),{headers:{'Content-Type':'application/json'}})

    let balance = state.balance
    const now = Date.now()
    const R = RISK[state.risk as RiskKey] || RISK.medium
    const breakerOn = false

    // רצף הפסדים (3 שעות אחרונות)
    const {data:recent} = await supabase
      .from('bot_trades').select('pnl,closed_at').neq('status','OPEN')
      .gte('closed_at', new Date(now-3*3600_000).toISOString())
      .order('closed_at',{ascending:false}).limit(15)
    let streak=0
    for (const t of (recent||[])) { if(Number(t.pnl)<0) streak++; else break }
    const streakPaused = streak>=R.streakLimit &&
      new Date((recent?.[0]?.closed_at??0)).getTime()+STREAK_PAUSE_MS > now

    const {count} = await supabase.from('bot_trades').select('*',{count:'exact',head:true}).eq('status','OPEN')
    let openCount = count||0

    const log:string[] = []
    if(breakerOn)    log.push('DAILY BREAKER ON')
    if(streakPaused) log.push(`STREAK PAUSE ${streak}`)

    // BTC bias + Funding rates — בקריאות מקבילות
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
    log.push(`BTC=${btcBias} v11-SM`)

    // שלוף כל פוזיציות פתוחות בבת אחת
    const {data:allOpen} = await supabase.from('bot_trades').select('*').eq('status','OPEN')
    const openBySymbol:Record<string,any[]>={}
    for (const t of (allOpen||[])) {
      if(!openBySymbol[t.sym]) openBySymbol[t.sym]=[]
      openBySymbol[t.sym].push(t)
    }

    for (const sym of COINS) {
      try {
        const [bars1h, priceRes] = await Promise.all([
          fetchBars(sym,'1h',65),
          fetch(`${BINANCE}/ticker/price?symbol=${sym}USDT`).then(r=>r.json()).catch(()=>null)
        ])
        if (!bars1h || bars1h.length < 25) continue

        const price = priceRes?.price ? +priceRes.price : bars1h[bars1h.length-1].close
        const completed = bars1h.slice(0,-1)
        const atr = calcATR(completed)
        const atrPct = atr/price
        const openTrades = openBySymbol[sym]||[]

        // ── ניהול פוזיציות קיימות ──────────────────────────
        for (const t of openTrades) {
          const entry=Number(t.entry_price), size=Number(t.size), sl=Number(t.trail_sl)
          const slDist=Math.abs(entry-sl)
          const tp = t.side==='LONG' ? entry+slDist*TP_R : entry-slDist*TP_R

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
            const dirM=t.side==='LONG'?1:-1
            const fav=(price-entry)/entry*dirM
            const pnl=fav*entry*size-Number(t.fee)-price*size*FEE
            const final=pnl>0&&newStatus==='SL'?'TP':newStatus
            balance+=entry*size+pnl; openCount--
            await supabase.from('bot_trades').update({
              status:final, exit_price:price, pnl,
              pnl_pct:fav, closed_at:new Date().toISOString()
            }).eq('id',t.id)
            log.push(`CLOSE ${sym} ${t.side} ${final} pnl=${pnl.toFixed(2)}`)
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

        // פילטר BTC עבור אלטים
        if(sym!=='BTC'&&sym!=='ETH'){
          if(sweep.side==='LONG'&&btcBias==='BEAR') continue
          if(sweep.side==='SHORT'&&btcBias==='BULL') continue
        }

        // ── Smart Money Confirmation ─────────────────────────
        const funding = allFunding[sym] || 0

        // Funding: שוק ממונף חזק בכיוון אחד → לווייתנים יבצעו sweep לצד השני
        const fundingAligned =
          (sweep.side==='SHORT' && funding > FUNDING_EXTREME) ||  // לונגים ממונפים → sweep של הלונגים
          (sweep.side==='LONG'  && funding < -FUNDING_EXTREME) ||  // שורטים ממונפים → sweep של השורטים
          Math.abs(funding) <= FUNDING_EXTREME                      // ניטרלי = בסדר

        if (!fundingAligned) {
          log.push(`SKIP ${sym} funding-contra ${(funding*100).toFixed(4)}%`)
          continue
        }

        // Order Book + Whale בקריאה מקבילה (רק כשיש sweep)
        const [obImbalance, whalePressure] = await Promise.all([
          fetchOBImbalance(sym),
          fetchWhalePressure(sym)
        ])

        // ניקוד Smart Money: כמה אינדיקטורים מאשרים את הכיוון?
        let smScore = 0
        if (Math.abs(funding) > FUNDING_EXTREME) smScore++
        if (sweep.side==='LONG'  && obImbalance > 0.10) smScore++
        if (sweep.side==='SHORT' && obImbalance < -0.10) smScore++
        if (sweep.side==='LONG'  && whalePressure > 0.20) smScore++
        if (sweep.side==='SHORT' && whalePressure < -0.20) smScore++

        // אם כל האינדיקטורים מנוגדים לכיוון — דלג
        const hasContradiction =
          (sweep.side==='LONG'  && (obImbalance < -0.20 || whalePressure < -0.30)) ||
          (sweep.side==='SHORT' && (obImbalance > 0.20  || whalePressure > 0.30))

        if (smScore===0 && hasContradiction) {
          log.push(`SKIP ${sym} SM-contra ob=${obImbalance.toFixed(2)} whale=${whalePressure.toFixed(2)}`)
          continue
        }

        log.push(`SM ${sym} f=${(funding*100).toFixed(4)}% ob=${obImbalance.toFixed(2)} wh=${whalePressure.toFixed(2)} sc=${smScore}`)

        // ── חישוב SL/TP וכניסה ──────────────────────────────
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
        log.push(`OPEN ${sym} ${sweep.side} SWEEP@${price.toFixed(4)} sl=${(slPct*100).toFixed(2)}% $${notional.toFixed(0)} SM=${smScore}`)

        await new Promise(r=>setTimeout(r,30))
      } catch(e) {
        log.push(`ERR ${sym}: ${String(e).slice(0,50)}`)
      }
    }

    await supabase.from('bot_state').update({
      balance, updated_at:new Date().toISOString(),
      market_regime:'v11_SM', streak
    }).eq('id',1)

    return new Response(JSON.stringify({
      ok:true, v:11, openCount, breaker:breakerOn, streakPaused, streak, btcBias, log
    }), {headers:{'Content-Type':'application/json'}})

  } catch(e) {
    return new Response(JSON.stringify({error:String(e)}),{
      status:200, headers:{'Content-Type':'application/json'}
    })
  }
})

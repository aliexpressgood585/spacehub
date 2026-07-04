// ════════════════════════════════════════════════════════
// CryptoBot v10 — Liquidity Hunter (Smart Money)
// זיהוי ציד נזילות: sweep של swing H/L → כניסה נגד
// Big Money בולע סטופים, אנחנו עוקבים אחריו
// ════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2'

const BINANCE_DATA = 'https://data-api.binance.vision/api/v3'
const BINANCE      = 'https://api.binance.com/api/v3'

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
const SWING_N         = 3          // כמה נרות מכל צד לפיק swing
const SWING_LOOKBACK  = 50         // כמה נרות אחורה לחפש swings
const SWEEP_LOOKBACK  = 3          // כמה נרות אחרונים לבדוק ל-sweep
const TP_R            = 2.5        // TP = 2.5× מרחק SL
const SL_ATR_MULT     = 0.8        // SL = 0.8× ATR מעבר לנקודת ה-sweep
const MAX_HOLD_H      = 6          // סגירה כפויה אחרי 6 שעות
const STREAK_PAUSE_MS = 45*60_000  // 45 דקות השהייה אחרי רצף
const MAX_NOTIONAL_PCT= 0.15       // מקסימום 15% מהיתרה לעסקה

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
        // מחיר עדיין מתחת ל-close → ההיפוך בעיצומו
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
    const today = new Date().toISOString().slice(0,10)
    const R = RISK[state.risk as RiskKey] || RISK.medium

    // בלם יומי
    let dayStart = Number(state.day_start_balance ?? balance)
    if (state.day_date !== today) {
      dayStart = balance
      await supabase.from('bot_state').update({day_start_balance:dayStart, day_date:today}).eq('id',1)
    }
    const breakerOn = (dayStart-balance)/dayStart >= R.maxDayLoss

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

    // הטיית BTC
    let btcBias:'BULL'|'BEAR'|'NEUTRAL'='NEUTRAL'
    try {
      const btcBars = await fetchBars('BTC','1h',30)
      if (btcBars.length>=20) {
        const cl=btcBars.slice(0,-1).map(b=>b.close)
        const rsi=calcRsi(cl,14), e9=calcEma(cl,9), e21=calcEma(cl,21)
        if(rsi>55&&e9>e21) btcBias='BULL'
        else if(rsi<45&&e9<e21) btcBias='BEAR'
      }
    } catch {}
    log.push(`BTC=${btcBias} v10-LH`)

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
        if(openTrades.length>0) continue     // פוזיציה אחת למטבע
        if(openCount>=R.maxPos) continue
        if(atrPct>0.05||atrPct<0.0003) continue  // פילטר תנודתיות

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

        // SL מעבר לקצה ה-sweep + ATR buffer
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
          status:'OPEN', score:Math.round(slPct*1000), mtf:true
        })
        log.push(`OPEN ${sym} ${sweep.side} SWEEP@${price.toFixed(4)} sl=${(slPct*100).toFixed(2)}% $${notional.toFixed(0)}`)

        await new Promise(r=>setTimeout(r,30))
      } catch(e) {
        log.push(`ERR ${sym}: ${String(e).slice(0,50)}`)
      }
    }

    await supabase.from('bot_state').update({
      balance, updated_at:new Date().toISOString(),
      market_regime:'v10_LH', streak
    }).eq('id',1)

    return new Response(JSON.stringify({
      ok:true, v:10, openCount, breaker:breakerOn, streakPaused, streak, btcBias, log
    }), {headers:{'Content-Type':'application/json'}})

  } catch(e) {
    return new Response(JSON.stringify({error:String(e)}),{
      status:200, headers:{'Content-Type':'application/json'}
    })
  }
})

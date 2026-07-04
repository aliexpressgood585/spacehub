// ════════════════════════════════════════════════════════
// CryptoBot Pro v6 — Supabase Edge Function
// שיפורים על v5:
//  1. מסנן משטר שוק (BTC): אם BTC < EMA200 → רק SHORT
//     אם BTC > EMA200 → רק LONG. מונע כניסות נגד הטרנד הגלובלי
//  2. אישור 2 נרות: פריצה חייבת להיות גם בנר הקודם-לקודם
//     (מניעת whipsaw בפריצות מזויפות)
//  3. בלם רצף הפסדים: 3 הפסדים ברצף = עצירה 12 שעות
// ════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2'

const BINANCE = 'https://api.binance.com/api/v3'
const COINS = [
  'BTC','ETH','SOL','BNB','XRP','ADA','DOGE','AVAX','LINK','DOT',
  'POL','UNI','ATOM','LTC','BCH','NEAR','ALGO','FIL','VET','ICP'
]
const RISK = {
  low:    { riskPct:0.006, maxPos:3, maxDayLoss:0.02 },
  medium: { riskPct:0.010, maxPos:5, maxDayLoss:0.03 },
  high:   { riskPct:0.016, maxPos:8, maxDayLoss:0.04 },
} as const
type RiskKey = keyof typeof RISK
const FEE = 0.001
const BREAK_N = 48
const TRAIL_K = 3.5
const TRAIL_K_TIGHT = 2.0
const PROFIT_TIGHTEN = 1.5
const HARD_K  = 2.0
const EMA_TREND = 200
const VOL_MA_N = 20
const VOL_MIN_MULT = 1.4
const RSI_PERIOD = 14
const RSI_OB = 72
const RSI_OS = 28
const MAX_HOLD_MS = 7*86400_000
const COOLDOWN_MS = 6*3600_000
const COIN_DISABLE_LOSSES = 7
const MAX_NOTIONAL_PCT = 0.20
const STREAK_PAUSE_MS = 12*3600_000  // 12h עצירה אחרי 3 הפסדים ברצף
const STREAK_LIMIT = 3

interface Bar { open:number; high:number; low:number; close:number; vol:number }

function ema(src:number[], p:number): number[] {
  const k=2/(p+1); const out=[src[0]]
  for(let i=1;i<src.length;i++) out.push(src[i]*k+out[i-1]*(1-k))
  return out
}

function rsiLast(src:number[], p=14): number {
  if(src.length<p+1) return 50
  let g=0, l=0
  for(let i=src.length-p; i<src.length; i++){
    const d=src[i]-src[i-1]
    if(d>0) g+=d; else l+=(-d)
  }
  g/=p; l/=p
  if(l===0) return 100
  return 100-100/(1+g/l)
}

function atrLast(bars:Bar[], p=14): number {
  if(bars.length<2) return bars[0]?(bars[0].high-bars[0].low):0
  let prev=bars[0].high-bars[0].low
  for(let i=1;i<bars.length;i++){
    const tr=Math.max(bars[i].high-bars[i].low,Math.abs(bars[i].high-bars[i-1].close),Math.abs(bars[i].low-bars[i-1].close))
    prev=(prev*(p-1)+tr)/p
  }
  return prev
}

function volMa(bars:Bar[], n:number): number {
  const sl=bars.slice(-n)
  return sl.reduce((a,b)=>a+b.vol,0)/sl.length
}

async function klines(sym:string, interval:string, limit:number): Promise<Bar[]> {
  const res = await fetch(`${BINANCE}/klines?symbol=${sym}USDT&interval=${interval}&limit=${limit}`)
  if(!res.ok) return []
  const data: number[][] = await res.json()
  return data.map(k=>({open:+k[1],high:+k[2],low:+k[3],close:+k[4],vol:+k[5]}))
}

Deno.serve(async () => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY')!
    )

    const { data: state, error: stateErr } = await supabase
      .from('bot_state').select('*').eq('id',1).single()
    if(stateErr || !state) return new Response(JSON.stringify({error:'no state',detail:stateErr?.message}),{headers:{'Content-Type':'application/json'}})
    if(!state.active) return new Response(JSON.stringify({ok:true,msg:'bot inactive'}),{headers:{'Content-Type':'application/json'}})

    const R = RISK[state.risk as RiskKey] || RISK.medium
    let currentBalance = state.balance
    const now = Date.now()
    const today = new Date().toISOString().slice(0,10)

    // ─── בלם יומי ───────────────────────────────────────────
    let dayStart = Number(state.day_start_balance ?? state.balance)
    if(state.day_date !== today){
      dayStart = currentBalance
      await supabase.from('bot_state').update({day_start_balance:dayStart, day_date:today}).eq('id',1)
    }
    const breakerOn = (dayStart-currentBalance)/dayStart >= R.maxDayLoss

    const { count } = await supabase
      .from('bot_trades').select('*',{count:'exact',head:true}).eq('status','OPEN')
    let openCount = count || 0

    // ─── השבתת מטבעות + קירור ────────────────────────────────
    const disabled = new Set<string>()
    const cooldownUntil: Record<string,number> = {}
    const { data: recent } = await supabase
      .from('bot_trades').select('sym,pnl,closed_at').neq('status','OPEN')
      .gte('closed_at', new Date(now-7*86400_000).toISOString())
      .order('closed_at',{ascending:false}).limit(600)
    const bySym: Record<string,number[]> = {}
    for(const t of (recent||[])){
      if(!bySym[t.sym]) bySym[t.sym]=[]
      if(bySym[t.sym].length<10) bySym[t.sym].push(Number(t.pnl)||0)
      if(cooldownUntil[t.sym]===undefined) cooldownUntil[t.sym]=new Date(t.closed_at).getTime()+COOLDOWN_MS
    }
    for(const [sym,arr] of Object.entries(bySym)){
      if(arr.length>=10 && arr.filter(p=>p<0).length>=COIN_DISABLE_LOSSES) disabled.add(sym)
    }

    // ─── בלם רצף הפסדים (global) ─────────────────────────────
    const allRecent = (recent||[]).slice(0, 10)
    let streak = 0
    for(const t of allRecent){
      if(Number(t.pnl) < 0) streak++; else break
    }
    let streakPauseUntil = 0
    if(streak >= STREAK_LIMIT){
      const lastClosedAt = allRecent[0]?.closed_at
      if(lastClosedAt) streakPauseUntil = new Date(lastClosedAt).getTime() + STREAK_PAUSE_MS
    }
    const streakPaused = now < streakPauseUntil

    // ─── מסנן משטר שוק: BTC כמדד ─────────────────────────────
    let marketRegime: 'BULL'|'BEAR'|'NEUTRAL' = 'NEUTRAL'
    try {
      const btcBars = await klines('BTC','1h',220)
      if(btcBars.length >= 210){
        const btcClosed = btcBars.slice(0,-1)
        const btcCl = btcClosed.map(b=>b.close)
        const btcE200 = ema(btcCl, 200)
        const btcPrice = btcBars[btcBars.length-1].close
        const btcEmaLast = btcE200[btcE200.length-1]
        const gap = (btcPrice - btcEmaLast) / btcEmaLast
        if(gap > 0.005) marketRegime = 'BULL'       // BTC מעל EMA200 ב-0.5%+
        else if(gap < -0.005) marketRegime = 'BEAR'  // BTC מתחת EMA200 ב-0.5%+
      }
    } catch(_){}

    const log: string[] = []
    if(breakerOn) log.push('DAILY BREAKER ON — no new entries today')
    if(streakPaused) log.push(`STREAK PAUSE — ${streak} consecutive losses, resuming at ${new Date(streakPauseUntil).toISOString()}`)
    log.push(`MARKET REGIME: ${marketRegime} (BTC vs EMA200)`)

    // ─── בדיקת Portfolio Stop: סך הפסד פתוח > 3% מהיתרה ────────────────
    const PORTFOLIO_STOP_PCT = 0.03
    const { data: allOpen } = await supabase
      .from('bot_trades').select('*').eq('status','OPEN')
    // חישוב P&L לא-ממומש: כדי לא לקרוא מחירים שוב, משתמשים ב-trail_sl כאומדן גרוע ביותר
    // אם הפסד משוקלל גלובלי > PORTFOLIO_STOP_PCT — נסגור הכל בהמשך הלולאה
    let totalUnrealizedLoss = 0
    const priceCache: Record<string,number> = {}
    for(const t of (allOpen||[])){
      if(!priceCache[t.sym]){
        try {
          const r=await fetch(`${BINANCE}/ticker/price?symbol=${t.sym}USDT`)
          if(r.ok){ const j=await r.json(); priceCache[t.sym]=+j.price }
        } catch(_){}
      }
      const px=priceCache[t.sym]
      if(!px) continue
      const entry=Number(t.entry_price), size=Number(t.size)
      const dirM=t.side==='LONG'?1:-1
      const unrealized=(px-entry)/entry*dirM*entry*size
      if(unrealized<0) totalUnrealizedLoss+=Math.abs(unrealized)
    }
    const portfolioStopHit = totalUnrealizedLoss > currentBalance*PORTFOLIO_STOP_PCT
    if(portfolioStopHit) log.push(`PORTFOLIO STOP HIT — unrealized loss $${totalUnrealizedLoss.toFixed(2)} > ${(PORTFOLIO_STOP_PCT*100)}% of balance`)

    for(const sym of COINS) {
      try {
        const raw = await klines(sym,'1h',250)
        if(raw.length<EMA_TREND+10) continue
        const bars = raw.slice(0,-1)
        const price = priceCache[sym] ?? raw[raw.length-1].close
        const lastVol = bars[bars.length-1].vol
        const cl = bars.map(b=>b.close)
        const n = cl.length-1
        const e200 = ema(cl,EMA_TREND)[n]
        const atr = atrLast(bars)
        const rsi = rsiLast(cl, RSI_PERIOD)
        const avgVol = volMa(bars.slice(0,-1), VOL_MA_N)

        const { data: openTrades } = await supabase
          .from('bot_trades').select('*').eq('sym',sym).eq('status','OPEN')

        // ─── ניהול עסקאות פתוחות ─────────────────────────────
        for(const t of (openTrades||[])) {
          const entry = Number(t.entry_price)
          let trailSL = Number(t.trail_sl)
          let hi = Math.max(Number(t.hi), price)
          let lo = Math.min(Number(t.lo), price)
          let newStatus: string|null = null

          if(t.side==='LONG'){
            const profitAtr = (price-entry)/atr
            const kUse = profitAtr >= PROFIT_TIGHTEN ? TRAIL_K_TIGHT : TRAIL_K
            const cand = hi - kUse*atr
            if(cand>trailSL) trailSL=cand
            if(price<=trailSL) newStatus = price>entry?'TRAIL':'SL'
          } else {
            const profitAtr = (entry-price)/atr
            const kUse = profitAtr >= PROFIT_TIGHTEN ? TRAIL_K_TIGHT : TRAIL_K
            const cand = lo + kUse*atr
            if(cand<trailSL) trailSL=cand
            if(price>=trailSL) newStatus = price<entry?'TRAIL':'SL'
          }
          if(!newStatus && t.opened_at && now-new Date(t.opened_at).getTime()>MAX_HOLD_MS){
            newStatus='TRAIL'
          }
          // Portfolio stop: סגור הכל אם הפסד כולל גדול מדי
          if(!newStatus && portfolioStopHit) newStatus='SL'

          if(newStatus){
            const size = Number(t.size)
            const dirM = t.side==='LONG'?1:-1
            const fav = (price-entry)/entry*dirM
            const raw2 = fav*entry*size
            const exitFee = price*size*FEE
            const pnl = raw2 - Number(t.fee) - exitFee
            if(pnl>0&&newStatus!=='TP') newStatus='TP'
            currentBalance += entry*size + pnl
            openCount--
            await supabase.from('bot_trades').update({
              status:newStatus, exit_price:price, pnl, trail_sl:trailSL,
              hi, lo, pnl_pct:fav, closed_at: new Date().toISOString()
            }).eq('id',t.id)
            log.push(`CLOSE ${sym} ${t.side} @ ${price} -> ${newStatus} pnl=${pnl.toFixed(2)}`)
          } else if(trailSL!==Number(t.trail_sl) || hi!==Number(t.hi) || lo!==Number(t.lo)) {
            await supabase.from('bot_trades').update({trail_sl:trailSL, hi, lo}).eq('id',t.id)
          }
        }

        // ─── בדיקת כניסה ─────────────────────────────────────
        if(breakerOn || streakPaused) continue
        if(disabled.has(sym)) continue
        if((cooldownUntil[sym]||0) > now) continue
        if((openTrades||[]).length>0) continue
        if(openCount >= R.maxPos) continue

        // פריצת Donchian
        const win = bars.slice(-BREAK_N)
        const hh = Math.max(...win.map(b=>b.high))
        const ll = Math.min(...win.map(b=>b.low))
        let side: 'LONG'|'SHORT'|null = null
        if(price>hh && price>e200) side='LONG'
        else if(price<ll && price<e200) side='SHORT'
        if(!side) continue

        // מסנן משטר שוק: רק בכיוון הגלובלי
        if(marketRegime==='BEAR' && side==='LONG'){
          log.push(`SKIP ${sym} LONG — market regime BEAR`)
          continue
        }
        if(marketRegime==='BULL' && side==='SHORT'){
          log.push(`SKIP ${sym} SHORT — market regime BULL`)
          continue
        }

        // אישור 2 נרות: הנר הקודם-לקודם גם מחוץ לטווח
        const prevBar = bars[bars.length-2]
        const prevPrevBar = bars[bars.length-3]
        const confirmed2 = side==='LONG'
          ? prevBar.close>hh && prevPrevBar.close>hh
          : prevBar.close<ll && prevPrevBar.close<ll
        if(!confirmed2){
          log.push(`SKIP ${sym} ${side} — no 2-bar confirmation`)
          continue
        }

        // פילטר נפח
        if(avgVol>0 && lastVol < avgVol*VOL_MIN_MULT){
          log.push(`SKIP ${sym} ${side} — low volume ${(lastVol/avgVol).toFixed(1)}×`)
          continue
        }

        // פילטר RSI
        if(side==='LONG' && rsi>RSI_OB){
          log.push(`SKIP ${sym} LONG — RSI overbought ${rsi.toFixed(1)}`)
          continue
        }
        if(side==='SHORT' && rsi<RSI_OS){
          log.push(`SKIP ${sym} SHORT — RSI oversold ${rsi.toFixed(1)}`)
          continue
        }

        const slDist = HARD_K*atr
        const slPct = slDist/price
        if(slPct<=0 || slPct>0.15) continue
        // ב-NEUTRAL regime נשתמש ב-70% מגודל הפוזיציה הרגיל (פחות סיכון בשוק לא ברור)
        const regimeMult = marketRegime==='NEUTRAL' ? 0.70 : 1.0
        const riskAmt = currentBalance*R.riskPct*regimeMult
        let notional = riskAmt/slPct
        notional = Math.min(notional, currentBalance*MAX_NOTIONAL_PCT*regimeMult, currentBalance*0.95)
        if(notional<5) continue
        const size = notional/price
        const fee = price*size*FEE
        const trailSL = side==='LONG' ? price-slDist : price+slDist
        currentBalance -= (notional+fee)
        openCount++
        await supabase.from('bot_trades').insert({
          sym, side, entry_price:price, size, trail_sl:trailSL, fee,
          hi:price, lo:price, status:'OPEN', score:5, mtf:true
        })
        log.push(`OPEN ${sym} ${side} @ ${price} regime=${marketRegime} rsi=${rsi.toFixed(1)} vol=${(lastVol/avgVol).toFixed(1)}× sl=${(slPct*100).toFixed(2)}%`)

        await new Promise(r=>setTimeout(r,40))
      } catch(e) {
        log.push(`ERROR ${sym}: ${e}`)
      }
    }

    await supabase.from('bot_state').update({
      balance: currentBalance,
      updated_at: new Date().toISOString(),
      market_regime: marketRegime,
      streak: streak
    }).eq('id',1)

    return new Response(JSON.stringify({ok:true, v:6, processed:COINS.length, breaker:breakerOn, streakPaused, streak, marketRegime, disabled:[...disabled], log}), {
      headers: {'Content-Type':'application/json'}
    })
  } catch(e) {
    return new Response(JSON.stringify({error:String(e)}), {
      status: 200, headers: {'Content-Type':'application/json'}
    })
  }
})

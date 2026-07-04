// ════════════════════════════════════════════════════════
// CryptoBot Pro v4 — Supabase Edge Function
// אסטרטגיה: פריצת Donchian 48h + מסנן EMA200 (לונג+שורט),
// יציאה ב-Chandelier Trail 3.5×ATR. נבחרה מתוך 60+ וריאציות
// שנבדקו על 6 חודשי נתונים אמיתיים (הכי קרובה לרווח, PF 0.90,
// ורווחית בשווקים עם טרנד). כולל: sizing לפי סיכון, בלם יומי,
// השבתת מטבעות מפסידים, קירור אחרי סגירה.
// ════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BINANCE = 'https://api.binance.com/api/v3'
const COINS = [
  'BTC','ETH','SOL','BNB','XRP','ADA','DOGE','AVAX','LINK','DOT',
  'POL','UNI','ATOM','LTC','BCH','NEAR','ALGO','FIL','VET','ICP'
]
const RISK = {
  low:    { riskPct:0.006, maxPos:5,  maxDayLoss:0.02 },
  medium: { riskPct:0.010, maxPos:20, maxDayLoss:0.03 },
  high:   { riskPct:0.016, maxPos:20, maxDayLoss:0.04 },
} as const
type RiskKey = keyof typeof RISK
const FEE = 0.001
const BREAK_N = 48          // פריצה מעל שיא/שפל 48 שעות
const TRAIL_K = 3.5         // Chandelier: שיא - 3.5×ATR
const HARD_K  = 2.0         // סטופ התחלתי: 2×ATR מהכניסה
const EMA_TREND = 200       // מסנן טרנד ארוך
const MAX_HOLD_MS = 7*86400_000
const COOLDOWN_MS = 6*3600_000   // 6 שעות קירור אחרי סגירה באותו מטבע
const COIN_DISABLE_LOSSES = 7    // השבתה אחרי 7 הפסדים ב-10 עסקאות (7 ימים)
const MAX_NOTIONAL_PCT = 0.20

interface Bar { open:number; high:number; low:number; close:number; vol:number }

function ema(src:number[], p:number): number[] {
  const k=2/(p+1); const out=[src[0]]
  for(let i=1;i<src.length;i++) out.push(src[i]*k+out[i-1]*(1-k))
  return out
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

    // בלם יומי
    let dayStart = Number(state.day_start_balance ?? state.balance)
    if(state.day_date !== today){
      dayStart = currentBalance
      await supabase.from('bot_state').update({day_start_balance:dayStart, day_date:today}).eq('id',1)
    }
    const breakerOn = (dayStart-currentBalance)/dayStart >= R.maxDayLoss

    const { count } = await supabase
      .from('bot_trades').select('*',{count:'exact',head:true}).eq('status','OPEN')
    let openCount = count || 0

    // השבתת מטבעות מפסידים + קירור אחרי סגירה
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

    const log: string[] = []
    if(breakerOn) log.push('DAILY BREAKER ON — no new entries today')

    for(const sym of COINS) {
      try {
        const raw = await klines(sym,'1h',250)
        if(raw.length<EMA_TREND+10) continue
        const bars = raw.slice(0,-1)          // נר אחרון = לא סגור, מתעלמים
        const price = raw[raw.length-1].close // מחיר נוכחי חי
        const cl = bars.map(b=>b.close)
        const n = cl.length-1
        const e200 = ema(cl,EMA_TREND)[n]
        const atr = atrLast(bars)

        const { data: openTrades } = await supabase
          .from('bot_trades').select('*').eq('sym',sym).eq('status','OPEN')

        for(const t of (openTrades||[])) {
          const entry = Number(t.entry_price)
          let trailSL = Number(t.trail_sl)
          let hi = Math.max(Number(t.hi), price)
          let lo = Math.min(Number(t.lo), price)
          let newStatus: string|null = null

          if(t.side==='LONG'){
            const cand = hi - TRAIL_K*atr        // Chandelier
            if(cand>trailSL) trailSL=cand
            if(price<=trailSL) newStatus = price>entry?'TRAIL':'SL'
          } else {
            const cand = lo + TRAIL_K*atr
            if(cand<trailSL) trailSL=cand
            if(price>=trailSL) newStatus = price<entry?'TRAIL':'SL'
          }
          if(!newStatus && t.opened_at && now-new Date(t.opened_at).getTime()>MAX_HOLD_MS){
            newStatus='TRAIL'  // פג תוקף — סגירה בשוק
          }

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

        // כניסה: פריצת 48 שעות בכיוון הטרנד הארוך
        if(breakerOn) continue
        if(disabled.has(sym)) continue
        if((cooldownUntil[sym]||0) > now) continue
        if((openTrades||[]).length>0) continue
        if(openCount >= R.maxPos) continue

        const win = bars.slice(-BREAK_N)
        const hh = Math.max(...win.map(b=>b.high))
        const ll = Math.min(...win.map(b=>b.low))
        let side: 'LONG'|'SHORT'|null = null
        if(price>hh && price>e200) side='LONG'
        else if(price<ll && price<e200) side='SHORT'
        if(!side) continue

        const slDist = HARD_K*atr
        const slPct = slDist/price
        if(slPct<=0 || slPct>0.15) continue
        const riskAmt = currentBalance*R.riskPct
        let notional = riskAmt/slPct
        notional = Math.min(notional, currentBalance*MAX_NOTIONAL_PCT, currentBalance*0.95)
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
        log.push(`OPEN ${sym} ${side} @ ${price} breakout${side==='LONG'?'▲':'▼'} sl=${(slPct*100).toFixed(2)}% notional=${notional.toFixed(0)}`)

        await new Promise(r=>setTimeout(r,40))
      } catch(e) {
        log.push(`ERROR ${sym}: ${e}`)
      }
    }

    await supabase.from('bot_state').update({
      balance: currentBalance,
      updated_at: new Date().toISOString()
    }).eq('id',1)

    return new Response(JSON.stringify({ok:true, v:4, processed:COINS.length, breaker:breakerOn, disabled:[...disabled], log}), {
      headers: {'Content-Type':'application/json'}
    })
  } catch(e) {
    return new Response(JSON.stringify({error:String(e)}), {
      status: 200, headers: {'Content-Type':'application/json'}
    })
  }
})

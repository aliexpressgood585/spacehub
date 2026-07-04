// ═══════════════════════════════════════════════════════════
// CryptoBot v7 — Scalping Edition (RSI-2, 1m bars)
// אסטרטגיה: mean-reversion מהיר — RSI(2)<15 LONG, RSI(2)>85 SHORT
// יעד: 100+ עסקאות ביום
// ═══════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2'

const BINANCE = 'https://api.binance.com/api/v3'
const COINS = [
  'BTC','ETH','SOL','BNB','XRP','ADA','DOGE','AVAX','LINK','DOT',
  'POL','UNI','ATOM','LTC','BCH','NEAR','ALGO','ICP','VET','FIL',
  'INJ','SUI','OP','ARB','APT','TRX','HBAR','TON','WIF','PEPE'
]

// ─── Scalping params ────────────────────────────────────────
const RSI_P            = 2       // RSI(2) — מאוד רגיש
const RSI_BUY          = 15      // RSI < 15 → LONG
const RSI_SELL         = 85      // RSI > 85 → SHORT
const RSI_EXIT         = 50      // יציאה כשRSI חוצה 50
const TP_PCT           = 0.003   // 0.3% רווח
const SL_PCT           = 0.002   // 0.2% הפסד
const MAX_HOLD_MIN     = 30      // סגירה כפויה אחרי 30 דקות
const POS_SIZE_PCT     = 0.04    // 4% מהיתרה לכל עסקה
const MAX_POS          = 20      // עד 20 פוזיציות בו-זמנית
const FEE              = 0.001
const MAX_DAY_LOSS     = 0.06    // בלם יומי 6%
const STREAK_LIMIT     = 6       // עצירה אחרי 6 הפסדים ברצף
const STREAK_PAUSE_MS  = 2*3600_000   // 2 שעות עצירה
const PORTFOLIO_STOP   = 0.04    // סגור מפסידים כשהפסד כולל > 4%

interface Bar { open:number; high:number; low:number; close:number; vol:number }

function rsi2(closes: number[]): number {
  if (closes.length < RSI_P + 1) return 50
  let g = 0, l = 0
  for (let i = closes.length - RSI_P; i < closes.length; i++) {
    const d = closes[i] - closes[i-1]
    if (d > 0) g += d; else l += -d
  }
  g /= RSI_P; l /= RSI_P
  return l === 0 ? 100 : 100 - 100 / (1 + g / l)
}

async function klines(sym: string): Promise<Bar[]> {
  const res = await fetch(`${BINANCE}/klines?symbol=${sym}USDT&interval=1m&limit=50`)
  if (!res.ok) return []
  const data: number[][] = await res.json()
  return data.map(k => ({ open:+k[1], high:+k[2], low:+k[3], close:+k[4], vol:+k[5] }))
}

Deno.serve(async () => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY')!
    )

    const { data: state } = await supabase.from('bot_state').select('*').eq('id',1).single()
    if (!state) return new Response(JSON.stringify({error:'no state'}), {headers:{'Content-Type':'application/json'}})
    if (!state.active) return new Response(JSON.stringify({ok:true,msg:'inactive'}), {headers:{'Content-Type':'application/json'}})

    let balance = state.balance
    const now = Date.now()
    const today = new Date().toISOString().slice(0,10)

    // ─── בלם יומי ────────────────────────────────────────────
    let dayStart = Number(state.day_start_balance ?? balance)
    if (state.day_date !== today) {
      dayStart = balance
      await supabase.from('bot_state').update({day_start_balance:dayStart, day_date:today}).eq('id',1)
    }
    const breakerOn = (dayStart - balance) / dayStart >= MAX_DAY_LOSS

    // ─── בלם רצף הפסדים ──────────────────────────────────────
    const { data: recent } = await supabase
      .from('bot_trades').select('pnl,closed_at').neq('status','OPEN')
      .order('closed_at',{ascending:false}).limit(15)
    let streak = 0
    for (const t of (recent||[])) { if (Number(t.pnl) < 0) streak++; else break }
    let streakPaused = false
    if (streak >= STREAK_LIMIT) {
      const last = (recent||[])[0]?.closed_at
      if (last && now < new Date(last).getTime() + STREAK_PAUSE_MS) streakPaused = true
    }

    // ─── ספירת פוזיציות פתוחות ───────────────────────────────
    const { count } = await supabase
      .from('bot_trades').select('*',{count:'exact',head:true}).eq('status','OPEN')
    let openCount = count || 0

    const log: string[] = []
    if (breakerOn) log.push('DAILY BREAKER ON')
    if (streakPaused) log.push(`STREAK PAUSE ${streak} losses`)

    // ─── Portfolio Stop ───────────────────────────────────────
    const { data: allOpen } = await supabase.from('bot_trades').select('*').eq('status','OPEN')
    const priceCache: Record<string,number> = {}
    for (const t of (allOpen||[])) {
      if (priceCache[t.sym]) continue
      try {
        const r = await fetch(`${BINANCE}/ticker/price?symbol=${t.sym}USDT`)
        if (r.ok) { const j = await r.json(); priceCache[t.sym] = +j.price }
      } catch(_) {}
    }
    let totalLoss = 0
    for (const t of (allOpen||[])) {
      const px = priceCache[t.sym]; if (!px) continue
      const entry = Number(t.entry_price), size = Number(t.size)
      const pct = (px - entry)/entry * (t.side==='LONG'?1:-1)
      if (pct < 0) totalLoss += Math.abs(pct * entry * size)
    }
    const portfolioStop = totalLoss > balance * PORTFOLIO_STOP
    if (portfolioStop) log.push(`PORTFOLIO STOP loss=$${totalLoss.toFixed(2)}`)

    // ─── לולאה ראשית ─────────────────────────────────────────
    for (const sym of COINS) {
      try {
        const raw = await klines(sym)
        if (raw.length < 10) continue

        const bars = raw.slice(0,-1)           // נרות סגורים בלבד
        const price = raw[raw.length-1].close  // מחיר עדכני
        const cl = bars.map(b => b.close)
        const rsi = rsi2(cl)

        const { data: openTrades } = await supabase
          .from('bot_trades').select('*').eq('sym',sym).eq('status','OPEN')

        // ── ניהול פוזיציות פתוחות ──────────────────────────
        for (const t of (openTrades||[])) {
          const entry = Number(t.entry_price)
          const size  = Number(t.size)
          const tp = t.side==='LONG' ? entry*(1+TP_PCT) : entry*(1-TP_PCT)
          const sl = t.side==='LONG' ? entry*(1-SL_PCT) : entry*(1+SL_PCT)
          const age = Math.floor((now - new Date(t.opened_at).getTime()) / 60000)

          let newStatus: string|null = null

          if (t.side==='LONG') {
            if (price >= tp)                         newStatus = 'TP'
            else if (price <= sl)                    newStatus = 'SL'
            else if (rsi > RSI_EXIT)                 newStatus = 'TRAIL'
            else if (portfolioStop && price < entry) newStatus = 'SL'
          } else {
            if (price <= tp)                         newStatus = 'TP'
            else if (price >= sl)                    newStatus = 'SL'
            else if (rsi < RSI_EXIT)                 newStatus = 'TRAIL'
            else if (portfolioStop && price > entry) newStatus = 'SL'
          }
          if (!newStatus && age >= MAX_HOLD_MIN) newStatus = 'TRAIL'

          if (newStatus) {
            const dirM = t.side==='LONG' ? 1 : -1
            const fav  = (price - entry)/entry * dirM
            const pnl  = fav*entry*size - Number(t.fee) - price*size*FEE
            if (pnl > 0 && newStatus !== 'TP') newStatus = 'TP'
            balance += entry*size + pnl
            openCount--
            await supabase.from('bot_trades').update({
              status:newStatus, exit_price:price, pnl,
              pnl_pct:fav, closed_at:new Date().toISOString()
            }).eq('id',t.id)
            log.push(`CLOSE ${sym} ${t.side} ${newStatus} pnl=${pnl.toFixed(2)}`)
          }
        }

        // ── בדיקת כניסה חדשה ───────────────────────────────
        if (breakerOn || streakPaused) continue
        if ((openTrades||[]).length > 0) continue  // רק פוזיציה אחת לכל מטבע
        if (openCount >= MAX_POS) continue

        let side: 'LONG'|'SHORT'|null = null
        if (rsi < RSI_BUY)   side = 'LONG'
        else if (rsi > RSI_SELL) side = 'SHORT'
        if (!side) continue

        const notional = Math.min(balance * POS_SIZE_PCT, balance * 0.90)
        if (notional < 5) continue
        const size = notional / price
        const fee  = price * size * FEE
        balance -= (notional + fee)
        openCount++

        await supabase.from('bot_trades').insert({
          sym, side, entry_price:price, size, fee,
          trail_sl: side==='LONG' ? price*(1-SL_PCT) : price*(1+SL_PCT),
          hi:price, lo:price, status:'OPEN', score:Math.round(rsi), mtf:true
        })
        log.push(`OPEN ${sym} ${side} @ ${price.toFixed(4)} RSI=${rsi.toFixed(1)}`)

        await new Promise(r => setTimeout(r, 25))
      } catch(e) {
        log.push(`ERR ${sym}: ${e}`)
      }
    }

    await supabase.from('bot_state').update({
      balance,
      updated_at: new Date().toISOString(),
      market_regime: 'SCALP',
      streak
    }).eq('id',1)

    return new Response(JSON.stringify({
      ok:true, v:7, mode:'scalp-rsi2',
      coins:COINS.length, openCount,
      breaker:breakerOn, streakPaused, streak, log
    }), { headers: {'Content-Type':'application/json'} })

  } catch(e) {
    return new Response(JSON.stringify({error:String(e)}), {
      status:200, headers:{'Content-Type':'application/json'}
    })
  }
})

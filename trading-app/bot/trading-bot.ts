// ═══════════════════════════════════════════════════════════
// CryptoBot v8 — Money Machine
// RSI(2) על 1m + פילטר טרנד 5m + הגנת breakeven
// יחס R:R = 2:1 | יעד: 60%+ win rate | 100+ עסקאות/יום
// ═══════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2'

const BINANCE = 'https://api.binance.com/api/v3'
const COINS = [
  'BTC','ETH','SOL','BNB','XRP','ADA','DOGE','AVAX','LINK','DOT',
  'POL','UNI','ATOM','LTC','BCH','NEAR','ALGO','ICP','VET','FIL',
  'INJ','SUI','OP','ARB','APT','TRX','HBAR','TON','WIF','PEPE',
  'RUNE','FTM','SAND','AXS','LDO','RNDR','FET','ENS','BLUR','GMX'
]

// ─── פרמטרים ─────────────────────────────────────────────
const RSI_P           = 2
const RSI_LONG        = 8      // LONG רק כשRSI מאוד נמוך (ייקותי)
const RSI_SHORT       = 92     // SHORT רק כשRSI מאוד גבוה (יקר)
const RSI_EXIT_LONG   = 70     // יציאה LONG — RSI התאושש
const RSI_EXIT_SHORT  = 30     // יציאה SHORT
const TP_PCT          = 0.004  // 0.4% רווח (2:1)
const SL_PCT          = 0.002  // 0.2% הפסד
const BE_PCT          = 0.002  // כשמרוויחים 0.2% — מזיזים SL לכניסה (breakeven)
const MAX_HOLD_MIN    = 20     // סגירה כפויה ב-20 דק'
const BASE_SIZE_PCT   = 0.05   // 5% מהיתרה לכל עסקה
const MAX_POS         = 25
const FEE             = 0.001
const MAX_DAY_LOSS    = 0.06
const STREAK_LIMIT    = 7
const STREAK_PAUSE_MS = 1.5 * 3600_000
const PORTFOLIO_STOP  = 0.04

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

function calcEma(closes: number[], p: number): number {
  const k = 2 / (p + 1)
  let e = closes[0]
  for (let i = 1; i < closes.length; i++) e = closes[i]*k + e*(1-k)
  return e
}

async function fetchBars(sym: string, interval: string, limit: number): Promise<Bar[]> {
  try {
    const res = await fetch(`${BINANCE}/klines?symbol=${sym}USDT&interval=${interval}&limit=${limit}`)
    if (!res.ok) return []
    const data: number[][] = await res.json()
    return data.map(k => ({open:+k[1],high:+k[2],low:+k[3],close:+k[4],vol:+k[5]}))
  } catch(_) { return [] }
}

// טרנד 5m: EMA20 קובע כיוון השוק
async function trend5m(sym: string): Promise<'UP'|'DOWN'|'FLAT'> {
  const bars = await fetchBars(sym, '5m', 25)
  if (bars.length < 22) return 'FLAT'
  const closes = bars.slice(0,-1).map(b => b.close)
  const e20 = calcEma(closes, 20)
  const last = closes[closes.length-1]
  const gap = (last - e20) / e20
  if (gap >  0.001) return 'UP'    // מחיר 0.1%+ מעל EMA20
  if (gap < -0.001) return 'DOWN'
  return 'FLAT'
}

// גודל פוזיציה לפי קיצוניות RSI — יותר קיצוני = יותר בטוח = גדול יותר
function calcSize(rsi: number, side: 'LONG'|'SHORT', balance: number): number {
  let mult = 1.0
  if (side === 'LONG') {
    if (rsi < 3) mult = 1.5
    else if (rsi < 5) mult = 1.25
  } else {
    if (rsi > 97) mult = 1.5
    else if (rsi > 95) mult = 1.25
  }
  const notional = balance * BASE_SIZE_PCT * mult
  return Math.min(notional, balance * 0.09)
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

    // ─── בלם יומי ────────────────────────────────────────
    let dayStart = Number(state.day_start_balance ?? balance)
    if (state.day_date !== today) {
      dayStart = balance
      await supabase.from('bot_state').update({day_start_balance:dayStart, day_date:today}).eq('id',1)
    }
    const breakerOn = (dayStart - balance) / dayStart >= MAX_DAY_LOSS

    // ─── רצף הפסדים ──────────────────────────────────────
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

    const { count } = await supabase
      .from('bot_trades').select('*',{count:'exact',head:true}).eq('status','OPEN')
    let openCount = count || 0

    const log: string[] = []
    if (breakerOn) log.push('DAILY BREAKER ON')
    if (streakPaused) log.push(`STREAK PAUSE ${streak} losses`)

    // ─── Portfolio Stop ───────────────────────────────────
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
    if (portfolioStop) log.push(`PORTFOLIO STOP $${totalLoss.toFixed(2)}`)

    // ─── לולאה ראשית ─────────────────────────────────────
    for (const sym of COINS) {
      try {
        const raw = await fetchBars(sym, '1m', 50)
        if (raw.length < 10) continue

        const bars  = raw.slice(0,-1)           // נרות סגורים
        const price = raw[raw.length-1].close   // מחיר נוכחי
        const cl    = bars.map(b => b.close)
        const rsi   = rsi2(cl)

        const { data: openTrades } = await supabase
          .from('bot_trades').select('*').eq('sym',sym).eq('status','OPEN')

        // ── ניהול פוזיציות קיימות ────────────────────────
        for (const t of (openTrades||[])) {
          const entry = Number(t.entry_price)
          const size  = Number(t.size)
          let   sl    = Number(t.trail_sl)
          const tp    = t.side==='LONG' ? entry*(1+TP_PCT) : entry*(1-TP_PCT)
          const beTrig = t.side==='LONG' ? entry*(1+BE_PCT) : entry*(1-BE_PCT)
          const age   = Math.floor((now - new Date(t.opened_at).getTime()) / 60000)

          let newStatus: string|null = null
          let newSl = sl

          if (t.side === 'LONG') {
            // הזזת SL ל-breakeven כשרווח 0.2%+
            if (price >= beTrig && sl < entry) newSl = entry
            // בדיקת יציאה
            if      (price >= tp)                         newStatus = 'TP'
            else if (price <= newSl)                      newStatus = newSl >= entry ? 'BE' : 'SL'
            else if (rsi > RSI_EXIT_LONG)                 newStatus = 'TRAIL'
            else if (portfolioStop && price < entry)      newStatus = 'SL'
          } else {
            if (price <= beTrig && sl > entry) newSl = entry
            if      (price <= tp)                         newStatus = 'TP'
            else if (price >= newSl)                      newStatus = newSl <= entry ? 'BE' : 'SL'
            else if (rsi < RSI_EXIT_SHORT)                newStatus = 'TRAIL'
            else if (portfolioStop && price > entry)      newStatus = 'SL'
          }
          if (!newStatus && age >= MAX_HOLD_MIN) newStatus = 'TRAIL'

          // עדכון SL ל-breakeven (ללא סגירה)
          if (!newStatus && newSl !== sl) {
            await supabase.from('bot_trades').update({trail_sl:newSl}).eq('id',t.id)
            log.push(`BE LOCK ${sym} ${t.side} SL→entry`)
          }

          if (newStatus) {
            const dirM = t.side==='LONG' ? 1 : -1
            const fav  = (price - entry)/entry * dirM
            const pnl  = fav*entry*size - Number(t.fee) - price*size*FEE
            const finalStatus = (pnl > 0 && newStatus === 'BE') ? 'TP'
                              : (pnl > 0 && newStatus === 'SL') ? 'TP'
                              : newStatus
            balance += entry*size + pnl
            openCount--
            await supabase.from('bot_trades').update({
              status:finalStatus, exit_price:price, pnl,
              pnl_pct:fav, closed_at:new Date().toISOString(), trail_sl:newSl
            }).eq('id',t.id)
            log.push(`CLOSE ${sym} ${t.side} ${finalStatus} pnl=${pnl.toFixed(2)}`)
          }
        }

        // ── כניסה חדשה ───────────────────────────────────
        if (breakerOn || streakPaused) continue
        if ((openTrades||[]).length > 0) continue   // פוזיציה אחת למטבע
        if (openCount >= MAX_POS) continue

        // איתות RSI(2)
        let side: 'LONG'|'SHORT'|null = null
        if      (rsi < RSI_LONG)  side = 'LONG'
        else if (rsi > RSI_SHORT) side = 'SHORT'
        if (!side) continue

        // פילטר טרנד 5m — לא לסחור נגד הזרם
        const tr = await trend5m(sym)
        if (tr === 'DOWN' && side === 'LONG')  { log.push(`SKIP ${sym} LONG trend=DOWN`); continue }
        if (tr === 'UP'   && side === 'SHORT') { log.push(`SKIP ${sym} SHORT trend=UP`);  continue }

        // גודל פוזיציה (גדולה יותר כשRSI קיצוני יותר)
        const notional = calcSize(rsi, side, balance)
        if (notional < 5) continue

        const size   = notional / price
        const fee    = price * size * FEE
        const initSl = side==='LONG' ? price*(1-SL_PCT) : price*(1+SL_PCT)

        balance -= (notional + fee)
        openCount++
        await supabase.from('bot_trades').insert({
          sym, side, entry_price:price, size, fee,
          trail_sl:initSl, hi:price, lo:price,
          status:'OPEN', score:Math.round(rsi), mtf:true
        })
        log.push(`OPEN ${sym} ${side} @ ${price.toFixed(4)} RSI=${rsi.toFixed(1)} trend=${tr} size=$${notional.toFixed(0)}`)
        await new Promise(r => setTimeout(r, 20))

      } catch(e) {
        log.push(`ERR ${sym}: ${e}`)
      }
    }

    await supabase.from('bot_state').update({
      balance, updated_at:new Date().toISOString(),
      market_regime:'MM_v8', streak
    }).eq('id',1)

    return new Response(JSON.stringify({
      ok:true, v:8, mode:'money-machine',
      coins:COINS.length, openCount,
      breaker:breakerOn, streakPaused, streak,
      log
    }), {headers:{'Content-Type':'application/json'}})

  } catch(e) {
    return new Response(JSON.stringify({error:String(e)}), {
      status:200, headers:{'Content-Type':'application/json'}
    })
  }
})

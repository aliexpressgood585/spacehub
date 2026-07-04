// ═══════════════════════════════════════════════════════════
// CryptoBot v9 — Money Machine ALL CONDITIONS
// ATR דינמי + אישור נר + time filter + RSI multi-TF
// win rate יעד: 68%+ | R:R: 2:1 | 100-200 עסקאות/יום
// ═══════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2'

const BINANCE      = 'https://api.binance.com/api/v3'      // ticker/price — works
const BINANCE_DATA = 'https://data-api.binance.vision/api/v3' // klines — public data CDN
// 75 מטבעות מאומתים בBinance USDT spot — ממוינים לפי נפח
const COINS = [
  // Tier 1 — mega liquid
  'BTC','ETH','BNB','SOL','XRP','DOGE','ADA','TRX','AVAX','LINK',
  'TON','DOT','HBAR','SUI','POL','UNI','NEAR','PEPE','WIF','APT',
  // Tier 2 — very liquid
  'ATOM','LTC','BCH','ICP','FIL','VET','ALGO','AAVE','ARB','OP',
  'MKR','INJ','FET','RNDR','LDO','RUNE','GRT','SAND','AXS','IMX',
  'MANA','ENJ','GALA','FLOW','ROSE','THETA','CHZ','ZIL','KAVA','ONE',
  // Tier 3 — liquid & verified on Binance
  'FTM','BLUR','GMX','CAKE','ENS','BAND','STORJ','SKL','RLC','ANKR',
  'BAT','ZRX','SNX','CRV','COMP','BAL','SUSHI','OCEAN','MASK','QNT',
  'MINA','MAGIC','JASMY','KNC','XLM','XTZ','STX','SFP','TWT','RSR',
  'MTL','NMR','ICX','HOT','WIN','COTI'
]

// ─── פרמטרים ─────────────────────────────────────────────
const RSI_P            = 2
const RSI_LONG         = 13    // יותר סיגנלים (היה 10)
const RSI_SHORT        = 87    // יותר סיגנלים (היה 90)
const RSI_STRONG_LONG  = 5    // קיצוני מאוד: עוקף פילטרים
const RSI_STRONG_SHORT = 95
const RSI_EXIT_LONG    = 70
const RSI_EXIT_SHORT   = 30
// ATR-based TP/SL multipliers
const ATR_P            = 14   // ATR period (1m bars)
const ATR_TP_MULT      = 2.0  // TP = 2 × ATR
const ATR_SL_MULT      = 1.0  // SL = 1 × ATR
const ATR_MIN_PCT      = 0.0002 // אם ATR < 0.02%: שוק שקט מדי
const ATR_MAX_PCT      = 0.020  // אם ATR > 2%: סוער מדי (היה 1.5%)
const BE_MULT          = 0.5   // BE trigger = SL/2 לתוך הרווח
const MAX_HOLD_MIN     = 25
const BASE_SIZE_PCT    = 0.035
const MAX_POS          = 40
const MAX_PER_COIN     = 2
const FEE              = 0.001
const MAX_DAY_LOSS     = 0.15
const STREAK_LIMIT     = 8
const STREAK_PAUSE_MS  = 1 * 3600_000
const PORTFOLIO_STOP   = 0.05
// 24/7 מסחר — mean-reversion עובד בכל שעה
const TRADE_HOUR_START = 0
const TRADE_HOUR_END   = 24

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

// ATR אמיתי (Wilder)
function calcATR(bars: Bar[], p = ATR_P): number {
  if (bars.length < p + 1) return 0
  const trs = bars.slice(1).map((b,i) => Math.max(
    b.high - b.low,
    Math.abs(b.high - bars[i].close),
    Math.abs(b.low  - bars[i].close)
  ))
  // Wilder smoothing
  let atr = trs.slice(0, p).reduce((a,v) => a+v, 0) / p
  for (let i = p; i < trs.length; i++) atr = (atr*(p-1) + trs[i]) / p
  return atr
}

function calcEma(closes: number[], p: number): number {
  const k = 2 / (p + 1)
  let e = closes[0]
  for (let i = 1; i < closes.length; i++) e = closes[i]*k + e*(1-k)
  return e
}

async function fetchBars(sym: string, interval: string, limit: number): Promise<{bars:Bar[],err?:string}> {
  try {
    const res = await fetch(`${BINANCE_DATA}/klines?symbol=${sym}USDT&interval=${interval}&limit=${limit}`, {
      headers: {'User-Agent':'Mozilla/5.0','Accept':'application/json'}
    })
    if (!res.ok) return {bars:[], err:`HTTP${res.status}`}
    const data: number[][] = await res.json()
    return {bars: data.map(k => ({open:+k[1],high:+k[2],low:+k[3],close:+k[4],vol:+k[5]}))}
  } catch(e) { return {bars:[], err:String(e).slice(0,60)} }
}

// הרצת promises בbatches — מניעת חסימת proxy מ-200 בקשות בו-זמנית
async function runBatched<T>(tasks: (() => Promise<T>)[], size = 20): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < tasks.length; i += size) {
    const batch = tasks.slice(i, i + size)
    out.push(...await Promise.all(batch.map(f => f())))
  }
  return out
}

function trend5mFromBars(bars: Bar[]): 'UP'|'DOWN'|'FLAT' {
  if (!bars || bars.length < 22) return 'FLAT'
  const closes = bars.slice(0,-1).map(b => b.close)
  const e20 = calcEma(closes, 20)
  const last = closes[closes.length-1]
  const gap = (last - e20) / e20
  if (gap >  0.001) return 'UP'
  if (gap < -0.001) return 'DOWN'
  return 'FLAT'
}

function calcSize(rsi: number, side: 'LONG'|'SHORT', isStrong: boolean, balance: number): number {
  let mult = isStrong ? 1.8 : 1.0
  if (side === 'LONG'  && rsi < 2)  mult = 2.5
  if (side === 'SHORT' && rsi > 98) mult = 2.5
  return Math.min(balance * BASE_SIZE_PCT * mult, balance * 0.10)
}

Deno.serve(async () => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY')!
    )

    const { data: state } = await supabase.from('bot_state').select('*').eq('id',1).single()
    if (!state?.active) return new Response(JSON.stringify({ok:true,msg:'inactive'}), {headers:{'Content-Type':'application/json'}})

    let balance = state.balance
    const now = Date.now()
    const nowDate = new Date()
    const hourUTC = nowDate.getUTCHours()
    const today = nowDate.toISOString().slice(0,10)

    // ─── time filter ─────────────────────────────────────
    const inTradingHours = hourUTC >= TRADE_HOUR_START && hourUTC < TRADE_HOUR_END

    // בלם יומי
    let dayStart = Number(state.day_start_balance ?? balance)
    if (state.day_date !== today) {
      dayStart = balance
      await supabase.from('bot_state').update({day_start_balance:dayStart, day_date:today}).eq('id',1)
    }
    const breakerOn = (dayStart - balance) / dayStart >= MAX_DAY_LOSS

    // רצף הפסדים — רק עסקאות מ-3 השעות האחרונות (לא ספירת ישנות)
    const recentCutoff = new Date(now - 3*3600_000).toISOString()
    const { data: recent } = await supabase
      .from('bot_trades').select('pnl,closed_at').neq('status','OPEN')
      .gte('closed_at', recentCutoff)
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

    const log: string[] = [`UTC=${hourUTC}h ${inTradingHours?'✅TRADING':'💤OFF-HOURS'}`]
    if (breakerOn)    log.push('DAILY BREAKER ON')
    if (streakPaused) log.push(`STREAK PAUSE ${streak}`)

    log.push(`COINS=${COINS.length}`)

    // Portfolio Stop
    const { data: allOpen } = await supabase.from('bot_trades').select('*').eq('status','OPEN')
    const priceCache: Record<string,number> = {}
    await Promise.all([...(new Set((allOpen||[]).map((t:any) => t.sym)))].map(async (sym:string) => {
      try {
        const r = await fetch(`${BINANCE}/ticker/price?symbol=${sym}USDT`)
        if (r.ok) { const j = await r.json(); priceCache[sym] = +j.price }
      } catch(_) {}
    }))
    let totalLoss = 0
    for (const t of (allOpen||[])) {
      const px = priceCache[t.sym]; if (!px) continue
      const entry = Number(t.entry_price), size = Number(t.size)
      const pct = (px - entry)/entry * (t.side==='LONG'?1:-1)
      if (pct < 0) totalLoss += Math.abs(pct * entry * size)
    }
    const portfolioStop = totalLoss > balance * PORTFOLIO_STOP
    if (portfolioStop) log.push(`PORTFOLIO STOP $${totalLoss.toFixed(2)}`)

    // Pre-fetch רק פוזיציות פתוחות מDB (מקבילי — אותה infrastructure)
    const openBySymbolArr = await Promise.all(COINS.map(sym =>
      supabase.from('bot_trades').select('*').eq('sym',sym).eq('status','OPEN')
        .then(r => ({sym, data:r.data||[]}))
    ))
    const openBySymbol: Record<string,any[]> = {}
    for (const {sym,data} of openBySymbolArr) openBySymbol[sym] = data

    // ─── לולאה ראשית — klines per-coin (2 parallel max) ─
    for (const sym of COINS) {
      try {
        // fetch 1m ו-5m ביחד לכל מטבע — 2 בקשות מקביליות בלבד
        const [r1m, r5m] = await Promise.all([
          fetchBars(sym,'1m',60),
          fetchBars(sym,'5m',25)
        ])
        const raw   = r1m.bars
        const raw5m = r5m.bars
        if (!raw || raw.length < ATR_P + 2) {
          if (sym === 'BTC' || sym === 'ETH') log.push(`${sym} KLINES FAIL len=${raw?.length??0} err=${r1m.err??'none'}`)
          continue
        }

        const completedBars = raw.slice(0,-1)       // נרות סגורים
        const price         = raw[raw.length-1].close
        const lastBar       = completedBars[completedBars.length-1]
        const cl            = completedBars.map(b => b.close)
        const rsi           = rsi2(cl)
        const atr           = calcATR(completedBars)
        const atrPct        = atr / price
        const tr            = trend5mFromBars(raw5m)

        // ATR-based TP/SL
        const tpPct = atr * ATR_TP_MULT / price
        const slPct = atr * ATR_SL_MULT / price
        const bePct = slPct * BE_MULT     // breakeven trigger = חצי מהSL

        if (sym === 'BTC') log.push(`BTC: rsi=${rsi.toFixed(1)} atr=${(atrPct*100).toFixed(3)}% tr=${tr}`)
        const openTrades = openBySymbol[sym]

        // ── ניהול פוזיציות קיימות ──────────────────────
        const updateOps: Promise<any>[] = []
        for (const t of openTrades) {
          const entry   = Number(t.entry_price)
          const size    = Number(t.size)
          let   sl      = Number(t.trail_sl)
          const tp      = t.side==='LONG' ? entry*(1+tpPct) : entry*(1-tpPct)
          const beTrig  = t.side==='LONG' ? entry*(1+bePct) : entry*(1-bePct)
          const age     = Math.floor((now - new Date(t.opened_at).getTime()) / 60000)

          let newStatus: string|null = null
          let newSl = sl

          if (t.side === 'LONG') {
            if (price >= beTrig && sl < entry) newSl = entry
            if      (price >= tp)                       newStatus = 'TP'
            else if (price <= newSl)                    newStatus = newSl >= entry ? 'BE' : 'SL'
            else if (rsi > RSI_EXIT_LONG)               newStatus = 'TRAIL'
            else if (portfolioStop && price < entry)    newStatus = 'SL'
          } else {
            if (price <= beTrig && sl > entry) newSl = entry
            if      (price <= tp)                       newStatus = 'TP'
            else if (price >= newSl)                    newStatus = newSl <= entry ? 'BE' : 'SL'
            else if (rsi < RSI_EXIT_SHORT)              newStatus = 'TRAIL'
            else if (portfolioStop && price > entry)    newStatus = 'SL'
          }
          if (!newStatus && age >= MAX_HOLD_MIN) newStatus = 'TRAIL'

          if (!newStatus && newSl !== sl) {
            updateOps.push(supabase.from('bot_trades').update({trail_sl:newSl}).eq('id',t.id))
          }
          if (newStatus) {
            const dirM = t.side==='LONG'?1:-1
            const fav  = (price - entry)/entry * dirM
            const pnl  = fav*entry*size - Number(t.fee) - price*size*FEE
            const finalStatus = (pnl > 0 && (newStatus==='SL'||newStatus==='BE')) ? 'TP' : newStatus
            balance += entry*size + pnl
            openCount--
            updateOps.push(supabase.from('bot_trades').update({
              status:finalStatus, exit_price:price, pnl,
              pnl_pct:fav, closed_at:new Date().toISOString(), trail_sl:newSl
            }).eq('id',t.id))
            log.push(`CLOSE ${sym} ${t.side} ${finalStatus} pnl=${pnl.toFixed(2)}`)
          }
        }
        if (updateOps.length) await Promise.all(updateOps)

        // ── כניסה חדשה ───────────────────────────────────
        if (breakerOn || streakPaused) continue
        if (!inTradingHours) continue  // time filter
        if (openCount >= MAX_POS) continue

        // פילטר ATR: שוק שקט מדי או סוער מדי → דלג
        if (atrPct < ATR_MIN_PCT || atrPct > ATR_MAX_PCT) continue

        const coinPositions = openTrades.length
        const isStrong = rsi < RSI_STRONG_LONG || rsi > RSI_STRONG_SHORT
        const maxThisCoin = isStrong ? MAX_PER_COIN : 1
        if (coinPositions >= maxThisCoin) continue

        // RSI signal
        let side: 'LONG'|'SHORT'|null = null
        if      (rsi < RSI_LONG)  side = 'LONG'
        else if (rsi > RSI_SHORT) side = 'SHORT'
        if (!side) continue

        // אישור נר: רק לאותות חלשים (לא קיצוניים)
        if (!isStrong) {
          const candleOk = side === 'LONG'
            ? lastBar.close >= lastBar.open  // נר ירוק/doji = bounce
            : lastBar.close <= lastBar.open  // נר אדום/doji = נפילה
          if (!candleOk) continue
        }

        // פילטר טרנד 5m
        if (!isStrong) {
          if (tr === 'DOWN' && side === 'LONG')  continue
          if (tr === 'UP'   && side === 'SHORT') continue
        }

        const notional = calcSize(rsi, side, isStrong, balance)
        if (notional < 5) continue
        const size   = notional / price
        const fee    = price * size * FEE
        const initSl = side==='LONG' ? price*(1-slPct) : price*(1+slPct)

        balance -= (notional + fee)
        openCount++
        await supabase.from('bot_trades').insert({
          sym, side, entry_price:price, size, fee,
          trail_sl:initSl, hi:price, lo:price,
          status:'OPEN', score:Math.round(rsi), mtf:isStrong
        })
        const tag = isStrong ? ' STRONG' : ''
        log.push(`OPEN ${sym} ${side}${tag} RSI=${rsi.toFixed(1)} ATR=${(atrPct*100).toFixed(2)}% TP=${(tpPct*100).toFixed(2)}%`)

      } catch(e) {
        log.push(`ERR ${sym}: ${e}`)
      }
    }

    await supabase.from('bot_state').update({
      balance, updated_at:new Date().toISOString(),
      market_regime:`v9_UTC${hourUTC}`, streak
    }).eq('id',1)

    return new Response(JSON.stringify({
      ok:true, v:9, openCount,
      tradingHours:inTradingHours, atrFilter:true,
      breaker:breakerOn, streakPaused, streak,
      log
    }), {headers:{'Content-Type':'application/json'}})

  } catch(e) {
    return new Response(JSON.stringify({error:String(e)}), {
      status:200, headers:{'Content-Type':'application/json'}
    })
  }
})

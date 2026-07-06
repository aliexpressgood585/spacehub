import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPA_URL = Deno.env.get('SUPABASE_URL')!
const SUPA_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

function calcEma(src: number[], p: number): number[] {
  const k = 2 / (p + 1); const out = [src[0]]
  for (let i = 1; i < src.length; i++) out.push(src[i] * k + out[i-1] * (1-k))
  return out
}

function calcAdx(hi: number[], lo: number[], cl: number[], p = 14): number {
  if (cl.length < p + 2) return 20
  const sl = cl.length
  let trS = 0, plusS = 0, minS = 0
  for (let i = sl - p; i < sl; i++) {
    const tr = Math.max(hi[i]-lo[i], Math.abs(hi[i]-cl[i-1]), Math.abs(lo[i]-cl[i-1]))
    const up = hi[i] - hi[i-1], dn = lo[i-1] - lo[i]
    trS += tr
    plusS += (up > dn && up > 0) ? up : 0
    minS  += (dn > up && dn > 0) ? dn : 0
  }
  if (!trS) return 20
  const pDI = plusS / trS * 100, mDI = minS / trS * 100
  return Math.abs(pDI - mDI) / ((pDI + mDI) || 1) * 100
}

function calcAtr(hi: number[], lo: number[], cl: number[], p = 14): number {
  if (cl.length < 2) return hi[0] - lo[0]
  const trs = hi.slice(-p-1).map((h,i,a) => {
    if (i === 0) return h - lo[hi.length-p-1+i]
    const prev = cl[cl.length-p-1+i-1]
    return Math.max(h - lo[hi.length-p-1+i], Math.abs(h - prev), Math.abs(lo[hi.length-p-1+i] - prev))
  })
  return trs.reduce((a,b) => a+b, 0) / trs.length
}

function calcBBWidth(cl: number[], p = 20): number {
  const sl = cl.slice(-p)
  const mid = sl.reduce((a,b) => a+b, 0) / sl.length
  const std = Math.sqrt(sl.reduce((a,b) => a+(b-mid)**2, 0) / sl.length)
  return (std * 4) / mid  // (upper - lower) / mid
}

Deno.serve(async () => {
  try {
    const supa = createClient(SUPA_URL, SUPA_KEY)

    // Fetch 100 candles of 1h BTC from Binance
    const res = await fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=100')
    if (!res.ok) throw new Error('Binance fetch failed')
    const candles: number[][] = await res.json()

    const hi  = candles.map(c => parseFloat(String(c[2])))
    const lo  = candles.map(c => parseFloat(String(c[3])))
    const cl  = candles.map(c => parseFloat(String(c[4])))
    const n   = cl.length - 1

    const adx       = calcAdx(hi, lo, cl, 14)
    const atrPct    = calcAtr(hi, lo, cl, 14) / cl[n]
    const ema20     = calcEma(cl, 20)
    const ema50     = calcEma(cl, 50)
    const bbWidth   = calcBBWidth(cl, 20)
    const emaSlope  = (ema20[n] - ema20[n-5]) / ema20[n-5]

    // Classify regime
    let regime = 'RANGING'
    let confidence = 0.5
    let notes = ''

    if (adx > 25) {
      if (ema20[n] > ema50[n] && emaSlope > 0.001) {
        regime = 'TREND_UP'
        confidence = Math.min(adx / 50, 1)
        notes = `ADX=${adx.toFixed(1)} EMA20>EMA50 slope=${(emaSlope*100).toFixed(2)}%`
      } else if (ema20[n] < ema50[n] && emaSlope < -0.001) {
        regime = 'TREND_DOWN'
        confidence = Math.min(adx / 50, 1)
        notes = `ADX=${adx.toFixed(1)} EMA20<EMA50 slope=${(emaSlope*100).toFixed(2)}%`
      }
    } else if (atrPct > 0.022 || bbWidth > 0.07) {
      regime = 'VOLATILE'
      confidence = Math.min(atrPct / 0.04, 1)
      notes = `ATR=${(atrPct*100).toFixed(2)}% BB_width=${(bbWidth*100).toFixed(1)}%`
    } else {
      regime = 'RANGING'
      confidence = Math.min((25 - adx) / 25, 1)
      notes = `ADX=${adx.toFixed(1)} low_volatility`
    }

    // Save to market_regime table
    await supa.from('market_regime').insert({
      regime, confidence,
      btc_adx: adx, btc_atr_pct: atrPct,
      btc_ema_slope: emaSlope, bb_width_pct: bbWidth,
      notes
    })

    // Update bot_state
    await supa.from('bot_state').update({
      market_regime: regime,
      regime_confidence: confidence,
      regime_updated_at: new Date().toISOString()
    }).eq('id', 1)

    return new Response(JSON.stringify({ regime, confidence, adx, atrPct, notes }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})

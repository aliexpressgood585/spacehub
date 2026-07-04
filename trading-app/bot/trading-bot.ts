// ════════════════════════════════════════════════════════
// CryptoBot Pro v3 — Supabase Edge Function
// כולל: sizing לפי סיכון, בלם יומי, מסנן טרנד 15ד',
// השבתת מטבעות מפסידים, רווח חלקי, ATR SL/TP, ברייק-איבן
// ════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BINANCE = 'https://api.binance.com/api/v3'
const COINS = [
  'BTC','ETH','SOL','BNB','XRP','ADA','DOGE','AVAX','LINK','DOT',
  'MATIC','UNI','ATOM','LTC','BCH','NEAR','ALGO','FIL','VET','ICP'
]
const RISK = {
  low:    { riskPct:0.006, sl:0.008, maxPos:4, maxDayLoss:0.02 },
  medium: { riskPct:0.010, sl:0.010, maxPos:6, maxDayLoss:0.03 },
  high:   { riskPct:0.016, sl:0.013, maxPos:8, maxDayLoss:0.04 },
} as const
type RiskKey = keyof typeof RISK
const FEE = 0.001
const MIN_SCORE = 4, MIN_ADX = 18, TP_MULT = 2.4
const PARTIAL_AT = 1.2            // חצי פוזיציה נסגרת ברווח של 1.2×SL
const MAX_NOTIONAL_PCT = 0.15     // תקרה: 15% מהיתרה לעסקה
const STALE_MS = 45*60_000, STALE_BAND = 0.0015, COOLDOWN_MS = 180_000
const COIN_DISABLE_LOSSES = 7     // מטבע מושבת אם 7+ הפסדים ב-10 עסקאות אחרונות

interface Bar { open:number; high:number; low:number; close:number; vol:number }

function ema(src:number[], p:number): number[] {
  const k=2/(p+1); const out=[src[0]]
  for(let i=1;i<src.length;i++) out.push(src[i]*k+out[i-1]*(1-k))
  return out
}
function rsi(src:number[], p=14): number {
  if(src.length<p+1) return 50
  let g=0,l=0
  for(let i=src.length-p;i<src.length;i++){const d=src[i]-src[i-1];if(d>0)g+=d;else l-=d}
  return 100-100/(1+(g/p)/((l/p)||1e-9))
}
function macdHist(src:number[]): number {
  if(src.length<26) return 0
  const e12=ema(src,12),e26=ema(src,26)
  const ml=e12.map((v,i)=>v-e26[i])
  const sig=ema(ml,9); const n=ml.length-1
  return ml[n]-sig[n]
}
function bb(src:number[], p=20): {upper:number;mid:number;lower:number} {
  const sl=src.length>=p?src.slice(-p):src
  const mid=sl.reduce((a,b)=>a+b,0)/sl.length
  const std=Math.sqrt(sl.reduce((a,b)=>a+(b-mid)**2,0)/sl.length)
  return {upper:mid+2*std, mid, lower:mid-2*std}
}
function stochRsi(src:number[], p=14): {k:number;d:number} {
  if(src.length<p*2) return {k:50,d:50}
  const arr:number[]=[]
  for(let i=p;i<src.length;i++) arr.push(rsi(src.slice(0,i+1),p))
  if(arr.length<p) return {k:50,d:50}
  const rec=arr.slice(-p)
  const lo=Math.min(...rec),hi=Math.max(...rec)
  const k=hi===lo?50:((arr[arr.length-1]-lo)/(hi-lo))*100
  const kArr=arr.slice(-3).map((_,i2,a)=>{
    const sl2=arr.slice(0,arr.length-a.length+1+i2)
    const rr=sl2.slice(-p); const l2=Math.min(...rr),h2=Math.max(...rr)
    return h2===l2?50:((sl2[sl2.length-1]-l2)/(h2-l2))*100
  })
  return {k,d:kArr.reduce((a,b)=>a+b,0)/kArr.length}
}
function adx(bars:Bar[], p=14): number {
  if(bars.length<p+2) return 20
  const sl=bars.slice(-(p+1))
  let trS=0,plusS=0,minS=0
  for(let i=1;i<sl.length;i++){
    const c=sl[i],pv=sl[i-1]
    const tr=Math.max(c.high-c.low,Math.abs(c.high-pv.close),Math.abs(c.low-pv.close))
    const up=c.high-pv.high,dn=pv.low-c.low
    trS+=tr; plusS+=(up>dn&&up>0)?up:0; minS+=(dn>up&&dn>0)?dn:0
  }
  if(!trS) return 20
  const pDI=plusS/trS*100,mDI=minS/trS*100
  return Math.abs(pDI-mDI)/((pDI+mDI)||1)*100
}
function atr(bars:Bar[], p=14): number {
  if(bars.length<2) return bars[0]?(bars[0].high-bars[0].low):0
  const trs=bars.slice(-(p+1)).map((b,i,a)=>{
    if(i===0) return b.high-b.low
    return Math.max(b.high-b.low,Math.abs(b.high-a[i-1].close),Math.abs(b.low-a[i-1].close))
  })
  return trs.reduce((a,b)=>a+b,0)/trs.length
}
function volOk(bars:Bar[]): boolean {
  if(bars.length<20) return true
  const avg=bars.slice(-20).reduce((a,b)=>a+b.vol,0)/20
  return bars[bars.length-1].vol>=avg*1.0
}
function build5m(bars:Bar[]): Bar[] {
  const out:Bar[]=[]
  for(let i=0;i+4<bars.length;i+=5){
    const sl=bars.slice(i,i+5)
    out.push({open:sl[0].open,high:Math.max(...sl.map(b=>b.high)),low:Math.min(...sl.map(b=>b.low)),close:sl[4].close,vol:sl.reduce((a,b)=>a+b.vol,0)})
  }
  return out
}
function btcBias(bars:Bar[]): 'BULL'|'BEAR'|'NEUTRAL' {
  if(bars.length<20) return 'NEUTRAL'
  const cl=bars.map(b=>b.close)
  const r=rsi(cl,14); const e9=ema(cl,9),e21=ema(cl,21),n=cl.length-1
  if(r>55&&e9[n]>e21[n]) return 'BULL'
  if(r<45&&e9[n]<e21[n]) return 'BEAR'
  return 'NEUTRAL'
}
function trend15(bars15:Bar[]): 'UP'|'DOWN'|'NEUTRAL' {
  if(bars15.length<25) return 'NEUTRAL'
  const cl=bars15.map(b=>b.close),n=cl.length-1
  const e9=ema(cl,9),e21=ema(cl,21)
  return e9[n]>e21[n]?'UP':'DOWN'
}

interface Signal { dir:'BUY'|'SELL'|'HOLD'; score:number; adxVal:number; volGood:boolean; mtf:boolean }

function signal(bars:Bar[]): Signal {
  const empty:Signal={dir:'HOLD',score:0,adxVal:20,volGood:true,mtf:false}
  if(bars.length<35) return empty
  const cl=bars.map(b=>b.close),n=cl.length-1
  const e9=ema(cl,9),e21=ema(cl,21)
  const emaBull=e9[n]>e21[n]
  const r=rsi(cl,14)
  const rsiBull=r>52&&r<76, rsiBear=r<48&&r>24
  const hist=macdHist(cl); const macdBull=hist>0
  const bbv=bb(cl); const p=cl[n]
  const bbBull=p>bbv.mid&&p<bbv.upper, bbBear=p<bbv.mid&&p>bbv.lower
  const {k,d}=stochRsi(cl)
  const stBull=k>d&&k<80, stBear=k<d&&k>20
  const adxV=adx(bars); const vok=volOk(bars)
  const bF=[emaBull,rsiBull,macdBull,bbBull,stBull]
  const sF=[!emaBull,rsiBear,!macdBull,bbBear,stBear]
  const bS=bF.filter(Boolean).length, sS=sF.filter(Boolean).length
  let dir:'BUY'|'SELL'|'HOLD'='HOLD', score=Math.max(bS,sS)
  if(bS>=3){dir='BUY';score=bS}
  if(sS>=3){dir='SELL';score=sS}
  return {dir,score,adxVal:adxV,volGood:vok,mtf:false}
}

function multiTF(bars:Bar[]): Signal {
  const s1=signal(bars)
  const bars5=build5m(bars)
  if(bars5.length<25) return s1
  const s5=signal(bars5)
  if(s1.dir==='HOLD') return s1
  if(s5.dir===s1.dir) return {...s1,score:Math.min(5,s1.score+1),mtf:true}
  return s1
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

    // ── בלם יומי ──
    let dayStart = Number(state.day_start_balance ?? state.balance)
    if(state.day_date !== today){
      dayStart = currentBalance
      await supabase.from('bot_state').update({day_start_balance:dayStart, day_date:today}).eq('id',1)
    }
    const dailyLoss = (dayStart-currentBalance)/dayStart
    const breakerOn = dailyLoss >= R.maxDayLoss

    const { count } = await supabase
      .from('bot_trades').select('*',{count:'exact',head:true}).eq('status','OPEN')
    let openCount = count || 0

    // ── סטטיסטיקת מטבעות: השבתת מפסידים סדרתיים ──
    const disabled = new Set<string>()
    const cooldownUntil: Record<string,number> = {}
    const { data: recent } = await supabase
      .from('bot_trades').select('sym,pnl,closed_at').neq('status','OPEN')
      .gte('closed_at', new Date(now-3*86400_000).toISOString())
      .order('closed_at',{ascending:false}).limit(600)
    const bySym: Record<string,{pnl:number}[]> = {}
    for(const t of (recent||[])){
      if(!bySym[t.sym]) bySym[t.sym]=[]
      if(bySym[t.sym].length<10) bySym[t.sym].push({pnl:Number(t.pnl)||0})
      if(cooldownUntil[t.sym]===undefined) cooldownUntil[t.sym]=new Date(t.closed_at).getTime()+COOLDOWN_MS
    }
    for(const [sym,arr] of Object.entries(bySym)){
      if(arr.length>=10 && arr.filter(t=>t.pnl<0).length>=COIN_DISABLE_LOSSES) disabled.add(sym)
    }

    let btcBars:Bar[]=[]
    try { btcBars = await klines('BTC','1m',60) } catch(_){ /* NEUTRAL */ }
    const bias = btcBias(btcBars)
    const log: string[] = []
    if(breakerOn) log.push(`DAILY BREAKER ON (loss ${(dailyLoss*100).toFixed(2)}%) — no new entries today`)

    for(const sym of COINS) {
      try {
        const bars = await klines(sym,'1m',100)
        if(!bars.length) continue
        const price = bars[bars.length-1].close
        const atrPct = atr(bars)/price
        const slPct = Math.min(Math.max(atrPct*1.3, R.sl*0.6), R.sl*1.8)
        const tpPct = slPct*TP_MULT

        const { data: openTrades } = await supabase
          .from('bot_trades').select('*').eq('sym',sym).eq('status','OPEN')

        for(const t of (openTrades||[])) {
          let newStatus: string|null = null
          let newTrail = Number(t.trail_sl)
          const entry = Number(t.entry_price)
          const dirM = t.side==='LONG'?1:-1
          const fav = (price-entry)/entry*dirM

          // רווח חלקי: סגור חצי ב-1.2×SL ונעל ברייק-איבן
          if(!t.partial_done && fav>=PARTIAL_AT*slPct && Number(t.size)>0){
            const half = Number(t.size)/2
            const raw = fav*entry*half
            const exitFee = price*half*FEE
            const halfEntryFee = Number(t.fee)/2
            const pnl = raw - halfEntryFee - exitFee
            currentBalance += entry*half + pnl
            await supabase.from('bot_trades').insert({
              sym, side:t.side, entry_price:entry, exit_price:price, size:half,
              pnl, pnl_pct:fav, status:'TP', trail_sl:newTrail, fee:halfEntryFee,
              hi:price, lo:price, score:t.score, mtf:t.mtf, partial_done:true,
              opened_at:t.opened_at, closed_at:new Date().toISOString()
            })
            const be = entry*(1+dirM*2*FEE)
            if(dirM===1&&be>newTrail) newTrail=be
            if(dirM===-1&&be<newTrail) newTrail=be
            await supabase.from('bot_trades').update({
              size:half, fee:halfEntryFee, partial_done:true, trail_sl:newTrail
            }).eq('id',t.id)
            t.size=half; t.fee=halfEntryFee; t.partial_done=true; t.trail_sl=newTrail
            log.push(`PARTIAL ${sym} ${t.side} @ ${price} pnl=${pnl.toFixed(2)}`)
          }

          if(t.side==='LONG'){
            if(price>=entry*(1+0.5*slPct)){
              const cand = price*(1-0.6*slPct)
              if(cand>newTrail) newTrail=cand
            }
            if(price>=entry*(1+slPct)){
              const be = entry*(1+2*FEE)
              if(be>newTrail) newTrail=be
            }
            const sl = Math.max(newTrail, entry*(1-slPct))
            if(price>=entry*(1+tpPct)) newStatus='TP'
            else if(price<=sl) newStatus=price<=entry*(1-slPct)?'SL':'TRAIL'
          } else {
            if(price<=entry*(1-0.5*slPct)){
              const cand = price*(1+0.6*slPct)
              if(cand<newTrail) newTrail=cand
            }
            if(price<=entry*(1-slPct)){
              const be = entry*(1-2*FEE)
              if(be<newTrail) newTrail=be
            }
            const sl = Math.min(newTrail, entry*(1+slPct))
            if(price<=entry*(1-tpPct)) newStatus='TP'
            else if(price>=sl) newStatus=price>=entry*(1+slPct)?'SL':'TRAIL'
          }

          if(!newStatus && t.opened_at){
            const age = now - new Date(t.opened_at).getTime()
            if(age>STALE_MS && Math.abs(fav)<STALE_BAND) newStatus='TRAIL'
          }

          if(newStatus){
            const size = Number(t.size)
            const raw = fav*entry*size
            const exitFee = price*size*FEE
            const pnl = raw - Number(t.fee) - exitFee
            currentBalance += entry*size + pnl
            openCount--
            await supabase.from('bot_trades').update({
              status:newStatus, exit_price:price, pnl, trail_sl:newTrail,
              pnl_pct:fav, closed_at: new Date().toISOString()
            }).eq('id',t.id)
            log.push(`CLOSE ${sym} ${t.side} @ ${price} -> ${newStatus} pnl=${pnl.toFixed(2)}`)
          } else if(newTrail !== Number(t.trail_sl)) {
            await supabase.from('bot_trades').update({trail_sl:newTrail}).eq('id',t.id)
          }
        }

        // ── כניסה חדשה ──
        if(breakerOn) continue
        if(disabled.has(sym)) continue
        if((cooldownUntil[sym]||0) > now) continue
        const hasOpen = (openTrades||[]).length>0
        if(!hasOpen && openCount < R.maxPos) {
          const sig = multiTF(bars)
          if(sig.dir!=='HOLD' && sig.score>=MIN_SCORE && sig.adxVal>=MIN_ADX && sig.volGood) {
            if(sym!=='BTC'){
              if(sig.dir==='BUY'  && bias==='BEAR') continue
              if(sig.dir==='SELL' && bias==='BULL') continue
            }
            // מסנן טרנד 15 דקות
            const bars15 = await klines(sym,'15m',40)
            const t15 = trend15(bars15)
            if(t15==='NEUTRAL') continue
            if(sig.dir==='BUY' && t15!=='UP') continue
            if(sig.dir==='SELL' && t15!=='DOWN') continue

            // sizing לפי סיכון: מסכנים riskPct מהיתרה, הפוזיציה נגזרת מרוחב הסטופ
            const riskAmt = currentBalance*R.riskPct
            let notional = riskAmt/slPct
            notional = Math.min(notional, currentBalance*MAX_NOTIONAL_PCT, currentBalance*0.95)
            if(notional<5) continue
            const size = notional/price
            const fee  = price*size*FEE
            const trailSL = sig.dir==='BUY' ? price*(1-slPct) : price*(1+slPct)
            currentBalance -= (notional+fee)
            openCount++
            await supabase.from('bot_trades').insert({
              sym, side: sig.dir==='BUY'?'LONG':'SHORT',
              entry_price:price, size, trail_sl:trailSL, fee,
              hi:price, lo:price, status:'OPEN', score:sig.score, mtf:sig.mtf
            })
            log.push(`OPEN ${sym} ${sig.dir} @ ${price} score=${sig.score} sl=${(slPct*100).toFixed(2)}% notional=${notional.toFixed(0)}`)
          }
        }

        await new Promise(r=>setTimeout(r,50))
      } catch(e) {
        log.push(`ERROR ${sym}: ${e}`)
      }
    }

    await supabase.from('bot_state').update({
      balance: currentBalance,
      updated_at: new Date().toISOString()
    }).eq('id',1)

    return new Response(JSON.stringify({ok:true, processed:COINS.length, breaker:breakerOn, disabled:[...disabled], log}), {
      headers: {'Content-Type':'application/json'}
    })
  } catch(e) {
    return new Response(JSON.stringify({error:String(e)}), {
      status: 200, headers: {'Content-Type':'application/json'}
    })
  }
})

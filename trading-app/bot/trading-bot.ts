// ════════════════════════════════════════════
// CryptoBot Pro v2 — Supabase Edge Function
// אסטרטגיה: כניסות 4/5 + ADX18 + נפח, ATR-SL/TP,
// ברייק-איבן, טריילינג מאוחר, יציאת עסקה תקועה
// ════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BINANCE = 'https://api.binance.com/api/v3'
const COINS = [
  'BTC','ETH','SOL','BNB','XRP','ADA','DOGE','AVAX','LINK','DOT',
  'MATIC','UNI','ATOM','LTC','BCH','NEAR','ALGO','FIL','VET','ICP'
]
const RISK = {
  low:    { pct:0.05, sl:0.008, tp:0.020, maxPos:4 },
  medium: { pct:0.07, sl:0.010, tp:0.025, maxPos:6 },
  high:   { pct:0.10, sl:0.013, tp:0.032, maxPos:8 },
} as const
type RiskKey = keyof typeof RISK
const FEE = 0.001
const MIN_SCORE = 4, MIN_ADX = 18
const STALE_MS = 45*60_000, STALE_BAND = 0.0015, COOLDOWN_MS = 180_000

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

    const { count } = await supabase
      .from('bot_trades').select('*',{count:'exact',head:true}).eq('status','OPEN')
    let openCount = count || 0

    let btcBars:Bar[]=[]
    try {
      const btcRes = await fetch(`${BINANCE}/klines?symbol=BTCUSDT&interval=1m&limit=60`)
      const btcData: number[][] = await btcRes.json()
      btcBars = btcData.map(k=>({open:+k[1],high:+k[2],low:+k[3],close:+k[4],vol:+k[5]}))
    } catch(_){ /* bias stays NEUTRAL */ }

    const bias = btcBias(btcBars)
    const log: string[] = []

    for(const sym of COINS) {
      try {
        const res = await fetch(`${BINANCE}/klines?symbol=${sym}USDT&interval=1m&limit=100`)
        if(!res.ok) continue
        const klines: number[][] = await res.json()
        const bars: Bar[] = klines.map(k=>({open:+k[1],high:+k[2],low:+k[3],close:+k[4],vol:+k[5]}))
        const price = bars[bars.length-1].close
        const atrPct = atr(bars)/price
        const slPct = Math.min(Math.max(atrPct*1.3, R.sl*0.6), R.sl*1.8)
        const tpPct = slPct*2.4

        const { data: openTrades } = await supabase
          .from('bot_trades').select('*').eq('sym',sym).eq('status','OPEN')

        for(const t of (openTrades||[])) {
          let newStatus: string|null = null
          let newTrail = Number(t.trail_sl)
          const entry = Number(t.entry_price)

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

          // עסקה תקועה: פתוחה 45 דק' בלי כיוון — שחרר את המקום
          if(!newStatus && t.opened_at){
            const age = now - new Date(t.opened_at).getTime()
            const uPct = (price-entry)/entry*(t.side==='LONG'?1:-1)
            if(age>STALE_MS && Math.abs(uPct)<STALE_BAND) newStatus='TRAIL'
          }

          if(newStatus){
            const size = Number(t.size)
            const raw = t.side==='LONG' ? (price-entry)*size : (entry-price)*size
            const exitFee = price*size*FEE
            const pnl = raw - Number(t.fee) - exitFee
            currentBalance += entry*size + pnl
            openCount--
            await supabase.from('bot_trades').update({
              status:newStatus, exit_price:price, pnl, trail_sl:newTrail,
              pnl_pct:(price-entry)/entry*(t.side==='LONG'?1:-1),
              closed_at: new Date().toISOString()
            }).eq('id',t.id)
            log.push(`CLOSE ${sym} ${t.side} @ ${price} -> ${newStatus} pnl=${pnl.toFixed(2)}`)
          } else if(newTrail !== Number(t.trail_sl)) {
            await supabase.from('bot_trades').update({trail_sl:newTrail}).eq('id',t.id)
          }
        }

        // כניסה חדשה
        const hasOpen = (openTrades||[]).length>0
        if(!hasOpen && openCount < R.maxPos) {
          const sig = multiTF(bars)
          if(sig.dir!=='HOLD' && sig.score>=MIN_SCORE && sig.adxVal>=MIN_ADX && sig.volGood) {
            if(sym!=='BTC'){
              if(sig.dir==='BUY'  && bias==='BEAR') continue
              if(sig.dir==='SELL' && bias==='BULL') continue
            }
            // קירור: 3 דק' אחרי סגירה אחרונה באותו מטבע
            const { data: lastClosed } = await supabase
              .from('bot_trades').select('closed_at').eq('sym',sym).neq('status','OPEN')
              .order('closed_at',{ascending:false}).limit(1)
            if(lastClosed?.[0]?.closed_at && now - new Date(lastClosed[0].closed_at).getTime() < COOLDOWN_MS) continue

            const useBal = currentBalance*R.pct
            if(useBal<5) continue
            const size = useBal/price
            const fee  = price*size*FEE
            const trailSL = sig.dir==='BUY' ? price*(1-slPct) : price*(1+slPct)
            currentBalance -= (useBal+fee)
            openCount++
            await supabase.from('bot_trades').insert({
              sym, side: sig.dir==='BUY'?'LONG':'SHORT',
              entry_price:price, size, trail_sl:trailSL, fee,
              hi:price, lo:price, status:'OPEN', score:sig.score, mtf:sig.mtf
            })
            log.push(`OPEN ${sym} ${sig.dir} @ ${price} score=${sig.score} sl=${(slPct*100).toFixed(2)}% tp=${(tpPct*100).toFixed(2)}%`)
          }
        }

        await new Promise(r=>setTimeout(r,60))
      } catch(e) {
        log.push(`ERROR ${sym}: ${e}`)
      }
    }

    await supabase.from('bot_state').update({
      balance: currentBalance,
      updated_at: new Date().toISOString()
    }).eq('id',1)

    return new Response(JSON.stringify({ok:true, processed:COINS.length, log}), {
      headers: {'Content-Type':'application/json'}
    })
  } catch(e) {
    return new Response(JSON.stringify({error:String(e)}), {
      status: 200, headers: {'Content-Type':'application/json'}
    })
  }
})

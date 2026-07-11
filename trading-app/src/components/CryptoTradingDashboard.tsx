import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react'
import { createClient } from '@supabase/supabase-js'

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

type RiskType = 'low'|'medium'|'high'
type TabType  = 'scanner'|'history'|'stats'

interface Bar { time:number; open:number; high:number; low:number; close:number; vol:number }
interface Trade {
  id:number; sym:string; side:'LONG'|'SHORT'
  entry:number; exit?:number; size:number
  pnl?:number; pnlPct?:number; ts:number
  status:'OPEN'|'TP'|'SL'|'TRAIL'
  hi:number; lo:number; trailSL:number; fee:number
}
interface Sig {
  dir:'BUY'|'SELL'|'HOLD'; score:number; f:boolean[]
  rsi:number; adx:number; volOk:boolean; mtf:boolean
  bb:{upper:number;mid:number;lower:number}
}
interface PriceInfo { price:number; change:number }

const COINS = [
  {sym:'BTC',ws:'btcusdt'},{sym:'ETH',ws:'ethusdt'},{sym:'SOL',ws:'solusdt'},
  {sym:'BNB',ws:'bnbusdt'},{sym:'XRP',ws:'xrpusdt'},{sym:'ADA',ws:'adausdt'},
  {sym:'DOGE',ws:'dogeusdt'},{sym:'AVAX',ws:'avaxusdt'},{sym:'LINK',ws:'linkusdt'},
  {sym:'DOT',ws:'dotusdt'},{sym:'MATIC',ws:'maticusdt'},{sym:'UNI',ws:'uniusdt'},
  {sym:'ATOM',ws:'atomusdt'},{sym:'LTC',ws:'ltcusdt'},{sym:'BCH',ws:'bchusdt'},
  {sym:'NEAR',ws:'nearusdt'},{sym:'ALGO',ws:'algousdt'},{sym:'FIL',ws:'filusdt'},
  {sym:'VET',ws:'vetusdt'},{sym:'ICP',ws:'icpusdt'},
]

const RISK_LABELS: Record<RiskType,string> = {low:'נמוך',medium:'בינוני',high:'גבוה'}
const RISK = {
  low:    {pct:0.04, sl:0.007, tp:0.020, trail:0.004, maxPos:6},
  medium: {pct:0.06, sl:0.010, tp:0.028, trail:0.007, maxPos:12},
  high:   {pct:0.08, sl:0.013, tp:0.036, trail:0.009, maxPos:18},
}

const INIT_BAL = 10_000
const MAX_BARS  = 300
const BAR_MS    = 60_000
const FEE_PCT   = 0.001

// ─── CSS animations (injected once) ──────────────────────────────────────────
const GLOBAL_CSS = `
  @keyframes hologram {
    0%,100% { background-position: 0% 50%; }
    50%      { background-position: 100% 50%; }
  }
  @keyframes pulseGreen {
    0%,100% { box-shadow: 0 0 8px rgba(0,255,136,.4), 0 4px 20px rgba(0,0,0,.55); }
    50%     { box-shadow: 0 0 28px rgba(0,255,136,.95), 0 0 52px rgba(0,255,136,.28), 0 4px 20px rgba(0,0,0,.55); }
  }
  @keyframes pulseRed {
    0%,100% { box-shadow: 0 0 8px rgba(255,55,100,.4), 0 4px 20px rgba(0,0,0,.55); }
    50%     { box-shadow: 0 0 28px rgba(255,55,100,.95), 0 0 52px rgba(255,55,100,.28), 0 4px 20px rgba(0,0,0,.55); }
  }
  @keyframes pulseBlue {
    0%,100% { box-shadow: 0 0 8px rgba(0,190,255,.35), 0 4px 20px rgba(0,0,0,.55); }
    50%     { box-shadow: 0 0 22px rgba(0,190,255,.85), 0 0 44px rgba(0,190,255,.22), 0 4px 20px rgba(0,0,0,.55); }
  }
  @keyframes scanGlow {
    0%,100% { opacity:.6; }
    50%      { opacity:1; }
  }
  .neon-title {
    background: linear-gradient(90deg,#00ffcc,#cc44ff,#00ccff,#ff44cc,#00ffcc);
    background-size: 300% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: hologram 4.5s linear infinite;
    filter: drop-shadow(0 0 7px rgba(0,255,200,.55));
    font-weight: 900;
    letter-spacing: 2px;
  }
  .balance-glow {
    text-shadow: 0 0 14px rgba(0,255,136,.85), 0 0 35px rgba(0,255,136,.45), 0 0 70px rgba(0,255,136,.18);
  }
  .balance-neg {
    text-shadow: 0 0 14px rgba(255,55,100,.85), 0 0 35px rgba(255,55,100,.45);
  }
  .sig-buy  { animation: pulseGreen 2s ease-in-out infinite; }
  .sig-sell { animation: pulseRed   2s ease-in-out infinite; }
  .sig-wait { animation: pulseBlue  3s ease-in-out infinite; }
  .stat-card {
    transition: transform .2s ease, box-shadow .2s ease;
    cursor: default;
  }
  .stat-card:hover {
    transform: translateY(-3px) scale(1.02);
  }
  .coin-btn {
    transition: transform .15s ease, box-shadow .15s ease;
  }
  .coin-btn:hover { transform: translateY(-2px); }
  .tr-hover:hover { background: rgba(0,190,255,.05) !important; }
  .tr-buy:hover   { background: rgba(0,255,136,.07) !important; }
  .tr-sell:hover  { background: rgba(255,55,100,.07) !important; }
`

// ─── math ─────────────────────────────────────────────────────────────────────
function calcEma(src:number[], p:number): number[] {
  const k=2/(p+1); const out=[src[0]]
  for(let i=1;i<src.length;i++) out.push(src[i]*k+out[i-1]*(1-k))
  return out
}

function calcRsi(src:number[], p=14): number {
  if(src.length<p+1) return 50
  let g=0,l=0
  for(let i=src.length-p;i<src.length;i++){
    const d=src[i]-src[i-1]; if(d>0) g+=d; else l-=d
  }
  return 100-100/(1+(g/p)/((l/p)||1e-9))
}

function calcMacd(src:number[]): number {
  if(src.length<26) return 0
  const e12=calcEma(src,12), e26=calcEma(src,26)
  const ml=e12.map((v,i)=>v-e26[i])
  const sig=calcEma(ml,9); const n=ml.length-1
  return ml[n]-sig[n]
}

function calcBB(src:number[], p=20, m=2): {upper:number;mid:number;lower:number} {
  const sl=src.length>=p?src.slice(-p):src
  const mid=sl.reduce((a,b)=>a+b,0)/sl.length
  const std=Math.sqrt(sl.reduce((a,b)=>a+(b-mid)**2,0)/sl.length)
  return {upper:mid+m*std, mid, lower:mid-m*std}
}

function calcStochRsi(src:number[], p=14): {k:number;d:number} {
  if(src.length<p*2) return {k:50,d:50}
  const rsiArr:number[]=[]
  for(let i=p;i<src.length;i++) rsiArr.push(calcRsi(src.slice(0,i+1),p))
  if(rsiArr.length<p) return {k:50,d:50}
  const rec=rsiArr.slice(-p)
  const lo=Math.min(...rec), hi=Math.max(...rec)
  const k=hi===lo?50:((rsiArr[rsiArr.length-1]-lo)/(hi-lo))*100
  const kSlice=rsiArr.slice(-3).map((_v,i2,a)=>{
    const sl2=rsiArr.slice(0,rsiArr.length-a.length+1+i2)
    const rr=sl2.slice(-p); const l2=Math.min(...rr),h2=Math.max(...rr)
    return h2===l2?50:((sl2[sl2.length-1]-l2)/(h2-l2))*100
  })
  return {k, d:kSlice.reduce((a,b)=>a+b,0)/kSlice.length}
}

function calcAdx(bars:Bar[], p=14): number {
  if(bars.length<p+2) return 20
  const sl=bars.slice(-(p+1))
  let trS=0, plusS=0, minS=0
  for(let i=1;i<sl.length;i++){
    const c=sl[i], pv=sl[i-1]
    const tr=Math.max(c.high-c.low,Math.abs(c.high-pv.close),Math.abs(c.low-pv.close))
    const up=c.high-pv.high, dn=pv.low-c.low
    trS+=tr; plusS+=(up>dn&&up>0)?up:0; minS+=(dn>up&&dn>0)?dn:0
  }
  if(!trS) return 20
  const pDI=plusS/trS*100, mDI=minS/trS*100
  return Math.abs(pDI-mDI)/((pDI+mDI)||1)*100
}

function calcAtr(bars:Bar[], p=14): number {
  if(bars.length<2) return bars[0]?(bars[0].high-bars[0].low):1
  const trs=bars.slice(-(p+1)).map((b,i,a)=>{
    if(i===0) return b.high-b.low
    return Math.max(b.high-b.low,Math.abs(b.high-a[i-1].close),Math.abs(b.low-a[i-1].close))
  })
  return trs.reduce((a,b)=>a+b,0)/trs.length
}

function build5mBars(bars1m:Bar[]): Bar[] {
  const out:Bar[]=[]
  for(let i=0;i+4<bars1m.length;i+=5){
    const sl=bars1m.slice(i,i+5)
    out.push({
      time:sl[0].time, open:sl[0].open,
      high:Math.max(...sl.map(b=>b.high)), low:Math.min(...sl.map(b=>b.low)),
      close:sl[4].close, vol:sl.reduce((a,b)=>a+b.vol,0)
    })
  }
  return out
}

function isVolOk(bars:Bar[]): boolean {
  if(bars.length<20) return true
  const avg=bars.slice(-20).reduce((a,b)=>a+b.vol,0)/20
  return bars[bars.length-1].vol>=avg*0.7
}

function getBtcBias(btcBars:Bar[]): 'BULL'|'BEAR'|'NEUTRAL' {
  if(btcBars.length<20) return 'NEUTRAL'
  const cl=btcBars.map(b=>b.close)
  const rsi=calcRsi(cl,14)
  const e9=calcEma(cl,9), e21=calcEma(cl,21), n=cl.length-1
  if(rsi>55&&e9[n]>e21[n]) return 'BULL'
  if(rsi<45&&e9[n]<e21[n]) return 'BEAR'
  return 'NEUTRAL'
}

function emptySig(): Sig {
  return {dir:'HOLD',score:0,f:[false,false,false,false,false],rsi:50,adx:20,volOk:true,mtf:false,bb:{upper:0,mid:0,lower:0}}
}

function computeSig(bars:Bar[]): Sig {
  if(bars.length<35) return emptySig()
  const cl=bars.map(b=>b.close), n=cl.length-1
  const e9=calcEma(cl,9), e21=calcEma(cl,21)
  const emaBull=e9[n]>e21[n]
  const rsi=calcRsi(cl,14)
  const rsiBull=rsi>52&&rsi<76, rsiBear=rsi<48&&rsi>24
  const hist=calcMacd(cl)
  const macdBull=hist>0
  const bb=calcBB(cl)
  const p=cl[n]
  const bbBull=p>bb.mid&&p<bb.upper, bbBear=p<bb.mid&&p>bb.lower
  const {k,d}=calcStochRsi(cl)
  const stochBull=k>d&&k<80, stochBear=k<d&&k>20
  const adx=calcAdx(bars)
  const vok=isVolOk(bars)
  const bF=[emaBull,rsiBull,macdBull,bbBull,stochBull]
  const sF=[!emaBull,rsiBear,!macdBull,bbBear,stochBear]
  const bS=bF.filter(Boolean).length, sS=sF.filter(Boolean).length
  if(bS>=3) return {dir:'BUY',score:bS,f:bF,rsi,adx,volOk:vok,mtf:false,bb}
  if(sS>=3) return {dir:'SELL',score:sS,f:sF,rsi,adx,volOk:vok,mtf:false,bb}
  return {dir:'HOLD',score:Math.max(bS,sS),f:bF,rsi,adx,volOk:vok,mtf:false,bb}
}

function getMultiTFSig(bars1m:Bar[]): Sig {
  const s1=computeSig(bars1m)
  const bars5m=build5mBars(bars1m)
  if(bars5m.length<25) return s1
  const s5=computeSig(bars5m)
  if(s1.dir==='HOLD') return s1
  if(s5.dir===s1.dir) return {...s1,score:Math.min(5,s1.score+1),mtf:true}
  return s1
}

function calcSharpe(trades:Trade[]): number {
  const cl=trades.filter(t=>t.pnlPct!==undefined)
  if(cl.length<3) return 0
  const r=cl.map(t=>t.pnlPct!)
  const m=r.reduce((a,b)=>a+b,0)/r.length
  const s=Math.sqrt(r.reduce((a,b)=>a+(b-m)**2,0)/r.length)||1e-9
  return (m/s)*Math.sqrt(252)
}

function calcMaxDD(trades:Trade[]): number {
  let bal=INIT_BAL, peak=INIT_BAL, mx=0
  for(const t of trades){ if(t.pnl){bal+=t.pnl;if(bal>peak)peak=bal;mx=Math.max(mx,(peak-bal)/peak)} }
  return mx*100
}

// ─── db mapping ───────────────────────────────────────────────────────────────
function mapDbTrade(t: Record<string,unknown>): Trade {
  return {
    id: t.id as number,
    sym: t.sym as string,
    side: t.side as 'LONG'|'SHORT',
    entry: Number(t.entry_price),
    exit: t.exit_price != null ? Number(t.exit_price) : undefined,
    size: Number(t.size),
    pnl: t.pnl != null ? Number(t.pnl) : undefined,
    pnlPct: t.pnl_pct != null ? Number(t.pnl_pct) : undefined,
    ts: new Date(t.opened_at as string).getTime(),
    status: t.status as 'OPEN'|'TP'|'SL'|'TRAIL',
    hi: Number(t.hi),
    lo: Number(t.lo),
    trailSL: Number(t.trail_sl),
    fee: Number(t.fee),
  }
}

// ─── chart ─────────────────────────────────────────────────────────────────────
function drawChart(canvas:HTMLCanvasElement, bars:Bar[], sig:Sig) {
  const ctx=canvas.getContext('2d'); if(!ctx||bars.length<3) return
  const W=canvas.width, H=canvas.height
  ctx.clearRect(0,0,W,H)
  const sl=bars.slice(-80), cl=sl.map(b=>b.close)
  const bbArr=cl.map((_,i)=>calcBB(cl.slice(0,i+1)))
  const ema9=calcEma(cl,9), ema21=calcEma(cl,21)
  const lo=Math.min(...sl.map(b=>b.low))*0.9985
  const hi=Math.max(...sl.map(b=>b.high))*1.0015
  const toY=(v:number)=>H-4-((v-lo)/(hi-lo))*(H-8)
  const toX=(i:number)=>(i/(sl.length-1))*(W-2)+1

  // BB band fill
  ctx.beginPath()
  bbArr.forEach((bb,i)=>{ i===0?ctx.moveTo(toX(i),toY(bb.upper)):ctx.lineTo(toX(i),toY(bb.upper)) })
  for(let i=bbArr.length-1;i>=0;i--) ctx.lineTo(toX(i),toY(bbArr[i].lower))
  ctx.closePath()
  const grad=ctx.createLinearGradient(0,0,0,H)
  grad.addColorStop(0,'rgba(0,180,255,0.08)')
  grad.addColorStop(1,'rgba(0,80,255,0.03)')
  ctx.fillStyle=grad; ctx.fill()

  // BB lines
  const bbLines=[bbArr.map(b=>b.upper),bbArr.map(b=>b.lower),bbArr.map(b=>b.mid)]
  const bbCols=['rgba(0,180,255,0.35)','rgba(0,180,255,0.35)','rgba(0,180,255,0.2)']
  bbLines.forEach((arr,li)=>{
    ctx.beginPath(); arr.forEach((v,i)=>{ i===0?ctx.moveTo(toX(i),toY(v)):ctx.lineTo(toX(i),toY(v)) })
    ctx.strokeStyle=bbCols[li]; ctx.lineWidth=0.8
    if(li===2) ctx.setLineDash([3,3]); else ctx.setLineDash([])
    ctx.stroke(); ctx.setLineDash([])
  })

  // Price line with glow
  const priceGlow=ctx.createLinearGradient(0,0,W,0)
  priceGlow.addColorStop(0,'rgba(0,200,255,0.5)')
  priceGlow.addColorStop(1,'rgba(0,255,200,0.9)')
  ctx.shadowColor='rgba(0,220,255,0.7)'; ctx.shadowBlur=6
  ctx.beginPath(); cl.forEach((v,i)=>{ i===0?ctx.moveTo(toX(i),toY(v)):ctx.lineTo(toX(i),toY(v)) })
  ctx.strokeStyle=priceGlow; ctx.lineWidth=1.8; ctx.stroke()
  ctx.shadowBlur=0

  // EMA lines
  ctx.beginPath(); ema9.forEach((v,i)=>{ i===0?ctx.moveTo(toX(i),toY(v)):ctx.lineTo(toX(i),toY(v)) })
  ctx.strokeStyle='rgba(255,180,0,0.7)'; ctx.lineWidth=1; ctx.stroke()
  ctx.beginPath(); ema21.forEach((v,i)=>{ i===0?ctx.moveTo(toX(i),toY(v)):ctx.lineTo(toX(i),toY(v)) })
  ctx.strokeStyle='rgba(255,80,180,0.7)'; ctx.lineWidth=1; ctx.stroke()

  // Price label
  const lp=cl[cl.length-1]
  ctx.fillStyle='rgba(0,8,22,0.75)'; ctx.fillRect(2,toY(lp)-14,66,14)
  ctx.fillStyle='rgba(0,220,255,0.9)'; ctx.font='bold 10px monospace'
  ctx.fillText(lp>=100?lp.toFixed(1):lp.toFixed(5),4,toY(lp)-2)

  // ADX bar
  const adxW=Math.min(sig.adx/50,1)*28
  ctx.fillStyle=sig.adx>25?'rgba(0,255,136,0.4)':'rgba(255,200,80,0.35)'
  ctx.fillRect(W-32,H-7,adxW,5)

  // Signal dot
  ctx.shadowColor=sig.dir==='BUY'?'rgba(0,255,136,0.9)':sig.dir==='SELL'?'rgba(255,60,100,0.9)':'rgba(100,120,150,0.6)'
  ctx.shadowBlur=8
  ctx.beginPath(); ctx.arc(W-8,8,5,0,Math.PI*2)
  ctx.fillStyle=sig.dir==='BUY'?'#4f8':sig.dir==='SELL'?'#f55':'#555'; ctx.fill()
  ctx.shadowBlur=0
}

// ─── component ─────────────────────────────────────────────────────────────────
export default function CryptoTradingDashboard() {
  const M: CSSProperties = {fontFamily:'monospace'}
  const [prices,setPrices]       = useState<Record<string,PriceInfo>>({})
  const [selected,setSelected]   = useState('BTC')
  const [risk,setRisk]           = useState<RiskType>('medium')
  const [balance,setBalance]     = useState(INIT_BAL)
  const [botOn,setBotOn]         = useState(true)
  const [trades,setTrades]       = useState<Trade[]>([])
  const [sig,setSig]             = useState<Sig>(emptySig())
  const [allSigs,setAllSigs]     = useState<Record<string,Sig>>({})
  const [tick,setTick]           = useState(0)
  const [wsStatus,setWsStatus]   = useState<'connecting'|'live'|'error'>('connecting')
  const [supaStatus,setSupaStatus] = useState<'off'|'connecting'|'live'|'error'>(SUPA_URL&&SUPA_KEY?'connecting':'off')
  const [tab,setTab]             = useState<TabType>('scanner')
  const [marketRegime,setMarketRegime] = useState<string>('NEUTRAL')
  const [streak,setStreak]       = useState(0)

  const barsMap    = useRef(new Map<string,Bar[]>())
  const curBar     = useRef(new Map<string,Bar>())
  const tradeRef   = useRef<Trade[]>([])
  const balRef     = useRef(INIT_BAL)
  const botRef     = useRef(true)
  const selRef     = useRef('BTC')
  const riskRef    = useRef<RiskType>('medium')
  const idRef      = useRef(1)
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const cooldown   = useRef<Record<string,number>>({})
  const allSigsRef = useRef<Record<string,Sig>>({})
  const sigUpdateTimer = useRef(0)
  const supaRef    = useRef<ReturnType<typeof createClient>|null>(null)
  const supaModeRef = useRef(false)

  tradeRef.current = trades
  botRef.current   = botOn
  selRef.current   = selected
  riskRef.current  = risk
  balRef.current   = balance

  const openTrade = useCallback((sym:string, side:'LONG'|'SHORT', price:number, s:Sig)=>{
    if(supaModeRef.current) return
    const now=Date.now()
    if((cooldown.current[sym]||0)+30_000>now) return
    if(s.adx<14) return
    if(!s.volOk) return
    const btcBars=barsMap.current.get('BTC')||[]
    const bias=getBtcBias(btcBars)
    if(sym!=='BTC'&&side==='LONG'&&bias==='BEAR') return
    if(sym!=='BTC'&&side==='SHORT'&&bias==='BULL') return
    const R=RISK[riskRef.current]
    const openCount=tradeRef.current.filter(t=>t.status==='OPEN').length
    if(openCount>=R.maxPos) return
    const useBal=balRef.current*R.pct
    if(useBal<5) return
    const bars=barsMap.current.get(sym)||[]
    void calcAtr(bars)
    const size=useBal/price
    const fee=price*size*FEE_PCT
    const trailSL=side==='LONG'?price*(1-R.trail):price*(1+R.trail)
    const t:Trade={id:idRef.current++,sym,side,entry:price,size,ts:now,status:'OPEN',hi:price,lo:price,trailSL,fee}
    cooldown.current[sym]=now
    const next=[...tradeRef.current,t]
    tradeRef.current=next; setTrades([...next])
    setBalance(b=>{ const nb=b-useBal-fee; balRef.current=nb; return nb })
  },[])

  const checkTrades=useCallback((sym:string, price:number)=>{
    if(supaModeRef.current) return
    const R=RISK[riskRef.current]
    let dirty=false
    const updated=tradeRef.current.map(t=>{
      if(t.sym!==sym||t.status!=='OPEN') return t
      const nt={...t}
      if(price>nt.hi) nt.hi=price
      if(price<nt.lo) nt.lo=price
      if(nt.side==='LONG'){
        const newTrail=price*(1-R.trail)
        if(newTrail>nt.trailSL){nt.trailSL=newTrail;dirty=true}
        const sl=Math.max(nt.trailSL,nt.entry*(1-R.sl))
        if(price>=nt.entry*(1+R.tp)){nt.status='TP';nt.exit=price;dirty=true}
        else if(price<=sl){nt.status=price<=nt.entry*(1-R.sl)?'SL':'TRAIL';nt.exit=price;dirty=true}
      } else {
        const newTrail=price*(1+R.trail)
        if(newTrail<nt.trailSL){nt.trailSL=newTrail;dirty=true}
        const sl=Math.min(nt.trailSL,nt.entry*(1+R.sl))
        if(price<=nt.entry*(1-R.tp)){nt.status='TP';nt.exit=price;dirty=true}
        else if(price>=sl){nt.status=price>=nt.entry*(1+R.sl)?'SL':'TRAIL';nt.exit=price;dirty=true}
      }
      if(nt.exit!==undefined&&nt.pnl===undefined){
        const raw=nt.side==='LONG'?(nt.exit-nt.entry)*nt.size:(nt.entry-nt.exit)*nt.size
        const exitFee=nt.exit*nt.size*FEE_PCT
        nt.pnl=raw-nt.fee-exitFee
        nt.pnlPct=(nt.exit-nt.entry)/nt.entry*(nt.side==='LONG'?1:-1)
        setBalance(b=>{ const nb=b+nt.entry*nt.size+(nt.pnl as number); balRef.current=nb; return nb })
        dirty=true
      }
      return nt
    })
    if(dirty){tradeRef.current=updated;setTrades([...updated])}
  },[])

  const processTick=useCallback((sym:string, price:number, vol:number)=>{
    const now=Date.now()
    const barStart=Math.floor(now/BAR_MS)*BAR_MS
    let cb=curBar.current.get(sym)
    if(!cb||cb.time!==barStart){
      if(cb){const arr=barsMap.current.get(sym)||[];arr.push(cb);if(arr.length>MAX_BARS)arr.shift();barsMap.current.set(sym,arr)}
      cb={time:barStart,open:price,high:price,low:price,close:price,vol}
      curBar.current.set(sym,cb)
    } else {
      cb.close=price;if(price>cb.high)cb.high=price;if(price<cb.low)cb.low=price;cb.vol+=vol
    }
    checkTrades(sym,price)
    const bars=[...(barsMap.current.get(sym)||[]),cb]
    const s=getMultiTFSig(bars)
    allSigsRef.current[sym]=s
    const isSel=sym===selRef.current
    if(isSel){ setSig(s); setTick(n=>n+1) }
    if(botRef.current&&s.dir!=='HOLD'&&!supaModeRef.current){
      const openForSym=tradeRef.current.filter(t=>t.sym===sym&&t.status==='OPEN')
      if(openForSym.length===0) openTrade(sym,s.dir==='BUY'?'LONG':'SHORT',price,s)
    }
    const elapsed=now-sigUpdateTimer.current
    if(elapsed>500||isSel){
      sigUpdateTimer.current=now
      setAllSigs({...allSigsRef.current})
    }
  },[checkTrades,openTrade])

  useEffect(()=>{
    const load=async()=>{
      for(const coin of COINS){
        try{
          const res=await fetch(`https://api.binance.com/api/v3/klines?symbol=${coin.sym}USDT&interval=1m&limit=150`)
          if(!res.ok) continue
          const data:number[][]=await res.json()
          const bars:Bar[]=data.map(k=>({time:k[0] as number,open:+k[1],high:+k[2],low:+k[3],close:+k[4],vol:+k[5]}))
          barsMap.current.set(coin.sym,bars.slice(0,-1))
          const s=getMultiTFSig(bars)
          allSigsRef.current[coin.sym]=s
          if(coin.sym===selRef.current) setSig(s)
        }catch{}
        await new Promise(r=>setTimeout(r,120))
      }
      setAllSigs({...allSigsRef.current})
    }
    load()
  },[])

  useEffect(()=>{
    let dead=false
    function connect(){
      if(dead) return
      setWsStatus('connecting')
      const streams=COINS.map(c=>c.ws+'@miniTicker').join('/')
      const ws=new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`)
      ws.onopen=()=>setWsStatus('live')
      ws.onerror=()=>setWsStatus('error')
      ws.onclose=()=>{if(!dead){setWsStatus('error');setTimeout(connect,3000)}}
      ws.onmessage=(e)=>{
        try{
          const msg=JSON.parse(e.data)
          const d=msg.data||msg
          const wsName=(d.s||'').toLowerCase()
          const coin=COINS.find(c=>c.ws===wsName)
          if(!coin) return
          const price=parseFloat(d.c)
          const open24=parseFloat(d.o)
          setPrices(p=>({...p,[coin.sym]:{price,change:((price-open24)/open24)*100}}))
          processTick(coin.sym,price,parseFloat(d.v||'0'))
        }catch{}
      }
      return ws
    }
    const ws=connect()
    return ()=>{dead=true;ws?.close()}
  },[processTick])

  useEffect(()=>{
    if(!SUPA_URL||!SUPA_KEY) return
    const supa=createClient(SUPA_URL,SUPA_KEY)
    supaRef.current=supa
    supa.from('bot_state').select('*').eq('id',1).single().then(({data})=>{
      if(!data) return
      setBalance(data.balance); balRef.current=data.balance
      setRisk(data.risk as RiskType); riskRef.current=data.risk as RiskType
      setBotOn(data.active); botRef.current=data.active
      if(data.market_regime) setMarketRegime(data.market_regime)
      if(data.streak!==undefined) setStreak(data.streak)
    })
    supa.from('bot_trades').select('*').order('opened_at',{ascending:true}).limit(200).then(({data})=>{
      if(!data) return
      const mapped=data.map(t=>mapDbTrade(t as Record<string,unknown>))
      tradeRef.current=mapped; setTrades(mapped)
    })
    const ch=supa.channel('bot-realtime')
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'bot_trades'},(p)=>{
        const t=mapDbTrade(p.new as Record<string,unknown>)
        setTrades(prev=>{const next=[...prev,t];tradeRef.current=next;return next})
      })
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'bot_trades'},(p)=>{
        const t=mapDbTrade(p.new as Record<string,unknown>)
        setTrades(prev=>{const next=prev.map(x=>x.id===t.id?t:x);tradeRef.current=next;return next})
      })
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'bot_state'},(p)=>{
        const d=p.new as {balance:number;risk:string;active:boolean;market_regime?:string;streak?:number}
        setBalance(d.balance); balRef.current=d.balance
        setRisk(d.risk as RiskType); riskRef.current=d.risk as RiskType
        setBotOn(d.active); botRef.current=d.active
        if(d.market_regime) setMarketRegime(d.market_regime)
        if(d.streak!==undefined) setStreak(d.streak)
      })
      .subscribe((status)=>{
        const live=status==='SUBSCRIBED'
        setSupaStatus(live?'live':'error')
        supaModeRef.current=live
      })
    return ()=>{ supa.removeChannel(ch); supaModeRef.current=false }
  },[])

  useEffect(()=>{
    if(!canvasRef.current) return
    const bars=[...(barsMap.current.get(selected)||[])]
    const cb=curBar.current.get(selected)
    if(cb) bars.push(cb)
    if(bars.length>0) drawChart(canvasRef.current,bars,sig)
  },[tick,selected,sig])

  const handleBotToggle=()=>{
    const next=!botOn
    setBotOn(next); botRef.current=next
    supaRef.current?.from('bot_state').update({active:next,updated_at:new Date().toISOString()}).eq('id',1)
  }
  const handleRiskChange=(r:RiskType)=>{
    setRisk(r); riskRef.current=r
    supaRef.current?.from('bot_state').update({risk:r,updated_at:new Date().toISOString()}).eq('id',1)
  }

  const openTrades=trades.filter(t=>t.status==='OPEN')
  const closed    =trades.filter(t=>t.status!=='OPEN')
  const wins      =closed.filter(t=>(t.pnl||0)>0).length
  const winRate   =closed.length>0?(wins/closed.length*100):0
  const totalPnl  =closed.reduce((a,t)=>a+(t.pnl||0),0)
  const sharpe    =calcSharpe(trades)
  const maxDD     =calcMaxDD(trades)
  const selInfo   =prices[selected]
  const R         =RISK[risk]
  const totalFees =trades.reduce((a,t)=>{
    const ef=t.exit?t.exit*t.size*FEE_PCT:0
    return a+t.fee+ef
  },0)
  const fmtP=(p:number)=>p>=1000?p.toFixed(2):p>=1?p.toFixed(4):p.toFixed(6)
  const supaLive=supaStatus==='live'

  // ─── styles ────────────────────────────────────────────────────────────────
  const S={
    root:{
      ...M,
      background:'transparent',
      minHeight:'100vh',
      color:'#bdd0ec',
      padding:'8px',
      fontSize:'12px',
      direction:'rtl',
    } as CSSProperties,

    hdr:{
      display:'flex',flexWrap:'wrap' as const,gap:'6px',
      alignItems:'center',marginBottom:'10px',
      background:'rgba(4,12,30,0.82)',
      backdropFilter:'blur(22px)',
      WebkitBackdropFilter:'blur(22px)',
      borderRadius:'14px',padding:'10px 14px',
      border:'1px solid rgba(0,180,255,0.16)',
      borderTop:'1.5px solid rgba(0,180,255,0.38)',
      boxShadow:'0 8px 36px rgba(0,0,0,.65), 0 0 80px rgba(0,80,255,.05), inset 0 1px 0 rgba(255,255,255,.06)',
    } as CSSProperties,

    bdg:(bg:string,c?:string)=>({
      background:bg,
      borderRadius:'6px',padding:'3px 9px',
      fontSize:'11px',fontWeight:700,
      color:c||'#c8d8f0',
      border:'1px solid rgba(255,255,255,0.07)',
      boxShadow:'0 2px 10px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.05)',
    }) as CSSProperties,

    cbar:{
      display:'flex',gap:'4px',
      overflowX:'auto' as const,padding:'4px 0',
      marginBottom:'10px',scrollbarWidth:'none' as const,
    } as CSSProperties,

    cbtn:(active:boolean,sigDir:string)=>({
      cursor:'pointer',
      border:active
        ?'1px solid rgba(0,180,255,0.65)'
        :sigDir==='BUY'
          ?'1px solid rgba(0,255,136,0.42)'
          :sigDir==='SELL'
            ?'1px solid rgba(255,55,100,0.42)'
            :'1px solid rgba(0,180,255,0.09)',
      borderRadius:'9px',padding:'5px 7px',
      fontSize:'11px',fontWeight:700,
      background:active
        ?'rgba(0,180,255,0.16)'
        :sigDir==='BUY'
          ?'radial-gradient(circle at 40% 28%, rgba(0,255,136,0.2), rgba(0,40,20,0.12))'
          :sigDir==='SELL'
            ?'radial-gradient(circle at 40% 28%, rgba(255,55,100,0.2), rgba(60,0,20,0.12))'
            :'rgba(4,12,30,0.65)',
      backdropFilter:'blur(8px)',
      flexShrink:0,minWidth:'56px',
      textAlign:'center' as const,color:'#c8d8f0',
      boxShadow:active
        ?'0 0 16px rgba(0,180,255,0.4), inset 0 1px 0 rgba(0,180,255,0.25)'
        :sigDir==='BUY'
          ?'0 0 12px rgba(0,255,136,0.28)'
          :sigDir==='SELL'
            ?'0 0 12px rgba(255,55,100,0.28)'
            :'0 2px 8px rgba(0,0,0,.3)',
    }) as CSSProperties,

    grid:{
      display:'grid',gridTemplateColumns:'1fr 1fr',
      gap:'10px',marginBottom:'10px',
    } as CSSProperties,

    panel:{
      background:'rgba(4,12,30,0.78)',
      backdropFilter:'blur(22px)',
      WebkitBackdropFilter:'blur(22px)',
      borderRadius:'14px',padding:'12px',
      border:'1px solid rgba(0,180,255,0.13)',
      borderTop:'1.5px solid rgba(0,180,255,0.3)',
      boxShadow:'0 8px 36px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.04)',
    } as CSSProperties,

    row:{
      display:'flex',justifyContent:'space-between',
      padding:'4px 0',
      borderBottom:'1px solid rgba(0,180,255,0.07)',
    } as CSSProperties,

    btn:(bg:string,active:boolean)=>({
      cursor:'pointer',
      border:active?`1px solid ${bg}66`:'1px solid rgba(0,180,255,0.12)',
      borderRadius:'7px',padding:'5px 12px',
      fontSize:'11px',fontWeight:700,
      background:active
        ?`linear-gradient(135deg,${bg}28,${bg}10)`
        :'rgba(4,12,30,0.65)',
      color:active?bg:'#7a9abc',
      backdropFilter:'blur(8px)',
      boxShadow:active?`0 0 14px ${bg}44, inset 0 1px 0 ${bg}22`:'0 2px 8px rgba(0,0,0,.35)',
    }) as CSSProperties,

    tbl:{width:'100%',borderCollapse:'collapse' as const,fontSize:'11px'} as CSSProperties,

    th:{
      padding:'6px 6px',textAlign:'right' as const,
      color:'rgba(0,180,255,0.55)',
      borderBottom:'1px solid rgba(0,180,255,0.14)',
      fontWeight:600,letterSpacing:'0.3px',
    } as CSSProperties,

    td:(c?:string)=>({
      padding:'4px 6px',color:c||'inherit',
      borderBottom:'1px solid rgba(0,180,255,0.05)',
    }) as CSSProperties,
  }

  const TABS: Array<[TabType,string]> = [['scanner','🔍 סורק'],['history','📋 היסטוריה'],['stats','📊 סטטיסטיקה']]

  return (
    <div style={S.root}>
      <style>{GLOBAL_CSS}</style>

      {/* ── HEADER ── */}
      <div style={S.hdr}>
        <span className="neon-title" style={{fontSize:'15px'}}>⚡ NEXUS TRADE</span>

        {/* WS status */}
        <span style={S.bdg(
          wsStatus==='live'?'rgba(0,80,30,0.7)':'rgba(80,10,10,0.7)',
          wsStatus==='live'?'#4f8':'#f64'
        )}>
          {wsStatus==='live'?'● חי':wsStatus==='connecting'?'◌ מתחבר':'✕ שגיאה'}
        </span>

        {/* Supabase status */}
        {supaStatus!=='off'&&(
          <span style={S.bdg(
            supaLive?'rgba(0,40,70,0.7)':'rgba(60,30,0,0.7)',
            supaLive?'#4af':'#fa4'
          )}>
            {supaLive?'☁ 24/7':supaStatus==='connecting'?'☁ ...':'☁ שגיאה'}
          </span>
        )}

        {/* Market regime */}
        <span style={S.bdg(
          marketRegime==='BULL'?'rgba(0,60,20,0.7)':marketRegime==='BEAR'?'rgba(60,0,0,0.7)':'rgba(15,20,40,0.7)',
          marketRegime==='BULL'?'#4f8':marketRegime==='BEAR'?'#f64':'#7a9abc'
        )}>
          {marketRegime==='BULL'?'📈 עולה':marketRegime==='BEAR'?'📉 יורד':'➡ נייטרל'}
          {streak>0&&` ${streak}↓`}
        </span>

        {/* Balance */}
        <span style={{
          ...S.bdg('rgba(0,180,255,0.1)','#00ff88'),
          fontSize:'13px',
          fontWeight:900,
          textShadow:'0 0 10px rgba(0,255,136,0.8)',
          border:'1px solid rgba(0,255,136,0.2)',
        }}>
          💰 ${balance.toFixed(0)}
        </span>

        {/* PnL */}
        <span style={S.bdg(
          totalPnl>=0?'rgba(0,50,20,0.7)':'rgba(50,0,10,0.7)',
          totalPnl>=0?'#4f8':'#f64'
        )}>
          ר/ה {totalPnl>=0?'+':''}{totalPnl.toFixed(2)}
        </span>

        <span style={S.bdg('rgba(10,20,45,0.7)')}>שארפ {sharpe.toFixed(2)}</span>
        <span style={S.bdg('rgba(10,20,45,0.7)')}>DD {maxDD.toFixed(1)}%</span>
        <span style={S.bdg('rgba(10,20,45,0.7)')}>זכיה {winRate.toFixed(0)}% ({closed.length})</span>
        <span style={S.bdg('rgba(10,20,45,0.7)',totalFees>0?'#fa4':undefined)}>עמלות ${totalFees.toFixed(2)}</span>

        <span style={{marginRight:'auto',display:'flex',gap:'5px',flexWrap:'wrap' as const}}>
          {(['low','medium','high'] as const).map(r=>(
            <button key={r} className="coin-btn" style={S.btn(r==='low'?'#4af':r==='medium'?'#fa4':'#f64',risk===r)}
              onClick={()=>handleRiskChange(r)}>{RISK_LABELS[r]}</button>
          ))}
          <button className="coin-btn" style={{
            ...S.btn('#4f8',botOn),
            background:botOn?'linear-gradient(135deg,rgba(0,255,136,0.2),rgba(0,180,80,0.08))':'rgba(4,12,30,0.65)',
            color:botOn?'#4f8':'#7a9abc',
            boxShadow:botOn?'0 0 16px rgba(0,255,136,0.4), inset 0 1px 0 rgba(0,255,136,0.15)':'0 2px 8px rgba(0,0,0,.35)',
          }} onClick={handleBotToggle}>{botOn?'🤖 פעיל':'🤖 כבוי'}</button>
        </span>
      </div>

      {/* ── COIN BAR ── */}
      <div style={S.cbar}>
        {COINS.map(c=>{
          const info=prices[c.sym]; const chg=info?.change||0
          const cs=allSigs[c.sym]
          const isBuy=cs?.dir==='BUY', isSell=cs?.dir==='SELL'
          return (
            <button key={c.sym} className="coin-btn"
              style={S.cbtn(selected===c.sym,cs?.dir||'HOLD')}
              onClick={()=>setSelected(c.sym)}>
              <div style={{
                color: isBuy?'#4f8':isSell?'#f64':'#c8d8f0',
                fontWeight: selected===c.sym?900:700,
              }}>{c.sym}</div>
              <div style={{
                fontSize:'9px',
                color:chg>0.5?'#4f8':chg<-0.5?'#f64':'#7a9abc',
                textShadow:chg>0.5?'0 0 6px rgba(0,255,136,0.6)':chg<-0.5?'0 0 6px rgba(255,55,100,0.6)':'none',
              }}>{chg>=0?'+':''}{chg.toFixed(1)}%</div>
              {cs?.dir!=='HOLD'&&(
                <div style={{
                  fontSize:'8px',fontWeight:900,
                  color:cs?.dir==='BUY'?'#4f8':'#f64',
                  textShadow:cs?.dir==='BUY'?'0 0 5px #4f8':'0 0 5px #f64',
                }}>{cs?.dir==='BUY'?'▲':'▼'}</div>
              )}
            </button>
          )
        })}
      </div>

      {/* ── MAIN GRID ── */}
      <div style={S.grid}>

        {/* LEFT — chart + signal */}
        <div style={S.panel}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:'8px',alignItems:'center'}}>
            <span style={{
              fontWeight:900,fontSize:'14px',
              color:'#00ccff',
              textShadow:'0 0 10px rgba(0,200,255,0.7)',
            }}>{selected}/USDT</span>
            <span style={{fontSize:'14px',fontWeight:800,
              color:selInfo?.change>0?'#4f8':'#f64',
              textShadow:selInfo?.change>0?'0 0 10px rgba(0,255,136,0.8)':'0 0 10px rgba(255,55,100,0.8)',
            }}>
              {selInfo?fmtP(selInfo.price):'—'}
              <span style={{fontSize:'10px',marginLeft:'5px',opacity:0.8}}>
                {selInfo?`${selInfo.change>=0?'+':''}${selInfo.change.toFixed(2)}%`:''}
              </span>
            </span>
          </div>

          {/* Chart canvas */}
          <div style={{
            borderRadius:'10px',overflow:'hidden',marginBottom:'8px',
            border:'1px solid rgba(0,180,255,0.15)',
            boxShadow:'0 4px 20px rgba(0,0,0,.5), inset 0 0 20px rgba(0,180,255,0.03)',
          }}>
            <canvas ref={canvasRef} width={460} height={130}
              style={{width:'100%',height:'130px',background:'rgba(2,6,18,0.9)',display:'block'}}/>
          </div>

          {/* Indicator pills */}
          <div style={{display:'flex',gap:'4px',flexWrap:'wrap' as const,marginBottom:'7px'}}>
            {['EMA','RSI','MACD','BB','StochRSI'].map((lbl,i)=>(
              <span key={lbl} style={{
                padding:'3px 8px',borderRadius:'5px',fontSize:'10px',fontWeight:700,
                background:sig.f[i]
                  ?'linear-gradient(135deg,rgba(0,255,136,0.2),rgba(0,100,50,0.12))'
                  :'linear-gradient(135deg,rgba(255,55,100,0.2),rgba(100,0,30,0.12))',
                color:sig.f[i]?'#4f8':'#f64',
                border:sig.f[i]?'1px solid rgba(0,255,136,0.3)':'1px solid rgba(255,55,100,0.3)',
                boxShadow:sig.f[i]?'0 0 8px rgba(0,255,136,0.25)':'0 0 8px rgba(255,55,100,0.2)',
              }}>{lbl}</span>
            ))}
          </div>

          {/* RSI / ADX row */}
          <div style={{display:'flex',gap:'10px',fontSize:'10px',color:'#7a9abc',marginBottom:'7px',flexWrap:'wrap' as const}}>
            <span>RSI <strong style={{
              color:sig.rsi>70?'#f64':sig.rsi<30?'#4f8':'#fa4',
              textShadow:sig.rsi>70?'0 0 6px rgba(255,55,100,0.7)':sig.rsi<30?'0 0 6px rgba(0,255,136,0.7)':'none',
            }}>{sig.rsi.toFixed(0)}</strong></span>
            <span>ADX <strong style={{
              color:sig.adx>25?'#4f8':sig.adx>18?'#fa4':'#f64',
              textShadow:sig.adx>25?'0 0 6px rgba(0,255,136,0.7)':'none',
            }}>{sig.adx.toFixed(0)}</strong></span>
            <span>נפח <strong style={{color:sig.volOk?'#4f8':'#f64'}}>{sig.volOk?'✓':'✗'}</strong></span>
            <span>5D <strong style={{color:sig.mtf?'#4f8':'#555'}}>{sig.mtf?'✓':'—'}</strong></span>
          </div>

          {/* Signal box */}
          <div className={sig.dir==='BUY'?'sig-buy':sig.dir==='SELL'?'sig-sell':'sig-wait'} style={{
            padding:'8px',borderRadius:'10px',textAlign:'center' as const,
            fontWeight:900,fontSize:'14px',marginBottom:'8px',
            background:sig.dir==='BUY'
              ?'linear-gradient(135deg,rgba(0,80,40,0.6),rgba(0,40,20,0.4))'
              :sig.dir==='SELL'
                ?'linear-gradient(135deg,rgba(80,0,30,0.6),rgba(40,0,15,0.4))'
                :'linear-gradient(135deg,rgba(10,25,55,0.6),rgba(5,15,35,0.4))',
            color:sig.dir==='BUY'?'#4f8':sig.dir==='SELL'?'#f64':'#7a9abc',
            border:sig.dir==='BUY'
              ?'1px solid rgba(0,255,136,0.4)'
              :sig.dir==='SELL'
                ?'1px solid rgba(255,55,100,0.4)'
                :'1px solid rgba(0,180,255,0.2)',
          }}>
            {sig.dir==='BUY'?'▲ איתות קנייה':sig.dir==='SELL'?'▼ איתות מכירה':'— המתנה'} {sig.score}/5
            {sig.mtf&&<span style={{fontSize:'10px',marginRight:'6px',opacity:0.8}}> ✓ MTF</span>}
          </div>

          {/* Cloud status */}
          <div style={{
            padding:'6px',borderRadius:'8px',fontSize:'10px',textAlign:'center' as const,
            background:supaLive?'rgba(0,40,70,0.4)':'rgba(8,18,40,0.4)',
            color:supaLive?'rgba(0,180,255,0.8)':'rgba(60,90,140,0.8)',
            border:supaLive?'1px solid rgba(0,180,255,0.15)':'1px solid rgba(0,180,255,0.07)',
          }}>
            {supaLive
              ?'☁ בוט שרת פעיל 24/7 — גם ללא דפדפן פתוח'
              :'הבוט פועל אוטומטית — אין צורך בפקודות ידניות'
            }
          </div>
        </div>

        {/* RIGHT — risk + open positions */}
        <div style={S.panel}>
          <div style={{
            fontWeight:800,marginBottom:'8px',
            color:'rgba(0,180,255,0.7)',fontSize:'11px',
            textTransform:'uppercase' as const,letterSpacing:'1px',
          }}>⚙ רמת סיכון: {RISK_LABELS[risk]}</div>

          {([
            ['גודל פוזיציה',(R.pct*100).toFixed(0)+'%'],
            ['סטופ לוס',(R.sl*100).toFixed(1)+'%'],
            ['טייק פרופיט',(R.tp*100).toFixed(1)+'%'],
            ['סטופ גרור',(R.trail*100).toFixed(1)+'%'],
            ['יחס סיכוי/סיכון',(R.tp/R.sl).toFixed(1)+'x'],
            ['מקס פוזיציות',R.maxPos.toString()],
            ['פתוחות',openTrades.length.toString()],
            ['סה"כ עסקאות',trades.length.toString()],
          ] as [string,string][]).map(([k,v])=>(
            <div key={k} style={S.row}>
              <span style={{color:'rgba(0,180,255,0.45)',fontSize:'11px'}}>{k}</span>
              <span style={{color:'#4af',fontWeight:700}}>{v}</span>
            </div>
          ))}

          <div style={{
            fontWeight:800,margin:'10px 0 6px',
            color:'rgba(0,180,255,0.7)',fontSize:'11px',
            textTransform:'uppercase' as const,letterSpacing:'1px',
          }}>📂 פוזיציות פתוחות</div>

          {openTrades.length===0&&(
            <div style={{
              color:'rgba(0,180,255,0.2)',textAlign:'center' as const,
              padding:'12px 8px',fontSize:'11px',
              border:'1px dashed rgba(0,180,255,0.1)',borderRadius:'8px',
            }}>אין פוזיציות פתוחות</div>
          )}

          {openTrades.slice(-5).map(t=>{
            const cur=prices[t.sym]?.price||t.entry
            const pnl=(t.side==='LONG'?(cur-t.entry):(t.entry-cur))*t.size-t.fee
            const pct=(cur-t.entry)/t.entry*(t.side==='LONG'?1:-1)*100
            const isWin=pnl>=0
            const R2=RISK[risk]
            const tpDist=t.entry*(t.side==='LONG'?R2.tp:-R2.tp)
            const progress=Math.min(Math.max((pct/((t.side==='LONG'?R2.tp:-R2.tp)*100))*100,0),100)
            return (
              <div key={t.id} style={{
                background:isWin
                  ?'linear-gradient(135deg,rgba(0,50,30,0.5),rgba(0,30,18,0.3))'
                  :'linear-gradient(135deg,rgba(50,0,20,0.5),rgba(30,0,12,0.3))',
                borderRadius:'10px',padding:'8px 10px',marginBottom:'6px',
                border:isWin?'1px solid rgba(0,255,136,0.25)':'1px solid rgba(255,55,100,0.25)',
                boxShadow:isWin?'0 2px 12px rgba(0,255,136,0.12)':'0 2px 12px rgba(255,55,100,0.12)',
              }}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{
                    color:t.side==='LONG'?'#4f8':'#f64',fontWeight:800,
                    textShadow:t.side==='LONG'?'0 0 6px rgba(0,255,136,0.6)':'0 0 6px rgba(255,55,100,0.6)',
                  }}>{t.side==='LONG'?'▲ לונג':'▼ שורט'} {t.sym}</span>
                  <span style={{
                    color:isWin?'#4f8':'#f64',fontWeight:800,
                    textShadow:isWin?'0 0 8px rgba(0,255,136,0.7)':'0 0 8px rgba(255,55,100,0.7)',
                  }}>{pnl>=0?'+':''}{pnl.toFixed(2)} ({pct.toFixed(1)}%)</span>
                </div>
                {/* Progress bar toward TP */}
                <div style={{
                  height:'3px',borderRadius:'2px',margin:'5px 0',
                  background:'rgba(255,255,255,0.06)',overflow:'hidden',
                }}>
                  <div style={{
                    height:'100%',width:`${progress}%`,
                    background:isWin
                      ?'linear-gradient(90deg,rgba(0,255,136,0.5),#00ff88)'
                      :'linear-gradient(90deg,rgba(255,55,100,0.5),#ff3764)',
                    boxShadow:isWin?'0 0 6px rgba(0,255,136,0.9)':'0 0 6px rgba(255,55,100,0.9)',
                    transition:'width 0.5s ease',
                  }}/>
                </div>
                <div style={{fontSize:'10px',color:'rgba(0,180,255,0.45)',display:'flex',justifyContent:'space-between'}}>
                  <span>כניסה: {fmtP(t.entry)}</span>
                  <span>Trail: {fmtP(t.trailSL)}</span>
                  <span style={{color:'rgba(255,200,0,0.5)'}}>TP: {fmtP(t.entry+tpDist)}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── TABS ── */}
      <div style={S.panel}>
        <div style={{display:'flex',gap:'5px',marginBottom:'10px',flexWrap:'wrap' as const}}>
          {TABS.map(([t,label])=>(
            <button key={t} className="coin-btn" style={S.btn('#4af',tab===t)} onClick={()=>setTab(t)}>{label}</button>
          ))}
          <span style={{marginRight:'auto',color:'rgba(0,180,255,0.4)',fontSize:'11px',alignSelf:'center'}}>
            {closed.length} סגורות | {wins}✓ {closed.length-wins}✗
          </span>
        </div>

        {/* SCANNER */}
        {tab==='scanner'&&(
          <div style={{overflowX:'auto'}}>
            <table style={S.tbl}>
              <thead>
                <tr>{['מטבע','מחיר','24ש%','ציון','5D','RSI','ADX','נפח','איתות'].map(h=>(
                  <th key={h} style={S.th}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {COINS.map(c=>{
                  const info=prices[c.sym]; const s=allSigs[c.sym]
                  if(!info) return null
                  const isBuy=s?.dir==='BUY', isSell=s?.dir==='SELL'
                  return (
                    <tr key={c.sym}
                      className={isBuy?'tr-buy':isSell?'tr-sell':'tr-hover'}
                      style={{
                        cursor:'pointer',
                        background:isBuy?'rgba(0,255,136,0.04)':isSell?'rgba(255,55,100,0.04)':'transparent',
                      }}
                      onClick={()=>setSelected(c.sym)}>
                      <td style={S.td('#00ccff')}>
                        <strong style={{textShadow:'0 0 6px rgba(0,200,255,0.5)'}}>{c.sym}</strong>
                      </td>
                      <td style={S.td()}>{fmtP(info.price)}</td>
                      <td style={S.td(info.change>0?'#4f8':info.change<0?'#f64':'#888')}>
                        {info.change>=0?'+':''}{info.change.toFixed(2)}%
                      </td>
                      <td style={S.td(s?.dir!=='HOLD'?'#4af':'#334')}>{s?.score||0}/5</td>
                      <td style={S.td(s?.mtf?'#4f8':'#334')}>{s?.mtf?'✓':'—'}</td>
                      <td style={S.td(s?.rsi>70?'#f64':s?.rsi<30?'#4f8':'#fa4')}>{s?.rsi.toFixed(0)||'—'}</td>
                      <td style={S.td(s?.adx>25?'#4f8':s?.adx>18?'#fa4':'#f64')}>{s?.adx.toFixed(0)||'—'}</td>
                      <td style={S.td(s?.volOk?'#4f8':'#f64')}>{s?.volOk?'✓':'✗'}</td>
                      <td style={S.td(isBuy?'#4f8':isSell?'#f64':'#334')}>
                        <strong>{isBuy?'▲ קנייה':isSell?'▼ מכירה':'—'}</strong>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* HISTORY */}
        {tab==='history'&&(
          closed.length===0
            ?<div style={{color:'rgba(0,180,255,0.2)',textAlign:'center' as const,padding:'20px',fontSize:'12px',
              border:'1px dashed rgba(0,180,255,0.1)',borderRadius:'10px'}}>
              אין עסקאות סגורות עדיין — הבוט עוקב אחרי השוק
            </div>
            :<div style={{overflowX:'auto'}}>
              <table style={S.tbl}>
                <thead><tr>{['מטבע','כיוון','כניסה','יציאה','ר/ה','%','עמלה','סטטוס','שעה'].map(h=>(
                  <th key={h} style={S.th}>{h}</th>
                ))}</tr></thead>
                <tbody>
                  {[...closed].reverse().slice(0,20).map(t=>(
                    <tr key={t.id} className="tr-hover">
                      <td style={S.td('#00ccff')}>{t.sym}</td>
                      <td style={S.td(t.side==='LONG'?'#4f8':'#f64')}>{t.side==='LONG'?'▲':'▼'} {t.side==='LONG'?'לונג':'שורט'}</td>
                      <td style={S.td()}>{fmtP(t.entry)}</td>
                      <td style={S.td()}>{t.exit?fmtP(t.exit):'—'}</td>
                      <td style={S.td((t.pnl||0)>=0?'#4f8':'#f64')}>
                        <strong>{(t.pnl||0)>=0?'+':''}{(t.pnl||0).toFixed(2)}</strong>
                      </td>
                      <td style={S.td((t.pnlPct||0)>=0?'#4f8':'#f64')}>{((t.pnlPct||0)*100).toFixed(2)}%</td>
                      <td style={S.td('rgba(255,165,0,0.7)')}>${t.fee.toFixed(2)}</td>
                      <td style={S.td(t.status==='TP'?'#4f8':t.status==='SL'?'#f64':'#fa4')}>
                        {t.status==='TP'?'✓ TP':t.status==='SL'?'✗ SL':'⟳ Trail'}
                      </td>
                      <td style={S.td('rgba(0,180,255,0.35)')}>{new Date(t.ts).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        )}

        {/* STATS */}
        {tab==='stats'&&(
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'8px'}}>
            {([
              ['אחוז ניצחון',winRate.toFixed(1)+'%',winRate>55?'#4f8':winRate>45?'#fa4':'#f64'],
              ['מדד שארפ',sharpe.toFixed(2),sharpe>1?'#4f8':sharpe>0?'#fa4':'#f64'],
              ['ירידה מקסימלית',maxDD.toFixed(1)+'%',maxDD<10?'#4f8':maxDD<25?'#fa4':'#f64'],
              ['רווח/הפסד סה"כ',(totalPnl>=0?'+':'')+totalPnl.toFixed(2),totalPnl>=0?'#4f8':'#f64'],
              ['סה"כ עסקאות',trades.length.toString(),'#4af'],
              ['יתרה','$'+balance.toFixed(0),balance>=INIT_BAL?'#4f8':'#f64'],
              ['פוזיציות פתוחות',openTrades.length.toString(),'#fa4'],
              ['סה"כ עמלות','$'+totalFees.toFixed(2),'rgba(255,165,0,0.8)'],
              ['ממוצע ניצחון',wins>0?'+'+(closed.filter(t=>(t.pnl||0)>0).reduce((a,t)=>a+(t.pnl||0),0)/wins).toFixed(2):'—','#4f8'],
            ] as [string,string,string][]).map(([label,value,color])=>(
              <div key={label} className="stat-card" style={{
                background:'linear-gradient(135deg,rgba(6,16,38,0.85),rgba(3,8,22,0.7))',
                borderRadius:'10px',padding:'12px',textAlign:'center' as const,
                border:'1px solid rgba(0,180,255,0.12)',
                borderTop:'1.5px solid rgba(0,180,255,0.25)',
                boxShadow:'0 4px 18px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.04)',
              }}>
                <div style={{color:'rgba(0,180,255,0.45)',fontSize:'10px',marginBottom:'5px',letterSpacing:'0.3px'}}>{label}</div>
                <div style={{
                  color,fontWeight:900,fontSize:'16px',
                  textShadow:`0 0 12px ${color}88, 0 0 30px ${color}33`,
                }}>{value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── FOOTER ── */}
      <div style={{
        textAlign:'center' as const,
        color:'rgba(0,180,255,0.2)',
        fontSize:'10px',marginTop:'10px',
        letterSpacing:'0.5px',
      }}>
        {supaLive
          ?'☁ שרת 24/7 פעיל · מחירים אמיתיים מ-Binance · ✓ Supabase'
          :'מסחר וירטואלי · מחירים אמיתיים מ-Binance בזמן אמת'
        }
      </div>
    </div>
  )
}

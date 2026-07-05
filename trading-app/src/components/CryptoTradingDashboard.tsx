import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react'
import { createClient } from '@supabase/supabase-js'

const SUPA_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://mdvheizhciuvqychtwxr.supabase.co'
const SUPA_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kdmhlaXpoY2l1dnF5Y2h0d3hyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwODc0NjQsImV4cCI6MjA5ODY2MzQ2NH0.JHJ0lCVhSfH3XA92Iyb-TKdx7vd-C2sZzdRwNVutMzI'

type RiskType = 'low'|'medium'|'high'
type TabType  = 'scanner'|'history'|'stats'|'ai'|'regime'
type Regime   = 'TREND_UP'|'TREND_DOWN'|'RANGING'|'VOLATILE'

interface Bar { time:number; open:number; high:number; low:number; close:number; vol:number }
interface Trade {
  id:number; sym:string; side:'LONG'|'SHORT'
  entry:number; exit?:number; size:number
  pnl?:number; pnlPct?:number; ts:number
  status:'OPEN'|'TP'|'SL'|'TRAIL'
  hi:number; lo:number; trailSL:number; fee:number
  slPct?:number; tpPct?:number
  partialDone?:boolean; closedTs?:number
}
interface Sig {
  dir:'BUY'|'SELL'|'HOLD'; score:number; f:boolean[]
  rsi:number; adx:number; volOk:boolean; mtf:boolean
  bb:{upper:number;mid:number;lower:number}
}
interface PriceInfo { price:number; change:number }
interface OptimizerRun {
  id:number; created_at:string; trade_count:number
  overall_wr:number; overall_pf:number
  params_before:Record<string,unknown>; params_after:Record<string,unknown>; reasoning:string
}
interface RegimeRow {
  id:number; created_at:string; regime:string; confidence:number
  btc_adx:number; btc_atr_pct:number; notes:string
}

// ─── palette ─────────────────────────────────────────────────────────────────
const C = {
  bg:     '#03040d',
  panel:  'rgba(8,12,30,0.85)',
  panel2: 'rgba(12,18,40,0.9)',
  pink:   '#ff2070',
  green:  '#00e87a',
  red:    '#ff3350',
  yellow: '#ffb700',
  blue:   '#3ab8ff',
  purple: '#9b5de5',
  teal:   '#00d9a3',
  dim:    'rgba(255,255,255,0.06)',
  muted:  '#4a6080',
  text:   '#c8d8f0',
  bright: '#eef4ff',
  border: 'rgba(255,32,112,0.35)',
  glow:   '0 4px 24px rgba(255,32,112,0.12), 0 1px 4px rgba(0,0,0,0.6)',
  glowB:  '0 4px 24px rgba(58,184,255,0.15), 0 1px 4px rgba(0,0,0,0.6)',
  glowG:  '0 4px 24px rgba(0,232,122,0.15), 0 1px 4px rgba(0,0,0,0.6)',
}

const glass = {
  background:  C.panel,
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: `1px solid ${C.border}`,
  borderRadius: '12px',
  boxShadow: C.glow,
} as CSSProperties

const COINS = [
  {sym:'BTC',ws:'btcusdt'},{sym:'ETH',ws:'ethusdt'},{sym:'SOL',ws:'solusdt'},
  {sym:'BNB',ws:'bnbusdt'},{sym:'XRP',ws:'xrpusdt'},{sym:'ADA',ws:'adausdt'},
  {sym:'DOGE',ws:'dogeusdt'},{sym:'AVAX',ws:'avaxusdt'},{sym:'LINK',ws:'linkusdt'},
  {sym:'DOT',ws:'dotusdt'},{sym:'POL',ws:'polusdt'},{sym:'UNI',ws:'uniusdt'},
  {sym:'ATOM',ws:'atomusdt'},{sym:'LTC',ws:'ltcusdt'},{sym:'BCH',ws:'bchusdt'},
  {sym:'NEAR',ws:'nearusdt'},{sym:'ALGO',ws:'algousdt'},{sym:'FIL',ws:'filusdt'},
  {sym:'VET',ws:'vetusdt'},{sym:'ICP',ws:'icpusdt'},
]

const REGIME_HE: Record<string,string> = {
  TREND_UP:   '📈 טרנד עולה',
  TREND_DOWN: '📉 טרנד יורד',
  RANGING:    '↔️ ריינג׳',
  VOLATILE:   '⚡ תנודתי',
}
const REGIME_COLOR: Record<string,string> = {
  TREND_UP: C.green, TREND_DOWN: C.red, RANGING: C.blue, VOLATILE: C.yellow,
}

const RISK_HE: Record<RiskType,string> = { low:'נמוך', medium:'בינוני', high:'גבוה' }
const RISK = {
  low:    { riskPct:0.006, sl:0.008, maxPos:5,  maxDayLoss:0.02 },
  medium: { riskPct:0.010, sl:0.010, maxPos:20, maxDayLoss:0.03 },
  high:   { riskPct:0.016, sl:0.013, maxPos:20, maxDayLoss:0.04 },
}
const MIN_SCORE=3, MIN_ADX=12, COOLDOWN_MS=60_000, STALE_MS=45*60_000, STALE_BAND=0.0015
const TP_MULT=2.4, PARTIAL_AT=1.2, MAX_NOTIONAL_PCT=0.15, CLOSE_COOLDOWN_MS=60_000, COIN_DISABLE_LOSSES=7
const INIT_BAL=10_000, MAX_BARS=600, BAR_MS=60_000, FEE_PCT=0.001

// ─── math ─────────────────────────────────────────────────────────────────────
function calcEma(src:number[],p:number):number[]{const k=2/(p+1);const out=[src[0]];for(let i=1;i<src.length;i++)out.push(src[i]*k+out[i-1]*(1-k));return out}
function calcRsi(src:number[],p=14):number{if(src.length<p+1)return 50;let g=0,l=0;for(let i=src.length-p;i<src.length;i++){const d=src[i]-src[i-1];if(d>0)g+=d;else l-=d}return 100-100/(1+(g/p)/((l/p)||1e-9))}
function calcMacd(src:number[]):number{if(src.length<26)return 0;const e12=calcEma(src,12),e26=calcEma(src,26);const ml=e12.map((v,i)=>v-e26[i]);const sig=calcEma(ml,9);const n=ml.length-1;return ml[n]-sig[n]}
function calcBB(src:number[],p=20,m=2):{upper:number;mid:number;lower:number}{const sl=src.length>=p?src.slice(-p):src;const mid=sl.reduce((a,b)=>a+b,0)/sl.length;const std=Math.sqrt(sl.reduce((a,b)=>a+(b-mid)**2,0)/sl.length);return{upper:mid+m*std,mid,lower:mid-m*std}}
function calcStochRsi(src:number[],p=14):{k:number;d:number}{if(src.length<p*2)return{k:50,d:50};const rsiArr:number[]=[];for(let i=p;i<src.length;i++)rsiArr.push(calcRsi(src.slice(0,i+1),p));if(rsiArr.length<p)return{k:50,d:50};const rec=rsiArr.slice(-p);const lo=Math.min(...rec),hi=Math.max(...rec);const k=hi===lo?50:((rsiArr[rsiArr.length-1]-lo)/(hi-lo))*100;const ks=rsiArr.slice(-3).map((_v,i2,a)=>{const sl2=rsiArr.slice(0,rsiArr.length-a.length+1+i2);const rr=sl2.slice(-p);const l2=Math.min(...rr),h2=Math.max(...rr);return h2===l2?50:((sl2[sl2.length-1]-l2)/(h2-l2))*100});return{k,d:ks.reduce((a,b)=>a+b,0)/ks.length}}
function calcAdx(bars:Bar[],p=14):number{if(bars.length<p+2)return 20;const sl=bars.slice(-(p+1));let trS=0,plusS=0,minS=0;for(let i=1;i<sl.length;i++){const c=sl[i],pv=sl[i-1];const tr=Math.max(c.high-c.low,Math.abs(c.high-pv.close),Math.abs(c.low-pv.close));const up=c.high-pv.high,dn=pv.low-c.low;trS+=tr;plusS+=(up>dn&&up>0)?up:0;minS+=(dn>up&&dn>0)?dn:0}if(!trS)return 20;const pDI=plusS/trS*100,mDI=minS/trS*100;return Math.abs(pDI-mDI)/((pDI+mDI)||1)*100}
function calcAtr(bars:Bar[],p=14):number{if(bars.length<2)return bars[0]?(bars[0].high-bars[0].low):1;const trs=bars.slice(-(p+1)).map((b,i,a)=>{if(i===0)return b.high-b.low;return Math.max(b.high-b.low,Math.abs(b.high-a[i-1].close),Math.abs(b.low-a[i-1].close))});return trs.reduce((a,b)=>a+b,0)/trs.length}
function buildNBars(bars1m:Bar[],n:number):Bar[]{const out:Bar[]=[];for(let i=0;i+n-1<bars1m.length;i+=n){const sl=bars1m.slice(i,i+n);out.push({time:sl[0].time,open:sl[0].open,high:Math.max(...sl.map(b=>b.high)),low:Math.min(...sl.map(b=>b.low)),close:sl[n-1].close,vol:sl.reduce((a,b)=>a+b.vol,0)})}return out}
function build5mBars(bars1m:Bar[]):Bar[]{return buildNBars(bars1m,5)}
function trend15m(bars1m:Bar[]):'UP'|'DOWN'|'NEUTRAL'{const b15=buildNBars(bars1m,15);if(b15.length<25)return 'NEUTRAL';const cl=b15.map(b=>b.close),n=cl.length-1;const e9=calcEma(cl,9),e21=calcEma(cl,21);return e9[n]>e21[n]?'UP':'DOWN'}
function isVolOk(bars:Bar[]):boolean{if(bars.length<20)return true;const avg=bars.slice(-20).reduce((a,b)=>a+b.vol,0)/20;return bars[bars.length-1].vol>=avg*1.0}
function getBtcBias(btcBars:Bar[]):'BULL'|'BEAR'|'NEUTRAL'{if(btcBars.length<20)return 'NEUTRAL';const cl=btcBars.map(b=>b.close);const rsi=calcRsi(cl,14);const e9=calcEma(cl,9),e21=calcEma(cl,21),n=cl.length-1;if(rsi>55&&e9[n]>e21[n])return 'BULL';if(rsi<45&&e9[n]<e21[n])return 'BEAR';return 'NEUTRAL'}
function emptySig():Sig{return{dir:'HOLD',score:0,f:[false,false,false,false,false],rsi:50,adx:20,volOk:true,mtf:false,bb:{upper:0,mid:0,lower:0}}}
function computeSig(bars:Bar[]):Sig{if(bars.length<35)return emptySig();const cl=bars.map(b=>b.close),n=cl.length-1;const e9=calcEma(cl,9),e21=calcEma(cl,21);const emaBull=e9[n]>e21[n];const rsi=calcRsi(cl,14);const rsiBull=rsi>52&&rsi<76,rsiBear=rsi<48&&rsi>24;const hist=calcMacd(cl);const macdBull=hist>0;const bb=calcBB(cl);const p=cl[n];const bbBull=p>bb.mid&&p<bb.upper,bbBear=p<bb.mid&&p>bb.lower;const{k,d}=calcStochRsi(cl);const stochBull=k>d&&k<80,stochBear=k<d&&k>20;const adx=calcAdx(bars);const vok=isVolOk(bars);const bF=[emaBull,rsiBull,macdBull,bbBull,stochBull];const sF=[!emaBull,rsiBear,!macdBull,bbBear,stochBear];const bS=bF.filter(Boolean).length,sS=sF.filter(Boolean).length;if(bS>=3)return{dir:'BUY',score:bS,f:bF,rsi,adx,volOk:vok,mtf:false,bb};if(sS>=3)return{dir:'SELL',score:sS,f:sF,rsi,adx,volOk:vok,mtf:false,bb};return{dir:'HOLD',score:Math.max(bS,sS),f:bF,rsi,adx,volOk:vok,mtf:false,bb}}
function getMultiTFSig(bars1m:Bar[]):Sig{const s1=computeSig(bars1m);const bars5m=build5mBars(bars1m);if(bars5m.length<25)return s1;const s5=computeSig(bars5m);if(s1.dir==='HOLD')return s1;if(s5.dir===s1.dir)return{...s1,score:Math.min(5,s1.score+1),mtf:true};return s1}
function calcSharpe(trades:Trade[]):number{const cl=trades.filter(t=>t.pnlPct!==undefined);if(cl.length<3)return 0;const r=cl.map(t=>t.pnlPct!);const m=r.reduce((a,b)=>a+b,0)/r.length;const s=Math.sqrt(r.reduce((a,b)=>a+(b-m)**2,0)/r.length)||1e-9;return(m/s)*Math.sqrt(252)}
function calcMaxDD(trades:Trade[]):number{let bal=INIT_BAL,peak=INIT_BAL,mx=0;for(const t of trades){if(t.pnl){bal+=t.pnl;if(bal>peak)peak=bal;mx=Math.max(mx,(peak-bal)/peak)}}return mx*100}
function mapDbTrade(t:Record<string,unknown>):Trade{return{id:t.id as number,sym:t.sym as string,side:t.side as 'LONG'|'SHORT',entry:Number(t.entry_price),exit:t.exit_price!=null?Number(t.exit_price):undefined,size:Number(t.size),pnl:t.pnl!=null?Number(t.pnl):undefined,pnlPct:t.pnl_pct!=null?Number(t.pnl_pct):undefined,ts:new Date(t.opened_at as string).getTime(),status:t.status as 'OPEN'|'TP'|'SL'|'TRAIL',hi:Number(t.hi),lo:Number(t.lo),trailSL:Number(t.trail_sl),fee:Number(t.fee)}}

// ─── canvas renderers ─────────────────────────────────────────────────────────
function drawCandles(canvas:HTMLCanvasElement,bars:Bar[],sig:Sig){
  const ctx=canvas.getContext('2d');if(!ctx||bars.length<3)return
  const W=canvas.width,H=canvas.height
  ctx.clearRect(0,0,W,H)
  const sl=bars.slice(-70)
  const lo=Math.min(...sl.map(b=>b.low))*0.9988
  const hi=Math.max(...sl.map(b=>b.high))*1.0012
  const toY=(v:number)=>H-2-((v-lo)/(hi-lo))*(H-4)
  const cw=(W-4)/sl.length
  ctx.strokeStyle='rgba(255,32,112,0.06)';ctx.lineWidth=0.5
  for(let i=1;i<5;i++){ctx.beginPath();ctx.moveTo(0,H*i/5);ctx.lineTo(W,H*i/5);ctx.stroke()}
  const cl=sl.map(b=>b.close)
  const e9=calcEma(cl,9),e21=calcEma(cl,21)
  ctx.beginPath();e9.forEach((v,i)=>{i===0?ctx.moveTo(i*cw+cw/2+2,toY(v)):ctx.lineTo(i*cw+cw/2+2,toY(v))})
  ctx.strokeStyle='rgba(255,183,0,0.6)';ctx.lineWidth=1.5;ctx.stroke()
  ctx.beginPath();e21.forEach((v,i)=>{i===0?ctx.moveTo(i*cw+cw/2+2,toY(v)):ctx.lineTo(i*cw+cw/2+2,toY(v))})
  ctx.strokeStyle='rgba(255,32,112,0.6)';ctx.lineWidth=1.5;ctx.stroke()
  const bbArr=cl.map((_,i)=>calcBB(cl.slice(0,i+1)))
  ctx.beginPath();bbArr.forEach((bb,i)=>{i===0?ctx.moveTo(i*cw+cw/2+2,toY(bb.upper)):ctx.lineTo(i*cw+cw/2+2,toY(bb.upper))})
  for(let i=bbArr.length-1;i>=0;i--)ctx.lineTo(i*cw+cw/2+2,toY(bbArr[i].lower))
  ctx.closePath();ctx.fillStyle='rgba(58,184,255,0.06)';ctx.fill()
  sl.forEach((b,i)=>{
    const x=i*cw+2;const isUp=b.close>=b.open;const col=isUp?C.green:C.red
    ctx.strokeStyle=col;ctx.lineWidth=0.8
    ctx.beginPath();ctx.moveTo(x+cw/2,toY(b.high));ctx.lineTo(x+cw/2,toY(b.low));ctx.stroke()
    const bTop=toY(Math.max(b.open,b.close));const bBot=toY(Math.min(b.open,b.close))
    ctx.fillStyle=isUp?'rgba(0,232,122,0.85)':'rgba(255,51,80,0.85)'
    ctx.fillRect(x+1,bTop,Math.max(1,cw-2),Math.max(1,bBot-bTop))
  })
  const lp=sl[sl.length-1].close
  ctx.fillStyle='rgba(3,4,13,0.85)';ctx.fillRect(2,toY(lp)-13,70,14)
  ctx.fillStyle=C.green;ctx.font='bold 10px monospace'
  ctx.fillText(lp>=100?lp.toFixed(2):lp.toFixed(5),4,toY(lp)-1)
  ctx.beginPath();ctx.arc(W-10,10,7,0,Math.PI*2)
  ctx.fillStyle=sig.dir==='BUY'?C.green:sig.dir==='SELL'?C.red:C.muted;ctx.fill()
  if(sig.dir!=='HOLD'){ctx.shadowColor=sig.dir==='BUY'?C.green:C.red;ctx.shadowBlur=10;ctx.stroke();ctx.shadowBlur=0}
}

function drawEquity(canvas:HTMLCanvasElement,trades:Trade[]){
  const ctx=canvas.getContext('2d');if(!ctx)return
  const W=canvas.width,H=canvas.height
  ctx.clearRect(0,0,W,H)
  const pts=[INIT_BAL];let bal=INIT_BAL
  for(const t of trades){if(t.pnl!==undefined){bal+=t.pnl;pts.push(bal)}}
  if(pts.length<2){ctx.fillStyle='rgba(0,232,122,0.04)';ctx.fillRect(0,0,W,H);return}
  const lo=Math.min(...pts)*0.995,hi=Math.max(...pts)*1.005
  const toY=(v:number)=>H-1-((v-lo)/(hi-lo))*(H-2)
  const toX=(i:number)=>(i/(pts.length-1))*(W-1)
  ctx.beginPath();pts.forEach((v,i)=>{i===0?ctx.moveTo(toX(i),toY(v)):ctx.lineTo(toX(i),toY(v))})
  ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.closePath()
  const g=ctx.createLinearGradient(0,0,0,H)
  g.addColorStop(0,'rgba(0,232,122,0.35)');g.addColorStop(1,'rgba(0,232,122,0.01)')
  ctx.fillStyle=g;ctx.fill()
  ctx.beginPath();pts.forEach((v,i)=>{i===0?ctx.moveTo(toX(i),toY(v)):ctx.lineTo(toX(i),toY(v))})
  ctx.strokeStyle=C.green;ctx.lineWidth=2;ctx.stroke()
}

function drawBubbles(canvas:HTMLCanvasElement,allSigs:Record<string,Sig>,prices:Record<string,PriceInfo>){
  const ctx=canvas.getContext('2d');if(!ctx)return
  const W=canvas.width,H=canvas.height
  ctx.clearRect(0,0,W,H)
  const cols=5,rows=4,cw=W/cols,ch=H/rows
  COINS.forEach((coin,i)=>{
    const col=i%cols,row=Math.floor(i/cols)
    const cx=col*cw+cw/2,cy=row*ch+ch/2
    const s=allSigs[coin.sym];const chg=prices[coin.sym]?.change||0
    const r=Math.min(cw,ch)*0.38;const dir=s?.dir||'HOLD'
    const fill=dir==='BUY'?'rgba(0,232,122,0.18)':dir==='SELL'?'rgba(255,51,80,0.18)':'rgba(18,28,55,0.5)'
    const stroke=dir==='BUY'?C.green:dir==='SELL'?C.red:C.muted
    ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2)
    ctx.fillStyle=fill;ctx.fill()
    if(dir!=='HOLD'){ctx.shadowColor=stroke;ctx.shadowBlur=10}
    ctx.strokeStyle=stroke;ctx.lineWidth=dir==='HOLD'?0.5:1.5;ctx.stroke()
    ctx.shadowBlur=0
    ctx.fillStyle=dir==='BUY'?C.green:dir==='SELL'?C.red:C.muted
    ctx.font=`bold ${Math.max(8,r*0.44)}px monospace`;ctx.textAlign='center';ctx.textBaseline='middle'
    ctx.fillText(coin.sym,cx,cy-3)
    ctx.font=`${Math.max(7,r*0.3)}px monospace`
    ctx.fillStyle=chg>0?C.green:chg<0?C.red:C.muted
    ctx.fillText(`${chg>=0?'+':''}${chg.toFixed(1)}%`,cx,cy+r*0.55)
  })
  ctx.textAlign='start';ctx.textBaseline='alphabetic'
}

// ─── 3D card component ────────────────────────────────────────────────────────
function Card3D({children,style,color}:{children:React.ReactNode;style?:CSSProperties;color?:string}){
  const [tilt,setTilt]=useState({x:0,y:0})
  const ref=useRef<HTMLDivElement>(null)
  const onMove=(e:React.MouseEvent)=>{
    const el=ref.current;if(!el)return
    const r=el.getBoundingClientRect()
    const x=((e.clientX-r.left)/r.width-0.5)*12
    const y=-((e.clientY-r.top)/r.height-0.5)*8
    setTilt({x,y})
  }
  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={()=>setTilt({x:0,y:0})}
      style={{
        ...glass,
        transform:`perspective(600px) rotateX(${tilt.y}deg) rotateY(${tilt.x}deg) translateZ(2px)`,
        transition:'transform 0.15s ease',
        borderColor: color ? `${color}55` : C.border,
        boxShadow: color
          ? `0 8px 32px ${color}22, 0 2px 8px rgba(0,0,0,0.5), inset 0 1px 0 ${color}15`
          : C.glow,
        ...style,
      }}>
      {children}
    </div>
  )
}

// ─── stat tile ────────────────────────────────────────────────────────────────
function StatTile({label,value,color,big}:{label:string;value:string;color:string;big?:boolean}){
  return (
    <div style={{
      background:`linear-gradient(135deg, rgba(8,12,30,0.9) 0%, rgba(12,18,45,0.8) 100%)`,
      border:`1px solid ${color}33`,
      borderRadius:'10px',
      padding:'10px 12px',
      display:'flex',flexDirection:'column',gap:'3px',
      boxShadow:`0 4px 16px ${color}11, inset 0 1px 0 ${color}15`,
      position:'relative',overflow:'hidden',
    }}>
      <div style={{position:'absolute',top:0,right:0,width:'40px',height:'40px',
        background:`radial-gradient(circle at top right, ${color}18, transparent 70%)`}}/>
      <div style={{fontSize:'9px',color:C.muted,letterSpacing:'0.8px',fontWeight:600}}>{label}</div>
      <div style={{fontSize:big?'18px':'14px',fontWeight:900,color,letterSpacing:'-0.5px'}}>{value}</div>
    </div>
  )
}

// ─── component ────────────────────────────────────────────────────────────────
export default function CryptoTradingDashboard() {
  const [prices,setPrices]         = useState<Record<string,PriceInfo>>({})
  const [selected,setSelected]     = useState('BTC')
  const [risk,setRisk]             = useState<RiskType>('medium')
  const [balance,setBalance]       = useState(INIT_BAL)
  const [botOn,setBotOn]           = useState(true)
  const [trades,setTrades]         = useState<Trade[]>([])
  const [sig,setSig]               = useState<Sig>(emptySig())
  const [allSigs,setAllSigs]       = useState<Record<string,Sig>>({})
  const [tick,setTick]             = useState(0)
  const [wsStatus,setWsStatus]     = useState<'connecting'|'live'|'error'>('connecting')
  const [supaStatus,setSupaStatus] = useState<'off'|'connecting'|'live'|'error'>(SUPA_URL&&SUPA_KEY?'connecting':'off')
  const [tab,setTab]               = useState<TabType>('scanner')
  const [execLog,setExecLog]       = useState<string[]>([])
  const [serverPaperMode,setServerPaperMode] = useState(false)
  const [optimizerHistory,setOptimizerHistory] = useState<OptimizerRun[]>([])
  const [currentBotParams,setCurrentBotParams] = useState<Record<string,unknown>>({})
  const [lastOptimizedAt,setLastOptimizedAt] = useState<string|null>(null)
  const [marketRegime,setMarketRegime]  = useState<Regime>('RANGING')
  const [regimeConf,setRegimeConf]      = useState(0.5)
  const [regimeHistory,setRegimeHistory] = useState<RegimeRow[]>([])
  const [coinWeights,setCoinWeights]    = useState<Record<string,number>>({})
  const [rebalancedAt,setRebalancedAt]  = useState<string|null>(null)

  const barsMap    = useRef(new Map<string,Bar[]>())
  const curBar     = useRef(new Map<string,Bar>())
  const tradeRef   = useRef<Trade[]>([])
  const balRef     = useRef(INIT_BAL)
  const botRef     = useRef(true)
  const selRef     = useRef('BTC')
  const riskRef    = useRef<RiskType>('medium')
  const idRef      = useRef(1)
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const eqRef      = useRef<HTMLCanvasElement>(null)
  const bubRef     = useRef<HTMLCanvasElement>(null)
  const cooldown   = useRef<Record<string,number>>({})
  const allSigsRef = useRef<Record<string,Sig>>({})
  const sigTimer   = useRef(0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supaRef    = useRef<any>(null)
  const supaModeRef= useRef(!!SUPA_URL&&!!SUPA_KEY)
  const logRef     = useRef<string[]>([])
  const dayRef     = useRef<{date:string,start:number}>({date:'',start:INIT_BAL})

  tradeRef.current=trades; botRef.current=botOn
  selRef.current=selected; riskRef.current=risk; balRef.current=balance

  const addLog=useCallback((msg:string)=>{
    const entry=`${new Date().toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit',second:'2-digit'})} ${msg}`
    logRef.current=[entry,...logRef.current].slice(0,40)
    setExecLog([...logRef.current])
  },[])

  const openTrade=useCallback((sym:string,side:'LONG'|'SHORT',price:number,s:Sig)=>{
    if(supaModeRef.current)return
    const now=Date.now()
    if((cooldown.current[sym]||0)+COOLDOWN_MS>now)return
    if(s.score<MIN_SCORE||s.adx<MIN_ADX||!s.volOk)return
    const R=RISK[riskRef.current]
    const today=new Date().toISOString().slice(0,10)
    if(dayRef.current.date!==today)dayRef.current={date:today,start:balRef.current}
    if((dayRef.current.start-balRef.current)/dayRef.current.start>=R.maxDayLoss)return
    const closedForSym=tradeRef.current.filter(t=>t.sym===sym&&t.status!=='OPEN')
    const last10=closedForSym.slice(-10)
    if(last10.length>=10&&last10.filter(t=>(t.pnl||0)<0).length>=COIN_DISABLE_LOSSES)return
    const lastClosedTs=closedForSym.reduce((m,t)=>Math.max(m,t.closedTs||0),0)
    if(lastClosedTs+CLOSE_COOLDOWN_MS>now)return
    const btcBars=barsMap.current.get('BTC')||[]
    const bias=getBtcBias(btcBars)
    if(sym!=='BTC'&&side==='LONG'&&bias==='BEAR')return
    if(sym!=='BTC'&&side==='SHORT'&&bias==='BULL')return
    const bars=barsMap.current.get(sym)||[]
    const t15=trend15m(bars)
    if(side==='LONG'&&t15==='DOWN')return
    if(side==='SHORT'&&t15==='UP')return
    const openCount=tradeRef.current.filter(t=>t.status==='OPEN').length
    if(openCount>=R.maxPos)return
    const atrPct=calcAtr(bars)/price
    const slPct=Math.min(Math.max(atrPct*1.3,R.sl*0.6),R.sl*1.8)
    const tpPct=slPct*TP_MULT
    const riskAmt=balRef.current*R.riskPct
    let notional=riskAmt/slPct
    notional=Math.min(notional,balRef.current*MAX_NOTIONAL_PCT,balRef.current*0.95)
    if(notional<5)return
    const size=notional/price
    const fee=price*size*FEE_PCT
    const trailSL=side==='LONG'?price*(1-slPct):price*(1+slPct)
    const t:Trade={id:idRef.current++,sym,side,entry:price,size,ts:now,status:'OPEN',hi:price,lo:price,trailSL,fee,slPct,tpPct}
    cooldown.current[sym]=now
    const next=[...tradeRef.current,t];tradeRef.current=next;setTrades([...next])
    setBalance(b=>{const nb=b-notional-fee;balRef.current=nb;return nb})
    addLog(`▲ פתיחה ${sym} ${side} @ ${price>=100?price.toFixed(2):price.toFixed(5)} [${s.score}/5]`)
  },[addLog])

  const checkTrades=useCallback((sym:string,price:number)=>{
    if(supaModeRef.current)return
    const R=RISK[riskRef.current];let dirty=false;const now=Date.now()
    const partials:Trade[]=[]
    const updated=tradeRef.current.map(t=>{
      if(t.sym!==sym||t.status!=='OPEN')return t
      const nt={...t}
      const slPct=nt.slPct??R.sl,tpPct=nt.tpPct??R.sl*TP_MULT
      const dirM=nt.side==='LONG'?1:-1
      const fav=(price-nt.entry)/nt.entry*dirM
      if(price>nt.hi)nt.hi=price;if(price<nt.lo)nt.lo=price
      if(!nt.partialDone&&fav>=PARTIAL_AT*slPct){
        const half=nt.size/2;const raw=fav*nt.entry*half
        const exitFee=price*half*FEE_PCT;const halfEntryFee=nt.fee/2
        const pnl=raw-halfEntryFee-exitFee
        partials.push({id:idRef.current++,sym,side:nt.side,entry:nt.entry,exit:price,size:half,pnl,pnlPct:fav,ts:nt.ts,closedTs:now,status:'TP',hi:price,lo:price,trailSL:nt.trailSL,fee:halfEntryFee,partialDone:true,slPct,tpPct})
        nt.size=half;nt.fee=halfEntryFee;nt.partialDone=true
        const be=nt.entry*(1+dirM*2*FEE_PCT)
        if(dirM===1&&be>nt.trailSL)nt.trailSL=be
        if(dirM===-1&&be<nt.trailSL)nt.trailSL=be
        setBalance(b=>{const nb=b+nt.entry*half+pnl;balRef.current=nb;return nb})
        addLog(`◐ חלקי ${sym} @ ${price>=100?price.toFixed(2):price.toFixed(5)} +${pnl.toFixed(2)}`)
        dirty=true
      }
      if(nt.side==='LONG'){
        if(price>=nt.entry*(1+0.5*slPct)){const cand=price*(1-0.6*slPct);if(cand>nt.trailSL){nt.trailSL=cand;dirty=true}}
        if(price>=nt.entry*(1+slPct)){const be=nt.entry*(1+2*FEE_PCT);if(be>nt.trailSL){nt.trailSL=be;dirty=true}}
        const sl=Math.max(nt.trailSL,nt.entry*(1-slPct))
        if(price>=nt.entry*(1+tpPct)){nt.status='TP';nt.exit=price;dirty=true}
        else if(price<=sl){nt.status=price<=nt.entry*(1-slPct)?'SL':'TRAIL';nt.exit=price;dirty=true}
      } else {
        if(price<=nt.entry*(1-0.5*slPct)){const cand=price*(1+0.6*slPct);if(cand<nt.trailSL){nt.trailSL=cand;dirty=true}}
        if(price<=nt.entry*(1-slPct)){const be=nt.entry*(1-2*FEE_PCT);if(be<nt.trailSL){nt.trailSL=be;dirty=true}}
        const sl=Math.min(nt.trailSL,nt.entry*(1+slPct))
        if(price<=nt.entry*(1-tpPct)){nt.status='TP';nt.exit=price;dirty=true}
        else if(price>=sl){nt.status=price>=nt.entry*(1+slPct)?'SL':'TRAIL';nt.exit=price;dirty=true}
      }
      if(nt.status==='OPEN'&&now-nt.ts>STALE_MS){
        const uPct=(price-nt.entry)/nt.entry*(nt.side==='LONG'?1:-1)
        if(Math.abs(uPct)<STALE_BAND){nt.status='TRAIL';nt.exit=price;dirty=true}
      }
      if(nt.exit!==undefined&&nt.pnl===undefined){
        const raw=nt.side==='LONG'?(nt.exit-nt.entry)*nt.size:(nt.entry-nt.exit)*nt.size
        const exitFee=nt.exit*nt.size*FEE_PCT
        nt.pnl=raw-nt.fee-exitFee;nt.pnlPct=(nt.exit-nt.entry)/nt.entry*(nt.side==='LONG'?1:-1);nt.closedTs=now
        setBalance(b=>{const nb=b+nt.entry*nt.size+(nt.pnl as number);balRef.current=nb;return nb})
        addLog(`${nt.status==='TP'?'✓ TP':'✗ '+nt.status} ${sym} P&L: ${(nt.pnl>=0?'+':'')}${nt.pnl.toFixed(2)}`)
        dirty=true
      }
      return nt
    })
    if(dirty){const next=[...updated,...partials];tradeRef.current=next;setTrades(next)}
  },[addLog])

  const processTick=useCallback((sym:string,price:number,vol:number)=>{
    const now=Date.now(),barStart=Math.floor(now/BAR_MS)*BAR_MS
    let cb=curBar.current.get(sym)
    if(!cb||cb.time!==barStart){
      if(cb){const arr=barsMap.current.get(sym)||[];arr.push(cb);if(arr.length>MAX_BARS)arr.shift();barsMap.current.set(sym,arr)}
      cb={time:barStart,open:price,high:price,low:price,close:price,vol}
      curBar.current.set(sym,cb)
    } else {cb.close=price;if(price>cb.high)cb.high=price;if(price<cb.low)cb.low=price;cb.vol+=vol}
    checkTrades(sym,price)
    const bars=[...(barsMap.current.get(sym)||[]),cb]
    const s=getMultiTFSig(bars)
    allSigsRef.current[sym]=s
    const isSel=sym===selRef.current
    if(isSel){setSig(s);setTick(n=>n+1)}
    if(botRef.current&&s.dir!=='HOLD'&&!supaModeRef.current){
      const openForSym=tradeRef.current.filter(t=>t.sym===sym&&t.status==='OPEN')
      if(openForSym.length===0)openTrade(sym,s.dir==='BUY'?'LONG':'SHORT',price,s)
    }
    const elapsed=now-sigTimer.current
    if(elapsed>500||isSel){sigTimer.current=now;setAllSigs({...allSigsRef.current})}
  },[checkTrades,openTrade])

  useEffect(()=>{
    const load=async()=>{
      for(const coin of COINS){
        try{
          const res=await fetch(`https://api.binance.com/api/v3/klines?symbol=${coin.sym}USDT&interval=5m&limit=300`)
          if(!res.ok)continue
          const data:number[][]=await res.json()
          const bars:Bar[]=data.map(k=>({time:k[0] as number,open:+k[1],high:+k[2],low:+k[3],close:+k[4],vol:+k[5]}))
          barsMap.current.set(coin.sym,bars.slice(0,-1))
          const s=getMultiTFSig(bars);allSigsRef.current[coin.sym]=s
          if(coin.sym===selRef.current)setSig(s)
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
      if(dead)return
      setWsStatus('connecting')
      const streams=COINS.map(c=>c.ws+'@miniTicker').join('/')
      const ws=new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`)
      ws.onopen=()=>setWsStatus('live')
      ws.onerror=()=>setWsStatus('error')
      ws.onclose=()=>{if(!dead){setWsStatus('error');setTimeout(connect,3000)}}
      ws.onmessage=(e)=>{
        try{
          const msg=JSON.parse(e.data);const d=msg.data||msg
          const wsName=(d.s||'').toLowerCase()
          const coin=COINS.find(c=>c.ws===wsName);if(!coin)return
          const price=parseFloat(d.c),open24=parseFloat(d.o)
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
    if(!SUPA_URL||!SUPA_KEY)return
    const supa=createClient(SUPA_URL,SUPA_KEY);supaRef.current=supa

    const loadData=()=>Promise.all([
      supa.from('bot_state').select('*').eq('id',1).single(),
      supa.from('bot_trades').select('*').eq('status','OPEN'),
      supa.from('bot_trades').select('*').neq('status','OPEN').order('opened_at',{ascending:false}).limit(150),
      supa.from('bot_params_history').select('*').order('created_at',{ascending:false}).limit(20),
      supa.from('market_regime').select('*').order('created_at',{ascending:false}).limit(20),
    ]).then(([state,open,closed,optHist,regHist])=>{
      if(state.data){
        const d=state.data
        setBalance(d.balance);balRef.current=d.balance
        setRisk(d.risk as RiskType);riskRef.current=d.risk as RiskType
        setBotOn(d.active);botRef.current=d.active
        setServerPaperMode(d.paper_mode||false)
        if(d.bot_params)setCurrentBotParams(d.bot_params as Record<string,unknown>)
        if(d.last_optimized_at)setLastOptimizedAt(d.last_optimized_at as string)
        if(d.market_regime)setMarketRegime(d.market_regime as Regime)
        if(d.regime_confidence)setRegimeConf(d.regime_confidence as number)
        if(d.coin_weights)setCoinWeights(d.coin_weights as Record<string,number>)
        if(d.rebalanced_at)setRebalancedAt(d.rebalanced_at as string)
      }
      const all=[...(open.data||[]),...(closed.data||[])]
      tradeRef.current=all.map(t=>mapDbTrade(t as Record<string,unknown>))
      setTrades([...tradeRef.current])
      if(optHist.data)setOptimizerHistory(optHist.data as OptimizerRun[])
      if(regHist.data)setRegimeHistory(regHist.data as RegimeRow[])
    })

    loadData()
    const syncPoll=setInterval(loadData,30_000)
    let ch=supa.channel('bot-realtime')
    let retryTimeout:ReturnType<typeof setTimeout>|null=null
    const subscribe=()=>{
      ch=supa.channel('bot-realtime-'+Date.now())
        .on('postgres_changes',{event:'INSERT',schema:'public',table:'bot_trades'},(p)=>{
          const t=mapDbTrade(p.new as Record<string,unknown>)
          setTrades(prev=>{const next=[...prev,t];tradeRef.current=next;return next})
          addLog(`▲ פתיחה ${t.sym} ${t.side} @ ${t.entry>=100?t.entry.toFixed(2):t.entry.toFixed(5)}`)
        })
        .on('postgres_changes',{event:'UPDATE',schema:'public',table:'bot_trades'},(p)=>{
          const t=mapDbTrade(p.new as Record<string,unknown>)
          setTrades(prev=>{const next=prev.map(x=>x.id===t.id?t:x);tradeRef.current=next;return next})
          if(t.status!=='OPEN')addLog(`${t.status==='TP'?'✓ TP':'✗ '+t.status} ${t.sym} P&L: ${(t.pnl||0)>=0?'+':''}${(t.pnl||0).toFixed(2)}`)
        })
        .on('postgres_changes',{event:'UPDATE',schema:'public',table:'bot_state'},(p)=>{
          const d=p.new as {balance:number;risk:string;active:boolean;paper_mode?:boolean;bot_params?:Record<string,unknown>;last_optimized_at?:string;market_regime?:string;regime_confidence?:number;coin_weights?:Record<string,number>;rebalanced_at?:string}
          setBalance(d.balance);balRef.current=d.balance
          setRisk(d.risk as RiskType);riskRef.current=d.risk as RiskType
          setBotOn(d.active);botRef.current=d.active
          if(d.paper_mode!=null)setServerPaperMode(d.paper_mode)
          if(d.bot_params)setCurrentBotParams(d.bot_params)
          if(d.last_optimized_at)setLastOptimizedAt(d.last_optimized_at)
          if(d.market_regime)setMarketRegime(d.market_regime as Regime)
          if(d.regime_confidence)setRegimeConf(d.regime_confidence)
          if(d.coin_weights)setCoinWeights(d.coin_weights)
          if(d.rebalanced_at)setRebalancedAt(d.rebalanced_at)
        })
        .on('postgres_changes',{event:'INSERT',schema:'public',table:'bot_params_history'},(p)=>{
          setOptimizerHistory(prev=>[p.new as OptimizerRun,...prev].slice(0,20))
        })
        .on('postgres_changes',{event:'INSERT',schema:'public',table:'market_regime'},(p)=>{
          setRegimeHistory(prev=>[p.new as RegimeRow,...prev].slice(0,20))
          setMarketRegime((p.new as RegimeRow).regime as Regime)
          setRegimeConf((p.new as RegimeRow).confidence)
        })
        .subscribe((status)=>{
          if(status==='SUBSCRIBED'){setSupaStatus('live');supaModeRef.current=true}
          else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){
            setSupaStatus('error')
            if(!SUPA_URL||!SUPA_KEY)supaModeRef.current=false
            retryTimeout=setTimeout(()=>{supa.removeChannel(ch);subscribe()},10_000)
          }
        })
    }
    subscribe()
    const funcUrl=`${SUPA_URL}/functions/v1/22a4b470-a2bc-4ed8-afe8-6b403cc46d66`
    ;(window as unknown as Record<string,unknown>).__botFuncUrl=funcUrl
    const poll=setInterval(async()=>{
      if(!botRef.current)return
      try{
        const r=await fetch(funcUrl,{headers:{'Authorization':`Bearer ${SUPA_KEY}`}})
        const d=await r.json()
        if(d.log?.length)addLog(`⚡ ${d.log.filter((l:string)=>l.startsWith('OPEN')||l.startsWith('CLOSE')||l.startsWith('PARTIAL')).join(' | ')||'סריקה בוצעה'}`)
      }catch{}
    },60_000)
    return ()=>{clearInterval(poll);clearInterval(syncPoll);if(retryTimeout)clearTimeout(retryTimeout);supa.removeChannel(ch)}
  },[addLog])

  useEffect(()=>{
    if(!canvasRef.current)return
    const bars=[...(barsMap.current.get(selected)||[])]
    const cb=curBar.current.get(selected);if(cb)bars.push(cb)
    if(bars.length>0)drawCandles(canvasRef.current,bars,sig)
  },[tick,selected,sig])
  useEffect(()=>{if(eqRef.current)drawEquity(eqRef.current,trades)},[trades])
  useEffect(()=>{if(bubRef.current)drawBubbles(bubRef.current,allSigs,prices)},[allSigs,prices])

  const handleBotToggle=()=>{
    const next=!botOn;setBotOn(next);botRef.current=next
    supaRef.current?.from('bot_state').update({active:next,updated_at:new Date().toISOString()}).eq('id',1)
    addLog(next?'🤖 בוט הופעל':'🤖 בוט כובה')
  }
  const handleRiskChange=(r:RiskType)=>{
    setRisk(r);riskRef.current=r
    supaRef.current?.from('bot_state').update({risk:r,updated_at:new Date().toISOString()}).eq('id',1)
  }

  const openTrades  = trades.filter(t=>t.status==='OPEN')
  const closed      = trades.filter(t=>t.status!=='OPEN')
  const wins        = closed.filter(t=>(t.pnl||0)>0).length
  const winRate     = closed.length>0?(wins/closed.length*100):0
  const realizedPnl = closed.reduce((a,t)=>a+(t.pnl||0),0)
  const unrealizedPnl = openTrades.reduce((a,t)=>{
    const cur=prices[t.sym]?.price||t.entry
    return a+(t.side==='LONG'?(cur-t.entry):(t.entry-cur))*t.size-t.fee
  },0)
  const totalPnl       = realizedPnl+unrealizedPnl
  const lockedNotional = openTrades.reduce((a,t)=>a+t.entry*t.size,0)
  const totalValue     = balance+lockedNotional
  const sharpe         = calcSharpe(trades)
  const maxDD          = calcMaxDD(trades)
  const selInfo        = prices[selected]
  const R              = RISK[risk]
  const supaLive       = supaStatus==='live'
  const fmtP           = (p:number)=>p>=1000?p.toFixed(2):p>=1?p.toFixed(4):p.toFixed(6)
  const M:CSSProperties= {fontFamily:"'Courier New',monospace",userSelect:'none' as const,direction:'rtl'}

  const regColor = REGIME_COLOR[marketRegime] || C.blue

  return (
    <div style={{...M,background:`radial-gradient(ellipse at top, #0a0618 0%, #03040d 60%)`,minHeight:'100vh',color:C.text,padding:'8px',fontSize:'11px',overflowX:'hidden'}}>

      {/* ══ HEADER ══ */}
      <div style={{...glass,padding:'10px 14px',marginBottom:'8px',display:'flex',flexWrap:'wrap' as const,gap:'8px',alignItems:'center',background:'rgba(6,8,22,0.9)'}}>

        {/* Title */}
        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
          <span style={{fontSize:'16px',fontWeight:900,color:C.pink,letterSpacing:'1px',textShadow:`0 0 20px ${C.pink}66`}}>
            ⚡ בוט קריפטו PRO
          </span>
          <span style={{fontSize:'8px',color:C.muted,padding:'2px 5px',border:`1px solid ${C.dim}`,borderRadius:'3px'}}>v21</span>
        </div>

        {/* Status chips */}
        <div style={{display:'flex',gap:'5px',flexWrap:'wrap' as const}}>
          <span style={{padding:'3px 8px',borderRadius:'6px',fontSize:'9px',fontWeight:700,
            background:wsStatus==='live'?'rgba(0,232,122,0.12)':'rgba(255,51,80,0.12)',
            color:wsStatus==='live'?C.green:C.red,border:`1px solid ${wsStatus==='live'?C.green+'44':C.red+'44'}`}}>
            ● {wsStatus==='live'?'חי':'...'}
          </span>
          {supaStatus!=='off'&&(
            <span style={{padding:'3px 8px',borderRadius:'6px',fontSize:'9px',fontWeight:700,
              background:supaLive?'rgba(58,184,255,0.12)':'rgba(255,183,0,0.12)',
              color:supaLive?C.blue:C.yellow,border:`1px solid ${supaLive?C.blue+'44':C.yellow+'44'}`}}>
              ☁ {supaLive?'ענן 24/7':'מתחבר'}
            </span>
          )}
          {/* Market regime chip */}
          <span style={{padding:'3px 10px',borderRadius:'6px',fontSize:'9px',fontWeight:700,
            background:`${regColor}18`,color:regColor,border:`1px solid ${regColor}44`,
            boxShadow:`0 0 10px ${regColor}22`}}>
            {REGIME_HE[marketRegime]||marketRegime} {(regimeConf*100).toFixed(0)}%
          </span>
          <span style={{padding:'3px 8px',borderRadius:'6px',fontSize:'9px',fontWeight:700,
            background:serverPaperMode?'rgba(0,217,163,0.12)':'rgba(255,51,80,0.12)',
            color:serverPaperMode?C.teal:C.red,border:`1px solid ${serverPaperMode?C.teal+'44':C.red+'44'}`,
            cursor:'pointer'}}
            onClick={()=>{
              const next=!serverPaperMode;setServerPaperMode(next)
              supaRef.current?.from('bot_state').update({paper_mode:next}).eq('id',1)
            }}>
            {serverPaperMode?'📋 נייר':'💵 אמיתי'}
          </span>
        </div>

        {/* Balance */}
        <div style={{display:'flex',gap:'12px',alignItems:'baseline',marginRight:'auto'}}>
          <span style={{fontWeight:900,fontSize:'20px',color:C.bright,textShadow:`0 0 30px rgba(255,255,255,0.2)`}}>
            ${totalValue.toFixed(0)}
          </span>
          <span style={{fontSize:'11px',color:totalPnl>=0?C.green:C.red,fontWeight:700}}>
            {totalPnl>=0?'+':''}{totalPnl.toFixed(2)}
          </span>
          <span style={{fontSize:'10px',color:C.muted}}>
            WIN <strong style={{color:winRate>50?C.green:C.red}}>{winRate.toFixed(0)}%</strong>
            {' · '}שארפ <strong style={{color:sharpe>1?C.green:C.yellow}}>{sharpe.toFixed(2)}</strong>
            {' · '}DD <strong style={{color:maxDD>15?C.red:C.yellow}}>{maxDD.toFixed(1)}%</strong>
          </span>
        </div>

        {/* Controls */}
        <div style={{display:'flex',gap:'5px',flexWrap:'wrap' as const}}>
          {(['low','medium','high'] as const).map(r=>(
            <button key={r} onClick={()=>handleRiskChange(r)} style={{
              cursor:'pointer',border:`1px solid ${risk===r?C.pink:C.dim}`,borderRadius:'6px',
              padding:'4px 10px',fontSize:'10px',fontWeight:700,
              background:risk===r?'rgba(255,32,112,0.18)':'rgba(255,255,255,0.03)',
              color:risk===r?C.pink:C.muted,
              boxShadow:risk===r?`0 0 12px ${C.pink}33`:undefined,
              transition:'all 0.2s',
            }}>{RISK_HE[r]}</button>
          ))}
          <button onClick={handleBotToggle} style={{
            cursor:'pointer',border:`1px solid ${botOn?C.green:C.muted}`,borderRadius:'6px',
            padding:'4px 12px',fontSize:'10px',fontWeight:700,
            background:botOn?'rgba(0,232,122,0.15)':'rgba(255,255,255,0.03)',
            color:botOn?C.green:C.muted,
            boxShadow:botOn?`0 0 12px ${C.green}33`:undefined,
          }}>{botOn?'🤖 פעיל':'🤖 כבוי'}</button>
        </div>
      </div>

      {/* ══ COIN STRIP ══ */}
      <div style={{display:'flex',gap:'4px',overflowX:'auto' as const,marginBottom:'8px',paddingBottom:'4px',scrollbarWidth:'none' as const}}>
        {COINS.map(c=>{
          const info=prices[c.sym];const chg=info?.change||0;const cs=allSigs[c.sym]
          const active=selected===c.sym;const wt=coinWeights[c.sym]
          return (
            <button key={c.sym} onClick={()=>setSelected(c.sym)} style={{
              cursor:'pointer',flexShrink:0,minWidth:'62px',padding:'5px 6px',borderRadius:'8px',
              textAlign:'center' as const,
              border:`1px solid ${active?C.pink:cs?.dir==='BUY'?'rgba(0,232,122,0.35)':cs?.dir==='SELL'?'rgba(255,51,80,0.35)':C.dim}`,
              background:active?'rgba(255,32,112,0.14)':'rgba(8,12,30,0.7)',
              backdropFilter:'blur(8px)',color:C.text,
              boxShadow:active?`0 0 16px ${C.pink}33, 0 2px 8px rgba(0,0,0,0.4)`:undefined,
              transition:'all 0.15s',
            }}>
              <div style={{fontWeight:800,fontSize:'10px',color:active?C.pink:C.text}}>{c.sym}</div>
              <div style={{fontSize:'8px',color:chg>0.5?C.green:chg<-0.5?C.red:C.muted}}>{chg>=0?'+':''}{chg.toFixed(1)}%</div>
              {wt&&<div style={{fontSize:'7px',color:wt>1?C.green:wt<0.8?C.red:C.muted}}>{wt.toFixed(1)}×</div>}
              {cs?.dir!=='HOLD'&&<div style={{fontSize:'8px',fontWeight:900,color:cs?.dir==='BUY'?C.green:C.red}}>{cs?.dir==='BUY'?'▲':'▼'}</div>}
            </button>
          )
        })}
      </div>

      {/* ══ MAIN GRID ══ */}
      <div style={{display:'grid',gridTemplateColumns:'150px 1fr',gap:'8px',marginBottom:'8px'}}>

        {/* STATS PANEL */}
        <div style={{display:'flex',flexDirection:'column' as const,gap:'5px'}}>
          {[
            ['יתרה כוללת','$'+totalValue.toFixed(0),totalValue>=INIT_BAL?C.green:C.red],
            ['פנוי','$'+balance.toFixed(0),C.yellow],
            ['בטחונות','$'+lockedNotional.toFixed(0),C.blue],
            ['רווח/הפסד',(totalPnl>=0?'+':'')+totalPnl.toFixed(2),totalPnl>=0?C.green:C.red],
            ['שיעור זכייה',winRate.toFixed(1)+'%',winRate>50?C.green:C.red],
            ['עסקאות',trades.length.toString(),C.blue],
            ['שארפ',sharpe.toFixed(2),sharpe>1?C.green:sharpe>0?C.yellow:C.red],
            ['מקס ירידה',maxDD.toFixed(1)+'%',maxDD<10?C.green:maxDD<25?C.yellow:C.red],
          ].map(([k,v,col])=>(
            <div key={k} style={{background:'rgba(8,12,30,0.8)',border:`1px solid ${C.dim}`,borderRadius:'8px',padding:'5px 8px',display:'flex',justifyContent:'space-between',backdropFilter:'blur(8px)'}}>
              <span style={{color:C.muted,fontSize:'9px'}}>{k}</span>
              <span style={{color:col as string,fontWeight:800,fontSize:'10px'}}>{v}</span>
            </div>
          ))}
          <div style={{background:'rgba(8,12,30,0.8)',border:`1px solid ${C.dim}`,borderRadius:'8px',padding:'6px 8px',fontSize:'9px',color:C.muted,backdropFilter:'blur(8px)'}}>
            <div>SL {(R.sl*100).toFixed(1)}% / TP {(R.sl*TP_MULT*100).toFixed(1)}%</div>
            <div style={{marginTop:'2px'}}>מקס {R.maxPos} פוזיציות</div>
          </div>
        </div>

        {/* CHART */}
        <Card3D style={{padding:'10px'}} color={sig.dir==='BUY'?C.green:sig.dir==='SELL'?C.red:undefined}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'6px'}}>
            <span style={{fontWeight:900,color:C.pink,fontSize:'13px',letterSpacing:'0.5px'}}>{selected}/USDT</span>
            <span style={{fontWeight:800,fontSize:'14px',color:selInfo?.change>0?C.green:C.red}}>
              {selInfo?fmtP(selInfo.price):'—'}
              <span style={{fontSize:'10px',marginRight:'5px'}}>{selInfo?`${selInfo.change>=0?'+':''}${selInfo.change.toFixed(2)}%`:''}</span>
            </span>
          </div>
          <canvas ref={canvasRef} width={600} height={155}
            style={{width:'100%',height:'155px',borderRadius:'6px',background:'rgba(2,3,10,0.8)',display:'block',border:`1px solid ${C.dim}`,marginBottom:'6px'}}/>
          <div style={{display:'flex',gap:'3px',flexWrap:'wrap' as const,marginBottom:'6px'}}>
            {['EMA','RSI','MACD','BB','StochRSI'].map((lbl,i)=>(
              <span key={lbl} style={{padding:'2px 6px',borderRadius:'4px',fontSize:'9px',fontWeight:700,
                background:sig.f[i]?'rgba(0,232,122,0.12)':'rgba(255,51,80,0.1)',
                color:sig.f[i]?C.green:C.red,
                border:`1px solid ${sig.f[i]?'rgba(0,232,122,0.25)':'rgba(255,51,80,0.2)'}`}}>{lbl}</span>
            ))}
            <span style={{padding:'2px 6px',fontSize:'9px',color:C.muted}}>
              RSI <strong style={{color:sig.rsi>70?C.red:sig.rsi<30?C.green:C.yellow}}>{sig.rsi.toFixed(0)}</strong>
            </span>
            <span style={{padding:'2px 6px',fontSize:'9px',color:C.muted}}>
              ADX <strong style={{color:sig.adx>25?C.green:C.yellow}}>{sig.adx.toFixed(0)}</strong>
            </span>
          </div>
          <div style={{
            padding:'8px 12px',borderRadius:'8px',textAlign:'center' as const,fontWeight:900,fontSize:'15px',
            background:sig.dir==='BUY'?'rgba(0,232,122,0.08)':sig.dir==='SELL'?'rgba(255,51,80,0.08)':'rgba(18,28,55,0.5)',
            border:`1px solid ${sig.dir==='BUY'?'rgba(0,232,122,0.3)':sig.dir==='SELL'?'rgba(255,51,80,0.3)':C.dim}`,
            color:sig.dir==='BUY'?C.green:sig.dir==='SELL'?C.red:C.muted,
            boxShadow:sig.dir!=='HOLD'?`0 0 20px ${sig.dir==='BUY'?'rgba(0,232,122,0.2)':'rgba(255,51,80,0.2)'}`:undefined,
          }}>
            {sig.dir==='BUY'?'▲ קנייה':sig.dir==='SELL'?'▼ מכירה':'— ממתין'} {sig.score}/5
            {sig.mtf&&<span style={{fontSize:'10px',marginRight:'8px',color:C.blue}}> ✓ 5M</span>}
          </div>
        </Card3D>
      </div>

      {/* ══ OPEN POSITIONS ══ */}
      {openTrades.length>0&&(
        <div style={{...glass,padding:'10px',marginBottom:'8px'}}>
          <div style={{color:C.pink,fontWeight:700,fontSize:'10px',marginBottom:'6px',letterSpacing:'0.5px'}}>
            ▶ פוזיציות פתוחות ({openTrades.length})
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:'5px'}}>
            {openTrades.map(t=>{
              const cur=prices[t.sym]?.price||t.entry
              const pnl=(t.side==='LONG'?(cur-t.entry):(t.entry-cur))*t.size-t.fee
              const pct=(cur-t.entry)/t.entry*(t.side==='LONG'?1:-1)*100
              return (
                <div key={t.id} style={{
                  background:'rgba(8,12,30,0.85)',borderRadius:'8px',padding:'7px 9px',
                  border:`1px solid ${pnl>=0?'rgba(0,232,122,0.25)':'rgba(255,51,80,0.25)'}`,
                  boxShadow:pnl>=0?`0 4px 16px rgba(0,232,122,0.08)`:` 0 4px 16px rgba(255,51,80,0.08)`,
                  backdropFilter:'blur(8px)',
                }}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:'3px'}}>
                    <span style={{color:t.side==='LONG'?C.green:C.red,fontWeight:800,fontSize:'10px'}}>{t.side==='LONG'?'▲':'▼'} {t.sym}</span>
                    <span style={{color:pnl>=0?C.green:C.red,fontWeight:800,fontSize:'10px'}}>{pnl>=0?'+':''}{pnl.toFixed(2)}</span>
                  </div>
                  <div style={{fontSize:'9px',color:C.muted}}>{fmtP(t.entry)} → {fmtP(cur)} <span style={{color:pct>=0?C.green:C.red}}>{pct>=0?'+':''}{pct.toFixed(2)}%</span></div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ══ TABS ══ */}
      <div style={{...glass,padding:'10px',marginBottom:'8px'}}>
        <div style={{display:'flex',gap:'4px',marginBottom:'10px',flexWrap:'wrap' as const}}>
          {([
            ['scanner','🔍 סריקה'],['history','📋 היסטוריה'],['stats','📊 סטטיסטיקות'],
            ['ai','🤖 AI'],['regime','🌐 שוק'],
          ] as [TabType,string][]).map(([t,label])=>(
            <button key={t} onClick={()=>setTab(t)} style={{
              cursor:'pointer',
              border:`1px solid ${tab===t?C.pink:C.dim}`,
              borderRadius:'6px',padding:'5px 12px',fontSize:'10px',fontWeight:700,
              background:tab===t?'rgba(255,32,112,0.15)':'rgba(255,255,255,0.02)',
              color:tab===t?C.pink:C.muted,
              boxShadow:tab===t?`0 0 12px ${C.pink}33`:undefined,
              transition:'all 0.2s',
            }}>{label}</button>
          ))}
          <span style={{marginRight:'auto',color:C.muted,fontSize:'9px',alignSelf:'center'}}>{closed.length} סגורות | {wins} זכיות</span>
        </div>

        {/* SCANNER */}
        {tab==='scanner'&&(
          <div style={{overflowX:'auto' as const}}>
            <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:'10px'}}>
              <thead>
                <tr>{['מטבע','מחיר','24%','ציון','RSI','ADX','משקל','סיגנל'].map(h=>(
                  <th key={h} style={{padding:'4px 6px',textAlign:'right' as const,color:C.muted,borderBottom:`1px solid ${C.dim}`,fontWeight:700,fontSize:'9px'}}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {COINS.map(c=>{
                  const info=prices[c.sym];const s=allSigs[c.sym];if(!info)return null
                  const wt=coinWeights[c.sym]
                  return (
                    <tr key={c.sym} onClick={()=>setSelected(c.sym)} style={{
                      cursor:'pointer',
                      background:s?.dir==='BUY'?'rgba(0,232,122,0.04)':s?.dir==='SELL'?'rgba(255,51,80,0.04)':'transparent',
                      borderBottom:`1px solid ${C.dim}`,
                      transition:'background 0.15s',
                    }}>
                      <td style={{padding:'4px 6px',color:s?.dir==='BUY'?C.green:s?.dir==='SELL'?C.red:C.blue,fontWeight:800}}>{c.sym}</td>
                      <td style={{padding:'4px 6px',color:C.text}}>{fmtP(info.price)}</td>
                      <td style={{padding:'4px 6px',color:info.change>0?C.green:info.change<0?C.red:C.muted}}>{info.change>=0?'+':''}{info.change.toFixed(2)}%</td>
                      <td style={{padding:'4px 6px',color:s?.dir!=='HOLD'?C.blue:C.dim,fontWeight:700}}>{s?.score||0}/5</td>
                      <td style={{padding:'4px 6px',color:s?.rsi>70?C.red:s?.rsi<30?C.green:C.yellow}}>{s?.rsi.toFixed(0)||'—'}</td>
                      <td style={{padding:'4px 6px',color:s?.adx>25?C.green:s?.adx>14?C.yellow:C.red}}>{s?.adx.toFixed(0)||'—'}</td>
                      <td style={{padding:'4px 6px',color:wt?(wt>1.2?C.green:wt<0.7?C.red:C.muted):C.dim,fontWeight:700}}>{wt?wt.toFixed(1)+'×':'—'}</td>
                      <td style={{padding:'4px 6px',fontWeight:900,color:s?.dir==='BUY'?C.green:s?.dir==='SELL'?C.red:C.dim}}>
                        {s?.dir==='BUY'?'▲ קנייה':s?.dir==='SELL'?'▼ מכירה':'—'}
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
            ?<div style={{color:C.dim,textAlign:'center' as const,padding:'24px',fontSize:'12px'}}>אין עסקאות סגורות — הבוט עוקב</div>
            :<div style={{overflowX:'auto' as const}}>
              <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:'10px'}}>
                <thead><tr>{['מטבע','כיוון','כניסה','יציאה','P&L','%','סטטוס'].map(h=><th key={h} style={{padding:'4px 6px',textAlign:'right' as const,color:C.muted,borderBottom:`1px solid ${C.dim}`,fontWeight:700,fontSize:'9px'}}>{h}</th>)}</tr></thead>
                <tbody>
                  {[...closed].reverse().slice(0,20).map(t=>(
                    <tr key={t.id} style={{borderBottom:`1px solid ${C.dim}`}}>
                      <td style={{padding:'4px 6px',color:C.blue,fontWeight:700}}>{t.sym}</td>
                      <td style={{padding:'4px 6px',color:t.side==='LONG'?C.green:C.red,fontWeight:700}}>{t.side==='LONG'?'▲ לונג':'▼ שורט'}</td>
                      <td style={{padding:'4px 6px',color:C.muted}}>{fmtP(t.entry)}</td>
                      <td style={{padding:'4px 6px',color:C.muted}}>{t.exit?fmtP(t.exit):'—'}</td>
                      <td style={{padding:'4px 6px',color:(t.pnl||0)>=0?C.green:C.red,fontWeight:800}}>{(t.pnl||0)>=0?'+':''}{(t.pnl||0).toFixed(2)}</td>
                      <td style={{padding:'4px 6px',color:(t.pnlPct||0)>=0?C.green:C.red}}>{((t.pnlPct||0)*100).toFixed(2)}%</td>
                      <td style={{padding:'4px 6px',fontWeight:700,color:t.status==='TP'?C.green:t.status==='SL'?C.red:C.yellow}}>{t.status==='TP'?'✓ TP':t.status==='SL'?'✗ SL':'~ TRAIL'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        )}

        {/* STATS */}
        {tab==='stats'&&(
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'6px'}}>
            {([
              ['שיעור זכייה',winRate.toFixed(1)+'%',winRate>55?C.green:winRate>45?C.yellow:C.red],
              ['שארפ',sharpe.toFixed(2),sharpe>1?C.green:sharpe>0?C.yellow:C.red],
              ['ירידה מקסימלית',maxDD.toFixed(1)+'%',maxDD<10?C.green:maxDD<25?C.yellow:C.red],
              ['P&L כולל',(totalPnl>=0?'+':'')+totalPnl.toFixed(2),totalPnl>=0?C.green:C.red],
              ['מספר עסקאות',trades.length.toString(),C.blue],
              ['יתרה','$'+totalValue.toFixed(0),totalValue>=INIT_BAL?C.green:C.red],
              ['פתוחות',openTrades.length.toString(),C.yellow],
              ['ממוצע זכייה',wins>0?'+'+(closed.filter(t=>(t.pnl||0)>0).reduce((a,t)=>a+(t.pnl||0),0)/wins).toFixed(2):'—',C.green],
              ['פנוי','$'+balance.toFixed(0),C.yellow],
            ] as [string,string,string][]).map(([label,value,color])=>(
              <StatTile key={label} label={label} value={value} color={color}/>
            ))}
          </div>
        )}

        {/* AI OPTIMIZER */}
        {tab==='ai'&&(
          <div>
            <div style={{background:'rgba(0,217,163,0.05)',border:`1px solid rgba(0,217,163,0.25)`,borderRadius:'10px',padding:'10px',marginBottom:'8px'}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:'6px'}}>
                <span style={{color:C.teal,fontWeight:700,fontSize:'10px'}}>🤖 מצב אופטימייזר AI</span>
                <span style={{fontSize:'9px',color:C.muted}}>
                  {lastOptimizedAt?`עדכון: ${new Date(lastOptimizedAt).toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'})}`:'טרם הורץ'}
                </span>
              </div>
              {Object.keys(currentBotParams).length===0
                ?<div style={{color:C.dim,fontSize:'10px',textAlign:'center',padding:'8px'}}>פרמטרים ברירת מחדל — AI יתחיל אחרי 50 עסקאות</div>
                :<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(110px,1fr))',gap:'4px'}}>
                  {Object.entries(currentBotParams).map(([k,v])=>(
                    <div key={k} style={{background:'rgba(8,12,30,0.8)',borderRadius:'6px',padding:'4px 7px',border:`1px solid ${C.dim}`}}>
                      <div style={{color:C.muted,fontSize:'8px'}}>{k}</div>
                      <div style={{color:C.teal,fontWeight:700,fontSize:'11px'}}>{JSON.stringify(v)}</div>
                    </div>
                  ))}
                </div>
              }
            </div>
            <div style={{color:C.pink,fontWeight:700,fontSize:'10px',marginBottom:'6px'}}>היסטוריית שינויים</div>
            {optimizerHistory.length===0
              ?<div style={{color:C.dim,fontSize:'10px',textAlign:'center',padding:'20px'}}>אין שינויים עדיין</div>
              :<div style={{display:'flex',flexDirection:'column' as const,gap:'5px',maxHeight:'380px',overflowY:'auto' as const}}>
                {optimizerHistory.map(run=>{
                  const changedKeys=Object.keys(run.params_after||{}).filter(k=>JSON.stringify((run.params_before||{})[k])!==JSON.stringify((run.params_after||{})[k]))
                  return (
                    <div key={run.id} style={{background:'rgba(8,12,30,0.85)',borderRadius:'8px',padding:'8px 10px',border:`1px solid ${C.dim}`}}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:'4px'}}>
                        <span style={{color:C.blue,fontWeight:700,fontSize:'10px'}}>
                          {new Date(run.created_at).toLocaleString('he-IL',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}
                        </span>
                        <span style={{fontSize:'9px',color:C.muted}}>
                          WR <strong style={{color:run.overall_wr>0.5?C.green:C.red}}>{(run.overall_wr*100).toFixed(1)}%</strong>
                          {' · '}PF <strong style={{color:run.overall_pf>1?C.green:C.red}}>{run.overall_pf?.toFixed(2)}</strong>
                        </span>
                      </div>
                      {changedKeys.length>0&&(
                        <div style={{display:'flex',flexWrap:'wrap' as const,gap:'3px',marginBottom:'4px'}}>
                          {changedKeys.map(k=>(
                            <span key={k} style={{fontSize:'9px',padding:'2px 6px',borderRadius:'4px',background:'rgba(255,183,0,0.08)',border:`1px solid rgba(255,183,0,0.25)`,color:C.yellow}}>
                              {k}: {JSON.stringify((run.params_before||{})[k])} → <strong style={{color:C.teal}}>{JSON.stringify((run.params_after||{})[k])}</strong>
                            </span>
                          ))}
                        </div>
                      )}
                      {run.reasoning&&(
                        <div style={{fontSize:'9px',color:C.muted,lineHeight:'1.5',borderTop:`1px solid ${C.dim}`,paddingTop:'4px'}}>
                          💭 {run.reasoning.slice(0,200)}{run.reasoning.length>200?'...':''}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            }
          </div>
        )}

        {/* MARKET REGIME */}
        {tab==='regime'&&(
          <div>
            {/* Current regime big display */}
            <div style={{
              background:`linear-gradient(135deg, ${regColor}10, rgba(8,12,30,0.9))`,
              border:`1px solid ${regColor}44`,borderRadius:'12px',padding:'16px',marginBottom:'8px',
              textAlign:'center' as const,
              boxShadow:`0 8px 32px ${regColor}18`,
            }}>
              <div style={{fontSize:'28px',fontWeight:900,color:regColor,textShadow:`0 0 30px ${regColor}66`,marginBottom:'4px'}}>
                {REGIME_HE[marketRegime]||marketRegime}
              </div>
              <div style={{fontSize:'12px',color:C.muted}}>
                ביטחון: <strong style={{color:regColor}}>{(regimeConf*100).toFixed(0)}%</strong>
              </div>
              <div style={{marginTop:'8px',fontSize:'10px',color:C.muted}}>
                {marketRegime==='TREND_UP'&&'הבוט מעדיף פוזיציות לונג · SL מותאם'}
                {marketRegime==='TREND_DOWN'&&'הבוט מעדיף פוזיציות שורט · SL מותאם'}
                {marketRegime==='RANGING'&&'הבוט פועל בשני הכיוונים · TP מוקדם'}
                {marketRegime==='VOLATILE'&&'הבוט מקטין פוזיציות · SL מורחב'}
              </div>
            </div>

            {/* Coin weights */}
            {Object.keys(coinWeights).length>0&&(
              <div style={{marginBottom:'8px'}}>
                <div style={{color:C.yellow,fontWeight:700,fontSize:'10px',marginBottom:'6px'}}>
                  ⚖️ משקלי מטבעות {rebalancedAt?`· עדכון: ${new Date(rebalancedAt).toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'})}`:''}</div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(100px,1fr))',gap:'4px'}}>
                  {Object.entries(coinWeights).sort(([,a],[,b])=>b-a).map(([sym,wt])=>(
                    <div key={sym} style={{background:'rgba(8,12,30,0.8)',border:`1px solid ${wt>1.2?C.green+'44':wt<0.7?C.red+'44':C.dim}`,borderRadius:'8px',padding:'6px 8px',textAlign:'center' as const}}>
                      <div style={{fontWeight:800,fontSize:'11px',color:C.text}}>{sym}</div>
                      <div style={{fontWeight:900,fontSize:'14px',color:wt>1.2?C.green:wt<0.7?C.red:C.yellow,marginTop:'2px'}}>{wt.toFixed(2)}×</div>
                      <div style={{height:'4px',background:C.dim,borderRadius:'2px',marginTop:'4px',overflow:'hidden'}}>
                        <div style={{height:'100%',width:`${Math.min(wt/2*100,100)}%`,background:wt>1.2?C.green:wt<0.7?C.red:C.yellow,borderRadius:'2px'}}/>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Regime history */}
            <div style={{color:C.pink,fontWeight:700,fontSize:'10px',marginBottom:'6px'}}>היסטוריית מצבי שוק</div>
            {regimeHistory.length===0
              ?<div style={{color:C.dim,fontSize:'10px',textAlign:'center',padding:'16px'}}>אין נתונים — המנגנון יתחיל לרוץ בקרוב</div>
              :<div style={{display:'flex',flexDirection:'column' as const,gap:'4px',maxHeight:'300px',overflowY:'auto' as const}}>
                {regimeHistory.map(r=>(
                  <div key={r.id} style={{display:'flex',gap:'8px',alignItems:'center',padding:'5px 8px',background:'rgba(8,12,30,0.7)',borderRadius:'6px',border:`1px solid ${C.dim}`}}>
                    <span style={{fontSize:'9px',color:C.muted,minWidth:'70px'}}>{new Date(r.created_at).toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'})}</span>
                    <span style={{padding:'2px 8px',borderRadius:'4px',fontSize:'9px',fontWeight:700,
                      background:`${REGIME_COLOR[r.regime]||C.blue}18`,color:REGIME_COLOR[r.regime]||C.blue,
                      border:`1px solid ${REGIME_COLOR[r.regime]||C.blue}33`}}>
                      {REGIME_HE[r.regime]||r.regime}
                    </span>
                    <span style={{fontSize:'9px',color:C.muted}}>ביטחון {(r.confidence*100).toFixed(0)}%</span>
                    {r.notes&&<span style={{fontSize:'8px',color:C.dim,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{r.notes}</span>}
                  </div>
                ))}
              </div>
            }
          </div>
        )}
      </div>

      {/* ══ CHARTS ROW ══ */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'8px'}}>
        <Card3D style={{padding:'10px'}} color={C.blue}>
          <div style={{color:C.blue,fontWeight:700,fontSize:'10px',marginBottom:'6px'}}>◉ מפת שוק</div>
          <canvas ref={bubRef} width={400} height={200}
            style={{width:'100%',height:'200px',display:'block',borderRadius:'6px',background:'rgba(2,3,10,0.8)'}}/>
        </Card3D>
        <Card3D style={{padding:'10px'}} color={C.green}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:'6px'}}>
            <span style={{color:C.green,fontWeight:700,fontSize:'10px'}}>📈 עקומת הון</span>
            <span style={{color:totalPnl>=0?C.green:C.red,fontWeight:700,fontSize:'10px'}}>{totalPnl>=0?'+':''}{totalPnl.toFixed(2)}</span>
          </div>
          <canvas ref={eqRef} width={400} height={200}
            style={{width:'100%',height:'200px',display:'block',borderRadius:'6px',background:'rgba(2,3,10,0.8)',border:`1px solid ${C.dim}`}}/>
        </Card3D>
      </div>

      {/* ══ LOG ══ */}
      <div style={{...glass,padding:'10px'}}>
        <div style={{color:C.pink,fontWeight:700,fontSize:'10px',marginBottom:'6px',letterSpacing:'0.5px'}}>▶ יומן פעולות — חי</div>
        <div style={{height:'90px',overflowY:'auto' as const,scrollbarWidth:'thin' as const,scrollbarColor:`${C.dim} transparent`}}>
          {execLog.length===0
            ?<div style={{color:C.dim,fontSize:'10px',padding:'4px'}}>ממתין לאיתותים...</div>
            :execLog.map((entry,i)=>(
              <div key={i} style={{fontSize:'10px',padding:'1px 4px',fontFamily:'monospace',borderBottom:`1px solid ${C.dim}`,lineHeight:'1.6',
                color:entry.includes('פתיחה')||entry.includes('TP')||entry.includes('+')
                  ?C.green:entry.includes('SL')||entry.includes('✗')?C.red
                  :entry.includes('TRAIL')?C.yellow:C.muted}}>
                {entry}
              </div>
            ))
          }
        </div>
      </div>

      <div style={{textAlign:'center' as const,color:C.dim,fontSize:'9px',marginTop:'8px',letterSpacing:'0.5px'}}>
        {supaLive?'☁ שרת בוט v21 פעיל 24/7 | מסגרת זמן 5 דקות | מחירים חיים מ-Binance':'מסחר וירטואלי | מחירים חיים מ-Binance'}
      </div>
    </div>
  )
}

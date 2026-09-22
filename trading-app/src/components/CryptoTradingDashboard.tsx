import { useState, useEffect, useRef, useCallback, useMemo, type CSSProperties } from 'react'
import { createClient } from '@supabase/supabase-js'

const SUPA_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://adxgadwghgkwmntsnrar.supabase.co'
const SUPA_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkeGdhZHdnaGdrd21udHNucmFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2NzY3OTksImV4cCI6MjEwNTI1Mjc5OX0.08xmuV7Wf49I8rp_RffeiIQVqWNilE7QRfNxpmrU_j4'

type RiskType = 'low'|'medium'|'high'
const normalizeRisk = (r: string): RiskType =>
  (r==='low'||r==='medium'||r==='high') ? r : 'medium'
type TabType  = 'scanner'|'history'|'stats'|'ai'|'regime'|'analysis'
type Regime   = 'TREND_UP'|'TREND_DOWN'|'RANGING'|'VOLATILE'

interface Bar { time:number; open:number; high:number; low:number; close:number; vol:number }
interface Trade {
  id:number; sym:string; side:'LONG'|'SHORT'
  entry:number; exit?:number; size:number
  pnl?:number; pnlPct?:number; ts:number
  status:'OPEN'|'TP'|'SL'|'TRAIL'
  hi:number; lo:number; trailSL:number; fee:number
  strategy?:string
  lev?:number
  riskUsd?:number
  slPct?:number; tpPct?:number
  partialDone?:boolean; closedTs?:number
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
// v53.1 redesign: "precision instrument" — one live accent (cyan) for the live
// layer only; green/red reserved for economic meaning; amber for warnings.
// pink/blue/teal/cyan intentionally alias the single accent; purple is neutral.
const C = {
  bg:     '#04070E',
  panel:  'rgba(10,17,29,0.96)',
  panel2: 'rgba(13,21,36,0.94)',
  pink:   '#35e0ff',
  green:  '#00d492',
  red:    '#ff4d6a',
  yellow: '#ffb454',
  blue:   '#35e0ff',
  purple: '#8fa3bf',
  teal:   '#35e0ff',
  cyan:   '#35e0ff',
  dim:    'rgba(140,170,210,0.06)',
  muted:  '#8fa3bf',
  text:   '#c7d5e8',
  bright: '#eef4fc',
  border: 'rgba(140,170,210,0.14)',
  glow:   '0 1px 3px rgba(0,0,0,0.45)',
  glowP:  '0 1px 3px rgba(0,0,0,0.45)',
  glowG:  '0 1px 3px rgba(0,0,0,0.45)',
}

const REGIME_HE: Record<string,string> = {
  TREND_UP:   'טרנד עולה',
  TREND_DOWN: 'טרנד יורד',
  RANGING:    'ריינג׳',
  VOLATILE:   'תנודתי',
}
const REGIME_COLOR: Record<string,string> = {
  TREND_UP: C.green, TREND_DOWN: C.red, RANGING: C.blue, VOLATILE: C.yellow,
}
const RISK_HE: Record<RiskType,string> = { low:'נמוך', medium:'בינוני', high:'גבוה' }
// v57.0: the client-side 5-minute paper engine that used to live in this file is
// gone — its risk table, entry/exit thresholds, confluence scoring and indicator
// panel with it. It had been unreachable for many versions (every entry point
// began `if (supaModeRef.current) return`), but it still PAINTED the page: fixed
// "SL 1.0% · TP 2.4%", a 5-flag EMA/RSI/MACD/BB/Stoch score and BUY/SELL banners
// that had nothing to do with the DONCH4H/ROTA bot the server actually runs. An
// external reviewer read those and concluded a second 5m engine was trading live.
// A dashboard that shows a strategy nobody runs is not a cosmetic problem: it
// makes every number on the page unattributable. What remains is a viewer of the
// server bot — live prices, its positions, its equity, its config.
const INIT_BAL=10000, MAX_BARS=600, BAR_MS=60_000

const COINS = [
  {sym:'BTC', ws:'btcusdt'}, {sym:'ETH', ws:'ethusdt'}, {sym:'SOL', ws:'solusdt'},
  {sym:'BNB', ws:'bnbusdt'}, {sym:'XRP', ws:'xrpusdt'}, {sym:'ADA', ws:'adausdt'},
  {sym:'DOGE',ws:'dogeusdt'},{sym:'AVAX',ws:'avaxusdt'},{sym:'LINK',ws:'linkusdt'},
  {sym:'DOT', ws:'dotusdt'}, {sym:'POL', ws:'polusdt'}, {sym:'UNI', ws:'uniusdt'},
  {sym:'ATOM',ws:'atomusdt'},{sym:'LTC', ws:'ltcusdt'}, {sym:'BCH', ws:'bchusdt'},
  {sym:'NEAR',ws:'nearusdt'},{sym:'ALGO',ws:'algousdt'},{sym:'FIL', ws:'filusdt'},
  {sym:'VET', ws:'vetusdt'}, {sym:'ICP', ws:'icpusdt'},
  {sym:'APT', ws:'aptusdt'}, {sym:'ARB', ws:'arbusdt'}, {sym:'OP',  ws:'opusdt'},
  {sym:'SUI', ws:'suiusdt'}, {sym:'INJ', ws:'injusdt'}, {sym:'TRX', ws:'trxusdt'},
  {sym:'HBAR',ws:'hbarusdt'},{sym:'AAVE',ws:'aaveusdt'},{sym:'WLD', ws:'wldusdt'},
  {sym:'SEI', ws:'seiusdt'},
]

// ─── math ─────────────────────────────────────────────────────────────────────
// v57.0: the legacy indicator math (EMA/RSI/MACD/BB/StochRSI/ADX/ATR, the 1m->5m/15m
// bar builders and the 5-flag confluence scorer) was only ever fed to the retired
// client-side engine and to the panel that displayed its verdict. Deleted with it.
// The strategy indicators that matter now are computed server-side, in the bot.
function calcSharpe(trades:Trade[]):number{const cl=trades.filter(t=>t.pnlPct!==undefined);if(cl.length<3)return 0;const r=cl.map(t=>t.pnlPct!);const m=r.reduce((a,b)=>a+b,0)/r.length;const s=Math.sqrt(r.reduce((a,b)=>a+(b-m)**2,0)/r.length)||1e-9;return(m/s)*Math.sqrt(252)}
function calcMaxDD(trades:Trade[]):number{let bal=INIT_BAL,peak=INIT_BAL,mx=0;for(const t of trades){if(t.pnl){bal+=t.pnl;if(bal>peak)peak=bal;mx=Math.max(mx,(peak-bal)/peak)}}return mx*100}
function mapDbTrade(t:Record<string,unknown>):Trade{return{id:t.id as number,sym:t.sym as string,side:t.side as 'LONG'|'SHORT',entry:Number(t.entry_price),exit:t.exit_price!=null?Number(t.exit_price):undefined,size:Number(t.size),pnl:t.pnl!=null?Number(t.pnl):undefined,pnlPct:t.pnl_pct!=null?Number(t.pnl_pct):undefined,ts:new Date(t.opened_at as string).getTime(),closedTs:t.closed_at?new Date(t.closed_at as string).getTime():undefined,status:t.status as 'OPEN'|'TP'|'SL'|'TRAIL',hi:Number(t.hi),lo:Number(t.lo),trailSL:Number(t.trail_sl),fee:Number(t.fee),strategy:(t.strategy as string)||'LEGACY',riskUsd:t.risk_usd!=null?Number(t.risk_usd):undefined,lev:Math.max(1,Number(t.lev)||1)}}

// ─── canvas renderers ─────────────────────────────────────────────────────────
// v57.0: price only. The EMA9/21 lines, the Bollinger band fill and the BUY/SELL
// dot were the retired 5m engine's view of the market, drawn on 1-minute bars —
// nothing the server bot looks at. Painting them next to the bot's real P&L
// implied the two were related. Candles and the last price stay; a position
// marker replaces the signal dot, because that IS something the bot decided.
function drawCandles(canvas:HTMLCanvasElement,bars:Bar[],pos?:'LONG'|'SHORT'){
  const ctx=canvas.getContext('2d');if(!ctx||bars.length<3)return
  const W=canvas.width,H=canvas.height
  ctx.clearRect(0,0,W,H)
  // grid background
  ctx.strokeStyle='rgba(0,200,255,0.04)';ctx.lineWidth=0.5
  for(let i=1;i<6;i++){ctx.beginPath();ctx.moveTo(0,H*i/6);ctx.lineTo(W,H*i/6);ctx.stroke()}
  for(let i=1;i<8;i++){ctx.beginPath();ctx.moveTo(W*i/8,0);ctx.lineTo(W*i/8,H);ctx.stroke()}
  const sl=bars.slice(-70)
  const lo=Math.min(...sl.map(b=>b.low))*0.9988
  const hi=Math.max(...sl.map(b=>b.high))*1.0012
  const toY=(v:number)=>H-2-((v-lo)/(hi-lo))*(H-4)
  const cw=(W-4)/sl.length
  // candles
  sl.forEach((b,i)=>{
    const x=i*cw+2;const isUp=b.close>=b.open
    const col=isUp?C.green:C.red
    ctx.strokeStyle=col;ctx.lineWidth=0.8
    ctx.beginPath();ctx.moveTo(x+cw/2,toY(b.high));ctx.lineTo(x+cw/2,toY(b.low));ctx.stroke()
    const bTop=toY(Math.max(b.open,b.close));const bBot=toY(Math.min(b.open,b.close))
    ctx.fillStyle=isUp?'rgba(0,245,160,0.88)':'rgba(255,58,94,0.88)'
    ctx.fillRect(x+1,bTop,Math.max(1,cw-2),Math.max(1,bBot-bTop))
  })
  // price label
  const lp=sl[sl.length-1].close
  ctx.fillStyle='rgba(2,8,20,0.9)';ctx.fillRect(2,toY(lp)-13,72,14)
  ctx.fillStyle=C.green;ctx.font='bold 10px monospace'
  ctx.fillText(lp>=100?lp.toFixed(2):lp.toFixed(5),4,toY(lp)-1)
  // open-position marker (the bot's, not a suggestion)
  if(pos){
    const col=pos==='LONG'?C.green:C.red
    ctx.fillStyle=col;ctx.font='bold 9px monospace';ctx.textAlign='right'
    ctx.fillText(pos==='LONG'?'\u25b2 LONG':'\u25bc SHORT',W-6,13)
    ctx.textAlign='left'
  }
}

function drawEquity(canvas:HTMLCanvasElement,trades:Trade[]){
  const ctx=canvas.getContext('2d');if(!ctx)return
  const W=canvas.width,H=canvas.height
  ctx.clearRect(0,0,W,H)
  const pts=[INIT_BAL];let bal=INIT_BAL
  for(const t of trades){if(t.pnl!==undefined){bal+=t.pnl;pts.push(bal)}}
  if(pts.length<2){ctx.fillStyle='rgba(0,245,160,0.03)';ctx.fillRect(0,0,W,H);return}
  const lo=Math.min(...pts)*0.995,hi=Math.max(...pts)*1.005
  const toY=(v:number)=>H-1-((v-lo)/(hi-lo))*(H-2)
  const toX=(i:number)=>(i/(pts.length-1))*(W-1)
  ctx.beginPath();pts.forEach((v,i)=>{i===0?ctx.moveTo(toX(i),toY(v)):ctx.lineTo(toX(i),toY(v))})
  ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.closePath()
  const g=ctx.createLinearGradient(0,0,0,H)
  g.addColorStop(0,'rgba(0,245,160,0.3)');g.addColorStop(1,'rgba(0,245,160,0.01)')
  ctx.fillStyle=g;ctx.fill()
  ctx.beginPath();pts.forEach((v,i)=>{i===0?ctx.moveTo(toX(i),toY(v)):ctx.lineTo(toX(i),toY(v))})
  ctx.strokeStyle=C.green;ctx.lineWidth=2;ctx.shadowColor=C.green;ctx.shadowBlur=6;ctx.stroke();ctx.shadowBlur=0
}

// v53.1 redesign: oscilloscope hero — real bot_equity trace on an engineering
// grid, dashed baseline at the era's first snapshot, live cursor with value.
function drawScope(canvas:HTMLCanvasElement,hist:{ts:string;equity:number}[]){
  const ctx=canvas.getContext('2d');if(!ctx||hist.length<2)return
  const W=canvas.width,H=canvas.height
  ctx.clearRect(0,0,W,H)
  const padL=10,padR=118,padT=14,padB=10,iw=W-padL-padR,ih=H-padT-padB
  ctx.strokeStyle='rgba(140,170,210,0.07)';ctx.lineWidth=1
  for(let i=0;i<=5;i++){const y=padT+ih*i/5;ctx.beginPath();ctx.moveTo(padL,y);ctx.lineTo(W-padR,y);ctx.stroke()}
  for(let i=0;i<=12;i++){const x=padL+iw*i/12;ctx.beginPath();ctx.moveTo(x,padT);ctx.lineTo(x,H-padB);ctx.stroke()}
  const eq=hist.map(p=>p.equity)
  const base=eq[0]
  const mn=Math.min(...eq,base)-(Math.max(...eq)-Math.min(...eq)||50)*0.08
  const mx=Math.max(...eq,base)+(Math.max(...eq)-Math.min(...eq)||50)*0.08
  const X=(i:number)=>padL+iw*i/(eq.length-1)
  const Y=(v:number)=>padT+ih*(1-(v-mn)/(mx-mn||1))
  const g=ctx.createLinearGradient(0,padT,0,H-padB)
  g.addColorStop(0,'rgba(53,224,255,0.16)');g.addColorStop(1,'rgba(53,224,255,0)')
  ctx.beginPath();ctx.moveTo(X(0),Y(eq[0]))
  for(let i=1;i<eq.length;i++)ctx.lineTo(X(i),Y(eq[i]))
  ctx.lineTo(X(eq.length-1),H-padB);ctx.lineTo(X(0),H-padB);ctx.closePath()
  ctx.fillStyle=g;ctx.fill()
  ctx.beginPath();ctx.moveTo(X(0),Y(eq[0]))
  for(let i=1;i<eq.length;i++)ctx.lineTo(X(i),Y(eq[i]))
  ctx.strokeStyle='#35e0ff';ctx.lineWidth=1.6;ctx.stroke()
  ctx.setLineDash([3,5]);ctx.strokeStyle='rgba(140,170,210,0.32)'
  ctx.beginPath();ctx.moveTo(padL,Y(base));ctx.lineTo(W-padR,Y(base));ctx.stroke()
  ctx.setLineDash([])
  const lx=X(eq.length-1),ly=Y(eq[eq.length-1])
  ctx.fillStyle='#35e0ff';ctx.beginPath();ctx.arc(lx,ly,3,0,7);ctx.fill()
  ctx.strokeStyle='rgba(53,224,255,0.35)';ctx.beginPath();ctx.arc(lx,ly,7,0,7);ctx.stroke()
  ctx.font='11px "IBM Plex Mono",ui-monospace,monospace';ctx.textAlign='left'
  ctx.fillStyle='#35e0ff'
  ctx.fillText(eq[eq.length-1].toLocaleString(undefined,{maximumFractionDigits:2}),lx+12,ly+4)
  ctx.fillStyle='rgba(140,170,210,0.55)'
  const byOff=Math.abs(Y(base)-ly)<12?(ly>Y(base)?-8:12):4
  ctx.fillText(base.toLocaleString(undefined,{maximumFractionDigits:0}),lx+12,Y(base)+byOff)
}

// v57.0: the market map used to colour each bubble by the retired engine's
// BUY/SELL verdict. It now shows what is actually true: 24h move, and whether
// the server bot holds that coin and on which side.
function drawBubbles(canvas:HTMLCanvasElement,pos:Record<string,'LONG'|'SHORT'>,prices:Record<string,PriceInfo>){
  const ctx=canvas.getContext('2d');if(!ctx)return
  const W=canvas.width,H=canvas.height
  ctx.clearRect(0,0,W,H)
  const cols=5,rows=4,cw=W/cols,ch=H/rows
  COINS.forEach((coin,i)=>{
    const col=i%cols,row=Math.floor(i/cols)
    const cx=col*cw+cw/2,cy=row*ch+ch/2
    const side=pos[coin.sym];const chg=prices[coin.sym]?.change||0
    const r=Math.min(cw,ch)*0.38
    const fill=side==='LONG'?'rgba(0,245,160,0.15)':side==='SHORT'?'rgba(255,58,94,0.15)':'rgba(10,20,50,0.5)'
    const stroke=side==='LONG'?C.green:side==='SHORT'?C.red:C.muted
    ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2)
    ctx.fillStyle=fill;ctx.fill()
    if(side){ctx.shadowColor=stroke;ctx.shadowBlur=14}
    ctx.strokeStyle=stroke;ctx.lineWidth=side?1.8:0.4;ctx.stroke()
    ctx.shadowBlur=0
    ctx.fillStyle=side?stroke:C.text
    ctx.font=`bold ${Math.max(8,r*0.44)}px monospace`;ctx.textAlign='center';ctx.textBaseline='middle'
    ctx.fillText(coin.sym,cx,cy-3)
    ctx.font=`${Math.max(7,r*0.3)}px monospace`
    ctx.fillStyle=chg>0?C.green:chg<0?C.red:C.muted
    ctx.fillText(`${chg>=0?'+':''}${chg.toFixed(1)}%`,cx,cy+r*0.55)
  })
  ctx.textAlign='start';ctx.textBaseline='alphabetic'
}

// ─── live position card ───────────────────────────────────────────────────────
function LivePosition({t,live,fmtP,onClose}:{t:Trade;live?:{cur:number;pnl:number;pct:number};fmtP:(p:number)=>string;onClose?:()=>void}){
  // v61.0: NO LIVE PRICE MUST NOT LOOK LIKE ZERO P&L.
  // The old fallback was `cur = live?.cur ?? t.entry`, so with the price feed
  // down every card rendered "+0.00$ / +0.000%" — a confident measurement of
  // nothing. On a phone in a region where Binance is geo-blocked that is EVERY
  // card, and the page looked frozen while the bot was trading normally.
  // Same class of defect as the "_v23_5M" regime label and the dead control
  // buttons: the dashboard stating something false about the system. A missing
  // number is shown as missing.
  const stale    = !live
  const cur      = live?.cur ?? t.entry
  const dirM     = t.side==='LONG'?1:-1
  const pnl      = live?.pnl ?? 0
  const pct      = live?.pct ?? 0
  const col      = stale ? C.muted : (pnl>=0?C.green:C.red)
  const notional = +(t.entry*t.size).toFixed(2)

  const prevPnl = useRef(pnl)
  const [flash,setFlash] = useState<'up'|'dn'|null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout>|null>(null)

  useEffect(()=>{
    const diff = pnl - prevPnl.current
    if(Math.abs(diff) > 0.0001){
      if(flashTimer.current) clearTimeout(flashTimer.current)
      setFlash(diff>0?'up':'dn')
      flashTimer.current=setTimeout(()=>setFlash(null),400)
      prevPnl.current=pnl
    }
  },[pnl])

  return (
    <div className={flash?`flash-${flash}`:''} style={{
      background:`linear-gradient(135deg,${col}08,rgba(3,8,26,0.92))`,
      borderRadius:'10px',padding:'10px 12px',
      border:`1px solid ${col}${flash?'60':'28'}`,
      boxShadow:`0 4px 20px ${col}${flash?'18':'08'}`,
      transition:'border-color 0.2s,box-shadow 0.2s',
    }}>
      {/* top row: symbol + side + live price + close button */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'5px'}}>
        <span style={{color:t.side==='LONG'?C.green:C.red,fontWeight:900,fontSize:'12px'}}>
          {t.side==='LONG'?'▲':'▼'} {t.sym}
        </span>
        <div style={{display:'flex',alignItems:'center',gap:'5px'}}>
          <span style={{fontFamily:'monospace',fontSize:'11px',color:stale?C.muted:C.text,fontWeight:700}}>
            {stale?'—':fmtP(cur)}
          </span>
          {onClose&&(
            <button type="button" onClick={(e)=>{e.stopPropagation();onClose()}} style={{
              background:'rgba(255,58,94,0.15)',border:'1px solid rgba(255,58,94,0.5)',
              borderRadius:'4px',color:'#ff3a5e',fontSize:'9px',fontWeight:700,
              padding:'2px 6px',lineHeight:1,cursor:'pointer',
            }}>✕</button>
          )}
        </div>
      </div>
      {/* pnl row */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:'4px'}}>
        <span style={{fontSize:'9px',color:C.muted}}>
          כניסה {fmtP(t.entry)}
        </span>
        <span className={flash?`num-${flash}`:''} style={{
          fontWeight:900,fontSize:'14px',color:col,
          transition:'color 0.2s',
        }}>
          {stale?'—':`${pnl>=0?'+':''}${pnl.toFixed(2)}$`}
        </span>
      </div>
      {/* pct + progress */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'6px'}}>
        <span style={{fontSize:'9px',color:col,fontWeight:700}}>
          {stale?'אין הזנת מחיר':`${pct>=0?'+':''}${pct.toFixed(3)}%`}
        </span>
        <div style={{flex:1,height:'3px',background:C.dim,borderRadius:'2px',overflow:'hidden'}}>
          <div style={{
            height:'100%',
            width:stale?'0%':`${Math.min(Math.abs(pct)*25,100)}%`,
            background:col,borderRadius:'2px',
            boxShadow:`0 0 4px ${col}`,
            transition:'width 0.15s ease',
          }}/>
        </div>
      </div>
      {/* notional row */}
      <div style={{marginTop:'4px'}}>
        <span style={{fontSize:'9px',color:C.muted}}>
          פוזיציה: ${notional.toLocaleString()}{(t.lev||1)>1?` · מינוף ${t.lev}x · בטחון $${(notional/(t.lev||1)).toFixed(0)}`:''}
        </span>
      </div>
    </div>
  )
}

// ─── injected animations ──────────────────────────────────────────────────────
// v53.1 redesign: quiet motion — no glows, no hologram, no aura cycling.
// Class names are kept so markup keeps working; the flash/slide feedbacks stay.
const STYLE_TAG = `
  *{font-variant-numeric:tabular-nums}
  @keyframes pulse-dot{0%,100%{opacity:1}50%{opacity:0.3}}
  @keyframes slide-up{from{transform:translateY(6px);opacity:0}to{transform:translateY(0);opacity:1}}
  @keyframes flash-up{0%{background:rgba(0,212,146,0.18)}100%{background:transparent}}
  @keyframes flash-dn{0%{background:rgba(255,77,106,0.18)}100%{background:transparent}}
  @keyframes num-up{0%{color:#00d492;transform:translateY(-3px)}100%{transform:translateY(0)}}
  @keyframes num-dn{0%{color:#ff4d6a;transform:translateY(3px)}100%{transform:translateY(0)}}
  .live-dot{animation:pulse-dot 2.4s ease-in-out infinite}
  .glow-beat{animation:none}
  .slide-up{animation:slide-up 0.25s ease-out}
  .float{animation:none}
  .flash-up{animation:flash-up 0.4s ease-out}
  .flash-dn{animation:flash-dn 0.4s ease-out}
  .num-up{animation:num-up 0.3s ease-out}
  .num-dn{animation:num-dn 0.3s ease-out}
  .nx-title{color:#eef4fc;letter-spacing:0.14em}
  .sig-buy{box-shadow:inset 0 0 0 1px rgba(0,212,146,0.4)}
  .sig-sell{box-shadow:inset 0 0 0 1px rgba(255,77,106,0.4)}
  .balance-num{animation:none}
  .nx-btn{transition:border-color 0.15s ease,color 0.15s ease,background 0.15s ease;cursor:pointer}
  .nx-btn:hover{filter:brightness(1.15)}
  .nx-row:hover{background:rgba(140,170,210,0.05)!important}
  .stat-3d{transition:none}
  ::-webkit-scrollbar{width:3px;height:3px}
  ::-webkit-scrollbar-track{background:transparent}
  ::-webkit-scrollbar-thumb{background:rgba(140,170,210,0.25);border-radius:2px}
  @keyframes ticker-scroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
  .ticker-track{display:flex;animation:ticker-scroll 50s linear infinite;will-change:transform}
  .ticker-track:hover{animation-play-state:paused}
  .scan-line{display:none}
  .shimmer-row{background:transparent!important;animation:none}
  .card-aura{outline:1px solid rgba(140,170,210,0.18);outline-offset:-1px}
  @keyframes toast-in{from{transform:translateX(110%);opacity:0}to{transform:translateX(0);opacity:1}}
  .toast-enter{animation:toast-in 0.25s ease-out forwards}
  @media (prefers-reduced-motion:reduce){.live-dot,.ticker-track{animation:none}}
`

// ─── star field ──────────────────────────────────────────────────────────────
function StarField(){
  const ref=useRef<HTMLCanvasElement>(null)
  useEffect(()=>{
    const c=ref.current;if(!c)return
    const ctx=c.getContext('2d');if(!ctx)return
    const resize=()=>{c.width=window.innerWidth;c.height=window.innerHeight}
    resize();window.addEventListener('resize',resize)
    const stars=Array.from({length:80},()=>({
      x:Math.random()*window.innerWidth,y:Math.random()*window.innerHeight,
      r:Math.random()*1.1+0.2,speed:Math.random()*0.22+0.04,op:Math.random()*0.4+0.08,
    }))
    let raf:number
    const draw=()=>{
      ctx.clearRect(0,0,c.width,c.height)
      for(const s of stars){
        s.y-=s.speed;if(s.y<0){s.y=c.height;s.x=Math.random()*c.width}
        ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2)
        ctx.fillStyle=`rgba(180,220,255,${s.op})`;ctx.fill()
      }
      raf=requestAnimationFrame(draw)
    }
    draw()
    return()=>{cancelAnimationFrame(raf);window.removeEventListener('resize',resize)}
  },[])
  return <canvas ref={ref} style={{position:'fixed',inset:0,pointerEvents:'none',zIndex:0,opacity:0.7}}/>
}

// ─── animated counter ────────────────────────────────────────────────────────
function useAnimatedCounter(target:number,duration=700):number{
  const [val,setVal]=useState(target)
  const prev=useRef(target)
  useEffect(()=>{
    const from=prev.current
    if(Math.abs(target-from)<0.5){prev.current=target;setVal(target);return}
    const t0=performance.now();let raf:number
    const tick=(now:number)=>{
      const p=Math.min((now-t0)/duration,1)
      const ease=1-(1-p)**3
      setVal(from+(target-from)*ease)
      if(p<1)raf=requestAnimationFrame(tick)
      else{prev.current=target;setVal(target)}
    }
    raf=requestAnimationFrame(tick)
    return()=>cancelAnimationFrame(raf)
  },[target,duration])
  return val
}

// ─── matrix rain ─────────────────────────────────────────────────────────────
function MatrixRain(){
  const ref=useRef<HTMLCanvasElement>(null)
  useEffect(()=>{
    const c=ref.current;if(!c)return
    const ctx=c.getContext('2d');if(!ctx)return
    const resize=()=>{c.width=window.innerWidth;c.height=window.innerHeight}
    resize();window.addEventListener('resize',resize)
    const cols=Math.floor(c.width/18);const drops=Array(cols).fill(0).map(()=>Math.random()*-60)
    const chars='01アイウエカキクサシスタチBTCETHSOL<>{}[]//\\'.split('')
    let raf:number
    const draw=()=>{
      ctx.fillStyle='rgba(2,8,20,0.06)';ctx.fillRect(0,0,c.width,c.height)
      for(let i=0;i<drops.length;i++){
        const ch=chars[Math.floor(Math.random()*chars.length)]
        const bright=Math.random()>0.92
        ctx.fillStyle=bright?'rgba(0,245,160,0.9)':'rgba(0,200,255,0.25)'
        ctx.font=`${bright?'bold ':''}11px monospace`
        ctx.fillText(ch,i*18,drops[i]*18)
        if(drops[i]*18>c.height&&Math.random()>0.978)drops[i]=0
        drops[i]+=0.5
      }
      raf=requestAnimationFrame(draw)
    }
    draw()
    return()=>{cancelAnimationFrame(raf);window.removeEventListener('resize',resize)}
  },[])
  return <canvas ref={ref} style={{position:'fixed',inset:0,pointerEvents:'none',zIndex:0,opacity:0.18}}/>
}

// ─── cursor glow ──────────────────────────────────────────────────────────────
function CursorGlow(){
  const [pos,setPos]=useState({x:-400,y:-400})
  useEffect(()=>{
    const mv=(e:MouseEvent)=>setPos({x:e.clientX,y:e.clientY})
    window.addEventListener('mousemove',mv)
    return()=>window.removeEventListener('mousemove',mv)
  },[])
  return (
    <div style={{position:'fixed',pointerEvents:'none',zIndex:1,
      left:pos.x-160,top:pos.y-160,width:'320px',height:'320px',
      background:'radial-gradient(circle,rgba(0,200,255,0.07) 0%,transparent 68%)',
      borderRadius:'50%',transition:'left 0.08s ease-out,top 0.08s ease-out'}}/>
  )
}

// ─── progress ring ────────────────────────────────────────────────────────────
function ProgressRing({value,max,color,label}:{value:number;max:number;color:string;label:string}){
  const r=15,circ=2*Math.PI*r,pct=Math.min(value/max,1)
  return (
    <div className="shimmer-row" style={{border:`1px solid ${color}22`,borderRadius:'9px',
      padding:'7px 10px',display:'flex',alignItems:'center',gap:'9px',backdropFilter:'blur(10px)'}}>
      <div style={{position:'relative',width:'38px',height:'38px',flexShrink:0}}>
        <svg width="38" height="38" style={{position:'absolute',top:0,left:0,transform:'rotate(-90deg)'}}>
          <circle cx="19" cy="19" r={r} fill="none" stroke={`${color}22`} strokeWidth="2.5"/>
          <circle cx="19" cy="19" r={r} fill="none" stroke={color} strokeWidth="2.5"
            strokeDasharray={circ} strokeDashoffset={circ*(1-pct)} strokeLinecap="round"
            style={{transition:'stroke-dashoffset 1s ease',filter:`drop-shadow(0 0 4px ${color})`}}/>
        </svg>
        <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',
          fontSize:'8px',fontWeight:900,color,fontFamily:'monospace'}}>{value}</div>
      </div>
      <div>
        <div style={{fontSize:'9px',color:'#3a5878'}}>{label}</div>
        <div style={{fontSize:'10px',color,fontWeight:800}}>{Math.round(pct*100)}% מ-{max}</div>
      </div>
    </div>
  )
}

// ─── 3D card ──────────────────────────────────────────────────────────────────
function Card3D({children,style,color}:{children:React.ReactNode;style?:CSSProperties;color?:string}){
  const [tilt,setTilt]=useState({x:0,y:0})
  const ref=useRef<HTMLDivElement>(null)
  const onMove=(e:React.MouseEvent)=>{
    const el=ref.current;if(!el)return
    const r=el.getBoundingClientRect()
    const x=((e.clientX-r.left)/r.width-0.5)*14
    const y=-((e.clientY-r.top)/r.height-0.5)*10
    setTilt({x,y})
  }
  const col=color||C.blue
  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={()=>setTilt({x:0,y:0})}
      className="card-aura"
      style={{
        background:C.panel,
        backdropFilter:'blur(20px)',
        WebkitBackdropFilter:'blur(20px)',
        border:`1px solid ${col}28`,
        borderRadius:'14px',
        boxShadow:`0 8px 40px ${col}14, 0 2px 8px rgba(0,0,0,0.6), inset 0 1px 0 ${col}12`,
        transform:`perspective(700px) rotateX(${tilt.y}deg) rotateY(${tilt.x}deg) translateZ(4px)`,
        transition:'transform 0.12s ease',
        position:'relative',
        overflow:'hidden',
        ...style,
      }}>
      {/* top edge highlight */}
      <div style={{position:'absolute',top:0,left:'10%',right:'10%',height:'1px',background:`linear-gradient(90deg,transparent,${col}60,transparent)`}}/>
      {children}
    </div>
  )
}

// ─── stat tile ────────────────────────────────────────────────────────────────
function Tile({label,value,color,sub}:{label:string;value:string;color:string;sub?:string}){
  return (
    <div style={{
      background:`linear-gradient(135deg,rgba(3,8,26,0.95) 0%,rgba(6,14,40,0.85) 100%)`,
      border:`1px solid ${color}22`,borderRadius:'12px',padding:'10px 14px',
      position:'relative',overflow:'hidden',
    }}>
      <div style={{position:'absolute',top:0,right:0,width:'50px',height:'50px',
        background:`radial-gradient(circle at top right,${color}16,transparent 70%)`}}/>
      <div style={{fontSize:'9px',color:C.muted,letterSpacing:'1px',fontWeight:600,marginBottom:'4px'}}>{label}</div>
      <div style={{fontSize:'17px',fontWeight:900,color,letterSpacing:'-0.5px',lineHeight:1}}>{value}</div>
      {sub&&<div style={{fontSize:'8px',color:C.muted,marginTop:'3px'}}>{sub}</div>}
    </div>
  )
}

// ─── neon chip ────────────────────────────────────────────────────────────────
function Chip({label,color,dot}:{label:string;color:string;dot?:boolean}){
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:'5px',
      padding:'3px 10px',borderRadius:'20px',fontSize:'9px',fontWeight:700,
      background:`${color}14`,color,border:`1px solid ${color}40`,
      boxShadow:`0 0 12px ${color}18`}}>
      {dot&&<span className="live-dot" style={{width:'5px',height:'5px',borderRadius:'50%',background:color,display:'inline-block'}}/>}
      {label}
    </span>
  )
}

// ─── component ────────────────────────────────────────────────────────────────
export default function CryptoTradingDashboard() {
  const [prices,setPrices]         = useState<Record<string,PriceInfo>>({})
  const [selected,setSelected]     = useState('BTC')
  const [risk,setRisk]             = useState<RiskType>('medium')
  const [balance,setBalance]       = useState(INIT_BAL)
  const [equityHist,setEquityHist]=useState<{ts:string;equity:number}[]>([])
  // v50.2: account-epoch anchor (first bot_equity snapshot ≈ account reset) —
  // pre-reset closed trades must not pollute per-strategy stats / the 50-trade counter
  const [epochTs,setEpochTs]=useState<number>(0)
  const [shields,setShields]=useState<Record<string,boolean>>({})
  const [feedHealth,setFeedHealth]=useState<Record<string,any>>({})
  // v55: equity-curve range selector (days; 0 = all history)
  const [eqRangeDays,setEqRangeDays]=useState<number>(0)
  const [botOn,setBotOn]           = useState(true)
  const [trades,setTrades]         = useState<Trade[]>([])
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
  // v57.0: which build is actually serving, straight from the bot's own manifest
  const [release,setRelease]=useState<{sha:string;bot_version:string;base_risk_pct?:number}|null>(null)
  const [livePositions,setLivePositions]= useState<Record<number,{cur:number;pnl:number;pct:number}>>({})
  const [extraWsSyms,setExtraWsSyms]   = useState<string[]>([])
  const [toasts,setToasts]             = useState<{id:number;msg:string;color:string;pnl?:number}[]>([])

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
  const scopeRef   = useRef<HTMLCanvasElement>(null)
  const cooldown   = useRef<Record<string,number>>({})
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supaRef    = useRef<any>(null)
  const supaModeRef= useRef(!!SUPA_URL&&!!SUPA_KEY)
  const logRef     = useRef<string[]>([])
  const toastIdRef = useRef(0)
  const prevTradeIdsRef    = useRef<Set<number>>(new Set())
  const prevTradeStatusRef = useRef<Record<number,string>>({})
  const toastInitRef       = useRef(false)

  tradeRef.current=trades; botRef.current=botOn
  selRef.current=selected; riskRef.current=risk; balRef.current=balance

  const addLog=useCallback((msg:string)=>{
    const entry=`${new Date().toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit',second:'2-digit'})} ${msg}`
    logRef.current=[entry,...logRef.current].slice(0,40)
    setExecLog([...logRef.current])
  },[])

  const addToast=useCallback((msg:string,color:string,pnl?:number)=>{
    const id=++toastIdRef.current
    setToasts(prev=>[...prev.slice(-4),{id,msg,color,pnl}])
    setTimeout(()=>setToasts(prev=>prev.filter(t=>t.id!==id)),3800)
  },[])

  useEffect(()=>{
    if(!toastInitRef.current&&trades.length>0){
      for(const t of trades){prevTradeIdsRef.current.add(t.id);prevTradeStatusRef.current[t.id]=t.status}
      toastInitRef.current=true;return
    }
    if(!toastInitRef.current)return
    for(const t of trades){
      if(!prevTradeIdsRef.current.has(t.id)&&t.status==='OPEN'){
        addToast(`▲ ${t.sym} ${t.side==='LONG'?'לונג':'שורט'} נפתח`,t.side==='LONG'?C.green:C.red)
      }
      if(prevTradeStatusRef.current[t.id]==='OPEN'&&t.status!=='OPEN'){
        addToast(`${t.status==='TP'?'✓ TP':'✗ '+t.status} ${t.sym}`,t.status==='TP'?C.green:C.red,t.pnl)
      }
      prevTradeIdsRef.current.add(t.id);prevTradeStatusRef.current[t.id]=t.status
    }
  },[trades,addToast])

  // v57.0: handleManualClose, openTrade and checkTrades deleted. The two engine
  // halves had been unreachable since supaMode became permanent (both opened with
  // `if (supaModeRef.current) return`), and manual close is owner-only from v56.8 —
  // close-trade now requires the service-role key, which a public page cannot hold.

  const processTick=useCallback((sym:string,price:number,vol:number)=>{
    const now=Date.now(),barStart=Math.floor(now/BAR_MS)*BAR_MS
    let cb=curBar.current.get(sym)
    if(!cb||cb.time!==barStart){
      if(cb){const arr=barsMap.current.get(sym)||[];arr.push(cb);if(arr.length>MAX_BARS)arr.shift();barsMap.current.set(sym,arr)}
      cb={time:barStart,open:price,high:price,low:price,close:price,vol}
      curBar.current.set(sym,cb)
    } else {cb.close=price;if(price>cb.high)cb.high=price;if(price<cb.low)cb.low=price;cb.vol+=vol}
    // push live PnL for any open positions on this symbol
    const openForSym=tradeRef.current.filter(t=>t.sym===sym&&t.status==='OPEN')
    if(openForSym.length>0){
      setLivePositions(prev=>{
        const next={...prev}
        for(const ot of openForSym){
          const dirM=ot.side==='LONG'?1:-1
          const pnl=(price-ot.entry)*dirM*ot.size
          const pct=(price-ot.entry)/ot.entry*dirM*100   // v49.1: real %, no fake leverage display
          next[ot.id]={cur:price,pnl,pct}
        }
        return next
      })
    }
    if(sym===selRef.current)setTick(n=>n+1)   // repaint the selected chart
  },[])

  useEffect(()=>{
    const load=async()=>{
      for(const coin of COINS){
        try{
          const res=await fetch(`https://api.binance.com/api/v3/klines?symbol=${coin.sym}USDT&interval=5m&limit=300`)
          if(!res.ok)continue
          const data:number[][]=await res.json()
          const bars:Bar[]=data.map(k=>({time:k[0] as number,open:+k[1],high:+k[2],low:+k[3],close:+k[4],vol:+k[5]}))
          barsMap.current.set(coin.sym,bars.slice(0,-1))
          if(coin.sym===selRef.current)setTick(n=>n+1)
        }catch{}
        await new Promise(r=>setTimeout(r,120))
      }
    }
    load()
  },[])

  // Single WS — COINS + dynamic extraWsSyms in one connection (Spot stream; price diff vs futures <0.1%)
  useEffect(()=>{
    let dead=false
    function connect(){
      if(dead)return
      setWsStatus('connecting')
      const knownSet=new Set(COINS.map(c=>c.sym))
      const extraStreams=extraWsSyms.filter(s=>!knownSet.has(s)).map(s=>s.toLowerCase()+'usdt@miniTicker')
      const streams=[...COINS.map(c=>c.ws+'@miniTicker'),...extraStreams].join('/')
      const ws=new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`)
      ws.onopen=()=>setWsStatus('live')
      ws.onerror=()=>setWsStatus('error')
      ws.onclose=()=>{if(!dead){setWsStatus('error');setTimeout(connect,3000)}}
      ws.onmessage=(e)=>{
        try{
          const msg=JSON.parse(e.data);const d=msg.data||msg
          const wsName=(d.s||'').toLowerCase()
          const price=parseFloat(d.c),open24=parseFloat(d.o)
          const coin=COINS.find(c=>c.ws===wsName)
          if(coin){
            setPrices(p=>({...p,[coin.sym]:{price,change:((price-open24)/open24)*100}}))
            processTick(coin.sym,price,parseFloat(d.v||'0'))
          } else {
            const sym=(d.s||'').replace('USDT','')
            if(sym){
              setPrices(p=>({...p,[sym]:{price,change:open24>0?((price-open24)/open24)*100:0}}))
              processTick(sym,price,parseFloat(d.v||'0'))
            }
          }
        }catch{}
      }
      return ws
    }
    const ws=connect()
    return ()=>{dead=true;ws?.close()}
  },[processTick,extraWsSyms])

  // ── v61.0: OKX price fallback ───────────────────────────────────────────────
  // The Binance WebSocket is geo-blocked in some regions — the same 451 the BOT
  // hits from Supabase, which is exactly why the bot already falls back
  // Binance -> OKX -> Bybit. The dashboard never did, so on a phone in one of
  // those regions the page showed a full book with no prices on any of it.
  // One REST call to OKX returns every swap ticker at once, so this costs a
  // single request every 12s and only runs while the socket is not delivering.
  useEffect(()=>{
    let dead=false, timer:ReturnType<typeof setTimeout>|null=null
    const poll=async()=>{
      if(dead)return
      try{
        const res=await fetch('https://www.okx.com/api/v5/market/tickers?instType=SWAP')
        if(res.ok){
          const j=await res.json()
          const next:Record<string,{price:number;change:number}>={}
          for(const r of (j?.data??[])){
            const id=String(r.instId||'')
            if(!id.endsWith('-USDT-SWAP'))continue
            const sym=id.slice(0,-10)
            const price=parseFloat(r.last), open24=parseFloat(r.open24h)
            if(!Number.isFinite(price)||price<=0)continue
            next[sym]={price,change:Number.isFinite(open24)&&open24>0?((price-open24)/open24)*100:0}
          }
          if(!dead&&Object.keys(next).length){
            // The socket wins where it is delivering; OKX only fills the gaps,
            // so a healthy Binance feed is never overwritten by a slower poll.
            setPrices(p=>{
              const merged={...p}
              for(const [sym,v] of Object.entries(next)) if(!merged[sym]) merged[sym]=v
              return merged
            })
            setWsStatus(st=>st==='live'?st:'live')
          }
        }
      }catch{/* offline or blocked too — leave the cards showing "no feed" */}
      if(!dead)timer=setTimeout(poll,12000)
    }
    // Give the socket a few seconds to prove itself before adding traffic.
    timer=setTimeout(poll,4000)
    return ()=>{dead=true;if(timer)clearTimeout(timer)}
  },[])

  useEffect(()=>{
    if(!SUPA_URL||!SUPA_KEY)return
    const supa=createClient(SUPA_URL,SUPA_KEY);supaRef.current=supa
    const loadData=()=>Promise.all([
      supa.from('bot_state').select('*').eq('id',1).single(),
      supa.from('bot_trades').select('*').eq('status','OPEN'),
      supa.from('bot_trades').select('*').neq('status','OPEN').order('opened_at',{ascending:false}).limit(150),
      supa.from('bot_params_history').select('*').order('created_at',{ascending:false}).limit(20),
      supa.from('market_regime').select('*').order('created_at',{ascending:false}).limit(20),
      supa.from('bot_equity').select('ts,equity').order('ts',{ascending:false}).limit(2000),
      supa.from('bot_equity').select('ts').order('ts',{ascending:true}).limit(1),
      supa.from('deployment_manifest').select('sha,bot_version,base_risk_pct').order('first_seen',{ascending:false}).limit(1),
    ]).then(([state,open,closed,optHist,regHist,eqHist,eqFirst,manifest])=>{
      if(manifest&&!manifest.error&&manifest.data&&manifest.data[0])setRelease(manifest.data[0] as {sha:string;bot_version:string;base_risk_pct?:number})
      if(eqHist&&!eqHist.error&&eqHist.data)setEquityHist([...eqHist.data].reverse().map((r:any)=>({ts:r.ts,equity:Number(r.equity)})))
      if(eqFirst&&!eqFirst.error&&eqFirst.data&&eqFirst.data[0])setEpochTs(new Date((eqFirst.data[0] as any).ts).getTime())
      if(state.data){
        const d=state.data
        setBalance(d.balance);balRef.current=d.balance
        const nr0=normalizeRisk(d.risk);setRisk(nr0);riskRef.current=nr0
        setBotOn(d.active);botRef.current=d.active
        setServerPaperMode(d.paper_mode||false)
        if(d.bot_params)setCurrentBotParams(d.bot_params as Record<string,unknown>)
        if(d.last_optimized_at)setLastOptimizedAt(d.last_optimized_at as string)
        if(d.market_regime)setMarketRegime(d.market_regime as Regime)
        if(d.regime_confidence)setRegimeConf(d.regime_confidence as number)
        if(d.coin_weights)setCoinWeights(d.coin_weights as Record<string,number>)
        if(d.rebalanced_at)setRebalancedAt(d.rebalanced_at as string)
        setShields((d as any).shields||{})
        setFeedHealth((d as any).feed_health||{})
      }
      const all=[...(open.data||[]),...(closed.data||[])]
      tradeRef.current=all.map(t=>mapDbTrade(t as Record<string,unknown>))
      setTrades([...tradeRef.current])
      const knownSyms=new Set(COINS.map(c=>c.sym))
      const openSyms=[...(open.data||[])].map((t:any)=>t.sym as string)
      const extra=[...new Set(openSyms.filter(s=>!knownSyms.has(s)))]
      setExtraWsSyms(extra)
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
          // immediately subscribe futures WS for new dynamic coins
          if(t.status==='OPEN'&&!new Set(COINS.map(c=>c.sym)).has(t.sym)){
            setExtraWsSyms(prev=>[...new Set([...prev,t.sym])])
          }
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
          const nr1=normalizeRisk(d.risk);setRisk(nr1);riskRef.current=nr1
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
    const funcUrl=`${SUPA_URL}/functions/v1/trading-bot`
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

  // v57.0: what the server bot actually holds, per coin. This replaces the map of
  // client-side BUY/SELL verdicts that used to colour the strip, the table and the
  // market map — the page now reports the bot's positions instead of its own opinion.
  const posBySym=useMemo(()=>{
    const m:Record<string,'LONG'|'SHORT'>={}
    for(const t of trades) if(t.status==='OPEN') m[t.sym]=t.side
    return m
  },[trades])

  useEffect(()=>{
    if(!canvasRef.current)return
    const bars=[...(barsMap.current.get(selected)||[])]
    const cb=curBar.current.get(selected);if(cb)bars.push(cb)
    if(bars.length>0)drawCandles(canvasRef.current,bars,posBySym[selected])
  },[tick,selected,posBySym])
  useEffect(()=>{if(eqRef.current)drawEquity(eqRef.current,trades)},[trades])
  // v55: history filtered to the selected range (0 = all)
  const eqView=(()=>{
    if(!eqRangeDays||equityHist.length<2)return equityHist
    const cut=Date.now()-eqRangeDays*86400000
    const f=equityHist.filter(p=>new Date(p.ts).getTime()>=cut)
    return f.length>=2?f:equityHist
  })()
  useEffect(()=>{if(scopeRef.current&&eqView.length>=2)drawScope(scopeRef.current,eqView)},[eqView])
  useEffect(()=>{if(bubRef.current)drawBubbles(bubRef.current,posBySym,prices)},[posBySym,prices])

  // v56.8 — these three controls write to bot_state with the ANON key, which RLS has
  // always blocked. PostgREST answers 204 with zero rows affected, the old code never
  // looked at the result, so the UI flipped locally and silently reverted on the next
  // poll: a control that looks like it works and does nothing. Report what actually
  // happened instead of pretending. (The page is public and unauthenticated, so anon
  // write access is not the fix — the fix is to say so.)
  const reportWrite=async(p:unknown,okMsg:string)=>{
    const r=await (p as Promise<{error?:{message?:string}|null;data?:unknown[]|null}>)
    const wrote=Array.isArray(r?.data)?r.data.length>0:!r?.error
    addLog(wrote?okMsg:'⚠ השינוי לא נשמר — הדף ציבורי וקריאה-בלבד')
    return wrote
  }
  const handleBotToggle=()=>{
    const next=!botOn;setBotOn(next);botRef.current=next
    void reportWrite(
      supaRef.current?.from('bot_state').update({active:next,updated_at:new Date().toISOString()})
        .eq('id',1).select('id'),
      next?'בוט הופעל':'בוט כובה')
  }
  const handleRiskChange=(r:RiskType)=>{
    setRisk(r);riskRef.current=r
    void reportWrite(
      supaRef.current?.from('bot_state').update({risk:r,updated_at:new Date().toISOString()})
        .eq('id',1).select('id'),
      `סיכון: ${r}`)
  }

  const openTrades  = trades.filter(t=>t.status==='OPEN')
  const closed      = trades.filter(t=>t.status!=='OPEN')
  const wins        = closed.filter(t=>(t.pnl||0)>0).length
  // v52: history tab shows the current account era only (pre-reset trades stay in DB, out of sight)
  const eraClosed   = closed.filter(t=>!epochTs || (t.closedTs??0)>=epochTs)
  const eraWins     = eraClosed.filter(t=>(t.pnl||0)>0).length
  const winRate     = closed.length>0?(wins/closed.length*100):0
  const realizedPnl = closed.reduce((a,t)=>a+(t.pnl||0),0)
  const unrealizedPnl = openTrades.reduce((a,t)=>{
    const cur=prices[t.sym]?.price||t.entry
    return a+(t.side==='LONG'?(cur-t.entry):(t.entry-cur))*t.size-t.fee
  },0)
  const totalPnl       = realizedPnl+unrealizedPnl
  const stratStats = (name:string) => {
    const cl = closed.filter(t=>t.strategy===name && (!epochTs || (t.closedTs??0)>=epochTs))
    const w2 = cl.filter(t=>(t.pnl||0)>0).length
    const rp = cl.reduce((a,t)=>a+(t.pnl||0),0)
    const op = openTrades.filter(t=>t.strategy===name).length
    return {n:cl.length, wr:cl.length?w2/cl.length*100:0, rp, op}
  }
  const stDonch = stratStats('DONCH4H'), stRota = stratStats('ROTA')
  const eqPath = (()=>{
    if (equityHist.length<2) return null
    const vals=equityHist.slice(-384).map(p=>p.equity)
    const min=Math.min(...vals), max=Math.max(...vals), rng=Math.max(max-min,1)
    const W=150, H=36
    const pts=equityHist.slice(-384).map((p,i,arr2)=>`${(i/(arr2.length-1)*W).toFixed(1)},${(H-((p.equity-min)/rng)*H).toFixed(1)}`)
    return {d:'M'+pts.join(' L'), up: vals[vals.length-1]>=vals[0], last: vals[vals.length-1]}
  })()
  // v47.1: equity-curve max drawdown (real, from bot_equity snapshots) +
  // progress toward the 50-trade live-vs-backtest checkpoint
  const eqMaxDD = (()=>{
    let pk=-Infinity, dd=0
    for (const p of equityHist) { if (p.equity>pk) pk=p.equity; if (pk>0) dd=Math.max(dd,1-p.equity/pk) }
    return dd*100
  })()
  const donchProgress = Math.min(stDonch.n, 50)
  // v52: live avg R (era DONCH4H closes carrying risk_usd) vs the +0.046R target
  const liveR = (()=>{
    const rs=eraClosedR()
    if (!rs.length) return null
    return {avg: rs.reduce((a2,x)=>a2+x,0)/rs.length, n: rs.length}
  })()
  function eraClosedR(){
    return closed.filter(t=>t.strategy==='DONCH4H' && (!epochTs||(t.closedTs??0)>=epochTs) && (t.riskUsd||0)>0)
      .map(t=>(t.pnl||0)/(t.riskUsd as number))
  }
  // v56 PROOF PANEL: honest live-vs-backtest verdict. A point estimate alone
  // ("avg R = 0.03") is misleading at small n — the 95% CI is huge. This turns
  // "trust the backtest" into "is the live sample statistically consistent with
  // the +0.046R / 66% WR expectation band?" No strategy change; pure evidence.
  const proof = (()=>{
    const rs=eraClosedR()
    const n=rs.length
    if (n<1) return null
    const R_TGT=0.046, WR_TGT=0.66
    const mean=rs.reduce((a2,x)=>a2+x,0)/n
    const variance=n>1?rs.reduce((a2,x)=>a2+(x-mean)**2,0)/(n-1):0
    const sd=Math.sqrt(variance)
    const se=n>0?sd/Math.sqrt(n):0
    const rLo=mean-1.96*se, rHi=mean+1.96*se
    const wins2=rs.filter(x=>x>0).length
    const p=wins2/n
    const seP=Math.sqrt(Math.max(p*(1-p),0)/n)
    const wrLo=Math.max(0,p-1.96*seP), wrHi=Math.min(1,p+1.96*seP)
    // verdict: green=confirms edge, blue=consistent/too-few, yellow=drifting low,
    // red=live edge statistically negative (real concern → investigate before scaling)
    let verdict:string, vcol:string
    if (n<15) { verdict='מדגם קטן — עוד '+(15-n)+' לאמינות'; vcol=C.muted }
    else if (rLo>R_TGT) { verdict='מעל הרצועה ✓✓ (אדג\' חזק מהצפוי)'; vcol=C.green }
    else if (R_TGT>=rLo && R_TGT<=rHi) { verdict='תואם רצועה ✓ (+0.046 בתוך הרווח)'; vcol=C.green }
    else if (rHi<0) { verdict='⚠ אדג\' חי שלילי — לחקור לפני הגדלה'; vcol=C.red }
    else { verdict='מתחת לרצועה — עדיין חיובי, במעקב'; vcol=C.yellow }
    return {n,mean,sd,rLo,rHi,p,wrLo,wrHi,verdict,vcol,R_TGT,WR_TGT}
  })()
  // v67.2: collateral actually posted (notional / leverage), not the full
  // notional — at 2x the old sum booked the borrowed half as account value.
  const lockedNotional = openTrades.reduce((a,t)=>a+t.entry*t.size/(t.lev||1),0)
  const totalValue     = balance+lockedNotional+unrealizedPnl
  const sharpe         = calcSharpe(trades)
  const maxDD          = calcMaxDD(trades)
  const selInfo        = prices[selected]
  const supaLive       = supaStatus==='live'
  const fmtP           = (p:number)=>p>=1000?p.toFixed(2):p>=1?p.toFixed(4):p.toFixed(6)
  const animBalance    = useAnimatedCounter(totalValue)
  const M:CSSProperties= {fontFamily:"'IBM Plex Mono','SF Mono',ui-monospace,Menlo,Consolas,monospace",userSelect:'none' as const,direction:'rtl'}
  const regColor       = REGIME_COLOR[marketRegime]||C.blue

  const TABS:[TabType,string][]=[
    ['scanner','סריקה'],['history','היסטוריה'],
    ['stats','סטטיסטיקות'],['analysis','ניתוח'],['ai','AI OPT'],['regime','שוק'],
  ]

  return (
    <div style={{...M,
      background:C.bg,
      minHeight:'100vh',color:C.text,padding:'8px',fontSize:'11px',overflowX:'hidden',
    }}>
      {/* v53.1 redesign: ambient canvas effects (matrix/stars/cursor glow) removed —
          the instrument reads better on a still ground, and it saves battery */}
      <style dangerouslySetInnerHTML={{__html:STYLE_TAG}}/>

      {/* ══ TOAST STACK ══ */}
      <div style={{position:'fixed',top:'16px',right:'16px',zIndex:300,display:'flex',flexDirection:'column',gap:'8px',pointerEvents:'none'}}>
        {toasts.map(t=>(
          <div key={t.id} className="toast-enter" style={{
            padding:'10px 16px',borderRadius:'10px',fontSize:'11px',fontWeight:700,minWidth:'190px',
            background:`linear-gradient(135deg,${t.color}22,rgba(2,8,20,0.96))`,
            border:`1px solid ${t.color}55`,color:t.color,
            boxShadow:`0 4px 24px ${t.color}30,0 0 0 1px ${t.color}20`,
            backdropFilter:'blur(14px)',
          }}>
            {t.msg}
            {t.pnl!==undefined&&(
              <span style={{marginRight:'8px',color:t.pnl>=0?C.green:C.red,fontWeight:900}}>
                {' '}{t.pnl>=0?'+':''}{t.pnl.toFixed(2)}$
              </span>
            )}
          </div>
        ))}
      </div>

      {/* ══ HEADER ══ */}
      <div style={{
        background:C.panel,
        border:`1px solid ${C.border}`,borderRadius:'6px',
        padding:'12px 16px',marginBottom:'8px',
        boxShadow:C.glow,
        position:'relative',overflow:'hidden',
      }}>
        {/* row 1: title + status + regime */}
        <div style={{display:'flex',flexWrap:'wrap' as const,gap:'8px',alignItems:'center',marginBottom:'10px'}}>
          <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
            <span className="nx-title" style={{fontSize:'16px',fontWeight:900}}>
              NEXUS TRADE
            </span>
            <span style={{fontSize:'8px',color:C.blue,padding:'2px 6px',border:`1px solid ${C.blue}40`,borderRadius:'4px',
              boxShadow:`0 0 8px ${C.blue}30`,background:`${C.blue}10`}}
              title={release?`commit ${release.sha}`:'הגרסה החיה טרם נקראה'}>
              {release?`${release.bot_version} · ${release.sha.slice(0,7)}`:'…'}</span>
          </div>

          <div style={{display:'flex',gap:'5px',flexWrap:'wrap' as const}}>
            <Chip label={wsStatus==='live'?'חי':'מתחבר...'} color={wsStatus==='live'?C.green:C.yellow} dot={wsStatus==='live'}/>
            {supaStatus!=='off'&&<Chip label={supaLive?'ענן 24/7':'מתחבר'} color={supaLive?C.blue:C.yellow} dot={supaLive}/>}
            <span className="glow-beat" style={{
              display:'inline-flex',alignItems:'center',gap:'5px',
              padding:'3px 10px',borderRadius:'20px',fontSize:'9px',fontWeight:800,
              background:`${regColor}18`,color:regColor,border:`1px solid ${regColor}50`,
            }}>
              {REGIME_HE[marketRegime]||marketRegime} · {(regimeConf*100).toFixed(0)}%
            </span>
            <button className="nx-btn" onClick={()=>{
              const next=!serverPaperMode;setServerPaperMode(next)
              void reportWrite(
                supaRef.current?.from('bot_state').update({paper_mode:next}).eq('id',1).select('id'),
                next?'מצב נייר':'מצב חי')
            }} style={{
              border:`1px solid ${serverPaperMode?C.teal:C.red}44`,borderRadius:'20px',
              padding:'3px 10px',fontSize:'9px',fontWeight:700,
              background:serverPaperMode?`${C.teal}12`:`${C.red}12`,
              color:serverPaperMode?C.teal:C.red,
            }}>{serverPaperMode?'נייר':'אמיתי'}</button>
          </div>

          {/* portfolio value */}
          <div style={{marginRight:'auto',textAlign:'right' as const}}>
            <div className="balance-num" style={{fontWeight:900,fontSize:'28px',color:C.bright,letterSpacing:'-1px',lineHeight:1}}>
              ${animBalance.toFixed(0)}
            </div>
            <div style={{fontSize:'11px',fontWeight:800,
              color:totalPnl>=0?C.green:C.red,
              }}>
              {totalPnl>=0?'+':''}{totalPnl.toFixed(2)} כולל
            </div>
          </div>
        </div>

        {/* row 2: quick stats + controls */}
        <div style={{display:'flex',flexWrap:'wrap' as const,gap:'6px',alignItems:'center'}}>
          {[
            ['WIN',winRate.toFixed(0)+'%',winRate>50?C.green:C.red],
            ['שארפ',sharpe.toFixed(2),sharpe>1?C.green:C.yellow],
            ['DD',maxDD.toFixed(1)+'%',maxDD<10?C.green:maxDD<25?C.yellow:C.red],
            ['עסקאות',trades.length.toString(),C.blue],
            ['פתוחות',openTrades.length.toString(),C.yellow],
          ].map(([k,v,col])=>(
            <div key={k} style={{background:'rgba(255,255,255,0.03)',border:`1px solid ${C.dim}`,borderRadius:'8px',padding:'4px 10px',display:'flex',gap:'6px',alignItems:'baseline'}}>
              <span style={{fontSize:'8px',color:C.muted}}>{k}</span>
              <span style={{fontSize:'12px',fontWeight:900,color:col as string}}>{v}</span>
            </div>
          ))}
          <div style={{marginRight:'auto'}}/>
          {(['low','medium','high'] as const).map(r=>(
            <button key={r} className="nx-btn" onClick={()=>handleRiskChange(r)} style={{
              border:`1px solid ${risk===r?C.pink:'rgba(255,255,255,0.08)'}`,borderRadius:'8px',
              padding:'5px 12px',fontSize:'10px',fontWeight:700,
              background:risk===r?`${C.pink}18`:'rgba(255,255,255,0.03)',
              color:risk===r?C.pink:C.muted,
              boxShadow:risk===r?`0 0 14px ${C.pink}30`:undefined,
            }}>{RISK_HE[r]}</button>
          ))}
          <button className="nx-btn" onClick={handleBotToggle} style={{
            border:`1px solid ${botOn?C.green:C.muted}`,borderRadius:'8px',
            padding:'5px 14px',fontSize:'10px',fontWeight:700,
            background:botOn?`${C.green}15`:'rgba(255,255,255,0.03)',
            color:botOn?C.green:C.muted,
            boxShadow:botOn?`0 0 14px ${C.green}30`:undefined,
          }}>{botOn?'בוט פעיל':'בוט כבוי'}</button>
        </div>
      </div>

      {/* ══ EQUITY SCOPE HERO (v53.1 redesign) ══ */}
      {equityHist.length>=2&&(()=>{
        const base=eqView[0].equity
        const deltaPct=base>0?((totalValue/base-1)*100):0
        return (
          <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:'6px',
            padding:'12px 14px 6px',marginBottom:'8px',boxShadow:C.glow}}>
            <div style={{display:'flex',alignItems:'baseline',gap:'14px',flexWrap:'wrap' as const,marginBottom:'2px'}}>
              <span style={{fontSize:'10px',color:C.muted,letterSpacing:'0.5px'}}>הון כולל (mark-to-market)</span>
              <span style={{fontSize:'26px',fontWeight:700,color:C.bright,direction:'ltr' as const,lineHeight:1.1}}>
                ${totalValue.toLocaleString(undefined,{maximumFractionDigits:2})}
              </span>
              <span style={{fontSize:'12px',fontWeight:700,direction:'ltr' as const,
                color:deltaPct>=0?C.green:C.red}}>
                {deltaPct>=0?'+':''}{deltaPct.toFixed(2)}% מאז האיפוס
              </span>
              <span style={{marginRight:'auto',display:'flex',gap:'4px',alignItems:'center'}}>
                {[[7,'7י'],[30,'30י'],[0,'הכל']].map(([d,lbl])=>(
                  <button key={String(d)} onClick={()=>setEqRangeDays(d as number)} style={{
                    fontSize:'9px',fontWeight:700,padding:'2px 7px',borderRadius:'5px',cursor:'pointer',
                    border:`1px solid ${eqRangeDays===d?C.bright:C.border}`,
                    background:eqRangeDays===d?`${C.bright}18`:'transparent',
                    color:eqRangeDays===d?C.bright:C.muted}}>{lbl as string}</button>
                ))}
                <span style={{fontSize:'9px',color:C.muted,marginRight:'6px'}}>{eqView.length} דגימות</span>
              </span>
            </div>
            <canvas ref={scopeRef} width={880} height={210}
              style={{width:'100%',height:'190px',display:'block'}}/>
          </div>
        )
      })()}

      {/* ══ COIN STRIP ══ */}
      <div style={{display:'flex',gap:'4px',overflowX:'auto' as const,marginBottom:'8px',paddingBottom:'2px',scrollbarWidth:'none' as const}}>
        {COINS.map(c=>{
          const info=prices[c.sym];const chg=info?.change||0;const held=posBySym[c.sym]
          const active=selected===c.sym;const wt=coinWeights[c.sym]
          const sigCol=held==='LONG'?C.green:held==='SHORT'?C.red:undefined
          return (
            <button key={c.sym} className="nx-btn" onClick={()=>setSelected(c.sym)} style={{
              flexShrink:0,minWidth:'64px',padding:'6px 7px',borderRadius:'10px',
              textAlign:'center' as const,
              border:`1px solid ${active?C.pink:sigCol?sigCol+'55':C.dim}`,
              background:active?`linear-gradient(135deg,${C.pink}18,${C.purple}10)`:'rgba(3,8,26,0.75)',
              backdropFilter:'blur(10px)',color:C.text,
              boxShadow:active?`0 0 20px ${C.pink}28, 0 4px 12px rgba(0,0,0,0.5)`:
                sigCol?`0 0 10px ${sigCol}18`:undefined,
            }}>
              <div style={{fontWeight:800,fontSize:'10px',color:active?C.pink:sigCol||C.text}}>{c.sym}</div>
              <div style={{fontSize:'8px',color:chg>0.5?C.green:chg<-0.5?C.red:C.muted}}>{chg>=0?'+':''}{chg.toFixed(1)}%</div>
              {wt&&<div style={{fontSize:'7px',color:wt>1.2?C.green:wt<0.8?C.red:C.muted,fontWeight:700}}>{wt.toFixed(1)}×</div>}
              {held&&<div style={{fontSize:'9px',fontWeight:900,color:sigCol}}>{held==='LONG'?'▲':'▼'}</div>}
            </button>
          )
        })}
      </div>

      {/* ══ TICKER TAPE ══ */}
      <div style={{overflow:'hidden',marginBottom:'8px',height:'24px',
        background:'rgba(0,8,24,0.7)',border:`1px solid ${C.border}`,borderRadius:'8px',
        position:'relative',display:'flex',alignItems:'center'}}>
        <div style={{position:'absolute',left:0,top:0,bottom:0,width:'30px',zIndex:2,
          background:'linear-gradient(90deg,rgba(0,8,24,0.9),transparent)',pointerEvents:'none'}}/>
        <div style={{position:'absolute',right:0,top:0,bottom:0,width:'30px',zIndex:2,
          background:'linear-gradient(270deg,rgba(0,8,24,0.9),transparent)',pointerEvents:'none'}}/>
        <div className="ticker-track">
          {[...COINS,...COINS].map((c,i)=>{
            const info=prices[c.sym];const chg=info?.change||0
            return (
              <span key={i} style={{display:'inline-flex',alignItems:'center',gap:'4px',
                padding:'0 12px',fontSize:'9px',fontWeight:700,height:'24px',
                borderRight:`1px solid rgba(0,200,255,0.08)`,whiteSpace:'nowrap' as const,
                color:chg>0?C.green:chg<0?C.red:C.muted}}>
                <span style={{color:C.blue,fontWeight:900}}>{c.sym}</span>
                {info?fmtP(info.price):'—'}
                <span>{chg>=0?'+':''}{chg.toFixed(2)}%</span>
              </span>
            )
          })}
        </div>
      </div>

      {/* ══ MAIN GRID ══ */}
      <div style={{display:'grid',gridTemplateColumns:'160px 1fr',gap:'8px',marginBottom:'8px'}}>

        {/* STATS SIDEBAR */}
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
            ['פריצות',`${stDonch.op}פ ${stDonch.n}ס ${(stDonch.rp>=0?'+':'')}${stDonch.rp.toFixed(0)}$`,stDonch.rp>=0?C.green:C.red],
            ['רוטציה',`${stRota.op}פ ${stRota.n}ס ${(stRota.rp>=0?'+':'')}${stRota.rp.toFixed(0)}$ ${stRota.wr.toFixed(0)}%`,stRota.rp>=0?C.green:C.red],
            ['נסיגת הון',eqMaxDD.toFixed(1)+'%',eqMaxDD<10?C.green:eqMaxDD<25?C.yellow:C.red],
            ['R ממוצע חי',liveR?`${liveR.avg>=0?'+':''}${liveR.avg.toFixed(3)}R (${liveR.n}) / +0.046`:'נבנה מעכשיו',liveR?(liveR.avg>=0?C.green:C.red):C.muted],
          ].map(([k,v,col])=>(
            <div key={k} className="shimmer-row" style={{
              border:`1px solid ${C.dim}`,borderRadius:'9px',
              padding:'6px 10px',display:'flex',justifyContent:'space-between',alignItems:'center',
              backdropFilter:'blur(10px)',
            }}>
              <span style={{color:C.muted,fontSize:'9px'}}>{k}</span>
              <span style={{color:col as string,fontWeight:800,fontSize:'11px'}}>{v}</span>
            </div>
          ))}
          <ProgressRing value={donchProgress} max={50} color={donchProgress>=50?C.green:C.blue} label="בדיקת רצועות"/>
          {/* v56: live-vs-backtest PROOF panel — statistical verdict, not a raw number */}
          {proof&&(
            <div className="shimmer-row" style={{border:`1px solid ${proof.vcol}`,borderRadius:'9px',padding:'7px 10px',backdropFilter:'blur(10px)',display:'flex',flexDirection:'column' as const,gap:'4px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{color:C.muted,fontSize:'9px'}}>הוכחה חיה vs בקטסט</span>
                <span style={{color:C.muted,fontSize:'8px'}}>n={proof.n}</span>
              </div>
              <div style={{fontSize:'8.5px',color:C.muted,lineHeight:1.5}}>
                <div style={{display:'flex',justifyContent:'space-between'}}>
                  <span>R ממוצע (95%)</span>
                  <span style={{color:proof.vcol,fontWeight:800}}>
                    {proof.mean>=0?'+':''}{proof.mean.toFixed(3)} [{proof.rLo>=0?'+':''}{proof.rLo.toFixed(3)},{proof.rHi>=0?'+':''}{proof.rHi.toFixed(3)}]
                  </span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between'}}>
                  <span>יעד רצועה</span>
                  <span style={{color:C.muted}}>+{proof.R_TGT.toFixed(3)}R</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between'}}>
                  <span>זכייה (95%)</span>
                  <span style={{fontWeight:700}}>{(proof.p*100).toFixed(0)}% [{(proof.wrLo*100).toFixed(0)}–{(proof.wrHi*100).toFixed(0)}] / 66%</span>
                </div>
              </div>
              <div style={{fontSize:'8.5px',fontWeight:800,color:proof.vcol,textAlign:'center' as const,paddingTop:'2px',borderTop:`1px solid ${C.dim}`}}>{proof.verdict}</div>
            </div>
          )}
          <div className="shimmer-row" style={{border:`1px solid ${Object.values(shields).some(Boolean)?C.red:C.dim}`,borderRadius:'9px',padding:'6px 10px',display:'flex',justifyContent:'space-between',alignItems:'center',backdropFilter:'blur(10px)'}}>
            <span style={{color:C.muted,fontSize:'9px'}}>מגנים</span>
            <span style={{color:Object.values(shields).some(Boolean)?C.red:C.green,fontWeight:800,fontSize:'11px'}}>
              {(()=>{const m:[string,string][]=[['donch_paused','פריצות⏸'],['rota_paused','רוטציה⏸'],['day_loss_paused','בלם-5%'],['depeg_paused','דה-פג!']];const act=m.filter(([k])=>shields[k]).map(([,v])=>v);return act.length?act.join(' '):'הכל פעיל ✓'})()}
            </span>
          </div>
          {feedHealth.ts&&(
            <div style={{background:'rgba(3,8,26,0.85)',border:`1px solid ${C.dim}`,borderRadius:'9px',padding:'6px 10px',backdropFilter:'blur(10px)'}}>
              <div style={{fontSize:'9px',color:C.muted,marginBottom:'3px'}}>בריאות מקורות דאטה</div>
              <div style={{display:'flex',gap:'8px',flexWrap:'wrap' as const}}>
                {(['binance','okx','bybit'] as const).map(src=>{
                  const st=feedHealth[src]||{ok:0,fail:0}
                  const tot=st.ok+st.fail
                  const rate=tot>0?st.ok/tot:0
                  const col=tot===0?C.muted:rate>=0.9?C.green:rate>=0.5?C.yellow:C.red
                  const label=tot===0?'—':rate>=0.9?'LIVE':rate>=0.5?'חלקי':'נפל'
                  const primary=feedHealth.source===src||(src==='binance'&&(feedHealth.source==='fapi'||feedHealth.source==='spot'))
                  return (
                    <span key={src} style={{fontSize:'9px',fontWeight:700,color:col,display:'inline-flex',alignItems:'center',gap:'4px'}}>
                      <span style={{width:'5px',height:'5px',borderRadius:'50%',background:col,display:'inline-block'}}/>
                      {src.toUpperCase()}{primary?'★':''} {label}{tot>0?` ${st.ok}/${tot}`:''}
                    </span>
                  )
                })}
              </div>
            </div>
          )}
          {eqPath&&(
            <div style={{background:'rgba(3,8,26,0.85)',border:`1px solid ${C.dim}`,borderRadius:'9px',padding:'6px 10px'}}>
              <div style={{fontSize:'9px',color:C.muted,marginBottom:'2px'}}>עקומת הון (4 ימים)</div>
              <svg width="150" height="36" style={{display:'block'}}>
                <path d={eqPath.d} fill="none" stroke={eqPath.up?C.green:C.red} strokeWidth="1.5"/>
              </svg>
            </div>
          )}
          {/* v57.0: this card used to print "SL 1.0% · TP 2.4% · מקס 30 פוזיציות" —
              the retired client engine's fixed levels, which the bot has never used.
              These are the rules the server actually trades. */}
          <div style={{background:'rgba(3,8,26,0.85)',border:`1px solid ${C.dim}`,borderRadius:'9px',padding:'7px 10px',fontSize:'9px',color:C.muted,backdropFilter:'blur(10px)'}}>
            <div><span style={{color:C.cyan,fontWeight:800}}>DONCH4H</span> · דונצ'יאן 15 על נרות 4 שעות · שער <span style={{color:C.yellow}}>ADX&gt;22</span></div>
            <div style={{marginTop:'2px'}}>סטופ <span style={{color:C.red}}>1.4×ATR</span> · יציאה <span style={{color:C.green}}>⅓@0.6R→BE · ⅓@1.0R · שליש נגרר</span></div>
            <div style={{marginTop:'2px'}}><span style={{color:C.cyan,fontWeight:800}}>ROTA</span> · מומנטום 14 ימים כל 48 שעות · לונג 8 / שורט 8</div>
            {/* v61.0: read the risk the bot ACTUALLY trades at, from the release
                manifest. This card hardcoded 1.25% while the bot ran 1.75% since
                v57.2 — the page was stating something false about the system,
                the same defect class as the "_v23_5M" label. */}
            <div style={{marginTop:'2px'}}>סיכון בסיס <span style={{color:C.yellow}}>
              {release?.base_risk_pct!=null?`${(release.base_risk_pct*100).toFixed(2)}%`:'—'}
            </span> לעסקה · תקרת חשיפה 95%</div>
          </div>
        </div>

        {/* CHART CARD */}
        <Card3D style={{padding:'12px'}} color={posBySym[selected]==='LONG'?C.green:posBySym[selected]==='SHORT'?C.red:C.blue}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}>
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              <span style={{fontWeight:900,fontSize:'14px',color:C.bright}}>{selected}<span style={{color:C.muted,fontWeight:400}}>/USDT</span></span>
            </div>
            <div style={{textAlign:'right' as const}}>
              <div style={{fontWeight:900,fontSize:'15px',color:selInfo?.change>0?C.green:selInfo?.change<0?C.red:C.text}}>
                {selInfo?fmtP(selInfo.price):'—'}
              </div>
              <div style={{fontSize:'10px',color:selInfo?.change>0?C.green:selInfo?.change<0?C.red:C.muted}}>
                {selInfo?`${selInfo.change>=0?'+':''}${selInfo.change.toFixed(2)}%`:''}
              </div>
            </div>
          </div>

          <div style={{position:'relative',marginBottom:'8px'}}>
            <canvas ref={canvasRef} width={600} height={155}
              style={{width:'100%',height:'155px',borderRadius:'8px',background:'rgba(1,4,16,0.9)',display:'block',
                border:`1px solid ${C.dim}`}}/>
            <div className="scan-line"/>
          </div>

          {/* v57.0: the EMA/RSI/MACD/BB/StochRSI pill row and the BUY/SELL banner
              below it were the retired client engine's verdict on 1-minute bars.
              They were the single most misleading thing on this page — a visitor
              read "▲ קנייה 4/5" and assumed that was the bot. What the bot has to
              say about this coin is whether it is holding it, so that is what is
              shown; anything else would be this page inventing a signal again. */}
          <div style={{
            padding:'10px 14px',borderRadius:'10px',textAlign:'center' as const,
            fontWeight:900,fontSize:'14px',letterSpacing:'0.5px',
            background:posBySym[selected]==='LONG'
              ?`linear-gradient(135deg,${C.green}14,${C.teal}08)`
              :posBySym[selected]==='SHORT'
                ?`linear-gradient(135deg,${C.red}14,${C.pink}08)`
                :'rgba(10,20,50,0.5)',
            border:`1px solid ${posBySym[selected]==='LONG'?C.green+'45':posBySym[selected]==='SHORT'?C.red+'45':C.dim}`,
            color:posBySym[selected]==='LONG'?C.green:posBySym[selected]==='SHORT'?C.red:C.muted,
          }}>
            {(()=>{
              const held=openTrades.filter(t=>t.sym===selected)
              if(held.length===0)return '\u2014 הבוט לא מחזיק'
              const side=held[0].side==='LONG'?'\u25b2 לונג':'\u25bc שורט'
              const strat=[...new Set(held.map(t=>t.strategy))].join(' + ')
              const pnl=held.reduce((a,t)=>a+(livePositions[t.id]?.pnl??0),0)
              return `${side} · ${strat}${held.length>1?` \u00d7${held.length}`:''} · ${pnl>=0?'+':''}${pnl.toFixed(2)}$`
            })()}
          </div>
        </Card3D>
      </div>

      {/* ══ OPEN POSITIONS ══ */}
      {openTrades.length>0&&(
        <div style={{
          background:'rgba(3,8,26,0.88)',border:`1px solid rgba(0,200,255,0.12)`,borderRadius:'14px',
          padding:'10px 12px',marginBottom:'8px',backdropFilter:'blur(16px)',
        }}>
          <div style={{color:C.blue,fontWeight:700,fontSize:'10px',marginBottom:'8px',display:'flex',alignItems:'center',gap:'6px'}}>
            <span className="live-dot" style={{width:'6px',height:'6px',borderRadius:'50%',background:C.blue,display:'inline-block'}}/>
            פוזיציות פתוחות ({openTrades.length})
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))',gap:'6px'}}>
            {openTrades.map(t=>(
              <LivePosition key={t.id} t={t} live={livePositions[t.id]} fmtP={fmtP}
                /* v56.8: manual close is owner-only now — close-trade requires the
                   service-role key, which a public page cannot hold. Hiding the
                   button rather than leaving one that always 403s. */
                onClose={undefined}/>
            ))}
          </div>
        </div>
      )}

      {/* ══ TABS ══ */}
      <div style={{
        background:'rgba(3,8,26,0.9)',border:`1px solid rgba(0,200,255,0.1)`,borderRadius:'14px',
        padding:'12px',marginBottom:'8px',backdropFilter:'blur(16px)',
      }}>
        {/* tab nav */}
        <div style={{display:'flex',gap:'4px',marginBottom:'12px',flexWrap:'wrap' as const,
          background:'rgba(255,255,255,0.02)',borderRadius:'10px',padding:'4px'}}>
          {TABS.map(([t,label])=>(
            <button key={t} className="nx-btn" onClick={()=>setTab(t)} style={{
              border:'none',borderRadius:'7px',padding:'6px 14px',fontSize:'10px',fontWeight:700,
              background:tab===t?`linear-gradient(135deg,${C.pink}22,${C.purple}14)`:'transparent',
              color:tab===t?C.pink:C.muted,
              boxShadow:tab===t?`0 0 14px ${C.pink}28,inset 0 1px 0 ${C.pink}20`:undefined,
              transition:'all 0.18s',
            }}>{label}</button>
          ))}
          <span style={{marginRight:'auto',color:C.muted,fontSize:'9px',alignSelf:'center',paddingRight:'8px'}}>
            {eraClosed.length} סגורות · {eraWins} זכיות
          </span>
        </div>

        {/* ── SCANNER ── */}
        {tab==='scanner'&&(
          <div style={{overflowX:'auto' as const}}>
            <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:'10px'}}>
              <thead>
                <tr style={{background:'rgba(0,200,255,0.04)'}}>
                  {['מטבע','מחיר','24%','משקל ROTA','אסטרטגיה','פוזיציה','P&L'].map(h=>(
                    <th key={h} style={{padding:'6px 8px',textAlign:'right' as const,color:C.muted,
                      borderBottom:`1px solid ${C.dim}`,fontWeight:700,fontSize:'9px',letterSpacing:'0.5px'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COINS.map(c=>{
                  const info=prices[c.sym];if(!info)return null
                  // v57.0: score / RSI / ADX came from the retired client engine and
                  // described a strategy nobody runs. These columns describe the bot.
                  const wt=coinWeights[c.sym]
                  const held=openTrades.filter(t=>t.sym===c.sym)
                  const side=held[0]?.side
                  const sigCol=side==='LONG'?C.green:side==='SHORT'?C.red:undefined
                  const pnl=held.reduce((a,t)=>a+(livePositions[t.id]?.pnl??0),0)
                  const strat=[...new Set(held.map(t=>t.strategy))].join('+')
                  return (
                    <tr key={c.sym} className="nx-row" onClick={()=>setSelected(c.sym)} style={{
                      cursor:'pointer',borderBottom:`1px solid ${C.dim}`,transition:'background 0.1s',
                    }}>
                      <td style={{padding:'5px 8px',color:sigCol||C.blue,fontWeight:800}}>{c.sym}</td>
                      <td style={{padding:'5px 8px',color:C.text,fontFamily:'monospace'}}>{fmtP(info.price)}</td>
                      <td style={{padding:'5px 8px',color:info.change>0?C.green:info.change<0?C.red:C.muted,fontWeight:700}}>{info.change>=0?'+':''}{info.change.toFixed(2)}%</td>
                      <td style={{padding:'5px 8px',color:wt?(wt>1.2?C.green:wt<0.7?C.red:C.muted):C.dim,fontWeight:700}}>{wt?wt.toFixed(1)+'×':'—'}</td>
                      <td style={{padding:'5px 8px',color:strat?C.cyan:C.dim,fontWeight:700,fontSize:'9px'}}>{strat||'—'}</td>
                      <td style={{padding:'5px 8px',fontWeight:900,color:sigCol||C.dim}}>
                        {side==='LONG'?'▲ לונג':side==='SHORT'?'▼ שורט':'—'}{held.length>1?` ×${held.length}`:''}
                      </td>
                      <td style={{padding:'5px 8px',fontWeight:700,fontFamily:'monospace',color:held.length===0?C.dim:pnl>=0?C.green:C.red}}>
                        {held.length===0?'—':`${pnl>=0?'+':''}${pnl.toFixed(2)}`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── HISTORY ── */}
        {tab==='history'&&(
          eraClosed.length===0
            ?<div style={{color:C.dim,textAlign:'center' as const,padding:'32px',fontSize:'12px'}}>אין עסקאות סגורות — הבוט עוקב</div>
            :<div style={{overflowX:'auto' as const}}>
              <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:'10px'}}>
                <thead>
                  <tr style={{background:'rgba(0,200,255,0.04)'}}>
                    {['מטבע','כיוון','כניסה','יציאה','P&L','%','סטטוס','זמן סגירה'].map(h=>(
                      <th key={h} style={{padding:'6px 8px',textAlign:'right' as const,color:C.muted,
                        borderBottom:`1px solid ${C.dim}`,fontWeight:700,fontSize:'9px',whiteSpace:'nowrap' as const}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...eraClosed]
                    .sort((a,b)=>(b.closedTs||b.ts)-(a.closedTs||a.ts))
                    .slice(0,50)
                    .map(t=>{
                      const closeTime=t.closedTs||t.ts
                      const d=new Date(closeTime)
                      const dateStr=`${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}`
                      const timeStr=`${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
                      return(
                    <tr key={t.id} className="nx-row" style={{borderBottom:`1px solid ${C.dim}`}}>
                      <td style={{padding:'5px 8px',color:C.cyan,fontWeight:700}}>{t.sym}</td>
                      <td style={{padding:'5px 8px',color:t.side==='LONG'?C.green:C.red,fontWeight:700}}>{t.side==='LONG'?'▲ לונג':'▼ שורט'}</td>
                      <td style={{padding:'5px 8px',color:C.muted,fontFamily:'monospace'}}>{fmtP(t.entry)}</td>
                      <td style={{padding:'5px 8px',color:C.muted,fontFamily:'monospace'}}>{t.exit?fmtP(t.exit):'—'}</td>
                      <td style={{padding:'5px 8px',color:(t.pnl||0)>=0?C.green:C.red,fontWeight:800}}>{(t.pnl||0)>=0?'+':''}{(t.pnl||0).toFixed(2)}</td>
                      <td style={{padding:'5px 8px',color:(t.pnlPct||0)>=0?C.green:C.red}}>{((t.pnlPct||0)*100).toFixed(2)}%</td>
                      <td style={{padding:'5px 8px',fontWeight:700,
                        color:t.status==='TP'?C.green:t.status==='SL'?C.red:C.yellow}}>
                        {t.status==='TP'?'✓ TP':t.status==='SL'?'✗ SL':'~ TRAIL'}
                      </td>
                      <td style={{padding:'5px 8px',fontFamily:'monospace',whiteSpace:'nowrap' as const}}>
                        <div style={{color:C.text,fontSize:'9px'}}>{timeStr}</div>
                        <div style={{color:C.muted,fontSize:'8px'}}>{dateStr}</div>
                      </td>
                    </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
        )}

        {/* ── STATS ── */}
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
              ['יתרה פנויה','$'+balance.toFixed(0),C.yellow],
            ] as [string,string,string][]).map(([label,value,color])=>(
              <Tile key={label} label={label} value={value} color={color}/>
            ))}
          </div>
        )}

        {/* ── ANALYSIS ── */}
        {tab==='analysis'&&(()=>{
          if(closed.length===0)return<div style={{color:C.dim,textAlign:'center' as const,padding:'32px'}}>אין עסקאות לניתוח עדיין</div>

          // by symbol
          const bySym: Record<string,{count:number;wins:number;pnl:number;holdMin:number[]}>={}
          for(const t of closed){
            if(!bySym[t.sym])bySym[t.sym]={count:0,wins:0,pnl:0,holdMin:[]}
            const d=bySym[t.sym]
            d.count++; d.pnl+=(t.pnl||0)
            if((t.pnl||0)>0)d.wins++
            if(t.closedTs&&t.ts)d.holdMin.push((t.closedTs-t.ts)/60000)
          }
          const symRows=Object.entries(bySym).sort((a,b)=>Math.abs(b[1].pnl)-Math.abs(a[1].pnl))

          // by side
          const longT=closed.filter(t=>t.side==='LONG')
          const shortT=closed.filter(t=>t.side==='SHORT')
          const longWr=longT.length?longT.filter(t=>(t.pnl||0)>0).length/longT.length*100:0
          const shortWr=shortT.length?shortT.filter(t=>(t.pnl||0)>0).length/shortT.length*100:0
          const longPnl=longT.reduce((a,t)=>a+(t.pnl||0),0)
          const shortPnl=shortT.reduce((a,t)=>a+(t.pnl||0),0)

          // by status
          const tpT=closed.filter(t=>t.status==='TP')
          const slT=closed.filter(t=>t.status==='SL')
          const trailT=closed.filter(t=>t.status==='TRAIL')

          // streaks
          let curStreak=0,bestWin=0,bestLoss=0,worstStreak=0
          for(const t of [...closed].sort((a,b)=>(a.closedTs||a.ts)-(b.closedTs||b.ts))){
            const w=(t.pnl||0)>0
            if(w){curStreak=curStreak>0?curStreak+1:1}else{curStreak=curStreak<0?curStreak-1:-1}
            if(curStreak>bestWin)bestWin=curStreak
            if(curStreak<worstStreak)worstStreak=curStreak
          }

          // hold times
          const holds=closed.filter(t=>t.closedTs&&t.ts).map(t=>(t.closedTs!-t.ts)/60000)
          const avgHold=holds.length?holds.reduce((a,b)=>a+b,0)/holds.length:0

          // avg win / avg loss
          const winPnls=closed.filter(t=>(t.pnl||0)>0).map(t=>t.pnl||0)
          const lossPnls=closed.filter(t=>(t.pnl||0)<0).map(t=>t.pnl||0)
          const avgWin=winPnls.length?winPnls.reduce((a,b)=>a+b,0)/winPnls.length:0
          const avgLoss=lossPnls.length?lossPnls.reduce((a,b)=>a+b,0)/lossPnls.length:0
          const pf=lossPnls.length&&avgLoss!==0?Math.abs(winPnls.reduce((a,b)=>a+b,0)/lossPnls.reduce((a,b)=>a+b,0)):0

          // best / worst 5 trades
          const best5=[...closed].sort((a,b)=>(b.pnl||0)-(a.pnl||0)).slice(0,5)
          const worst5=[...closed].sort((a,b)=>(a.pnl||0)-(b.pnl||0)).slice(0,5)

          const Row=({label,val,col}:{label:string;val:string;col?:string})=>(
            <div style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:`1px solid ${C.dim}`}}>
              <span style={{color:C.muted,fontSize:'9px'}}>{label}</span>
              <span style={{color:col||C.text,fontWeight:700,fontSize:'10px',fontFamily:'monospace'}}>{val}</span>
            </div>
          )

          return(
            <div style={{display:'flex',flexDirection:'column' as const,gap:'10px'}}>

              {/* summary row */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'6px'}}>
                <Tile label="סה״כ עסקאות" value={closed.length.toString()} color={C.blue}/>
                <Tile label="WR" value={winRate.toFixed(1)+'%'} color={winRate>50?C.green:C.red}/>
                <Tile label="Profit Factor" value={pf.toFixed(2)} color={pf>1?C.green:C.red}/>
                <Tile label="P&L כולל" value={(totalPnl>=0?'+':'')+totalPnl.toFixed(2)} color={totalPnl>=0?C.green:C.red}/>
              </div>

              {/* avg / streaks / hold */}
              <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:'12px',padding:'10px 14px'}}>
                <div style={{color:C.blue,fontWeight:700,fontSize:'10px',marginBottom:'8px'}}>ביצועים</div>
                <Row label="ממוצע זכייה" val={'+'+avgWin.toFixed(2)+'$'} col={C.green}/>
                <Row label="ממוצע הפסד" val={avgLoss.toFixed(2)+'$'} col={C.red}/>
                <Row label="יחס R:R" val={(Math.abs(avgWin/avgLoss)||0).toFixed(2)} col={Math.abs(avgWin/avgLoss)>1?C.green:C.yellow}/>
                <Row label="זמן החזקה ממוצע" val={avgHold.toFixed(0)+' דק׳'}/>
                <Row label="רצף זכיות מקסימלי" val={bestWin.toString()} col={C.green}/>
                <Row label="רצף הפסדים מקסימלי" val={Math.abs(worstStreak).toString()} col={C.red}/>
              </div>

              {/* side breakdown */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px'}}>
                <div style={{background:`${C.green}08`,border:`1px solid ${C.green}25`,borderRadius:'12px',padding:'10px'}}>
                  <div style={{color:C.green,fontWeight:700,fontSize:'10px',marginBottom:'6px'}}>▲ לונג ({longT.length})</div>
                  <Row label="WR" val={longWr.toFixed(1)+'%'} col={longWr>50?C.green:C.red}/>
                  <Row label="P&L" val={(longPnl>=0?'+':'')+longPnl.toFixed(2)} col={longPnl>=0?C.green:C.red}/>
                </div>
                <div style={{background:`${C.red}08`,border:`1px solid ${C.red}25`,borderRadius:'12px',padding:'10px'}}>
                  <div style={{color:C.red,fontWeight:700,fontSize:'10px',marginBottom:'6px'}}>▼ שורט ({shortT.length})</div>
                  <Row label="WR" val={shortWr.toFixed(1)+'%'} col={shortWr>50?C.green:C.red}/>
                  <Row label="P&L" val={(shortPnl>=0?'+':'')+shortPnl.toFixed(2)} col={shortPnl>=0?C.green:C.red}/>
                </div>
              </div>

              {/* status breakdown */}
              <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:'12px',padding:'10px 14px'}}>
                <div style={{color:C.blue,fontWeight:700,fontSize:'10px',marginBottom:'8px'}}>סיבות סגירה</div>
                <div style={{display:'flex',gap:'8px',flexWrap:'wrap' as const}}>
                  {([['✓ TP',tpT,C.green],['✗ SL',slT,C.red],['~ TRAIL',trailT,C.yellow]] as [string,Trade[],string][]).map(([lbl,arr,col])=>(
                    <div key={lbl} style={{flex:1,minWidth:'80px',background:`${col}08`,border:`1px solid ${col}25`,borderRadius:'8px',padding:'8px',textAlign:'center' as const}}>
                      <div style={{color:col,fontWeight:800,fontSize:'14px'}}>{arr.length}</div>
                      <div style={{color:C.muted,fontSize:'8px'}}>{lbl}</div>
                      <div style={{color:col,fontSize:'9px'}}>{closed.length?((arr.length/closed.length)*100).toFixed(0)+'%':''}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* best / worst */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px'}}>
                <div style={{background:C.panel,border:`1px solid ${C.green}25`,borderRadius:'12px',padding:'10px'}}>
                  <div style={{color:C.green,fontWeight:700,fontSize:'10px',marginBottom:'6px'}}>5 הטובות</div>
                  {best5.map(t=>(
                    <div key={t.id} style={{display:'flex',justifyContent:'space-between',padding:'2px 0',borderBottom:`1px solid ${C.dim}`,fontSize:'9px'}}>
                      <span style={{color:C.cyan}}>{t.sym}</span>
                      <span style={{color:C.green,fontWeight:700}}>+{(t.pnl||0).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <div style={{background:C.panel,border:`1px solid ${C.red}25`,borderRadius:'12px',padding:'10px'}}>
                  <div style={{color:C.red,fontWeight:700,fontSize:'10px',marginBottom:'6px'}}>5 הגרועות</div>
                  {worst5.map(t=>(
                    <div key={t.id} style={{display:'flex',justifyContent:'space-between',padding:'2px 0',borderBottom:`1px solid ${C.dim}`,fontSize:'9px'}}>
                      <span style={{color:C.cyan}}>{t.sym}</span>
                      <span style={{color:C.red,fontWeight:700}}>{(t.pnl||0).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* per symbol table */}
              <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:'12px',padding:'10px'}}>
                <div style={{color:C.blue,fontWeight:700,fontSize:'10px',marginBottom:'8px'}}>ביצועים לפי מטבע</div>
                <div style={{overflowX:'auto' as const}}>
                  <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:'9px'}}>
                    <thead>
                      <tr style={{background:'rgba(0,200,255,0.04)'}}>
                        {['מטבע','עסקאות','WR','P&L','זמן ממוצע'].map(h=>(
                          <th key={h} style={{padding:'4px 6px',textAlign:'right' as const,color:C.muted,borderBottom:`1px solid ${C.dim}`,fontWeight:700}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {symRows.map(([sym,d])=>{
                        const wr=d.count?d.wins/d.count*100:0
                        const avgH=d.holdMin.length?d.holdMin.reduce((a,b)=>a+b,0)/d.holdMin.length:0
                        return(
                          <tr key={sym} className="nx-row" style={{borderBottom:`1px solid ${C.dim}`}}>
                            <td style={{padding:'4px 6px',color:C.cyan,fontWeight:700}}>{sym}</td>
                            <td style={{padding:'4px 6px',color:C.text}}>{d.count}</td>
                            <td style={{padding:'4px 6px',color:wr>50?C.green:C.red,fontWeight:700}}>{wr.toFixed(0)}%</td>
                            <td style={{padding:'4px 6px',color:d.pnl>=0?C.green:C.red,fontWeight:700}}>{d.pnl>=0?'+':''}{d.pnl.toFixed(2)}</td>
                            <td style={{padding:'4px 6px',color:C.muted}}>{avgH>0?avgH.toFixed(0)+' דק׳':'—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )
        })()}

        {/* ── AI OPT ── */}
        {tab==='ai'&&(
          <div>
            <div style={{background:`${C.teal}08`,border:`1px solid ${C.teal}25`,borderRadius:'12px',padding:'12px',marginBottom:'10px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}>
                <span style={{color:C.teal,fontWeight:700,fontSize:'11px'}}>מצב אופטימייזר AI</span>
                <span style={{fontSize:'9px',color:C.muted}}>
                  {lastOptimizedAt?`עדכון: ${new Date(lastOptimizedAt).toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'})}`:'טרם הורץ'}
                </span>
              </div>
              {Object.keys(currentBotParams).length===0
                ?<div style={{color:C.dim,fontSize:'10px',textAlign:'center' as const,padding:'10px'}}>פרמטרים ברירת מחדל — AI יתחיל אחרי 50 עסקאות</div>
                :<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))',gap:'5px'}}>
                  {Object.entries(currentBotParams).map(([k,v])=>(
                    <div key={k} style={{background:'rgba(3,8,26,0.9)',borderRadius:'8px',padding:'6px 9px',border:`1px solid ${C.dim}`}}>
                      <div style={{color:C.muted,fontSize:'8px',marginBottom:'2px'}}>{k}</div>
                      <div style={{color:C.teal,fontWeight:700,fontSize:'12px'}}>{JSON.stringify(v)}</div>
                    </div>
                  ))}
                </div>
              }
            </div>
            <div style={{color:C.pink,fontWeight:700,fontSize:'10px',marginBottom:'8px'}}>היסטוריית שינויים</div>
            {optimizerHistory.length===0
              ?<div style={{color:C.dim,fontSize:'10px',textAlign:'center' as const,padding:'24px'}}>אין שינויים עדיין</div>
              :<div style={{display:'flex',flexDirection:'column' as const,gap:'5px',maxHeight:'380px',overflowY:'auto' as const}}>
                {optimizerHistory.map(run=>{
                  const changedKeys=Object.keys(run.params_after||{}).filter(k=>JSON.stringify((run.params_before||{})[k])!==JSON.stringify((run.params_after||{})[k]))
                  return (
                    <div key={run.id} style={{background:'rgba(3,8,26,0.9)',borderRadius:'10px',padding:'10px 12px',border:`1px solid ${C.dim}`}}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:'5px'}}>
                        <span style={{color:C.blue,fontWeight:700,fontSize:'10px'}}>
                          {new Date(run.created_at).toLocaleString('he-IL',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}
                        </span>
                        <span style={{fontSize:'9px',color:C.muted}}>
                          WR <strong style={{color:run.overall_wr>0.5?C.green:C.red}}>{(run.overall_wr*100).toFixed(1)}%</strong>
                          {' · '}PF <strong style={{color:run.overall_pf>1?C.green:C.red}}>{run.overall_pf?.toFixed(2)}</strong>
                        </span>
                      </div>
                      {changedKeys.length>0&&(
                        <div style={{display:'flex',flexWrap:'wrap' as const,gap:'3px',marginBottom:'5px'}}>
                          {changedKeys.map(k=>(
                            <span key={k} style={{fontSize:'9px',padding:'2px 7px',borderRadius:'5px',
                              background:`${C.yellow}08`,border:`1px solid ${C.yellow}25`,color:C.yellow}}>
                              {k}: {JSON.stringify((run.params_before||{})[k])} → <strong style={{color:C.teal}}>{JSON.stringify((run.params_after||{})[k])}</strong>
                            </span>
                          ))}
                        </div>
                      )}
                      {run.reasoning&&(
                        <div style={{fontSize:'9px',color:C.muted,lineHeight:'1.5',borderTop:`1px solid ${C.dim}`,paddingTop:'5px'}}>
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

        {/* ── REGIME ── */}
        {tab==='regime'&&(
          <div>
            {/* big regime display */}
            <div style={{
              background:`linear-gradient(135deg,${regColor}12,rgba(3,8,26,0.95))`,
              border:`1px solid ${regColor}40`,borderRadius:'14px',padding:'20px',marginBottom:'10px',
              textAlign:'center' as const,position:'relative',overflow:'hidden',
              boxShadow:`0 8px 40px ${regColor}15`,
            }}>
              <div style={{position:'absolute',top:0,left:0,right:0,bottom:0,
                background:`radial-gradient(ellipse 80% 60% at 50% 0%,${regColor}10,transparent)`,pointerEvents:'none'}}/>
              <div className="float" style={{fontSize:'32px',fontWeight:900,color:regColor,
                marginBottom:'6px'}}>
                {REGIME_HE[marketRegime]||marketRegime}
              </div>
              <div style={{display:'flex',justifyContent:'center',gap:'8px',marginBottom:'10px'}}>
                <div style={{background:`${regColor}15`,border:`1px solid ${regColor}30`,borderRadius:'8px',padding:'4px 12px'}}>
                  <span style={{color:C.muted,fontSize:'9px'}}>ביטחון </span>
                  <span style={{color:regColor,fontWeight:800,fontSize:'13px'}}>{(regimeConf*100).toFixed(0)}%</span>
                </div>
              </div>
              {/* confidence bar */}
              <div style={{height:'4px',background:`${regColor}20`,borderRadius:'2px',maxWidth:'200px',margin:'0 auto 10px'}}>
                <div style={{height:'100%',width:`${regimeConf*100}%`,background:regColor,borderRadius:'2px',
                  boxShadow:`0 0 8px ${regColor}`,transition:'width 0.5s'}}/>
              </div>
              <div style={{fontSize:'11px',color:C.muted}}>
                {marketRegime==='TREND_UP'&&'הבוט מעדיף לונג · SL מותאם'}
                {marketRegime==='TREND_DOWN'&&'הבוט מעדיף שורט · SL מותאם'}
                {marketRegime==='RANGING'&&'הבוט פועל בשני הכיוונים · TP מוקדם'}
                {marketRegime==='VOLATILE'&&'הבוט מקטין פוזיציות · SL מורחב'}
              </div>
            </div>

            {/* coin weights */}
            {Object.keys(coinWeights).length>0&&(
              <div style={{marginBottom:'10px'}}>
                <div style={{color:C.yellow,fontWeight:700,fontSize:'10px',marginBottom:'8px',display:'flex',alignItems:'center',gap:'6px'}}>
                  משקלי מטבעות
                  {rebalancedAt&&<span style={{color:C.muted,fontWeight:400}}>· עדכון: {new Date(rebalancedAt).toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'})}</span>}
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(90px,1fr))',gap:'5px'}}>
                  {Object.entries(coinWeights).sort(([,a],[,b])=>b-a).map(([sym,wt])=>{
                    const col=wt>1.2?C.green:wt<0.7?C.red:C.yellow
                    return (
                      <div key={sym} style={{background:'rgba(3,8,26,0.9)',border:`1px solid ${col}25`,
                        borderRadius:'10px',padding:'8px',textAlign:'center' as const}}>
                        <div style={{fontWeight:800,fontSize:'11px',color:C.text,marginBottom:'2px'}}>{sym}</div>
                        <div style={{fontWeight:900,fontSize:'16px',color:col}}>{wt.toFixed(2)}×</div>
                        <div style={{height:'3px',background:C.dim,borderRadius:'2px',marginTop:'5px',overflow:'hidden'}}>
                          <div style={{height:'100%',width:`${Math.min(wt/2*100,100)}%`,background:col,borderRadius:'2px',
                            boxShadow:`0 0 4px ${col}`,transition:'width 0.5s'}}/>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* regime history */}
            <div style={{color:C.pink,fontWeight:700,fontSize:'10px',marginBottom:'8px'}}>היסטוריית מצבי שוק</div>
            {regimeHistory.length===0
              ?<div style={{color:C.dim,fontSize:'10px',textAlign:'center' as const,padding:'20px'}}>אין נתונים — המנגנון יתחיל לרוץ בקרוב</div>
              :<div style={{display:'flex',flexDirection:'column' as const,gap:'4px',maxHeight:'300px',overflowY:'auto' as const}}>
                {regimeHistory.map(r=>{
                  const rc=REGIME_COLOR[r.regime]||C.blue
                  return (
                    <div key={r.id} style={{display:'flex',gap:'8px',alignItems:'center',
                      padding:'6px 10px',background:'rgba(3,8,26,0.8)',borderRadius:'8px',border:`1px solid ${C.dim}`}}>
                      <span style={{fontSize:'9px',color:C.muted,minWidth:'65px',flexShrink:0}}>
                        {new Date(r.created_at).toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'})}
                      </span>
                      <span style={{padding:'2px 8px',borderRadius:'5px',fontSize:'9px',fontWeight:700,
                        background:`${rc}15`,color:rc,border:`1px solid ${rc}30`,flexShrink:0}}>
                        {REGIME_HE[r.regime]||r.regime}
                      </span>
                      <span style={{fontSize:'9px',color:C.muted,flexShrink:0}}>{(r.confidence*100).toFixed(0)}%</span>
                      {r.notes&&<span style={{fontSize:'8px',color:C.dim,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{r.notes}</span>}
                    </div>
                  )
                })}
              </div>
            }
          </div>
        )}
      </div>

      {/* ══ CHARTS ROW ══ */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'8px'}}>
        <Card3D style={{padding:'12px'}} color={C.blue}>
          <div style={{color:C.blue,fontWeight:700,fontSize:'10px',marginBottom:'8px',letterSpacing:'0.5px'}}>◉ מפת שוק</div>
          <canvas ref={bubRef} width={400} height={200}
            style={{width:'100%',height:'200px',display:'block',borderRadius:'8px',background:'rgba(1,4,16,0.9)'}}/>
        </Card3D>
        <Card3D style={{padding:'12px'}} color={C.green}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}>
            <span style={{color:C.green,fontWeight:700,fontSize:'10px'}}>עקומת הון</span>
            <span style={{color:totalPnl>=0?C.green:C.red,fontWeight:700,fontSize:'11px'}}>
              {totalPnl>=0?'+':''}{totalPnl.toFixed(2)}
            </span>
          </div>
          <canvas ref={eqRef} width={400} height={200}
            style={{width:'100%',height:'200px',display:'block',borderRadius:'8px',
              background:'rgba(1,4,16,0.9)',border:`1px solid ${C.dim}`}}/>
        </Card3D>
      </div>

      {/* ══ LOG ══ */}
      <div style={{
        background:'rgba(3,8,26,0.9)',border:`1px solid rgba(0,200,255,0.1)`,borderRadius:'12px',
        padding:'10px 12px',backdropFilter:'blur(16px)',
      }}>
        <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'6px'}}>
          <span className="live-dot" style={{width:'5px',height:'5px',borderRadius:'50%',background:C.pink,display:'inline-block'}}/>
          <span style={{color:C.pink,fontWeight:700,fontSize:'10px',letterSpacing:'0.5px'}}>יומן פעולות — חי</span>
        </div>
        <div style={{height:'85px',overflowY:'auto' as const}}>
          {execLog.length===0
            ?<div style={{color:C.dim,fontSize:'10px',padding:'4px'}}>ממתין לאיתותים...</div>
            :execLog.map((entry,i)=>(
              <div key={i} className={i===0?'slide-up':''} style={{
                fontSize:'10px',padding:'2px 4px',fontFamily:'monospace',
                borderBottom:`1px solid ${C.dim}`,lineHeight:'1.6',
                color:entry.includes('פתיחה')||entry.includes('TP')||entry.includes('+')?C.green
                  :entry.includes('SL')||entry.includes('✗')?C.red
                  :entry.includes('TRAIL')?C.yellow:C.muted,
              }}>{entry}</div>
            ))
          }
        </div>
      </div>

      <div style={{textAlign:'center' as const,color:C.muted,fontSize:'9px',marginTop:'8px',letterSpacing:'0.5px',opacity:0.7}}>
        {supaLive?'☁ שרת בוט v31 פעיל 24/7 · מסגרת זמן 5 דקות · מחירים חיים מ-Binance':'מסחר וירטואלי · מחירים חיים מ-Binance'}
      </div>
    </div>
  )
}

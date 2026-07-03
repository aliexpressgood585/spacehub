import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react'

// ─── types ────────────────────────────────────────────────────────────────────
interface Bar   { time:number; open:number; high:number; low:number; close:number; vol:number }
interface Trade {
  id:number; sym:string; side:'LONG'|'SHORT'
  entry:number; exit?:number; size:number
  pnl?:number; pnlPct?:number; ts:number
  status:'OPEN'|'TP'|'SL'|'TRAIL'|'CLOSED'
  hi:number; lo:number; trailSL:number
}
interface Sig { dir:'BUY'|'SELL'|'HOLD'; score:number; f:boolean[]; rsi:number; bb:{upper:number;mid:number;lower:number} }
interface PriceInfo { price:number; change:number }

// ─── config ───────────────────────────────────────────────────────────────────
const COINS = [
  {sym:'BTC',ws:'btcusdt'},{sym:'ETH',ws:'ethusdt'},{sym:'SOL',ws:'solusdt'},
  {sym:'BNB',ws:'bnbusdt'},{sym:'XRP',ws:'xrpusdt'},{sym:'ADA',ws:'adausdt'},
  {sym:'DOGE',ws:'dogeusdt'},{sym:'AVAX',ws:'avaxusdt'},{sym:'LINK',ws:'linkusdt'},
  {sym:'DOT',ws:'dotusdt'},{sym:'MATIC',ws:'maticusdt'},{sym:'UNI',ws:'uniusdt'},
  {sym:'ATOM',ws:'atomusdt'},{sym:'LTC',ws:'ltcusdt'},{sym:'BCH',ws:'bchusdt'},
  {sym:'NEAR',ws:'nearusdt'},{sym:'ALGO',ws:'algousdt'},{sym:'FIL',ws:'filusdt'},
  {sym:'VET',ws:'vetusdt'},{sym:'ICP',ws:'icpusdt'},
]

const RISK = {
  low:    {pct:0.06, sl:0.010, tp:0.022, trail:0.007},
  medium: {pct:0.12, sl:0.016, tp:0.038, trail:0.011},
  high:   {pct:0.20, sl:0.022, tp:0.055, trail:0.016},
}

const INIT_BAL = 10_000
const MAX_BARS  = 300
const BAR_MS    = 60_000   // 1-minute bars

// ─── math ────────────────────────────────────────────────────────────────────
function calcEma(src:number[], p:number): number[] {
  const k = 2/(p+1); const out:number[] = [src[0]]
  for(let i=1;i<src.length;i++) out.push(src[i]*k + out[i-1]*(1-k))
  return out
}

function calcRsi(src:number[], p=14): number {
  if(src.length < p+1) return 50
  let g=0,l=0
  for(let i=src.length-p; i<src.length; i++){
    const d=src[i]-src[i-1]; if(d>0) g+=d; else l-=d
  }
  const rs=(g/p)/((l/p)||1e-9)
  return 100-100/(1+rs)
}

function calcMacd(src:number[]): {macd:number;signal:number;hist:number} {
  if(src.length<26) return {macd:0,signal:0,hist:0}
  const e12=calcEma(src,12), e26=calcEma(src,26)
  const ml=e12.map((v,i)=>v-e26[i])
  const sig=calcEma(ml,9)
  const n=ml.length-1
  return {macd:ml[n],signal:sig[n],hist:ml[n]-sig[n]}
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
  const kArr=rsiArr.slice(-3).map((_v,i,a)=>{
    const sl2=rsiArr.slice(0,rsiArr.length-a.length+1+i)
    const rr=sl2.slice(-p)
    const l2=Math.min(...rr),h2=Math.max(...rr)
    return h2===l2?50:((sl2[sl2.length-1]-l2)/(h2-l2))*100
  })
  const d=kArr.reduce((a,b)=>a+b,0)/kArr.length
  return {k,d}
}

function calcAtr(bars:Bar[], p=14): number {
  if(bars.length<2) return bars[0]?(bars[0].high-bars[0].low):1
  const trs=bars.slice(-(p+1)).map((b,i,a)=>{
    if(i===0) return b.high-b.low
    return Math.max(b.high-b.low,Math.abs(b.high-a[i-1].close),Math.abs(b.low-a[i-1].close))
  })
  return trs.reduce((a,b)=>a+b,0)/trs.length
}

function getSignal(bars:Bar[]): Sig {
  const empty:Sig={dir:'HOLD',score:0,f:[false,false,false,false,false],rsi:50,bb:calcBB([bars[bars.length-1]?.close||0])}
  if(bars.length<35) return empty
  const cl=bars.map(b=>b.close)
  const n=cl.length-1
  const ema9=calcEma(cl,9), ema21=calcEma(cl,21)
  const emaBull=ema9[n]>ema21[n]
  const rsi=calcRsi(cl,14)
  const rsiBull=rsi>52 && rsi<76
  const rsiBear=rsi<48 && rsi>24
  const {hist}=calcMacd(cl)
  const macdBull=hist>0
  const bb=calcBB(cl)
  const p=cl[n]
  const bbBull=p>bb.mid && p<bb.upper
  const bbBear=p<bb.mid && p>bb.lower
  const {k,d}=calcStochRsi(cl)
  const stochBull=k>d && k<80
  const stochBear=k<d && k>20
  const bF=[emaBull,rsiBull,macdBull,bbBull,stochBull]
  const sF=[!emaBull,rsiBear,!macdBull,bbBear,stochBear]
  const bS=bF.filter(Boolean).length
  const sS=sF.filter(Boolean).length
  if(bS>=4) return {dir:'BUY',score:bS,f:bF,rsi,bb}
  if(sS>=4) return {dir:'SELL',score:sS,f:sF,rsi,bb}
  return {dir:'HOLD',score:Math.max(bS,sS),f:bF,rsi,bb}
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
  for(const t of trades){ if(t.pnl){ bal+=t.pnl; if(bal>peak)peak=bal; mx=Math.max(mx,(peak-bal)/peak) } }
  return mx*100
}

// ─── chart ────────────────────────────────────────────────────────────────────
function drawChart(canvas:HTMLCanvasElement, bars:Bar[], sig:Sig) {
  const ctx=canvas.getContext('2d'); if(!ctx||bars.length<3) return
  const W=canvas.width, H=canvas.height
  ctx.clearRect(0,0,W,H)
  const sl=bars.slice(-80)
  const cl=sl.map(b=>b.close)
  const bbArr=cl.map((_,i)=>calcBB(cl.slice(0,i+1)))
  const ema9=calcEma(cl,9), ema21=calcEma(cl,21)
  const allVals=[...sl.map(b=>b.low),...sl.map(b=>b.high)]
  const lo=Math.min(...allVals)*0.9985, hi=Math.max(...allVals)*1.0015
  const toY=(v:number)=>H-4-((v-lo)/(hi-lo))*(H-8)
  const toX=(i:number)=>(i/(sl.length-1))*(W-2)+1
  // BB fill
  ctx.beginPath()
  bbArr.forEach((bb,i)=>{ i===0?ctx.moveTo(toX(i),toY(bb.upper)):ctx.lineTo(toX(i),toY(bb.upper)) })
  for(let i=bbArr.length-1;i>=0;i--) ctx.lineTo(toX(i),toY(bbArr[i].lower))
  ctx.closePath(); ctx.fillStyle='rgba(80,160,255,0.06)'; ctx.fill()
  // BB lines
  const bbLines=[bbArr.map(b=>b.upper), bbArr.map(b=>b.lower), bbArr.map(b=>b.mid)]
  const bbCols=['rgba(80,160,255,0.3)','rgba(80,160,255,0.3)','rgba(80,160,255,0.2)']
  bbLines.forEach((arr,li)=>{
    ctx.beginPath(); arr.forEach((v,i)=>{ i===0?ctx.moveTo(toX(i),toY(v)):ctx.lineTo(toX(i),toY(v)) })
    ctx.strokeStyle=bbCols[li]; ctx.lineWidth=0.8; if(li===2)ctx.setLineDash([3,3]); ctx.stroke(); ctx.setLineDash([])
  })
  // price
  ctx.beginPath(); cl.forEach((v,i)=>{ i===0?ctx.moveTo(toX(i),toY(v)):ctx.lineTo(toX(i),toY(v)) })
  ctx.strokeStyle='#4af'; ctx.lineWidth=1.5; ctx.stroke()
  // ema9
  ctx.beginPath(); ema9.forEach((v,i)=>{ i===0?ctx.moveTo(toX(i),toY(v)):ctx.lineTo(toX(i),toY(v)) })
  ctx.strokeStyle='#fa6'; ctx.lineWidth=1; ctx.stroke()
  // ema21
  ctx.beginPath(); ema21.forEach((v,i)=>{ i===0?ctx.moveTo(toX(i),toY(v)):ctx.lineTo(toX(i),toY(v)) })
  ctx.strokeStyle='#f4a'; ctx.lineWidth=1; ctx.stroke()
  // last price label
  const lp=cl[cl.length-1]
  ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(2,toY(lp)-12,58,13)
  ctx.fillStyle='#4af'; ctx.font='bold 10px monospace'
  ctx.fillText(lp>=100?lp.toFixed(1):lp.toFixed(5),4,toY(lp)-2)
  // signal dot
  const dot=sig.dir==='BUY'?'#4f8':sig.dir==='SELL'?'#f55':'#888'
  ctx.beginPath(); ctx.arc(W-8,8,5,0,Math.PI*2); ctx.fillStyle=dot; ctx.fill()
}

// ─── component ────────────────────────────────────────────────────────────────
export default function CryptoTradingDashboard() {
  const M: CSSProperties = {fontFamily:'monospace'}
  const [prices, setPrices]     = useState<Record<string,PriceInfo>>({})
  const [selected, setSelected] = useState('BTC')
  const [risk, setRisk]         = useState<'low'|'medium'|'high'>('medium')
  const [balance, setBalance]   = useState(INIT_BAL)
  const [botOn, setBotOn]       = useState(false)
  const [trades, setTrades]     = useState<Trade[]>([])
  const [sig, setSig]           = useState<Sig>({dir:'HOLD',score:0,f:[false,false,false,false,false],rsi:50,bb:{upper:0,mid:0,lower:0}})
  const [tick, setTick]         = useState(0)
  const [wsStatus, setWsStatus] = useState<'connecting'|'live'|'error'>('connecting')
  const [tab, setTab]           = useState<'history'|'stats'>('history')

  const barsMap   = useRef(new Map<string,Bar[]>())
  const curBar    = useRef(new Map<string,Bar>())
  const tradeRef  = useRef<Trade[]>([])
  const balRef    = useRef(INIT_BAL)
  const botRef    = useRef(false)
  const selRef    = useRef('BTC')
  const riskRef   = useRef<'low'|'medium'|'high'>('medium')
  const idRef     = useRef(1)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cooldown  = useRef<Record<string,number>>({})

  tradeRef.current = trades
  botRef.current   = botOn
  selRef.current   = selected
  riskRef.current  = risk
  balRef.current   = balance

  const openTrade = useCallback((sym:string, side:'LONG'|'SHORT', price:number) => {
    const now=Date.now()
    if((cooldown.current[sym]||0)+90_000>now) return   // 90s cooldown per coin
    const bars=barsMap.current.get(sym)||[]
    const atr=calcAtr(bars)
    void atr
    const R=RISK[riskRef.current]
    const useBal=balRef.current*R.pct
    if(useBal<1) return
    const size=useBal/price
    const trailSL=side==='LONG'?price*(1-R.trail):price*(1+R.trail)
    const t:Trade={id:idRef.current++,sym,side,entry:price,size,ts:now,status:'OPEN',hi:price,lo:price,trailSL}
    cooldown.current[sym]=now
    const next=[...tradeRef.current,t]
    tradeRef.current=next; setTrades([...next])
    setBalance(b=>{ const nb=b-useBal; balRef.current=nb; return nb })
  },[])

  const checkTrades = useCallback((sym:string, price:number)=>{
    const R=RISK[riskRef.current]
    let dirty=false
    const updated=tradeRef.current.map(t=>{
      if(t.sym!==sym||t.status!=='OPEN') return t
      const nt={...t}
      if(price>nt.hi) nt.hi=price
      if(price<nt.lo) nt.lo=price
      // update trailing SL
      if(nt.side==='LONG'){
        const newTrail=price*(1-R.trail)
        if(newTrail>nt.trailSL) { nt.trailSL=newTrail; dirty=true }
        const sl=Math.max(nt.trailSL, nt.entry*(1-R.sl))
        const tp=nt.entry*(1+R.tp)
        if(price>=tp)  { nt.status='TP';    nt.exit=price; dirty=true }
        else if(price<=sl){ nt.status=price<=nt.entry*(1-R.sl)?'SL':'TRAIL'; nt.exit=price; dirty=true }
      } else {
        const newTrail=price*(1+R.trail)
        if(newTrail<nt.trailSL) { nt.trailSL=newTrail; dirty=true }
        const sl=Math.min(nt.trailSL, nt.entry*(1+R.sl))
        const tp=nt.entry*(1-R.tp)
        if(price<=tp)  { nt.status='TP';    nt.exit=price; dirty=true }
        else if(price>=sl){ nt.status=price>=nt.entry*(1+R.sl)?'SL':'TRAIL'; nt.exit=price; dirty=true }
      }
      if(nt.exit!==undefined && nt.pnl===undefined){
        const raw=nt.side==='LONG'?(nt.exit-nt.entry)*nt.size:(nt.entry-nt.exit)*nt.size
        nt.pnl=raw; nt.pnlPct=(nt.exit-nt.entry)/nt.entry*(nt.side==='LONG'?1:-1)
        setBalance(b=>{ const nb=b+nt.entry*nt.size+raw; balRef.current=nb; return nb })
        dirty=true
      }
      return nt
    })
    if(dirty){ tradeRef.current=updated; setTrades([...updated]) }
  },[])

  const onTick=useCallback((sym:string,price:number,vol:number)=>{
    const now=Date.now()
    const barStart=Math.floor(now/BAR_MS)*BAR_MS
    let cb=curBar.current.get(sym)
    if(!cb||cb.time!==barStart){
      if(cb){ const arr=barsMap.current.get(sym)||[]; arr.push(cb); if(arr.length>MAX_BARS)arr.shift(); barsMap.current.set(sym,arr) }
      cb={time:barStart,open:price,high:price,low:price,close:price,vol}
      curBar.current.set(sym,cb)
    } else {
      cb.close=price; if(price>cb.high)cb.high=price; if(price<cb.low)cb.low=price; cb.vol+=vol
    }
    checkTrades(sym,price)
    if(sym===selRef.current){
      const bars=[...(barsMap.current.get(sym)||[]),cb]
      const s=getSignal(bars)
      setSig(s)
      if(botRef.current && s.dir!=='HOLD'){
        const open=tradeRef.current.filter(t=>t.sym===sym&&t.status==='OPEN')
        if(open.length===0) openTrade(sym,s.dir==='BUY'?'LONG':'SHORT',price)
      }
      setTick(n=>n+1)
    }
  },[checkTrades,openTrade])

  // bot also checks non-selected coins when active
  const onTickAny=useCallback((sym:string,price:number,vol:number)=>{
    const now=Date.now()
    const barStart=Math.floor(now/BAR_MS)*BAR_MS
    let cb=curBar.current.get(sym)
    if(!cb||cb.time!==barStart){
      if(cb){ const arr=barsMap.current.get(sym)||[]; arr.push(cb); if(arr.length>MAX_BARS)arr.shift(); barsMap.current.set(sym,arr) }
      cb={time:barStart,open:price,high:price,low:price,close:price,vol}
      curBar.current.set(sym,cb)
    } else {
      cb.close=price; if(price>cb.high)cb.high=price; if(price<cb.low)cb.low=price; cb.vol+=vol
    }
    checkTrades(sym,price)
    if(botRef.current){
      const bars=[...(barsMap.current.get(sym)||[]),cb]
      const s=getSignal(bars)
      if(s.dir!=='HOLD'){
        const open=tradeRef.current.filter(t=>t.sym===sym&&t.status==='OPEN')
        if(open.length===0) openTrade(sym,s.dir==='BUY'?'LONG':'SHORT',price)
      }
    }
  },[checkTrades,openTrade])

  // WebSocket
  useEffect(()=>{
    let dead=false
    function connect(){
      if(dead) return
      setWsStatus('connecting')
      const streams=COINS.map(c=>c.ws+'@miniTicker').join('/')
      const ws=new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`)
      ws.onopen=()=>setWsStatus('live')
      ws.onerror=()=>setWsStatus('error')
      ws.onclose=()=>{ if(!dead){ setWsStatus('error'); setTimeout(connect,3000) } }
      ws.onmessage=(e)=>{
        try{
          const msg=JSON.parse(e.data)
          const d=msg.data||msg
          const wsName=(d.s||'').toLowerCase()
          const coin=COINS.find(c=>c.ws===wsName)
          if(!coin) return
          const price=parseFloat(d.c)
          const open24=parseFloat(d.o)
          const change=((price-open24)/open24)*100
          setPrices(p=>({...p,[coin.sym]:{price,change}}))
          if(coin.sym===selRef.current) onTick(coin.sym,price,parseFloat(d.v||'0'))
          else onTickAny(coin.sym,price,parseFloat(d.v||'0'))
        }catch{}
      }
      return ws
    }
    const ws=connect()
    return ()=>{ dead=true; ws?.close() }
  },[onTick,onTickAny])

  // draw chart
  useEffect(()=>{
    if(!canvasRef.current) return
    const sym=selected
    const bars=[...(barsMap.current.get(sym)||[])]
    const cb=curBar.current.get(sym)
    if(cb) bars.push(cb)
    if(bars.length>0) drawChart(canvasRef.current,bars,sig)
  },[tick,selected,sig])

  const openTrades=trades.filter(t=>t.status==='OPEN')
  const closed    =trades.filter(t=>t.status!=='OPEN')
  const wins      =closed.filter(t=>(t.pnl||0)>0).length
  const winRate   =closed.length>0?(wins/closed.length*100):0
  const totalPnl  =closed.reduce((a,t)=>a+(t.pnl||0),0)
  const sharpe    =calcSharpe(trades)
  const maxDD     =calcMaxDD(trades)
  const selInfo   =prices[selected]
  const R         =RISK[risk]

  const fmtPrice=(p:number)=>p>=1000?p.toFixed(2):p>=1?p.toFixed(4):p.toFixed(6)

  // ─── styles ────────────────────────────────────────────────────────────────
  const S={
    root:{...M,background:'#070c18',minHeight:'100vh',color:'#bdd0ec',padding:'8px',fontSize:'12px',direction:'rtl'} as CSSProperties,
    header:{display:'flex',flexWrap:'wrap' as const,gap:'6px',alignItems:'center',marginBottom:'8px',background:'#0b1222',borderRadius:'8px',padding:'8px 12px'} as CSSProperties,
    badge:(bg:string,col?:string)=>({background:bg,borderRadius:'4px',padding:'2px 8px',fontSize:'11px',fontWeight:700,color:col||'#c8d8f0'}) as CSSProperties,
    coinBar:{display:'flex',gap:'3px',overflowX:'auto' as const,padding:'4px 0',marginBottom:'8px',scrollbarWidth:'none' as const} as CSSProperties,
    coinBtn:(active:boolean,chg:number)=>({
      cursor:'pointer',border:`1px solid ${active?'#2a5090':'#131e33'}`,borderRadius:'6px',
      padding:'4px 7px',fontSize:'11px',fontWeight:700,background:active?'#1a3a70':'#0b1222',
      color:chg>0.5?'#4f8':chg<-0.5?'#f64':'#7a9abc',flexShrink:0,minWidth:'58px',textAlign:'center' as const
    }) as CSSProperties,
    grid:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'8px'} as CSSProperties,
    panel:{background:'#0b1222',borderRadius:'8px',padding:'10px'} as CSSProperties,
    row:{display:'flex',justifyContent:'space-between',padding:'3px 0',borderBottom:'1px solid #111d35'} as CSSProperties,
    btn:(bg:string,active:boolean)=>({
      cursor:'pointer',border:'none',borderRadius:'5px',padding:'5px 11px',fontSize:'11px',fontWeight:700,
      background:active?bg:'#131e33',color:active?'#000':'#7a9abc',transition:'all 0.15s'
    }) as CSSProperties,
    tbl:{width:'100%',borderCollapse:'collapse' as const,fontSize:'11px'} as CSSProperties,
    th:{padding:'4px 6px',textAlign:'right' as const,color:'#3a5a88',borderBottom:'1px solid #111d35'} as CSSProperties,
    td:(c?:string)=>({padding:'3px 6px',color:c||'inherit',borderBottom:'1px solid #0c1828'}) as CSSProperties,
  }

  return (
    <div style={S.root}>
      {/* ── HEADER ── */}
      <div style={S.header}>
        <span style={{fontWeight:800,fontSize:'14px',color:'#4af'}}>⚡ בוט קריפטו פרו</span>
        <span style={S.badge(wsStatus==='live'?'#0b3a18':'#3a0b0b',wsStatus==='live'?'#4f8':'#f64')}>
          {wsStatus==='live'?'● חי':wsStatus==='connecting'?'● מתחבר...':'● שגיאה'}
        </span>
        <span style={S.badge('#101828')}>💰 ${balance.toFixed(0)}</span>
        <span style={S.badge(totalPnl>=0?'#0b3a18':'#3a0b0b',totalPnl>=0?'#4f8':'#f64')}>
          ר/ה {totalPnl>=0?'+':''}{totalPnl.toFixed(2)}
        </span>
        <span style={S.badge('#101828')}>שארפ {sharpe.toFixed(2)}</span>
        <span style={S.badge('#101828')}>ירידה מקס {maxDD.toFixed(1)}%</span>
        <span style={S.badge('#101828')}>ניצחון {winRate.toFixed(0)}% ({closed.length})</span>
        <span style={{marginRight:'auto',display:'flex',gap:'5px',flexWrap:'wrap' as const}}>
          {([['low','נמוך'],['medium','בינוני'],['high','גבוה']] as const).map(([r,label])=>(
            <button key={r} style={S.btn(r==='low'?'#4af':r==='medium'?'#fa4':'#f64',risk===r)} onClick={()=>setRisk(r as 'low'|'medium'|'high')}>{label}</button>
          ))}
          <button style={{...S.btn('#4f8',botOn),background:botOn?'#1a5a30':'#131e33',color:botOn?'#4f8':'#7a9abc'}}
            onClick={()=>setBotOn(v=>!v)}>{botOn?'🤖 בוט פעיל':'🤖 בוט כבוי'}</button>
        </span>
      </div>

      {/* ── COIN BAR ── */}
      <div style={S.coinBar}>
        {COINS.map(c=>{
          const info=prices[c.sym]; const chg=info?.change||0
          return (
            <button key={c.sym} style={S.coinBtn(selected===c.sym,chg)} onClick={()=>setSelected(c.sym)}>
              <div style={{color:'#c8d8f0'}}>{c.sym}</div>
              <div style={{fontSize:'9px',color:chg>0.5?'#4f8':chg<-0.5?'#f64':'#7a9abc'}}>{chg>=0?'+':''}{chg.toFixed(1)}%</div>
            </button>
          )
        })}
      </div>

      {/* ── MAIN GRID ── */}
      <div style={S.grid}>
        {/* LEFT PANEL */}
        <div style={S.panel}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:'6px',alignItems:'center'}}>
            <span style={{fontWeight:800,color:'#4af',fontSize:'13px'}}>{selected}/USDT</span>
            <span style={{fontSize:'13px',fontWeight:700,color:selInfo?.change>0?'#4f8':'#f64'}}>
              {selInfo?fmtPrice(selInfo.price):'—'}
              <span style={{fontSize:'10px',color:selInfo?.change>0?'#4f8':'#f64',marginLeft:'4px'}}>
                {selInfo?`${selInfo.change>=0?'+':''}${selInfo.change.toFixed(2)}%`:''}
              </span>
            </span>
          </div>
          <canvas ref={canvasRef} width={460} height={130}
            style={{width:'100%',height:'130px',borderRadius:'6px',background:'#060b18',display:'block',marginBottom:'8px'}}/>
          {/* 5-indicator badges */}
          <div style={{display:'flex',gap:'4px',flexWrap:'wrap' as const,marginBottom:'8px',alignItems:'center'}}>
            {['EMA×','RSI','MACD','BB','StochRSI'].map((lbl,i)=>(
              <span key={lbl} style={{
                padding:'2px 8px',borderRadius:'4px',fontSize:'10px',fontWeight:700,
                background:sig.f[i]?'#0b3a18':'#3a0b0b',color:sig.f[i]?'#4f8':'#f64'
              }}>{lbl}</span>
            ))}
            <span style={{marginRight:'auto',fontSize:'11px',color:'#7a9abc'}}>
              RSI: <strong style={{color:sig.rsi>70?'#f64':sig.rsi<30?'#4f8':'#fa4'}}>{sig.rsi.toFixed(0)}</strong>
            </span>
          </div>
          <div style={{display:'flex',gap:'4px',alignItems:'center',marginBottom:'8px'}}>
            <div style={{
              flex:1,padding:'6px',borderRadius:'6px',textAlign:'center' as const,fontWeight:800,fontSize:'13px',
              background:sig.dir==='BUY'?'#0b3a18':sig.dir==='SELL'?'#3a0b0b':'#101828',
              color:sig.dir==='BUY'?'#4f8':sig.dir==='SELL'?'#f64':'#7a9abc'
            }}>
              {sig.dir==='BUY'?'▲ איתות קנייה':sig.dir==='SELL'?'▼ איתות מכירה':'— המתנה'} {sig.score}/5
            </div>
          </div>
          <div style={{display:'flex',gap:'6px'}}>
            <button style={{flex:1,cursor:'pointer',border:'none',borderRadius:'6px',padding:'7px',fontSize:'12px',fontWeight:800,background:'#0b3a18',color:'#4f8'}}
              onClick={()=>{ if(selInfo) openTrade(selected,'LONG',selInfo.price) }}>▲ לונג (קנייה)</button>
            <button style={{flex:1,cursor:'pointer',border:'none',borderRadius:'6px',padding:'7px',fontSize:'12px',fontWeight:800,background:'#3a0b0b',color:'#f64'}}
              onClick={()=>{ if(selInfo) openTrade(selected,'SHORT',selInfo.price) }}>▼ שורט (מכירה)</button>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div style={S.panel}>
          <div style={{fontWeight:700,marginBottom:'8px',color:'#7a9abc',fontSize:'11px'}}>רמת סיכון: {risk==='low'?'נמוך':risk==='medium'?'בינוני':'גבוה'}</div>
          {[
            ['גודל פוזיציה',(R.pct*100).toFixed(0)+'%'],
            ['סטופ לוס',(R.sl*100).toFixed(1)+'%'],
            ['טייק פרופיט',(R.tp*100).toFixed(1)+'%'],
            ['סטופ גרור',(R.trail*100).toFixed(1)+'%'],
            ['יחס סיכוי/סיכון',(R.tp/R.sl).toFixed(1)+'x'],
            ['עסקאות פתוחות',openTrades.length.toString()],
            ['סה"כ עסקאות',trades.length.toString()],
          ].map(([k,v])=>(
            <div key={k} style={S.row}><span style={{color:'#3a5a88'}}>{k}</span><span style={{color:'#4af',fontWeight:700}}>{v}</span></div>
          ))}
          <div style={{fontWeight:700,margin:'10px 0 6px',color:'#7a9abc',fontSize:'11px'}}>פוזיציות פתוחות</div>
          {openTrades.length===0 && <div style={{color:'#1e3050',textAlign:'center',padding:'10px',fontSize:'11px'}}>אין פוזיציות פתוחות</div>}
          {openTrades.slice(-5).map(t=>{
            const cur=prices[t.sym]?.price||t.entry
            const pnl=(t.side==='LONG'?(cur-t.entry):(t.entry-cur))*t.size
            const pct=(cur-t.entry)/t.entry*(t.side==='LONG'?1:-1)*100
            return (
              <div key={t.id} style={{background:'#0d1828',borderRadius:'5px',padding:'5px 7px',marginBottom:'4px'}}>
                <div style={{display:'flex',justifyContent:'space-between'}}>
                  <span style={{color:t.side==='LONG'?'#4f8':'#f64',fontWeight:700}}>{t.side==='LONG'?'לונג':'שורט'} {t.sym}</span>
                  <span style={{color:pnl>=0?'#4f8':'#f64',fontWeight:700}}>{pnl>=0?'+':''}{pnl.toFixed(2)} ({pct.toFixed(1)}%)</span>
                </div>
                <div style={{fontSize:'10px',color:'#3a5a88',marginTop:'2px'}}>
                  כניסה:{fmtPrice(t.entry)} | סטופ גרור:{fmtPrice(t.trailSL)}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── TABS ── */}
      <div style={{...S.panel}}>
        <div style={{display:'flex',gap:'6px',marginBottom:'8px'}}>
          {([['history','היסטוריה'],['stats','סטטיסטיקה']] as const).map(([t,label])=>(
            <button key={t} style={S.btn('#4af',tab===t)} onClick={()=>setTab(t as 'history'|'stats')}>{label}</button>
          ))}
          <span style={{marginRight:'auto',color:'#3a5a88',fontSize:'11px',alignSelf:'center'}}>
            {closed.length} סגורות | {wins} נ׳ {closed.length-wins} ה׳
          </span>
        </div>

        {tab==='history' && (
          closed.length===0
            ? <div style={{color:'#1e3050',textAlign:'center',padding:'16px',fontSize:'12px'}}>אין עסקאות סגורות עדיין — הבוט עוקב אחרי השוק</div>
            : <div style={{overflowX:'auto'}}>
                <table style={S.tbl}>
                  <thead><tr>
                    {['מטבע','כיוון','כניסה','יציאה','ר/ה','%','סטטוס','שעה'].map(h=><th key={h} style={S.th}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {[...closed].reverse().slice(0,20).map(t=>(
                      <tr key={t.id}>
                        <td style={S.td('#4af')}>{t.sym}</td>
                        <td style={S.td(t.side==='LONG'?'#4f8':'#f64')}>{t.side==='LONG'?'לונג':'שורט'}</td>
                        <td style={S.td()}>{fmtPrice(t.entry)}</td>
                        <td style={S.td()}>{t.exit?fmtPrice(t.exit):'—'}</td>
                        <td style={S.td((t.pnl||0)>=0?'#4f8':'#f64')}>{(t.pnl||0)>=0?'+':''}{(t.pnl||0).toFixed(2)}</td>
                        <td style={S.td((t.pnlPct||0)>=0?'#4f8':'#f64')}>{((t.pnlPct||0)*100).toFixed(2)}%</td>
                        <td style={S.td(t.status==='TP'?'#4f8':t.status==='SL'?'#f64':'#fa4')}>{t.status==='TP'?'TP ✓':t.status==='SL'?'SL ✗':t.status==='TRAIL'?'Trail':'סגור'}</td>
                        <td style={S.td('#3a5a88')}>{new Date(t.ts).toLocaleTimeString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
        )}

        {tab==='stats' && (
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'8px'}}>
            {[
              {label:'אחוז ניצחון',value:winRate.toFixed(1)+'%',color:winRate>55?'#4f8':winRate>45?'#fa4':'#f64'},
              {label:'מדד שארפ',value:sharpe.toFixed(2),color:sharpe>1?'#4f8':sharpe>0?'#fa4':'#f64'},
              {label:'ירידה מקסימלית',value:maxDD.toFixed(1)+'%',color:maxDD<10?'#4f8':maxDD<25?'#fa4':'#f64'},
              {label:'רווח/הפסד סה"כ',value:(totalPnl>=0?'+':'')+totalPnl.toFixed(2),color:totalPnl>=0?'#4f8':'#f64'},
              {label:'סה"כ עסקאות',value:trades.length.toString(),color:'#4af'},
              {label:'יתרה',value:'$'+balance.toFixed(0),color:balance>=INIT_BAL?'#4f8':'#f64'},
              {label:'פוזיציות פתוחות',value:openTrades.length.toString(),color:'#fa4'},
              {label:'ממוצע ניצחון',value:wins>0?'+'+(closed.filter(t=>(t.pnl||0)>0).reduce((a,t)=>a+(t.pnl||0),0)/wins).toFixed(2):'—',color:'#4f8'},
              {label:'ממוצע הפסד',value:(closed.length-wins)>0?(closed.filter(t=>(t.pnl||0)<=0).reduce((a,t)=>a+(t.pnl||0),0)/(closed.length-wins)).toFixed(2):'—',color:'#f64'},
            ].map(({label,value,color})=>(
              <div key={label} style={{background:'#0d1828',borderRadius:'6px',padding:'10px',textAlign:'center' as const}}>
                <div style={{color:'#3a5a88',fontSize:'10px',marginBottom:'4px'}}>{label}</div>
                <div style={{color,fontWeight:800,fontSize:'16px'}}>{value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{textAlign:'center' as const,color:'#1e3050',fontSize:'10px',marginTop:'8px'}}>
        מסחר וירטואלי בלבד — מחירים אמיתיים מ-Binance בזמן אמת
      </div>
    </div>
  )
}

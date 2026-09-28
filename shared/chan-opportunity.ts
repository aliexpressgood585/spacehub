import type { Bar } from './chan.ts'

export type ChanOpportunityMeta = {
  ret15:number|null
  ret60:number|null
  mtf15:1|-1|0
  mtf60:1|-1|0
  mtf_side:1|-1|0
  mtf_strength:number
  compression:number|null
  breakout_side:1|-1|0
  breakout_strength:number
  breakout_stop_long:number|null
  breakout_stop_short:number|null
}

function ema(xs:number[], n:number):number {
  if(!xs.length) return NaN
  const a=2/(n+1)
  let e=xs[0]
  for(let i=1;i<xs.length;i++) e += a*(xs[i]-e)
  return e
}

function aggregate(bars:Bar[], factor:number):Bar[] {
  const ms=300_000*factor
  const m=new Map<number,Bar>()
  for(const b of bars){
    const t=Math.floor(b.t/ms)*ms
    const x=m.get(t)
    if(!x) m.set(t,{t,o:b.o,h:b.h,l:b.l,c:b.c})
    else { x.h=Math.max(x.h,b.h); x.l=Math.min(x.l,b.l); x.c=b.c }
  }
  return [...m.values()].sort((a,b)=>a.t-b.t)
}

function tfTrend(bars:Bar[], factor:number, fast:number, slow:number):1|-1|0 {
  const a=aggregate(bars,factor)
  if(a.length<slow+3) return 0
  const c=a.map(x=>x.c)
  const f=ema(c.slice(-(slow+6)),fast), s=ema(c.slice(-(slow+6)),slow)
  const prev=c.slice(0,-1)
  const fp=ema(prev.slice(-(slow+6)),fast), sp=ema(prev.slice(-(slow+6)),slow)
  if(f>s && fp>=sp) return 1
  if(f<s && fp<=sp) return -1
  return 0
}

export function chanOpportunityMeta(bars:Bar[], atr:number):ChanOpportunityMeta {
  const n=bars.length, last=bars[n-1]?.c
  const ret=(k:number)=>n>k&&last>0&&bars[n-1-k].c>0 ? last/bars[n-1-k].c-1 : null
  const mtf15=tfTrend(bars,3,5,13)
  const mtf60=tfTrend(bars,12,3,8)
  const mtfSide:1|-1|0 = mtf15===mtf60 ? mtf15 : (mtf60!==0&&mtf15===0?mtf60:(mtf15!==0&&mtf60===0?mtf15:0))
  const mtfStrength=(mtf15!==0?0.45:0)+(mtf60!==0?0.55:0)+(mtf15!==0&&mtf15===mtf60?0.35:0)

  let compression:number|null=null, breakoutSide:1|-1|0=0, breakoutStrength=0
  if(n>=55 && last>0){
    const prev12=bars.slice(n-13,n-1), prev48=bars.slice(n-49,n-1)
    const range=(x:Bar[])=>Math.max(...x.map(b=>b.h))-Math.min(...x.map(b=>b.l))
    const r12=range(prev12), r48=range(prev48)
    compression=r48>0?r12/r48:null
    const hi=Math.max(...prev12.map(b=>b.h)), lo=Math.min(...prev12.map(b=>b.l))
    const body=Math.abs(bars[n-1].c-bars[n-1].o)
    const candleRange=Math.max(1e-12,bars[n-1].h-bars[n-1].l)
    const expansion=body/candleRange
    if(compression!=null && compression<=0.52 && expansion>=0.45){
      if(last>hi) breakoutSide=1
      else if(last<lo) breakoutSide=-1
      if(breakoutSide) breakoutStrength=Math.min(3,1+(0.52-compression)*5+expansion)
    }
  }
  const frac=Math.max(0.0025,Math.min(0.009,Number.isFinite(atr)&&atr>0&&last>0?0.70*atr/last:0.0045))
  return {
    ret15:ret(3),ret60:ret(12),mtf15,mtf60,mtf_side:mtfSide,mtf_strength:mtfStrength,
    compression,breakout_side:breakoutSide,breakout_strength:breakoutStrength,
    breakout_stop_long:last>0?last*(1-frac):null,
    breakout_stop_short:last>0?last*(1+frac):null
  }
}

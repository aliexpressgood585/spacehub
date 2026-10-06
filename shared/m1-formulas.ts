import type { LBar } from './lab.ts'

export const M1_FORMULA = {
  barMs: 60_000,
  lev: 12,
  symbols: ['AGTUSDT','LQTYUSDT'] as const,
  agtHoldMs: 7_200_000,
  lqtyHoldMs: 3_600_000,
} as const

function validTail(b:LBar[],bar:number,n:number){
  const xs=b.slice(-n)
  return xs.length===n&&xs.every((x,i)=>
    x.t===bar-(n-i)*M1_FORMULA.barMs&&
    [x.open,x.close,x.high,x.low,x.vol].every(Number.isFinite)&&
    x.low>0&&x.high>=Math.max(x.open,x.close)&&x.low<=Math.min(x.open,x.close)&&x.vol>=0
  )?xs:null
}

function rsi14(b:LBar[]){
  if(b.length<15)return NaN
  const c=b.map(x=>x.close)
  let gain=0,loss=0
  for(let i=1;i<=14;i++){
    const d=c[i]-c[i-1]
    if(d>0)gain+=d
    else loss-=d
  }
  let ag=gain/14,al=loss/14
  for(let i=15;i<c.length;i++){
    const d=c[i]-c[i-1],g=Math.max(d,0),l=Math.max(-d,0)
    ag=(ag*13+g)/14
    al=(al*13+l)/14
  }
  if(al===0)return ag>0?100:50
  const rs=ag/al
  return 100-100/(1+rs)
}

export function m1FormulaSignal(sym:string,b:LBar[],bar:number){
  if(sym==='AGTUSDT'){
    if(b.length<20)return {sig:null,reason:'insufficient_bars'}
    const xs=validTail(b,bar,3)
    if(!xs)return {sig:null,reason:'invalid_bars'}
    const [a,x,y]=xs
    if(!(a.close>a.open&&x.close<x.open&&y.close<y.open))return {sig:null,reason:'not_GRR'}
    const ret=y.close/a.open-1
    if(ret>-.005)return {sig:null,reason:'drop_lt_0_5pct'}
    const av=b.slice(-20).reduce((s,z)=>s+z.vol,0)/20
    if(!(av>0)||y.vol<av*1.5)return {sig:null,reason:'volume_lt_1_5x'}
    return {sig:{dir:1 as const,atr:0,pattern:'AGT_GRR_1M',holdMs:M1_FORMULA.agtHoldMs,ret,volRatio:y.vol/av},reason:'AGT_GRR_1M'}
  }
  if(sym==='LQTYUSDT'){
    if(b.length<20)return {sig:null,reason:'insufficient_bars'}
    const xs=validTail(b,bar,3)
    if(!xs)return {sig:null,reason:'invalid_bars'}
    const [a,x,y]=xs
    if(!(a.close<a.open&&x.close<x.open&&y.close<y.open))return {sig:null,reason:'not_RRR'}
    const ret=y.close/a.open-1
    if(ret>-.0075)return {sig:null,reason:'drop_lt_0_75pct'}
    const rsi=rsi14(b)
    if(!Number.isFinite(rsi)||rsi>40)return {sig:null,reason:'rsi_gt_40'}
    return {sig:{dir:1 as const,atr:0,pattern:'LQTY_RRR_1M',holdMs:M1_FORMULA.lqtyHoldMs,ret,rsi},reason:'LQTY_RRR_1M'}
  }
  return {sig:null,reason:'unsupported_symbol'}
}

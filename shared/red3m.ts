import type { LBar } from './lab.ts'

export const R3 = {
  barMs: 180_000,
  lev: 28,
  r6Symbols: ['KAVAUSDT','1000000MOGUSDT'] as const,
  r7Symbols: ['KAVAUSDT','LQTYUSDT','LUMIAUSDT'] as const,
} as const

function validBars(b:LBar[],bar:number,n:number){
  const xs=b.slice(-n)
  return xs.length===n&&xs.every((x,i)=>
    x.t===bar-(n-i)*R3.barMs&&
    [x.open,x.close,x.high,x.low].every(Number.isFinite)&&
    x.low>0&&x.high>=Math.max(x.open,x.close)&&x.low<=Math.min(x.open,x.close)
  ) ? xs : null
}

export function red3mSignal(b:LBar[],bar:number,n:6|7){
  const xs=validBars(b,bar,n)
  return xs&&xs.every(x=>x.close<x.open)
    ? {sig:{dir:1 as const,atr:0},reason:`R${n}_3M`}
    : {sig:null,reason:xs?`not_R${n}_3M`:'invalid_bars'}
}


export const L10 = {
  barMs: 600_000,
  lev: 29,
  fall5Symbols: ['KAVAUSDT'] as const,
  r6Symbols: ['KAVAUSDT','SUSHIUSDT'] as const,
} as const

export function aggregate10m(b5:LBar[]):LBar[]{
  const out:LBar[]=[]
  const sorted=[...b5].sort((a,b)=>a.t-b.t)
  for(let i=0;i+1<sorted.length;i++){
    const a=sorted[i],b=sorted[i+1],bucket=Math.floor(a.t/L10.barMs)*L10.barMs
    if(a.t!==bucket||b.t!==a.t+300_000)continue
    out.push({t:a.t,open:a.open,high:Math.max(a.high,b.high),low:Math.min(a.low,b.low),close:b.close,vol:a.vol+b.vol,tb:Number.isFinite(a.tb)&&Number.isFinite(b.tb)?a.tb+b.tb:NaN})
    i++
  }
  return out
}

function valid10(b:LBar[],bar:number,n:number){
  const xs=b.slice(-n)
  return xs.length===n&&xs.every((x,i)=>
    x.t===bar-(n-i)*L10.barMs&&
    [x.open,x.close,x.high,x.low].every(Number.isFinite)&&
    x.low>0&&x.high>=Math.max(x.open,x.close)&&x.low<=Math.min(x.open,x.close)
  )?xs:null
}

export function fall5Signal10m(b:LBar[],bar:number){
  const xs=valid10(b,bar,5)
  return xs&&xs.every((x,i)=>i===0||xs[i-1].close>x.close)
    ? {sig:{dir:1 as const,atr:0},reason:'FALL5_10M'}
    : {sig:null,reason:xs?'not_FALL5_10M':'invalid_bars'}
}

export function red6Signal10m(b:LBar[],bar:number){
  const xs=valid10(b,bar,6)
  return xs&&xs.every(x=>x.close<x.open)
    ? {sig:{dir:1 as const,atr:0},reason:'R6_10M'}
    : {sig:null,reason:xs?'not_R6_10M':'invalid_bars'}
}

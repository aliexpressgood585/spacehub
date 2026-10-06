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

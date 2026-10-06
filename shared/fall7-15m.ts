import type { LBar } from './lab.ts'

export const FALL7_15M = {
  barMs: 900_000,
  lev: 30,
  symbols: ['ANKRUSDT','1000000MOGUSDT','SUSHIUSDT','HYPERUSDT','LUMIAUSDT'] as const,
} as const

export function fall7Signal(b:LBar[],bar:number){
  const seven=b.slice(-7)
  const valid=seven.length===7&&seven.every((x,i)=>
    x.t===bar-(7-i)*FALL7_15M.barMs&&
    [x.open,x.close,x.high,x.low].every(Number.isFinite)&&
    x.low>0&&x.high>=Math.max(x.open,x.close)&&x.low<=Math.min(x.open,x.close)
  )
  const falling=valid&&seven.every((x,i)=>i===0||seven[i-1].close>x.close)
  return falling?{sig:{dir:1 as const,atr:0},reason:'FALL7_15M'}:{sig:null,reason:valid?'not_FALL7_15M':'invalid_bars'}
}

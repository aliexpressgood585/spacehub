import type { LBar } from './lab.ts'
export const D5 = { barMs:300000, batch:96, entryWindowMs:300000 } as const
export function d5Signal(b:LBar[],bar:number){
 const five=b.slice(-5)
 const valid=five.length===5&&five.every((x,i)=>x.t===bar-(5-i)*D5.barMs&&[x.open,x.close,x.high,x.low].every(Number.isFinite)&&x.low>0&&x.high>=Math.max(x.open,x.close)&&x.low<=Math.min(x.open,x.close))
 return valid&&five.every(x=>x.close<x.open)?{sig:{dir:1 as const,atr:0},reason:'DDDDD'}:{sig:null,reason:valid?'not_DDDDD':'invalid_bars'}
}
export function d5Pairs(info:any){
 if(!Array.isArray(info?.symbols))throw new Error('invalid_exchange_info')
 return info.symbols.filter((x:any)=>x.status==='TRADING'&&x.contractType==='PERPETUAL'&&x.quoteAsset==='USDT'&&x.marginAsset==='USDT'&&x.underlyingType==='COIN'&&/^[A-Z0-9]{2,30}USDT$/.test(x.symbol)).map((x:any)=>({sym:x.symbol.slice(0,-4),s:x.symbol,k:1})).sort((a:any,b:any)=>a.s.localeCompare(b.s))
}

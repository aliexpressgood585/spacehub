import { COST } from './costs.ts'
import { walkBook } from './fast.ts'
export const FLOW = { symbols:['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','DOGEUSDT'], window:5000, stale:2000, horizon:30000, notional:1000, cooldown:60000 } as const
export type Depth={ts:number;bids:[number,number][];asks:[number,number][]}
export type Print={ts:number;usd:number;buy:boolean}
export function validBook(b:Depth|undefined,now:number):b is Depth {
 if(!b||b.ts>now||now-b.ts>FLOW.stale||!b.bids.length||!b.asks.length)return false
 for(const [levels,dir] of [[b.bids,-1],[b.asks,1]] as const){
  if(levels.some(([p,q],i)=>!Number.isFinite(p+q)||p<=0||q<=0||(i>0&&(p-levels[i-1][0])*dir<=0)))return false
 }
 return b.bids[0][0]<b.asks[0][0]
}
export function flowSignal(b:Depth|undefined,tape:Print[],pastMid:number|undefined,now:number){
 if(!validBook(b,now))return {reason:'stale_or_invalid_book',dir:0}
 const mid=(b.bids[0][0]+b.asks[0][0])/2,spread=(b.asks[0][0]-b.bids[0][0])/mid*1e4
 if(spread>8)return {reason:'wide_spread',dir:0}
 const recent=tape.filter(t=>t.ts<=now&&t.ts>=now-FLOW.window&&Number.isFinite(t.usd)&&t.usd>0)
 if(!recent.length||now-Math.max(...recent.map(t=>t.ts))>FLOW.stale)return {reason:'stale_tape',dir:0}
 if(!pastMid||!Number.isFinite(pastMid))return {reason:'warmup',dir:0}
 const buy=recent.reduce((s,t)=>s+(t.buy?t.usd:0),0),total=recent.reduce((s,t)=>s+t.usd,0)
 const bn=b.bids.reduce((s,[p,q])=>s+p*q,0),an=b.asks.reduce((s,[p,q])=>s+p*q,0)
 const flow=2*buy/total-1,depth=(bn-an)/(bn+an),move=(mid/pastMid-1)*1e4
 const dir=flow>=.2&&depth>=.2&&move>=1?1:flow<=-.2&&depth<=-.2&&move<=-1?-1:0
 return {reason:dir?'candidate':'no_alignment',dir,flow,depth,move,spread}
}
export function flowFill(b:Depth,side:1|-1,notional:number,now:number){
 if(!validBook(b,now))return null
 const levels=side===1?b.asks:b.bids,w=walkBook(levels,notional)
 if(w.beyond||!Number.isFinite(w.vwap))return null
 return side===1?Math.max(w.vwap,levels[0][0]*(1+COST.minSlip)):Math.min(w.vwap,levels[0][0]*(1-COST.minSlip))
}
export function flowResult(entry:number,exit:number,dir:number){
 const grossBps=dir*(exit/entry-1)*1e4,feeBps=COST.takerFee*(1+exit/entry)*1e4
 return {gross_bps:grossBps,fee_bps:feeBps,net_bps:grossBps-feeBps}
}
// Price the same base quantity on exit, not a fresh dollar-sized order.
export function flowExit(b:Depth,side:1|-1,qty:number,now:number){
 if(!validBook(b,now)||!(qty>0))return null
 let left=qty,notional=0
 for(const [p,q] of side===1?b.asks:b.bids){const take=Math.min(left,q);notional+=take*p;left-=take;if(left<=1e-10)break}
 if(left>1e-10)return null
 return flowFill(b,side,notional,now)
}

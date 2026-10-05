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
// v1.1 transport (2026-10-05): Binance WebSocket streams deliver ZERO frames from Supabase egress (first live session:
// 54 ticks, 0 frames; the Binance liquidation stream has recorded nothing in 3 days), while Binance REST works there.
// So books and tape are POLLED: depth20 every second (weight 2 x 6), recent trades per symbol every 3 seconds (weight 5
// x 6 / 3). ~1,320 weight/min, guarded by the X-MBX-USED-WEIGHT-1M header so the trading bot keeps its share of the
// 2,400/min budget. The signal rule is unchanged; the tape is up to ~3 s old, so the frozen 2 s staleness check now
// rejects some ticks as 'stale_tape' (journalled, never relaxed).
export const FLOW_REST = { depthEveryMs:1000, tradesEveryMs:3000, guardTrades:1500, guardAll:1900, timeoutMs:2500 } as const
export function depthFrom(d:any):Depth|null {
 const E=Number(d?.E),lv=(a:any)=>Array.isArray(a)?a.map((x:any)=>[Number(x[0]),Number(x[1])] as [number,number]):[]
 if(!Number.isFinite(E))return null
 return {ts:E,bids:lv(d.bids),asks:lv(d.asks)}
}
// Merge /fapi/v1/trades rows (oldest first) into the tape: new ids only, nothing from the future, keep 6 s.
// gap = the oldest returned id is beyond last+1, i.e. prints were missed between polls (journalled, not invented).
export function mergeTrades(tape:Print[],last:number,rows:any[],now:number){
 const ok=(Array.isArray(rows)?rows:[]).filter(r=>Number.isFinite(Number(r?.id))&&Number(r.time)<=now+1000)
 const fresh=ok.filter(r=>Number(r.id)>last)
 const gap=last>=0&&fresh.length>0&&Math.min(...fresh.map(r=>Number(r.id)))>last+1
 const next=[...tape.filter(x=>x.ts>=now-6000),...fresh.map(r=>({ts:Number(r.time),usd:Number(r.quoteQty)||Number(r.price)*Number(r.qty),buy:r.isBuyerMaker===false}))].slice(-10000)
 return {tape:next,last:fresh.length?Math.max(last,...fresh.map(r=>Number(r.id))):last,gap}
}

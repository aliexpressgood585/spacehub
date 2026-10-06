import type { AggTrade } from './fast.ts'
import type { LBar } from './lab.ts'
export type Tape = { trades:AggTrade[]; complete:boolean; checkedUntil:number; source:string; inferred:boolean }
export async function pagedTape(fetchJson:(url:string)=>Promise<any>, base:string, symbol:string, scale:number, from:number, to:number):Promise<Tape> {
  const end=Math.min(to,from+3599999),out:AggTrade[]=[]
  let nextId:number|undefined,previousId=-1,previousTime=-1
  for(let page=0;page<5;page++){
    const query=new URLSearchParams({symbol,limit:'1000',...(nextId==null?{startTime:String(from),endTime:String(end)}:{fromId:String(nextId)})})
    const rows=await fetchJson(`${base}?${query}`)
    if(!Array.isArray(rows)||rows.length>1000)throw new Error('invalid_tape')
    for(const x of rows){
      const id=Number(x.a),ts=Number(x.T),price=Number(x.p)/scale
      if(!Number.isSafeInteger(id)||id<0||id<=previousId||!Number.isFinite(ts)||ts<from||ts<previousTime||!(price>0&&Number.isFinite(price))||nextId!=null&&id!==previousId+1)throw new Error('invalid_tape_order')
      previousId=id;previousTime=ts
      if(ts<=end)out.push({p:price,T:ts})
    }
    if(rows.length<1000||previousTime>end)return{trades:out,complete:end===to,checkedUntil:end,source:base.includes('fapi')?'binance-futures':'binance-spot',inferred:false}
    nextId=previousId+1
  }
  // Do not persist state after processing only part of a millisecond. Replay that
  // entire final millisecond next time; the runner resumes at checkedUntil+1.
  const checkedUntil=(out.at(-1)?.T??from)-1
  return{trades:out.filter(x=>x.T<=checkedUntil),complete:false,checkedUntil,source:base.includes('fapi')?'binance-futures':'binance-spot',inferred:false}
}
export function candleTape(bars:LBar[],from:number,to:number,dir:1|-1,source:string):Tape {
  const out:AggTrade[]=[],end=Math.min(to,from+3599999)
  let expected=Math.floor(from/60000)*60000,checked=from
  for(const b of [...bars].sort((a,b)=>a.t-b.t)){
    if(b.t<expected)continue
    if(b.t!==expected||b.t+60000>end)break // never use a forming candle or cross a gap
    if(![b.open,b.high,b.low,b.close].every(Number.isFinite)||b.low<=0||b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close))break
    // Candle order is inferred, adverse-first, not exchange trade timestamps.
    // In the partial entry minute extrema have unknown timing. Include the
    // adverse extreme conservatively; do not award the favorable extreme.
    const partial=from>b.t
    const seq=partial?[dir>0?b.low:b.high,b.close]:dir>0?[b.open,b.low,b.high,b.close]:[b.open,b.high,b.low,b.close]
    const ts=partial?[Math.max(from,b.t+59998),b.t+59999]:[b.t+1,b.t+20000,b.t+40000,b.t+59999]
    for(let i=0;i<seq.length;i++)if(ts[i]>=from)out.push({p:seq[i],T:ts[i]})
    checked=b.t+59999;expected=b.t+60000
  }
  return{trades:out,complete:checked>=to,checkedUntil:checked,source,inferred:true}
}

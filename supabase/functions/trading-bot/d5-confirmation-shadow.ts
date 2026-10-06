import { d5Execution } from '../../../shared/d5-execution.ts'
import { COST } from '../../../shared/costs.ts'
import type { LBar } from '../../../shared/lab.ts'
import type { Pair } from './fast-runner.ts'

// Observation only. Separate table, fixed $100 notional, no bot_state/trade writes.
export async function confirmationShadow(db:any,now:number,lease:string,deps:{
 bars:(p:Pair)=>Promise<LBar[]>;book:(p:Pair)=>Promise<any>;exit:(t:any,n:number)=>Promise<any>
}){
 if(Date.now()>Date.parse(lease)-20000)return
 const {data:rows}=await db.from('d5_confirmation_shadow').select('*').in('status',['pending','open']).lte('next_check',new Date(now).toISOString()).order('next_check').limit(2).throwOnError()
 for(const row of rows??[]){
  if(Date.now()>Date.parse(lease)-15000)break
  try{
   const opened=Date.parse(row.baseline_opened_at),p=row.pair as Pair
   let change:any={next_check:new Date(now+60000).toISOString()}
   if(now-opened>86400000)change={...change,status:'expired',reason:'24h_observation_limit'}
   else if(row.status==='pending'){
    const b=(await deps.bars(p)).filter(x=>x.t+300000>opened&&x.t+300000<=now&&x.t+300000<=opened+900000).sort((a,b)=>a.t-b.t)
    const first=Math.floor(opened/300000)*300000
    const contiguous=b.length>0&&b.every((x,i)=>x.t===first+i*300000&&[x.open,x.high,x.low,x.close].every(Number.isFinite)&&x.low>0&&x.high>=Math.max(x.open,x.close)&&x.low<=Math.min(x.open,x.close))
    const confirmed=contiguous?b.find(x=>x.close>x.open):undefined
    if(confirmed&&now-(confirmed.t+300000)<=60000){
     const bk=await deps.book(p)
     // Funding forecast is explicitly unavailable here; entry feasibility is a proxy.
     // Actual settled funding is charged by the shared exit resolver.
     const ex=d5Execution(bk,100,1,Date.now(),0,8)
     if(ex.ok===false)change={...change,status:'expired',reason:ex.reason}
     else{
      const price=ex.price,ts=Date.now()
      change={...change,status:'open',reason:'green_5m_confirmed',confirmed_bar:confirmed.t,entry_at:new Date(ts).toISOString(),
       payload:{sym:p.sym,side:'LONG',entry_price:price,size:ex.notional/price,fee:ex.notional*COST.takerFee,lev:1,opened_at:new Date(ts).toISOString(),
        scalp_meta:{q15:{pattern:'DDDDD',pair:p,r:price*.01,stop:price*.99,target:price*1.01,chk:ts,protection:ex.protection}}},
       assumptions:{fixed_notional:ex.notional,funding_forecast:'unavailable_zero_proxy',exit_funding:'shared_settlement_model',capital_constraints:false}}
     }
    }else if(confirmed||now>=opened+900000)change={...change,status:'expired',reason:confirmed?'confirmation_quote_late':contiguous?'no_confirmation':'confirmation_data_gap'}
    else change.next_check=new Date(Math.floor(now/300000)*300000+300000).toISOString()
   }else{
    const r=await deps.exit(row.payload,now)
    if(r.close){
     const t=row.payload,n=t.entry_price*t.size
     const pnl=(r.close.price-t.entry_price)*t.size-t.fee-r.close.price*t.size*COST.takerFee-r.close.funding
     change={...change,status:'closed',net_bps:pnl/n*1e4,closed_at:new Date(now).toISOString(),exit:r.close,reason:r.close.reason}
    }else if(r.update)change.payload={...row.payload,scalp_meta:{q15:{...row.payload.scalp_meta.q15,...r.update}}}
   }
   await db.from('d5_confirmation_shadow').update(change).eq('trade_id',row.trade_id).eq('status',row.status).throwOnError()
  }catch(e:any){await db.from('d5_confirmation_shadow').update({next_check:new Date(now+60000).toISOString(),reason:'data_error:'+String(e.message).slice(0,100)}).eq('trade_id',row.trade_id).throwOnError()}
 }
}

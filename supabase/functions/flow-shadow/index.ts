// Observation-only service. Never imports an order adapter or touches trading tables.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { FLOW, FLOW_REST, depthFrom, mergeTrades, flowSignal, flowFill, flowExit, flowResult, validBook, type Depth, type Print } from '../../../shared/flow-shadow.ts'
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}})
async function collect(token:string){
 const started=Date.now(),books=new Map<string,Depth>(),tapes=new Map<string,Print[]>(),mids=new Map<string,{ts:number;mid:number}[]>(),ids=new Map<string,number>(),funding=new Map<string,number>(),reasons:Record<string,number>={},lastEntry=new Map<string,number>()
 let pollTimer:ReturnType<typeof setInterval>|undefined,lastPollErr:string|null=null,timer:ReturnType<typeof setInterval>|undefined,frames=0,ticks=0,readyTicks=0,error:string|null=null,pending:any[]=[],outcomes:any[]=[],busy=false
 const count=(r:string)=>{reasons[r]=(reasons[r]??0)+1}
 try{
  const {data:old,error:e}=await db.from('flow_shadow').select('*').eq('status','open');if(e)throw e;pending=old??[]
  const {data:recent,error:re}=await db.from('flow_shadow').select('symbol,t0').gte('t0',started-FLOW.cooldown);if(re)throw re
  for(const r of recent??[])lastEntry.set(r.symbol,Math.max(lastEntry.get(r.symbol)??0,r.t0))
  const f=await fetch('https://fapi.binance.com/fapi/v1/premiumIndex',{signal:AbortSignal.timeout(5000)});if(!f.ok)throw new Error('funding schedule HTTP '+f.status)
  for(const r of await f.json())funding.set(r.symbol,Number(r.nextFundingTime))
  // v1.1: REST polling (Binance WebSocket streams are silent from Supabase egress; see shared/flow-shadow.ts)
  let weight=0,lastTrades=0
  const get=async(url:string)=>{const r=await fetch(url,{signal:AbortSignal.timeout(FLOW_REST.timeoutMs)});const w=Number(r.headers.get('x-mbx-used-weight-1m'));if(Number.isFinite(w)&&w>0)weight=w;if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}
  const poll=async()=>{
   const now=Date.now()
   if(weight>=FLOW_REST.guardAll){count('weight_guard');return}
   const doTrades=now-lastTrades>=FLOW_REST.tradesEveryMs&&weight<FLOW_REST.guardTrades
   if(doTrades)lastTrades=now;else if(now-lastTrades>=FLOW_REST.tradesEveryMs)count('weight_guard_trades')
   await Promise.all(FLOW.symbols.map(async s=>{
    try{const d=depthFrom(await get(`https://fapi.binance.com/fapi/v1/depth?symbol=${s}&limit=20`)),t=Date.now()
     if(d&&d.ts<=t+1000&&d.ts>=(books.get(s)?.ts??0)){books.set(s,d);frames++}}catch(e){count('depth_poll_error');lastPollErr='depth '+String(e)}
    if(!doTrades)return
    try{const m=mergeTrades(tapes.get(s)??[],ids.get(s)??-1,await get(`https://fapi.binance.com/fapi/v1/trades?symbol=${s}&limit=1000`),Date.now())
     tapes.set(s,m.tape);ids.set(s,m.last);frames++;if(m.gap)count('tape_gap')}catch(e){count('trades_poll_error');lastPollErr='trades '+String(e)}
   }))
  }
  let polling=false
  pollTimer=setInterval(()=>{if(polling)return;polling=true;poll().finally(()=>{polling=false})},FLOW_REST.depthEveryMs)
  polling=true;await poll().finally(()=>{polling=false})
  const step=()=>{
   if(busy)return;busy=true
   try{
    const now=Date.now();ticks++
    for(const p of [...pending]){
     if(now<p.due)continue
     const b=books.get(p.symbol),exit=b?flowExit(b,p.side===1?-1:1,p.qty,now):null
     if(now-p.due<=5000&&!exit)continue
     const expired=now-p.due>5000||!exit||now>=p.funding_at
     outcomes.push({...p,status:expired?'expired':'closed',closed_at:new Date(now).toISOString(),exit_price:expired?null:exit,...(!expired?flowResult(p.entry_price,exit!,p.side):{}),exit_lag_ms:now-p.due})
     pending=pending.filter(x=>x!==p)
    }
    for(const symbol of FLOW.symbols){
     const b=books.get(symbol),history=mids.get(symbol)??[]
     const past=history.filter(x=>x.ts<=now-FLOW.window).at(-1)
     if(validBook(b,now)){readyTicks++;history.push({ts:now,mid:(b.bids[0][0]+b.asks[0][0])/2})}
     mids.set(symbol,history.filter(x=>x.ts>=now-7000))
     const signal=flowSignal(b,tapes.get(symbol)??[],past?.mid,now);count(signal.reason)
     if(!signal.dir||pending.some(x=>x.symbol===symbol)||now-(lastEntry.get(symbol)??0)<FLOW.cooldown)continue
     const next=funding.get(symbol);if(!next||next-now<60000){count('funding_schedule');continue}
     const price=flowFill(b!,signal.dir as 1|-1,FLOW.notional,now);if(!price){count('thin_book');continue}
     pending.push({symbol,t0:now,due:now+FLOW.horizon,side:signal.dir,qty:FLOW.notional/price,entry_price:price,status:'open',funding_at:next,features:signal});lastEntry.set(symbol,now)
    }
   }finally{busy=false}
  }
  timer=setInterval(step,1000)
  await new Promise(r=>setTimeout(r,Math.max(0,55000-(Date.now()-started))))
 }catch(e){error=String(e)}finally{
  if(timer)clearInterval(timer);if(pollTimer)clearInterval(pollTimer);if(!frames&&lastPollErr&&!error)error=lastPollErr
  try{
   if(pending.length||outcomes.length){const {error:e}=await db.from('flow_shadow').upsert([...pending,...outcomes],{onConflict:'symbol,t0'});if(e)throw e}
   const {error:e}=await db.from('flow_sessions').insert({started_at:new Date(started).toISOString(),finished_at:new Date().toISOString(),ticks,ready_ticks:readyTicks,frames,reasons,error,symbols:FLOW.symbols,mode:'SHADOW'});if(e)throw e
  }catch(e){console.error('flow persistence',String(e));throw e}
  finally{await db.from('flow_lease').update({until_at:new Date().toISOString()}).eq('id',1).eq('until_at',token)}
 }
}
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return Response.json({mode:'SHADOW',orders:false,transport:'rest',symbols:FLOW.symbols,session_seconds:55,tick_ms:1000})
 const {data,error}=await db.rpc('flow_claim')
 if(error)return Response.json({ok:false,error:error.message},{status:500})
 if(!data)return Response.json({ok:true,skipped:true})
 // Supabase retains this bounded task after returning; pg_net is never held for 55 seconds.
 ;(globalThis as any).EdgeRuntime.waitUntil(collect(String(data)))
 return Response.json({ok:true,mode:'SHADOW',started:true})
})

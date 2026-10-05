// fix: trade_decisions has no strategy column — journal via observed/inferred
// AUTONOMY strong layer deploy 2026-10-05: multi-policy bandit, never de-risk.
import { Q15,q15Signal,q15Levels,q15Config,q15Edge,q15Gate } from '../../../shared/q15.ts'
import { loadAutonomy,pickPolicy,policyKnobs,learnClosedTrades,HARD_FLOOR,type PolicyId } from '../../../shared/q15-autonomy.ts'
import { labInd,type LBar } from '../../../shared/lab.ts'
import { COST,bookFrom } from '../../../shared/costs.ts'
import { fastLiq,resolveExit,walkBook,type AggTrade } from '../../../shared/fast.ts'
import { book,type Pair,aggHalted } from './fast-runner.ts'
import { json,pool } from './rota-runner.ts'
import { sleeveOff } from '../../../shared/sleeves.ts'

const pairOf=(sym:string):Pair=>sym==='PEPE'?{sym,s:'1000PEPEUSDT',k:1000}:{sym,s:`${sym}USDT`,k:1}
export async function q15Tape(p:Pair,from:number,to:number):Promise<{trades:AggTrade[];complete:boolean;checkedUntil:number}> {
 const end=Math.min(to,from+3599999),out:AggTrade[]=[]
 let url=`https://fapi.binance.com/fapi/v1/aggTrades?symbol=${p.s}&startTime=${from}&endTime=${end}&limit=1000`
 for(let page=0;page<5;page++){
  const rows=await json(url);if(!Array.isArray(rows))throw new Error('invalid_tape')
  for(const x of rows)if(+x.T>=from&&+x.T<=end)out.push({p:+x.p/p.k,T:+x.T})
  if(rows.length<1000||+rows.at(-1).T>end)return{trades:out,complete:end===to,checkedUntil:end}
  url=`https://fapi.binance.com/fapi/v1/aggTrades?symbol=${p.s}&fromId=${+rows.at(-1).a+1}&limit=1000`
 }
 return{trades:out,complete:false,checkedUntil:out.at(-1)?.T??from}
}
async function settled(p:Pair,from:number,to:number){
 const rows=await json(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${p.s}&startTime=${from}&endTime=${to}&limit=1000`)
 if(!Array.isArray(rows)||rows.length>=1000||rows.some((r:any)=>!Number.isFinite(+r.fundingRate)||!(Number(r.markPrice)>0)))throw new Error('missing_settled_funding')
 return rows.reduce((s:number,r:any)=>s+Number(r.fundingRate)*Number(r.markPrice)/p.k,0)
}
export async function exitRow(t:any,now:number){
 const m=t.scalp_meta.q15, p:Pair=m.pair??pairOf(t.sym),entry=Number(t.entry_price),dir:1|-1=t.side==='LONG'?1:-1
 const opened=Date.parse(t.opened_at),deadline=opened+(Number(m.hold_ms)||Q15.holdMs),until=now,from=Math.max(opened,Number(m.chk)||opened)
 if(![entry,opened,m.r,m.stop,m.target].every(Number.isFinite)||!(entry>0&&m.r>0))throw new Error('invalid_exit_state')
 const tape=await q15Tape(p,from,until)
 const res=resolveExit({dir,entry,r:m.r,stop:m.stop,target:m.target,liq:fastLiq(dir,entry,Number(t.lev)||Q15.lev),best:entry,trail:false},tape.trades)
 let reason:string|null=res.why,px='px' in res?res.px:NaN,trigger='T' in res?res.T:now,quote=now,fill:any={model:'aggTrades',trigger_ts:trigger,detected_ts:now,complete:tape.complete}
 if(reason==='STOP'){
  const bk=await book(p),walk=walkBook(dir>0?bk.bids:bk.asks,entry*Number(t.size))
  px*=1-dir*Math.max(COST.minSlip,walk.impact);quote=bk.E
  fill={...fill,impact_bps:walk.impact*1e4,impact_inferred:true}
 }
 if(!reason&&tape.complete&&now>=deadline){
  const bk=await book(p),walk=walkBook(dir>0?bk.bids:bk.asks,entry*Number(t.size)),top=(dir>0?bk.bids:bk.asks)[0][0]
  reason='TIMEOUT';px=top*(1-dir*Math.max(COST.minSlip,walk.impact));quote=bk.E;trigger=now
  fill={model:'book_walk',detected_ts:now,impact_bps:walk.impact*1e4}
 }
 if(reason){
  let funding=0
  try{funding=dir*Number(t.size)*await settled(p,opened,trigger)}catch{throw new Error('funding_incomplete')}
  return{close:{id:t.id,price:px,quote_ts:quote,reason,funding,funding_complete:true,fill},update:null,gross:((px-entry)*dir)/entry*1e4}
 }
 const chk=tape.checkedUntil
 return{close:null,update:chk!=null&&chk>from?{chk}:null,gross:null}
}
export async function runQ15(db:any,state:any,lease:string,paper:boolean){
 if(!paper)throw new Error('Q15 is paper-only; refusing live execution')
 const now=Date.now(),cfg=q15Config(),params=state.bot_params??{},bar=Math.floor(now/Q15.barMs)*Q15.barMs
 let autonomy=loadAutonomy(params)
 const policyId:PolicyId=pickPolicy(autonomy)
 const knobs=policyKnobs(policyId)
 autonomy={...autonomy,active:policyId,updated_at:new Date(now).toISOString()}
 const {data:allOpen}=await db.from('bot_trades').select('*').eq('status','OPEN').throwOnError()
 if((allOpen??[]).some((t:any)=>t.paper_mode!==true||!['Q15','EVT','DONCH4H'].includes(t.strategy)||Number(t.lev)<1||Number(t.lev)>(t.strategy==='DONCH4H'?1:25)))throw new Error('Q15 incompatible or non-paper book')
 const open=(allOpen??[]).filter((t:any)=>t.strategy==='Q15')
 const closes:any[]=[],updates:any[]=[],errors:string[]=[],marks:Record<string,number>={},dayMarks:Record<string,number>={}
 let markHealthy=true
 await pool(open??[],8,async(t:any)=>{try{
  const r=await exitRow(t,now)
  if(r.close)closes.push(r.close)
  else if(r.update)updates.push({id:t.id,chk:r.update.chk})
 }catch(e:any){errors.push(`${t.sym}:${String(e.message).slice(0,80)}`)}})
 for(const t of allOpen??[]){
  try{
   const p=pairOf(t.sym),bk=await book(p)
   marks[t.sym]=(bk.bids[0][0]+bk.asks[0][0])/2
  }catch{markHealthy=false}
 }
 try{
  const utc0=Date.UTC(new Date(now).getUTCFullYear(),new Date(now).getUTCMonth(),new Date(now).getUTCDate())
  if(params.agg_day?.day!==new Date(utc0).toISOString().slice(0,10)){
   for(const t of allOpen??[]){
    try{
     const p=pairOf(t.sym)
     const k=await json(`https://fapi.binance.com/fapi/v1/klines?symbol=${p.s}&interval=1m&startTime=${utc0-60000}&limit=2`)
     const row=k?.find((x:any)=>+x[0]===utc0-60000)
     if(row)dayMarks[t.sym]=+row[4]/p.k
    }catch{}
   }
  }
 }catch{}
 const {data:marked}=await db.rpc('q15_commit_cycle',{p_lease:lease,p_closes:closes,p_entries:[],p_marks:marks,p_updates:updates,p_share:cfg.share,p_note:{exit_errors:errors,marks_fresh:markHealthy,day_start_marks:dayMarks},p_bar:null}).throwOnError()
 const closing=new Set(closes.map(x=>x.id)),remaining=open.filter((t:any)=>!closing.has(t.id))
 const halted=marked?.halted===true||aggHalted(params,now)
 const scan=Number(params.q15_bar)!==bar
 if(!scan)return{changed:closes.length>0,halted,scanned:false,closed:marked?.closed??0,exit_errors:errors,marks_fresh:markHealthy}
 const {data:cache}=await db.from('market_cache').select('data').eq('key','universe').throwOnError()
 const pairs:Pair[]=(cache?.[0]?.data?.pairs??[]).filter((p:any)=>/^[A-Z0-9]+USDT$/.test(p.s)&&Number(p.k)>0)
 if(!pairs.length)throw new Error('Q15 liquid universe unavailable')
 const data=new Map<string,LBar[]>(),failures=new Map<string,string>()
 await pool(pairs,12,async p=>{try{const k=await json(`https://fapi.binance.com/fapi/v1/klines?symbol=${p.s}&interval=1m&limit=120`)
  const b=k.filter((x:any)=>Number(x[6])<bar).map((x:any)=>({t:+x[0],open:+x[1]/p.k,high:+x[2]/p.k,low:+x[3]/p.k,close:+x[4]/p.k,vol:+x[5]*p.k,tb:x[9]==null?NaN:+x[9]*p.k}))
  if(b.at(-1)?.t!==bar-Q15.barMs)throw new Error('bar_lag');data.set(p.sym,b)
 }catch(e:any){failures.set(p.sym,String(e.message))}})
 const btc=data.get('BTC'),btcDiff=btc?btc.at(-1)!.close-labInd(btc).ema20.at(-1)!:NaN
 const btcUp=Number.isFinite(btcDiff)&&btcDiff!==0?btcDiff>0:null
 let funding=new Map<string,{rate:number;hours:number}>()
 try{const [prem,info]=await Promise.all([json('https://fapi.binance.com/fapi/v1/premiumIndex'),json('https://fapi.binance.com/fapi/v1/fundingInfo')])
  for(const x of prem){const f=info.find((i:any)=>i.symbol===x.symbol);funding.set(x.symbol,{rate:+x.lastFundingRate,hours:f?+f.fundingIntervalHours:8})}
 }catch{}
 const {data:history}=await db.from('q15_shadow').select('t0,side,gross_bps,closed_at').eq('status','closed').order('closed_at',{ascending:false}).limit(5000).throwOnError()
 const edge={long:q15Edge(history??[],1,now),short:q15Edge(history??[],-1,now)}
 const {count:today}=await db.from('bot_trades').select('id',{count:'exact',head:true}).eq('strategy','Q15').gte('opened_at',new Date(now).toISOString().slice(0,10)+'T00:00:00Z').throwOnError()
 const entries:any[]=[],journal:any[]=[],shadows:any[]=[],held=new Set((allOpen??[]).filter((t:any)=>!closing.has(t.id)).map((t:any)=>t.sym))
 let cash=Number(marked?.balance??state.balance),eq=Number(marked?.equity??cash)
 let room=Math.max(0,cfg.maxOpen-remaining.length),dayN=Number(today??0),marginUsed=0,candidates=0
 for(const t of remaining)marginUsed+=Number(t.entry_price)*Number(t.size)/Math.max(Number(t.lev),1)
 for(const p of pairs){
  const b=data.get(p.sym),result=b?q15Signal(b,btcUp,p.sym==='BTC',knobs):{sig:null,reason:failures.get(p.sym)??'no_bars'}
  const rec:any={ts:new Date(now).toISOString(),sym:p.sym,side:'LONG',decision:'rejected',reason:result.reason,observed:{policy:policyId,sleeve:'Q15'},inferred:{sleeve:'Q15',policy:policyId}}
  journal.push(rec)
  const sig=result.sig
  if(!sig)continue
  candidates++
  if(held.has(p.sym)){rec.reason='coin_held';continue}
  if(room<=0){rec.reason='max_open';continue}
  if(dayN>=HARD_FLOOR.maxPerDay){rec.reason='max_day';continue}
  if(halted||state.hard_halt_at||sleeveOff(params,'Q15')){rec.reason='day_or_owner_halt';continue}
  try{
   const bk=await book(p),dir=sig.dir,price=(dir>0?bk.asks:bk.bids)[0][0]
   const lv=q15Levels(dir,price,sig.atr)
   const margin=Math.min(eq*cfg.perTrade,Math.max(0,eq*cfg.share-marginUsed),cash/(1+cfg.lev*COST.takerFee))
   const notional=margin*cfg.lev
   if(notional<20){rec.reason='no_cash';continue}
   const f=funding.get(p.s),fundRate=f?.rate??null,fundHours=f?.hours??8
   const walk=walkBook(dir>0?bk.asks:bk.bids,notional),exitWalk=walkBook(dir>0?bk.bids:bk.asks,notional)
   const gate=q15Gate({book:bookFrom(bk.bids,bk.asks,bk.E,'binance-futures'),now:Date.now(),notional,dir,rFrac:lv.r/price,entryImpact:walk.impact,exitImpact:exitWalk.impact,beyond:walk.beyond||exitWalk.beyond,funding:fundRate,fundingHours:fundHours,grossBps:edge[dir>0?'long':'short'].bps})
   if(!gate.pass){rec.reason=gate.reason;rec.observed.net_bps=gate.netBps;continue}
   const m={...lv,chk:bk.E,pair:p,bar,atr:sig.atr,hold_ms:Q15.holdMs,gate,lag_ms:Date.now()-bar,gate_mode:'measured',policy:policyId}
   shadows.push({sym:p.sym,side:sig.dir,t0:bar,payload:{id:0,sym:p.sym,side:sig.dir>0?'LONG':'SHORT',entry_price:price,size:notional/price,lev:cfg.lev,opened_at:new Date(now).toISOString(),scalp_meta:{q15:m}},status:'open'})
   rec.side=dir>0?'LONG':'SHORT'
   entries.push({sym:p.sym,side:rec.side,price,notional,lev:cfg.lev,quote_ts:bk.E,q15:{...m,policy:policyId},source:'binance-futures',profit_gate:'passed',net_bps:gate.netBps,autonomy_policy:policyId})
   rec.decision='accepted';rec.reason='candidate';held.add(p.sym);room--;dayN++;marginUsed+=margin;cash-=margin+notional*COST.takerFee
  }catch(e:any){rec.reason='entry_data_error';rec.observed.error=String(e.message).slice(0,100)}
 }
 if(shadows.length)await db.from('q15_shadow').upsert(shadows,{onConflict:'sym,t0',ignoreDuplicates:true}).throwOnError()
 const freshEntries=entries.filter(e=>Date.now()-e.quote_ts<=Q15.quoteMaxMs&&Date.now()-bar<=Q15.entryWindowMs)
 for(const r of journal)if(r.decision==='accepted'&&!freshEntries.some(e=>e.sym===r.sym)){r.decision='rejected';r.reason='expired_before_commit'}
 const reasons:Record<string,number>={};for(const r of journal)reasons[r.reason]=(reasons[r.reason]??0)+1
 try{
  let query=db.from('bot_trades').select('id,pnl,scalp_meta,closed_at').eq('strategy','Q15').neq('status','OPEN').not('closed_at','is',null).order('closed_at',{ascending:true}).order('id',{ascending:true}).limit(500)
  if(autonomy.learned_at)query=query.gte('closed_at',autonomy.learned_at)
  const {data:closed}=await query.throwOnError()
  autonomy=learnClosedTrades(autonomy,closed??[])
 }catch(e:any){errors.push('autonomy:'+String(e.message).slice(0,80))}
 const note={bar,scanned_at:now,scan_lag_ms:now-bar,scan_duration_ms:Date.now()-now,universe:pairs.length,scanned:data.size,candidates,fills:0,reasons,edge,halted,marks_fresh:markHealthy,exit_errors:errors,autonomy:{active:policyId,weights:autonomy.weights,floor:HARD_FLOOR}}
 const {data:result}=await db.rpc('q15_commit_cycle',{p_lease:lease,p_closes:[],p_entries:freshEntries,p_updates:[],p_marks:marks,p_share:cfg.share,p_note:{...note,q15_autonomy:autonomy},p_bar:bar}).throwOnError()
 const accepted=new Set<string>(result?.accepted??[])
 for(const r of journal)if(r.decision==='accepted'){r.decision=accepted.has(r.sym)?'accepted':'rejected';r.reason=accepted.has(r.sym)?'taken':'ledger_rejected'}
 try{for(let i=0;i<journal.length;i+=100)await db.from('trade_decisions').insert(journal.slice(i,i+100))}catch(e:any){errors.push('journal:'+String(e.message).slice(0,80))}
 return{changed:true,...result,...note,closed:marked?.closed??0,fills:result?.opened??0}
}

export async function settleQ15Shadows(db:any,lease:string){
 if(Date.now()>Date.parse(lease)-15000)return
 const now=Date.now()
 const {data:shadowOpen}=await db.from('q15_shadow').select('*').eq('status','open').order('t0').limit(4).throwOnError()
 await pool<any>(shadowOpen??[],4,async s=>{try{const r=await exitRow(s.payload,now)
  if(r.close)await db.from('q15_shadow').update({status:'closed',gross_bps:r.gross,closed_at:new Date(now).toISOString(),exit:r.close}).eq('id',s.id).throwOnError()
  else if(r.update)await db.from('q15_shadow').update({payload:{...s.payload,scalp_meta:{q15:{...s.payload.scalp_meta.q15,chk:r.update.chk}}}}).eq('id',s.id).throwOnError()
 }catch{}})
}

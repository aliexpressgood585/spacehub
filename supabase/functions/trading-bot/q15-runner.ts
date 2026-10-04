// P-Q15 deploy smoke trigger: paper-only cycle after edge deployment.
// P-Q15: completed 15m scans; pure signal and cost rules in shared/q15.ts.
import { Q15,q15Signal,q15Levels,q15Config,q15Edge,q15Gate } from '../../../shared/q15.ts'
import { labInd,type LBar } from '../../../shared/lab.ts'
import { COST,bookFrom } from '../../../shared/costs.ts'
import { fastLiq,resolveExit,walkBook,type AggTrade } from '../../../shared/fast.ts'
import { book,type Pair,aggHalted } from './fast-runner.ts'
import { json,pool } from './rota-runner.ts'
import { sleeveOff } from '../../../shared/sleeves.ts'

const pairOf=(sym:string):Pair=>sym==='PEPE'?{sym,s:'1000PEPEUSDT',k:1000}:{sym,s:`${sym}USDT`,k:1}
export async function q15Tape(p:Pair,from:number,to:number):Promise<{trades:AggTrade[];complete:boolean}> {
 const end=Math.min(to,from+3599999),out:AggTrade[]=[]
 let url=`https://fapi.binance.com/fapi/v1/aggTrades?symbol=${p.s}&startTime=${from}&endTime=${end}&limit=1000`
 for(let page=0;page<5;page++){
  const rows=await json(url);if(!Array.isArray(rows))throw new Error('invalid_tape')
  for(const x of rows)if(+x.T>=from&&+x.T<=end)out.push({p:+x.p/p.k,T:+x.T})
  if(rows.length<1000||+rows.at(-1).T>end)return{trades:out,complete:end===to}
  url=`https://fapi.binance.com/fapi/v1/aggTrades?symbol=${p.s}&fromId=${+rows.at(-1).a+1}&limit=1000`
 }
 return{trades:out,complete:false}
}
async function settled(p:Pair,from:number,to:number){
 const rows=await json(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${p.s}&startTime=${from}&endTime=${to}&limit=1000`)
 if(!Array.isArray(rows)||rows.length>=1000||rows.some((r:any)=>!Number.isFinite(+r.fundingRate)||!(Number(r.markPrice)>0)))throw new Error('missing_settled_funding')
 return rows.reduce((s:number,r:any)=>s+Number(r.fundingRate)*Number(r.markPrice)/p.k,0)
}
// Same exits for shadow and funded rows; only the ledger can return PAPER cash.
async function exitRow(t:any,now:number){
 const m=t.scalp_meta.q15, p:Pair=m.pair??pairOf(t.sym),entry=Number(t.entry_price),dir:1|-1=t.side==='LONG'?1:-1
 const opened=Date.parse(t.opened_at),deadline=opened+Q15.holdMs,until=Math.min(now,deadline),from=Math.max(opened,Number(m.chk)||opened)
 const tape=await q15Tape(p,from,until)
 const res=resolveExit({dir,entry,r:m.r,stop:m.stop,target:m.target,liq:fastLiq(dir,entry,t.lev),best:entry,trail:false},tape.trades)
 if(!res.why&&(!tape.complete||now<deadline))return {update:{id:t.id,chk:tape.complete?until:(tape.trades.at(-1)?.T??from),tape_complete:tape.complete}}
 const bk=await book(p),w=walkBook(dir>0?bk.bids:bk.asks,entry*Number(t.size))
 const why=res.why??'TIMEOUT',trigger=res.why?res.px:(dir>0?bk.bids[0][0]:bk.asks[0][0]),exitAt=res.why?res.T:now
 const halfSpread=(bk.asks[0][0]-bk.bids[0][0])/(bk.asks[0][0]+bk.bids[0][0])
 const price=why==='LIQUIDATION'?trigger:trigger*(1-dir*(halfSpread+Math.max(COST.minSlip,w.impact)))
 const fund=await settled(p,opened,exitAt)
 return {close:{id:t.id,price,reason:why,quote_ts:bk.E,funding:dir*fund*Number(t.size),funding_complete:true,
  fill:{model:'aggTrades+walkBook',trigger_ts:exitAt,detected_ts:now,lag_ms:now-exitAt,impact_bps:w.impact*1e4,beyond_book:w.beyond}},gross:dir*(price/entry-1)*1e4}
}
export async function runQ15(db:any,state:any,lease:string,paper:boolean){
 if(!paper)throw new Error('Q15 is paper-only; refusing live execution')
 const now=Date.now(),cfg=q15Config(),params=state.bot_params??{},immediate=String((globalThis as any).__Q15_IMMEDIATE??'true')==='true',bar=Math.floor(now/Q15.barMs)*Q15.barMs
 const {data:open}=await db.from('bot_trades').select('*').eq('status','OPEN').throwOnError()
 if(open.some((t:any)=>t.paper_mode!==true||!['Q15','EVT','DONCH4H'].includes(t.strategy)||Number(t.lev)<1||Number(t.lev)>(t.strategy==='DONCH4H'?1:10)))throw new Error('Q15 incompatible or non-isolated paper book')
 const closes:any[]=[],updates:any[]=[],errors:string[]=[],marks:Record<string,number>={}
 let markHealthy=true
 try{const quotes=await json('https://fapi.binance.com/fapi/v1/ticker/bookTicker')
  for(const t of open){const p=pairOf(t.sym),q=quotes.find((x:any)=>x.symbol===p.s),px=Number(t.side==='LONG'?q?.bidPrice:q?.askPrice)/p.k
   if(!(px>0)||!Number.isFinite(+q?.time)||(now-Number(q.time)>15000||Number(q.time)>now+1000))markHealthy=false;else marks[t.sym]=px}
 }catch{markHealthy=open.length===0}
 await pool<any>(open.filter((t:any)=>t.strategy==='Q15'),4,async t=>{try{const r=await exitRow(t,now);if(r.close)closes.push(r.close);if(r.update)updates.push(r.update)}catch(e:any){errors.push(`exit ${t.sym}: ${e.message}`)}})
 // Value the rollover book at UTC midnight before exits, not at a late restart's price.
 const day=new Date(now).toISOString().slice(0,10),dayStart=Date.parse(day+'T00:00:00Z'),dayMarks:Record<string,number>={}
 if(params.agg_day?.day!==day||params.q15_day_pending){
  const basis=params.q15_day_basis?.day===day?params.q15_day_basis.rows:open
  await pool<any>(basis??[],6,async t=>{try{const p=t.scalp_meta?.q15?.pair??pairOf(t.sym)
   const rows=await json(`https://fapi.binance.com/fapi/v1/klines?symbol=${p.s}&interval=1m&endTime=${dayStart-1}&limit=1`)
   const row=rows?.[0];if(+row?.[0]!==dayStart-60000||!(Number(row?.[4])>0))throw new Error('midnight_mark_missing')
   dayMarks[t.sym]=Number(row[4])/p.k
  }catch{errors.push(`midnight ${t.sym}: missing mark`);markHealthy=false}})
 }
 // An entry-free commit updates the global daily halt before any sleeve may enter.
 const {data:marked}=await db.rpc('q15_commit_cycle',{p_lease:lease,p_closes:closes,p_entries:[],p_marks:marks,p_updates:updates,p_note:{exit_errors:errors,marks_fresh:markHealthy,day_start_marks:dayMarks},p_bar:null}).throwOnError()
 const halted=marked?.halted===true||aggHalted(params,now)
 const scan=Number(params.q15_bar)!==bar
 if(!scan)return{changed:closes.length>0,halted,scanned:false}
 const {data:cache}=await db.from('market_cache').select('data').eq('key','universe').throwOnError()
 const pairs:Pair[]=(cache?.[0]?.data?.pairs??[]).filter((p:any)=>/^[A-Z0-9]+USDT$/.test(p.s)&&Number(p.k)>0)
 if(!pairs.length)throw new Error('Q15 liquid universe unavailable')
 const data=new Map<string,LBar[]>(),failures=new Map<string,string>()
 await pool(pairs,12,async p=>{try{const k=await json(`https://fapi.binance.com/fapi/v1/klines?symbol=${p.s}&interval=15m&limit=80`)
  const b=k.filter((x:any)=>Number(x[6])<bar).map((x:any)=>({t:+x[0],open:+x[1]/p.k,high:+x[2]/p.k,low:+x[3]/p.k,close:+x[4]/p.k,vol:+x[5]*p.k,tb:x[9]==null?NaN:+x[9]*p.k}))
  if(b.at(-1)?.t!==bar-Q15.barMs)throw new Error('bar_lag');data.set(p.sym,b)
 }catch(e:any){failures.set(p.sym,String(e.message))}})
 const btc=data.get('BTC'),btcDiff=btc?btc.at(-1)!.close-labInd(btc).ema20.at(-1)!:NaN
 const btcUp=Number.isFinite(btcDiff)&&btcDiff!==0?btcDiff>0:null
 let funding=new Map<string,{rate:number;hours:number}>()
 try{const [prem,info]=await Promise.all([json('https://fapi.binance.com/fapi/v1/premiumIndex'),json('https://fapi.binance.com/fapi/v1/fundingInfo')])
  for(const x of prem){const f=info.find((i:any)=>i.symbol===x.symbol);funding.set(x.symbol,{rate:+x.lastFundingRate,hours:f?+f.fundingIntervalHours:8})}
 }catch{/* missing published data rejects */}
 const {data:history}=await db.from('q15_shadow').select('t0,side,gross_bps,closed_at').eq('status','closed').order('closed_at',{ascending:false}).limit(5000).throwOnError()
 const edge={long:q15Edge(history??[],1,now),short:q15Edge(history??[],-1,now)}
 const {count:today}=await db.from('bot_trades').select('id',{count:'exact',head:true}).eq('strategy','Q15').gte('opened_at',new Date(now).toISOString().slice(0,10)+'T00:00:00Z').throwOnError()
 const entries:any[]=[],journal:any[]=[],shadows:any[]=[],held=new Set(open.map((t:any)=>t.sym))
 let cash=Number(marked?.balance??state.balance),eq=Number(marked?.equity??cash),room=cfg.maxOpen-open.filter((t:any)=>t.strategy==='Q15').length+closes.length,dayN=Number(today)||0
 let marginUsed=open.filter((t:any)=>t.strategy==='Q15'&&!closes.some(c=>c.id===t.id)).reduce((s:number,t:any)=>s+Number(t.entry_price)*Number(t.size)/Number(t.lev),0),candidates=0
 for(const p of pairs){const b=data.get(p.sym),result=b?q15Signal(b,btcUp,p.sym==='BTC'):{sig:null,reason:failures.get(p.sym)??'missing_bars'},sig=result.sig
  const rec:any={sym:p.sym,side:sig?.dir===-1?'SHORT':'LONG',decision:'rejected',reason:result.reason,observed:{bar,lag_ms:Date.now()-bar},inferred:{sleeve:'Q15'}}
  journal.push(rec);if(!sig)continue;candidates++
  if(Date.now()-bar>Q15.entryWindowMs){rec.reason='missed_open_window';continue}
  try{
   const bk=await book(p),margin=Math.min(eq*cfg.perTrade,Math.max(0,eq*cfg.share-marginUsed),cash/(1+cfg.lev*COST.takerFee)),notional=margin*cfg.lev
   if(notional<20){rec.reason='no_cash';continue}
   const sideBook=sig.dir>0?bk.asks:bk.bids,w=walkBook(sideBook,notional),ew=walkBook(sig.dir>0?bk.bids:bk.asks,notional),touch=sideBook[0][0]
   const price=sig.dir>0?Math.max(w.vwap,touch*(1+COST.minSlip)):Math.min(w.vwap,touch*(1-COST.minSlip)),lv=q15Levels(sig.dir,price,sig.atr),f=funding.get(p.s),e=sig.dir>0?edge.long:edge.short
   const input={book:bookFrom(bk.bids,bk.asks,bk.E,'binance-futures'),now:Date.now(),notional,dir:sig.dir,rFrac:lv.r/price,entryImpact:w.impact,exitImpact:ew.impact,beyond:w.beyond||ew.beyond,funding:f?.rate??null,fundingHours:f?.hours??0,grossBps:e.bps}
   // Check execution feasibility before shadowing; no_edge/costs are expected during measurement.
   const gate=immediate?q15Gate({...input,grossBps:q15Gate({...input,grossBps:100}).costBps+Q15.minNetBps}):q15Gate(input),feasible=q15Gate({...input,grossBps:0})
   rec.observed={...rec.observed,z:sig.z,vol_ratio:sig.volRatio,imb:sig.imb,gate,edge:e,immediate}
   if(!['costs_exceed_edge','passed'].includes(feasible.reason)){rec.reason=feasible.reason;continue}
   const m={...lv,chk:bk.E,pair:p,bar,atr:sig.atr,hold_ms:Q15.holdMs,gate,lag_ms:Date.now()-bar,immediate}
   shadows.push({sym:p.sym,side:sig.dir,t0:bar,payload:{id:0,sym:p.sym,side:sig.dir>0?'LONG':'SHORT',entry_price:price,size:notional/price,lev:cfg.lev,opened_at:new Date(bk.E).toISOString(),scalp_meta:{q15:m}}})
   if(!gate.pass){rec.reason=gate.reason;continue}
   if(halted||state.hard_halt_at||sleeveOff(params,'Q15')){rec.reason='day_or_owner_halt';continue}
   if(!markHealthy){rec.reason='missing_equity_marks';continue}
   if(held.has(p.sym)||room<=0||dayN>=Q15.maxPerDay){rec.reason=held.has(p.sym)?'coin_held':room<=0?'q15_full':'daily_cap';continue}
   entries.push({sym:p.sym,side:rec.side,price,notional,lev:cfg.lev,quote_ts:bk.E,q15:m,source:'binance-futures',profit_gate:'passed',net_bps:gate.netBps})
   rec.decision='accepted';rec.reason='candidate';held.add(p.sym);room--;dayN++;marginUsed+=margin;cash-=margin+notional*COST.takerFee
  }catch(e:any){rec.reason='entry_data_error';rec.observed.error=String(e.message).slice(0,100)}
 }
 if(shadows.length)await db.from('q15_shadow').upsert(shadows,{onConflict:'sym,t0',ignoreDuplicates:true}).throwOnError()
 const freshEntries=entries.filter(e=>Date.now()-e.quote_ts<=Q15.quoteMaxMs&&Date.now()-bar<=Q15.entryWindowMs)
 for(const r of journal)if(r.decision==='accepted'&&!freshEntries.some(e=>e.sym===r.sym)){r.decision='rejected';r.reason='expired_before_commit'}
 const reasons:Record<string,number>={};for(const r of journal)reasons[r.reason]=(reasons[r.reason]??0)+1
 const note={bar,scanned_at:now,scan_lag_ms:now-bar,scan_duration_ms:Date.now()-now,universe:pairs.length,scanned:data.size,candidates,fills:0,reasons,edge,halted,marks_fresh:markHealthy,exit_errors:errors}
 const {data:result}=await db.rpc('q15_commit_cycle',{p_lease:lease,p_closes:[],p_entries:freshEntries,p_updates:[],p_marks:marks,p_note:note,p_bar:bar}).throwOnError()
 const accepted=new Set<string>(result?.accepted??[])
 for(const r of journal)if(r.decision==='accepted'){r.decision=accepted.has(r.sym)?'accepted':'rejected';r.reason=accepted.has(r.sym)?'taken':'ledger_rejected'}
 // All N symbols are journalled, including the all-rejected bar. No slice(0,100).
 for(let i=0;i<journal.length;i+=100)await db.from('trade_decisions').insert(journal.slice(i,i+100)).throwOnError()
 return{changed:true,...result,...note,fills:result?.opened??0}
}

// Evidence work runs after all three sleeves, outside the time-critical entry path.
export async function settleQ15Shadows(db:any,lease:string){
 if(Date.now()>Date.parse(lease)-15000)return
 const now=Date.now()
 // Resolve existing shadow rows using exactly the funded exit function.
 const {data:shadowOpen}=await db.from('q15_shadow').select('*').eq('status','open').order('t0').limit(4).throwOnError()
 await pool<any>(shadowOpen??[],4,async s=>{try{const r=await exitRow(s.payload,now)
  if(r.close)await db.from('q15_shadow').update({status:'closed',gross_bps:r.gross,closed_at:new Date(now).toISOString(),exit:r.close}).eq('id',s.id).throwOnError()
  else if(r.update)await db.from('q15_shadow').update({payload:{...s.payload,scalp_meta:{q15:{...s.payload.scalp_meta.q15,chk:r.update.chk}}}}).eq('id',s.id).throwOnError()
 }catch{/* evidence stays unresolved; never invent an exit */}})
}

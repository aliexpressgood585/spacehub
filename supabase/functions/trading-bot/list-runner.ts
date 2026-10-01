// v99.0 — LIST sleeve runner: SHORT fresh Binance USDT-M perp listings (3-30 days old, >= $20M/24h, spread <= 10 bps).
// Every bot cycle: exits for open LIST rows from a live quote (+20% stop / -30% target / 21-day timeout).
// Once per hour: scan exchangeInfo + 24h tickers + book tickers, short the youngest qualifying listings, one short per
// coin ever, <= 10 open, ~10% of equity each, paper 1x. Books through `list_commit_cycle` (limits re-checked in SQL).
// NOT VALIDATED: the owner chose to run it without a backtest (Council override, 2026-10-01).
import {SCALP,type Quote} from '../../../shared/scalp.ts'
import {buildUniverse} from '../../../shared/universe.ts'
import {LIST,freshListings,listExit} from '../../../shared/listing.ts'
import {json,pool,quote} from './rota-runner.ts'

export async function runList(db:any,state:any,lease:string,paper:boolean){
  if(!paper)throw new Error('LIST is paper-only; refusing live execution')
  const now=Date.now(),params=state.bot_params||{}
  const {data:open}=await db.from('bot_trades').select('*').eq('status','OPEN').throwOnError()
  if(open.some((t:any)=>t.paper_mode!==true||Number(t.lev)!==1||t.strategy!=='LIST'))throw new Error('LIST requires a paper-only 1x book of LIST rows')
  const scanDue=now-(Number(params.list_scan)||0)>=LIST.scanMs&&!state.hard_halt_at
  if(!open.length&&!scanDue)return {changed:false,open:0}
  // exits
  const q=new Map<string,Quote>()
  await pool<string>(open.map((t:any)=>String(t.sym)),6,async s=>{try{q.set(s,await quote(s))}catch{}})
  const closes:any[]=[],marks:Record<string,number>={}
  for(const t of open){
    const qq=q.get(t.sym);if(!qq)continue
    marks[t.sym]=qq.ask
    const why=listExit(Number(t.entry_price),qq.ask,Date.parse(t.opened_at),now)
    if(why)closes.push({id:t.id,price:qq.ask*(1+SCALP.slip),reason:why,quote_ts:qq.ts})
  }
  if(!closes.length&&!scanDue)return {changed:false,open:open.length}
  // entries: hourly scan of fresh listings
  const entries:any[]=[],cands:any[]=[];let scanErr:string|null=null
  if(scanDue){
    try{
      const [info,tick,book]=await Promise.all([json('https://fapi.binance.com/fapi/v1/exchangeInfo'),
        json('https://fapi.binance.com/fapi/v1/ticker/24hr'),json('https://fapi.binance.com/fapi/v1/ticker/bookTicker')])
      const {pairs}=buildUniverse(info,tick,book,now,{minQuoteVol:LIST.minQuoteVol,maxSpreadBps:LIST.maxSpreadBps,minAgeDays:LIST.minAgeDays})
      const {data:past}=await db.from('bot_trades').select('sym').eq('strategy','LIST').throwOnError()
      const traded=new Set<string>((past??[]).map((r:any)=>String(r.sym)))
      const fresh=freshListings(pairs,info,now,traded)
      cands.push(...fresh.map(f=>({sym:f.sym,age_d:f.ageDays,qv_m:+(f.qv/1e6).toFixed(1),spread_bps:f.spreadBps})))
      const room=LIST.maxOpen-(open.length-closes.length)
      let cash=Number(state.balance)
      const equity=cash+open.reduce((s:number,t:any)=>s+Number(t.entry_price)*Number(t.size),0)
      const slot=equity*LIST.share/LIST.maxOpen
      for(const f of fresh){
        if(entries.length>=room)break
        let qq:Quote;try{qq=await quote(f.sym)}catch{continue}
        if(cash<slot*(1+SCALP.fee))break
        entries.push({sym:f.sym,side:'SHORT',price:qq.bid*(1-SCALP.slip),notional:slot,quote_ts:qq.ts,source:qq.source,age_days:f.ageDays,qv:f.qv})
        cash-=slot*(1+SCALP.fee)
      }
    }catch(e:any){scanErr=String(e?.message??e)}
  }
  const note={scan_due:scanDue,candidates:cands.slice(0,20),scan_error:scanErr,open:open.length}
  const {data:result}=await db.rpc('list_commit_cycle',{p_lease:lease,p_closes:closes,p_entries:entries,p_marks:marks,p_note:note,p_scan:scanDue&&!scanErr}).throwOnError()
  return {changed:closes.length>0||entries.length>0||scanDue,...result,...note}
}

// v99.2 — FUND sleeve runner: H6a funding-settlement capture in the paper book, next to LIST.
// Entries: in the first minutes of each hour, every liquid perp whose predicted funding |rate| >= 0.10% settles in
// ~60 min -> take the receiving side (rate > 0 -> SHORT). Exits: 15 min after the settlement, at the live touch, with
// the ACTUAL settled rate fetched from Binance and booked as funding. No stop (the rule as pre-registered).
// Up to 25% of equity per trade, <= 8 open, paper 1x; limits re-checked in `fund_commit_cycle`. NOT VALIDATED.
import {SCALP,type Quote} from '../../../shared/scalp.ts'
import {FUND,fundEntries,fundingPaid} from '../../../shared/fundcap.ts'
import {json,pool,quote} from './rota-runner.ts'

export async function runFund(db:any,state:any,lease:string,paper:boolean){
  if(!paper)throw new Error('FUND is paper-only; refusing live execution')
  const now=Date.now(),params=state.bot_params||{}
  const {data:open}=await db.from('bot_trades').select('*').eq('status','OPEN').throwOnError()
  if(open.some((t:any)=>t.paper_mode!==true||Number(t.lev)!==1||!['LIST','FUND','FAST'].includes(t.strategy)))throw new Error('FUND requires a paper-only 1x book of LIST/FUND/FAST rows')
  const mine=open.filter((t:any)=>t.strategy==='FUND')
  const hour=Math.floor(now/3_600_000),minute=new Date(now).getUTCMinutes()
  const scanDue=minute<FUND.scanMinute&&Number(params.fund_hour)!==hour&&!state.hard_halt_at
  const due=mine.filter((t:any)=>now>=Date.parse(t.scalp_meta?.exit_due??t.opened_at))
  if(!due.length&&!scanDue){
    // publish the bot's own marks for the house (live P&L even where exchange sockets are blocked)
    if(mine.length){const marks:Record<string,number>={}
      await pool<any>(mine,6,async t=>{try{const qq=await quote(String(t.sym));marks[t.sym]=t.side==='LONG'?qq.bid:qq.ask}catch{}})
      if(Object.keys(marks).length)try{await db.rpc('sleeve_marks',{p_lease:lease,p_key:'fund_marks',p_marks:marks}).throwOnError()}catch{}}
    return {changed:false,open:mine.length}
  }
  // exits, with the settled funding rate
  const closes:any[]=[]
  await pool<any>(due,6,async t=>{
    const m=t.scalp_meta||{},T=Date.parse(m.settle_at),dir=t.side==='LONG'?1:-1
    let rate:number|null=null
    try{const f=await json(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${m.symbol}&startTime=${T-60e3}&endTime=${T+5*60e3}`);if(Array.isArray(f)&&f.length)rate=Number(f[0].fundingRate)}catch{}
    if(rate===null&&now<Date.parse(m.exit_due)+FUND.waitFundingMs)return   // wait for the settlement to publish
    let qq:Quote;try{qq=await quote(String(t.sym))}catch{return}
    const px=dir===1?qq.bid*(1-SCALP.slip):qq.ask*(1+SCALP.slip)
    const notional=Number(t.entry_price)*Number(t.size)
    closes.push({id:t.id,price:px,quote_ts:qq.ts,reason:'SETTLED',funding:rate===null?0:fundingPaid(dir as 1|-1,rate,notional),rate,funding_missing:rate===null})
  })
  // entries
  const entries:any[]=[],cands:any[]=[];let scanErr:string|null=null
  if(scanDue){
    try{
      const prem=await json('https://fapi.binance.com/fapi/v1/premiumIndex')
      const {data:c}=await db.from('market_cache').select('data').eq('key','universe').throwOnError()
      const pairs:any[]=Array.isArray(c?.[0]?.data?.pairs)?c[0].data.pairs:[]
      const symOf=new Map<string,string>(pairs.map((p:any)=>[String(p.s),String(p.sym)]))
      const taken=new Set<string>(mine.map((t:any)=>`H6a:${t.scalp_meta?.symbol}:${Date.parse(t.scalp_meta?.settle_at)}`))
      const rows=fundEntries(prem,new Set(symOf.keys()),now,taken)
      const rateOf=new Map<string,number>(prem.map((p:any)=>[String(p.symbol),Number(p.lastFundingRate)]))
      const held=new Set<string>(open.map((t:any)=>String(t.sym)))
      let cash=Number(state.balance)
      const equity=cash+open.reduce((s:number,t:any)=>s+Number(t.entry_price)*Number(t.size),0)
      const room=FUND.maxOpen-(mine.length-closes.length)
      for(const r of rows){
        const sym=symOf.get(r.symbol)!
        cands.push({sym,side:r.side>0?'LONG':'SHORT',rate:rateOf.get(r.symbol),settle_at:r.settle_at})
        if(entries.length>=room||held.has(sym))continue
        const n=Math.min(equity*FUND.perTrade,cash/(1+SCALP.fee))
        if(n<20)break
        let qq:Quote;try{qq=await quote(sym)}catch{continue}
        const price=r.side>0?qq.ask*(1+SCALP.slip):qq.bid*(1-SCALP.slip)
        entries.push({sym,side:r.side>0?'LONG':'SHORT',price,notional:n,quote_ts:qq.ts,source:qq.source,
          symbol:r.symbol,settle_at:r.settle_at,exit_due:r.exit_due,pred_rate:rateOf.get(r.symbol)})
        held.add(sym);cash-=n*(1+SCALP.fee)
      }
    }catch(e:any){scanErr=String(e?.message??e)}
  }
  if(!closes.length&&!entries.length&&!scanDue)return {changed:false,open:mine.length,waiting:due.length}
  const note={scan_due:scanDue,candidates:cands.slice(0,20),scan_error:scanErr,open:mine.length}
  const {data:result}=await db.rpc('fund_commit_cycle',{p_lease:lease,p_closes:closes,p_entries:entries,p_note:note,p_hour:scanDue&&!scanErr?hour:null}).throwOnError()
  return {changed:closes.length>0||entries.length>0||scanDue,...result,...note}
}

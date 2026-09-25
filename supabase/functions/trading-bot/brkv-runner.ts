// v93.0 — BRKV sleeve: breakout WITH volume, +7% target / -4% stop (owner's rule, v107bt/v108bt).
// Runs every bot cycle (the cron fires every ~10 s) inside the SAME paper book as ROTA and SCALP:
//  - exits every cycle for open BRKV rows from a live quote (stop / target / 14-day timeout);
//  - entries once per 4h bar, in the first 30 min after the close, on the pinned 40, at the live touch + slippage.
// Books through `brkv_commit_cycle` (paper 1x, <= 10 open, per-trade and sleeve caps enforced again in SQL).
// SCALP treats BRKV rows as foreign positions (never closes them, never doubles their coin).
import * as S from '../../../shared/strategy.ts'
import {SCALP,type Quote} from '../../../shared/scalp.ts'
import {BRKV,brkvSignal,brkvExit,lastClose4h,type Bar4} from '../../../shared/breakout.ts'
import {json,pool,quote,BINANCE_SYM} from './rota-runner.ts'
const g=()=>globalThis as any
export function brkvConfig(){
  const x=Number(g().__BRKV_SHARE);return {share:Number.isFinite(x)&&x>0?Math.min(0.6,Math.max(0.05,x)):0.3}
}
const bsym=(sym:string)=>BINANCE_SYM[sym]??{s:`${sym}USDT`,k:1}
// completed 4h bars with volume, oldest first (Binance USDT-M, OKX swap fallback; OKX volume is in contracts —
// consistent within one coin, and the rule only compares a coin's bar to its own average)
async function bars4h(sym:string,now:number):Promise<Bar4[]>{
  try{
    const {s,k}=bsym(sym);const r=await json(`https://fapi.binance.com/fapi/v1/klines?symbol=${s}&interval=4h&limit=${BRKV.N+5}`)
    const b=r.filter((x:any)=>Number(x[6])<now).map((x:any)=>({t:+x[0],high:+x[2]/k,low:+x[3]/k,close:+x[4]/k,vol:+x[5]}))
    if(b.length>=BRKV.N+1)return b
  }catch{}
  const r=await json(`https://www.okx.com/api/v5/market/candles?instId=${sym}-USDT-SWAP&bar=4H&limit=${BRKV.N+5}`)
  if(r.code!=='0')throw new Error('okx 4h')
  return r.data.filter((x:any)=>x[8]==='1').reverse().map((x:any)=>({t:+x[0],high:+x[2],low:+x[3],close:+x[4],vol:+x[5]}))
}
export async function runBrkv(db:any,state:any,lease:string,paper:boolean){
  if(!paper)throw new Error('BRKV is paper-only; refusing live execution')
  const cfg=brkvConfig(),now=Date.now(),params=state.bot_params||{}
  const {data:open}=await db.from('bot_trades').select('*').eq('status','OPEN').throwOnError()
  if(open.some((t:any)=>t.paper_mode!==true||Number(t.lev)!==1))throw new Error('BRKV requires a paper-only 1x book')
  const mine=open.filter((t:any)=>t.strategy==='BRKV')
  const bar=lastClose4h(now),doneBar=Number(params.brkv_bar)||0
  const entryDue=bar>doneBar&&now-bar<=BRKV.entryWindowMs&&!state.hard_halt_at
  if(!mine.length&&!entryDue)return {changed:false,open:0,next_bar:new Date(bar+BRKV.barMs).toISOString()}
  // exits
  const q=new Map<string,Quote>()
  await pool<string>(mine.map((t:any)=>String(t.sym)),6,async s=>{try{q.set(s,await quote(s))}catch{}})
  const closes:any[]=[],marks:Record<string,number>={}
  for(const t of mine){
    const qq=q.get(t.sym);if(!qq)continue
    const dir=t.side==='LONG'?1:-1,mark=dir===1?qq.bid:qq.ask;marks[t.sym]=mark
    const why=brkvExit(dir as 1|-1,Number(t.entry_price),mark,Date.parse(t.opened_at),now)
    if(why)closes.push({id:t.id,price:mark*(1-dir*SCALP.slip),reason:why,quote_ts:qq.ts})
  }
  if(!closes.length&&!entryDue)return {changed:false,open:mine.length}
  // entries: once per 4h bar
  const entries:any[]=[],signals:string[]=[],failed:string[]=[]
  if(entryDue){
    const held=new Set(open.filter((t:any)=>!closes.some(c=>c.id===t.id)).map((t:any)=>String(t.sym)))
    const found:{sym:string,dir:1|-1}[]=[]
    await pool([...S.CRYPTO_40],8,async sym=>{try{
      const b=await bars4h(sym,now);if(!b.length||b[b.length-1].t+BRKV.barMs!==bar)return   // the last completed bar must be THIS close
      const d=brkvSignal(b);if(d)found.push({sym,dir:d})
    }catch{failed.push(sym)}})
    found.sort((a,b)=>a.sym<b.sym?-1:1)
    const room=BRKV.maxOpen-(mine.length-closes.length)
    let cash=Number(state.balance)
    const equity=cash+open.reduce((s:number,t:any)=>s+Number(t.entry_price)*Number(t.size),0)
    const slot=equity*cfg.share/BRKV.maxOpen
    for(const f of found){
      signals.push(`${f.sym} ${f.dir>0?'LONG':'SHORT'}`)
      if(entries.length>=room||held.has(f.sym))continue
      let qq:Quote;try{qq=await quote(f.sym)}catch{continue}
      if(cash<slot*(1+SCALP.fee))break
      const price=(f.dir===1?qq.ask:qq.bid)*(1+f.dir*SCALP.slip)
      entries.push({sym:f.sym,side:f.dir===1?'LONG':'SHORT',price,notional:slot,quote_ts:qq.ts,source:qq.source,bar:new Date(bar).toISOString()})
      cash-=slot*(1+SCALP.fee)
    }
  }
  const note={share:cfg.share,bar:new Date(bar).toISOString(),entry_due:entryDue,signals,failed,open:mine.length}
  const {data:result}=await db.rpc('brkv_commit_cycle',{p_lease:lease,p_closes:closes,p_entries:entries,p_marks:marks,p_share:cfg.share,p_note:note,p_bar:entryDue?new Date(bar).toISOString():null}).throwOnError()
  return {changed:closes.length>0||entries.length>0||entryDue,...result,...note}
}

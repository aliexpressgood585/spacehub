// v83.0 — ROTA alongside SCALP. The cross-sectional momentum rotation is the one engine that
// passed a 36-month walk-forward here (v104bt OOS +1.0%, maxDD 21% — honest: ~flat, not a money
// machine). When the shim enables 'SCALP,ROTA' this runner rebalances a rotation basket every
// ROTA_HOURS inside the SAME paper book, before the SCALP runner runs, and books it through
// `rota_commit_cycle`. ROTA rows have no stop and no team exit: they leave only at a rebalance
// (left the basket, flipped side, or drifted outside the ±35% band). SCALP treats them as
// foreign positions (never closes them, never doubles their coin) and keeps to its own share.
// Config = the last OOS-validated shape (v104bt): K=2 per side, 12h, lookbacks 42/84/168 4h
// bars (7/14/28 days), vol target 0.5. Deploy-time shim knobs keep the old names.
import * as S from '../../../shared/strategy.ts'
import {SCALP,validQuote,type Quote} from '../../../shared/scalp.ts'
const g=()=>globalThis as any
const num=(v:any,d:number)=>{const x=Number(v);return Number.isFinite(x)&&x>0?x:d}
export function rotaConfig(){
  const lbs=String(g().__ROTA_LBS??'42,84,168').split(',').map(Number).filter(n=>Number.isInteger(n)&&n>=6&&n<=300)
  return {
    share:Math.min(0.8,Math.max(0.1,num(g().__ROTA_SHARE,0.5))),   // slice of equity the basket may hold
    k:Math.min(S.ROTA_K,Math.max(1,Math.floor(num(g().__ROTA_K,2)))),
    hours:Math.min(48,Math.max(4,num(g().__ROTA_HOURS,12))),
    lbs:lbs.length?lbs:[42,84,168],
    volTarget:Math.min(5,num(g().__ROTA_VOL_TARGET,0.5)),
  }
}
export const BINANCE_SYM:Record<string,{s:string,k:number}>={PEPE:{s:'1000PEPEUSDT',k:1000}}
const bsym=(sym:string)=>BINANCE_SYM[sym]??{s:`${sym}USDT`,k:1}
async function json(url:string){const r=await fetch(url,{signal:AbortSignal.timeout(4000)});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json()}
async function pool<T>(items:T[],n:number,fn:(x:T)=>Promise<void>){let i=0;await Promise.all(Array.from({length:Math.min(n,items.length)},async()=>{while(i<items.length)await fn(items[i++])}))}
// completed 4h closes, oldest first (Binance USDT-M first, OKX swap fallback)
async function closes4h(sym:string,need:number,now:number):Promise<number[]>{
  try{
    const {s,k}=bsym(sym);const r=await json(`https://fapi.binance.com/fapi/v1/klines?symbol=${s}&interval=4h&limit=${Math.min(499,need+10)}`)
    const c=r.filter((x:any)=>Number(x[6])<now).map((x:any)=>+x[4]/k).filter((x:number)=>x>0);if(c.length>=need)return c
  }catch{}
  const r=await json(`https://www.okx.com/api/v5/market/candles?instId=${sym}-USDT-SWAP&bar=4H&limit=${Math.min(300,need+10)}`)
  if(r.code!=='0')throw new Error('okx 4h')
  return r.data.filter((x:any)=>x[8]==='1').reverse().map((x:any)=>+x[4]).filter((x:number)=>x>0)
}
async function quote(sym:string):Promise<Quote>{
  try{const {s,k}=bsym(sym);const d=await json(`https://fapi.binance.com/fapi/v1/depth?symbol=${s}&limit=5`);const q={bid:+d.bids[0][0]/k,ask:+d.asks[0][0]/k,ts:+d.E,imbalance:0,source:'binance-futures'};if(validQuote(q,Date.now()))return q}catch{}
  const d=await json(`https://www.okx.com/api/v5/market/books?instId=${sym}-USDT-SWAP&sz=5`);if(d.code!=='0'||!d.data?.[0])throw new Error(`no quote ${sym}`)
  const v=d.data[0];return {bid:+v.bids[0][0],ask:+v.asks[0][0],ts:+v.ts,imbalance:0,source:'okx-swap'}
}
// pure: rank rows -> targets with the ensemble momentum already in `mom`
export function rankRows(rows:S.RotaRow[],k:number){return S.rotaTargets(rows,k,'both')}
export function volScale(rows:S.RotaRow[],targets:S.RotaTarget[],volTarget:number){
  if(!(volTarget>0))return 1
  const tv=targets.map(t=>rows.find(r=>r.sym===t.sym)?.vol??0).filter(v=>v>0)
  const basket=tv.length?tv.reduce((a,b)=>a+b,0)/tv.length*Math.sqrt(6*365):0
  return basket>0?Math.max(0.2,Math.min(1,volTarget/basket)):1
}
export function rowFrom(sym:string,c:number[],lbs:number[],lb:number=S.ROTA_LB):S.RotaRow|null{
  const need=Math.max(lb,...lbs)+2;if(c.length<need)return null
  const p1=c[c.length-1];const ps=lbs.map(l=>c[c.length-1-l]);if(ps.some(p=>!(p>0)))return null
  const mom=ps.reduce((a,p)=>a+(p1/p-1),0)/ps.length
  const rets:number[]=[];for(let i=Math.max(1,c.length-lb);i<c.length;i++)if(c[i-1]>0)rets.push(c[i]/c[i-1]-1)
  const mu=rets.reduce((a,b)=>a+b,0)/Math.max(1,rets.length),vol=Math.sqrt(rets.reduce((a,b)=>a+(b-mu)**2,0)/Math.max(1,rets.length))
  return {sym,mom,price:p1,vol:Math.max(vol,0.001)}
}
export async function runRota(db:any,state:any,lease:string,paper:boolean){
  if(!paper)throw new Error('ROTA alongside SCALP is paper-only; refusing live execution')
  const cfg=rotaConfig(),now=Date.now(),params=state.bot_params||{}
  const last=state.rebalanced_at?Date.parse(state.rebalanced_at):0
  const due=now-last>=cfg.hours*3600_000-5*60_000
  if(!due)return {due:false,next_in_min:Math.max(0,Math.round((cfg.hours*3600_000-(now-last))/60000)),share:cfg.share}
  if(state.hard_halt_at||params.scalp_paused)return {due:true,skipped:'breaker',share:cfg.share}
  const {data:open}=await db.from('bot_trades').select('*').eq('status','OPEN').throwOnError()
  if(open.some((t:any)=>t.paper_mode!==true||Number(t.lev)!==1))throw new Error('ROTA requires a paper-only 1x book')
  const rows:S.RotaRow[]=[],failed:string[]=[]
  await pool([...S.CRYPTO_40],8,async sym=>{try{const r=rowFrom(sym,await closes4h(sym,Math.max(S.ROTA_LB,...cfg.lbs)+2,now),cfg.lbs);if(r)rows.push(r);else failed.push(sym)}catch{failed.push(sym)}})
  const targets=rankRows(rows,cfg.k)
  if(!targets.length)return {due:true,skipped:`universe ${rows.length}/${S.CRYPTO_40.length} — below the ranking guard`,share:cfg.share}
  const vs=volScale(rows,targets,cfg.volTarget)
  const rota=open.filter((t:any)=>t.strategy==='ROTA')
  const syms=[...new Set<string>([...open.map((t:any)=>String(t.sym)),...targets.map(t=>t.sym)])]
  const q=new Map<string,Quote>();await pool(syms,8,async s=>{try{q.set(s,await quote(s))}catch{}})
  if(open.some((t:any)=>!q.has(String(t.sym))))return {due:true,skipped:'a held coin has no live quote',share:cfg.share}
  const marks:Record<string,number>={};for(const t of open){const qq=q.get(t.sym)!;marks[t.sym]=t.side==='LONG'?qq.bid:qq.ask}
  let cash=Number(state.balance)
  const equity=cash+open.reduce((s:number,t:any)=>s+Number(t.entry_price)*Number(t.size)+(t.side==='LONG'?1:-1)*(marks[t.sym]-Number(t.entry_price))*Number(t.size),0)
  const tmap=new Map(targets.map(t=>[t.sym,t]))
  const slot=(t:S.RotaTarget)=>S.rotaSlotTarget(equity,t.weight,cfg.share/2)*vs
  const closes:any[]=[],kept:string[]=[];const closing=new Set<any>()
  for(const t of rota){
    const tg=tmap.get(t.sym),dir=t.side==='LONG'?1:-1,notional=Number(t.entry_price)*Number(t.size)
    if(tg&&tg.dir===dir&&S.rotaSizeOk(notional,slot(tg))){tmap.delete(t.sym);kept.push(t.sym);continue}
    const qq=q.get(t.sym)!,px=(dir===1?qq.bid:qq.ask)*(1-dir*SCALP.slip)
    closes.push({id:t.id,price:px,reason:tg?'RESIZE':'ROTATE',quote_ts:qq.ts});closing.add(t.id)
    cash+=notional+(px-Number(t.entry_price))*Number(t.size)*dir-px*Number(t.size)*SCALP.fee
  }
  const remaining=open.filter((t:any)=>!closing.has(t.id))
  const entries:any[]=[],skips:string[]=[]
  for(const [sym,tg] of tmap){
    if(remaining.some((t:any)=>t.sym===sym)){skips.push(`${sym}: held`);continue}
    const qq=q.get(sym);if(!qq){skips.push(`${sym}: no quote`);continue}
    const n=Math.min(slot(tg),Math.max(0,equity*S.PER_COIN_CAP))
    if(n<equity*0.01){skips.push(`${sym}: per-coin cap`);continue}
    if(cash<n*(1+SCALP.fee)){skips.push(`${sym}: cash`);continue}
    const price=(tg.dir===1?qq.ask:qq.bid)*(1+tg.dir*SCALP.slip)
    entries.push({sym,side:tg.dir===1?'LONG':'SHORT',price,notional:n,quote_ts:qq.ts,source:qq.source,weight:tg.weight,hold_h:cfg.hours})
    cash-=n*(1+SCALP.fee)
  }
  const note={k:cfg.k,hours:cfg.hours,share:cfg.share,vol_scale:+vs.toFixed(2),ranked:rows.length,failed,kept,skips,longs:targets.filter(t=>t.dir===1).map(t=>t.sym),shorts:targets.filter(t=>t.dir===-1).map(t=>t.sym)}
  // nothing opened only for lack of cash (SCALP still holds its old, larger share): retry in an hour, not in 12
  const starved=!entries.length&&!closes.length&&tmap.size>0&&[...tmap.keys()].every(sym=>skips.some(k=>k===`${sym}: cash`))
  const rebalancedAt=starved?new Date(now-(cfg.hours-1)*3600_000).toISOString():null
  const {data:result}=await db.rpc('rota_commit_cycle',{p_lease:lease,p_closes:closes,p_entries:entries,p_marks:marks,p_share:cfg.share,p_note:{...note,starved},p_rebalanced_at:rebalancedAt}).throwOnError()
  return {due:true,changed:true,...result,...note}
}

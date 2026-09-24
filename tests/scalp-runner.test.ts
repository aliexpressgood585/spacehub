import assert from 'node:assert/strict'
import {runScalp,parseRss,UNIVERSE,BINANCE_SYM} from '../supabase/functions/trading-bot/scalp-runner.ts'
import {SCALP} from '../shared/scalp.ts'
import {DIRECTIONAL} from '../shared/desk.ts'
import {SWARM} from '../shared/swarm.ts'
import {INFO_IDS} from '../shared/info.ts'
let statRows:any[]=[]
const old={id:123,sym:'NEAR',side:'LONG',strategy:'DONCH4H',lev:1,paper_mode:true,entry_price:100,size:1,trail_sl:1,opened_at:new Date(Date.now()-3600000).toISOString()}
const rota={id:124,sym:'AVAX',side:'SHORT',strategy:'ROTA',lev:1,paper_mode:true,entry_price:50,size:2,trail_sl:5000,opened_at:new Date(Date.now()-3600000).toISOString(),scalp_meta:{rota:true}}
let request:any;const urls:string[]=[]
const writes:string[]=[]
const db={from:(table:string)=>{const builder:any=new Proxy({},{get:(_t,k:string)=>k==='throwOnError'?async()=>({data:table==='bot_trades'?[old,rota]:table==='agent_stats'?statRows:[]}):k==='then'?undefined:(...a:any[])=>{if(['insert','upsert','update','delete'].includes(k))writes.push(`${k}:${table}`);return builder}});return builder},rpc:(name:string,args:any)=>{assert.equal(name,'scalp_commit_cycle');request=args;return {throwOnError:async()=>({data:{ok:true}})}}}
const original=globalThis.fetch
try{
 globalThis.fetch=(async(url:string)=>{urls.push(url);const now=Date.now();const minute=Math.floor(now/60000)*60000;
 const data=url.includes('/depth')?{E:now,bids:[[101,1000000]],asks:[[101.01,100000]]}:Array.from({length:60},(_,i)=>[minute-(60-i)*60000,99+i*.02,100+i*.02,98+i*.02,99.1+i*.02,100,minute-(59-i)*60000-1]);
 return new Response(JSON.stringify(data),{status:200})}) as typeof fetch
 await runScalp(db,{balance:1000,bot_params:{}},new Date(Date.now()+50000).toISOString(),true,0.5)
 assert.equal(request.p_closes.length,1);assert.equal(request.p_closes[0].reason,'MODE_SWITCH');assert.equal(request.p_closes[0].id,123,'the DONCH4H row is closed, the ROTA row is kept')
 assert.ok(!request.p_entries.some((x:any)=>x.sym==='AVAX'),'never doubles a coin the rotation sleeve holds')
 // v86.0 PROFIT GATE: no agent has a measured edge yet -> every candidate is rejected with a reason, nothing is entered
 assert.equal(request.p_entries.length,0,'no measured edge -> no entries');assert.ok(request.p_minutes.length>=13)
 assert.ok(writes.includes('insert:trade_decisions'),'every ranked candidate is journalled with its reason')
 assert.ok(request.p_entries.every((x:any)=>!x.sym.includes('USDT')&&x.notional>0&&x.hold_min>=1&&x.hold_min<=240))
 assert.ok(urls.some(x=>x.includes('symbol=NEARUSDT&')))
 assert.ok(request.p_entries.reduce((a:number,x:any)=>a+x.notional*1.0005,0)<1101)
 assert.ok(request.p_minutes.every((m:any)=>['scout','regime','rota','donch','risk','trader','treasurer','reporter','auditor','pm','quant','compliance','execution','rsi','vwap','breakout','volume','macd','bollinger','htf','btclead','candle','funding','info','factory','trendDesk','momDesk','revDesk','brkDesk','flowDesk','comboDesk'].includes(m.who)))
 assert.equal(new Set(request.p_minutes.map((m:any)=>m.who)).size,31)
 assert.ok(writes.includes('insert:agent_snapshots'),'snapshot saved every meeting')
 assert.ok(writes.includes('upsert:factory_agents'),'factory spawns its first generation')
 assert.ok(request.p_minutes.find((m:any)=>m.who==='factory').says.includes('בניסוי'))
 assert.equal(request.p_minutes[request.p_minutes.length-1].who,'pm');assert.equal(request.p_minutes[request.p_minutes.length-1].round,3)
 assert.ok(request.p_minutes.find((m:any)=>m.who==='risk').says.includes(`עד ${SCALP.maxPositions} פוזיציות`)&&request.p_minutes.find((m:any)=>m.who==='risk').says.includes('שער הרווח'))

 // v86.0: every voter measured at +40 bps net (5m and 15m agree) -> gross 56 bps vs ~16 bps cost: the gate passes, entries carry their costs
 {const at=new Date().toISOString(),ids=[...DIRECTIONAL,...SWARM.map(x=>x.id),...INFO_IDS]
  statRows=ids.flatMap(id=>[{agent:id,n:3000,s:40*3000,s2:(1600+400)*3000,ev:3000,updated_at:at},{agent:`${id}@15`,n:3000,s:30*3000,s2:(900+400)*3000,ev:3000,updated_at:at}])
  writes.length=0
  await runScalp(db,{balance:1000,bot_params:{}},new Date(Date.now()+50000).toISOString(),true,0.5)
  assert.ok(request.p_entries.length>0&&request.p_entries.length<=SCALP.maxEntries,`edge measured -> entries (${request.p_entries.length})`)
  for(const e of request.p_entries){assert.ok(e.costs&&e.costs.total_bps>=16&&e.net_bps>=2&&e.gross_bps>e.costs.total_bps,'every entry carries a positive net after the full cost model');assert.ok(e.notional<=1100*SCALP.perCoin+1e-6,"per-coin cap on equity (cash + the ROTA row)");assert.equal(e.profit_gate,"passed");assert.ok(e.score>=0.5);assert.ok(e.hold_min>=SCALP.minHoldMin&&e.hold_min<=240)}
  assert.ok(request.p_entries.reduce((a:number,x:any)=>a+x.notional,0)<=1100*0.49+1,'SCALP keeps to its share when ROTA runs alongside')
  statRows=[]}
 const rss=parseRss('<rss><item><title><![CDATA[Bitcoin jumps]]></title><link>https://x/y</link><pubDate>Wed, 23 Sep 2026 14:52:11 +0000</pubDate></item><item><title>no date</title></item></rss>','test')
 assert.equal(rss.length,1);assert.equal(rss[0].title,'Bitcoin jumps');assert.equal(rss[0].ts,Date.parse('2026-09-23T14:52:11Z'))
assert.equal(UNIVERSE.length,40); assert.equal(BINANCE_SYM.PEPE.s,'1000PEPEUSDT')
 assert.ok(urls.some(x=>x.includes('symbol=1000PEPEUSDT&')),'PEPE priced from the 1000-unit Binance contract')
 await assert.rejects(()=>runScalp(db,{balance:1000},'x',false),/paper-only/)
 console.log('Scalp runner: transition, symbol mapping, allocation and nine-role audit passed')
}finally{globalThis.fetch=original}

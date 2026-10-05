// Full autonomous paper cycle against a fake exchange/transactional DB.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Q15,q15Signal,q15Levels,q15Gate,q15Config } from '../shared/q15.ts'
import { HARD_FLOOR,defaultAutonomy,loadAutonomy,learnClosedTrades,enforceFloor } from '../shared/q15-autonomy.ts'
import { runQ15,q15Tape,exitRow } from '../supabase/functions/trading-bot/q15-runner.ts'
import type { LBar } from '../shared/lab.ts'
const BAR=Date.UTC(2026,9,5,9,15),NOW=BAR+2000
const bars=(dir=0):LBar[]=>{let p=100;return Array.from({length:79},(_,i)=>{const o=p;p+=i>=76?dir*.9:.0001;const vol=i===78&&dir?6000:1000;return{t:BAR-(79-i)*Q15.barMs,open:o,close:p,high:Math.max(o,p)+.02,low:Math.min(o,p)-.02,vol,tb:vol*(dir<0?.1:.9)}})}
const flat=bars(),up=bars(1),down=bars(-1)
assert.equal(q15Signal(flat,true,false).sig,null)
assert.equal(q15Signal(up,false,false).sig?.dir,1,'BTC gate stays disabled')
assert.equal(q15Signal(down,true,false).sig?.dir,-1)
const missing=up.map(x=>({...x}));delete missing.at(-1)!.tb
assert.equal(q15Signal(missing,true,false).reason,'missing_taker')
assert.deepEqual(q15Levels(1,100,.01),{r:.4,stop:99.6,target:100.8})
assert.deepEqual(q15Config(),{lev:25,perTrade:.15,maxOpen:20,share:.9})
assert.deepEqual(enforceFloor({lev:1}),HARD_FLOOR)
const input={book:{bid:99.99,ask:100.01,ts:NOW,bidDepth10:1e7,askDepth10:1e7,source:'test'},now:NOW,notional:2500,dir:1 as const,rFrac:.004,entryImpact:0,exitImpact:0,beyond:false,funding:.0001,fundingHours:8,grossBps:NaN}
assert.equal(q15Gate(input).pass,true,'no new hard profit filter')
assert.equal(q15Gate({...input,grossBps:-10}).pass,true)
assert.equal(q15Gate({...input,entryImpact:.0021}).reason,'thin_book')
assert.equal(q15Gate({...input,book:{...input.book,ts:NOW-8001}}).reason,'stale_quote')
assert.equal(q15Gate({...input,funding:null}).reason,'missing_funding')
assert.equal(q15Gate({...input,book:{...input.book,ask:100.3}}).reason,'wide_spread')
const outcome=(id:number,ts=NOW-1000)=>({id,closed_at:new Date(ts).toISOString(),pnl:10,scalp_meta:{q15:{policy:'burst'}}})
let learning=learnClosedTrades(defaultAutonomy(),[outcome(9),outcome(10)])
assert.equal(learning.scores.burst.n,2)
learning=learnClosedTrades(loadAutonomy({q15_autonomy:learning}),[outcome(9),outcome(10),outcome(11)])
assert.equal(learning.scores.burst.n,3,'same timestamp IDs deduplicate across restart')
learning=learnClosedTrades(learning,[outcome(1,NOW)])
assert.equal(learning.scores.burst.n,4,'older position can close later')
assert.equal(loadAutonomy({q15_autonomy:{...learning,version:1}}).scores.burst.n,0,'legacy counts rebuild')
const pairs=['BTC','SOL',...Array.from({length:105},(_,i)=>`C${i}`)].map(sym=>({sym,s:`${sym}USDT`,k:1}))
let open:any[]=[],closed:any[]=[],journal:any[]=[],commits:any[]=[],halted=false,hot=false,kcalls=0,tape:any[]=[],funding:any[]=[],now=NOW,autonomyWrites=0
const db={from(table:string){let isClosed=false,isHead=false;const q:any=new Proxy({},{get(_t,k){
 if(k==='then')return (resolve:any)=>resolve({data:null,error:null})
 if(k==='neq')return()=>{isClosed=true;return q}
 if(k==='select')return (_s:string,opts:any)=>{isHead=!!opts?.head;return q}
 if(k==='insert')return (rows:any[])=>{if(table==='trade_decisions')journal.push(...rows);return q}
 if(k==='update')return()=>{if(table==='bot_state')autonomyWrites++;return q}
 if(k==='throwOnError')return async()=>({data:table==='market_cache'?[{data:{pairs}}]:table==='q15_shadow'?[]:table==='bot_trades'?(isClosed?closed:isHead?[]:open):[],count:0})
 return()=>q
 }});return q},rpc(name:string,args:any){return{throwOnError:async()=>{assert.equal(name,'q15_commit_cycle');assert.equal(args.p_share,.9);commits.push(args);open=open.filter(t=>!args.p_closes.some((c:any)=>c.id===t.id));return{data:{balance:5000,equity:5000,halted,closed:args.p_closes.length,opened:args.p_entries.length,accepted:args.p_entries.map((x:any)=>x.sym)}}}}}}
const realFetch=globalThis.fetch,realNow=Date.now
const run=async(params:any={})=>{journal=[];commits=[];kcalls=0;return runQ15(db,{balance:5000,bot_params:params},new Date(now+48000).toISOString(),true)}
const position=()=>({id:7,sym:'SOL',side:'LONG',strategy:'Q15',paper_mode:true,entry_price:100,size:20,lev:25,opened_at:new Date(NOW-10000).toISOString(),scalp_meta:{q15:{r:1,stop:99,target:102,chk:NOW-10000,hold_ms:Q15.holdMs}}})
try{
 Date.now=()=>now
 globalThis.fetch=(async(url:string)=>{
  if(url.includes('aggTrades'))return new Response(JSON.stringify(tape))
  if(url.includes('fundingRate'))return new Response(JSON.stringify(funding))
  if(url.includes('/klines')){kcalls++;const b=hot&&url.includes('SOLUSDT')?up:flat;return new Response(JSON.stringify(b.map(x=>[x.t,x.open,x.high,x.low,x.close,x.vol,x.t+Q15.barMs-1,0,0,x.tb])))}
  if(url.includes('fundingInfo'))return new Response('[]')
  if(url.includes('premiumIndex'))return new Response(JSON.stringify([{symbol:'SOLUSDT',lastFundingRate:'.0001'}]))
  if(url.includes('/depth'))return new Response(JSON.stringify({bids:[[103,1e7]],asks:[[103.01,1e7]],E:now}))
  throw new Error('unmocked request '+url)
 }) as typeof fetch
 await assert.rejects(()=>runQ15(db,{},'',false),/paper-only/)
 await run();assert.equal(journal.length,pairs.length);assert.equal(kcalls,pairs.length);assert.equal(commits.at(-1).p_entries.length,0)
 hot=true;closed=[outcome(1)];await run();let e=commits.at(-1).p_entries[0]
 assert.equal(e.lev,25);assert.equal(e.notional,18750);assert.equal(journal.find(x=>x.sym==='SOL').reason,'taken')
 assert.equal(commits.at(-1).p_note.q15_autonomy.scores.burst.n,1)
 const saved=commits.at(-1).p_note.q15_autonomy;await run({q15_autonomy:saved});assert.equal(commits.at(-1).p_note.q15_autonomy.scores.burst.n,1);assert.equal(autonomyWrites,0,'atomic ledger persistence')
 halted=true;await run();assert.equal(commits.at(-1).p_entries.length,0);halted=false
 await run({q15_bar:BAR});assert.equal(kcalls,0,'same bar not re-scanned')
 now=BAR+56000;await run();assert.equal(commits.at(-1).p_entries.length,0,'late candidates expire');now=NOW
 open=[{strategy:'DONCH4H',paper_mode:true,lev:10}];await assert.rejects(()=>run(),/incompatible/);open=[]
 tape=[{p:'100',T:NOW-1,a:1},{p:'50',T:NOW+1,a:2}];assert.deepEqual((await q15Tape(pairs[0],NOW-10,NOW)).trades,[{p:100,T:NOW-1}])
 tape=[{p:'98',T:NOW-5000,a:1}];funding=[{fundingRate:'.001',markPrice:'100'}]
 let r=await exitRow(position(),NOW);assert.equal(r.close?.reason,'STOP');assert.equal(r.close?.funding,2,'funding is dollars for full size');assert.equal(r.close?.quote_ts,NOW);assert.equal(r.close?.fill.trigger_ts,NOW-5000)
 tape=[{p:'103',T:NOW-1,a:1}];funding=[];assert.equal((await exitRow(position(),NOW)).close?.reason,'TARGET','resting target fills at target after a crossing print')
 tape=[{p:'95',T:NOW-1,a:1}];assert.equal((await exitRow(position(),NOW)).close?.reason,'LIQUIDATION')
 tape=[];let t=position();t.scalp_meta.q15.hold_ms=5000;assert.equal((await exitRow(t,NOW)).close?.reason,'TIMEOUT')
 assert.equal((await exitRow(position(),NOW)).update?.chk,NOW,'complete empty tape advances')
 tape=Array.from({length:1000},(_,i)=>({p:'100',T:NOW-2000+i,a:i}));t=position();t.scalp_meta.q15.hold_ms=5000;assert.equal((await exitRow(t,NOW)).close,null,'incomplete tape cannot invent timeout')
 tape=[{p:'103',T:NOW-1,a:1}];open=[position()];const cycle=await run();assert.equal(commits[0].p_closes.length,1);assert.equal(cycle.closed,1);assert.equal(commits.at(-1).p_entries.length,1,'close frees coin and capital for next entry')
}finally{globalThis.fetch=realFetch;Date.now=realNow}
for(const f of ['deploy-edge-function','enforce-no-loss-trading']){const s=readFileSync(`.github/workflows/${f}.yml`,'utf8');for(const kv of ["__ENABLED_SLEEVES = 'Q15,EVT,DONCH4H'","__Q15_LEV = '25'","__Q15_PER_TRADE = '0.15'","__Q15_MAX_OPEN = '20'","__Q15_SHARE = '0.90'"])assert.ok(s.includes(kv));assert.ok(!s.includes('ALLOW_LIVE_EXECUTION'))}
console.log('q15: autonomy, entries, exits, learning and aggression — all assertions passed')

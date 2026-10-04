// P-Q15: deterministic replay of the actual runner, no network or real orders.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Q15,q15Signal,q15Levels,q15Gate,q15Edge,q15Config } from '../shared/q15.ts'
import { runQ15,q15Tape } from '../supabase/functions/trading-bot/q15-runner.ts'
import { freshEvent } from '../shared/events.ts'
import { resolveExit } from '../shared/fast.ts'
import type { LBar } from '../shared/lab.ts'
const BAR=Date.UTC(2026,9,4,9,15), NOW=BAR+2000
const bars=(dir=0):LBar[]=>{let p=100;return Array.from({length:79},(_,i)=>{const o=p,hot=i>=76;p+=hot?dir*.9:.0001;const vol=i===78&&dir?6000:1000;return{t:BAR-(79-i)*Q15.barMs,open:o,close:p,high:Math.max(o,p)+.02,low:Math.min(o,p)-.02,vol,tb:vol*(dir<0?.1:.9)}})}
const flat=bars(),up=bars(1),down=bars(-1)
assert.equal(q15Signal(flat,true,false).sig,null)
assert.equal(q15Signal(up,true,false).sig?.dir,1)
assert.equal(q15Signal(down,false,false).sig?.dir,-1)
assert.equal(q15Signal(up,false,false).reason,'btc_direction')
assert.equal(q15Signal(up,null,true).sig?.dir,1,'BTC skips its own direction gate')
const missing=up.map(x=>({...x}));delete missing.at(-1)!.tb
assert.equal(q15Signal(missing,true,false).reason,'missing_taker')
assert.deepEqual(q15Levels(1,100,.01),{r:.4,stop:99.6,target:100.8})
const input={book:{bid:99.99,ask:100.01,ts:NOW,bidDepth10:1e7,askDepth10:1e7,source:'test'},now:NOW,notional:2500,dir:1 as const,rFrac:.004,entryImpact:0,exitImpact:0,beyond:false,funding:.0001,fundingHours:8,grossBps:NaN}
assert.equal(q15Gate(input).reason,'no_edge_estimate')
assert.equal(q15Gate({...input,grossBps:14}).pass,false)
assert.equal(q15Gate({...input,grossBps:25}).pass,true)
assert.equal(q15Gate({...input,grossBps:50,entryImpact:.0011}).reason,'thin_book')
assert.equal(q15Gate({...input,grossBps:50,book:{...input.book,ts:NOW-5001}}).reason,'stale_quote')
assert.equal(q15Gate({...input,grossBps:50,funding:null}).reason,'missing_funding')
assert.equal(q15Gate({...input,grossBps:50,book:{...input.book,ask:100.1}}).reason,'wide_spread')
const evidence=(gross=50)=>Array.from({length:100},(_,i)=>({side:1,t0:NOW-(1+Math.floor(i/5))*86400000,closed_at:new Date(NOW-3600000).toISOString(),gross_bps:gross}))
assert.equal(q15Edge([],1,NOW).n,0)
assert.equal(q15Edge(evidence(),1,NOW).bps,50)
assert.ok(Number.isNaN(q15Edge(evidence(),-1,NOW).bps),'never borrow the other direction')
assert.ok(Number.isNaN(q15Edge(evidence().map(x=>({...x,closed_at:new Date(NOW+1).toISOString()})),1,NOW).bps),'no future outcome leakage')
const g=globalThis as any;g.__Q15_LEV='100';g.__LEVERAGE='100';assert.equal(q15Config().lev,10)
g.__Q15_LEV='10'
assert.equal(freshEvent(NOW-30001,NOW),false)
assert.equal(freshEvent(NOW-10000,NOW),true)
assert.equal(freshEvent(NOW+1,NOW),false)
const ex={dir:1 as const,entry:100,r:1,stop:99,target:102,liq:90,best:100,trail:false}
assert.equal(resolveExit(ex,[{p:98,T:1},{p:103,T:2}]).why,'STOP','ordered prints stop before later target')

const pairs=['BTC','SOL',...Array.from({length:105},(_,i)=>`C${i}`)].map(sym=>({sym,s:`${sym}USDT`,k:1}))
let history:any[]=[],open:any[]=[],journal:any[]=[],commits:any[]=[],shadows:any[]=[],halted=false,hot=false,kcalls=0,tape:any[]=[]
const db={from(table:string){let status='';const q:any=new Proxy({},{get(_t,k){
 if(k==='eq')return (key:string,v:string)=>{if(key==='status')status=v;return q}
 if(k==='insert')return (rows:any[])=>{if(table==='trade_decisions')journal.push(...rows);return q}
 if(k==='upsert')return (rows:any[])=>{shadows.push(...rows);return q}
 if(k==='throwOnError')return async()=>({data:table==='market_cache'?[{data:{pairs}}]:table==='q15_shadow'?(status==='closed'?history:[]):table==='bot_trades'?open:[],count:0})
 return()=>q
}});return q},rpc(name:string,args:any){return{throwOnError:async()=>{assert.equal(name,'q15_commit_cycle');commits.push(args);return{data:{balance:5000,equity:5000,halted,opened:args.p_entries.length,accepted:args.p_entries.map((x:any)=>x.sym)}}}}}}
const realFetch=globalThis.fetch,realNow=Date.now
const run=async(params:any={})=>{journal=[];commits=[];shadows=[];kcalls=0;return runQ15(db,{balance:5000,bot_params:params},new Date(NOW+48000).toISOString(),true)}
try{
 Date.now=()=>NOW
 globalThis.fetch=(async(url:string)=>{
  if(url.includes('aggTrades'))return new Response(JSON.stringify(tape))
  if(url.includes('bookTicker'))return new Response('[]')
  if(url.includes('/klines')){kcalls++;const b=hot&&url.includes('SOLUSDT')?up:flat;return new Response(JSON.stringify(b.map(x=>[x.t,x.open,x.high,x.low,x.close,x.vol,x.t+Q15.barMs-1,0,0,x.tb])))}
  if(url.includes('fundingInfo'))return new Response('[]')
  if(url.includes('premiumIndex'))return new Response(JSON.stringify([{symbol:'SOLUSDT',lastFundingRate:'.0001'}]))
  if(url.includes('/depth'))return new Response(JSON.stringify({bids:[[103,.1e7]],asks:[[103.01,.1e7]],E:NOW}))
  throw new Error('unmocked request '+url)
 }) as typeof fetch
 await assert.rejects(()=>runQ15(db,{},'',false),/paper-only/)
 await run();assert.equal(journal.length,pairs.length,'all-failing bar -> N journal rows, including >100 universe');assert.equal(commits.at(-1).p_entries.length,0,'no forced fill');assert.equal(kcalls,pairs.length)
 hot=true;await run();assert.equal(journal.find(x=>x.sym==='SOL').reason,'taken');assert.equal(shadows.length,1)
 history=evidence(14);await run();assert.equal(commits.at(-1).p_entries.length,1,'immediate mode does not depend on historical evidence')
 history=evidence();await run();assert.equal(commits.at(-1).p_entries.length,1);const e=commits.at(-1).p_entries[0];assert.equal(e.lev,10);assert.equal(e.notional,2500);assert.equal(journal.find(x=>x.sym==='SOL').reason,'taken')
 halted=true;await run();assert.equal(commits.at(-1).p_entries.length,0);assert.equal(journal.find(x=>x.sym==='SOL').reason,'day_or_owner_halt');assert.equal(kcalls,pairs.length,'halt still scans and journals');halted=false
 await run({q15_bar:BAR});assert.equal(kcalls,0,'same completed bar is never re-scanned')
 Date.now=()=>BAR+60001;await run();assert.equal(commits.at(-1).p_entries.length,0);assert.equal(journal.find(x=>x.sym==='SOL').reason,'missed_open_window');Date.now=()=>NOW
 open=[{paper_mode:true,strategy:'DONCH4H',lev:10}];await assert.rejects(()=>run(),/non-isolated/);open=[]
 tape=[{p:'100',T:NOW-1,a:1},{p:'50',T:NOW+1,a:2}];const t=await q15Tape(pairs[0],NOW-10,NOW);assert.deepEqual(t.trades,[{p:100,T:NOW-1}],'future tape never resolves an exit')
}finally{globalThis.fetch=realFetch;Date.now=realNow;delete g.__Q15_LEV;delete g.__LEVERAGE}
const read=(p:string)=>readFileSync(p,'utf8')
for(const f of ['deploy-edge-function','enforce-no-loss-trading']){const s=read(`.github/workflows/${f}.yml`);for(const kv of ["__ENABLED_SLEEVES = 'Q15,EVT,DONCH4H'","__LEVERAGE = '1'","__Q15_LEV = '10'","__Q15_PER_TRADE = '0.05'","__Q15_MAX_OPEN = '8'","__Q15_SHARE = '0.50'","__EVT_PER_TRADE = '0.08'","__EVT_MAX_OPEN = '3'"])assert.ok(s.includes(kv));assert.ok(!s.includes('ALLOW_LIVE_EXECUTION'))}
assert.ok(read('supabase/functions/trading-bot/blade-runner.ts').includes('lev: 1, price: entry'),'DONCH entry explicitly 1x regardless of shim')
console.log('q15: all assertions passed')

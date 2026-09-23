import assert from 'node:assert/strict'
import {runScalp,parseRss} from '../supabase/functions/trading-bot/scalp-runner.ts'
const old={id:123,sym:'NEAR',side:'LONG',strategy:'ROTA',lev:1,paper_mode:true,entry_price:100,size:1,trail_sl:1,opened_at:new Date(Date.now()-3600000).toISOString()}
let request:any;const urls:string[]=[]
const db={from:(table:string)=>{const builder:any={};for(const k of ['select','eq','neq','order','limit'])builder[k]=()=>builder;builder.throwOnError=async()=>({data:table==='bot_trades'?[old]:[]});return builder},rpc:(name:string,args:any)=>{assert.equal(name,'scalp_commit_cycle');request=args;return {throwOnError:async()=>({data:{ok:true}})}}}
const original=globalThis.fetch
try{
 globalThis.fetch=(async(url:string)=>{urls.push(url);const now=Date.now();const minute=Math.floor(now/60000)*60000;
 const data=url.includes('/depth')?{E:now,bids:[[101,100]],asks:[[101.01,10]]}:Array.from({length:60},(_,i)=>[minute-(60-i)*60000,99+i*.02,100+i*.02,98+i*.02,99.1+i*.02,100,minute-(59-i)*60000-1]);
 return new Response(JSON.stringify(data),{status:200})}) as typeof fetch
 await runScalp(db,{balance:1000,bot_params:{}},new Date(Date.now()+50000).toISOString(),true)
 assert.equal(request.p_closes.length,1);assert.equal(request.p_closes[0].reason,'MODE_SWITCH')
 assert.equal(request.p_entries.length,8);assert.ok(request.p_minutes.length>=13)
 assert.ok(request.p_entries.every((x:any)=>!x.sym.includes('USDT')&&x.notional>0))
 assert.ok(urls.some(x=>x.includes('symbol=NEARUSDT&')))
 assert.ok(request.p_entries.reduce((a:number,x:any)=>a+x.notional*1.0005,0)<1101)
 assert.ok(request.p_minutes.every((m:any)=>['scout','regime','rota','donch','risk','trader','treasurer','reporter','auditor','pm','quant','compliance','execution'].includes(m.who)))
 assert.equal(new Set(request.p_minutes.map((m:any)=>m.who)).size,13)
 assert.equal(request.p_minutes[request.p_minutes.length-1].who,'pm');assert.equal(request.p_minutes[request.p_minutes.length-1].round,3)
 assert.ok(request.p_minutes.find((m:any)=>m.who==='risk').says.includes('עד 8 פוזיציות'))
 const rss=parseRss('<rss><item><title><![CDATA[Bitcoin jumps]]></title><link>https://x/y</link><pubDate>Wed, 23 Sep 2026 14:52:11 +0000</pubDate></item><item><title>no date</title></item></rss>','test')
 assert.equal(rss.length,1);assert.equal(rss[0].title,'Bitcoin jumps');assert.equal(rss[0].ts,Date.parse('2026-09-23T14:52:11Z'))
 await assert.rejects(()=>runScalp(db,{balance:1000},'x',false),/paper-only/)
 console.log('Scalp runner: transition, symbol mapping, allocation and nine-role audit passed')
}finally{globalThis.fetch=original}

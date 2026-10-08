import fs from 'node:fs';
import * as F from '../../shared/rsi2-forward.ts';
const START=Date.parse('2025-10-01T00:00:00Z'), SPLIT=Date.parse('2026-06-01T00:00:00Z'), END=Date.parse('2026-10-01T00:00:00Z');
const symbols='BTCUSDT ETHUSDT SOLUSDT BNBUSDT XRPUSDT DOGEUSDT ADAUSDT AVAXUSDT LINKUSDT SUIUSDT AAVEUSDT LTCUSDT TRADOORUSDT MYXUSDT'.split(' ');
const norm=(n:any)=>Number(n)>1e14?Number(n)/1000:Number(n);
function metrics(rs:any[],cost:number,days:number){const v=rs.map(r=>r.gross-r.fundingCost-cost),n=v.length,profit=v.reduce((s,x)=>s+Math.max(x,0),0),loss=v.reduce((s,x)=>s+Math.max(-x,0),0);return {n,net_win_pct:n?100*v.filter(x=>x>0).length/n:null,pf:loss?profit/loss:null,avg_net_bps:n?10000*v.reduce((s,x)=>s+x,0)/n:null,trades_per_day:n/days,sum_net_usd_fixed_notional:5000*v.reduce((s,x)=>s+x,0)};}
const results:any[]=[];
for(const symbol of symbols){
 const d=JSON.parse(fs.readFileSync(new URL(`./data/${symbol}.json`,import.meta.url),'utf8'));
 const manifest=d.manifest;
 try{
 const missing=manifest.filter((m:any)=>m.error);if(missing.length)throw Error(`${missing.length} missing archives; incomplete funding/price coverage`);
 const five:F.Bar[]=d.klines.map((r:any)=>({t:norm(r[0]),end:norm(r[6])+1,o:+r[1],h:+r[2],l:+r[3],c:+r[4],v:+r[5]})).filter((b:F.Bar)=>b.t>=START&&b.end<=END).sort((a:F.Bar,b:F.Bar)=>a.t-b.t);
 if(!five.length)throw Error('no candles');
 for(let i=0;i<five.length;i++){const b=five[i];if(b.end-b.t!==300000||(i&&b.t!==five[i-1].end)||![b.o,b.h,b.l,b.c,b.v].every(Number.isFinite)||b.l<=0||b.h<Math.max(b.o,b.c)||b.l>Math.min(b.o,b.c))throw Error('invalid or gapped candles');}
 const fifteen:F.Bar[]=[];
 for(let i=0;i+2<five.length;i++){const a=five[i],b=five[i+1],c=five[i+2];if(a.t%900000===0)fifteen.push({t:a.t,end:c.end,o:a.o,h:Math.max(a.h,b.h,c.h),l:Math.min(a.l,b.l,c.l),c:c.c,v:a.v+b.v+c.v});}
 const marks=new Map<number,number>(d.markPriceKlines.map((r:any)=>[norm(r[0]),+r[4]]));
 const fund:F.Funding[]=d.fundingRate.map((r:any)=>{const t=norm(r[0]), mark=marks.get(Math.floor(t/300000)*300000-300000);return {t,rate:+r[2],mark:mark??NaN};}).filter((f:F.Funding)=>f.t>=five[0].t+900000*1000&&f.t<END);
 if(fund.some(f=>![f.rate,f.mark].every(Number.isFinite)||f.mark<=0))throw Error('missing settlement mark proxy');
 if(fifteen.length<1000)throw Error('insufficient warmup');
 const t0=fifteen[999].end;
 const record:any={symbol,coverage:{start:five[0].t,end:five.at(-1)!.end,bars:five.length,warmup_end:t0,funding_events:fund.length},manifest,variants:[]};
 for(const [variant,alias] of [['ADX_LT25','TRADOORUSDT'],['VOLUME_GE_MEAN20','MYXUSDT']]){
  const s=F.initial();const trades=F.advance(alias,s,five,fifteen,END,t0,fund);
  const train=trades.filter(r=>r.entryTs<SPLIT&&r.exitTs<SPLIT),val=trades.filter(r=>r.entryTs>=SPLIT&&r.exitTs<END);
  const out:any={variant,train:{},validation:{},boundary_excluded:trades.length-train.length-val.length,unresolved_open:s.position!==null};
  for(const [key,rs,days] of [['train',train,(SPLIT-t0)/86400000],['validation',val,(END-SPLIT)/86400000]] as const){
   out[key]={base:metrics(rs,.0012,days),stress:metrics(rs,.0016,days),long:metrics(rs.filter(r=>r.side===1),.0012,days),short:metrics(rs.filter(r=>r.side===-1),.0012,days)};
  }
  out.screen_pass=['train','validation'].every(k=>['base','stress'].every(c=>{const m=out[k][c];return m.n>=300&&m.pf>1.15&&m.avg_net_bps>0}));
  record.variants.push(out);
 }
 results.push(record); console.log(symbol,JSON.stringify(record.variants));
 }catch(e){results.push({symbol,error:String(e),manifest});console.log(symbol,String(e));}
}
const report={window:{start:START,split:SPLIT,end:END},trials:28,source:'Binance Vision USD-M monthly archives',engine_blob:'e261cf143bbfbe9a9d643f4ad2a77911fae403c7',funding:'archived rate, preceding completed 5m MARK CLOSE proxy; raw calc_time timestamp; not exact runtime settlement mark',limitations:['fixed selected universe / survivorship','validation previously exposed','no order book fills or tick-size quantization','no portfolio or liquidation model','funding mark and intrabar timestamp approximation'],results};
fs.writeFileSync(new URL('./result.json',import.meta.url),JSON.stringify(report,null,2));

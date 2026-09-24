import assert from 'node:assert/strict'
import {GYM,aggregate,costFor,enumerateGenomes,corrT} from '../backtest/gym.ts'
import {genomeId,FEATURES,WHENS,whenOk,vote,mutate,rng} from '../shared/factory.ts'
import {LEARN} from '../shared/swarm.ts'
// aggregation: 1h -> 4h keeps only complete UTC-aligned buckets, OHLC/volume composed correctly
const h=(i:number)=>({t:1_700_000_000_000-(1_700_000_000_000%14_400_000)+i*3_600_000,o:100+i,h:101+i,l:99+i,c:100.5+i,v:10})
const b4=aggregate([h(0),h(1),h(2),h(3),h(4),h(5),h(6),h(7),h(8)],60,240)
assert.equal(b4.length,2,'two complete 4h bars; the trailing partial one is dropped')
assert.equal(b4[0].o,100);assert.equal(b4[0].c,103.5);assert.equal(b4[0].h,104);assert.equal(b4[0].l,99);assert.equal(b4[0].v,40);assert.equal(b4[0].t%14_400_000,0)
assert.equal(aggregate([h(1),h(2),h(3)],60,240).length,0,'a bucket missing its first hour is not a bar')
// costs: the round trip everywhere, plus perpetual funding for the hours a slow genome holds
const s5=GYM.sets.find(s=>s.tf==='5m')!,s15=GYM.sets.find(s=>s.tf==='15m')!,s4=GYM.sets.find(s=>s.tf==='4h')!,sd=GYM.sets.find(s=>s.tf==='1d')!
assert.equal(GYM.sets.length,4,'5m, 15m, 4h, 1d')
assert.equal(costFor(s5,0),LEARN.costBps);assert.ok(Math.abs(costFor(s4,0)-(LEARN.costBps+0.5))<1e-9,'4h hold pays 0.5bp funding (0.01%/8h)');assert.ok(Math.abs(costFor(sd,3)-(LEARN.costBps+21))<1e-9,'7-day hold pays 21bp funding')
assert.equal(s4.coins.length,40);assert.equal(sd.coins.length,40);assert.equal(s5.coins.length,10);assert.equal(s15.coins.length,40);assert.ok(s15.coins.includes('1000PEPE'),'Binance spelling for the archive')
assert.deepEqual([...s4.horizonsMin],[240,480,1440,2880,10080]);assert.equal(s4.horizonsBars[4]*240,10080);assert.deepEqual([...s15.horizonsMin],[15,60,240,1440]);assert.equal(s15.horizonsBars[3]*15,1440)
assert.equal(s5.maxMonths,36);assert.equal(s15.maxMonths,36,'fast sets capped at 36 months (memory)')
// the three-way split leaves a final slice that is never used for selection
assert.ok(Math.abs(GYM.isShare+GYM.valShare-0.8)<1e-9,'IS 60% + VAL 20% -> FINAL 20%');assert.ok(GYM.oosT>GYM.valT&&GYM.valT>GYM.isT)
// enumeration: exhaustive singles + a fixed sample of pairs + time-gated variants; ids carry timeframe and gate
const singles=Object.entries(FEATURES).filter(([k])=>!(GYM.offlineNA as readonly string[]).includes(k)).reduce((a,[,t])=>a+t.length*2,0)
const g5=enumerateGenomes(),g4=enumerateGenomes('4h'),gd=enumerateGenomes('1d'),g15=enumerateGenomes('15m')
assert.equal(g5.length,singles+GYM.pairs+GYM.whenSample);assert.equal(g4.length,g5.length)
assert.ok(g5.every(g=>!g.tf)&&g4.every(g=>g.tf==='4h')&&gd.every(g=>g.tf==='1d')&&g15.every(g=>g.tf==='15m'))
assert.equal(g5.filter(g=>g.when).length,GYM.whenSample,'exactly the sampled number of gated genomes')
assert.ok(gd.filter(g=>g.when).every(g=>!g.when!.h&&g.when!.d),'daily genomes carry day gates only (an hour gate on 1d bars is a no-op)');assert.ok(gd.filter(g=>g.when).length>0)
{const {fitGate}=await import('../shared/factory.ts');assert.equal(fitGate('1d',WHENS.eu.w),undefined);assert.deepEqual(fitGate('1d',WHENS.euwkd.w),{d:[1,2,3,4,5]});assert.deepEqual(fitGate('4h',WHENS.eu.w),WHENS.eu.w)}
assert.ok(genomeId(g4[0]).startsWith('g4_')&&genomeId(gd[0]).startsWith('gd_')&&genomeId(g5[0]).startsWith('g_')&&genomeId(g15[0]).startsWith('g15_'),'ids never collide across timeframes')
assert.equal(new Set([...g5,...g4,...gd,...g15].map(genomeId)).size,4*g5.length)
assert.deepEqual(enumerateGenomes('4h').map(genomeId),g4.map(genomeId),'deterministic')
const gated=g5.find(g=>g.when)!;assert.ok(genomeId(gated).includes('_'),'gate is part of the id');assert.notEqual(genomeId(gated),genomeId({a:gated.a,...(gated.b?{b:gated.b}:{})}))
// time gates: hour windows (incl. wrap-around) and weekdays, UTC
const mon10=Date.UTC(2024,0,8,10),sat23=Date.UTC(2024,0,13,23),sun3=Date.UTC(2024,0,14,3)
assert.ok(whenOk(WHENS.eu.w,mon10)&&!whenOk(WHENS.eu.w,sat23));assert.ok(whenOk(WHENS.night.w,sat23)&&whenOk(WHENS.night.w,sun3)&&!whenOk(WHENS.night.w,mon10),'22-06 wraps midnight')
assert.ok(whenOk(WHENS.wkd.w,mon10)&&!whenOk(WHENS.wkd.w,sat23)&&whenOk(WHENS.wke.w,sun3));assert.ok(whenOk(undefined,sat23))
assert.equal(vote({a:['r5',0.4,1],when:WHENS.eu.w},{r5:0.5},sat23),0,'gated genome abstains outside its window');assert.equal(vote({a:['r5',0.4,1],when:WHENS.eu.w},{r5:0.5},mon10),1);assert.equal(vote({a:['r5',0.4,1],when:WHENS.eu.w},{r5:0.5}),1,'no time given -> gate ignored')
// mutation keeps the timeframe and can gain, change or drop a gate
{const r=rng(3);const kids=Array.from({length:200},()=>mutate({a:['r5',0.4,1],tf:'4h',when:WHENS.eu.w},r))
 assert.ok(kids.every(k=>k.tf==='4h'),'tf travels with the child');assert.ok(kids.some(k=>!k.when)&&kids.some(k=>k.when&&JSON.stringify(k.when)!==JSON.stringify(WHENS.eu.w)),'gate dropped / changed');assert.ok(kids.every(k=>k.a[2]===1),'direction never flips')}
// corrected t: overlap and cross-coin deflation both shrink it
const st={n:1000,s:5000,s2:1000*(25+100)}
assert.ok(corrT(st,1,1)>corrT(st,12,1)&&corrT(st,1,1)>corrT(st,1,40))
console.log('Gym: aggregation, costs, four timeframes, time gates, mutation, deterministic enumeration passed')
// v85.5 widened vocabulary: taker flow / trade count from the klines, drawdown, and the aux-fed features
{const {features,FEATURES,FEATURE_LABEL,FEATURE_KEYS}=await import('../shared/factory.ts')
 const bars=Array.from({length:80},(_,i)=>({t:i*60000,o:100+i*0.1,h:100.2+i*0.1,l:99.9+i*0.1,c:100.1+i*0.1,v:100,q:i>=75?90:50,n:i>=75?400:100}))
 const f=features(bars,{tls:0.25,tlr:-0.3,doi1d:0.07,xm60:0.5,xm90:-0.5})
 assert.ok(f.ti5>0.7&&f.ti5<=1,'last 5 bars 90% taker-buy -> strongly positive');assert.ok(Math.abs(f.ti30)<f.ti5,'30-bar imbalance is diluted')
 assert.ok(f.nt>2,'trade count 4x the median, signed by the up-move');assert.ok(f.dd30<=0&&f.dd30>-1,'at/near the 30-bar high')
 assert.equal(f.tls,0.25);assert.equal(f.tlr,-0.3);assert.ok(Math.abs(f.oi1d-7)<1e-9,'24h OI change in %');assert.equal(f.xm60,0.5);assert.equal(f.xm90,-0.5)
 const noq=features(bars.map(({q:_q,n:_n,...b})=>b),{});assert.ok(Number.isNaN(noq.ti5)&&Number.isNaN(noq.nt),'no taker/trade data (OKX) -> NaN -> those genes abstain')
 assert.ok(FEATURE_KEYS.every(k=>FEATURE_KEYS.length&&FEATURE_LABEL[k]&&FEATURES[k].length>=3),'every feature has thresholds and a Hebrew label')
 assert.deepEqual([...GYM.offlineNA],['ob'],'only the order book stays untestable offline')}
{const {TSeries,loadAux}=await import('../backtest/gym.ts')
 const s=new TSeries([100,200,300],[1,2,3]);assert.equal(s.at(250),2);assert.equal(s.at(50),NaN);assert.equal(s.at(1000,100),NaN,'stale value is missing');assert.equal(s.at(300),3)
 assert.deepEqual(loadAux('NOPE_COIN'),{},'no aux files -> empty, never a throw')}
console.log('Gym v85.5: widened vocabulary and aux series passed')

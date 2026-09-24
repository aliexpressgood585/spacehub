import assert from 'node:assert/strict'
import {GYM,aggregate,costFor,enumerateGenomes,corrT} from '../backtest/gym.ts'
import {genomeId,FEATURES} from '../shared/factory.ts'
import {LEARN} from '../shared/swarm.ts'
// aggregation: 1h -> 4h keeps only complete UTC-aligned buckets, OHLC/volume composed correctly
const h=(i:number)=>({t:1_700_000_000_000-(1_700_000_000_000%14_400_000)+i*3_600_000,o:100+i,h:101+i,l:99+i,c:100.5+i,v:10})
const b4=aggregate([h(0),h(1),h(2),h(3),h(4),h(5),h(6),h(7),h(8)],60,240)
assert.equal(b4.length,2,'two complete 4h bars; the trailing partial one is dropped')
assert.equal(b4[0].o,100);assert.equal(b4[0].c,103.5);assert.equal(b4[0].h,104);assert.equal(b4[0].l,99);assert.equal(b4[0].v,40);assert.equal(b4[0].t%14_400_000,0)
assert.equal(aggregate([h(1),h(2),h(3)],60,240).length,0,'a bucket missing its first hour is not a bar')
// costs: the round trip everywhere, plus perpetual funding for the hours a slow genome holds
const s5=GYM.sets.find(s=>s.tf==='5m')!,s4=GYM.sets.find(s=>s.tf==='4h')!,sd=GYM.sets.find(s=>s.tf==='1d')!
assert.equal(costFor(s5,0),LEARN.costBps);assert.ok(Math.abs(costFor(s4,0)-(LEARN.costBps+0.5))<1e-9,'4h hold pays 0.5bp funding (0.01%/8h)');assert.ok(Math.abs(costFor(sd,3)-(LEARN.costBps+21))<1e-9,'7-day hold pays 21bp funding')
assert.equal(s4.coins.length,40);assert.equal(sd.coins.length,40);assert.equal(s5.coins.length,10)
assert.deepEqual([...s4.horizonsMin],[240,480,1440,2880,10080]);assert.equal(s4.horizonsBars[4]*240,10080)
// enumeration: exhaustive singles over testable features + a fixed sample of pairs, ids carry the timeframe
const singles=Object.entries(FEATURES).filter(([k])=>!(GYM.offlineNA as readonly string[]).includes(k)).reduce((a,[,t])=>a+t.length*2,0)
const g5=enumerateGenomes(),g4=enumerateGenomes('4h'),gd=enumerateGenomes('1d')
assert.equal(g5.length,singles+GYM.pairs);assert.equal(g4.length,g5.length)
assert.ok(g5.every(g=>!g.tf)&&g4.every(g=>g.tf==='4h')&&gd.every(g=>g.tf==='1d'))
assert.ok(genomeId(g4[0]).startsWith('g4_')&&genomeId(gd[0]).startsWith('gd_')&&genomeId(g5[0]).startsWith('g_'),'ids never collide across timeframes')
assert.equal(new Set([...g5,...g4,...gd].map(genomeId)).size,3*g5.length)
assert.deepEqual(enumerateGenomes('4h').map(genomeId),g4.map(genomeId),'deterministic')
// corrected t: overlap and cross-coin deflation both shrink it
const st={n:1000,s:5000,s2:1000*(25+100)}
assert.ok(corrT(st,1,1)>corrT(st,12,1)&&corrT(st,1,1)>corrT(st,1,40))
console.log('Gym: aggregation, costs, three timeframes, deterministic enumeration passed')

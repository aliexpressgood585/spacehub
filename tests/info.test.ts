import assert from 'node:assert/strict'
import {xsRank,xsScore,infoVotes,oiMove,retOver,INFO_IDS,INFO} from '../shared/info.ts'
const syms=Array.from({length:40},(_,i)=>`C${i}`)
// coin i gained i% over every lookback -> C39 strongest, C0 weakest
const daily=Object.fromEntries(syms.map((s,i)=>[s,Array.from({length:30},(_,d)=>100*(1+i/100*(d/29)))]))
const r=xsRank(Object.fromEntries(syms.map((s,i)=>[s,i])))
assert.equal(r.C39,1);assert.equal(r.C32,1);assert.equal(r.C31,0);assert.equal(r.C0,-1);assert.equal(r.C7,-1);assert.equal(r.C8,0)
assert.deepEqual(xsRank({a:1,b:2}),{},'too few names -> no ranks, never a guess')
const sc=xsScore(Object.fromEntries(syms.map((s,i)=>[s,i])));assert.equal(sc.C39,1);assert.equal(sc.C0,-1)
assert.ok(Math.abs(retOver([100,110],1)-0.1)<1e-12);assert.ok(Number.isNaN(retOver([100],5)))
const v=infoVotes(syms,{daily,oi:{C39:{oi:[100,100,100,100,110],px:[1,1,1,1,1.02]},C0:{oi:[100,100,100,100,110],px:[1,1,1,1,0.98]},C5:{oi:[100,100,100,100,101],px:[1,1,1,1,1.05]}},premium:Object.fromEntries(syms.map((s,i)=>[s,i/1e4]))})
assert.equal(v.C39.xmom7,1);assert.equal(v.C39.xmom_ens,1);assert.equal(v.C0.xmom28,-1);assert.equal(v.C20.xmom14,0)
assert.equal(v.C39.oi4h,1,'OI up + price up = long');assert.equal(v.C0.oi4h,-1,'OI up + price down = short');assert.equal(v.C5.oi4h,0,'OI barely moved');assert.equal(v.C10.oi4h,0,'no OI data = abstain')
assert.equal(v.C39.basis,-1,'richest premium is faded');assert.equal(v.C0.basis,1)
assert.ok(syms.every(s=>INFO_IDS.every(id=>[-1,0,1].includes(v[s][id]))))
assert.ok(Number.isNaN(oiMove(undefined).doi));assert.equal(INFO.k,8)
const empty=infoVotes(syms,{daily:{},oi:{},premium:{}});assert.ok(syms.every(s=>INFO_IDS.every(id=>empty[s][id]===0)),'no data -> every info agent abstains')
console.log('Info agents: cross-sectional momentum, open interest and basis passed')

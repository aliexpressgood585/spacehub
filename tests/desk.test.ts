import assert from 'node:assert/strict'
import {attribution,execStats,compliance,debate,hitPct} from '../shared/desk.ts'
import {SCALP} from '../shared/scalp.ts'
const v=(who:string,vote:string)=>({who,vote,says:who,checked_at:''})
const t=(side:string,pnl:number,votes:any[],extra:any={})=>({side,pnl,fee:0.1,opened_at:'2026-09-23T10:00:00Z',closed_at:'2026-09-23T10:06:00Z',scalp_meta:{votes,exit_reason:'STOP',exit_fee:0.1},...extra})
const closed=[t('LONG',5,[v('regime','long'),v('trader','short')]),t('LONG',-3,[v('regime','long'),v('trader','short')]),t('SHORT',2,[v('regime','short'),v('rota','hold')])]
const a=attribution(closed)
assert.deepEqual(a.regime,{n:3,right:2});assert.deepEqual(a.trader,{n:2,right:1});assert.equal(a.rota.n,0)
assert.equal(hitPct(a.regime),67);assert.equal(hitPct(a.rota),null)
assert.equal(attribution([{side:'LONG',pnl:NaN,scalp_meta:{votes:[v('regime','long')]}},{}]).regime.n,0)
const e=execStats(closed);assert.equal(e.n,3);assert.equal(e.wins,2);assert.equal(e.avgHoldMin,6);assert.equal(e.reasons.STOP,3);assert.ok(Math.abs(e.fees-0.6)<1e-9);assert.equal(e.net,4)
const ok={paper_mode:true,lev:1,sym:'BTC'}
assert.deepEqual(compliance([ok],[{sym:'ETH',notional:100}],1000,200),[])
assert.ok(compliance([ok],[{sym:'BTC',notional:100}],1000,200).includes('מטבע כפול'))
assert.ok(compliance([{...ok,lev:2}],[],1000,0).length)
assert.ok(compliance([],[{sym:'ETH',notional:300}],1000,300).some(x=>x.includes('25%')))
assert.deepEqual(compliance([],[{sym:'ETH',notional:250}],1000,250),[])
assert.ok(compliance(Array.from({length:SCALP.maxPositions},(_,i)=>({...ok,sym:'S'+i})),[{sym:'ETH',notional:10}],1000,100).some(x=>x.includes(String(SCALP.maxPositions))))
assert.ok(compliance([],[],1000,995).some(x=>x.includes(`${SCALP.allocation*100}%`)))
const best={sym:'BTC',side:1,score:3,votes:[v('regime','long'),v('rota','long'),v('trader','short'),v('donch','hold'),v('auditor','ok')]}
const a9=attribution([...closed,...closed,...closed])
const d=debate(best,a9,true,[],0)
assert.equal(d.filter(m=>m.round===2&&m.who==='trader').length,1)
assert.ok(d.find(m=>m.who==='quant')!.says.includes('67%'))
assert.equal(d[d.length-1].who,'pm');assert.equal(d[d.length-1].vote,'long')
assert.equal(debate(best,a,false,['x'],0).at(-1)!.vote,'veto')
assert.equal(debate(undefined,a,false,[],0)[0].who,'pm')
assert.ok(debate(best,a,false,[],0,true).at(-1)!.says.includes('כבר מוחזק'))
console.log('Desk: attribution, execution stats, compliance and debate passed')

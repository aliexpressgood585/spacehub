import assert from 'node:assert/strict'
import {rowFrom,rankRows,volScale,rotaConfig} from '../supabase/functions/trading-bot/rota-runner.ts'
import * as S from '../shared/strategy.ts'
const closes=(f:(i:number)=>number,n=180)=>Array.from({length:n},(_,i)=>f(i))
const up=rowFrom('UP',closes(i=>100*(1+0.002*i)),[42,84,168])!,dn=rowFrom('DN',closes(i=>100*(1-0.001*i)),[42,84,168])!
assert.ok(up&&up.mom>0&&dn.mom<0&&up.vol>0,'ensemble momentum sign follows the drift')
assert.equal(rowFrom('SHORT',closes(i=>100+i,100),[42,84,168]),null,'too little history -> no row, never a guess')
const rows:S.RotaRow[]=Array.from({length:40},(_,i)=>rowFrom(`C${i}`,closes(j=>100*Math.exp((i-20)*0.0004*j)),[42,84,168])!)
const t=rankRows(rows,2);assert.equal(t.length,4);assert.deepEqual(t.filter(x=>x.dir===1).map(x=>x.sym).sort(),['C38','C39']);assert.deepEqual(t.filter(x=>x.dir===-1).map(x=>x.sym).sort(),['C0','C1'])
assert.ok(Math.abs(t.filter(x=>x.dir===1).reduce((a,x)=>a+x.weight,0)-1)<1e-9,'inverse-vol weights sum to 1 per side')
assert.equal(rankRows(rows.slice(0,20),2).length,0,'collapsed universe -> no basket (ROTA_K*4 guard)')
const vs=volScale(rows,t,0.5);assert.ok(vs>=0.2&&vs<=1);assert.equal(volScale(rows,t,0),1)
const cfg=rotaConfig();assert.equal(cfg.share,0.5);assert.equal(cfg.k,2);assert.equal(cfg.hours,12);assert.deepEqual(cfg.lbs,[42,84,168]);assert.equal(cfg.volTarget,0.5)
// a slot at share 0.5 and K=2: 25% target, clamped by ROTA_SLOT_MAX (14%) -> basket <= 56% of equity
const slot=S.rotaSlotTarget(1000,0.5,cfg.share/2);assert.ok(slot<=1000*S.ROTA_SLOT_MAX+1e-9&&slot>=1000*S.ROTA_SLOT_MIN)
console.log('ROTA runner: ensemble ranking, guards, vol scale and config passed')

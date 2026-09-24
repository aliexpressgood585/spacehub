import assert from 'node:assert/strict'
import {COST,roundTrip,slipPerSide,profitGate,expectedGross,bookFrom,riskScale,corr,corrScale,type Book} from '../shared/costs.ts'
import {SCALP} from '../shared/scalp.ts'
import {LEARN,refineWeights,type Stat} from '../shared/swarm.ts'
import {readFileSync,readdirSync} from 'node:fs'
// ONE cost model: the engine's fee/slip, the learning round trip and the gate all derive from COST
assert.equal(SCALP.fee,COST.takerFee);assert.equal(SCALP.slip,COST.minSlip)
assert.equal(COST.learnRoundTripBps,Math.round(2*(COST.takerFee+COST.minSlip)*1e4));assert.equal(LEARN.costBps,COST.learnRoundTripBps,'shadow learning charges the model round trip')
// book from a depth snapshot: depth within ±10 bps of mid, in quote currency; PEPE-style scaling k
const bk=bookFrom([['100','5'],['99.95','10'],['99.8','100']],[['100.02','4'],['100.08','6'],['100.5','100']],1,'t')
assert.equal(bk.bid,100);assert.equal(bk.ask,100.02);assert.ok(Math.abs(bk.bidDepth10-(500+999.5))<1e-6,'levels beyond 10 bps excluded');assert.ok(Math.abs(bk.askDepth10-(400.08+600.48))<1e-6)
const pe=bookFrom([['4.0','1000']],[['4.001','1000']],1,'t',1000);assert.ok(Math.abs(pe.bid-0.004)<1e-12&&Math.abs(pe.bidDepth10-4000)<1e-6,'1000PEPE: per-coin price, same USD depth')
// slippage: half spread + impact, floored; thin book -> capped impact
const deep:Book={bid:100,ask:100.01,bidDepth10:5e6,askDepth10:5e6,ts:0,source:'t'},thin:Book={...deep,bidDepth10:1000,askDepth10:1000}
assert.equal(slipPerSide(deep,1000,1).slip,COST.minSlip,'tiny order on a deep, tight book pays the floor');assert.equal(slipPerSide(thin,1e6,1).impact,COST.maxImpact)
assert.ok(Math.abs(slipPerSide({...deep,askDepth10:18115},890,1).impact-0.5*0.001*890/18115)<1e-12&&slipPerSide({...deep,askDepth10:18115},890,1).impact<0.00003,'v86.1: $890 into $18k of ±10bp depth ≈ 0.25 bps, not 50')
assert.ok(slipPerSide({...deep,askDepth10:NaN},1000,1).impact===0.001,'unknown depth -> 10bps inferred, never 0')
// round trip: 10 bps fees + 2 × slip + funding in the direction that pays
const rt=roundTrip(deep,1000,1,480,0.0001);assert.equal(rt.fee_bps,10);assert.ok(Math.abs(rt.funding_bps-1)<1e-9,'8h long at +1bp/8h pays 1bp');assert.ok(Math.abs(rt.total_bps-(10+6+1))<1e-6)
assert.ok(roundTrip(deep,1000,-1,480,0.0001).funding_bps<0,'shorts RECEIVE positive funding');assert.ok(roundTrip(deep,1000,1,480,null).inferred.some(x=>x.includes('funding missing')))
assert.ok(rt.observed.includes('depth ±10bps')&&rt.inferred.some(x=>x.startsWith('impact')),'observed and inferred are labelled apart')
// the gate
assert.equal(profitGate({grossEdgeBps:30,edgeN:500,book:deep,notional:1000,side:1,holdMin:60,funding:0.0001}).pass,true)
assert.equal(profitGate({grossEdgeBps:17,edgeN:500,book:deep,notional:1000,side:1,holdMin:60,funding:0.0001}).reason,'costs_exceed_edge','16.1bp costs + 2bp margin > 17')
assert.equal(profitGate({grossEdgeBps:-3,edgeN:500,book:deep,notional:1000,side:1,holdMin:60,funding:0}).reason,'no_gross_edge')
assert.equal(profitGate({grossEdgeBps:NaN,edgeN:0,book:deep,notional:1000,side:1,holdMin:60,funding:0}).reason,'no_edge_estimate')
assert.equal(profitGate({grossEdgeBps:500,edgeN:500,book:thin,notional:1e6,side:1,holdMin:60,funding:0}).reason,'book_too_thin')
assert.equal(profitGate({grossEdgeBps:50,edgeN:500,book:null,notional:1000,side:1,holdMin:60,funding:0}).reason,'no_book')
// expected gross: weighted net + the learning round trip; unmeasured backers add nothing
assert.deepEqual(expectedGross([{w:2,netBps:4,n:300},{w:1,netBps:-2,n:200},{w:1,netBps:NaN,n:0}]),{bps:+((2*20+1*14)/3).toFixed(2),n:500})
assert.equal(expectedGross([{w:1,netBps:30,n:500,t:0.4}]).bps,+(30*0.2+16).toFixed(2),'t 0.4 -> 20% credit');assert.equal(expectedGross([{w:1,netBps:30,n:500,t:-1}]).bps,16,'no evidence -> breakeven gross');assert.equal(expectedGross([{w:1,netBps:-5,n:500,t:-3}]).bps,11,'negative edges count in full')
assert.equal(profitGate({grossEdgeBps:expectedGross([{w:1,netBps:40,n:500,t:0}]).bps,edgeN:500,book:deep,notional:1000,side:1,holdMin:60,funding:0}).pass,false,'unproven edge never clears the gate')
assert.equal(expectedGross([]).n,0)
// graded risk, never zero on losses; no kill switch
assert.equal(riskScale(1000,1000,1000).mult,1);assert.equal(riskScale(920,1000,1000).mult,0.75*0.5,'8% DD and 8% day');assert.ok(riskScale(300,1000,1000).mult>=0.1,'deep loss -> minimal, not zero')
// correlation: a copy of an open same-side position is scaled down, an opposite-side one is not
const r=Array.from({length:60},(_,i)=>Math.sin(i)*0.001);assert.ok(Math.abs(corr(r,r)-1)<1e-9)
assert.ok(corrScale(r,1,[{ret:r,side:1,weight:0.2}]).mult<1&&corrScale(r,1,[{ret:r,side:-1,weight:0.2}]).mult===1)
// promotion: unique contribution + stability
{const mk=(n:number,m:number,ev=n):Stat=>({agent:'x',n,s:m*n,s2:(m*m+25)*n,ev,updated_at:new Date().toISOString()})
 const st:Record<string,Stat>={'a@60':mk(3000,12),'a@15':mk(3000,5),'b@60':mk(3000,9),'b@15':mk(3000,4),'c@60':mk(3000,10),'c@15':mk(3000,-6),'c@240':mk(3000,-3)}
 const tw={W:{a:2,b:1.5,c:1.8},H:{a:60,b:60,c:60},mode:'proven' as const}
 const votes:Record<string,Record<string,number>>={};for(let i=0;i<10;i++)votes['S'+i]={a:1,b:1,c:i%2?1:-1}
 const r=refineWeights(st,tw,votes)
 assert.equal(r.status.b,'duplicate');assert.equal(r.dupOf.b,'a','the weaker twin loses its vote');assert.equal(r.W.b,0)
 assert.equal(r.status.c,'unstable','60m edge contradicted at 15m and 240m');assert.equal(r.W.c,0);assert.ok(r.W.a>0)}
// ledger: no loss kill switch, graded risk, observed funding, costs stored
{const mig=readdirSync('supabase/migrations').filter(f=>readFileSync(`supabase/migrations/${f}`,'utf8').includes('scalp_commit_cycle')).sort().pop()!,m=readFileSync(`supabase/migrations/${mig}`,'utf8')
 assert.ok(m.includes('paused:=s.hard_halt_at is not null;')&&!m.includes('eq<=pk*0.85'),'no P&L-based pause in the ledger')
 assert.ok(m.includes("eq*0.005*rmult/stop")&&m.includes("'costs',x->'costs'")&&m.includes("x->>'funding_rate'"))
 assert.ok(m.includes('create table if not exists public.trade_decisions')&&m.includes('create table if not exists public.agent_events'))}
console.log('Costs: one model, profit gate, graded risk, correlation, de-dup/stability, ledger migration passed')

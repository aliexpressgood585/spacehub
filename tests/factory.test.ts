import assert from 'node:assert/strict'
import * as F from '../shared/factory.ts'
import {promisingHorizons,FACTORY,FEATURES,FEATURE_LABEL,FEATURE_KEYS,features,vote,spawn,step,genomeId,statKeys,OOS,rng,mutate,gymPicks,genomeText,type FactoryRow} from '../shared/factory.ts'
import {LEARN,hKey,type Stat} from '../shared/swarm.ts'
const now=1_800_000_000_000,iso=(t:number)=>new Date(t).toISOString()
const bars=(f:(i:number)=>number)=>Array.from({length:65},(_,i)=>{const c=f(i),o=f(i-1);return {t:now-(65-i)*60000,o,h:Math.max(o,c)*1.0002,l:Math.min(o,c)*0.9998,c,v:100+(i>60?300:0)}})
const up=bars(i=>100*(1+0.001*i))
const f=features(up,{imbalance:0.3,funding:0.0002,premium:0.0006,xm7:0.9})
assert.ok(f.r5>0.4&&f.r5<0.6,'5-min return in %');assert.equal(f.ob,0.3);assert.ok(Math.abs(f.fr-2)<1e-9);assert.ok(Math.abs(f.bs-6)<1e-9);assert.equal(f.xm7,0.9);assert.ok(Number.isNaN(f.oi),'no OI -> NaN, never 0')
assert.ok(Object.keys(FEATURES).every(k=>k in f),'every feature is computed')
assert.equal(vote({a:['r5',0.4,1]},f),1);assert.equal(vote({a:['r5',0.4,-1]},f),-1,'fade');assert.equal(vote({a:['r5',0.8,1]},f),0,'below threshold')
assert.equal(vote({a:['r5',0.4,1],b:['ob',0.2,1]},f),1,'two agreeing conditions');assert.equal(vote({a:['r5',0.4,1],b:['ob',0.2,-1]},f),0,'disagreeing -> no vote')
assert.equal(vote({a:['oi',1,1]},f),0,'missing data abstains')
assert.equal(genomeId({a:['r5',0.4,1],b:['ob',0.2,-1]}),'g_r50p4f_ob0p2r')
assert.equal(genomeId({a:['r5',0.4,1],tf:'4h'}),'g4h_r50p4f');assert.equal(genomeId({a:['r5',0.4,1],tf:'1d'}),'g1d_r50p4f')
assert.equal(vote({a:['r5',0.4,1],tf:'4h'},{r5:0.5}),1,'tf does not change the vote')
// spawn: deterministic, unique, never re-tests a taken genome
const s1=spawn(50,7,new Set()),s2=spawn(50,7,new Set());assert.deepEqual(s1,s2,'same seed -> same generation')
assert.equal(new Set(s1.map(x=>x.id)).size,50)
const taken=new Set(s1.map(x=>x.id));const s3=spawn(50,7,taken);assert.ok(s3.every(x=>!s1.some(y=>y.id===x.id)),'a taken (incl. retired) genome is never spawned again')
assert.ok(s1.every(x=>x.genome.a[0] in FEATURES&&FEATURES[x.genome.a[0]].includes(x.genome.a[1])&&(!x.genome.b||x.genome.b[0]!==x.genome.a[0])))
const r=rng(1);assert.ok(Array.from({length:100},()=>r()).every(x=>x>=0&&x<1))
// v83.0 evolution: mutants keep the parent's direction, stay inside the feature grid, and half of a generation descends from parents
{const p={a:['r5',0.4,1] as const,b:['ob',0.2,-1] as const};const rr=rng(3)
 for(let i=0;i<200;i++){const m=mutate({a:[...p.a],b:[...p.b]},rr);assert.equal(m.a[2],1,'direction of the first gene never flips');assert.ok(FEATURES[m.a[0]].includes(m.a[1]));if(m.b){assert.ok(FEATURES[m.b[0]].includes(m.b[1]));assert.notEqual(m.b[0],m.a[0])}}
 const kids=spawn(20,11,new Set(),[{a:[...p.a],b:[...p.b]}]);assert.ok(kids.filter(k=>k.parent).length>=10,'at least half descend from the parent');assert.ok(kids.every(k=>!k.parent||k.genome.a[0]==='r5'||k.genome.b?.[0]==='ob'||k.genome.a[0]==='r5'),'children share genes with the parent')
 assert.equal(new Set(kids.map(k=>k.id)).size,20)}
// lifecycle
const st=(n:number,mean:number,sd=10):Stat=>({agent:'x',n,s:mean*n,s2:(mean*mean+sd*sd)*n,ev:n,updated_at:iso(now)})
const row=(stage:FactoryRow['stage'],h:number|null=null,ageH=1):FactoryRow=>({id:'g_t',genome:{a:['r5',0.4,1]},stage,born:iso(now-ageH*3600e3),stage_at:iso(now-ageH*3600e3),h})
assert.equal(step(row('trial'),{},now),null,'no evidence yet -> keep waiting')
assert.equal(step(row('trial',null,FACTORY.trialMaxH+1),{},now)!.stage,'retired','trial timeout')
const pr=step(row('trial'),{[hKey('g_t',60)]:st(400,6)},now)!;assert.equal(pr.stage,'oos');assert.equal(pr.h,60,'promoted on its best horizon')
assert.equal(step(row('trial'),{g_t:st(400,-3)},now)!.stage,'retired','negative in trial')
// v90.0: never retired while a slower horizon is still immature but positive; the hard cap still applies
{const mixed={g_t:st(400,-3),[hKey('g_t',15)]:{...st(120,40,20),ev:120}}
 assert.deepEqual(promisingHorizons(mixed,'g_t'),[15])
 assert.equal(step(row('trial'),mixed,now),null,'5m negative but 15m immature and positive -> keep testing')
 assert.equal(step(row('trial',null,FACTORY.trialMaxH+1),mixed,now),null,'the 12h clock waits for the promising horizon')
 assert.equal(step(row('trial',null,FACTORY.trialHardMaxH+1),mixed,now)!.stage,'retired','hard cap')
 assert.equal(step(row('trial'),{g_t:st(400,-3),[hKey('g_t',15)]:{...st(120,-40,20),ev:120}},now)!.stage,'retired','immature but negative does not save it')
 assert.equal(step(row('trial'),{g_t:st(400,-3),[hKey('g_t',15)]:{...st(10,40,20),ev:10}},now)!.stage,'retired','too few samples to count as promising')}
assert.equal(step(row('trial'),{g_t:st(400,0.2)},now),null,'weak but positive -> keep testing')
assert.equal(step(row('trial'),{g_t:st(400,-0.3)},now),null,'v83.1: slightly negative is not yet a verdict')
assert.equal(step(row('trial'),{g_t:{...st(400,-3),ev:30}},now),null,'v83.1: 400 coin-votes in 30 snapshots is not an hour of evidence')
assert.equal(step(row('oos',60),{[hKey(OOS('g_t'),60)]:{...st(300,15),ev:50}},now),null,'v83.1: oos needs two hours of snapshots')
// OOS judged ONLY on the alias at the fixed horizon; trial evidence does not count
assert.equal(step(row('oos',60),{[hKey('g_t',60)]:st(5000,20)},now),null,'great trial stats alone never make it live')
assert.equal(step(row('oos',60),{[hKey(OOS('g_t'),60)]:st(300,15)},now)!.stage,'live')
assert.equal(step(row('oos',60),{[hKey(OOS('g_t'),60)]:st(300,-2)},now)!.stage,'retired')
assert.equal(step(row('oos',60,FACTORY.oosMaxH+1),{},now)!.stage,'retired','oos timeout')
assert.equal(step(row('live',60),{[hKey(OOS('g_t'),60)]:st(300,1)},now)!.stage,'retired','live agent that fades is dropped')
assert.equal(step(row('live',60),{[hKey(OOS('g_t'),60)]:st(300,15)},now),null,'live and still good -> stays')
assert.equal(statKeys('g_t').length,LEARN.horizonsMin.length*2)
assert.ok(FACTORY.liveT>=LEARN.provenT,'live bar is at least the proven bar')
// v85.0 gym seeding: passers ahead of random spawns, best held-out t first, retired ids never re-enter, slots respected
{const P=[{id:'g_a',genome:{a:['r5',0.4,1] as [string,number,1|-1]},h:60,oos_t:2.1,is:[1,2,3,4]},{id:'g_b',genome:{a:['r5',0.8,1] as [string,number,1|-1]},h:15,oos_t:3.4,is:[1,1,1,1]},{id:'g_c',genome:{a:['z20',2,-1] as [string,number,1|-1]},h:240,oos_t:2.6,is:[2,2,2,2]}]
 const picks=gymPicks(P,new Set(['g_c']),5);assert.deepEqual(picks.map(p=>p.id),['g_b','g_a'],'retired/taken excluded, best OOS t first')
 assert.ok(picks[0].note.startsWith('gym: 4/4 windows, oos t=3.4 @15m'),picks[0].note)
 assert.equal(gymPicks(P,new Set(),1).length,1,'slots respected');assert.equal(gymPicks(P,new Set(),0).length,0)
 assert.ok(FEATURE_KEYS.every(k=>FEATURE_LABEL[k]),'every feature has a Hebrew label');assert.ok(genomeText({a:['rsi14',0.4,-1],b:['vr',1,1]}).includes('וגם'))}
// v91.0: slow-bar genomes get clocks scaled to their bars; evidence bars unchanged
{ const g2: any = { a: ['vr', 2, 1], b: ['dd30', 1, -1], tf: '2h', when: { d: [1, 2, 3, 4, 5] } }
  assert.equal(F.clockMult(g2), 8); assert.equal(F.clockMult({ a: ['r5', 0.3, 1] } as any), 1); assert.equal(F.clockMult({ a: ['r5', 0.3, 1], tf: '1w' } as any), 28)
  const born = '2026-09-24T17:49:00Z', row: any = { id: 'g2h_x', genome: g2, stage: 'trial', born, stage_at: born, h: null }
  assert.equal(F.step(row, {}, Date.parse(born) + 13 * 3600_000), null, 'a 2h genome is not timed out at 12h')
  assert.equal(F.step(row, {}, Date.parse(born) + 97 * 3600_000)?.note, 'trial timeout', '... but is at 8 x 12h')
  const r1: any = { ...row, genome: { a: ['r5', 0.3, 1] } }
  assert.equal(F.step(r1, {}, Date.parse(born) + 13 * 3600_000)?.note, 'trial timeout', '1-minute genomes keep the 12h clock') }
console.log('Agent factory: features, genomes, deterministic spawn, no re-test, trial -> oos -> live lifecycle, gym seeding passed')

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as F from '../shared/rsi2-forward.ts'

const bar = (t: number, o=100, h=101, l=99, c=100, v=100): F.Bar => ({t,end:t+300000,o,h,l,c,v})
const contract = {symbols:[{symbol:'MYXUSDT',status:'TRADING',quoteAsset:'USDT',marginAsset:'USDT',contractType:'PERPETUAL'}]}
assert(F.verified(contract,'MYXUSDT'))
assert(!F.verified(contract,'TRADOORUSDT'))
assert(!F.verified({symbols:[{...contract.symbols[0],symbol:'1000MYXUSDT'}]},'MYXUSDT'))
assert(!F.verified({symbols:[{...contract.symbols[0],status:'SETTLING'}]},'MYXUSDT'))
const p=F.enter(1,1,300000,bar(300000))
assert.equal(F.exit(p,bar(300000,100,102,97),true)?.reason,'STOP_SIMULATED')
const q=F.enter(-1,1,300000,bar(300000))
assert.equal(F.exit(q,bar(300000,100,103,98),true)?.reason,'STOP_SIMULATED')
const gap=F.enter(1,1,300000,bar(300000))
assert.equal(F.exit(gap,bar(300000,96,100,95),true)?.px,96)
const timeout=F.enter(1,10,0,bar(0));
for(let i=0;i<32;i++) assert.equal(F.exit(timeout,bar(i*300000),true),null)
assert.equal(F.exit(timeout,bar(32*300000,103),false)?.px,103)
const live=F.enter(1,1,0,bar(0))
assert.equal(F.exit(live,bar(0,100,1000,1),false),null,'forming high/low ignored')
const r=F.result(F.enter(1,1,0,bar(0)),{px:100.1,ts:300000,reason:'TARGET_SIMULATED'},[])
assert(r.net<0 && r.stressNet<r.net,'gross target can lose after fees')
const fund=F.result(F.enter(-1,1,0,bar(0)),{px:100,ts:900000,reason:'TIMEOUT_SIMULATED'},[{t:600000,rate:.001,mark:110}])
assert(Math.abs(fund.fundingCost+.0011)<1e-12,'short receives mark-notional funding')
assert(F.result(live,{px:100,ts:300000,reason:'STOP_SIMULATED'},null).fundingMissing)
const s=F.stats(); for(let i=0;i<100;i++) F.add(s,i<61?.01:-.002,.0012,false)
assert(F.passes(s)); assert.equal(F.metrics(s).netWinRate,.61)
assert.equal(F.qualification(null,s,s),'INSUFFICIENT_DATA','missing training cannot qualify')
const low=F.stats(); for(let i=0;i<100;i++) F.add(low,i<60?.01:-.002,.0016,false)
assert.equal(F.qualification({base:s,stress:s},s,low),'NOT_QUALIFIED','stress failure blocks')
assert.equal(F.qualification({base:s,stress:s},s,s),'QUALIFIED')
const five=F.indicators(),fifteen=F.indicators()
Object.assign(five,{count:200,last:bar(600000,105,106,103,105),ema200:100,rsi:5,atr:1,adx:24,volumes:Array(20).fill(100)})
Object.assign(fifteen,{count:200,last:{...bar(0,105,106,103,105),end:900000},ema200:100,ema50:102})
assert.equal(F.signal('TRADOORUSDT',five,fifteen),1)
five.adx=25; assert.equal(F.signal('TRADOORUSDT',five,fifteen),0)
assert.equal(F.signal('MYXUSDT',five,fifteen),1)
five.last!.v=99; assert.equal(F.signal('MYXUSDT',five,fifteen),0)
fifteen.last!.end=1800000; assert.equal(F.signal('TRADOORUSDT',five,fifteen),0,'future 15m ignored')
const ind=F.indicators(); for(let i=0;i<220;i++) F.update(ind,bar(i*300000,100+i,102+i,99+i,101+i))
assert.equal(ind.rsi,100); assert.equal(ind.adx,100)
const before=structuredClone(ind); F.update(ind,bar(220*300000,320,322,319,321));
assert(ind.ema200!>before.ema200! && ind.atr===before.atr,'streaming state advances without reseeding')
const state=F.initial();state.five=structuredClone(five);state.fifteen=structuredClone(fifteen)
state.five.last=bar(600000);state.fifteen.last={...bar(0),end:900000};state.lastProcessed=600000
state.pending={side:1,atr:1,signalTs:900000}
assert.equal(F.advance('MYXUSDT',state,[bar(900000,100,1000,1)],[],910000,900000,[]).length,0)
assert.equal(state.position?.entry,100); assert.equal(state.position?.bars,0)
assert.equal(state.five.last?.end,900000,'forming candle does not update indicators')
// Chunked forward processing must be identical to a single chronological pass.
const tape:F.Bar[]=[]; let price=100
for(let i=0;i<900;i++) {const o=price;price+=i%37===35||i%37===36?-.45:.04;tape.push(bar(i*300000,o,Math.max(o,price)+.1,Math.min(o,price)-.1,price,100))}
const trend:F.Bar[]=[]
for(let i=0;i<tape.length;i+=3) {const a=tape.slice(i,i+3);trend.push({t:a[0].t,end:a[2].end,o:a[0].o,h:Math.max(...a.map(x=>x.h)),l:Math.min(...a.map(x=>x.l)),c:a[2].c,v:300})}
const whole=F.initial(),chunks=F.initial()
const complete=F.advance('MYXUSDT',whole,tape,trend,900*300000,600*300000,[])
let from=0;const split:ReturnType<typeof F.result>[]=[]
for(const to of [700,775,900]) {split.push(...F.advance('MYXUSDT',chunks,tape.slice(from,to),trend,to*300000,600*300000,[]));from=to}
assert(complete.length>0,'synthetic fixture actually exercises entries and exits')
assert.deepEqual(split,complete,'checkpoint segmentation cannot change outcomes')
assert.deepEqual(chunks,whole,'persistent indicator/position state matches chronological pass')
const edge=readFileSync('supabase/functions/rsi2-forward/index.ts','utf8')
assert(!/bot_trades|bot_state|commit_cycle|\/order|\/leverage|X-MBX-APIKEY/.test(edge),'no trading API/ledger access')
assert(/method: 'GET'/.test(edge) && /PUBLIC_PATHS.has/.test(edge),'market GET allowlist')
console.log('rsi2 frozen forward: contract, cost, stress, funding, closed-bar, timeout and safety checks passed')

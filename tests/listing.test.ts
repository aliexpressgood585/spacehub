import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {LIST,freshListings,listExit} from '../shared/listing.ts'
// v99.0 LIST — short fresh perp listings (NOT validated; owner override)
assert.equal(LIST.minAgeDays,3);assert.equal(LIST.maxAgeDays,30);assert.equal(LIST.stop,0.2);assert.equal(LIST.target,0.3);assert.equal(LIST.maxOpen,10)
const D=86_400_000,now=Date.UTC(2026,9,1)
const info={symbols:[{symbol:'NEWUSDT',onboardDate:now-5*D},{symbol:'OLDUSDT',onboardDate:now-200*D},{symbol:'BABYUSDT',onboardDate:now-1*D},
  {symbol:'MIDUSDT',onboardDate:now-20*D},{symbol:'DONEUSDT',onboardDate:now-10*D},{symbol:'NODATEUSDT'}]}
const p=(sym:string)=>({sym,s:`${sym}USDT`,k:1,qv:3e7,spreadBps:2})
const f=freshListings(['NEW','OLD','BABY','MID','DONE','NODATE'].map(p),info,now,new Set(['DONE']))
assert.deepEqual(f.map(x=>x.sym),['NEW','MID'],'3-30 days old, not already traded, youngest first')
assert.equal(f[0].ageDays,5)
// exits on a short: ask +20% = STOP, ask -30% = TARGET, 21 days = TIMEOUT
assert.equal(listExit(100,120.1,0,1000),'STOP');assert.equal(listExit(100,69.9,0,1000),'TARGET');assert.equal(listExit(100,95,0,1000),null)
assert.equal(listExit(100,95,0,LIST.timeoutMs),'TIMEOUT');assert.equal(listExit(100,NaN,0,1000),null)
// ledger + runner wiring
const sql=readFileSync('supabase/migrations/20261001090000_list_sleeve.sql','utf8')
assert.ok(sql.includes('cnt>=10')&&sql.includes('eq*0.11')&&sql.includes("strategy='LIST'")&&sql.includes('not s.paper_mode'),'ledger: <=10 open, <=11%/trade, paper only')
assert.ok(sql.includes("x->>'side'<>'SHORT'")&&sql.includes('px*1.20')&&sql.includes('px*0.70'),'ledger: short only, +20% / -30% levels')
assert.ok(sql.includes("exists(select 1 from bot_trades where strategy='LIST' and sym=x->>'sym')"),'ledger: one short per coin ever')
const runner=readFileSync('supabase/functions/trading-bot/list-runner.ts','utf8')
assert.ok(runner.includes("if(!paper)throw new Error('LIST is paper-only"),'runner refuses live execution')
assert.ok(runner.includes("['LIST','FUND','FAST','EVT','BRKV'].includes(t.strategy)"),'runner refuses any other sleeve in the book')
const idx=readFileSync('supabase/functions/trading-bot/index.ts','utf8')
assert.ok(idx.includes("runList(supabase, st2, runLeaseUntil, paperMode && !liveMode)"),'index passes paper to LIST')
// v99.2 FUND = H6a exactly
import {H6A,FUND,fundEntries,fundingPaid} from '../shared/fundcap.ts'
assert.equal(H6A.minAbsRate,0.001);assert.equal(H6A.enterBeforeMs,3_600_000);assert.equal(H6A.exitAfterMs,900_000)
assert.equal(FUND.perTrade,0.25);assert.equal(FUND.maxOpen,8)
const T=Date.UTC(2026,9,1,16),nowF=T-58*60_000
const prem=[{symbol:'AUSDT',markPrice:1,lastFundingRate:0.002,nextFundingTime:T},{symbol:'BUSDT',markPrice:2,lastFundingRate:-0.004,nextFundingTime:T},
  {symbol:'CUSDT',markPrice:3,lastFundingRate:0.0005,nextFundingTime:T},{symbol:'DUSDT',markPrice:4,lastFundingRate:0.01,nextFundingTime:T}]
const fe=fundEntries(prem as any,new Set(['AUSDT','BUSDT','CUSDT']),nowF,new Set())
assert.deepEqual(fe.map(r=>[r.symbol,r.side]),[['BUSDT',1],['AUSDT',-1]],'|rate|>=0.10%, receiving side, strongest first, universe only')
assert.equal(fundEntries(prem as any,new Set(['AUSDT']),T-50*60_000,new Set()).length,0,'outside the 5-minute entry window')
assert.equal(fundingPaid(-1,0.002,1000),-2,'a short receives a positive rate');assert.equal(fundingPaid(1,0.002,1000),2)
const fsql=readFileSync('supabase/migrations/20261001110000_fund_sleeve.sql','utf8')
assert.ok(fsql.includes('cnt>=8')&&fsql.includes('eq*0.25')&&fsql.includes("strategy='FUND'")&&fsql.includes('not s.paper_mode')&&fsql.includes('implausible funding'),'fund ledger caps')
const frun=readFileSync('supabase/functions/trading-bot/fund-runner.ts','utf8')
assert.ok(frun.includes("if(!paper)throw new Error('FUND is paper-only"),'fund runner refuses live')
assert.ok(idx.includes("runFund(supabase, st2, runLeaseUntil, paperMode && !liveMode)"),'index passes paper to FUND')
console.log('listing + fund: ok')

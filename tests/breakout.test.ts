import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {BRKV,brkvSignal,brkvExit,lastClose4h,type Bar4} from '../shared/breakout.ts'
// v93.0 BRKV — the owner's rule exactly as v107bt measured it
assert.equal(BRKV.N,20);assert.equal(BRKV.volMult,3);assert.equal(BRKV.target,0.07);assert.equal(BRKV.stop,0.04);assert.equal(BRKV.maxOpen,10)
const H=4*3600000
const flat=(n:number):Bar4[]=>Array.from({length:n},(_,i)=>({t:i*H,high:101,low:99,close:100,vol:10}))
const up=[...flat(20),{t:20*H,high:103,low:100,close:102.5,vol:31}]
assert.equal(brkvSignal(up),1,'close above the 20-bar high on 3.1x volume = LONG')
assert.equal(brkvSignal([...flat(20),{t:20*H,high:103,low:100,close:102.5,vol:29}]),0,'2.9x volume is not enough')
assert.equal(brkvSignal([...flat(20),{t:20*H,high:103,low:100,close:100.9,vol:50}]),0,'close inside the range = nothing (a wick is not a breakout)')
assert.equal(brkvSignal([...flat(20),{t:20*H,high:100,low:97,close:98.5,vol:40}]),-1,'close below the 20-bar low on volume = SHORT')
assert.equal(brkvSignal(flat(20)),0,'fewer than N+1 bars = nothing')
assert.equal(brkvSignal([...flat(25),{t:25*H,high:103,low:100,close:102.5,vol:31}]),1,'only the last N bars form the range')
// exits: stop -4%, target +7%, 14-day timeout, both sides
assert.equal(brkvExit(1,100,95.9,0,1000),'STOP');assert.equal(brkvExit(1,100,107.1,0,1000),'TARGET');assert.equal(brkvExit(1,100,103,0,1000),null)
assert.equal(brkvExit(-1,100,104.1,0,1000),'STOP');assert.equal(brkvExit(-1,100,92.9,0,1000),'TARGET');assert.equal(brkvExit(-1,100,97,0,1000),null)
assert.equal(brkvExit(1,100,101,0,BRKV.timeoutMs),'TIMEOUT');assert.equal(brkvExit(1,100,NaN,0,1000),null)
assert.equal(lastClose4h(Date.UTC(2026,8,25,15,7)),Date.UTC(2026,8,25,12,0))
// ledger + runner wiring: paper-only, BRKV is foreign to SCALP, the SQL caps match the constants
const sql=readFileSync('supabase/migrations/20260925150000_brkv_sleeve.sql','utf8')
assert.ok(sql.includes("cnt>=10")&&sql.includes('eq*0.1')&&sql.includes("strategy='BRKV'")&&sql.includes('not s.paper_mode'),'ledger: <=10 open, <=10%/trade, paper only')
assert.ok(sql.includes('px*0.96')&&sql.includes('px*1.07')&&sql.includes('px*0.93'),'ledger stores the -4% / +7% levels')
const runner=readFileSync('supabase/functions/trading-bot/brkv-runner.ts','utf8')
assert.ok(runner.includes("if(!paper)throw new Error('BRKV is paper-only"),'runner refuses live execution')
const sr=readFileSync('supabase/functions/trading-bot/scalp-runner.ts','utf8')
assert.ok(sr.includes("t.strategy==='ROTA'||t.strategy==='BRKV'")&&sr.includes("['SCALP','ROTA','BRKV','LAB']"),'SCALP never closes BRKV rows')
const idx=readFileSync('supabase/functions/trading-bot/index.ts','utf8')
assert.ok(idx.includes("if (BRKV_ENABLED) {")&&idx.includes("runBrkv(supabase, scalpState, runLeaseUntil, paperMode && !liveMode)"),'index gates BRKV on the shim and passes paper')
assert.ok(runner.includes("if(cfg.side==='short'&&f.dir>0)continue")&&runner.includes("__BRKV_SIDE??'short'"),'default BRKV is short-only')
console.log('breakout (BRKV) tests passed')

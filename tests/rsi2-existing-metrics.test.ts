import assert from 'node:assert/strict'
import { tradeMetrics, closeValue } from '../trading-app/src/tradeMetrics.ts'
const t={side:'LONG',strategy:'RSI2_FORWARD_PAPER',entry_price:100,size:50,lev:20,status:'OPEN',fee:3,trail_sl:98,
  opened_at:'2026-10-08T06:30:00Z',scalp_meta:{target_px:101,funding_cost:2}}
const m=tradeMetrics(t,100)
assert.equal(m.notional,5000);assert.equal(m.margin,250);assert(Math.abs(m.costs-8)<1e-10);assert(Math.abs(m.net+8)<1e-10)
assert.equal(closeValue(t,100),245,'cash plus close value includes entry cost only once')
assert.equal(tradeMetrics({...t,status:'CLOSED',exit_price:101,pnl:44},101).net,44)
console.log('existing RSI2 account display: exact notional, margin, cost and settlement checks passed')

import assert from 'node:assert/strict'
import { rsi2FeeBreakdown } from '../trading-app/src/rsi2Fees.ts'
import { closeValue } from '../trading-app/src/tradeMetrics.ts'

// Frozen PAPER: 250 margin ×20 = 5000 notional, 5 bps taker + 1 bp slip per side.
const row = {
  strategy: 'RSI2_FORWARD_PAPER', side: 'LONG', entry_price: 100, size: 50, lev: 20,
  status: 'OPEN', fee: 3, trail_sl: 98, opened_at: '2026-10-08T06:30:00Z',
  scalp_meta: { target_px: 101, entry_taker_fee: 2.5, exit_taker_fee: 2.5,
    entry_slippage_cost: 0.5, exit_slippage_cost: 0.5, funding_cost: 2 },
}
const open = rsi2FeeBreakdown(row, 100)
assert.equal(open.margin, 250)
assert.equal(open.commissions, 5)
assert.equal(open.slippage, 1)
assert.equal(open.funding, 2)
assert.equal(open.totalCosts, 8)
assert.equal(open.gross, 0)
assert.equal(open.net, -8, 'open PnL deducts round-trip commissions, slips, and funding')
assert.equal(open.reconciliation, 0)
assert.equal(closeValue(row, 100), 245, 'fees already removed from cash are not double-counted')
const closed = rsi2FeeBreakdown({ ...row, status: 'CLOSED', exit_price: 101, pnl: 42 }, 101)
assert.equal(closed.gross, 50)
assert.equal(closed.net, 42, 'closed PnL must use the booked PAPER ledger, not live quotes')
assert.equal(closed.totalCosts, 8)
assert.equal(closed.reconciliation, 0)
const short = rsi2FeeBreakdown({ ...row, side: 'SHORT', scalp_meta: { ...row.scalp_meta, funding_cost: -1 } }, 99)
assert.equal(short.gross, 50)
assert.equal(short.net, 45)
assert.equal(short.totalCosts, 5)
console.log('RSI2 fee transparency checks passed: open/closed gross, taker, slippage, funding, booked net and no double-counting')

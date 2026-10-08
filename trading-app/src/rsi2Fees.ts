import { tradeMetrics, type TradeRow } from './tradeMetrics'

// Exact cost categories for the frozen RSI2 20x PAPER accounting model.
// Binance-specific *market* data is real, but these rates are simulated, not
// the account-specific Binance commission or a guaranteed executable fill.
export function rsi2FeeBreakdown(trade: TradeRow, mark: number) {
  const m = tradeMetrics(trade, mark)
  const meta = trade.scalp_meta ?? {}
  const valid = (v: unknown, fallback: number) => v == null || !Number.isFinite(Number(v)) ? fallback : Number(v)
  const entryCommission = valid(meta.entry_taker_fee, m.notional * 0.0005)
  const exitCommission = valid(meta.exit_taker_fee, m.notional * 0.0005)
  const entrySlippage = valid(meta.entry_slippage_cost, m.notional * 0.0001)
  const exitSlippage = valid(meta.exit_slippage_cost, m.notional * 0.0001)
  // Positive funding is paid; negative funding is received.
  const funding = valid(meta.funding_cost, 0)
  const commissions = entryCommission + exitCommission
  const slippage = entrySlippage + exitSlippage
  const modeledTotal = commissions + slippage + funding
  // Closed trade uses the booked net P&L as the source of truth. This field
  // reconciles any differences from the display categories, without concealing them.
  const reconciliation = m.costs - modeledTotal
  return { ...m, entryCommission, exitCommission, entrySlippage, exitSlippage,
    commissions, slippage, funding, modeledTotal, reconciliation, totalCosts: m.costs }
}

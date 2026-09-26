// v95.6 — ONE definition of a position's numbers, used by the house cards AND the trade page, so the two can never
// disagree again (they did: the card showed P&L / notional, the page P&L / margin — a 50x gap at 50x leverage).
//  - movePct: the price move in the trade's favour, relative to the ENTRY (not the margin, not the mark)
//  - stopPct / targetPct: where the levels sit relative to the entry (negative = against the trade)
//  - R: in units of the INITIAL risk (entry to the stop set at entry, scalp_meta.fast.r when stored). A trailing stop
//    moves the stop, never the R unit.
//  - grossR: the price move alone. netR / net$: after the entry fee, the exit fee and the modelled exit slippage (for an
//    open trade, both INFERRED: 5 bps fee + 5 bps slip on the exit notional) and the funding model; for a closed trade
//    the ledger's own pnl (fees, fills and funding as booked).
//  - marginPct: net$ relative to the margin posted (the leveraged number, labelled as such).
export type TradeRow = Record<string, any>
export const EXIT_FEE = 0.0005, EXIT_SLIP_EST = 0.0005, FUNDING_8H = 0.0001
export interface TradeMetrics {
  dir: 1 | -1; entry: number; mark: number; size: number; notional: number; lev: number; margin: number
  r: number; stop: number; target: number
  movePct: number; stopPct: number; targetPct: number
  gross: number; grossR: number; costs: number; net: number; netR: number; marginPct: number; netIsEstimate: boolean
}
const n = (x: unknown) => (x === null || x === undefined || x === '' ? NaN : Number(x))
export function tradeMetrics(t: TradeRow, markIn: number, now = Date.now()): TradeMetrics {
  const dir: 1 | -1 = t.side === 'LONG' ? 1 : -1, entry = n(t.entry_price), size = n(t.size), lev = Math.max(1, n(t.lev) || 1)
  const f = t.scalp_meta?.fast ?? t.scalp_meta?.lab ?? {}, open = t.status === 'OPEN'
  const mark = open ? markIn : n(t.exit_price), notional = entry * size, margin = notional / lev
  const stop = n(f.stop ?? t.trail_sl), target = f.trail ? NaN : n(f.target ?? t.scalp_meta?.target_px)
  // initial risk: stored r, else the risk booked at entry (risk_usd / size), else the distance to the current stop
  const r0 = n(f.r) > 0 ? n(f.r) : n(t.risk_usd) > 0 && size > 0 ? n(t.risk_usd) / size : Math.abs(entry - stop)
  const r = r0 > 0 ? r0 : NaN
  const gross = dir * (mark - entry) * size
  let net: number, costs: number
  if (open) {
    const hours = Math.max(0, now - Date.parse(t.opened_at)) / 3600_000
    costs = n(t.fee || 0) + mark * size * (EXIT_FEE + EXIT_SLIP_EST) + dir * notional * FUNDING_8H * hours / 8
    net = gross - costs
  } else { net = n(t.pnl); costs = gross - net }
  const rel = (x: number) => (Number.isFinite(x) && entry > 0 ? dir * (x - entry) / entry : NaN)
  return { dir, entry, mark, size, notional, lev, margin, r, stop, target,
    movePct: rel(mark), stopPct: rel(stop), targetPct: rel(target),
    gross, grossR: gross / (r * size), costs, net, netR: net / (r * size), marginPct: net / margin, netIsEstimate: open }
}
export const fmtR = (x: number) => (Number.isFinite(x) ? `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(2)}R` : '—')
export const fmtPctSigned = (x: number, d = 2) => (Number.isFinite(x) ? `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(d)}%` : '—')

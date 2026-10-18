import {
  buildActivity, contractSymbol, deskPulse, liveSymbols, nextDeskRun, strategyRows, LATE_MS, STALL_MS,
} from './model.ts'

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg)
}

const hour = Date.UTC(2026, 9, 18, 12, 0, 0, 0)
assert(nextDeskRun(hour) === hour + 3 * 60_000, '12:00 -> 12:03')
assert(nextDeskRun(hour + 3 * 60_000) === hour + 3 * 60_000, 'exactly 12:03 stays')
assert(nextDeskRun(hour + 3 * 60_000 + 1) === hour + 18 * 60_000, 'just after 12:03 -> 12:18')
assert(nextDeskRun(hour + 48 * 60_000 + 500) === hour + 3_600_000 + 3 * 60_000, 'after 12:48 -> 13:03')

assert(deskPulse(null, hour) === 'unknown', 'missing pulse')
assert(deskPulse(hour - LATE_MS + 1000, hour) === 'live', 'fresh')
assert(deskPulse(hour - LATE_MS - 1, hour) === 'late', 'late')
assert(deskPulse(hour - STALL_MS - 1, hour) === 'stalled', 'stalled')

const fromUniverse = liveSymbols({
  universe: ['BTC', { symbol: 'ethusdt' }, '1000PEPEUSDT'],
  prices: { SOLUSDT: {}, XRPUSDT: {} },
  positions: [{ symbol: 'SOLUSDT' }],
})
assert(fromUniverse.join() === 'BTCUSDT,ETHUSDT,1000PEPEUSDT,SOLUSDT', 'universe wins, open position added: ' + fromUniverse.join())

const fromPrices = liveSymbols({ prices: { BTCUSDT: {}, ETHUSDT: {} }, positions: [{ symbol: 'BNBUSDT' }, { symbol: 'BTC' }] })
assert(fromPrices.join() === 'BTCUSDT,ETHUSDT,BNBUSDT', 'prices plus open, deduped: ' + fromPrices.join())

const act = buildActivity({
  events: [
    { ts: 1000, type: 'OPEN', symbol: 'BTCUSDT', msg: 'buy' },
    { ts: 5000, type: 'STOP_LOSS', symbol: 'BTCUSDT', msg: 'stopped' },
    { ts: 9000, type: 'FUNDING', symbol: 'ETHUSDT', msg: 'funding', amount: 1.25 },
  ],
  trades: [
    { symbol: 'BTCUSDT', side: 'LONG', open_ts: 1000, close_ts: 5000, net_pnl: -4.5, reason: 'STOP_LOSS' },
    { symbol: 'XRPUSDT', side: 'SHORT', open_ts: 2000, close_ts: 8000, net_pnl: 3, reason: 'TAKE_PROFIT' },
  ],
})
assert(act[0].type === 'FUNDING' && act[0].pnl === 1.25, 'funding newest with amount')
assert(act.some((e) => e.type === 'STOP_LOSS' && e.pnl === -4.5), 'stop inherits trade pnl')
assert(act.some((e) => e.type === 'TAKE_PROFIT' && e.symbol === 'XRPUSDT' && e.pnl === 3), 'close synthesized when event missing')

const rows = strategyRows({ strategy: { name: 'trend_ema', timeframe: '4h', params: { leverage: 3, exit_on_opposite_cross: false, custom_gate: 'x' } } })
assert(rows.timeframe === '4h' && rows.rows.some((r) => r.label === 'מינוף' && r.v === '3'), 'known param translated')
assert(rows.rows.some((r) => r.k === 'custom_gate' && r.label === 'custom_gate'), 'unknown param kept')
assert(contractSymbol('sol') === 'SOLUSDT', 'bare coin')

console.log('model.spec ok', act.length)

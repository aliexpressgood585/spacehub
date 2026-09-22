// Reproducible cost audit of the incumbent, not a strategy optimisation.
// node --experimental-strip-types backtest/validation-audit.ts
// Input: backtest/data/<symbol>-1h.csv from the monthly Binance archive.
import { readFileSync } from 'node:fs'
import * as S from '../shared/strategy.ts'
import * as P from './portfolio.ts'

const H1 = 3_600_000, H4 = 4 * H1
const data: Record<string, P.CoinData> = {}
let tmin = Infinity, tmax = -Infinity
for (const sym of S.CRYPTO_40) {
  let csv: string
  try { csv = readFileSync(`backtest/data/${sym}-1h.csv`, 'utf8') }
  catch { continue }
  const b1: S.Bar[] = []
  for (const line of csv.split('\n')) {
    if (!/^\d/.test(line)) continue
    const f = line.split(',').map(Number)
    const t = f[0] > 1e14 ? Math.floor(f[0] / 1000) : f[0]
    const bar = { t, open: f[1], high: f[2], low: f[3], close: f[4], vol: f[5] }
    if (!Object.values(bar).every(Number.isFinite) || bar.low <= 0 || bar.vol < 0 ||
      bar.high < Math.max(bar.open, bar.close) || bar.low > Math.min(bar.open, bar.close)) {
      throw new Error(`Invalid ${sym} bar at ${t}`)
    }
    b1.push(bar)
  }
  b1.sort((a, b) => a.t - b.t)
  if (b1.length < 500) continue
  for (let i = 1; i < b1.length; i++) {
    if (b1[i].t <= b1[i - 1].t) throw new Error(`Duplicate ${sym} timestamp`)
  }
  const b4: S.Bar[] = []
  let incomplete = 0
  for (let i = 0; i < b1.length;) {
    const bucket = Math.floor(b1[i].t / H4) * H4
    const group: S.Bar[] = []
    while (i < b1.length && Math.floor(b1[i].t / H4) * H4 === bucket) group.push(b1[i++])
    if (group.length !== 4 || !group.every((b, j) => b.t === bucket + j * H1)) {
      incomplete++; continue
    }
    b4.push({ t: bucket, open: group[0].open, close: group[3].close,
      high: Math.max(...group.map(b => b.high)), low: Math.min(...group.map(b => b.low)),
      vol: group.reduce((sum, b) => sum + b.vol, 0) })
  }
  console.log(`${sym}: ${b1.length} hourly bars; ${incomplete} incomplete 4h buckets excluded`)
  data[sym] = { b1, b4 }
  tmin = Math.min(tmin, b1[0].t)
  tmax = Math.max(tmax, b1[b1.length - 1].t)
}
if (Object.keys(data).length !== S.CRYPTO_40.length || (tmax - tmin) / 86400000 < 1000) {
  const missing = S.CRYPTO_40.filter(sym => !data[sym])
  throw new Error(`Insufficient historical coverage for the 36-month audit: ` +
    `${Object.keys(data).length}/${S.CRYPTO_40.length} symbols; missing ${missing.join(',')}`)
}
console.log(`Coverage: ${Object.keys(data).length}/40 symbols, ${new Date(tmin).toISOString()} to ${new Date(tmax).toISOString()}`)
console.log('Frozen incumbent, kill-switch ON. Six independent chronological windows; no parameter fitting.')
console.log('A positive-window result alone is NOT deployment clearance: this simulator still has execution/parity limitations.')
for (const slipBps of [3, 6]) {
  const results: P.Metrics[] = []
  const span = (tmax - tmin) / 6
  for (let w = 0; w < 6; w++) {
    const from = Math.max(tmin + 100 * H4, tmin + w * span)
    const to = tmin + (w + 1) * span
    const result = P.runPortfolio(data, P.defaultConfig({ killSwitch: true, slipBps }), from, to)
    const m = P.metrics(result, 10_000, (to - from) / 86400000)
    results.push(m)
    console.log(JSON.stringify({ slipBps, window: w + 1, from, to,
      closedTrades: m.trades, netUsd: m.netUsd, netPct: m.netPct, maxDD: m.maxDD,
      fees: m.fees, slippage: m.slip, funding: m.funding }))
  }
  console.log(JSON.stringify({ slipBps, allSixPositive: P.allSixPositive(results.map(m => m.netPct)),
    closedTrades: results.reduce((sum, m) => sum + m.trades, 0),
    // This sum is deliberately labelled: resetting each window to $10k does
    // not produce a compounded, continuous 36-month portfolio return.
    sumIndependentWindowNetUsd: results.reduce((sum, m) => sum + m.netUsd, 0) }))
}

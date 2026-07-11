// ════════════════════════════════════════════════════════════════════════════
// PATH 4: CONFLUENCE GATING - THRESHOLD ANALYSIS & CALIBRATION
// ════════════════════════════════════════════════════════════════════════════

import * as fs from 'fs'

const COINS = [
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX', 'LINK', 'DOT',
  'POL', 'UNI', 'ATOM', 'LTC', 'BCH', 'NEAR', 'ALGO', 'FIL', 'VET', 'ICP'
]

interface Bar {
  open: number
  high: number
  low: number
  close: number
  vol: number
  time: number
}

interface Signal {
  coin: string
  time: number
  price: number
  side: 'LONG' | 'SHORT'
  scores: {
    vpoc: number
    confirmation: number
    adx: number
    volume: number
    oi: number
    liquidity: number
    fearGreed: number
  }
  total: number
}

function generateSyntheticData(coin: string, count: number): Bar[] {
  const bars: Bar[] = []
  const basePrices: Record<string, number> = {
    'BTC': 68000, 'ETH': 3800, 'SOL': 185, 'BNB': 710, 'XRP': 2.8,
    'ADA': 1.2, 'DOGE': 0.38, 'AVAX': 38, 'LINK': 18, 'DOT': 8.5,
    'POL': 0.65, 'UNI': 9.2, 'ATOM': 8.3, 'LTC': 95, 'BCH': 520,
    'NEAR': 7.5, 'ALGO': 0.95, 'FIL': 15, 'VET': 0.065, 'ICP': 18
  }

  let price = basePrices[coin] || 100
  let trend = Math.random() > 0.5 ? 1 : -1
  let trendStrength = Math.random() * 0.002

  for (let i = 0; i < count; i++) {
    trend += (Math.random() - 0.5) * 0.0005
    trend = Math.max(-0.002, Math.min(0.002, trend))

    const change = trendStrength + trend + (Math.random() - 0.5) * 0.001
    price = price * (1 + change)

    const volatility = Math.random() * 0.003
    const open = price * (1 + (Math.random() - 0.5) * volatility)
    const high = Math.max(open, price) * (1 + Math.random() * volatility)
    const low = Math.min(open, price) * (1 - Math.random() * volatility)
    const close = price * (1 + (Math.random() - 0.5) * volatility / 2)

    const baseVol = 50000 + Math.random() * 150000
    const vol = baseVol * (1 + Math.random() * 0.8)

    bars.push({
      open,
      high: Math.max(high, close),
      low: Math.min(low, close),
      close,
      vol,
      time: i
    })

    if (Math.random() > 0.98) {
      trendStrength = Math.random() * 0.003 - 0.0015
    }
  }

  return bars
}

function calcATR(bars: Bar[], period = 14): number {
  if (bars.length < period + 1) return bars[0]?.high - bars[0]?.low || 0
  const trs = bars.slice(1).map((b, i) =>
    Math.max(
      b.high - b.low,
      Math.abs(b.high - bars[i].close),
      Math.abs(b.low - bars[i].close)
    )
  )
  let atr = trs.slice(0, period).reduce((a, v) => a + v, 0) / period
  for (let i = period; i < trs.length; i++) atr = (atr * (period - 1) + trs[i]) / period
  return atr
}

function calcADX(bars: Bar[], period = 14): number {
  if (bars.length < period + 1) return 20
  const trs = bars.slice(1).map((b, i) =>
    Math.max(
      b.high - b.low,
      Math.abs(b.high - bars[i].close),
      Math.abs(b.low - bars[i].close)
    )
  )
  const plusDM = bars.slice(1).map((b, i) => (b.high > bars[i].high ? Math.max(0, b.high - bars[i].high) : 0))
  const minusDM = bars.slice(1).map((b, i) => (b.low < bars[i].low ? Math.max(0, bars[i].low - b.low) : 0))

  let tr14 = trs.slice(0, period).reduce((a, v) => a + v, 0)
  let pdm14 = plusDM.slice(0, period).reduce((a, v) => a + v, 0)
  let mdm14 = minusDM.slice(0, period).reduce((a, v) => a + v, 0)

  const adxes: number[] = []
  for (let i = period; i < trs.length; i++) {
    tr14 = tr14 - trs[i - period] + trs[i]
    pdm14 = pdm14 - plusDM[i - period] + plusDM[i]
    mdm14 = mdm14 - minusDM[i - period] + minusDM[i]

    const di1 = tr14 > 0 ? (pdm14 / tr14) * 100 : 0
    const di2 = tr14 > 0 ? (mdm14 / tr14) * 100 : 0
    const dx = di1 + di2 > 0 ? (Math.abs(di1 - di2) / (di1 + di2)) * 100 : 0
    adxes.push(dx)
  }

  if (adxes.length < period) return 20
  let adx = adxes.slice(0, period).reduce((a, v) => a + v, 0) / period
  for (let i = period; i < adxes.length; i++) adx = (adx * (period - 1) + adxes[i]) / period
  return Math.min(100, Math.max(0, adx))
}

function calcVPOC(bars: Bar[]): number {
  if (!bars.length) return 0
  const min = Math.min(...bars.map(b => b.low))
  const max = Math.max(...bars.map(b => b.high))
  if (max === min) return (max + min) / 2
  const buckets = 40
  const step = (max - min) / buckets
  const hist = new Array(buckets).fill(0)
  for (const bar of bars) {
    const idx = Math.min(Math.floor(((bar.high + bar.low) / 2 - min) / step), buckets - 1)
    hist[idx] += bar.vol
  }
  return min + (hist.indexOf(Math.max(...hist)) + 0.5) * step
}

function detectTrend(bars: Bar[], period: number = 9): 'UP' | 'DOWN' | 'FLAT' {
  if (bars.length < period + 5) return 'FLAT'
  const recent = bars.slice(-period)
  const older = bars.slice(-(period * 2), -period)
  const recentAvg = recent.reduce((a, b) => a + b.close, 0) / recent.length
  const olderAvg = older.reduce((a, b) => a + b.close, 0) / older.length
  const diff = (recentAvg - olderAvg) / olderAvg
  if (diff > 0.001) return 'UP'
  if (diff < -0.001) return 'DOWN'
  return 'FLAT'
}

// ════════════════════════════════════════════════════════════════════════════
// SCORING COMPONENTS
// ════════════════════════════════════════════════════════════════════════════

function scoreVPOC(price: number, vpoc: number, side: 'LONG' | 'SHORT'): number {
  const distPct = Math.abs(price - vpoc) / vpoc
  const aligned = side === 'LONG' ? vpoc < price : vpoc > price
  if (!aligned) return 0
  if (distPct < 0.005) return 25
  if (distPct < 0.008) return 20
  if (distPct < 0.012) return 15
  if (distPct < 0.018) return 10
  return 0
}

function scoreConfirmation(bars5m: Bar[], bars15m: Bar[], side: 'LONG' | 'SHORT'): number {
  if (!bars15m || bars15m.length < 10 || !bars5m || bars5m.length < 10) return 0
  const trend5m = detectTrend(bars5m, 9)
  const trend15m = detectTrend(bars15m, 9)
  const expectedTrend = side === 'LONG' ? 'UP' : 'DOWN'
  if (trend15m === expectedTrend && trend5m === expectedTrend) return 20
  if (trend15m === expectedTrend && trend5m !== 'FLAT') return 15
  if (trend5m === expectedTrend) return 10
  if (trend5m !== 'FLAT') return 5
  return 0
}

function scoreADX(bars: Bar[]): number {
  const adx = calcADX(bars, 14)
  if (adx > 22) return 10
  if (adx > 18) return 7
  if (adx > 14) return 4
  return 0
}

function scoreVolume(bars: Bar[], lookback = 20): number {
  if (bars.length < lookback + 1) return 0
  const recentVol = bars[bars.length - 1].vol
  const avgVol = bars.slice(-lookback - 1, -1).reduce((a, b) => a + b.vol, 0) / lookback
  if (avgVol === 0) return 0
  const ratio = recentVol / avgVol
  if (ratio > 1.6) return 10
  if (ratio > 1.4) return 8
  if (ratio > 1.2) return 5
  if (ratio > 1.0) return 2
  return 0
}

function scoreOI(bars: Bar[]): number {
  const recent3 = bars.slice(-3)
  const priceVol = recent3.reduce((a, b) => a + (b.high - b.low), 0) / 3
  const avgPrice = recent3.reduce((a, b) => a + b.close, 0) / 3
  const volPct = priceVol / avgPrice
  if (volPct > 0.01) return 12
  if (volPct > 0.006) return 8
  if (volPct > 0.003) return 4
  return 2
}

function scoreLiquidity(bars: Bar[]): number {
  const recentVol = bars[bars.length - 1].vol
  const avgVol = bars.slice(-10).reduce((a, b) => a + b.vol, 0) / 10
  if (avgVol === 0) return 3
  const ratio = recentVol / avgVol
  if (ratio > 1.8) return 15
  if (ratio > 1.5) return 12
  if (ratio > 1.2) return 8
  if (ratio > 1.0) return 5
  return 2
}

function scoreFearGreed(fearGreedValue: number, side: 'LONG' | 'SHORT'): number {
  if (side === 'LONG') {
    if (fearGreedValue < 25) return 5
    if (fearGreedValue < 40) return 3
    if (fearGreedValue > 75) return -2
    return 1
  } else {
    if (fearGreedValue > 75) return 5
    if (fearGreedValue > 60) return 3
    if (fearGreedValue < 25) return -2
    return 1
  }
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN ANALYSIS
// ════════════════════════════════════════════════════════════════════════════

async function runAnalysis() {
  console.log('═'.repeat(90))
  console.log('PATH 4: CONFLUENCE GATING — THRESHOLD ANALYSIS & CALIBRATION')
  console.log('═'.repeat(90))

  const allSignals: Signal[] = []

  for (const coin of COINS) {
    process.stdout.write(`\nGenerating signals for ${coin}... `)
    const bars5m = generateSyntheticData(coin, 2000)
    const bars15m = generateSyntheticData(coin, 666)

    for (let i = 100; i < bars5m.length - 10; i++) {
      const currentBar = bars5m[i]
      const price = currentBar.close
      const vpoc = calcVPOC(bars5m.slice(-80))
      const trend = detectTrend(bars5m.slice(0, i + 1), 9)

      let side: 'LONG' | 'SHORT' | null = null
      if (trend === 'UP' && vpoc < price * 1.001) side = 'LONG'
      else if (trend === 'DOWN' && vpoc > price * 0.999) side = 'SHORT'
      else continue

      const scores = {
        vpoc: scoreVPOC(price, vpoc, side),
        confirmation: scoreConfirmation(bars5m.slice(0, i + 1), bars15m.slice(0, Math.floor(i / 3) + 1), side),
        adx: scoreADX(bars5m.slice(0, i + 1)),
        volume: scoreVolume(bars5m.slice(0, i + 1)),
        oi: scoreOI(bars5m.slice(0, i + 1)),
        liquidity: scoreLiquidity(bars5m.slice(0, i + 1)),
        fearGreed: Math.max(0, scoreFearGreed(50, side))
      }

      const total = Math.max(0, Object.values(scores).reduce((a, b) => a + b, 0))

      allSignals.push({
        coin,
        time: i,
        price,
        side,
        scores,
        total
      })
    }
    console.log(`✓ ${allSignals.filter(s => s.coin === coin).length} signals`)
  }

  console.log(`\n✓ Total signals generated: ${allSignals.length}`)

  // Analyze score distribution
  console.log('\n' + '═'.repeat(90))
  console.log('SCORE DISTRIBUTION ANALYSIS')
  console.log('═'.repeat(90))

  const scoreDistribution = {
    '0-10': 0,
    '10-20': 0,
    '20-30': 0,
    '30-40': 0,
    '40-50': 0,
    '50-60': 0,
    '60-70': 0,
    '70-80': 0,
    '80-90': 0,
    '90-100': 0
  }

  for (const signal of allSignals) {
    if (signal.total < 10) scoreDistribution['0-10']++
    else if (signal.total < 20) scoreDistribution['10-20']++
    else if (signal.total < 30) scoreDistribution['20-30']++
    else if (signal.total < 40) scoreDistribution['30-40']++
    else if (signal.total < 50) scoreDistribution['40-50']++
    else if (signal.total < 60) scoreDistribution['50-60']++
    else if (signal.total < 70) scoreDistribution['60-70']++
    else if (signal.total < 80) scoreDistribution['70-80']++
    else if (signal.total < 90) scoreDistribution['80-90']++
    else scoreDistribution['90-100']++
  }

  console.log('\nScore Range   | Count     | % of Total')
  console.log('─'.repeat(40))
  for (const [range, count] of Object.entries(scoreDistribution)) {
    const pct = ((count / allSignals.length) * 100).toFixed(2)
    console.log(`${range.padEnd(13)} | ${String(count).padStart(9)} | ${pct.padStart(6)}%`)
  }

  const avgScore = allSignals.reduce((a, s) => a + s.total, 0) / allSignals.length
  const maxScore = Math.max(...allSignals.map(s => s.total))
  const minScore = Math.min(...allSignals.map(s => s.total))

  console.log('─'.repeat(40))
  console.log(`Average Score: ${avgScore.toFixed(2)} | Min: ${minScore.toFixed(2)} | Max: ${maxScore.toFixed(2)}`)

  // Threshold analysis
  console.log('\n' + '═'.repeat(90))
  console.log('GATE THRESHOLD ANALYSIS')
  console.log('═'.repeat(90))

  const thresholds = [50, 55, 60, 65, 70, 75, 80, 85, 90, 95]
  const analysis: any[] = []

  for (const threshold of thresholds) {
    const passed = allSignals.filter(s => s.total >= threshold)
    const filtered = allSignals.length - passed.length
    const filterRate = ((filtered / allSignals.length) * 100).toFixed(2)
    const passRate = ((passed.length / allSignals.length) * 100).toFixed(2)

    analysis.push({
      threshold,
      passed: passed.length,
      filtered,
      passRate: parseFloat(passRate),
      filterRate: parseFloat(filterRate)
    })
  }

  console.log('\nThreshold | Entries | Filtered | Pass % | Filter %')
  console.log('─'.repeat(55))
  for (const a of analysis) {
    console.log(
      `${String(a.threshold).padEnd(9)} | ${String(a.passed).padStart(7)} | ${String(a.filtered).padStart(8)} | ${a.passRate.toFixed(2).padStart(5)}% | ${a.filterRate.toFixed(2).padStart(6)}%`
    )
  }

  // Component analysis
  console.log('\n' + '═'.repeat(90))
  console.log('SCORE COMPONENT ANALYSIS')
  console.log('═'.repeat(90))

  const componentStats: Record<string, { avg: number; max: number; min: number }> = {}
  for (const comp of ['vpoc', 'confirmation', 'adx', 'volume', 'oi', 'liquidity', 'fearGreed']) {
    const values = allSignals.map(s => s.scores[comp as keyof typeof s.scores])
    componentStats[comp] = {
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      max: Math.max(...values),
      min: Math.min(...values)
    }
  }

  console.log('\nComponent      | Average | Max | Min | % Non-Zero')
  console.log('─'.repeat(50))
  for (const [comp, stats] of Object.entries(componentStats)) {
    const nonZero = allSignals.filter(s => s.scores[comp as keyof Signal['scores']] > 0).length
    const nzPct = ((nonZero / allSignals.length) * 100).toFixed(1)
    console.log(
      `${comp.padEnd(14)} | ${stats.avg.toFixed(2).padStart(7)} | ${String(stats.max).padStart(2)} | ${String(stats.min).padStart(2)} | ${nzPct.padStart(5)}%`
    )
  }

  // Recommended thresholds
  console.log('\n' + '═'.repeat(90))
  console.log('CALIBRATION RECOMMENDATIONS')
  console.log('═'.repeat(90))

  const target20pct = allSignals.length * 0.20
  const target10pct = allSignals.length * 0.10
  const target5pct = allSignals.length * 0.05

  let recommended20 = 85
  let recommended10 = 85
  let recommended5 = 85

  for (const a of analysis) {
    if (a.passed >= target20pct && a.passed <= target20pct * 1.1) recommended20 = a.threshold
    if (a.passed >= target10pct && a.passed <= target10pct * 1.1) recommended10 = a.threshold
    if (a.passed >= target5pct && a.passed <= target5pct * 1.1) recommended5 = a.threshold
  }

  console.log(`\nFor ~20% pass rate (${target20pct.toFixed(0)} trades): Gate >= ${recommended20}`)
  console.log(`For ~10% pass rate (${target10pct.toFixed(0)} trades): Gate >= ${recommended10}`)
  console.log(`For ~5% pass rate  (${target5pct.toFixed(0)} trades): Gate >= ${recommended5}`)

  console.log(`\n✓ Analysis complete. Total signal points analyzed: ${allSignals.length}`)
}

runAnalysis().catch(console.error)

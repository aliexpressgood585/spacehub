// v95.6 experiments on the FAST real-time rule, Binance USDT-M 1m, 10 coins, 12 months. IS = first 70% (selection),
// OOS = last 30% (read once). Signal on CLOSED 1m bars at bar i; every entry at a later bar's OPEN (no look-ahead).
// Costs: taker 5 bps per side; market fills (entry / stop / timeout) pay slipFor(coin) per side; a limit target fills
// at its level (fee only); funding 0.01%/8h pro rata. Stress column: +10 bps per market fill (INFERRED book impact).
// Intrabar: stop before target when both touch; the trailing stop updates from the NEXT bar; gaps fill at the open.
import * as fs from 'node:fs'
import { labInd, slipFor, type LBar } from '/home/user/spacehub/shared/lab.ts'
const load = (s: string): LBar[] => fs.readFileSync(`/home/user/spacehub/backtest/data/${s}-1m.csv`, 'utf8').split('\n').filter((l) => l && l[0] >= '0' && l[0] <= '9').map((l) => { const f = l.split(','); return { t: +f[0], open: +f[1], high: +f[2], low: +f[3], close: +f[4], vol: +f[5], tb: +f[9] } })
const coins = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'DOT']
const btc = load('BTC'), bi = labInd(btc), btcUp = new Map<number, boolean>(); btc.forEach((b, i) => { if (bi.ema20[i] > 0) btcUp.set(b.t, b.close > bi.ema20[i]) })
const t0 = btc[0].t, t1 = btc[btc.length - 1].t, cut = t0 + (t1 - t0) * 0.7
type Tr = { t: number; net: number; netS: number; R: number }
const res: Record<string, Tr[]> = {}
const HOLD = 30, STRESS = 0.001
type Exit = 'fix15' | 'part' | 'trail'
// simulate from entry bar j (enter at b[j].open); returns realised fraction (per unit notional) and number of market legs
function sim(b: LBar[], j: number, side: 1 | -1, e: number, r: number, ex: Exit, slip: number) {
  let stop = e - side * r, best = e, left = 1, pnl = 0, mkt = 0, beSet = false
  const tgt = ex === 'fix15' ? e + side * 1.5 * r : ex === 'part' ? e + side * r : NaN
  for (let k = j; k < b.length && k < j + HOLD; k++) {
    const x = b[k], adv = side > 0 ? x.low : x.high, fav = side > 0 ? x.high : x.low
    if (side * (adv - stop) <= 0) { const px = side * (x.open - stop) <= 0 ? x.open : stop; pnl += left * (side * (px * (1 - side * slip) / e - 1) - 0.0005); mkt += left; return { pnl, mkt, k } }
    if (Number.isFinite(tgt) && side * (fav - tgt) > 0 && !(ex === 'part' && beSet)) {
      if (ex === 'fix15') { pnl += side * (tgt / e - 1) - 0.0005; return { pnl, mkt, k } }
      pnl += 0.5 * (side * (tgt / e - 1) - 0.0005); left = 0.5; beSet = true; stop = e   // half off at 1R, rest to breakeven
    }
    if (side * (fav - best) > 0) best = fav
    if (ex !== 'fix15' && side * (best - e) >= r) { const ns = best - side * r; if (side * (ns - stop) > 0) stop = ns }
  }
  const k = Math.min(b.length - 1, j + HOLD - 1), px = b[k].close
  pnl += left * (side * (px * (1 - side * slip) / e - 1) - 0.0005); mkt += left
  return { pnl, mkt, k }
}
for (const c of coins) {
  const b = c === 'BTC' ? btc : load(c), I = labInd(b), slip = slipFor(c)
  const busy: Record<string, number> = {}
  const add = (key: string, j: number, side: 1 | -1, r: number, ex: Exit) => {
    if (j >= b.length || j < (busy[key] ?? 0)) return
    const e = b[j].open * (1 + side * slip), s = sim(b, j, side, e, r, ex, slip)
    const fund = 0.0001 * (s.k - j + 1) / 480 * side
    const net = (s.pnl - 0.0005 - fund) * 100, netS = net - (STRESS * (1 + s.mkt)) * 100
    ;(res[key] ??= []).push({ t: b[j].t, net, netS, R: net / 100 / (r / e) }); busy[key] = s.k + 1
  }
  for (let i = 40; i < b.length - 45; i++) {
    const ap = I.atrPct[i], av = I.av20[i]; if (!(ap > 0 && av > 0)) continue
    const z = (b[i].close / b[i - 3].close - 1) / (ap * Math.sqrt(3)); if (Math.abs(z) <= 2) continue
    let v3 = 0, fb = 0, hi = -Infinity, lo = Infinity
    for (let k = i - 2; k <= i; k++) { v3 += b[k].vol; fb += 2 * (b[k].tb as number) - b[k].vol; hi = Math.max(hi, b[k].high); lo = Math.min(lo, b[k].low) }
    if (v3 / (3 * av) < 2) continue
    const dir: 1 | -1 = z > 0 ? 1 : -1, imb = fb / v3; if (!(dir * imb > 0.1)) continue
    if (c !== 'BTC') { const u = btcUp.get(b[i].t); if (u === undefined || (dir > 0) !== u) continue }
    const atr = Math.max(2 * ap * b[i].close, b[i].close * 0.003)
    // absorption: where the 3-bar window CLOSED within its own range, in the trade's direction (1 = at the extreme)
    const clv = hi > lo ? (dir > 0 ? (b[i].close - lo) / (hi - lo) : (hi - b[i].close) / (hi - lo)) : 0.5
    for (const ex of ['fix15', 'part', 'trail'] as Exit[]) {
      add(`A immediate      | ${ex}`, i + 1, dir, atr, ex)
      if (clv >= 0.5) add(`C clv>=0.5       | ${ex}`, i + 1, dir, atr, ex)
      if (clv >= 0.7) add(`C clv>=0.7       | ${ex}`, i + 1, dir, atr, ex)
      if (clv < 0.5) add(`C clv<0.5 (absorbed) | ${ex}`, i + 1, dir, atr, ex)
      // B: pullback that HOLDS the breakout, then continuation. Burst = [base, ext] where base = close 3 bars back.
      for (const depth of [0.382, 0.5]) {
        const base = b[i - 3].close, ext = dir > 0 ? b[i].high : b[i].low, span = Math.abs(ext - base)
        const pullTo = ext - dir * depth * span, fail = base   // back to where the burst started = breakout failed
        let pulled = false, pbExt = ext, j = -1
        for (let k = i + 1; k <= i + 10 && k < b.length - 1; k++) {
          const x = b[k]
          if (dir * ((dir > 0 ? x.low : x.high) - fail) <= 0) break
          if (dir * ((dir > 0 ? x.low : x.high) - pullTo) <= 0) pulled = true
          if (pulled && dir * (x.close - pbExt) > 0) { j = k + 1; break }   // closes beyond the burst extreme again
          if (!pulled && dir * ((dir > 0 ? x.high : x.low) - pbExt) > 0) pbExt = dir > 0 ? x.high : x.low
        }
        if (j > 0) add(`B pullback ${depth}+cont | ${ex}`, j, dir, atr, ex)
      }
    }
  }
}
const daily = (a: Tr[], f: (x: Tr) => number) => { const m = new Map<number, number>(); for (const x of a) { const d = Math.floor(x.t / 864e5); m.set(d, (m.get(d) ?? 0) + f(x)) } const v = [...m.values()], n = v.length, mu = v.reduce((s, x) => s + x, 0) / n, sd = Math.sqrt(v.reduce((s, x) => s + (x - mu) ** 2, 0) / (n - 1)); return mu / sd * Math.sqrt(n) }
const st = (a: Tr[]) => { if (a.length < 5) return `n ${a.length}`; const n = a.length, s = a.reduce((x, y) => x + y.net, 0), w = a.filter((x) => x.net > 0).length, gw = a.filter((x) => x.net > 0).reduce((x, y) => x + y.net, 0), gl = -a.filter((x) => x.net <= 0).reduce((x, y) => x + y.net, 0)
  return `n ${String(n).padStart(5)} WR ${(w / n * 100).toFixed(1).padStart(4)}% net ${(s / n).toFixed(3).padStart(7)}% R ${(a.reduce((x, y) => x + y.R, 0) / n).toFixed(3).padStart(6)} PF ${(gw / gl).toFixed(2)} t ${daily(a, (x) => x.net).toFixed(2).padStart(5)} | stress ${(a.reduce((x, y) => x + y.netS, 0) / n).toFixed(3)}%` }
console.log(`FAST rt rule on closed 1m bars, 10 coins, ${new Date(t0).toISOString().slice(0, 10)}..${new Date(t1).toISOString().slice(0, 10)}, IS 70% / OOS 30% (from ${new Date(cut).toISOString().slice(0, 10)})`)
const keys = Object.keys(res).sort()
console.log('\n── IN-SAMPLE ──'); for (const k of keys) console.log(`${k.padEnd(34)} ${st(res[k].filter((x) => x.t < cut))}`)
const isBest = keys.map((k) => { const a = res[k].filter((x) => x.t < cut); return { k, m: a.reduce((s, x) => s + x.net, 0) / a.length } }).sort((a, b) => b.m - a.m)[0]
console.log(`\nIS-selected: ${isBest.k} (IS ${isBest.m.toFixed(3)}%/trade)`)
console.log('\n── OUT-OF-SAMPLE (read once) ──'); for (const k of keys) console.log(`${k.padEnd(34)} ${st(res[k].filter((x) => x.t >= cut))}`)

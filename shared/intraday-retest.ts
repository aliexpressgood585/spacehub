// Frozen PAPER hypothesis, not validated alpha. Only completed 5m candles.
import { labInd, type LBar } from './lab.ts'
import type { FastSig } from './fast.ts'
export const RETEST = { version: 'retest-v1', holdMin: 15, targetR: 2, riskFraction: 0.005,
  maxOpen: 8, maxSameSide: 4, maxLeverage: 1, maxSpreadBps: 8, maxCostR: 0.25 } as const
export interface RetestSig extends FastSig { stopPx: number; level: number; signalPrice: number; signalTime: number }
export function retestSignal(b: LBar[], btcUp: boolean | null, isBtc: boolean): RetestSig | null {
  if (b.length < 62 || b.some((x, i) => ![x.t,x.open,x.high,x.low,x.close,x.vol,x.tb].every(Number.isFinite) ||
    x.open <= 0 || x.close <= 0 || x.low <= 0 || x.high < Math.max(x.open,x.close) || x.low > Math.min(x.open,x.close) ||
    x.vol <= 0 || x.tb! < 0 || x.tb! > x.vol || x.t % 300000 !== 0 || (i > 0 && x.t - b[i-1].t !== 300000))) return null
  const n = b.length, breakout = b[n-2], retest = b[n-1], history = b.slice(0,-2)
  const I = labInd(history), A = I.atr.at(-1)!, avg = I.av20.at(-1)!
  if (!(A > 0 && avg > 0)) return null
  const range = history.slice(-20), high = Math.max(...range.map(x=>x.high)), low = Math.min(...range.map(x=>x.low))
  const dir: 1 | -1 | 0 = breakout.close > high ? 1 : breakout.close < low ? -1 : 0
  if (!dir || (!isBtc && (btcUp === null || btcUp !== (dir > 0)))) return null
  const level = dir > 0 ? high : low, touch = dir > 0 ? retest.low : retest.high
  const imb = (2*retest.tb! - retest.vol)/retest.vol, volRatio = breakout.vol/avg
  if (volRatio < 1.5 || Math.abs(touch-level) > 0.25*A || dir*(retest.close-level) <= 0 ||
    dir*(retest.close-retest.open) <= 0 || dir*imb < 0.1 || dir*(retest.close-level) > A) return null
  const stopPx = (dir > 0 ? Math.min(retest.low,level) : Math.max(retest.high,level)) - dir*0.2*A
  const atr = Math.max(dir*(retest.close-stopPx),retest.close*0.003)
  return { dir, stopPx, level, signalPrice: retest.close, signalTime: retest.t, atr,
    z: dir*(breakout.close-level)/A, volRatio, imb, strength: volRatio*dir*imb }
}
export function retestLevels(sig: RetestSig, entry: number) {
  const r = Math.max(sig.dir*(entry-sig.stopPx),entry*0.003)
  return { r, stop: entry-sig.dir*r, target: entry+sig.dir*RETEST.targetR*r }
}
// Feasibility only: a large target is NOT evidence of positive expected return.
export function retestExecution(sig: RetestSig, entry: number, bid: number, ask: number,
  quoteTs: number, now: number, slip: number, entryImpact: number, exitImpact: number) {
  if (![entry,bid,ask,quoteTs,now,slip,entryImpact,exitImpact].every(Number.isFinite) ||
    bid<=0 || ask<bid || entry<=0 || slip<0 || entryImpact<0 || exitImpact<0) return { ok:false as const, reason:'invalid_retest_quote' }
  if (quoteTs > now+1000 || now-quoteTs > 5000 || now < sig.signalTime+300000 || now-sig.signalTime-300000 > 120000)
    return { ok:false as const, reason:'stale_retest_signal' }
  const mid=(bid+ask)/2, spread=(ask-bid)/mid, lv=retestLevels(sig,entry)
  if (spread*1e4 > RETEST.maxSpreadBps || Math.abs(mid-sig.signalPrice)>0.25*sig.atr || sig.dir*(mid-sig.level)<=0)
    return { ok:false as const, reason:'retest_moved_or_spread' }
  // Fees on both legs + spread + impact floors + 2bps inferred funding reserve.
  const cost=0.001+spread+Math.max(slip,entryImpact)+Math.max(slip,exitImpact)+0.0002
  if (cost/(lv.r/entry)>RETEST.maxCostR) return { ok:false as const, reason:'retest_cost_too_high' }
  return { ok:true as const, reason:'retest_execution_ok', costFraction:cost, ...lv }
}

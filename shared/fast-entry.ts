// Entry integrity for the aggressive FAST paper sleeve. These are execution guards,
// not a backtested alpha claim. No change to leverage, slots, signal thresholds or exits.
import { FAST, fastSignalRT } from './fast.ts'
import { labInd, type LBar } from './lab.ts'

export const FAST_ENTRY = { version: 'fresh-v1', maxAgeMs: 5_000, maxChaseR: 0.25 } as const

export function freshMinuteBars(b: LBar[], now: number): boolean {
  if (b.length < 40 || !Number.isFinite(now)) return false
  const last = b.at(-1)!
  if (last.t > now || now - last.t >= 65_000) return false
  return b.every((x, i) => Number.isFinite(x.t) && x.t % 60_000 === 0 &&
    (i === 0 || x.t - b[i - 1].t === 60_000) &&
    [x.open, x.high, x.low, x.close].every(v => Number.isFinite(v) && v > 0) &&
    x.high >= Math.max(x.open, x.close) && x.low <= Math.min(x.open, x.close) &&
    Number.isFinite(x.vol) && x.vol >= 0 && Number.isFinite(x.tb) && x.tb! >= 0 && x.tb! <= x.vol)
}

export function confirmFastEntry(b: LBar[], btc: LBar[], isBtc: boolean, expectedDir: 1 | -1,
  bid: number, ask: number, quoteTs: number, startedAt: number, now: number) {
  const fail = (reason: string) => ({ ok: false as const, reason })
  if (![bid, ask, quoteTs, startedAt, now].every(Number.isFinite) || bid <= 0 || ask < bid)
    return fail('invalid_entry_quote')
  if (now < startedAt || now - startedAt > FAST_ENTRY.maxAgeMs ||
    quoteTs > now + 1_000 || now - quoteTs > FAST_ENTRY.maxAgeMs)
    return fail('stale_entry_snapshot')
  if (!freshMinuteBars(b, now) || (!isBtc && (!freshMinuteBars(btc, now) || btc.at(-1)!.t !== b.at(-1)!.t)))
    return fail('incomplete_entry_bars')
  const bb = (isBtc ? b : btc).slice(0, -1), bi = labInd(bb), k = bb.length - 1
  const btcUp = bb[k].close > bi.ema20[k]
  const original = fastSignalRT(b, btcUp, isBtc)
  if (!original || original.dir !== expectedDir) return fail('signal_expired')
  const last = b.at(-1)!, mid = (bid + ask) / 2
  const r = Math.max(original.atr, last.close * FAST.stopMinPct)
  const driftR = expectedDir * (mid - last.close) / r
  // A move either way this large since the fresh kline means the snapshot no longer
  // describes the executable market. Reconsider next scan, without a new cooldown.
  if (Math.abs(driftR) > FAST_ENTRY.maxChaseR) return fail('entry_price_moved')
  const atBook = [...b.slice(0, -1), { ...last, close: mid, high: Math.max(last.high, mid), low: Math.min(last.low, mid) }]
  const sig = fastSignalRT(atBook, btcUp, isBtc)
  if (!sig || sig.dir !== expectedDir) return fail('signal_expired_at_book')
  // Diagnostics only: recent flow may contradict the 3-minute aggregate. Do not
  // silently promote this unvalidated feature to a mandatory trading filter.
  const recent = b.slice(-2), volume = recent.reduce((s, x) => s + x.vol, 0)
  const recentImb = volume > 0 ? recent.reduce((s, x) => s + 2 * x.tb! - x.vol, 0) / volume : 0
  return { ok: true as const, sig, btcUp, detail: { version: FAST_ENTRY.version, checked_at: now,
    snapshot_started_at: startedAt, snapshot_age_ms: now - startedAt, quote_age_ms: now - quoteTs,
    signal_price: last.close, book_mid: mid, drift_r: driftR,
    recent_imb: recentImb, recent_flow_agrees: expectedDir * recentImb > 0 } }
}

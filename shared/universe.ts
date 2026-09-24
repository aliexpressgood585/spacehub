// v88.0 — DYNAMIC UNIVERSE (owner, 2026-09-24): every active USDT-margined perpetual on Binance Futures, filtered only
// by basic liquidity and valid data, no preference for any hard-coded coin list.
//
// Source of truth = Binance USDT-M itself: exchangeInfo (what is listed and trading), ticker/24hr (liquidity) and
// ticker/bookTicker (spread). Refreshed hourly, cached; a failed refresh keeps the last good list, and with no list
// at all the bot falls back to the pinned 40 (CRYPTO_40) rather than trading blind.
//
// FILTERS, and only these:
//  - listing: contractType PERPETUAL, quoteAsset USDT, status TRADING
//  - CRYPTO ONLY (standing rule 2 still holds): underlyingType COIN; anything tagged as a stock / equity / TradFi /
//    commodity / metal / forex, index products, and stablecoin bases are excluded
//  - basic liquidity: 24h quote volume >= minQuoteVol and quoted spread <= maxSpreadBps
//  - valid data: price > 0, listed >= minAgeDays (new listings have too few bars for any agent), a well-formed symbol
// Per-trade liquidity is still enforced where it belongs — the cost model prices impact from the real ±10 bps depth
// and the gate rejects `book_too_thin`.
//
// SCAN: the in-depth evaluation (1-minute bars + 20-level book + every agent) cannot run on ~300 pairs inside one
// edge-function minute, so each meeting evaluates `perMeeting` pairs: every held coin, BTC (the btclead agent reads
// it) and the next slice of the universe in a stateless rotation (offset = minute x budget), so every liquid pair
// is evaluated every few minutes with no ordering by name recognition.
import { CRYPTO_40 } from './strategy.ts'

export const UNIV = {
  minQuoteVol: 20_000_000,   // $20M traded in 24h
  maxSpreadBps: 10,          // quoted spread
  minAgeDays: 3,             // listed at least 3 days ago
  perMeeting: 60,            // pairs evaluated in depth per meeting
  refreshMs: 60 * 60_000,    // universe list refreshed hourly
} as const

export const STABLE_BASES = new Set(['USDC', 'FDUSD', 'TUSD', 'BUSD', 'DAI', 'USDP', 'USDE', 'USD1', 'PYUSD', 'EUR', 'EURI', 'AEUR', 'XUSD', 'USDS', 'RLUSD', 'BFUSD', 'FRAX', 'LUSD', 'GUSD', 'UST', 'USTC'])
// Non-crypto underlyings that sometimes appear as USDT perps (precious metals, tokenized equities, indices, FX)
export const NON_CRYPTO_BASES = new Set(['XAU', 'XAG', 'XPT', 'XPD', 'PAXG', 'XAUT', 'BTCDOM', 'DEFI', 'FOOTBALL', 'BLUEBIRD', 'TSLA', 'AAPL', 'NVDA', 'MSTR', 'COIN', 'AMZN', 'GOOGL', 'META', 'MSFT', 'SPY', 'QQQ', 'HOOD', 'CRCL'])
const NON_CRYPTO_TAG = /stock|equit|tradfi|commodit|metal|gold|silver|forex|fx|index|rwa-stock/i

// Legacy unit mapping kept so the 40 pinned names (and any open rows) keep their per-ONE-coin price convention.
export const LEGACY_SYM: Record<string, { s: string; k: number }> = { PEPE: { s: '1000PEPEUSDT', k: 1000 } }
const LEGACY_BY_SYMBOL = Object.fromEntries(Object.entries(LEGACY_SYM).map(([sym, v]) => [v.s, { sym, k: v.k }]))

export interface Pair { sym: string; s: string; k: number; qv: number; spreadBps: number }
export interface UniverseResult { pairs: Pair[]; listed: number; excluded: Record<string, number> }

// Pure: build the universe from the three Binance payloads.
export function buildUniverse(exchangeInfo: any, tickers: any[], books: any[], now: number, o: Partial<typeof UNIV> = {}): UniverseResult {
  const cfg = { ...UNIV, ...o }
  const tick = new Map((tickers ?? []).map((t: any) => [String(t.symbol), t]))
  const book = new Map((books ?? []).map((b: any) => [String(b.symbol), b]))
  const ex: Record<string, number> = {}
  const drop = (why: string) => { ex[why] = (ex[why] ?? 0) + 1 }
  const pairs: Pair[] = []
  let listed = 0
  for (const x of exchangeInfo?.symbols ?? []) {
    if (x.contractType !== 'PERPETUAL' || x.quoteAsset !== 'USDT') continue
    listed++
    if (x.status !== 'TRADING') { drop('not_trading'); continue }
    const base = String(x.baseAsset ?? ''), s = String(x.symbol ?? '')
    const subs = Array.isArray(x.underlyingSubType) ? x.underlyingSubType.join(',') : String(x.underlyingSubType ?? '')
    if ((x.underlyingType && x.underlyingType !== 'COIN') || NON_CRYPTO_BASES.has(base) || NON_CRYPTO_TAG.test(subs)) { drop('not_crypto'); continue }
    if (STABLE_BASES.has(base)) { drop('stablecoin'); continue }
    if (!/^[A-Z0-9]{2,20}USDT$/.test(s) || !/^[A-Z0-9]{2,16}$/.test(base)) { drop('bad_symbol'); continue }
    if (Number(x.onboardDate) > 0 && now - Number(x.onboardDate) < cfg.minAgeDays * 86_400_000) { drop('too_new'); continue }
    const t: any = tick.get(s), b: any = book.get(s)
    const qv = Number(t?.quoteVolume), bid = Number(b?.bidPrice), ask = Number(b?.askPrice)
    if (!(qv > 0) || !(bid > 0) || !(ask >= bid)) { drop('no_data'); continue }
    if (qv < cfg.minQuoteVol) { drop('illiquid'); continue }
    const spreadBps = (ask - bid) / ((ask + bid) / 2) * 1e4
    if (spreadBps > cfg.maxSpreadBps) { drop('wide_spread'); continue }
    const leg = LEGACY_BY_SYMBOL[s]
    pairs.push({ sym: leg?.sym ?? base, s, k: leg?.k ?? 1, qv, spreadBps: +spreadBps.toFixed(2) })
  }
  pairs.sort((a, b) => (a.sym < b.sym ? -1 : a.sym > b.sym ? 1 : 0))   // by name: the rotation must not favour volume or fame
  return { pairs, listed, excluded: ex }
}

// Stateless rotation: held coins and BTC always, then the next slice of the universe for this minute.
export function scanSlice(universe: string[], held: string[], minute: number, budget: number = UNIV.perMeeting): string[] {
  const out: string[] = []
  const add = (s: string) => { if (!out.includes(s)) out.push(s) }
  for (const h of held) add(h)
  if (universe.includes('BTC')) add('BTC')
  const n = universe.length
  if (!n) return out
  const room = Math.max(0, budget - out.length), start = ((minute * room) % n + n) % n
  for (let i = 0; i < n && out.length < Math.max(budget, held.length + 1); i++) add(universe[(start + i) % n])
  return out
}

// Fallback universe when the list cannot be read: the pinned 40.
export const FALLBACK: Pair[] = CRYPTO_40.map((sym) => ({ sym, s: (LEGACY_SYM[sym]?.s ?? `${sym}USDT`), k: LEGACY_SYM[sym]?.k ?? 1, qv: NaN, spreadBps: NaN }))

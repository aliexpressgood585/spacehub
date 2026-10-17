// Universe for the GitHub-Actions coin desks (daytrade 15m, coach 4h): EVERY USDT-margined perpetual Binance Futures trades
// today, priced live from the matching OKX USDT swap (fapi.binance.com answers HTTP 451 from the runners; OKX does not).
// "Binance trades it today" = the public archive (data.binance.vision) has a daily kline file for it in the last 3 days;
// the archive is the only Binance futures source the runners can reach. Crypto only: stablecoin / metal / stock / index
// bases are dropped. A Binance perp with no OKX swap has no live feed here and is reported as skipped, never guessed.
// Units: OKX lists most 1000x contracts per ONE coin (Binance 1000PEPE = OKX PEPE), so prices are per one coin.
import { STABLE_BASES, NON_CRYPTO_BASES } from './universe.ts'

export const BP = { refreshMs: 24 * 3600_000, minVolUsd: 10e6, maxSpreadBps: 10, minPairs: 30 } as const
export type Coin = { sym: string; bin: string }          // sym = OKX base (trading key), bin = Binance base (archive spelling)
export type Universe = { at: string; binance: number; coins: Coin[]; no_okx: string[] }

const S3 = 'https://s3-ap-northeast-1.amazonaws.com/data.binance.vision?delimiter=/&prefix=data/futures/um/daily/klines/'
const ARCH = 'https://data.binance.vision/data/futures/um/daily/klines'

// '1000PEPE' -> ['1000PEPE', 'PEPE']; '1MBABYDOGE' -> ['1MBABYDOGE', 'BABYDOGE']
export function okxCandidates(bin: string): string[] {
  const m = /^(1000000|100000|10000|1000|100|1M)([A-Z][A-Z0-9]*)$/.exec(bin)
  return m ? [bin, m[2]] : [bin]
}
export function isCryptoBase(b: string): boolean {
  const core = okxCandidates(b).at(-1)!
  return !STABLE_BASES.has(core) && !NON_CRYPTO_BASES.has(core)
}
// archive symbol list -> USDT perpetual bases (no delivery contracts BTCUSDT_250627, no USDC pairs)
export function perpBases(symbols: string[]): string[] {
  return [...new Set(symbols.filter((s) => /^[A-Z0-9]+USDT$/.test(s)).map((s) => s.slice(0, -4)))].filter(isCryptoBase).sort()
}
// match Binance bases to OKX USDT swaps (instIds like 'PEPE-USDT-SWAP'); BTC first
export function matchOkx(bins: string[], okxSwaps: Set<string>): { coins: Coin[]; no_okx: string[] } {
  const coins: Coin[] = [], no_okx: string[] = [], used = new Set<string>()
  for (const bin of bins) {
    const sym = okxCandidates(bin).find((c) => okxSwaps.has(c))
    if (sym && !used.has(sym)) { coins.push({ sym, bin }); used.add(sym) } else if (!sym) no_okx.push(bin)
  }
  coins.sort((a, b) => (a.sym === 'BTC' ? -1 : b.sym === 'BTC' ? 1 : a.sym.localeCompare(b.sym)))
  return { coins, no_okx }
}
// executable now on the OKX book: 24h volume and spread from the swap ticker
export function liqCheck(t: { vol: number; bid: number; ask: number } | undefined) {
  const sp = t && t.bid > 0 ? (t.ask - t.bid) / ((t.ask + t.bid) / 2) * 1e4 : NaN
  return { k: `נזילות OKX ≥ $${BP.minVolUsd / 1e6}M, מרווח ≤ ${BP.maxSpreadBps}bps`, ok: liquid(t), v: t ? `$${(t.vol / 1e6).toFixed(1)}M · ${sp.toFixed(1)}bps` : 'אין מחיר' }
}
// a small rate limiter for OKX market endpoints (40 req / 2 s per IP): at most `perSec` starts per second
export function limiter(perSec: number) {
  let next = 0
  return async <T>(f: () => Promise<T>): Promise<T> => {
    const now = Date.now(), at = Math.max(now, next); next = at + 1000 / perSec
    if (at > now) await new Promise((r) => setTimeout(r, at - now))
    return f()
  }
}
export async function pool<T, R>(xs: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length); let i = 0
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => { while (i < xs.length) { const k = i++; out[k] = await f(xs[k]) } }))
  return out
}
export function liquid(t: { vol: number; bid: number; ask: number } | undefined): boolean {
  if (!t || !(t.bid > 0) || !(t.ask >= t.bid)) return false
  return t.vol >= BP.minVolUsd && (t.ask - t.bid) / ((t.ask + t.bid) / 2) * 1e4 <= BP.maxSpreadBps
}

async function listArchive(get: (u: string) => Promise<string>): Promise<string[]> {
  const out: string[] = []; let marker = ''
  for (let i = 0; i < 10; i++) {
    const x = await get(S3 + (marker ? `&marker=${encodeURIComponent(marker)}` : ''))
    for (const m of x.matchAll(/<Prefix>data\/futures\/um\/daily\/klines\/([^<]*)\/<\/Prefix>/g)) out.push(m[1])
    if (!/<IsTruncated>true/.test(x)) break
    marker = /<NextMarker>([^<]*)<\/NextMarker>/.exec(x)?.[1] ?? ''
    if (!marker) break
  }
  return out
}
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)

// Binance USDT perps with a daily 1h kline file in the last 3 days (the archive lags ~1 day). Throws if the archive fails.
export async function binancePerps(now = Date.now()): Promise<string[]> {
  const get = async (u: string) => { const r = await fetch(u); if (!r.ok) throw new Error(`archive ${r.status}`); return r.text() }
  const bases = perpBases(await listArchive(get))
  if (bases.length < 100) throw new Error(`archive listed only ${bases.length} USDT perps`)
  const days = [1, 2, 3].map((k) => day(now - k * 86400_000))
  const alive = async (b: string) => {
    for (const d of days) {
      try { const r = await fetch(`${ARCH}/${b}USDT/1h/${b}USDT-1h-${d}.zip`, { method: 'HEAD' }); if (r.ok) return true } catch { /* try older */ }
    }
    return false
  }
  const ok: string[] = []
  for (let i = 0; i < bases.length; i += 32) {
    const part = bases.slice(i, i + 32), res = await Promise.all(part.map(alive))
    part.forEach((b, k) => { if (res[k]) ok.push(b) })
  }
  return ok
}

// OKX USDT swaps that are CRYPTO (instCategory '1'; '3' = stocks, '4' = commodities) and live
export async function okxCryptoSwaps(): Promise<Set<string>> {
  const r = await fetch('https://www.okx.com/api/v5/public/instruments?instType=SWAP'); if (!r.ok) throw new Error(`okx instruments ${r.status}`)
  const d: any = await r.json()
  return new Set<string>((d.data ?? []).filter((x: any) => x.settleCcy === 'USDT' && x.state === 'live' && x.instCategory === '1' && /-USDT-SWAP$/.test(x.instId))
    .map((x: any) => x.instId.slice(0, -10)))
}
export const universeDue = (prev: Universe | null | undefined, now = Date.now()) => !prev || now - Date.parse(prev.at) >= BP.refreshMs
// Refresh the cached universe at most once a day; on failure keep the previous one; never below BP.minPairs.
export async function refreshUniverse(prev: Universe | null | undefined, now = Date.now()): Promise<{ u: Universe | null; error?: string }> {
  if (!universeDue(prev, now)) return { u: prev! }
  try {
    const [bins, sw] = await Promise.all([binancePerps(now), okxCryptoSwaps()]), { coins, no_okx } = matchOkx(bins, sw)
    if (coins.length < BP.minPairs) throw new Error(`only ${coins.length} matched OKX swaps`)
    return { u: { at: new Date(now).toISOString(), binance: bins.length, coins, no_okx } }
  } catch (e) { return { u: prev ?? null, error: String(e).slice(0, 120) } }
}

// v96.0 — FORWARD DATA COLLECTION. Nothing here trades. These are pure parsers for public sources that have NO usable
// historical archive, so the only way to ever backtest them is to start recording them now:
//   - liquidations: Binance `!forceOrder@arr` websocket (the largest liquidation per symbol per second, all USDT-M)
//                   + OKX public liquidation-orders (filled, per instrument family; sizes in CONTRACTS x ctVal)
//   - options:      Deribit public book summary (BTC/ETH) -> OI/volume put/call, ATM IV and a +/-10% moneyness skew
//                   for the nearest expiry >= 7 days, plus the DVOL index
//   - news:         RSS items with their published timestamp and the pinned coins they name
//   - derivatives:  Binance open interest + funding + mark/index premium for the pinned 40 at 5-minute buckets
// On-chain exchange flows are NOT collected: every source found (CryptoQuant, Glassnode) is paid / keyed.
// Every parser is total: a malformed row is dropped, never thrown on.

export interface Liq { source: string; symbol: string; side: 'long' | 'short'; px: number; qty: number; usd: number; ts: number }
export interface OptSummary {
  currency: string; ts: number; underlying: number; expiry: string; days: number
  atm_iv: number; iv_put10: number; iv_call10: number; skew10: number
  put_oi: number; call_oi: number; pc_oi: number; put_vol: number; call_vol: number; instruments: number
}
export interface News { url: string; source: string; title: string; published_at: number; coins: string[] }

const fin = (x: unknown) => { const v = Number(x); return Number.isFinite(v) ? v : NaN }

// Binance USDT-M symbol -> our coin name (1000PEPE -> PEPE with qty x1000 / px /1000 so px is per ONE coin)
export function binanceCoin(sym: string): { coin: string; k: number } | null {
  if (!/^[A-Z0-9]+USDT$/.test(sym)) return null
  const base = sym.slice(0, -4)
  if (base === '1000PEPE') return { coin: 'PEPE', k: 1000 }
  return { coin: base, k: 1 }
}

// forceOrder event: o.S = order side. SELL = a LONG was liquidated, BUY = a SHORT was liquidated.
// Price: the average fill price (ap) when present, else the order price (p). Quantity: filled (z) else original (q).
export function parseForceOrder(msg: any): Liq | null {
  const o = msg?.o ?? msg?.data?.o
  if (!o || typeof o.s !== 'string') return null
  const c = binanceCoin(o.s)
  if (!c) return null
  const px = fin(o.ap) > 0 ? fin(o.ap) : fin(o.p), qty = fin(o.z) > 0 ? fin(o.z) : fin(o.q), ts = fin(o.T)
  if (!(px > 0 && qty > 0 && ts > 0) || (o.S !== 'SELL' && o.S !== 'BUY')) return null
  return { source: 'binance', symbol: c.coin, side: o.S === 'SELL' ? 'long' : 'short', px: px / c.k, qty: qty * c.k, usd: px * qty, ts }
}

// OKX liquidation-orders response for one instFamily; ctVal = coins per contract for that SWAP instrument.
export function parseOkxLiqs(d: any, coin: string, ctVal: number): Liq[] {
  if (d?.code !== '0' || !(ctVal > 0)) return []
  const out: Liq[] = []
  for (const g of d.data ?? []) {
    if (g?.instId !== `${coin}-USDT-SWAP`) continue
    for (const e of g.details ?? []) {
      const px = fin(e.bkPx), sz = fin(e.sz), ts = fin(e.ts)
      if (!(px > 0 && sz > 0 && ts > 0)) continue
      const side: 'long' | 'short' = e.posSide === 'long' || (!e.posSide && e.side === 'sell') ? 'long' : 'short'
      const qty = sz * ctVal
      out.push({ source: 'okx', symbol: coin, side, px, qty, usd: px * qty, ts })
    }
  }
  return out
}

// Deribit instrument name: BTC-28SEP26-88000-P
const MON: Record<string, number> = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 }
export function parseInstrument(name: string): { expiry: string; expMs: number; strike: number; type: 'C' | 'P' } | null {
  const m = /^[A-Z]+-(\d{1,2})([A-Z]{3})(\d{2})-(\d+(?:d\d+)?)-([CP])$/.exec(name)
  if (!m || MON[m[2]] === undefined) return null
  const expMs = Date.UTC(2000 + Number(m[3]), MON[m[2]], Number(m[1]), 8) // Deribit expiries settle 08:00 UTC
  return { expiry: `${m[1]}${m[2]}${m[3]}`, expMs, strike: Number(m[4].replace('d', '.')), type: m[5] as 'C' | 'P' }
}

// Aggregates over the whole option book + a smile read on ONE expiry (nearest >= minDays out).
// Skew10 = IV(put, strike ~0.9 x underlying) - IV(call, strike ~1.1 x underlying), in vol points: > 0 = puts bid (fear).
export function summarizeOptions(currency: string, rows: any[], now: number, minDays = 7): OptSummary | null {
  const parsed = (rows ?? []).map(r => ({ r, p: parseInstrument(String(r?.instrument_name ?? '')) })).filter(x => x.p)
  if (!parsed.length) return null
  let put_oi = 0, call_oi = 0, put_vol = 0, call_vol = 0
  for (const { r, p } of parsed) {
    const oi = fin(r.open_interest) || 0, v = fin(r.volume) || 0
    if (p!.type === 'P') { put_oi += oi; put_vol += v } else { call_oi += oi; call_vol += v }
  }
  const expiries = [...new Set(parsed.map(x => x.p!.expMs))].filter(e => e - now >= minDays * 86400_000).sort((a, b) => a - b)
  const exp = expiries[0]
  let atm_iv = NaN, iv_put10 = NaN, iv_call10 = NaN, underlying = NaN, expiry = '', days = NaN
  if (exp !== undefined) {
    const leg = parsed.filter(x => x.p!.expMs === exp && fin(x.r.mark_iv) > 0 && fin(x.r.underlying_price) > 0)
    if (leg.length) {
      underlying = fin(leg[0].r.underlying_price); expiry = leg[0].p!.expiry; days = (exp - now) / 86400_000
      const nearest = (type: 'C' | 'P' | null, target: number) => {
        let best: any = null, bd = Infinity
        for (const x of leg) if (!type || x.p!.type === type) { const d = Math.abs(x.p!.strike - target); if (d < bd) { bd = d; best = x } }
        return best ? fin(best.r.mark_iv) : NaN
      }
      const c = nearest('C', underlying), p = nearest('P', underlying)
      atm_iv = Number.isFinite(c) && Number.isFinite(p) ? (c + p) / 2 : Number.isFinite(c) ? c : p
      iv_put10 = nearest('P', underlying * 0.9); iv_call10 = nearest('C', underlying * 1.1)
    }
  }
  return {
    currency, ts: now, underlying, expiry, days, atm_iv, iv_put10, iv_call10, skew10: iv_put10 - iv_call10,
    put_oi, call_oi, pc_oi: call_oi > 0 ? put_oi / call_oi : NaN, put_vol, call_vol, instruments: parsed.length,
  }
}

// Last close of the DVOL candles ([[ts, o, h, l, c], ...]).
export function lastDvol(d: any): number {
  const rows = d?.result?.data
  if (!Array.isArray(rows) || !rows.length) return NaN
  return fin(rows[rows.length - 1]?.[4])
}

const tag = (x: string, n: string) => { const m = x.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`)); return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '' }
// Coins named in a title: whole-word ticker or the common name. Short/ambiguous tickers (OP, ONE…) need the name.
const NAMES: Record<string, string[]> = {
  BTC: ['bitcoin'], ETH: ['ethereum', 'ether'], SOL: ['solana'], BNB: ['binance coin', 'bnb chain'], XRP: ['ripple'],
  DOGE: ['dogecoin'], ADA: ['cardano'], AVAX: ['avalanche'], LINK: ['chainlink'], DOT: ['polkadot'], LTC: ['litecoin'],
  BCH: ['bitcoin cash'], NEAR: ['near protocol'], INJ: ['injective'], SUI: [], TRX: ['tron'], APT: ['aptos'],
  ARB: ['arbitrum'], OP: ['optimism'], ATOM: ['cosmos'], FIL: ['filecoin'], UNI: ['uniswap'], AAVE: [], ICP: ['internet computer'],
  ALGO: ['algorand'], SEI: [], WLD: ['worldcoin', 'world network'], TIA: ['celestia'], RUNE: ['thorchain'], LDO: ['lido'],
  CRV: ['curve finance'], DYDX: [], GALA: [], SAND: ['the sandbox'], AXS: ['axie infinity'], IMX: ['immutable'], ENA: ['ethena'],
  PEPE: [], WIF: ['dogwifhat'], FET: ['fetch.ai', 'artificial superintelligence alliance'],
}
const AMBIGUOUS = new Set(['OP', 'NEAR', 'LINK', 'DOT', 'SAND', 'UNI', 'ICP', 'SUI'])
export function coinsIn(title: string, coins: readonly string[] = Object.keys(NAMES)): string[] {
  const low = title.toLowerCase(), out: string[] = []
  for (const c of coins) {
    const byTicker = !AMBIGUOUS.has(c) && new RegExp(`(^|[^A-Za-z0-9$])\\$?${c}([^A-Za-z0-9]|$)`).test(title)
    const byName = (NAMES[c] ?? []).some(n => new RegExp(`(^|[^a-z])${n.replace('.', '\\.')}([^a-z]|$)`).test(low))
    if (byTicker || byName) out.push(c)
  }
  return out
}
export function parseRssItems(xml: string, source: string): News[] {
  return String(xml ?? '').split('<item>').slice(1).map(x => {
    const title = tag(x, 'title'), url = tag(x, 'link'), ts = Date.parse(tag(x, 'pubDate'))
    return { url, source, title, published_at: ts, coins: coinsIn(title) }
  }).filter(n => n.title && n.url && Number.isFinite(n.published_at))
}

// 5-minute bucket used as the derivatives snapshot key, so a re-run in the same bucket upserts instead of duplicating.
export const bucket5m = (t: number) => Math.floor(t / 300_000) * 300_000

// Pure math and frame parsers for the Binance paper-futures tab.
// Display only: the desk still books fills on its 15-minute cycle.
// Isolated uPnL / maintenance / liquidation match binance-paper-bot/bot/margin.py.

export const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT']

export interface Quote {
  bid: number
  ask: number
  last: number
  mark: number
  funding: number | null
  nextFunding: number | null
  ts: number
}

export interface Bracket { floor: number; cap: number; mmr: number; cum: number }

export function blankQuote(): Quote {
  return { bid: 0, ask: 0, last: 0, mark: 0, funding: null, nextFunding: null, ts: 0 }
}

export function num(v: unknown): number | null {
  const n = typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

// First brackets from binance-paper-bot/data/market_meta.json (Binance USDT-M, 2026-10).
// A snapshot may carry a fresher table; this is the fallback before that field exists.
export const CACHED_BRACKETS: Record<string, Bracket[]> = {
  ETHUSDT: [
    { floor: 0, cap: 300000, mmr: 0.004, cum: 0 },
    { floor: 300000, cap: 800000, mmr: 0.005, cum: 300 },
    { floor: 800000, cap: 3000000, mmr: 0.0065, cum: 1500 },
    { floor: 3000000, cap: 12000000, mmr: 0.01, cum: 12000 },
    { floor: 12000000, cap: 50000000, mmr: 0.02, cum: 132000 },
    { floor: 50000000, cap: 65000000, mmr: 0.025, cum: 382000 },
    { floor: 65000000, cap: 150000000, mmr: 0.05, cum: 2007000 },
    { floor: 150000000, cap: 320000000, mmr: 0.1, cum: 9507000 },
    { floor: 320000000, cap: 400000000, mmr: 0.125, cum: 17507000 },
    { floor: 400000000, cap: 530000000, mmr: 0.15, cum: 27507000 },
    { floor: 530000000, cap: 800000000, mmr: 0.25, cum: 80507000 },
    { floor: 800000000, cap: 1200000000, mmr: 0.5, cum: 280507000 },
  ],
  XRPUSDT: [
    { floor: 0, cap: 40000, mmr: 0.005, cum: 0 },
    { floor: 40000, cap: 80000, mmr: 0.006, cum: 40 },
    { floor: 80000, cap: 150000, mmr: 0.01, cum: 360 },
    { floor: 150000, cap: 400000, mmr: 0.0125, cum: 735 },
    { floor: 400000, cap: 1000000, mmr: 0.02, cum: 3735 },
    { floor: 1000000, cap: 2000000, mmr: 0.025, cum: 8735 },
    { floor: 2000000, cap: 10000000, mmr: 0.05, cum: 58735 },
    { floor: 10000000, cap: 20000000, mmr: 0.1, cum: 558735 },
    { floor: 20000000, cap: 25000000, mmr: 0.125, cum: 1058735 },
    { floor: 25000000, cap: 50000000, mmr: 0.25, cum: 4183735 },
    { floor: 50000000, cap: 100000000, mmr: 0.5, cum: 16683735 },
  ],
  BTCUSDT: [
    { floor: 0, cap: 300000, mmr: 0.004, cum: 0 },
    { floor: 300000, cap: 800000, mmr: 0.005, cum: 300 },
    { floor: 800000, cap: 3000000, mmr: 0.0065, cum: 1500 },
    { floor: 3000000, cap: 12000000, mmr: 0.01, cum: 12000 },
    { floor: 12000000, cap: 70000000, mmr: 0.02, cum: 132000 },
    { floor: 70000000, cap: 100000000, mmr: 0.025, cum: 482000 },
    { floor: 100000000, cap: 230000000, mmr: 0.05, cum: 2982000 },
    { floor: 230000000, cap: 480000000, mmr: 0.1, cum: 14482000 },
    { floor: 480000000, cap: 600000000, mmr: 0.125, cum: 26482000 },
    { floor: 600000000, cap: 800000000, mmr: 0.15, cum: 41482000 },
    { floor: 800000000, cap: 1200000000, mmr: 0.25, cum: 121482000 },
    { floor: 1200000000, cap: 1800000000, mmr: 0.5, cum: 421482000 },
  ],
  SOLUSDT: [
    { floor: 0, cap: 50000, mmr: 0.005, cum: 0 },
    { floor: 50000, cap: 400000, mmr: 0.0065, cum: 75 },
    { floor: 400000, cap: 1000000, mmr: 0.01, cum: 1475 },
    { floor: 1000000, cap: 4000000, mmr: 0.02, cum: 11475 },
    { floor: 4000000, cap: 8000000, mmr: 0.025, cum: 31475 },
    { floor: 8000000, cap: 40000000, mmr: 0.05, cum: 231475 },
    { floor: 40000000, cap: 80000000, mmr: 0.1, cum: 2231475 },
    { floor: 80000000, cap: 100000000, mmr: 0.125, cum: 4231475 },
    { floor: 100000000, cap: 200000000, mmr: 0.25, cum: 16731475 },
    { floor: 200000000, cap: 400000000, mmr: 0.5, cum: 66731475 },
  ],
  BNBUSDT: [
    { floor: 0, cap: 10000, mmr: 0.005, cum: 0 },
    { floor: 10000, cap: 200000, mmr: 0.006, cum: 10 },
    { floor: 200000, cap: 400000, mmr: 0.01, cum: 810 },
    { floor: 400000, cap: 1500000, mmr: 0.02, cum: 4810 },
    { floor: 1500000, cap: 3000000, mmr: 0.025, cum: 12310 },
    { floor: 3000000, cap: 15000000, mmr: 0.05, cum: 87310 },
    { floor: 15000000, cap: 30000000, mmr: 0.1, cum: 837310 },
    { floor: 30000000, cap: 37500000, mmr: 0.125, cum: 1587310 },
    { floor: 37500000, cap: 75000000, mmr: 0.25, cum: 6274810 },
    { floor: 75000000, cap: 150000000, mmr: 0.5, cum: 25024810 },
  ],
}

const APPROX: Bracket[] = [{ floor: 0, cap: 1e15, mmr: 0.004, cum: 0 }]

export function bracketsFromState(st: { brackets?: { symbol: string; brackets: Bracket[] }[] } | null | undefined): Record<string, Bracket[]> {
  const out: Record<string, Bracket[]> = {}
  for (const row of st?.brackets ?? []) {
    if (row?.symbol && Array.isArray(row.brackets) && row.brackets.length) out[row.symbol] = row.brackets
  }
  return out
}

export function bracketFor(symbol: string, notional: number, tables?: Record<string, Bracket[]>): Bracket {
  const list = (tables && tables[symbol]?.length ? tables[symbol] : CACHED_BRACKETS[symbol]) ?? APPROX
  const n = Number.isFinite(notional) && notional > 0 ? notional : 0
  for (const b of list) if (b.floor <= n && n < b.cap) return b
  return list[list.length - 1]
}

export function binanceStreams(symbols: string[]): string {
  return symbols.map((s) => s.toLowerCase()).flatMap((s) => [`${s}@markPrice@1s`, `${s}@bookTicker`, `${s}@miniTicker`]).join('/')
}

// 2026 futures WS is split: /market carries markPrice + miniTicker, /public and the
// legacy /stream carry bookTicker. One socket cannot fill the whole row.
export function binanceMarkUrl(symbols: string[]): string {
  const streams = symbols.map((s) => s.toLowerCase()).flatMap((s) => [`${s}@markPrice@1s`, `${s}@miniTicker`]).join('/')
  return `wss://fstream.binance.com/market/stream?streams=${streams}`
}

export function binanceBookUrls(symbols: string[]): string[] {
  const streams = symbols.map((s) => `${s.toLowerCase()}@bookTicker`).join('/')
  return [
    `wss://fstream.binance.com/public/stream?streams=${streams}`,
    `wss://fstream.binance.com/stream?streams=${streams}`,
  ]
}

export const OKX_WS = 'wss://ws.okx.com:8443/ws/v5/public'

export function okxInst(symbol: string): string {
  return `${symbol.replace(/USDT$/, '')}-USDT-SWAP`
}

export function symFromOkx(inst: string): string {
  const m = /^([A-Z0-9]+)-USDT-SWAP$/.exec(inst)
  return m ? `${m[1]}USDT` : ''
}

function touch(book: Record<string, Quote>, sym: string): Quote | null {
  if (!sym || !sym.endsWith('USDT')) return null
  return book[sym] ?? (book[sym] = blankQuote())
}

/** Combined-stream frame, or a raw event. Returns the symbol when a price field moved. */
export function applyBinanceFrame(book: Record<string, Quote>, msg: any, now: number): string | null {
  const d = msg?.data && (msg.data.e || msg.data.s) ? msg.data : msg
  if (!d || typeof d !== 'object') return null
  const q = touch(book, String(d.s || ''))
  if (!q) return null
  let hit = false
  if (d.e === 'markPriceUpdate') {
    const mark = num(d.p)
    const rate = num(d.r)
    const next = num(d.T)
    if (mark != null && mark > 0) { q.mark = mark; hit = true }
    if (rate != null) q.funding = rate
    if (next != null && next > 0) q.nextFunding = next
  } else if (d.e === 'bookTicker') {
    const bid = num(d.b), ask = num(d.a)
    if (bid != null && bid > 0) { q.bid = bid; hit = true }
    if (ask != null && ask > 0) { q.ask = ask; hit = true }
  } else if (d.e === '24hrMiniTicker') {
    const last = num(d.c)
    if (last != null && last > 0) { q.last = last; hit = true }
  }
  if (!hit) return null
  q.ts = num(d.E) ?? now
  return String(d.s)
}

export function applyOkxFrame(book: Record<string, Quote>, msg: any, now: number): string | null {
  if (msg?.event || !msg?.arg) return null
  const row = Array.isArray(msg.data) ? msg.data[0] : null
  if (!row) return null
  const q = touch(book, symFromOkx(String(row.instId || msg.arg.instId || '')))
  if (!q) return null
  const ch = msg.arg.channel
  let hit = false
  if (ch === 'tickers') {
    const last = num(row.last), bid = num(row.bidPx), ask = num(row.askPx)
    if (last != null && last > 0) { q.last = last; hit = true }
    if (bid != null && bid > 0) { q.bid = bid; hit = true }
    if (ask != null && ask > 0) { q.ask = ask; hit = true }
  } else if (ch === 'mark-price') {
    const mark = num(row.markPx)
    if (mark != null && mark > 0) { q.mark = mark; hit = true }
  } else if (ch === 'funding-rate') {
    const rate = num(row.fundingRate)
    const next = num(row.nextFundingTime) ?? num(row.fundingTime)
    if (rate != null) { q.funding = rate; hit = true }
    if (next != null && next > 0) q.nextFunding = next
  }
  if (!hit) return null
  q.ts = num(row.ts) ?? now
  return symFromOkx(String(row.instId || msg.arg.instId || ''))
}

function rowsOf(payload: any): any[] {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.data)) return payload.data
  if (payload && typeof payload === 'object') return [payload]
  return []
}

export function applyPremiumIndex(book: Record<string, Quote>, payload: any, now: number, want?: Set<string>): number {
  let n = 0
  for (const row of rowsOf(payload)) {
    const sym = String(row.symbol || '')
    if (want && !want.has(sym)) continue
    const q = touch(book, sym)
    if (!q) continue
    const mark = num(row.markPrice)
    const rate = num(row.lastFundingRate)
    const next = num(row.nextFundingTime)
    if (mark == null || mark <= 0) continue
    q.mark = mark
    if (rate != null) q.funding = rate
    if (next != null && next > 0) q.nextFunding = next
    q.ts = num(row.time) ?? now
    n++
  }
  return n
}

export function applyBookTickers(book: Record<string, Quote>, payload: any, now: number, want?: Set<string>): number {
  let n = 0
  for (const row of rowsOf(payload)) {
    const sym = String(row.symbol || '')
    if (want && !want.has(sym)) continue
    const q = touch(book, sym)
    if (!q) continue
    const bid = num(row.bidPrice), ask = num(row.askPrice)
    if (bid != null && bid > 0) q.bid = bid
    if (ask != null && ask > 0) q.ask = ask
    if ((bid != null && bid > 0) || (ask != null && ask > 0)) { q.ts = num(row.time) ?? now; n++ }
  }
  return n
}

export function applyLastPrices(book: Record<string, Quote>, payload: any, now: number, want?: Set<string>): number {
  let n = 0
  for (const row of rowsOf(payload)) {
    const sym = String(row.symbol || '')
    if (want && !want.has(sym)) continue
    const q = touch(book, sym)
    const last = num(row.price)
    if (!q || last == null || last <= 0) continue
    q.last = last
    q.ts = num(row.time) ?? now
    n++
  }
  return n
}

export function applyOkxTickers(book: Record<string, Quote>, payload: any, now: number, want?: Set<string>): number {
  let n = 0
  for (const row of rowsOf(payload)) {
    const sym = symFromOkx(String(row.instId || ''))
    if (want && !want.has(sym)) continue
    const q = touch(book, sym)
    if (!q) continue
    const last = num(row.last), bid = num(row.bidPx), ask = num(row.askPx)
    if (last != null && last > 0) q.last = last
    if (bid != null && bid > 0) q.bid = bid
    if (ask != null && ask > 0) q.ask = ask
    if ((last != null && last > 0) || (bid != null && bid > 0)) { q.ts = num(row.ts) ?? now; n++ }
  }
  return n
}

export function applyOkxMarks(book: Record<string, Quote>, payload: any, now: number, want?: Set<string>): number {
  let n = 0
  for (const row of rowsOf(payload)) {
    const sym = symFromOkx(String(row.instId || ''))
    if (want && !want.has(sym)) continue
    const q = touch(book, sym)
    const mark = num(row.markPx)
    if (!q || mark == null || mark <= 0) continue
    q.mark = mark
    q.ts = num(row.ts) ?? now
    n++
  }
  return n
}

export function applyOkxFunding(book: Record<string, Quote>, payload: any, now: number): boolean {
  const row = rowsOf(payload)[0]
  if (!row) return false
  const q = touch(book, symFromOkx(String(row.instId || '')))
  if (!q) return false
  const rate = num(row.fundingRate)
  const next = num(row.nextFundingTime) ?? num(row.fundingTime)
  if (rate == null) return false
  q.funding = rate
  if (next != null && next > 0) q.nextFunding = next
  q.ts = now
  return true
}

/** A live perp cannot plausibly be 10x its own booked mark during one open paper trade. */
export function saneMark(booked: number, live: number): number {
  if (!(live > 0)) return booked > 0 ? booked : 0
  if (booked > 0 && (live / booked > 10 || booked / live > 10)) return booked
  return live
}

export interface PosView {
  upnl: number
  roe: number
  marginRatio: number
  dist: number | null
  notional: number
  margin: number
  mark: number
}

export function positionLive(p: any, liveMark: number, tables?: Record<string, Bracket[]>): PosView {
  const side = p?.side === 'SHORT' ? -1 : 1
  const qty = Number(p?.qty) || 0
  const entry = Number(p?.entry) || 0
  const booked = Number(p?.mark) || entry
  const mark = saneMark(booked, liveMark)
  const upnl = side * qty * (mark - entry)
  const lev = Number(p?.leverage) || 0
  const margin = Number(p?.isolated_margin) > 0 ? Number(p.isolated_margin) : (lev > 0 && entry > 0 ? qty * entry / lev : 0)
  const roe = margin > 0 ? upnl / margin : 0
  const notional = Math.abs(qty * mark)
  const symbol = String(p?.symbol || '')
  const known = (tables && tables[symbol]?.length) || CACHED_BRACKETS[symbol]
  const br = known
    ? bracketFor(symbol, notional, tables)
    : { floor: 0, cap: 1e15, mmr: Number(p?.mmr ?? 0.004), cum: Number(p?.cum) || 0 }
  const maint = notional * br.mmr - br.cum
  const mb = margin + upnl
  const marginRatio = mb > 0 ? maint / mb : Number.POSITIVE_INFINITY
  const liq = Number(p?.liq)
  const dist = liq > 0 && mark > 0 ? (side > 0 ? (mark - liq) / mark : (liq - mark) / mark) : null
  return { upnl, roe, marginRatio, dist, notional, margin, mark }
}

export function fundingLeft(next: number | null | undefined, now: number): string {
  if (!next || !Number.isFinite(next)) return '—'
  let s = Math.round((next - now) / 1000)
  const late = s < 0
  s = Math.abs(s)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const clock = `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
  return late ? `0:00:00` : clock
}

export function decodeStateBody(text: string): any {
  const t = text.trim()
  const j = JSON.parse(t)
  if (j && typeof j === 'object' && j.encoding === 'base64' && typeof j.content === 'string' && j.wallet == null) {
    const raw = atob(j.content.replace(/\n/g, ''))
    return JSON.parse(raw)
  }
  return j
}

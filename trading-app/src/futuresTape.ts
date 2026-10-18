// Live public tape for the futures tab. The bot does not see these prices.
// Binance USDT-M is two sockets: /market (mark + last + funding) and /public
// then legacy /stream (bid/ask). If both are silent, OKX public WS. If that
// is silent too, REST every 2.5s (www.binance.com/fapi, then OKX). A socket
// that was delivering reconnects with backoff before the next source is tried.
import { useEffect, useState } from 'react'
import {
  OKX_WS, SYMBOLS, applyBinanceFrame, applyBookTickers, applyLastPrices,
  applyOkxFrame, applyOkxFunding, applyOkxMarks, applyOkxTickers, applyPremiumIndex,
  binanceBookUrls, binanceMarkUrl, blankQuote, decodeStateBody, okxInst, type Quote,
} from './futuresMath'

const STATE_API = 'https://api.github.com/repos/aliexpressgood585/spacehub/contents/binance-paper/state.json?ref=pm-desk-data'
const STATE_RAW = 'https://raw.githubusercontent.com/aliexpressgood585/spacehub/pm-desk-data/binance-paper/state.json'
const STATE_MS = 45_000
const REST_MS = 2_500
const FLUSH_MS = 200
const SILENT_MS = 5_000

export interface TapeState {
  quotes: Record<string, Quote>
  series: Record<string, number[]>
  source: string
  tickAt: number
  connected: boolean
}

let apiCooldownUntil = 0

export async function fetchDeskState(override?: string | null): Promise<any> {
  if (override) {
    const r = await fetch(`${override}${override.includes('?') ? '&' : '?'}t=${Date.now()}`, { cache: 'no-store' })
    if (!r.ok) throw new Error(String(r.status))
    return decodeStateBody(await r.text())
  }
  if (Date.now() >= apiCooldownUntil) {
    try {
      const r = await fetch(`${STATE_API}&t=${Date.now()}`, {
        headers: { Accept: 'application/vnd.github.raw' },
        cache: 'no-store',
      })
      if (r.status === 403 || r.status === 429) apiCooldownUntil = Date.now() + 5 * 60_000
      else if (r.ok) return decodeStateBody(await r.text())
    } catch { /* raw fallback */ }
  }
  const r = await fetch(`${STATE_RAW}?t=${Date.now()}`, { cache: 'no-store' })
  if (!r.ok) throw new Error(String(r.status))
  return r.json()
}

export function useDeskState() {
  const [st, setSt] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState(0)
  useEffect(() => {
    let dead = false
    const override = new URLSearchParams(location.search).get('state')
    const load = async () => {
      try {
        const j = await fetchDeskState(override)
        if (!dead) { setSt(j); setErr(null); setFetchedAt(Date.now()) }
      } catch (e) { if (!dead) setErr(String(e)) }
    }
    load()
    const id = setInterval(load, STATE_MS)
    return () => { dead = true; clearInterval(id) }
  }, [])
  return { st, err, fetchedAt }
}

async function pollBinance(book: Record<string, Quote>, want: Set<string>, now: number): Promise<boolean> {
  const base = 'https://www.binance.com/fapi/v1'
  const [pi, bk, px] = await Promise.all([
    fetch(`${base}/premiumIndex`, { cache: 'no-store' }),
    fetch(`${base}/ticker/bookTicker`, { cache: 'no-store' }),
    fetch(`${base}/ticker/price`, { cache: 'no-store' }),
  ])
  if (!pi.ok) return false
  const n = applyPremiumIndex(book, await pi.json(), now, want)
  if (bk.ok) applyBookTickers(book, await bk.json(), now, want)
  if (px.ok) applyLastPrices(book, await px.json(), now, want)
  return n > 0
}

async function pollOkx(book: Record<string, Quote>, symbols: string[], now: number): Promise<boolean> {
  const want = new Set(symbols)
  const [tk, mk] = await Promise.all([
    fetch('https://www.okx.com/api/v5/market/tickers?instType=SWAP', { cache: 'no-store' }),
    fetch('https://www.okx.com/api/v5/public/mark-price?instType=SWAP', { cache: 'no-store' }),
  ])
  if (!tk.ok && !mk.ok) return false
  let n = 0
  if (tk.ok) n += applyOkxTickers(book, await tk.json(), now, want)
  if (mk.ok) n += applyOkxMarks(book, await mk.json(), now, want)
  await Promise.all(symbols.map(async (s) => {
    try {
      const r = await fetch(`https://www.okx.com/api/v5/public/funding-rate?instId=${okxInst(s)}`, { cache: 'no-store' })
      if (r.ok) applyOkxFunding(book, await r.json(), now)
    } catch { /* one coin can miss */ }
  }))
  return n > 0
}

export function useFuturesTape(symbols: string[] = SYMBOLS): TapeState {
  const key = (symbols.length ? symbols : SYMBOLS).join(',')
  const [quotes, setQuotes] = useState<Record<string, Quote>>({})
  const [series, setSeries] = useState<Record<string, number[]>>({})
  const [source, setSource] = useState('')
  const [tickAt, setTickAt] = useState(0)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const syms = key.split(',')
    const want = new Set(syms)
    const book: Record<string, Quote> = {}
    const hist: Record<string, number[]> = {}
    let dead = false
    let dirty = false
    let label = ''
    let live = false
    let lastTick = 0
    let rest: ReturnType<typeof setInterval> | null = null
    let upgrade: ReturnType<typeof setTimeout> | null = null
    const alive = { mark: false, book: false, okx: false }
    const closers: (() => void)[] = []

    const note = (nextLabel: string, nextLive: boolean) => {
      dirty = true
      lastTick = Date.now()
      if (nextLabel === label && nextLive === live) return
      label = nextLabel
      live = nextLive
      setSource(nextLabel)
      setConnected(nextLive)
    }
    const remember = (sym: string) => {
      const mark = book[sym]?.mark
      if (!(mark > 0)) return
      const arr = hist[sym] ?? (hist[sym] = [])
      if (arr[arr.length - 1] !== mark) arr.push(mark)
      if (arr.length > 180) arr.splice(0, arr.length - 180)
    }
    const describe = () => {
      if (alive.mark && alive.book) return 'Binance WS'
      if (alive.mark) return 'Binance WS · market'
      if (alive.book) return 'Binance WS · public'
      if (alive.okx) return 'OKX WS'
      return ''
    }

    // One ladder: try urls in order, reconnect a live socket with backoff,
    // and report when every url has failed to deliver a frame.
    const ladder = (urls: string[], onMsg: (msg: any, now: number) => string | null, kind: 'mark' | 'book' | 'okx', onOpen?: (ws: WebSocket) => void) => {
      let idx = 0
      let attempt = 0
      let got = false
      let gen = 0
      let ws: WebSocket | null = null
      let silence: ReturnType<typeof setTimeout> | null = null
      let retry: ReturnType<typeof setTimeout> | null = null
      let ping: ReturnType<typeof setInterval> | null = null
      const drop = () => {
        if (silence) clearTimeout(silence)
        if (ping) clearInterval(ping)
        silence = null
        ping = null
        const old = ws
        ws = null
        try { old?.close() } catch { /* closing */ }
      }
      const open = () => {
        if (dead) return
        const my = ++gen
        got = false
        alive[kind] = false
        drop()
        let sock: WebSocket
        try { sock = new WebSocket(urls[idx]) } catch { step(); return }
        ws = sock
        sock.onopen = () => {
          if (dead || my !== gen) return
          onOpen?.(sock)
          silence = setTimeout(() => { if (!dead && my === gen && !got) try { sock.close() } catch { /* closing */ } }, SILENT_MS)
        }
        sock.onmessage = (ev) => {
          if (dead || my !== gen) return
          const text = String(ev.data)
          if (text === 'pong') return
          let msg: any
          try { msg = JSON.parse(text) } catch { return }
          const sym = onMsg(msg, Date.now())
          if (!sym || !want.has(sym)) return
          got = true
          attempt = 0
          alive[kind] = true
          if (kind === 'mark') markExhausted = false
          if (kind === 'book') bookExhausted = false
          remember(sym)
          const name = describe()
          if (name) note(name, true)
          if (alive.mark && alive.book && rest) { clearInterval(rest); rest = null }
        }
        sock.onerror = () => { try { sock.close() } catch { /* closing */ } }
        sock.onclose = () => {
          if (ping) { clearInterval(ping); ping = null }
          if (dead || my !== gen) return
          alive[kind] = false
          if (!got) step()
          else {
            attempt++
            if (attempt >= 4) { attempt = 0; step(); return }
            retry = setTimeout(open, Math.min(30_000, 1000 * 2 ** (attempt - 1)))
          }
        }
      }
      const step = () => {
        if (dead) return
        attempt = 0
        if (idx < urls.length - 1) { idx++; open() }
        else { idx = 0; alive[kind] = false; onExhausted(kind) }
      }
      const close = () => { gen++; if (retry) clearTimeout(retry); drop() }
      const reopen = () => { if (dead || alive[kind]) return; idx = 0; attempt = 0; open() }
      closers.push(close)
      open()
      return { close, reopen }
    }

    let okx: { close: () => void } | null = null
    let markExhausted = false
    let bookExhausted = false
    const ensureOkx = () => {
      if (dead || okx || alive.mark || alive.book || !markExhausted || !bookExhausted) return
      okx = ladder([OKX_WS], (msg, now) => applyOkxFrame(book, msg, now), 'okx', (sock) => {
        const args = syms.flatMap((s) => ['tickers', 'mark-price', 'funding-rate'].map((channel) => ({ channel, instId: okxInst(s) })))
        sock.send(JSON.stringify({ op: 'subscribe', args }))
        const id = setInterval(() => { try { sock.send('ping') } catch { /* closed */ } }, 20_000)
        sock.addEventListener('close', () => clearInterval(id))
      })
    }

    const poll = async () => {
      if (dead) return
      if (alive.mark && alive.book) return
      if (alive.okx && Date.now() - lastTick < 4_000) return
      const now = Date.now()
      let binance = false
      try { binance = await pollBinance(book, want, now) } catch { binance = false }
      if (dead || (alive.mark && alive.book)) return
      if (binance) {
        for (const s of syms) remember(s)
        const name = describe()
        note(name || 'Binance REST', Boolean(name))
        return
      }
      try {
        if (await pollOkx(book, syms, now)) {
          if (alive.mark && alive.book) return
          for (const s of syms) remember(s)
          const name = describe()
          note(name || 'OKX REST', Boolean(name))
        }
      } catch { /* keep the last quote */ }
    }
    const ensureRest = () => {
      if (rest) return
      void poll()
      rest = setInterval(() => { void poll() }, REST_MS)
    }
    const onExhausted = (kind: 'mark' | 'book' | 'okx') => {
      if (kind === 'mark') markExhausted = true
      if (kind === 'book') bookExhausted = true
      ensureRest()
      if (markExhausted && bookExhausted) ensureOkx()
      if (upgrade) clearTimeout(upgrade)
      upgrade = setTimeout(() => {
        if (dead) return
        if (!alive.mark) markLadder.reopen()
        if (!alive.book) bookLadder.reopen()
      }, 20_000)
    }

    for (const s of syms) book[s] = blankQuote()
    const markLadder = ladder([binanceMarkUrl(syms)], (msg, now) => applyBinanceFrame(book, msg, now), 'mark')
    const bookLadder = ladder(binanceBookUrls(syms), (msg, now) => applyBinanceFrame(book, msg, now), 'book')
    // A partial Binance tape (mark without the book, or the reverse) still fills from REST.
    const gap = setTimeout(() => { if (!dead && (!alive.mark || !alive.book)) ensureRest() }, SILENT_MS)

    const flush = setInterval(() => {
      if (!dirty || dead) return
      dirty = false
      setTickAt(lastTick)
      setQuotes({ ...book })
      const next: Record<string, number[]> = {}
      for (const s of syms) if (hist[s]?.length) next[s] = hist[s].slice()
      setSeries(next)
    }, FLUSH_MS)

    return () => {
      dead = true
      clearInterval(flush)
      clearTimeout(gap)
      if (rest) clearInterval(rest)
      if (upgrade) clearTimeout(upgrade)
      markLadder.close()
      bookLadder.close()
      okx?.close()
      closers.forEach((c) => c())
    }
  }, [key])

  return { quotes, series, source, tickAt, connected }
}

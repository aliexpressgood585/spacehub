import { useEffect, useRef, useState } from 'react'

export type Rsi2Quote = {
  mark?: number
  markAt?: number
  prevMark?: number
  last?: number
  lastAt?: number
  source?: 'WS' | 'REST'
  exchangeAt?: number
}
const CONTRACTS = ['TRADOORUSDT', 'MYXUSDT'] as const
const SYMBOLS = new Set<string>(CONTRACTS)
const STREAMS = CONTRACTS.flatMap(s => [s.toLowerCase() + '@markPrice@1s', s.toLowerCase() + '@miniTicker'])
const WS_URL = 'wss://fstream.binance.com/stream?streams=' + STREAMS.join('/')

// Observational prices only. No Binance authentication or order endpoints.
// The 1-second websocket updates MARK for unrealized P&L. Last traded
// price is informational and must never be confused with the mark price.
export function useRsi2BinanceQuotes() {
  const [quotes, setQuotes] = useState<Record<string, Rsi2Quote>>({})
  const [connected, setConnected] = useState(false)
  const latest = useRef<Record<string, Rsi2Quote>>({})

  useEffect(() => {
    let stopped = false
    let socket: WebSocket | null = null
    let retry: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    const controller = new AbortController()
    const write = (symbol: string, data: Partial<Rsi2Quote>) => {
      if (!SYMBOLS.has(symbol) || stopped) return
      const before = latest.current[symbol] ?? {}
      // Do not let an older REST response override a fresher websocket tick.
      if (data.markAt && before.markAt && data.markAt < before.markAt) return
      const next = { ...before, ...data }
      if (data.mark && data.markAt && before.mark && data.mark !== before.mark) next.prevMark = before.mark
      latest.current = { ...latest.current, [symbol]: next }
      setQuotes(latest.current)
    }
    const connect = () => {
      if (stopped) return
      try {
        const ws = new WebSocket(WS_URL)
        socket = ws
        ws.onopen = () => { attempts = 0; if (!stopped) setConnected(true) }
        ws.onmessage = event => {
          try {
            const msg = JSON.parse(String(event.data))
            const data = msg.data ?? msg
            const symbol = String(data.s ?? '')
            if (!SYMBOLS.has(symbol)) return
            const received = Date.now()
            const eventAt = Number(data.E)
            if (data.e === 'markPriceUpdate') {
              const mark = Number(data.p)
              if (mark > 0 && Number.isFinite(mark)) write(symbol, { mark, markAt: received, source: 'WS', exchangeAt: Number.isFinite(eventAt) ? eventAt : undefined })
            } else if (data.e === '24hrMiniTicker') {
              const last = Number(data.c)
              if (last > 0 && Number.isFinite(last)) write(symbol, { last, lastAt: received })
            }
          } catch { /* unexpected message/subscribe response */ }
        }
        ws.onerror = () => ws.close()
        ws.onclose = () => {
          if (stopped) return
          setConnected(false)
          retry = setTimeout(connect, Math.min(30000, 2000 * Math.pow(2, Math.min(attempts++, 4))))
        }
      } catch {
        setConnected(false)
        if (!stopped) retry = setTimeout(connect, 5000)
      }
    }
    // REST fallback at most once per 15 seconds if mark stream is unavailable.
    // Never synthesize an every-second price when quotes are stale.
    const fallback = async () => {
      const now = Date.now()
      const missing = CONTRACTS.filter(symbol => !(latest.current[symbol]?.source === 'WS' && now - Number(latest.current[symbol]?.markAt ?? 0) < 5000))
      if (!missing.length || stopped) return
      await Promise.all(missing.map(async symbol => {
        try {
          const [premiumResponse, lastResponse] = await Promise.all([
            fetch('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=' + symbol, { signal: controller.signal, cache: 'no-store' }),
            fetch('https://fapi.binance.com/fapi/v1/ticker/price?symbol=' + symbol, { signal: controller.signal, cache: 'no-store' }),
          ])
          if (!premiumResponse.ok || !lastResponse.ok) return
          const [premium, ticker] = await Promise.all([premiumResponse.json(), lastResponse.json()])
          if (premium.symbol !== symbol || ticker.symbol !== symbol) return
          const mark = Number(premium.markPrice), last = Number(ticker.price)
          if (!(mark > 0) || !(last > 0)) return
          const at = Date.now()
          const newer = latest.current[symbol]
          if (newer?.source === 'WS' && at - Number(newer.markAt ?? 0) < 5000) return
          write(symbol, { mark, last, markAt: at, lastAt: at, source: 'REST', exchangeAt: Number(premium.time) || at })
        } catch { /* browser, geography, or network may block Binance; show stale badge */ }
      }))
    }
    connect()
    void fallback()
    const timer = setInterval(() => void fallback(), 15000)
    return () => {
      stopped = true
      controller.abort()
      clearInterval(timer)
      if (retry) clearTimeout(retry)
      if (socket) {
        socket.onclose = null
        socket.close()
      }
    }
  }, [])
  return { quotes, connected }
}

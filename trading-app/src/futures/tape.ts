// Combined Binance USDT-M stream for whatever contracts the desk currently publishes.
// The socket is closed and reopened when the symbol list changes.
import { useEffect, useRef, useState } from 'react'

export type TapeTick = {
  last?: number
  mark?: number
  bid?: number
  ask?: number
  chg?: number | null
  funding?: number | null
  t: number
  src: 'binance' | 'rest'
}

const CHUNK = 24

function chunks(xs: string[], n: number): string[][] {
  const out: string[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

function okxInst(symbol: string): { id: string; k: number } {
  const base = symbol.replace(/USDT$/, '')
  if (/^1000[A-Z]/.test(base)) return { id: `${base.slice(4)}-USDT-SWAP`, k: 1000 }
  return { id: `${base}-USDT-SWAP`, k: 1 }
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? +v : NaN
  return Number.isFinite(n) && n > 0 ? n : undefined
}

export function useFuturesTape(symbols: string[]): Record<string, TapeTick> {
  const key = symbols.join(',')
  const [ticks, setTicks] = useState<Record<string, TapeTick>>({})
  const store = useRef<Record<string, TapeTick>>({})

  useEffect(() => {
    const list = key ? key.split(',') : []
    const keep: Record<string, TapeTick> = {}
    for (const s of list) if (store.current[s]) keep[s] = store.current[s]
    store.current = keep
    setTicks({ ...keep })
    if (!list.length) return

    let dead = false
    const dirty = { v: false }
    const wanted = new Set(list)
    const sockets: WebSocket[] = []
    const timers: ReturnType<typeof setTimeout>[] = []

    const put = (sym: string, patch: Partial<TapeTick>, src: TapeTick['src']) => {
      if (!wanted.has(sym)) return
      const cur = store.current[sym]
      if (src === 'rest' && cur && cur.src === 'binance' && Date.now() - cur.t < 5000) return
      const next: TapeTick = { ...cur, ...patch, t: patch.t ?? Date.now(), src }
      if (cur && cur.last === next.last && cur.mark === next.mark && cur.bid === next.bid && cur.ask === next.ask && cur.chg === next.chg && cur.src === next.src) {
        cur.t = next.t
        return
      }
      store.current[sym] = next
      dirty.v = true
    }

    const onFrame = (raw: string) => {
      let wrap: any
      try { wrap = JSON.parse(raw) } catch { return }
      const d = wrap?.data ?? wrap
      const sym = String(d?.s ?? '').toUpperCase()
      if (!wanted.has(sym)) return
      const e = String(d?.e ?? '')
      if (e === '24hrMiniTicker' || d?.c !== undefined && d?.o !== undefined && d?.b === undefined) {
        const last = num(d.c)
        const open = num(d.o)
        if (last) put(sym, { last, chg: open ? (last - open) / open : null }, 'binance')
        return
      }
      if (e === 'markPriceUpdate' || (d?.p !== undefined && d?.r !== undefined && d?.b === undefined)) {
        const mark = num(d.p)
        const funding = Number(d.r)
        if (mark) put(sym, { mark, funding: Number.isFinite(funding) ? funding : null }, 'binance')
        return
      }
      if (d?.b !== undefined && d?.a !== undefined) {
        const bid = num(d.b), ask = num(d.a)
        if (bid && ask) put(sym, { bid, ask, last: (bid + ask) / 2 }, 'binance')
      }
    }

    const openSocket = (part: string[], attempt = 0) => {
      if (dead) return
      const streams = part.flatMap((s) => {
        const x = s.toLowerCase()
        return [`${x}@miniTicker`, `${x}@markPrice@1s`, `${x}@bookTicker`]
      }).join('/')
      let ws: WebSocket
      try { ws = new WebSocket(`wss://fstream.binance.com/stream?streams=${streams}`) } catch { return }
      sockets.push(ws)
      ws.onmessage = (ev) => { if (!dead) onFrame(String(ev.data)) }
      ws.onclose = () => {
        if (dead) return
        const wait = Math.min(20_000, 700 * 2 ** attempt)
        timers.push(setTimeout(() => openSocket(part, attempt + 1), wait))
      }
      ws.onerror = () => { try { ws.close() } catch { /* closing */ } }
    }

    for (const part of chunks(list, CHUNK)) openSocket(part)

    const flush = setInterval(() => {
      if (dead || !dirty.v) return
      dirty.v = false
      setTicks({ ...store.current })
    }, 250)

    const fillChg = async () => {
      const need = list.filter((s) => store.current[s] && store.current[s].chg == null)
      if (!need.length || dead) return
      try {
        const r = await fetch('https://www.okx.com/api/v5/market/tickers?instType=SWAP', { signal: AbortSignal.timeout(5000) })
        if (!r.ok) return
        const d = await r.json()
        const byId = new Map<string, any>()
        for (const row of d?.data ?? []) byId.set(String(row.instId), row)
        for (const sym of need) {
          const inst = okxInst(sym)
          const row = byId.get(inst.id)
          const last = num(row?.last), open = num(row?.open24h)
          if (!last || !open) continue
          const chg = (last - open) / open
          const cur = store.current[sym]
          if (!cur || cur.chg != null) continue
          store.current[sym] = { ...cur, chg }
          dirty.v = true
        }
      } catch { /* 24h change is optional */ }
    }
    void fillChg()

    const rest = setInterval(async () => {
      if (dead) return
      void fillChg()
      const stale = list.filter((s) => {
        const t = store.current[s]
        return !t || Date.now() - t.t > 5000 || t.src !== 'binance'
      })
      if (!stale.length) return
      const staleSet = new Set(stale)
      try {
        const r = await fetch('https://fapi.binance.com/fapi/v1/premiumIndex', { signal: AbortSignal.timeout(5000) })
        if (r.ok) {
          const rows = await r.json()
          if (Array.isArray(rows)) {
            let hit = 0
            for (const row of rows) {
              const sym = String(row?.symbol ?? '').toUpperCase()
              if (!staleSet.has(sym)) continue
              const mark = num(row.markPrice)
              const funding = Number(row.lastFundingRate)
              if (mark) {
                put(sym, { mark, last: store.current[sym]?.last ?? mark, funding: Number.isFinite(funding) ? funding : null, t: Date.now() }, 'rest')
                hit++
              }
            }
            if (hit) return
          }
        }
      } catch { /* next venue */ }
      try {
        const r = await fetch('https://api.bybit.com/v5/market/tickers?category=linear', { signal: AbortSignal.timeout(5000) })
        if (r.ok) {
          const d = await r.json()
          const rows = d?.result?.list
          if (d?.retCode === 0 && Array.isArray(rows)) {
            let hit = 0
            for (const row of rows) {
              const sym = String(row?.symbol ?? '').toUpperCase()
              if (!staleSet.has(sym)) continue
              const last = num(row.lastPrice)
              const mark = num(row.markPrice) ?? last
              const prev = num(row.prevPrice24h)
              if (mark || last) {
                put(sym, { last: last ?? mark, mark: mark ?? last, chg: last && prev ? (last - prev) / prev : null, t: Date.now() }, 'rest')
                hit++
              }
            }
            if (hit) return
          }
        }
      } catch { /* next venue */ }
      try {
        const r = await fetch('https://www.okx.com/api/v5/market/tickers?instType=SWAP', { signal: AbortSignal.timeout(5000) })
        if (!r.ok) return
        const d = await r.json()
        const byId = new Map<string, any>()
        for (const row of d?.data ?? []) byId.set(String(row.instId), row)
        for (const sym of stale) {
          const inst = okxInst(sym)
          const row = byId.get(inst.id)
          if (!row) continue
          const last = num(row.last)
          const open = num(row.open24h)
          if (!last) continue
          const px = last * inst.k
          const op = open ? open * inst.k : undefined
          put(sym, { last: px, mark: px, chg: op ? (px - op) / op : null, t: Date.now() }, 'rest')
        }
      } catch { /* offline */ }
    }, 4000)

    return () => {
      dead = true
      clearInterval(flush)
      clearInterval(rest)
      timers.forEach(clearTimeout)
      sockets.forEach((ws) => { try { ws.close() } catch { /* closing */ } })
    }
  }, [key])

  return ticks
}

export function shownPrice(t?: TapeTick): number | undefined {
  if (!t) return undefined
  return t.mark ?? t.last ?? (t.bid && t.ask ? (t.bid + t.ask) / 2 : undefined)
}

// v97.4 — ONE live price feed for every page (owner: "prices should move every second, like on an exchange").
//
// Two WebSocket streams run side by side and the freshest wins, per symbol:
//   Binance USDT-M futures  wss://fstream.binance.com  <sym>@miniTicker, pushed every 1 s (the bot's own venue)
//   OKX perpetual swaps     wss://ws.okx.com:8443      tickers channel, pushed on every change
// Binance is geo-blocked in some regions (the same 451 the bot hits), so OKX is not a spare wheel: on those phones
// it IS the feed. Binance is preferred while its last tick is < 5 s old, so the numbers do not jitter between two
// venues' prices. If neither socket delivers, a REST poll every 2 s fills the gap. Display only — the bot books its
// fills on its own server-side book walk, never on these prices.
//
// Symbols are the bot's: 'PEPE' is quoted per ONE coin (Binance 1000PEPEUSDT / 1000, as the bot does); other
// '1000x' contracts are traded as listed (e.g. '1000SHIB' = the price of 1,000 SHIB).
import { useEffect, useRef, useState } from 'react'
import { SUPA_KEY, SUPA_URL } from './supa'

export interface LiveTick { px: number; prev: number; chg24: number | null; src: Src; t: number }
type Src = 'Binance' | 'OKX' | 'Bybit' | 'הבוט'
type Ticks = Record<string, LiveTick>

const BN_K: Record<string, { s: string; k: number }> = { PEPE: { s: '1000PEPEUSDT', k: 1000 }, ON: { s: '1000ONUSDT', k: 1000 } }
const bn = (sym: string) => BN_K[sym] ?? { s: `${sym}USDT`, k: 1 }
// OKX quotes one coin; a '1000X' contract is 1,000 of them
const okx = (sym: string) => (/^1000[A-Z]/.test(sym) ? { id: `${sym.slice(4)}-USDT-SWAP`, k: 1000 } : { id: `${sym}-USDT-SWAP`, k: 1 })
const PREFER_MS = 5000

export function useLivePrices(symbols: string[]): Ticks {
  const key = [...new Set(symbols.filter(Boolean))].sort().join(',')
  const [ticks, setTicks] = useState<Ticks>({})
  const store = useRef<Ticks>({})
  const dirty = useRef(false)

  useEffect(() => {
    const syms = key ? key.split(',') : []
    if (!syms.length) return
    let dead = false
    const bnRev = new Map(syms.map((s) => [bn(s).s, s]))
    const okRev = new Map(syms.map((s) => [okx(s).id, s]))
    const RANK: Record<Src, number> = { Binance: 0, Bybit: 1, OKX: 2, 'הבוט': 3 }
    const put = (sym: string, px: number, chg24: number | null, src: Src, t: number) => {
      if (!Number.isFinite(px) || px <= 0) return
      const cur = store.current[sym]
      // Binance wins while fresh; OKX takes over as soon as Binance goes quiet
      if (cur && RANK[src] > RANK[cur.src] && Date.now() - cur.t < PREFER_MS) return
      if (cur && cur.px === px && cur.src === src) { cur.t = t; return }
      store.current[sym] = { px, prev: cur?.px ?? px, chg24: chg24 ?? cur?.chg24 ?? null, src, t }
      dirty.current = true
    }
    // flush to React at most 4x a second, so a busy stream never floods the page
    const flush = setInterval(() => { if (dirty.current && !dead) { dirty.current = false; setTicks({ ...store.current }) } }, 250)

    const sockets: WebSocket[] = []
    const timers: ReturnType<typeof setTimeout>[] = []
    const open = (make: () => WebSocket | null, name: string, attempt = 0) => {
      if (dead) return
      let ws: WebSocket | null = null
      try { ws = make() } catch { ws = null }
      if (!ws) return
      sockets.push(ws)
      ws.onclose = () => { if (!dead) timers.push(setTimeout(() => open(make, name, attempt + 1), Math.min(30_000, 1000 * 2 ** attempt))) }
      ws.onerror = () => { try { ws?.close() } catch { /* closing */ } }
    }

    // Binance futures, one combined stream (a connection carries up to 200 streams)
    for (let i = 0; i < syms.length; i += 150) {
      const part = syms.slice(i, i + 150)
      open(() => {
        const ws = new WebSocket(`wss://fstream.binance.com/stream?streams=${part.map((s) => `${bn(s).s.toLowerCase()}@miniTicker`).join('/')}`)
        ws.onmessage = (e) => {
          try {
            const d = JSON.parse(String(e.data)).data
            const sym = bnRev.get(String(d?.s)); if (!sym) return
            const k = bn(sym).k, c = Number(d.c) / k, o = Number(d.o) / k
            put(sym, c, o > 0 ? (c - o) / o : null, 'Binance', Number(d.E) || Date.now())
          } catch { /* malformed frame */ }
        }
        return ws
      }, 'binance')
    }
    // OKX public tickers
    open(() => {
      const ws = new WebSocket('wss://ws.okx.com:8443/ws/v5/public')
      let ping: ReturnType<typeof setInterval> | null = null
      ws.onopen = () => {
        ws.send(JSON.stringify({ op: 'subscribe', args: syms.map((s) => ({ channel: 'tickers', instId: okx(s).id })) }))
        ping = setInterval(() => { try { ws.send('ping') } catch { /* closed */ } }, 20_000)   // OKX drops idle sockets at 30 s
      }
      ws.addEventListener('close', () => { if (ping) clearInterval(ping) })
      ws.onmessage = (e) => {
        if (e.data === 'pong') return
        try {
          const m = JSON.parse(String(e.data))
          for (const x of m?.data ?? []) {
            const sym = okRev.get(String(x.instId)); if (!sym) continue
            const k = okx(sym).k, c = Number(x.last) * k, o = Number(x.open24h) * k
            put(sym, c, o > 0 ? (c - o) / o : null, 'OKX', Number(x.ts) || Date.now())
          }
        } catch { /* malformed frame */ }
      }
      return ws
    }, 'okx')

    // Bybit linear perpetuals (a third venue: covers coins OKX does not list, e.g. XMR)
    const byRev = new Map(syms.map((s) => [bn(s).s, s]))
    open(() => {
      const ws = new WebSocket('wss://stream.bybit.com/v5/public/linear')
      let ping: ReturnType<typeof setInterval> | null = null
      ws.onopen = () => {
        const args = syms.map((s) => `tickers.${bn(s).s}`)
        for (let i = 0; i < args.length; i += 10) ws.send(JSON.stringify({ op: 'subscribe', args: args.slice(i, i + 10) }))
        ping = setInterval(() => { try { ws.send(JSON.stringify({ op: 'ping' })) } catch { /* closed */ } }, 20_000)
      }
      ws.addEventListener('close', () => { if (ping) clearInterval(ping) })
      ws.onmessage = (e) => {
        try {
          const m = JSON.parse(String(e.data)), d = m?.data
          if (!d?.symbol || d.lastPrice === undefined) return
          const sym = byRev.get(String(d.symbol)); if (!sym) return
          const k = bn(sym).k, c = Number(d.lastPrice) / k, p = Number(d.price24hPcnt)
          put(sym, c, Number.isFinite(p) ? p : null, 'Bybit', Number(m.ts) || Date.now())
        } catch { /* malformed frame */ }
      }
      return ws
    }, 'bybit')

    // last resort: REST every 2 s, only for symbols no socket has priced in the last 5 s
    const rest = setInterval(async () => {
      const stale = syms.filter((s) => !store.current[s] || Date.now() - store.current[s].t > PREFER_MS)
      if (!stale.length) return
      try {
        const r = await fetch('https://www.okx.com/api/v5/market/tickers?instType=SWAP')
        if (!r.ok) return
        const j = await r.json()
        for (const x of j?.data ?? []) {
          const sym = okRev.get(String(x.instId)); if (!sym || !stale.includes(sym)) continue
          const k = okx(sym).k, c = Number(x.last) * k, o = Number(x.open24h) * k
          put(sym, c, o > 0 ? (c - o) / o : null, 'OKX', Date.now())
        }
      } catch { /* offline */ }
      // the bot's own server-side Binance mark for its open positions (written every ~5 s cycle)
      const still = stale.filter((s) => !store.current[s] || Date.now() - store.current[s].t > PREFER_MS)
      if (!still.length) return
      try {
        for (const [s, m] of Object.entries(await botMarks())) if (still.includes(s) && Date.now() - m.ts < 30_000) put(s, m.px, null, 'הבוט', m.ts)
      } catch { /* offline */ }
    }, 2000)

    return () => {
      dead = true
      clearInterval(flush); clearInterval(rest)
      timers.forEach(clearTimeout)
      sockets.forEach((ws) => { try { ws.close() } catch { /* closing */ } })
    }
  }, [key])
  return ticks
}

// '▲' / '▼' / '' for the last move, used to flash a price green or red like an exchange board
export const tickDir = (t?: LiveTick) => (!t || t.px === t.prev ? '' : t.px > t.prev ? 'up' : 'down')

// v99.3 — the bot's own server-side marks for its open positions (every sleeve that publishes them), sym -> {px, ts}
export async function botMarks(): Promise<Record<string, { px: number; ts: number }>> {
  const r = await fetch(`${SUPA_URL}/rest/v1/bot_state?select=c:bot_params->chan_cycle,l:bot_params->list_marks,f:bot_params->fund_marks,e:bot_params->evt_marks,p:bot_params->pro_marks,d:bot_params->donch_cycle,b:bot_params->blade_cycle&limit=1`,
    { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }, cache: 'no-store' })
  const row = (await r.json())?.[0] ?? {}, out: Record<string, { px: number; ts: number }> = {}
  const add = (marks: any, ts: number) => { if (marks && ts) for (const [k, v] of Object.entries(marks)) if (Number(v) > 0 && !(out[k]?.ts > ts)) out[k] = { px: Number(v), ts } }
  add(row.c?.marks, Date.parse(row.c?.marks_ts ?? '')); add(row.l?.marks, Date.parse(row.l?.ts ?? '')); add(row.f?.marks, Date.parse(row.f?.ts ?? '')); add(row.e?.marks, Date.parse(row.e?.ts ?? '')); add(row.p?.marks, Date.parse(row.p?.ts ?? '')); add(row.d?.marks, Date.parse(row.d?.marks_ts ?? '')); add(row.b?.marks, Date.parse(row.b?.marks_ts ?? ''))
  return out
}

// v99.3 — ONE exit mark for every open position, shared by the house and the dashboard (owner: "both screens must
// show the same number, updated every second"). A position closes on the opposite side of the book, so the mark is
// the Binance USDT-M BID for a long and the ASK for a short (bookTicker stream, pushed on every change); when that
// socket is silent for > 5 s it falls back to the shared last-price feed, then to the bot's own server-side mark.
export interface ExitMark { mark: number | null; src?: string }
export function useExitMarks(rows: { sym: string; side: string }[]): { marks: Record<string, ExitMark>; wsOn: boolean } {
  const key = [...new Set(rows.map(r => `${r.sym}:${r.side}`))].sort().join(',')
  const syms = [...new Set(rows.map(r => r.sym))]
  const feed = useLivePrices(syms)
  const [book, setBook] = useState<Record<string, { bid: number; ask: number; ts: number }>>({})
  const [bot, setBot] = useState<Record<string, { px: number; ts: number }>>({})
  const [wsOn, setWsOn] = useState(false)
  const [, setTick] = useState(0)
  useEffect(() => { const iv = setInterval(() => setTick(x => x + 1), 1000); return () => clearInterval(iv) }, [])
  useEffect(() => {
    const list = [...new Set(key ? key.split(',').map(k => k.split(':')[0]) : [])]
    if (!list.length) { setWsOn(false); return }
    let dead = false, sock: WebSocket | null = null, retry: ReturnType<typeof setTimeout> | null = null
    const rev = new Map(list.map(s => [bn(s).s, s]))
    const connect = () => {
      if (dead) return
      sock = new WebSocket(`wss://fstream.binance.com/stream?streams=${[...rev.keys()].map(x => x.toLowerCase() + '@bookTicker').join('/')}`)
      sock.onopen = () => { if (!dead) setWsOn(true) }
      sock.onmessage = (ev) => { try { const d = JSON.parse(String(ev.data))?.data; const sym = rev.get(String(d?.s ?? '').toUpperCase()); if (!sym) return
        const k = bn(sym).k, bid = Number(d.b) / k, ask = Number(d.a) / k; if (bid > 0 && ask > 0) setBook(w => ({ ...w, [sym]: { bid, ask, ts: Date.now() } })) } catch { /* bad frame */ } }
      sock.onclose = () => { if (dead) return; setWsOn(false); retry = setTimeout(connect, 1500) }
      sock.onerror = () => { try { sock?.close() } catch { /* closing */ } }
    }
    connect()
    const poll = async () => { try { const m = await botMarks(); if (!dead) setBot(m) } catch { /* offline */ } }
    void poll(); const iv = setInterval(poll, 2000)
    return () => { dead = true; clearInterval(iv); if (retry) clearTimeout(retry); try { sock?.close() } catch { /* closing */ } }
  }, [key])
  const now = Date.now(), marks: Record<string, ExitMark> = {}
  for (const r of rows) {
    const w = book[r.sym], tk = feed[r.sym], b = bot[r.sym]
    marks[`${r.sym}:${r.side}`] = w && now - w.ts < PREFER_MS ? { mark: r.side === 'LONG' ? w.bid : w.ask, src: 'Binance WS' }
      : tk?.px && now - tk.t < 30_000 ? { mark: tk.px, src: String(tk.src) }
      : b && b.px > 0 ? { mark: b.px, src: `הבוט · ${Math.max(0, Math.round((now - b.ts) / 1000))}ש׳` }
      : { mark: null }
  }
  return { marks, wsOn }
}

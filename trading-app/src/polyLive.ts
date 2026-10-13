// ONE live feed for the Polymarket paper desk page (poly.html), shared by the classic view and the 3D arena so both show
// the same numbers. Display only:
//  - booked state: pm/state.json / pmc/state.json on the pm-desk-data branch (written every ~10-15 s), re-read every 2 s;
//  - live prices of the open positions: the public Polymarket market WebSocket (book + price_change best_bid/best_ask),
//    REST POST /books every 3 s only while the socket is down; flushed to React at most 4x a second;
//  - official resolutions: Gamma `markets?closed=true&id=..` every 3 s.
// `onTick` lets the 3D scene react to every individual price change without re-rendering React per message.
import { useEffect, useMemo, useRef, useState } from 'react'

export type J = Record<string, any>
export const STATE_URL = 'https://raw.githubusercontent.com/aliexpressgood585/spacehub/pm-desk-data/pm/state.json'
export const COINS_STATE_URL = 'https://raw.githubusercontent.com/aliexpressgood585/spacehub/pm-desk-data/pmc/state.json'

export const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0)
export const usd = (v: number) => `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const cents = (v: number) => `${(v * 100).toFixed(1)}¢`
export const when = (t?: string) => (t ? new Date(t).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')
export const left = (t?: string, now = Date.now()) => { if (!t) return '—'; const s = Math.floor((Date.parse(t) - now) / 1000); if (s <= 0) return 'ממתין להכרעה רשמית'; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}` }
export const ago = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `לפני ${s} שנ׳` : `לפני ${Math.floor(s / 60)} דק׳` }
export const col = (v: number) => (v > 0 ? '#3ddc97' : v < 0 ? '#ff6b6b' : '#c8d1dc')

export interface PolyLive {
  st: J | null; trades: J[]; open: J[]; closed: J[]; equityHist: J[]; decisions: J[]
  live: Record<string, number>; ask: Record<string, number>; res: Record<string, number>
  wsOn: boolean; tickAt: number
  mark: (t: J) => number
  cash: number; start: number; equity: number; realized: number; unreal: number; fees: number; wins: number
  onTick: (cb: (token: string, bid: number) => void) => () => void
}

export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(id) }, [ms])
  return now
}

export function usePolyLive(stateUrl: string = STATE_URL): PolyLive {
  const [st, setSt] = useState<J | null>(null)
  const [live, setLive] = useState<Record<string, number>>({})
  const [ask, setAsk] = useState<Record<string, number>>({})
  const [res, setRes] = useState<Record<string, number>>({})
  const [wsOn, setWsOn] = useState(false)
  const [tickAt, setTickAt] = useState(0)
  const subs = useRef(new Set<(token: string, bid: number) => void>())

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(`${stateUrl}?t=${Math.floor(Date.now() / 2000)}`, { cache: 'no-store' })
        if (r.ok) setSt(await r.json())
      } catch { /* keep the last state */ }
    }
    load(); const id = setInterval(load, 2000); return () => clearInterval(id)
  }, [stateUrl])

  const trades = useMemo(() => [...(st?.trades ?? [])].reverse() as J[], [st])
  const open = useMemo(() => trades.filter((t) => t.status === 'OPEN'), [trades])
  const closed = useMemo(() => trades.filter((t) => t.status === 'CLOSED'), [trades])
  const ids = open.map((t) => t.token_id).join(',')
  const mids = open.map((t) => t.market_id).join(',')

  useEffect(() => {
    if (!ids) return
    const want = new Set(ids.split(','))
    let ws: WebSocket | null = null, alive = true, ping: any, retry: any
    const pb: Record<string, number> = {}, pa: Record<string, number> = {}
    let dirty = false
    const put = (a: string, b?: any, k?: any) => {
      if (!want.has(a)) return
      const bid = n(b), ak = n(k)
      if (bid > 0) { pb[a] = bid; for (const f of subs.current) f(a, bid) }
      pa[a] = ak; dirty = true
    }
    const flush = setInterval(() => {
      if (!dirty) return
      dirty = false
      setLive((o) => ({ ...o, ...pb })); setAsk((o) => ({ ...o, ...pa })); setTickAt(Date.now())
    }, 250)
    const book = (x: J) => { const a = (x.asks ?? []).map((y: J) => +y.price); put(x.asset_id, Math.max(0, ...(x.bids ?? []).map((y: J) => +y.price)), a.length ? Math.min(...a) : 0) }
    const connect = () => {
      ws = new WebSocket('wss://ws-subscriptions-clob.polymarket.com/ws/market')
      ws.onopen = () => { setWsOn(true); ws?.send(JSON.stringify({ assets_ids: [...want], type: 'market' })); ping = setInterval(() => ws?.readyState === 1 && ws.send('PING'), 10000) }
      ws.onmessage = (e) => {
        let m: any; try { m = JSON.parse(String(e.data)) } catch { return }
        for (const x of Array.isArray(m) ? m : [m]) {
          if (x?.bids || x?.asks) book(x)
          for (const pc of x?.price_changes ?? []) if (pc.best_bid != null) put(pc.asset_id, pc.best_bid, pc.best_ask)
        }
      }
      ws.onclose = () => { setWsOn(false); clearInterval(ping); if (alive) retry = setTimeout(connect, 2000) }
      ws.onerror = () => ws?.close()
    }
    connect()
    const rest = setInterval(async () => {
      if (ws?.readyState === 1) return
      try { const r = await fetch('https://clob.polymarket.com/books', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify([...want].map((token_id) => ({ token_id }))) }); for (const x of await r.json()) book(x) } catch { /* keep last */ }
    }, 3000)
    return () => { alive = false; clearInterval(ping); clearInterval(rest); clearInterval(flush); clearTimeout(retry); ws?.close() }
  }, [ids])

  useEffect(() => {
    if (!mids) return
    const chk = async () => {
      try {
        const r = await fetch(`https://gamma-api.polymarket.com/markets?closed=true&${mids.split(',').map((m) => `id=${m}`).join('&')}`)
        const out: Record<string, number> = {}
        for (const m of await r.json()) { const toks = JSON.parse(m.clobTokenIds ?? '[]'), px = JSON.parse(m.outcomePrices ?? '[]').map(Number); toks.forEach((tk: string, i: number) => { if (px[i] === 1 || px[i] === 0) out[tk] = px[i] }) }
        setRes(out)
      } catch { /* keep last */ }
    }
    chk(); const id = setInterval(chk, 3000); return () => clearInterval(id)
  }, [mids])

  const mark = (t: J) => res[t.token_id] ?? live[t.token_id] ?? n(t.mark_px ?? t.entry_px)
  const openValue = open.reduce((s, t) => s + n(t.qty) * mark(t), 0)
  const cash = n(st?.cash), start = n(st?.start_cash) || 1000
  return {
    st, trades, open, closed, equityHist: st?.equity ?? [], decisions: (st?.decisions ?? []).map((d: J, i: number) => ({ id: i, ...d })),
    live, ask, res, wsOn, tickAt, mark,
    cash, start, equity: cash + openValue,
    realized: closed.reduce((s, t) => s + n(t.pnl), 0),
    unreal: open.reduce((s, t) => s + n(t.qty) * mark(t) - n(t.cost), 0),
    fees: trades.reduce((s, t) => s + n(t.entry_fee) + n(t.exit_fee), 0),
    wins: closed.filter((t) => n(t.pnl) > 0).length,
    onTick: (cb) => { subs.current.add(cb); return () => { subs.current.delete(cb) } },
  }
}

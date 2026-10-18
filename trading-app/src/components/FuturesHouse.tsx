// Binance USDT-M futures PAPER desk. Read-only: binance-paper/state.json on pm-desk-data.
// Symbols, strategy and risk come from that file (universe if present, otherwise prices, plus open positions).
// Live marks are a combined Binance stream that resubscribes when the list changes. No API keys, no orders.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ColorType, CrosshairMode, LineStyle, createChart,
  type IChartApi, type IPriceLine, type ISeriesApi, type SeriesMarker, type Time, type UTCTimestamp,
} from 'lightweight-charts'
import '../futures/terminal.css'
import { futuresKlines, type Bar } from '../futures/klines'
import {
  buildActivity, contractSymbol, deskPulse, lastCycleMs, liveSymbols, nextDeskRun, strategyRows, whyLabel, baseCoin,
  type Act,
} from '../futures/model'
import { shownPrice, useFuturesTape, type TapeTick } from '../futures/tape'

const DEFAULT_STATE = 'https://raw.githubusercontent.com/aliexpressgood585/spacehub/pm-desk-data/binance-paper/state.json'
const TFS = ['5m', '15m', '1h', '4h', '1d'] as const
type Tf = typeof TFS[number]
const TF_MS: Record<Tf, number> = { '5m': 300_000, '15m': 900_000, '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000 }
const TF_HE: Record<Tf, string> = { '5m': '5 דק׳', '15m': '15 דק׳', '1h': 'שעה', '4h': '4 שעות', '1d': 'יום' }

type J = any

function stateUrl() {
  const q = new URLSearchParams(location.search).get('state')
  return q || DEFAULT_STATE
}

const usd = (x: number, sign = false) => {
  if (!Number.isFinite(x)) return '—'
  const n = Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${x < 0 ? '−' : sign && x > 0 ? '+' : ''}$${n}`
}
const px = (x: number) => {
  if (!Number.isFinite(x) || x === 0) return '—'
  const a = Math.abs(x)
  if (a >= 1000) return x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (a >= 1) return x.toFixed(4)
  if (a >= 0.01) return x.toFixed(5)
  return x.toPrecision(4)
}
const pct = (x: number, d = 2) => (Number.isFinite(x) ? `${x < 0 ? '−' : x > 0 ? '+' : ''}${Math.abs(x).toFixed(d)}%` : '—')
const ago = (ms: number) => {
  const a = Math.max(0, ms)
  if (a < 60_000) return `לפני ${Math.round(a / 1000)} שנ׳`
  if (a < 3_600_000) return `לפני ${Math.round(a / 60_000)} דק׳`
  if (a < 86_400_000) return `לפני ${(a / 3_600_000).toFixed(1)} שע׳`
  return `לפני ${Math.round(a / 86_400_000)} ימים`
}
const held = (ts: number, now: number) => {
  if (!Number.isFinite(ts)) return '—'
  const s = Math.max(0, Math.floor((now - ts) / 1000))
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  if (d) return `${d}י ${h}ש`
  if (h) return `${h}ש ${m}ד`
  return `${m}ד ${s % 60}שנ`
}
const utc = (ts: number) => new Date(ts).toLocaleString('he-IL', {
  timeZone: 'UTC', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
})
const leftHe = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  if (h) return `בעוד ${h} שע׳ ${m} דק׳`
  if (m) return `בעוד ${m} דק׳ ו־${r} שנ׳`
  return `בעוד ${r} שנ׳`
}
const cls = (n: number) => (n > 0 ? 'fx-pos' : n < 0 ? 'fx-neg' : 'fx-flat')
const sideN = (side: string) => (side === 'SHORT' ? -1 : 1)

function useFonts() {
  useEffect(() => {
    const id = 'fx-fonts'
    if (document.getElementById(id)) return
    const l = document.createElement('link')
    l.id = id
    l.rel = 'stylesheet'
    l.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Rubik:wght@400;500;600;700&display=swap'
    document.head.appendChild(l)
  }, [])
}

function TickNum({ value, text, className = '' }: { value: number; text: string; className?: string }) {
  const prev = useRef(value)
  const [dir, setDir] = useState('')
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!Number.isFinite(value) || value === prev.current) return
    setDir(value > prev.current ? 'up' : 'dn')
    setN((x) => x + 1)
    prev.current = value
  }, [value])
  return <span key={n} className={`fx-num fx-tick ${dir} ${className}`}>{text}</span>
}

function markFor(p: J, tick?: TapeTick): { mark: number; live: boolean } {
  const entry = Number(p?.entry)
  const snap = Number(p?.mark) > 0 ? Number(p.mark) : entry
  const live = shownPrice(tick)
  if (!(live && live > 0)) return { mark: snap, live: false }
  if (entry > 0 && (live / entry > 10 || entry / live > 10)) return { mark: snap, live: false }
  return { mark: live, live: true }
}

function rowPnl(p: J, mark: number) {
  const entry = Number(p.entry), qty = Number(p.qty), dir = sideN(p.side)
  const pnl = dir * (mark - entry) * qty
  const move = entry ? dir * (mark - entry) / entry * 100 : NaN
  const margin = Number(p.isolated_margin)
  const roe = margin ? pnl / margin * 100 : move * (Number(p.leverage) || 1)
  return { pnl, move, roe }
}

function CandleBoard({ symbol, tf, setTf, trades, position, liveLast }: {
  symbol: string
  tf: Tf
  setTf: (t: Tf) => void
  trades: J[]
  position?: J
  liveLast?: number
}) {
  const box = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi | null>(null)
  const series = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const vol = useRef<ISeriesApi<'Histogram'> | null>(null)
  const lines = useRef<IPriceLine[]>([])
  const lastBar = useRef<Bar | null>(null)
  const fitted = useRef(false)
  const [bars, setBars] = useState<Bar[]>([])
  const [src, setSrc] = useState('')
  const [err, setErr] = useState('')
  const [marks, setMarks] = useState(0)

  const early = useMemo(() => {
    const ts: number[] = []
    for (const t of trades) {
      if (contractSymbol(t.symbol) !== symbol) continue
      if (Number(t.open_ts)) ts.push(Number(t.open_ts))
      if (Number(t.close_ts)) ts.push(Number(t.close_ts))
    }
    if (position && Number(position.opened_ts)) ts.push(Number(position.opened_ts))
    return ts.length ? Math.min(...ts) : undefined
  }, [trades, position, symbol])

  useEffect(() => {
    const el = box.current
    if (!el || !symbol) return
    fitted.current = false
    const ch = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: '#0c0e14' }, textColor: '#8d93a3', fontFamily: 'IBM Plex Mono, monospace' },
      grid: { vertLines: { color: '#161910' }, horzLines: { color: '#161910' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#2a2e24' },
      timeScale: { borderColor: '#2a2e24', timeVisible: true, secondsVisible: false, rightOffset: 4 },
      localization: {
        locale: 'he-IL',
        timeFormatter: (t: number) => new Date(t * 1000).toLocaleString('he-IL', { timeZone: 'UTC', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' UTC',
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
    })
    const sample = 100
    const precision = sample >= 100 ? 2 : 4
    const cs = ch.addCandlestickSeries({
      upColor: '#c6ef4a', downColor: '#ff5c7a', borderVisible: false,
      wickUpColor: '#c6ef4a', wickDownColor: '#ff5c7a',
      priceFormat: { type: 'price', precision, minMove: 10 ** -precision },
    })
    const vs = ch.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' } })
    ch.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
    chart.current = ch
    series.current = cs
    vol.current = vs
    return () => { ch.remove(); chart.current = null; series.current = null; vol.current = null; lines.current = []; lastBar.current = null }
  }, [symbol, tf])

  useEffect(() => {
    if (!symbol) return
    let dead = false
    setBars([])
    const load = async () => {
      try {
        const r = await futuresKlines(symbol, tf, 400, early)
        if (dead) return
        setBars(r.bars)
        setSrc(r.src)
        setErr('')
      } catch {
        if (!dead) setErr('אין נרות לחוזה הזה כרגע')
      }
    }
    load()
    const id = setInterval(load, 60_000)
    return () => { dead = true; clearInterval(id) }
  }, [symbol, tf, early])

  useEffect(() => {
    const cs = series.current, vs = vol.current, ch = chart.current
    if (!cs || !vs || !ch || !bars.length) return
    const T = (ms: number) => Math.floor(ms / 1000) as UTCTimestamp
    const last = bars[bars.length - 1].c
    const precision = Math.abs(last) >= 1000 ? 2 : Math.abs(last) >= 1 ? 4 : Math.abs(last) >= 0.01 ? 5 : 8
    cs.applyOptions({ priceFormat: { type: 'price', precision, minMove: 10 ** -precision } })
    const range = ch.timeScale().getVisibleLogicalRange()
    cs.setData(bars.map((b) => ({ time: T(b.t), open: b.o, high: b.h, low: b.l, close: b.c })))
    vs.setData(bars.map((b) => ({ time: T(b.t), value: b.v, color: b.c >= b.o ? 'rgba(198,239,74,0.35)' : 'rgba(255,92,122,0.35)' })))
    lastBar.current = bars[bars.length - 1]
    if (!fitted.current) {
      const n = bars.length
      ch.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 120), to: n + 3 })
      fitted.current = true
    } else if (range) ch.timeScale().setVisibleLogicalRange(range)

    for (const l of lines.current) { try { cs.removePriceLine(l) } catch { /* gone */ } }
    lines.current = []
    const addLine = (price: number, color: string, title: string, style = LineStyle.Solid) => {
      if (!Number.isFinite(price) || price <= 0) return
      lines.current.push(cs.createPriceLine({ price, color, lineWidth: 2, lineStyle: style, axisLabelVisible: true, title }))
    }
    if (position) {
      addLine(Number(position.entry), '#9af6ff', 'כניסה')
      addLine(Number(position.sl), '#ff5c7a', 'סטופ', LineStyle.Dashed)
      addLine(Number(position.tp), '#d6ff4a', 'יעד', LineStyle.Dashed)
      addLine(Number(position.liq), '#d7b4ff', 'חיסול', LineStyle.Dotted)
    }

    const barMs = TF_MS[tf]
    const snap = (ts: number): UTCTimestamp | null => {
      if (!Number.isFinite(ts) || !bars.length) return null
      const bucket = Math.floor(ts / barMs) * barMs
      let lo = 0, hi = bars.length - 1, best = -1
      while (lo <= hi) {
        const mid = (lo + hi) >> 1
        if (bars[mid].t <= bucket) { best = mid; lo = mid + 1 } else hi = mid - 1
      }
      if (best < 0 || bucket - bars[best].t >= barMs) return null
      return T(bars[best].t)
    }
    const mk: SeriesMarker<Time>[] = []
    const mine = trades.filter((t) => contractSymbol(t.symbol) === symbol).slice(-40)
    for (const t of mine) {
      const dir = t.side === 'SHORT' ? -1 : 1
      const open = snap(Number(t.open_ts))
      const close = snap(Number(t.close_ts))
      const net = Number(t.net_pnl)
      if (open) mk.push({ time: open, position: dir > 0 ? 'belowBar' : 'aboveBar', color: '#9af6ff', shape: dir > 0 ? 'arrowUp' : 'arrowDown', text: dir > 0 ? 'כניסה לונג' : 'כניסה שורט' })
      if (close) mk.push({ time: close, position: net >= 0 ? 'aboveBar' : 'belowBar', color: net >= 0 ? '#d6ff4a' : '#ff5c7a', shape: 'circle', text: `${whyLabel(String(t.reason || ''))} ${Number.isFinite(net) ? usd(net, true) : ''}`.trim() })
    }
    if (position && Number(position.opened_ts) && !mine.some((t) => Math.abs(Number(t.open_ts) - Number(position.opened_ts)) < 5_000)) {
      const open = snap(Number(position.opened_ts))
      const dir = position.side === 'SHORT' ? -1 : 1
      if (open) mk.push({ time: open, position: dir > 0 ? 'belowBar' : 'aboveBar', color: '#9af6ff', shape: dir > 0 ? 'arrowUp' : 'arrowDown', text: 'פתוח' })
    }
    const seen = new Set<string>()
    const uniq = mk.filter((m) => {
      const k = `${m.time}:${m.text}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    }).sort((a, b) => Number(a.time) - Number(b.time))
    try { cs.setMarkers(uniq); setMarks(uniq.length) } catch { setMarks(0) }
  }, [bars, trades, position, symbol, tf])

  useEffect(() => {
    const cs = series.current
    const pxLive = liveLast
    if (!cs || !lastBar.current || !(pxLive && pxLive > 0)) return
    const barMs = TF_MS[tf]
    const t0 = Math.floor(Date.now() / barMs) * barMs
    const lb = lastBar.current
    if (t0 < lb.t) return
    const nb: Bar = t0 === lb.t
      ? { ...lb, c: pxLive, h: Math.max(lb.h, pxLive), l: Math.min(lb.l, pxLive) }
      : { t: t0, o: lb.c, h: Math.max(lb.c, pxLive), l: Math.min(lb.c, pxLive), c: pxLive, v: 0 }
    lastBar.current = nb
    try { cs.update({ time: Math.floor(nb.t / 1000) as UTCTimestamp, open: nb.o, high: nb.h, low: nb.l, close: nb.c }) } catch { /* rebuilding */ }
  }, [liveLast, tf])

  const here = position
  return (
    <section className="fx-panel">
      <h2>
        גרף {baseCoin(symbol) || '—'}
        <span>{src ? `נרות ${src}` : 'טוען נרות'}{marks ? ` · ${marks} סימונים` : ''}</span>
      </h2>
      <div className="fx-tfs">
        {TFS.map((id) => (
          <button key={id} className={id === tf ? 'on' : ''} onClick={() => setTf(id)}>{TF_HE[id]}</button>
        ))}
      </div>
      <div ref={box} className="fx-chart" />
      {err && <div className="fx-err">{err}</div>}
      <div className="fx-legend">
        <span><b style={{ color: '#9af6ff' }}>▲</b> כניסה</span>
        <span><b style={{ color: '#d6ff4a' }}>●</b> יציאה ברווח</span>
        <span><b style={{ color: '#ff5c7a' }}>●</b> יציאה בהפסד</span>
        {here && <>
          <span><i className="fx-sw" style={{ background: '#9af6ff' }} />כניסה {px(Number(here.entry))}</span>
          {Number(here.sl) > 0 && <span><i className="fx-sw" style={{ background: '#ff5c7a' }} />סטופ {px(Number(here.sl))}</span>}
          {Number(here.tp) > 0 && <span><i className="fx-sw" style={{ background: '#d6ff4a' }} />יעד {px(Number(here.tp))}</span>}
          {Number(here.liq) > 0 && <span><i className="fx-sw" style={{ background: '#d7b4ff' }} />חיסול {px(Number(here.liq))}</span>}
        </>}
      </div>
    </section>
  )
}

function EquityChart({ curve, live }: { curve: { ts: number; equity: number }[]; live: number }) {
  const box = useRef<HTMLDivElement>(null)
  const series = useRef<ISeriesApi<'Area'> | null>(null)
  const lastT = useRef(0)
  const key = `${curve.length}:${curve[curve.length - 1]?.ts ?? 0}`
  useEffect(() => {
    const el = box.current
    if (!el) return
    const pts = curve
      .map((p) => ({ time: Math.floor(Number(p.ts) / 1000), value: Number(p.equity) }))
      .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.value))
      .sort((a, b) => a.time - b.time)
    const uniq: { time: UTCTimestamp; value: number }[] = []
    for (const p of pts) {
      const prev = uniq[uniq.length - 1]
      if (prev && prev.time === p.time) prev.value = p.value
      else uniq.push({ time: p.time as UTCTimestamp, value: p.value })
    }
    if (uniq.length < 2) { series.current = null; return }
    const up = uniq[uniq.length - 1].value >= uniq[0].value
    const ch = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#8d93a3', fontFamily: 'IBM Plex Mono, monospace' },
      grid: { vertLines: { color: '#161910' }, horzLines: { color: '#161910' } },
      rightPriceScale: { borderColor: '#2a2e24' },
      timeScale: { borderColor: '#2a2e24', timeVisible: true, secondsVisible: false },
      handleScroll: false,
      handleScale: false,
      crosshair: { mode: CrosshairMode.Magnet },
    })
    const s = ch.addAreaSeries({
      lineColor: up ? '#d6ff4a' : '#ff5c7a',
      topColor: up ? 'rgba(214,255,74,0.28)' : 'rgba(255,92,122,0.25)',
      bottomColor: 'rgba(12,14,20,0)',
      priceLineVisible: false,
      lastValueVisible: true,
    })
    s.setData(uniq)
    ch.timeScale().fitContent()
    series.current = s
    lastT.current = Number(uniq[uniq.length - 1].time)
    return () => { ch.remove(); series.current = null }
  }, [key])
  useEffect(() => {
    const s = series.current
    if (!s || !Number.isFinite(live)) return
    const t = Math.floor(Date.now() / 1000)
    if (t < lastT.current) return
    try { s.update({ time: t as UTCTimestamp, value: live }); lastT.current = t } catch { /* rebuilding */ }
  }, [live])
  if (curve.length < 2) return <div className="fx-empty">עקומת ההון תופיע אחרי המחזור השני.</div>
  return <div ref={box} className="fx-eqchart" />
}

export default function FuturesHouse() {
  useFonts()
  const [st, setSt] = useState<J>(null)
  const [err, setErr] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const [sym, setSym] = useState('')
  const [extra, setExtra] = useState('')
  const [tf, setTf] = useState<Tf>('1h')
  const tfTouched = useRef(false)
  const [feedN, setFeedN] = useState(40)
  const [tradeN, setTradeN] = useState(30)
  const [fSym, setFSym] = useState('ALL')
  const [fSide, setFSide] = useState('ALL')
  const [fWhy, setFWhy] = useState('ALL')
  const [fOut, setFOut] = useState('ALL')
  const [q, setQ] = useState('')
  const [fresh, setFresh] = useState<Set<string>>(new Set())
  const seen = useRef<Set<string>>(new Set())
  const primed = useRef(false)

  useEffect(() => {
    let dead = false
    const load = async () => {
      try {
        const u = stateUrl()
        const r = await fetch(`${u}${u.includes('?') ? '&' : '?'}t=${Math.floor(Date.now() / 8000)}`, { cache: 'no-store' })
        if (!r.ok) throw new Error(String(r.status))
        const j = await r.json()
        if (!dead) { setSt(j); setErr(null) }
      } catch (e) { if (!dead) setErr(String(e)) }
    }
    load()
    const a = setInterval(load, 12_000)
    const b = setInterval(() => setNow(Date.now()), 1000)
    return () => { dead = true; clearInterval(a); clearInterval(b) }
  }, [])

  const symbols = useMemo(() => liveSymbols(st), [st])
  const chartSymbols = useMemo(() => {
    const s = [...symbols]
    if (extra && !s.includes(extra)) s.push(extra)
    return s
  }, [symbols, extra])
  const tape = useFuturesTape(chartSymbols)
  const positions: J[] = st?.positions ?? []
  const trades: J[] = st?.trades ?? []
  const activity = useMemo(() => (st ? buildActivity(st) : []), [st])

  useEffect(() => {
    if (!chartSymbols.length) return
    if (sym && chartSymbols.includes(sym)) return
    const held = contractSymbol(positions[0]?.symbol)
    setSym(held && chartSymbols.includes(held) ? held : chartSymbols[0])
  }, [chartSymbols.join(','), sym, positions.map((p) => contractSymbol(p.symbol)).join(',')])

  useEffect(() => {
    if (tfTouched.current || !st) return
    const want = String(st?.strategy?.timeframe || '')
    if ((TFS as readonly string[]).includes(want)) setTf(want as Tf)
  }, [st])

  useEffect(() => {
    const ids = activity.map((a) => a.id)
    if (!primed.current) {
      if (!st) return
      primed.current = true
      for (const id of ids) seen.current.add(id)
      return
    }
    const neu = ids.filter((id) => !seen.current.has(id))
    for (const id of ids) seen.current.add(id)
    if (!neu.length) return
    setFresh(new Set(neu))
    const t = setTimeout(() => setFresh(new Set()), 1600)
    return () => clearTimeout(t)
  }, [activity, st])

  const pick = (s: string) => {
    const n = contractSymbol(s)
    if (!n) return
    if (!symbols.includes(n)) setExtra(n)
    setSym(n)
  }

  if (!st) {
    return (
      <div className="fx-root">
        <div className="fx-load">
          <div className="fx-skel" />
          <div className="fx-skel" />
          <div className="fx-skel" />
        </div>
        <div className="fx-empty">{err ? `הבוט עוד לא פרסם מצב (${err}).` : 'טוען את מצב הדמו…'}</div>
      </div>
    )
  }

  let unreal = 0
  const posView = positions.map((p) => {
    const tick = tape[contractSymbol(p.symbol)]
    const { mark, live } = markFor(p, tick)
    const m = rowPnl(p, mark)
    unreal += Number.isFinite(m.pnl) ? m.pnl : 0
    return { p, mark, live, ...m }
  })
  const wallet = Number(st.wallet) || 0
  const equity = wallet + unreal
  const start = Number(st.starting_balance) || 0
  const ret = start ? (equity / start - 1) * 100 : Number(st.return_pct) || 0
  const day0 = Number(st.risk?.day_start_equity)
  const today = Number.isFinite(day0) && day0 ? equity - day0 : NaN
  const todayPct = Number.isFinite(today) && day0 ? today / day0 * 100 : Number(st.risk?.day_pnl_pct) || 0
  const peak = Math.max(Number(st.peak_equity) || start || equity, equity)
  const dd = peak ? (equity - peak) / peak * 100 : Number(st.drawdown_pct) || 0
  const last = lastCycleMs(st)
  const pulse = deskPulse(last, now)
  const next = nextDeskRun(now)
  const strat = strategyRows(st)
  const openHere = posView.find((r) => contractSymbol(r.p.symbol) === sym)
  const tick = tape[sym]
  const liveLast = tick?.last ?? tick?.mark
  const curve = (st.equity_curve ?? []).map((p: J) => ({ ts: Number(p.ts), equity: Number(p.equity) })).filter((p: { ts: number; equity: number }) => p.ts && Number.isFinite(p.equity))
  const reasons = [...new Set(trades.map((t) => String(t.reason || '')).filter(Boolean))]
  const tradeSyms = [...new Set(trades.map((t) => contractSymbol(t.symbol)).filter(Boolean))]
  const qn = q.trim().toUpperCase()
  const filtered = trades.filter((t) => {
    const s = contractSymbol(t.symbol)
    if (fSym !== 'ALL' && s !== fSym) return false
    if (fSide !== 'ALL' && t.side !== fSide) return false
    if (fWhy !== 'ALL' && String(t.reason) !== fWhy) return false
    const net = Number(t.net_pnl)
    if (fOut === 'WIN' && !(net > 0)) return false
    if (fOut === 'LOSS' && !(net <= 0)) return false
    if (qn && !s.includes(qn) && !String(t.reason || '').toUpperCase().includes(qn)) return false
    return true
  }).slice().reverse()
  const wins = Number(st.wins) || trades.filter((t) => Number(t.net_pnl) > 0).length
  const closed = Number(st.trades_closed) || trades.length
  const wr = closed ? (100 * wins) / closed : 0
  const pulseText = pulse === 'live' ? 'פעיל' : pulse === 'late' ? 'מאחר' : pulse === 'stalled' ? 'תקוע' : 'אין דופק'
  const maxPos = st.risk?.max_positions

  return (
    <div className="fx-root">
      <header className="fx-top">
        <div>
          <div className="fx-kicker"><b>PAPER</b><span>BINANCE USDT-M · בלי מפתחות ובלי פקודות</span></div>
          <h1 className="fx-title">מסוף הפיוצ׳רס</h1>
          <div className="fx-sub">
            {strat.name} · נר <span className="fx-num">{strat.timeframe}</span>
            {' · '}{symbols.length} חוזים{Array.isArray(st.universe) ? ' · יקום דינמי' : ''}
            {maxPos != null ? ` · עד ${maxPos} פוזיציות` : ''}
            {' · '}התחלה {usd(start)}
          </div>
          <div className="fx-pills">
            <span className={`fx-pill ${pulse}`}><i />{pulseText}{last != null ? ` · מחזור ${ago(now - last)}` : ''}</span>
            <span className="fx-pill">המחזור הבא <span className="fx-num">{utc(next)} UTC</span> · {leftHe(next - now)}</span>
            <span className="fx-pill">{st.price_source?.label_he || 'מקור מחיר מהמחזור האחרון'}</span>
            {err && <span className="fx-pill late">רענון הקובץ נכשל</span>}
          </div>
        </div>
        <div className="fx-hero">
          <div className="fx-eq"><TickNum value={equity} text={usd(equity)} /></div>
          <div className={`fx-ret ${cls(ret)}`}>{pct(ret)} מההתחלה · שיא {usd(peak)}</div>
        </div>
      </header>

      {pulse === 'stalled' && (
        <div className="fx-alert">
          הבוט נראה תקוע. המחזור האחרון {last != null ? ago(now - last) : 'לא ידוע'} ({last != null ? utc(last) + ' UTC' : '—'}).
          המחזור רץ כל 15 דקות, בדקות 03, 18, 33 ו־48. המחירים על המסך ממשיכים לזוז מהבורסה, אבל החשבון לא עודכן.
        </div>
      )}
      {pulse === 'late' && (
        <div className="fx-alert late">המחזור מאחר. האחרון היה {last != null ? ago(now - last) : '—'}, והבא אמור להיות ב־{utc(next)} UTC. עיכוב קצר של GitHub עדיין סביר.</div>
      )}

      <section className="fx-stats">
        <Stat k="יתרת ארנק" v={usd(wallet)} />
        <Stat k="רווח פתוח" v={<TickNum value={unreal} text={usd(unreal, true)} className={cls(unreal)} />} />
        <Stat k="ממומש" v={usd(Number(st.realized_total) || 0, true)} tone={Number(st.realized_total) || 0} />
        <Stat k="היום (UTC)" v={`${usd(today, true)} · ${pct(todayPct)}`} tone={Number.isFinite(today) ? today : todayPct} />
        <Stat k="מרג׳ין בשימוש" v={usd(Number(st.used_margin) || 0)} />
        <Stat k="פנוי" v={usd(Number(st.available) || 0)} />
        <Stat k="אחוז הצלחה" v={closed ? `${wr.toFixed(1)}%` : '—'} />
        <Stat k="עסקאות שנסגרו" v={String(closed)} />
        <Stat k="ירידה מהשיא" v={pct(dd)} tone={dd} />
        <Stat k="ירידה מקסימלית" v={`${Number(st.max_drawdown_pct || 0).toFixed(2)}%`} tone={Number(st.max_drawdown_pct) || 0} />
        <Stat k="עמלות" v={usd(Number(st.fees_total) || 0)} tone={-(Number(st.fees_total) || 0)} />
        <Stat k="מימון" v={usd(Number(st.funding_total) || 0, true)} tone={Number(st.funding_total) || 0} />
      </section>

      {st.risk?.halted && (
        <div className="fx-alert">הפסד יומי {Number(st.risk.day_pnl_pct || 0).toFixed(2)}% — אין כניסות חדשות עד מחר (תקרה {st.risk.max_daily_loss_pct ?? 5}%).</div>
      )}

      <section className="fx-panel">
        <h2>חוזים בשידור <span>{chartSymbols.length}{Object.keys(tape).length ? ' · מחיר מארק חי' : ' · מתחבר לבורסה…'}</span></h2>
        {!chartSymbols.length && <div className="fx-empty">הבוט עוד לא פרסם רשימת חוזים.</div>}
        <div className="fx-tape">
          {chartSymbols.map((s) => {
            const t = tape[s]
            const snap = st.prices?.[s] ?? st.prices?.[baseCoin(s)]
            const price = shownPrice(t) ?? Number(snap?.mark) ?? Number(snap?.last)
            const chg = t?.chg
            const funding = t?.funding ?? Number(snap?.funding_rate)
            const holding = positions.some((p) => contractSymbol(p.symbol) === s)
            return (
              <button key={s} className={`fx-chip ${s === sym ? 'on' : ''}`} onClick={() => pick(s)}>
                <div className="sym fx-num">{baseCoin(s)}{holding ? <b className="fx-hold"> ●</b> : ''}</div>
                <div className="px">{Number.isFinite(price) ? <TickNum value={price} text={px(price)} /> : '—'}</div>
                <div className="meta">
                  <span className={cls(Number(chg) || 0)}>{chg == null ? '—' : pct(chg * 100)}</span>
                  <span className="fx-num">{Number.isFinite(funding) ? `מימון ${(funding * 100).toFixed(3)}%` : ''}</span>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      <div className="fx-split">
        {sym ? (
          <CandleBoard symbol={sym} tf={tf} setTf={(t) => { tfTouched.current = true; setTf(t) }} trades={trades} position={openHere?.p} liveLast={liveLast} />
        ) : (
          <section className="fx-panel"><div className="fx-empty">אין חוזה להצגה.</div></section>
        )}
        <section className="fx-panel">
          <h2>פעילות <span>חדש למעלה · {activity.length}</span></h2>
          {!activity.length && <div className="fx-empty">עוד אין אירועים. פתיחה, סגירה, סטופ, יעד, חיסול, מימון ואותות יופיעו כאן.</div>}
          <div className="fx-feed">
            {activity.slice(0, feedN).map((e) => <EventRow key={e.id} e={e} fresh={fresh.has(e.id)} onPick={pick} />)}
          </div>
          {activity.length > feedN && <button className="fx-more" onClick={() => setFeedN((n) => n + 40)}>עוד אירועים</button>}
        </section>
      </div>

      <section className="fx-panel">
        <h2>פוזיציות פתוחות <span>{positions.length}{maxPos != null ? ` / ${maxPos}` : ''}</span></h2>
        {!positions.length && <div className="fx-empty">אין פוזיציות. הכניסה הבאה תיקבע במחזור לפי {strat.name}.</div>}
        {!!positions.length && (
          <div className="fx-scroll">
            <table className="fx-table">
              <thead>
                <tr>
                  <th>מטבע</th><th>צד</th><th>גודל</th><th>מינוף</th><th>כניסה</th><th>מארק</th>
                  <th>רווח פתוח</th><th>%</th><th>חיסול</th><th>סטופ</th><th>יעד</th><th>פתוח</th>
                </tr>
              </thead>
              <tbody>
                {posView.map(({ p, mark, live, pnl, move, roe }) => (
                  <tr key={contractSymbol(p.symbol)} onClick={() => pick(p.symbol)}>
                    <td className="fx-num">{baseCoin(contractSymbol(p.symbol))}</td>
                    <td className={`fx-side ${p.side}`}>{p.side === 'SHORT' ? 'שורט' : 'לונג'}</td>
                    <td className="fx-num">{Number(p.qty)}</td>
                    <td className="fx-num">{p.leverage ? `${p.leverage}x` : '—'}</td>
                    <td className="fx-num">{px(Number(p.entry))}</td>
                    <td className="fx-num">{live ? <TickNum value={mark} text={px(mark)} /> : px(mark)}</td>
                    <td><TickNum value={pnl} text={usd(pnl, true)} className={cls(pnl)} /></td>
                    <td className={cls(move)}><span className="fx-num">{pct(move)}</span><div className="fx-empty" style={{ fontSize: 11 }}>מרג׳ {pct(roe, 1)}</div></td>
                    <td className="fx-num">{px(Number(p.liq))}</td>
                    <td className="fx-num">{px(Number(p.sl))}</td>
                    <td className="fx-num">{px(Number(p.tp))}</td>
                    <td>{held(Number(p.opened_ts), now)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="fx-two">
        <section className="fx-panel">
          <h2>עקומת הון <span>{usd(start)} ← {usd(equity)}</span></h2>
          <EquityChart curve={curve} live={equity} />
        </section>
        <section className="fx-panel">
          <h2>האסטרטגיה <span className="fx-num">{strat.name}</span></h2>
          <div className="fx-sub" style={{ marginBottom: 8 }}>נר העבודה <b className="fx-num">{strat.timeframe}</b>. הפרמטרים נקראים מהמצב שפורסם, בלי הנחה על רשימת מטבעות.</div>
          <div className="fx-params">
            {strat.rows.map((r) => <span key={r.k}>{r.label}<b className="fx-num">{r.v}</b></span>)}
            {!strat.rows.length && <span>אין פרמטרים בקובץ</span>}
          </div>
          {!!strat.backtest.length && (
            <div className="fx-params" style={{ marginTop: 8 }}>
              {strat.backtest.map((r) => <span key={r.k}>{r.label}<b className="fx-num">{r.v}</b></span>)}
            </div>
          )}
          <div className="fx-empty" style={{ marginTop: 8 }}>
            {st.risk?.halted ? 'כניסות חדשות חסומות להיום.' : `כניסות מותרות. תקרת הפסד יומי ${st.risk?.max_daily_loss_pct ?? '—'}%.`}
            {st.last_bar_close ? ` נר אחרון שנסגר: ${st.last_bar_close}.` : ''}
            {Number(st.liquidations) > 0 ? ` חיסולים: ${st.liquidations}.` : ''}
          </div>
        </section>
      </div>

      <section className="fx-panel">
        <h2>היסטוריית עסקאות <span>{filtered.length} מתוך {trades.length}</span></h2>
        <div className="fx-filters">
          <select value={fSym} onChange={(e) => { setFSym(e.target.value); setTradeN(30) }}>
            <option value="ALL">כל החוזים</option>
            {tradeSyms.map((s) => <option key={s} value={s}>{baseCoin(s)}</option>)}
          </select>
          <select value={fSide} onChange={(e) => { setFSide(e.target.value); setTradeN(30) }}>
            <option value="ALL">לונג ושורט</option>
            <option value="LONG">לונג</option>
            <option value="SHORT">שורט</option>
          </select>
          <select value={fWhy} onChange={(e) => { setFWhy(e.target.value); setTradeN(30) }}>
            <option value="ALL">כל הסיבות</option>
            {reasons.map((r) => <option key={r} value={r}>{whyLabel(r)}</option>)}
          </select>
          <select value={fOut} onChange={(e) => { setFOut(e.target.value); setTradeN(30) }}>
            <option value="ALL">הכל</option>
            <option value="WIN">רווח</option>
            <option value="LOSS">הפסד</option>
          </select>
          <input value={q} placeholder="חיפוש" onChange={(e) => { setQ(e.target.value); setTradeN(30) }} />
        </div>
        {!filtered.length && <div className="fx-empty">{trades.length ? 'אין עסקאות שעוברות את הסינון.' : 'עוד אין עסקאות סגורות.'}</div>}
        {!!filtered.length && (
          <div className="fx-scroll">
            <table className="fx-table">
              <thead>
                <tr>
                  <th>מטבע</th><th>צד</th><th>גודל</th><th>מינוף</th><th>כניסה</th><th>יציאה</th>
                  <th>נטו</th><th>עמלות</th><th>מימון</th><th>סיבה</th><th>נפתח</th><th>נסגר</th><th>משך</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, tradeN).map((t, i) => {
                  const net = Number(t.net_pnl)
                  return (
                    <tr key={`${t.symbol}-${t.open_ts}-${t.close_ts}-${i}`} onClick={() => pick(t.symbol)}>
                      <td className="fx-num">{baseCoin(contractSymbol(t.symbol))}</td>
                      <td className={`fx-side ${t.side}`}>{t.side === 'SHORT' ? 'שורט' : 'לונג'}</td>
                      <td className="fx-num">{t.qty}</td>
                      <td className="fx-num">{t.leverage ? `${t.leverage}x` : '—'}</td>
                      <td className="fx-num">{px(Number(t.entry_price))}</td>
                      <td className="fx-num">{px(Number(t.exit_price))}</td>
                      <td className={`fx-num ${cls(net)}`}>{usd(net, true)}</td>
                      <td className="fx-num">{usd(Number(t.fees) || 0)}</td>
                      <td className={`fx-num ${cls(Number(t.funding) || 0)}`}>{usd(Number(t.funding) || 0, true)}</td>
                      <td>{whyLabel(String(t.reason || ''))}</td>
                      <td className="fx-num">{Number(t.open_ts) ? utc(Number(t.open_ts)) : '—'}</td>
                      <td className="fx-num">{Number(t.close_ts) ? utc(Number(t.close_ts)) : '—'}</td>
                      <td>{Number(t.open_ts) && Number(t.close_ts) ? held(Number(t.open_ts), Number(t.close_ts)) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {filtered.length > tradeN && <button className="fx-more" onClick={() => setTradeN((n) => n + 40)}>עוד עסקאות</button>}
      </section>

      <footer className="fx-panel fx-foot">
        <div>נייר בלבד. המחירים החיים מגיעים מהדפדפן; המילוי, העמלות והמימון נרשמים במחזור של הבוט.</div>
        <details>
          <summary>מקור המחיר במחזור האחרון</summary>
          <div>{st.price_source?.label_he || '—'}</div>
          {st.price_source?.endpoint && <div className="fx-num">{st.price_source.endpoint}</div>}
          {st.price_source?.filters_he && <div>{st.price_source.filters_he}</div>}
          {st.price_source?.fees_he && <div>{st.price_source.fees_he}</div>}
        </details>
      </footer>
    </div>
  )
}

function Stat({ k, v, tone }: { k: string; v: ReactNode; tone?: number }) {
  return (
    <div className="fx-stat">
      <div className="k">{k}</div>
      <div className={`v ${tone == null ? '' : cls(tone)}`}>{v}</div>
    </div>
  )
}

function EventRow({ e, fresh, onPick }: { e: Act; fresh: boolean; onPick: (s: string) => void }) {
  return (
    <article className={`fx-ev ${fresh ? 'new' : ''}`} data-kind={e.type} onClick={() => e.symbol && onPick(e.symbol)} style={{ cursor: e.symbol ? 'pointer' : 'default' }}>
      <time className="fx-num">{utc(e.ts)}</time>
      <div>
        <div className="kind">{whyLabel(e.type)}{e.symbol ? ` · ${baseCoin(e.symbol)}` : ''}</div>
        {e.msg && <div className="msg">{e.msg}</div>}
      </div>
      <div className={`pnl fx-num ${e.pnl == null ? '' : cls(e.pnl)}`}>{e.pnl == null ? '' : usd(e.pnl, true)}</div>
    </article>
  )
}

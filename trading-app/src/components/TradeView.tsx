// v95.1 — one trade, live, TradingView-style (owner: "click an open trade, see it on a live chart with the stop, the
// target and every indicator that made the bot enter, in Hebrew"). READ-ONLY: the trade row comes from bot_trades with
// the anon key; the entry reasons are the values the bot STORED at entry (scalp_meta), never recomputed here. Candles
// and the live price come from Binance Futures (OKX as fallback) in the browser. The EMA20 line and the 20-bar volume
// average are drawn for reading only — the FAST rule itself uses the stored values shown in the panel.
import { useEffect, useMemo, useRef, useState } from 'react'
import { createChart, ColorType, CrosshairMode, LineStyle, type IChartApi, type ISeriesApi, type UTCTimestamp, type SeriesMarker, type Time } from 'lightweight-charts'
import { SUPA_URL, SUPA_KEY } from '../supa'

type Row = Record<string, any>
type K = { t: number; o: number; h: number; l: number; c: number; v: number; tb: number }
const C = { bg: '#04070E', card: '#0B1220', line: '#1E2A44', dim: '#8A97B2', text: '#E8EEF9', pos: '#00d492', neg: '#ff4d6a', acc: '#5aa9ff', warn: '#ffb454' }
const TF_MS: Record<string, number> = { '1m': 60e3, '5m': 300e3, '15m': 900e3, '1h': 3600e3, '2h': 7200e3, '4h': 14400e3 }
const OKX_BAR: Record<string, string> = { '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1H', '2h': '2H', '4h': '4H' }
const bsym = (sym: string) => (sym === 'PEPE' ? { s: '1000PEPEUSDT', k: 1000 } : { s: `${sym}USDT`, k: 1 })
const tfOf = (t: Row) => t.strategy === 'FAST' ? (t.scalp_meta?.fast?.mode === 'rt' ? '1m' : '5m') : t.strategy === 'LAB' ? String(t.scalp_meta?.lab?.tf ?? '1h') : t.strategy === 'SCALP' ? '1m' : t.strategy === 'BRKV' ? '4h' : t.strategy === 'ROTA' ? '1h' : '5m'
const fmt = (x: number) => (!Number.isFinite(x) ? '—' : Math.abs(x) >= 1000 ? x.toFixed(2) : Number(x.toPrecision(5)).toString())
const usd = (x: number) => `${x < 0 ? '−' : '+'}$${Math.abs(x).toFixed(2)}`
const pct = (x: number, d = 2) => `${x < 0 ? '−' : '+'}${Math.abs(x).toFixed(d)}%`
const mmss = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }

async function klines(sym: string, tf: string, limit: number): Promise<{ k: K[]; src: string }> {
  try {
    const { s, k } = bsym(sym)
    const r = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${s}&interval=${tf}&limit=${limit}`, { signal: AbortSignal.timeout(4000) })
    if (r.ok) { const d = await r.json(); return { src: 'Binance Futures', k: d.map((x: any[]) => ({ t: +x[0], o: +x[1] / k, h: +x[2] / k, l: +x[3] / k, c: +x[4] / k, v: +x[5] * k, tb: +x[9] * k })) } }
  } catch { /* fallback */ }
  const r = await fetch(`https://www.okx.com/api/v5/market/candles?instId=${sym}-USDT-SWAP&bar=${OKX_BAR[tf] ?? '5m'}&limit=${Math.min(300, limit)}`, { signal: AbortSignal.timeout(4000) })
  const d = await r.json(); if (d.code !== '0') throw new Error('no candles')
  return { src: 'OKX (ללא נתוני קונים/מוכרים)', k: d.data.map((x: string[]) => ({ t: +x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5], tb: NaN })).reverse() }
}
const ema = (xs: number[], p: number) => { const k = 2 / (p + 1); let e = xs[0]; return xs.map((x, i) => (e = i ? x * k + e * (1 - k) : x)) }

function Reasons({ t }: { t: Row }) {
  const m = t.scalp_meta ?? {}, side = t.side === 'LONG' ? 1 : -1, sideHe = side > 0 ? 'עלייה' : 'ירידה'
  const row = (ok: boolean, title: string, value: string, rule: string, explain: string) => (
    <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: 8, padding: '10px 0', borderBottom: `1px solid ${C.line}` }}>
      <div style={{ fontSize: 20, color: ok ? C.pos : C.neg }}>{ok ? '✓' : '✗'}</div>
      <div><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}><b>{title}</b><span dir="ltr" style={{ color: C.acc, fontVariantNumeric: 'tabular-nums' }}>{value}</span></div>
        <div style={{ color: C.dim, fontSize: 13, marginTop: 2 }}>{rule}</div><div style={{ fontSize: 13, marginTop: 4 }}>{explain}</div></div>
    </div>)
  if (t.strategy === 'FAST' && m.fast) {
    const f = m.fast, z = Number(f.z), vr = Number(f.vol_ratio), imb = Number(f.imb), rtm = f.mode === 'rt', zMin = rtm ? 2 : 1.5
    return <>
      {row(Math.abs(z) > zMin && Math.sign(z) === side, '1. קפיצת מחיר חדה', `z = ${z.toFixed(2)}`, rtm ? 'תנאי: המחיר ברגע הכניסה מול לפני 3 דקות — יותר מפי 2 מהתנודה הרגילה (בזמן אמת)' : 'תנאי: תנועה ב־3 הנרות האחרונים (15 דק׳) גדולה מפי 1.5 מהתנודה הרגילה',
        `המחיר זז ב${sideHe} בעוצמה של פי ${Math.abs(z).toFixed(1)} מהרגיל — מומנטום חזק לכיוון העסקה.`)}
      {row(vr >= 2, '2. נפח מסחר חריג', `×${vr.toFixed(2)}`, rtm ? 'תנאי: נפח 3 הדקות האחרונות לפחות פי 2 מהרגיל' : 'תנאי: נפח הנר האחרון לפחות פי 2 מהממוצע של 20 הנרות',
        `נסחר פי ${vr.toFixed(1)} מהרגיל — הרבה כסף נכנס לתנועה הזאת, לא תזוזה "ריקה".`)}
      {row(side * imb > 0.1, side > 0 ? '3. קונים אגרסיביים שולטים' : '3. מוכרים אגרסיביים שולטים', `${(imb * 100).toFixed(1)}%`, rtm ? 'תנאי: פער בין קונים למוכרים בשוק (Taker) מעל 10% ב־3 הדקות האחרונות' : 'תנאי: פער בין קונים למוכרים בשוק (Taker) מעל 10% ב־3 הנרות',
        `${side > 0 ? 'הקונים האגרסיביים' : 'המוכרים האגרסיביים'} (שקנו/מכרו במחיר השוק) היו ${((1 + side * imb) / 2 * 100).toFixed(0)}% מהנפח — נתון אמיתי מ־Binance.`)}
      {row(f.btc_up === null || f.btc_up === undefined ? t.sym === 'BTC' : (f.btc_up === true) === (side > 0), '4. ביטקוין באותו כיוון', f.btc_up === true ? 'BTC מעל EMA20' : f.btc_up === false ? 'BTC מתחת EMA20' : '—',
        `תנאי: ביטקוין (${rtm ? 'דקה' : '5 דק׳'}) מעל הממוצע שלו לעסקת קנייה / מתחת לעסקת מכירה`, 'כל השוק זז לאותו צד — פחות סיכוי שהתנועה תתהפך מיד.')}
      <div style={{ color: C.dim, fontSize: 12, marginTop: 8 }}>ערכים שנשמרו ברגע הכניסה ({rtm ? 'זמן אמת, ' : 'נר '}{String(f.bar ?? '').slice(11, 19)} UTC) · מרווח קנייה/מכירה בכניסה {Number(f.spread_bps).toFixed(1)} bps · הכלל לא עבר בדיקה היסטורית (ניסוי דמו)</div>
    </>
  }
  if (t.strategy === 'LAB' && m.lab) return <div style={{ fontSize: 14, lineHeight: 1.7 }}>אסטרטגיית מעבדה <b dir="ltr">{m.lab.spec}</b> ({m.lab.tier === 'elite' ? 'מובחרת' : 'חקירה'}) · OOS: {m.lab.oos?.mean}% לעסקה, t={m.lab.oos?.t}, PF {m.lab.oos?.pf} · רווח נטו צפוי {m.lab.exp_net_bps} bps</div>
  if (t.strategy === 'SCALP') return <div style={{ fontSize: 14, lineHeight: 1.7 }}>סוכנים שתמכו: {(m.evidence?.agents ?? []).join(', ') || '—'} · רווח צפוי {m.net_bps ?? '—'} bps אחרי עלויות {m.costs?.total_bps ?? '—'} bps</div>
  return <div style={{ color: C.dim }}>{t.strategy === 'ROTA' ? 'רוטציית מומנטום: המטבע דורג בין החזקים/החלשים ביותר ב־7/14/28 ימים. אין סטופ — יוצא בסבב הבא.' : 'אין פירוט שמור לעסקה הזאת.'}</div>
}

export default function TradeView({ id }: { id: string }) {
  const [t, setT] = useState<Row | null>(null), [err, setErr] = useState<string | null>(null)
  const [last, setLast] = useState<number>(NaN), [src, setSrc] = useState(''), [now, setNow] = useState(Date.now())
  const box = useRef<HTMLDivElement>(null), chart = useRef<IChartApi | null>(null)
  const cs = useRef<ISeriesApi<'Candlestick'> | null>(null), vs = useRef<ISeriesApi<'Histogram'> | null>(null), es = useRef<ISeriesApi<'Line'> | null>(null)
  // the trade row, refreshed (stop ratchets / close)
  useEffect(() => {
    let live = true
    const load = async () => {
      try { const r = await fetch(`${SUPA_URL}/rest/v1/bot_trades?id=eq.${encodeURIComponent(id)}&select=*`, { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } })
        const d = await r.json(); if (live) { if (d?.[0]) { setT(d[0]); setErr(null) } else setErr('העסקה לא נמצאה') } } catch (e: any) { if (live) setErr(String(e?.message ?? e)) }
    }
    load(); const i = setInterval(load, 10_000); const c = setInterval(() => setNow(Date.now()), 1000)
    return () => { live = false; clearInterval(i); clearInterval(c) }
  }, [id])
  const tf = t ? tfOf(t) : '5m', sym = t ? String(t.sym) : ''
  const lv = useMemo(() => {
    if (!t) return null
    const m = t.scalp_meta ?? {}, f = m.fast ?? m.lab ?? {}
    const stop = Number(f.stop ?? (t.strategy === 'ROTA' ? NaN : t.trail_sl)), target = Number(f.target ?? m.target_px ?? NaN)
    return { entry: Number(t.entry_price), stop: stop > 0 && stop < Number(t.entry_price) * 50 ? stop : NaN, target: target > 0 && !f.trail ? target : NaN, trail: !!f.trail, holdMs: Number(f.hold_min ?? m.hold_min ?? NaN) * 60e3 || (f.hold ? Number(f.hold) * TF_MS[tf] : NaN) }
  }, [t, tf])
  // chart
  useEffect(() => {
    if (!box.current || !t || !lv) return
    const ch = createChart(box.current, { layout: { background: { type: ColorType.Solid, color: C.bg }, textColor: C.dim, fontFamily: 'system-ui' }, grid: { vertLines: { color: '#0f1830' }, horzLines: { color: '#0f1830' } },
      crosshair: { mode: CrosshairMode.Normal }, rightPriceScale: { borderColor: C.line }, timeScale: { borderColor: C.line, timeVisible: true, secondsVisible: false }, autoSize: true })
    chart.current = ch
    const c = ch.addCandlestickSeries({ upColor: C.pos, downColor: C.neg, wickUpColor: C.pos, wickDownColor: C.neg, borderVisible: false, priceFormat: { type: 'price', precision: 6, minMove: 0.000001 } })
    const v = ch.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' } })
    ch.priceScale('vol').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })
    const e = ch.addLineSeries({ color: '#9b8cff', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
    cs.current = c; vs.current = v; es.current = e
    const pl = (price: number, color: string, title: string, style = LineStyle.Solid) => { if (Number.isFinite(price)) c.createPriceLine({ price, color, lineWidth: 2, lineStyle: style, axisLabelVisible: true, title }) }
    pl(lv.entry, C.acc, 'כניסה'); pl(lv.stop, C.neg, lv.trail ? 'סטופ נגרר' : 'סטופ', LineStyle.Dashed); pl(lv.target, C.pos, 'יעד', LineStyle.Dashed)
    if (t.exit_price) pl(Number(t.exit_price), C.warn, 'יציאה', LineStyle.Dotted)
    let alive = true
    const paint = (k: K[]) => {
      const T = (x: number) => Math.floor(x / 1000) as UTCTimestamp
      c.setData(k.map((b) => ({ time: T(b.t), open: b.o, high: b.h, low: b.l, close: b.c })))
      v.setData(k.map((b) => { const buy = Number.isFinite(b.tb) && b.v > 0 ? b.tb / b.v : 0.5; return { time: T(b.t), value: b.v, color: buy >= 0.5 ? `rgba(0,212,146,${0.25 + Math.min(0.6, (buy - 0.5) * 3)})` : `rgba(255,77,106,${0.25 + Math.min(0.6, (0.5 - buy) * 3)})` } }))
      const em = ema(k.map((b) => b.c), 20); e.setData(k.map((b, i) => ({ time: T(b.t), value: em[i] })).slice(20))
      const bar = TF_MS[tf], open = Date.parse(t.opened_at), dir = t.side === 'LONG' ? 1 : -1
      const mk: SeriesMarker<Time>[] = [{ time: T(Math.floor(open / bar) * bar), position: dir > 0 ? 'belowBar' : 'aboveBar', color: C.acc, shape: dir > 0 ? 'arrowUp' : 'arrowDown', text: 'כניסה' }]
      if (t.strategy === 'FAST') mk.unshift({ time: T(Math.floor(open / bar) * bar - bar), position: dir > 0 ? 'aboveBar' : 'belowBar', color: C.warn, shape: 'circle', text: 'אות' })
      if (t.closed_at) { const xp = Number(t.exit_price), up = xp >= Number(t.entry_price)   // the exit sits on the side the price went
        mk.push({ time: T(Math.floor(Date.parse(t.closed_at) / bar) * bar), position: up ? 'aboveBar' : 'belowBar', color: C.warn, shape: up ? 'arrowDown' : 'arrowUp', text: ({ STOP: 'סטופ', TARGET: 'יעד', TIMEOUT: 'זמן' } as Record<string, string>)[t.scalp_meta?.exit_reason] ?? 'יציאה' }) }
      c.setMarkers(mk.sort((a, b) => Number(a.time) - Number(b.time)))
      setLast(k[k.length - 1].c)
    }
    ;(async () => { try { const r = await klines(sym, tf, 300); if (!alive) return; setSrc(r.src); paint(r.k); { const bar = TF_MS[tf], e0 = Math.floor(Date.parse(t.opened_at) / bar) * bar, ie = Math.max(0, r.k.findIndex((b) => b.t >= e0)), ix = t.closed_at ? r.k.findIndex((b) => b.t >= Math.floor(Date.parse(t.closed_at) / bar) * bar) : -1
      ch.timeScale().setVisibleLogicalRange({ from: Math.max(0, ie - 30), to: (ix >= 0 ? Math.max(ix + 12, ie + 20) : Math.max(r.k.length, ie + 20)) + 3 }) } } catch { setErr('אין נרות מ־Binance או OKX') } })()
    const tick = setInterval(async () => { try { const r = await klines(sym, tf, 300); if (alive) { setSrc(r.src); paint(r.k) } } catch { /* keep last */ } }, 2500)
    return () => { alive = false; clearInterval(tick); ch.remove(); chart.current = null }
  }, [t?.id, t?.closed_at, lv?.stop, lv?.target, tf, sym])
  if (err && !t) return <div style={{ color: C.neg, padding: 16 }}>{err}</div>
  if (!t || !lv) return <div style={{ color: C.dim, padding: 16 }}>טוען עסקה…</div>
  const dir = t.side === 'LONG' ? 1 : -1, size = Number(t.size), notional = lv.entry * size, isOpen = t.status === 'OPEN', lev = Math.max(1, Number(t.lev) || 1), base = notional / lev   // % on the margin actually posted
  const mark = isOpen ? last : Number(t.exit_price)
  const upnl = isOpen ? dir * (mark - lv.entry) * size - Number(t.fee ?? 0) : Number(t.pnl)
  const r = Math.abs(lv.entry - lv.stop), rNow = Number.isFinite(r) && r > 0 ? dir * (mark - lv.entry) / r : NaN
  const held = (isOpen ? now : Date.parse(t.closed_at)) - Date.parse(t.opened_at)
  const stat = (label: string, value: string, color = C.text) => <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: '8px 10px' }}><div style={{ color: C.dim, fontSize: 12 }}>{label}</div><div dir="ltr" style={{ color, fontWeight: 700, fontSize: 17, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{value}</div></div>
  return (
    <div dir="rtl" style={{ color: C.text, fontFamily: 'system-ui, sans-serif', display: 'grid', gap: 10 }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 24 }}>{sym}</h1>
        <span style={{ color: dir > 0 ? C.pos : C.warn, fontWeight: 700 }}>{dir > 0 ? 'LONG · קנייה' : 'SHORT · מכירה'}</span>
        <span style={{ color: C.dim }}>{t.strategy} · נרות {tf} · {isOpen ? <b style={{ color: C.pos }}>● פתוחה בלייב</b> : `נסגרה (${t.scalp_meta?.exit_reason ?? t.status})`}</span>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
        {stat(isOpen ? 'רווח/הפסד עכשיו' : 'רווח/הפסד סופי', Number.isFinite(upnl) ? `${usd(upnl)} (${pct(upnl / base * 100)})` : '—', upnl >= 0 ? C.pos : C.neg)}
        {stat(isOpen ? 'מחיר עכשיו' : 'מחיר יציאה', fmt(mark))}
        {stat('כניסה', fmt(lv.entry), C.acc)}
        {stat('סטופ', Number.isFinite(lv.stop) ? `${fmt(lv.stop)} (${pct(dir * (lv.stop - mark) / mark * 100)})` : 'אין', C.neg)}
        {stat('יעד', lv.trail ? 'ללא יעד — סטופ נגרר' : Number.isFinite(lv.target) ? `${fmt(lv.target)} (${pct(dir * (lv.target - mark) / mark * 100)})` : 'אין', C.pos)}
        {stat(isOpen ? 'R עכשיו' : 'R סופי', Number.isFinite(rNow) ? `${rNow >= 0 ? '+' : ''}${rNow.toFixed(2)}R` : '—', rNow >= 0 ? C.pos : C.neg)}
        {stat(lev > 1 ? `גודל · ביטחון · מינוף` : 'גודל', lev > 1 ? `$${notional.toFixed(0)} · $${base.toFixed(0)} · ×${lev}` : `$${notional.toFixed(0)}`)}
        {stat(isOpen ? 'זמן בעסקה / מקסימום' : 'משך', Number.isFinite(lv.holdMs) ? `${mmss(held)} / ${mmss(lv.holdMs)}` : mmss(held))}
      </div>
      <div ref={box} style={{ height: 'min(62vh, 520px)', minHeight: 320, borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.line}` }} />
      <div style={{ color: C.dim, fontSize: 12 }}>מחירים: {src || '—'} · מתעדכן כל 2.5 שניות · קו סגול = ממוצע נע 20 (לתצוגה) · עמודות נפח: ירוק = קונים אגרסיביים שלטו בנר, אדום = מוכרים · הבוט סוגר לפי המחיר שלו בשרת, ייתכנו הבדלים קטנים</div>
      <section style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 12 }}>
        <h2 style={{ fontSize: 17, marginBottom: 4 }}>למה הבוט נכנס לעסקה</h2>
        <Reasons t={t} />
      </section>
      <section style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 12, fontSize: 14, lineHeight: 1.7 }}>
        <h2 style={{ fontSize: 17, marginBottom: 4 }}>איך הוא ייצא</h2>
        {t.strategy === 'FAST' ? <>{lv.trail ? <>סטופ נגרר: {fmt(lv.stop)} · אין יעד קבוע — אחרי רווח של פי 1 מהסיכון הסטופ עולה אחרי המחיר (במרחק פי 1 מהסיכון מהשיא) ולא יורד לעולם ·</> : <>סטופ: {fmt(lv.stop)} · יעד: {fmt(lv.target)} (פי 1.5 מהסיכון) ·</>} אם אף אחד לא נפגע — יוצא אחרי {t.scalp_meta?.fast?.hold_min ?? 60} דקות בכל מחיר.{Number(t.lev) > 1 ? ` מינוף ×${t.lev}: חיסול ב־${fmt(Number(t.scalp_meta?.fast?.liq))} — מפסיד את כל הביטחון ($${Number(t.scalp_meta?.fast?.margin ?? 0).toFixed(0)}).` : ''} עמלות: 0.05% בכל צד על כל הגודל + מרווח.</> : 'לפי כללי האסטרטגיה (ראו הרמות על הגרף).'}
      </section>
    </div>)
}

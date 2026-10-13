// Polymarket PAPER desk (owner 2026-10-09). Read-only viewer of scripts/pm-desk.ts (GitHub Actions loop, ~15 s cycle):
// every booked number comes from pm/state.json on the pm-desk-data branch (re-read every 5 s). Live prices of open
// positions stream from the public Polymarket market WebSocket, and official resolutions are polled from Gamma every
// 3 s, both display only.
import { useEffect, useMemo, useState } from 'react'

type J = Record<string, any>
const STATE_URL = 'https://raw.githubusercontent.com/aliexpressgood585/spacehub/pm-desk-data/pm/state.json'
const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const $ = (v: number) => `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const c = (v: number) => `${(v * 100).toFixed(1)}¢`
const when = (t?: string) => (t ? new Date(t).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')
const left = (t?: string) => { if (!t) return '—'; const s = Math.floor((Date.parse(t) - Date.now()) / 1000); if (s <= 0) return 'ממתין להכרעה רשמית'; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}` }
const ago = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `לפני ${s} שנ׳` : `לפני ${Math.floor(s / 60)} דק׳` }
const col = (v: number) => (v > 0 ? '#3ddc97' : v < 0 ? '#ff6b6b' : '#c8d1dc')

const box: React.CSSProperties = { background: '#0b1220', border: '1px solid #1c2738', borderRadius: 10, padding: 14 }
const lab: React.CSSProperties = { fontSize: 12, color: '#8a97a8' }

export default function PolyDesk() {
  const [st, setSt] = useState<J | null>(null)
  const [tr, setTr] = useState<J[]>([])
  const [eq, setEq] = useState<J[]>([])
  const [dec, setDec] = useState<J[]>([])
  const [live, setLive] = useState<Record<string, number>>({})
  const [ask, setAsk] = useState<Record<string, number>>({})
  const [res, setRes] = useState<Record<string, number>>({})
  const [wsOn, setWsOn] = useState(false)
  const [tickAt, setTickAt] = useState(0)
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [])
  useEffect(() => {
    // The desk runs on GitHub Actions every 5 min and commits pm/state.json to the pm-desk-data branch.
    const load = async () => {
      try {
        const r = await fetch(`${STATE_URL}?t=${Math.floor(Date.now() / 5000)}`, { cache: 'no-store' })
        if (!r.ok) return
        const s = await r.json()
        setSt(s); setTr([...(s.trades ?? [])].reverse()); setEq(s.equity ?? []); setDec((s.decisions ?? []).map((d: J, i: number) => ({ id: i, ...d })))
      } catch { /* keep the last state */ }
    }
    load(); const id = setInterval(load, 5000); return () => clearInterval(id)
  }, [])
  const open = tr.filter((t) => t.status === 'OPEN'), closed = tr.filter((t) => t.status === 'CLOSED')
  const ids = open.map((t) => t.token_id).join(',')
  // LIVE PRICES, like polymarket.com: the public market WebSocket pushes every book change (best bid/ask) the moment
  // it happens. REST /books every 3 s only while the socket is down. Display only; the bot books its own marks.
  useEffect(() => {
    if (!ids) return
    const want = new Set(ids.split(',')); let ws: WebSocket | null = null, alive = true, ping: any, retry: any
    const put = (a: string, b?: any, k?: any) => { if (!want.has(a)) return; const bid = n(b), ask = n(k); setLive((o) => ({ ...o, [a]: bid > 0 ? bid : o[a] ?? 0 })); setAsk((o) => ({ ...o, [a]: ask })); setTickAt(Date.now()) }
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
    return () => { alive = false; clearInterval(ping); clearInterval(rest); clearTimeout(retry); ws?.close() }
  }, [ids])
  // RESOLUTION WATCH: every 3 s ask Gamma whether any open market has been officially resolved (closed, price exactly 1/0).
  // Shown at once as "resolved"; the bot books the close in its next cycle (<= ~30 s) using the same official price.
  useEffect(() => {
    const mids = open.map((t) => t.market_id)
    if (!mids.length) return
    const chk = async () => {
      try {
        const r = await fetch(`https://gamma-api.polymarket.com/markets?closed=true&${mids.map((m) => `id=${m}`).join('&')}`)
        const out: Record<string, number> = {}
        for (const m of await r.json()) { const toks = JSON.parse(m.clobTokenIds ?? '[]'), px = JSON.parse(m.outcomePrices ?? '[]').map(Number); toks.forEach((tk: string, i: number) => { if (px[i] === 1 || px[i] === 0) out[tk] = px[i] }) }
        setRes(out)
      } catch { /* keep last */ }
    }
    chk(); const id = setInterval(chk, 3000); return () => clearInterval(id)
  }, [ids])
  const mark = (t: J) => res[t.token_id] ?? live[t.token_id] ?? n(t.mark_px ?? t.entry_px)
  const openValue = open.reduce((s, t) => s + n(t.qty) * mark(t), 0)
  const cash = n(st?.cash), start = n(st?.start_cash) || 1000, equity = cash + openValue
  const realized = closed.reduce((s, t) => s + n(t.pnl), 0)
  const unreal = open.reduce((s, t) => s + n(t.qty) * mark(t) - n(t.cost), 0)
  const fees = tr.reduce((s, t) => s + n(t.entry_fee) + n(t.exit_fee), 0)
  const wins = closed.filter((t) => n(t.pnl) > 0).length
  const strat = st?.strategy ?? {}
  const curve = useMemo(() => {
    if (eq.length < 2) return null
    const v = eq.map((x) => n(x.equity)), lo = Math.min(...v, start), hi = Math.max(...v, start), W = 600, Hh = 120
    const pt = (x: number, i: number) => `${(i / (v.length - 1)) * W},${Hh - ((x - lo) / (hi - lo || 1)) * Hh}`
    return { d: v.map(pt).join(' '), base: Hh - ((start - lo) / (hi - lo || 1)) * Hh, lo, hi, W, Hh }
  }, [eq, start])
  return (
    <div dir="rtl" style={{ color: '#e6edf5', fontFamily: 'system-ui, sans-serif', display: 'grid', gap: 12 }}>
      <div>
        <h1 style={{ fontSize: 24, margin: 0 }}>שולחן Polymarket · דמו</h1>
        <div style={lab}>חשבון נייר של $1,000 על מחירים אמיתיים מ־Polymarket. אין כסף אמיתי ואין הוראות אמיתיות. מחזור הבוט האחרון: {st?.last_scan ? ago(now - Date.parse(st.last_scan)) : '—'} · מחירים: <b style={{ color: wsOn ? '#3ddc97' : '#f0b84a' }}>{wsOn ? '● חי מ־Polymarket' : '● REST כל 3 שנ׳'}</b>{tickAt ? ` · שינוי אחרון ${ago(now - tickAt)}` : ''}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8 }}>
        {[['שווי חשבון', $(equity), equity - start], ['מזומן', $(cash), 0], ['רווח/הפסד כולל', $(equity - start), equity - start], ['ממומש', $(realized), realized], ['פתוח (לא ממומש)', $(unreal), unreal], ['עמלות ששולמו', $(fees), -fees], ['עסקאות שנסגרו', `${closed.length} · ${closed.length ? Math.round((wins / closed.length) * 100) : 0}% הצלחה`, 0], ['פוזיציות פתוחות', String(open.length), 0]].map(([k, v, s]) => (
          <div key={String(k)} style={box}><div style={lab}>{k}</div><div style={{ fontSize: 19, fontWeight: 600, color: col(Number(s)), direction: 'ltr', textAlign: 'right' }}>{v}</div></div>
        ))}
      </div>
      <div style={box}>
        <div style={{ ...lab, marginBottom: 6 }}>האסטרטגיה: קונה את התוצאה שהשוק מעריך בין {c(n(strat.lo))} ל־{c(n(strat.hi))}, בשווקים שנגמרים בתוך {n(strat.windowH)} שעות, מחזיק עד ההכרעה (משלם $1 או $0 למניה). {Math.round(n(strat.stakeFrac) * 100)}% מהחשבון לפוזיציה, עד {n(strat.maxOpen)} פתוחות. העמלה לפי לוח העמלות של כל שוק ב־Polymarket.</div>
        {curve ? (
          <svg viewBox={`0 0 ${curve.W} ${curve.Hh}`} style={{ width: '100%', height: 140 }} preserveAspectRatio="none">
            <line x1="0" x2={curve.W} y1={curve.base} y2={curve.base} stroke="#3a4658" strokeDasharray="4 4" />
            <polyline points={curve.d} fill="none" stroke={equity >= start ? '#3ddc97' : '#ff6b6b'} strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </svg>
        ) : <div style={lab}>גרף ההון יופיע אחרי כמה מחזורים.</div>}
      </div>
      <div style={box}>
        <h2 style={{ fontSize: 17, margin: '0 0 8px' }}>פוזיציות פתוחות ({open.length})</h2>
        {open.length === 0 && <div style={lab}>אין פוזיציות פתוחות כרגע. הבוט סורק כל 15 שניות.</div>}
        <div style={{ display: 'grid', gap: 8 }}>
          {open.map((t) => { const m = mark(t), pnl = n(t.qty) * m - n(t.cost); return (
            <a key={t.id} href={`https://polymarket.com/event/${t.event_slug ?? t.slug}`} target="_blank" rel="noreferrer" style={{ ...box, background: '#0e1729', textDecoration: 'none', color: 'inherit', display: 'grid', gap: 4 }}>
              <div style={{ fontWeight: 600 }} title={t.question}>{t.question_he ?? t.question}</div>
              <div style={lab}>קנינו: <b style={{ color: '#e6edf5' }}>{t.outcome_he ?? t.outcome}</b> · {n(t.qty).toFixed(1)} מניות · כניסה {c(n(t.entry_px))} · עכשיו {c(m)} {res[t.token_id] != null ? '' : live[t.token_id] != null ? `(הצעת קנייה חיה${n(ask[t.token_id]) > 0 ? `, מכירה ${c(n(ask[t.token_id]))}` : ''})` : '(סימון הבוט)'} · {res[t.token_id] != null ? <b style={{ color: col(res[t.token_id] ? 1 : -1) }}>{res[t.token_id] ? 'הוכרע: ניצחון ✓' : 'הוכרע: הפסד ✗'} · הבוט ירשום את הסגירה במחזור הבא</b> : <>נגמר בעוד <span style={{ direction: 'ltr', display: 'inline-block' }}>{left(t.end_time)}</span></>}</div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 14 }}>
                <span>עלות {$(n(t.cost))}</span><span>עמלה {$(n(t.entry_fee))}</span><span>אם מנצח: {$(n(t.qty))}</span>
                <span style={{ color: col(pnl) }}>רווח/הפסד עכשיו {$(pnl)}</span>
              </div>
            </a>) })}
        </div>
      </div>
      <div style={box}>
        <h2 style={{ fontSize: 17, margin: '0 0 8px' }}>עסקאות שנסגרו ({closed.length})</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={lab}>{['שוק', 'תוצאה שקנינו', 'כניסה', 'מניות', 'עלות', 'עמלה', 'קיבלנו', 'רווח/הפסד', 'נסגר'].map((h) => <th key={h} style={{ textAlign: 'right', padding: 6, borderBottom: '1px solid #1c2738' }}>{h}</th>)}</tr></thead>
            <tbody>{closed.map((t) => (
              <tr key={t.id}><td style={{ padding: 6 }} title={t.question}>{t.question_he ?? t.question}</td><td>{t.outcome_he ?? t.outcome} {t.reason === 'RESOLVED_WIN' ? '✓' : '✗'}</td><td>{c(n(t.entry_px))}</td><td>{n(t.qty).toFixed(1)}</td><td>{$(n(t.cost))}</td><td>{$(n(t.entry_fee))}</td><td>{$(n(t.proceeds))}</td><td style={{ color: col(n(t.pnl)) }}>{$(n(t.pnl))}</td><td>{when(t.closed_at)}</td></tr>
            ))}</tbody>
          </table>
          {closed.length === 0 && <div style={lab}>עוד לא נסגרו עסקאות. שווי פוזיציה נקבע רק כשהשוק מוכרע.</div>}
        </div>
      </div>
      <div style={box}>
        <h2 style={{ fontSize: 17, margin: '0 0 8px' }}>החלטות אחרונות של הבוט</h2>
        {dec.map((d) => <div key={d.id} style={{ fontSize: 13, padding: '3px 0', borderBottom: '1px solid #142033' }}><span style={lab}>{when(d.ts)}</span> · <b style={{ color: d.decision === 'BUY' || d.decision === 'ADD' ? '#3ddc97' : '#8a97a8' }}>{d.decision === 'BUY' ? 'קנייה' : d.decision === 'ADD' ? 'הגדלה' : 'דילוג'}</b> · <span title={d.question}>{d.question_he ?? d.question}</span> · {d.outcome_he ?? d.outcome} @ {c(n(d.price))} · {d.reason}</div>)}
        {dec.length === 0 && <div style={lab}>אין עדיין החלטות.</div>}
      </div>
    </div>
  )
}

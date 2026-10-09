// Polymarket PAPER desk (owner 2026-10-09). Read-only viewer of the pm-bot edge function: every number comes from
// pm_state / pm_trades / pm_equity / pm_decisions (anon key). Live prices of open positions are re-read from the
// public Polymarket CLOB every 5 s (display only; the bot books its own marks every 2 min).
import { useEffect, useMemo, useState } from 'react'
import { SUPA_KEY, SUPA_URL } from '../supa'

type J = Record<string, any>
const H = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
const q = async (path: string) => { const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, { headers: H }); return r.ok ? r.json() : [] }
const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const $ = (v: number) => `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const c = (v: number) => `${(v * 100).toFixed(1)}¢`
const when = (t?: string) => (t ? new Date(t).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')
const left = (t?: string) => { if (!t) return '—'; const m = Math.round((Date.parse(t) - Date.now()) / 60000); return m <= 0 ? 'ממתין לתוצאה' : m < 60 ? `${m} דק׳` : `${Math.floor(m / 60)} ש׳ ${m % 60} דק׳` }
const col = (v: number) => (v > 0 ? '#3ddc97' : v < 0 ? '#ff6b6b' : '#c8d1dc')

const box: React.CSSProperties = { background: '#0b1220', border: '1px solid #1c2738', borderRadius: 10, padding: 14 }
const lab: React.CSSProperties = { fontSize: 12, color: '#8a97a8' }

export default function PolyDesk() {
  const [st, setSt] = useState<J | null>(null)
  const [tr, setTr] = useState<J[]>([])
  const [eq, setEq] = useState<J[]>([])
  const [dec, setDec] = useState<J[]>([])
  const [live, setLive] = useState<Record<string, number>>({})
  useEffect(() => {
    const load = async () => {
      const [s, t, e, d] = await Promise.all([q('pm_state?id=eq.1'), q('pm_trades?order=opened_at.desc&limit=500'), q('pm_equity?order=ts.desc&limit=2000'), q('pm_decisions?order=ts.desc&limit=40')])
      setSt(s[0] ?? null); setTr(t); setEq([...e].reverse()); setDec(d)
    }
    load(); const id = setInterval(load, 15000); return () => clearInterval(id)
  }, [])
  const open = tr.filter((t) => t.status === 'OPEN'), closed = tr.filter((t) => t.status === 'CLOSED')
  useEffect(() => {
    const tick = async () => {
      const out: Record<string, number> = {}
      await Promise.all(open.map(async (t) => {
        try { const r = await fetch(`https://clob.polymarket.com/book?token_id=${t.token_id}`); const b = await r.json(); const bid = Math.max(0, ...(b.bids ?? []).map((x: J) => +x.price)); if (bid > 0) out[t.token_id] = bid } catch { /* keep bot mark */ }
      }))
      setLive(out)
    }
    tick(); const id = setInterval(tick, 5000); return () => clearInterval(id)
  }, [open.map((t) => t.token_id).join(',')])
  const mark = (t: J) => live[t.token_id] ?? n(t.mark_px ?? t.entry_px)
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
        <div style={lab}>חשבון נייר של $1,000 על מחירים אמיתיים מ־Polymarket. אין כסף אמיתי ואין הוראות אמיתיות. עדכון אחרון: {when(st?.last_scan)}</div>
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
        {open.length === 0 && <div style={lab}>אין פוזיציות פתוחות כרגע. הבוט סורק כל 2 דקות.</div>}
        <div style={{ display: 'grid', gap: 8 }}>
          {open.map((t) => { const m = mark(t), pnl = n(t.qty) * m - n(t.cost); return (
            <a key={t.id} href={`https://polymarket.com/event/${t.event_slug ?? t.slug}`} target="_blank" rel="noreferrer" style={{ ...box, background: '#0e1729', textDecoration: 'none', color: 'inherit', display: 'grid', gap: 4 }}>
              <div style={{ fontWeight: 600 }}>{t.question}</div>
              <div style={lab}>קנינו: <b style={{ color: '#e6edf5' }}>{t.outcome}</b> · {n(t.qty).toFixed(1)} מניות · כניסה {c(n(t.entry_px))} · עכשיו {c(m)} {live[t.token_id] != null ? '(חי)' : '(סימון הבוט)'} · נגמר בעוד {left(t.end_time)}</div>
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
              <tr key={t.id}><td style={{ padding: 6 }}>{t.question}</td><td>{t.outcome} {t.reason === 'RESOLVED_WIN' ? '✓' : '✗'}</td><td>{c(n(t.entry_px))}</td><td>{n(t.qty).toFixed(1)}</td><td>{$(n(t.cost))}</td><td>{$(n(t.entry_fee))}</td><td>{$(n(t.proceeds))}</td><td style={{ color: col(n(t.pnl)) }}>{$(n(t.pnl))}</td><td>{when(t.closed_at)}</td></tr>
            ))}</tbody>
          </table>
          {closed.length === 0 && <div style={lab}>עוד לא נסגרו עסקאות. שווי פוזיציה נקבע רק כשהשוק מוכרע.</div>}
        </div>
      </div>
      <div style={box}>
        <h2 style={{ fontSize: 17, margin: '0 0 8px' }}>החלטות אחרונות של הבוט</h2>
        {dec.map((d) => <div key={d.id} style={{ fontSize: 13, padding: '3px 0', borderBottom: '1px solid #142033' }}><span style={lab}>{when(d.ts)}</span> · <b style={{ color: d.decision === 'BUY' ? '#3ddc97' : '#8a97a8' }}>{d.decision === 'BUY' ? 'קנייה' : 'דילוג'}</b> · {d.question} · {d.outcome} @ {c(n(d.price))} · {d.reason}</div>)}
        {dec.length === 0 && <div style={lab}>אין עדיין החלטות.</div>}
      </div>
    </div>
  )
}

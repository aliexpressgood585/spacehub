// Polymarket PAPER desk — CLASSIC view (owner 2026-10-09). Read-only viewer of scripts/pm-desk.ts. All numbers come from
// the shared live feed in ../polyLive.ts (the same one the 3D arena uses), so both views always agree.
import { useMemo } from 'react'
import { type PolyLive, type J, n, usd as $, cents as c, when, left, ago, col, useNow } from '../polyLive'

const box: React.CSSProperties = { background: '#0b1220', border: '1px solid #1c2738', borderRadius: 10, padding: 14 }
const lab: React.CSSProperties = { fontSize: 12, color: '#8a97a8' }

export default function PolyDesk({ d }: { d: PolyLive }) {
  const now = useNow()
  const { st, trades: tr, open, closed, equityHist: eq, decisions: dec, live, ask, res, wsOn, tickAt, mark, cash, start, equity, realized, unreal, fees, wins } = d
  const strat = st?.strategy ?? {}
  const curve = useMemo(() => {
    if (eq.length < 2) return null
    const v = eq.map((x: J) => n(x.equity)), lo = Math.min(...v, start), hi = Math.max(...v, start), W = 600, Hh = 120
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
        <div style={{ ...lab, marginBottom: 6 }}>האסטרטגיה: קונה את התוצאה שהשוק מעריך בין {c(n(strat.lo))} ל־{c(n(strat.hi))}, בשווקים שנגמרים בתוך {n(strat.windowH)} שעות, מחזיק עד ההכרעה (משלם $1 או $0 למניה), ומוכר מוקדם רק פוזיציה שכבר במחיר {c(n(strat.exitPx) || 0.99)} ומעלה, וגם זה רק כשחסר מזומן לכניסה חדשה. {Math.round(n(strat.stakeFrac) * 100)}% מהחשבון לפוזיציה, עד {n(strat.maxOpen)} פתוחות. העמלה לפי לוח העמלות של כל שוק ב־Polymarket.</div>
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
              <div style={lab}>קנינו: <b style={{ color: '#e6edf5' }}>{t.outcome_he ?? t.outcome}</b> · {n(t.qty).toFixed(1)} מניות · כניסה {c(n(t.entry_px))} · עכשיו {c(m)} {res[t.token_id] != null ? '' : live[t.token_id] != null ? `(הצעת קנייה חיה${n(ask[t.token_id]) > 0 ? `, מכירה ${c(n(ask[t.token_id]))}` : ''})` : '(סימון הבוט)'} · {res[t.token_id] != null ? <b style={{ color: col(res[t.token_id] ? 1 : -1) }}>{res[t.token_id] ? 'הוכרע: ניצחון ✓' : 'הוכרע: הפסד ✗'} · הבוט ירשום את הסגירה במחזור הבא</b> : <>נגמר בעוד <span style={{ direction: 'ltr', display: 'inline-block' }}>{left(t.end_time, now)}</span></>}</div>
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
              <tr key={t.id}><td style={{ padding: 6 }} title={t.question}>{t.question_he ?? t.question}</td><td>{t.outcome_he ?? t.outcome} {t.reason === 'EARLY_EXIT' ? `· מימוש מוקדם ב־${c(n(t.exit_px))}` : t.reason === 'RESOLVED_WIN' ? '✓' : '✗'}</td><td>{c(n(t.entry_px))}</td><td>{n(t.qty).toFixed(1)}</td><td>{$(n(t.cost))}</td><td>{$(n(t.entry_fee) + n(t.exit_fee))}</td><td>{$(n(t.proceeds) - n(t.exit_fee))}</td><td style={{ color: col(n(t.pnl)) }}>{$(n(t.pnl))}</td><td>{when(t.closed_at)}</td></tr>
            ))}</tbody>
          </table>
          {closed.length === 0 && <div style={lab}>עוד לא נסגרו עסקאות. שווי פוזיציה נקבע רק כשהשוק מוכרע.</div>}
        </div>
      </div>
      <div style={box}>
        <h2 style={{ fontSize: 17, margin: '0 0 8px' }}>החלטות אחרונות של הבוט</h2>
        {dec.map((x: J) => <div key={x.id} style={{ fontSize: 13, padding: '3px 0', borderBottom: '1px solid #142033' }}><span style={lab}>{when(x.ts)}</span> · <b style={{ color: x.decision === 'BUY' || x.decision === 'ADD' ? '#3ddc97' : x.decision === 'SELL' ? '#f0b84a' : '#8a97a8' }}>{x.decision === 'BUY' ? 'קנייה' : x.decision === 'ADD' ? 'הגדלה' : x.decision === 'SELL' ? 'מכירה' : 'דילוג'}</b> · <span title={x.question}>{x.question_he ?? x.question}</span> · {x.outcome_he ?? x.outcome} @ {c(n(x.price))} · {x.reason}</div>)}
        {dec.length === 0 && <div style={lab}>אין עדיין החלטות.</div>}
      </div>
    </div>
  )
}

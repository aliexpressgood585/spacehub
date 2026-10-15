// Standalone page: "פולי חדשות" (Poly News) — the news-driven Polymarket paper desk (polynews.html, scripts/pmn-desk.ts).
// Read-only. Separate $1,000 account (pmn/state.json). Top: the news room (live wire of every post the desk read, the
// markets it is watching right now with their move since the post, and the per-source study); below: the classic desk
// tables (positions, closed trades, decisions) from the shared live feed in polyLive.ts.
import { StrictMode, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import PolyDesk from './components/PolyDesk'
import { usePolyLive, NEWS_DESK_URL, useNow, ago, type J } from './polyLive'

const ABOUT = 'האסטרטגיה: הבוט קורא כל 15–30 שניות 16 ערוצי טלגרם ציבוריים (חדשות שוק, עולם ומלחמות, קריפטו, פולימרקט ועסקאות לווייתנים) ו־20 אתרי חדשות. כל פוסט טרי (עד 10 דק׳) שמזכיר בשם שוק פעיל בפולימרקט נכנס למעקב של 15 דקות. הוא קונה רק אם המחיר כבר התחיל לזוז מאז הפרסום (לפחות 3¢, עד 20¢) — המחיר מגלה מה החדשה אומרת — וקונה את הצד שעולה, במחיר 5–92¢ ובספר הדוק (פער ≤ 3¢). יציאה: +10¢ רווח, −7¢ סטופ, או אחרי שעה. 3% מהחשבון לעסקה, עד 10 פתוחות, אחת לאירוע. ניסוי: בבדיקה על 45 ימי היסטוריה (31,718 פוסטים) רק 12% מהשווקים שהוזכרו זזו ≥ 2¢, אבל כשזזו — דקה אחרי הפוסט רק 17% מהתנועה כבר קרתה (יש זמן). ברכיבה על התנועה המדגם קטן (~25 מקרים) ובחלק הבודק הפסיד — זה לא מוכח.'

const box: React.CSSProperties = { background: '#0b1220', border: '1px solid #1c2738', borderRadius: 10, padding: 14 }
const lab: React.CSSProperties = { fontSize: 12, color: '#8a97a8' }
const srcName = (s: string) => (s?.startsWith('tg:') ? s.slice(3) : (s ?? '').replace(/^rss:(www\.|feeds\.|rss\.)?/, ''))
const srcCol = (s: string) => (s?.startsWith('tg:') ? '#4cc9f0' : '#f0b84a')
const STATUS: Record<string, [string, string]> = {
  WATCH: ['במעקב', '#4cc9f0'], DONE: ['נכנסנו / נבדק', '#3ddc97'], LATE: ['מאוחר מדי', '#8a97a8'], ALREADY_WATCHED: ['כבר במעקב', '#8a97a8'],
  DECIDED_MARKET: ['שוק כמעט מוכרע', '#8a97a8'], NO_MOVE: ['לא זז', '#8a97a8'], MISSED: ['זז מאוחר', '#f0b84a'], MOVE_EXHAUSTED: ['זז מדי', '#f0b84a'],
  OUT_OF_BAND: ['מחוץ לטווח', '#8a97a8'], WIDE_SPREAD: ['ספר רחב', '#8a97a8'], NO_ASK: ['אין מוכרים', '#8a97a8'], NO_BOOK: ['אין ספר', '#8a97a8'],
}
const c1 = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)}¢`

function Spark({ path, pre }: { path: [number, number][]; pre: number }) {
  if (!path?.length) return null
  const W = 120, H = 30, xs = path.map((p) => p[0]), ys = [...path.map((p) => p[1]), pre]
  const x0 = Math.min(...xs), x1 = Math.max(...xs, x0 + 1), y0 = Math.min(...ys), y1 = Math.max(...ys, y0 + 0.01)
  const P = (x: number, y: number) => `${((x - x0) / (x1 - x0)) * W},${H - ((y - y0) / (y1 - y0)) * H}`
  const last = path[path.length - 1][1]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: W, height: H }}>
      <line x1={0} x2={W} y1={H - ((pre - y0) / (y1 - y0)) * H} y2={H - ((pre - y0) / (y1 - y0)) * H} stroke="#3a4658" strokeDasharray="3 3" />
      <polyline points={path.map((p) => P(p[0], p[1])).join(' ')} fill="none" stroke={last >= pre ? '#3ddc97' : '#ff6b6b'} strokeWidth={1.6} />
    </svg>
  )
}

function NewsRoom({ st }: { st: J | null }) {
  const now = useNow()
  const [onlyMatched, setOnly] = useState(true)
  const feed: J[] = st?.feed ?? [], events: J[] = st?.events ?? []
  const watching = events.filter((e) => e.status === 'WATCH').reverse()
  const recent = events.filter((e) => e.status !== 'WATCH').slice(-12).reverse()
  const shown = (onlyMatched ? feed.filter((f) => f.question) : feed).slice(0, 40)
  const y = st?.study ?? {}
  const src = useMemo(() => Object.entries(st?.src ?? {}).map(([k, v]: [string, any]) => ({ k, ...v })).sort((a, b) => b.posts - a.posts), [st])
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ ...box, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 8 }}>
        {[['פוסטים שנקראו', String(src.reduce((a, s) => a + (s.posts ?? 0), 0))], ['חדשות שנכנסו למעקב', String(y.watched ?? 0)],
          ['השוק זז ≥ 3¢', `${y.moved ?? 0}${y.watched ? ` (${Math.round((100 * (y.moved ?? 0)) / y.watched)}%)` : ''}`], ['נכנסנו', String(y.traded ?? 0)],
          ['תזוזת השוק שעה אחרי הכניסה', y.follow_60m_c == null ? '—' : `${y.follow_60m_c >= 0 ? '+' : ''}${y.follow_60m_c.toFixed(2)}¢`],
          ['איחור חציוני מהפרסום', y.median_lag_s == null ? '—' : `${Math.round(y.median_lag_s)} שנ׳`]].map(([k, v]) => (
          <div key={k}><div style={lab}>{k}</div><div style={{ fontSize: 18, fontWeight: 600 }}>{v}</div></div>))}
      </div>

      <div style={box}>
        <h2 style={{ fontSize: 17, margin: '0 0 8px' }}>🎯 במעקב עכשיו ({watching.length})</h2>
        {!watching.length && <div style={lab}>אין כרגע חדשה טרייה שמזכירה שוק פעיל. כשתגיע — היא תופיע כאן עם המחיר לפני הפרסום ועכשיו.</div>}
        <div style={{ display: 'grid', gap: 8 }}>
          {watching.map((e) => { const last = e.path?.length ? e.path[e.path.length - 1][1] : e.pre, mv = last - e.pre, left = Math.max(0, 900 - (now / 1000 - e.post_ts)); return (
            <div key={e.id} style={{ ...box, background: '#0e1729', display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 12.5 }}><b style={{ color: srcCol(e.src) }}>{srcName(e.src)}</b> <span style={lab}>· {ago(now - e.post_ts * 1000)}</span> · {e.url ? <a href={e.url} target="_blank" rel="noreferrer" style={{ color: '#cfe0f5' }}>{e.text}</a> : e.text}</div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <a href={`https://polymarket.com/event/${e.eslug}`} target="_blank" rel="noreferrer" style={{ color: '#e6edf5', fontWeight: 600 }} dir="ltr">{e.question}</a>
                <Spark path={e.path} pre={e.pre} />
                <span style={{ fontSize: 13 }}>{e.outs?.[0]}: {(e.pre * 100).toFixed(1)}¢ → <b>{(last * 100).toFixed(1)}¢</b> <b style={{ color: Math.abs(mv) >= 0.03 ? (mv > 0 ? '#3ddc97' : '#ff6b6b') : '#8a97a8' }}>({c1(mv)})</b></span>
                <span style={lab}>מילים משותפות: {(e.shared ?? []).join(', ')} · נשאר {Math.floor(left / 60)}:{String(Math.floor(left % 60)).padStart(2, '0')}</span>
              </div>
            </div>) })}
        </div>
        {recent.length > 0 && <>
          <div style={{ ...lab, margin: '10px 0 4px' }}>מעקבים אחרונים שהסתיימו</div>
          {recent.map((e) => { const [t, col] = STATUS[e.status] ?? [e.status, '#8a97a8']; return (
            <div key={e.id} style={{ fontSize: 12.5, padding: '3px 0', borderBottom: '1px solid #142033' }}>
              <b style={{ color: col }}>{t}</b> · <span style={{ color: srcCol(e.src) }}>{srcName(e.src)}</span> · {e.text.slice(0, 90)} → <span dir="ltr">{e.question.slice(0, 60)}</span> · תזוזה מרבית {((e.max_move ?? 0) * 100).toFixed(1)}¢{e.m60 != null ? ` · אחרי שעה ${(e.m60 * 100).toFixed(1)}¢ (לפני ${(e.pre * 100).toFixed(1)}¢)` : ''}
            </div>) })}
        </>}
      </div>

      <div style={box}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>📡 מבזק חי</h2>
          <label style={{ ...lab, cursor: 'pointer' }}><input type="checkbox" checked={onlyMatched} onChange={(e) => setOnly(e.target.checked)} /> רק חדשות שתואמות שוק</label>
        </div>
        {!shown.length && <div style={lab}>עוד אין חדשות{onlyMatched ? ' שתואמות שוק' : ''}.</div>}
        <div style={{ display: 'grid', gap: 2, maxHeight: 520, overflowY: 'auto' }}>
          {shown.map((f) => { const [t, col] = STATUS[f.status] ?? ['', '#8a97a8']; return (
            <div key={f.id} style={{ fontSize: 12.5, padding: '5px 0', borderBottom: '1px solid #142033' }}>
              <span style={{ ...lab, display: 'inline-block', minWidth: 74 }}>{ago(now - Date.parse(f.ts))}</span>
              <b style={{ color: srcCol(f.src) }}>{srcName(f.src)}</b> · {f.url ? <a href={f.url} target="_blank" rel="noreferrer" style={{ color: '#cfe0f5' }}>{f.text.slice(0, 200)}</a> : f.text.slice(0, 200)}
              {f.question && <div style={{ marginInlineStart: 74, color: '#9fb3c8' }}>↳ <span dir="ltr">{f.question}</span> {t && <b style={{ color: col }}>· {t}</b>}</div>}
            </div>) })}
        </div>
      </div>

      <div style={box}>
        <h2 style={{ fontSize: 17, margin: '0 0 8px' }}>מקורות</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 4, fontSize: 12.5 }}>
          {src.map((s) => { const b = y.by_src?.[s.k] ?? {}; const ok = s.last && now - Date.parse(s.last) < 300_000; return (
            <div key={s.k}><span style={{ color: ok ? '#3ddc97' : '#ff6b6b' }}>●</span> <b style={{ color: srcCol(s.k) }}>{srcName(s.k)}</b> <span style={lab}>· {s.posts ?? 0} פוסטים · {b.events ?? 0} מעקבים · {b.moved ?? 0} זזו · {b.traded ?? 0} עסקאות</span></div>) })}
        </div>
      </div>
    </div>
  )
}

function App() {
  const d = usePolyLive(NEWS_DESK_URL)
  return (
    <div style={{ minHeight: '100vh', background: '#04070E', display: 'flex', justifyContent: 'center', padding: '12px 10px' }}>
      <div style={{ width: '100%', maxWidth: 1100, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <a href="poly.html" style={{ color: '#9fb3c8', fontSize: 12 }}>← שולחן Polymarket הראשי</a>
          <a href="polycoins.html" style={{ color: '#9fb3c8', fontSize: 12 }}>← פולי מטבעות</a>
        </div>
        <PolyDesk d={d} title="פולי חדשות · דמו" about={ABOUT} extra={<NewsRoom st={d.st} />} />
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)

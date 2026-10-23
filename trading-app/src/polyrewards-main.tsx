// Standalone page: "פולי תגמולים" — the Polymarket liquidity-rewards PAPER desk (polyrewards.html). Read-only: reads
// pmr/state.json from the pmr-data branch every 5 s. Splits the result honestly into rewards earned and trading P&L
// (fills + inventory marked at the midpoint), because the rewards only count if the fills do not eat them.
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

const URL_ = 'https://raw.githubusercontent.com/aliexpressgood585/spacehub/pmr-data/pmr/state.json'
type J = any
const usd = (v: number | null | undefined, d = 2) => (v == null || !isFinite(v) ? '—' : `${v < 0 ? '−' : ''}$${Math.abs(v).toFixed(d)}`)
const pct = (v: number | null | undefined, d = 1) => (v == null || !isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(d)}%`)
const col = (v: number) => (v > 0 ? '#3ddc97' : v < 0 ? '#ff6b6b' : '#c9d4e0')
const il = (ts: string) => new Date(ts).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', hour12: false, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const ago = (ts?: string) => (ts ? `${Math.max(0, Math.round((Date.now() - Date.parse(ts)) / 1000))} שנ׳` : '—')
const ACT: Record<string, string> = { SELECT: 'נכנס לשוק', DESELECT: 'יוצא מהשוק', UNWIND: 'פירוק מלאי' }

function Chart({ pts }: { pts: J[] }) {
  if (pts.length < 2) return <div style={{ color: '#8fa3b8', fontSize: 13 }}>הגרף יתמלא אחרי כמה מחזורים.</div>
  const W = 900, Hh = 180, t0 = Date.parse(pts[0].t), t1 = Date.parse(pts[pts.length - 1].t)
  const base = 1000, ys = pts.flatMap((p) => [p.eq - base, p.rw, p.eq - base - p.rw])
  const lo = Math.min(0, ...ys), hi = Math.max(1, ...ys)
  const x = (p: J) => ((Date.parse(p.t) - t0) / Math.max(1, t1 - t0)) * W, y = (v: number) => Hh - ((v - lo) / (hi - lo)) * Hh
  const line = (f: (p: J) => number) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p).toFixed(1)},${y(f(p)).toFixed(1)}`).join('')
  return <svg viewBox={`0 0 ${W} ${Hh}`} style={{ width: '100%', height: 180 }} preserveAspectRatio="none">
    <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="#2a3a55" strokeDasharray="4 4" />
    <path d={line((p) => p.rw)} fill="none" stroke="#f5c84c" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    <path d={line((p) => p.eq - base - p.rw)} fill="none" stroke="#7aa7ff" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    <path d={line((p) => p.eq - base)} fill="none" stroke="#3ddc97" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
  </svg>
}

function App() {
  const [st, setSt] = useState<J>(null), [, tick] = useState(0)
  useEffect(() => {
    const load = () => fetch(URL_ + '?t=' + Date.now()).then((r) => r.json()).then(setSt).catch(() => {})
    load(); const a = setInterval(load, 5000), b = setInterval(() => tick((x) => x + 1), 1000)
    return () => { clearInterval(a); clearInterval(b) }
  }, [])
  if (!st) return <div style={{ padding: 24 }}>טוען… (אם זה נמשך, הדסק עוד לא פרסם מצב ראשון)</div>
  const last = st.equity?.[st.equity.length - 1] ?? { eq: st.cash, rw: st.rewards }
  const eq = last.eq, rw = st.rewards, trade = eq - st.start_cash - rw
  const days = Math.max(1 / 24, (Date.now() - Date.parse(st.started)) / 86400_000)
  const mk = Object.values<J>(st.markets ?? {})
  const card = { background: '#0b1322', border: '1px solid #1d2a40', borderRadius: 12, padding: 12 } as const
  const R = st.rules ?? {}
  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 16, display: 'grid', gap: 12 }}>
      <div><h1 style={{ fontSize: 22 }}>פולי תגמולים 🏦</h1>
        <div style={{ color: '#8fa3b8', fontSize: 13 }}>חשבון דמו $1,000 שמספק נזילות בפולימרקט ומקבל את תגמולי הנזילות שהבורסה משלמת · ספרי פקודות, מאגרי תגמולים ועסקאות אמיתיים · מחזור אחרון לפני {ago(st.last_cycle)}{st.note?.error ? ` · שגיאה: ${st.note.error}` : ''}</div></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 8 }}>
        {[['הון', usd(eq), col(eq - st.start_cash)], ['שינוי', pct(eq / st.start_cash - 1, 2), col(eq - st.start_cash)],
          ['תגמולים שהורווחו', usd(rw), col(rw)], ['רווח/הפסד מסחר', usd(trade), col(trade)],
          ['קצב תגמולים עכשיו', `${usd(st.reward_rate_now, 0)}/יום`, '#f5c84c'], ['ממוצע בפועל', `${usd((eq - st.start_cash) / days, 1)}/יום`, col(eq - st.start_cash)]]
          .map(([k, v, c]) => <div key={k} style={card}><div style={{ color: '#8fa3b8', fontSize: 12 }}>{k}</div><div style={{ fontSize: 20, fontWeight: 700, color: c }}>{v}</div></div>)}
      </div>
      <div style={card}><b>מאיפה הכסף</b> <span style={{ fontSize: 12, color: '#8fa3b8' }}>· <span style={{ color: '#3ddc97' }}>■</span> סה״כ · <span style={{ color: '#f5c84c' }}>■</span> תגמולים · <span style={{ color: '#7aa7ff' }}>■</span> מסחר (מילויים + מלאי לפי אמצע)</span>
        <Chart pts={st.equity ?? []} />
        <div style={{ fontSize: 12.5, color: '#8fa3b8' }}>השיטה רווחית רק אם הקו הכחול לא אוכל את הצהוב. פועל מאז {il(st.started)} ({days.toFixed(1)} ימים).</div>
      </div>
      <div style={card}><b>שווקים פעילים ({mk.length}/{R.maxMarkets})</b>
        {!mk.length && <div style={{ color: '#8fa3b8', marginTop: 6 }}>בוחר שווקים…</div>}
        {mk.map((m: J) => { const inv = m.yesSh - m.noSh, val = m.yesSh * m.mid + m.noSh * (1 - m.mid), tp = m.cashFlow + val
          return <div key={m.cid} style={{ padding: '8px 0', borderTop: '1px solid #1d2a40' }}>
            <a href={`https://polymarket.com/event/${m.slug}`} target="_blank" style={{ color: '#e6edf5', fontWeight: 600 }}>{m.q}</a>
            <div style={{ fontSize: 12.5, color: '#8fa3b8', marginTop: 2 }}>מאגר {usd(m.rate, 0)}/יום · החלק שלנו {pct(m.share, 0)} = {usd(m.rate * m.share, 1)}/יום · אמצע {(m.mid * 100).toFixed(1)}¢ · פסגה {m.v}¢ · מינימום {m.min} מניות · מסתיים {il(m.end)}</div>
            <div style={{ fontSize: 12.5, marginTop: 2 }}>הצעות: קנייה {m.bid ? `${(m.bid.px * 100).toFixed(1)}¢ × ${m.bid.size} (תור לפנינו ${Math.round(m.bid.queue)})` : '—'} · מכירה {m.ask ? `${(m.ask.px * 100).toFixed(1)}¢ × ${m.ask.size} (תור ${Math.round(m.ask.queue)})` : '—'}{m.note ? ` · ${m.note}` : ''}</div>
            <div style={{ fontSize: 12.5, marginTop: 2 }}>מלאי {inv > 0 ? `${inv.toFixed(0)} YES` : inv < 0 ? `${(-inv).toFixed(0)} NO` : 'אפס'} · מילויים {m.fills} · תגמולים <span style={{ color: '#f5c84c' }}>{usd(m.rewards)}</span> · מסחר <span style={{ color: col(tp) }}>{usd(tp)}</span></div>
          </div> })}
      </div>
      <div style={card}><b>מילויים אחרונים</b> <span style={{ fontSize: 12, color: '#8fa3b8' }}>(מישהו אמיתי סחר דרך המחיר שלנו)</span>
        {!(st.fills ?? []).length && <div style={{ color: '#8fa3b8', marginTop: 6 }}>עוד אין.</div>}
        {(st.fills ?? []).slice(0, 30).map((f: J, i: number) => <div key={i} style={{ fontSize: 12.5, padding: '4px 0', borderTop: '1px solid #1d2a40' }}>
          {il(f.ts)} · {f.side === 'bid' ? 'קנינו YES' : 'מכרנו YES'} {f.size} @ {(f.px * 100).toFixed(1)}¢ · אמצע {(f.mid * 100).toFixed(1)}¢ · {f.q.slice(0, 60)}</div>)}
      </div>
      <div style={card}><b>שווקים שנסגרו</b>
        {!(st.closed ?? []).length && <div style={{ color: '#8fa3b8', marginTop: 6 }}>עוד אין.</div>}
        {(st.closed ?? []).slice(0, 30).map((c: J, i: number) => <div key={i} style={{ fontSize: 12.5, padding: '4px 0', borderTop: '1px solid #1d2a40' }}>
          {il(c.closed_at)} · {c.q.slice(0, 60)} · תגמולים {usd(c.rewards)} · מסחר <span style={{ color: col(c.trading) }}>{usd(c.trading)}</span> · {c.fills} מילויים</div>)}
      </div>
      <div style={card}><b>החלטות</b>
        {(st.decisions ?? []).slice(0, 20).map((d: J, i: number) => <div key={i} style={{ fontSize: 12.5, padding: '4px 0', borderTop: '1px solid #1d2a40' }}>{il(d.ts)} · {ACT[d.action] ?? d.action} · {d.q?.slice(0, 60)} · {d.why}</div>)}
      </div>
      <div style={{ ...card, fontSize: 12.5, color: '#8fa3b8', lineHeight: 1.6 }}>
        <b style={{ color: '#e6edf5' }}>איך זה עובד:</b> פולימרקט משלמת כל יום מאגר תגמולים (כרגע {usd(st.pool_total, 0)} ביום על {st.pool_markets} שווקים) למי שמשאיר הצעות קנייה ומכירה קרוב למחיר. הבוט בוחר את {R.maxMarkets} השווקים שבהם החלק הצפוי שלנו הכי גדול ביחס להון, מציב הצעה במחיר הקנייה הטוב ובמחיר המכירה הטוב (לפחות בגודל המינימלי), ומקבל תגמול לפי הנוסחה הרשמית: ((פסגה − מרחק)/פסגה)² × גודל, יחסית לכל שאר ההצעות בספר.
        <b style={{ color: '#e6edf5' }}> הסיכון:</b> כשמישהו יודע משהו (חדשות), הוא ימכור לנו בדיוק לפני שהמחיר יורד. לכן המילויים נבדקים מול העסקאות האמיתיות (אחרי התור שעמד לפנינו), המלאי מוגבל ל־{R.invCap}× הגודל, ויציאה {R.exitHours} שעות לפני סוף השוק.
        <b style={{ color: '#e6edf5' }}> בכנות:</b> קצב התגמולים שמוצג הוא תחזית לפי הספר הנוכחי. ההצעות שלנו וירטואליות, אז שחקנים אמיתיים לא מגיבים אליהן; בפועל ייתכן יותר תחרות. בדסק הקריפטו, הצעות פסיביות בלי תגמולים הפסידו 6-10% לדולר. זה לא מוכח עד שיצטברו שבועות של תוצאות.
      </div>
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)

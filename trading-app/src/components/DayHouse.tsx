// "בית הבוט" tab 2 — the day-trading coach PAPER desk (scripts/daytrade-desk.ts, rules shared/daytrade.ts, S1-S6 on 15m).
// Read-only viewer of daytrade/state.json on the pm-desk-data branch; open positions re-marked from OKX tickers every 3 s.
import { useEffect, useMemo, useState } from 'react'

const STATE = 'https://raw.githubusercontent.com/aliexpressgood585/spacehub/pm-desk-data/daytrade/state.json'
type J = any
const box: React.CSSProperties = { background: '#0b1220', border: '1px solid #1c2738', borderRadius: 10, padding: 14 }
const lab: React.CSSProperties = { fontSize: 12, color: '#8a97a8' }
const usd = (x: number) => (x < 0 ? '−$' : '$') + Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const px = (x: number) => (x >= 100 ? x.toFixed(2) : x >= 1 ? x.toFixed(4) : x.toPrecision(4))
const col = (x: number) => (x > 0 ? '#3ddc97' : x < 0 ? '#ff6b6b' : '#e6edf5')
const ago = (ms: number) => (ms < 60_000 ? `לפני ${Math.max(0, Math.round(ms / 1000))} שנ׳` : ms < 3600_000 ? `לפני ${Math.round(ms / 60_000)} דק׳` : `לפני ${(ms / 3600_000).toFixed(1)} שע׳`)
const sg = (s: string) => (s === 'LONG' ? 1 : -1)
const WHY: Record<string, string> = { TARGET: 'יעד', STOP: 'סטופ', BE: 'נקודת כניסה', NO_MOVE: 'לא זז 8 נרות', TIME: 'זמן' }
const SETUPS: [string, string][] = [['S1', 'Holy Grail — ADX>30, חזרה ל-EMA20, נר סוגר עם המגמה'], ['S2', 'Turtle Soup — שבירת קיצון 20 נרות שנכשלה'], ['S3', 'כניסה שנייה (H2/L2) במגמה'],
  ['S4', 'VWAP Reclaim — חזרה מעל/מתחת ל-VWAP ובדיקה'], ['S5', 'חוק ה-80% — חזרה לאזור הערך של אתמול'], ['S6', 'פריצת טווח הפתיחה של ניו יורק (13:30-14:30 UTC)']]

export default function DayHouse() {
  const [st, setSt] = useState<J>(null), [err, setErr] = useState<string | null>(null)
  const [live, setLive] = useState<Record<string, number>>({}), [now, setNow] = useState(Date.now()), [all, setAll] = useState(false)
  useEffect(() => {
    let dead = false
    const load = async () => { try { const r = await fetch(`${STATE}?t=${Math.floor(Date.now() / 4000)}`, { cache: 'no-store' }); if (!r.ok) throw new Error(String(r.status)); const j = await r.json(); if (!dead) { setSt(j); setErr(null) } } catch (e) { if (!dead) setErr(String(e)) } }
    load(); const a = setInterval(load, 5000), b = setInterval(() => setNow(Date.now()), 1000)
    return () => { dead = true; clearInterval(a); clearInterval(b) }
  }, [])
  const open: J[] = useMemo(() => (st?.trades ?? []).filter((t: J) => t.status === 'OPEN'), [st])
  const closed: J[] = useMemo(() => (st?.trades ?? []).filter((t: J) => t.status === 'CLOSED').slice().reverse(), [st])
  useEffect(() => {
    if (!open.length) return
    let dead = false
    const tick = async () => { try { const j = await (await fetch('https://www.okx.com/api/v5/market/tickers?instType=SWAP')).json(); const m: Record<string, number> = {}
      for (const t of j.data ?? []) { const s = /^([A-Z0-9]+)-USDT-SWAP$/.exec(t.instId)?.[1]; if (s && open.some((o) => o.sym === s)) m[s] = +t.last } if (!dead) setLive(m) } catch { /* bot marks */ } }
    tick(); const id = setInterval(tick, 3000); return () => { dead = true; clearInterval(id) }
  }, [open.map((o) => o.sym).join(',')])
  if (!st) return <div dir="rtl" style={{ color: '#e6edf5', padding: 20 }}>{err ? `הבוט עוד לא פרסם מצב (${err}). המחזור הראשון רץ ב-GitHub Actions — נסה שוב בעוד דקה.` : 'טוען…'}</div>
  const mark = (t: J) => live[t.sym] ?? t.mark_px ?? t.entry_px
  const unreal = open.reduce((a, t) => a + sg(t.side) * (mark(t) - t.entry_px) * t.qty - (t.funding ?? 0), 0)
  const equity = st.cash + open.reduce((a, t) => a + t.margin, 0) + unreal, start = st.start_cash
  const realized = closed.reduce((a, t) => a + t.pnl, 0), stats = st.stats ?? {}, rk = st.risk ?? {}
  const lastCycle = st.last_cycle ? now - Date.parse(st.last_cycle) : null, alive = lastCycle != null && lastCycle < 7 * 60_000 // raw.githubusercontent max-age=300
  const nextBar = 15 * 60_000 - (now % (15 * 60_000))
  return (
    <div dir="rtl" style={{ color: '#e6edf5', fontFamily: 'system-ui, sans-serif', display: 'grid', gap: 12 }}>
      <div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <h1 style={{ fontSize: 24, margin: 0 }}>מאמן הדיי טריידינג · 15m</h1>
          <span style={{ ...lab, border: '1px solid #2a3a52', borderRadius: 20, padding: '3px 10px' }}>נייר בלבד</span>
          <span title="הבוט שומר מצב כל ~15 שנ׳; השרת של GitHub מגיש את הקובץ עם השהיה של עד 5 דק׳" style={{ ...lab, border: `1px solid ${alive ? '#2f7a55' : '#7a2f2f'}`, borderRadius: 20, padding: '3px 10px', color: alive ? '#3ddc97' : '#ff6b6b' }}>{alive ? `● פעיל · עדכון שהגיע ${ago(lastCycle!)}` : `● לא פעיל${lastCycle != null ? ` · מחזור אחרון ${ago(lastCycle)}` : ''}`}</span>
        </div>
        <div style={{ ...lab, marginTop: 4 }}>חשבון דמו $5,000 · {st.universe?.coins?.length ?? 7} מטבעות (כל חוזי USDT בביננס פיוצ׳רס שיש להם מחיר חי ב-OKX) · סריקה בכל סגירת נר 15 דק׳ (הבאה בעוד {Math.ceil(nextBar / 60_000)} דק׳) · מחירים OKX · אין פקודות אמיתיות.</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8 }}>
        {([['שווי חשבון', usd(equity), equity - start], ['רווח/הפסד כולל', usd(equity - start), equity - start], ['ממומש', usd(realized), realized], ['פתוח', usd(unreal), unreal],
          ['עסקאות היום', `${rk.dayEntries ?? 0}/4 · הפסדים ${rk.dayLosses ?? 0}/3`, 0], ['עסקאות שנסגרו', `${stats.closed ?? 0} · ${stats.closed ? Math.round(100 * stats.wins / stats.closed) : 0}% הצלחה`, 0],
          ['תוחלת לעסקה', stats.expectancy_R == null ? '—' : `${stats.expectancy_R > 0 ? '+' : ''}${stats.expectancy_R}R`, stats.expectancy_R ?? 0], ['מזומן', usd(st.cash), 0]] as [string, string, number][]).map(([k, v, s]) => (
          <div key={k} style={box}><div style={lab}>{k}</div><div style={{ fontSize: 19, fontWeight: 600, color: col(s), direction: 'ltr', textAlign: 'right' }}>{v}</div></div>))}
      </div>
      <div style={{ ...box, borderColor: st.scan?.gate ? '#7a2f2f' : '#1c2738' }}>
        <div style={lab}>שומר היום</div>
        <div style={{ fontSize: 15, marginTop: 4 }}>{st.scan?.gate ? `⛔ ${st.scan.gate}` : '✅ מותר לסחור (סיכון 0.5% לעסקה)'}</div>
        <div style={{ ...lab, marginTop: 6 }}>הון בתחילת היום {usd(rk.dayStart ?? start)} (סיום יום ב-−2%) · רצף הפסדים {rk.streak ?? 0} (הפסקה של שעתיים אחרי 2)</div>
      </div>
      <div style={box}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>פוזיציות פתוחות ({open.length}/2)</div>
        {!open.length && <div style={lab}>אין פוזיציות. רוב הזמן התשובה היא "אין עסקה". מגבלת השעות (F1) בוטלה לבקשתך — הבוט סורק 24/7, כולל לילה וסופ״ש.</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 8 }}>
          {open.map((t) => { const m = mark(t), pnl = sg(t.side) * (m - t.entry_px) * t.qty - (t.funding ?? 0), R = pnl / t.risk_usd
            const bars = Math.floor((now - Date.parse(t.opened_at)) / 900_000)
            return (<div key={t.id} style={{ ...box, background: '#0e1729' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{t.sym} <span style={{ color: t.side === 'LONG' ? '#3ddc97' : '#ff6b6b' }}>{t.side === 'LONG' ? 'לונג' : 'שורט'}</span> · {t.setup}</b><span style={{ color: col(pnl), direction: 'ltr' }}>{usd(pnl)} · {R >= 0 ? '+' : ''}{R.toFixed(2)}R</span></div>
              <div style={{ ...lab, marginTop: 6, lineHeight: 1.7 }}>{t.setup_note}<br />כניסה {px(t.entry_px)} · עכשיו <b style={{ color: '#e6edf5' }}>{px(m)}</b>{live[t.sym] ? ' (חי)' : ''}<br />
                סטופ {px(t.stop)}{t.hit1R ? ' (הוזז לכניסה ✓)' : ''} · יעד {px(t.target)} · חיסול {px(t.liq_px)}<br />
                גודל {usd(t.notional)} · {t.lev}x בודד · סיכון {usd(t.risk_usd)} · נר {bars}/{t.hit1R ? 32 : 8}</div></div>) })}
        </div>
      </div>
      <div style={box}>
        <div style={{ fontWeight: 600 }}>סורק — סטאפים בנר האחרון</div>
        <div style={lab}>נר 15m אחרון: {st.scan?.bar ? new Date(st.scan.bar).toISOString().slice(11, 16) + ' UTC' : '—'} · סריקה {st.scan?.at ? ago(now - Date.parse(st.scan.at)) : '—'}</div>
        <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
          {(() => { const rs = st.scan?.rows ?? [], withS = rs.filter((r: J) => (r.setups ?? []).length).sort((a: J, b: J) => +b.setups.some((x: J) => x.ok) - +a.setups.some((x: J) => x.ok)), rest = rs.length - withS.length
            return <div style={lab}>נסרקו {rs.length} מטבעות · {withS.length} עם סטאפ · {rest} בלי סטאפ או בלי נר עדכני{rest ? <> · <a href="#" onClick={(e) => { e.preventDefault(); setAll(!all) }} style={{ color: '#7fb2ff' }}>{all ? 'הסתר' : 'הצג הכל'}</a></> : null}</div> })()}
          {[...(st.scan?.rows ?? [])].filter((r: J) => all || (r.setups ?? []).length).sort((a: J, b: J) => (b.setups ?? []).length - (a.setups ?? []).length).map((r: J) => (
            <div key={r.sym} style={{ fontSize: 13, borderTop: '1px solid #1c2738', paddingTop: 6 }}>
              <b>{r.sym}</b> <span style={lab}>{r.err ?? `כיוון 1h ${r.h1 > 0 ? '↑' : r.h1 < 0 ? '↓' : '—'} · ADX ${r.adx} · נפח 24h ${st.vol24?.[r.sym] ? '$' + Math.round(st.vol24[r.sym] / 1e6) + 'M' : '—'}`}</span>
              {!r.err && !(r.setups ?? []).length && <span style={lab}> · אין סטאפ</span>}
              {(r.setups ?? []).map((x: J, i: number) => (
                <div key={i} style={{ marginTop: 4, marginRight: 10 }}>
                  <span style={{ color: x.ok ? '#3ddc97' : '#f0b84a' }}>{x.setup} {x.side === 'LONG' ? 'לונג' : 'שורט'}</span> — {x.note} · יעד {x.rNet}R נטו{x.costR ? ` · עלות ${x.costR}R` : ''}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>{x.checks.map((c: J, k: number) => <span key={k} title={c.v ?? ''} style={{ fontSize: 11, padding: '1px 6px', borderRadius: 8, background: c.ok ? '#123524' : '#3a1717', color: c.ok ? '#3ddc97' : '#ff8a8a' }}>{c.ok ? '✓' : '✗'} {c.k}{c.v ? ` (${c.v})` : ''}</span>)}</div>
                </div>))}
            </div>))}
        </div>
      </div>
      <div style={box}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>יומן החלטות</div>
        {!(st.decisions ?? []).length && <div style={lab}>עוד אין החלטות.</div>}
        {(st.decisions ?? []).slice(0, 30).map((d: J, i: number) => (
          <div key={i} style={{ fontSize: 13, padding: '3px 0', borderTop: i ? '1px solid #1c2738' : 'none' }}>
            <span style={lab}>{new Date(d.at).toISOString().slice(5, 16).replace('T', ' ')} </span>
            <b style={{ color: d.decision === 'ENTER' ? '#3ddc97' : d.decision === 'EXIT' ? '#7cc4ff' : d.decision === 'MANAGE' ? '#c9a0ff' : '#f0b84a' }}>{({ ENTER: 'כניסה', EXIT: 'יציאה', MANAGE: 'ניהול', SKIP: 'דילוג' } as J)[d.decision]}</b> {d.sym} {d.side ? (d.side === 'LONG' ? 'לונג' : 'שורט') : ''} — {WHY[d.why] ?? d.why}{d.pnl != null ? ` · ${usd(d.pnl)} (${d.R}R)` : ''}
          </div>))}
      </div>
      {!!closed.length && <div style={box}><div style={{ fontWeight: 600, marginBottom: 6 }}>עסקאות שנסגרו</div>
        {closed.slice(0, 50).map((t) => (<div key={t.id} style={{ fontSize: 13, padding: '3px 0', borderTop: '1px solid #1c2738', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span>{t.sym} {t.side === 'LONG' ? 'לונג' : 'שורט'} · {t.setup} · {WHY[t.reason] ?? t.reason}</span><span style={{ color: col(t.pnl), direction: 'ltr' }}>{usd(t.pnl)} · {t.R >= 0 ? '+' : ''}{t.R.toFixed(2)}R</span></div>))}</div>}
      <div style={box}><div style={{ fontWeight: 600, marginBottom: 6 }}>הסטאפים (רק אלה)</div>{SETUPS.map(([k, v]) => <div key={k} style={{ fontSize: 13 }}><b>{k}</b> — {v}</div>)}
        <div style={{ ...lab, marginTop: 6 }}>סטופ צר מ-0.8% (עלות מעל 0.2R) מורחב ל-0.8% והגודל קטן בהתאם · יעד ≥ 1.5R אחרי עלויות · ב-1R הסטופ זז לכניסה · לא זז 8 נרות → יציאה.</div></div>
      <div style={{ ...box, borderColor: '#5a4a1c' }}>
        <div style={{ fontWeight: 600 }}>⚠️ בקטסט לפני הפעלה (כלל ברזל 6)</div>
        <div style={{ fontSize: 13, lineHeight: 1.7, marginTop: 6 }}>אותם כללים על 7 חוזים של Binance Futures, נרות 15m, 09/2024–09/2026, עמלות + החלקה + Funding:
          860 עסקאות · הצלחה 32% · <b>−0.07R לעסקה</b> · PF 0.84 · Sharpe −1.13 · $5,000→$3,655 · ירידה מקסימלית 30%. מחוץ למדגם: <b>−0.13R (t −2.3), PF 0.69</b> — הפסד מובהק.
          S6 (פריצת פתיחה) הוא 598 מהעסקאות ו-−$945. רק S2 חיובי, על 9 עסקאות בלבד (רעש). <b>לכן רץ בדמו בלבד</b>, כמו שהפרומפט עצמו דורש.</div>
        <div style={{ ...lab, marginTop: 6 }}>קירובים: אישור 5m ותזמון 1m לא ממודלים · כניסה Taker (לא Maker — בדיקת צל הראתה ש-Maker גרוע יותר) · אין לוח אירועים (חלון קבוע 12:00-13:00 UTC) · F4 = נזילות ספר OKX (מחזור 24h ≥ $10M, מרווח ≤ 10bps) — מטבע דליל נסרק אבל לא נכנסים בו · F7 מצב רוח = הפסקה אחרי 2 הפסדים.</div>
      </div>
    </div>
  )
}

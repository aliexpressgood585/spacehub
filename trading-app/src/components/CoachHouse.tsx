// "בית הבוט" — the quant-coach futures PAPER desk (scripts/coach-desk.ts, rules shared/coach.ts). Read-only viewer:
// every number comes from coach/state.json on the pm-desk-data branch; open positions are re-marked in the browser from
// OKX's public tickers every 3 s (the same feed the bot uses). Nothing here computes a signal the bot does not compute.
import { useEffect, useMemo, useState } from 'react'

const STATE = 'https://raw.githubusercontent.com/aliexpressgood585/spacehub/pm-desk-data/coach/state.json'
type J = any
const box: React.CSSProperties = { background: '#0b1220', border: '1px solid #1c2738', borderRadius: 10, padding: 14 }
const lab: React.CSSProperties = { fontSize: 12, color: '#8a97a8' }
const usd = (x: number) => (x < 0 ? '−$' : '$') + Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const px = (x: number) => (x >= 100 ? x.toFixed(2) : x >= 1 ? x.toFixed(4) : x.toPrecision(4))
const col = (x: number) => (x > 0 ? '#3ddc97' : x < 0 ? '#ff6b6b' : '#e6edf5')
const ago = (ms: number) => (ms < 60_000 ? `לפני ${Math.max(0, Math.round(ms / 1000))} שנ׳` : ms < 3600_000 ? `לפני ${Math.round(ms / 60_000)} דק׳` : `לפני ${(ms / 3600_000).toFixed(1)} שע׳`)
const sg = (s: string) => (s === 'LONG' ? 1 : -1)

export default function CoachHouse() {
  const [st, setSt] = useState<J>(null), [err, setErr] = useState<string | null>(null), [showAll, setShowAll] = useState(false)
  const [live, setLive] = useState<Record<string, number>>({}), [now, setNow] = useState(Date.now())
  useEffect(() => {
    let dead = false
    const load = async () => {
      try { const r = await fetch(`${STATE}?t=${Math.floor(Date.now() / 4000)}`, { cache: 'no-store' }); if (!r.ok) throw new Error(String(r.status)); const j = await r.json(); if (!dead) { setSt(j); setErr(null) } }
      catch (e) { if (!dead) setErr(String(e)) }
    }
    load(); const a = setInterval(load, 5000), b = setInterval(() => setNow(Date.now()), 1000)
    return () => { dead = true; clearInterval(a); clearInterval(b) }
  }, [])
  const open: J[] = useMemo(() => (st?.trades ?? []).filter((t: J) => t.status === 'OPEN'), [st])
  const closed: J[] = useMemo(() => (st?.trades ?? []).filter((t: J) => t.status === 'CLOSED').slice().reverse(), [st])
  useEffect(() => {
    if (!open.length) return
    let dead = false
    const tick = async () => {
      try {
        const r = await fetch('https://www.okx.com/api/v5/market/tickers?instType=SWAP'); const j = await r.json(); const m: Record<string, number> = {}
        for (const t of j.data ?? []) { const s = /^([A-Z0-9]+)-USDT-SWAP$/.exec(t.instId)?.[1]; if (s && open.some((o) => o.sym === s)) m[s] = +t.last }
        if (!dead) setLive(m)
      } catch { /* keep the bot's marks */ }
    }
    tick(); const id = setInterval(tick, 3000)
    return () => { dead = true; clearInterval(id) }
  }, [open.map((o) => o.sym).join(',')])

  if (!st) return <div dir="rtl" style={{ color: '#e6edf5', padding: 20 }}>{err ? `הבוט עוד לא פרסם מצב (${err}). המחזור הראשון רץ ב-GitHub Actions — נסה שוב בעוד דקה.` : 'טוען את בית הבוט…'}</div>
  const mark = (t: J) => live[t.sym] ?? t.mark_px ?? t.entry_px
  const unreal = open.reduce((a, t) => a + sg(t.side) * (mark(t) - t.entry_px) * t.qty - (t.funding ?? 0), 0)
  const equity = st.cash + open.reduce((a, t) => a + t.margin, 0) + unreal
  const start = st.start_cash, realized = closed.reduce((a, t) => a + t.pnl, 0)
  const dd = st.peak ? 1 - equity / Math.max(st.peak, equity) : 0
  const gate = st.scan?.gate, stats = st.stats ?? {}
  const eq: J[] = st.equity ?? []
  const curve = (() => {
    if (eq.length < 2) return null
    const v = eq.map((x) => x.equity), lo = Math.min(...v, start), hi = Math.max(...v, start), W = 600, H = 110
    return { d: v.map((x, i) => `${(i / (v.length - 1)) * W},${H - ((x - lo) / (hi - lo || 1)) * H}`).join(' '), base: H - ((start - lo) / (hi - lo || 1)) * H, W, H }
  })()
  const lastCycle = st.last_cycle ? now - Date.parse(st.last_cycle) : null
  // raw.githubusercontent serves the state with max-age=300, so a healthy desk can look up to ~5 min old here
  const alive = lastCycle != null && lastCycle < 7 * 60_000
  return (
    <div dir="rtl" style={{ color: '#e6edf5', fontFamily: 'system-ui, sans-serif', display: 'grid', gap: 12 }}>
      <div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <h1 style={{ fontSize: 24, margin: 0 }}>בית הבוט · מאמן המסחר הכמותי</h1>
          <span style={{ ...lab, border: '1px solid #2a3a52', borderRadius: 20, padding: '3px 10px' }}>נייר בלבד</span>
          <span title="הבוט שומר מצב כל ~15 שנ׳; השרת של GitHub מגיש את הקובץ עם השהיה של עד 5 דק׳" style={{ ...lab, border: `1px solid ${alive ? '#2f7a55' : '#7a2f2f'}`, borderRadius: 20, padding: '3px 10px', color: alive ? '#3ddc97' : '#ff6b6b' }}>
            {alive ? `● פעיל · עדכון שהגיע ${ago(lastCycle!)}` : `● לא פעיל${lastCycle != null ? ` · מחזור אחרון ${ago(lastCycle)}` : ''}`}</span>
        </div>
        <div style={{ ...lab, marginTop: 4 }}>חשבון דמו של $5,000 על חוזים עתידיים צמודי USDT. מחירים: OKX (Binance Futures חסום משרתי GitHub). אין כסף אמיתי ואין פקודות אמיתיות. רץ ב-GitHub Actions כל ~15 שנ׳ (פרויקט Supabase של הבוט הישן חסום).</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8 }}>
        {([['שווי חשבון', usd(equity), equity - start], ['רווח/הפסד כולל', usd(equity - start), equity - start], ['ממומש', usd(realized), realized], ['פתוח', usd(unreal), unreal],
          ['מזומן פנוי', usd(st.cash), 0], ['Drawdown מהשיא', `${(100 * dd).toFixed(1)}%`, -dd],
          ['עסקאות שנסגרו', `${stats.closed ?? 0} · ${stats.closed ? Math.round(100 * stats.wins / stats.closed) : 0}% הצלחה`, 0],
          ['תוחלת לעסקה', stats.expectancy_R == null ? '—' : `${stats.expectancy_R > 0 ? '+' : ''}${stats.expectancy_R}R`, stats.expectancy_R ?? 0]] as [string, string, number][]).map(([k, v, s]) => (
          <div key={k} style={box}><div style={lab}>{k}</div><div style={{ fontSize: 19, fontWeight: 600, color: col(s), direction: 'ltr', textAlign: 'right' }}>{v}</div></div>
        ))}
      </div>

      {curve && <div style={box}><div style={lab}>עקומת הון</div>
        <svg viewBox={`0 0 ${curve.W} ${curve.H}`} style={{ width: '100%', height: 110 }} preserveAspectRatio="none">
          <line x1="0" x2={curve.W} y1={curve.base} y2={curve.base} stroke="#2a3a52" strokeDasharray="4 4" />
          <polyline points={curve.d} fill="none" stroke={equity >= start ? '#3ddc97' : '#ff6b6b'} strokeWidth="2" />
        </svg></div>}

      <div style={{ ...box, borderColor: gate?.mult === 0 ? '#7a2f2f' : '#1c2738' }}>
        <div style={lab}>שומר הסיכון (חלק א + F8 + P5)</div>
        <div style={{ fontSize: 15, marginTop: 4 }}>{!gate ? 'עוד לא היה סריקה' : gate.mult === 0 ? `⛔ ${gate.why}` : gate.mult < 1 ? `⚠️ ${gate.why} (גודל ×${gate.mult})` : '✅ מותר לסחור · גודל מלא (1% סיכון)'}</div>
        <div style={{ ...lab, marginTop: 6 }}>רצף הפסדים: {st.risk?.streak ?? 0} · הון בתחילת היום {usd(st.risk?.dayStart ?? start)} (עצירה ב-−3%) · בתחילת השבוע {usd(st.risk?.weekStart ?? start)} (עצירה ב-−6%) · שיא {usd(st.peak ?? start)} (חצי גודל ב-−15%)</div>
      </div>

      <div style={box}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>פוזיציות פתוחות ({open.length}/3)</div>
        {!open.length && <div style={lab}>אין פוזיציות. הבוט סורק פעם בכל נר 4 שעות שנסגר (00/04/08/12/16/20 UTC) ונכנס רק כשכל הבדיקות עוברות.</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 8 }}>
          {open.map((t) => {
            const m = mark(t), pnl = sg(t.side) * (m - t.entry_px) * t.qty - (t.funding ?? 0), R = pnl / t.risk_usd
            const left = 30 * 4 * 3600_000 - (now - Date.parse(t.opened_at))
            return (
              <div key={t.id} style={{ ...box, background: '#0e1729' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{t.sym} <span style={{ color: t.side === 'LONG' ? '#3ddc97' : '#ff6b6b' }}>{t.side === 'LONG' ? 'לונג' : 'שורט'}</span></b><span style={{ color: col(pnl), direction: 'ltr' }}>{usd(pnl)} · {R >= 0 ? '+' : ''}{R.toFixed(2)}R</span></div>
                <div style={{ ...lab, marginTop: 6, lineHeight: 1.7, direction: 'rtl' }}>
                  כניסה {px(t.entry_px)} · עכשיו <b style={{ color: '#e6edf5' }}>{px(m)}</b>{live[t.sym] ? ' (חי)' : ''}<br />
                  סטופ {px(t.stop)} · יעד 2R {px(t.target)} · חיסול משוער {px(t.liq_px)}<br />
                  גודל {usd(t.notional)} · מינוף {t.lev}x בודד · בטחונות {usd(t.margin)} · סיכון {usd(t.risk_usd)}<br />
                  Funding {usd(-(t.funding ?? 0))} · יציאת זמן בעוד {left > 0 ? `${(left / 3600_000).toFixed(1)} שע׳` : 'עכשיו'}
                </div>
              </div>)
          })}
        </div>
      </div>

      <div style={box}>
        <div style={{ fontWeight: 600 }}>סורק — הצ׳קליסט לכל מטבע</div>
        <div style={lab}>נר 4h אחרון שנבדק: {st.scan?.bar ? new Date(st.scan.bar).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '—'} · סריקה {st.scan?.at ? ago(now - Date.parse(st.scan.at)) : '—'}</div>
        <div style={{ overflowX: 'auto', marginTop: 8 }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
            <thead><tr style={{ color: '#8a97a8' }}><th style={{ textAlign: 'right', padding: 4 }}>מטבע</th>{(st.scan?.rows?.find((r: J) => r.checks)?.checks ?? []).map((c: J, i: number) => <th key={i} title={c.k} style={{ padding: 4, fontWeight: 400 }}>{c.k.split(' ')[0]}</th>)}<th style={{ padding: 4 }}>החלטה</th></tr></thead>
            <tbody>{[...(st.scan?.rows ?? [])].sort((x: J, y: J) => (y.checks ?? []).filter((c: J) => c.ok).length - (x.checks ?? []).filter((c: J) => c.ok).length).slice(0, showAll ? undefined : 40).map((r: J) => (
              <tr key={r.sym} style={{ borderTop: '1px solid #1c2738' }}>
                <td style={{ padding: 4 }}>{r.sym}</td>
                {r.checks ? r.checks.map((c: J, i: number) => <td key={i} title={`${c.k}: ${c.v ?? ''}`} style={{ textAlign: 'center', padding: 4, color: c.ok ? '#3ddc97' : '#ff6b6b' }}>{c.ok ? '✓' : '✗'}</td>) : <td colSpan={9} style={{ ...lab, padding: 4 }}>{r.err}</td>}
                <td style={{ padding: 4, color: r.side ? '#3ddc97' : '#8a97a8' }}>{r.side ? (r.side === 'LONG' ? 'לונג' : 'שורט') : 'אין עסקה'}</td>
              </tr>))}</tbody>
          </table>
        </div>
        <div style={{ ...lab, marginTop: 6 }}>נסרקו {(st.scan?.rows ?? []).length} מטבעות (כל חוזי USDT בביננס פיוצ׳רס עם מחיר חי ב-OKX), ממוינים לפי מספר הבדיקות שעברו.{(st.scan?.rows ?? []).length > 40 && <> <a href="#" onClick={(e) => { e.preventDefault(); setShowAll(!showAll) }} style={{ color: '#7fb2ff' }}>{showAll ? 'הצג 40 הראשונים' : 'הצג הכל'}</a></>} העמודה האחרונה = נזילות ספר OKX (≥ $10M ביום, מרווח ≤ 10bps).</div>
        <div style={{ ...lab, marginTop: 6 }}>F1 משטר+ADX · כניסה=פריצת Donchian-20 · F2 BTC · F3 ATR · F4 מחזור · F5 Funding · F7 חלון אירועים. ריחוף מעל ✓/✗ מראה את הערך.</div>
      </div>

      <div style={box}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>יומן החלטות</div>
        {!(st.decisions ?? []).length && <div style={lab}>עוד אין החלטות.</div>}
        {(st.decisions ?? []).slice(0, 30).map((d: J, i: number) => (
          <div key={i} style={{ fontSize: 13, padding: '3px 0', borderTop: i ? '1px solid #1c2738' : 'none' }}>
            <span style={lab}>{new Date(d.at).toISOString().slice(5, 16).replace('T', ' ')} </span>
            <b style={{ color: d.decision === 'ENTER' ? '#3ddc97' : d.decision === 'EXIT' ? '#7cc4ff' : '#f0b84a' }}>{d.decision === 'ENTER' ? 'כניסה' : d.decision === 'EXIT' ? 'יציאה' : 'דילוג'}</b> {d.sym} {d.side ? (d.side === 'LONG' ? 'לונג' : 'שורט') : ''} — {d.why}{d.pnl != null ? ` · ${usd(d.pnl)} (${d.R}R)` : ''}
          </div>))}
      </div>

      {!!closed.length && <div style={box}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>עסקאות שנסגרו</div>
        {closed.slice(0, 50).map((t) => (
          <div key={t.id} style={{ fontSize: 13, padding: '3px 0', borderTop: '1px solid #1c2738', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span>{t.sym} {t.side === 'LONG' ? 'לונג' : 'שורט'} · {t.reason === 'TARGET' ? 'יעד' : t.reason === 'STOP' ? 'סטופ' : 'זמן'} · {px(t.entry_px)}→{px(t.exit_px)}</span>
            <span style={{ color: col(t.pnl), direction: 'ltr' }}>{usd(t.pnl)} · {t.R >= 0 ? '+' : ''}{t.R.toFixed(2)}R</span>
          </div>))}
      </div>}

      <div style={{ ...box, borderColor: '#5a4a1c' }}>
        <div style={{ fontWeight: 600 }}>⚠️ בקטסט לפני הפעלה (כלל ברזל 4)</div>
        <div style={{ fontSize: 13, lineHeight: 1.7, marginTop: 6 }}>
          אותם כללים בדיוק על 30 חוזים של Binance Futures, נרות 4h, 12/2023–09/2026, עם עמלות, החלקה ו-Funding אמיתי:
          589 עסקאות · הצלחה 37.9% · תוחלת +0.03R (לא מובהק) · Profit Factor 0.94 · Sharpe −0.23 · הון $5,000→$4,251 · ירידה מקסימלית 21% · רצף 23 הפסדים.
          מחוץ למדגם (30% האחרונים): PF 1.01 — שטוח. <b>לא עומד ברף של הפרומפט עצמו</b> (PF &gt; 1.3, Sharpe &gt; 1), ולכן לפי כלל 4 הוא רץ <b>בדמו בלבד</b>.
        </div>
        <div style={{ ...lab, marginTop: 6 }}>לא ממומש: F6 Open Interest (אין היסטוריה), לוח אירועי מאקרו (חלון קבוע 13:00–14:30 UTC במקום), מושגי נזילות/SMC (הפרומפט עצמו מציין שלא הוכחו). כללי ברזל 1–7 ממומשים בקוד: shared/coach.ts.</div>
      </div>
    </div>
  )
}

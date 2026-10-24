// Standalone page: "ערכת הדיי טריידר" (daytrader.html) — a crypto day-trading toolkit for every USDT perpetual Binance Futures
// trades. 11 tools in tabs, one flow: scanner -> news -> entry timer -> exit plan -> time machine -> budget -> risk -> paper order ->
// alerts, plus funding/OI and liquidations boards. Reads dtk/state.json (scripts/dtk-scan.ts, every ~60 s) and live OKX prices.
// The rules are the SAME module the scanner uses (shared/dtk.ts). PAPER ONLY: orders go to a journal in this browser, never to
// an exchange, and only after the owner types "כן".
import { StrictMode, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DTK, KIND_HE, setupsAt, replay, monteCarlo, budget, riskChecks, type Bar, type Setup } from '../../shared/dtk'

const STATE = 'https://raw.githubusercontent.com/aliexpressgood585/spacehub/dtk-data/dtk/state.json'
const OKX = 'https://www.okx.com/api/v5'
type J = any
const fx = (v: number | null | undefined, d = 2) => (v == null || !isFinite(v) ? '—' : v.toFixed(d))
const px = (v: number | null | undefined) => (v == null || !isFinite(v) ? '—' : v >= 100 ? v.toFixed(2) : v >= 1 ? v.toFixed(4) : v.toPrecision(4))
const usd = (v: number | null | undefined, d = 2) => (v == null || !isFinite(v) ? '—' : `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`)
const big = (v: number | null | undefined) => (v == null || !isFinite(v) ? '—' : v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${(v / 1e3).toFixed(0)}K`)
const pct = (v: number | null | undefined, d = 2) => (v == null || !isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(d)}%`)
const col = (v: number | null | undefined) => (v == null || !isFinite(v) ? '#c9d4e0' : v > 0 ? '#3ddc97' : v < 0 ? '#ff6b6b' : '#c9d4e0')
const il = (ms: number | string) => new Date(ms).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', hour12: false, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const ago = (ts?: string | number) => { if (!ts) return '—'; const s = Math.max(0, Math.round((Date.now() - +new Date(ts)) / 1000)); return s < 90 ? `${s} שנ׳` : s < 5400 ? `${Math.round(s / 60)} דק׳` : `${Math.round(s / 3600)} שע׳` }
const SIDE_HE = { LONG: 'לונג ▲', SHORT: 'שורט ▼' } as const
const okxJ = async (u: string) => { const r = await fetch(u); const x = await r.json(); if (x.code !== '0') throw new Error(x.msg); return x.data }
const toBars = (rows: string[][], all = false): Bar[] => rows.filter((r) => all || r[8] === '1').map((r) => ({ t: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[7] })).sort((a, b) => a.t - b.t)

// ---- local (this browser) settings + paper journal ----
const LS = (k: string, d: any) => { try { const v = localStorage.getItem('dtk_' + k); return v ? JSON.parse(v) : d } catch { return d } }
const SV = (k: string, v: any) => { try { localStorage.setItem('dtk_' + k, JSON.stringify(v)) } catch { /* private mode */ } }
type Settings = { account: number; maxLoss: number; dayLoss: number; perDay: number; lev: number }
const DEF: Settings = { account: DTK.account, maxLoss: DTK.limits.maxLossUsd, dayLoss: DTK.limits.dayLossUsd, perDay: DTK.limits.tradesPerDay, lev: DTK.leverage }
type Pos = { id: number; sym: string; side: 'LONG' | 'SHORT'; kind: string; entry: number; stop: number; target: number; qty: number; opened: number; flatAt: number; status: 'OPEN' | 'CLOSED'; exit?: number; reason?: string; pnl?: number; closed?: number; mark?: number }

const box: React.CSSProperties = { background: '#0b1322', border: '1px solid #1c2a44', borderRadius: 12, padding: 14, marginBottom: 12 }
const th: React.CSSProperties = { textAlign: 'right', padding: '6px 8px', color: '#8fa3b8', fontWeight: 500, fontSize: 12, borderBottom: '1px solid #1c2a44', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid #122036', fontSize: 13, whiteSpace: 'nowrap' }
const btn = (on = false): React.CSSProperties => ({ background: on ? '#1f6feb' : '#13203a', color: '#fff', border: '1px solid #2a3a55', borderRadius: 8, padding: '6px 10px', fontSize: 13, cursor: 'pointer' })
const Note = ({ children }: { children: React.ReactNode }) => <div style={{ color: '#8fa3b8', fontSize: 12.5, lineHeight: 1.6, marginTop: 8 }}>{children}</div>
const Stat = ({ k, v, c }: { k: string; v: React.ReactNode; c?: string }) => <div style={{ background: '#0f1a2e', borderRadius: 10, padding: '8px 10px', minWidth: 110 }}><div style={{ color: '#8fa3b8', fontSize: 11.5 }}>{k}</div><div style={{ fontSize: 16, fontWeight: 600, color: c ?? '#fff', marginTop: 2 }}>{v}</div></div>
const Row = ({ children }: { children: React.ReactNode }) => <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{children}</div>
const Bar3 = ({ a, b, c, la, lb, lc }: { a: number; b: number; c: number; la: string; lb: string; lc: string }) => <div>
  <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', background: '#122036' }}>
    <div style={{ width: `${a * 100}%`, background: '#3ddc97' }} /><div style={{ width: `${b * 100}%`, background: '#ff6b6b' }} /><div style={{ width: `${c * 100}%`, background: '#5b6b82' }} /></div>
  <div style={{ display: 'flex', gap: 14, fontSize: 12, marginTop: 4, color: '#c9d4e0' }}><span style={{ color: '#3ddc97' }}>{la} {(a * 100).toFixed(1)}%</span><span style={{ color: '#ff6b6b' }}>{lb} {(b * 100).toFixed(1)}%</span><span>{lc} {(c * 100).toFixed(1)}%</span></div></div>

function Spark({ bars, s, live }: { bars: Bar[]; s: Setup; live?: number }) {
  if (bars.length < 2) return <Note>טוען נרות…</Note>
  const W = 700, H = 200, lv = [s.stop, s.target, s.entry, ...(live ? [live] : [])], hi = Math.max(...bars.map((b) => b.h), ...lv), lo = Math.min(...bars.map((b) => b.l), ...lv)
  const y = (v: number) => H - ((v - lo) / (hi - lo || 1)) * H, cw = W / bars.length
  const line = (v: number, c: string, t: string) => <g><line x1={0} x2={W} y1={y(v)} y2={y(v)} stroke={c} strokeDasharray="5 4" /><text x={4} y={y(v) - 3} fill={c} fontSize={11}>{t} {px(v)}</text></g>
  return <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 200, background: '#08101d', borderRadius: 8 }} preserveAspectRatio="none">
    {bars.map((b, i) => { const up = b.c >= b.o, x = i * cw + cw / 2; return <g key={b.t}><line x1={x} x2={x} y1={y(b.h)} y2={y(b.l)} stroke={up ? '#3ddc97' : '#ff6b6b'} /><rect x={x - cw * 0.35} width={cw * 0.7} y={y(Math.max(b.o, b.c))} height={Math.max(1, Math.abs(y(b.o) - y(b.c)))} fill={up ? '#3ddc97' : '#ff6b6b'} opacity={b.t === s.t ? 1 : 0.75} stroke={b.t === s.t ? '#fff' : 'none'} /></g> })}
    {line(s.target, '#3ddc97', 'יעד')}{line(s.stop, '#ff6b6b', 'סטופ')}{line(s.entry, '#7aa7ff', 'כניסה')}
    {live ? <line x1={0} x2={W} y1={y(live)} y2={y(live)} stroke="#f5c84c" /> : null}
  </svg>
}


function EqChart({ pts, start }: { pts: J[]; start: number }) {
  if (!pts || pts.length < 2) return <Note>הגרף יתמלא אחרי כמה דקות של ריצה.</Note>
  const W = 900, H = 160, t0 = Date.parse(pts[0].t), t1 = Date.parse(pts[pts.length - 1].t), ys = pts.map((p) => p.eq), lo = Math.min(start, ...ys), hi = Math.max(start, ...ys)
  const x = (p: J) => ((Date.parse(p.t) - t0) / Math.max(1, t1 - t0)) * W, y = (v: number) => H - ((v - lo) / (hi - lo || 1)) * H
  return <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 160 }} preserveAspectRatio="none">
    <line x1={0} x2={W} y1={y(start)} y2={y(start)} stroke="#2a3a55" strokeDasharray="4 4" />
    <path d={pts.map((p, i) => `${i ? 'L' : 'M'}${x(p).toFixed(1)},${y(p.eq).toFixed(1)}`).join('')} fill="none" stroke={ys[ys.length - 1] >= start ? '#3ddc97' : '#ff6b6b'} strokeWidth={2} vectorEffect="non-scaling-stroke" /></svg>
}
const WHY: Record<string, string> = { STOP: 'סטופ', TARGET: 'יעד', TIME: 'סוף זמן (4 ש׳)' }
function Demo({ P, live }: { P: J; live: Record<string, { last: number; bid: number; ask: number }> }) {
  if (!P) return <div style={box}><Note>החשבון ייפתח בסריקה הראשונה של הסורק (כל נר 5 דקות).</Note></div>
  const open = P.trades.filter((t: J) => t.status === 'OPEN'), closed = P.trades.filter((t: J) => t.status === 'CLOSED')
  const exitPx = (t: J) => { const m = live[t.sym]; return m ? (t.side === 'LONG' ? m.bid : m.ask) : t.mark }
  const upnl = (t: J) => (t.side === 'LONG' ? 1 : -1) * (exitPx(t) - t.entry) * t.qty - t.qty * exitPx(t) * DTK.taker
  const eq = P.cash + open.reduce((a: number, t: J) => a + t.margin + upnl(t), 0), real = closed.reduce((a: number, t: J) => a + t.pnl, 0)
  const wins = closed.filter((t: J) => t.pnl > 0).length, margin = open.reduce((a: number, t: J) => a + t.margin, 0)
  return <>
    <div style={box}>
      <Row><Stat k="שווי החשבון (חי)" v={usd(eq)} c={col(eq - P.start)} /><Stat k="שינוי" v={pct(eq / P.start - 1)} c={col(eq - P.start)} /><Stat k="מזומן פנוי" v={usd(P.cash)} /><Stat k="ביטחון נעול" v={usd(margin)} />
        <Stat k="רווח/הפסד ממומש" v={usd(real)} c={col(real)} /><Stat k="עמלות ששולמו" v={usd(-P.fees)} c="#ff6b6b" /><Stat k="מימון" v={usd(-P.funding)} c={col(-P.funding)} /><Stat k="עסקאות" v={`${closed.length} · ${closed.length ? Math.round(wins / closed.length * 100) : 0}% הצלחה`} /></Row>
      <div style={{ marginTop: 10 }}><EqChart pts={[...(P.equity ?? []), { t: new Date().toISOString(), eq }]} start={P.start} /></div>
      <Note>חשבון דמו של $1,000 שנסחר לבד, על מחירים חיים של אותם מטבעות שנסחרים ב-Binance Futures. כל נר 5 דקות הסורק מוצא סטאפים. קודם מכונת הזמן: נכנסים רק אם אותו כלל, על אותו מטבע ובאותו כיוון, נדלק לפחות 30 פעמים ב-20 הימים האחרונים והרוויח בממוצע אחרי עמלות. אחר כך מנהל הסיכונים מסנן: עלויות עד 25% מהסיכון, מרווח, נזילות, מימון, חיסול רחוק לפחות פי 2 מהסטופ ועד 20 עסקאות ביום. הגודל: כל המזומן הפנוי מתחלק כביטחון בין העסקאות שאושרו בסריקה, במינוף 5x מבודד (עסקה אחת = כ-5 פעמים החשבון). אין תקרת הפסד לעסקה ואין עצירה יומית, כך שהפסד בסטופ יכול להיות 5%–15% מהחשבון. העסקה נפתחת במחיר הספר החי (כולל עומק הספר). היציאה בסטופ, ביעד או אחרי 4 שעות, לפי נרות של דקה, כמו פקודה שיושבת בבורסה. עמלת taker 0.05% לכל צד, ומימון אמיתי בכל סליקה. עד 4 פוזיציות במקביל. שום כסף אמיתי.</Note>
    </div>
    <div style={box}><h3 style={{ fontSize: 15, marginBottom: 6 }}>פוזיציות פתוחות ({open.length}/{P.rules?.maxOpen ?? 4})</h3>
      {open.length ? <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{['מטבע', 'כיוון', 'סטאפ', 'כניסה', 'עכשיו', 'סטופ', 'יעד', 'שווי', 'ביטחון', 'רווח/הפסד', 'R', 'זמן', 'נסגר עד'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>{open.map((t: J) => { const u = upnl(t) - t.fee_in - t.funding; return <tr key={t.id}><td style={td}><b>{t.sym}</b></td><td style={{ ...td, color: t.side === 'LONG' ? '#3ddc97' : '#ff6b6b' }}>{SIDE_HE[t.side as 'LONG']}</td><td style={td} title={t.why}>{t.kind_he}</td>
          <td style={td}>{px(t.entry)}</td><td style={{ ...td, color: '#f5c84c' }}>{px(live[t.sym]?.last ?? t.mark)}</td><td style={td}>{px(t.stop)}</td><td style={td}>{px(t.target)}</td><td style={td}>{usd(t.notional)}</td><td style={td}>{usd(t.margin)}</td>
          <td style={{ ...td, color: col(u) }}>{usd(u)}</td><td style={{ ...td, color: col(u) }}>{fx(u / t.risk_usd)}</td><td style={td}>{ago(t.opened_at)}</td><td style={td}>{il(t.flat_at)}</td></tr> })}</tbody></table></div> : <Note>אין פוזיציות פתוחות. הבוט מחכה לסטאפ שעובר את מכונת הזמן ואת מנהל הסיכונים.</Note>}
      <Note>הרווח/הפסד הפתוח מחושב לפי מחיר היציאה בפועל (bid ללונג, ask לשורט), אחרי עמלת כניסה, עמלת יציאה משוערת ומימון ששולם.</Note></div>
    <div style={box}><h3 style={{ fontSize: 15, marginBottom: 6 }}>עסקאות שנסגרו</h3>
      {closed.length ? <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{['מטבע', 'כיוון', 'סטאפ', 'כניסה', 'יציאה', 'סיבה', 'ברוטו', 'עמלות', 'מימון', 'נטו', 'R', 'נפתח', 'נסגר'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>{closed.slice(0, 100).map((t: J) => <tr key={t.id}><td style={td}><b>{t.sym}</b></td><td style={{ ...td, color: t.side === 'LONG' ? '#3ddc97' : '#ff6b6b' }}>{SIDE_HE[t.side as 'LONG']}</td><td style={td}>{t.kind_he}</td><td style={td}>{px(t.entry)}</td><td style={td}>{px(t.exit)}</td><td style={td}>{WHY[t.reason] ?? t.reason}</td>
          <td style={{ ...td, color: col(t.gross) }}>{usd(t.gross)}</td><td style={td}>{usd(-(t.fee_in + t.exit_fee))}</td><td style={td}>{usd(-t.funding)}</td><td style={{ ...td, color: col(t.pnl), fontWeight: 600 }}>{usd(t.pnl)}</td><td style={{ ...td, color: col(t.R) }}>{fx(t.R)}</td><td style={td}>{il(t.opened_at)}</td><td style={td}>{il(t.closed_at)}</td></tr>)}</tbody></table></div> : <Note>עוד אין עסקאות סגורות.</Note>}</div>
    <div style={box}><h3 style={{ fontSize: 15, marginBottom: 6 }}>יומן החלטות</h3>
      {(P.decisions ?? []).slice(0, 40).map((d: J, i: number) => <div key={i} style={{ fontSize: 12.5, padding: '3px 0', borderBottom: '1px solid #122036' }}><span style={{ color: '#8fa3b8' }}>{il(d.at)}</span> <b style={{ color: d.act === 'OPEN' ? '#3ddc97' : d.act === 'EXIT' ? (d.pnl >= 0 ? '#3ddc97' : '#ff6b6b') : '#8fa3b8' }}>{d.act === 'OPEN' ? 'נפתח' : d.act === 'EXIT' ? 'נסגר' : 'דילג'}</b> {d.sym} {SIDE_HE[d.side as 'LONG'] ?? ''} · {d.act === 'EXIT' ? `${WHY[d.why] ?? d.why} · ${usd(d.pnl)} (${fx(d.R)}R)` : d.why}</div>)}</div>
  </>
}

const TABS = ['תיק דמו $1,000', 'סורק גרפים', 'מעקב חדשות', 'תזמון כניסה', 'תכנון יציאה', 'מכונת הזמן', 'ניהול סיכונים', 'ניהול תקציב', 'ביצוע (נייר)', 'התראות מחיר', 'מימון ו-OI', 'חיסולים'] as const

function App() {
  const [st, setSt] = useState<J>(null), [tab, setTab] = useState<string>(LS('tab2', TABS[0])), [sel, setSel] = useState<J>(null), [, tick] = useState(0)
  const [cfg, setCfg] = useState<Settings>({ ...DEF, ...LS('cfg', {}) }), [pos, setPos] = useState<Pos[]>(LS('pos', [])), [alerts, setAlerts] = useState<J[]>(LS('alerts', []))
  const [live, setLive] = useState<Record<string, { last: number; bid: number; ask: number; at: number }>>({}), [bars, setBars] = useState<Bar[]>([]), [liqOnly, setLiqOnly] = useState(true), [q, setQ] = useState('')
  const [tm, setTm] = useState<J>(null), [tmBusy, setTmBusy] = useState(false), [confirm, setConfirm] = useState(''), [log, setLog] = useState<string[]>([])
  useEffect(() => { SV('tab2', tab) }, [tab]); useEffect(() => { SV('cfg', cfg) }, [cfg]); useEffect(() => { SV('pos', pos) }, [pos]); useEffect(() => { SV('alerts', alerts) }, [alerts])
  useEffect(() => {
    // raw.githubusercontent caches a branch file for ~5 min. Ask the GitHub API for the newest commit of dtk-data (cheap, ~1/min to
    // stay inside the 60 requests/hour a browser gets) and read the file AT THAT COMMIT, which is never stale. Falls back to the branch URL.
    let sha = '', last = 0
    const load = async () => {
      try {
        if (Date.now() - last > 55_000 || !sha) {
          last = Date.now()
          const r = await fetch('https://api.github.com/repos/aliexpressgood585/spacehub/commits/dtk-data', { headers: { Accept: 'application/vnd.github.sha' } })
          if (r.ok) sha = (await r.text()).trim()
        }
        const u = sha ? `https://raw.githubusercontent.com/aliexpressgood585/spacehub/${sha}/dtk/state.json` : STATE + '?t=' + Date.now()
        setSt(await (await fetch(u)).json())
      } catch { /* keep the last state */ }
    }
    load(); const a = setInterval(load, 20000), b = setInterval(() => tick((x) => x + 1), 1000)
    return () => { clearInterval(a); clearInterval(b) }
  }, [])
  // live prices for the selected coin + every open paper position + custom alerts, every 3 s
  const demoOpen: string[] = (st?.paper?.trades ?? []).filter((t: J) => t.status === 'OPEN').map((t: J) => t.sym)
  const syms = useMemo(() => [...new Set([sel?.sym, ...pos.filter((p) => p.status === 'OPEN').map((p) => p.sym), ...alerts.map((a) => a.sym), ...demoOpen])].filter(Boolean), [sel, pos, alerts, demoOpen.join()])
  useEffect(() => {
    if (!syms.length) return
    const go = () => Promise.all(syms.map((s) => okxJ(`${OKX}/market/ticker?instId=${s}-USDT-SWAP`).then((d) => [s, { last: +d[0].last, bid: +d[0].bidPx, ask: +d[0].askPx, at: Date.now() }] as const).catch(() => null)))
      .then((xs) => setLive((o) => ({ ...o, ...Object.fromEntries(xs.filter(Boolean) as any) })))
    go(); const a = setInterval(go, 3000); return () => clearInterval(a)
  }, [syms.join()])
  useEffect(() => {
    if (!sel) return
    setTm(null)
    const go = () => okxJ(`${OKX}/market/candles?instId=${sel.sym}-USDT-SWAP&bar=5m&limit=72`).then((r) => setBars(toBars(r, true))).catch(() => {})
    go(); const a = setInterval(go, 10000); return () => clearInterval(a)
  }, [sel?.sym, sel?.t])

  const say = (m: string) => { setLog((l) => [`${il(Date.now())} ${m}`, ...l].slice(0, 40)); beep(); notify(m) }
  // paper position management + alerts (while this page is open)
  useEffect(() => {
    let changed = false
    const next = pos.map((p) => {
      if (p.status !== 'OPEN') return p
      const m = live[p.sym]; if (!m) return p
      const sg = p.side === 'LONG' ? 1 : -1, exitPx = p.side === 'LONG' ? m.bid : m.ask
      const why = sg * (exitPx - p.stop) <= 0 ? 'סטופ' : sg * (exitPx - p.target) >= 0 ? 'יעד' : Date.now() >= p.flatAt ? 'סוף זמן (4 שעות)' : null
      if (!why) return { ...p, mark: m.last }
      changed = true
      const fill = exitPx * (1 - sg * DTK.slip), pnl = sg * (fill - p.entry) * p.qty - (p.entry + fill) * p.qty * DTK.taker
      say(`${p.sym} ${SIDE_HE[p.side]} נסגר: ${why} · ${usd(pnl)}`)
      return { ...p, status: 'CLOSED' as const, exit: fill, reason: why, pnl, closed: Date.now() }
    })
    if (changed) setPos(next)
    for (const a of alerts) { const m = live[a.sym]; if (m && !a.fired && (a.dir === 'above' ? m.last >= a.px : m.last <= a.px)) { a.fired = Date.now(); say(`התראה: ${a.sym} ${a.dir === 'above' ? 'מעל' : 'מתחת'} ${px(a.px)} (עכשיו ${px(m.last)})`); setAlerts([...alerts]) } }
  }, [live])

  if (!st) return <div style={{ padding: 24 }}>טוען… (אם זה נמשך, הסורק עוד לא פרסם מצב ראשון)</div>
  const B = st.board ?? {}, sb = sel ? B[sel.sym] : null, L = sel ? live[sel.sym] : null
  const today = Math.floor(Date.now() / 86400000), closedToday = pos.filter((p) => p.status === 'CLOSED' && Math.floor((p.closed ?? 0) / 86400000) === today)
  const dayPnl = closedToday.reduce((a, p) => a + (p.pnl ?? 0), 0), tradesToday = pos.filter((p) => Math.floor(p.opened / 86400000) === today).length
  const limits = { ...DTK.limits, maxLossUsd: cfg.maxLoss, dayLossUsd: cfg.dayLoss, tradesPerDay: cfg.perDay }
  const bu = sel ? budget(sel, cfg.maxLoss, cfg.account, cfg.lev) : null
  const rk = sel && bu ? riskChecks(sel, bu, { spreadBps: sb?.spread ?? undefined, volUsd: sb?.vol ?? undefined, funding: sb?.funding ?? null, dayPnl, tradesToday }, limits) : null
  const pick = (s: J, go = 'תזמון כניסה') => { setSel(s); setTab(go); setConfirm('') }
  const setups: J[] = (st.setups ?? []).filter((s: J) => !liqOnly || s.liquid)

  const runTM = async () => {
    if (!sel) return; setTmBusy(true)
    try {
      const out = new Map<number, Bar>(); let after = ''
      for (let p = 0; p < 20; p++) { const rows: string[][] = await okxJ(`${OKX}/market/history-candles?instId=${sel.sym}-USDT-SWAP&bar=5m&limit=100${after ? `&after=${after}` : ''}`); if (!rows.length) break; toBars(rows).forEach((b) => out.set(b.t, b)); after = rows[rows.length - 1][0] }
      const h = [...out.values()].sort((a, b) => a.t - b.t)
      setTm({ replay: replay(h, sel.kind, sel.side), mc: monteCarlo(h, sel, DTK.mcPaths, 19), days: h.length * 5 / 1440, at: Date.now() })
    } catch { setTm({ error: 'לא הצלחתי למשוך היסטוריה מ-OKX מהדפדפן' }) }
    setTmBusy(false)
  }
  const place = () => {
    if (!sel || !bu || !L) return
    const sg = sel.side === 'LONG' ? 1 : -1, fill = (sel.side === 'LONG' ? L.ask : L.bid) * (1 + sg * DTK.slip)
    const p: Pos = { id: Date.now(), sym: sel.sym, side: sel.side, kind: sel.kind, entry: fill, stop: sel.stop, target: sel.target, qty: bu.qty, opened: Date.now(), flatAt: Date.now() + DTK.holdBars * DTK.bar, status: 'OPEN', mark: L.last }
    setPos([p, ...pos]); setConfirm(''); setTab('התראות מחיר'); say(`נפתחה פוזיציית נייר ${sel.sym} ${SIDE_HE[sel.side]} ${fx(bu.qty, 4)} @ ${px(fill)}`)
  }
  const stale = sel && L ? (() => {
    const sg = sel.side === 'LONG' ? 1 : -1, r = Math.abs(sel.entry - sel.stop), d = sg * (L.last - sel.entry) / r
    return sg * (L.last - sel.stop) <= 0 ? { t: 'בוטל: המחיר כבר מעבר לסטופ', c: '#ff6b6b' } : sg * (L.last - sel.target) >= 0 ? { t: 'פספסת: המחיר כבר הגיע ליעד', c: '#f5c84c' }
      : d > 0.3 ? { t: `רודף: המחיר ברח ${fx(d)}R מנקודת הכניסה, הסיכון גדל`, c: '#f5c84c' } : { t: 'הסטאפ עדיין בתוקף', c: '#3ddc97' }
  })() : null

  return <div style={{ maxWidth: 1180, margin: '0 auto', padding: '14px 12px 60px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
      <h1 style={{ fontSize: 22 }}>ערכת הדיי טריידר <span style={{ color: '#8fa3b8', fontSize: 14, fontWeight: 400 }}>· כל מטבעות Binance Futures</span></h1>
      <div style={{ color: Date.now() - Date.parse(st.last_cycle) > 180_000 ? '#ff6b6b' : '#8fa3b8', fontSize: 12.5 }}>{Date.now() - Date.parse(st.last_cycle) > 180_000 ? '⚠️ השרת לא עדכן מעל 3 דקות · ' : '🟢 חי · '}עדכון אחרון לפני {ago(st.last_cycle)} · סריקה {ago(st.scan?.at)} · {st.scan?.coins ?? '—'} מטבעות</div>
    </div>
    <div style={{ ...box, borderColor: '#5a4a1a', background: '#171207', fontSize: 13, lineHeight: 1.6 }}>
      ⚠️ כלי עזר להחלטה, לא מכונת כסף. נייר בלבד: אין חיבור לבורסה, וכל פקודה נרשמת רק ביומן בדפדפן הזה ורק אחרי שתקליד "כן". מכל אסטרטגיות הדיי טריידינג שבדקנו על מטבעות, אף אחת לא הרוויחה אחרי עמלות (~0.16% הלוך-חזור). לכן "מכונת הזמן" מחשבת את אותן עלויות, כדי שתראה את הסיכוי האמיתי לפני כל עסקה.
    </div>
    {tab !== 'תיק דמו $1,000' && <div style={{ ...box, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
      {([['account', 'חשבון $'], ['maxLoss', 'הפסד מקס׳ לעסקה $'], ['dayLoss', 'הפסד יומי מקס׳ $'], ['perDay', 'עסקאות ביום'], ['lev', 'מינוף']] as const).map(([k, l]) =>
        <label key={k} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>{l}<input type="number" value={cfg[k]} onChange={(e) => setCfg({ ...cfg, [k]: Math.max(0, +e.target.value) })} style={{ width: 70, background: '#08101d', color: '#fff', border: '1px solid #2a3a55', borderRadius: 6, padding: '3px 6px' }} /></label>)}
    </div>}
    {sel && <div style={{ ...box, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', borderColor: '#1f6feb' }}>
      <b style={{ fontSize: 16 }}>{sel.sym}</b><span style={{ color: sel.side === 'LONG' ? '#3ddc97' : '#ff6b6b' }}>{SIDE_HE[sel.side as 'LONG']}</span><span>{KIND_HE[sel.kind as keyof typeof KIND_HE]}</span>
      <span>כניסה {px(sel.entry)} · סטופ <span style={{ color: '#ff6b6b' }}>{px(sel.stop)}</span> · יעד <span style={{ color: '#3ddc97' }}>{px(sel.target)}</span></span>
      <span>עכשיו <b style={{ color: '#f5c84c' }}>{px(L?.last)}</b></span>{stale && <span style={{ color: stale.c }}>{stale.t}</span>}
    </div>}
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>{TABS.map((t) => <button key={t} style={btn(tab === t)} onClick={() => setTab(t)}>{t}</button>)}</div>

    {tab === 'תיק דמו $1,000' && <Demo P={st.paper} live={live} />}

    {tab === 'סורק גרפים' && <div style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        <div>{setups.length} סטאפים בנר שנסגר ב-{st.scan?.bar ? il(st.scan.bar) : '—'} (מתוך {st.scan?.found ?? 0}; 4 סוגים: פריצת טווח פתיחה, דגל, היפוך מקיצון, פרץ נפח)</div>
        <label style={{ fontSize: 13 }}><input type="checkbox" checked={liqOnly} onChange={(e) => setLiqOnly(e.target.checked)} /> רק מטבעות נזילים (≥$10M, מרווח ≤10bps)</label>
      </div>
      <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{['מטבע', 'סטאפ', 'כיוון', 'כניסה', 'סטופ', 'יעד', 'סטופ %', 'עבר (אותו כלל)', 'סימולציה', ''].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>{setups.map((s: J, i: number) => <tr key={i} style={{ cursor: 'pointer' }} onClick={() => pick(s)}>
          <td style={td}><b>{s.sym}</b>{!s.liquid && <span style={{ color: '#8fa3b8', fontSize: 11 }}> דליל</span>}</td><td style={td} title={s.why}>{s.kind_he}</td>
          <td style={{ ...td, color: s.side === 'LONG' ? '#3ddc97' : '#ff6b6b' }}>{SIDE_HE[s.side as 'LONG']}</td><td style={td}>{px(s.entry)}</td><td style={td}>{px(s.stop)}</td><td style={td}>{px(s.target)}</td>
          <td style={td}>{pct(Math.abs(s.entry - s.stop) / s.entry, 2)}</td>
          <td style={{ ...td, color: col(s.replay?.avgR) }}>{s.replay ? `${s.replay.n} פעמים · ${fx(s.replay.avgR)}R` : '—'}{s.liquid && <div style={{ fontSize: 11, color: s.tm?.ok ? '#3ddc97' : '#8fa3b8' }}>{s.tm?.ok ? '✓ מאושר לדמו' : '✗ לא לדמו'}</div>}</td>
          <td style={td}>{s.mc ? <span><span style={{ color: '#3ddc97' }}>{(s.mc.target * 100).toFixed(0)}%</span> / <span style={{ color: '#ff6b6b' }}>{(s.mc.stop * 100).toFixed(0)}%</span></span> : '—'}</td>
          <td style={td}><button style={btn()} onClick={(e) => { e.stopPropagation(); pick(s, 'מכונת הזמן') }}>⏱</button></td></tr>)}</tbody></table></div>
      {!setups.length && <Note>אין סטאפ בנר האחרון. הסורק רץ על כל נר 5 דקות שנסגר.</Note>}
      <Note>"עבר" = כל הפעמים בכ-5 הימים האחרונים שאותו כלל נדלק על אותו מטבע, עם אותו סטופ/יעד ועם עמלות (ממוצע ב-R). "סימולציה" = אחוז המסלולים שהגיעו ליעד / לסטופ קודם. מחושב ל-12 החזקים בכל נר. לחיצה על שורה בוחרת את העסקה.</Note>
    </div>}

    {tab === 'מעקב חדשות' && <div style={box}>
      {(st.news ?? []).map((n: J) => <div key={n.link} style={{ padding: '8px 0', borderBottom: '1px solid #122036' }}>
        <div style={{ color: '#8fa3b8', fontSize: 12 }}>{n.src} · {il(n.at)} · לפני {ago(n.at)}</div>
        <a href={n.link} target="_blank" rel="noreferrer" style={{ color: '#dfe8f5', textDecoration: 'none' }}>{n.title}</a>
        {n.coins?.length ? <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>{n.coins.map((c: string) => <span key={c} style={{ background: '#13203a', borderRadius: 6, padding: '1px 6px', fontSize: 12 }}>{c} <span style={{ color: col(n.move?.[c]) }}>{pct(n.move?.[c])}</span> מאז</span>)}</div> : null}
      </div>)}
      <Note>Cointelegraph, Decrypt, CoinDesk, כל 5 דקות. מטבע מסומן כשהכותרת מזכירה אותו ($TICKER או שם). "מאז" = שינוי המחיר מאז שהסורק ראה את הידיעה. מחקר שלנו על חדשות (פולי חדשות, שנה של טלגרם) לא מצא כלל רווחי לרכוב על חדשות: זה מידע, לא אות.</Note>
    </div>}

    {tab === 'תזמון כניסה' && <div style={box}>{!sel ? <Note>בחר סטאפ בסורק.</Note> : <>
      <Row><Stat k="נר האות" v={il(sel.t)} /><Stat k="מחיר כניסה (סגירת הנר)" v={px(sel.entry)} /><Stat k="מחיר עכשיו" v={px(L?.last)} c="#f5c84c" /><Stat k="מרחק מהכניסה" v={L ? `${fx((sel.side === 'LONG' ? 1 : -1) * (L.last - sel.entry) / Math.abs(sel.entry - sel.stop))}R` : '—'} /><Stat k="סטטוס" v={stale?.t ?? '—'} c={stale?.c} /></Row>
      <div style={{ marginTop: 10 }}><Spark bars={bars} s={sel} live={L?.last} /></div>
      <Note>למה הסטאפ נדלק: {sel.why}. הנר המסומן בלבן הוא נר האות (נסגר). הקו הצהוב הוא המחיר החי מ-OKX כל 3 שניות. כניסה בפועל נעשית במחיר הנוכחי, לא במחיר הסגירה: אם המחיר ברח יותר מ-0.3R, אתה רודף והסיכון לעסקה גדל.</Note>
      {(() => { const live5 = bars.length > 35 ? setupsAt(bars.filter((b) => b.t < Math.floor(Date.now() / DTK.bar) * DTK.bar), bars.filter((b) => b.t < Math.floor(Date.now() / DTK.bar) * DTK.bar).length - 1) : []; return live5.length ? <Note>בנר שנסגר עכשיו על {sel.sym}: {live5.map((s) => `${KIND_HE[s.kind]} ${SIDE_HE[s.side]}`).join(' · ')}</Note> : null })()}
    </>}</div>}

    {tab === 'תכנון יציאה' && <div style={box}>{!sel ? <Note>בחר סטאפ בסורק.</Note> : (() => {
      const r = Math.abs(sel.entry - sel.stop), costR = (DTK.taker + DTK.slip) * 2 * sel.entry / r, sg = sel.side === 'LONG' ? 1 : -1
      return <><Row><Stat k="סטופ" v={px(sel.stop)} c="#ff6b6b" /><Stat k="מרחק לסטופ" v={pct(r / sel.entry)} /><Stat k="יעד" v={px(sel.target)} c="#3ddc97" /><Stat k="סיכוי:סיכון" v={fx(Math.abs(sel.target - sel.entry) / r)} /><Stat k="עלויות ב-R" v={`${fx(costR)}R`} c={costR > 0.25 ? '#ff6b6b' : undefined} /><Stat k="יציאה בזמן" v={`עד ${il(sel.t + DTK.holdBars * DTK.bar)}`} /></Row>
        <div style={{ overflowX: 'auto', marginTop: 10 }}><table style={{ borderCollapse: 'collapse' }}><thead><tr>{['יעד חלופי', 'מחיר', 'רווח נטו ב-R'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>{[1, 1.5, 2, 3].map((k) => <tr key={k}><td style={td}>{k}R</td><td style={td}>{px(sel.entry + sg * k * r)}</td><td style={td}>{fx(k - costR)}R</td></tr>)}</tbody></table></div>
        <Note>הסטופ נקבע לפי הסטאפ: אמצע טווח הפתיחה, תחתית הדגל, הנמוך של 5 הנרות, או ATR אחד. הכל נקבע לפני הכניסה. העסקה נסגרת בסטופ, ביעד או אחרי 4 שעות, המוקדם מביניהם. כשהעלויות עולות על 25% מה-R, הסטופ צמוד מדי והעמלות אוכלות את העסקה.</Note></>
    })()}</div>}

    {tab === 'מכונת הזמן' && <div style={box}>{!sel ? <Note>בחר סטאפ בסורק.</Note> : <>
      {(() => { const R = tm?.replay ?? sel.replay, M = tm?.mc ?? sel.mc; return <>
        <h3 style={{ fontSize: 15, marginBottom: 8 }}>1. כל הפעמים שאותו כלל נדלק על {sel.sym} ({fx(tm?.days ?? sel.hist_days, 1)} ימים אחרונים)</h3>
        {R ? <><Row><Stat k="נדלק" v={R.n} /><Stat k="הגיע ליעד" v={R.target} c="#3ddc97" /><Stat k="סטופ" v={R.stop} c="#ff6b6b" /><Stat k="נגמר הזמן" v={R.time} /><Stat k="ממוצע נטו" v={`${fx(R.avgR)}R`} c={col(R.avgR)} /><Stat k="t" v={fx(R.t)} /></Row>
          <Note>{R.n < 30 ? `מעט מדי פעמים (${R.n}) כדי לסמוך על הממוצע; t מתחת ל-2 הוא רעש.` : Math.abs(R.t) < 2 ? 't מתחת ל-2: לא מובחן ממזל.' : 'מובחן סטטיסטית, אבל על 5 ימים בלבד.'}</Note></> : <Note>אין חישוב לסטאפ הזה בסורק. הרץ עכשיו.</Note>}
        <h3 style={{ fontSize: 15, margin: '14px 0 8px' }}>2. סימולציה של המשך העסקה {M ? `(${M.paths.toLocaleString()} מסלולים)` : ''}</h3>
        {M ? <><Bar3 a={M.target} b={M.stop} c={M.time} la="יעד קודם" lb="סטופ קודם" lc="נגמר הזמן" /><Row><Stat k="תוחלת נטו לעסקה" v={`${fx(M.evR)}R`} c={col(M.evR)} /><Stat k="בכסף, לפי ההפסד המקס׳" v={usd(M.evR * cfg.maxLoss)} c={col(M.evR)} /></Row></> : null}
        <div style={{ marginTop: 10 }}><button style={btn(true)} disabled={tmBusy} onClick={runTM}>{tmBusy ? 'מריץ…' : `הרץ ${DTK.mcPaths.toLocaleString()} סימולציות עכשיו (7 ימים)`}</button>{tm?.error && <span style={{ color: '#ff6b6b', marginRight: 8 }}>{tm.error}</span>}</div>
        <Note>כל צעד בסימולציה מגריל נר 5 דקות אמיתי של המטבע מאותה שעה ביום, אחרי הסרת המגמה הממוצעת כדי שרעש של כמה ימים לא ייראה כיתרון. סטופ נבדק לפני יעד, ועמלות ומרווח נכללים. 50% מול 50% אחרי עמלות = הפסד. כך נראה רוב מה שהסורק מוצא, וזו בדיוק הנקודה.</Note>
      </> })()}
    </>}</div>}

    {tab === 'ניהול סיכונים' && <div style={box}>{!rk ? <Note>בחר סטאפ בסורק.</Note> : <>
      <div style={{ fontSize: 18, fontWeight: 700, color: rk.pass ? '#3ddc97' : '#ff6b6b', marginBottom: 8 }}>{rk.pass ? 'PASS: כל הבדיקות עברו' : 'BLOCK: העסקה חסומה'}</div>
      <table style={{ borderCollapse: 'collapse' }}><tbody>{rk.checks.map((c) => <tr key={c.k}><td style={td}>{c.ok === true ? '✅' : c.ok === false ? '❌' : '❔'}</td><td style={td}>{c.k}</td><td style={{ ...td, color: '#8fa3b8' }}>{c.v}</td></tr>)}</tbody></table>
      <Note>❔ = אין נתון. נתון חסר לא נחשב כמעבר. המימון הוא של OKX (המחיר החי מגיע משם; Binance חסום לשרת). הגבולות היומיים נספרים מיומן הנייר בדפדפן הזה.</Note></>}</div>}

    {tab === 'ניהול תקציב' && <div style={box}>{!bu || !sel ? <Note>בחר סטאפ בסורק.</Note> : <>
      <Row><Stat k="כמות" v={fx(bu.qty, 4)} /><Stat k="שווי פוזיציה" v={usd(bu.notional)} /><Stat k={`ביטחון (מינוף ${cfg.lev}x)`} v={usd(bu.margin)} /><Stat k="הפסד אם סטופ" v={usd(-bu.lossAtStop)} c="#ff6b6b" /><Stat k="רווח אם יעד" v={usd(bu.profitAtTarget)} c="#3ddc97" /><Stat k="עמלות ומרווח" v={usd(bu.costUsd)} /><Stat k="מחיר חיסול" v={px(bu.liq)} /></Row>
      <Note>הכמות נקבעת כך שאם הסטופ ייפגע, ההפסד כולל העמלות יהיה ${cfg.maxLoss} בדיוק, בלי קשר למינוף. המינוף קובע רק כמה ביטחון נעול, ובכמה רחוק נמצא מחיר החיסול. אם השווי חורג מהחשבון כפול המינוף, הכמות מוקטנת.</Note></>}</div>}

    {tab === 'ביצוע (נייר)' && <div style={box}>{!sel || !bu || !rk ? <Note>בחר סטאפ בסורק.</Note> : <>
      <div style={{ fontSize: 15, lineHeight: 1.8 }}>כרטיס: <b>{sel.side === 'LONG' ? 'קנה' : 'מכור'} {fx(bu.qty, 4)} {sel.sym}</b> בשוק (עכשיו ~{px(sel.side === 'LONG' ? L?.ask : L?.bid)}), סטופ {px(sel.stop)}, יעד {px(sel.target)}, יציאה עד {il(Date.now() + DTK.holdBars * DTK.bar)}. הפסד מקסימלי {usd(bu.lossAtStop)}.</div>
      {!rk.pass && <div style={{ color: '#ff6b6b', marginTop: 6 }}>מנהל הסיכונים חסם: {rk.checks.filter((c) => c.ok !== true).map((c) => c.k).join(' · ')}</div>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
        <input placeholder='הקלד "כן" לאישור' value={confirm} onChange={(e) => setConfirm(e.target.value)} style={{ background: '#08101d', color: '#fff', border: '1px solid #2a3a55', borderRadius: 6, padding: '6px 8px' }} />
        <button style={btn(true)} disabled={confirm.trim() !== 'כן' || !rk.pass || !L} onClick={place}>שלח פקודת נייר</button></div>
      <Note>שום פקודה לא יוצאת לבורסה. פוזיציית הנייר נשמרת בדפדפן הזה בלבד, ומנוהלת (סטופ, יעד, 4 שעות) רק כשהדף פתוח, לפי bid/ask חי מ-OKX, עם עמלה 0.05% וסליפג׳ 0.03% לכל צד.</Note></>}</div>}

    {tab === 'התראות מחיר' && <div style={box}>
      <button style={btn()} onClick={() => { try { (window as any).Notification?.requestPermission() } catch { /* unsupported */ } }}>הפעל התראות בדפדפן</button>
      <h3 style={{ fontSize: 15, margin: '12px 0 6px' }}>פוזיציות נייר</h3>
      {(() => { const open = pos.filter((p) => p.status === 'OPEN'), closed = pos.filter((p) => p.status === 'CLOSED'), tot = closed.reduce((a, p) => a + (p.pnl ?? 0), 0)
        return <><div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{['מטבע', 'כיוון', 'כניסה', 'עכשיו', 'סטופ', 'יעד', 'רווח/הפסד', 'סטטוס', ''].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>{pos.slice(0, 40).map((p) => { const m = live[p.sym]?.last ?? p.mark ?? p.entry, sg = p.side === 'LONG' ? 1 : -1, u = p.status === 'OPEN' ? sg * (m - p.entry) * p.qty : p.pnl ?? 0
            return <tr key={p.id}><td style={td}><b>{p.sym}</b></td><td style={{ ...td, color: sg > 0 ? '#3ddc97' : '#ff6b6b' }}>{SIDE_HE[p.side]}</td><td style={td}>{px(p.entry)}</td><td style={td}>{p.status === 'OPEN' ? px(m) : px(p.exit)}</td><td style={td}>{px(p.stop)}</td><td style={td}>{px(p.target)}</td>
              <td style={{ ...td, color: col(u) }}>{usd(u)}</td><td style={td}>{p.status === 'OPEN' ? `פתוח · עוד ${Math.max(0, Math.round((p.flatAt - Date.now()) / 60000))} דק׳` : p.reason}</td>
              <td style={td}>{p.status === 'OPEN' && <button style={btn()} onClick={() => { const L2 = live[p.sym]; if (!L2) return; const ex = (sg > 0 ? L2.bid : L2.ask) * (1 - sg * DTK.slip), pnl = sg * (ex - p.entry) * p.qty - (p.entry + ex) * p.qty * DTK.taker; setPos(pos.map((x) => x.id === p.id ? { ...x, status: 'CLOSED', exit: ex, reason: 'סגירה ידנית', pnl, closed: Date.now() } : x)) }}>סגור</button>}</td></tr> })}</tbody></table></div>
          <Row><Stat k="פתוחות" v={open.length} /><Stat k="נסגרו" v={closed.length} /><Stat k="רווח/הפסד ממומש" v={usd(tot)} c={col(tot)} /><Stat k="היום" v={usd(dayPnl)} c={col(dayPnl)} /></Row></> })()}
      <h3 style={{ fontSize: 15, margin: '14px 0 6px' }}>התראת מחיר</h3>
      <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget as HTMLFormElement); const sym = String(f.get('sym')).toUpperCase().trim(), p2 = +String(f.get('px')); if (sym && p2 > 0) setAlerts([...alerts, { sym, px: p2, dir: String(f.get('dir')), at: Date.now() }]) }} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <input name="sym" placeholder="מטבע (BTC)" defaultValue={sel?.sym ?? ''} style={{ width: 90, background: '#08101d', color: '#fff', border: '1px solid #2a3a55', borderRadius: 6, padding: '4px 6px' }} />
        <select name="dir" style={{ background: '#08101d', color: '#fff', border: '1px solid #2a3a55', borderRadius: 6 }}><option value="above">מעל</option><option value="below">מתחת</option></select>
        <input name="px" type="number" step="any" placeholder="מחיר" style={{ width: 110, background: '#08101d', color: '#fff', border: '1px solid #2a3a55', borderRadius: 6, padding: '4px 6px' }} /><button style={btn(true)}>הוסף</button></form>
      {alerts.map((a, i) => <div key={i} style={{ fontSize: 13, padding: '4px 0' }}>{a.sym} {a.dir === 'above' ? 'מעל' : 'מתחת'} {px(a.px)} · עכשיו {px(live[a.sym]?.last)} {a.fired ? <span style={{ color: '#f5c84c' }}>· צלצל {il(a.fired)}</span> : null} <button style={btn()} onClick={() => setAlerts(alerts.filter((_, k) => k !== i))}>✕</button></div>)}
      {log.length ? <><h3 style={{ fontSize: 15, margin: '14px 0 6px' }}>יומן</h3>{log.map((l, i) => <div key={i} style={{ fontSize: 12.5, color: '#c9d4e0' }}>{l}</div>)}</> : null}
      <Note>התראות ופוזיציות רצות רק כשהדף פתוח (הדפדפן בודק מחירים כל 3 שניות). צליל + התראת דפדפן אם אישרת.</Note>
    </div>}

    {tab === 'מימון ו-OI' && <div style={box}>
      <input placeholder="חיפוש מטבע" value={q} onChange={(e) => setQ(e.target.value.toUpperCase())} style={{ background: '#08101d', color: '#fff', border: '1px solid #2a3a55', borderRadius: 6, padding: '4px 8px', marginBottom: 8 }} />
      <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{['מטבע', 'מחיר', '24ש', 'מחזור', 'מרווח', 'מימון/8ש', 'OI', 'OI 4ש', 'OI 24ש'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>{Object.entries(B).filter(([s]) => !q || s.includes(q)).sort((a: J, b: J) => b[1].vol - a[1].vol).slice(0, 120).map(([s, b]: J) => <tr key={s}>
          <td style={td}><b>{s}</b></td><td style={td}>{px(b.last)}</td><td style={{ ...td, color: col(b.chg) }}>{pct(b.chg)}</td><td style={td}>{big(b.vol)}</td><td style={td}>{b.spread == null ? '—' : `${fx(b.spread, 1)}bps`}</td>
          <td style={{ ...td, color: b.funding == null ? '#5b6b82' : Math.abs(b.funding) >= 0.0005 ? '#f5c84c' : '#c9d4e0' }}>{b.funding == null ? '—' : `${(b.funding * 100).toFixed(4)}%`}</td><td style={td}>{big(b.oi)}</td>
          <td style={{ ...td, color: col(b.oi4h) }}>{pct(b.oi4h, 1)}</td><td style={{ ...td, color: col(b.oi24h) }}>{pct(b.oi24h, 1)}</td></tr>)}</tbody></table></div>
      <Note>מחירים, מימון ו-OI מ-OKX (אותם מטבעות שנסחרים ב-Binance Futures). מימון חיובי = הלונגים משלמים. מימון צהוב = צפוף (≥0.05% ל-8 שעות). מימון נמשך רק ל-20 הגדולים ולמטבעות עם סטאפ. שינויי OI נבנים מהיסטוריה שהסורק שומר לכל שעה, ולכן הם מתמלאים אחרי 4 ו-24 שעות של ריצה.</Note>
    </div>}

    {tab === 'חיסולים' && <div style={box}>
      <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{['מטבע', 'לונגים חוסלו', 'שורטים חוסלו', 'הגדול ביותר', 'פקודות'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>{(st.liquidations?.rows ?? []).slice().sort((a: J, b: J) => (b.long_usd + b.short_usd) - (a.long_usd + a.short_usd)).map((r: J) => <tr key={r.sym}><td style={td}><b>{r.sym}</b></td><td style={{ ...td, color: '#ff6b6b' }}>{big(r.long_usd)}</td><td style={{ ...td, color: '#3ddc97' }}>{big(r.short_usd)}</td><td style={td}>{big(r.biggest)}</td><td style={td}>{r.n >= 100 ? '100+' : r.n}</td></tr>)}</tbody></table></div>
      <Note>בשעה האחרונה, 15 המטבעות הגדולים, מפקודות החיסול של OKX ({st.liquidations?.at ? `עודכן לפני ${ago(st.liquidations.at)}` : '—'}). OKX מחזירה רק את 100 החיסולים האחרונים לכל מטבע, ולכן "100+" אומר שהיו יותר. חיסולי שורט גדולים = לחץ קנייה כפוי (squeeze), ולהפך. Binance לא מפרסמת זרם חיסולים שאפשר לקרוא מהשרת שלנו.</Note>
    </div>}
    {st.errors?.length ? <Note>שגיאות בסריקה האחרונה: {st.errors.slice(0, 3).join(' · ')}</Note> : null}
  </div>
}

let ac: AudioContext | null = null
function beep() { try { ac ??= new AudioContext(); const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 880; g.gain.value = 0.08; o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.25) } catch { /* no audio */ } }
function notify(m: string) { try { const N = (window as any).Notification; if (N?.permission === 'granted') new N('ערכת הדיי טריידר', { body: m }) } catch { /* unsupported */ } }

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)

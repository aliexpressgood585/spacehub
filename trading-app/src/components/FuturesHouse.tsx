// "בית הבוט" tab — Binance USDT-M futures PAPER desk (binance-paper-bot/, workflow binance-paper-desk.yml).
// Read-only viewer of binance-paper/state.json on the pm-desk-data branch. The bot itself is paper-only:
// no API keys and no real orders. Open positions are re-marked from OKX between the 15-minute cycles;
// the fill source is whatever the runner recorded in price_source.
import { useEffect, useMemo, useState } from 'react'

const DEFAULT_STATE = 'https://raw.githubusercontent.com/aliexpressgood585/spacehub/pm-desk-data/binance-paper/state.json'
type J = any
const box: React.CSSProperties = { background: '#0b1220', border: '1px solid #1c2738', borderRadius: 10, padding: 14 }
const lab: React.CSSProperties = { fontSize: 12, color: '#8a97a8' }
const usd = (x: number) => (x < 0 ? '−$' : '$') + Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const px = (x: number) => (x >= 100 ? x.toFixed(2) : x >= 1 ? x.toFixed(4) : x.toPrecision(4))
const col = (x: number) => (x > 0 ? '#3ddc97' : x < 0 ? '#ff6b6b' : '#e6edf5')
const ago = (ms: number) => (ms < 60_000 ? `לפני ${Math.max(0, Math.round(ms / 1000))} שנ׳` : ms < 3600_000 ? `לפני ${Math.round(ms / 60_000)} דק׳` : `לפני ${(ms / 3600_000).toFixed(1)} שע׳`)
const WHY: Record<string, string> = {
  STOP_LOSS: 'סטופ', TAKE_PROFIT: 'יעד', LIQUIDATION: 'חיסול', SIGNAL_CLOSE: 'אות יציאה',
  OPEN: 'פתיחה', SIGNAL: 'אות', SIGNAL_FILTERED: 'אות סונן', RISK_REJECT: 'סיכון דחה',
  FUNDING: 'מימון', ORDER_REJECTED: 'פקודה נדחתה', CATCH_UP: 'השלמה', START: 'התחלה',
}

function stateUrl() {
  const q = new URLSearchParams(location.search).get('state')
  return q || DEFAULT_STATE
}

function Spark({ pts }: { pts: { ts: number; equity: number }[] }) {
  if (!pts || pts.length < 2) return <div style={lab}>עקומת ההון תופיע אחרי המחזור השני.</div>
  const w = 640, h = 128
  const ys = pts.map((p) => p.equity)
  const min = Math.min(...ys), max = Math.max(...ys)
  const x = (i: number) => (i / (pts.length - 1)) * (w - 8) + 4
  const y = (v: number) => (max === min ? h / 2 : h - 8 - ((v - min) / (max - min)) * (h - 20))
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.equity).toFixed(1)}`).join(' ')
  const up = ys[ys.length - 1] >= ys[0]
  const start = pts[0].equity
  const base = y(Math.min(max, Math.max(min, start)))
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 128, display: 'block' }}>
      <line x1={4} x2={w - 4} y1={base} y2={base} stroke="#243044" strokeDasharray="4 4" />
      <path d={d} fill="none" stroke={up ? '#3ddc97' : '#ff6b6b'} strokeWidth={2} />
    </svg>
  )
}

export default function FuturesHouse() {
  const [st, setSt] = useState<J>(null), [err, setErr] = useState<string | null>(null)
  const [live, setLive] = useState<Record<string, number>>({}), [now, setNow] = useState(Date.now())
  useEffect(() => {
    let dead = false
    const load = async () => {
      try {
        const r = await fetch(`${stateUrl()}${stateUrl().includes('?') ? '&' : '?'}t=${Math.floor(Date.now() / 4000)}`, { cache: 'no-store' })
        if (!r.ok) throw new Error(String(r.status))
        const j = await r.json()
        if (!dead) { setSt(j); setErr(null) }
      } catch (e) { if (!dead) setErr(String(e)) }
    }
    load()
    const a = setInterval(load, 15000), b = setInterval(() => setNow(Date.now()), 1000)
    return () => { dead = true; clearInterval(a); clearInterval(b) }
  }, [])
  const open: J[] = useMemo(() => st?.positions ?? [], [st])
  useEffect(() => {
    let dead = false
    const tick = async () => {
      try {
        const j = await (await fetch('https://www.okx.com/api/v5/market/tickers?instType=SWAP')).json()
        const m: Record<string, number> = {}
        for (const t of j.data ?? []) {
          const sym = /^([A-Z0-9]+)-USDT-SWAP$/.exec(t.instId)?.[1]
          if (sym) m[sym + 'USDT'] = +t.last
        }
        if (!dead) setLive(m)
      } catch { /* snapshot marks */ }
    }
    tick()
    const id = setInterval(tick, 3000)
    return () => { dead = true; clearInterval(id) }
  }, [])
  if (!st) return <div dir="rtl" style={{ color: '#e6edf5', padding: 20 }}>{err ? `הבוט עוד לא פרסם מצב (${err}). אחרי המיזוג צריך להפעיל פעם אחת את workflow ‏binance-paper-desk (או לחכות למחזור של 15 הדקות).` : 'טוען…'}</div>
  const markOf = (p: J) => live[p.symbol] ?? p.mark ?? p.entry
  const unreal = open.reduce((a: number, p: J) => a + (p.side === 'LONG' ? 1 : -1) * (markOf(p) - p.entry) * p.qty, 0)
  const equity = (st.wallet ?? 0) + unreal
  const start = st.starting_balance ?? 10000
  const ps = st.price_source ?? {}
  const lastCycle = st.last_cycle ? now - Date.parse(st.last_cycle) : null
  const alive = lastCycle != null && lastCycle < 25 * 60_000
  const srcOk = ps.id === 'binance'
  const prices: J = st.prices ?? {}
  const curve = (st.equity_curve ?? []).map((p: J) => ({ ts: p.ts, equity: p.equity }))
  return (
    <div dir="rtl" style={{ color: '#e6edf5', fontFamily: 'system-ui, sans-serif', display: 'grid', gap: 12 }}>
      <div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <h1 style={{ fontSize: 24, margin: 0 }}>בוט פיוצ'רס · Binance דמו</h1>
          <span style={{ ...lab, border: '1px solid #2a3a52', borderRadius: 20, padding: '3px 10px' }}>נייר בלבד · 10,000 USDT</span>
          <span title="המחזור רץ כל 15 דקות; GitHub מגיש את הקובץ עם השהיה של עד 5 דק׳" style={{ ...lab, border: `1px solid ${alive ? '#2f7a55' : '#7a2f2f'}`, borderRadius: 20, padding: '3px 10px', color: alive ? '#3ddc97' : '#ff6b6b' }}>{alive ? `● פעיל · עדכון שהגיע ${ago(lastCycle!)}` : `● לא פעיל${lastCycle != null ? ` · מחזור אחרון ${ago(lastCycle)}` : ''}`}</span>
        </div>
        <div style={{ ...lab, marginTop: 4 }}>USDT-M · מבודד · מינוף 3x · סיכון 1% לעסקה · עד 3 פוזיציות · BTC ETH SOL BNB XRP · אין מפתחות ואין פקודות אמיתיות.</div>
      </div>
      <div style={{ ...box, borderColor: srcOk ? '#1d4d36' : '#5a4a1c' }}>
        <div style={lab}>מקור המחירים במחזור האחרון</div>
        <div style={{ fontSize: 16, marginTop: 4 }}>{ps.label_he || '—'}</div>
        <div style={{ ...lab, marginTop: 6, lineHeight: 1.7 }}>
          {ps.endpoint ? <span dir="ltr">{ps.endpoint}</span> : null}
          {ps.filters_he ? <> · {ps.filters_he}</> : null}
          <br />{ps.fees_he}
          {(ps.probes ?? []).length ? <div dir="ltr" style={{ textAlign: 'right', marginTop: 4 }}>{ps.probes.map((p: J) => `${String(p.url).replace('https://', '')} → ${p.status}`).join('  ·  ')}</div> : null}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8 }}>
        {([
          ['שווי חשבון', usd(equity), equity - start],
          ['יתרת ארנק', usd(st.wallet ?? 0), 0],
          ['רווח/הפסד פתוח', usd(unreal), unreal],
          ['ממומש', usd(st.realized_total ?? 0), st.realized_total ?? 0],
          ['עמלות', usd(st.fees_total ?? 0), -(st.fees_total ?? 0)],
          ['מימון', usd(st.funding_total ?? 0), st.funding_total ?? 0],
          ['אחוז הצלחה', `${st.trades_closed ? Math.round(st.win_rate_pct) : 0}% · ${st.wins ?? 0}/${st.trades_closed ?? 0}`, 0],
          ['ירידה מהשיא', `${(st.drawdown_pct ?? 0).toFixed(2)}%`, st.drawdown_pct ?? 0],
          ['ירידה מקסימלית', `${(st.max_drawdown_pct ?? 0).toFixed(2)}%`, st.max_drawdown_pct ?? 0],
        ] as [string, string, number][]).map(([k, v, s]) => (
          <div key={k} style={box}><div style={lab}>{k}</div><div style={{ fontSize: 19, fontWeight: 600, color: col(s), direction: 'ltr', textAlign: 'right' }}>{v}</div></div>
        ))}
      </div>
      <div style={{ ...box, borderColor: st.risk?.halted ? '#7a2f2f' : '#1c2738' }}>
        <div style={lab}>שומר היום (UTC)</div>
        <div style={{ fontSize: 15, marginTop: 4 }}>{st.risk?.halted ? `⛔ הפסד יומי ${(st.risk.day_pnl_pct ?? 0).toFixed(2)}% — אין כניסות חדשות עד מחר` : `✅ מותר להיכנס (תקרת הפסד יומי ${st.risk?.max_daily_loss_pct ?? 5}%)`}</div>
        <div style={{ ...lab, marginTop: 6 }}>נר 15m אחרון שנסגר: {st.last_bar_close || '—'} · פוזיציות {open.length}/{st.risk?.max_positions ?? 3} · מזומן פנוי {usd(st.available ?? 0)} · מרג'ין בשימוש {usd(st.used_margin ?? 0)}</div>
      </div>
      <div style={box}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>עקומת הון</div>
        <Spark pts={curve} />
        <div style={lab}>התחלה {usd(start)} · עכשיו {usd(equity)} · תשואה {(st.return_pct ?? 0).toFixed(2)}%</div>
      </div>
      <div style={box}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>פוזיציות פתוחות ({open.length}/3)</div>
        {!open.length && <div style={lab}>אין פוזיציות. כניסה רק כשנר 15m סגור חוצה EMA20/50 בכיוון EMA200 של שעה, ו-RSI לא בקיצון.</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 8 }}>
          {open.map((p: J) => {
            const m = markOf(p), side = p.side === 'LONG' ? 1 : -1, pnl = side * (m - p.entry) * p.qty
            return (
              <div key={p.symbol} style={{ ...box, background: '#0e1729' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <b>{p.symbol.replace('USDT', '')} <span style={{ color: p.side === 'LONG' ? '#3ddc97' : '#ff6b6b' }}>{p.side === 'LONG' ? 'לונג' : 'שורט'}</span> · {p.leverage}x</b>
                  <span style={{ color: col(pnl), direction: 'ltr' }}>{usd(pnl)}</span>
                </div>
                <div style={{ ...lab, marginTop: 6, lineHeight: 1.7 }}>
                  כניסה {px(p.entry)} · מארק <b style={{ color: '#e6edf5' }}>{px(m)}</b>{live[p.symbol] ? ' (תצוגה חיה)' : ''}<br />
                  גודל {p.qty} · נומינלי {usd(p.notional ?? p.qty * m)} · מרג'ין {usd(p.isolated_margin ?? 0)}<br />
                  סטופ {p.sl ? px(p.sl) : '—'} · יעד {p.tp ? px(p.tp) : '—'} · חיסול {p.liq ? px(p.liq) : '—'}<br />
                  עמלות {usd(p.fees ?? 0)} · מימון {usd(p.funding ?? 0)}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div style={box}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>מחירים</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 8 }}>
          {Object.keys(prices).map((s) => {
            const p = prices[s]
            const shown = live[s] ?? p.mark ?? p.last
            return (
              <div key={s} style={{ ...box, background: '#0e1729', padding: 10 }}>
                <div style={lab}>{s.replace('USDT', '')}</div>
                <div style={{ fontSize: 16, direction: 'ltr', textAlign: 'right' }}>{shown ? px(shown) : '—'}</div>
                <div style={lab}>מימון {((p.funding_rate ?? 0) * 100).toFixed(4)}%</div>
              </div>
            )
          })}
        </div>
      </div>
      <div style={box}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>אותות ואירועים</div>
        {!(st.events ?? []).length && <div style={lab}>עוד אין אירועים.</div>}
        {(st.events ?? []).slice().reverse().slice(0, 25).map((e: J, i: number) => (
          <div key={i} style={{ fontSize: 13, padding: '3px 0', borderTop: i ? '1px solid #1c2738' : 'none' }}>
            <span style={lab}>{e.ts ? new Date(e.ts).toISOString().slice(5, 16).replace('T', ' ') : ''} </span>
            <b>{WHY[e.type] ?? e.type}</b> {e.symbol ? e.symbol.replace('USDT', '') : ''} — {e.msg}
          </div>
        ))}
      </div>
      {!!(st.trades ?? []).length && <div style={box}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>עסקאות שנסגרו</div>
        {(st.trades ?? []).slice().reverse().slice(0, 40).map((t: J, i: number) => (
          <div key={i} style={{ fontSize: 13, padding: '3px 0', borderTop: '1px solid #1c2738', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span>{String(t.symbol).replace('USDT', '')} {t.side === 'LONG' ? 'לונג' : 'שורט'} · {WHY[t.reason] ?? t.reason} · עמלה {usd(t.fees ?? 0)} · מימון {usd(t.funding ?? 0)}</span>
            <span style={{ color: col(t.net_pnl), direction: 'ltr' }}>{usd(t.net_pnl ?? 0)}</span>
          </div>
        ))}
      </div>}
      <div style={box}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>האסטרטגיה (trend_ema)</div>
        <div style={{ fontSize: 13, lineHeight: 1.7 }}>חציית EMA20/50 על נר 15 דקות סגור, רק בכיוון המגמה (סגירת שעה מול EMA200), RSI(14) מתחת ל-70 בלונג ומעל 30 בשורט. סטופ 2×ATR, יעד 3×ATR. סיכון 1% מהשווי כולל עמלות, מרג'ין לעסקה עד 30% מהשווי, מינוף 3, עד 3 פוזיציות, הפסד יומי 5% עוצר כניסות. מילוי שוק במחיר האסק/ביד של הנר שנסגר ועוד 1bp החלקה, עמלת טייקר 0.05%. מימון אמיתי בזמני המימון. חיסול לפי מחיר מארק ומדרגות המינוף של Binance.</div>
      </div>
      <div style={{ ...box, borderColor: '#5a4a1c' }}>
        <div style={{ fontWeight: 600 }}>בקטסט 90 יום של אותם כללים — ההאסטרטגיה הפסידה</div>
        <div style={{ fontSize: 13, lineHeight: 1.7, marginTop: 6 }}>343 עסקאות, הצלחה 34.4%, נטו −4,838 USDT (−48%), PF 0.52, עמלות 2,178, ירידה מקסימלית −51%, שארפ −7.7. גם לפני עמלות. זה דמו לנייר, לא טענה לרווח. החשבון מתחיל ב-10,000 USDT ולא שולח פקודה לבורסה.</div>
      </div>
    </div>
  )
}

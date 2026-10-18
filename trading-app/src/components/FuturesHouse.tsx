// "בית הבוט" tab — Binance USDT-M futures PAPER desk.
// Booked state comes from binance-paper/state.json (15-minute Actions cycle).
// Prices, funding, open uPnL, ROE, margin ratio and distance to liquidation
// retick in the browser from the public tape (futuresTape.ts). No API keys.
import { useEffect, useMemo, useRef, useState } from 'react'
import { fundingLeft, positionLive, bracketsFromState, SYMBOLS } from '../futuresMath'
import { useDeskState, useFuturesTape } from '../futuresTape'

type J = any
const box: React.CSSProperties = { background: '#0b1220', border: '1px solid #1c2738', borderRadius: 10, padding: 14 }
const lab: React.CSSProperties = { fontSize: 12, color: '#8a97a8' }
const usd = (x: number) => (x < 0 ? '−$' : '$') + Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const px = (x: number) => (!x ? '—' : x >= 100 ? x.toFixed(2) : x >= 1 ? x.toFixed(4) : x.toPrecision(4))
const col = (x: number) => (x > 0 ? '#3ddc97' : x < 0 ? '#ff6b6b' : '#e6edf5')
const pct = (x: number, digits = 2) => `${x < 0 ? '−' : ''}${Math.abs(x * 100).toFixed(digits)}%`
const ago = (ms: number) => (ms < 60_000 ? `לפני ${Math.max(0, Math.round(ms / 1000))} שנ׳` : ms < 3600_000 ? `לפני ${Math.round(ms / 60_000)} דק׳` : `לפני ${(ms / 3600_000).toFixed(1)} שע׳`)
const WHY: Record<string, string> = {
  STOP_LOSS: 'סטופ', TAKE_PROFIT: 'יעד', LIQUIDATION: 'חיסול', SIGNAL_CLOSE: 'אות יציאה',
  OPEN: 'פתיחה', SIGNAL: 'אות', SIGNAL_FILTERED: 'אות סונן', RISK_REJECT: 'סיכון דחה',
  FUNDING: 'מימון', ORDER_REJECTED: 'פקודה נדחתה', CATCH_UP: 'השלמה', START: 'התחלה',
}

function Flash({ n, text }: { n: number; text: string }) {
  const prev = useRef(n)
  const dir = n > prev.current ? 'up' : n < prev.current ? 'down' : ''
  if (prev.current !== n) prev.current = n
  return <span key={`${dir}:${n}`} className={dir === 'up' ? 'fl-up' : dir === 'down' ? 'fl-dn' : undefined} style={{ direction: 'ltr', display: 'inline-block', borderRadius: 4, padding: '0 3px' }}>{text}</span>
}

function Spark({ pts }: { pts: { equity: number }[] }) {
  if (!pts || pts.length < 2) return <div style={lab}>עקומת ההון תופיע אחרי המחזור השני.</div>
  const w = 640, h = 128
  const ys = pts.map((p) => p.equity)
  const min = Math.min(...ys), max = Math.max(...ys)
  const x = (i: number) => (i / (pts.length - 1)) * (w - 8) + 4
  const y = (v: number) => (max === min ? h / 2 : h - 8 - ((v - min) / (max - min)) * (h - 20))
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.equity).toFixed(1)}`).join(' ')
  const up = ys[ys.length - 1] >= ys[0]
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 128, display: 'block' }}>
      <path d={d} fill="none" stroke={up ? '#3ddc97' : '#ff6b6b'} strokeWidth={2} />
    </svg>
  )
}

function Mini({ pts }: { pts: number[] }) {
  if (!pts || pts.length < 2) return <div style={lab}>הגרף מתמלא ממחיר המארק החי.</div>
  const w = 640, h = 92
  const min = Math.min(...pts), max = Math.max(...pts)
  const x = (i: number) => (i / (pts.length - 1)) * (w - 8) + 4
  const y = (v: number) => (max === min ? h / 2 : h - 8 - ((v - min) / (max - min)) * (h - 16))
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const up = pts[pts.length - 1] >= pts[0]
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 92, display: 'block' }}>
      <path d={d} fill="none" stroke={up ? '#3ddc97' : '#ff6b6b'} strokeWidth={2} />
    </svg>
  )
}

export default function FuturesHouse() {
  const { st, err } = useDeskState()
  const symbols: string[] = st?.symbols?.length ? st.symbols : SYMBOLS
  const tape = useFuturesTape(symbols)
  const [now, setNow] = useState(Date.now())
  const [sel, setSel] = useState('BTCUSDT')
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id) }, [])
  const tables = useMemo(() => bracketsFromState(st), [st])
  const open: J[] = st?.positions ?? []
  const prices: J = st?.prices ?? {}
  const quote = (s: string) => tape.quotes[s]
  const rows = open.map((p: J) => ({ p, v: positionLive(p, quote(p.symbol)?.mark || 0, tables) }))
  const unreal = rows.reduce((a, r) => a + r.v.upnl, 0)
  const wallet = st?.wallet ?? 0
  const equity = wallet + unreal
  const start = st?.starting_balance ?? 10000
  const ps = st?.price_source ?? {}
  const lastCycle = st?.last_cycle ? now - Date.parse(st.last_cycle) : null
  const cycleFresh = lastCycle != null && lastCycle < 25 * 60_000
  const tickAge = tape.tickAt ? now - tape.tickAt : null
  const tapeFresh = tickAge != null && tickAge < 4_000
  const srcOk = ps.id === 'binance'
  const curve = (st?.equity_curve ?? []).map((p: J) => ({ equity: p.equity }))
  if (st && equity && curve.length) curve.push({ equity })
  const liveReturn = start ? (equity / start - 1) * 100 : 0
  const peak = Math.max(st?.peak_equity ?? start, equity)
  const liveDd = peak ? (equity - peak) / peak * 100 : 0
  const shownSyms = symbols.length ? symbols : Object.keys(prices)
  const selQ = quote(sel)
  const selBook = prices[sel] ?? {}

  return (
    <div dir="rtl" style={{ color: '#e6edf5', fontFamily: 'system-ui, sans-serif', display: 'grid', gap: 12 }}>
      <style>{`
        @keyframes flUp { from { background: #1e6b45 } to { background: transparent } }
        @keyframes flDn { from { background: #6b1e1e } to { background: transparent } }
        .fl-up { animation: flUp .7s ease-out }
        .fl-dn { animation: flDn .7s ease-out }
        @keyframes livePulse { 0%, 100% { opacity: 1 } 50% { opacity: .35 } }
        .live-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; animation: livePulse 1.2s infinite }
        table.tape { width: 100%; border-collapse: collapse; font-size: 13px }
        table.tape th, table.tape td { padding: 6px 8px; border-top: 1px solid #1c2738; text-align: right; white-space: nowrap }
        table.tape th { color: #8a97a8; font-weight: 500 }
        table.tape tr.sel { background: #10233a }
        table.tape tbody tr { cursor: pointer }
      `}</style>
      <div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <h1 style={{ fontSize: 24, margin: 0 }}>בוט פיוצ'רס · Binance דמו</h1>
          <span style={{ ...lab, border: '1px solid #2a3a52', borderRadius: 20, padding: '3px 10px' }}>נייר בלבד · 10,000 USDT</span>
          <span title="מחירים מהשידור הציבורי בדפדפן, לא מהמחזור" style={{ ...lab, display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${tapeFresh ? (tape.connected ? '#2f7a55' : '#5a4a1c') : '#7a2f2f'}`, borderRadius: 20, padding: '3px 10px', color: tapeFresh ? (tape.connected ? '#3ddc97' : '#e6c35c') : '#ff6b6b' }}>
            <i className="live-dot" style={{ background: tapeFresh ? (tape.connected ? '#3ddc97' : '#e6c35c') : '#ff6b6b' }} />
            {tapeFresh ? `שידור חי · ${tape.source}` : 'מתחבר לשידור…'}
            {tickAge != null && tapeFresh ? <span dir="ltr">{Math.max(0, tickAge)}ms</span> : null}
          </span>
          <span title="הבוט רץ ב-GitHub Actions אחרי כל נר 15 דקות" style={{ ...lab, border: `1px solid ${cycleFresh ? '#2f7a55' : '#7a2f2f'}`, borderRadius: 20, padding: '3px 10px', color: cycleFresh ? '#9ad7ff' : '#ff6b6b' }}>
            מחזור אחרון של הבוט: {st?.last_cycle ? `${st.last_cycle.replace('T', ' ').replace('Z', ' UTC')} · ${ago(lastCycle!)}` : 'עוד אין'}
          </span>
        </div>
        <div style={{ ...lab, marginTop: 4 }}>USDT-M · מבודד · מינוף 3x · סיכון 1% לעסקה · עד 3 פוזיציות · BTC ETH SOL BNB XRP · אין מפתחות ואין פקודות אמיתיות. האסטרטגיה רצה על נר 15 דקות סגור; סטופ, יעד וחיסול נבדקים בבוט על high/low של נרות דקה.</div>
      </div>
      {!st && <div style={box}>{err ? `המצב שמור עוד לא נטען (${err}). השידור החי ממשיך.` : 'טוען את מצב החשבון…'}</div>}
      {st && <div style={{ ...box, borderColor: srcOk ? '#1d4d36' : '#5a4a1c' }}>
        <div style={lab}>מקור המחירים במחזור האחרון של הבוט (המילוי)</div>
        <div style={{ fontSize: 16, marginTop: 4 }}>{ps.label_he || '—'}</div>
        <div style={{ ...lab, marginTop: 6, lineHeight: 1.7 }}>
          {ps.endpoint ? <span dir="ltr">{ps.endpoint}</span> : null}
          {ps.filters_he ? <> · {ps.filters_he}</> : null}
          <br />{ps.fees_he}
          {(ps.probes ?? []).length ? <div dir="ltr" style={{ textAlign: 'right', marginTop: 4 }}>{ps.probes.map((p: J) => `${String(p.url).replace('https://', '')} → ${p.status}`).join('  ·  ')}</div> : null}
          <div style={{ marginTop: 4 }}>השידור על המסך עכשיו: <b style={{ color: '#e6edf5' }}>{tape.source || '—'}</b>. שני המקורות נפרדים: הבוט ממלא פקודות דמו במחזור, והדפדפן מזיז את המחירים בין המחזורים.</div>
        </div>
      </div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8 }}>
        {([
          ['שווי חשבון', usd(equity), equity - start],
          ['יתרת ארנק', usd(wallet), 0],
          ['רווח/הפסד פתוח', usd(unreal), unreal],
          ['ממומש', usd(st?.realized_total ?? 0), st?.realized_total ?? 0],
          ['עמלות', usd(st?.fees_total ?? 0), -(st?.fees_total ?? 0)],
          ['מימון', usd(st?.funding_total ?? 0), st?.funding_total ?? 0],
          ['אחוז הצלחה', `${st?.trades_closed ? Math.round(st.win_rate_pct) : 0}% · ${st?.wins ?? 0}/${st?.trades_closed ?? 0}`, 0],
          ['ירידה מהשיא', `${liveDd.toFixed(2)}%`, liveDd],
          ['ירידה מקסימלית', `${(st?.max_drawdown_pct ?? 0).toFixed(2)}%`, st?.max_drawdown_pct ?? 0],
        ] as [string, string, number][]).map(([k, v, s]) => (
          <div key={k} style={box}><div style={lab}>{k}</div><div style={{ fontSize: 19, fontWeight: 600, color: col(s), direction: 'ltr', textAlign: 'right' }}>{k === 'רווח/הפסד פתוח' || k === 'שווי חשבון' ? <Flash n={k === 'שווי חשבון' ? equity : unreal} text={v} /> : v}</div></div>
        ))}
      </div>
      {st && <div style={{ ...box, borderColor: st.risk?.halted ? '#7a2f2f' : '#1c2738' }}>
        <div style={lab}>שומר היום (UTC)</div>
        <div style={{ fontSize: 15, marginTop: 4 }}>{st.risk?.halted ? `⛔ הפסד יומי ${(st.risk.day_pnl_pct ?? 0).toFixed(2)}% — אין כניסות חדשות עד מחר` : `✅ מותר להיכנס (תקרת הפסד יומי ${st.risk?.max_daily_loss_pct ?? 5}%)`}</div>
        <div style={{ ...lab, marginTop: 6 }}>נר 15m אחרון שנסגר: {st.last_bar_close || '—'} · פוזיציות {open.length}/{st.risk?.max_positions ?? 3} · מזומן פנוי {usd(st.available ?? 0)} · מרג'ין בשימוש {usd(st.used_margin ?? 0)}</div>
      </div>}
      <div style={box}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>עקומת הון</div>
        <Spark pts={curve} />
        <div style={lab}>התחלה {usd(start)} · עכשיו {usd(equity)} · תשואה חיה {liveReturn.toFixed(2)}%</div>
      </div>
      <div style={box}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>פוזיציות פתוחות ({open.length}/3)</div>
        {!open.length && <div style={lab}>אין פוזיציות. כניסה רק כשנר 15m סגור חוצה EMA20/50 בכיוון EMA200 של שעה, ו-RSI לא בקיצון.</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 8 }}>
          {rows.map(({ p, v }) => (
            <div key={p.symbol} style={{ ...box, background: '#0e1729' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <b>{p.symbol.replace('USDT', '')} <span style={{ color: p.side === 'LONG' ? '#3ddc97' : '#ff6b6b' }}>{p.side === 'LONG' ? 'לונג' : 'שורט'}</span> · {p.leverage}x</b>
                <Flash n={v.upnl} text={usd(v.upnl)} />
              </div>
              <div style={{ ...lab, marginTop: 6, lineHeight: 1.7 }}>
                כניסה {px(p.entry)} · מארק <b style={{ color: '#e6edf5' }}><Flash n={v.mark} text={px(v.mark)} /></b><br />
                גודל {p.qty} · נומינלי {usd(v.notional)} · מרג'ין {usd(v.margin)}<br />
                ROE <span style={{ color: col(v.roe) }}>{pct(v.roe)}</span> · יחס מרג'ין <span style={{ color: v.marginRatio >= 0.8 ? '#ff6b6b' : '#e6edf5' }}>{Number.isFinite(v.marginRatio) ? pct(v.marginRatio) : '—'}</span><br />
                סטופ {p.sl ? px(p.sl) : '—'} · יעד {p.tp ? px(p.tp) : '—'} · חיסול {p.liq ? px(p.liq) : '—'}
                {v.dist != null ? <> · מרחק {pct(v.dist)}</> : null}<br />
                עמלות {usd(p.fees ?? 0)} · מימון {usd(p.funding ?? 0)}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={box}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>מחירים חיים</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tape">
            <thead>
              <tr>
                <th>מטבע</th><th>ביד</th><th>אסק</th><th>אחרון</th><th>מארק</th><th>מימון</th><th>עד המימון</th>
              </tr>
            </thead>
            <tbody>
              {shownSyms.map((s) => {
                const q = quote(s)
                const b = prices[s] ?? {}
                const bid = q?.bid || b.bid || 0
                const ask = q?.ask || b.ask || 0
                const last = q?.last || b.last || 0
                const mark = q?.mark || b.mark || 0
                const rate = q?.funding ?? b.funding_rate ?? null
                const next = q?.nextFunding || b.next_funding_time || null
                return (
                  <tr key={s} className={s === sel ? 'sel' : undefined} onClick={() => setSel(s)}>
                    <td>{s.replace('USDT', '')}</td>
                    <td><Flash n={bid} text={px(bid)} /></td>
                    <td><Flash n={ask} text={px(ask)} /></td>
                    <td><Flash n={last} text={px(last)} /></td>
                    <td><Flash n={mark} text={px(mark)} /></td>
                    <td style={{ color: rate > 0 ? '#e6c35c' : rate < 0 ? '#9ad7ff' : '#e6edf5' }}>{rate == null ? '—' : `${(rate * 100).toFixed(4)}%`}</td>
                    <td dir="ltr">{fundingLeft(next, now)}{rate > 0 ? ' · לונג משלם' : rate < 0 ? ' · שורט משלם' : ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 10 }}>
          <div style={lab}>מארק {sel.replace('USDT', '')} · {px(selQ?.mark || selBook.mark || 0)} · לחצו על שורה</div>
          <Mini pts={tape.series[sel] ?? []} />
        </div>
      </div>
      <div style={box}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>אותות ואירועים</div>
        {!(st?.events ?? []).length && <div style={lab}>עוד אין אירועים.</div>}
        {(st?.events ?? []).slice().reverse().slice(0, 25).map((e: J, i: number) => (
          <div key={i} style={{ fontSize: 13, padding: '3px 0', borderTop: i ? '1px solid #1c2738' : 'none' }}>
            <span style={lab}>{e.ts ? new Date(e.ts).toISOString().slice(5, 16).replace('T', ' ') : ''} </span>
            <b>{WHY[e.type] ?? e.type}</b> {e.symbol ? e.symbol.replace('USDT', '') : ''} — {e.msg}
          </div>
        ))}
      </div>
      {!!(st?.trades ?? []).length && <div style={box}>
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
        <div style={{ fontSize: 13, lineHeight: 1.7 }}>חציית EMA20/50 על נר 15 דקות סגור, רק בכיוון המגמה (סגירת שעה מול EMA200), RSI(14) מתחת ל-70 בלונג ומעל 30 בשורט. סטופ 2×ATR, יעד 3×ATR. סיכון 1% מהשווי כולל עמלות, מרג'ין לעסקה עד 30% מהשווי, מינוף 3, עד 3 פוזיציות, הפסד יומי 5% עוצר כניסות. מילוי שוק במחיר האסק/ביד של הנר שנסגר ועוד 1bp החלקה, עמלת טייקר 0.05%. מימון אמיתי בזמני המימון. חיסול לפי מחיר מארק ומדרגות המינוף של Binance. בין המחזורים המסך מחשב מחדש רווח פתוח, ROE, יחס מרג'ין ומרחק לחיסול ממחיר המארק החי. שווי החשבון = ארנק + רווח פתוח חי.</div>
      </div>
      <div style={{ ...box, borderColor: '#5a4a1c' }}>
        <div style={{ fontWeight: 600 }}>בקטסט 90 יום של אותם כללים — ההאסטרטגיה הפסידה</div>
        <div style={{ fontSize: 13, lineHeight: 1.7, marginTop: 6 }}>343 עסקאות, הצלחה 34.4%, נטו −4,838 USDT (−48%), PF 0.52, עמלות 2,178, ירידה מקסימלית −51%, שארפ −7.7. גם לפני עמלות. זה דמו לנייר, לא טענה לרווח. החשבון מתחיל ב-10,000 USDT ולא שולח פקודה לבורסה.</div>
      </div>
    </div>
  )
}

// Standalone page: "ממים חיים" — the pump.fun meme-coin PAPER desk (memes.html). Read-only: reads meme/state.json from the
// pm-desk-data branch every 5 s and, for open positions, the live bonding curve from pump.fun every 3 s (when the browser
// can reach it; otherwise the bot's own last mark). Values use the same fill maths as shared/meme.ts (sale into the curve).
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

const LIVE = 'https://spacehub-meme.fly.dev'
const URL_ = 'https://raw.githubusercontent.com/aliexpressgood585/spacehub/pm-desk-data/meme/state.json'
type J = any
const FEE = 0.0125, TX = 0.001
const sellSol = (vS: number, vT: number, tok: number) => Math.max(0, (vS - vS * vT / (vT + tok)) / 1e9 * (1 - FEE) - TX)
const usd = (v: number | null | undefined, d = 2) => (v == null || !isFinite(v) ? '—' : `${v < 0 ? '−' : ''}$${Math.abs(v).toFixed(d)}`)
const pct = (v: number | null | undefined) => (v == null || !isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`)
const col = (v: number) => (v > 0 ? '#3ddc97' : v < 0 ? '#ff6b6b' : '#c9d4e0')
const il = (ts: string) => new Date(ts).toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour12: false })
const ago = (ts?: string) => (ts ? `${Math.max(0, Math.round((Date.now() - Date.parse(ts)) / 1000))} שנ׳` : '—')
const REASON: Record<string, string> = { TP: 'יעד רווח', SL: 'סטופ', TIME: 'זמן' }

function App() {
  const [st, setSt] = useState<J>(null), [live, setLive] = useState<Record<string, J>>({}), [, tick] = useState(0)
  useEffect(() => {
    // the always-on server streams every cycle (~1 s); the GitHub file is the fallback while it is down
    let es: EventSource | null = null, liveAt = 0
    try { es = new EventSource(LIVE + '/events'); es.onmessage = (e) => { liveAt = Date.now(); try { setSt(JSON.parse(e.data)) } catch {} } } catch {}
    const load = () => { if (Date.now() - liveAt > 10_000) fetch(URL_ + '?t=' + Date.now()).then((r) => r.json()).then(setSt).catch(() => {}) }
    load(); const a = setInterval(load, 2000), b = setInterval(() => tick((x) => x + 1), 250)
    return () => { clearInterval(a); clearInterval(b); es?.close() }
  }, [])
  const open = (st?.trades ?? []).filter((t: J) => t.status === 'OPEN')
  useEffect(() => {
    const go = () => open.forEach((t: J) => fetch(`https://frontend-api-v3.pump.fun/coins-v2/${t.mint}`).then((r) => r.json())
      .then((x) => x?.mint && setLive((m) => ({ ...m, [t.mint]: { ...x, at: Date.now() } }))).catch(() => {}))
    go(); const id = setInterval(go, 1000); return () => clearInterval(id)
  }, [open.map((t: J) => t.mint).join()])
  if (!st) return <div style={{ padding: 24 }}>טוען…</div>
  const solUsd = st.sol_usd ?? 0
  const val = (t: J) => {
    const x = live[t.mint]
    // coins-v2 has no reserves: rebuild them from its market cap and the trade's stored curve constant (as the bot does)
    if (x && !x.complete && Date.now() - x.at < 15000) {
      if (+x.virtual_sol_reserves > 0) return { sol: sellSol(+x.virtual_sol_reserves, +x.virtual_token_reserves, t.tokens), src: 'חי' }
      if (t.k > 0 && +x.market_cap > 0) return { sol: sellSol(Math.sqrt(t.k * x.market_cap / 1e6), Math.sqrt(t.k * 1e6 / x.market_cap), t.tokens), src: 'חי' }
    }
    return { sol: t.last_sol ?? t.cost_sol, src: 'בוט' }
  }
  const ov = open.reduce((s: number, t: J) => s + val(t).sol * solUsd, 0), eq = st.cash + ov
  const closed = (st.trades ?? []).filter((t: J) => t.status === 'CLOSED').reverse()
  const wins = closed.filter((t: J) => t.pnl > 0).length, real = closed.reduce((s: number, t: J) => s + t.pnl, 0)
  const card = { background: '#0b1322', border: '1px solid #1d2a40', borderRadius: 12, padding: 12 } as const
  const R = st.rules ?? {}
  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 16, display: 'grid', gap: 12 }}>
      <div><h1 style={{ fontSize: 22 }}>ממים חיים 🐸</h1>
        <div style={{ color: '#8fa3b8', fontSize: 13 }}>דמו בכסף וירטואלי על מטבעות pump.fun חדשים, במחירים חיים מהעקומה · {st.host === 'fly' ? `שרת חי · מחזור ${((st.cycle_ms ?? 0) / 1000).toFixed(1)} שנ׳ · ` : 'גיבוי GitHub · '}מחזור אחרון לפני {ago(st.cycle)} (שעון ישראל {il(st.cycle)}){st.last_error ? ` · שגיאה: ${st.last_error}` : ''}</div></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 8 }}>
        {[['הון', usd(eq), col(eq - st.start_cash)], ['שינוי', pct(eq / st.start_cash - 1), col(eq - st.start_cash)], ['מזומן', usd(st.cash), '#c9d4e0'],
          ['פתוחות', `${open.length}/${R.maxOpen ?? 10}`, '#c9d4e0'], ['נסגרו', `${closed.length} · ${wins} רווח`, '#c9d4e0'], ['רווח ממומש', usd(real), col(real)]]
          .map(([k, v, c]) => <div key={k} style={card}><div style={{ color: '#8fa3b8', fontSize: 12 }}>{k}</div><div style={{ fontSize: 20, fontWeight: 700, color: c }}>{v}</div></div>)}
      </div>
      <div style={card}><b>פוזיציות פתוחות</b>
        {!open.length && <div style={{ color: '#8fa3b8', marginTop: 6 }}>אין כרגע. הבוט סורק כל כמה שניות וקונה רק מטבע שעולה חזק עכשיו.</div>}
        {open.map((t: J) => { const v = val(t), p = v.sol / t.cost_sol - 1, held = (Date.now() - Date.parse(t.opened_at)) / 60000
          return <a key={t.id} href={`https://pump.fun/coin/${t.mint}`} target="_blank" style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', borderTop: '1px solid #1d2a40', color: 'inherit', textDecoration: 'none' }}>
            {t.image && <img src={t.image} width={36} height={36} style={{ borderRadius: 8, objectFit: 'cover' }} />}
            <div style={{ flex: 1 }}><b>{t.symbol}</b> <span style={{ color: '#8fa3b8', fontSize: 12 }}>{t.name} · עקומה {Math.round((t.progress ?? 0) * 100)}% · {held.toFixed(0)}/{R.maxHoldMin} דק׳ · מחיר {v.src}</span>
              <div style={{ fontSize: 12, color: '#8fa3b8' }}>השקעה {usd(t.cost_usd)} · יעד {pct(R.tp)} · סטופ {pct(R.sl)} · עלות השהיה בכניסה {pct(t.delay_cost)}</div></div>
            <div style={{ textAlign: 'left' }}><div style={{ fontWeight: 700, color: col(p) }}>{pct(p)}</div><div style={{ fontSize: 12 }}>{usd(v.sol * solUsd)}</div></div></a> })}
      </div>
      <div style={card}><b>עסקאות שנסגרו</b>
        {closed.slice(0, 50).map((t: J) => <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid #1d2a40', fontSize: 13 }}>
          <span>{il(t.closed_at)} · <b>{t.symbol}</b> · {REASON[t.exit_reason] ?? t.exit_reason} · {Math.round((Date.parse(t.closed_at) - Date.parse(t.opened_at)) / 60000)} דק׳</span>
          <span style={{ color: col(t.pnl) }}>{usd(t.pnl)} ({pct(t.pnl_pct)})</span></div>)}
      </div>
      <div style={card}><b>החלטות אחרונות</b>
        {(st.decisions ?? []).slice(0, 25).map((d: J, i: number) => <div key={i} style={{ fontSize: 12.5, padding: '4px 0', borderTop: '1px solid #1d2a40', color: d.decision === 'skip' ? '#8fa3b8' : '#e6edf5' }}>
          {il(d.ts)} · <b>{d.symbol}</b> · {d.decision === 'BUY' ? 'קנייה' : d.decision === 'SELL' ? 'מכירה' : 'דילוג'} · {d.reason}{d.pnl != null ? ` · ${usd(d.pnl)}` : ''}</div>)}
      </div>
      <div style={{ ...card, fontSize: 12.5, color: '#8fa3b8', lineHeight: 1.6 }}>
        <b style={{ color: '#e6edf5' }}>איך זה עובד:</b> מטבעות pump.fun חדשים (גיל {R.minAgeMin}–{R.maxAgeMin} דק׳, {(R.minProgress ?? 0) * 100}–{(R.maxProgress ?? 0) * 100}% בדרך לבורסה, עם רשת חברתית) שעלו ≥ {(R.minRise ?? 0) * 100}% בשתי הדקות האחרונות.
        קנייה ב־{(R.stakeFrac ?? 0) * 100}% מההון. יציאה: {pct(R.tp)} / {pct(R.sl)} / {R.maxHoldMin} דק׳.
        <b style={{ color: '#e6edf5' }}> התאמה למציאות:</b> כל קנייה ומכירה מתבצעת לפי מצב העקומה 2 שניות אחרי ההחלטה (כמו השהיה אמיתית), עם עמלת pump.fun 1.25% לכל צד, עמלת רשת, והשפעת הגודל שלנו על המחיר. אחרי מעבר לבורסה – מחיר הבריכה מ־DexScreener.
        לא מדומה: בוטים שמקדימים אותנו. זו אסטרטגיה לא מוכחת – הדמו מודד אותה.
      </div>
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)

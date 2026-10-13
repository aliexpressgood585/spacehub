// Standalone page: Polymarket paper desk (poly.html). Read-only. One live feed (polyLive.ts) drives two views:
// the 3D arena (default) and the classic tables. The choice is remembered per browser.
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import PolyDesk from './components/PolyDesk'
import PolyVerse from './components/PolyVerse'
import { usePolyLive } from './polyLive'

// News-lag study (observation only, scripts/pm-news.ts -> pm/news.json): does the price move before a free-feed bot sees the news?
const NEWS_URL = 'https://raw.githubusercontent.com/aliexpressgood585/spacehub/pm-desk-data/pm/news.json'
function NewsLab({ compact }: { compact?: boolean }) {
  const [s, setS] = useState<any>(null), [open, setOpen] = useState(false)
  useEffect(() => { const load = () => fetch(`${NEWS_URL}?t=${Math.floor(Date.now() / 30000)}`, { cache: 'no-store' }).then((r) => r.ok ? r.json() : null).then((x) => x && setS(x)).catch(() => {}); load(); const id = setInterval(load, 30000); return () => clearInterval(id) }, [])
  const y = s?.study ?? {}
  const box = { background: 'rgba(10,16,28,.72)', border: '1px solid rgba(120,160,220,.25)', borderRadius: 12, padding: '8px 12px', color: '#e6edf5', fontSize: 12.5, cursor: compact ? 'pointer' : 'default' } as const
  const pct = (v: any) => (v == null ? '—' : `${Math.round(v * 100)}%`)
  const head = <><b>מעבדת חדשות</b> (מעקב בלבד) · {y.events ?? 0} חדשות תואמות · נמדדו {y.measured ?? 0} · מהתזוזה קרה לפני שראינו: <b>{pct(y.share_before_seen)}</b></>
  if (compact && !open) return <div style={box} onClick={() => setOpen(true)}>{head} ▾</div>
  const last = (s?.events ?? []).slice(-4).reverse()
  return (
    <div style={{ ...box, display: 'grid', gap: 5 }} onClick={() => compact && setOpen(false)}>
      <div>{head}</div>
      <div style={{ color: '#9fb3c8' }}>כל דקה הבוט קורא חדשות חינמיות (BBC, ESPN, NYT, Guardian, Politico, Sky, CoinDesk), מחבר כותרת לשוק פתוח בפולימרקט, ובודק כמה זז המחיר לפני שראינו את החדשה ואחרי. לא קונה כלום.</div>
      <div>איחור חציוני מהפרסום: <b>{y.median_lag_s == null ? '—' : `${Math.round(y.median_lag_s / 60)} דק׳`}</b> · עסקה מדומה "לרכוב על התזוזה": {y.follow_n ?? 0} מקרים, ממוצע <b>{y.follow_avg_c == null ? '—' : `${y.follow_avg_c.toFixed(2)}¢`}</b> ({y.follow_wins ?? 0} רווחיות)</div>
      {last.map((e: any, i: number) => <div key={i} style={{ fontSize: 11.5, color: '#b8c7d8' }}>• {e.title.slice(0, 70)} → <span dir="ltr">{e.question.slice(0, 50)}</span> {e.status === 'DONE' ? `· לפני ${(100 * e.moved_before).toFixed(1)}¢ / אחרי ${(100 * e.moved_after).toFixed(1)}¢` : '· ממתין למדידה'}</div>)}
    </div>
  )
}

function PolyApp() {
  const d = usePolyLive()
  const [view, setView] = useState<'3d' | 'classic'>(() => { try { return localStorage.getItem('poly-view') === 'classic' ? 'classic' : '3d' } catch { return '3d' } })
  const go = (v: '3d' | 'classic') => { setView(v); try { localStorage.setItem('poly-view', v) } catch { /* private mode */ } ; window.scrollTo(0, 0) }
  if (view === '3d') return <PolyVerse d={d} onClassic={() => go('classic')} other={{ href: 'polycoins.html', label: 'פולי מטבעות' }} extra={<NewsLab compact />} />
  return (
    <div style={{ minHeight: '100vh', background: '#04070E', display: 'flex', justifyContent: 'center', padding: '12px 10px' }}>
      <div style={{ width: '100%', maxWidth: 1100, display: 'grid', gap: 10 }}>
        <button onClick={() => go('3d')} style={{ justifySelf: 'start', background: 'rgba(76,201,240,.12)', border: '1px solid rgba(76,201,240,.4)', color: '#cfe8ff', borderRadius: 10, padding: '7px 12px', fontSize: 13, cursor: 'pointer' }}>✦ לזירת התלת־ממד</button>
        <PolyDesk d={d} extra={<NewsLab />} />
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><PolyApp /></StrictMode>)

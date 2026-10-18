// Standalone page: only the bot's house (house.html), no dashboard around it.
// The house shows GitHub-Actions PAPER desks as tabs — the day-trading coach 15m desk (DayHouse), the quant-coach 4h
// futures desk (CoachHouse), and the Binance USDT-M paper futures desk (FuturesHouse). The Supabase project that ran
// CHAN is blocked (exceed_egress_quota), so ChanHouse (kept in git) has nothing to read.
// ?tab=day|coach|futures picks a tab; the choice is remembered.
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import CoachHouse from './components/CoachHouse'
import DayHouse from './components/DayHouse'
import FuturesHouse from './components/FuturesHouse'

type Tab = 'coach' | 'day' | 'futures'
function initial(): Tab {
  const q = new URLSearchParams(location.search).get('tab')
  if (q === 'day' || q === 'coach' || q === 'futures') return q
  try { const s = localStorage.getItem('house_tab'); if (s === 'day' || s === 'coach' || s === 'futures') return s } catch { /* no storage */ }
  return 'day'
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Shell />
  </StrictMode>,
)

function Shell() {
  const [tab, setTab] = useState<Tab>(initial)
  return (
    <div style={{ minHeight: '100vh', background: tab === 'futures' ? '#07080c' : '#04070E', display: 'flex', justifyContent: 'center', padding: tab === 'futures' ? '10px 12px 28px' : '12px 8px' }}>
      <div style={{ width: '100%', maxWidth: tab === 'futures' ? 1360 : 1100 }}>
        <HouseBridge tab={tab} setTab={setTab} />
      </div>
    </div>
  )
}

function HouseBridge({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const pick = (t: Tab) => { setTab(t); try { localStorage.setItem('house_tab', t) } catch { /* no storage */ } }
  const futures = tab === 'futures'
  const chip = (t: Tab, label: string) => {
    const on = tab === t
    const edge = futures && on ? '#d6ff4a' : on ? '#3d7bd9' : '#1c2738'
    const bg = futures && on ? '#171d0c' : on ? '#13284a' : '#0b1220'
    return (
      <button onClick={() => pick(t)} style={{ padding: '6px 14px', borderRadius: 20, border: '1px solid ' + edge,
        background: bg, color: futures && on ? '#d6ff4a' : '#e6edf5', cursor: 'pointer', fontSize: 14 }}>{label}</button>
    )
  }
  return (
    <>
      <div dir="rtl" style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {chip('day', 'דיי טריידינג · 15m')}
        {chip('coach', 'מאמן כמותי · 4h')}
        {chip('futures', 'מסוף פיוצ\'רס · Binance דמו')}
      </div>
      {tab === 'day' ? <DayHouse /> : tab === 'coach' ? <CoachHouse /> : <FuturesHouse />}
    </>
  )
}

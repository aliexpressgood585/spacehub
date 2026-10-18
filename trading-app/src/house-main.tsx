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

function House() {
  const [tab, setTab] = useState<Tab>(initial)
  const pick = (t: Tab) => { setTab(t); try { localStorage.setItem('house_tab', t) } catch { /* no storage */ } }
  const chip = (t: Tab, label: string) => (
    <button onClick={() => pick(t)} style={{ padding: '6px 14px', borderRadius: 20, border: '1px solid ' + (tab === t ? '#3d7bd9' : '#1c2738'),
      background: tab === t ? '#13284a' : '#0b1220', color: '#e6edf5', cursor: 'pointer', fontSize: 14 }}>{label}</button>)
  return (
    <>
      <div dir="rtl" style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {chip('day', 'דיי טריידינג · 15m')}
        {chip('coach', 'מאמן כמותי · 4h')}
        {chip('futures', 'בוט פיוצ\'רס · Binance דמו')}
      </div>
      {tab === 'day' ? <DayHouse /> : tab === 'coach' ? <CoachHouse /> : <FuturesHouse />}
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div style={{ minHeight: '100vh', background: '#04070E', display: 'flex', justifyContent: 'center', padding: '12px 8px' }}>
      <div style={{ width: '100%', maxWidth: 1100 }}>
        <House />
      </div>
    </div>
  </StrictMode>,
)

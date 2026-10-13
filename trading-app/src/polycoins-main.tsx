// Standalone page: "פולי מטבעות" — the short crypto Up/Down paper desk (polycoins.html), same views as poly.html. Read-only. One live feed (polyLive.ts) drives two views:
// the 3D arena (default) and the classic tables. The choice is remembered per browser.
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import PolyDesk from './components/PolyDesk'
import PolyVerse from './components/PolyVerse'
import { usePolyLive, COINS_STATE_URL } from './polyLive'

const EMPTY = 'אין פוזיציה פתוחה כרגע. הבוט בודק כל 10 שניות את שווקי "עולה או יורד" הקצרים של ביטקוין, את׳ריום, סולנה ו־XRP, ונכנס רק בדקות האחרונות לפני הסיום כשהמחיר בטווח.'

function PolyApp() {
  const d = usePolyLive(COINS_STATE_URL)
  const [view, setView] = useState<'3d' | 'classic'>(() => { try { return localStorage.getItem('polycoins-view') === 'classic' ? 'classic' : '3d' } catch { return '3d' } })
  const go = (v: '3d' | 'classic') => { setView(v); try { localStorage.setItem('polycoins-view', v) } catch { /* private mode */ } ; window.scrollTo(0, 0) }
  if (view === '3d') return <PolyVerse d={d} onClassic={() => go('classic')} title="פולי מטבעות" sub="Polymarket · מטבעות בטווח קצר · חשבון דמו" empty={EMPTY} other={{ href: 'poly.html', label: 'Polymarket ראשי' }} />
  return (
    <div style={{ minHeight: '100vh', background: '#04070E', display: 'flex', justifyContent: 'center', padding: '12px 10px' }}>
      <div style={{ width: '100%', maxWidth: 1100, display: 'grid', gap: 10 }}>
        <button onClick={() => go('3d')} style={{ justifySelf: 'start', background: 'rgba(76,201,240,.12)', border: '1px solid rgba(76,201,240,.4)', color: '#cfe8ff', borderRadius: 10, padding: '7px 12px', fontSize: 13, cursor: 'pointer' }}>✦ לזירת התלת־ממד</button>
        <a href="poly.html" style={{ justifySelf: 'start', color: '#9fb3c8', fontSize: 12 }}>← לשולחן Polymarket הראשי</a>
        <PolyDesk d={d} title="פולי מטבעות · דמו" />
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><PolyApp /></StrictMode>)

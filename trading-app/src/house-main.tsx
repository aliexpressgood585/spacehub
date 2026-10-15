// Standalone page: only the bot's house (house.html), no dashboard around it.
// 2026-10-15: the house shows the quant-coach futures paper desk (CoachHouse, GitHub Actions); the Supabase project
// that ran CHAN is blocked (exceed_egress_quota), so ChanHouse (kept in git) has nothing to read.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import CoachHouse from './components/CoachHouse'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div style={{ minHeight: '100vh', background: '#04070E', display: 'flex', justifyContent: 'center', padding: '12px 8px' }}>
      <div style={{ width: '100%', maxWidth: 1100 }}>
        <CoachHouse />
      </div>
    </div>
  </StrictMode>,
)

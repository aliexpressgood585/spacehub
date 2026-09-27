// Standalone page: only the bot's house (house.html), no dashboard around it.
// v97.3: the house shows the live CHAN engine (ChanHouse); the SCALP-era BotHouse is no longer routed.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ChanHouse from './components/ChanHouse'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div style={{ minHeight: '100vh', background: '#04070E', display: 'flex', justifyContent: 'center', padding: '12px 8px' }}>
      <div style={{ width: '100%', maxWidth: 1100 }}>
        <ChanHouse />
      </div>
    </div>
  </StrictMode>,
)

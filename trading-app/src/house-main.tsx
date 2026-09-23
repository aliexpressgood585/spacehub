// Standalone page: only the bot's house (house.html), no dashboard around it.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import BotHouse from './components/BotHouse'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div style={{ minHeight: '100vh', background: '#04070E', display: 'flex', justifyContent: 'center', padding: '12px 8px' }}>
      <div style={{ width: '100%', maxWidth: 1100 }}>
        <BotHouse />
      </div>
    </div>
  </StrictMode>,
)

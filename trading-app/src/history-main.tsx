// Standalone page: position history with every fee (history.html). Read-only.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import HistoryPage from './components/HistoryPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div style={{ minHeight: '100vh', background: '#04070E', display: 'flex', justifyContent: 'center', padding: '12px 10px' }}>
      <div style={{ width: '100%', maxWidth: 1100 }}>
        <HistoryPage />
      </div>
    </div>
  </StrictMode>,
)

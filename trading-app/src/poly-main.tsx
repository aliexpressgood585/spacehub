// Standalone page: Polymarket paper desk (poly.html). Read-only.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import PolyDesk from "./components/PolyDesk"

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div style={{ minHeight: '100vh', background: '#04070E', display: 'flex', justifyContent: 'center', padding: '12px 10px' }}>
      <div style={{ width: '100%', maxWidth: 1100 }}>
        <PolyDesk />
      </div>
    </div>
  </StrictMode>,
)

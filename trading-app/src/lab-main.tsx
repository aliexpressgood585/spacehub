// v94.0 standalone page: the LAB board (live paper P&L breakdown + the research grid's verdict).
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import LabBoard from './components/LabBoard'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div style={{ minHeight: '100vh', background: '#04070E', display: 'flex', justifyContent: 'center', padding: '12px 16px' }}>
      <div style={{ width: '100%', maxWidth: 1100 }}>
        <a href="house.html" style={{ display: 'inline-block', margin: '0 0 8px', padding: '6px 12px', borderRadius: 999, border: '1px solid #223150', color: '#5aa9ff', fontSize: 13, textDecoration: 'none' }}>🏠 בית הבוט</a>
        <LabBoard />
      </div>
    </div>
  </StrictMode>,
)

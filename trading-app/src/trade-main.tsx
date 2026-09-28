// v95.1 standalone page: one trade on a live chart (trade.html?id=<bot_trades.id>).
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import TradeView from './components/TradeView'

const id = new URLSearchParams(location.search).get('id') ?? ''
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div style={{ minHeight: '100vh', background: '#04070E', padding: '8px' }}>
      <div style={{ width: '100%' }}>
        <a href="house.html" style={{ display: 'inline-block', margin: '0 0 8px', padding: '6px 12px', borderRadius: 999, border: '1px solid #223150', color: '#5aa9ff', fontSize: 13, textDecoration: 'none' }}>→ חזרה לבית הבוט</a>
        {id ? <TradeView id={id} /> : <p style={{ color: '#8A97B2' }}>לא נבחרה עסקה.</p>}
      </div>
    </div>
  </StrictMode>,
)

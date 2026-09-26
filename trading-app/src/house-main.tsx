// Standalone page: only the bot's house (house.html), no dashboard around it.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import BotHouse from './components/BotHouse'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div style={{ minHeight: '100vh', background: '#04070E', display: 'flex', justifyContent: 'center', padding: '12px 8px' }}>
      <div style={{ width: '100%', maxWidth: 1100 }}>
        <a href="house3d.html" style={{ display: 'inline-block', margin: '0 0 8px', padding: '6px 12px', borderRadius: 999, border: '1px solid #223150', color: '#5aa9ff', fontSize: 13, textDecoration: 'none' }}>🪐 הבית בתלת-ממד — אורביטל</a>
        <a href="lab.html" style={{ display: 'inline-block', margin: '0 8px 8px 0', padding: '6px 12px', borderRadius: 999, border: '1px solid #223150', color: '#34d399', fontSize: 13, textDecoration: 'none' }}>🧪 מעבדת המסחר — רווח נטו, עמלות, Elite/Explore</a>
        <BotHouse />
      </div>
    </div>
  </StrictMode>,
)

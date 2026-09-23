import { useEffect, useState } from 'react'
import CryptoTradingDashboard from './components/CryptoTradingDashboard'
import BotHouse from './components/BotHouse'

// '#house' opens the bot's house (a read-only view of what the server bot is doing); anything else is the dashboard.
const isHouse = () => window.location.hash === '#house'

export default function App() {
  const [house, setHouse] = useState(isHouse)
  useEffect(() => {
    const on = () => setHouse(isHouse())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return (
    <div style={{
      minHeight: '100vh',
      background: '#04070E',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: '12px 8px',
    }}>
      <div style={{ width: '100%', maxWidth: 960 }}>
        {house
          ? <BotHouse onBack={() => { window.location.hash = '' }} />
          : <CryptoTradingDashboard />}
      </div>
    </div>
  )
}

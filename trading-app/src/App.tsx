import CryptoTradingDashboard from './components/CryptoTradingDashboard'

export default function App() {
  return (
    <div style={{ minHeight: '100vh', background: '#050008', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px' }}>
      <div style={{ width: '100%', maxWidth: 900 }}>
        <CryptoTradingDashboard />
      </div>
    </div>
  )
}

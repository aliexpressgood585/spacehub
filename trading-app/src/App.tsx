import CryptoTradingDashboard from './components/CryptoTradingDashboard'

export default function App() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#04070E',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: '12px 8px',
    }}>
      <div style={{ width: '100%', maxWidth: 960 }}>
        <CryptoTradingDashboard />
      </div>
    </div>
  )
}

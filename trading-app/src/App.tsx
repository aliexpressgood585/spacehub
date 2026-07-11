import CryptoTradingDashboard from './components/CryptoTradingDashboard'

export default function App() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse 130% 70% at 50% 0%, #071630 0%, #020a1c 45%, #000308 100%)',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      padding: '12px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Perspective grid */}
      <div style={{
        position: 'fixed', inset: 0,
        backgroundImage: [
          'linear-gradient(rgba(0,170,255,0.045) 1px, transparent 1px)',
          'linear-gradient(90deg, rgba(0,170,255,0.045) 1px, transparent 1px)',
        ].join(','),
        backgroundSize: '48px 48px',
        transform: 'perspective(600px) rotateX(14deg) scaleX(1.15)',
        transformOrigin: 'center 28%',
        pointerEvents: 'none', zIndex: 0,
      }} />
      {/* Glow orbs */}
      <div style={{
        position: 'fixed', top: '-15%', left: '8%',
        width: '700px', height: '700px',
        background: 'radial-gradient(circle, rgba(0,80,220,0.1) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0,
      }} />
      <div style={{
        position: 'fixed', top: '-10%', right: '5%',
        width: '450px', height: '450px',
        background: 'radial-gradient(circle, rgba(140,0,220,0.07) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0,
      }} />
      <div style={{ width: '100%', maxWidth: 920, position: 'relative', zIndex: 1 }}>
        <CryptoTradingDashboard />
      </div>
    </div>
  )
}

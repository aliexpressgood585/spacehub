import CryptoTradingDashboard from './components/CryptoTradingDashboard'

export default function App() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse 140% 80% at 50% 0%, #06152e 0%, #020814 50%, #000308 100%)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: '12px 8px', position: 'relative', overflow: 'hidden',
    }}>
      {/* Perspective grid */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: [
          'linear-gradient(rgba(0,160,255,0.04) 1px, transparent 1px)',
          'linear-gradient(90deg, rgba(0,160,255,0.04) 1px, transparent 1px)',
        ].join(','),
        backgroundSize: '52px 52px',
        transform: 'perspective(700px) rotateX(15deg) scaleX(1.1)',
        transformOrigin: 'center 25%',
      }} />
      {/* Cyan ambient glow top-left */}
      <div style={{
        position: 'fixed', top: '-20%', left: '5%',
        width: '650px', height: '650px', pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(circle, rgba(0,90,220,0.1) 0%, transparent 70%)',
      }} />
      {/* Purple ambient glow top-right */}
      <div style={{
        position: 'fixed', top: '-10%', right: '5%',
        width: '450px', height: '450px', pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(circle, rgba(130,0,220,0.07) 0%, transparent 70%)',
      }} />
      <div style={{ width: '100%', maxWidth: 960, position: 'relative', zIndex: 1 }}>
        <CryptoTradingDashboard />
      </div>
    </div>
  )
}

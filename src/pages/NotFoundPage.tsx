import { Link } from 'react-router-dom'
import { useEffect } from 'react'

export default function NotFoundPage() {
  useEffect(() => { document.title = '404 — Page Not Found | SpaceHub' }, [])

  return (
    <div
      style={{
        minHeight: '100vh', background: '#020510', display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '24px', textAlign: 'center', position: 'relative', overflow: 'hidden',
      }}
    >
      {/* Nebula glow */}
      <div style={{
        position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)',
        width: 600, height: 400,
        background: 'radial-gradient(ellipse, rgba(99,102,241,0.15) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 480 }}>
        {/* Big number */}
        <div style={{
          fontSize: 'clamp(80px, 20vw, 140px)', fontWeight: 900, lineHeight: 1,
          background: 'linear-gradient(135deg, #818cf8 0%, #a78bfa 50%, #c4b5fd 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          marginBottom: 8, letterSpacing: '-0.04em',
        }}>
          404
        </div>

        <div style={{ fontSize: 40, marginBottom: 16 }}>🌌</div>

        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 10 }}>
          Lost in Space
        </h1>
        <p style={{ color: '#6b7280', fontSize: 15, lineHeight: 1.6, marginBottom: 32 }}>
          This page drifted out of orbit. The ISS, though, is always right where you left it.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            to="/"
            style={{
              padding: '12px 28px', borderRadius: 14, fontWeight: 700, fontSize: 14,
              background: 'linear-gradient(135deg, rgba(99,102,241,0.9), rgba(139,92,246,0.9))',
              color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8,
              boxShadow: '0 4px 24px rgba(99,102,241,0.4)',
            }}
          >
            🚀 Back to SpaceHub
          </Link>
          <Link
            to="/blog"
            style={{
              padding: '12px 24px', borderRadius: 14, fontWeight: 600, fontSize: 14,
              border: '1px solid rgba(99,102,241,0.35)', color: '#a5b4fc',
              textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'rgba(99,102,241,0.08)',
            }}
          >
            📝 Read Blog
          </Link>
        </div>
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'

const FACTS = [
  { icon: '🛸', text: 'The ISS orbits Earth every 92 minutes at 28,000 km/h' },
  { icon: '🌍', text: 'Earth travels around the Sun at 107,000 km/h' },
  { icon: '🌙', text: 'The Moon moves 3.8 cm away from Earth every year' },
  { icon: '⭐', text: 'Proxima Centauri — nearest star — is 4.24 light-years away' },
  { icon: '🚀', text: 'SpaceX has completed over 300 successful Falcon 9 launches' },
  { icon: '☀️', text: 'Sunlight takes 8 minutes and 20 seconds to reach Earth' },
  { icon: '🪐', text: 'Saturn is so light it would float on water' },
  { icon: '👨‍🚀', text: 'Humans have lived aboard the ISS continuously since November 2000' },
  { icon: '🔭', text: 'James Webb can see galaxies 13.6 billion light-years away' },
  { icon: '🌌', text: 'There are more stars in the universe than grains of sand on Earth' },
]

export default function LiveTicker() {
  const [issLive, setIssLive] = useState('')

  useEffect(() => {
    fetch('https://api.wheretheiss.at/v1/satellites/25544')
      .then(r => r.json())
      .then(d => setIssLive(
        `ISS LIVE: ${Math.abs(d.latitude).toFixed(1)}°${d.latitude >= 0 ? 'N' : 'S'} ${Math.abs(d.longitude).toFixed(1)}°${d.longitude >= 0 ? 'E' : 'W'} · Alt ${d.altitude.toFixed(0)} km · ${d.velocity.toFixed(0)} km/h`
      ))
      .catch(() => {})
  }, [])

  const items = [
    ...(issLive ? [{ icon: '📡', text: issLive }] : []),
    ...FACTS,
  ]

  // Triple the items so the animation loops cleanly
  const looped = [...items, ...items, ...items]

  return (
    <div
      style={{
        background: 'rgba(0,0,0,0.5)',
        borderTop: '1px solid rgba(255,255,255,0.04)',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        padding: '9px 0',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        position: 'relative',
      }}
    >
      {/* Left fade */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 80, zIndex: 2,
        background: 'linear-gradient(90deg, rgba(2,5,16,0.9), transparent)',
        pointerEvents: 'none',
      }} />
      {/* Right fade */}
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0, width: 80, zIndex: 2,
        background: 'linear-gradient(270deg, rgba(2,5,16,0.9), transparent)',
        pointerEvents: 'none',
      }} />

      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0,
          animation: 'ticker 60s linear infinite',
          whiteSpace: 'nowrap',
        }}
      >
        {looped.map((item, i) => (
          <span
            key={i}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              fontSize: 11,
              color: '#6b7280',
              padding: '0 32px',
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            <span>{item.icon}</span>
            <span style={{ whiteSpace: 'nowrap' }}>{item.text}</span>
            <span style={{ color: '#374151', marginLeft: 8 }}>·</span>
          </span>
        ))}
      </div>
    </div>
  )
}

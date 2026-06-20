import { useState, useEffect } from 'react'

interface TickItem { icon: string; text: string }

const STATIC: TickItem[] = [
  { icon: '🛸', text: 'The ISS orbits Earth every 92 minutes at 28,000 km/h' },
  { icon: '🌍', text: 'Earth travels around the Sun at 107,000 km/h' },
  { icon: '🌙', text: 'The Moon moves 3.8 cm away from Earth every year' },
  { icon: '⭐', text: 'The nearest star — Proxima Centauri — is 4.24 light-years away' },
  { icon: '🚀', text: 'SpaceX has completed over 300 successful Falcon 9 launches' },
  { icon: '☀️', text: 'Sunlight takes 8 minutes and 20 seconds to reach Earth' },
  { icon: '🪐', text: 'Saturn is so light it would float on water' },
  { icon: '👨‍🚀', text: 'Humans have lived continuously aboard the ISS since November 2000' },
  { icon: '🔭', text: 'The James Webb Space Telescope can see galaxies 13.6 billion light-years away' },
  { icon: '🌌', text: 'There are more stars in the universe than grains of sand on Earth' },
]

export default function LiveTicker() {
  const [issData, setIssData] = useState<string>('')

  useEffect(() => {
    fetch('https://api.wheretheiss.at/v1/satellites/25544')
      .then(r => r.json())
      .then(d => setIssData(`ISS LIVE: ${d.latitude.toFixed(2)}°N, ${d.longitude.toFixed(2)}°E — Alt ${d.altitude.toFixed(0)} km — ${(d.velocity / 3.6).toFixed(1)} km/s`))
      .catch(() => {})
  }, [])

  const items: TickItem[] = [
    ...(issData ? [{ icon: '📡', text: issData }] : []),
    ...STATIC,
  ]

  const doubled = [...items, ...items]

  return (
    <div className="bg-black/40 border-y border-white/[0.04] py-2 overflow-hidden">
      <div className="ticker-wrap">
        <div className="ticker-inner flex gap-12 items-center" style={{ width: 'max-content' }}>
          {doubled.map((item, i) => (
            <span key={i} className="flex items-center gap-2 text-xs text-gray-500 flex-shrink-0">
              <span>{item.icon}</span>
              <span>{item.text}</span>
              <span className="text-gray-800 mx-4">•</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

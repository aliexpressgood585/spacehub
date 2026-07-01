import type { VercelRequest, VercelResponse } from '@vercel/node'

export default function handler(_req: VercelRequest, res: VercelResponse) {
  const stars = Array.from({ length: 120 }, (_, i) => {
    const x = ((i * 97 + 13) % 1200)
    const y = ((i * 61 + 29) % 630)
    const r = i % 5 === 0 ? 2 : 1
    const op = 0.3 + (i % 7) * 0.1
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="white" opacity="${op.toFixed(1)}"/>`
  }).join('')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs>
    <radialGradient id="glow" cx="25%" cy="50%" r="55%">
      <stop offset="0%" stop-color="#4f46e5" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#020510" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="earthGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#1d4ed8" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="#020510" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="earthFill" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1e40af"/>
      <stop offset="100%" stop-color="#0c1445"/>
    </linearGradient>
    <filter id="blur">
      <feGaussianBlur stdDeviation="18"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="#020510"/>

  <!-- Stars -->
  ${stars}

  <!-- Glow -->
  <ellipse cx="300" cy="315" rx="420" ry="380" fill="url(#glow)"/>

  <!-- Earth glow halo -->
  <circle cx="940" cy="315" r="220" fill="url(#earthGlow)" filter="url(#blur)"/>

  <!-- Orbit rings -->
  <ellipse cx="940" cy="315" rx="310" ry="200" fill="none" stroke="#4f46e5" stroke-width="1" stroke-opacity="0.25" stroke-dasharray="12,6"/>
  <ellipse cx="940" cy="315" rx="240" ry="155" fill="none" stroke="#818cf8" stroke-width="1" stroke-opacity="0.18" stroke-dasharray="8,4"/>

  <!-- Earth -->
  <circle cx="940" cy="315" r="115" fill="url(#earthFill)" stroke="#3b82f6" stroke-width="1.5" stroke-opacity="0.5"/>
  <ellipse cx="910" cy="280" rx="38" ry="22" fill="#2563eb" fill-opacity="0.5"/>
  <ellipse cx="970" cy="350" rx="28" ry="16" fill="#1d4ed8" fill-opacity="0.4"/>
  <ellipse cx="930" cy="320" rx="50" ry="18" fill="#3b82f6" fill-opacity="0.25"/>

  <!-- ISS dot on orbit -->
  <circle cx="1130" cy="185" r="10" fill="#818cf8"/>
  <circle cx="1130" cy="185" r="22" fill="#4f46e5" fill-opacity="0.25"/>

  <!-- Divider line -->
  <line x1="80" y1="160" x2="560" y2="160" stroke="#4f46e5" stroke-width="2" stroke-opacity="0.5"/>

  <!-- Logo badge -->
  <rect x="80" y="70" width="68" height="68" rx="16" fill="#4f46e5"/>
  <rect x="82" y="72" width="64" height="64" rx="15" fill="#6366f1" fill-opacity="0.5"/>
  <text x="114" y="122" font-size="38" text-anchor="middle" font-family="system-ui">&#128640;</text>

  <!-- Brand name -->
  <text x="165" y="118" font-family="system-ui,-apple-system,BlinkMacSystemFont,sans-serif" font-size="52" font-weight="900" fill="white" letter-spacing="-1">Space</text>
  <text x="326" y="118" font-family="system-ui,-apple-system,BlinkMacSystemFont,sans-serif" font-size="52" font-weight="900" fill="#818cf8" letter-spacing="-1">Hub</text>

  <!-- Tagline -->
  <text x="80" y="215" font-family="system-ui,-apple-system,BlinkMacSystemFont,sans-serif" font-size="26" fill="#6b7280" letter-spacing="0.5">Real-Time Space Tracker</text>

  <!-- Main headline -->
  <text x="80" y="300" font-family="system-ui,-apple-system,BlinkMacSystemFont,sans-serif" font-size="44" font-weight="800" fill="white">Track the ISS.</text>
  <text x="80" y="355" font-family="system-ui,-apple-system,BlinkMacSystemFont,sans-serif" font-size="44" font-weight="800" fill="white">Monitor Space Weather.</text>
  <text x="80" y="410" font-family="system-ui,-apple-system,BlinkMacSystemFont,sans-serif" font-size="44" font-weight="800" fill="#818cf8">All Free. All Live.</text>

  <!-- Feature badges -->
  <rect x="80" y="455" width="130" height="36" rx="18" fill="#4f46e5" fill-opacity="0.2" stroke="#4f46e5" stroke-opacity="0.5" stroke-width="1"/>
  <text x="145" y="478" font-family="system-ui,sans-serif" font-size="15" fill="#818cf8" text-anchor="middle" font-weight="600">ISS Live</text>

  <rect x="222" y="455" width="155" height="36" rx="18" fill="#4f46e5" fill-opacity="0.2" stroke="#4f46e5" stroke-opacity="0.5" stroke-width="1"/>
  <text x="299" y="478" font-family="system-ui,sans-serif" font-size="15" fill="#818cf8" text-anchor="middle" font-weight="600">Space Weather</text>

  <rect x="389" y="455" width="158" height="36" rx="18" fill="#4f46e5" fill-opacity="0.2" stroke="#4f46e5" stroke-opacity="0.5" stroke-width="1"/>
  <text x="468" y="478" font-family="system-ui,sans-serif" font-size="15" fill="#818cf8" text-anchor="middle" font-weight="600">40K+ Satellites</text>

  <!-- URL -->
  <text x="80" y="565" font-family="system-ui,sans-serif" font-size="18" fill="#374151" letter-spacing="0.5">spacehubapp.com</text>

  <!-- Bottom border -->
  <rect x="0" y="620" width="1200" height="10" fill="#4f46e5" fill-opacity="0.5"/>
</svg>`

  res.setHeader('Content-Type', 'image/svg+xml')
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800')
  res.send(svg)
}

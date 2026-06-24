import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const [posRes, tleRes] = await Promise.all([
      fetch('http://api.open-notify.org/iss-now.json', { signal: AbortSignal.timeout(8000) }),
      fetch('https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE', { signal: AbortSignal.timeout(8000) }),
    ])

    if (!posRes.ok) throw new Error(`position feed ${posRes.status}`)
    const posData = await posRes.json() as { iss_position: { latitude: string; longitude: string }; timestamp: number }

    // Derive altitude and velocity from TLE mean motion (Kepler's 3rd law)
    let altitude = 420
    let velocity = 27600
    if (tleRes.ok) {
      const tle = await tleRes.text()
      const line2 = tle.trim().split('\n').find((l: string) => l.trim().startsWith('2 '))
      if (line2) {
        const meanMotion = parseFloat(line2.slice(52, 63)) // rev/day
        const mu = 398600.4418 // km³/s²
        const T = 86400 / meanMotion
        const a = Math.cbrt(mu * Math.pow(T / (2 * Math.PI), 2))
        altitude = Math.round(a - 6371)
        velocity = Math.round(Math.sqrt(mu / a) * 3600) // km/h
      }
    }

    res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=10')
    res.json({
      latitude: parseFloat(posData.iss_position.latitude),
      longitude: parseFloat(posData.iss_position.longitude),
      altitude,
      velocity,
      timestamp: posData.timestamp,
    })
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'upstream error' })
  }
}

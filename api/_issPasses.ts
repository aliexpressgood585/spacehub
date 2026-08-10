// Server-side ISS visible-pass prediction.
//
// Used by the push cron to decide who gets an alert and when. Kept separate
// from the API handler so the maths can be reasoned about (and unit-checked)
// on its own.

import * as satellite from 'satellite.js'

export interface Pass {
  start: Date
  peak: Date
  end: Date
  maxElevation: number
  /** Compass azimuth in degrees where the pass rises. */
  startAzimuth: number
  /** Sunlit satellite seen against a dark sky — the only kind worth an alert. */
  visible: boolean
}

const DEG = 180 / Math.PI
const MIN_PEAK_ELEV = 15 // below this the ISS skims the horizon, usually behind buildings
const HORIZON = 10

/** Approximate geocentric solar position in ECI km. Good to ~0.01° — plenty here. */
function sunEci(date: Date): { x: number; y: number; z: number } {
  const jd = date.getTime() / 86400000 + 2440587.5
  const n = jd - 2451545.0
  const L = ((280.46 + 0.9856474 * n) % 360 + 360) % 360
  const g = (((357.528 + 0.9856003 * n) % 360 + 360) % 360) / DEG
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) / DEG
  const eps = (23.439 - 0.0000004 * n) / DEG
  const r = (1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g)) * 149597870.7
  return {
    x: r * Math.cos(lambda),
    y: r * Math.cos(eps) * Math.sin(lambda),
    z: r * Math.sin(eps) * Math.sin(lambda),
  }
}

/** Sun altitude in degrees at an observer, used to require a dark-enough sky. */
function sunAltitude(date: Date, latDeg: number, lngDeg: number): number {
  const sun = sunEci(date)
  const gmst = satellite.gstime(date)
  const observerGd = { latitude: latDeg / DEG, longitude: lngDeg / DEG, height: 0 }
  // satellite.js rotates ECI->ECF for us, so both vectors share a frame.
  const sunEcf = satellite.eciToEcf(sun as satellite.EciVec3<number>, gmst)
  return satellite.ecfToLookAngles(observerGd, sunEcf).elevation * DEG
}

/** True when the satellite is outside Earth's cylindrical shadow. */
function satelliteIsSunlit(date: Date, satEci: { x: number; y: number; z: number }): boolean {
  const sun = sunEci(date)
  const sunMag = Math.hypot(sun.x, sun.y, sun.z)
  const u = { x: sun.x / sunMag, y: sun.y / sunMag, z: sun.z / sunMag }
  // Component of the satellite vector along the sun direction.
  const along = satEci.x * u.x + satEci.y * u.y + satEci.z * u.z
  if (along > 0) return true // sun-facing side, always lit
  const satMag = Math.hypot(satEci.x, satEci.y, satEci.z)
  const perp = Math.sqrt(Math.max(0, satMag * satMag - along * along))
  return perp > 6371 // outside the shadow cylinder
}

const compass = (az: number) =>
  ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round((((az % 360) + 360) % 360) / 45) % 8]

export function describePass(p: Pass, tz?: string): string {
  const time = p.peak.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz || 'UTC',
  })
  return `${time} · ${Math.round(p.maxElevation)}° up`
}

export { compass }

/**
 * Predict passes over the next `hours` for one observer.
 * Steps at 30 s — fine enough to place a ~6 minute pass within half a minute.
 */
export function predictPasses(
  tleLine1: string,
  tleLine2: string,
  latDeg: number,
  lngDeg: number,
  from: Date,
  hours = 24,
): Pass[] {
  const satrec = satellite.twoline2satrec(tleLine1, tleLine2)
  const observerGd = { latitude: latDeg / DEG, longitude: lngDeg / DEG, height: 0 }

  const passes: Pass[] = []
  const stepMs = 30_000
  const end = from.getTime() + hours * 3600_000

  let current: {
    start: Date
    peak: Date
    maxElevation: number
    startAzimuth: number
    sunlitAtPeak: boolean
  } | null = null

  for (let t = from.getTime(); t <= end; t += stepMs) {
    const date = new Date(t)
    const pv = satellite.propagate(satrec, date)
    if (!pv || typeof pv.position === 'boolean' || !pv.position) continue
    const posEci = pv.position as satellite.EciVec3<number>

    const gmst = satellite.gstime(date)
    const posEcf = satellite.eciToEcf(posEci, gmst)
    const look = satellite.ecfToLookAngles(observerGd, posEcf)
    const elev = look.elevation * DEG

    if (elev >= HORIZON) {
      if (!current) {
        current = {
          start: date,
          peak: date,
          maxElevation: elev,
          startAzimuth: look.azimuth * DEG,
          sunlitAtPeak: satelliteIsSunlit(date, posEci),
        }
      }
      if (elev > current.maxElevation) {
        current.maxElevation = elev
        current.peak = date
        current.sunlitAtPeak = satelliteIsSunlit(date, posEci)
      }
    } else if (current) {
      const skyIsDark = sunAltitude(current.peak, latDeg, lngDeg) < -6
      passes.push({
        start: current.start,
        peak: current.peak,
        end: date,
        maxElevation: current.maxElevation,
        startAzimuth: current.startAzimuth,
        visible: current.sunlitAtPeak && skyIsDark && current.maxElevation >= MIN_PEAK_ELEV,
      })
      current = null
    }
  }

  return passes
}

/** Fetch the current ISS TLE from Celestrak. */
export async function fetchIssTle(): Promise<[string, string] | null> {
  try {
    const r = await fetch(
      'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE',
      { signal: AbortSignal.timeout(8000) },
    )
    if (!r.ok) return null
    const lines = (await r.text()).trim().split('\n').map(l => l.trim())
    if (lines.length < 3) return null
    return [lines[1], lines[2]]
  } catch {
    return null
  }
}

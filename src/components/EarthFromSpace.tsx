import { useState, useRef, useEffect } from 'react'

interface EarthSatellite {
  name: string
  agency: string
  orbit: string
  altitude: number
  launched: number
  sensors: string[]
  mission: string
  status: 'active' | 'retired'
  resolution: string
  flag: string
}

interface ClimateIndicator {
  name: string
  trend: string
  value: string
  unit: string
  change: string
  direction: 'up' | 'down' | 'stable'
  color: string
  description: string
}

interface RemoteSensingApp {
  domain: string
  applications: string[]
  satellites: string[]
  icon: string
}

const satellites: EarthSatellite[] = [
  { name: 'Landsat 9', agency: 'NASA/USGS', orbit: 'Sun-synchronous', altitude: 705, launched: 2021, sensors: ['OLI-2', 'TIRS-2'], mission: 'Land surface imaging at 30m resolution. 50-year continuity of Earth observation data.', status: 'active', resolution: '30 m', flag: '🇺🇸' },
  { name: 'Sentinel-2A/B', agency: 'ESA Copernicus', orbit: 'Sun-synchronous', altitude: 786, launched: 2015, sensors: ['MSI (13 bands)'], mission: 'High-resolution multispectral imaging for land monitoring, agriculture, forestry, and disaster response.', status: 'active', resolution: '10 m', flag: '🇪🇺' },
  { name: 'GOES-18', agency: 'NOAA', orbit: 'Geostationary', altitude: 35786, launched: 2022, sensors: ['ABI', 'SUVI', 'SEISS', 'GLM'], mission: 'Continuous full-disk Earth imaging every 10 minutes for weather forecasting and storm tracking.', status: 'active', resolution: '0.5–2 km', flag: '🇺🇸' },
  { name: 'ICESat-2', agency: 'NASA', orbit: 'Near-polar', altitude: 500, launched: 2018, sensors: ['ATLAS (photon lidar)'], mission: 'Ice sheet height, sea ice thickness, forest canopy height using 10,000 laser pulses per second.', status: 'active', resolution: '0.7 m vertical', flag: '🇺🇸' },
  { name: 'GRACE-FO', agency: 'NASA/DLR', orbit: 'Low Earth', altitude: 490, launched: 2018, sensors: ['KBR microwave ranging', 'LRI laser'], mission: 'Tracks monthly gravity field changes to measure groundwater depletion, ice loss, and sea level rise.', status: 'active', resolution: '~300 km (gravity)', flag: '🇺🇸🇩🇪' },
  { name: 'Aura', agency: 'NASA', orbit: 'Sun-synchronous', altitude: 705, launched: 2004, sensors: ['MLS', 'OMI', 'HIRDLS', 'TES'], mission: 'Atmospheric chemistry — ozone hole monitoring, air quality, greenhouse gas columns.', status: 'active', resolution: '13 km', flag: '🇺🇸' },
  { name: 'GCOM-W (Shizuku)', agency: 'JAXA', orbit: 'Sun-synchronous', altitude: 700, launched: 2012, sensors: ['AMSR2'], mission: 'Water cycle — sea surface temperature, soil moisture, snow, sea ice, precipitation.', status: 'active', resolution: '10 km', flag: '🇯🇵' },
  { name: 'Planet Dove', agency: 'Planet Labs', orbit: 'Sun-synchronous', altitude: 475, launched: 2013, sensors: ['4-band multispectral'], mission: 'Daily imaging of entire Earth land surface. 200+ cubesats in constellation providing daily 3m imagery.', status: 'active', resolution: '3 m', flag: '🇺🇸' },
]

const climateIndicators: ClimateIndicator[] = [
  { name: 'Global Mean Temperature', trend: '↑ +1.2°C since pre-industrial', value: '+1.2', unit: '°C', change: '+0.19°C/decade', direction: 'up', color: '#ef4444', description: 'Global average surface temperature anomaly relative to 1850–1900 baseline. 2023 was warmest year on record.' },
  { name: 'Arctic Sea Ice Extent', trend: '↓ −12.6% per decade', value: '4.3', unit: 'M km²', change: '−0.6 M km²/decade', direction: 'down', color: '#60a5fa', description: 'September minimum Arctic sea ice area. Lowest on satellite record in 2012 (3.41 M km²).' },
  { name: 'Antarctic Ice Sheet Mass', trend: '↓ −152 Gt/year', value: '−152', unit: 'Gt/yr', change: 'Accelerating', direction: 'down', color: '#93c5fd', description: 'Net ice mass loss measured by GRACE-FO gravity satellite. Contributes ~0.4 mm/yr to sea level rise.' },
  { name: 'Global Mean Sea Level', trend: '↑ +3.7 mm/year', value: '+100', unit: 'mm since 1993', change: '+3.7 mm/yr', direction: 'up', color: '#34d399', description: 'Mean sea level from satellite altimetry (TOPEX, Jason series). Rate has accelerated from 2.5 to 4 mm/yr.' },
  { name: 'CO₂ Column (OCO-2)', trend: '↑ 422 ppm', value: '422', unit: 'ppm', change: '+2.5 ppm/yr', direction: 'up', color: '#fb923c', description: 'Atmospheric CO₂ concentration measured by NASA\'s Orbiting Carbon Observatory. Highest in 800,000 years.' },
  { name: 'Amazon Forest Cover', trend: '↓ −17% since 1970', value: '−800,000', unit: 'km² since 1970', change: '−10,000 km²/yr', direction: 'down', color: '#4ade80', description: 'Tropical forest extent from Landsat and Sentinel. Deforestation rate has declined since 2004 peak but remains high.' },
]

const applications: RemoteSensingApp[] = [
  { domain: 'Agriculture', applications: ['Crop yield prediction', 'Drought stress detection', 'Precision irrigation', 'Soil moisture mapping', 'Harvest timing'], satellites: ['Sentinel-2', 'Landsat 9', 'Planet Dove'], icon: '🌾' },
  { domain: 'Disaster Response', applications: ['Flood mapping', 'Wildfire perimeters', 'Earthquake damage', 'Tsunami inundation', 'Oil spill tracking'], satellites: ['Sentinel-1 SAR', 'GOES-18', 'Planet RapidEye'], icon: '🚨' },
  { domain: 'Urban Monitoring', applications: ['Urban heat islands', 'Population density', 'Infrastructure mapping', 'Night lights economics', 'Urban growth'], satellites: ['Landsat 9', 'WorldView-3', 'VIIRS/NPP'], icon: '🏙️' },
  { domain: 'Oceanography', applications: ['Sea surface temperature', 'Chlorophyll bloom', 'Ocean color', 'Current mapping', 'Dead zones'], satellites: ['MODIS', 'Sentinel-3', 'PACE 2024'], icon: '🌊' },
]

function EarthCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width, H = canvas.height
    const cx = W / 2, cy = H / 2 + 10
    let rotation = 0
    let frame: number

    const draw = () => {
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = '#03061a'
      ctx.fillRect(0, 0, W, H)

      // Atmosphere glow
      const atmoGrad = ctx.createRadialGradient(cx, cy, 70, cx, cy, 95)
      atmoGrad.addColorStop(0, 'rgba(56,189,248,0)')
      atmoGrad.addColorStop(0.7, 'rgba(56,189,248,0.15)')
      atmoGrad.addColorStop(1, 'rgba(56,189,248,0)')
      ctx.beginPath()
      ctx.arc(cx, cy, 95, 0, Math.PI * 2)
      ctx.fillStyle = atmoGrad
      ctx.fill()

      // Earth body
      const earthGrad = ctx.createRadialGradient(cx - 20, cy - 20, 0, cx, cy, 72)
      earthGrad.addColorStop(0, '#1d4ed8')
      earthGrad.addColorStop(0.4, '#1e40af')
      earthGrad.addColorStop(0.8, '#1e3a8a')
      earthGrad.addColorStop(1, '#0f172a')
      ctx.beginPath()
      ctx.arc(cx, cy, 72, 0, Math.PI * 2)
      ctx.fillStyle = earthGrad
      ctx.fill()

      // Continent blobs
      const continents = [
        { x: -20, y: -20, w: 35, h: 25 }, // Americas
        { x: 15, y: -15, w: 25, h: 30 }, // Europe/Africa
        { x: 35, y: -10, w: 20, h: 25 }, // Asia
      ]
      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, 72, 0, Math.PI * 2)
      ctx.clip()
      continents.forEach(c => {
        const ox = Math.cos(rotation) * c.x - Math.sin(rotation) * 0
        ctx.beginPath()
        ctx.ellipse(cx + ox * 1.5, cy + c.y, c.w, c.h, rotation * 0.1, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(34,197,94,0.45)'
        ctx.fill()
      })
      // Ice caps
      ctx.beginPath()
      ctx.arc(cx, cy - 65, 20, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(cx, cy + 65, 14, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      ctx.fill()
      ctx.restore()

      // Orbit ring
      ctx.beginPath()
      ctx.ellipse(cx, cy, 110, 35, 0, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(148,163,184,0.2)'
      ctx.lineWidth = 1
      ctx.stroke()

      // Satellite on orbit
      const satAngle = rotation * 1.5
      const sx = cx + Math.cos(satAngle) * 110
      const sy = cy + Math.sin(satAngle) * 35
      ctx.beginPath()
      ctx.arc(sx, sy, 4, 0, Math.PI * 2)
      ctx.fillStyle = '#f59e0b'
      ctx.fill()
      // Solar panels
      ctx.fillStyle = '#0ea5e9'
      ctx.fillRect(sx - 10, sy - 2, 6, 4)
      ctx.fillRect(sx + 4, sy - 2, 6, 4)

      // Scan line from satellite to Earth
      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.lineTo(cx, cy)
      ctx.strokeStyle = 'rgba(251,191,36,0.15)'
      ctx.lineWidth = 1
      ctx.stroke()

      rotation += 0.005
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [])
  return <canvas ref={ref} width={340} height={250} className="w-full rounded-lg" />
}

type Tab = 'satellites' | 'climate' | 'applications'

export default function EarthFromSpace() {
  const [tab, setTab] = useState<Tab>('satellites')
  const [selected, setSelected] = useState<EarthSatellite>(satellites[0])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'satellites', label: 'Earth Satellites' },
    { id: 'climate', label: 'Climate Indicators' },
    { id: 'applications', label: 'Remote Sensing' },
  ]

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Earth From Space</h2>
      <p className="text-gray-400 text-sm mb-5">Satellite observation of our home planet — climate, environment, and disasters</p>

      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>{t.label}</button>
        ))}
      </div>

      {tab === 'satellites' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-2">
            {satellites.map(s => (
              <button key={s.name} onClick={() => setSelected(s)} className={`w-full text-left p-3 rounded-lg transition-colors ${selected.name === s.name ? 'bg-green-900/40 border border-green-600' : 'bg-gray-800/50 hover:bg-gray-700/50'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-white text-sm">{s.flag} {s.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${s.status === 'active' ? 'text-green-400 bg-green-900/30' : 'text-gray-400 bg-gray-800'}`}>{s.status}</span>
                </div>
                <div className="text-gray-400 text-xs">{s.agency}</div>
                <div className="text-gray-500 text-xs mt-0.5">{s.orbit} · {s.resolution}</div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2 space-y-4">
            <EarthCanvas />
            <div className="bg-gray-800/60 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-white">{selected.flag} {selected.name}</h3>
                <span className="text-gray-400 text-sm">{selected.agency} · {selected.launched}</span>
              </div>
              <p className="text-gray-300 text-sm mb-4">{selected.mission}</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Orbit Type', value: selected.orbit },
                  { label: 'Altitude', value: `${selected.altitude.toLocaleString()} km` },
                  { label: 'Resolution', value: selected.resolution },
                  { label: 'Sensors', value: selected.sensors.join(', ') },
                ].map(item => (
                  <div key={item.label} className="bg-gray-900/50 rounded p-2">
                    <div className="text-gray-500 text-xs">{item.label}</div>
                    <div className="text-white text-sm font-medium mt-1">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'climate' && (
        <div className="space-y-3">
          {climateIndicators.map(c => (
            <div key={c.name} className="bg-gray-800/60 rounded-lg p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h4 className="text-white font-semibold">{c.name}</h4>
                  <div className="text-sm mt-0.5" style={{ color: c.color }}>{c.trend}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-lg" style={{ color: c.color }}>
                    {c.direction === 'up' ? '↑' : c.direction === 'down' ? '↓' : '→'}
                  </div>
                  <div className="text-xs text-gray-400">{c.change}</div>
                </div>
              </div>
              <p className="text-gray-400 text-sm">{c.description}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'applications' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {applications.map(a => (
            <div key={a.domain} className="bg-gray-800/60 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">{a.icon}</span>
                <h4 className="text-white font-bold">{a.domain}</h4>
              </div>
              <ul className="space-y-1 mb-3">
                {a.applications.map(app => (
                  <li key={app} className="text-gray-400 text-sm flex items-center gap-2">
                    <span className="text-green-400 text-xs">▸</span> {app}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-1">
                {a.satellites.map(s => (
                  <span key={s} className="text-xs bg-green-900/30 text-green-300 px-2 py-0.5 rounded">{s}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

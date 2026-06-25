import { useState, useRef, useEffect } from 'react'

interface DSNStation {
  name: string
  location: string
  latitude: number
  longitude: number
  antennas: string[]
  established: string
  purpose: string
  icon: string
  color: string
}

interface ActiveContact {
  spacecraft: string
  station: string
  uplink: string
  downlink: string
  distance: string
  lightTime: string
  frequency: string
  dataRate: string
}

interface Mission {
  name: string
  launched: string
  distance: string
  lightDelay: string
  dataRate: string
  antenna: string
  description: string
}

const stations: DSNStation[] = [
  {
    name: 'Goldstone Complex',
    location: 'Mojave Desert, California, USA',
    latitude: 35.43,
    longitude: -116.89,
    antennas: ['DSS-14 (70m)', 'DSS-24 (34m)', 'DSS-25 (34m)', 'DSS-26 (34m)'],
    established: '1958',
    purpose: 'Primary northern hemisphere complex. Pioneer of deep space communications.',
    icon: '🇺🇸',
    color: '#60a5fa'
  },
  {
    name: 'Madrid Complex (MDSCC)',
    location: 'Robledo de Chavela, Spain',
    latitude: 40.43,
    longitude: -4.25,
    antennas: ['DSS-63 (70m)', 'DSS-54 (34m)', 'DSS-55 (34m)', 'DSS-56 (34m)'],
    established: '1965',
    purpose: 'European longitude coverage. Continuous tracking overlap with Goldstone and Canberra.',
    icon: '🇪🇸',
    color: '#f97316'
  },
  {
    name: 'Canberra Complex (CDSCC)',
    location: 'Tidbinbilla, ACT, Australia',
    latitude: -35.40,
    longitude: 148.98,
    antennas: ['DSS-43 (70m)', 'DSS-34 (34m)', 'DSS-35 (34m)', 'DSS-36 (34m)'],
    established: '1964',
    purpose: 'Southern hemisphere. Sole contact for spacecraft over south pole. Voyager 1 primary contact.',
    icon: '🇦🇺',
    color: '#34d399'
  },
]

const missions: Mission[] = [
  {
    name: 'Voyager 1',
    launched: 'Sep 5, 1977',
    distance: '23.5 billion km (157 AU)',
    lightDelay: '~21.5 hours one-way',
    dataRate: '160 bits/second',
    antenna: 'DSS-43 (70m, Canberra)',
    description: 'Farthest human-made object. Signal takes 43 hours round-trip. DSN achieves this with 34-bit/s to 160-bit/s using cryogenic amplifiers cooled to 20 K.'
  },
  {
    name: 'New Horizons',
    launched: 'Jan 19, 2006',
    distance: '8.5 billion km (57 AU)',
    lightDelay: '~7.8 hours one-way',
    dataRate: '1 kbps',
    antenna: 'DSS-43 / DSS-14 (70m)',
    description: 'After Pluto flyby (July 2015), required 16 months to download all data at 1 kbps. Now in the Kuiper Belt transmitting Kuiper Belt Object observations.'
  },
  {
    name: 'James Webb Space Telescope',
    launched: 'Dec 25, 2021',
    distance: '1.5 million km (L2)',
    lightDelay: '5 seconds one-way',
    dataRate: '28 Mbps',
    antenna: '34m HEF stations',
    description: 'Downloads ~28 Mbps over 4-hour ground contact windows per day. 57.6 GB/day of science data. Uses Ka-band for high rate, S-band for telemetry and command.'
  },
  {
    name: 'Mars Perseverance',
    launched: 'Jul 30, 2020',
    distance: '250–400 million km (varies)',
    lightDelay: '14–24 minutes one-way',
    dataRate: 'Up to 32 Mbps via MRO relay',
    antenna: '34m STD stations',
    description: 'Direct-to-Earth rate is ~800 bps–32 kbps. With Mars Reconnaissance Orbiter relay: up to 32 Mbps. Commands uplinked daily, replies received 30–50 minutes later.'
  },
  {
    name: 'Cassini (archive)',
    launched: 'Oct 15, 1997',
    distance: 'Saturn: ~1.2 billion km',
    lightDelay: '~67–84 minutes one-way',
    dataRate: 'Up to 249 kbps',
    antenna: 'All three complexes rotated',
    description: 'Deorbited Sep 15, 2017. Transmitted until final moments. 635 GB of science data returned. Ka-band link allowed 249 kbps at Saturn distance.'
  },
  {
    name: 'Parker Solar Probe',
    launched: 'Aug 12, 2018',
    distance: 'As close as 6.2 million km from Sun',
    lightDelay: '35 seconds (perihelion) to 13.5 min',
    dataRate: '~167 kbps max',
    antenna: 'All sites, 4-hour contacts near perihelion',
    description: 'Data paused during perihelion passes (intense heat). Contact reestablished as probe moves away. Touching the solar corona since Dec 2021.'
  },
]

const activeContacts: ActiveContact[] = [
  { spacecraft: 'Voyager 1', station: 'DSS-43 Canberra', uplink: 'S-band 2.115 GHz', downlink: 'S-band 2.295 GHz', distance: '23.5B km', lightTime: '21h 32m', frequency: 'S-band', dataRate: '160 bps' },
  { spacecraft: 'Perseverance', station: 'DSS-14 Goldstone', uplink: 'X-band 7.145 GHz', downlink: 'X-band 8.415 GHz', distance: '283M km', lightTime: '15m 43s', frequency: 'X-band', dataRate: '32 Kbps' },
  { spacecraft: 'James Webb ST', station: 'DSS-54 Madrid', uplink: 'Ka-band 34 GHz', downlink: 'Ka-band 32 GHz', distance: '1.5M km', lightTime: '5s', frequency: 'Ka-band', dataRate: '28 Mbps' },
]

function EarthCanvas({ selectedStation }: { selectedStation: DSNStation }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width, H = canvas.height

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#03061a'
    ctx.fillRect(0, 0, W, H)

    // Earth circle
    const cx = W / 2, cy = H / 2, r = Math.min(W, H) * 0.35
    const earthG = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r)
    earthG.addColorStop(0, '#1d4ed8')
    earthG.addColorStop(0.5, '#1e40af')
    earthG.addColorStop(1, '#1e3a8a')
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = earthG
    ctx.fill()

    // Grid lines (latitude/longitude)
    ctx.save()
    ctx.clip()
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(59,130,246,0.2)'
    ctx.lineWidth = 0.5
    for (let lat = -90; lat <= 90; lat += 30) {
      const y = cy + (lat / 90) * r
      const x0 = cx - Math.sqrt(Math.max(0, r * r - (y - cy) * (y - cy)))
      const x1 = cx + Math.sqrt(Math.max(0, r * r - (y - cy) * (y - cy)))
      ctx.moveTo(x0, y)
      ctx.lineTo(x1, y)
    }
    ctx.stroke()
    ctx.restore()

    // Plot DSN stations as dots
    stations.forEach(s => {
      const x = cx + (s.longitude / 180) * r
      const y = cy - (s.latitude / 90) * r
      const isSelected = s.name === selectedStation.name

      // Signal beam from selected station
      if (isSelected) {
        ctx.save()
        const beamGrad = ctx.createRadialGradient(x, y, 0, x, y, 80)
        beamGrad.addColorStop(0, s.color + '66')
        beamGrad.addColorStop(1, s.color + '00')
        ctx.beginPath()
        ctx.arc(x, y, 80, 0, Math.PI * 2)
        ctx.fillStyle = beamGrad
        ctx.fill()
        ctx.restore()
      }

      ctx.beginPath()
      ctx.arc(x, y, isSelected ? 7 : 4, 0, Math.PI * 2)
      ctx.fillStyle = s.color
      ctx.fill()
      if (isSelected) {
        ctx.beginPath()
        ctx.arc(x, y, 10, 0, Math.PI * 2)
        ctx.strokeStyle = s.color + 'aa'
        ctx.lineWidth = 2
        ctx.stroke()
      }
      ctx.font = '9px sans-serif'
      ctx.fillStyle = isSelected ? '#fff' : '#94a3b8'
      ctx.fillText(s.name.split(' ')[0], x + 8, y + 3)
    })

  }, [selectedStation])

  return <canvas ref={ref} width={320} height={200} className="w-full rounded-lg" />
}

export default function DeepSpaceNetwork() {
  const [selectedStation, setSelectedStation] = useState(stations[0])
  const [selectedMission, setSelectedMission] = useState(missions[0])
  const [view, setView] = useState<'stations' | 'missions' | 'tech'>('stations')

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Deep Space Network</h2>
      <p className="text-gray-400 text-sm mb-5">NASA's three-site global antenna network — humanity's link to spacecraft across the solar system</p>

      <div className="flex gap-2 mb-6 flex-wrap">
        {[{ id: 'stations', l: 'DSN Stations' }, { id: 'missions', l: 'Active Missions' }, { id: 'tech', l: 'Technology' }].map(t => (
          <button key={t.id} onClick={() => setView(t.id as typeof view)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === t.id ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>{t.l}</button>
        ))}
      </div>

      {view === 'stations' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <EarthCanvas selectedStation={selectedStation} />
            <div className="mt-3 space-y-2">
              {stations.map(s => (
                <button key={s.name} onClick={() => setSelectedStation(s)} className={`w-full text-left p-3 rounded-lg transition-colors ${selectedStation.name === s.name ? 'border' : 'bg-gray-800/50 hover:bg-gray-700/50'}`} style={selectedStation.name === s.name ? { borderColor: s.color, backgroundColor: s.color + '11' } : {}}>
                  <div className="flex items-center gap-2">
                    <span>{s.icon}</span>
                    <div>
                      <div className="text-white text-sm font-semibold">{s.name}</div>
                      <div className="text-gray-500 text-xs">{s.location}</div>
                    </div>
                    <div className="ml-auto flex gap-1.5 flex-wrap justify-end">
                      {s.antennas.slice(0, 2).map(a => <span key={a} className="text-xs px-1.5 py-0.5 bg-gray-700 text-gray-300 rounded">{a.split(' ')[0]}</span>)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-gray-800/60 rounded-xl p-5" style={{ borderLeft: `3px solid ${selectedStation.color}` }}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-3xl">{selectedStation.icon}</span>
                <div>
                  <h3 className="text-xl font-bold text-white">{selectedStation.name}</h3>
                  <div className="text-gray-400 text-sm">{selectedStation.location}</div>
                </div>
              </div>
              <p className="text-gray-300 text-sm mb-4">{selectedStation.purpose}</p>
              <div>
                <div className="text-gray-500 text-xs uppercase font-semibold mb-2">Antenna Array</div>
                <div className="space-y-2">
                  {selectedStation.antennas.map(ant => (
                    <div key={ant} className="flex items-center gap-2 text-sm">
                      <span className="text-2xl">📡</span>
                      <div>
                        <div className="text-white">{ant}</div>
                        <div className="text-gray-500 text-xs">{ant.includes('70m') ? 'Primary — deep space, weak signals' : '34m — HEF or BWG design'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-3 text-gray-600 text-xs">Established: {selectedStation.established}</div>
            </div>

            {/* Live-style contacts display */}
            <div className="bg-gray-800/60 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <h4 className="text-white font-bold text-sm">Simulated Active Contacts</h4>
              </div>
              <div className="space-y-2">
                {activeContacts.map(c => (
                  <div key={c.spacecraft} className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/40">
                    <div className="flex justify-between items-start">
                      <div className="text-white text-sm font-semibold">{c.spacecraft}</div>
                      <div className="text-green-400 text-xs font-mono">{c.dataRate}</div>
                    </div>
                    <div className="text-gray-500 text-xs mt-1">via {c.station}</div>
                    <div className="flex gap-3 mt-1.5 text-xs">
                      <span className="text-blue-400">{c.lightTime} light delay</span>
                      <span className="text-gray-500">{c.frequency}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="text-gray-600 text-xs mt-2">* Displayed contacts are representative examples</div>
            </div>
          </div>
        </div>
      )}

      {view === 'missions' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-2">
            {missions.map(m => (
              <button key={m.name} onClick={() => setSelectedMission(m)} className={`w-full text-left p-3 rounded-lg transition-colors ${selectedMission.name === m.name ? 'bg-indigo-900/40 border border-indigo-600' : 'bg-gray-800/50 hover:bg-gray-700/50'}`}>
                <div className="text-white text-sm font-semibold mb-1">{m.name}</div>
                <div className="text-gray-500 text-xs">{m.distance}</div>
                <div className="text-indigo-400 text-xs font-mono">{m.lightDelay}</div>
              </button>
            ))}
          </div>
          <div className="lg:col-span-2 bg-gray-800/60 rounded-xl p-5">
            <h3 className="text-xl font-bold text-white mb-4">{selectedMission.name}</h3>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-gray-900/50 rounded p-3">
                <div className="text-gray-500 text-xs uppercase">Distance</div>
                <div className="text-white font-mono text-sm">{selectedMission.distance}</div>
              </div>
              <div className="bg-gray-900/50 rounded p-3">
                <div className="text-gray-500 text-xs uppercase">Signal Delay</div>
                <div className="text-indigo-400 font-mono font-bold">{selectedMission.lightDelay}</div>
              </div>
              <div className="bg-gray-900/50 rounded p-3">
                <div className="text-gray-500 text-xs uppercase">Data Rate</div>
                <div className="text-white font-mono text-sm">{selectedMission.dataRate}</div>
              </div>
              <div className="bg-gray-900/50 rounded p-3">
                <div className="text-gray-500 text-xs uppercase">Launched</div>
                <div className="text-white text-sm">{selectedMission.launched}</div>
              </div>
            </div>
            <div className="bg-indigo-900/20 rounded p-3 border border-indigo-800/30 mb-3">
              <div className="text-indigo-400 text-xs uppercase mb-1">Primary DSN Antenna</div>
              <div className="text-white text-sm">{selectedMission.antenna}</div>
            </div>
            <p className="text-gray-300 text-sm">{selectedMission.description}</p>
          </div>
        </div>
      )}

      {view === 'tech' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { title: 'Free-Space Path Loss', value: 'Up to 309 dB', desc: 'Signal spreads over 4πr² area. At Voyager 1 distance, the received power is 10⁻¹⁶ watts — weaker than a single photon.', color: '#60a5fa' },
              { title: 'Cryogenic Amplifiers', value: 'T = 20 K (−253°C)', desc: 'LNAs (Low-Noise Amplifiers) cooled to near absolute zero to reduce thermal noise and detect extremely weak signals.', color: '#34d399' },
              { title: 'Antenna Aperture (70m)', value: '3,848 m² area', desc: 'The 70m dishes collect ~12× more signal than 34m dishes. DSS-43 in Canberra is the largest steerable dish in the Southern Hemisphere.', color: '#f59e0b' },
              { title: 'Pointing Accuracy', value: '0.005°', desc: 'Must track spacecraft moving at up to 60 km/s while accounting for Earth\'s rotation, atmospheric refraction, and relativistic corrections.', color: '#a78bfa' },
              { title: 'Frequencies Used', value: 'S, X, Ka band', desc: 'S-band (2 GHz): older spacecraft. X-band (8 GHz): most missions. Ka-band (32 GHz): highest data rates but affected by rain attenuation.', color: '#f97316' },
              { title: 'Link Margin', value: '3–6 dB typical', desc: 'Extra signal headroom above minimum detectable. Voyager 1 operates with near-zero margin — any degradation would cut the link.', color: '#ef4444' },
            ].map(item => (
              <div key={item.title} className="bg-gray-800/60 rounded-xl p-4 border-l-4" style={{ borderColor: item.color }}>
                <div className="text-sm text-gray-400 font-semibold mb-1">{item.title}</div>
                <div className="text-2xl font-bold font-mono mb-2" style={{ color: item.color }}>{item.value}</div>
                <p className="text-gray-400 text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
          <div className="bg-indigo-900/20 rounded-xl p-4 border border-indigo-800/40">
            <h3 className="text-white font-bold mb-2 text-sm">The Voyager Signal Budget</h3>
            <p className="text-gray-300 text-sm mb-3">How NASA receives 160 bits/second from 23.5 billion km away:</p>
            <div className="space-y-1.5 text-xs">
              {[
                { label: 'Transmit power (Voyager RTG)', value: '23 W' },
                { label: 'High-gain antenna gain (3.7m dish)', value: '+48 dBi' },
                { label: 'Free-space path loss at 23B km', value: '−309 dB' },
                { label: 'DSS-43 receive gain (70m dish)', value: '+74 dBi' },
                { label: 'Cryogenic LNA noise temperature', value: '20 K' },
                { label: 'Received signal power', value: '∼10⁻¹⁶ W' },
                { label: 'Achievable data rate', value: '160 bps' },
              ].map(r => (
                <div key={r.label} className="flex justify-between py-1 border-b border-indigo-800/20">
                  <span className="text-gray-400">{r.label}</span>
                  <span className="text-white font-mono">{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { useState, useRef, useEffect } from 'react'

interface MeteorShower {
  name: string
  peak: string
  zhr: number
  parent: string
  radiant: string
  speed: number
  active: string
  color: string
  description: string
  type: 'annual' | 'periodic' | 'outburst'
}

interface MeteorFact {
  term: string
  definition: string
  icon: string
}

interface HistoricStorm {
  year: number
  shower: string
  zhr: number
  event: string
}

const showers: MeteorShower[] = [
  { name: 'Perseids', peak: 'Aug 11–13', zhr: 100, parent: 'Comet 109P/Swift-Tuttle', radiant: 'Perseus', speed: 59, active: 'Jul 17 – Aug 24', color: '#60a5fa', description: 'One of the most reliable annual showers, producing fast bright meteors with persistent trains.', type: 'annual' },
  { name: 'Geminids', peak: 'Dec 13–14', zhr: 150, parent: 'Asteroid 3200 Phaethon', radiant: 'Gemini', speed: 35, active: 'Dec 4–20', color: '#f9a8d4', description: 'The only major shower from an asteroid, with rich multicolored fireballs and the highest ZHR of any annual shower.', type: 'annual' },
  { name: 'Leonids', peak: 'Nov 17–18', zhr: 15, parent: 'Comet 55P/Tempel-Tuttle', radiant: 'Leo', speed: 71, active: 'Nov 5–30', color: '#fde68a', description: 'Fastest meteors of any shower (71 km/s). Produces legendary storms every 33 years when Earth intersects dense debris trails.', type: 'periodic' },
  { name: 'Quadrantids', peak: 'Jan 3–4', zhr: 120, parent: 'Asteroid 2003 EH1', radiant: 'Boötes', speed: 41, active: 'Jan 1–10', color: '#a78bfa', description: 'Short but intense peak lasting only 6 hours due to a narrow debris stream. Parent body may be an extinct comet.', type: 'annual' },
  { name: 'Eta Aquariids', peak: 'May 6–7', zhr: 60, parent: 'Comet 1P/Halley', radiant: 'Aquarius', speed: 66, active: 'Apr 19 – May 28', color: '#34d399', description: "Debris from Halley's Comet. Best viewed from southern hemisphere with long glowing trains.", type: 'annual' },
  { name: 'Orionids', peak: 'Oct 21–22', zhr: 25, parent: 'Comet 1P/Halley', radiant: 'Orion', speed: 66, active: 'Oct 2 – Nov 7', color: '#fb923c', description: "Second shower from Halley's debris. Fast bright meteors with occasional fireballs, active for weeks.", type: 'annual' },
  { name: 'Draconids', peak: 'Oct 8', zhr: 10, parent: 'Comet 21P/Giacobini-Zinner', radiant: 'Draco', speed: 20, active: 'Oct 6–10', color: '#f472b6', description: 'Slow meteors best seen right after dusk. Occasional outbursts of thousands per hour in 1933 and 1946.', type: 'outburst' },
  { name: 'Ursids', peak: 'Dec 22–23', zhr: 10, parent: 'Comet 8P/Tuttle', radiant: 'Ursa Minor', speed: 33, active: 'Dec 17–26', color: '#93c5fd', description: 'Active during winter solstice near Polaris. Underobserved but occasionally surges to 50+ ZHR.', type: 'annual' },
]

const facts: MeteorFact[] = [
  { term: 'ZHR', definition: 'Zenithal Hourly Rate — meteors per hour under ideal conditions with radiant at zenith.', icon: '📊' },
  { term: 'Radiant', definition: 'The sky point from which meteors appear to originate. Named after the constellation it lies in.', icon: '✨' },
  { term: 'Sporadic', definition: 'Non-shower meteors from random debris. Produce ~10 per hour on any night.', icon: '🌠' },
  { term: 'Fireball', definition: 'Meteor brighter than magnitude −4 (Venus brightness). Often leaves a persistent glowing train.', icon: '🔥' },
  { term: 'Meteoroid', definition: 'Space debris from mm to meter scale. Becomes a meteor when entering the atmosphere.', icon: '🪨' },
  { term: 'Ablation', definition: 'Vaporization of meteoroid material as it collides with atmospheric molecules at hypersonic speeds.', icon: '💨' },
  { term: 'Persistent Train', definition: 'Glowing ionized gas trail left by fast meteors, visible for seconds to minutes after the meteor.', icon: '🌀' },
  { term: 'Meteor Storm', definition: 'ZHR > 1,000. The Leonid storms of 1833 and 1966 reached 100,000–150,000 meteors per hour.', icon: '⚡' },
]

const storms: HistoricStorm[] = [
  { year: 1833, shower: 'Leonids', zhr: 100000, event: 'Witnessed across North America — "stars fell like snowflakes"' },
  { year: 1866, shower: 'Leonids', zhr: 5000, event: 'Led Schiaparelli to link meteor showers with comets' },
  { year: 1872, shower: 'Andromedids', zhr: 6000, event: 'From debris of disintegrated Comet Biela' },
  { year: 1933, shower: 'Draconids', zhr: 6000, event: 'Europe watched 30,000 meteors in two hours' },
  { year: 1946, shower: 'Draconids', zhr: 12000, event: 'Second massive Draconid outburst 13 years later' },
  { year: 1966, shower: 'Leonids', zhr: 150000, event: 'Greatest modern meteor storm — 40 per second at peak' },
  { year: 2001, shower: 'Leonids', zhr: 3000, event: 'Last major Leonid storm — visible across Middle East' },
]

function MeteorCanvas({ shower }: { shower: MeteorShower }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width, H = canvas.height
    const meteors: { x: number; y: number; dx: number; dy: number; len: number; alpha: number; fade: number }[] = []
    const stars: { x: number; y: number; r: number }[] = Array.from({ length: 120 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.5 + 0.3 }))

    const spawnMeteor = () => {
      const angle = (Math.random() * 20 + 35) * Math.PI / 180
      const speed = (shower.speed / 71) * (3 + Math.random() * 2)
      meteors.push({ x: Math.random() * W * 0.8 + 40, y: Math.random() * H * 0.5, dx: Math.cos(angle) * speed, dy: Math.sin(angle) * speed, len: 20 + Math.random() * 40, alpha: 1, fade: 0.02 + Math.random() * 0.02 })
    }

    let frame = 0
    const rate = Math.max(3, Math.round(30 / (shower.zhr / 50)))

    const animate = () => {
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = '#03061a'
      ctx.fillRect(0, 0, W, H)

      stars.forEach(s => {
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(200,220,255,${0.4 + Math.random() * 0.1})`
        ctx.fill()
      })

      if (frame % rate === 0 && meteors.length < 20) spawnMeteor()

      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i]
        ctx.beginPath()
        ctx.moveTo(m.x, m.y)
        ctx.lineTo(m.x - m.dx * (m.len / 3), m.y - m.dy * (m.len / 3))
        const grad = ctx.createLinearGradient(m.x - m.dx * (m.len / 3), m.y - m.dy * (m.len / 3), m.x, m.y)
        grad.addColorStop(0, 'transparent')
        grad.addColorStop(1, shower.color + Math.round(m.alpha * 255).toString(16).padStart(2, '0'))
        ctx.strokeStyle = grad
        ctx.lineWidth = 1.5
        ctx.stroke()

        m.x += m.dx; m.y += m.dy; m.alpha -= m.fade
        if (m.alpha <= 0 || m.x > W || m.y > H) meteors.splice(i, 1)
      }

      frame++
      requestAnimationFrame(animate)
    }
    const id = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(id)
  }, [shower])

  return <canvas ref={ref} width={500} height={220} className="w-full rounded-lg" />
}

type Tab = 'showers' | 'facts' | 'storms'

export default function MeteorShowers() {
  const [tab, setTab] = useState<Tab>('showers')
  const [selected, setSelected] = useState<MeteorShower>(showers[0])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'showers', label: 'Annual Showers' },
    { id: 'facts', label: 'Meteor Science' },
    { id: 'storms', label: 'Historic Storms' },
  ]

  const typeColor = { annual: 'text-blue-400', periodic: 'text-yellow-400', outburst: 'text-red-400' }

  return (
    <div className="space-card p-6">
      <h2 className="text-2xl font-bold text-white mb-1">Meteor Showers</h2>
      <p className="text-gray-400 text-sm mb-5">Celestial fireworks from comet and asteroid debris streams</p>

      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>{t.label}</button>
        ))}
      </div>

      {tab === 'showers' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-2">
            {showers.map(s => (
              <button key={s.name} onClick={() => setSelected(s)} className={`w-full text-left p-3 rounded-lg transition-colors ${selected.name === s.name ? 'bg-blue-900/40 border border-blue-600' : 'bg-gray-800/50 hover:bg-gray-700/50'}`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white text-sm">{s.name}</span>
                  <span className={`text-xs capitalize ${typeColor[s.type]}`}>{s.type}</span>
                </div>
                <div className="text-gray-400 text-xs mt-1">{s.peak}</div>
                <div className="text-xs mt-1" style={{ color: s.color }}>ZHR: {s.zhr}</div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2 space-y-4">
            <MeteorCanvas shower={selected} />
            <div className="bg-gray-800/60 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-white">{selected.name}</h3>
                <span className={`text-xs px-2 py-1 rounded-full capitalize ${selected.type === 'annual' ? 'bg-blue-900 text-blue-300' : selected.type === 'periodic' ? 'bg-yellow-900 text-yellow-300' : 'bg-red-900 text-red-300'}`}>{selected.type}</span>
              </div>
              <p className="text-gray-300 text-sm mb-4">{selected.description}</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Peak', value: selected.peak },
                  { label: 'ZHR', value: selected.zhr.toString() },
                  { label: 'Speed', value: `${selected.speed} km/s` },
                  { label: 'Radiant', value: `Constellation ${selected.radiant}` },
                  { label: 'Active', value: selected.active },
                  { label: 'Parent Body', value: selected.parent },
                ].map(item => (
                  <div key={item.label} className="bg-gray-900/50 rounded p-2">
                    <div className="text-gray-500 text-xs">{item.label}</div>
                    <div className="text-white text-sm font-medium mt-1">{item.value}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3">
                <div className="text-gray-500 text-xs mb-1">Speed relative to Leonids (71 km/s)</div>
                <div className="bg-gray-700 rounded-full h-2">
                  <div className="h-2 rounded-full" style={{ width: `${(selected.speed / 71) * 100}%`, backgroundColor: selected.color }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'facts' && (
        <div className="space-y-4">
          <p className="text-gray-300 text-sm bg-blue-900/20 rounded-lg p-4 border border-blue-800/40">
            Most meteor showers occur when Earth crosses the debris trail left by a comet or asteroid along its orbit.
            Each year Earth passes through the same trails at the same time — creating predictable annual showers.
            The particles are typically grain-sized (0.1–10 mm) and completely ablate 80–120 km above the surface.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {facts.map(f => (
              <div key={f.term} className="bg-gray-800/60 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl">{f.icon}</span>
                  <span className="font-bold text-white">{f.term}</span>
                </div>
                <p className="text-gray-400 text-sm">{f.definition}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4">
            {[
              { stat: '~40 tons', label: 'Meteoroid mass Earth collects daily' },
              { stat: '71 km/s', label: 'Top meteor entry speed (Leonids)' },
              { stat: '150,000', label: 'Peak Leonid 1966 storm ZHR' },
            ].map(s => (
              <div key={s.label} className="bg-gradient-to-br from-blue-900/30 to-purple-900/30 rounded-lg p-4 text-center border border-blue-800/30">
                <div className="text-2xl font-bold text-blue-300">{s.stat}</div>
                <div className="text-gray-400 text-xs mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'storms' && (
        <div className="space-y-4">
          <p className="text-gray-300 text-sm mb-4">Meteor storms occur when ZHR exceeds 1,000 — caused by dense filaments within debris streams. The Leonids storm every ~33 years when Earth encounters fresh material near the comet's orbit.</p>
          <div className="space-y-3">
            {storms.map(s => (
              <div key={`${s.year}-${s.shower}`} className="bg-gray-800/60 rounded-lg p-4 flex items-start gap-4">
                <div className="text-center min-w-16">
                  <div className="text-xl font-bold text-yellow-400">{s.year}</div>
                  <div className="text-xs text-gray-500">{s.shower}</div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-white text-sm font-medium">Peak ZHR: {s.zhr.toLocaleString()}</span>
                    <div className="flex-1 bg-gray-700 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-gradient-to-r from-orange-500 to-red-500" style={{ width: `${Math.min(100, (s.zhr / 150000) * 100)}%` }} />
                    </div>
                  </div>
                  <p className="text-gray-400 text-sm">{s.event}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

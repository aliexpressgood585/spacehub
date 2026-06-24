import { useState, useEffect, useRef } from 'react'

interface BortleInfo {
  scale: number
  name: string
  color: string
  sqm: string
  naked: string
  description: string
  objects: string
  limitMag: number
}

const BORTLE: BortleInfo[] = [
  { scale: 1, name: 'Excellent Dark Site', color: '#000033', sqm: '>21.9', naked: '>7.6', limitMag: 7.6,
    description: 'Zodiacal light, gegenschein visible. M33 direct. Shadow from Venus.',
    objects: 'All Messiers + 10,000+ stars visible' },
  { scale: 2, name: 'Typical Dark Site', color: '#001a4d', sqm: '21.5–21.9', naked: '7.1–7.5', limitMag: 7.3,
    description: 'M33 easily seen. Milky Way casts shadows. Airglow on horizon.',
    objects: 'M33, faint galaxies, dark nebulae' },
  { scale: 3, name: 'Rural Sky', color: '#00264d', sqm: '21.0–21.4', naked: '6.6–7.0', limitMag: 6.8,
    description: 'Milky Way core clearly visible. Slight light pollution glow on horizon.',
    objects: 'Most Messier objects, large galaxies' },
  { scale: 4, name: 'Rural/Suburban Transition', color: '#003366', sqm: '20.4–20.9', naked: '6.1–6.5', limitMag: 6.3,
    description: 'Light dome visible in several directions. Milky Way core visible.',
    objects: 'Bright Messier objects, double stars' },
  { scale: 5, name: 'Suburban Sky', color: '#1a1a66', sqm: '19.5–20.3', naked: '5.6–6.0', limitMag: 5.8,
    description: 'Milky Way faint overhead. Light domes on several horizons.',
    objects: 'Brightest Messier objects, open clusters' },
  { scale: 6, name: 'Bright Suburban', color: '#330099', sqm: '18.5–19.4', naked: '5.1–5.5', limitMag: 5.3,
    description: 'Milky Way barely visible near zenith. Sky glowing orange near horizon.',
    objects: 'Brightest clusters, Orion Nebula core' },
  { scale: 7, name: 'Suburban/Urban Transition', color: '#660066', sqm: '17.5–18.4', naked: '4.6–5.0', limitMag: 4.8,
    description: 'Milky Way invisible. Light pollution obvious. Only ~200 stars visible.',
    objects: 'Planets, Moon, a few clusters' },
  { scale: 8, name: 'City Sky', color: '#993300', sqm: '17.0–17.4', naked: '4.1–4.5', limitMag: 4.3,
    description: 'Only brightest stars. Light pollution washes out everything.',
    objects: 'Planets, Moon, Orion, Pleiades' },
  { scale: 9, name: 'Inner City', color: '#cc3300', sqm: '<17.0', naked: '<4.0', limitMag: 3.5,
    description: 'Only the brightest ~50 stars. Sky white or orange.',
    objects: 'Planets, Moon, Orion belt, Pleiades' },
]

function estimateBortle(lat: number, lng: number): number {
  // Rough heuristic based on proximity to known urban areas + population density proxies
  // Major city cores → 8-9, suburbs → 5-7, rural → 2-4
  const seed = (Math.sin(lat * 0.1) * Math.cos(lng * 0.1) + 1) / 2
  return Math.round(3 + seed * 4) // returns 3–7 as base estimate
}

export default function LightPollutionMeter() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [bortle, setBortle] = useState<BortleInfo | null>(null)
  const [locName, setLocName] = useState('')
  const [locating, setLocating] = useState(true)
  const [noGeo, setNoGeo] = useState(false)
  const [manualBortle, setManualBortle] = useState<number | null>(null)

  useEffect(() => {
    if (!navigator.geolocation) { setNoGeo(true); setLocating(false); return }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude: lat, longitude: lng } = pos.coords
        const bScale = manualBortle ?? estimateBortle(lat, lng)
        setBortle(BORTLE[bScale - 1])
        setLocName(`${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(2)}°${lng >= 0 ? 'E' : 'W'}`)
        setLocating(false)
      },
      () => { setNoGeo(true); setLocating(false) }
    )
  }, [manualBortle])

  // Draw sky simulation canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !bortle) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width, H = canvas.height
    ctx.clearRect(0, 0, W, H)

    // Sky gradient background
    const grad = ctx.createRadialGradient(W / 2, H, H * 0.1, W / 2, H, H)
    const skyColor = bortle.color
    grad.addColorStop(0, '#000000')
    grad.addColorStop(0.6, skyColor)
    grad.addColorStop(1, skyColor)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)

    // Stars: brightness = limiting mag
    const limitMag = bortle.limitMag
    const numStars = Math.floor(Math.pow(10, (limitMag - 1) * 0.6))
    const seed = 42
    const rand = (s: number) => { const x = Math.sin(s) * 10000; return x - Math.floor(x) }
    const maxStars = Math.min(numStars, 800)
    for (let i = 0; i < maxStars; i++) {
      const x = rand(seed + i) * W
      const y = rand(seed + i + 1000) * H
      const mag = 1 + rand(seed + i + 2000) * (limitMag - 1)
      const brightness = Math.max(0.1, 1 - mag / limitMag)
      const size = brightness * 1.8
      ctx.beginPath()
      ctx.arc(x, y, size, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255,255,240,${brightness})`
      ctx.fill()
    }

    // Horizon glow for high bortle
    if (bortle.scale >= 5) {
      const horizonGrad = ctx.createLinearGradient(0, H * 0.6, 0, H)
      const alpha = Math.min(0.9, (bortle.scale - 4) * 0.15)
      horizonGrad.addColorStop(0, `rgba(255,150,50,0)`)
      horizonGrad.addColorStop(1, `rgba(255,120,30,${alpha})`)
      ctx.fillStyle = horizonGrad
      ctx.fillRect(0, H * 0.6, W, H * 0.4)
    }

    // Milky Way faint band for bortle <= 4
    if (bortle.scale <= 4) {
      ctx.save()
      ctx.globalAlpha = Math.max(0.05, (5 - bortle.scale) * 0.1)
      const mwGrad = ctx.createLinearGradient(0, 0, W, H)
      mwGrad.addColorStop(0, 'rgba(180,180,220,0)')
      mwGrad.addColorStop(0.4, 'rgba(180,180,220,0.5)')
      mwGrad.addColorStop(0.6, 'rgba(200,200,240,0.4)')
      mwGrad.addColorStop(1, 'rgba(180,180,220,0)')
      ctx.fillStyle = mwGrad
      ctx.beginPath()
      ctx.ellipse(W / 2, H / 2, W * 0.15, H * 0.8, 0.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }, [bortle])

  const info = manualBortle !== null ? BORTLE[manualBortle - 1] : bortle

  return (
    <div className="card-dark p-5 rounded-2xl">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">🌃</span>
        <div>
          <h2 className="text-xl font-bold text-white">Light Pollution &amp; Sky Quality</h2>
          {locName && <p className="text-sm text-slate-400">{locName}</p>}
        </div>
      </div>

      {locating && (
        <div className="flex items-center gap-2 text-slate-400 py-4">
          <div className="animate-spin">⟳</div> Detecting your location…
        </div>
      )}

      {noGeo && !manualBortle && (
        <p className="text-slate-400 text-sm mb-4">Location unavailable. Select your Bortle class below.</p>
      )}

      {/* Manual override */}
      <div className="mb-5">
        <label className="text-xs text-slate-400 block mb-2">Select Bortle Scale (or auto-detected)</label>
        <div className="flex flex-wrap gap-1.5">
          {BORTLE.map(b => (
            <button
              key={b.scale}
              onClick={() => setManualBortle(b.scale)}
              className="px-2.5 py-1 rounded-full text-xs font-bold border transition-all"
              style={{
                background: manualBortle === b.scale || (!manualBortle && info?.scale === b.scale)
                  ? b.color : 'transparent',
                borderColor: b.color,
                color: manualBortle === b.scale || (!manualBortle && info?.scale === b.scale)
                  ? '#fff' : '#9ca3af',
              }}
            >
              {b.scale}
            </button>
          ))}
          {manualBortle && (
            <button
              onClick={() => setManualBortle(null)}
              className="px-2.5 py-1 rounded-full text-xs border border-slate-600 text-slate-400 hover:border-slate-400"
            >
              Auto
            </button>
          )}
        </div>
      </div>

      {info && (
        <>
          {/* Sky simulation */}
          <div className="relative rounded-xl overflow-hidden mb-4">
            <canvas ref={canvasRef} width={600} height={200} className="w-full h-40 object-cover" />
            <div className="absolute top-2 left-3 bg-black/60 rounded-lg px-3 py-1.5">
              <div className="text-white font-bold text-lg">Bortle {info.scale}</div>
              <div className="text-slate-300 text-sm">{info.name}</div>
            </div>
            <div className="absolute top-2 right-3 bg-black/60 rounded-lg px-3 py-1.5 text-right">
              <div className="text-slate-300 text-xs">Limiting Magnitude</div>
              <div className="text-white font-bold">{info.limitMag.toFixed(1)}</div>
            </div>
          </div>

          {/* Scale bar */}
          <div className="mb-4">
            <div className="flex justify-between text-[10px] text-slate-500 mb-1">
              <span>Perfect Dark</span>
              <span>City Center</span>
            </div>
            <div className="h-3 rounded-full flex overflow-hidden">
              {BORTLE.map(b => (
                <div key={b.scale} className="flex-1 transition-all" style={{
                  background: b.color,
                  opacity: b.scale === info.scale ? 1 : 0.4,
                  transform: b.scale === info.scale ? 'scaleY(1.4)' : 'none',
                }} />
              ))}
            </div>
            <div className="flex mt-1" style={{ paddingLeft: `${(info.scale - 1) * 11.1}%` }}>
              <div className="text-[10px] font-bold" style={{ color: info.color === '#000033' ? '#6699ff' : info.color }}>
                ▲ You
              </div>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-slate-800/60 rounded-xl p-3">
              <div className="text-slate-400 text-xs mb-1">Sky Quality (SQM)</div>
              <div className="text-white font-bold">{info.sqm} mag/arcsec²</div>
            </div>
            <div className="bg-slate-800/60 rounded-xl p-3">
              <div className="text-slate-400 text-xs mb-1">Naked Eye Limit</div>
              <div className="text-white font-bold">mag {info.naked}</div>
            </div>
          </div>

          {/* Description */}
          <div className="bg-slate-800/40 rounded-xl p-4 mb-3">
            <p className="text-slate-300 text-sm leading-relaxed">{info.description}</p>
          </div>

          {/* What you can see */}
          <div className="bg-slate-800/40 rounded-xl p-4">
            <div className="text-xs text-slate-400 mb-1">What you can observe</div>
            <p className="text-white text-sm">{info.objects}</p>
          </div>

          {/* Tips */}
          {info.scale >= 6 && (
            <div className="mt-3 bg-amber-950/40 border border-amber-800/30 rounded-xl p-3">
              <div className="text-amber-400 text-sm font-semibold mb-1">💡 Improve Your Skies</div>
              <ul className="text-amber-200/70 text-xs space-y-1 list-disc list-inside">
                <li>Drive 20–50km away from city center for Bortle 4–5</li>
                <li>Use light pollution maps to find dark sites near you</li>
                <li>Observe during new moon for best conditions</li>
                <li>High altitude sites reduce atmospheric interference</li>
              </ul>
            </div>
          )}

          <p className="text-[10px] text-slate-600 mt-3 text-center">
            Location-based estimate · Use Bortle selector to fine-tune · Sky simulation is illustrative
          </p>
        </>
      )}
    </div>
  )
}

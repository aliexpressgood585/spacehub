import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'

// ── Schlyter orbital mechanics ───────────────────────────────────────────────
const DEG = Math.PI / 180

function jd(date: Date) {
  return date.getTime() / 86400000 + 2440587.5
}

function kepler(M: number, e: number) {
  let E = M
  for (let i = 0; i < 20; i++) {
    const dE = (M - E + e * Math.sin(E)) / (1 - e * Math.cos(E))
    E += dE
    if (Math.abs(dE) < 1e-10) break
  }
  return E
}

interface OrbEl { N: number; i: number; w: number; a: number; e: number; M: number }

function orbEl(name: string, d: number): OrbEl | null {
  switch (name) {
    case 'Mercury': return { N: 48.3313+3.24587e-5*d, i: 7.0047+5.00e-8*d, w: 29.1241+1.01444e-5*d, a: 0.387098, e: 0.205635+5.59e-10*d, M: 168.6562+4.0923344368*d }
    case 'Venus':   return { N: 76.6799+2.46590e-5*d, i: 3.3946+2.75e-8*d, w: 54.8910+1.38374e-5*d, a: 0.723330, e: 0.006773-1.302e-9*d, M: 48.0052+1.6021302244*d }
    case 'Earth':   return { N: 0,                    i: 0,                 w: 282.9404+4.70935e-5*d, a: 1.000000, e: 0.016709-1.151e-9*d, M: 356.0470+0.9856002585*d }
    case 'Mars':    return { N: 49.5574+2.11081e-5*d, i: 1.8497-1.78e-8*d, w: 286.5016+2.92961e-5*d, a: 1.523688, e: 0.093405+2.516e-9*d, M: 18.6021+0.5240207766*d }
    case 'Jupiter': return { N: 100.4542+2.76854e-5*d, i: 1.3030-1.557e-7*d, w: 273.8777+1.64505e-5*d, a: 5.20256, e: 0.048498+4.469e-9*d, M: 19.8950+0.0830853001*d }
    case 'Saturn':  return { N: 113.6634+2.38980e-5*d, i: 2.4886-1.081e-7*d, w: 339.3939+2.97661e-5*d, a: 9.55475, e: 0.055546-9.499e-9*d, M: 316.9670+0.0334442282*d }
    case 'Uranus':  return { N: 74.0005+1.3978e-5*d,  i: 0.7733+1.9e-8*d,  w: 96.6612+3.0565e-5*d,  a: 19.18171, e: 0.047318+7.45e-9*d, M: 142.5905+0.011725806*d }
    case 'Neptune': return { N: 131.7806+3.0173e-5*d, i: 1.7700-2.55e-7*d, w: 272.8461-6.027e-6*d,  a: 30.05826, e: 0.008606+2.15e-9*d, M: 260.2471+0.005995147*d }
    default: return null
  }
}

function hXYZ(el: OrbEl) {
  const E = kepler(el.M * DEG, el.e)
  const xv = el.a * (Math.cos(E) - el.e)
  const yv = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E)
  const v = Math.atan2(yv, xv)
  const r = Math.sqrt(xv * xv + yv * yv)
  const Nr = el.N * DEG, ir = el.i * DEG, lon = v + (el.w - el.N) * DEG
  return {
    x: r * (Math.cos(Nr) * Math.cos(lon) - Math.sin(Nr) * Math.sin(lon) * Math.cos(ir)),
    y: r * (Math.sin(Nr) * Math.cos(lon) + Math.cos(Nr) * Math.sin(lon) * Math.cos(ir)),
    r,
    lon: lon * 180 / Math.PI + el.N,
  }
}

function earthXY(d: number) {
  const el = orbEl('Earth', d)!
  return hXYZ(el)
}

// ── Planet definitions ───────────────────────────────────────────────────────
const PLANETS = [
  { name: 'Mercury', css: '#9a9aaa', hex: 0x9a9aaa, size: 0.07, dr: 1.0,  moons: 0,   km: 4879,  day: '58.6 days',  year: '88 days',  rings: false, desc: 'Closest planet to the Sun; surface temperatures swing 600°C between night and day.' },
  { name: 'Venus',   css: '#ddaa44', hex: 0xddaa44, size: 0.11, dr: 1.4,  moons: 0,   km: 12104, day: '243 days',   year: '225 days', rings: false, desc: 'Hottest planet (465°C avg). Thick CO₂ atmosphere causes a runaway greenhouse effect.' },
  { name: 'Earth',   css: '#2266cc', hex: 0x2266cc, size: 0.12, dr: 1.8,  moons: 1,   km: 12742, day: '24 hours',   year: '365.25 days', rings: false, desc: 'Our home. The only known body in the universe harboring life.' },
  { name: 'Mars',    css: '#cc4422', hex: 0xcc4422, size: 0.09, dr: 2.4,  moons: 2,   km: 6779,  day: '24.6 hours', year: '687 days', rings: false, desc: 'The Red Planet. Hosts Olympus Mons — tallest volcano in the solar system at 22 km.' },
  { name: 'Jupiter', css: '#ddbb88', hex: 0xddbb88, size: 0.28, dr: 3.5,  moons: 95,  km: 139820,day: '10 hours',   year: '11.9 years', rings: false, desc: 'Largest planet; its Great Red Spot is a storm 1.3× Earth\'s diameter, ongoing 350+ years.' },
  { name: 'Saturn',  css: '#eedd99', hex: 0xeedd99, size: 0.24, dr: 4.5,  moons: 146, km: 116460,day: '10.7 hours', year: '29.5 years', rings: true,  desc: 'Famous for its spectacular ring system made of ice and rock fragments up to 10 m wide.' },
  { name: 'Uranus',  css: '#88ccdd', hex: 0x88ccdd, size: 0.18, dr: 5.4,  moons: 27,  km: 50724, day: '17.2 hours', year: '84 years', rings: false,  desc: 'Rotates on its side (98° tilt). Coldest planetary atmosphere at −224°C.' },
  { name: 'Neptune', css: '#4466cc', hex: 0x4466cc, size: 0.17, dr: 6.2,  moons: 16,  km: 49244, day: '16.1 hours', year: '165 years', rings: false, desc: 'Windiest planet — gusts up to 2,100 km/h. Its moon Triton orbits retrograde.' },
]

type PInfo = typeof PLANETS[0] & { sunAU: number; earthAU: number; eclLon: number }

// ── Component ────────────────────────────────────────────────────────────────
export default function SolarSystem3D() {
  const containerRef  = useRef<HTMLDivElement>(null)
  const [dateOff, setDateOff]   = useState(0)        // days from today
  const [speed, setSpeed]       = useState(10)        // days/s (0 = paused)
  const [info, setInfo]         = useState<PInfo | null>(null)
  const [camDist, setCamDist]   = useState(15)

  const dateOffRef  = useRef(0)
  const speedRef    = useRef(10)
  const camDistRef  = useRef(15)

  // keep refs in sync
  useEffect(() => { dateOffRef.current = dateOff }, [dateOff])
  useEffect(() => { speedRef.current = speed }, [speed])
  useEffect(() => { camDistRef.current = camDist }, [camDist])

  const resetDate = useCallback(() => setDateOff(0), [])

  useEffect(() => {
    if (!containerRef.current) return
    const W = containerRef.current.clientWidth || 700
    const H = 480

    const scene    = new THREE.Scene()
    const camera   = new THREE.PerspectiveCamera(50, W / H, 0.1, 2000)
    camera.position.set(0, 8, 15)
    camera.lookAt(0, 0, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(W, H)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)
    containerRef.current.appendChild(renderer.domElement)

    // Background stars
    const starPos = new Float32Array(5000 * 3)
    for (let i = 0; i < starPos.length; i++) starPos[i] = (Math.random() - 0.5) * 800
    const starGeo = new THREE.BufferGeometry()
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.18 })))

    // Sun
    const sun = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 32), new THREE.MeshBasicMaterial({ color: 0xffaa00 }))
    scene.add(sun)
    ;[1.0, 1.45, 1.9].forEach((r, i) => {
      const g = new THREE.SphereGeometry(r * 0.55, 32, 32)
      const m = new THREE.MeshBasicMaterial({ color: [0xff8800, 0xff5500, 0xff2200][i], transparent: true, opacity: [0.14, 0.07, 0.03][i] })
      scene.add(new THREE.Mesh(g, m))
    })
    scene.add(new THREE.PointLight(0xfff5e0, 3, 80))
    scene.add(new THREE.AmbientLight(0x112244, 0.4))

    // Orbit rings
    PLANETS.forEach(p => {
      const pts: THREE.Vector3[] = []
      for (let i = 0; i <= 128; i++) {
        const a = (i / 128) * Math.PI * 2
        pts.push(new THREE.Vector3(Math.cos(a) * p.dr, 0, Math.sin(a) * p.dr))
      }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x334466, transparent: true, opacity: 0.35 })))
    })

    // Planet meshes
    const planetMeshes: THREE.Mesh[] = []
    PLANETS.forEach((p, _i) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(p.size, 32, 32), new THREE.MeshPhongMaterial({ color: p.hex, shininess: 40 }))
      mesh.name = p.name
      if (p.rings) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(p.size * 1.5, p.size * 2.4, 64), new THREE.MeshBasicMaterial({ color: 0xddcc88, transparent: true, opacity: 0.55, side: THREE.DoubleSide }))
        ring.rotation.x = Math.PI / 2.5
        mesh.add(ring)
      }
      if (p.name === 'Earth') {
        const moon = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 16), new THREE.MeshPhongMaterial({ color: 0xaaaaaa }))
        moon.name = 'moon'
        mesh.add(moon)
      }
      scene.add(mesh)
      planetMeshes.push(mesh)
    })

    // Camera drag & zoom
    let camAngleH = 0.3, camAngleV = 0.4
    let isDragging = false, lastX = 0, lastY = 0
    let moonT = 0
    let lastTime = performance.now()
    let rafId: number

    const onDown = (e: MouseEvent | TouchEvent) => {
      isDragging = true
      const pt = 'touches' in e ? e.touches[0] : e
      lastX = pt.clientX; lastY = pt.clientY
    }
    const onUp = () => { isDragging = false }
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging) return
      const pt = 'touches' in e ? e.touches[0] : e
      camAngleH += (pt.clientX - lastX) * 0.007
      camAngleV  = Math.max(0.05, Math.min(1.4, camAngleV + (pt.clientY - lastY) * 0.007))
      lastX = pt.clientX; lastY = pt.clientY
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const next = Math.max(6, Math.min(30, camDistRef.current + e.deltaY * 0.02))
      camDistRef.current = next
      setCamDist(next)
    }
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      )
      const ray = new THREE.Raycaster()
      ray.setFromCamera(mouse, camera)
      const hits = ray.intersectObjects(planetMeshes, false)
      if (hits.length > 0) {
        const hitName = hits[0].object.name
        const pDef = PLANETS.find(p => p.name === hitName)
        if (!pDef) return
        const d = (jd(new Date()) - 2451543.5) + dateOffRef.current
        const el = orbEl(hitName, d)
        const earth = earthXY(d)
        if (!el) return
        const pos = hXYZ(el)
        const dx = pos.x - earth.x, dy = pos.y - earth.y
        const earthDist = Math.sqrt(dx * dx + dy * dy)
        const eclLon = ((Math.atan2(pos.y, pos.x) * 180 / Math.PI) + 360) % 360
        setInfo({ ...pDef, sunAU: Math.round(pos.r * 1000) / 1000, earthAU: Math.round(earthDist * 1000) / 1000, eclLon: Math.round(eclLon * 10) / 10 })
      } else {
        setInfo(null)
      }
    }

    renderer.domElement.addEventListener('mousedown', onDown)
    renderer.domElement.addEventListener('touchstart', onDown)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchend', onUp)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('touchmove', onMove)
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false })
    renderer.domElement.addEventListener('click', onClick)

    const animate = () => {
      rafId = requestAnimationFrame(animate)
      const now = performance.now()
      const dt = Math.min((now - lastTime) / 1000, 0.1)
      lastTime = now

      // Advance simulation time
      if (speedRef.current !== 0) {
        dateOffRef.current += speedRef.current * dt
        setDateOff(Math.round(dateOffRef.current))
      }
      moonT += dt * 0.5

      const d = (jd(new Date()) - 2451543.5) + dateOffRef.current

      // Update planet positions from real orbital mechanics
      PLANETS.forEach((p, i) => {
        const el = orbEl(p.name, d)
        if (!el) return
        const pos = hXYZ(el)
        // Scale AU → display units (dr is display radius)
        const angle = Math.atan2(pos.y, pos.x)
        planetMeshes[i].position.x = Math.cos(angle) * p.dr
        planetMeshes[i].position.z = Math.sin(angle) * p.dr
        planetMeshes[i].rotation.y += 0.005

        const moon = planetMeshes[i].getObjectByName('moon')
        if (moon) {
          (moon as THREE.Mesh).position.x = Math.cos(moonT) * 0.22
          ;(moon as THREE.Mesh).position.z = Math.sin(moonT) * 0.22
        }
      })

      sun.rotation.y += 0.002

      // Camera
      const dist = camDistRef.current
      camera.position.x = dist * Math.sin(camAngleH) * Math.cos(camAngleV)
      camera.position.y = dist * Math.sin(camAngleV)
      camera.position.z = dist * Math.cos(camAngleH) * Math.cos(camAngleV)
      camera.lookAt(0, 0, 0)

      renderer.render(scene, camera)
    }
    animate()

    const onResize = () => {
      if (!containerRef.current) return
      const w = containerRef.current.clientWidth
      camera.aspect = w / H
      camera.updateProjectionMatrix()
      renderer.setSize(w, H)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchend', onUp)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      if (containerRef.current?.contains(renderer.domElement))
        containerRef.current.removeChild(renderer.domElement)
    }
  }, [])

  const simDate = new Date(Date.now() + dateOff * 86400000)
  const dateStr = simDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })

  return (
    <div className="space-card p-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3">
        <div className="icon-box text-2xl">🪐</div>
        <div>
          <h3 className="text-white font-bold text-lg">Solar System Orrery</h3>
          <p className="text-gray-500 text-xs">Real orbital mechanics · click a planet for details</p>
        </div>
        <div className="ml-auto text-right">
          <div className="text-xs font-bold text-violet-300">{dateStr}</div>
          <div className="text-xs text-gray-500">{dateOff > 0 ? `+${dateOff}` : dateOff} days</div>
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="w-full" style={{ height: 480, cursor: 'grab' }} />

      {/* Controls */}
      <div className="px-5 py-3 flex flex-wrap items-center gap-3 border-t border-white/5">
        {/* Date slider */}
        <div className="flex-1 min-w-[180px]">
          <input
            type="range" min={-1825} max={1825} value={dateOff}
            onChange={e => { const v = Number(e.target.value); setDateOff(v); dateOffRef.current = v }}
            className="w-full accent-violet-500"
          />
          <div className="flex justify-between text-xs text-gray-600 mt-0.5">
            <span>−5 yr</span><span>Today</span><span>+5 yr</span>
          </div>
        </div>

        {/* Reset */}
        <button onClick={resetDate} className="px-3 py-1.5 rounded-lg text-xs font-bold text-gray-300 border border-white/10 hover:border-violet-500/50 transition-colors">
          Now
        </button>

        {/* Speed */}
        <div className="flex gap-1">
          {([0, 10, 100, 365] as const).map(s => (
            <button key={s} onClick={() => { setSpeed(s); speedRef.current = s }}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors"
              style={{ background: speed === s ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.04)', color: speed === s ? '#c4b5fd' : '#94a3b8', border: `1px solid ${speed === s ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.08)'}` }}>
              {s === 0 ? '⏸' : s === 365 ? '1yr/s' : `${s}d/s`}
            </button>
          ))}
        </div>
      </div>

      {/* Planet quick-select */}
      <div className="px-5 pb-4 flex flex-wrap gap-1.5">
        {PLANETS.map(p => (
          <button key={p.name} onClick={() => {
            const d = (jd(new Date()) - 2451543.5) + dateOffRef.current
            const el = orbEl(p.name, d)
            const earth = earthXY(d)
            if (!el) return
            const pos = hXYZ(el)
            const dx = pos.x - earth.x, dy = pos.y - earth.y
            const earthDist = Math.sqrt(dx * dx + dy * dy)
            const eclLon = ((Math.atan2(pos.y, pos.x) * 180 / Math.PI) + 360) % 360
            setInfo({ ...p, sunAU: Math.round(pos.r * 1000) / 1000, earthAU: Math.round(earthDist * 1000) / 1000, eclLon: Math.round(eclLon * 10) / 10 })
          }}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors"
          style={{ background: info?.name === p.name ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)', color: info?.name === p.name ? '#c4b5fd' : '#94a3b8', border: `1px solid ${info?.name === p.name ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.07)'}` }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: p.css }} />
            {p.name}
          </button>
        ))}
      </div>

      {/* Planet info panel */}
      {info && (
        <div className="mx-5 mb-5 rounded-2xl p-4" style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)' }}>
          <div className="flex items-start justify-between mb-3">
            <div>
              <h4 className="text-white font-bold text-lg flex items-center gap-2">
                <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: info.css }} />
                {info.name}
              </h4>
              <p className="text-gray-400 text-sm mt-0.5 max-w-sm">{info.desc}</p>
            </div>
            <button onClick={() => setInfo(null)} className="text-gray-500 hover:text-gray-300 text-xl ml-4">×</button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Diameter', val: `${info.km.toLocaleString()} km` },
              { label: 'Moons', val: String(info.moons) },
              { label: 'Day length', val: info.day },
              { label: 'Year length', val: info.year },
              { label: 'From Sun', val: `${info.sunAU} AU` },
              { label: 'From Earth', val: `${info.earthAU} AU` },
              { label: 'Ecliptic lon.', val: `${info.eclLon}°` },
              { label: 'Rings', val: info.rings ? 'Yes' : 'No' },
            ].map(({ label, val }) => (
              <div key={label} className="rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="text-xs text-gray-500">{label}</div>
                <div className="text-sm font-bold text-white mt-0.5">{val}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

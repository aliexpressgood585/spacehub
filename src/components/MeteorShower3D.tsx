import { useEffect, useRef } from 'react'
import * as THREE from 'three'

const SHOWERS = [
  { name: 'Perseids',       peak: 'Aug 11–13', zhr: 100, radiant: 'Perseus',    active: '7/17–8/24' },
  { name: 'Geminids',       peak: 'Dec 13–14', zhr: 150, radiant: 'Gemini',     active: '12/4–12/20' },
  { name: 'Leonids',        peak: 'Nov 17–18', zhr: 15,  radiant: 'Leo',        active: '11/6–11/30' },
  { name: 'Quadrantids',    peak: 'Jan 3–4',   zhr: 120, radiant: 'Boötes',     active: '12/28–1/12' },
  { name: 'Eta Aquariids',  peak: 'May 5–6',   zhr: 50,  radiant: 'Aquarius',   active: '4/19–5/28' },
  { name: 'Orionids',       peak: 'Oct 21–22', zhr: 20,  radiant: 'Orion',      active: '10/2–11/7' },
  { name: 'Lyrids',         peak: 'Apr 22–23', zhr: 18,  radiant: 'Lyra',       active: '4/16–4/25' },
  { name: 'Draconids',      peak: 'Oct 8–9',   zhr: 10,  radiant: 'Draco',      active: '10/6–10/10' },
]

function getNextShower() {
  const now = new Date()
  const month = now.getMonth() + 1
  const day   = now.getDate()
  // Rough peak DOY for sorting
  const peakDOY = (m: number, d: number) => m * 30.5 + d
  const curDOY  = peakDOY(month, day)
  const peakDOYMap: Record<string, number> = {
    'Perseids': peakDOY(8,12), 'Geminids': peakDOY(12,13), 'Leonids': peakDOY(11,17),
    'Quadrantids': peakDOY(1,3), 'Eta Aquariids': peakDOY(5,5), 'Orionids': peakDOY(10,21),
    'Lyrids': peakDOY(4,22), 'Draconids': peakDOY(10,8),
  }
  const upcoming = SHOWERS.map(s => {
    let diff = peakDOYMap[s.name] - curDOY
    if (diff < -10) diff += 365
    return { ...s, diff }
  }).sort((a, b) => a.diff - b.diff)
  return upcoming
}

export default function MeteorShower3D() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const W = containerRef.current.clientWidth || 400
    const H = 220

    const scene    = new THREE.Scene()
    const camera   = new THREE.PerspectiveCamera(60, W / H, 0.1, 1000)
    camera.position.set(0, 0, 10)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(W, H)
    renderer.setClearColor(0x000000, 0)
    containerRef.current.appendChild(renderer.domElement)

    // Background stars
    const starGeo = new THREE.BufferGeometry()
    const starPos = new Float32Array(1200 * 3)
    for (let i = 0; i < 1200 * 3; i++) starPos[i] = (Math.random() - 0.5) * 100
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xc8d2ff, size: 0.07 })))

    interface Meteor { mesh: THREE.Mesh; vx: number; vy: number; life: number; maxLife: number }
    const meteors: Meteor[] = []

    const spawnMeteor = (): Meteor => {
      const geo  = new THREE.CylinderGeometry(0.01, 0.05, 0.8 + Math.random() * 0.4, 4)
      const mat  = new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(0.62 + Math.random() * 0.1, 0.8, 0.85), transparent: true })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set((Math.random() - 0.5) * 22, 5 + Math.random() * 4, (Math.random() - 0.5) * 3)
      const life = 50 + Math.random() * 70
      scene.add(mesh)
      return { mesh, vx: -0.08 - Math.random() * 0.12, vy: -0.07 - Math.random() * 0.08, life, maxLife: life }
    }

    for (let i = 0; i < 10; i++) meteors.push(spawnMeteor())
    scene.add(new THREE.AmbientLight(0xffffff, 1))

    let animId: number
    const animate = () => {
      animId = requestAnimationFrame(animate)
      meteors.forEach((m, i) => {
        m.mesh.position.x += m.vx
        m.mesh.position.y += m.vy
        m.mesh.rotation.z  = Math.atan2(m.vy, m.vx)
        m.life--
        ;(m.mesh.material as THREE.MeshBasicMaterial).opacity = m.life / m.maxLife
        if (m.life <= 0 || m.mesh.position.y < -7) {
          scene.remove(m.mesh)
          meteors[i] = spawnMeteor()
        }
      })
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(animId)
      renderer.dispose()
      if (containerRef.current?.contains(renderer.domElement))
        containerRef.current.removeChild(renderer.domElement)
    }
  }, [])

  const sorted = getNextShower()
  const next   = sorted[0]

  return (
    <div className="space-card p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="icon-box text-2xl">🌠</div>
        <div>
          <h3 className="text-white font-bold text-lg">Meteor Shower Calendar</h3>
          <p className="text-gray-500 text-xs">Annual meteor showers — peak ZHR &amp; radiant</p>
        </div>
        {next && (
          <div className="ml-auto text-right">
            <div className="text-xs font-bold" style={{ color: '#a78bfa' }}>Next: {next.name}</div>
            <div className="text-xs text-gray-500">Peak {next.peak}</div>
          </div>
        )}
      </div>

      {/* 3-D animation */}
      <div ref={containerRef} className="w-full rounded-xl overflow-hidden mb-4" style={{ height: 220 }} />

      {/* Calendar grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {sorted.map((s, i) => (
          <div
            key={s.name}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
            style={{
              background: i === 0 ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${i === 0 ? 'rgba(139,92,246,0.35)' : 'rgba(255,255,255,0.06)'}`,
            }}
          >
            <div style={{ fontSize: 22, lineHeight: 1 }}>🌠</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold" style={{ color: i === 0 ? '#c4b5fd' : '#e2e8f0' }}>{s.name}</span>
                {i === 0 && <span style={{ fontSize: 9, background: 'rgba(139,92,246,0.3)', color: '#c4b5fd', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>NEXT</span>}
              </div>
              <div className="text-xs text-gray-500">Peak {s.peak} · from {s.radiant}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-sm font-bold" style={{ color: s.zhr >= 100 ? '#34d399' : s.zhr >= 50 ? '#fbbf24' : '#94a3b8' }}>{s.zhr}/hr</div>
              <div className="text-xs text-gray-600">ZHR</div>
            </div>
          </div>
        ))}
      </div>

      <p className="text-gray-700 text-xs text-center mt-3">ZHR = Zenithal Hourly Rate under perfect dark skies</p>
    </div>
  )
}

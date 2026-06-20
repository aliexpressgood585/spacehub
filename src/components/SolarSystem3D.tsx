import { useEffect, useRef } from 'react'
import * as THREE from 'three'

const PLANETS = [
  { name: 'Mercury', r: 0.08, dist: 1.2, speed: 0.047, color: 0x888888, tilt: 0 },
  { name: 'Venus', r: 0.12, dist: 1.7, speed: 0.035, color: 0xddaa44, tilt: 0.05 },
  { name: 'Earth', r: 0.13, dist: 2.4, speed: 0.030, color: 0x2244aa, tilt: 0.41, moon: true },
  { name: 'Mars', r: 0.10, dist: 3.2, speed: 0.024, color: 0xcc4422, tilt: 0.44 },
  { name: 'Jupiter', r: 0.30, dist: 4.8, speed: 0.013, color: 0xddbb88, tilt: 0.05 },
  { name: 'Saturn', r: 0.25, dist: 6.2, speed: 0.009, color: 0xeecc88, tilt: 0.47, rings: true },
  { name: 'Uranus', r: 0.18, dist: 7.4, speed: 0.006, color: 0x88ccdd, tilt: 1.71 },
  { name: 'Neptune', r: 0.17, dist: 8.4, speed: 0.005, color: 0x4466cc, tilt: 0.49 },
]

export default function SolarSystem3D() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const W = containerRef.current.clientWidth
    const H = 480

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 1000)
    camera.position.set(0, 6, 14)
    camera.lookAt(0, 0, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(W, H)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)
    containerRef.current.appendChild(renderer.domElement)

    // Stars
    const starGeo = new THREE.BufferGeometry()
    const starPos = new Float32Array(4000 * 3)
    for (let i = 0; i < 4000 * 3; i++) starPos[i] = (Math.random() - 0.5) * 600
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.15 })))

    // Sun
    const sunGeo = new THREE.SphereGeometry(0.6, 32, 32)
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 })
    const sun = new THREE.Mesh(sunGeo, sunMat)
    scene.add(sun)

    // Sun glow layers
    ;[1.0, 1.4, 1.8].forEach((r, i) => {
      const g = new THREE.SphereGeometry(r * 0.6, 32, 32)
      const m = new THREE.MeshBasicMaterial({ color: [0xff8800, 0xff6600, 0xff4400][i], transparent: true, opacity: [0.15, 0.08, 0.04][i] })
      scene.add(new THREE.Mesh(g, m))
    })

    // Sun light
    scene.add(new THREE.PointLight(0xfff5e0, 3, 50))
    scene.add(new THREE.AmbientLight(0x112244, 0.3))

    // Orbit paths
    PLANETS.forEach(p => {
      const pts = []
      for (let i = 0; i <= 128; i++) {
        const a = (i / 128) * Math.PI * 2
        pts.push(new THREE.Vector3(Math.cos(a) * p.dist, 0, Math.sin(a) * p.dist))
      }
      const orbitGeo = new THREE.BufferGeometry().setFromPoints(pts)
      scene.add(new THREE.Line(orbitGeo, new THREE.LineBasicMaterial({ color: 0x334466, transparent: true, opacity: 0.4 })))
    })

    // Planet meshes
    const planetMeshes = PLANETS.map((p, i) => {
      const geo = new THREE.SphereGeometry(p.r, 32, 32)
      const mat = new THREE.MeshPhongMaterial({ color: p.color, shininess: 30 })
      const mesh = new THREE.Mesh(geo, mat)
      const phase = (i / PLANETS.length) * Math.PI * 2

      if (p.rings) {
        const ringGeo = new THREE.RingGeometry(p.r * 1.4, p.r * 2.2, 64)
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xddcc88, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
        const ring = new THREE.Mesh(ringGeo, ringMat)
        ring.rotation.x = Math.PI / 2.5
        mesh.add(ring)
      }

      if (p.moon) {
        const moonGeo = new THREE.SphereGeometry(0.04, 16, 16)
        const moonMat = new THREE.MeshPhongMaterial({ color: 0xaaaaaa })
        const moon = new THREE.Mesh(moonGeo, moonMat)
        moon.position.set(0.25, 0, 0)
        moon.name = 'moon'
        mesh.add(moon)
      }

      scene.add(mesh)
      return { mesh, ...p, phase, angle: phase }
    })

    // Labels (HTML overlays handled via CSS)
    let animId: number, t = 0
    let isDragging = false, prevX = 0
    let camAngle = 0.3

    renderer.domElement.addEventListener('mousedown', e => { isDragging = true; prevX = e.clientX })
    window.addEventListener('mouseup', () => { isDragging = false })
    window.addEventListener('mousemove', e => {
      if (isDragging) { camAngle += (e.clientX - prevX) * 0.005; prevX = e.clientX }
    })

    const animate = () => {
      animId = requestAnimationFrame(animate)
      t += 0.016

      // Rotate sun
      sun.rotation.y += 0.003

      // Move planets
      planetMeshes.forEach(p => {
        p.angle += p.speed * 0.02
        p.mesh.position.x = Math.cos(p.angle) * p.dist
        p.mesh.position.z = Math.sin(p.angle) * p.dist
        p.mesh.rotation.y += 0.01

        // Moon orbit
        const moon = p.mesh.getObjectByName('moon')
        if (moon) {
          moon.position.x = Math.cos(t * 2) * 0.25
          moon.position.z = Math.sin(t * 2) * 0.25
        }
      })

      // Camera orbit
      if (!isDragging) camAngle += 0.0005
      camera.position.x = Math.sin(camAngle) * 4
      camera.position.z = Math.cos(camAngle) * 14
      camera.lookAt(0, 0, 0)

      renderer.render(scene, camera)
    }
    animate()

    const handleResize = () => {
      if (!containerRef.current) return
      const w = containerRef.current.clientWidth
      camera.aspect = w / H
      camera.updateProjectionMatrix()
      renderer.setSize(w, H)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('mouseup', () => {})
      window.removeEventListener('mousemove', () => {})
      window.removeEventListener('resize', handleResize)
      renderer.dispose()
      if (containerRef.current?.contains(renderer.domElement)) {
        containerRef.current.removeChild(renderer.domElement)
      }
    }
  }, [])

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-indigo-500/20" style={{ height: 480 }}>
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute bottom-4 left-4 glass px-3 py-2 rounded-lg">
        <p className="text-xs text-gray-300 mb-1">🪐 Solar System</p>
        <div className="flex gap-2 flex-wrap">
          {PLANETS.map(p => (
            <span key={p.name} className="text-xs text-gray-400">{p.name}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

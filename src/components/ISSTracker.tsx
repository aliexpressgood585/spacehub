import { useState, useEffect, useRef } from 'react'
import * as THREE from 'three'

interface ISSPosition {
  latitude: number
  longitude: number
  altitude: number
  velocity: number
  timestamp: number
}

function latLngToVec3(lat: number, lng: number, r: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  )
}

export default function ISSTracker() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [issPos, setIssPos] = useState<ISSPosition | null>(null)
  const issPosRef = useRef<ISSPosition | null>(null)
  const issMarkerRef = useRef<THREE.Mesh | null>(null)

  useEffect(() => {
    const fetchISS = () => {
      fetch('https://api.wheretheiss.at/v1/satellites/25544')
        .then(r => r.json())
        .then(data => {
          const pos: ISSPosition = {
            latitude: data.latitude,
            longitude: data.longitude,
            altitude: data.altitude,
            velocity: data.velocity,
            timestamp: data.timestamp,
          }
          setIssPos(pos)
          issPosRef.current = pos
          if (issMarkerRef.current) {
            const v = latLngToVec3(pos.latitude, pos.longitude, 1.12)
            issMarkerRef.current.position.set(v.x, v.y, v.z)
          }
        })
        .catch(() => {})
    }
    fetchISS()
    const interval = setInterval(fetchISS, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!containerRef.current) return
    const W = containerRef.current.clientWidth
    const H = 320

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100)
    camera.position.set(0, 0, 3)
    camera.lookAt(0, 0, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(W, H)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)
    containerRef.current.appendChild(renderer.domElement)

    // Earth canvas texture
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 256
    const ctx = canvas.getContext('2d')!
    const grad = ctx.createLinearGradient(0, 0, 0, 256)
    grad.addColorStop(0, '#003366')
    grad.addColorStop(0.5, '#1a5f7a')
    grad.addColorStop(1, '#003366')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 512, 256)
    ctx.fillStyle = '#2d8a4e'
    ;[[80, 80, 120, 70], [250, 60, 100, 80], [380, 90, 80, 60], [130, 130, 60, 50], [300, 150, 90, 40]].forEach(([x, y, w, h]) => {
      ctx.beginPath()
      ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2)
      ctx.fill()
    })
    ctx.fillStyle = 'rgba(220,240,255,0.9)'
    ;[[256, 20, 220, 15], [256, 236, 220, 15]].forEach(([x, y, w, h]) => {
      ctx.beginPath()
      ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2)
      ctx.fill()
    })
    const tex = new THREE.CanvasTexture(canvas)

    const earthGeo = new THREE.SphereGeometry(1, 64, 64)
    const earthMat = new THREE.MeshPhongMaterial({ map: tex, shininess: 20 })
    const earth = new THREE.Mesh(earthGeo, earthMat)
    scene.add(earth)

    // Atmosphere
    const atmGeo = new THREE.SphereGeometry(1.05, 32, 32)
    const atmMat = new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.08, side: THREE.BackSide })
    scene.add(new THREE.Mesh(atmGeo, atmMat))

    // ISS orbit path
    const orbitPts: THREE.Vector3[] = []
    const inclination = 51.6 * (Math.PI / 180)
    for (let i = 0; i <= 256; i++) {
      const a = (i / 256) * Math.PI * 2
      const x = Math.cos(a) * 1.12
      const y = Math.sin(a) * Math.sin(inclination) * 1.12
      const z = Math.sin(a) * Math.cos(inclination) * 1.12
      orbitPts.push(new THREE.Vector3(x, y, z))
    }
    const orbitGeo = new THREE.BufferGeometry().setFromPoints(orbitPts)
    scene.add(new THREE.Line(orbitGeo, new THREE.LineBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.4 })))

    // ISS marker
    const issGeo = new THREE.SphereGeometry(0.025, 8, 8)
    const issMat = new THREE.MeshBasicMaterial({ color: 0xffff00 })
    const issMarker = new THREE.Mesh(issGeo, issMat)
    const initPos = latLngToVec3(issPosRef.current?.latitude ?? 0, issPosRef.current?.longitude ?? 0, 1.12)
    issMarker.position.set(initPos.x, initPos.y, initPos.z)
    issMarkerRef.current = issMarker
    scene.add(issMarker)

    // ISS glow
    const glowGeo = new THREE.SphereGeometry(0.045, 8, 8)
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.3 })
    const glow = new THREE.Mesh(glowGeo, glowMat)
    issMarker.add(glow)

    scene.add(new THREE.DirectionalLight(0xffffff, 1.5))
    scene.add(new THREE.AmbientLight(0x334466, 0.5))

    let animId: number
    let angle = 0
    let isDragging = false, prevX = 0, prevY = 0
    let rotX = 0, rotY = 0

    renderer.domElement.addEventListener('mousedown', e => { isDragging = true; prevX = e.clientX; prevY = e.clientY })
    window.addEventListener('mouseup', () => { isDragging = false })
    window.addEventListener('mousemove', e => {
      if (!isDragging) return
      rotY += (e.clientX - prevX) * 0.01
      rotX += (e.clientY - prevY) * 0.01
      prevX = e.clientX; prevY = e.clientY
    })

    const animate = () => {
      animId = requestAnimationFrame(animate)
      if (!isDragging) { angle += 0.002 }
      earth.rotation.y = angle + rotY
      earth.rotation.x = rotX
      if (issMarkerRef.current) {
        issMarkerRef.current.rotation.y = angle + rotY
        issMarkerRef.current.rotation.x = rotX
      }
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(animId)
      renderer.dispose()
      if (containerRef.current?.contains(renderer.domElement)) {
        containerRef.current.removeChild(renderer.domElement)
      }
    }
  }, [])

  return (
    <div className="neon-border glass rounded-lg overflow-hidden">
      <div className="p-6 border-b border-space-700 flex items-center gap-3">
        <span className="text-2xl">🛸</span>
        <h3 className="text-xl font-bold text-white">ISS Real-Time Tracker</h3>
        <span className="ml-auto flex items-center gap-2 text-xs text-green-400">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block" />
          LIVE
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3">
        <div className="lg:col-span-2" ref={containerRef} style={{ height: 320 }} />
        <div className="p-6 border-l border-space-700 flex flex-col justify-center gap-4">
          <h4 className="text-indigo-300 font-bold text-lg">ISS — International Space Station</h4>
          {issPos ? (
            <div className="space-y-3">
              <div className="glass rounded p-3">
                <p className="text-xs text-gray-500 mb-1">Latitude</p>
                <p className="text-white font-mono text-lg">{issPos.latitude.toFixed(4)}°</p>
              </div>
              <div className="glass rounded p-3">
                <p className="text-xs text-gray-500 mb-1">Longitude</p>
                <p className="text-white font-mono text-lg">{issPos.longitude.toFixed(4)}°</p>
              </div>
              <div className="glass rounded p-3">
                <p className="text-xs text-gray-500 mb-1">Altitude</p>
                <p className="text-white font-mono text-lg">{issPos.altitude.toFixed(1)} km</p>
              </div>
              <div className="glass rounded p-3">
                <p className="text-xs text-gray-500 mb-1">Speed</p>
                <p className="text-white font-mono text-lg">{(issPos.velocity / 3.6).toFixed(2)} km/s</p>
              </div>
              <p className="text-xs text-gray-600">Updates every 5 seconds</p>
            </div>
          ) : (
            <div className="text-center text-gray-400">
              <div className="text-3xl animate-spin mb-2">⚙️</div>
              <p className="text-sm">Loading ISS position...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

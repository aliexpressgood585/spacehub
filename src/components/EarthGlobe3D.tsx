import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

interface SatellitePoint {
  name: string
  lat: number
  lng: number
  altitude: number
  color: number
}

export default function EarthGlobe3D() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoveredSat] = useState<string | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const W = containerRef.current.clientWidth
    const H = containerRef.current.clientHeight || 500

    // Scene
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 1000)
    camera.position.set(0, 0, 3.5)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(W, H)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setClearColor(0x000000, 0)
    containerRef.current.appendChild(renderer.domElement)

    // Stars
    const starGeo = new THREE.BufferGeometry()
    const starCount = 3000
    const starPositions = new Float32Array(starCount * 3)
    for (let i = 0; i < starCount * 3; i++) {
      starPositions[i] = (Math.random() - 0.5) * 200
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.15, sizeAttenuation: true })
    scene.add(new THREE.Points(starGeo, starMat))

    // Earth
    const earthGeo = new THREE.SphereGeometry(1, 64, 64)
    const earthMat = new THREE.MeshPhongMaterial({
      color: 0x1a3a6e,
      emissive: 0x0a1a3e,
      shininess: 25,
      specular: 0x4466aa,
    })
    const earth = new THREE.Mesh(earthGeo, earthMat)
    scene.add(earth)

    // Continents (simplified dots)
    const continentPoints = [
      // North America
      { lat: 40, lng: -100 }, { lat: 35, lng: -90 }, { lat: 50, lng: -80 },
      { lat: 45, lng: -110 }, { lat: 30, lng: -100 }, { lat: 55, lng: -100 },
      // Europe
      { lat: 50, lng: 10 }, { lat: 45, lng: 15 }, { lat: 55, lng: 20 },
      { lat: 48, lng: 2 }, { lat: 52, lng: 5 }, { lat: 60, lng: 15 },
      // Asia
      { lat: 35, lng: 80 }, { lat: 40, lng: 100 }, { lat: 30, lng: 120 },
      { lat: 55, lng: 80 }, { lat: 25, lng: 80 }, { lat: 45, lng: 130 },
      // Africa
      { lat: 0, lng: 20 }, { lat: 10, lng: 30 }, { lat: -10, lng: 25 },
      { lat: 15, lng: 15 }, { lat: -20, lng: 20 }, { lat: 5, lng: 35 },
      // South America
      { lat: -10, lng: -55 }, { lat: -20, lng: -45 }, { lat: 0, lng: -60 },
      { lat: -30, lng: -65 }, { lat: -5, lng: -40 }, { lat: -15, lng: -70 },
      // Australia
      { lat: -25, lng: 135 }, { lat: -30, lng: 145 }, { lat: -20, lng: 125 },
    ]

    const contGeo = new THREE.BufferGeometry()
    const contPos = new Float32Array(continentPoints.length * 3)
    continentPoints.forEach((p, i) => {
      const phi = (90 - p.lat) * (Math.PI / 180)
      const theta = (p.lng + 180) * (Math.PI / 180)
      contPos[i * 3] = 1.01 * Math.sin(phi) * Math.cos(theta)
      contPos[i * 3 + 1] = 1.01 * Math.cos(phi)
      contPos[i * 3 + 2] = 1.01 * Math.sin(phi) * Math.sin(theta)
    })
    contGeo.setAttribute('position', new THREE.BufferAttribute(contPos, 3))
    const contMat = new THREE.PointsMaterial({ color: 0x2ecc71, size: 0.04 })
    scene.add(new THREE.Points(contGeo, contMat))

    // Atmosphere glow
    const atmGeo = new THREE.SphereGeometry(1.05, 64, 64)
    const atmMat = new THREE.MeshPhongMaterial({
      color: 0x4488ff,
      transparent: true,
      opacity: 0.08,
      side: THREE.FrontSide,
    })
    scene.add(new THREE.Mesh(atmGeo, atmMat))

    // Satellites
    const satellites: SatellitePoint[] = [
      { name: 'ISS', lat: 34.5, lng: 35.2, altitude: 0.15, color: 0xffff00 },
      { name: 'Hubble', lat: 12.3, lng: 45.6, altitude: 0.22, color: 0xff6600 },
      { name: 'NOAA 18', lat: -22.1, lng: 98.7, altitude: 0.3, color: 0x00ffff },
    ]

    const satMeshes: THREE.Mesh[] = []
    satellites.forEach(sat => {
      const phi = (90 - sat.lat) * (Math.PI / 180)
      const theta = (sat.lng + 180) * (Math.PI / 180)
      const r = 1 + sat.altitude
      const x = r * Math.sin(phi) * Math.cos(theta)
      const y = r * Math.cos(phi)
      const z = r * Math.sin(phi) * Math.sin(theta)

      const satGeo = new THREE.SphereGeometry(0.025, 8, 8)
      const satMat = new THREE.MeshBasicMaterial({ color: sat.color })
      const satMesh = new THREE.Mesh(satGeo, satMat)
      satMesh.position.set(x, y, z)
      satMesh.userData = { name: sat.name }
      scene.add(satMesh)
      satMeshes.push(satMesh)

      // Orbit ring
      const orbitGeo = new THREE.RingGeometry(r - 0.002, r + 0.002, 64)
      const orbitMat = new THREE.MeshBasicMaterial({
        color: sat.color,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide,
      })
      const orbit = new THREE.Mesh(orbitGeo, orbitMat)
      orbit.rotation.x = Math.random() * Math.PI
      orbit.rotation.y = Math.random() * Math.PI
      scene.add(orbit)
    })

    // Lighting
    scene.add(new THREE.AmbientLight(0x334466, 0.8))
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.2)
    sunLight.position.set(5, 3, 5)
    scene.add(sunLight)

    // Mouse drag
    let isDragging = false
    let prevMouse = { x: 0, y: 0 }
    let rotX = 0, rotY = 0

    const onMouseDown = (e: MouseEvent) => { isDragging = true; prevMouse = { x: e.clientX, y: e.clientY } }
    const onMouseUp = () => { isDragging = false }
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return
      rotY += (e.clientX - prevMouse.x) * 0.005
      rotX += (e.clientY - prevMouse.y) * 0.005
      prevMouse = { x: e.clientX, y: e.clientY }
    }

    // Touch drag
    const onTouchStart = (e: TouchEvent) => { isDragging = true; prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY } }
    const onTouchEnd = () => { isDragging = false }
    const onTouchMove = (e: TouchEvent) => {
      if (!isDragging) return
      rotY += (e.touches[0].clientX - prevMouse.x) * 0.005
      rotX += (e.touches[0].clientY - prevMouse.y) * 0.005
      prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }

    renderer.domElement.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('mousemove', onMouseMove)
    renderer.domElement.addEventListener('touchstart', onTouchStart)
    window.addEventListener('touchend', onTouchEnd)
    window.addEventListener('touchmove', onTouchMove)

    // Animate
    let animId: number
    let angle = 0
    const animate = () => {
      animId = requestAnimationFrame(animate)
      angle += 0.001

      if (isDragging) {
        earth.rotation.y = rotY
        earth.rotation.x = rotX
      } else {
        earth.rotation.y += 0.002
        rotY = earth.rotation.y
      }

      // Move satellites
      satMeshes.forEach((mesh, i) => {
        const speed = [0.003, 0.002, 0.0025][i]
        const r = 1 + satellites[i].altitude
        mesh.position.x = r * Math.sin(angle * speed * 100 + i * 2) * Math.cos(i * 0.8)
        mesh.position.y = r * Math.cos(angle * speed * 100 + i * 2) * 0.5
        mesh.position.z = r * Math.sin(angle * speed * 100 + i * 2) * Math.sin(i * 0.8)
      })

      renderer.render(scene, camera)
    }
    animate()

    const handleResize = () => {
      if (!containerRef.current) return
      const w = containerRef.current.clientWidth
      const h = containerRef.current.clientHeight || 500
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('resize', handleResize)
      renderer.dispose()
      if (containerRef.current?.contains(renderer.domElement)) {
        containerRef.current.removeChild(renderer.domElement)
      }
    }
  }, [])

  return (
    <div className="relative w-full rounded-xl overflow-hidden" style={{ height: 500 }}>
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute top-3 right-3 text-xs text-gray-400 glass px-2 py-1 rounded">
        גרור לסיבוב 🖱️
      </div>
      <div className="absolute bottom-3 right-3 flex flex-col gap-1">
        <div className="flex items-center gap-1 text-xs text-yellow-400"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block"></span>ISS</div>
        <div className="flex items-center gap-1 text-xs text-orange-400"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block"></span>Hubble</div>
        <div className="flex items-center gap-1 text-xs text-cyan-400"><span className="w-2 h-2 rounded-full bg-cyan-400 inline-block"></span>NOAA 18</div>
      </div>
      {hoveredSat && (
        <div className="absolute top-3 left-3 glass px-3 py-2 rounded text-white text-sm">
          {hoveredSat}
        </div>
      )}
    </div>
  )
}

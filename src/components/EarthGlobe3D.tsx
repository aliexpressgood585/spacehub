import { useEffect, useRef } from 'react'
import * as THREE from 'three'

function createEarthTexture(): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 512
  const ctx = canvas.getContext('2d')!

  // Ocean
  const oceanGrad = ctx.createLinearGradient(0, 0, 0, 512)
  oceanGrad.addColorStop(0, '#0a2a5e')
  oceanGrad.addColorStop(0.5, '#0d3d73')
  oceanGrad.addColorStop(1, '#0a2a5e')
  ctx.fillStyle = oceanGrad
  ctx.fillRect(0, 0, 1024, 512)

  ctx.fillStyle = '#1a5e2e'

  // North America
  ctx.beginPath()
  ctx.ellipse(200, 160, 90, 80, -0.3, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(220, 260, 40, 50, 0.2, 0, Math.PI * 2)
  ctx.fill()

  // South America
  ctx.beginPath()
  ctx.ellipse(260, 340, 35, 70, 0.1, 0, Math.PI * 2)
  ctx.fill()

  // Europe
  ctx.beginPath()
  ctx.ellipse(510, 155, 45, 35, 0, 0, Math.PI * 2)
  ctx.fill()

  // Africa
  ctx.beginPath()
  ctx.ellipse(520, 290, 50, 90, 0, 0, Math.PI * 2)
  ctx.fill()

  // Asia
  ctx.beginPath()
  ctx.ellipse(680, 160, 130, 80, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(730, 270, 60, 40, 0, 0, Math.PI * 2)
  ctx.fill()

  // Australia
  ctx.beginPath()
  ctx.ellipse(780, 360, 55, 35, 0.2, 0, Math.PI * 2)
  ctx.fill()

  // Greenland
  ctx.beginPath()
  ctx.ellipse(360, 100, 40, 30, 0, 0, Math.PI * 2)
  ctx.fill()

  // Arctic/Antarctic ice
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.beginPath()
  ctx.ellipse(512, 20, 512, 25, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(512, 492, 512, 25, 0, 0, Math.PI * 2)
  ctx.fill()

  // City lights effect (subtle glow dots)
  ctx.fillStyle = 'rgba(255, 200, 100, 0.4)'
  const cities = [
    [200, 155], [215, 165], [185, 170], // North America
    [510, 150], [525, 160], [540, 155], [505, 165], // Europe
    [680, 155], [700, 165], [720, 170], [695, 150], // Asia
    [518, 280], // Africa
    [780, 355], // Australia
  ]
  cities.forEach(([x, y]) => {
    ctx.beginPath()
    ctx.arc(x, y, 3, 0, Math.PI * 2)
    ctx.fill()
  })

  return new THREE.CanvasTexture(canvas)
}

function createNightTexture(): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 512
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000510'
  ctx.fillRect(0, 0, 1024, 512)

  ctx.fillStyle = 'rgba(255, 200, 80, 0.9)'
  const lights = [
    [200, 155], [215, 162], [188, 168], [230, 155],
    [510, 150], [525, 158], [540, 153], [505, 163], [515, 142],
    [680, 153], [700, 163], [720, 168], [695, 148], [660, 158], [740, 175],
    [780, 353], [790, 360],
    [260, 340], [268, 350],
    [515, 285],
  ]
  lights.forEach(([x, y]) => {
    const grd = ctx.createRadialGradient(x, y, 0, x, y, 8)
    grd.addColorStop(0, 'rgba(255,220,100,0.9)')
    grd.addColorStop(1, 'rgba(255,200,80,0)')
    ctx.fillStyle = grd
    ctx.beginPath()
    ctx.arc(x, y, 8, 0, Math.PI * 2)
    ctx.fill()
  })
  return new THREE.CanvasTexture(canvas)
}


export default function EarthGlobe3D() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const W = containerRef.current.clientWidth
    const H = 520

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 1000)
    camera.position.set(0, 0.5, 4)
    camera.lookAt(0, 0, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(W, H)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)
    containerRef.current.appendChild(renderer.domElement)

    // Stars
    const starGeo = new THREE.BufferGeometry()
    const starCount = 5000
    const starPos = new Float32Array(starCount * 3)
    const starColors = new Float32Array(starCount * 3)
    for (let i = 0; i < starCount; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 500
      starPos[i * 3 + 1] = (Math.random() - 0.5) * 500
      starPos[i * 3 + 2] = (Math.random() - 0.5) * 500
      const t = Math.random()
      starColors[i * 3] = 0.8 + t * 0.2
      starColors[i * 3 + 1] = 0.8 + t * 0.1
      starColors[i * 3 + 2] = 0.9 + t * 0.1
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
    starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3))
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 0.12, vertexColors: true, sizeAttenuation: true })))

    // Earth
    const earthGeo = new THREE.SphereGeometry(1, 64, 64)
    const earthMat = new THREE.MeshPhongMaterial({
      map: createEarthTexture(),
      emissiveMap: createNightTexture(),
      emissive: new THREE.Color(0x223344),
      emissiveIntensity: 0.4,
      shininess: 15,
      specular: new THREE.Color(0x224488),
    })
    const earth = new THREE.Mesh(earthGeo, earthMat)
    scene.add(earth)

    // Clouds
    const cloudGeo = new THREE.SphereGeometry(1.008, 64, 64)
    const cloudCanvas = document.createElement('canvas')
    cloudCanvas.width = 1024; cloudCanvas.height = 512
    const cctx = cloudCanvas.getContext('2d')!
    cctx.fillStyle = 'transparent'
    cctx.clearRect(0, 0, 1024, 512)
    cctx.fillStyle = 'rgba(255,255,255,0.6)'
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * 1024, y = Math.random() * 512
      const rx = 20 + Math.random() * 80, ry = 8 + Math.random() * 20
      cctx.beginPath()
      cctx.ellipse(x, y, rx, ry, Math.random() * Math.PI, 0, Math.PI * 2)
      cctx.fill()
    }
    const cloudMat = new THREE.MeshPhongMaterial({
      map: new THREE.CanvasTexture(cloudCanvas),
      transparent: true, opacity: 0.35,
      depthWrite: false,
    })
    const clouds = new THREE.Mesh(cloudGeo, cloudMat)
    scene.add(clouds)

    // Atmosphere
    const atmGeo = new THREE.SphereGeometry(1.06, 64, 64)
    const atmMat = new THREE.MeshPhongMaterial({
      color: 0x4488ff, transparent: true, opacity: 0.06,
      side: THREE.FrontSide, depthWrite: false,
    })
    scene.add(new THREE.Mesh(atmGeo, atmMat))

    // Aurora Borealis (North Pole)
    const auroraGeo = new THREE.TorusGeometry(0.55, 0.08, 8, 64)
    const auroraMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88, transparent: true, opacity: 0.3, side: THREE.DoubleSide,
    })
    const aurora = new THREE.Mesh(auroraGeo, auroraMat)
    aurora.position.set(0, 0.9, 0)
    aurora.rotation.x = Math.PI / 2
    scene.add(aurora)

    // Aurora South
    const auroraS = aurora.clone()
    auroraS.position.set(0, -0.9, 0)
    ;(auroraS.material as THREE.MeshBasicMaterial).color.setHex(0x8800ff)
    scene.add(auroraS)

    // Satellites with orbital paths
    const satData = [
      { name: 'ISS', color: 0xffff00, r: 1.18, speed: 0.012, inclination: 0.9, phase: 0 },
      { name: 'Hubble', color: 0xff6600, r: 1.25, speed: 0.009, inclination: 0.5, phase: 2.1 },
      { name: 'NOAA 18', color: 0x00ffff, r: 1.35, speed: 0.007, inclination: 1.4, phase: 4.2 },
      { name: 'Starlink', color: 0xffffff, r: 1.15, speed: 0.015, inclination: 0.3, phase: 1.0 },
    ]

    // Orbital rings
    satData.forEach(sat => {
      const ringGeo = new THREE.TorusGeometry(sat.r, 0.002, 4, 128)
      const ringMat = new THREE.MeshBasicMaterial({ color: sat.color, transparent: true, opacity: 0.12 })
      const ring = new THREE.Mesh(ringGeo, ringMat)
      ring.rotation.x = sat.inclination
      ring.rotation.z = sat.phase
      scene.add(ring)
    })

    // Satellite meshes
    const satMeshes = satData.map(sat => {
      const geo = new THREE.SphereGeometry(0.022, 8, 8)
      const mat = new THREE.MeshBasicMaterial({ color: sat.color })
      const mesh = new THREE.Mesh(geo, mat)
      // Glow
      const glowGeo = new THREE.SphereGeometry(0.04, 8, 8)
      const glowMat = new THREE.MeshBasicMaterial({ color: sat.color, transparent: true, opacity: 0.2 })
      mesh.add(new THREE.Mesh(glowGeo, glowMat))
      scene.add(mesh)
      return { mesh, ...sat }
    })

    // Lighting
    scene.add(new THREE.AmbientLight(0x334466, 0.5))
    const sun = new THREE.DirectionalLight(0xfff5e0, 1.8)
    sun.position.set(5, 2, 3)
    scene.add(sun)
    const fill = new THREE.DirectionalLight(0x224488, 0.2)
    fill.position.set(-5, -2, -3)
    scene.add(fill)

    // Mouse drag
    let isDragging = false, prevX = 0, prevY = 0
    let rotY = 0, rotX = 0, velX = 0, velY = 0

    const onDown = (x: number, y: number) => { isDragging = true; prevX = x; prevY = y; velX = 0; velY = 0 }
    const onUp = () => { isDragging = false }
    const onMove = (x: number, y: number) => {
      if (!isDragging) return
      velX = (x - prevX) * 0.005; velY = (y - prevY) * 0.003
      rotY += velX; rotX = Math.max(-0.8, Math.min(0.8, rotX + velY))
      prevX = x; prevY = y
    }

    renderer.domElement.addEventListener('mousedown', e => onDown(e.clientX, e.clientY))
    window.addEventListener('mouseup', onUp)
    window.addEventListener('mousemove', e => onMove(e.clientX, e.clientY))
    renderer.domElement.addEventListener('touchstart', e => onDown(e.touches[0].clientX, e.touches[0].clientY))
    window.addEventListener('touchend', onUp)
    window.addEventListener('touchmove', e => onMove(e.touches[0].clientX, e.touches[0].clientY))

    // Zoom
    let zoom = 4
    renderer.domElement.addEventListener('wheel', e => {
      zoom = Math.max(2.5, Math.min(7, zoom + e.deltaY * 0.005))
    })

    let animId: number, t = 0
    const animate = () => {
      animId = requestAnimationFrame(animate)
      t += 0.016

      if (!isDragging) {
        velX *= 0.95; velY *= 0.95
        rotY += velX + 0.001
        rotX += velY
        rotX = Math.max(-0.8, Math.min(0.8, rotX))
      }

      earth.rotation.y = rotY
      earth.rotation.x = rotX
      clouds.rotation.y = rotY + t * 0.0003
      clouds.rotation.x = rotX

      camera.position.z += (zoom - camera.position.z) * 0.05

      // Aurora pulse
      auroraMat.opacity = 0.2 + Math.sin(t * 2) * 0.15
      ;(auroraS.material as THREE.MeshBasicMaterial).opacity = 0.2 + Math.cos(t * 1.5) * 0.12

      // Move satellites
      satMeshes.forEach(sat => {
        const angle = t * sat.speed + sat.phase
        const cosInc = Math.cos(sat.inclination)
        const sinInc = Math.sin(sat.inclination)
        const x = sat.r * Math.cos(angle)
        const y = sat.r * Math.sin(angle) * sinInc
        const z = sat.r * Math.sin(angle) * cosInc
        sat.mesh.position.set(x, y, z)
        sat.mesh.rotation.y += 0.05
      })

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
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('mousemove', e => onMove(e.clientX, e.clientY))
      window.removeEventListener('touchend', onUp)
      window.removeEventListener('touchmove', e => onMove(e.touches[0].clientX, e.touches[0].clientY))
      window.removeEventListener('resize', handleResize)
      renderer.dispose()
      if (containerRef.current?.contains(renderer.domElement)) {
        containerRef.current.removeChild(renderer.domElement)
      }
    }
  }, [])

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-indigo-500/20" style={{ height: 520 }}>
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-4 left-4 glass px-3 py-2 rounded-lg text-xs text-gray-300">
          🖱️ Drag to rotate · Scroll to zoom
        </div>
        <div className="absolute bottom-4 right-4 flex flex-col gap-1.5">
          {[
            { color: 'bg-yellow-400', name: 'ISS' },
            { color: 'bg-orange-400', name: 'Hubble' },
            { color: 'bg-cyan-400', name: 'NOAA 18' },
            { color: 'bg-white', name: 'Starlink' },
          ].map(s => (
            <div key={s.name} className="flex items-center gap-2 glass px-2 py-1 rounded text-xs text-white">
              <span className={`w-2 h-2 rounded-full ${s.color}`} />
              {s.name}
            </div>
          ))}
        </div>
        <div className="absolute top-4 right-4 glass px-2 py-1 rounded text-xs text-green-400">
          🟢 Aurora Active
        </div>
      </div>
    </div>
  )
}

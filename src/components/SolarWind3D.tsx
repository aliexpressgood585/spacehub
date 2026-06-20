import { useEffect, useRef } from 'react'
import * as THREE from 'three'

export default function SolarWind3D() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const W = containerRef.current.clientWidth
    const H = 350

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 1000)
    camera.position.set(0, 0, 8)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(W, H)
    renderer.setClearColor(0x000000, 0)
    containerRef.current.appendChild(renderer.domElement)

    // Sun
    const sunGeo = new THREE.SphereGeometry(1.2, 32, 32)
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 })
    const sun = new THREE.Mesh(sunGeo, sunMat)
    sun.position.set(-4, 0, 0)
    scene.add(sun)

    // Sun glow
    const glowGeo = new THREE.SphereGeometry(1.6, 32, 32)
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.15 })
    sun.add(new THREE.Mesh(glowGeo, glowMat))

    const glowGeo2 = new THREE.SphereGeometry(2.0, 32, 32)
    const glowMat2 = new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.07 })
    sun.add(new THREE.Mesh(glowGeo2, glowMat2))

    // Earth
    const earthGeo = new THREE.SphereGeometry(0.5, 32, 32)
    const earthMat = new THREE.MeshPhongMaterial({ color: 0x2244aa, emissive: 0x112244 })
    const earth = new THREE.Mesh(earthGeo, earthMat)
    earth.position.set(3.5, 0, 0)
    scene.add(earth)
    scene.add(new THREE.PointLight(0xffaa00, 2, 20))

    // Solar wind particles
    interface Particle {
      mesh: THREE.Mesh
      vx: number
      speed: number
    }

    const particles: Particle[] = []
    const pMat = new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.6 })

    for (let i = 0; i < 60; i++) {
      const pGeo = new THREE.SphereGeometry(0.03, 4, 4)
      const mesh = new THREE.Mesh(pGeo, pMat.clone())
      const startX = -4 + (Math.random() * 2)
      mesh.position.set(startX, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2)
      scene.add(mesh)
      particles.push({ mesh, vx: 0.03 + Math.random() * 0.05, speed: 0.03 + Math.random() * 0.04 })
    }

    // Aurora particles near Earth
    for (let i = 0; i < 30; i++) {
      const aGeo = new THREE.SphereGeometry(0.02, 4, 4)
      const aMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.5 })
      const mesh = new THREE.Mesh(aGeo, aMat)
      const angle = Math.random() * Math.PI * 2
      mesh.position.set(
        3.5 + Math.cos(angle) * 0.7,
        Math.sin(angle) * 0.7,
        (Math.random() - 0.5) * 0.5
      )
      scene.add(mesh)
    }

    let animId: number
    let t = 0
    const animate = () => {
      animId = requestAnimationFrame(animate)
      t += 0.01
      sun.rotation.y += 0.005

      particles.forEach(p => {
        p.mesh.position.x += p.vx
        if (p.mesh.position.x > 5) {
          p.mesh.position.x = -4
          p.mesh.position.y = (Math.random() - 0.5) * 2
        }
        const d = Math.abs(p.mesh.position.x - 3.5)
        ;(p.mesh.material as THREE.MeshBasicMaterial).opacity = d < 0.5 ? 0.8 : 0.4
      })

      earth.rotation.y += 0.01
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

  return <div ref={containerRef} className="w-full rounded-xl overflow-hidden" style={{ height: 350 }} />
}

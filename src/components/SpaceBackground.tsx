import { useEffect, useRef } from 'react'
import * as THREE from 'three'

export default function SpaceBackground() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const W = window.innerWidth
    const H = window.innerHeight

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(75, W / H, 0.1, 1000)
    camera.position.z = 1

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(W, H)
    renderer.setClearColor(0x000000, 0)
    containerRef.current.appendChild(renderer.domElement)

    // Stars layer 1 - far
    const createStars = (count: number, size: number, spread: number, color: number) => {
      const geo = new THREE.BufferGeometry()
      const pos = new Float32Array(count * 3)
      for (let i = 0; i < count * 3; i++) {
        pos[i] = (Math.random() - 0.5) * spread
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      return new THREE.Points(geo, new THREE.PointsMaterial({ color, size, sizeAttenuation: true, transparent: true, opacity: 0.8 }))
    }

    scene.add(createStars(2000, 0.08, 400, 0xffffff))
    scene.add(createStars(500, 0.15, 300, 0xaaccff))
    scene.add(createStars(200, 0.2, 200, 0xffddaa))

    // Nebula
    const nebulaGeo = new THREE.BufferGeometry()
    const nebulaCount = 300
    const nebulaPos = new Float32Array(nebulaCount * 3)
    for (let i = 0; i < nebulaCount * 3; i++) {
      nebulaPos[i] = (Math.random() - 0.5) * 100
    }
    nebulaGeo.setAttribute('position', new THREE.BufferAttribute(nebulaPos, 3))
    scene.add(new THREE.Points(nebulaGeo, new THREE.PointsMaterial({
      color: 0x4433ff,
      size: 0.5,
      transparent: true,
      opacity: 0.15,
    })))

    let animId: number
    const animate = () => {
      animId = requestAnimationFrame(animate)
      scene.rotation.y += 0.0001
      scene.rotation.x += 0.00005
      renderer.render(scene, camera)
    }
    animate()

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', handleResize)
      renderer.dispose()
      if (containerRef.current?.contains(renderer.domElement)) {
        containerRef.current.removeChild(renderer.domElement)
      }
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  )
}

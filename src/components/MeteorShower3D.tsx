import { useEffect, useRef } from 'react'
import * as THREE from 'three'

export default function MeteorShower3D() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const W = containerRef.current.clientWidth
    const H = 400

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 1000)
    camera.position.set(0, 0, 10)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(W, H)
    renderer.setClearColor(0x000000, 0)
    containerRef.current.appendChild(renderer.domElement)

    // Stars
    const starGeo = new THREE.BufferGeometry()
    const starPos = new Float32Array(1500 * 3)
    for (let i = 0; i < 1500 * 3; i++) starPos[i] = (Math.random() - 0.5) * 100
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.08 })))

    // Meteors
    interface Meteor {
      mesh: THREE.Mesh
      vx: number
      vy: number
      vz: number
      life: number
      maxLife: number
    }

    const meteors: Meteor[] = []
    const meteorMat = new THREE.MeshBasicMaterial({ color: 0xffffff })

    const spawnMeteor = (): Meteor => {
      const geo = new THREE.CylinderGeometry(0.01, 0.04, 0.6, 4)
      const mesh = new THREE.Mesh(geo, meteorMat.clone())
      mesh.position.set(
        (Math.random() - 0.5) * 20,
        5 + Math.random() * 5,
        (Math.random() - 0.5) * 5
      )
      const life = 60 + Math.random() * 60
      scene.add(mesh)
      return { mesh, vx: -0.1 - Math.random() * 0.15, vy: -0.1 - Math.random() * 0.1, vz: 0, life, maxLife: life }
    }

    for (let i = 0; i < 8; i++) meteors.push(spawnMeteor())

    // Ambient light
    scene.add(new THREE.AmbientLight(0xffffff, 1))

    let animId: number
    const animate = () => {
      animId = requestAnimationFrame(animate)

      meteors.forEach((m, i) => {
        m.mesh.position.x += m.vx
        m.mesh.position.y += m.vy
        m.mesh.rotation.z = Math.atan2(m.vy, m.vx)
        m.life--

        const opacity = m.life / m.maxLife
        ;(m.mesh.material as THREE.MeshBasicMaterial).opacity = opacity
        ;(m.mesh.material as THREE.MeshBasicMaterial).transparent = true

        if (m.life <= 0 || m.mesh.position.y < -6) {
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
      if (containerRef.current?.contains(renderer.domElement)) {
        containerRef.current.removeChild(renderer.domElement)
      }
    }
  }, [])

  return <div ref={containerRef} className="w-full rounded-xl overflow-hidden" style={{ height: 400 }} />
}

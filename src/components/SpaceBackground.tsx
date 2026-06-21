import { useEffect, useRef } from 'react'

export default function SpaceBackground() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    let animId: number
    let renderer: { dispose(): void; domElement: HTMLCanvasElement } | null = null

    const cleanup = () => {
      if (animId) cancelAnimationFrame(animId)
      try { renderer?.dispose() } catch {}
      try {
        if (containerRef.current && renderer && containerRef.current.contains(renderer.domElement)) {
          containerRef.current.removeChild(renderer.domElement)
        }
      } catch {}
    }

    const init = async () => {
      try {
        const THREE = await import('three').catch(() => null)
        if (!THREE || !containerRef.current) return

        const W = window.innerWidth
        const H = window.innerHeight

        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(75, W / H, 0.1, 1000)
        camera.position.z = 1

        const r = new THREE.WebGLRenderer({
          antialias: false,
          alpha: true,
          powerPreference: 'low-power',
          failIfMajorPerformanceCaveat: false,
        })
        renderer = r
        r.setSize(W, H)
        r.setClearColor(0x000000, 0)
        r.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))

        if (!containerRef.current) return
        containerRef.current.appendChild(r.domElement)

        const createStars = (count: number, size: number, spread: number, color: number) => {
          const geo = new THREE.BufferGeometry()
          const pos = new Float32Array(count * 3)
          for (let i = 0; i < count * 3; i++) pos[i] = (Math.random() - 0.5) * spread
          geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
          return new THREE.Points(geo, new THREE.PointsMaterial({ color, size, sizeAttenuation: true, transparent: true, opacity: 0.8 }))
        }

        scene.add(createStars(1500, 0.08, 400, 0xffffff))
        scene.add(createStars(400, 0.15, 300, 0xaaccff))
        scene.add(createStars(150, 0.2, 200, 0xffddaa))

        const nebulaGeo = new THREE.BufferGeometry()
        const np = new Float32Array(200 * 3)
        for (let i = 0; i < np.length; i++) np[i] = (Math.random() - 0.5) * 100
        nebulaGeo.setAttribute('position', new THREE.BufferAttribute(np, 3))
        scene.add(new THREE.Points(nebulaGeo, new THREE.PointsMaterial({ color: 0x4433ff, size: 0.5, transparent: true, opacity: 0.12 })))

        const animate = () => {
          animId = requestAnimationFrame(animate)
          scene.rotation.y += 0.0001
          scene.rotation.x += 0.00005
          r.render(scene, camera)
        }
        animate()

        const handleResize = () => {
          camera.aspect = window.innerWidth / window.innerHeight
          camera.updateProjectionMatrix()
          r.setSize(window.innerWidth, window.innerHeight)
        }
        window.addEventListener('resize', handleResize)

        const origCleanup = cleanup
        return () => {
          window.removeEventListener('resize', handleResize)
          origCleanup()
        }
      } catch {
        // WebGL not available — dark CSS background handles it
      }
    }

    let innerCleanup: (() => void) | void
    init().then(fn => { innerCleanup = fn })

    return () => {
      if (innerCleanup) innerCleanup()
      else cleanup()
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

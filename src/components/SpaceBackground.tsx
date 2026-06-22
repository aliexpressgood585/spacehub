import { useEffect, useRef, useState } from 'react'

export default function SpaceBackground() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [galaxyOn, setGalaxyOn] = useState(() => localStorage.getItem('spacehub_galaxy') === '1')

  useEffect(() => {
    const handler = () => setGalaxyOn(localStorage.getItem('spacehub_galaxy') === '1')
    window.addEventListener('spacehub-galaxy', handler)
    return () => window.removeEventListener('spacehub-galaxy', handler)
  }, [])

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
        r.domElement.style.position = 'absolute'
        r.domElement.style.top = '0'
        r.domElement.style.left = '0'
        r.domElement.style.zIndex = '1'
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
    >
      {galaxyOn && (
        <div
          className="absolute inset-0"
          style={{
            zIndex: 0,
            background: `
              radial-gradient(ellipse 80% 55% at 15% 25%, rgba(130,40,220,0.42) 0%, transparent 58%),
              radial-gradient(ellipse 65% 70% at 80% 65%, rgba(20,70,200,0.36) 0%, transparent 55%),
              radial-gradient(ellipse 55% 45% at 88% 12%, rgba(210,30,90,0.26) 0%, transparent 52%),
              radial-gradient(ellipse 75% 50% at 42% 88%, rgba(20,150,80,0.22) 0%, transparent 58%),
              radial-gradient(ellipse 45% 45% at 55% 48%, rgba(80,20,160,0.3) 0%, transparent 48%)
            `,
            animation: 'nebula-drift 30s ease-in-out infinite',
            mixBlendMode: 'screen',
          }}
        />
      )}
    </div>
  )
}

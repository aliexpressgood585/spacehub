import { useState, useEffect, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface RoverCamera {
  id: number
  name: string
  rover_id: number
  full_name: string
}

interface RoverInfo {
  id: number
  name: string
  landing_date: string
  launch_date: string
  status: string
  max_sol: number
  max_date: string
  total_photos: number
}

interface MarsPhoto {
  id: number
  sol: number
  camera: RoverCamera
  img_src: string
  earth_date: string
  rover: RoverInfo
}

interface ManifestPhoto {
  sol: number
  earth_date: string
  total_photos: number
  cameras: string[]
}

interface RoverManifest {
  name: string
  landing_date: string
  launch_date: string
  status: string
  max_sol: number
  max_date: string
  total_photos: number
  photos: ManifestPhoto[]
}

type RoverName = 'curiosity' | 'perseverance'

// ─── Constants ────────────────────────────────────────────────────────────────

const ROVER_META: Record<RoverName, { emoji: string; color: string; bgColor: string; borderColor: string; glowColor: string; launchYear: string; desc: string }> = {
  curiosity: {
    emoji: '🔴',
    color: '#f87171',
    bgColor: 'rgba(239,68,68,0.12)',
    borderColor: 'rgba(239,68,68,0.35)',
    glowColor: 'rgba(239,68,68,0.25)',
    launchYear: '2011',
    desc: 'Gale Crater · Nuclear-powered car-sized rover',
  },
  perseverance: {
    emoji: '🟠',
    color: '#fb923c',
    bgColor: 'rgba(249,115,22,0.12)',
    borderColor: 'rgba(249,115,22,0.35)',
    glowColor: 'rgba(249,115,22,0.25)',
    launchYear: '2020',
    desc: 'Jezero Crater · Astrobiology & sample caching',
  },
}

// Approximate total distance driven (km) — updated periodically by NASA
const DISTANCE_KM: Record<RoverName, number> = {
  curiosity: 32.8,
  perseverance: 27.5,
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PhotoSkeleton() {
  return (
    <div
      className="rounded-2xl animate-pulse"
      style={{
        aspectRatio: '1',
        background: 'linear-gradient(90deg, rgba(99,102,241,0.06) 25%, rgba(99,102,241,0.12) 50%, rgba(99,102,241,0.06) 75%)',
        backgroundSize: '200% 100%',
        animation: 'skeleton-wave 1.6s ease-in-out infinite',
      }}
    />
  )
}

function StatSkeleton() {
  return (
    <div className="p-4 rounded-2xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
      <div className="skeleton-line h-2 w-16 mb-2 rounded" />
      <div className="skeleton-line h-5 w-24 rounded" />
    </div>
  )
}

interface LightboxProps {
  photo: MarsPhoto
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  hasPrev: boolean
  hasNext: boolean
}

function Lightbox({ photo, onClose, onPrev, onNext, hasPrev, hasNext }: LightboxProps) {
  // Close on Escape, navigate with arrow keys
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && hasPrev) onPrev()
      if (e.key === 'ArrowRight' && hasNext) onNext()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, onPrev, onNext, hasPrev, hasNext])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9000,
        background: 'rgba(2,5,16,0.92)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'fadeIn 0.2s ease',
      }}
    >
      {/* Nav: Prev */}
      {hasPrev && (
        <button
          onClick={e => { e.stopPropagation(); onPrev() }}
          style={{
            position: 'absolute',
            left: 20,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'rgba(99,102,241,0.18)',
            border: '1px solid rgba(99,102,241,0.4)',
            color: '#c4b5fd',
            fontSize: 22,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.35)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.18)' }}
          aria-label="Previous photo"
        >
          ‹
        </button>
      )}

      {/* Photo container */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '90vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <img
          src={photo.img_src}
          alt={`Mars - ${photo.camera.full_name}`}
          style={{
            maxWidth: '85vw',
            maxHeight: '75vh',
            borderRadius: 16,
            objectFit: 'contain',
            border: '1px solid rgba(99,102,241,0.25)',
            boxShadow: '0 0 80px rgba(99,102,241,0.2)',
          }}
        />
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#e5e7eb', fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
            {photo.camera.full_name}
          </p>
          <p style={{ color: '#6b7280', fontSize: 12 }}>
            Sol {photo.sol} · {photo.earth_date} · {photo.rover.name}
          </p>
        </div>
      </div>

      {/* Nav: Next */}
      {hasNext && (
        <button
          onClick={e => { e.stopPropagation(); onNext() }}
          style={{
            position: 'absolute',
            right: 20,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'rgba(99,102,241,0.18)',
            border: '1px solid rgba(99,102,241,0.4)',
            color: '#c4b5fd',
            fontSize: 22,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.35)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.18)' }}
          aria-label="Next photo"
        >
          ›
        </button>
      )}

      {/* Close */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.12)',
          color: '#9ca3af',
          fontSize: 18,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)' }}
        aria-label="Close lightbox"
      >
        ✕
      </button>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MarsRoverDashboard() {
  const [activeRover, setActiveRover] = useState<RoverName>('curiosity')
  const [photos, setPhotos] = useState<MarsPhoto[]>([])
  const [manifest, setManifest] = useState<RoverManifest | null>(null)
  const [loading, setLoading] = useState(true)
  const [manifestLoading, setManifestLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [imgErrors, setImgErrors] = useState<Set<number>>(new Set())
  const [refreshKey, setRefreshKey] = useState(0)

  const meta = ROVER_META[activeRover]

  // Fetch latest photos
  useEffect(() => {
    setLoading(true)
    setError(null)
    setPhotos([])
    setImgErrors(new Set())

    const url = `https://api.nasa.gov/mars-photos/api/v1/rovers/${activeRover}/latest_photos?api_key=DEMO_KEY`
    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: { latest_photos: MarsPhoto[] }) => {
        const all = data.latest_photos ?? []
        // Deduplicate by camera — show variety across cameras, max 9 photos
        const seen = new Set<string>()
        const deduped: MarsPhoto[] = []
        for (const p of all) {
          const key = p.camera.name
          if (!seen.has(key)) {
            seen.add(key)
            deduped.push(p)
          }
          if (deduped.length >= 9) break
        }
        // Fall back to first 9 if deduplication yields too few
        setPhotos(deduped.length >= 3 ? deduped : all.slice(0, 9))
        setLoading(false)
      })
      .catch(err => {
        setError(err.message ?? 'Failed to load photos')
        setLoading(false)
      })
  }, [activeRover, refreshKey])

  // Fetch rover manifest for stats
  useEffect(() => {
    setManifestLoading(true)
    setManifest(null)

    const url = `https://api.nasa.gov/mars-photos/api/v1/manifests/${activeRover}?api_key=DEMO_KEY`
    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: { photo_manifest: RoverManifest }) => {
        setManifest(data.photo_manifest ?? null)
        setManifestLoading(false)
      })
      .catch(() => {
        setManifestLoading(false)
      })
  }, [activeRover, refreshKey])

  const handleImgError = useCallback((id: number) => {
    setImgErrors(prev => new Set(prev).add(id))
  }, [])

  const openLightbox = (index: number) => setLightboxIndex(index)
  const closeLightbox = () => setLightboxIndex(null)
  const prevPhoto = () => setLightboxIndex(i => (i !== null && i > 0 ? i - 1 : i))
  const nextPhoto = () => setLightboxIndex(i => (i !== null && i < photos.length - 1 ? i + 1 : i))

  // Derived stats
  const roverStatus = manifest?.status ?? (photos[0]?.rover?.status ?? null)
  const currentSol = manifest?.max_sol ?? photos[0]?.sol ?? null
  const currentEarthDate = manifest?.max_date ?? photos[0]?.earth_date ?? null
  const totalPhotos = manifest?.total_photos ?? photos[0]?.rover?.total_photos ?? null
  const isActive = roverStatus?.toLowerCase() === 'active'

  // Format numbers with commas
  const fmt = (n: number) => n.toLocaleString()

  return (
    <>
      {/* Lightbox */}
      {lightboxIndex !== null && photos[lightboxIndex] && (
        <Lightbox
          photo={photos[lightboxIndex]}
          onClose={closeLightbox}
          onPrev={prevPhoto}
          onNext={nextPhoto}
          hasPrev={lightboxIndex > 0}
          hasNext={lightboxIndex < photos.length - 1}
        />
      )}

      <div className="space-card p-6" style={{ overflow: 'visible' }}>

        {/* ── Header ── */}
        <div className="flex items-start gap-3 mb-5">
          <div
            className="icon-box text-xl flex-shrink-0"
            style={{
              background: meta.bgColor,
              border: `1px solid ${meta.borderColor}`,
              boxShadow: `0 0 24px ${meta.glowColor}`,
              transition: 'all 0.4s ease',
            }}
          >
            {meta.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-bold text-base">Mars Rover Dashboard</h3>
            <p className="text-gray-500 text-xs truncate">{meta.desc}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {/* Status badge */}
            {roverStatus && !manifestLoading && (
              <span
                className="text-[10px] px-2.5 py-1 rounded-full font-bold"
                style={{
                  background: isActive ? 'rgba(34,197,94,0.12)' : 'rgba(107,114,128,0.12)',
                  border: `1px solid ${isActive ? 'rgba(34,197,94,0.4)' : 'rgba(107,114,128,0.3)'}`,
                  color: isActive ? '#4ade80' : '#9ca3af',
                }}
              >
                {isActive ? '● ACTIVE' : '◆ COMPLETE'}
              </span>
            )}
            {/* Refresh */}
            <button
              onClick={() => setRefreshKey(k => k + 1)}
              title="Refresh data"
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#6b7280',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#c4b5fd' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#6b7280' }}
              aria-label="Refresh rover data"
            >
              ↻
            </button>
          </div>
        </div>

        {/* ── Rover Toggle ── */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginBottom: 20,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 14,
            padding: 4,
          }}
        >
          {(['curiosity', 'perseverance'] as RoverName[]).map(rover => {
            const m = ROVER_META[rover]
            const isSelected = activeRover === rover
            return (
              <button
                key={rover}
                onClick={() => setActiveRover(rover)}
                style={{
                  flex: 1,
                  padding: '9px 16px',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.25s ease',
                  border: isSelected ? `1px solid ${m.borderColor}` : '1px solid transparent',
                  background: isSelected ? m.bgColor : 'transparent',
                  color: isSelected ? m.color : '#6b7280',
                  boxShadow: isSelected ? `0 0 20px ${m.glowColor}` : 'none',
                  letterSpacing: '0.01em',
                }}
              >
                {m.emoji} {rover.charAt(0).toUpperCase() + rover.slice(1)}
              </button>
            )
          })}
        </div>

        {/* ── Stats Row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 20 }}>
          {/* Sol */}
          <div
            className="stat-card"
            style={{
              background: `linear-gradient(135deg, ${meta.bgColor} 0%, rgba(255,255,255,0.01) 100%)`,
              border: `1px solid ${meta.borderColor.replace('0.35', '0.2')}`,
            }}
          >
            {manifestLoading ? (
              <>
                <div className="skeleton-line h-2 w-12 mb-2 rounded" style={{ margin: '0 auto 8px' }} />
                <div className="skeleton-line h-6 w-20 rounded" style={{ margin: '0 auto' }} />
              </>
            ) : (
              <>
                <p style={{ color: '#9ca3af', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
                  Current Sol
                </p>
                <p className="count-reveal" style={{ color: meta.color, fontWeight: 900, fontSize: 26, lineHeight: 1 }}>
                  {currentSol !== null ? fmt(currentSol) : '—'}
                </p>
                <p style={{ color: '#6b7280', fontSize: 10, marginTop: 4 }}>Martian day</p>
              </>
            )}
          </div>

          {/* Earth Date */}
          <div className="stat-card">
            {manifestLoading ? (
              <>
                <div className="skeleton-line h-2 w-16 mb-2 rounded" style={{ margin: '0 auto 8px' }} />
                <div className="skeleton-line h-5 w-24 rounded" style={{ margin: '0 auto' }} />
              </>
            ) : (
              <>
                <p style={{ color: '#9ca3af', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
                  Earth Date
                </p>
                <p style={{ color: '#e5e7eb', fontWeight: 700, fontSize: 14 }}>
                  {currentEarthDate ?? '—'}
                </p>
                <p style={{ color: '#6b7280', fontSize: 10, marginTop: 4 }}>Latest photos</p>
              </>
            )}
          </div>

          {/* Total Photos */}
          <div className="stat-card">
            {manifestLoading ? (
              <StatSkeleton />
            ) : (
              <>
                <p style={{ color: '#9ca3af', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
                  Total Photos
                </p>
                <p className="gradient-text" style={{ fontWeight: 900, fontSize: 22, lineHeight: 1 }}>
                  {totalPhotos !== null ? fmt(totalPhotos) : '—'}
                </p>
                <p style={{ color: '#6b7280', fontSize: 10, marginTop: 4 }}>Captured on Mars</p>
              </>
            )}
          </div>

          {/* Distance Driven */}
          <div className="stat-card">
            <p style={{ color: '#9ca3af', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
              Distance Driven
            </p>
            <p className="gradient-text-cyan" style={{ fontWeight: 900, fontSize: 22, lineHeight: 1 }}>
              {DISTANCE_KM[activeRover]} km
            </p>
            <p style={{ color: '#6b7280', fontSize: 10, marginTop: 4 }}>On Martian surface</p>
          </div>
        </div>

        {/* ── Mission Strip ── */}
        {!manifestLoading && manifest && (
          <div
            style={{
              display: 'flex',
              gap: 12,
              marginBottom: 20,
              padding: '10px 14px',
              borderRadius: 12,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.05)',
              flexWrap: 'wrap',
            }}
          >
            {[
              { label: 'Launch', value: manifest.launch_date },
              { label: 'Landing', value: manifest.landing_date },
              { label: 'Active Sols', value: fmt(manifest.max_sol) },
              { label: 'Mission', value: manifest.status === 'active' ? 'Ongoing' : 'Complete' },
            ].map(item => (
              <div key={item.label} style={{ flex: '1 1 auto', minWidth: 80 }}>
                <p style={{ color: '#6b7280', fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 2 }}>
                  {item.label}
                </p>
                <p style={{ color: '#d1d5db', fontSize: 12, fontWeight: 600 }}>{item.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Photo Section Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <p style={{ color: '#e5e7eb', fontSize: 13, fontWeight: 700 }}>Latest Photos</p>
            {!loading && photos.length > 0 && (
              <span
                style={{
                  fontSize: 10,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: meta.bgColor,
                  border: `1px solid ${meta.borderColor}`,
                  color: meta.color,
                  fontWeight: 700,
                }}
              >
                {photos.length} shown
              </span>
            )}
          </div>
          <p style={{ color: '#4b5563', fontSize: 10 }}>Click to enlarge</p>
        </div>

        {/* ── Error State ── */}
        {error && !loading && (
          <div
            style={{
              padding: '32px 16px',
              textAlign: 'center',
              borderRadius: 16,
              background: 'rgba(239,68,68,0.05)',
              border: '1px solid rgba(239,68,68,0.2)',
            }}
          >
            <p style={{ fontSize: 32, marginBottom: 12 }}>🛸</p>
            <p style={{ color: '#f87171', fontWeight: 700, marginBottom: 6 }}>Signal Lost</p>
            <p style={{ color: '#6b7280', fontSize: 12, marginBottom: 16 }}>
              Could not reach NASA API ({error}). Rate limits may apply with DEMO_KEY.
            </p>
            <button
              onClick={() => setRefreshKey(k => k + 1)}
              className="btn-shimmer"
              style={{ padding: '8px 20px', fontSize: 13, borderRadius: 10 }}
            >
              Retry Connection
            </button>
          </div>
        )}

        {/* ── Loading Grid ── */}
        {loading && !error && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {[...Array(9)].map((_, i) => <PhotoSkeleton key={i} />)}
          </div>
        )}

        {/* ── Photo Grid ── */}
        {!loading && !error && photos.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {photos.map((photo, idx) => {
              const hasError = imgErrors.has(photo.id)
              return (
                <button
                  key={photo.id}
                  onClick={() => openLightbox(idx)}
                  aria-label={`View photo: ${photo.camera.full_name}`}
                  style={{
                    position: 'relative',
                    aspectRatio: '1',
                    borderRadius: 14,
                    overflow: 'hidden',
                    cursor: 'pointer',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    padding: 0,
                    transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
                    display: 'block',
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLButtonElement
                    el.style.transform = 'scale(1.04)'
                    el.style.border = `1px solid ${meta.borderColor}`
                    el.style.boxShadow = `0 8px 32px ${meta.glowColor}`
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLButtonElement
                    el.style.transform = 'scale(1)'
                    el.style.border = '1px solid rgba(255,255,255,0.06)'
                    el.style.boxShadow = 'none'
                  }}
                >
                  {hasError ? (
                    // Fallback when image fails to load
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: `linear-gradient(135deg, ${meta.bgColor}, rgba(2,5,16,0.8))`,
                        gap: 8,
                        padding: 8,
                      }}
                    >
                      <span style={{ fontSize: 24 }}>📷</span>
                      <p style={{ color: '#4b5563', fontSize: 9, textAlign: 'center', lineHeight: 1.3 }}>
                        {photo.camera.name}
                      </p>
                    </div>
                  ) : (
                    <img
                      src={photo.img_src}
                      alt={`Mars photo from ${photo.camera.full_name}`}
                      onError={() => handleImgError(photo.id)}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block',
                      }}
                      loading="lazy"
                    />
                  )}

                  {/* Camera label overlay */}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      padding: '16px 8px 6px',
                      background: 'linear-gradient(transparent, rgba(2,5,16,0.88))',
                      pointerEvents: 'none',
                    }}
                  >
                    <p
                      style={{
                        color: '#d1d5db',
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        lineHeight: 1.2,
                      }}
                    >
                      {photo.camera.name}
                    </p>
                  </div>

                  {/* Zoom icon on hover — pure CSS via opacity trick */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      background: 'rgba(0,0,0,0.55)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      color: 'rgba(255,255,255,0.7)',
                      pointerEvents: 'none',
                    }}
                  >
                    ⛶
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* ── Empty State ── */}
        {!loading && !error && photos.length === 0 && (
          <div style={{ padding: '32px 16px', textAlign: 'center' }}>
            <p style={{ fontSize: 32, marginBottom: 12 }}>🔴</p>
            <p style={{ color: '#6b7280', fontSize: 13 }}>No photos available for this rover right now.</p>
          </div>
        )}

        {/* ── Footer ── */}
        <p style={{ color: '#374151', fontSize: 10, marginTop: 16, textAlign: 'center' }}>
          Data via NASA Mars Rover Photos API · DEMO_KEY (rate-limited)
        </p>

      </div>
    </>
  )
}
